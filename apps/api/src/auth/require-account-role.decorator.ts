import { SetMetadata } from "@nestjs/common";
import type { AccountRole } from "../generated/prisma/enums.js";

export const REQUIRED_ACCOUNT_ROLES = "required_account_roles";

export const RequireAccountRole = (...roles: AccountRole[]) =>
  SetMetadata(REQUIRED_ACCOUNT_ROLES, roles);
