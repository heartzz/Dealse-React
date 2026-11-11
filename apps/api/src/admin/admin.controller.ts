import { Body, Controller, Get, Inject, Param, ParseUUIDPipe, Patch, Post, Query } from "@nestjs/common";
import { CurrentUser } from "../auth/current-user.decorator.js";
import type { AuthPrincipal } from "../auth/auth.types.js";
import { RequireAccountRole } from "../auth/require-account-role.decorator.js";
import { AccountRole } from "../generated/prisma/enums.js";
import { AdminService } from "./admin.service.js";
import { AdminAuditQueryDto, AdminDealQueryDto, AdminReportQueryDto, AdminRetailerQueryDto, AdminStoreQueryDto, CreateCategoryDto, ModerationReasonDto, ReviewDealReportDto, UpdateCategoryDto } from "./dto/admin.dto.js";

@Controller("admin")
@RequireAccountRole(AccountRole.ADMIN)
export class AdminController {
  constructor(@Inject(AdminService) private readonly admin: AdminService) {}

  @Get("overview") overview() { return this.admin.overview(); }
  @Get("retailers") retailers(@Query() query: AdminRetailerQueryDto) { return this.admin.listRetailers(query); }
  @Post("retailers/:retailerId/approve") approveRetailer(@CurrentUser() user: AuthPrincipal, @Param("retailerId", new ParseUUIDPipe()) id: string) { return this.admin.approveRetailer(user, id); }
  @Post("retailers/:retailerId/suspend") suspendRetailer(@CurrentUser() user: AuthPrincipal, @Param("retailerId", new ParseUUIDPipe()) id: string, @Body() input: ModerationReasonDto) { return this.admin.suspendRetailer(user, id, input.reason); }
  @Post("retailers/:retailerId/reactivate") reactivateRetailer(@CurrentUser() user: AuthPrincipal, @Param("retailerId", new ParseUUIDPipe()) id: string) { return this.admin.reactivateRetailer(user, id); }

  @Get("stores") stores(@Query() query: AdminStoreQueryDto) { return this.admin.listStores(query); }
  @Post("stores/:storeId/verify") verifyStore(@CurrentUser() user: AuthPrincipal, @Param("storeId", new ParseUUIDPipe()) id: string) { return this.admin.verifyStore(user, id); }
  @Post("stores/:storeId/pause") pauseStore(@CurrentUser() user: AuthPrincipal, @Param("storeId", new ParseUUIDPipe()) id: string, @Body() input: ModerationReasonDto) { return this.admin.pauseStore(user, id, input.reason); }
  @Post("stores/:storeId/resume") resumeStore(@CurrentUser() user: AuthPrincipal, @Param("storeId", new ParseUUIDPipe()) id: string) { return this.admin.resumeStore(user, id); }

  @Get("deals") deals(@Query() query: AdminDealQueryDto) { return this.admin.listDeals(query); }
  @Post("deals/:dealId/pause") pauseDeal(@CurrentUser() user: AuthPrincipal, @Param("dealId", new ParseUUIDPipe()) id: string, @Body() input: ModerationReasonDto) { return this.admin.pauseDeal(user, id, input.reason); }
  @Post("deals/:dealId/release") releaseDeal(@CurrentUser() user: AuthPrincipal, @Param("dealId", new ParseUUIDPipe()) id: string) { return this.admin.releaseDeal(user, id); }

  @Get("categories") categories() { return this.admin.listCategories(); }
  @Post("categories") createCategory(@CurrentUser() user: AuthPrincipal, @Body() input: CreateCategoryDto) { return this.admin.createCategory(user, input); }
  @Patch("categories/:categoryId") updateCategory(@CurrentUser() user: AuthPrincipal, @Param("categoryId", new ParseUUIDPipe()) id: string, @Body() input: UpdateCategoryDto) { return this.admin.updateCategory(user, id, input); }

  @Get("reports") reports(@Query() query: AdminReportQueryDto) { return this.admin.listReports(query); }
  @Patch("reports/:reportId") reviewReport(@CurrentUser() user: AuthPrincipal, @Param("reportId", new ParseUUIDPipe()) id: string, @Body() input: ReviewDealReportDto) { return this.admin.reviewReport(user, id, input); }
  @Get("audit-logs") auditLogs(@Query() query: AdminAuditQueryDto) { return this.admin.listAuditLogs(query); }
}
