import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module.js";
import { AdminController } from "./admin.controller.js";
import { AdminService } from "./admin.service.js";
import { DealReportsController } from "./deal-reports.controller.js";
import { DealReportsService } from "./deal-reports.service.js";
import { AdminPermissionGuard } from "./admin-permission.guard.js";
import { DealsModule } from "../deals/deals.module.js";
import { MediaModule } from "../media/media.module.js";
import { AdminUsersController, AdminInvitationAcceptanceController } from "./admin-users.controller.js";
import { AdminUsersService } from "./admin-users.service.js";
import { AnalyticsController } from "./analytics.controller.js";
import { AnalyticsService } from "./analytics.service.js";

@Module({
  imports: [DatabaseModule, DealsModule, MediaModule],
  controllers: [AdminController, DealReportsController, AdminUsersController, AdminInvitationAcceptanceController, AnalyticsController],
  providers: [AdminService, DealReportsService, AdminPermissionGuard, AdminUsersService, AnalyticsService],
})
export class AdminModule {}
