import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module.js";
import { NotificationsModule } from "../notifications/notifications.module.js";
import { DealsController } from "./deals.controller.js";
import { DealsService } from "./deals.service.js";

@Module({ imports: [DatabaseModule, NotificationsModule], controllers: [DealsController], providers: [DealsService], exports: [DealsService] })
export class DealsModule {}
