import "reflect-metadata";
import "dotenv/config";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import { OfferType, RedemptionCodeStatus } from "./generated/prisma/enums.js";
import { PrismaService } from "./database/prisma.service.js";

const prisma = new PrismaService();
const suffix = randomUUID();
const userId = randomUUID();
const retailerId = randomUUID();
const storeId = randomUUID();
const dealId = randomUUID();

const preflightSql = `
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "redemption_codes"
    WHERE "status" = 'issued'::"redemption_code_status"
    GROUP BY "deal_id", "customer_user_id"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION
      'Cannot add the one-issued-redemption-code index: duplicate issued codes exist for a customer and deal.';
  END IF;
END;
$$;
`;

before(async () => {
  await prisma.$connect();
  await prisma.user.create({ data: {
    id: userId,
    authProvider: "redemption-constraint-test",
    authSubject: suffix,
  } });
  await prisma.retailer.create({ data: {
    id: retailerId,
    displayName: `Redemption constraint ${suffix.slice(0, 8)}`,
    createdByUserId: userId,
  } });
  await prisma.store.create({ data: {
    id: storeId,
    retailerId,
    slug: `redemption-${suffix.slice(0, 8)}`,
    name: "Redemption constraint test store",
    city: "Ahmedabad",
    region: "Gujarat",
    countryCode: "IN",
    timezone: "Asia/Kolkata",
  } });
  await prisma.deal.create({ data: {
    id: dealId,
    storeId,
    createdByUserId: userId,
    slug: `redemption-${suffix.slice(0, 8)}`,
    title: "Redemption constraint test offer",
    terms: "Integration test only.",
    offerType: OfferType.PERCENTAGE,
    discountBps: 1000,
    startsAt: new Date(Date.now() - 60_000),
    endsAt: new Date(Date.now() + 60 * 60_000),
    storeTimezone: "Asia/Kolkata",
  } });
});

after(async () => {
  await prisma.$transaction(async (tx) => {
    await tx.redemptionCode.deleteMany({ where: { dealId } });
    await tx.deal.deleteMany({ where: { id: dealId } });
    await tx.store.deleteMany({ where: { id: storeId } });
    await tx.retailer.deleteMany({ where: { id: retailerId } });
    await tx.user.deleteMany({ where: { id: userId } });
  });
  await prisma.$disconnect();
});

function codeData(status: RedemptionCodeStatus, offsetMs = 0) {
  const issuedAt = new Date(Date.now() + offsetMs);
  const expiresAt = new Date(issuedAt.getTime() + 4 * 60_000);
  return {
    dealId,
    customerUserId: userId,
    tokenHash: randomBytes(32),
    status,
    issuedAt,
    expiresAt,
    ...(status === RedemptionCodeStatus.REDEEMED
      ? { redeemedAt: new Date(issuedAt.getTime() + 60_000) }
      : {}),
  };
}

test("migration is recorded and the partial unique index has the issued predicate", async () => {
  const migrations = await prisma.$queryRaw<Array<{ migration_name: string; finished_at: Date | null; rolled_back_at: Date | null }>>`
    SELECT migration_name, finished_at, rolled_back_at
    FROM "_prisma_migrations"
    WHERE migration_name = '20261113120000_one_issued_redemption_code_per_customer_deal'
  `;
  assert.equal(migrations.length, 1);
  assert.ok(migrations[0]?.finished_at);
  assert.equal(migrations[0]?.rolled_back_at, null);

  const indexes = await prisma.$queryRaw<Array<{ indexdef: string }>>`
    SELECT indexdef
    FROM pg_indexes
    WHERE schemaname = current_schema()
      AND indexname = 'redemption_codes_one_issued_per_deal_customer_key'
  `;
  assert.equal(indexes.length, 1);
  const definition = indexes[0]!.indexdef.toLowerCase();
  assert.match(definition, /create unique index/);
  assert.match(definition, /on .*redemption_codes.*\(deal_id, customer_user_id\)/);
  assert.match(definition, /where \(status = 'issued'::redemption_code_status\)/);
});

test("multiple redeemed, expired, and revoked historical codes are allowed for one customer and deal", async () => {
  const now = Date.now();
  await prisma.redemptionCode.createMany({ data: [
    { ...codeData(RedemptionCodeStatus.REDEEMED), issuedAt: new Date(now - 4 * 60_000), expiresAt: new Date(now + 60_000), redeemedAt: new Date(now - 60_000) },
    { ...codeData(RedemptionCodeStatus.EXPIRED), issuedAt: new Date(now - 10 * 60_000), expiresAt: new Date(now - 6 * 60_000) },
    { ...codeData(RedemptionCodeStatus.REVOKED), issuedAt: new Date(now - 4 * 60_000), expiresAt: new Date(now + 60_000) },
  ] });

  assert.equal(await prisma.redemptionCode.count({ where: { dealId, customerUserId: userId } }), 3);
});

test("the migration preflight rejects duplicate issued rows without changing either row", async () => {
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`CREATE TEMP TABLE "redemption_codes" (
      "deal_id" uuid NOT NULL,
      "customer_user_id" uuid NOT NULL,
      "status" "redemption_code_status" NOT NULL,
      "marker" text NOT NULL
    ) ON COMMIT DROP`;
    await tx.$executeRaw`INSERT INTO pg_temp."redemption_codes" ("deal_id", "customer_user_id", "status", "marker")
      VALUES (${dealId}::uuid, ${userId}::uuid, 'issued', 'first'),
             (${dealId}::uuid, ${userId}::uuid, 'issued', 'second')`;
    await tx.$executeRawUnsafe("SAVEPOINT redemption_preflight");

    let failure: unknown;
    try {
      await tx.$executeRawUnsafe(preflightSql);
    } catch (error) {
      failure = error;
      await tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT redemption_preflight");
    }
    assert.ok(failure, "duplicate issued rows must make the migration preflight fail");
    assert.match(String(failure), /duplicate issued codes exist/i);

    const rows = await tx.$queryRaw<Array<{ marker: string }>>`
      SELECT marker FROM pg_temp."redemption_codes" ORDER BY marker
    `;
    assert.deepEqual(rows.map(({ marker }) => marker), ["first", "second"]);
  });
});

test("concurrent inserts cannot create two issued codes for one customer and deal", async () => {
  const results = await Promise.allSettled([
    prisma.redemptionCode.create({ data: codeData(RedemptionCodeStatus.ISSUED) }),
    prisma.redemptionCode.create({ data: codeData(RedemptionCodeStatus.ISSUED, 1) }),
  ]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  const rejected = results.find((result) => result.status === "rejected");
  assert.ok(rejected && rejected.status === "rejected");
  assert.equal((rejected.reason as { code?: string }).code, "P2002");
  assert.equal(await prisma.redemptionCode.count({ where: { dealId, customerUserId: userId, status: RedemptionCodeStatus.ISSUED } }), 1);
});
