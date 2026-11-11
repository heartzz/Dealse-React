import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  MembershipRole,
  MembershipStatus,
  AccountRole,
  RetailerStatus,
  StoreStatus,
  MediaProcessingStatus,
} from "../generated/prisma/enums.js";
import { Prisma } from "../generated/prisma/client.js";
import { PrismaService } from "../database/prisma.service.js";
import type { AuthPrincipal } from "../auth/auth.types.js";
import type { CreateRetailerDto } from "./dto/create-retailer.dto.js";
import type { CreateStoreDto } from "./dto/create-store.dto.js";
import type { UpdateStoreDto } from "./dto/update-store.dto.js";

const storeEditorRoles = [MembershipRole.OWNER, MembershipRole.MANAGER];

@Injectable()
export class RetailersService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async createRetailer(user: AuthPrincipal, input: CreateRetailerDto) {
    return this.prisma.$transaction(async (transaction) => {
      const retailer = await transaction.retailer.create({
        data: {
          displayName: input.displayName,
          legalName: input.legalName || null,
          status: RetailerStatus.PENDING,
          createdByUserId: user.userId,
        },
        select: {
          id: true,
          displayName: true,
          legalName: true,
          status: true,
          createdAt: true,
        },
      });

      await transaction.retailerMembership.create({
        data: {
          retailerId: retailer.id,
          userId: user.userId,
          role: MembershipRole.OWNER,
          status: MembershipStatus.ACTIVE,
        },
      });

      await transaction.userAccountRole.upsert({
        where: {
          userId_role: { userId: user.userId, role: AccountRole.RETAILER },
        },
        create: { userId: user.userId, role: AccountRole.RETAILER },
        update: {},
      });

      return retailer;
    });
  }

  async listMyRetailers(user: AuthPrincipal) {
    const memberships = await this.prisma.retailerMembership.findMany({
      where: { userId: user.userId, status: MembershipStatus.ACTIVE },
      orderBy: { createdAt: "desc" },
      select: {
        role: true,
        retailer: {
          select: {
            id: true,
            displayName: true,
            legalName: true,
            status: true,
            createdAt: true,
          },
        },
      },
    });

    return memberships.map(({ role, retailer }) => ({
      ...retailer,
      role: role.toLowerCase(),
    }));
  }

  async createStore(
    user: AuthPrincipal,
    retailerId: string,
    input: CreateStoreDto,
  ) {
    await this.requireMembership(user.userId, retailerId, storeEditorRoles, true);
    this.validateLocation(input.latitude, input.longitude);
    this.validateTimezone(input.timezone);

    if (input.categoryId) {
      const category = await this.prisma.category.findFirst({
        where: { id: input.categoryId, isActive: true },
        select: { id: true },
      });
      if (!category) throw new BadRequestException("The category is unavailable.");
    }

    try {
      return await this.prisma.$transaction(async (transaction) => {
        const store = await transaction.store.create({
          data: {
            retailerId,
            categoryId: input.categoryId ?? null,
            slug: input.slug,
            name: input.name,
            description: input.description || null,
            phone: input.phone || null,
            email: input.email || null,
            addressLine1: input.addressLine1 || null,
            addressLine2: input.addressLine2 || null,
            locality: input.locality || null,
            city: input.city,
            region: input.region,
            postalCode: input.postalCode || null,
            countryCode: input.countryCode,
            timezone: input.timezone,
            status: StoreStatus.DRAFT,
          },
          select: {
            id: true,
            retailerId: true,
            categoryId: true,
            slug: true,
            name: true,
            description: true,
            city: true,
            region: true,
            countryCode: true,
            timezone: true,
            status: true,
            createdAt: true,
          },
        });

        if (input.latitude !== undefined && input.longitude !== undefined) {
          await transaction.$executeRaw`
            UPDATE "stores"
            SET "location" = ST_SetSRID(
              ST_MakePoint(${input.longitude}, ${input.latitude}), 4326
            )::geography
            WHERE "id" = ${store.id}::uuid
          `;
        }

        return {
          ...store,
          latitude: input.latitude ?? null,
          longitude: input.longitude ?? null,
        };
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw new ConflictException("A store with this slug already exists for the retailer.");
      }
      throw error;
    }
  }

  async listStores(user: AuthPrincipal, retailerId: string) {
    await this.requireMembership(user.userId, retailerId);

    const stores = await this.prisma.$queryRaw<Array<{
      id: string;
      retailerId: string;
      categoryId: string | null;
      slug: string;
      name: string;
      city: string;
      region: string;
      countryCode: string;
      timezone: string;
      status: string;
      createdAt: Date;
      description: string | null;
      addressLine1: string | null;
      locality: string | null;
      image: string | null;
      imageAlt: string | null;
      latitude: number | null;
      longitude: number | null;
    }>>`
      SELECT
        "id"::text AS "id",
        "retailer_id"::text AS "retailerId",
        "category_id"::text AS "categoryId",
        "slug",
        "name",
        "description",
        "address_line1" AS "addressLine1",
        "locality",
        CASE WHEN media."media_asset_id" IS NULL THEN NULL ELSE '/media/' || media."media_asset_id"::text END AS "image",
        media."alt_text" AS "imageAlt",
        "city",
        "region",
        "country_code" AS "countryCode",
        "timezone",
        "status"::text AS "status",
        "created_at" AS "createdAt",
        ST_Y("location"::geometry) AS "latitude",
        ST_X("location"::geometry) AS "longitude"
      FROM "stores"
      LEFT JOIN LATERAL (
        SELECT si."media_asset_id", ma."alt_text"
        FROM "store_images" si
        JOIN "media_assets" ma ON ma."id" = si."media_asset_id"
        WHERE si."store_id" = "stores"."id"
          AND si."is_primary" = TRUE
          AND ma."processing_status" = 'ready'
          AND ma."deleted_at" IS NULL
        ORDER BY si."sort_order" ASC
        LIMIT 1
      ) media ON TRUE
      WHERE "retailer_id" = ${retailerId}::uuid
      ORDER BY "created_at" DESC, "id" ASC
    `;
    if (!stores.length) return [];
    const imageRows = await this.prisma.storeImage.findMany({
      where: { storeId: { in: stores.map(({ id }) => id) }, mediaAsset: { is: { processingStatus: MediaProcessingStatus.READY, deletedAt: null } } },
      orderBy: [{ storeId: "asc" }, { sortOrder: "asc" }],
      include: { mediaAsset: { select: { id: true, altText: true, width: true, height: true } } },
    });
    const imagesByStore = new Map<string, Array<{ id: string; url: string; altText: string; sortOrder: number; isPrimary: boolean; width: number | null; height: number | null }>>();
    for (const image of imageRows) {
      const items = imagesByStore.get(image.storeId) ?? [];
      items.push({ id: image.mediaAsset.id, url: `/media/${image.mediaAsset.id}`, altText: image.mediaAsset.altText ?? "Store image", sortOrder: image.sortOrder, isPrimary: image.isPrimary, width: image.mediaAsset.width, height: image.mediaAsset.height });
      imagesByStore.set(image.storeId, items);
    }
    return stores.map((item) => {
      const images = imagesByStore.get(item.id) ?? [];
      const primary = images.find(({ isPrimary }) => isPrimary);
      return { ...item, images, image: primary?.url ?? null, imageAlt: primary?.altText ?? item.name };
    });
  }

  async updateStore(user: AuthPrincipal, retailerId: string, storeId: string, input: UpdateStoreDto) {
    await this.requireMembership(user.userId, retailerId, storeEditorRoles, true);
    const existing = await this.prisma.store.findFirst({ where: { id: storeId, retailerId }, select: { id: true } });
    if (!existing) throw new NotFoundException("Store not found.");
    if (input.categoryId) {
      const category = await this.prisma.category.findFirst({ where: { id: input.categoryId, isActive: true }, select: { id: true } });
      if (!category) throw new BadRequestException("The category is unavailable.");
    }
    const data = Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));
    if (typeof data.slug === "string") data.slug = data.slug.trim().toLowerCase();
    if (typeof data.timezone === "string") this.validateTimezone(data.timezone);
    if ((data.latitude === undefined) !== (data.longitude === undefined) && (data.latitude !== undefined || data.longitude !== undefined)) {
      throw new BadRequestException("Latitude and longitude must be updated together.");
    }
    const { latitude, longitude, ...storeData } = data as typeof data & { latitude?: number; longitude?: number };
    try {
      return await this.prisma.$transaction(async (transaction) => {
        const store = await transaction.store.update({
          where: { id: storeId },
          data: storeData,
          select: { id: true, retailerId: true, categoryId: true, slug: true, name: true, description: true, city: true, region: true, countryCode: true, timezone: true, status: true, createdAt: true },
        });
        if (latitude !== undefined && longitude !== undefined) {
          await transaction.$executeRaw`UPDATE "stores" SET "location" = ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326)::geography WHERE "id" = ${storeId}::uuid`;
        }
        return { ...store, latitude: latitude ?? null, longitude: longitude ?? null };
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new ConflictException("A store with this slug already exists for the retailer.");
      throw error;
    }
  }

  private async requireMembership(
    userId: string,
    retailerId: string,
    permittedRoles?: MembershipRole[],
    write = false,
  ): Promise<void> {
    const membership = await this.prisma.retailerMembership.findFirst({
      where: {
        retailerId,
        userId,
        status: MembershipStatus.ACTIVE,
      },
      select: { role: true, retailer: { select: { status: true } } },
    });

    if (!membership) throw new NotFoundException("Retailer not found.");
    if (
      write &&
      (membership.retailer.status === RetailerStatus.SUSPENDED ||
        membership.retailer.status === RetailerStatus.CLOSED)
    ) {
      throw new ForbiddenException("This retailer cannot be changed.");
    }
    if (permittedRoles && !permittedRoles.includes(membership.role)) {
      throw new ForbiddenException("You cannot manage stores for this retailer.");
    }
  }

  private validateLocation(latitude?: number, longitude?: number): void {
    if ((latitude === undefined) !== (longitude === undefined)) {
      throw new BadRequestException("Latitude and longitude must be provided together.");
    }
  }

  private validateTimezone(timezone: string): void {
    try {
      new Intl.DateTimeFormat("en", { timeZone: timezone }).format();
    } catch {
      throw new BadRequestException("The store timezone must be a valid IANA timezone.");
    }
  }
}
