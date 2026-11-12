import "reflect-metadata";
import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import { AccountRole, AdminAccountStatus, AdminPermissionKey, AdminRole } from "../generated/prisma/enums.js";
import { PrismaService } from "../database/prisma.service.js";
import { AuthService } from "../auth/auth.service.js";
import type { AuthPrincipal } from "../auth/auth.types.js";
import { AdminUsersService } from "./admin-users.service.js";
import { AdminUserQueryDto } from "./dto/admin-users.dto.js";

const prisma = new PrismaService();
const auth = new AuthService(prisma);
const admins = new AdminUsersService(prisma);
const suffix = randomUUID();
const users: string[] = [];
const invitationIds: string[] = [];
let root!: AuthPrincipal;
let superAdmin!: AuthPrincipal;
let regularAdmin!: AuthPrincipal;
let target!: AuthPrincipal;
let invitee!: AuthPrincipal;

async function createAdmin(principal: AuthPrincipal, role: AdminRole, permissions: AdminPermissionKey[] = []) {
  await prisma.userAccountRole.upsert({ where: { userId_role: { userId: principal.userId, role: AccountRole.ADMIN } }, create: { userId: principal.userId, role: AccountRole.ADMIN }, update: {} });
  await prisma.adminAccount.create({ data: { userId: principal.userId, role, status: AdminAccountStatus.ACTIVE, acceptedAt: new Date() } });
  if (permissions.length) await prisma.adminPermissionGrant.createMany({ data: permissions.map((permission) => ({ userId: principal.userId, permission })) });
  return { ...principal, roles: [...new Set([...principal.roles, AccountRole.ADMIN])] };
}

before(async () => {
  await prisma.$connect();
  const principals = await Promise.all(["root", "super", "admin", "target", "invitee"].map((label) => auth.resolveIdentity({ providerId: "admin-users-test", subject: `${label}-${suffix}`, email: `${label}-${suffix}@example.invalid`, emailVerified: true })));
  users.push(...principals.map(({ userId }) => userId));
  root = await createAdmin(principals[0]!, AdminRole.ROOT_ADMIN);
  superAdmin = await createAdmin(principals[1]!, AdminRole.SUPER_ADMIN, [AdminPermissionKey.ADMINS_MANAGE]);
  regularAdmin = await createAdmin(principals[2]!, AdminRole.ADMIN, [AdminPermissionKey.ADMINS_MANAGE]);
  target = await createAdmin(principals[3]!, AdminRole.ADMIN);
  invitee = principals[4]!;
});

after(async () => {
  if (users.length) await prisma.$transaction(async (tx) => {
    await tx.auditLog.deleteMany({ where: { OR: [{ actorUserId: { in: users } }, { entityType: "admin_user", entityId: { in: [...users, ...invitationIds] } }] } });
    await tx.adminInvitation.deleteMany({ where: { OR: [{ id: { in: invitationIds } }, { invitedById: { in: users } }, { acceptedById: { in: users } }] } });
    await tx.adminPermissionGrant.deleteMany({ where: { userId: { in: users } } });
    await tx.adminAccount.deleteMany({ where: { userId: { in: users } } });
    await tx.userAccountRole.deleteMany({ where: { userId: { in: users } } });
    await tx.userProfile.deleteMany({ where: { userId: { in: users } } });
    await tx.user.deleteMany({ where: { id: { in: users } } });
  });
  await prisma.$disconnect();
});

test("administrator management enforces hierarchy, invitation acceptance, last-root protection and transactional audit", async () => {
  const query = Object.assign(new AdminUserQueryDto(), { page: 1, limit: 20 });
  assert.equal((await admins.list(root, query)).total >= 4, true);
  await assert.rejects(() => admins.list(regularAdmin, query), (error: unknown) => "getStatus" in (error as object) && (error as { getStatus(): number }).getStatus() === 403);

  const superPermissionCountBefore = await prisma.adminPermissionGrant.count({ where: { userId: superAdmin.userId } });
  const selfEscalationAuditsBefore = await prisma.auditLog.count({ where: { entityType: "admin_user", entityId: superAdmin.userId, action: "admin.account.updated" } });
  await assert.rejects(
    () => admins.update(superAdmin, superAdmin.userId, { permissions: [AdminPermissionKey.ADMINS_MANAGE, AdminPermissionKey.SETTINGS_MANAGE], reason: "Attempt self permission escalation" }),
    (error: unknown) => "getStatus" in (error as object) && (error as { getStatus(): number }).getStatus() === 403,
  );
  assert.equal(await prisma.adminPermissionGrant.count({ where: { userId: superAdmin.userId } }), superPermissionCountBefore, "self permission change leaves grants unchanged");
  assert.equal(await prisma.auditLog.count({ where: { entityType: "admin_user", entityId: superAdmin.userId, action: "admin.account.updated" } }), selfEscalationAuditsBefore, "denied self escalation creates no audit event");

  await assert.rejects(
    () => admins.update(superAdmin, target.userId, { permissions: [AdminPermissionKey.SETTINGS_MANAGE], reason: "Attempt out of scope grant" }),
    (error: unknown) => "getStatus" in (error as object) && (error as { getStatus(): number }).getStatus() === 403,
  );
  assert.equal(await prisma.adminPermissionGrant.count({ where: { userId: target.userId } }), 0, "out-of-scope grant leaves target unchanged");
  await admins.update(superAdmin, target.userId, { permissions: [AdminPermissionKey.ADMINS_MANAGE], reason: "Grant an in-scope permission" });
  assert.equal(await prisma.adminPermissionGrant.count({ where: { userId: target.userId, permission: AdminPermissionKey.ADMINS_MANAGE } }), 1, "authorized in-scope grant succeeds");

  const email = `new-admin-${suffix}@example.invalid`;
  const previousFetch = globalThis.fetch;
  process.env.SUPABASE_URL = "https://auth-test.invalid";
  process.env.SUPABASE_SECRET_KEY = "test";
  process.env.ADMIN_INVITE_REDIRECT_URL = "http://localhost:3100/admin/accept-invitation";
  globalThis.fetch = async () => new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
  try {
    const sent = await admins.invite(root, { email, role: AdminRole.ADMIN, permissions: [AdminPermissionKey.RETAILERS_READ], reason: "Add moderation coverage" });
    invitationIds.push(sent.id);
    assert.equal(sent.status, "pending");
    assert.equal(await prisma.auditLog.count({ where: { entityType: "admin_user", entityId: sent.id, action: "admin.invitation.created" } }), 1);
    await assert.rejects(() => admins.invite(root, { email, role: AdminRole.ADMIN, permissions: [], reason: "Duplicate test" }));
    assert.equal(await prisma.adminInvitation.count({ where: { emailNormalized: email } }), 1, "duplicate invitation does not create a second invitation");
    await assert.rejects(() => admins.invite(root, { email: target.email!, role: AdminRole.ADMIN, permissions: [], reason: "Duplicate identity test" }));
  } finally { globalThis.fetch = previousFetch; delete process.env.SUPABASE_SECRET_KEY; }

  await assert.rejects(() => admins.update(superAdmin, target.userId, { role: AdminRole.SUPER_ADMIN, reason: "Attempt escalation" }), (error: unknown) => "getStatus" in (error as object) && (error as { getStatus(): number }).getStatus() === 403);
  await admins.update(root, target.userId, { role: AdminRole.SUPER_ADMIN, permissions: [AdminPermissionKey.ADMINS_MANAGE], reason: "Promote to super admin" });
  assert.equal((await prisma.adminAccount.findUniqueOrThrow({ where: { userId: target.userId } })).role, AdminRole.SUPER_ADMIN);
  assert.equal(await prisma.adminPermissionGrant.count({ where: { userId: target.userId, permission: AdminPermissionKey.ADMINS_MANAGE } }), 1);
  await assert.rejects(
    () => admins.update(superAdmin, target.userId, { permissions: [AdminPermissionKey.SETTINGS_MANAGE], reason: "Attempt to change super admin permissions" }),
    (error: unknown) => "getStatus" in (error as object) && (error as { getStatus(): number }).getStatus() === 403,
  );
  assert.equal(await prisma.adminPermissionGrant.count({ where: { userId: target.userId, permission: AdminPermissionKey.SETTINGS_MANAGE } }), 0, "Super Admin cannot change another Super Admin's permissions");
  await admins.update(root, target.userId, { permissions: [AdminPermissionKey.SETTINGS_MANAGE], reason: "Root Admin updates super admin permissions" });
  assert.equal(await prisma.adminPermissionGrant.count({ where: { userId: target.userId, permission: AdminPermissionKey.SETTINGS_MANAGE } }), 1, "Root Admin can change Super Admin permissions");
  await assert.rejects(() => admins.update(superAdmin, target.userId, { role: AdminRole.ADMIN, reason: "Attempt demotion" }), (error: unknown) => "getStatus" in (error as object) && (error as { getStatus(): number }).getStatus() === 403);

  const invite = await prisma.adminInvitation.create({ data: { emailNormalized: invitee.email!, role: AdminRole.ADMIN, permissionKeys: [AdminPermissionKey.RETAILERS_READ], invitedById: root.userId, expiresAt: new Date(Date.now() + 60_000) } });
  invitationIds.push(invite.id);
  const mismatchedEmail = `mismatch-${suffix}@example.invalid`;
  assert.notEqual(mismatchedEmail, invitee.email);
  const storedInviteEmail = (await prisma.adminInvitation.findUniqueOrThrow({ where: { id: invite.id } })).emailNormalized;
  assert.equal(storedInviteEmail, invitee.email?.toLowerCase());
  assert.notEqual(storedInviteEmail, mismatchedEmail);
  await assert.rejects(() => admins.acceptInvitation({ ...invitee, email: mismatchedEmail }, invite.id));
  assert.equal(await prisma.auditLog.count({ where: { entityType: "admin_user", entityId: invite.id } }), 0, "failed acceptance leaves no misleading audit event");
  await admins.acceptInvitation(invitee, invite.id);
  assert.equal((await prisma.adminAccount.findUniqueOrThrow({ where: { userId: invitee.userId } })).status, AdminAccountStatus.ACTIVE);
  assert.equal(await prisma.adminPermissionGrant.count({ where: { userId: invitee.userId, permission: AdminPermissionKey.RETAILERS_READ } }), 1);
  assert.equal(await prisma.auditLog.count({ where: { entityType: "admin_user", entityId: invite.id, action: "admin.invitation.accepted" } }), 1);
  await assert.rejects(() => admins.acceptInvitation(invitee, invite.id));

  const pending = await prisma.adminInvitation.create({ data: { emailNormalized: `pending-${suffix}@example.invalid`, role: AdminRole.ADMIN, permissionKeys: [], invitedById: root.userId, expiresAt: new Date(Date.now() + 60_000) } });
  invitationIds.push(pending.id);
  await assert.rejects(() => admins.revoke(regularAdmin, pending.id, "Try to revoke invitation"));
  assert.equal(await prisma.auditLog.count({ where: { entityType: "admin_user", entityId: pending.id } }), 0);
  await admins.revoke(root, pending.id, "No longer needed");
  assert.ok((await prisma.adminInvitation.findUniqueOrThrow({ where: { id: pending.id } })).revokedAt);
  assert.equal(await prisma.auditLog.count({ where: { entityType: "admin_user", entityId: pending.id, action: "admin.invitation.revoked" } }), 1);

  const activeRootCount = await prisma.adminAccount.count({ where: { role: AdminRole.ROOT_ADMIN, status: AdminAccountStatus.ACTIVE } });
  if (activeRootCount === 1) {
    await assert.rejects(() => admins.status(root, root.userId, AdminAccountStatus.SUSPENDED, "Disable last root"));
  } else {
    assert.ok(activeRootCount > 1, "the populated development database has multiple active Root Admins; the isolated guard test below covers the last-root case");
  }
  assert.equal((await prisma.adminAccount.findUniqueOrThrow({ where: { userId: root.userId } })).status, AdminAccountStatus.ACTIVE);
  assert.equal(await prisma.auditLog.count({ where: { entityType: "admin_user", entityId: root.userId, action: "admin.account.suspended" } }), 0);

  await admins.status(root, target.userId, AdminAccountStatus.SUSPENDED, "Policy violation review");
  assert.equal(await prisma.auditLog.count({ where: { entityType: "admin_user", entityId: target.userId, action: "admin.account.suspended" } }), 1);
  await admins.status(root, target.userId, AdminAccountStatus.ACTIVE, "Issue resolved and reviewed");
  await admins.status(root, target.userId, AdminAccountStatus.SUSPENDED, "New policy review required");
  await admins.status(root, target.userId, AdminAccountStatus.REVOKED, "Remove administrator access");
  assert.equal(await prisma.auditLog.count({ where: { entityType: "admin_user", entityId: target.userId, action: "admin.account.revoked" } }), 1);
  await assert.rejects(() => admins.status(root, target.userId, AdminAccountStatus.ACTIVE, "Try to reactivate revoked"));
});

test("last active Root Admin protection rejects deactivation", async () => {
  const guardService = admins as unknown as { assertNotLastRoot(tx: unknown, targetId: string): Promise<void> };
  const transaction = {
    adminAccount: {
      count: async ({ where }: { where: { userId?: string } }) => where.userId ? 1 : 1,
    },
  };
  await assert.rejects(
    () => guardService.assertNotLastRoot(transaction, "sole-root-admin"),
    (error: unknown) => "getStatus" in (error as object) && (error as { getStatus(): number }).getStatus() === 409,
  );
});
