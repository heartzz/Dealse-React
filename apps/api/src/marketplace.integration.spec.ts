import "reflect-metadata";
import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import { AccountRole, DealReportReason, DealReportStatus, DealStatus } from "./generated/prisma/enums.js";
import { PrismaService } from "./database/prisma.service.js";
import { AuthService } from "./auth/auth.service.js";
import { RetailersService } from "./retailers/retailers.service.js";
import { ProductsService } from "./products/products.service.js";
import { DealsService } from "./deals/deals.service.js";
import { FavouritesService } from "./favourites/favourites.service.js";
import { AdminService } from "./admin/admin.service.js";
import { DealReportsService } from "./admin/deal-reports.service.js";
import { NotificationsService } from "./notifications/notifications.service.js";
import type { AuthPrincipal } from "./auth/auth.types.js";

const prisma = new PrismaService();
const restartedPrisma = new PrismaService();
const auth = new AuthService(prisma);
const retailers = new RetailersService(prisma);
const productsService = new ProductsService(prisma);
const notificationsService = new NotificationsService(prisma);
const dealsService = new DealsService(prisma, notificationsService);
const favouritesService = new FavouritesService(prisma);
const adminService = new AdminService(prisma);
const dealReportsService = new DealReportsService(prisma);
const suffix = randomUUID();
const users: string[] = [];
const retailerIds: string[] = [];
const reportIds: string[] = [];
let retailerUser!: AuthPrincipal;
let otherRetailer!: AuthPrincipal;
let customer!: AuthPrincipal;
let admin!: AuthPrincipal;
let retailerId = "";
let otherRetailerId = "";
let storeId = "";
let nearbyStoreId = "";
let categoryId = "";
let productId = "";
let draftId = "";
let publishedId = "";
let highDiscountId = "";
let nearestDealId = "";
let hiddenId = "";
let expiredId = "";
let retailerConfirmationId = "";
let customerAnnouncementId = "";

before(async () => {
  await prisma.$connect();
  retailerUser = await auth.resolveIdentity({ providerId: "marketplace-test", subject: `owner-${suffix}`, email: `owner-${suffix}@example.invalid`, emailVerified: true });
  otherRetailer = await auth.resolveIdentity({ providerId: "marketplace-test", subject: `other-${suffix}`, email: `other-${suffix}@example.invalid`, emailVerified: true });
  customer = await auth.resolveIdentity({ providerId: "marketplace-test", subject: `customer-${suffix}`, email: `customer-${suffix}@example.invalid`, emailVerified: true });
  admin = await auth.resolveIdentity({ providerId: "marketplace-test", subject: `admin-${suffix}`, email: `admin-${suffix}@example.invalid`, emailVerified: true });
  users.push(retailerUser.userId, otherRetailer.userId, customer.userId, admin.userId);
  await prisma.userAccountRole.create({ data: { userId: admin.userId, role: AccountRole.ADMIN } });
  assert.ok(retailerUser.roles.includes(AccountRole.RETAILER) === false);
  const retailer = await retailers.createRetailer(retailerUser, { displayName: `Milestone ${suffix.slice(0, 8)}` });
  const other = await retailers.createRetailer(otherRetailer, { displayName: `Other ${suffix.slice(0, 8)}` });
  retailerId = retailer.id; otherRetailerId = other.id; retailerIds.push(retailerId, otherRetailerId);
  categoryId = (await prisma.category.create({ data: { slug: `integration-${suffix.slice(0, 8)}`, name: `Integration ${suffix.slice(0, 8)}` } })).id;
});

after(async () => {
  if (retailerIds.length) {
    await prisma.$transaction(async (tx) => {
      const dealIds = [draftId, publishedId, highDiscountId, nearestDealId, hiddenId, expiredId].filter(Boolean);
      await tx.dealReport.deleteMany({ where: { OR: [{ id: { in: reportIds } }, { reporterUserId: { in: users } }, { reviewedByUserId: { in: users } }] } });
      await tx.notification.deleteMany({ where: { userId: { in: users } } });
      await tx.followedStore.deleteMany({ where: { userId: { in: users } } });
      await tx.auditLog.deleteMany({ where: { OR: [{ actorUserId: { in: users } }, { retailerId: { in: retailerIds } }] } });
      if (dealIds.length) {
        await tx.favourite.deleteMany({ where: { dealId: { in: dealIds } } });
        await tx.dealProduct.deleteMany({ where: { dealId: { in: dealIds } } });
        await tx.deal.deleteMany({ where: { id: { in: dealIds } } });
      }
      if (productId) await tx.product.deleteMany({ where: { id: productId } });
      await tx.store.deleteMany({ where: { id: { in: [storeId, nearbyStoreId].filter(Boolean) } } });
      await tx.retailerMembership.deleteMany({ where: { retailerId: { in: retailerIds } } });
      await tx.retailer.deleteMany({ where: { id: { in: retailerIds } } });
      await tx.category.deleteMany({ where: { id: categoryId } });
      await tx.userAccountRole.deleteMany({ where: { userId: { in: users } } });
      await tx.userProfile.deleteMany({ where: { userId: { in: users } } });
      await tx.user.deleteMany({ where: { id: { in: users } } });
    });
  }
  await restartedPrisma.$disconnect();
  await prisma.$disconnect();
});

test("1. retailer creates an owned store", async () => {
  const store = await retailers.createStore(retailerUser, retailerId, {
    slug: `milestone-${suffix.slice(0, 8)}`, name: `Milestone Store ${suffix.slice(0, 8)}`,
    categoryId, city: "Ahmedabad", region: "Gujarat", countryCode: "IN", timezone: "Asia/Kolkata", latitude: 23.0225, longitude: 72.5714,
  });
  storeId = store.id;
  assert.equal(store.retailerId, retailerId);
  assert.equal((await retailers.listStores(retailerUser, retailerId)).length, 1);
  const updated = await retailers.updateStore(retailerUser, retailerId, store.id, { description: "Updated test store." });
  assert.equal(updated.description, "Updated test store.");
});

test("2. retailer creates a product in PostgreSQL", async () => {
  const product = await productsService.create(retailerUser, retailerId, {
    slug: `product-${suffix.slice(0, 8)}`, name: "Test Marketplace Product", categoryId, storeId,
  });
  productId = product.id;
  assert.equal(product.retailerId, retailerId);
  const updated = await productsService.update(retailerUser, retailerId, productId, { description: "Updated test product." });
  assert.equal(updated.description, "Updated test product.");
  assert.equal((await productsService.get(retailerUser, retailerId, productId)).id, productId);
});

test("3. retailer saves a draft deal", async () => {
  const now = Date.now();
  const deal = await dealsService.create(retailerUser, retailerId, {
    title: `Milestone offer ${suffix.slice(0, 8)}`, summary: "Integration offer", terms: "Valid on selected items.",
    storeId, categoryId, offerType: "PERCENTAGE" as never, discountBps: 1500,
    startsAt: new Date(now - 60_000).toISOString(), endsAt: new Date(now + 86_400_000).toISOString(), productIds: [productId],
  });
  draftId = deal.id;
  assert.equal(deal.status, "draft");
  const updated = await dealsService.update(retailerUser, retailerId, deal.id, { summary: "Updated integration offer" });
  assert.equal(updated.summary, "Updated integration offer");
  assert.equal((await dealsService.listMine(retailerUser, retailerId)).some((item) => item.id === deal.id), true);
});

test("4. only an approved retailer and verified store can publish discoverable offers", async () => {
  await prisma.deal.update({ where: { id: draftId }, data: { status: DealStatus.PUBLISHED, publishedAt: new Date() } });
  const hiddenFromDiscovery = await dealsService.discover({ page: 1, limit: 100, q: suffix.slice(0, 8) });
  assert.equal(hiddenFromDiscovery.items.some((item) => item.id === draftId), false);
  await assert.rejects(dealsService.publicDetail(draftId), (error: unknown) => typeof error === "object" && error !== null && "getStatus" in error && typeof error.getStatus === "function" && error.getStatus() === 404);
  await assert.rejects(dealsService.publicStoreDetail(storeId), (error: unknown) => typeof error === "object" && error !== null && "getStatus" in error && typeof error.getStatus === "function" && error.getStatus() === 404);
  await assert.rejects(favouritesService.save(customer, draftId), (error: unknown) => typeof error === "object" && error !== null && "getStatus" in error && typeof error.getStatus === "function" && error.getStatus() === 404);

  await prisma.deal.update({ where: { id: draftId }, data: { status: DealStatus.DRAFT, publishedAt: null } });
  await assert.rejects(dealsService.publish(retailerUser, retailerId, draftId), (error: unknown) => typeof error === "object" && error !== null && "getStatus" in error && typeof error.getStatus === "function" && error.getStatus() === 409);
  await assert.rejects(
    adminService.verifyStore(admin, storeId),
    (error: unknown) => typeof error === "object" && error !== null && "getStatus" in error && typeof error.getStatus === "function" && error.getStatus() === 409,
  );
  await assert.rejects(
    notificationsService.followStore(customer, storeId),
    (error: unknown) => typeof error === "object" && error !== null && "getStatus" in error && typeof error.getStatus === "function" && error.getStatus() === 404,
  );
  const approved = await adminService.approveRetailer(admin, retailerId);
  assert.equal(approved.status, "ACTIVE");
  await adminService.verifyStore(admin, storeId);
  assert.ok(await prisma.auditLog.findFirst({ where: { actorUserId: admin.userId, action: "store.verified", entityId: storeId } }));

  assert.deepEqual(await notificationsService.followStore(customer, storeId), { storeId, following: true });
  assert.deepEqual(await notificationsService.followStore(customer, storeId), { storeId, following: true });
  assert.equal((await notificationsService.followedStores(customer)).filter((store) => store.id === storeId).length, 1);

  const published = await dealsService.publish(retailerUser, retailerId, draftId);
  publishedId = published.id;
  assert.equal(published.status, "published");
  const confirmation = await notificationsService.list(retailerUser, 1, 20);
  const announcement = await notificationsService.list(customer, 1, 20);
  retailerConfirmationId = confirmation.items.find((item) => item.kind === "RETAILER_PUBLISH_CONFIRMATION" && item.dealId === publishedId)?.id ?? "";
  customerAnnouncementId = announcement.items.find((item) => item.kind === "STORE_ANNOUNCEMENT" && item.dealId === publishedId)?.id ?? "";
  assert.ok(retailerConfirmationId, "publishing persists a retailer confirmation");
  assert.ok(customerAnnouncementId, "publishing notifies customers following the store");
  const version = await prisma.deal.findUniqueOrThrow({ where: { id: publishedId }, select: { version: true } });
  await dealsService.publish(retailerUser, retailerId, publishedId);
  assert.equal((await prisma.deal.findUniqueOrThrow({ where: { id: publishedId }, select: { version: true } })).version, version.version, "repeated publish is idempotent");
  assert.equal((await notificationsService.list(retailerUser, 1, 20)).items.filter((item) => item.kind === "RETAILER_PUBLISH_CONFIRMATION" && item.dealId === publishedId).length, 1);
  await assert.rejects(
    notificationsService.markRead(otherRetailer, retailerConfirmationId),
    (error: unknown) => typeof error === "object" && error !== null && "getStatus" in error && typeof error.getStatus === "function" && error.getStatus() === 404,
  );
  const unread = await notificationsService.list(customer, 1, 20);
  assert.equal(unread.unreadCount > 0, true);
  await notificationsService.markRead(customer, customerAnnouncementId);
  assert.equal((await notificationsService.list(customer, 1, 20)).unreadCount, unread.unreadCount - 1);
  assert.deepEqual(await notificationsService.unfollowStore(customer, storeId), { storeId, following: false });
  assert.equal((await notificationsService.followedStores(customer)).some((store) => store.id === storeId), false);
});

test("5. another retailer cannot edit this deal", async () => {
  await assert.rejects(
    dealsService.update(otherRetailer, otherRetailerId, publishedId, { title: "Unauthorized edit" }),
    (error: unknown) => typeof error === "object" && error !== null && "getStatus" in error && typeof error.getStatus === "function" && error.getStatus() === 404,
  );
});

test("6. customer discovers the exact published deal", async () => {
  const result = await dealsService.discover({ page: 1, limit: 100, q: suffix.slice(0, 8) });
  assert.equal(result.items.some((item) => item.id === publishedId), true);
  const detail = await dealsService.publicDetail(publishedId);
  assert.equal(detail.store.id, storeId);
  assert.ok(JSON.stringify(detail).includes(publishedId), "detail payload is JSON-safe for the customer website");
  const store = await dealsService.publicStoreDetail(storeId);
  assert.equal(store.id, storeId);
  assert.equal(store.offers.some((offer) => offer.id === publishedId), true);
});

test("nearby discovery returns only active deals within the requested PostGIS radius and includes distance", async () => {
  const nearby = await dealsService.discover({
    page: 1, limit: 20, q: suffix.slice(0, 8), latitude: 23.0225, longitude: 72.5714, radiusKm: 1,
  });
  assert.equal(nearby.items.length, 1);
  assert.equal(nearby.items[0].id, publishedId);
  assert.equal(nearby.items[0].distanceMeters, 0);

  const outsideRadius = await dealsService.discover({
    page: 1, limit: 20, q: suffix.slice(0, 8), latitude: 24.0225, longitude: 72.5714, radiusKm: 1,
  });
  assert.equal(outsideRadius.items.some((item) => item.id === publishedId), false);
  await assert.rejects(
    dealsService.discover({ page: 1, limit: 20, sort: "nearest" }),
    (error: unknown) => typeof error === "object" && error !== null && "getStatus" in error && typeof error.getStatus === "function" && error.getStatus() === 400,
  );
  await assert.rejects(
    dealsService.discover({ page: 1, limit: 20, sort: "best" as "newest" }),
    (error: unknown) => typeof error === "object" && error !== null && "getStatus" in error && typeof error.getStatus === "function" && error.getStatus() === 400,
  );
});

test("nearby discovery sorts by actual PostGIS distance", async () => {
  const now = Date.now();
  await dealsService.update(retailerUser, retailerId, publishedId, { title: `Nearest probe ${suffix.slice(0, 8)}` });
  const fartherStore = await retailers.createStore(retailerUser, retailerId, {
    slug: `nearby-${suffix.slice(0, 8)}`, name: `Nearby Sort Store ${suffix.slice(0, 8)}`, categoryId,
    city: "Ahmedabad", region: "Gujarat", countryCode: "IN", timezone: "Asia/Kolkata", latitude: 23.03, longitude: 72.5714,
  });
  nearbyStoreId = fartherStore.id;
  await adminService.verifyStore(admin, nearbyStoreId);
  const fartherDeal = await dealsService.create(retailerUser, retailerId, {
    title: "Nearest probe farther offer", terms: "Integration test only.", storeId: nearbyStoreId, categoryId,
    offerType: "PERCENTAGE" as never, discountBps: 1000,
    startsAt: new Date(now - 60_000).toISOString(), endsAt: new Date(now + 86_400_000).toISOString(),
  });
  nearestDealId = fartherDeal.id;
  await dealsService.publish(retailerUser, retailerId, fartherDeal.id);

  const result = await dealsService.discover({
    page: 1, limit: 20, q: "Nearest probe", latitude: 23.0225, longitude: 72.5714, radiusKm: 2, sort: "nearest",
  });
  assert.deepEqual(result.items.map((item) => item.id), [publishedId, fartherDeal.id]);
  assert.ok(Number(result.items[0]?.distanceMeters) < Number(result.items[1]?.distanceMeters));
});

test("customer discovery sorts by the highest percentage discount across pages", async () => {
  const now = Date.now();
  await dealsService.update(retailerUser, retailerId, publishedId, { title: `Percentage sort probe ${suffix.slice(0, 8)}` });
  const higherDiscount = await dealsService.create(retailerUser, retailerId, {
    title: `Percentage sort probe higher ${suffix.slice(0, 8)}`, terms: "Integration test only.", storeId, categoryId,
    offerType: "PERCENTAGE" as never, discountBps: 4000,
    startsAt: new Date(now - 60_000).toISOString(), endsAt: new Date(now + 86_400_000).toISOString(),
  });
  highDiscountId = higherDiscount.id;
  await dealsService.publish(retailerUser, retailerId, highDiscountId);

  const result = await dealsService.discover({ page: 1, limit: 1, q: "Percentage sort probe", sort: "discount" });
  assert.equal(result.total, 2);
  assert.equal(result.items[0]?.id, highDiscountId);
  const secondPage = await dealsService.discover({ page: 2, limit: 1, q: "Percentage sort probe", sort: "discount" });
  assert.equal(secondPage.items[0]?.id, publishedId);
});

test("customer reports an offer and an admin review is persisted and audited", async () => {
  const report = await dealReportsService.create(customer, publishedId, {
    reason: DealReportReason.MISLEADING,
    details: "The displayed conditions appear inconsistent.",
  });
  reportIds.push(report.id);
  assert.equal(report.status, DealReportStatus.OPEN);
  await assert.rejects(
    dealReportsService.create(customer, publishedId, { reason: DealReportReason.MISLEADING }),
    (error: unknown) => typeof error === "object" && error !== null && "getStatus" in error && typeof error.getStatus === "function" && error.getStatus() === 409,
  );
  const reviewed = await adminService.reviewReport(admin, report.id, {
    status: DealReportStatus.RESOLVED,
    resolution: "Reviewed offer details with the retailer.",
  });
  assert.equal(reviewed.status, DealReportStatus.RESOLVED);
  const savedReport = await prisma.dealReport.findUniqueOrThrow({ where: { id: report.id } });
  assert.equal(savedReport.reviewedByUserId, admin.userId);
  assert.ok(savedReport.reviewedAt);
  assert.ok(await prisma.auditLog.findFirst({ where: { actorUserId: admin.userId, action: "deal_report.reviewed", entityId: report.id } }));
});

test("7. customer cannot discover an unpublished deal", async () => {
  const now = Date.now();
  const deal = await dealsService.create(retailerUser, retailerId, {
    title: `Unpublished ${suffix.slice(0, 8)}`, terms: "Not published.", storeId, categoryId,
    offerType: "OTHER" as never, startsAt: new Date(now - 60_000).toISOString(), endsAt: new Date(now + 86_400_000).toISOString(),
  });
  hiddenId = deal.id;
  const result = await dealsService.discover({ page: 1, limit: 100, q: suffix.slice(0, 8) });
  assert.equal(result.items.some((item) => item.id === hiddenId), false);
  await assert.rejects(dealsService.publicDetail(hiddenId), (error: unknown) => typeof error === "object" && error !== null && "getStatus" in error && typeof error.getStatus === "function" && error.getStatus() === 404);
});

test("8. expired published deals are excluded", async () => {
  const now = Date.now();
  const deal = await dealsService.create(retailerUser, retailerId, {
    title: `Expired ${suffix.slice(0, 8)}`, terms: "Expired test.", storeId, categoryId,
    offerType: "OTHER" as never, startsAt: new Date(now - 172_800_000).toISOString(), endsAt: new Date(now - 86_400_000).toISOString(),
  });
  expiredId = deal.id;
  await prisma.deal.update({ where: { id: expiredId }, data: { status: "PUBLISHED" as never, publishedAt: new Date(now - 172_800_000) } });
  const result = await dealsService.discover({ page: 1, limit: 100, q: suffix.slice(0, 8) });
  assert.equal(result.items.some((item) => item.id === expiredId), false);
  await assert.rejects(dealsService.publicDetail(expiredId), (error: unknown) => typeof error === "object" && error !== null && "getStatus" in error && typeof error.getStatus === "function" && error.getStatus() === 404);
});

test("public store profile lists only current public offers", async () => {
  const store = await dealsService.publicStoreDetail(storeId);
  const offerIds = store.offers.map((offer) => offer.id);
  assert.equal(offerIds.includes(publishedId), true);
  assert.equal(offerIds.includes(hiddenId), false);
  assert.equal(offerIds.includes(expiredId), false);
});

test("9. customer saves and unsaves a deal", async () => {
  assert.deepEqual(await favouritesService.save(customer, publishedId), { dealId: publishedId, saved: true });
  const previousTitle = (await prisma.deal.findUniqueOrThrow({ where: { id: publishedId }, select: { title: true } })).title;
  await dealsService.update(retailerUser, retailerId, publishedId, { title: previousTitle });
  assert.equal((await notificationsService.list(customer, 1, 20)).items.filter((item) => item.kind === "FAVOURITE_DEAL_UPDATED" && item.dealId === publishedId).length, 0, "a no-op edit does not notify customers");
  await dealsService.update(retailerUser, retailerId, publishedId, { title: `${previousTitle} updated` });
  const updateNotices = await notificationsService.list(customer, 1, 20);
  const updateNotice = updateNotices.items.find((item) => item.kind === "FAVOURITE_DEAL_UPDATED" && item.dealId === publishedId);
  assert.ok(updateNotice, "a saved-deal change creates a customer notification");
  assert.match(updateNotice.body, /updated/i);
  assert.equal((await notificationsService.markAllRead(customer)).updatedCount, 1);
  assert.equal((await notificationsService.list(customer, 1, 20)).unreadCount, 0);
  const saved = await favouritesService.list(customer);
  assert.equal(saved.some((item) => item.id === publishedId), true);
  assert.ok(JSON.stringify(saved).includes(publishedId), "saved deal payload is JSON-safe for the customer website");
  assert.deepEqual(await favouritesService.remove(customer, publishedId), { dealId: publishedId, saved: false });
  assert.equal((await favouritesService.list(customer)).some((item) => item.id === publishedId), false);
});

test("10. store, product, deal and favourite data survive a new Prisma client", async () => {
  await favouritesService.save(customer, publishedId);
  await restartedPrisma.$connect();
  const persisted = await restartedPrisma.favourite.findUnique({ where: { userId_dealId: { userId: customer.userId, dealId: publishedId } }, include: { deal: { include: { store: true } } } });
  assert.equal(persisted?.deal.id, publishedId);
  assert.equal(persisted?.deal.store.id, storeId);
  assert.equal((await restartedPrisma.product.findUnique({ where: { id: productId } }))?.id, productId);
});

test("11. archived products disappear from the retailer's active catalogue", async () => {
  assert.deepEqual(await productsService.archive(retailerUser, retailerId, productId), { id: productId, status: "archived" });
  assert.equal((await productsService.list(retailerUser, retailerId)).some((item) => item.id === productId), false);
});

test("12. paused offers are removed from public discovery", async () => {
  await favouritesService.save(customer, publishedId);
  const hold = await adminService.pauseDeal(admin, publishedId, "Customer report requires a pricing review.");
  assert.equal(hold.status, DealStatus.PAUSED);
  assert.ok(await prisma.auditLog.findFirst({ where: { actorUserId: admin.userId, action: "deal.moderation_paused", entityId: publishedId } }));
  const result = await dealsService.discover({ page: 1, limit: 100, q: suffix.slice(0, 8) });
  assert.equal(result.items.some((item) => item.id === publishedId), false);
  assert.equal((await favouritesService.list(customer)).some((item) => item.id === publishedId), false);
  const noticesBeforePauseFlow = (await notificationsService.list(retailerUser, 1, 100)).items.filter((item) => item.kind === "RETAILER_PUBLISH_CONFIRMATION" && item.dealId === publishedId).length;
  await assert.rejects(
    dealsService.update(retailerUser, retailerId, publishedId, { title: "Try to bypass moderation" }),
    (error: unknown) => typeof error === "object" && error !== null && "getStatus" in error && typeof error.getStatus === "function" && error.getStatus() === 409,
  );
  assert.equal((await adminService.releaseDeal(admin, publishedId)).status, DealStatus.DRAFT);
  assert.equal((await dealsService.publish(retailerUser, retailerId, publishedId)).status, "published");
  assert.deepEqual(await dealsService.pause(retailerUser, retailerId, publishedId), { id: publishedId, status: "paused" });
  assert.equal((await notificationsService.list(retailerUser, 1, 100)).items.filter((item) => item.kind === "RETAILER_PUBLISH_CONFIRMATION" && item.dealId === publishedId).length, noticesBeforePauseFlow + 1, "republishing a moderated draft confirms the new publish event once");
});
