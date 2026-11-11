import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module.js";
import { AdminController } from "./admin.controller.js";
import { AdminService } from "./admin.service.js";
import { DealReportsController } from "./deal-reports.controller.js";
import { DealReportsService } from "./deal-reports.service.js";

@Module({
  imports: [DatabaseModule],
  controllers: [AdminController, DealReportsController],
  providers: [AdminService, DealReportsService],
})
export class AdminModule {}
