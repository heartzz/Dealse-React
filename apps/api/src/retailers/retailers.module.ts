import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module.js";
import { RetailersController } from "./retailers.controller.js";
import { RetailersService } from "./retailers.service.js";

@Module({
  imports: [DatabaseModule],
  controllers: [RetailersController],
  providers: [RetailersService],
})
export class RetailersModule {}
