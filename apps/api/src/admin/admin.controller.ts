import { Body, Controller, Get, Inject, Param, ParseUUIDPipe, Patch, Post, Query, Res, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../auth/current-user.decorator.js";
import type { AuthPrincipal } from "../auth/auth.types.js";
import { RequireAccountRole } from "../auth/require-account-role.decorator.js";
import { AccountRole, AdminPermissionKey } from "../generated/prisma/enums.js";
import { AdminService } from "./admin.service.js";
import { AdminAuditQueryDto, AdminCustomerQueryDto, AdminDealQueryDto, AdminReportQueryDto, AdminRetailerQueryDto, AdminStoreQueryDto, CreateCategoryDto, ModerationReasonDto, ReviewDealReportDto, UpdateCategoryDto } from "./dto/admin.dto.js";
import { AdminPermissionGuard } from "./admin-permission.guard.js";
import { RequireAdminPermission } from "./require-admin-permission.decorator.js";
import { MediaService } from "../media/media.service.js";

interface AdminMediaResponse { setHeader(name: string, value: string | number): void; status(code: number): AdminMediaResponse; send(body: Buffer): AdminMediaResponse; }

@Controller("admin")
@RequireAccountRole(AccountRole.ADMIN)
@UseGuards(AdminPermissionGuard)
export class AdminController {
  constructor(@Inject(AdminService) private readonly admin: AdminService, @Inject(MediaService) private readonly media: MediaService) {}

  @Get("stores/:storeId/media/:mediaId") @RequireAdminPermission(AdminPermissionKey.STORES_READ) async storeMedia(@Param("storeId", new ParseUUIDPipe()) storeId: string, @Param("mediaId", new ParseUUIDPipe()) mediaId: string, @Res() response: AdminMediaResponse) {
    const image = await this.media.readAdminContent(mediaId, "store", storeId);
    response.setHeader("Content-Type", image.mimeType); response.setHeader("Content-Length", image.bytes.length); response.setHeader("Cache-Control", "private, no-store"); response.setHeader("X-Content-Type-Options", "nosniff"); response.setHeader("ETag", `"${image.checksumSha256}"`);
    return response.status(200).send(image.bytes);
  }

  @Get("deals/:dealId/media/:mediaId") @RequireAdminPermission(AdminPermissionKey.OFFERS_READ) async offerMedia(@Param("dealId", new ParseUUIDPipe()) dealId: string, @Param("mediaId", new ParseUUIDPipe()) mediaId: string, @Res() response: AdminMediaResponse) {
    const image = await this.media.readAdminContent(mediaId, "deal", dealId);
    response.setHeader("Content-Type", image.mimeType); response.setHeader("Content-Length", image.bytes.length); response.setHeader("Cache-Control", "private, no-store"); response.setHeader("X-Content-Type-Options", "nosniff"); response.setHeader("ETag", `"${image.checksumSha256}"`);
    return response.status(200).send(image.bytes);
  }

  @Get("me") @RequireAdminPermission(AdminPermissionKey.DASHBOARD_READ) access(@CurrentUser() user: AuthPrincipal) { return this.admin.access(user.userId); }
  @Get("overview") @RequireAdminPermission(AdminPermissionKey.DASHBOARD_READ) overview() { return this.admin.overview(); }
  @Get("customers") @RequireAdminPermission(AdminPermissionKey.CUSTOMERS_READ) customers(@Query() query: AdminCustomerQueryDto) { return this.admin.listCustomers(query); }
  @Get("retailers") @RequireAdminPermission(AdminPermissionKey.RETAILERS_READ) retailers(@Query() query: AdminRetailerQueryDto) { return this.admin.listRetailers(query); }
  @Get("retailers/:retailerId") @RequireAdminPermission(AdminPermissionKey.RETAILERS_READ) retailer(@Param("retailerId", new ParseUUIDPipe()) id: string) { return this.admin.getRetailer(id); }
  @Post("retailers/:retailerId/approve") @RequireAdminPermission(AdminPermissionKey.RETAILERS_REVIEW) approveRetailer(@CurrentUser() user: AuthPrincipal, @Param("retailerId", new ParseUUIDPipe()) id: string) { return this.admin.approveRetailer(user, id); }
  @Post("retailers/:retailerId/reject") @RequireAdminPermission(AdminPermissionKey.RETAILERS_REVIEW) rejectRetailer(@CurrentUser() user: AuthPrincipal, @Param("retailerId", new ParseUUIDPipe()) id: string, @Body() input: ModerationReasonDto) { return this.admin.rejectRetailer(user, id, input.reason); }
  @Post("retailers/:retailerId/suspend") @RequireAdminPermission(AdminPermissionKey.RETAILERS_SUSPEND) suspendRetailer(@CurrentUser() user: AuthPrincipal, @Param("retailerId", new ParseUUIDPipe()) id: string, @Body() input: ModerationReasonDto) { return this.admin.suspendRetailer(user, id, input.reason); }
  @Post("retailers/:retailerId/reactivate") @RequireAdminPermission(AdminPermissionKey.RETAILERS_SUSPEND) reactivateRetailer(@CurrentUser() user: AuthPrincipal, @Param("retailerId", new ParseUUIDPipe()) id: string) { return this.admin.reactivateRetailer(user, id); }

  @Get("stores") @RequireAdminPermission(AdminPermissionKey.STORES_READ) stores(@Query() query: AdminStoreQueryDto) { return this.admin.listStores(query); }
  @Get("stores/:storeId") @RequireAdminPermission(AdminPermissionKey.STORES_READ) store(@Param("storeId", new ParseUUIDPipe()) id: string) { return this.admin.getStore(id); }
  @Post("stores/:storeId/verify") @RequireAdminPermission(AdminPermissionKey.STORES_VERIFY) verifyStore(@CurrentUser() user: AuthPrincipal, @Param("storeId", new ParseUUIDPipe()) id: string) { return this.admin.verifyStore(user, id); }
  @Post("stores/:storeId/reject") @RequireAdminPermission(AdminPermissionKey.STORES_VERIFY) rejectStore(@CurrentUser() user: AuthPrincipal, @Param("storeId", new ParseUUIDPipe()) id: string, @Body() input: ModerationReasonDto) { return this.admin.rejectStore(user, id, input.reason); }
  @Post("stores/:storeId/pause") @RequireAdminPermission(AdminPermissionKey.STORES_SUSPEND) pauseStore(@CurrentUser() user: AuthPrincipal, @Param("storeId", new ParseUUIDPipe()) id: string, @Body() input: ModerationReasonDto) { return this.admin.pauseStore(user, id, input.reason); }
  @Post("stores/:storeId/resume") @RequireAdminPermission(AdminPermissionKey.STORES_SUSPEND) resumeStore(@CurrentUser() user: AuthPrincipal, @Param("storeId", new ParseUUIDPipe()) id: string) { return this.admin.resumeStore(user, id); }
  @Post("stores/:storeId/suspend") @RequireAdminPermission(AdminPermissionKey.STORES_SUSPEND) suspendStore(@CurrentUser() user: AuthPrincipal, @Param("storeId", new ParseUUIDPipe()) id: string, @Body() input: ModerationReasonDto) { return this.admin.suspendStore(user, id, input.reason); }
  @Post("stores/:storeId/reactivate") @RequireAdminPermission(AdminPermissionKey.STORES_SUSPEND) reactivateStore(@CurrentUser() user: AuthPrincipal, @Param("storeId", new ParseUUIDPipe()) id: string) { return this.admin.resumeStore(user, id); }

  @Get("deals") @RequireAdminPermission(AdminPermissionKey.OFFERS_READ) deals(@Query() query: AdminDealQueryDto) { return this.admin.listDeals(query); }
  @Get("deals/:dealId") @RequireAdminPermission(AdminPermissionKey.OFFERS_READ) deal(@Param("dealId", new ParseUUIDPipe()) id: string) { return this.admin.getDeal(id); }
  @Post("deals/:dealId/approve") @RequireAdminPermission(AdminPermissionKey.OFFERS_REVIEW) approveDeal(@CurrentUser() user: AuthPrincipal, @Param("dealId", new ParseUUIDPipe()) id: string) { return this.admin.approveDeal(user, id); }
  @Post("deals/:dealId/reject") @RequireAdminPermission(AdminPermissionKey.OFFERS_REVIEW) rejectDeal(@CurrentUser() user: AuthPrincipal, @Param("dealId", new ParseUUIDPipe()) id: string, @Body() input: ModerationReasonDto) { return this.admin.rejectDeal(user, id, input.reason); }
  @Post("deals/:dealId/pause") @RequireAdminPermission(AdminPermissionKey.OFFERS_PAUSE) pauseDeal(@CurrentUser() user: AuthPrincipal, @Param("dealId", new ParseUUIDPipe()) id: string, @Body() input: ModerationReasonDto) { return this.admin.pauseDeal(user, id, input.reason); }
  @Post("deals/:dealId/resume") @RequireAdminPermission(AdminPermissionKey.OFFERS_PAUSE) resumeDeal(@CurrentUser() user: AuthPrincipal, @Param("dealId", new ParseUUIDPipe()) id: string) { return this.admin.resumeDeal(user, id); }
  @Post("deals/:dealId/suspend") @RequireAdminPermission(AdminPermissionKey.OFFERS_REMOVE) suspendDeal(@CurrentUser() user: AuthPrincipal, @Param("dealId", new ParseUUIDPipe()) id: string, @Body() input: ModerationReasonDto) { return this.admin.pauseDeal(user, id, input.reason); }
  @Post("deals/:dealId/reactivate") @RequireAdminPermission(AdminPermissionKey.OFFERS_REMOVE) reactivateDeal(@CurrentUser() user: AuthPrincipal, @Param("dealId", new ParseUUIDPipe()) id: string) { return this.admin.resumeDeal(user, id); }
  @Post("deals/:dealId/release") @RequireAdminPermission(AdminPermissionKey.OFFERS_REVIEW) releaseDeal(@CurrentUser() user: AuthPrincipal, @Param("dealId", new ParseUUIDPipe()) id: string) { return this.admin.releaseDeal(user, id); }

  @Get("categories") @RequireAdminPermission(AdminPermissionKey.CATEGORIES_READ) categories() { return this.admin.listCategories(); }
  @Post("categories") @RequireAdminPermission(AdminPermissionKey.CATEGORIES_MANAGE) createCategory(@CurrentUser() user: AuthPrincipal, @Body() input: CreateCategoryDto) { return this.admin.createCategory(user, input); }
  @Patch("categories/:categoryId") @RequireAdminPermission(AdminPermissionKey.CATEGORIES_MANAGE) updateCategory(@CurrentUser() user: AuthPrincipal, @Param("categoryId", new ParseUUIDPipe()) id: string, @Body() input: UpdateCategoryDto) { return this.admin.updateCategory(user, id, input); }

  @Get("reports") @RequireAdminPermission(AdminPermissionKey.OFFERS_READ) reports(@Query() query: AdminReportQueryDto) { return this.admin.listReports(query); }
  @Patch("reports/:reportId") @RequireAdminPermission(AdminPermissionKey.OFFERS_REVIEW) reviewReport(@CurrentUser() user: AuthPrincipal, @Param("reportId", new ParseUUIDPipe()) id: string, @Body() input: ReviewDealReportDto) { return this.admin.reviewReport(user, id, input); }
  @Get("audit-logs") @RequireAdminPermission(AdminPermissionKey.AUDIT_READ) auditLogs(@Query() query: AdminAuditQueryDto) { return this.admin.listAuditLogs(query); }
}
