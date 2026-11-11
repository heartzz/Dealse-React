import "reflect-metadata";
import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { after, before, test } from "node:test";
import sharp from "sharp";
import { AccountRole, DealStatus, MediaPurpose, OfferType, RetailerStatus, StoreStatus } from "../generated/prisma/enums.js";
import { PrismaService } from "../database/prisma.service.js";
import { AuthService } from "../auth/auth.service.js";
import type { AuthPrincipal } from "../auth/auth.types.js";
import { RetailersService } from "../retailers/retailers.service.js";
import { DealsService } from "../deals/deals.service.js";
import { NotificationsService } from "../notifications/notifications.service.js";
import { MediaService } from "./media.service.js";
import { MediaStorageService } from "./media-storage.service.js";

const prisma = new PrismaService();
const auth = new AuthService(prisma);
const retailers = new RetailersService(prisma);
const media = new MediaService(prisma, new MediaStorageService());
const suffix = randomUUID();
const users: string[] = [];
const retailerIds: string[] = [];
const storeIds: string[] = [];
const productIds: string[] = [];
const dealIds: string[] = [];
let owner!: AuthPrincipal;
let other!: AuthPrincipal;
let retailerId = "";
let otherRetailerId = "";
let storeId = "";
let otherStoreId = "";
let categoryId = "";
const uploadedMediaIds: string[] = [];

before(async () => {
  process.env.MEDIA_STORAGE_PROVIDER = "local";
  process.env.MEDIA_LOCAL_DIRECTORY = resolve(process.cwd(), ".local-media", `integration-${suffix}`);
  await prisma.$connect();
  owner = await auth.resolveIdentity({ providerId: "media-test", subject: `owner-${suffix}`, email: `media-owner-${suffix}@example.invalid`, emailVerified: true });
  other = await auth.resolveIdentity({ providerId: "media-test", subject: `other-${suffix}`, email: `media-other-${suffix}@example.invalid`, emailVerified: true });
  users.push(owner.userId, other.userId);
  const firstRetailer = await retailers.createRetailer(owner, { displayName: `Media test ${suffix.slice(0, 8)}` });
  const secondRetailer = await retailers.createRetailer(other, { displayName: `Other media ${suffix.slice(0, 8)}` });
  retailerId = firstRetailer.id;
  otherRetailerId = secondRetailer.id;
  retailerIds.push(retailerId, otherRetailerId);
  categoryId = (await prisma.category.create({ data: { slug: `media-test-${suffix.slice(0, 8)}`, name: `Media Test ${suffix.slice(0, 8)}` } })).id;
  const firstStore = await retailers.createStore(owner, retailerId, {
    slug: `media-${suffix.slice(0, 8)}`, name: "Media Test Store", categoryId, city: "Ahmedabad", region: "Gujarat", countryCode: "IN", timezone: "Asia/Kolkata", latitude: 23.0225, longitude: 72.5714,
  });
  const secondStore = await retailers.createStore(other, otherRetailerId, {
    slug: `media-other-${suffix.slice(0, 8)}`, name: "Other Media Store", categoryId, city: "Ahmedabad", region: "Gujarat", countryCode: "IN", timezone: "Asia/Kolkata",
  });
  storeId = firstStore.id;
  otherStoreId = secondStore.id;
  storeIds.push(storeId, otherStoreId);
  owner = { ...owner, roles: [...new Set([...owner.roles, AccountRole.RETAILER])] };
  other = { ...other, roles: [...new Set([...other.roles, AccountRole.RETAILER])] };
});

after(async () => {
  for (const mediaId of uploadedMediaIds) {
    try { await media.remove(owner, retailerId, mediaId); } catch { /* cleanup below removes the test rows */ }
  }
  if (retailerIds.length) {
    await prisma.$transaction(async (tx) => {
      await tx.storeImage.deleteMany({ where: { storeId: { in: storeIds } } });
      await tx.productImage.deleteMany({ where: { productId: { in: productIds } } });
      await tx.dealImage.deleteMany({ where: { dealId: { in: dealIds } } });
      await tx.dealProduct.deleteMany({ where: { dealId: { in: dealIds } } });
      await tx.mediaAsset.deleteMany({ where: { ownerUserId: { in: users } } });
      await tx.deal.deleteMany({ where: { id: { in: dealIds } } });
      await tx.product.deleteMany({ where: { id: { in: productIds } } });
      await tx.store.deleteMany({ where: { id: { in: storeIds } } });
      await tx.retailerMembership.deleteMany({ where: { retailerId: { in: retailerIds } } });
      await tx.retailer.deleteMany({ where: { id: { in: retailerIds } } });
      await tx.category.deleteMany({ where: { id: categoryId } });
      await tx.userAccountRole.deleteMany({ where: { userId: { in: users } } });
      await tx.userProfile.deleteMany({ where: { userId: { in: users } } });
      await tx.user.deleteMany({ where: { id: { in: users } } });
    });
  }
  await prisma.$disconnect();
});

test("media uploads validate, retry safely, persist store/product/deal galleries, and enforce tenant and public visibility", async () => {
  const png = await sharp({ create: { width: 32, height: 24, channels: 3, background: { r: 0, g: 128, b: 120 } } }).png().toBuffer();
  const uploadId = randomUUID();
  const uploaded = await media.upload(owner, {
    retailerId, targetId: storeId, purpose: MediaPurpose.STORE, altText: "Local store exterior", uploadId,
  }, { buffer: png, mimetype: "image/png", size: png.length });
  uploadedMediaIds.push(uploaded.id);

  assert.equal(uploaded.mimeType, "image/webp");
  assert.equal(uploaded.url, `/media/${uploaded.id}`);
  assert.ok(Number(uploaded.byteSize) > 0);
  assert.ok(uploaded.width && uploaded.height);
  assert.equal(await prisma.storeImage.count({ where: { storeId, mediaAssetId: uploaded.id, isPrimary: true } }), 1);

  const retried = await media.upload(owner, {
    retailerId, targetId: storeId, purpose: MediaPurpose.STORE, altText: "Local store exterior", uploadId,
  }, { buffer: png, mimetype: "image/png", size: png.length });
  assert.equal(retried.id, uploaded.id);
  assert.equal(await prisma.storeImage.count({ where: { storeId, mediaAssetId: uploaded.id } }), 1);
  const differentImage = await sharp({ create: { width: 32, height: 24, channels: 3, background: { r: 200, g: 10, b: 30 } } }).png().toBuffer();
  await assert.rejects(() => media.upload(owner, {
    retailerId, targetId: storeId, purpose: MediaPurpose.STORE, uploadId,
  }, { buffer: differentImage, mimetype: "image/png", size: differentImage.length }));

  const privateImage = await media.readContent(uploaded.id, owner);
  assert.equal(privateImage.mimeType, "image/webp");
  assert.ok(privateImage.bytes.length > 0);
  await assert.rejects(() => media.readContent(uploaded.id));
  await assert.rejects(() => media.readContent(uploaded.id, other));
  await assert.rejects(() => media.upload(owner, {
    retailerId, targetId: otherStoreId, purpose: MediaPurpose.STORE,
  }, { buffer: png, mimetype: "image/png", size: png.length }));
  await assert.rejects(() => media.upload(owner, {
    retailerId, targetId: storeId, purpose: MediaPurpose.STORE,
  }, { buffer: png, mimetype: "image/jpeg", size: png.length }));
  const oversized = Buffer.alloc(5 * 1024 * 1024 + 1);
  await assert.rejects(() => media.upload(owner, {
    retailerId, targetId: storeId, purpose: MediaPurpose.STORE,
  }, { buffer: oversized, mimetype: "image/png", size: oversized.length }));
  const corrupt = Buffer.from("not an image");
  await assert.rejects(() => media.upload(owner, {
    retailerId, targetId: storeId, purpose: MediaPurpose.STORE,
  }, { buffer: corrupt, mimetype: "image/png", size: corrupt.length }));

  const second = await media.upload(owner, {
    retailerId, targetId: storeId, purpose: MediaPurpose.STORE, altText: "Store interior", uploadId: randomUUID(),
  }, { buffer: png, mimetype: "image/png", size: png.length });
  uploadedMediaIds.push(second.id);
  const reordered = await media.updateAssociations(owner, {
    retailerId, targetId: storeId, purpose: MediaPurpose.STORE,
    mediaIds: [second.id, uploaded.id], primaryMediaId: second.id,
  });
  assert.deepEqual(reordered.map(({ id }) => id), [second.id, uploaded.id]);
  assert.equal(reordered[0]?.isPrimary, true);
  const persistedGallery = await prisma.storeImage.findMany({ where: { storeId }, orderBy: { sortOrder: "asc" } });
  assert.deepEqual(persistedGallery.map(({ mediaAssetId }) => mediaAssetId), [second.id, uploaded.id]);

  await assert.rejects(() => media.updateAssociations(other, {
    retailerId: otherRetailerId, targetId: storeId, purpose: MediaPurpose.STORE,
    mediaIds: [uploaded.id, second.id], primaryMediaId: uploaded.id,
  }));
  await assert.rejects(() => media.remove(other, otherRetailerId, uploaded.id));

  const replacement = await media.upload(owner, {
    retailerId, targetId: storeId, purpose: MediaPurpose.STORE, altText: "Updated store image", uploadId: randomUUID(), replaceMediaId: second.id,
  }, { buffer: png, mimetype: "image/png", size: png.length });
  uploadedMediaIds.push(replacement.id);
  assert.equal(await prisma.storeImage.count({ where: { storeId, isPrimary: true } }), 1);
  assert.equal(await prisma.storeImage.count({ where: { storeId, mediaAssetId: second.id } }), 0);
  assert.equal((await prisma.mediaAsset.findUniqueOrThrow({ where: { id: second.id } })).deletedAt instanceof Date, true);

  const product = await prisma.product.create({ data: {
    retailerId, storeId, categoryId, createdByUserId: owner.userId,
    slug: `media-product-${suffix.slice(0, 8)}`, name: "Media test product",
  } });
  productIds.push(product.id);
  const deal = await prisma.deal.create({ data: {
    storeId, categoryId, createdByUserId: owner.userId,
    slug: `media-deal-${suffix.slice(0, 8)}`, title: "Media test deal", terms: "Test terms",
    offerType: OfferType.PERCENTAGE, discountBps: 2500, startsAt: new Date(Date.now() - 60_000),
    endsAt: new Date(Date.now() + 86_400_000), storeTimezone: "Asia/Kolkata", status: DealStatus.PUBLISHED, publishedAt: new Date(),
  } });
  dealIds.push(deal.id);
  await prisma.dealProduct.create({ data: { dealId: deal.id, productId: product.id } });

  const croppedOutput = await sharp(png).resize(16, 16).webp().toBuffer();
  const productImage = await media.upload(owner, {
    retailerId, targetId: product.id, purpose: MediaPurpose.PRODUCT, uploadId: randomUUID(), altText: "Product crop",
  }, { buffer: croppedOutput, mimetype: "image/webp", size: croppedOutput.length });
  const dealImage = await media.upload(owner, {
    retailerId, targetId: deal.id, purpose: MediaPurpose.DEAL, uploadId: randomUUID(), altText: "Deal crop",
  }, { buffer: croppedOutput, mimetype: "image/webp", size: croppedOutput.length });
  uploadedMediaIds.push(productImage.id, dealImage.id);
  assert.equal(await prisma.productImage.count({ where: { productId: product.id, mediaAssetId: productImage.id } }), 1);
  assert.equal(await prisma.dealImage.count({ where: { dealId: deal.id, mediaAssetId: dealImage.id } }), 1);

  await prisma.retailer.update({ where: { id: retailerId }, data: { status: RetailerStatus.ACTIVE } });
  await prisma.store.update({ where: { id: storeId }, data: { status: StoreStatus.ACTIVE, verifiedAt: new Date(), verifiedByUserId: owner.userId } });
  assert.equal((await media.readContent(replacement.id)).isPublic, true);
  assert.equal((await media.readContent(dealImage.id)).isPublic, true);
  assert.equal((await media.readContent(productImage.id)).isPublic, true);
  const publicDeal = await new DealsService(prisma, new NotificationsService(prisma)).publicDetail(deal.id);
  assert.equal(publicDeal.products[0]?.image, `/media/${productImage.id}`);
  assert.equal(publicDeal.images[0]?.url, `/media/${dealImage.id}`);
  assert.equal((await prisma.storeImage.findMany({ where: { storeId }, orderBy: { sortOrder: "asc" } })).length, 2);
  await prisma.deal.update({ where: { id: deal.id }, data: { status: DealStatus.PAUSED } });
  await assert.rejects(() => media.readContent(dealImage.id));
  await assert.rejects(() => media.readContent(productImage.id));

  await media.remove(owner, retailerId, uploaded.id);
  await media.remove(owner, retailerId, replacement.id);
  uploadedMediaIds.splice(uploadedMediaIds.indexOf(uploaded.id), 1);
  uploadedMediaIds.splice(uploadedMediaIds.indexOf(replacement.id), 1);
  assert.equal(await prisma.storeImage.count({ where: { storeId, mediaAssetId: replacement.id } }), 0);
  await assert.rejects(() => media.readContent(replacement.id, owner));
  assert.equal((await prisma.mediaAsset.findUniqueOrThrow({ where: { id: replacement.id } })).deletedAt instanceof Date, true);
});
