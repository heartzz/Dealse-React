import "reflect-metadata";
import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import { AccountRole, AdminAccountStatus, AdminPermissionKey, AdminRole, MembershipRole, MembershipStatus, RetailerStatus, StoreStatus } from "../generated/prisma/enums.js";
import { PrismaService } from "../database/prisma.service.js";
import { AuthService } from "../auth/auth.service.js";
import type { AuthPrincipal } from "../auth/auth.types.js";
import { DealsService } from "../deals/deals.service.js";
import { RetailersService } from "../retailers/retailers.service.js";
import { AdminService } from "./admin.service.js";

const prisma = new PrismaService();
const auth = new AuthService(prisma);
const retailers = new RetailersService(prisma);
const admin = new AdminService(prisma, {} as DealsService);
const suffix = randomUUID();
let adminActor!: AuthPrincipal;
let retailerOwner!: AuthPrincipal;
let retailerId = "";
const storeIds: string[] = [];

function hasStatus(status: number, message?: string) {
  return (error: unknown) => {
    if (typeof error !== "object" || error === null || !("getStatus" in error) || typeof error.getStatus !== "function") return false;
    const matchesStatus = error.getStatus() === status;
    const response = "getResponse" in error && typeof error.getResponse === "function" ? error.getResponse() : undefined;
    const responseMessage = typeof response === "object" && response !== null && "message" in response ? response.message : undefined;
    return matchesStatus && (message === undefined || (typeof responseMessage === "string" && responseMessage.includes(message)));
  };
}

before(async () => {
  await prisma.$connect();
  adminActor = await auth.resolveIdentity({ providerId: "store-verification-test", subject: `admin-${suffix}`, email: `admin-store-verification-${suffix}@example.invalid`, emailVerified: true, assuranceLevel: "aal2" });
  retailerOwner = await auth.resolveIdentity({ providerId: "store-verification-test", subject: `owner-${suffix}`, email: `owner-store-verification-${suffix}@example.invalid`, emailVerified: true });
  await prisma.userAccountRole.upsert({ where: { userId_role: { userId: adminActor.userId, role: AccountRole.ADMIN } }, create: { userId: adminActor.userId, role: AccountRole.ADMIN }, update: {} });
  await prisma.adminAccount.create({ data: { userId: adminActor.userId, role: AdminRole.ADMIN, status: AdminAccountStatus.ACTIVE, acceptedAt: new Date() } });
  await prisma.adminPermissionGrant.create({ data: { userId: adminActor.userId, permission: AdminPermissionKey.STORES_VERIFY } });
  retailerId = (await prisma.retailer.create({ data: { displayName: `Store verification ${suffix}`, status: RetailerStatus.PENDING, createdByUserId: adminActor.userId } })).id;
  await prisma.retailerMembership.create({ data: { retailerId, userId: retailerOwner.userId, role: MembershipRole.OWNER, status: MembershipStatus.ACTIVE } });
});

after(async () => {
  const userIds = [adminActor?.userId, retailerOwner?.userId].filter((id): id is string => Boolean(id));
  if (userIds.length) await prisma.$transaction(async (tx) => {
    await tx.auditLog.deleteMany({ where: { OR: [{ actorUserId: { in: userIds } }, ...(retailerId ? [{ retailerId }] : []), ...(storeIds.length ? [{ entityType: "store", entityId: { in: storeIds } }] : [])] } });
    if (storeIds.length) await tx.store.deleteMany({ where: { id: { in: storeIds } } });
    if (retailerId) await tx.retailerMembership.deleteMany({ where: { retailerId } });
    if (retailerId) await tx.retailer.deleteMany({ where: { id: retailerId } });
    await tx.adminPermissionGrant.deleteMany({ where: { userId: { in: userIds } } });
    await tx.adminAccount.deleteMany({ where: { userId: { in: userIds } } });
    await tx.userAccountRole.deleteMany({ where: { userId: { in: userIds } } });
    await tx.userProfile.deleteMany({ where: { userId: { in: userIds } } });
    await tx.user.deleteMany({ where: { id: { in: userIds } } });
  });
  await prisma.$disconnect();
});

test("store verification requires the saved map point and still respects retailer approval", async () => {
  const addressOnly = await retailers.createStore(retailerOwner, retailerId, {
    slug: `address-only-${suffix}`, name: "Address only test", addressLine1: "60, Avanish Society, C.T.M, Ahmedabad",
    locality: "CTM", city: "Ahmedabad", region: "Gujarat", countryCode: "IN", timezone: "Asia/Kolkata",
  });
  storeIds.push(addressOnly.id);
  assert.equal((await prisma.$queryRaw<Array<{ hasLocation: boolean }>>`SELECT "location" IS NOT NULL AS "hasLocation" FROM "stores" WHERE "id" = ${addressOnly.id}::uuid`)[0]?.hasLocation, false);

  await assert.rejects(() => admin.verifyStore(adminActor, addressOnly.id), hasStatus(409, "Approve the retailer"));
  await admin.approveRetailer(adminActor, retailerId);
  await assert.rejects(() => admin.verifyStore(adminActor, addressOnly.id), hasStatus(409, "map coordinates"));
  assert.equal((await prisma.store.findUniqueOrThrow({ where: { id: addressOnly.id } })).status, StoreStatus.DRAFT, "address-only store remains unverified");

  await assert.rejects(() => retailers.updateStore(retailerOwner, retailerId, addressOnly.id, { latitude: 23.0225 }), hasStatus(400, "updated together"));
  const saved = await retailers.updateStore(retailerOwner, retailerId, addressOnly.id, { latitude: 23.0225, longitude: 72.5714 });
  assert.equal(saved.latitude, 23.0225);
  assert.equal(saved.longitude, 72.5714);
  const [persisted] = await prisma.$queryRaw<Array<{ longitude: number; latitude: number; hasLocation: boolean }>>`SELECT ST_X("location"::geometry) AS longitude, ST_Y("location"::geometry) AS latitude, "location" IS NOT NULL AS "hasLocation" FROM "stores" WHERE "id" = ${addressOnly.id}::uuid`;
  assert.equal(persisted?.hasLocation, true);
  assert.equal(persisted?.latitude, 23.0225);
  assert.equal(persisted?.longitude, 72.5714);

  const verified = await admin.verifyStore(adminActor, addressOnly.id);
  assert.equal(verified.status, StoreStatus.ACTIVE);
  assert.equal((await prisma.store.findUniqueOrThrow({ where: { id: addressOnly.id } })).verifiedAt instanceof Date, true);
  assert.equal(await prisma.auditLog.count({ where: { actorUserId: adminActor.userId, entityType: "store", entityId: addressOnly.id, action: "store.verified" } }), 1);

  const mapped = await retailers.createStore(retailerOwner, retailerId, {
    slug: `mapped-${suffix}`, name: "Mapped test", city: "Ahmedabad", region: "Gujarat", countryCode: "IN", timezone: "Asia/Kolkata", latitude: 23.0225, longitude: 72.5714,
  });
  storeIds.push(mapped.id);
  assert.equal((await prisma.$queryRaw<Array<{ hasLocation: boolean }>>`SELECT "location" IS NOT NULL AS "hasLocation" FROM "stores" WHERE "id" = ${mapped.id}::uuid`)[0]?.hasLocation, true);
  assert.equal((await admin.verifyStore(adminActor, mapped.id)).status, StoreStatus.ACTIVE);
});
