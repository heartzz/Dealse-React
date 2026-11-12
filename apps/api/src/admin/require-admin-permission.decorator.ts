import { SetMetadata } from "@nestjs/common";
import type { AdminPermissionKey } from "../generated/prisma/enums.js";

export const REQUIRED_ADMIN_PERMISSION = "required_admin_permission";

export const RequireAdminPermission = (permission: AdminPermissionKey) =>
  SetMetadata(REQUIRED_ADMIN_PERMISSION, permission);
