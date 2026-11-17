import { CanActivate, ExecutionContext, ForbiddenException, Inject, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { AdminAccountStatus, AdminPermissionKey, AdminRole } from "../generated/prisma/enums.js";
import { PrismaService } from "../database/prisma.service.js";
import type { AuthenticatedRequest } from "../auth/auth.types.js";
import { REQUIRED_ADMIN_PERMISSION } from "./require-admin-permission.decorator.js";

@Injectable()
export class AdminPermissionGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(PrismaService) private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<AdminPermissionKey>(
      REQUIRED_ADMIN_PERMISSION,
      [context.getHandler(), context.getClass()],
    );
    if (!required) throw new ForbiddenException("An explicit administrator permission is required.");

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const principal = request.authPrincipal;
    if (!principal) {
      console.warn("[DealSe Auth] admin permission check denied", {
        stage: "admin_account_check",
        httpStatus: 403,
        accountActive: false,
        permissionGranted: false,
      });
      throw new ForbiddenException("Administrator access is required.");
    }

    const account = await this.prisma.adminAccount.findUnique({
      where: { userId: principal.userId },
      select: { role: true, status: true, permissions: { select: { permission: true } } },
    });
    if (!account || account.status !== AdminAccountStatus.ACTIVE) {
      console.warn("[DealSe Auth] admin account status check denied", {
        stage: "admin_account_check",
        httpStatus: 403,
        accountActive: false,
        permissionGranted: false,
      });
      throw new ForbiddenException("An active administrator account is required.");
    }
    if (account.role === AdminRole.ROOT_ADMIN) return true;
    if (account.permissions.some(({ permission }) => permission === required)) return true;
    console.warn("[DealSe Auth] admin permission check denied", {
      stage: "admin_permission_check",
      httpStatus: 403,
      accountActive: true,
      permissionGranted: false,
      requiredPermission: required,
    });
    throw new ForbiddenException("This administrator does not have the required permission.");
  }
}
