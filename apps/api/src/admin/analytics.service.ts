import { Injectable } from "@nestjs/common";
import { Prisma } from "../generated/prisma/client.js";
import { PrismaService } from "../database/prisma.service.js";
import type { AdminAnalyticsPeriod } from "./dto/analytics.dto.js";

export const ANALYTICS_TIME_ZONE = "Asia/Kolkata";
const INDIA_OFFSET = "+05:30";
type BucketUnit = "day" | "week" | "month";
type Range = { start: Date | null; end: Date };
type PeriodWindow = { current: Range; previous: Range | null; bucket: BucketUnit; period: AdminAnalyticsPeriod };

function localDateKey(value: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: ANALYTICS_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function addDays(key: string, days: number): string {
  const date = new Date(`${key}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function indiaMidnight(key: string): Date {
  return new Date(`${key}T00:00:00.000${INDIA_OFFSET}`);
}

export function makeAnalyticsWindow(period: AdminAnalyticsPeriod, now = new Date()): PeriodWindow {
  if (period === "all") return { current: { start: null, end: now }, previous: null, bucket: "month", period };
  const days = period === "7d" ? 7 : period === "90d" ? 90 : 30;
  const today = localDateKey(now);
  const startKey = addDays(today, -(days - 1));
  const previousStartKey = addDays(startKey, -days);
  const start = indiaMidnight(startKey);
  return {
    current: { start, end: now },
    previous: { start: indiaMidnight(previousStartKey), end: start },
    bucket: period === "90d" ? "week" : "day",
    period,
  };
}

function timePredicate(column: string, range: Range): Prisma.Sql {
  return Prisma.sql`${Prisma.raw(column)} < ${range.end} ${range.start ? Prisma.sql`AND ${Prisma.raw(column)} >= ${range.start}` : Prisma.empty}`;
}

function bucketExpression(column: string, unit: BucketUnit): Prisma.Sql {
  return Prisma.sql`to_char(date_trunc(${unit}, ${Prisma.raw(column)} AT TIME ZONE ${ANALYTICS_TIME_ZONE}), 'YYYY-MM-DD')`;
}

function asNumber(value: bigint | number | null | undefined): number {
  return value == null ? 0 : Number(value);
}

function dateBucket(key: string, unit: BucketUnit): string {
  if (unit === "month") return `${key.slice(0, 7)}-01`;
  if (unit === "week") {
    const date = new Date(`${key}T00:00:00.000Z`);
    const daysSinceMonday = (date.getUTCDay() + 6) % 7;
    date.setUTCDate(date.getUTCDate() - daysSinceMonday);
    return date.toISOString().slice(0, 10);
  }
  return key;
}

function nextBucket(key: string, unit: BucketUnit): string {
  const date = new Date(`${key}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + (unit === "day" ? 1 : unit === "week" ? 7 : 0));
  if (unit === "month") date.setUTCMonth(date.getUTCMonth() + 1);
  return date.toISOString().slice(0, 10);
}

function bucketKeys(start: string | null, through: string, unit: BucketUnit): string[] {
  if (!start) return [];
  const keys: string[] = [];
  const last = dateBucket(through, unit);
  for (let key = dateBucket(start, unit); key <= last; key = nextBucket(key, unit)) keys.push(key);
  return keys;
}

function fillSeries<K extends string>(
  rows: Array<{ bucket: string } & Record<K, number>>,
  keys: string[],
  fields: K[],
): Array<{ bucket: string } & Record<K, number>> {
  const byBucket = new Map(rows.map((row) => [row.bucket, row]));
  return keys.map((bucket) => {
    const found = byBucket.get(bucket);
    const result: Record<string, number | string> = { bucket };
    for (const field of fields) result[field] = found?.[field] ?? 0;
    return result as { bucket: string } & Record<K, number>;
  });
}

type PeriodCounts = {
  customers: number;
  retailers: number;
  stores: number;
  offersCreated: number;
  offersPublished: number;
  offersExpired: number;
  claims: number;
  redemptions: number;
};

type RawCount = { total: bigint };
type RawBucket = { bucket: string; count: bigint };
type RawStatus = { status: string; count: bigint };

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async reports(period: AdminAnalyticsPeriod) {
    const now = new Date();
    const window = makeAnalyticsWindow(period, now);
    const [snapshot, currentActivity, previousActivity, earliest, customers, offers, redemptionTrends, claimStatuses, retailers, stores, categories, topOffers] = await Promise.all([
      this.snapshot(now),
      this.activity(window.current),
      window.previous ? this.activity(window.previous) : Promise.resolve(null),
      period === "all" ? this.earliestAnalyticsEvent() : Promise.resolve(null),
      this.customerBuckets(window.current, window.bucket),
      this.offerBuckets(window.current, window.bucket),
      this.redemptionBuckets(window.current, window.bucket),
      this.claimStatusBreakdown(window.current, now),
      this.retailerPerformance(window.current),
      this.storePerformance(window.current),
      this.categoryPerformance(window.current),
      this.offerPerformance(window.current),
    ]);

    const chartStart = window.current.start ? localDateKey(window.current.start) : earliest ? localDateKey(earliest) : null;
    const buckets = bucketKeys(chartStart, localDateKey(now), window.bucket);
    return {
      period,
      timeZone: ANALYTICS_TIME_ZONE,
      range: { from: window.current.start?.toISOString() ?? null, to: now.toISOString(), bucket: window.bucket },
      kpis: {
        customers: { total: snapshot.customers, currentPeriod: currentActivity.customers, previousPeriod: previousActivity?.customers ?? null },
        retailers: { total: snapshot.retailers, active: snapshot.activeRetailers, currentPeriod: currentActivity.retailers, previousPeriod: previousActivity?.retailers ?? null },
        stores: { total: snapshot.stores, verified: snapshot.verifiedStores, currentPeriod: currentActivity.stores, previousPeriod: previousActivity?.stores ?? null },
        offers: {
          published: snapshot.publishedOffers,
          active: snapshot.activeOffers,
          expired: snapshot.expiredOffers,
          createdInPeriod: currentActivity.offersCreated,
          publishedInPeriod: currentActivity.offersPublished,
          expiredInPeriod: currentActivity.offersExpired,
          previousCreated: previousActivity?.offersCreated ?? null,
          previousPublished: previousActivity?.offersPublished ?? null,
          previousExpired: previousActivity?.offersExpired ?? null,
        },
        claims: { total: snapshot.claims, currentPeriod: currentActivity.claims, previousPeriod: previousActivity?.claims ?? null },
        redemptions: { total: snapshot.redemptions, currentPeriod: currentActivity.redemptions, previousPeriod: previousActivity?.redemptions ?? null },
      },
      customerGrowth: fillSeries(customers, buckets, ["count"]),
      offerActivity: fillSeries(offers, buckets, ["created", "published", "expired"]),
      redemptionTrends: fillSeries(redemptionTrends, buckets, ["claims", "confirmedRedemptions"]),
      claimStatuses,
      retailerPerformance: retailers,
      storePerformance: stores,
      categoryPerformance: categories,
      offerPerformance: topOffers,
    };
  }

  private async snapshot(now: Date) {
    const rows = await this.prisma.$queryRaw<Array<{ totalCustomers: bigint; totalRetailers: bigint; activeRetailers: bigint; totalStores: bigint; verifiedStores: bigint; publishedOffers: bigint; activeOffers: bigint; expiredOffers: bigint; totalClaims: bigint; totalRedemptions: bigint }>>(Prisma.sql`
      SELECT
        (SELECT COUNT(DISTINCT u."id") FROM "users" u JOIN "user_account_roles" ar ON ar."user_id" = u."id" WHERE ar."role" = 'customer' AND u."status" <> 'deleted') AS "totalCustomers",
        (SELECT COUNT(*) FROM "retailers") AS "totalRetailers",
        (SELECT COUNT(*) FROM "retailers" WHERE "status" = 'active') AS "activeRetailers",
        (SELECT COUNT(*) FROM "stores") AS "totalStores",
        (SELECT COUNT(*) FROM "stores" WHERE "verified_at" IS NOT NULL) AS "verifiedStores",
        (SELECT COUNT(*) FROM "deals" WHERE "published_at" IS NOT NULL) AS "publishedOffers",
        (SELECT COUNT(*) FROM "deals" d JOIN "stores" s ON s."id" = d."store_id" JOIN "retailers" rt ON rt."id" = s."retailer_id"
          WHERE d."status" = 'published' AND d."published_at" IS NOT NULL AND d."moderation_hold_at" IS NULL
            AND d."starts_at" <= ${now} AND d."ends_at" > ${now} AND s."status" = 'active' AND rt."status" = 'active') AS "activeOffers",
        (SELECT COUNT(*) FROM "deals" WHERE "published_at" IS NOT NULL AND "ends_at" <= ${now}) AS "expiredOffers",
        (SELECT COUNT(*) FROM "redemption_codes") AS "totalClaims",
        (SELECT COUNT(*) FROM "redemptions") AS "totalRedemptions"
    `);
    const row = rows[0];
    return {
      customers: asNumber(row?.totalCustomers), retailers: asNumber(row?.totalRetailers), activeRetailers: asNumber(row?.activeRetailers),
      stores: asNumber(row?.totalStores), verifiedStores: asNumber(row?.verifiedStores), publishedOffers: asNumber(row?.publishedOffers),
      activeOffers: asNumber(row?.activeOffers), expiredOffers: asNumber(row?.expiredOffers), claims: asNumber(row?.totalClaims), redemptions: asNumber(row?.totalRedemptions),
    };
  }

  private async activity(range: Range): Promise<PeriodCounts> {
    const rows = await this.prisma.$queryRaw<Array<{ customers: bigint; retailers: bigint; stores: bigint; offersCreated: bigint; offersPublished: bigint; offersExpired: bigint; claims: bigint; redemptions: bigint }>>(Prisma.sql`
      SELECT
        (SELECT COUNT(DISTINCT u."id") FROM "users" u JOIN "user_account_roles" ar ON ar."user_id" = u."id"
          WHERE ar."role" = 'customer' AND u."status" <> 'deleted' AND ${timePredicate('u."created_at"', range)}) AS "customers",
        (SELECT COUNT(*) FROM "retailers" r WHERE ${timePredicate('r."created_at"', range)}) AS "retailers",
        (SELECT COUNT(*) FROM "stores" s WHERE ${timePredicate('s."created_at"', range)}) AS "stores",
        (SELECT COUNT(*) FROM "deals" d WHERE ${timePredicate('d."created_at"', range)}) AS "offersCreated",
        (SELECT COUNT(*) FROM "deals" d WHERE d."published_at" IS NOT NULL AND ${timePredicate('d."published_at"', range)}) AS "offersPublished",
        (SELECT COUNT(*) FROM "deals" d WHERE d."published_at" IS NOT NULL AND ${timePredicate('d."ends_at"', range)}) AS "offersExpired",
        (SELECT COUNT(*) FROM "redemption_codes" rc WHERE ${timePredicate('rc."issued_at"', range)}) AS "claims",
        (SELECT COUNT(*) FROM "redemptions" r WHERE ${timePredicate('r."redeemed_at"', range)}) AS "redemptions"
    `);
    const row = rows[0];
    return {
      customers: asNumber(row?.customers), retailers: asNumber(row?.retailers), stores: asNumber(row?.stores),
      offersCreated: asNumber(row?.offersCreated), offersPublished: asNumber(row?.offersPublished), offersExpired: asNumber(row?.offersExpired),
      claims: asNumber(row?.claims), redemptions: asNumber(row?.redemptions),
    };
  }

  private async customerBuckets(range: Range, unit: BucketUnit) {
    const bucket = bucketExpression('u."created_at"', unit);
    const rows = await this.prisma.$queryRaw<Array<{ bucket: string; count: bigint }>>(Prisma.sql`
      SELECT ${bucket} AS "bucket", COUNT(DISTINCT u."id") AS "count"
      FROM "users" u JOIN "user_account_roles" ar ON ar."user_id" = u."id"
      WHERE ar."role" = 'customer' AND u."status" <> 'deleted' AND ${timePredicate('u."created_at"', range)}
      GROUP BY 1 ORDER BY 1
    `);
    return rows.map((row) => ({ bucket: row.bucket, count: asNumber(row.count) }));
  }

  private async offerBuckets(range: Range, unit: BucketUnit) {
    const createdBucket = bucketExpression('d."created_at"', unit);
    const publishedBucket = bucketExpression('d."published_at"', unit);
    const expiredBucket = bucketExpression('d."ends_at"', unit);
    const rows = await this.prisma.$queryRaw<Array<{ bucket: string; created: bigint; published: bigint; expired: bigint }>>(Prisma.sql`
      WITH events AS (
        SELECT ${createdBucket} AS "bucket", 'created' AS "kind" FROM "deals" d WHERE ${timePredicate('d."created_at"', range)}
        UNION ALL
        SELECT ${publishedBucket} AS "bucket", 'published' AS "kind" FROM "deals" d WHERE d."published_at" IS NOT NULL AND ${timePredicate('d."published_at"', range)}
        UNION ALL
        SELECT ${expiredBucket} AS "bucket", 'expired' AS "kind" FROM "deals" d WHERE d."published_at" IS NOT NULL AND ${timePredicate('d."ends_at"', range)}
      )
      SELECT "bucket",
        COUNT(*) FILTER (WHERE "kind" = 'created') AS "created",
        COUNT(*) FILTER (WHERE "kind" = 'published') AS "published",
        COUNT(*) FILTER (WHERE "kind" = 'expired') AS "expired"
      FROM events GROUP BY "bucket" ORDER BY "bucket"
    `);
    return rows.map((row) => ({ bucket: row.bucket, created: asNumber(row.created), published: asNumber(row.published), expired: asNumber(row.expired) }));
  }

  private async redemptionBuckets(range: Range, unit: BucketUnit) {
    const claimBucket = bucketExpression('rc."issued_at"', unit);
    const redemptionBucket = bucketExpression('r."redeemed_at"', unit);
    const rows = await this.prisma.$queryRaw<Array<{ bucket: string; claims: bigint; confirmedRedemptions: bigint }>>(Prisma.sql`
      WITH events AS (
        SELECT ${claimBucket} AS "bucket", 'claim' AS "kind" FROM "redemption_codes" rc WHERE ${timePredicate('rc."issued_at"', range)}
        UNION ALL
        SELECT ${redemptionBucket} AS "bucket", 'redemption' AS "kind" FROM "redemptions" r WHERE ${timePredicate('r."redeemed_at"', range)}
      )
      SELECT "bucket",
        COUNT(*) FILTER (WHERE "kind" = 'claim') AS "claims",
        COUNT(*) FILTER (WHERE "kind" = 'redemption') AS "confirmedRedemptions"
      FROM events GROUP BY "bucket" ORDER BY "bucket"
    `);
    return rows.map((row) => ({ bucket: row.bucket, claims: asNumber(row.claims), confirmedRedemptions: asNumber(row.confirmedRedemptions) }));
  }

  private async claimStatusBreakdown(range: Range, now: Date) {
    const rows = await this.prisma.$queryRaw<Array<{ issued: bigint; redeemed: bigint; expired: bigint; revoked: bigint }>>(Prisma.sql`
      SELECT
        COUNT(*) FILTER (WHERE "status" = 'issued' AND "expires_at" > ${now}) AS "issued",
        COUNT(*) FILTER (WHERE "status" = 'redeemed') AS "redeemed",
        COUNT(*) FILTER (WHERE "status" = 'expired' OR ("status" = 'issued' AND "expires_at" <= ${now})) AS "expired",
        COUNT(*) FILTER (WHERE "status" = 'revoked') AS "revoked"
      FROM "redemption_codes" rc WHERE ${timePredicate('rc."issued_at"', range)}
    `);
    const row = rows[0];
    return { issued: asNumber(row?.issued), redeemed: asNumber(row?.redeemed), expired: asNumber(row?.expired), revoked: asNumber(row?.revoked) };
  }

  private async retailerPerformance(range: Range) {
    const created = timePredicate('d."created_at"', range);
    const published = timePredicate('d."published_at"', range);
    const expired = timePredicate('d."ends_at"', range);
    const redemptionRange = timePredicate('r."redeemed_at"', range);
    const rows = await this.prisma.$queryRaw<Array<{ id: string; name: string; status: string; redemptions: bigint; offersCreated: bigint; offersPublished: bigint; offersExpired: bigint }>>(Prisma.sql`
      WITH redemption_counts AS (
        SELECT s."retailer_id", COUNT(r."id") AS "redemptions"
        FROM "redemptions" r JOIN "stores" s ON s."id" = r."store_id"
        WHERE ${redemptionRange}
        GROUP BY s."retailer_id"
      ), offer_activity AS (
        SELECT s."retailer_id",
          COUNT(*) FILTER (WHERE ${created}) AS "offers_created",
          COUNT(*) FILTER (WHERE d."published_at" IS NOT NULL AND ${published}) AS "offers_published",
          COUNT(*) FILTER (WHERE d."published_at" IS NOT NULL AND ${expired}) AS "offers_expired"
        FROM "deals" d JOIN "stores" s ON s."id" = d."store_id"
        WHERE ${created} OR (d."published_at" IS NOT NULL AND ${published}) OR (d."published_at" IS NOT NULL AND ${expired})
        GROUP BY s."retailer_id"
      )
      SELECT r."id", r."display_name" AS "name", r."status"::text AS "status",
        COALESCE(rc."redemptions", 0) AS "redemptions",
        COALESCE(oa."offers_created", 0) AS "offersCreated",
        COALESCE(oa."offers_published", 0) AS "offersPublished",
        COALESCE(oa."offers_expired", 0) AS "offersExpired"
      FROM "retailers" r
      LEFT JOIN redemption_counts rc ON rc."retailer_id" = r."id"
      LEFT JOIN offer_activity oa ON oa."retailer_id" = r."id"
      WHERE COALESCE(rc."redemptions", 0) > 0 OR COALESCE(oa."offers_created", 0) > 0 OR COALESCE(oa."offers_published", 0) > 0 OR COALESCE(oa."offers_expired", 0) > 0
      ORDER BY COALESCE(rc."redemptions", 0) DESC, COALESCE(oa."offers_published", 0) DESC, r."display_name" ASC
      LIMIT 10
    `);
    return rows.map((row) => ({ id: row.id, name: row.name, status: row.status, redemptions: asNumber(row.redemptions), offersCreated: asNumber(row.offersCreated), offersPublished: asNumber(row.offersPublished), offersExpired: asNumber(row.offersExpired) }));
  }

  private async storePerformance(range: Range) {
    const created = timePredicate('d."created_at"', range);
    const published = timePredicate('d."published_at"', range);
    const expired = timePredicate('d."ends_at"', range);
    const rows = await this.prisma.$queryRaw<Array<{ id: string; name: string; city: string; retailerName: string; redemptions: bigint; offersCreated: bigint; offersPublished: bigint; offersExpired: bigint }>>(Prisma.sql`
      WITH redemption_counts AS (
        SELECT r."store_id", COUNT(r."id") AS "redemptions"
        FROM "redemptions" r WHERE ${timePredicate('r."redeemed_at"', range)} GROUP BY r."store_id"
      ), offer_activity AS (
        SELECT d."store_id",
          COUNT(*) FILTER (WHERE ${created}) AS "offers_created",
          COUNT(*) FILTER (WHERE d."published_at" IS NOT NULL AND ${published}) AS "offers_published",
          COUNT(*) FILTER (WHERE d."published_at" IS NOT NULL AND ${expired}) AS "offers_expired"
        FROM "deals" d
        WHERE ${created} OR (d."published_at" IS NOT NULL AND ${published}) OR (d."published_at" IS NOT NULL AND ${expired})
        GROUP BY d."store_id"
      )
      SELECT s."id", s."name", s."city", rt."display_name" AS "retailerName",
        COALESCE(rc."redemptions", 0) AS "redemptions",
        COALESCE(oa."offers_created", 0) AS "offersCreated",
        COALESCE(oa."offers_published", 0) AS "offersPublished",
        COALESCE(oa."offers_expired", 0) AS "offersExpired"
      FROM "stores" s JOIN "retailers" rt ON rt."id" = s."retailer_id"
      LEFT JOIN redemption_counts rc ON rc."store_id" = s."id"
      LEFT JOIN offer_activity oa ON oa."store_id" = s."id"
      WHERE COALESCE(rc."redemptions", 0) > 0 OR COALESCE(oa."offers_created", 0) > 0 OR COALESCE(oa."offers_published", 0) > 0 OR COALESCE(oa."offers_expired", 0) > 0
      ORDER BY COALESCE(rc."redemptions", 0) DESC, COALESCE(oa."offers_published", 0) DESC, s."name" ASC
      LIMIT 10
    `);
    return rows.map((row) => ({ id: row.id, name: row.name, city: row.city, retailerName: row.retailerName, redemptions: asNumber(row.redemptions), offersCreated: asNumber(row.offersCreated), offersPublished: asNumber(row.offersPublished), offersExpired: asNumber(row.offersExpired) }));
  }

  private async categoryPerformance(range: Range) {
    const offers = timePredicate('d."created_at"', range);
    const claims = timePredicate('rc."issued_at"', range);
    const redemptions = timePredicate('r."redeemed_at"', range);
    const rows = await this.prisma.$queryRaw<Array<{ id: string | null; name: string; offers: bigint; claims: bigint; redemptions: bigint }>>(Prisma.sql`
      WITH offer_counts AS (
        SELECT d."category_id", COUNT(d."id") AS "offers"
        FROM "deals" d WHERE ${offers} GROUP BY d."category_id"
      ), claim_counts AS (
        SELECT d."category_id", COUNT(rc."id") AS "claims"
        FROM "redemption_codes" rc JOIN "deals" d ON d."id" = rc."deal_id"
        WHERE ${claims} GROUP BY d."category_id"
      ), redemption_counts AS (
        SELECT d."category_id", COUNT(r."id") AS "redemptions"
        FROM "redemptions" r JOIN "deals" d ON d."id" = r."deal_id"
        WHERE ${redemptions} GROUP BY d."category_id"
      ), category_ids AS (
        SELECT "category_id" FROM offer_counts UNION SELECT "category_id" FROM claim_counts UNION SELECT "category_id" FROM redemption_counts
      )
      SELECT ci."category_id" AS "id", COALESCE(c."name", 'Uncategorized') AS "name",
        COALESCE(oc."offers", 0) AS "offers", COALESCE(cc."claims", 0) AS "claims", COALESCE(rc."redemptions", 0) AS "redemptions"
      FROM category_ids ci LEFT JOIN "categories" c ON c."id" = ci."category_id"
      LEFT JOIN offer_counts oc ON oc."category_id" IS NOT DISTINCT FROM ci."category_id"
      LEFT JOIN claim_counts cc ON cc."category_id" IS NOT DISTINCT FROM ci."category_id"
      LEFT JOIN redemption_counts rc ON rc."category_id" IS NOT DISTINCT FROM ci."category_id"
      ORDER BY COALESCE(rc."redemptions", 0) DESC, COALESCE(oc."offers", 0) DESC, "name" ASC
    `);
    return rows.map((row) => ({ id: row.id, name: row.name, offers: asNumber(row.offers), claims: asNumber(row.claims), redemptions: asNumber(row.redemptions) }));
  }

  private async offerPerformance(range: Range) {
    const claims = timePredicate('rc."issued_at"', range);
    const redemptions = timePredicate('r."redeemed_at"', range);
    const created = timePredicate('d."created_at"', range);
    const published = timePredicate('d."published_at"', range);
    const expired = timePredicate('d."ends_at"', range);
    const rows = await this.prisma.$queryRaw<Array<{ id: string; title: string; status: string; storeName: string; retailerName: string; categoryName: string | null; claims: bigint; redemptions: bigint }>>(Prisma.sql`
      WITH claim_counts AS (
        SELECT rc."deal_id", COUNT(rc."id") AS "claims" FROM "redemption_codes" rc WHERE ${claims} GROUP BY rc."deal_id"
      ), redemption_counts AS (
        SELECT r."deal_id", COUNT(r."id") AS "redemptions" FROM "redemptions" r WHERE ${redemptions} GROUP BY r."deal_id"
      ), active_deals AS (
        SELECT "deal_id" AS "id" FROM claim_counts UNION SELECT "deal_id" FROM redemption_counts
        UNION SELECT d."id" FROM "deals" d WHERE ${created} OR (d."published_at" IS NOT NULL AND ${published})
        UNION SELECT d."id" FROM "deals" d WHERE d."published_at" IS NOT NULL AND ${expired}
      )
      SELECT d."id", d."title", d."status"::text AS "status", s."name" AS "storeName", rt."display_name" AS "retailerName", c."name" AS "categoryName",
        COALESCE(cc."claims", 0) AS "claims", COALESCE(rc."redemptions", 0) AS "redemptions"
      FROM active_deals ad JOIN "deals" d ON d."id" = ad."id"
      JOIN "stores" s ON s."id" = d."store_id" JOIN "retailers" rt ON rt."id" = s."retailer_id"
      LEFT JOIN "categories" c ON c."id" = d."category_id"
      LEFT JOIN claim_counts cc ON cc."deal_id" = d."id" LEFT JOIN redemption_counts rc ON rc."deal_id" = d."id"
      ORDER BY COALESCE(rc."redemptions", 0) DESC, COALESCE(cc."claims", 0) DESC, d."title" ASC
      LIMIT 50
    `);
    return rows.map((row) => ({ id: row.id, title: row.title, status: row.status, storeName: row.storeName, retailerName: row.retailerName, categoryName: row.categoryName, claims: asNumber(row.claims), redemptions: asNumber(row.redemptions) }));
  }

  private async earliestAnalyticsEvent(): Promise<Date | null> {
    const rows = await this.prisma.$queryRaw<Array<{ first_event: Date | null }>>(Prisma.sql`
      SELECT MIN("event_at") AS "first_event" FROM (
        SELECT u."created_at" AS "event_at" FROM "users" u JOIN "user_account_roles" ar ON ar."user_id" = u."id" WHERE ar."role" = 'customer' AND u."status" <> 'deleted'
        UNION ALL SELECT "created_at" FROM "deals"
        UNION ALL SELECT "published_at" FROM "deals" WHERE "published_at" IS NOT NULL
        UNION ALL SELECT "issued_at" FROM "redemption_codes"
        UNION ALL SELECT "redeemed_at" FROM "redemptions"
      ) events
    `);
    return rows[0]?.first_event ?? null;
  }
}
