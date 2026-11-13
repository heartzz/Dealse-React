import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { createHash, randomBytes } from "node:crypto";
import { AccountRole, DealStatus, MembershipStatus, RedemptionCodeStatus, RetailerStatus, StoreStatus } from "../generated/prisma/enums.js";
import { Prisma } from "../generated/prisma/client.js";
import { PrismaService } from "../database/prisma.service.js";
import type { AuthPrincipal } from "../auth/auth.types.js";
import type { RedemptionPageQueryDto } from "./dto/redemption.dto.js";

type Transaction = Prisma.TransactionClient;
type QueryClient = Pick<PrismaService, "redemptionCode" | "retailerMembership" | "store">;
type RequestMeta = { requestId?: string };
type CodeRecord = Prisma.RedemptionCodeGetPayload<{
  include: { deal: { include: { store: { include: { retailer: true } } } } };
}>;

function tokenHash(credential: string): Uint8Array<ArrayBuffer> {
  const digest = createHash("sha256").update(credential, "utf8").digest();
  const bytes = new Uint8Array(digest.length);
  bytes.set(digest);
  return bytes;
}

function tokenMatches(stored: Uint8Array, provided: Uint8Array) {
  return Buffer.compare(Buffer.from(stored), Buffer.from(provided)) === 0;
}

function newCredential(): string {
  return randomBytes(32).toString("base64url");
}

function expiryAt(now: Date, dealEndsAt: Date): Date {
  return new Date(Math.min(now.getTime() + 5 * 60_000, dealEndsAt.getTime()));
}

function effectiveStatus(code: { status: RedemptionCodeStatus; expiresAt: Date }, now = new Date()) {
  return code.status === RedemptionCodeStatus.ISSUED && code.expiresAt <= now
    ? RedemptionCodeStatus.EXPIRED
    : code.status;
}

function claimDto(code: CodeRecord, credential?: string) {
  return {
    id: code.id,
    dealId: code.dealId,
    dealTitle: code.deal.title,
    storeId: code.deal.store.id,
    storeName: code.deal.store.name,
    status: effectiveStatus(code),
    issuedAt: code.issuedAt,
    expiresAt: code.expiresAt,
    redeemedAt: code.redeemedAt,
    ...(credential ? { credential } : {}),
  };
}

@Injectable()
export class RedemptionsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async claim(customer: AuthPrincipal, dealId: string, meta: RequestMeta = {}) {
    const credential = newCredential();
    const now = new Date();
    return this.prisma.$transaction(async (tx) => {
      await this.lockDeal(tx, dealId);
      const deal = await tx.deal.findUnique({
        where: { id: dealId },
        include: { store: { include: { retailer: true } } },
      });
      if (!deal || !this.isEligible(deal, now)) throw new NotFoundException("Offer is unavailable.");

      const existing = await tx.redemptionCode.findFirst({
        where: { dealId, customerUserId: customer.userId, status: RedemptionCodeStatus.ISSUED },
        include: { deal: { include: { store: { include: { retailer: true } } } } },
      });
      if (existing && existing.expiresAt > now) return { claim: claimDto(existing), replayed: true };

      if (existing) {
        await tx.redemptionCode.update({ where: { id: existing.id }, data: { status: RedemptionCodeStatus.EXPIRED } });
        await this.audit(tx, customer, "redemption_claim.expired", existing.id, deal.store.retailerId, meta.requestId,
          { status: RedemptionCodeStatus.ISSUED, expiresAt: existing.expiresAt.toISOString() },
          { status: RedemptionCodeStatus.EXPIRED, detectedAt: now.toISOString() });
      }

      if (deal.maxRedemptions !== null && deal.redemptionCount >= deal.maxRedemptions) {
        throw new ConflictException("This offer has reached its redemption limit.");
      }
      const customerRedemptions = await tx.redemption.count({ where: { dealId, customerUserId: customer.userId } });
      if (customerRedemptions >= deal.perCustomerLimit) {
        throw new ConflictException("You have reached this offer's redemption limit.");
      }

      const expiresAt = expiryAt(now, deal.endsAt);
      const created = await tx.redemptionCode.create({
        data: {
          dealId,
          customerUserId: customer.userId,
          tokenHash: tokenHash(credential),
          status: RedemptionCodeStatus.ISSUED,
          issuedAt: now,
          expiresAt,
        },
        include: { deal: { include: { store: { include: { retailer: true } } } } },
      });
      await this.audit(tx, customer, "redemption_claim.issued", created.id, deal.store.retailerId, meta.requestId,
        null, { status: RedemptionCodeStatus.ISSUED, dealId, expiresAt: expiresAt.toISOString() });
      return { claim: claimDto(created, credential), replayed: false };
    });
  }

  async listCustomerClaims(customer: AuthPrincipal, query: RedemptionPageQueryDto) {
    const pagination = this.pagination(query);
    const where: Prisma.RedemptionCodeWhereInput = {
      customerUserId: customer.userId,
      ...(query.dealId ? { dealId: query.dealId } : {}),
      ...(query.status ? { status: query.status } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.redemptionCode.findMany({
        where,
        include: { deal: { include: { store: { select: { id: true, name: true } } } } },
        orderBy: [{ issuedAt: "desc" }, { id: "desc" }],
        skip: pagination.skip,
        take: pagination.limit,
      }),
      this.prisma.redemptionCode.count({ where }),
    ]);
    return {
      items: items.map((code) => ({
        id: code.id,
        dealId: code.dealId,
        dealTitle: code.deal.title,
        storeId: code.deal.store.id,
        storeName: code.deal.store.name,
        status: effectiveStatus(code),
        issuedAt: code.issuedAt,
        expiresAt: code.expiresAt,
        redeemedAt: code.redeemedAt,
      })),
      page: pagination.page,
      limit: pagination.limit,
      total,
      totalPages: Math.ceil(total / pagination.limit),
    };
  }

  async rotate(customer: AuthPrincipal, claimId: string, meta: RequestMeta = {}) {
    const credential = newCredential();
    const now = new Date();
    const existing = await this.prisma.redemptionCode.findFirst({ where: { id: claimId, customerUserId: customer.userId }, select: { dealId: true } });
    if (!existing) throw new NotFoundException("Claim not found.");

    return this.prisma.$transaction(async (tx) => {
      await this.lockDeal(tx, existing.dealId);
      await this.lockCode(tx, claimId);
      const code = await tx.redemptionCode.findFirst({
        where: { id: claimId, customerUserId: customer.userId },
        include: { deal: { include: { store: { include: { retailer: true } } } } },
      });
      if (!code) throw new NotFoundException("Claim not found.");
      if (code.status === RedemptionCodeStatus.REDEEMED || code.status === RedemptionCodeStatus.REVOKED || code.redeemedAt) {
        throw new ConflictException("Only an expired, unused claim can receive a new credential.");
      }
      if (code.expiresAt > now && code.status === RedemptionCodeStatus.ISSUED) {
        throw new ConflictException("This credential has not expired yet.");
      }
      if (code.deal.status !== DealStatus.PUBLISHED || code.deal.moderationHoldAt || !this.isEligible(code.deal, now)) {
        throw new ConflictException("This offer is no longer eligible for redemption.");
      }
      const otherIssued = await tx.redemptionCode.findFirst({
        where: { dealId: code.dealId, customerUserId: customer.userId, status: RedemptionCodeStatus.ISSUED, id: { not: claimId } },
        select: { id: true },
      });
      if (otherIssued) throw new ConflictException("Another claim is already active for this offer.");

      const expiresAt = expiryAt(now, code.deal.endsAt);
      await tx.redemptionCode.update({
        where: { id: claimId },
        data: { tokenHash: tokenHash(credential), status: RedemptionCodeStatus.ISSUED, issuedAt: now, expiresAt, redeemedAt: null },
      });
      await this.audit(tx, customer, "redemption_claim.credential_rotated", claimId, code.deal.store.retailerId, meta.requestId,
        { status: code.status, expiresAt: code.expiresAt.toISOString() },
        { status: RedemptionCodeStatus.ISSUED, expiresAt: expiresAt.toISOString() });
      const updated = await tx.redemptionCode.findUniqueOrThrow({
        where: { id: claimId },
        include: { deal: { include: { store: { include: { retailer: true } } } } },
      });
      return claimDto(updated, credential);
    });
  }

  async cancel(customer: AuthPrincipal, claimId: string, meta: RequestMeta = {}) {
    const existing = await this.prisma.redemptionCode.findFirst({ where: { id: claimId, customerUserId: customer.userId }, select: { dealId: true } });
    if (!existing) throw new NotFoundException("Claim not found.");
    return this.prisma.$transaction(async (tx) => {
      await this.lockDeal(tx, existing.dealId);
      await this.lockCode(tx, claimId);
      const code = await tx.redemptionCode.findFirst({
        where: { id: claimId, customerUserId: customer.userId },
        include: { deal: { include: { store: { include: { retailer: true } } } } },
      });
      if (!code) throw new NotFoundException("Claim not found.");
      if (code.status === RedemptionCodeStatus.REVOKED) return { id: code.id, status: code.status };
      if (code.status !== RedemptionCodeStatus.ISSUED || code.expiresAt <= new Date() || code.redeemedAt) {
        throw new ConflictException("Only an unused, unexpired claim can be cancelled.");
      }
      await tx.redemptionCode.update({ where: { id: claimId }, data: { status: RedemptionCodeStatus.REVOKED } });
      await this.audit(tx, customer, "redemption_claim.cancelled", claimId, code.deal.store.retailerId, meta.requestId,
        { status: code.status, expiresAt: code.expiresAt.toISOString() },
        { status: RedemptionCodeStatus.REVOKED, cancelledAt: new Date().toISOString() });
      return { id: code.id, status: RedemptionCodeStatus.REVOKED };
    });
  }

  async validateRetailer(retailer: AuthPrincipal, retailerId: string, storeId: string, credential: string) {
    const now = new Date();
    await this.requireStoreMembership(this.prisma, retailer.userId, retailerId, storeId);
    const code = await this.findCodeForStore(this.prisma, tokenHash(credential), storeId);
    if (!code) throw new NotFoundException("Credential is unavailable.");
    this.assertCredentialUsable(code, now);
    if (!this.isEligible(code.deal, now)) throw new ConflictException("Offer is no longer eligible for redemption.");
    this.assertCapacity(code.deal, await this.prisma.redemption.count({ where: { dealId: code.dealId, customerUserId: code.customerUserId } }));
    return this.previewDto(code);
  }

  async confirmRetailer(
    retailer: AuthPrincipal,
    retailerId: string,
    storeId: string,
    credential: string,
    idempotencyKey: string,
    meta: RequestMeta = {},
  ) {
    if (!idempotencyKey || idempotencyKey.length > 128) throw new BadRequestException("A valid Idempotency-Key (1–128 characters) is required.");
    const hash = tokenHash(credential);
    try {
      return await this.prisma.$transaction(async (tx) => {
        await this.requireStoreMembership(tx, retailer.userId, retailerId, storeId);
        const prior = await tx.redemption.findUnique({
          where: { storeId_idempotencyKey: { storeId, idempotencyKey } },
          include: { code: true, deal: { select: { title: true } } },
        });
        if (prior) {
          if (prior.redeemedByUserId !== retailer.userId || !tokenMatches(prior.code.tokenHash, hash)) {
            throw new ConflictException("Idempotency key was already used for another redemption request.");
          }
          return this.redemptionDto(prior);
        }

        const candidate = await this.findCodeForStore(tx, hash, storeId);
        if (!candidate) throw new NotFoundException("Credential is unavailable.");
        await this.lockDeal(tx, candidate.dealId);
        const replay = await tx.redemption.findUnique({
          where: { storeId_idempotencyKey: { storeId, idempotencyKey } },
          include: { code: true, deal: { select: { title: true } } },
        });
        if (replay) {
          if (replay.redeemedByUserId !== retailer.userId || !tokenMatches(replay.code.tokenHash, hash)) {
            throw new ConflictException("Idempotency key was already used for another redemption request.");
          }
          return this.redemptionDto(replay);
        }
        await this.lockStoreAndRetailer(tx, storeId, retailerId);
        await this.lockMembership(tx, retailer.userId, retailerId);
        await this.lockCode(tx, candidate.id);
        await this.requireStoreMembership(tx, retailer.userId, retailerId, storeId);

        const code = await this.findCodeForStore(tx, hash, storeId);
        if (!code) throw new NotFoundException("Credential is unavailable.");
        const now = new Date();
        this.assertCredentialUsable(code, now);
        if (!this.isEligible(code.deal, now)) throw new ConflictException("Offer is no longer eligible for redemption.");
        const customerRedemptions = await tx.redemption.count({ where: { dealId: code.dealId, customerUserId: code.customerUserId } });
        this.assertCapacity(code.deal, customerRedemptions);

        const changed = await tx.redemptionCode.updateMany({
          where: { id: code.id, status: RedemptionCodeStatus.ISSUED, expiresAt: { gt: now } },
          data: { status: RedemptionCodeStatus.REDEEMED, redeemedAt: now },
        });
        if (changed.count !== 1) throw new ConflictException("Credential was redeemed by another request.");
        const updatedDeal = await tx.deal.updateMany({
          where: { id: code.dealId, ...(code.deal.maxRedemptions === null ? {} : { redemptionCount: { lt: code.deal.maxRedemptions } }) },
          data: { redemptionCount: { increment: 1 } },
        });
        if (updatedDeal.count !== 1) throw new ConflictException("This offer has reached its redemption limit.");

        const redemption = await tx.redemption.create({
          data: {
            codeId: code.id,
            dealId: code.dealId,
            storeId,
            customerUserId: code.customerUserId,
            redeemedByUserId: retailer.userId,
            customerRedemptionNumber: customerRedemptions + 1,
            idempotencyKey,
            requestId: meta.requestId,
            redeemedAt: now,
          },
          include: { code: true, deal: { select: { title: true } } },
        });
        await this.audit(tx, retailer, "redemption.confirmed", redemption.id, retailerId, meta.requestId,
          { codeId: code.id, status: RedemptionCodeStatus.ISSUED },
          { codeId: code.id, status: RedemptionCodeStatus.REDEEMED, dealId: code.dealId, storeId, redeemedAt: now.toISOString() });
        return this.redemptionDto(redemption);
      });
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        const prior = await this.prisma.redemption.findUnique({
          where: { storeId_idempotencyKey: { storeId, idempotencyKey } },
          include: { code: true, deal: { select: { title: true } } },
        });
        if (prior && prior.redeemedByUserId === retailer.userId && tokenMatches(prior.code.tokenHash, hash)) return this.redemptionDto(prior);
      }
      throw error;
    }
  }

  async retailerHistory(user: AuthPrincipal, retailerId: string, storeId: string, query: RedemptionPageQueryDto) {
    await this.requireStoreMembership(this.prisma, user.userId, retailerId, storeId);
    const pagination = this.pagination(query);
    const where: Prisma.RedemptionWhereInput = {
      storeId,
      ...(query.dealId ? { dealId: query.dealId } : {}),
      ...(query.from || query.to ? { redeemedAt: { ...(query.from ? { gte: new Date(query.from) } : {}), ...(query.to ? { lte: new Date(query.to) } : {}) } } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.redemption.findMany({
        where,
        include: { deal: { select: { id: true, title: true } }, redeemedBy: { select: { profile: { select: { displayName: true } } } } },
        orderBy: [{ redeemedAt: "desc" }, { id: "desc" }],
        skip: pagination.skip,
        take: pagination.limit,
      }),
      this.prisma.redemption.count({ where }),
    ]);
    return this.page(items.map((item) => ({
      id: item.id,
      dealId: item.dealId,
      dealTitle: item.deal.title,
      redeemedAt: item.redeemedAt,
      customerRedemptionNumber: item.customerRedemptionNumber,
      redeemedBy: item.redeemedBy.profile?.displayName ?? null,
    })), query, total);
  }

  async adminRedemptions(query: RedemptionPageQueryDto) {
    const pagination = this.pagination(query);
    const where: Prisma.RedemptionWhereInput = {
      ...(query.dealId ? { dealId: query.dealId } : {}),
      ...(query.storeId ? { storeId: query.storeId } : {}),
      ...(query.customerUserId ? { customerUserId: query.customerUserId } : {}),
      ...(query.from || query.to ? { redeemedAt: { ...(query.from ? { gte: new Date(query.from) } : {}), ...(query.to ? { lte: new Date(query.to) } : {}) } } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.redemption.findMany({
        where,
        include: {
          deal: { select: { id: true, title: true } },
          store: { select: { id: true, name: true } },
          customer: { select: { id: true, profile: { select: { displayName: true } } } },
          redeemedBy: { select: { id: true, profile: { select: { displayName: true } } } },
        },
        orderBy: [{ redeemedAt: "desc" }, { id: "desc" }],
        skip: pagination.skip,
        take: pagination.limit,
      }),
      this.prisma.redemption.count({ where }),
    ]);
    return this.page(items, query, total);
  }

  async adminRedemption(redemptionId: string) {
    const redemption = await this.prisma.redemption.findUnique({
      where: { id: redemptionId },
      include: {
        code: { select: { id: true, status: true, issuedAt: true, expiresAt: true, redeemedAt: true } },
        deal: { select: { id: true, title: true } },
        store: { select: { id: true, name: true, retailerId: true } },
        customer: { select: { id: true, profile: { select: { displayName: true } } } },
        redeemedBy: { select: { id: true, profile: { select: { displayName: true } } } },
      },
    });
    if (!redemption) throw new NotFoundException("Redemption not found.");
    return redemption;
  }

  async adminClaims(query: RedemptionPageQueryDto) {
    const pagination = this.pagination(query);
    const where: Prisma.RedemptionCodeWhereInput = {
      ...(query.dealId ? { dealId: query.dealId } : {}),
      ...(query.customerUserId ? { customerUserId: query.customerUserId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.from || query.to ? { issuedAt: { ...(query.from ? { gte: new Date(query.from) } : {}), ...(query.to ? { lte: new Date(query.to) } : {}) } } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.redemptionCode.findMany({
        where,
        include: { deal: { select: { id: true, title: true, store: { select: { id: true, name: true, retailerId: true } } } }, customer: { select: { id: true, profile: { select: { displayName: true } } } } },
        orderBy: [{ issuedAt: "desc" }, { id: "desc" }],
        skip: pagination.skip,
        take: pagination.limit,
      }),
      this.prisma.redemptionCode.count({ where }),
    ]);
    return this.page(items.map((code) => ({
      id: code.id,
      status: effectiveStatus(code),
      issuedAt: code.issuedAt,
      expiresAt: code.expiresAt,
      redeemedAt: code.redeemedAt,
      deal: code.deal,
      customer: code.customer,
    })), query, total);
  }

  async adminClaim(claimId: string) {
    const code = await this.prisma.redemptionCode.findUnique({
      where: { id: claimId },
      include: { deal: { select: { id: true, title: true, store: { select: { id: true, name: true, retailerId: true } } } }, customer: { select: { id: true, profile: { select: { displayName: true } } } }, redemption: { select: { id: true, redeemedAt: true, redeemedByUserId: true } } },
    });
    if (!code) throw new NotFoundException("Redemption claim not found.");
    return { id: code.id, status: effectiveStatus(code), issuedAt: code.issuedAt, expiresAt: code.expiresAt, redeemedAt: code.redeemedAt, deal: code.deal, customer: code.customer, redemption: code.redemption };
  }

  private async requireStoreMembership(
    client: QueryClient,
    userId: string,
    retailerId: string,
    storeId: string,
  ) {
    const membership = await client.retailerMembership.findFirst({
      where: { retailerId, userId, status: MembershipStatus.ACTIVE, retailer: { is: { status: RetailerStatus.ACTIVE } } },
      select: { id: true },
    });
    if (!membership) throw new ForbiddenException("Active retailer membership is required.");
    const store = await client.store.findFirst({
      where: {
        id: storeId,
        retailerId,
        status: StoreStatus.ACTIVE,
        verifiedAt: { not: null },
        retailer: { is: { status: RetailerStatus.ACTIVE } },
      },
      select: { id: true },
    });
    if (!store) throw new NotFoundException("Store not found.");
  }

  private async findCodeForStore(client: QueryClient, hash: Uint8Array<ArrayBuffer>, storeId: string) {
    return client.redemptionCode.findFirst({
      where: { tokenHash: hash, deal: { is: { storeId } } },
      include: { deal: { include: { store: { include: { retailer: true } } } } },
    });
  }

  private async lockDeal(tx: Transaction, dealId: string) {
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "deals" WHERE "id" = ${dealId}::uuid FOR UPDATE`);
  }

  private async lockStoreAndRetailer(tx: Transaction, storeId: string, retailerId: string) {
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "stores" WHERE "id" = ${storeId}::uuid AND "retailer_id" = ${retailerId}::uuid FOR SHARE`);
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "retailers" WHERE "id" = ${retailerId}::uuid FOR SHARE`);
  }

  private async lockMembership(tx: Transaction, userId: string, retailerId: string) {
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "retailer_memberships" WHERE "user_id" = ${userId}::uuid AND "retailer_id" = ${retailerId}::uuid AND "status" = 'active' FOR SHARE`);
  }

  private async lockCode(tx: Transaction, codeId: string) {
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "redemption_codes" WHERE "id" = ${codeId}::uuid FOR UPDATE`);
  }

  private isEligible(deal: CodeRecord["deal"], now: Date) {
    return deal.status === DealStatus.PUBLISHED && deal.moderationHoldAt === null && deal.startsAt <= now && deal.endsAt > now
      && deal.store.status === StoreStatus.ACTIVE && deal.store.verifiedAt !== null
      && deal.store.retailer.status === RetailerStatus.ACTIVE;
  }

  // Keep the existing redemption eligibility unchanged while returning a state-specific,
  // retailer-safe message that the UI can map without guessing from a generic 409.
  private assertCredentialUsable(code: CodeRecord, now: Date) {
    if (code.status === RedemptionCodeStatus.REDEEMED) {
      throw new ConflictException("Credential has already been redeemed.");
    }
    if (code.status === RedemptionCodeStatus.REVOKED) {
      throw new ConflictException("Credential has been cancelled.");
    }
    if (code.status === RedemptionCodeStatus.EXPIRED || code.expiresAt <= now) {
      throw new ConflictException("Credential has expired.");
    }
    if (code.status !== RedemptionCodeStatus.ISSUED) {
      throw new ConflictException("Credential is unavailable.");
    }
  }

  private assertCapacity(deal: { maxRedemptions: number | null; redemptionCount: number; perCustomerLimit: number }, customerRedemptions: number) {
    if (deal.maxRedemptions !== null && deal.redemptionCount >= deal.maxRedemptions) {
      throw new ConflictException("This offer has reached its redemption limit.");
    }
    if (customerRedemptions >= deal.perCustomerLimit) {
      throw new ConflictException("This customer has reached this offer's redemption limit.");
    }
  }

  private previewDto(code: CodeRecord) {
    return {
      status: "available" as const,
      claimId: code.id,
      expiresAt: code.expiresAt,
      offer: {
        id: code.deal.id,
        title: code.deal.title,
        terms: code.deal.terms,
        startsAt: code.deal.startsAt,
        endsAt: code.deal.endsAt,
        offerType: code.deal.offerType,
        discountBps: code.deal.discountBps,
        discountAmountMinor: code.deal.discountAmountMinor?.toString() ?? null,
        currency: code.deal.currency,
        originalPriceMinor: code.deal.originalPriceMinor?.toString() ?? null,
        offerPriceMinor: code.deal.offerPriceMinor?.toString() ?? null,
      },
      store: { id: code.deal.store.id, name: code.deal.store.name },
    };
  }

  private redemptionDto(redemption: { id: string; dealId: string; storeId: string; redeemedAt: Date; customerRedemptionNumber: number; deal: { title: string } }) {
    return {
      id: redemption.id,
      dealId: redemption.dealId,
      storeId: redemption.storeId,
      dealTitle: redemption.deal.title,
      customerRedemptionNumber: redemption.customerRedemptionNumber,
      redeemedAt: redemption.redeemedAt,
      status: "redeemed" as const,
    };
  }

  private async audit(
    tx: Transaction,
    actor: AuthPrincipal,
    action: string,
    entityId: string,
    retailerId: string,
    requestId: string | undefined,
    beforeSnapshot: Prisma.InputJsonValue | null,
    afterSnapshot: Prisma.InputJsonValue,
  ) {
    await tx.auditLog.create({ data: {
      actorUserId: actor.userId,
      actorType: actor.roles.includes(AccountRole.RETAILER) ? "retailer" : "customer",
      action,
      entityType: action === "redemption.confirmed" ? "redemption" : "redemption_claim",
      entityId,
      retailerId,
      requestId: requestId ?? null,
      beforeSnapshot: beforeSnapshot ?? Prisma.JsonNull,
      afterSnapshot,
    } });
  }

  private page<T>(items: T[], query: RedemptionPageQueryDto, total: number) {
    const pagination = this.pagination(query);
    return { items, page: pagination.page, limit: pagination.limit, total, totalPages: Math.ceil(total / pagination.limit) };
  }

  private pagination(query: RedemptionPageQueryDto) {
    const requestedPage = Number(query.page);
    const requestedLimit = Number(query.limit);
    const page = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
    const limit = Number.isInteger(requestedLimit) && requestedLimit > 0 && requestedLimit <= 100 ? requestedLimit : 20;
    return { page, limit, skip: (page - 1) * limit };
  }

  private isUniqueViolation(error: unknown) {
    return typeof error === "object" && error !== null && "code" in error && (error as { code?: string }).code === "P2002";
  }
}
