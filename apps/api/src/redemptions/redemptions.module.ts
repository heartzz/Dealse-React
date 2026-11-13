import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module.js";
import { AdminPermissionGuard } from "../admin/admin-permission.guard.js";
import {
  AdminRedemptionsController,
  CustomerRedemptionClaimsController,
  RetailerRedemptionsController,
} from "./redemptions.controller.js";
import { RedemptionsService } from "./redemptions.service.js";

@Module({
  imports: [DatabaseModule],
  controllers: [CustomerRedemptionClaimsController, RetailerRedemptionsController, AdminRedemptionsController],
  providers: [RedemptionsService, AdminPermissionGuard],
})
export class RedemptionsModule {}
