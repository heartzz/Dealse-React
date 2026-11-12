import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import { Prisma } from "../generated/prisma/client.js";
import { AccountRole, AdminAccountStatus, AdminPermissionKey, AdminRole } from "../generated/prisma/enums.js";
import { PrismaService } from "../database/prisma.service.js";
import type { AuthPrincipal } from "../auth/auth.types.js";
import type { AdminUserQueryDto, InviteAdminDto, UpdateAdminUserDto } from "./dto/admin-users.dto.js";

@Injectable()
export class AdminUsersService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async list(actor: AuthPrincipal, query: AdminUserQueryDto) {
    const actorAccess = await this.assertManager(actor);
    const where: Prisma.AdminAccountWhereInput = {
      ...(query.role ? { role: query.role } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.q ? { user: { OR: [
        { emailNormalized: { contains: query.q.toLowerCase(), mode: "insensitive" } },
        { profile: { is: { displayName: { contains: query.q, mode: "insensitive" } } } },
      ] } } : {}),
    };
    const [items, total, pendingInvitations] = await this.prisma.$transaction([
      this.prisma.adminAccount.findMany({ where, include: { user: { include: { profile: true } }, permissions: true, invitedBy: { select: { emailNormalized: true, profile: { select: { displayName: true } } } } }, orderBy: [{ createdAt: "desc" }, { userId: "asc" }], skip: (query.page - 1) * query.limit, take: query.limit }),
      this.prisma.adminAccount.count({ where }),
      this.prisma.adminInvitation.count({ where: { acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } } }),
    ]);
    const invitationRows = await this.prisma.adminInvitation.findMany({ where: { emailNormalized: { in: items.map((item) => item.user.emailNormalized).filter((email): email is string => Boolean(email)) } }, orderBy: { createdAt: "desc" }, select: { emailNormalized: true, acceptedAt: true, revokedAt: true, expiresAt: true } });
    const invitationStatusByEmail = new Map<string, string>();
    for (const invite of invitationRows) if (!invitationStatusByEmail.has(invite.emailNormalized)) invitationStatusByEmail.set(invite.emailNormalized, invite.acceptedAt ? "accepted" : invite.revokedAt ? "revoked" : invite.expiresAt <= new Date() ? "expired" : "pending");
    return { actorRole: actorAccess.role, items: items.map((item) => ({ id: item.userId, name: item.user.profile?.displayName ?? null, email: item.user.emailNormalized, role: item.role, status: item.status, permissions: item.permissions.map((grant) => grant.permission), invitationStatus: item.user.emailNormalized ? invitationStatusByEmail.get(item.user.emailNormalized) ?? "—" : "—", lastLoginAt: item.user.lastSignedInAt, createdAt: item.createdAt, invitedBy: item.invitedBy })), page: query.page, limit: query.limit, total, totalPages: Math.max(1, Math.ceil(total / query.limit)), pendingInvitations };
  }

  async get(actor: AuthPrincipal, adminId: string) {
    const actorAccess = await this.assertManager(actor);
    const account = await this.prisma.adminAccount.findUnique({ where: { userId: adminId }, include: { user: { include: { profile: true } }, permissions: true, invitedBy: { select: { emailNormalized: true, profile: { select: { displayName: true } } } } } });
    if (!account) throw new NotFoundException("Administrator not found.");
    await this.assertCanManage(actor, account.role, adminId);
    const inviteRefs = await this.prisma.adminInvitation.findMany({ where: { OR: [{ acceptedById: adminId }, ...(account.user.emailNormalized ? [{ emailNormalized: account.user.emailNormalized }] : [])] }, select: { id: true }, take: 100 });
    const history = await this.prisma.auditLog.findMany({ where: { entityType: "admin_user", entityId: { in: [adminId, ...inviteRefs.map(({ id }) => id)] } }, include: { actor: { select: { emailNormalized: true, profile: { select: { displayName: true } } } } }, orderBy: { createdAt: "desc" }, take: 100 });
    return { actorRole: actorAccess.role, id: account.userId, name: account.user.profile?.displayName ?? null, email: account.user.emailNormalized, role: account.role, status: account.status, permissions: account.permissions.map((grant) => grant.permission), lastLoginAt: account.user.lastSignedInAt, createdAt: account.createdAt, invitedBy: account.invitedBy, history };
  }

  async invitations(actor: AuthPrincipal) {
    await this.assertManager(actor);
    return this.prisma.adminInvitation.findMany({ where: { acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } }, include: { invitedBy: { select: { emailNormalized: true, profile: { select: { displayName: true } } } } }, orderBy: { createdAt: "desc" }, take: 100 });
  }

  async invite(actor: AuthPrincipal, input: InviteAdminDto) {
    const actorAccount = await this.assertManager(actor);
    if (input.role === AdminRole.ROOT_ADMIN) throw new ForbiddenException("Root Admin accounts cannot be created through invitations.");
    if (input.role === AdminRole.SUPER_ADMIN && actorAccount.role !== AdminRole.ROOT_ADMIN) throw new ForbiddenException("Only a Root Admin can invite a Super Admin.");
    if (actor.email?.toLowerCase() === input.email) throw new ConflictException("You cannot invite yourself as an administrator.");
    const existingUser = await this.prisma.user.findFirst({ where: { emailNormalized: input.email }, include: { adminAccount: true } });
    if (existingUser?.adminAccount) throw new ConflictException("This identity already has an administrator account.");
    const activeInvite = await this.prisma.adminInvitation.findFirst({ where: { emailNormalized: input.email, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } } });
    if (activeInvite) throw new ConflictException("An active invitation already exists for this email address.");
    const invitation = await this.prisma.$transaction(async (tx) => {
      await this.assertManagerInTransaction(tx, actor);
      if (input.role === AdminRole.SUPER_ADMIN && (await this.currentActor(actor, tx)).role !== AdminRole.ROOT_ADMIN) throw new ForbiddenException("Only a Root Admin can invite a Super Admin.");
      await this.lockInvitationEmail(tx, input.email);
      const active = await tx.adminInvitation.findFirst({ where: { emailNormalized: input.email, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } } });
      if (active) throw new ConflictException("An active invitation already exists for this email address.");
      const nowAdmin = await tx.adminAccount.findFirst({ where: { user: { is: { emailNormalized: input.email } } } });
      if (nowAdmin) throw new ConflictException("This identity already has an administrator account.");
      const created = await tx.adminInvitation.create({ data: { emailNormalized: input.email, role: input.role, permissionKeys: input.permissions, invitedById: actor.userId, expiresAt: new Date(Date.now() + 60 * 60 * 1000) } });
      await this.audit(tx, actor, "admin.invitation.created", created.id, null, { email: input.email, role: input.role, permissions: input.permissions, expiresAt: created.expiresAt.toISOString(), reason: input.reason });
      return created;
    });
    try { await this.sendInvite(input.email, invitation.id); }
    catch (error) {
      await this.prisma.$transaction(async (tx) => {
        await tx.adminInvitation.update({ where: { id: invitation.id }, data: { revokedAt: new Date() } });
        await this.audit(tx, actor, "admin.invitation.delivery_failed", invitation.id, { state: "pending" }, { state: "revoked", reason: input.reason });
      });
      throw error;
    }
    return { id: invitation.id, email: invitation.emailNormalized, role: invitation.role, status: "pending", expiresAt: invitation.expiresAt };
  }

  async resend(actor: AuthPrincipal, invitationId: string, reason: string) {
    this.requireReason(reason); await this.assertManager(actor);
    const replacement = await this.prisma.$transaction(async (tx) => {
      await this.assertManagerInTransaction(tx, actor);
      const current = await tx.adminInvitation.findUnique({ where: { id: invitationId } });
      if (!current || current.acceptedAt || current.revokedAt || current.expiresAt <= new Date()) throw new ConflictException("This invitation is no longer pending and cannot be resent.");
      await this.lockInvitationEmail(tx, current.emailNormalized);
      if (current.role === AdminRole.SUPER_ADMIN && (await this.currentActor(actor, tx)).role !== AdminRole.ROOT_ADMIN) throw new ForbiddenException("Only a Root Admin can resend a Super Admin invitation.");
      const revoked = await tx.adminInvitation.updateMany({ where: { id: invitationId, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } }, data: { revokedAt: new Date() } });
      if (!revoked.count) throw new ConflictException("This invitation was accepted or revoked while the resend was being processed.");
      const created = await tx.adminInvitation.create({ data: { emailNormalized: current.emailNormalized, role: current.role, permissionKeys: current.permissionKeys, invitedById: actor.userId, expiresAt: new Date(Date.now() + 60 * 60 * 1000) } });
      await this.audit(tx, actor, "admin.invitation.resent", invitationId, { id: invitationId, state: "pending" }, { id: created.id, state: "pending", reason });
      return created;
    });
    try { await this.sendInvite(replacement.emailNormalized, replacement.id); }
    catch (error) {
      await this.prisma.$transaction(async (tx) => {
        await tx.adminInvitation.update({ where: { id: replacement.id }, data: { revokedAt: new Date() } });
        await this.audit(tx, actor, "admin.invitation.delivery_failed", replacement.id, { state: "pending" }, { state: "revoked", reason });
      });
      throw error;
    }
    return { id: replacement.id, status: "pending", expiresAt: replacement.expiresAt };
  }

  async revoke(actor: AuthPrincipal, invitationId: string, reason: string) {
    this.requireReason(reason); await this.assertManager(actor);
    return this.prisma.$transaction(async (tx) => {
      await this.assertManagerInTransaction(tx, actor);
      const current = await tx.adminInvitation.findUnique({ where: { id: invitationId } });
      if (!current || current.acceptedAt || current.revokedAt || current.expiresAt <= new Date()) throw new ConflictException("This invitation is no longer pending.");
      await this.lockInvitationEmail(tx, current.emailNormalized);
      if (current.role === AdminRole.SUPER_ADMIN && (await this.currentActor(actor, tx)).role !== AdminRole.ROOT_ADMIN) throw new ForbiddenException("Only a Root Admin can revoke a Super Admin invitation.");
      const changed = await tx.adminInvitation.updateMany({ where: { id: invitationId, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } }, data: { revokedAt: new Date() } });
      if (!changed.count) throw new ConflictException("This invitation is no longer pending.");
      await this.audit(tx, actor, "admin.invitation.revoked", invitationId, { state: "pending", email: current.emailNormalized, role: current.role }, { state: "revoked", reason });
      return { id: invitationId, status: "revoked" };
    });
  }

  async update(actor: AuthPrincipal, adminId: string, input: UpdateAdminUserDto) {
    await this.assertManager(actor);
    if (input.role === AdminRole.ROOT_ADMIN && (await this.currentActor(actor)).role !== AdminRole.ROOT_ADMIN) throw new ForbiddenException("Only a Root Admin can assign the Root Admin role.");
    if (input.role === AdminRole.SUPER_ADMIN && (await this.currentActor(actor)).role !== AdminRole.ROOT_ADMIN) throw new ForbiddenException("Only a Root Admin can promote a Super Admin.");
    return this.prisma.$transaction(async (tx) => {
      await this.assertManagerInTransaction(tx, actor);
      if (input.role === AdminRole.SUPER_ADMIN && (await this.currentActor(actor, tx)).role !== AdminRole.ROOT_ADMIN) throw new ForbiddenException("Only a Root Admin can promote a Super Admin.");
      const actorAccount = await this.currentActor(actor, tx);
      const current = await tx.adminAccount.findUnique({ where: { userId: adminId }, include: { permissions: true } });
      if (!current) throw new NotFoundException("Administrator not found.");
      await this.assertCanManage(actor, current.role, adminId, tx);
      if (!input.role && !input.permissions) throw new BadRequestException("Choose a role or permission change.");
      if (input.permissions !== undefined && current.role === AdminRole.SUPER_ADMIN && actorAccount.role !== AdminRole.ROOT_ADMIN) {
        throw new ForbiddenException("Only a Root Admin can change Super Admin permissions.");
      }
      if (input.permissions !== undefined && actorAccount.role === AdminRole.SUPER_ADMIN) {
        if (adminId === actor.userId) throw new ForbiddenException("Super Admins cannot change their own permissions.");
        const outsideScope = input.permissions.filter((permission) => !actorAccount.permissions.some((grant) => grant.permission === permission));
        if (outsideScope.length) throw new ForbiddenException("Super Admins can only grant permissions within their own authorized scope.");
      }
      const nextRole = input.role ?? current.role;
      if (current.role === AdminRole.ROOT_ADMIN && nextRole !== AdminRole.ROOT_ADMIN) await this.assertNotLastRoot(tx, adminId);
      if (adminId === actor.userId && input.role && input.role !== current.role) throw new ForbiddenException("You cannot change your own administrator role.");
      if (nextRole === AdminRole.ROOT_ADMIN && current.role !== AdminRole.ROOT_ADMIN) throw new ForbiddenException("Root Admin promotion is only available through the protected bootstrap process.");
      const updated = await tx.adminAccount.update({ where: { userId: adminId }, data: { role: nextRole } });
      if (input.permissions) {
        await tx.adminPermissionGrant.deleteMany({ where: { userId: adminId } });
        if (input.permissions.length) await tx.adminPermissionGrant.createMany({ data: input.permissions.map((permission) => ({ userId: adminId, permission, grantedById: actor.userId })) });
      }
      const nextPermissions = input.permissions ?? current.permissions.map(({ permission }) => permission);
      if (updated.role === current.role && current.permissions.map(({ permission }) => permission).sort().join() === nextPermissions.slice().sort().join()) throw new BadRequestException("The requested administrator state is unchanged.");
      await this.audit(tx, actor, "admin.account.updated", adminId, { role: current.role, permissions: current.permissions.map(({ permission }) => permission) }, { role: updated.role, permissions: nextPermissions, reason: input.reason });
      return { id: adminId, role: updated.role, permissions: nextPermissions };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async status(actor: AuthPrincipal, adminId: string, status: AdminAccountStatus, reason: string) {
    this.requireReason(reason); await this.assertManager(actor);
    return this.prisma.$transaction(async (tx) => {
      await this.assertManagerInTransaction(tx, actor);
      const current = await tx.adminAccount.findUnique({ where: { userId: adminId }, include: { permissions: true } });
      if (!current) throw new NotFoundException("Administrator not found.");
      await this.assertCanManage(actor, current.role, adminId, tx);
      if (current.role === AdminRole.ROOT_ADMIN && status !== AdminAccountStatus.ACTIVE) await this.assertNotLastRoot(tx, adminId);
      if (current.status === status) throw new ConflictException("The administrator already has this status.");
      if (status === AdminAccountStatus.ACTIVE && current.status !== AdminAccountStatus.SUSPENDED) throw new ConflictException("Only a suspended administrator can be reactivated.");
      if (status === AdminAccountStatus.SUSPENDED && current.status !== AdminAccountStatus.ACTIVE) throw new ConflictException("Only an active administrator can be suspended.");
      const revocableStatuses: AdminAccountStatus[] = [AdminAccountStatus.ACTIVE, AdminAccountStatus.SUSPENDED, AdminAccountStatus.PENDING];
      if (status === AdminAccountStatus.REVOKED && !revocableStatuses.includes(current.status)) throw new ConflictException("This administrator cannot be revoked from its current state.");
      await tx.adminAccount.update({ where: { userId: adminId }, data: { status } });
      await this.audit(tx, actor, `admin.account.${status.toLowerCase()}`, adminId, { role: current.role, status: current.status, permissions: current.permissions.map(({ permission }) => permission) }, { role: current.role, status, reason });
      return { id: adminId, status };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async acceptInvitation(user: AuthPrincipal, invitationId: string) {
    if (!user.email || !user.emailVerified) throw new ForbiddenException("A verified invited email address is required.");
    const verifiedEmail = user.email.toLowerCase();
    return this.prisma.$transaction(async (tx) => {
      await this.lockInvitationEmail(tx, verifiedEmail);
      const invite = await tx.adminInvitation.findUnique({ where: { id: invitationId } });
      if (!invite || invite.emailNormalized !== verifiedEmail || invite.acceptedAt || invite.revokedAt || invite.expiresAt <= new Date()) throw new ConflictException("This invitation is invalid, expired, revoked or already accepted.");
      const duplicate = await tx.adminAccount.findUnique({ where: { userId: user.userId } });
      if (duplicate) throw new ConflictException("This identity already has administrator access.");
      await tx.adminInvitation.update({ where: { id: invite.id }, data: { acceptedAt: new Date(), acceptedById: user.userId } });
      await tx.adminAccount.create({ data: { userId: user.userId, role: invite.role, status: AdminAccountStatus.ACTIVE, invitedById: invite.invitedById, acceptedAt: new Date(), permissions: { create: invite.permissionKeys.map((permission) => ({ permission, grantedById: invite.invitedById })) } } });
      await tx.userAccountRole.upsert({ where: { userId_role: { userId: user.userId, role: AccountRole.ADMIN } }, create: { userId: user.userId, role: AccountRole.ADMIN }, update: {} });
      await this.audit(tx, user, "admin.invitation.accepted", invite.id, { state: "pending", email: invite.emailNormalized, role: invite.role }, { state: "accepted", adminUserId: user.userId, permissions: invite.permissionKeys, reason: "Invitee accepted after verified Supabase authentication." });
      return { accepted: true, role: invite.role };
    });
  }

  private async assertManager(actor: AuthPrincipal) {
    const account = await this.currentActor(actor);
    const managementRoles: AdminRole[] = [AdminRole.ROOT_ADMIN, AdminRole.SUPER_ADMIN];
    if (account.status !== AdminAccountStatus.ACTIVE || !managementRoles.includes(account.role)) throw new ForbiddenException("Only an active Root Admin or Super Admin can manage administrator accounts.");
    if (account.role === AdminRole.SUPER_ADMIN && !account.permissions.some(({ permission }) => permission === AdminPermissionKey.ADMINS_MANAGE)) throw new ForbiddenException("The administrator management permission is required.");
    return account;
  }

  private async currentActor(actor: AuthPrincipal, tx?: Prisma.TransactionClient) {
    const db = tx ?? this.prisma;
    const account = await db.adminAccount.findUnique({ where: { userId: actor.userId }, include: { permissions: true } });
    if (!account || account.status !== AdminAccountStatus.ACTIVE) throw new ForbiddenException("An active administrator account is required.");
    return account;
  }

  private async assertCanManage(actor: AuthPrincipal, targetRole: AdminRole, targetId: string, tx?: Prisma.TransactionClient) {
    if (actor.userId === targetId) return;
    const actorAccount = await this.currentActor(actor, tx);
    if (targetRole === AdminRole.ROOT_ADMIN && actorAccount.role !== AdminRole.ROOT_ADMIN) throw new ForbiddenException("Only a Root Admin can manage Root Admin accounts.");
    if (targetRole === AdminRole.SUPER_ADMIN && actorAccount.role !== AdminRole.ROOT_ADMIN) throw new ForbiddenException("Only a Root Admin can manage Super Admin accounts.");
    if (actorAccount.role === AdminRole.SUPER_ADMIN && targetRole !== AdminRole.ADMIN) throw new ForbiddenException("Super Admins can only manage Admin accounts.");
  }

  private async assertManagerInTransaction(tx: Prisma.TransactionClient, actor: AuthPrincipal) {
    const account = await this.currentActor(actor, tx);
    const managementRoles: AdminRole[] = [AdminRole.ROOT_ADMIN, AdminRole.SUPER_ADMIN];
    if (!managementRoles.includes(account.role)) throw new ForbiddenException("Only a Root Admin or Super Admin can manage administrator accounts.");
    if (account.role === AdminRole.SUPER_ADMIN && !account.permissions.some(({ permission }) => permission === AdminPermissionKey.ADMINS_MANAGE)) throw new ForbiddenException("The administrator management permission is required.");
  }

  private async lockInvitationEmail(tx: Prisma.TransactionClient, email: string) {
    await tx.$queryRaw<Array<{ lockResult: string }>>`SELECT pg_advisory_xact_lock(hashtextextended(${email}, 0))::text AS "lockResult"`;
  }

  private async assertNotLastRoot(tx: Prisma.TransactionClient, targetId: string) {
    const activeRoots = await tx.adminAccount.count({ where: { role: AdminRole.ROOT_ADMIN, status: AdminAccountStatus.ACTIVE } });
    if (activeRoots <= 1 && await tx.adminAccount.count({ where: { userId: targetId, role: AdminRole.ROOT_ADMIN, status: AdminAccountStatus.ACTIVE } })) throw new ConflictException("The last active Root Admin cannot be deactivated or demoted.");
  }

  private async sendInvite(email: string, invitationId: string) {
    const url = process.env.SUPABASE_URL?.trim();
    const key = process.env.SUPABASE_SECRET_KEY?.trim() || process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
    const redirectTo = process.env.ADMIN_INVITE_REDIRECT_URL?.trim();
    if (!url || !key || !redirectTo) throw new ServiceUnavailableException("Supabase admin invitations are not configured on the API server.");
    let response: Response;
    try {
      const callback = `${redirectTo.replace(/\/$/, "")}?invitation=${encodeURIComponent(invitationId)}`;
      response = await fetch(`${url.replace(/\/$/, "")}/auth/v1/invite?redirect_to=${encodeURIComponent(callback)}`, { method: "POST", headers: { "Content-Type": "application/json", apikey: key, Authorization: `Bearer ${key}` }, body: JSON.stringify({ email }) });
    } catch { throw new ServiceUnavailableException("Supabase Auth could not be reached to deliver the invitation."); }
    if (!response.ok) {
      let message = "";
      try { const payload = await response.json() as { msg?: string; message?: string; error_description?: string }; message = `${payload.msg ?? ""} ${payload.message ?? ""} ${payload.error_description ?? ""}`.toLowerCase(); } catch { /* provider error body is optional */ }
      throw new ConflictException(message.includes("already") || message.includes("registered") ? "This email already has a Supabase identity; ask the user to sign in and contact an administrator to link access." : "Supabase could not deliver the administrator invitation.");
    }
  }

  private async audit(tx: Prisma.TransactionClient, actor: AuthPrincipal, action: string, entityId: string, beforeSnapshot: Prisma.InputJsonValue | null, afterSnapshot: Prisma.InputJsonValue) {
    const access = await tx.adminAccount.findUnique({ where: { userId: actor.userId }, select: { role: true, permissions: { select: { permission: true } } } });
    await tx.auditLog.create({ data: { actorUserId: actor.userId, actorType: "admin", actorAdminRole: access?.role ?? null, actorPermissions: access?.permissions.map(({ permission }) => permission) ?? [], action, entityType: "admin_user", entityId, beforeSnapshot: beforeSnapshot ?? Prisma.JsonNull, afterSnapshot } });
  }

  private requireReason(reason: string) { if (typeof reason !== "string" || reason.trim().length < 5 || reason.trim().length > 500) throw new BadRequestException("Provide a reason between 5 and 500 characters."); }
}
