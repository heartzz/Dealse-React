import { Controller, Get, Inject, Query, UseGuards } from "@nestjs/common";
import { RequireAccountRole } from "../auth/require-account-role.decorator.js";
import { AccountRole, AdminPermissionKey } from "../generated/prisma/enums.js";
import { AdminPermissionGuard } from "./admin-permission.guard.js";
import { RequireAdminPermission } from "./require-admin-permission.decorator.js";
import { AdminAnalyticsQueryDto } from "./dto/analytics.dto.js";
import { AnalyticsService } from "./analytics.service.js";

@Controller("admin/analytics")
@RequireAccountRole(AccountRole.ADMIN)
@UseGuards(AdminPermissionGuard)
export class AnalyticsController {
  constructor(@Inject(AnalyticsService) private readonly analytics: AnalyticsService) {}

  @Get("reports")
  @RequireAdminPermission(AdminPermissionKey.ANALYTICS_READ)
  reports(@Query() query: AdminAnalyticsQueryDto) {
    return this.analytics.reports(query.period ?? "30d");
  }
}
