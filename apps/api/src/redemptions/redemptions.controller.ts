import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import type { AuthPrincipal, AuthenticatedRequest } from "../auth/auth.types.js";
import { CurrentUser } from "../auth/current-user.decorator.js";
import { RequireAccountRole } from "../auth/require-account-role.decorator.js";
import { AccountRole, AdminPermissionKey } from "../generated/prisma/enums.js";
import { AdminPermissionGuard } from "../admin/admin-permission.guard.js";
import { RequireAdminPermission } from "../admin/require-admin-permission.decorator.js";
import { ClaimDealDto, RedemptionCredentialDto, RedemptionPageQueryDto } from "./dto/redemption.dto.js";
import { RedemptionsService } from "./redemptions.service.js";

type RequestWithId = AuthenticatedRequest & {
  headers: AuthenticatedRequest["headers"] & { "x-request-id"?: string | string[] };
};

function requestMeta(request: RequestWithId) {
  const header = request.headers["x-request-id"];
  return { requestId: Array.isArray(header) ? header[0] : header };
}

@Controller("customers/me/claims")
@RequireAccountRole(AccountRole.CUSTOMER)
export class CustomerRedemptionClaimsController {
  constructor(@Inject(RedemptionsService) private readonly redemptions: RedemptionsService) {}

  @Post()
  @Header("Cache-Control", "private, no-store")
  claim(@CurrentUser() customer: AuthPrincipal, @Body() input: ClaimDealDto, @Req() request: RequestWithId) {
    return this.redemptions.claim(customer, input.dealId, requestMeta(request));
  }

  @Get()
  @Header("Cache-Control", "private, no-store")
  list(@CurrentUser() customer: AuthPrincipal, @Query() query: RedemptionPageQueryDto) {
    return this.redemptions.listCustomerClaims(customer, query);
  }

  @Post(":claimId/credential/rotate")
  @Header("Cache-Control", "private, no-store")
  rotate(
    @CurrentUser() customer: AuthPrincipal,
    @Param("claimId", new ParseUUIDPipe()) claimId: string,
    @Req() request: RequestWithId,
  ) {
    return this.redemptions.rotate(customer, claimId, requestMeta(request));
  }

  @Delete(":claimId")
  cancel(
    @CurrentUser() customer: AuthPrincipal,
    @Param("claimId", new ParseUUIDPipe()) claimId: string,
    @Req() request: RequestWithId,
  ) {
    return this.redemptions.cancel(customer, claimId, requestMeta(request));
  }
}

@Controller("retailers/:retailerId/stores/:storeId/redemptions")
@RequireAccountRole(AccountRole.RETAILER)
export class RetailerRedemptionsController {
  constructor(@Inject(RedemptionsService) private readonly redemptions: RedemptionsService) {}

  @Post("validate")
  @HttpCode(HttpStatus.OK)
  @Header("Cache-Control", "private, no-store")
  validate(
    @CurrentUser() retailer: AuthPrincipal,
    @Param("retailerId", new ParseUUIDPipe()) retailerId: string,
    @Param("storeId", new ParseUUIDPipe()) storeId: string,
    @Body() input: RedemptionCredentialDto,
  ) {
    return this.redemptions.validateRetailer(retailer, retailerId, storeId, input.credential);
  }

  @Post("confirm")
  @HttpCode(HttpStatus.OK)
  @Header("Cache-Control", "private, no-store")
  confirm(
    @CurrentUser() retailer: AuthPrincipal,
    @Param("retailerId", new ParseUUIDPipe()) retailerId: string,
    @Param("storeId", new ParseUUIDPipe()) storeId: string,
    @Body() input: RedemptionCredentialDto,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Req() request: RequestWithId,
  ) {
    return this.redemptions.confirmRetailer(retailer, retailerId, storeId, input.credential, idempotencyKey ?? "", requestMeta(request));
  }

  @Get()
  @Header("Cache-Control", "private, no-store")
  history(
    @CurrentUser() retailer: AuthPrincipal,
    @Param("retailerId", new ParseUUIDPipe()) retailerId: string,
    @Param("storeId", new ParseUUIDPipe()) storeId: string,
    @Query() query: RedemptionPageQueryDto,
  ) {
    return this.redemptions.retailerHistory(retailer, retailerId, storeId, query);
  }
}

@Controller("admin")
@RequireAccountRole(AccountRole.ADMIN)
@UseGuards(AdminPermissionGuard)
export class AdminRedemptionsController {
  constructor(@Inject(RedemptionsService) private readonly redemptions: RedemptionsService) {}

  @Get("redemptions")
  @RequireAdminPermission(AdminPermissionKey.REDEMPTIONS_READ)
  listRedemptions(@Query() query: RedemptionPageQueryDto) {
    return this.redemptions.adminRedemptions(query);
  }

  @Get("redemptions/:redemptionId")
  @RequireAdminPermission(AdminPermissionKey.REDEMPTIONS_READ)
  getRedemption(@Param("redemptionId", new ParseUUIDPipe()) redemptionId: string) {
    return this.redemptions.adminRedemption(redemptionId);
  }

  @Get("redemption-claims")
  @RequireAdminPermission(AdminPermissionKey.REDEMPTIONS_READ)
  listClaims(@Query() query: RedemptionPageQueryDto) {
    return this.redemptions.adminClaims(query);
  }

  @Get("redemption-claims/:claimId")
  @RequireAdminPermission(AdminPermissionKey.REDEMPTIONS_READ)
  getClaim(@Param("claimId", new ParseUUIDPipe()) claimId: string) {
    return this.redemptions.adminClaim(claimId);
  }
}
