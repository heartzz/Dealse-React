import { Body, Controller, Inject, Param, ParseUUIDPipe, Post } from "@nestjs/common";
import { CurrentUser } from "../auth/current-user.decorator.js";
import type { AuthPrincipal } from "../auth/auth.types.js";
import { RequireAccountRole } from "../auth/require-account-role.decorator.js";
import { AccountRole } from "../generated/prisma/enums.js";
import { DealReportsService } from "./deal-reports.service.js";
import { CreateDealReportDto } from "./dto/admin.dto.js";

@Controller("deals/:dealId/reports")
@RequireAccountRole(AccountRole.CUSTOMER)
export class DealReportsController {
  constructor(@Inject(DealReportsService) private readonly reports: DealReportsService) {}

  @Post()
  create(@CurrentUser() user: AuthPrincipal, @Param("dealId", new ParseUUIDPipe()) dealId: string, @Body() input: CreateDealReportDto) {
    return this.reports.create(user, dealId, input);
  }
}
