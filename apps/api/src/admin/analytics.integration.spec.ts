import "reflect-metadata";
import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import { AccountRole, DealStatus, OfferType, RetailerStatus, StoreStatus } from "../generated/prisma/enums.js";
import { PrismaService } from "../database/prisma.service.js";
import { AuthService } from "../auth/auth.service.js";
import { RetailersService } from "../retailers/retailers.service.js";
import { RedemptionsService } from "../redemptions/redemptions.service.js";
import { AnalyticsService } from "./analytics.service.js";

const prisma = new PrismaService();
const auth = new AuthService(prisma);
const retailers = new RetailersService(prisma);
const redemptions = new RedemptionsService(prisma);
const analytics = new AnalyticsService(prisma);
const suffix = randomUUID();
const userIds: string[] = [];
let customer: Awaited<ReturnType<AuthService["resolveIdentity"]>>;
let retailerUser: Awaited<ReturnType<AuthService["resolveIdentity"]>>;
let retailerId = "";
let storeId = "";
let categoryId = "";
let dealId = "";
let expiredOnlyDealId = "";
let baseline: Awaited<ReturnType<AnalyticsService["reports"]>>;

before(async () => {
  await prisma.$connect();
  baseline = await analytics.reports("7d");
  customer = await auth.resolveIdentity({ providerId: "analytics-test", subject: `customer-${suffix}`, email: `customer-${suffix}@example.invalid`, emailVerified: true });
  retailerUser = await auth.resolveIdentity({ providerId: "analytics-test", subject: `retailer-${suffix}`, email: `retailer-${suffix}@example.invalid`, emailVerified: true });
  userIds.push(customer.userId, retailerUser.userId);

  categoryId = (await prisma.category.create({ data: { slug: `analytics-${suffix.slice(0, 8)}`, name: `Analytics ${suffix.slice(0, 8)}` } })).id;
  const retailer = await retailers.createRetailer(retailerUser, { displayName: `Analytics ${suffix.slice(0, 8)}` });
  retailerId = retailer.id;
  retailerUser = { ...retailerUser, roles: [...new Set([...retailerUser.roles, AccountRole.RETAILER])] };
  const store = await retailers.createStore(retailerUser, retailerId, {
    slug: `analytics-${suffix.slice(0, 8)}`, name: `Analytics store ${suffix.slice(0, 8)}`, categoryId,
    city: "Ahmedabad", region: "Gujarat", countryCode: "IN", timezone: "Asia/Kolkata",
    latitude: 23.0225, longitude: 72.5714,
  });
  storeId = store.id;
  await prisma.retailer.update({ where: { id: retailerId }, data: { status: RetailerStatus.ACTIVE } });
  await prisma.store.update({ where: { id: storeId }, data: { status: StoreStatus.ACTIVE, verifiedAt: new Date(), verifiedByUserId: retailerUser.userId } });

  const now = Date.now();
  const deal = await prisma.deal.create({ data: {
    storeId, createdByUserId: retailerUser.userId, categoryId, slug: `analytics-${suffix.slice(0, 8)}`,
    title: `Analytics offer ${suffix.slice(0, 8)}`, terms: "Analytics integration fixture.", offerType: OfferType.PERCENTAGE,
    discountBps: 1000, startsAt: new Date(now - 60_000), endsAt: new Date(now + 60 * 60_000),
    storeTimezone: "Asia/Kolkata", status: DealStatus.PUBLISHED, publishedAt: new Date(now - 30_000),
    maxRedemptions: 3, perCustomerLimit: 2,
  } });
  dealId = deal.id;

  const oldOfferDate = new Date(now - 10 * 24 * 60 * 60_000);
  const expiredOnlyDeal = await prisma.deal.create({ data: {
    storeId, createdByUserId: retailerUser.userId, categoryId, slug: `analytics-expired-${suffix.slice(0, 8)}`,
    title: `Expired analytics offer ${suffix.slice(0, 8)}`, terms: "Expired analytics integration fixture.", offerType: OfferType.PERCENTAGE,
    discountBps: 1000, startsAt: new Date(oldOfferDate.getTime() - 60_000), endsAt: new Date(now - 60_000),
    storeTimezone: "Asia/Kolkata", status: DealStatus.PUBLISHED, publishedAt: oldOfferDate,
    maxRedemptions: 3, perCustomerLimit: 2,
  } });
  expiredOnlyDealId = expiredOnlyDeal.id;
  await prisma.deal.update({ where: { id: expiredOnlyDealId }, data: { createdAt: oldOfferDate } });

  const claim = await redemptions.claim(customer, dealId, { requestId: randomUUID() });
  await redemptions.confirmRetailer(retailerUser, retailerId, storeId, claim.claim.credential!, randomUUID(), { requestId: randomUUID() });
});

after(async () => {
  if (dealId || expiredOnlyDealId || retailerId || userIds.length) {
    await prisma.$transaction(async (tx) => {
      await tx.auditLog.deleteMany({ where: { OR: [{ retailerId }, { actorUserId: { in: userIds } }] } });
      const dealIds = [dealId, expiredOnlyDealId].filter(Boolean);
      if (dealIds.length) {
        await tx.redemption.deleteMany({ where: { dealId: { in: dealIds } } });
        await tx.redemptionCode.deleteMany({ where: { dealId: { in: dealIds } } });
        await tx.deal.deleteMany({ where: { id: { in: dealIds } } });
      }
      if (storeId) await tx.store.deleteMany({ where: { id: storeId } });
      if (retailerId) {
        await tx.retailerMembership.deleteMany({ where: { retailerId } });
        await tx.retailer.deleteMany({ where: { id: retailerId } });
      }
      if (categoryId) await tx.category.deleteMany({ where: { id: categoryId } });
      if (userIds.length) {
        await tx.userAccountRole.deleteMany({ where: { userId: { in: userIds } } });
        await tx.userProfile.deleteMany({ where: { userId: { in: userIds } } });
        await tx.user.deleteMany({ where: { id: { in: userIds } } });
      }
    });
  }
  await prisma.$disconnect();
});

test("analytics aggregates claims separately and associates redemptions with retailer, store and category", async () => {
  const report = await analytics.reports("7d");
  assert.equal(report.kpis.claims.currentPeriod, baseline.kpis.claims.currentPeriod + 1);
  assert.equal(report.kpis.redemptions.currentPeriod, baseline.kpis.redemptions.currentPeriod + 1);
  assert.equal(report.kpis.offers.createdInPeriod, baseline.kpis.offers.createdInPeriod + 1);
  assert.equal(report.kpis.offers.publishedInPeriod, baseline.kpis.offers.publishedInPeriod + 1);
  assert.equal(report.kpis.offers.expiredInPeriod, baseline.kpis.offers.expiredInPeriod + 1);
  assert.equal(report.claimStatuses.redeemed, baseline.claimStatuses.redeemed + 1);
  assert.equal(report.claimStatuses.issued + report.claimStatuses.redeemed + report.claimStatuses.expired + report.claimStatuses.revoked, report.kpis.claims.currentPeriod);
  assert.equal(report.customerGrowth.reduce((sum, row) => sum + row.count, 0), report.kpis.customers.currentPeriod);
  assert.equal(report.offerActivity.reduce((sum, row) => sum + row.created, 0), report.kpis.offers.createdInPeriod);
  assert.equal(report.offerActivity.reduce((sum, row) => sum + row.published, 0), report.kpis.offers.publishedInPeriod);
  assert.equal(report.offerActivity.reduce((sum, row) => sum + row.expired, 0), report.kpis.offers.expiredInPeriod);
  assert.equal(report.redemptionTrends.reduce((sum, row) => sum + row.claims, 0), report.kpis.claims.currentPeriod);
  assert.equal(report.redemptionTrends.reduce((sum, row) => sum + row.confirmedRedemptions, 0), report.kpis.redemptions.currentPeriod);
  const retailerRow = report.retailerPerformance.find((row) => row.id === retailerId);
  assert.deepEqual(retailerRow && { redemptions: retailerRow.redemptions, offersCreated: retailerRow.offersCreated, offersPublished: retailerRow.offersPublished, offersExpired: retailerRow.offersExpired }, { redemptions: 1, offersCreated: 1, offersPublished: 1, offersExpired: 1 });
  const storeRow = report.storePerformance.find((row) => row.id === storeId);
  assert.deepEqual(storeRow && { redemptions: storeRow.redemptions, offersCreated: storeRow.offersCreated, offersPublished: storeRow.offersPublished, offersExpired: storeRow.offersExpired }, { redemptions: 1, offersCreated: 1, offersPublished: 1, offersExpired: 1 });
  assert.ok(report.categoryPerformance.some((row) => row.id === categoryId && row.offers === 1 && row.claims === 1 && row.redemptions === 1));
  assert.ok(report.offerPerformance.some((row) => row.id === dealId && row.claims === 1 && row.redemptions === 1));
  assert.ok(report.offerPerformance.some((row) => row.id === expiredOnlyDealId && row.claims === 0 && row.redemptions === 0));
});
