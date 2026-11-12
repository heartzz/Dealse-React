import { Body, Controller, Get, Inject, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { AccountRole, AdminAccountStatus, AdminPermissionKey } from "../generated/prisma/enums.js";
import { CurrentUser } from "../auth/current-user.decorator.js";
import type { AuthPrincipal } from "../auth/auth.types.js";
import { RequireAccountRole } from "../auth/require-account-role.decorator.js";
import { AdminPermissionGuard } from "./admin-permission.guard.js";
import { RequireAdminPermission } from "./require-admin-permission.decorator.js";
import { AdminUsersService } from "./admin-users.service.js";
import { AcceptAdminInvitationDto, AdminUserQueryDto, AdminUserReasonDto, InviteAdminDto, UpdateAdminUserDto } from "./dto/admin-users.dto.js";

@Controller("admin/admin-users")
@RequireAccountRole(AccountRole.ADMIN)
@UseGuards(AdminPermissionGuard)
@RequireAdminPermission(AdminPermissionKey.ADMINS_MANAGE)
export class AdminUsersController {
  constructor(@Inject(AdminUsersService) private readonly admins: AdminUsersService) {}

  @Get() list(@CurrentUser() actor: AuthPrincipal, @Query() query: AdminUserQueryDto) { return this.admins.list(actor, query); }
  @Get("invitations") invitations(@CurrentUser() actor: AuthPrincipal) { return this.admins.invitations(actor); }
  @Get(":adminId") get(@CurrentUser() actor: AuthPrincipal, @Param("adminId", new ParseUUIDPipe()) id: string) { return this.admins.get(actor, id); }
  @Post("invitations") invite(@CurrentUser() actor: AuthPrincipal, @Body() input: InviteAdminDto) { return this.admins.invite(actor, input); }
  @Post("invitations/:invitationId/resend") resend(@CurrentUser() actor: AuthPrincipal, @Param("invitationId", new ParseUUIDPipe()) id: string, @Body() input: AdminUserReasonDto) { return this.admins.resend(actor, id, input.reason); }
  @Post("invitations/:invitationId/revoke") revoke(@CurrentUser() actor: AuthPrincipal, @Param("invitationId", new ParseUUIDPipe()) id: string, @Body() input: AdminUserReasonDto) { return this.admins.revoke(actor, id, input.reason); }
  @Patch(":adminId") update(@CurrentUser() actor: AuthPrincipal, @Param("adminId", new ParseUUIDPipe()) id: string, @Body() input: UpdateAdminUserDto) { return this.admins.update(actor, id, input); }
  @Post(":adminId/suspend") suspend(@CurrentUser() actor: AuthPrincipal, @Param("adminId", new ParseUUIDPipe()) id: string, @Body() input: AdminUserReasonDto) { return this.admins.status(actor, id, AdminAccountStatus.SUSPENDED, input.reason); }
  @Post(":adminId/reactivate") reactivate(@CurrentUser() actor: AuthPrincipal, @Param("adminId", new ParseUUIDPipe()) id: string, @Body() input: AdminUserReasonDto) { return this.admins.status(actor, id, AdminAccountStatus.ACTIVE, input.reason); }
  @Post(":adminId/revoke") revokeAccess(@CurrentUser() actor: AuthPrincipal, @Param("adminId", new ParseUUIDPipe()) id: string, @Body() input: AdminUserReasonDto) { return this.admins.status(actor, id, AdminAccountStatus.REVOKED, input.reason); }
}

@Controller("auth/admin-invitations")
export class AdminInvitationAcceptanceController {
  constructor(@Inject(AdminUsersService) private readonly admins: AdminUsersService) {}
  @Post("accept") accept(@CurrentUser() user: AuthPrincipal, @Body() input: AcceptAdminInvitationDto) { return this.admins.acceptInvitation(user, input.invitationId); }
}
