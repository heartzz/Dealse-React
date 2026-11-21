import assert from "node:assert/strict";
import { test } from "node:test";
import type { ExecutionContext } from "@nestjs/common";
import type { Reflector } from "@nestjs/core";
import { AdminAccountStatus, AdminPermissionKey, AdminRole, type AdminPermissionKey as AdminPermissionKeyType } from "../generated/prisma/enums.js";
import type { PrismaService } from "../database/prisma.service.js";
import { AdminPermissionGuard } from "./admin-permission.guard.js";

function guardFor(account: unknown, permission: AdminPermissionKeyType = AdminPermissionKey.CUSTOMERS_READ) {
  const guard = new AdminPermissionGuard(
    { getAllAndOverride: () => permission } as unknown as Reflector,
    { adminAccount: { findUnique: async () => account } } as unknown as PrismaService,
  );
  const context = {
    getHandler: () => ({}), getClass: () => ({}),
    switchToHttp: () => ({ getRequest: () => ({ authPrincipal: { userId: "admin-user" } }) }),
  } as unknown as ExecutionContext;
  return { guard, context };
}

test("customer list guard accepts only an active account with CUSTOMERS_READ or Root Admin role", async () => {
  const permitted = guardFor({ role: AdminRole.ADMIN, status: AdminAccountStatus.ACTIVE, permissions: [{ permission: AdminPermissionKey.CUSTOMERS_READ }] });
  assert.equal(await permitted.guard.canActivate(permitted.context), true);

  const root = guardFor({ role: AdminRole.ROOT_ADMIN, status: AdminAccountStatus.ACTIVE, permissions: [] });
  assert.equal(await root.guard.canActivate(root.context), true);

  const denied = guardFor({ role: AdminRole.ADMIN, status: AdminAccountStatus.ACTIVE, permissions: [{ permission: AdminPermissionKey.RETAILERS_READ }] });
  await assert.rejects(() => denied.guard.canActivate(denied.context), (error: unknown) => "getStatus" in (error as object) && (error as { getStatus(): number }).getStatus() === 403);

  const inactive = guardFor({ role: AdminRole.ADMIN, status: AdminAccountStatus.SUSPENDED, permissions: [{ permission: AdminPermissionKey.CUSTOMERS_READ }] });
  await assert.rejects(() => inactive.guard.canActivate(inactive.context), (error: unknown) => "getStatus" in (error as object) && (error as { getStatus(): number }).getStatus() === 403);
});

test("analytics guard requires ANALYTICS_READ while Root Admin bypass remains intact", async () => {
  const permitted = guardFor({ role: AdminRole.ADMIN, status: AdminAccountStatus.ACTIVE, permissions: [{ permission: AdminPermissionKey.ANALYTICS_READ }] }, AdminPermissionKey.ANALYTICS_READ);
  assert.equal(await permitted.guard.canActivate(permitted.context), true);

  const root = guardFor({ role: AdminRole.ROOT_ADMIN, status: AdminAccountStatus.ACTIVE, permissions: [] }, AdminPermissionKey.ANALYTICS_READ);
  assert.equal(await root.guard.canActivate(root.context), true);

  const denied = guardFor({ role: AdminRole.ADMIN, status: AdminAccountStatus.ACTIVE, permissions: [{ permission: AdminPermissionKey.CUSTOMERS_READ }] }, AdminPermissionKey.ANALYTICS_READ);
  await assert.rejects(() => denied.guard.canActivate(denied.context), (error: unknown) => "getStatus" in (error as object) && (error as { getStatus(): number }).getStatus() === 403);
});
