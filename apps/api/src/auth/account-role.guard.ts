import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { AccountRole } from "../generated/prisma/enums.js";
import type { AuthenticatedRequest } from "./auth.types.js";
import { REQUIRED_ACCOUNT_ROLES } from "./require-account-role.decorator.js";

@Injectable()
export class AccountRoleGuard implements CanActivate {
  constructor(@Inject(Reflector) private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<AccountRole[]>(
      REQUIRED_ACCOUNT_ROLES,
      [context.getHandler(), context.getClass()],
    );
    if (!requiredRoles?.length) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const principal = request.authPrincipal;
    if (!principal) throw new UnauthorizedException();
    if (!requiredRoles.some((role) => principal.roles.includes(role))) {
      throw new ForbiddenException("This account does not have the required role.");
    }
    if (requiredRoles.includes(AccountRole.ADMIN) && principal.assuranceLevel !== "aal2") {
      throw new ForbiddenException("Administrator access requires a verified second factor.");
    }
    return true;
  }
}
