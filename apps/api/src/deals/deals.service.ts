import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { DealStatus, MediaProcessingStatus, MembershipRole, MembershipStatus, OfferType, RetailerStatus, StoreStatus } from "../generated/prisma/enums.js";
import { Prisma } from "../generated/prisma/client.js";
import { PrismaService } from "../database/prisma.service.js";
import { NotificationsService } from "../notifications/notifications.service.js";
import type { AuthPrincipal } from "../auth/auth.types.js";
import type { CreateDealDto, UpdateDealDto } from "./dto/deal.dto.js";
import { publiclyVisibleDealWhere, publiclyVisibleStoreWhere } from "./public-deal-visibility.js";

const editors: MembershipRole[] = [MembershipRole.OWNER, MembershipRole.MANAGER];
const dealInclude = {
  category: { select: { id: true, name: true, slug: true } },
  store: { select: { id: true, name: true, slug: true, description: true, phone: true, email: true, addressLine1: true, locality: true, city: true, region: true, countryCode: true } },
  products: { include: { product: { select: { id: true, name: true, slug: true, description: true, brand: true, category: { select: { id: true, name: true, slug: true } }, images: { where: { mediaAsset: { is: { processingStatus: MediaProcessingStatus.READY, deletedAt: null } } }, orderBy: { sortOrder: "asc" }, include: { mediaAsset: { select: { id: true, altText: true, width: true, height: true } } } } } } } },
  images: { where: { mediaAsset: { is: { processingStatus: MediaProcessingStatus.READY, deletedAt: null } } }, orderBy: { sortOrder: "asc" }, include: { mediaAsset: { select: { id: true, altText: true, width: true, height: true } } } },
} as const;

type DealRecord = Awaited<ReturnType<DealsService["findDeal"]>>;

@Injectable()
export class DealsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(NotificationsService) private readonly notifications: NotificationsService,
  ) {}

  async categories() {
    return this.prisma.category.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, slug: true, name: true } });
  }

  async discover(input: { page: number; limit: number; q?: string; category?: string; city?: string; latitude?: number; longitude?: number; radiusKm?: number; sort?: "newest" | "discount" | "nearest" }) {
    const now = new Date();
    const supportedSorts: readonly unknown[] = ["newest", "discount", "nearest"];
    if (input.sort !== undefined && !supportedSorts.includes(input.sort)) {
      throw new BadRequestException("sort must be newest, discount, or nearest.");
    }
    const sort = input.sort ?? (input.latitude !== undefined && input.longitude !== undefined ? "nearest" : "newest");
    if (sort === "nearest" && (input.latitude === undefined || input.longitude === undefined)) {
      throw new BadRequestException("Provide latitude and longitude to sort by distance.");
    }
    if (input.latitude !== undefined && input.longitude !== undefined) {
      return this.discoverNearby({ ...input, sort, latitude: input.latitude, longitude: input.longitude }, now);
    }
    const categoryIsUuid = input.category !== undefined && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.category);
    const where: Prisma.DealWhereInput = {
      ...publiclyVisibleDealWhere(now),
      ...(input.category ? { category: { is: categoryIsUuid ? { id: input.category } : { slug: input.category } } } : {}),
      ...(input.city ? { store: { is: { ...publiclyVisibleStoreWhere, city: { equals: input.city, mode: "insensitive" as const } } } } : {}),
      ...(input.q ? { OR: [
        { title: { contains: input.q, mode: "insensitive" as const } },
        { summary: { contains: input.q, mode: "insensitive" as const } },
        { details: { contains: input.q, mode: "insensitive" as const } },
        { store: { is: { name: { contains: input.q, mode: "insensitive" as const } } } },
        { category: { is: { name: { contains: input.q, mode: "insensitive" as const } } } },
      ] } : {}),
    };
    const orderBy = sort === "discount"
      ? [{ discountBps: { sort: "desc" as const, nulls: "last" as const } }, { publishedAt: "desc" as const }, { createdAt: "desc" as const }]
      : [{ publishedAt: "desc" as const }, { createdAt: "desc" as const }];
    const [records, total] = await this.prisma.$transaction([
      this.prisma.deal.findMany({ where, include: dealInclude, orderBy, skip: (input.page - 1) * input.limit, take: input.limit }),
      this.prisma.deal.count({ where }),
    ]);
    return { items: records.map((record) => ({ ...this.present(record), distanceMeters: null })), page: input.page, limit: input.limit, total, totalPages: Math.ceil(total / input.limit) };
  }

  private async discoverNearby(
    input: { page: number; limit: number; q?: string; category?: string; city?: string; latitude: number; longitude: number; radiusKm?: number; sort: "newest" | "discount" | "nearest" },
    now: Date,
  ) {
    const categoryIsUuid = input.category !== undefined && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.category);
    const point = Prisma.sql`ST_SetSRID(ST_MakePoint(${input.longitude}, ${input.latitude}), 4326)::geography`;
    const categoryFilter = input.category
      ? categoryIsUuid
        ? Prisma.sql`AND c."id" = ${input.category}::uuid`
        : Prisma.sql`AND c."slug" = ${input.category}`
      : Prisma.empty;
    const cityFilter = input.city ? Prisma.sql`AND LOWER(s."city") = LOWER(${input.city})` : Prisma.empty;
    const searchPattern = input.q ? `%${input.q.replace(/[\\%_]/g, "\\$&")}%` : null;
    const searchFilter = input.q
      ? Prisma.sql`AND (
          d."title" ILIKE ${searchPattern}
          OR COALESCE(d."summary", '') ILIKE ${searchPattern}
          OR COALESCE(d."details", '') ILIKE ${searchPattern}
          OR s."name" ILIKE ${searchPattern}
          OR COALESCE(c."name", '') ILIKE ${searchPattern}
        )`
      : Prisma.empty;
    const predicates = Prisma.sql`
      FROM "deals" d
      JOIN "stores" s ON s."id" = d."store_id"
      JOIN "retailers" r ON r."id" = s."retailer_id"
      LEFT JOIN "categories" c ON c."id" = d."category_id"
      WHERE d."status" = 'published'
        AND d."moderation_hold_at" IS NULL
        AND d."starts_at" <= ${now}
        AND d."ends_at" > ${now}
        AND r."status" = 'active'
        AND s."status" = 'active'
        AND s."verified_at" IS NOT NULL
        AND s."location" IS NOT NULL
        AND ST_DWithin(s."location", ${point}, ${(input.radiusKm ?? 10) * 1000})
        ${categoryFilter}
        ${cityFilter}
        ${searchFilter}
    `;
    const nearbyOrderBy = input.sort === "discount"
      ? Prisma.sql`d."discount_bps" DESC NULLS LAST, d."published_at" DESC, d."created_at" DESC`
      : input.sort === "newest"
        ? Prisma.sql`d."published_at" DESC, d."created_at" DESC`
        : Prisma.sql`"distanceMeters" ASC, d."published_at" DESC, d."created_at" DESC`;
    const [nearbyRows, countRows] = await Promise.all([
      this.prisma.$queryRaw<Array<{ id: string; distanceMeters: number }>>(Prisma.sql`
        SELECT d."id"::text AS "id", ST_Distance(s."location", ${point})::double precision AS "distanceMeters"
        ${predicates}
        ORDER BY ${nearbyOrderBy}
        LIMIT ${input.limit} OFFSET ${(input.page - 1) * input.limit}
      `),
      this.prisma.$queryRaw<Array<{ total: bigint }>>(Prisma.sql`SELECT COUNT(*) AS "total" ${predicates}`),
    ]);
    const total = Number(countRows[0]?.total ?? 0n);
    if (!nearbyRows.length) return { items: [], page: input.page, limit: input.limit, total, totalPages: Math.ceil(total / input.limit) };

    const records = await this.prisma.deal.findMany({
      where: { id: { in: nearbyRows.map(({ id }) => id) }, ...publiclyVisibleDealWhere(now) },
      include: dealInclude,
    });
    const recordById = new Map(records.map((record) => [record.id, record]));
    const items = nearbyRows.flatMap(({ id, distanceMeters }) => {
      const record = recordById.get(id);
      return record ? [{ ...this.present(record), distanceMeters }] : [];
    });
    return { items, page: input.page, limit: input.limit, total, totalPages: Math.ceil(total / input.limit) };
  }

  async publicDetail(dealId: string) {
    const now = new Date();
    const record = await this.prisma.deal.findFirst({ where: { id: dealId, ...publiclyVisibleDealWhere(now) }, include: dealInclude });
    if (!record) throw new NotFoundException("Offer not found.");
    return this.present(record);
  }

  async publicStoreDetail(storeId: string) {
    const now = new Date();
    const store = await this.prisma.store.findFirst({
      where: { id: storeId, ...publiclyVisibleStoreWhere },
      include: {
        retailer: { select: { displayName: true } },
        category: { select: { id: true, name: true, slug: true } },
        images: {
          where: { mediaAsset: { is: { processingStatus: MediaProcessingStatus.READY, deletedAt: null } } },
          orderBy: { sortOrder: "asc" },
          include: { mediaAsset: { select: { id: true, altText: true, width: true, height: true } } },
        },
        deals: {
          where: publiclyVisibleDealWhere(now),
          include: dealInclude,
          orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
          take: 100,
        },
      },
    });
    if (!store) throw new NotFoundException("Store not found.");
    return {
      id: store.id,
      slug: store.slug,
      name: store.name,
      description: store.description,
      phone: store.phone,
      email: store.email,
      addressLine1: store.addressLine1,
      addressLine2: store.addressLine2,
      locality: store.locality,
      city: store.city,
      region: store.region,
      postalCode: store.postalCode,
      countryCode: store.countryCode,
      openingHours: store.openingHours,
      category: store.category,
      retailerName: store.retailer.displayName,
      images: store.images.map(({ mediaAsset, sortOrder, isPrimary }) => ({ id: mediaAsset.id, url: `/media/${mediaAsset.id}`, altText: mediaAsset.altText ?? store.name, sortOrder, isPrimary, width: mediaAsset.width, height: mediaAsset.height })),
      image: store.images.find(({ isPrimary }) => isPrimary)?.mediaAsset.id ? `/media/${store.images.find(({ isPrimary }) => isPrimary)!.mediaAsset.id}` : null,
      imageAlt: store.images.find(({ isPrimary }) => isPrimary)?.mediaAsset.altText ?? store.name,
      offers: store.deals.map((deal) => this.present(deal)),
    };
  }

  async listMine(user: AuthPrincipal, retailerId: string) {
    await this.requireMembership(user.userId, retailerId, false);
    const records = await this.prisma.deal.findMany({ where: { store: { retailerId } }, include: dealInclude, orderBy: { updatedAt: "desc" } });
    return records.map((record) => this.present(record));
  }

  async create(user: AuthPrincipal, retailerId: string, input: CreateDealDto) {
    await this.requireMembership(user.userId, retailerId, true);
    const store = await this.prisma.store.findFirst({ where: { id: input.storeId, retailerId }, select: { id: true, timezone: true } });
    if (!store) throw new BadRequestException("Choose one of your stores.");
    await this.validateCategory(input.categoryId);
    await this.validateProducts(input.productIds ?? [], retailerId);
    this.validateTerms(input);
    this.validateImageReference(input.imageReference);
    const slug = `${slugify(input.title)}-${Date.now().toString(36)}`.slice(0, 140);
    const record = await this.prisma.$transaction(async (tx) => {
      const deal = await tx.deal.create({
        data: {
          storeId: store.id, categoryId: input.categoryId, createdByUserId: user.userId, slug,
          title: input.title, summary: input.summary || null, details: input.details || null, terms: input.terms,
          offerType: input.offerType, discountBps: input.discountBps ?? null,
          discountAmountMinor: input.discountAmountMinor === undefined ? null : BigInt(input.discountAmountMinor),
          currency: input.currency ?? null,
          originalPriceMinor: input.originalPriceMinor === undefined ? null : BigInt(input.originalPriceMinor),
          offerPriceMinor: input.offerPriceMinor === undefined ? null : BigInt(input.offerPriceMinor),
          imageReference: input.imageReference || null,
          startsAt: new Date(input.startsAt), endsAt: new Date(input.endsAt), storeTimezone: store.timezone,
        },
      });
      if (input.productIds?.length) await tx.dealProduct.createMany({ data: input.productIds.map((productId, displayOrder) => ({ dealId: deal.id, productId, displayOrder })) });
      return tx.deal.findUniqueOrThrow({ where: { id: deal.id }, include: dealInclude });
    });
    return this.present(record);
  }

  async update(user: AuthPrincipal, retailerId: string, dealId: string, input: UpdateDealDto) {
    await this.requireMembership(user.userId, retailerId, true);
    const current = await this.prisma.deal.findFirst({ where: { id: dealId, store: { retailerId } }, include: { products: { select: { productId: true } }, store: { select: { id: true, name: true, slug: true, timezone: true } } } });
    if (!current) throw new NotFoundException("Offer not found.");
    if (current.status === DealStatus.ENDED) throw new BadRequestException("Ended offers cannot be edited.");
    if (current.moderationHoldAt) throw new ConflictException("This offer is on an admin moderation hold and cannot be edited.");
    const categoryId = input.categoryId ?? current.categoryId;
    this.validateImageReference(input.imageReference);
    const offerType = input.offerType ?? current.offerType;
    if (categoryId) await this.validateCategory(categoryId);
    const productIds = input.productIds ?? current.products.map((row) => row.productId);
    await this.validateProducts(productIds, retailerId);
    const sameOfferType = offerType === current.offerType;
    const merged = {
      offerType, discountBps: input.discountBps ?? (sameOfferType ? current.discountBps ?? undefined : undefined),
      discountAmountMinor: input.discountAmountMinor ?? (sameOfferType && current.discountAmountMinor !== null ? Number(current.discountAmountMinor) : undefined),
      currency: input.currency ?? (sameOfferType ? current.currency ?? undefined : undefined),
      originalPriceMinor: input.originalPriceMinor ?? (current.originalPriceMinor === null ? undefined : Number(current.originalPriceMinor)),
      offerPriceMinor: input.offerPriceMinor ?? (current.offerPriceMinor === null ? undefined : Number(current.offerPriceMinor)),
      startsAt: input.startsAt ?? current.startsAt.toISOString(), endsAt: input.endsAt ?? current.endsAt.toISOString(),
    };
    this.validateTerms(merged);
    const sameFeaturedProducts = input.productIds === undefined || (
      input.productIds.length === current.products.length
      && input.productIds.every((productId, index) => productId === current.products[index]?.productId)
    );
    const hasCustomerVisibleChange = (
      (input.title !== undefined && input.title !== current.title)
      || (input.summary !== undefined && (input.summary || null) !== current.summary)
      || (input.details !== undefined && (input.details || null) !== current.details)
      || (input.terms !== undefined && input.terms !== current.terms)
      || (input.categoryId !== undefined && input.categoryId !== current.categoryId)
      || (input.offerType !== undefined && input.offerType !== current.offerType)
      || (input.discountBps !== undefined && input.discountBps !== current.discountBps)
      || (input.discountAmountMinor !== undefined && BigInt(input.discountAmountMinor) !== current.discountAmountMinor)
      || (input.currency !== undefined && input.currency !== current.currency)
      || (input.originalPriceMinor !== undefined && BigInt(input.originalPriceMinor) !== current.originalPriceMinor)
      || (input.offerPriceMinor !== undefined && BigInt(input.offerPriceMinor) !== current.offerPriceMinor)
      || (input.startsAt !== undefined && new Date(input.startsAt).getTime() !== current.startsAt.getTime())
      || (input.endsAt !== undefined && new Date(input.endsAt).getTime() !== current.endsAt.getTime())
      || (input.imageReference !== undefined && (input.imageReference || null) !== current.imageReference)
      || !sameFeaturedProducts
    );
    const record = await this.prisma.$transaction(async (tx) => {
      await tx.deal.update({ where: { id: dealId }, data: {
        title: input.title, summary: input.summary === undefined ? undefined : input.summary || null,
        details: input.details === undefined ? undefined : input.details || null, terms: input.terms,
        categoryId, offerType, discountBps: input.discountBps ?? (offerType === current.offerType ? undefined : null),
        discountAmountMinor: input.discountAmountMinor === undefined ? (offerType === current.offerType ? undefined : null) : BigInt(input.discountAmountMinor),
        currency: input.currency ?? (offerType === current.offerType ? undefined : null),
        originalPriceMinor: input.originalPriceMinor === undefined ? undefined : BigInt(input.originalPriceMinor),
        offerPriceMinor: input.offerPriceMinor === undefined ? undefined : BigInt(input.offerPriceMinor),
        startsAt: input.startsAt ? new Date(input.startsAt) : undefined,
        endsAt: input.endsAt ? new Date(input.endsAt) : undefined,
        imageReference: input.imageReference === undefined ? undefined : input.imageReference || null,
        version: { increment: 1 },
      } });
      if (input.productIds) {
        await tx.dealProduct.deleteMany({ where: { dealId } });
        if (input.productIds.length) await tx.dealProduct.createMany({ data: input.productIds.map((productId, displayOrder) => ({ dealId, productId, displayOrder })) });
      }
      const updated = await tx.deal.findUniqueOrThrow({ where: { id: dealId }, include: dealInclude });
      const now = new Date();
      if (hasCustomerVisibleChange && current.status === DealStatus.PUBLISHED && updated.startsAt <= now && updated.endsAt > now) {
        await this.notifications.notifyCustomersWhoSavedDeal(tx, {
          dealId: updated.id,
          dealSlug: updated.slug,
          dealTitle: updated.title,
          storeId: updated.store.id,
          storeName: updated.store.name,
          version: updated.version,
        });
      }
      return updated;
    });
    return this.present(record);
  }

  async publish(user: AuthPrincipal, retailerId: string, dealId: string) {
    await this.requireMembership(user.userId, retailerId, true);
    const current = await this.prisma.deal.findFirst({ where: { id: dealId, store: { retailerId } }, select: { id: true, slug: true, version: true, publishedAt: true, status: true, title: true, terms: true, categoryId: true, startsAt: true, endsAt: true, offerType: true, discountBps: true, discountAmountMinor: true, currency: true, originalPriceMinor: true, offerPriceMinor: true, moderationHoldAt: true, store: { select: { id: true, name: true, status: true, verifiedAt: true, retailer: { select: { status: true } } } } } });
    if (!current) throw new NotFoundException("Offer not found.");
    if (current.status === DealStatus.ENDED) throw new BadRequestException("Ended offers cannot be published.");
    if (current.moderationHoldAt) throw new ConflictException("This offer is on an admin moderation hold and cannot be published.");
    if (current.store.retailer.status !== RetailerStatus.ACTIVE || current.store.status !== StoreStatus.ACTIVE || !current.store.verifiedAt) {
      throw new ConflictException("Your retailer account and store must be approved before publishing offers.");
    }
    if (!current.categoryId) throw new BadRequestException("Choose a category before publishing.");
    if (!current.title.trim() || !current.terms.trim()) throw new BadRequestException("Add an offer title and terms before publishing.");
    this.validateTerms({ offerType: current.offerType, discountBps: current.discountBps ?? undefined, discountAmountMinor: current.discountAmountMinor === null ? undefined : Number(current.discountAmountMinor), currency: current.currency ?? undefined, originalPriceMinor: current.originalPriceMinor === null ? undefined : Number(current.originalPriceMinor), offerPriceMinor: current.offerPriceMinor === null ? undefined : Number(current.offerPriceMinor), startsAt: current.startsAt.toISOString(), endsAt: current.endsAt.toISOString() });
    const now = new Date();
    if (current.endsAt <= now) throw new BadRequestException("The offer expiry must be in the future.");
    const isFirstPublish = current.status !== DealStatus.PUBLISHED;
    const publishedAt = current.publishedAt ?? now;
    const record = await this.prisma.$transaction(async (tx) => {
      const published = await tx.deal.update({
        where: { id: dealId },
        data: {
          status: DealStatus.PUBLISHED,
          publishedAt,
          ...(isFirstPublish ? { version: { increment: 1 } } : {}),
        },
        include: dealInclude,
      });
      if (isFirstPublish) {
        await this.notifications.notifyStoreFollowersOfPublishedDeal(tx, {
          actorUserId: user.userId,
          dealId: published.id,
          dealSlug: published.slug,
          dealTitle: published.title,
          storeId: published.store.id,
          storeName: published.store.name,
          version: published.version,
        });
      }
      return published;
    });
    return this.present(record);
  }

  async pause(user: AuthPrincipal, retailerId: string, dealId: string) {
    await this.requireMembership(user.userId, retailerId, true);
    const result = await this.prisma.deal.updateMany({ where: { id: dealId, store: { retailerId }, status: DealStatus.PUBLISHED }, data: { status: DealStatus.PAUSED } });
    if (!result.count) throw new NotFoundException("Published offer not found.");
    return { id: dealId, status: "paused" };
  }

  async preview(user: AuthPrincipal, retailerId: string, dealId: string) {
    await this.requireMembership(user.userId, retailerId, false);
    const record = await this.findDeal({ id: dealId, store: { retailerId } });
    if (!record) throw new NotFoundException("Offer not found.");
    return this.present(record);
  }

  private async findDeal(where: object) {
    return this.prisma.deal.findFirst({ where, include: dealInclude });
  }

  private async validateCategory(categoryId: string) {
    if (!(await this.prisma.category.findFirst({ where: { id: categoryId, isActive: true }, select: { id: true } }))) throw new BadRequestException("The category is unavailable.");
  }

  private async validateProducts(productIds: string[], retailerId: string) {
    if (!productIds.length) return;
    const count = await this.prisma.product.count({ where: { id: { in: productIds }, retailerId, status: { not: "ARCHIVED" } } });
    if (count !== new Set(productIds).size) throw new BadRequestException("Every selected product must belong to this retailer and be available.");
  }

  private validateTerms(input: { offerType: OfferType; discountBps?: number; discountAmountMinor?: number; currency?: string; originalPriceMinor?: number; offerPriceMinor?: number; startsAt: string; endsAt: string }) {
    const start = new Date(input.startsAt); const end = new Date(input.endsAt);
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start) throw new BadRequestException("The offer end date must be after the start date.");
    if (input.offerType === OfferType.PERCENTAGE && (!input.discountBps || input.discountBps > 10000)) throw new BadRequestException("Percentage offers need a discount from 1% to 100%.");
    if (input.offerType === OfferType.FIXED_AMOUNT && (!input.discountAmountMinor || !input.currency)) throw new BadRequestException("Fixed-amount offers need a discount and currency.");
    if (input.offerType === OfferType.PERCENTAGE && (input.discountAmountMinor !== undefined || input.currency !== undefined)) throw new BadRequestException("Percentage offers cannot include a fixed discount amount or currency.");
    if (input.offerType === OfferType.FIXED_AMOUNT && input.discountBps !== undefined) throw new BadRequestException("Fixed-amount offers cannot include a percentage discount.");
    if (input.offerType !== OfferType.PERCENTAGE && input.offerType !== OfferType.FIXED_AMOUNT && (input.discountBps !== undefined || input.discountAmountMinor !== undefined || input.currency !== undefined)) throw new BadRequestException("This offer type cannot include a numeric discount.");
    if ((input.originalPriceMinor === undefined) !== (input.offerPriceMinor === undefined) || (input.originalPriceMinor !== undefined && (!Number.isSafeInteger(input.originalPriceMinor) || !Number.isSafeInteger(input.offerPriceMinor) || input.offerPriceMinor! >= input.originalPriceMinor))) throw new BadRequestException("Enter both prices and make the offer price lower than the original price.");
  }

  private validateImageReference(value?: string | null) {
    if (!value) return;
    if (value.startsWith("/assets/") && !value.includes("..")) return;
    let parsed: URL;
    try {
      parsed = new URL(value);
    } catch {
      throw new BadRequestException("Offer images must use an HTTPS URL or an approved DealSe asset path.");
    }
    if (parsed.protocol === "https:") return;
    throw new BadRequestException("Offer images must use an HTTPS URL or an approved DealSe asset path.");
  }

  private async requireMembership(userId: string, retailerId: string, write: boolean) {
    const membership = await this.prisma.retailerMembership.findFirst({ where: { retailerId, userId, status: MembershipStatus.ACTIVE }, select: { role: true, retailer: { select: { status: true } } } });
    if (!membership) throw new NotFoundException("Retailer not found.");
    if (write && (!editors.includes(membership.role) || membership.retailer.status === RetailerStatus.CLOSED || membership.retailer.status === RetailerStatus.SUSPENDED)) throw new ForbiddenException("You cannot manage offers for this retailer.");
  }

  private present(record: NonNullable<DealRecord>) {
    const discount = record.offerType === OfferType.PERCENTAGE
      ? `${(record.discountBps ?? 0) / 100}% off`
      : record.offerType === OfferType.FIXED_AMOUNT
        ? `${record.currency === "INR" ? "₹" : record.currency ? `${record.currency} ` : ""}${((record.discountAmountMinor ?? 0n) as bigint) / 100n} off`
        : record.offerType === OfferType.BUY_X_GET_Y ? (record.title.toLowerCase().includes("buy one, get one") ? "Buy 1 Get 1" : "Special bundle") : "Special offer";
    return {
      id: record.id, slug: record.slug, title: record.title, summary: record.summary, description: record.details,
      terms: record.terms, categoryId: record.categoryId, category: record.category,
      offerType: record.offerType.toLowerCase(), discountBps: record.discountBps,
      discountAmountMinor: record.discountAmountMinor?.toString() ?? null, currency: record.currency,
      originalPriceMinor: record.originalPriceMinor?.toString() ?? null, offerPriceMinor: record.offerPriceMinor?.toString() ?? null,
      offer: discount, startsAt: record.startsAt.toISOString(), endsAt: record.endsAt.toISOString(),
      status: record.status.toLowerCase(), publishedAt: record.publishedAt?.toISOString() ?? null,
      images: record.images.map(({ mediaAsset, sortOrder, isPrimary }) => ({ id: mediaAsset.id, url: `/media/${mediaAsset.id}`, altText: mediaAsset.altText ?? record.title, sortOrder, isPrimary, width: mediaAsset.width, height: mediaAsset.height })),
      image: record.imageReference ?? (record.images.find(({ isPrimary }) => isPrimary)?.mediaAsset.id ? `/media/${record.images.find(({ isPrimary }) => isPrimary)!.mediaAsset.id}` : null),
      imageAlt: record.images.find(({ isPrimary }) => isPrimary)?.mediaAsset.altText ?? record.title,
      store: { id: record.store.id, name: record.store.name, slug: record.store.slug, description: record.store.description, phone: record.store.phone, email: record.store.email, addressLine1: record.store.addressLine1, locality: record.store.locality, city: record.store.city, region: record.store.region, countryCode: record.store.countryCode },
      products: record.products.map(({ product }) => {
        const images = product.images.map(({ mediaAsset, sortOrder, isPrimary }) => ({ id: mediaAsset.id, url: `/media/${mediaAsset.id}`, altText: mediaAsset.altText ?? product.name, sortOrder, isPrimary, width: mediaAsset.width, height: mediaAsset.height }));
        const primary = images.find(({ isPrimary }) => isPrimary);
        return { ...product, images, image: primary?.url ?? null, imageAlt: primary?.altText ?? product.name };
      }),
      createdAt: record.createdAt.toISOString(), updatedAt: record.updatedAt.toISOString(),
    };
  }
}

function slugify(value: string) { return value.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 110) || "offer"; }
