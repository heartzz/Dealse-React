import { Controller, Delete, Get, Inject, Param, ParseUUIDPipe, Post } from "@nestjs/common";
import { CurrentUser } from "../auth/current-user.decorator.js";
import type { AuthPrincipal } from "../auth/auth.types.js";
import { RequireAccountRole } from "../auth/require-account-role.decorator.js";
import { AccountRole } from "../generated/prisma/enums.js";
import { FavouritesService } from "./favourites.service.js";

@Controller("customers/me/favourites")
@RequireAccountRole(AccountRole.CUSTOMER)
export class FavouritesController {
  constructor(@Inject(FavouritesService) private readonly favourites: FavouritesService) {}
  @Get() list(@CurrentUser() user: AuthPrincipal) { return this.favourites.list(user); }
  @Post(":dealId") save(@CurrentUser() user: AuthPrincipal, @Param("dealId", new ParseUUIDPipe()) dealId: string) { return this.favourites.save(user, dealId); }
  @Delete(":dealId") remove(@CurrentUser() user: AuthPrincipal, @Param("dealId", new ParseUUIDPipe()) dealId: string) { return this.favourites.remove(user, dealId); }
}
