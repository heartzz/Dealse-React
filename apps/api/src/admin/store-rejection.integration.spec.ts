import "reflect-metadata";
import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import { AccountRole, AdminAccountStatus, AdminPermissionKey, AdminRole, RetailerStatus, StoreStatus } from "../generated/prisma/enums.js";
import { PrismaService } from "../database/prisma.service.js";
import { AuthService } from "../auth/auth.service.js";
import type { AuthPrincipal } from "../auth/auth.types.js";
import { DealsService } from "../deals/deals.service.js";
import { AdminService } from "./admin.service.js";

const prisma = new PrismaService();
const auth = new AuthService(prisma);
const admin = new AdminService(prisma, {} as DealsService);
const suffix = randomUUID();
let actor!: AuthPrincipal;
let storeId = "";
let retailerId = "";

before(async () => {
  await prisma.$connect();
  actor = await auth.resolveIdentity({ providerId: "admin-store-rejection-test", subject: suffix, email: `admin-store-rejection-${suffix}@example.invalid`, emailVerified: true, assuranceLevel: "aal2" });
  await prisma.userAccountRole.upsert({ where: { userId_role: { userId: actor.userId, role: AccountRole.ADMIN } }, create: { userId: actor.userId, role: AccountRole.ADMIN }, update: {} });
  await prisma.adminAccount.create({ data: { userId: actor.userId, role: AdminRole.ADMIN, status: AdminAccountStatus.ACTIVE, acceptedAt: new Date() } });
  await prisma.adminPermissionGrant.create({ data: { userId: actor.userId, permission: AdminPermissionKey.STORES_VERIFY } });
  const retailer = await prisma.retailer.create({ data: { displayName: `Store rejection test ${suffix}`, status: RetailerStatus.PENDING, createdByUserId: actor.userId } });
  retailerId = retailer.id;
  const store = await prisma.store.create({ data: { retailerId, slug: `store-rejection-${suffix}`, name: `Store rejection test ${suffix}`, city: "Test City", region: "Test Region", status: StoreStatus.PENDING_VERIFICATION } });
  storeId = store.id;
});

after(async () => {
  if (actor?.userId) await prisma.$transaction(async (tx) => {
    await tx.auditLog.deleteMany({ where: { OR: [{ actorUserId: actor.userId }, ...(storeId ? [{ entityType: "store", entityId: storeId }] : [])] } });
    if (storeId) await tx.store.deleteMany({ where: { id: storeId } });
    if (retailerId) await tx.retailer.deleteMany({ where: { id: retailerId } });
    await tx.adminPermissionGrant.deleteMany({ where: { userId: actor.userId } });
    await tx.adminAccount.deleteMany({ where: { userId: actor.userId } });
    await tx.userAccountRole.deleteMany({ where: { userId: actor.userId } });
    await tx.userProfile.deleteMany({ where: { userId: actor.userId } });
    await tx.user.deleteMany({ where: { id: actor.userId } });
  });
  await prisma.$disconnect();
});

test("store rejection changes only the test store and records the transactional audit event", async () => {
  const result = await admin.rejectStore(actor, storeId, "Reject isolated test store");
  assert.equal(result.status, StoreStatus.REJECTED);
  assert.equal((await prisma.store.findUniqueOrThrow({ where: { id: storeId } })).status, StoreStatus.REJECTED);

  const account = await prisma.adminAccount.findUniqueOrThrow({ where: { userId: actor.userId }, include: { permissions: true } });
  assert.equal(account.role, AdminRole.ADMIN);
  assert.equal(account.status, AdminAccountStatus.ACTIVE, "store moderation does not alter the administrator account session state");
  assert.deepEqual(account.permissions.map(({ permission }) => permission), [AdminPermissionKey.STORES_VERIFY]);

  const audit = await prisma.auditLog.findFirstOrThrow({ where: { actorUserId: actor.userId, entityType: "store", entityId: storeId, action: "store.rejected" } });
  assert.equal((audit.beforeSnapshot as { status?: string }).status, StoreStatus.PENDING_VERIFICATION);
  assert.equal((audit.afterSnapshot as { status?: string }).status, StoreStatus.REJECTED);
  assert.equal((audit.afterSnapshot as { reason?: string }).reason, "Reject isolated test store");
});
