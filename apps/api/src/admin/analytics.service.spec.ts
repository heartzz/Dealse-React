import assert from "node:assert/strict";
import { test } from "node:test";
import { validate } from "class-validator";
import { Prisma } from "../generated/prisma/client.js";
import { AnalyticsService, makeAnalyticsWindow } from "./analytics.service.js";
import { AdminAnalyticsQueryDto } from "./dto/analytics.dto.js";

const currentBucket = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

test("selected analytics periods use inclusive India-local start and exclusive end boundaries", () => {
  const now = new Date("2026-11-21T18:00:00.000Z");
  for (const [period, expectedStart, expectedPrevious] of [
    ["7d", "2026-11-14T18:30:00.000Z", "2026-11-07T18:30:00.000Z"],
    ["30d", "2026-10-22T18:30:00.000Z", "2026-09-22T18:30:00.000Z"],
    ["90d", "2026-08-23T18:30:00.000Z", "2026-05-25T18:30:00.000Z"],
  ] as const) {
    const window = makeAnalyticsWindow(period, now);
    assert.equal(window.current.start?.toISOString(), expectedStart, `${period} starts at India-local midnight`);
    assert.equal(window.current.end, now, `${period} ends exclusively at now`);
    assert.equal(window.previous?.start?.toISOString(), expectedPrevious, `${period} comparison is the preceding equal-length period`);
    assert.equal(window.previous?.end, window.current.start, `${period} comparison ends where current begins`);
  }
  const all = makeAnalyticsWindow("all", now);
  assert.equal(all.current.start, null);
  assert.equal(all.previous, null);
  assert.equal(all.current.end, now);
});

test("analytics DTO rejects unsupported reporting periods", async () => {
  const query = Object.assign(new AdminAnalyticsQueryDto(), { period: "forever" });
  assert.ok((await validate(query)).some((error) => error.property === "period"));
});

function fakePrisma(populated = true) {
  const model = { count: async () => 0, aggregate: async () => ({ _count: { _all: 0 } }) };
  return {
    user: model, retailer: model, store: model, deal: model, redemptionCode: model, redemption: model,
    $queryRaw: async (query: Prisma.Sql) => {
      const sql = query.sql;
      if (!populated) return [];
      if (sql.includes('"event_at"')) return [{ first_event: null }];
      if (sql.includes('"totalCustomers"')) return [{ totalCustomers: 2n, totalRetailers: 2n, activeRetailers: 1n, totalStores: 3n, verifiedStores: 2n, publishedOffers: 5n, activeOffers: 2n, expiredOffers: 1n, totalClaims: 10n, totalRedemptions: 8n }];
      if (sql.includes('"offersCreated"') && sql.includes('"claims"') && sql.includes('"redemptions"')) return [{ customers: 2n, retailers: 1n, stores: 1n, offersCreated: 3n, offersPublished: 2n, offersExpired: 1n, claims: 10n, redemptions: 8n }];
      if (sql.includes('"issued"') && sql.includes('"expires_at"')) return [{ issued: 2n, redeemed: 8n, expired: 0n, revoked: 0n }];
      if (sql.includes('"offers_created"') && sql.includes('FROM "retailers" r')) return [{ id: "retailer-1", name: "Top retailer", status: "active", redemptions: 8n, offersCreated: 3n, offersPublished: 2n, offersExpired: 1n }];
      if (sql.includes('"retailerName"') && sql.includes('FROM "stores" s')) return [{ id: "store-1", name: "Top store", city: "Pune", retailerName: "Top retailer", redemptions: 8n, offersCreated: 3n, offersPublished: 2n, offersExpired: 1n }];
      if (sql.includes('"category_ids"') || sql.includes('category_ids')) return [{ id: "category-1", name: "Food", offers: 3n, claims: 10n, redemptions: 8n }];
      if (sql.includes('"categoryName"')) return [{ id: "deal-1", title: "Offer", status: "published", storeName: "Top store", retailerName: "Top retailer", categoryName: "Food", claims: 10n, redemptions: 8n }];
      if (sql.includes('"confirmedRedemptions"')) return [{ bucket: currentBucket, claims: 10n, confirmedRedemptions: 8n }];
      if (sql.includes('"created"') && sql.includes('"published"') && sql.includes('"expired"')) return [{ bucket: currentBucket, created: 3n, published: 2n, expired: 1n }];
      if (sql.includes('"count"') && sql.includes('"bucket"')) return [{ bucket: currentBucket, count: 2n }];
      if (sql.includes('"total"') && sql.includes('"redemptions"')) return [{ total: 8n }];
      if (sql.includes('"total"') && sql.includes('"redemption_codes"')) return [{ total: 10n }];
      if (sql.includes('"total"') && sql.includes('"stores"')) return [{ total: 3n }];
      if (sql.includes('"total"') && sql.includes('"retailers"')) return [{ total: 2n }];
      if (sql.includes('"total"') && sql.includes('"users"')) return [{ total: 2n }];
      if (sql.includes('"expired"') && sql.includes('"deals"')) return [{ created: 3n, published: 2n, expired: 1n }];
      return [];
    },
  };
}

test("report keeps issued claims distinct from confirmed redemptions and includes empty-safe ranking data", async () => {
  const service = new AnalyticsService(fakePrisma() as never);
  const report = await service.reports("7d");
  assert.equal(report.kpis.claims.currentPeriod, 10);
  assert.equal(report.kpis.redemptions.currentPeriod, 8);
  assert.equal(report.redemptionTrends.at(-1)?.claims, 10);
  assert.equal(report.redemptionTrends.at(-1)?.confirmedRedemptions, 8);
  assert.equal(report.claimStatuses.issued + report.claimStatuses.redeemed + report.claimStatuses.expired + report.claimStatuses.revoked, report.kpis.claims.currentPeriod);
  assert.equal(report.redemptionTrends.reduce((sum, row) => sum + row.claims, 0), report.kpis.claims.currentPeriod);
  assert.equal(report.redemptionTrends.reduce((sum, row) => sum + row.confirmedRedemptions, 0), report.kpis.redemptions.currentPeriod);
  assert.equal(report.customerGrowth.reduce((sum, row) => sum + row.count, 0), report.kpis.customers.currentPeriod);
  assert.equal(report.offerActivity.reduce((sum, row) => sum + row.created, 0), report.kpis.offers.createdInPeriod);
  assert.equal(report.offerActivity.reduce((sum, row) => sum + row.published, 0), report.kpis.offers.publishedInPeriod);
  assert.equal(report.offerActivity.reduce((sum, row) => sum + row.expired, 0), report.kpis.offers.expiredInPeriod);
  assert.equal(report.retailerPerformance[0].name, "Top retailer");
  assert.equal(report.storePerformance[0].name, "Top store");
  assert.equal(report.categoryPerformance[0].redemptions, 8);
  assert.equal(report.offerPerformance[0].claims, 10);
});

test("analytics query failures propagate instead of becoming zero-valued metrics", async () => {
  const prisma = fakePrisma();
  prisma.$queryRaw = async () => { throw new Error("analytics database unavailable"); };
  const service = new AnalyticsService(prisma as never);
  await assert.rejects(() => service.reports("30d"), /analytics database unavailable/);
});

test("empty analytics data remains an empty dataset with zero totals", async () => {
  const service = new AnalyticsService(fakePrisma(false) as never);
  const report = await service.reports("30d");
  assert.equal(report.kpis.claims.total, 0);
  assert.equal(report.kpis.redemptions.total, 0);
  assert.equal(report.retailerPerformance.length, 0);
  assert.equal(report.storePerformance.length, 0);
  assert.equal(report.categoryPerformance.length, 0);
});
