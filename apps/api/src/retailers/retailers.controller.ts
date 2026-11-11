import {
  Body,
  Controller,
  Get,
  Patch,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
} from "@nestjs/common";
import { CurrentUser } from "../auth/current-user.decorator.js";
import type { AuthPrincipal } from "../auth/auth.types.js";
import { RequireAccountRole } from "../auth/require-account-role.decorator.js";
import { AccountRole } from "../generated/prisma/enums.js";
import { CreateRetailerDto } from "./dto/create-retailer.dto.js";
import { CreateStoreDto } from "./dto/create-store.dto.js";
import { UpdateStoreDto } from "./dto/update-store.dto.js";
import { RetailersService } from "./retailers.service.js";

@Controller("retailers")
export class RetailersController {
  constructor(@Inject(RetailersService) private readonly retailersService: RetailersService) {}

  @Post()
  createRetailer(
    @CurrentUser() user: AuthPrincipal,
    @Body() input: CreateRetailerDto,
  ) {
    return this.retailersService.createRetailer(user, input);
  }

  @Get("mine")
  @RequireAccountRole(AccountRole.RETAILER)
  listMyRetailers(@CurrentUser() user: AuthPrincipal) {
    return this.retailersService.listMyRetailers(user);
  }

  @Post(":retailerId/stores")
  @RequireAccountRole(AccountRole.RETAILER)
  createStore(
    @CurrentUser() user: AuthPrincipal,
    @Param("retailerId", new ParseUUIDPipe()) retailerId: string,
    @Body() input: CreateStoreDto,
  ) {
    return this.retailersService.createStore(user, retailerId, input);
  }

  @Get(":retailerId/stores")
  @RequireAccountRole(AccountRole.RETAILER)
  listStores(
    @CurrentUser() user: AuthPrincipal,
    @Param("retailerId", new ParseUUIDPipe()) retailerId: string,
  ) {
    return this.retailersService.listStores(user, retailerId);
  }

  @Patch(":retailerId/stores/:storeId")
  @RequireAccountRole(AccountRole.RETAILER)
  updateStore(
    @CurrentUser() user: AuthPrincipal,
    @Param("retailerId", new ParseUUIDPipe()) retailerId: string,
    @Param("storeId", new ParseUUIDPipe()) storeId: string,
    @Body() input: UpdateStoreDto,
  ) {
    return this.retailersService.updateStore(user, retailerId, storeId, input);
  }
}
