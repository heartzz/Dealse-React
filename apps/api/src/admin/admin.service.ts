import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "../generated/prisma/client.js";
import { DealReportStatus, DealStatus, RetailerStatus, StoreStatus } from "../generated/prisma/enums.js";
import type { AuthPrincipal } from "../auth/auth.types.js";
import { PrismaService } from "../database/prisma.service.js";
import { DealsService } from "../deals/deals.service.js";
import type { AdminAuditQueryDto, AdminDealQueryDto, AdminPageQueryDto, AdminReportQueryDto, AdminRetailerQueryDto, AdminStoreQueryDto, CreateCategoryDto, ReviewDealReportDto, UpdateCategoryDto } from "./dto/admin.dto.js";

type Page<T> = { items: T[]; page: number; limit: number; total: number; totalPages: number };

function serializeDealPrices<T extends { discountAmountMinor: bigint | null; originalPriceMinor: bigint | null; offerPriceMinor: bigint | null }>(deal: T) {
  return {
    ...deal,
    discountAmountMinor: deal.discountAmountMinor?.toString() ?? null,
    originalPriceMinor: deal.originalPriceMinor?.toString() ?? null,
    offerPriceMinor: deal.offerPriceMinor?.toString() ?? null,
  };
}

@Injectable()
export class AdminService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService, @Inject(DealsService) private readonly deals: DealsService) {}

  async access(userId: string) {
    const account = await this.prisma.adminAccount.findUnique({
      where: { userId },
      select: { role: true, status: true, acceptedAt: true, permissions: { select: { permission: true } } },
    });
    if (!account) throw new NotFoundException("Administrator account not found.");
    return { ...account, permissions: account.permissions.map(({ permission }) => permission) };
  }

  async overview() {
    const [pendingRetailers, unreviewedStores, publishedDeals, openReports] = await Promise.all([
      this.prisma.retailer.count({ where: { status: RetailerStatus.PENDING } }),
      this.prisma.store.count({ where: { status: { in: [StoreStatus.DRAFT, StoreStatus.PENDING_VERIFICATION] } } }),
      this.prisma.deal.count({ where: { status: DealStatus.PUBLISHED } }),
      this.prisma.dealReport.count({ where: { status: DealReportStatus.OPEN } }),
    ]);
    return { pendingRetailers, unreviewedStores, publishedDeals, openReports };
  }

  async listRetailers(query: AdminRetailerQueryDto): Promise<Page<unknown>> {
    const where: Prisma.RetailerWhereInput = query.all ? {} : { status: query.status ?? RetailerStatus.PENDING };
    if (query.q) where.OR = [
      { displayName: { contains: query.q, mode: "insensitive" } },
      { legalName: { contains: query.q, mode: "insensitive" } },
      { createdBy: { is: { emailNormalized: { contains: query.q, mode: "insensitive" } } } },
      { memberships: { some: { role: "OWNER", status: "ACTIVE", user: { is: { emailNormalized: { contains: query.q, mode: "insensitive" } } } } } },
      { memberships: { some: { role: "OWNER", status: "ACTIVE", user: { is: { profile: { is: { displayName: { contains: query.q, mode: "insensitive" } } } } } } } },
    ];
    const [items, total] = await this.prisma.$transaction([
      this.prisma.retailer.findMany({
        where, orderBy: [{ createdAt: "asc" }, { id: "asc" }], skip: this.skip(query), take: this.take(query),
        select: { id: true, displayName: true, legalName: true, status: true, createdAt: true, createdBy: { select: { emailNormalized: true, profile: { select: { displayName: true } } } }, memberships: { where: { role: "OWNER", status: "ACTIVE" }, take: 1, select: { user: { select: { id: true, emailNormalized: true, profile: { select: { displayName: true, phoneE164: true } } } } } }, _count: { select: { memberships: true, stores: true } } },
      }),
      this.prisma.retailer.count({ where }),
    ]);
    return this.page(items, query, total);
  }

  async getRetailer(retailerId: string) {
    const [retailer, history] = await Promise.all([
      this.prisma.retailer.findUnique({ where: { id: retailerId }, include: {
        createdBy: { select: { id: true, emailNormalized: true, profile: { select: { displayName: true, phoneE164: true } } } },
        memberships: { include: { user: { select: { id: true, emailNormalized: true, profile: { select: { displayName: true, phoneE164: true } } } } }, orderBy: { createdAt: "asc" } },
        stores: { orderBy: [{ createdAt: "desc" }, { id: "asc" }], select: { id: true, name: true, city: true, status: true, verifiedAt: true, createdAt: true, deals: { orderBy: { updatedAt: "desc" }, take: 50, select: { id: true, title: true, status: true, endsAt: true } }, _count: { select: { deals: true } } } },
        products: { orderBy: [{ updatedAt: "desc" }, { id: "asc" }], take: 100, select: { id: true, name: true, status: true, updatedAt: true } },
      } }),
      this.listAuditLogs({ page: 1, limit: 100, entityType: "retailer", entityId: retailerId } as AdminAuditQueryDto),
    ]);
    if (!retailer) throw new NotFoundException("Retailer not found.");
    return { ...retailer, applicationHistory: history.items };
  }

  async approveRetailer(admin: AuthPrincipal, retailerId: string) {
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.retailer.findUnique({ where: { id: retailerId }, select: { id: true, displayName: true, status: true } });
      if (!current) throw new NotFoundException("Retailer not found.");
      if (current.status === RetailerStatus.ACTIVE) return current;
      if (current.status !== RetailerStatus.PENDING) throw new ConflictException("Only pending retailers can be approved.");
      const changed = await tx.retailer.updateMany({ where: { id: retailerId, status: RetailerStatus.PENDING }, data: { status: RetailerStatus.ACTIVE } });
      if (!changed.count) {
        const latest = await tx.retailer.findUniqueOrThrow({ where: { id: retailerId }, select: { id: true, displayName: true, status: true } });
        if (latest.status === RetailerStatus.ACTIVE) return latest;
        throw new ConflictException("The retailer changed while this action was being applied. Refresh and try again.");
      }
      const updated = await tx.retailer.findUniqueOrThrow({ where: { id: retailerId }, select: { id: true, displayName: true, status: true } });
      await this.audit(tx, admin, "retailer.approved", "retailer", retailerId, { status: current.status }, { status: updated.status });
      return updated;
    });
  }

  async suspendRetailer(admin: AuthPrincipal, retailerId: string, reason: string) {
    this.requireReason(reason);
    return this.changeRetailerStatus(admin, retailerId, RetailerStatus.SUSPENDED, reason, "retailer.suspended", [RetailerStatus.ACTIVE]);
  }

  async rejectRetailer(admin: AuthPrincipal, retailerId: string, reason: string) {
    this.requireReason(reason);
    return this.changeRetailerStatus(admin, retailerId, RetailerStatus.REJECTED, reason, "retailer.rejected", [RetailerStatus.PENDING]);
  }

  async reactivateRetailer(admin: AuthPrincipal, retailerId: string) {
    return this.changeRetailerStatus(admin, retailerId, RetailerStatus.ACTIVE, null, "retailer.reactivated", [RetailerStatus.SUSPENDED]);
  }

  private async changeRetailerStatus(admin: AuthPrincipal, retailerId: string, status: RetailerStatus, reason: string | null, action: string, allowed: RetailerStatus[]) {
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.retailer.findUnique({ where: { id: retailerId }, select: { id: true, displayName: true, status: true } });
      if (!current) throw new NotFoundException("Retailer not found.");
      if (current.status === status) return current;
      if (!allowed.includes(current.status)) throw new ConflictException("The retailer is not in a state that supports this action.");
      if (status === RetailerStatus.ACTIVE) {
        const invalidActiveStores = await tx.store.count({ where: { retailerId, status: StoreStatus.ACTIVE, verifiedAt: null } });
        const [unmapped] = await tx.$queryRaw<Array<{ count: bigint }>>`SELECT COUNT(*) AS count FROM "stores" WHERE "retailer_id" = ${retailerId}::uuid AND "status" = 'active' AND "location" IS NULL`;
        if (invalidActiveStores || Number(unmapped?.count ?? 0n) > 0) throw new ConflictException("The retailer has an active store that no longer meets verification requirements.");
      }
      const changed = await tx.retailer.updateMany({ where: { id: retailerId, status: current.status }, data: { status } });
      if (!changed.count) throw new ConflictException("The retailer changed while this action was being applied. Refresh and try again.");
      await this.audit(tx, admin, action, "retailer", retailerId, { status: current.status }, { status, reason });
      return tx.retailer.findUniqueOrThrow({ where: { id: retailerId }, select: { id: true, displayName: true, status: true } });
    });
  }

  async listStores(query: AdminStoreQueryDto): Promise<Page<unknown>> {
    const where: Prisma.StoreWhereInput = query.all ? {} : query.status ? { status: query.status } : { status: { in: [StoreStatus.DRAFT, StoreStatus.PENDING_VERIFICATION] } };
    if (query.q) where.OR = [
      { name: { contains: query.q, mode: "insensitive" } }, { city: { contains: query.q, mode: "insensitive" } },
      { locality: { contains: query.q, mode: "insensitive" } }, { region: { contains: query.q, mode: "insensitive" } },
      { retailer: { is: { displayName: { contains: query.q, mode: "insensitive" } } } },
    ];
    const [records, total] = await this.prisma.$transaction([
      this.prisma.store.findMany({
        where, include: {
          retailer: { select: { id: true, displayName: true, status: true } },
          category: { select: { id: true, name: true } },
          images: { orderBy: { sortOrder: "asc" }, include: { mediaAsset: { select: { id: true, altText: true, width: true, height: true, processingStatus: true, deletedAt: true } } } },
        },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }], skip: this.skip(query), take: this.take(query),
      }),
      this.prisma.store.count({ where }),
    ]);
    const ids = records.map(({ id }) => id);
    const locationRows = ids.length ? await this.prisma.$queryRaw<Array<{ id: string; hasCoordinates: boolean }>>`
      SELECT "id"::text AS "id", "location" IS NOT NULL AS "hasCoordinates"
      FROM "stores"
      WHERE "id" IN (${Prisma.join(ids.map((id) => Prisma.sql`${id}::uuid`))})
    ` : [];
    const locationMap = new Map(locationRows.map((row) => [row.id, row.hasCoordinates]));
    return this.page(records.map((store) => ({ ...store, hasCoordinates: locationMap.get(store.id) ?? false })), query, total);
  }

  async getStore(storeId: string) {
    const store = await this.prisma.store.findUnique({ where: { id: storeId }, include: {
      retailer: { include: {
        createdBy: { select: { emailNormalized: true, profile: { select: { displayName: true } } } },
        memberships: { where: { role: "OWNER", status: "ACTIVE" }, take: 1, include: { user: { select: { emailNormalized: true, profile: { select: { displayName: true, phoneE164: true } } } } } },
      } },
      category: { select: { id: true, name: true, slug: true } },
      images: { orderBy: { sortOrder: "asc" }, include: { mediaAsset: { select: { id: true, altText: true, width: true, height: true, processingStatus: true, deletedAt: true } } } },
      deals: { orderBy: [{ updatedAt: "desc" }, { id: "asc" }], take: 100, select: { id: true, title: true, status: true, endsAt: true, updatedAt: true } },
    } });
    if (!store) throw new NotFoundException("Store not found.");
    const [location] = await this.prisma.$queryRaw<Array<{ latitude: number | null; longitude: number | null }>>`
      SELECT ST_Y("location"::geometry) AS latitude, ST_X("location"::geometry) AS longitude FROM "stores" WHERE "id" = ${storeId}::uuid
    `;
    const history = await this.listAuditLogs({ page: 1, limit: 100, entityType: "store", entityId: storeId } as AdminAuditQueryDto);
    return { ...store, latitude: location?.latitude ?? null, longitude: location?.longitude ?? null, applicationHistory: history.items };
  }

  async verifyStore(admin: AuthPrincipal, storeId: string) {
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.store.findUnique({ where: { id: storeId }, include: { retailer: { select: { status: true } } } });
      if (!current) throw new NotFoundException("Store not found.");
      if (current.status === StoreStatus.ACTIVE && current.verifiedAt) return { id: current.id, status: current.status, verifiedAt: current.verifiedAt };
      const reviewableStatuses: StoreStatus[] = [StoreStatus.DRAFT, StoreStatus.PENDING_VERIFICATION];
      if (!reviewableStatuses.includes(current.status)) throw new ConflictException("Only draft stores awaiting review can be verified.");
      if (current.retailer.status !== RetailerStatus.ACTIVE) throw new ConflictException("Approve the retailer before verifying its store.");
      const [location] = await tx.$queryRaw<Array<{ hasCoordinates: boolean }>>`
        SELECT "location" IS NOT NULL AND NOT ST_IsEmpty("location"::geometry) AS "hasCoordinates" FROM "stores" WHERE "id" = ${storeId}::uuid
      `;
      if (!location?.hasCoordinates) throw new ConflictException("Add the store's map coordinates (latitude and longitude) before verification. A street address alone is not enough.");
      const now = new Date();
      const changed = await tx.store.updateMany({
        where: { id: storeId, status: current.status, retailer: { is: { status: RetailerStatus.ACTIVE } } },
        data: { status: StoreStatus.ACTIVE, verifiedAt: now, verifiedByUserId: admin.userId },
      });
      if (!changed.count) throw new ConflictException("The store changed while this action was being applied. Refresh and try again.");
      await this.audit(tx, admin, "store.verified", "store", storeId, { status: current.status, verifiedAt: null }, { status: StoreStatus.ACTIVE, verifiedAt: now.toISOString(), verifiedByUserId: admin.userId }, current.retailerId);
      return { id: storeId, status: StoreStatus.ACTIVE, verifiedAt: now };
    });
  }

  async rejectStore(admin: AuthPrincipal, storeId: string, reason: string) {
    this.requireReason(reason);
    return this.changeStoreStatus(admin, storeId, StoreStatus.REJECTED, "store.rejected", [StoreStatus.DRAFT, StoreStatus.PENDING_VERIFICATION], reason);
  }

  async pauseStore(admin: AuthPrincipal, storeId: string, reason: string) {
    this.requireReason(reason);
    return this.changeStoreStatus(admin, storeId, StoreStatus.PAUSED, "store.paused", [StoreStatus.ACTIVE], reason);
  }

  async suspendStore(admin: AuthPrincipal, storeId: string, reason: string) {
    this.requireReason(reason);
    return this.changeStoreStatus(admin, storeId, StoreStatus.PAUSED, "store.suspended", [StoreStatus.ACTIVE], reason);
  }

  async resumeStore(admin: AuthPrincipal, storeId: string) {
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.store.findUnique({ where: { id: storeId }, include: { retailer: { select: { status: true } } } });
      if (!current) throw new NotFoundException("Store not found.");
      if (current.status === StoreStatus.ACTIVE) return { id: current.id, status: current.status };
      if (current.status !== StoreStatus.PAUSED || !current.verifiedAt) throw new ConflictException("Only a previously verified paused store can be resumed.");
      if (current.retailer.status !== RetailerStatus.ACTIVE) throw new ConflictException("Reactivate the retailer before resuming its store.");
      const [location] = await tx.$queryRaw<Array<{ hasCoordinates: boolean }>>`SELECT "location" IS NOT NULL AS "hasCoordinates" FROM "stores" WHERE "id" = ${storeId}::uuid`;
      if (!location?.hasCoordinates) throw new ConflictException("The store must retain a valid mapped location before it can be resumed.");
      const changed = await tx.store.updateMany({ where: { id: storeId, status: StoreStatus.PAUSED, verifiedAt: { not: null }, retailer: { is: { status: RetailerStatus.ACTIVE } } }, data: { status: StoreStatus.ACTIVE } });
      if (!changed.count) throw new ConflictException("The store changed while this action was being applied. Refresh and try again.");
      await this.audit(tx, admin, "store.resumed", "store", storeId, { status: current.status }, { status: StoreStatus.ACTIVE }, current.retailerId);
      return { id: storeId, status: StoreStatus.ACTIVE };
    });
  }

  private async changeStoreStatus(admin: AuthPrincipal, storeId: string, status: StoreStatus, action: string, allowed: StoreStatus[], reason: string) {
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.store.findUnique({ where: { id: storeId }, select: { id: true, retailerId: true, status: true } });
      if (!current) throw new NotFoundException("Store not found.");
      if (current.status === status) return current;
      if (!allowed.includes(current.status)) throw new ConflictException("The store is not in a state that supports this action.");
      const changed = await tx.store.updateMany({ where: { id: storeId, status: current.status }, data: { status } });
      if (!changed.count) throw new ConflictException("The store changed while this action was being applied. Refresh and try again.");
      await this.audit(tx, admin, action, "store", storeId, { status: current.status }, { status, reason }, current.retailerId);
      return tx.store.findUniqueOrThrow({ where: { id: storeId }, select: { id: true, retailerId: true, status: true } });
    });
  }

  async listDeals(query: AdminDealQueryDto): Promise<Page<unknown>> {
    const now = new Date();
    const where: Prisma.DealWhereInput = query.all ? {} : query.status === "pending" ? { status: DealStatus.DRAFT } : query.status === "suspended" ? { status: DealStatus.PAUSED, moderationHoldAt: { not: null } } : query.status === "paused" ? { status: DealStatus.PAUSED, moderationHoldAt: null } : query.status === "expired" ? { OR: [{ status: DealStatus.ENDED }, { endsAt: { lte: now } }] } : query.status ? { status: query.status } : { status: DealStatus.PUBLISHED };
    if (query.q) {
      where.AND = [{
        OR: [
          { title: { contains: query.q, mode: "insensitive" } },
          { store: { is: { name: { contains: query.q, mode: "insensitive" } } } },
          { store: { is: { retailer: { is: { displayName: { contains: query.q, mode: "insensitive" } } } } } },
        ],
      }];
    }
    const [items, total] = await this.prisma.$transaction([
      this.prisma.deal.findMany({
        where, include: { store: { select: { id: true, name: true, city: true, locality: true, retailer: { select: { id: true, displayName: true, status: true } } } }, category: { select: { id: true, name: true } }, images: { select: { mediaAssetId: true, sortOrder: true, isPrimary: true } } },
        orderBy: [{ updatedAt: "desc" }, { id: "asc" }], skip: this.skip(query), take: this.take(query),
      }),
      this.prisma.deal.count({ where }),
    ]);
    return this.page(items.map(serializeDealPrices), query, total);
  }

  async getDeal(dealId: string) {
    const deal = await this.prisma.deal.findUnique({ where: { id: dealId }, include: {
      category: { select: { id: true, name: true, slug: true } },
      store: { include: { retailer: { include: {
        createdBy: { select: { emailNormalized: true, profile: { select: { displayName: true } } } },
        memberships: { where: { role: "OWNER", status: "ACTIVE" }, take: 1, include: { user: { select: { emailNormalized: true, profile: { select: { displayName: true } } } } } },
      } } } },
      images: { orderBy: { sortOrder: "asc" }, include: { mediaAsset: { select: { id: true, altText: true, width: true, height: true, processingStatus: true, deletedAt: true } } } },
      products: { include: { product: { select: { id: true, name: true, status: true } } } },
    } });
    if (!deal) throw new NotFoundException("Offer not found.");
    const history = await this.listAuditLogs({ page: 1, limit: 100, entityType: "deal", entityId: dealId } as AdminAuditQueryDto);
    return { ...serializeDealPrices(deal), applicationHistory: history.items };
  }

  async pauseDeal(admin: AuthPrincipal, dealId: string, reason: string) {
    this.requireReason(reason);
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.deal.findUnique({ where: { id: dealId }, select: { id: true, status: true, moderationHoldAt: true, moderationReason: true, store: { select: { retailerId: true } } } });
      if (!current) throw new NotFoundException("Offer not found.");
      if (current.moderationHoldAt) return { id: current.id, status: current.status, moderationHoldAt: current.moderationHoldAt };
      if (current.status !== DealStatus.PUBLISHED) throw new ConflictException("Only published offers can be placed on a moderation hold.");
      const now = new Date();
      const changed = await tx.deal.updateMany({ where: { id: dealId, status: DealStatus.PUBLISHED, moderationHoldAt: null }, data: { status: DealStatus.PAUSED, moderationHoldAt: now, moderationHoldByUserId: admin.userId, moderationReason: reason } });
      if (!changed.count) throw new ConflictException("The offer changed while this action was being applied. Refresh and try again.");
      await this.audit(tx, admin, "deal.moderation_paused", "deal", dealId, { status: current.status }, { status: DealStatus.PAUSED, moderationReason: reason, moderationHoldAt: now.toISOString() }, current.store.retailerId);
      return { id: dealId, status: DealStatus.PAUSED, moderationHoldAt: now };
    });
  }

  async releaseDeal(admin: AuthPrincipal, dealId: string) {
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.deal.findUnique({ where: { id: dealId }, select: { id: true, status: true, moderationHoldAt: true, moderationReason: true, store: { select: { retailerId: true } } } });
      if (!current) throw new NotFoundException("Offer not found.");
      if (!current.moderationHoldAt) throw new ConflictException("This offer has no active moderation hold.");
      const changed = await tx.deal.updateMany({ where: { id: dealId, status: DealStatus.PAUSED, moderationHoldAt: { not: null } }, data: { status: DealStatus.DRAFT, moderationHoldAt: null, moderationHoldByUserId: null, moderationReason: null } });
      if (!changed.count) throw new ConflictException("The offer changed while this action was being applied. Refresh and try again.");
      await this.audit(tx, admin, "deal.moderation_released", "deal", dealId, { status: current.status, moderationReason: current.moderationReason }, { status: DealStatus.DRAFT, moderationHoldAt: null, moderationReason: null }, current.store.retailerId);
      return { id: dealId, status: DealStatus.DRAFT };
    });
  }

  async rejectDeal(admin: AuthPrincipal, dealId: string, reason: string) {
    this.requireReason(reason);
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.deal.findUnique({ where: { id: dealId }, select: { id: true, status: true, moderationHoldAt: true, store: { select: { retailerId: true } } } });
      if (!current) throw new NotFoundException("Offer not found.");
      if (current.status !== DealStatus.DRAFT) throw new ConflictException("Only draft offers can be rejected.");
      const changed = await tx.deal.updateMany({ where: { id: dealId, status: DealStatus.DRAFT, moderationHoldAt: null }, data: { status: DealStatus.REJECTED, moderationReason: reason, moderationHoldByUserId: admin.userId } });
      if (!changed.count) throw new ConflictException("The offer changed while this action was being applied. Refresh and try again.");
      await this.audit(tx, admin, "deal.rejected", "deal", dealId, { status: current.status }, { status: DealStatus.REJECTED, reason }, current.store.retailerId);
      return { id: dealId, status: DealStatus.REJECTED, reason };
    });
  }

  async approveDeal(admin: AuthPrincipal, dealId: string) {
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.deal.findUnique({ where: { id: dealId }, select: { id: true, status: true, moderationReason: true, store: { select: { retailerId: true } } } });
      if (!current) throw new NotFoundException("Offer not found.");
      if (current.status !== DealStatus.DRAFT && current.status !== DealStatus.REJECTED) throw new ConflictException("Only draft or rejected offers can be approved and published.");
      const published = await this.deals.publishForAdmin(tx, admin.userId, dealId, current.status === DealStatus.REJECTED);
      await this.audit(tx, admin, "deal.approved_and_published", "deal", dealId, { status: current.status, moderationReason: current.moderationReason }, { status: published.status, publishedAt: published.publishedAt?.toISOString() ?? null }, current.store.retailerId);
      return published;
    });
  }

  async resumeDeal(admin: AuthPrincipal, dealId: string) {
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.deal.findUnique({ where: { id: dealId }, select: { id: true, status: true, moderationHoldAt: true, moderationReason: true, store: { select: { retailerId: true } } } });
      if (!current) throw new NotFoundException("Offer not found.");
      if (current.status !== DealStatus.PAUSED) throw new ConflictException("Only paused offers can be resumed.");
      const published = await this.deals.publishForAdmin(tx, admin.userId, dealId, Boolean(current.moderationHoldAt));
      await this.audit(tx, admin, "deal.resumed", "deal", dealId, { status: current.status, moderationReason: current.moderationReason }, { status: published.status, publishedAt: published.publishedAt?.toISOString() ?? null }, current.store.retailerId);
      return published;
    });
  }

  async listCategories() {
    return this.prisma.category.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, slug: true, name: true, sortOrder: true, isActive: true } });
  }

  async createCategory(admin: AuthPrincipal, input: CreateCategoryDto) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const category = await tx.category.create({ data: { slug: input.slug, name: input.name, sortOrder: input.sortOrder ?? 0 } });
        await this.audit(tx, admin, "category.created", "category", category.id, null, { slug: category.slug, name: category.name, sortOrder: category.sortOrder, isActive: category.isActive });
        return category;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new ConflictException("A category with this slug already exists.");
      throw error;
    }
  }

  async updateCategory(admin: AuthPrincipal, categoryId: string, input: UpdateCategoryDto) {
    if (!Object.values(input).some((value) => value !== undefined)) throw new BadRequestException("Provide at least one category field to update.");
    try {
      return await this.prisma.$transaction(async (tx) => {
        const current = await tx.category.findUnique({ where: { id: categoryId } });
        if (!current) throw new NotFoundException("Category not found.");
        const category = await tx.category.update({ where: { id: categoryId }, data: input });
        await this.audit(tx, admin, "category.updated", "category", categoryId, { name: current.name, sortOrder: current.sortOrder, isActive: current.isActive }, { name: category.name, sortOrder: category.sortOrder, isActive: category.isActive });
        return category;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new ConflictException("A category with this slug already exists.");
      throw error;
    }
  }

  async listReports(query: AdminReportQueryDto): Promise<Page<unknown>> {
    const where = { status: query.status ?? DealReportStatus.OPEN };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.dealReport.findMany({
        where,
        include: {
          reporter: { select: { id: true, emailNormalized: true, profile: { select: { displayName: true } } } },
          deal: { select: { id: true, title: true, status: true, store: { select: { id: true, name: true, retailer: { select: { id: true, displayName: true } } } } } },
          reviewedBy: { select: { id: true, profile: { select: { displayName: true } } } },
        },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }], skip: this.skip(query), take: this.take(query),
      }),
      this.prisma.dealReport.count({ where }),
    ]);
    return this.page(items, query, total);
  }

  async listAuditLogs(query: AdminAuditQueryDto): Promise<Page<unknown>> {
    const where: Prisma.AuditLogWhereInput = { ...(query.entityType ? { entityType: query.entityType } : {}), ...(query.entityId ? { entityId: query.entityId } : {}) };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where, include: { actor: { select: { id: true, emailNormalized: true, profile: { select: { displayName: true } } } } },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: this.skip(query), take: this.take(query),
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    return this.page(items, query, total);
  }

  async reviewReport(admin: AuthPrincipal, reportId: string, input: ReviewDealReportDto) {
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.dealReport.findUnique({ where: { id: reportId }, include: { deal: { select: { store: { select: { retailerId: true } } } } } });
      if (!current) throw new NotFoundException("Report not found.");
      if (current.status === input.status) return { id: current.id, status: current.status, resolution: current.resolution };
      if (current.status !== DealReportStatus.OPEN) throw new ConflictException("This report has already been reviewed.");
      const reviewedAt = new Date();
      const changed = await tx.dealReport.updateMany({ where: { id: reportId, status: DealReportStatus.OPEN }, data: { status: input.status, resolution: input.resolution, reviewedByUserId: admin.userId, reviewedAt } });
      if (!changed.count) throw new ConflictException("The report changed while this action was being applied. Refresh and try again.");
      const updated = await tx.dealReport.findUniqueOrThrow({ where: { id: reportId } });
      await this.audit(tx, admin, "deal_report.reviewed", "deal_report", reportId, { status: current.status }, { status: updated.status, resolution: updated.resolution, dealId: current.dealId }, current.deal.store.retailerId);
      return { id: updated.id, status: updated.status, resolution: updated.resolution, reviewedAt: updated.reviewedAt };
    });
  }

  private async audit(tx: Prisma.TransactionClient, admin: AuthPrincipal, action: string, entityType: string, entityId: string, beforeSnapshot: Prisma.InputJsonValue | null, afterSnapshot: Prisma.InputJsonValue, retailerId?: string) {
    const actorAccess = await tx.adminAccount.findUnique({ where: { userId: admin.userId }, select: { role: true, permissions: { select: { permission: true } } } });
    await tx.auditLog.create({ data: {
      actorUserId: admin.userId,
      actorType: "admin",
      actorAdminRole: actorAccess?.role ?? null,
      actorPermissions: actorAccess?.permissions.map(({ permission }) => permission) ?? [],
      action,
      entityType,
      entityId,
      retailerId: retailerId ?? null,
      beforeSnapshot: beforeSnapshot ?? Prisma.JsonNull,
      afterSnapshot,
    } });
  }

  private currentPage(query: AdminPageQueryDto) { return query.page ?? 1; }
  private take(query: AdminPageQueryDto) { return query.limit ?? 20; }
  private skip(query: AdminPageQueryDto) { return (this.currentPage(query) - 1) * this.take(query); }

  private requireReason(reason: string) {
    if (typeof reason !== "string" || reason.trim().length < 5 || reason.trim().length > 500) throw new BadRequestException("Provide a moderation reason between 5 and 500 characters.");
  }

  private page<T>(items: T[], query: AdminPageQueryDto, total: number): Page<T> {
    return { items, page: this.currentPage(query), limit: this.take(query), total, totalPages: Math.max(1, Math.ceil(total / this.take(query))) };
  }
}
