import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import sharp from "sharp";
import { createHash, randomUUID } from "node:crypto";
import {
  AccountRole,
  DealStatus,
  MediaProcessingStatus,
  MediaPurpose,
  MembershipRole,
  MembershipStatus,
  ProductStatus,
  RetailerStatus,
  StoreStatus,
} from "../generated/prisma/enums.js";
import type { Prisma } from "../generated/prisma/client.js";
import { PrismaService } from "../database/prisma.service.js";
import type { AuthPrincipal } from "../auth/auth.types.js";
import type { UploadMediaDto } from "./dto/upload-media.dto.js";
import type { UpdateMediaAssociationsDto } from "./dto/update-media-associations.dto.js";
import { MediaStorageService, type MediaStorageLocation } from "./media-storage.service.js";

const maxUploadBytes = 5 * 1024 * 1024;
const maxInputPixels = 40_000_000;
const retailerEditors: MembershipRole[] = [MembershipRole.OWNER, MembershipRole.MANAGER];
const inactiveRetailerStatuses: RetailerStatus[] = [RetailerStatus.CLOSED, RetailerStatus.SUSPENDED];
const publicStoreSelect = {
  retailerId: true,
  status: true,
  verifiedAt: true,
  retailer: { select: { status: true } },
} satisfies Prisma.StoreSelect;
const publicDealSelect = {
  status: true,
  startsAt: true,
  endsAt: true,
  moderationHoldAt: true,
  store: { select: publicStoreSelect },
} satisfies Prisma.DealSelect;
const mediaRemovalInclude = {
  storeImages: { include: { store: { select: { retailerId: true } } } },
  productImages: { include: { product: { select: { retailerId: true } } } },
  dealImages: { include: { deal: { select: { store: { select: { retailerId: true } } } } } },
} satisfies Prisma.MediaAssetInclude;
const mediaReadInclude = {
  storeImages: { include: { store: { select: publicStoreSelect } } },
  productImages: {
    include: {
      product: {
        select: {
          retailerId: true,
          dealProducts: { include: { deal: { select: publicDealSelect } } },
        },
      },
    },
  },
  dealImages: { include: { deal: { select: publicDealSelect } } },
} satisfies Prisma.MediaAssetInclude;

interface UploadedMediaFile {
  buffer: Buffer;
  mimetype: string;
  size: number;
}

@Injectable()
export class MediaService {
  private readonly uploadWindows = new Map<string, { count: number; resetsAt: number }>();

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(MediaStorageService) private readonly storage: MediaStorageService,
  ) {}

  async upload(user: AuthPrincipal, input: UploadMediaDto, file?: UploadedMediaFile) {
    await this.requireRetailerEditor(user.userId, input.retailerId);
    this.enforceUploadRateLimit(user.userId);
    if (input.purpose === MediaPurpose.AVATAR) {
      throw new BadRequestException("Profile image uploads are not available yet.");
    }
    if (!file?.buffer?.length || file.size !== file.buffer.length || file.size > maxUploadBytes) {
      throw new BadRequestException("Choose an image up to 5 MB.");
    }
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.mimetype)) {
      throw new BadRequestException("Use a JPEG, PNG, or WebP image.");
    }

    const target = await this.resolveTarget(input);
    let inputFormat: string | undefined;
    try {
      const inputMetadata = await sharp(file.buffer, { limitInputPixels: maxInputPixels, failOn: "error" }).metadata();
      inputFormat = inputMetadata.format;
      if (inputMetadata.pages && inputMetadata.pages > 1) throw new Error("Animated images are not supported.");
    } catch {
      throw new BadRequestException("This file is not a valid supported image.");
    }
    const expectedFormats: Record<string, string> = { "image/jpeg": "jpeg", "image/png": "png", "image/webp": "webp" };
    const expectedFormat = expectedFormats[file.mimetype];
    if (!expectedFormat || inputFormat !== expectedFormat) {
      throw new BadRequestException("The image file type does not match its contents.");
    }
    let processed: { data: Buffer; info: { width: number; height: number } };
    try {
      processed = await sharp(file.buffer, { limitInputPixels: maxInputPixels, failOn: "error" })
        .rotate()
        .resize({ width: 2000, height: 2000, fit: "inside", withoutEnlargement: true })
        .webp({ quality: 84, effort: 4 })
        .toBuffer({ resolveWithObject: true });
    } catch {
      throw new BadRequestException("This file is not a valid supported image.");
    }
    if (!processed.info.width || !processed.info.height || !processed.data.length || processed.data.length > maxUploadBytes) {
      throw new BadRequestException("This image could not be processed.");
    }

    const checksumSha256 = createHash("sha256").update(processed.data).digest("hex");
    const objectKey = `${input.retailerId}/${input.purpose.toLowerCase()}/${input.uploadId ?? randomUUID()}.webp`;
    const existing = await this.prisma.mediaAsset.findUnique({ where: { objectKey }, include: mediaRemovalInclude });
    if (existing) {
      if (existing.ownerUserId !== user.userId || existing.purpose !== input.purpose || existing.deletedAt !== null || existing.processingStatus !== MediaProcessingStatus.READY || existing.checksumSha256 !== checksumSha256) {
        throw new ConflictException("This upload request identifier has already been used.");
      }
      const association = input.purpose === MediaPurpose.STORE
        ? existing.storeImages.find(({ storeId, store }) => store.retailerId === input.retailerId && storeId === input.targetId)
        : input.purpose === MediaPurpose.PRODUCT
          ? existing.productImages.find(({ productId, product }) => product.retailerId === input.retailerId && productId === input.targetId)
          : input.purpose === MediaPurpose.DEAL
            ? existing.dealImages.find(({ dealId, deal }) => deal.store.retailerId === input.retailerId && dealId === input.targetId)
            : undefined;
      if (!association) throw new ConflictException("This upload request identifier belongs to a different image.");
      return {
        id: existing.id,
        purpose: existing.purpose,
        mimeType: existing.mimeType,
        byteSize: existing.byteSize.toString(),
        width: existing.width,
        height: existing.height,
        checksumSha256: existing.checksumSha256,
        altText: existing.altText,
        url: `/media/${existing.id}`,
        sortOrder: association.sortOrder,
        isPrimary: association.isPrimary,
      };
    }

    let replacedAsset: Prisma.MediaAssetGetPayload<{ include: typeof mediaRemovalInclude }> | null = null;
    let replacedLocation: MediaStorageLocation | null = null;
    if (input.replaceMediaId) {
      replacedAsset = await this.prisma.mediaAsset.findFirst({
        where: { id: input.replaceMediaId, processingStatus: MediaProcessingStatus.READY, deletedAt: null },
        include: mediaRemovalInclude,
      });
      if (!replacedAsset || replacedAsset.purpose !== input.purpose) throw new NotFoundException("Image not found.");
      const targetAssociation = input.purpose === MediaPurpose.STORE
        ? replacedAsset.storeImages.find(({ storeId, store }) => storeId === input.targetId && store.retailerId === input.retailerId)
        : input.purpose === MediaPurpose.PRODUCT
          ? replacedAsset.productImages.find(({ productId, product }) => productId === input.targetId && product.retailerId === input.retailerId)
          : input.purpose === MediaPurpose.DEAL
            ? replacedAsset.dealImages.find(({ dealId, deal }) => dealId === input.targetId && deal.store.retailerId === input.retailerId)
            : undefined;
      const relatedRetailerIds = [
        ...replacedAsset.storeImages.map(({ store }) => store.retailerId),
        ...replacedAsset.productImages.map(({ product }) => product.retailerId),
        ...replacedAsset.dealImages.map(({ deal }) => deal.store.retailerId),
      ];
      if (!targetAssociation || relatedRetailerIds.length !== 1 || relatedRetailerIds[0] !== input.retailerId) {
        throw new NotFoundException("Image not found.");
      }
      replacedLocation = this.storageLocation(replacedAsset.storageProvider, replacedAsset.bucket, replacedAsset.objectKey);
    }
    const stored = await this.storage.put(objectKey, processed.data);
    const altText = input.altText?.trim() || target.name;

    try {
      const media = await this.prisma.$transaction(async (tx) => {
        const created = await tx.mediaAsset.create({
          data: {
            ownerUserId: user.userId,
            storageProvider: stored.provider,
            bucket: stored.bucket,
            objectKey: stored.objectKey,
            purpose: input.purpose,
            mimeType: "image/webp",
            byteSize: BigInt(processed.data.length),
            width: processed.info.width,
            height: processed.info.height,
            checksumSha256,
            processingStatus: MediaProcessingStatus.READY,
            altText: altText.slice(0, 500),
            readyAt: new Date(),
          },
          select: { id: true, purpose: true, mimeType: true, byteSize: true, width: true, height: true, checksumSha256: true, altText: true },
        });
        if (replacedAsset) {
          if (input.purpose === MediaPurpose.STORE) await tx.storeImage.delete({ where: { storeId_mediaAssetId: { storeId: input.targetId, mediaAssetId: replacedAsset.id } } });
          else if (input.purpose === MediaPurpose.PRODUCT) await tx.productImage.delete({ where: { productId_mediaAssetId: { productId: input.targetId, mediaAssetId: replacedAsset.id } } });
          else await tx.dealImage.delete({ where: { dealId_mediaAssetId: { dealId: input.targetId, mediaAssetId: replacedAsset.id } } });
          await tx.mediaAsset.update({ where: { id: replacedAsset.id }, data: { processingStatus: MediaProcessingStatus.DELETED, deletedAt: new Date() } });
        }
        const sortOrder = await this.attachPrimary(tx, input.purpose, input.targetId, created.id);
        return { ...created, sortOrder, isPrimary: true, replacedMediaId: replacedAsset?.id ?? null };
      });
      if (replacedLocation) {
        try {
          await this.storage.remove(replacedLocation);
        } catch {
          // The replaced object is marked deleted and cannot be read; storage cleanup may be retried operationally.
        }
      }
      return {
        ...media,
        byteSize: media.byteSize.toString(),
        url: `/media/${media.id}`,
        sortOrder: media.sortOrder,
        isPrimary: media.isPrimary,
        replacedMediaId: media.replacedMediaId,
      };
    } catch (error) {
      try {
        await this.storage.remove(stored);
      } catch {
        // The unreferenced object is not readable through the media API; cleanup can be retried operationally.
      }
      throw error;
    }
  }

  async updateAssociations(user: AuthPrincipal, input: UpdateMediaAssociationsDto) {
    await this.requireRetailerEditor(user.userId, input.retailerId);
    await this.resolveTarget(input);
    if (input.mediaIds.length < 1 || input.mediaIds.length > 20) {
      throw new BadRequestException("Keep between 1 and 20 images in a gallery.");
    }
    if (!input.mediaIds.includes(input.primaryMediaId)) {
      throw new BadRequestException("Choose a primary image from this gallery.");
    }

    const targetId = input.targetId;
    const current = input.purpose === MediaPurpose.STORE
      ? await this.prisma.storeImage.findMany({ where: { storeId: targetId }, select: { mediaAssetId: true, mediaAsset: { select: { processingStatus: true, deletedAt: true, purpose: true } } } })
      : input.purpose === MediaPurpose.PRODUCT
        ? await this.prisma.productImage.findMany({ where: { productId: targetId }, select: { mediaAssetId: true, mediaAsset: { select: { processingStatus: true, deletedAt: true, purpose: true } } } })
        : input.purpose === MediaPurpose.DEAL
          ? await this.prisma.dealImage.findMany({ where: { dealId: targetId }, select: { mediaAssetId: true, mediaAsset: { select: { processingStatus: true, deletedAt: true, purpose: true } } } })
          : [];

    const currentIds = new Set(current.map((item) => item.mediaAssetId));
    const sameSet = currentIds.size === input.mediaIds.length && input.mediaIds.every((id) => currentIds.has(id));
    if (!sameSet || current.some((item) => item.mediaAsset.processingStatus !== MediaProcessingStatus.READY || item.mediaAsset.deletedAt !== null || item.mediaAsset.purpose !== input.purpose)) {
      throw new NotFoundException("Image gallery not found.");
    }

    await this.prisma.$transaction(async (tx) => {
      for (const [index, mediaAssetId] of input.mediaIds.entries()) {
        // Gallery sort_order is a nonnegative SMALLINT. Stage updates in a high,
        // reserved positive band so the unique target/order constraint stays safe.
        const temporaryOrder = 32000 + index;
        if (input.purpose === MediaPurpose.STORE) {
          await tx.storeImage.update({ where: { storeId_mediaAssetId: { storeId: targetId, mediaAssetId } }, data: { sortOrder: temporaryOrder, isPrimary: false } });
        } else if (input.purpose === MediaPurpose.PRODUCT) {
          await tx.productImage.update({ where: { productId_mediaAssetId: { productId: targetId, mediaAssetId } }, data: { sortOrder: temporaryOrder, isPrimary: false } });
        } else {
          await tx.dealImage.update({ where: { dealId_mediaAssetId: { dealId: targetId, mediaAssetId } }, data: { sortOrder: temporaryOrder, isPrimary: false } });
        }
      }
      for (const [sortOrder, mediaAssetId] of input.mediaIds.entries()) {
        const data = { sortOrder, isPrimary: mediaAssetId === input.primaryMediaId };
        if (input.purpose === MediaPurpose.STORE) {
          await tx.storeImage.update({ where: { storeId_mediaAssetId: { storeId: targetId, mediaAssetId } }, data });
        } else if (input.purpose === MediaPurpose.PRODUCT) {
          await tx.productImage.update({ where: { productId_mediaAssetId: { productId: targetId, mediaAssetId } }, data });
        } else {
          await tx.dealImage.update({ where: { dealId_mediaAssetId: { dealId: targetId, mediaAssetId } }, data });
        }
      }
    });

    return this.listAssociations(input.purpose, targetId);
  }

  private async listAssociations(purpose: MediaPurpose, targetId: string) {
    const rows = purpose === MediaPurpose.STORE
      ? await this.prisma.storeImage.findMany({ where: { storeId: targetId }, orderBy: { sortOrder: "asc" }, include: { mediaAsset: { select: { id: true, purpose: true, mimeType: true, byteSize: true, width: true, height: true, altText: true } } } })
      : purpose === MediaPurpose.PRODUCT
        ? await this.prisma.productImage.findMany({ where: { productId: targetId }, orderBy: { sortOrder: "asc" }, include: { mediaAsset: { select: { id: true, purpose: true, mimeType: true, byteSize: true, width: true, height: true, altText: true } } } })
        : await this.prisma.dealImage.findMany({ where: { dealId: targetId }, orderBy: { sortOrder: "asc" }, include: { mediaAsset: { select: { id: true, purpose: true, mimeType: true, byteSize: true, width: true, height: true, altText: true } } } });
    return rows.map(({ mediaAsset, sortOrder, isPrimary }) => ({
      ...mediaAsset,
      byteSize: mediaAsset.byteSize.toString(),
      url: `/media/${mediaAsset.id}`,
      sortOrder,
      isPrimary,
    }));
  }

  async remove(user: AuthPrincipal, retailerId: string, mediaId: string) {
    await this.requireRetailerEditor(user.userId, retailerId);
    const media = await this.prisma.mediaAsset.findFirst({
      where: { id: mediaId, processingStatus: MediaProcessingStatus.READY, deletedAt: null },
      include: mediaRemovalInclude,
    });
    if (!media) throw new NotFoundException("Image not found.");
    const retailerIds = [
      ...media.storeImages.map(({ store }) => store.retailerId),
      ...media.productImages.map(({ product }) => product.retailerId),
      ...media.dealImages.map(({ deal }) => deal.store.retailerId),
    ];
    if (!retailerIds.includes(retailerId) || retailerIds.some((id) => id !== retailerId)) {
      throw new NotFoundException("Image not found.");
    }
    if (retailerIds.length !== 1) throw new ConflictException("This image is linked to more than one record and cannot be removed here.");

    const stored = this.storageLocation(media.storageProvider, media.bucket, media.objectKey);
    await this.prisma.$transaction(async (tx) => {
      await tx.storeImage.deleteMany({ where: { mediaAssetId: mediaId } });
      await tx.productImage.deleteMany({ where: { mediaAssetId: mediaId } });
      await tx.dealImage.deleteMany({ where: { mediaAssetId: mediaId } });
      await tx.mediaAsset.update({ where: { id: mediaId }, data: { processingStatus: MediaProcessingStatus.DELETED, deletedAt: new Date() } });
    });
    try {
      await this.storage.remove(stored);
    } catch {
      // Deleted assets are inaccessible even if the storage provider is temporarily unavailable.
    }
    return { id: mediaId, deleted: true };
  }

  async readContent(mediaId: string, user?: AuthPrincipal) {
    const media = await this.prisma.mediaAsset.findFirst({
      where: { id: mediaId, processingStatus: MediaProcessingStatus.READY, deletedAt: null },
      include: mediaReadInclude,
    });
    if (!media) throw new NotFoundException("Image not found.");

    const now = new Date();
    const publicStoreImage = media.storeImages.some(({ store }) => this.storeIsPublic(store));
    const publicDealImage = media.dealImages.some(({ deal }) => this.dealIsPublic(deal, now));
    const publicProductImage = media.productImages.some(({ product }) => product.dealProducts.some(({ deal }) => this.dealIsPublic(deal, now)));
    const isPublic = publicStoreImage || publicDealImage || publicProductImage;

    if (!isPublic) {
      if (!user?.roles.includes(AccountRole.RETAILER)) throw new NotFoundException("Image not found.");
      const relatedRetailerIds = [
        ...media.storeImages.map(({ store }) => store.retailerId),
        ...media.productImages.map(({ product }) => product.retailerId),
        ...media.dealImages.map(({ deal }) => deal.store.retailerId),
      ];
      const membership = relatedRetailerIds.length
        ? await this.prisma.retailerMembership.findFirst({
            where: { userId: user.userId, retailerId: { in: relatedRetailerIds }, status: MembershipStatus.ACTIVE },
            select: { retailerId: true },
          })
        : null;
      if (!membership) throw new NotFoundException("Image not found.");
    }

    const location = this.storageLocation(media.storageProvider, media.bucket, media.objectKey);
    const bytes = await this.storage.get(location);
    return { bytes, mimeType: media.mimeType, checksumSha256: media.checksumSha256 ?? createHash("sha256").update(bytes).digest("hex"), isPublic };
  }

  private async resolveTarget(input: UploadMediaDto): Promise<{ name: string }> {
    if (input.purpose === MediaPurpose.STORE) {
      const target = await this.prisma.store.findFirst({ where: { id: input.targetId, retailerId: input.retailerId }, select: { name: true } });
      if (target) return target;
    } else if (input.purpose === MediaPurpose.PRODUCT) {
      const target = await this.prisma.product.findFirst({ where: { id: input.targetId, retailerId: input.retailerId, status: { not: ProductStatus.ARCHIVED } }, select: { name: true } });
      if (target) return target;
    } else if (input.purpose === MediaPurpose.DEAL) {
      const target = await this.prisma.deal.findFirst({ where: { id: input.targetId, store: { retailerId: input.retailerId }, status: { not: DealStatus.ENDED }, moderationHoldAt: null }, select: { title: true } });
      if (target) return { name: target.title };
    }
    throw new NotFoundException("The selected store, product, or offer is not available to this retailer.");
  }

  private async attachPrimary(
    tx: Prisma.TransactionClient,
    purpose: MediaPurpose,
    targetId: string,
    mediaAssetId: string,
  ): Promise<number> {
    if (purpose === MediaPurpose.STORE) {
      const rows = await tx.storeImage.findMany({ where: { storeId: targetId }, select: { sortOrder: true } });
      if (rows.length >= 20) throw new BadRequestException("A gallery can contain up to 20 images.");
      const sortOrder = rows.reduce((maximum, row) => Math.max(maximum, row.sortOrder), -1) + 1;
      await tx.storeImage.updateMany({ where: { storeId: targetId, isPrimary: true }, data: { isPrimary: false } });
      await tx.storeImage.create({ data: { storeId: targetId, mediaAssetId, sortOrder, isPrimary: true } });
      return sortOrder;
    } else if (purpose === MediaPurpose.PRODUCT) {
      const rows = await tx.productImage.findMany({ where: { productId: targetId }, select: { sortOrder: true } });
      if (rows.length >= 20) throw new BadRequestException("A gallery can contain up to 20 images.");
      const sortOrder = rows.reduce((maximum, row) => Math.max(maximum, row.sortOrder), -1) + 1;
      await tx.productImage.updateMany({ where: { productId: targetId, isPrimary: true }, data: { isPrimary: false } });
      await tx.productImage.create({ data: { productId: targetId, mediaAssetId, sortOrder, isPrimary: true } });
      return sortOrder;
    } else {
      const rows = await tx.dealImage.findMany({ where: { dealId: targetId }, select: { sortOrder: true } });
      if (rows.length >= 20) throw new BadRequestException("A gallery can contain up to 20 images.");
      const sortOrder = rows.reduce((maximum, row) => Math.max(maximum, row.sortOrder), -1) + 1;
      await tx.dealImage.updateMany({ where: { dealId: targetId, isPrimary: true }, data: { isPrimary: false } });
      await tx.dealImage.create({ data: { dealId: targetId, mediaAssetId, sortOrder, isPrimary: true } });
      return sortOrder;
    }
  }

  private async requireRetailerEditor(userId: string, retailerId: string) {
    const membership = await this.prisma.retailerMembership.findFirst({
      where: { userId, retailerId, status: MembershipStatus.ACTIVE },
      select: { role: true, retailer: { select: { status: true } } },
    });
    if (!membership) throw new NotFoundException("Retailer not found.");
    if (!retailerEditors.includes(membership.role) || inactiveRetailerStatuses.includes(membership.retailer.status)) {
      throw new ForbiddenException("You cannot manage images for this retailer.");
    }
  }

  private enforceUploadRateLimit(userId: string) {
    const now = Date.now();
    if (this.uploadWindows.size > 1000) {
      for (const [key, value] of this.uploadWindows) if (value.resetsAt <= now) this.uploadWindows.delete(key);
    }
    const window = this.uploadWindows.get(userId);
    if (!window || window.resetsAt <= now) {
      this.uploadWindows.set(userId, { count: 1, resetsAt: now + 60_000 });
      return;
    }
    if (window.count >= 20) throw new HttpException("Too many images uploaded. Try again in a minute.", 429);
    window.count += 1;
  }

  private storageLocation(provider: string, bucket: string, objectKey: string): MediaStorageLocation {
    if (provider !== "local" && provider !== "supabase") {
      throw new ConflictException("This image uses an unsupported storage provider.");
    }
    return { provider, bucket, objectKey };
  }

  private storeIsPublic(store: { status: StoreStatus; verifiedAt: Date | null; retailer: { status: RetailerStatus } }) {
    return store.status === StoreStatus.ACTIVE && store.verifiedAt !== null && store.retailer.status === RetailerStatus.ACTIVE;
  }

  private dealIsPublic(
    deal: { status: DealStatus; startsAt: Date; endsAt: Date; moderationHoldAt: Date | null; store: { status: StoreStatus; verifiedAt: Date | null; retailer: { status: RetailerStatus } } },
    now: Date,
  ) {
    return deal.status === DealStatus.PUBLISHED && deal.startsAt <= now && deal.endsAt > now && deal.moderationHoldAt === null && this.storeIsPublic(deal.store);
  }
}
