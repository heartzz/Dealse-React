import { Module } from "@nestjs/common";
import { AppController } from "./app.controller.js";
import { DatabaseModule } from "./database/database.module.js";
import { AuthModule } from "./auth/auth.module.js";
import { RetailersModule } from "./retailers/retailers.module.js";
import { ProductsModule } from "./products/products.module.js";
import { DealsModule } from "./deals/deals.module.js";
import { FavouritesModule } from "./favourites/favourites.module.js";
import { AdminModule } from "./admin/admin.module.js";
import { MediaModule } from "./media/media.module.js";
import { NotificationsModule } from "./notifications/notifications.module.js";

@Module({
  imports: [DatabaseModule, AuthModule, RetailersModule, ProductsModule, DealsModule, FavouritesModule, AdminModule, MediaModule, NotificationsModule],
  controllers: [AppController],
})
export class AppModule {}
