import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module.js";
import { FavouritesController } from "./favourites.controller.js";
import { FavouritesService } from "./favourites.service.js";

@Module({ imports: [DatabaseModule], controllers: [FavouritesController], providers: [FavouritesService] })
export class FavouritesModule {}
