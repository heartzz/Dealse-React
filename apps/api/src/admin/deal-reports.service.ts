import { ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "../generated/prisma/client.js";
import { DealStatus } from "../generated/prisma/enums.js";
import type { AuthPrincipal } from "../auth/auth.types.js";
import { PrismaService } from "../database/prisma.service.js";
import type { CreateDealReportDto } from "./dto/admin.dto.js";

@Injectable()
export class DealReportsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async create(user: AuthPrincipal, dealId: string, input: CreateDealReportDto) {
    const deal = await this.prisma.deal.findFirst({ where: { id: dealId, status: DealStatus.PUBLISHED }, select: { id: true } });
    if (!deal) throw new NotFoundException("Offer not found.");
    try {
      return await this.prisma.dealReport.create({
        data: { dealId, reporterUserId: user.userId, reason: input.reason, details: input.details || null },
        select: { id: true, dealId: true, reason: true, details: true, status: true, createdAt: true },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException("You have already reported this offer.");
      }
      throw error;
    }
  }
}
