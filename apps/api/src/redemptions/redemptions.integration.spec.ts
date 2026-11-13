import "reflect-metadata";
import "dotenv/config";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { after, before, beforeEach, test } from "node:test";
import {
  AccountRole,
  DealStatus,
  OfferType,
  RedemptionCodeStatus,
  RetailerStatus,
  StoreStatus,
} from "../generated/prisma/enums.js";
import { PrismaService } from "../database/prisma.service.js";
import { AuthService } from "../auth/auth.service.js";
import { RetailersService } from "../retailers/retailers.service.js";
import type { AuthPrincipal } from "../auth/auth.types.js";
import { RedemptionsService } from "./redemptions.service.js";
import { RedemptionPageQueryDto } from "./dto/redemption.dto.js";

const prisma = new PrismaService();
const auth = new AuthService(prisma);
const retailers = new RetailersService(prisma);
const redemptions = new RedemptionsService(prisma);
const suffix = randomUUID();
const userIds: string[] = [];
let customer!: AuthPrincipal;
let retailerUser!: AuthPrincipal;
let verifier!: AuthPrincipal;
let retailerId = "";
let storeId = "";
let categoryId = "";
let dealId = "";

before(async () => {
  await prisma.$connect();
  customer = await auth.resolveIdentity({ providerId: "redemption-test", subject: `customer-${suffix}`, email: `customer-${suffix}@example.invalid`, emailVerified: true });
  retailerUser = await auth.resolveIdentity({ providerId: "redemption-test", subject: `retailer-${suffix}`, email: `retailer-${suffix}@example.invalid`, emailVerified: true });
  verifier = await auth.resolveIdentity({ providerId: "redemption-test", subject: `verifier-${suffix}`, email: `verifier-${suffix}@example.invalid`, emailVerified: true });
  userIds.push(customer.userId, retailerUser.userId, verifier.userId);

  categoryId = (await prisma.category.create({ data: { slug: `redemption-${suffix.slice(0, 8)}`, name: `Redemption ${suffix.slice(0, 8)}` } })).id;
  const retailer = await retailers.createRetailer(retailerUser, { displayName: `Redemption ${suffix.slice(0, 8)}` });
  retailerId = retailer.id;
  retailerUser = { ...retailerUser, roles: [...new Set([...retailerUser.roles, AccountRole.RETAILER])] };
  const store = await retailers.createStore(retailerUser, retailerId, {
    slug: `redemption-${suffix.slice(0, 8)}`,
    name: "Redemption integration store",
    categoryId,
    city: "Ahmedabad",
    region: "Gujarat",
    countryCode: "IN",
    timezone: "Asia/Kolkata",
    latitude: 23.0225,
    longitude: 72.5714,
  });
  storeId = store.id;
  await prisma.retailer.update({ where: { id: retailerId }, data: { status: RetailerStatus.ACTIVE } });
  await prisma.store.update({ where: { id: storeId }, data: { status: StoreStatus.ACTIVE, verifiedAt: new Date(), verifiedByUserId: verifier.userId } });

  const now = Date.now();
  const deal = await prisma.deal.create({ data: {
    storeId,
    createdByUserId: retailerUser.userId,
    categoryId,
    slug: `redemption-${suffix.slice(0, 8)}`,
    title: "Redemption integration offer",
    terms: "Integration test only.",
    offerType: OfferType.PERCENTAGE,
    discountBps: 1000,
    startsAt: new Date(now - 60_000),
    endsAt: new Date(now + 60 * 60_000),
    storeTimezone: "Asia/Kolkata",
    status: DealStatus.PUBLISHED,
    publishedAt: new Date(now - 30_000),
    maxRedemptions: 3,
    perCustomerLimit: 2,
  } });
  dealId = deal.id;
});

beforeEach(async () => {
  await prisma.$transaction(async (tx) => {
    if (dealId) {
      await tx.redemption.deleteMany({ where: { dealId } });
      await tx.redemptionCode.deleteMany({ where: { dealId } });
      await tx.deal.update({ where: { id: dealId }, data: { redemptionCount: 0, maxRedemptions: 3 } });
    }
    if (retailerId) await tx.auditLog.deleteMany({ where: { retailerId } });
  });
});

after(async () => {
  if (dealId || retailerId || userIds.length) {
    await prisma.$transaction(async (tx) => {
      await tx.auditLog.deleteMany({ where: { OR: [{ retailerId }, { actorUserId: { in: userIds } }] } });
      if (dealId) {
        await tx.redemption.deleteMany({ where: { dealId } });
        await tx.redemptionCode.deleteMany({ where: { dealId } });
        await tx.deal.deleteMany({ where: { id: dealId } });
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

function httpStatus(error: unknown) {
  return typeof error === "object" && error !== null && "getStatus" in error
    ? (error as { getStatus(): number }).getStatus()
    : undefined;
}

function httpMessage(error: unknown) {
  if (typeof error !== "object" || error === null || !("getResponse" in error)) return "";
  const response = (error as { getResponse(): unknown }).getResponse();
  if (typeof response === "string") return response;
  return typeof response === "object" && response !== null && "message" in response
    ? String((response as { message: unknown }).message)
    : "";
}

test("customer claim issue stores only a SHA-256 hash and repeat requests reuse the outstanding claim", async () => {
  const issued = await redemptions.claim(customer, dealId, { requestId: randomUUID() });
  const credential = issued.claim.credential;
  assert.ok(credential);
  assert.equal(Buffer.from(credential, "base64url").length, 32);

  const stored = await prisma.redemptionCode.findUniqueOrThrow({ where: { id: issued.claim.id } });
  assert.deepEqual(Buffer.from(stored.tokenHash), createHash("sha256").update(credential).digest());
  assert.equal(Buffer.from(stored.tokenHash).toString("utf8").includes(credential), false);
  assert.equal(stored.expiresAt.getTime() - stored.issuedAt.getTime() <= 5 * 60_000, true);

  const repeated = await redemptions.claim(customer, dealId);
  assert.equal(repeated.replayed, true);
  assert.equal(repeated.claim.id, issued.claim.id);
  assert.equal("credential" in repeated.claim, false, "raw credentials are returned only on issue or rotation");
  assert.equal(await prisma.redemptionCode.count({ where: { dealId, customerUserId: customer.userId, status: RedemptionCodeStatus.ISSUED } }), 1);
});

test("customer claim listing returns scoped metadata without exposing credentials", async () => {
  const issued = await redemptions.claim(customer, dealId);
  const query = Object.assign(new RedemptionPageQueryDto(), { page: 1, limit: 50 });
  const page = await redemptions.listCustomerClaims(customer, query);
  const item = page.items.find((claim) => claim.id === issued.claim.id);
  assert.ok(item);
  assert.equal(item.status, RedemptionCodeStatus.ISSUED);
  assert.equal("credential" in item, false);
  assert.equal(item.storeId, storeId);
});

test("retailer validation is read-only, rotation invalidates the old credential, and cancellation is audited", async () => {
  const issued = await redemptions.claim(customer, dealId);
  const oldCredential = issued.claim.credential!;
  const now = Date.now();
  await prisma.redemptionCode.update({
    where: { id: issued.claim.id },
    data: { issuedAt: new Date(now - 10 * 60_000), expiresAt: new Date(now - 6 * 60_000) },
  });

  const rotated = await redemptions.rotate(customer, issued.claim.id, { requestId: randomUUID() });
  assert.ok(rotated.credential);
  assert.notEqual(rotated.credential, oldCredential);
  assert.equal(Buffer.from((await prisma.redemptionCode.findUniqueOrThrow({ where: { id: rotated.id } })).tokenHash)
    .equals(createHash("sha256").update(rotated.credential!).digest()), true);
  await assert.rejects(
    redemptions.validateRetailer(retailerUser, retailerId, storeId, oldCredential),
    (error: unknown) => httpStatus(error) === 404,
  );

  const codeBefore = await prisma.redemptionCode.findUniqueOrThrow({ where: { id: rotated.id } });
  const dealBefore = await prisma.deal.findUniqueOrThrow({ where: { id: dealId } });
  const preview = await redemptions.validateRetailer(retailerUser, retailerId, storeId, rotated.credential!);
  assert.equal(preview.status, "available");
  assert.equal(preview.offer.discountBps, 1000);
  assert.equal("customer" in preview, false);
  assert.equal((await prisma.redemptionCode.findUniqueOrThrow({ where: { id: rotated.id } })).status, codeBefore.status);
  assert.equal((await prisma.deal.findUniqueOrThrow({ where: { id: dealId } })).redemptionCount, dealBefore.redemptionCount);

  const cancelled = await redemptions.cancel(customer, rotated.id, { requestId: randomUUID() });
  assert.equal(cancelled.status, RedemptionCodeStatus.REVOKED);
  assert.equal((await redemptions.cancel(customer, rotated.id)).status, RedemptionCodeStatus.REVOKED);
  await assert.rejects(
    redemptions.validateRetailer(retailerUser, retailerId, storeId, rotated.credential!),
    (error: unknown) => httpStatus(error) === 409 && httpMessage(error) === "Credential has been cancelled.",
  );
  await assert.rejects(
    redemptions.confirmRetailer(retailerUser, retailerId, storeId, rotated.credential!, randomUUID()),
    (error: unknown) => httpStatus(error) === 409 && httpMessage(error) === "Credential has been cancelled.",
  );
  assert.ok(await prisma.auditLog.findFirst({ where: { entityType: "redemption_claim", entityId: rotated.id, action: "redemption_claim.cancelled" } }));
  assert.ok(await prisma.auditLog.findFirst({ where: { entityType: "redemption_claim", entityId: rotated.id, action: "redemption_claim.credential_rotated" } }));
});

test("retailer validation rejects invalid, expired, and already redeemed credentials without redeeming", async () => {
  await assert.rejects(
    redemptions.validateRetailer(retailerUser, retailerId, storeId, "a".repeat(43)),
    (error: unknown) => httpStatus(error) === 404,
  );

  const expired = await redemptions.claim(customer, dealId);
  const expiredAt = new Date(Date.now() - 1_000);
  await prisma.redemptionCode.update({ where: { id: expired.claim.id }, data: { issuedAt: new Date(expiredAt.getTime() - 60_000), expiresAt: expiredAt } });
  await assert.rejects(
    redemptions.validateRetailer(retailerUser, retailerId, storeId, expired.claim.credential!),
    (error: unknown) => httpStatus(error) === 409 && httpMessage(error) === "Credential has expired.",
  );
  await assert.rejects(
    redemptions.confirmRetailer(retailerUser, retailerId, storeId, expired.claim.credential!, randomUUID()),
    (error: unknown) => httpStatus(error) === 409 && httpMessage(error) === "Credential has expired.",
  );

  const issued = await redemptions.claim(customer, dealId);
  await redemptions.confirmRetailer(retailerUser, retailerId, storeId, issued.claim.credential!, randomUUID());
  const dealAfterConfirm = await prisma.deal.findUniqueOrThrow({ where: { id: dealId } });
  await assert.rejects(
    redemptions.validateRetailer(retailerUser, retailerId, storeId, issued.claim.credential!),
    (error: unknown) => httpStatus(error) === 409 && httpMessage(error) === "Credential has already been redeemed.",
  );
  await assert.rejects(
    redemptions.confirmRetailer(retailerUser, retailerId, storeId, issued.claim.credential!, randomUUID()),
    (error: unknown) => httpStatus(error) === 409 && httpMessage(error) === "Credential has already been redeemed.",
  );
  assert.equal((await prisma.deal.findUniqueOrThrow({ where: { id: dealId } })).redemptionCount, dealAfterConfirm.redemptionCount);
});

test("confirmation is atomic, idempotent under concurrent retries, and permits sequential claims up to the customer cap", async () => {
  const first = await redemptions.claim(customer, dealId);
  const credential = first.claim.credential!;
  const idempotencyKey = randomUUID();
  const results = await Promise.all([
    redemptions.confirmRetailer(retailerUser, retailerId, storeId, credential, idempotencyKey, { requestId: randomUUID() }),
    redemptions.confirmRetailer(retailerUser, retailerId, storeId, credential, idempotencyKey, { requestId: randomUUID() }),
  ]);
  assert.equal(results[0].id, results[1].id);
  assert.equal(await prisma.redemption.count({ where: { dealId, customerUserId: customer.userId } }), 1);
  assert.equal((await prisma.deal.findUniqueOrThrow({ where: { id: dealId } })).redemptionCount, 1);
  assert.equal((await prisma.redemptionCode.findUniqueOrThrow({ where: { id: first.claim.id } })).status, RedemptionCodeStatus.REDEEMED);
  assert.ok(await prisma.auditLog.findFirst({ where: { entityType: "redemption", entityId: results[0].id, action: "redemption.confirmed" } }));

  const second = await redemptions.claim(customer, dealId);
  const secondResult = await redemptions.confirmRetailer(retailerUser, retailerId, storeId, second.claim.credential!, randomUUID());
  assert.equal(secondResult.customerRedemptionNumber, 2);
  assert.equal((await prisma.deal.findUniqueOrThrow({ where: { id: dealId } })).redemptionCount, 2);
  await assert.rejects(
    redemptions.claim(customer, dealId),
    (error: unknown) => httpStatus(error) === 409,
  );
});

test("per-customer limits stay isolated while concurrent confirmations respect global capacity", async () => {
  await prisma.deal.update({ where: { id: dealId }, data: { maxRedemptions: 4 } });
  const customerB = await auth.resolveIdentity({ providerId: "redemption-test", subject: `customer-b-${suffix}`, email: `customer-b-${suffix}@example.invalid`, emailVerified: true });
  const customerC = await auth.resolveIdentity({ providerId: "redemption-test", subject: `customer-c-${suffix}`, email: `customer-c-${suffix}@example.invalid`, emailVerified: true });
  const customerD = await auth.resolveIdentity({ providerId: "redemption-test", subject: `customer-d-${suffix}`, email: `customer-d-${suffix}@example.invalid`, emailVerified: true });
  userIds.push(customerB.userId, customerC.userId, customerD.userId);

  const confirm = async (credential: string) => redemptions.confirmRetailer(
    retailerUser, retailerId, storeId, credential, randomUUID(), { requestId: randomUUID() },
  );
  const firstA = await redemptions.claim(customer, dealId);
  await confirm(firstA.claim.credential!);

  const firstB = await redemptions.claim(customerB, dealId);
  await confirm(firstB.claim.credential!);
  assert.equal(await prisma.redemption.count({ where: { dealId, customerUserId: customerB.userId } }), 1);

  const firstC = await redemptions.claim(customerC, dealId);
  assert.ok(firstC.claim.credential, "a different customer can claim while global capacity remains");

  const secondA = await redemptions.claim(customer, dealId);
  await confirm(secondA.claim.credential!);
  assert.equal(await prisma.redemption.count({ where: { dealId, customerUserId: customer.userId } }), 2);
  await assert.rejects(
    redemptions.claim(customer, dealId),
    (error: unknown) => httpStatus(error) === 409 && httpMessage(error) === "You have reached this offer's redemption limit.",
  );

  const firstD = await redemptions.claim(customerD, dealId);
  const confirmations = await Promise.allSettled([
    confirm(firstC.claim.credential!),
    confirm(firstD.claim.credential!),
  ]);
  assert.equal(confirmations.filter((result) => result.status === "fulfilled").length, 1);
  const rejected = confirmations.find((result) => result.status === "rejected");
  assert.ok(rejected && rejected.status === "rejected");
  assert.equal(httpStatus(rejected.reason), 409);
  const persistedDeal = await prisma.deal.findUniqueOrThrow({ where: { id: dealId } });
  assert.equal(persistedDeal.redemptionCount, persistedDeal.maxRedemptions);
  assert.equal(await prisma.redemption.count({ where: { dealId } }), 4);
});

test("retailer tenant scope and admin inspection use existing redemption permission data", async () => {
  const issued = await redemptions.claim(customer, dealId);
  await assert.rejects(
    redemptions.validateRetailer(customer, retailerId, storeId, "a".repeat(43)),
    (error: unknown) => httpStatus(error) === 403,
  );
  await assert.rejects(
    redemptions.validateRetailer(retailerUser, retailerId, randomUUID(), issued.claim.credential!),
    (error: unknown) => httpStatus(error) === 404,
  );
  await assert.rejects(
    redemptions.validateRetailer(retailerUser, randomUUID(), storeId, issued.claim.credential!),
    (error: unknown) => httpStatus(error) === 403,
  );
  const query = Object.assign(new RedemptionPageQueryDto(), { page: 1, limit: 20 });
  assert.equal((await redemptions.adminClaims(query)).items.some((item) => item.id === issued.claim.id), true);
});
