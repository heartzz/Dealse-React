import { BadRequestException, Body, Controller, Get, Inject, Param, ParseUUIDPipe, Patch, Post, Query } from "@nestjs/common";
import { CurrentUser } from "../auth/current-user.decorator.js";
import type { AuthPrincipal } from "../auth/auth.types.js";
import { PublicRoute } from "../auth/public-route.decorator.js";
import { RequireAccountRole } from "../auth/require-account-role.decorator.js";
import { AccountRole } from "../generated/prisma/enums.js";
import { CreateDealDto, UpdateDealDto } from "./dto/deal.dto.js";
import { DiscoverDealsDto, type DiscoverDealsSort } from "./dto/discover-deals.dto.js";
import { DealsService } from "./deals.service.js";

const discoveryQueryKeys = new Set(["page", "limit", "q", "category", "city", "sort", "latitude", "longitude", "radiusKm"]);
const discoverySorts: readonly DiscoverDealsSort[] = ["newest", "discount", "nearest"];

function boundedNumber(value: unknown, name: string, minimum: number, maximum: number, fallback?: number): number {
  if (value === undefined && fallback !== undefined) return fallback;
  if (typeof value !== "number" && typeof value !== "string") throw new BadRequestException(`${name} must be a number.`);
  if (typeof value === "string" && value.trim() === "") throw new BadRequestException(`${name} must be a number.`);
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < minimum || parsed > maximum) {
    throw new BadRequestException(`${name} must be between ${minimum} and ${maximum}.`);
  }
  return parsed;
}

function optionalSearchText(value: unknown, name: string, maximumLength: number): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") throw new BadRequestException(`${name} must be text.`);
  const normalized = value.trim();
  if (normalized.length < 1 || normalized.length > maximumLength) {
    throw new BadRequestException(`${name} must contain between 1 and ${maximumLength} characters.`);
  }
  return normalized;
}

@Controller()
export class DealsController {
  constructor(@Inject(DealsService) private readonly deals: DealsService) {}

  @Get("categories") @PublicRoute()
  categories() { return this.deals.categories(); }

  @Get("deals") @PublicRoute()
  discover(@Query() input: DiscoverDealsDto) {
    const unexpectedKey = Object.keys(input).find((key) => !discoveryQueryKeys.has(key));
    if (unexpectedKey) throw new BadRequestException(`Unknown discovery query parameter: ${unexpectedKey}.`);

    const page = boundedNumber(input.page, "page", 1, Number.MAX_SAFE_INTEGER, 1);
    const limit = boundedNumber(input.limit, "limit", 1, 100, 20);
    if (!Number.isInteger(page)) throw new BadRequestException("page must be a positive integer.");
    if (!Number.isInteger(limit)) throw new BadRequestException("limit must be a positive integer.");
    const q = optionalSearchText(input.q, "q", 100);
    const category = optionalSearchText(input.category, "category", 100);
    const city = optionalSearchText(input.city, "city", 100);
    const sort = input.sort;
    if (sort !== undefined && (typeof sort !== "string" || !discoverySorts.includes(sort as DiscoverDealsSort))) {
      throw new BadRequestException("sort must be newest, discount, or nearest.");
    }
    const latitude = input.latitude === undefined ? undefined : boundedNumber(input.latitude, "latitude", -90, 90);
    const longitude = input.longitude === undefined ? undefined : boundedNumber(input.longitude, "longitude", -180, 180);
    const radiusKm = boundedNumber(input.radiusKm, "radiusKm", 1, 50, 10);
    if ((latitude === undefined) !== (longitude === undefined)) {
      throw new BadRequestException("Provide both latitude and longitude for nearby search.");
    }
    if (sort === "nearest" && latitude === undefined) {
      throw new BadRequestException("Provide latitude and longitude to sort by distance.");
    }
    return this.deals.discover({ page, limit, q, category, city, sort, latitude, longitude, radiusKm });
  }

  @Get("deals/:dealId") @PublicRoute()
  detail(@Param("dealId", new ParseUUIDPipe()) dealId: string) { return this.deals.publicDetail(dealId); }

  @Get("stores/:storeId") @PublicRoute()
  storeDetail(@Param("storeId", new ParseUUIDPipe()) storeId: string) { return this.deals.publicStoreDetail(storeId); }

  @Get("retailers/:retailerId/deals") @RequireAccountRole(AccountRole.RETAILER)
  listMine(@CurrentUser() user: AuthPrincipal, @Param("retailerId", new ParseUUIDPipe()) retailerId: string) { return this.deals.listMine(user, retailerId); }

  @Post("retailers/:retailerId/deals") @RequireAccountRole(AccountRole.RETAILER)
  create(@CurrentUser() user: AuthPrincipal, @Param("retailerId", new ParseUUIDPipe()) retailerId: string, @Body() input: CreateDealDto) { return this.deals.create(user, retailerId, input); }

  @Get("retailers/:retailerId/deals/:dealId/preview") @RequireAccountRole(AccountRole.RETAILER)
  preview(@CurrentUser() user: AuthPrincipal, @Param("retailerId", new ParseUUIDPipe()) retailerId: string, @Param("dealId", new ParseUUIDPipe()) dealId: string) { return this.deals.preview(user, retailerId, dealId); }

  @Patch("retailers/:retailerId/deals/:dealId") @RequireAccountRole(AccountRole.RETAILER)
  update(@CurrentUser() user: AuthPrincipal, @Param("retailerId", new ParseUUIDPipe()) retailerId: string, @Param("dealId", new ParseUUIDPipe()) dealId: string, @Body() input: UpdateDealDto) { return this.deals.update(user, retailerId, dealId, input); }

  @Post("retailers/:retailerId/deals/:dealId/publish") @RequireAccountRole(AccountRole.RETAILER)
  publish(@CurrentUser() user: AuthPrincipal, @Param("retailerId", new ParseUUIDPipe()) retailerId: string, @Param("dealId", new ParseUUIDPipe()) dealId: string) { return this.deals.publish(user, retailerId, dealId); }

  @Post("retailers/:retailerId/deals/:dealId/pause") @RequireAccountRole(AccountRole.RETAILER)
  pause(@CurrentUser() user: AuthPrincipal, @Param("retailerId", new ParseUUIDPipe()) retailerId: string, @Param("dealId", new ParseUUIDPipe()) dealId: string) { return this.deals.pause(user, retailerId, dealId); }
}
