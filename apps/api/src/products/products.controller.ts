import { Body, Controller, Delete, Get, Inject, Param, ParseUUIDPipe, Patch, Post } from "@nestjs/common";
import { CurrentUser } from "../auth/current-user.decorator.js";
import type { AuthPrincipal } from "../auth/auth.types.js";
import { RequireAccountRole } from "../auth/require-account-role.decorator.js";
import { AccountRole } from "../generated/prisma/enums.js";
import { CreateProductDto, UpdateProductDto } from "./dto/product.dto.js";
import { ProductsService } from "./products.service.js";

@Controller("retailers/:retailerId/products")
@RequireAccountRole(AccountRole.RETAILER)
export class ProductsController {
  constructor(@Inject(ProductsService) private readonly products: ProductsService) {}
  @Get() list(@CurrentUser() user: AuthPrincipal, @Param("retailerId", new ParseUUIDPipe()) retailerId: string) { return this.products.list(user, retailerId); }
  @Post() create(@CurrentUser() user: AuthPrincipal, @Param("retailerId", new ParseUUIDPipe()) retailerId: string, @Body() input: CreateProductDto) { return this.products.create(user, retailerId, input); }
  @Get(":productId") get(@CurrentUser() user: AuthPrincipal, @Param("retailerId", new ParseUUIDPipe()) retailerId: string, @Param("productId", new ParseUUIDPipe()) productId: string) { return this.products.get(user, retailerId, productId); }
  @Patch(":productId") update(@CurrentUser() user: AuthPrincipal, @Param("retailerId", new ParseUUIDPipe()) retailerId: string, @Param("productId", new ParseUUIDPipe()) productId: string, @Body() input: UpdateProductDto) { return this.products.update(user, retailerId, productId, input); }
  @Delete(":productId") archive(@CurrentUser() user: AuthPrincipal, @Param("retailerId", new ParseUUIDPipe()) retailerId: string, @Param("productId", new ParseUUIDPipe()) productId: string) { return this.products.archive(user, retailerId, productId); }
}
