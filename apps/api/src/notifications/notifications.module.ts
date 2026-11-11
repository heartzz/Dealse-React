import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module.js";
import { FollowedStoresController, NotificationsController } from "./notifications.controller.js";
import { NotificationsService } from "./notifications.service.js";

@Module({
  imports: [DatabaseModule],
  controllers: [NotificationsController, FollowedStoresController],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
