import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "../generated/prisma/client.js";
import { MediaProcessingStatus } from "../generated/prisma/enums.js";
import { PrismaService } from "../database/prisma.service.js";
import type { AuthPrincipal } from "../auth/auth.types.js";
import { publiclyVisibleDealWhere } from "../deals/public-deal-visibility.js";

const dealInclude = {
  category: { select: { id: true, slug: true, name: true } },
  store: { select: { id: true, name: true, slug: true, city: true, region: true } },
  images: { where: { isPrimary: true, mediaAsset: { is: { processingStatus: MediaProcessingStatus.READY, deletedAt: null } } }, take: 1, include: { mediaAsset: { select: { id: true, altText: true } } } },
} as const;
type FavouriteDeal = Prisma.DealGetPayload<{ include: typeof dealInclude }>;

@Injectable()
export class FavouritesService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async list(user: AuthPrincipal) {
    const now = new Date();
    return (await this.prisma.favourite.findMany({
      where: { userId: user.userId, deal: publiclyVisibleDealWhere(now) }, orderBy: { createdAt: "desc" },
      include: { deal: { include: dealInclude } },
    })).map(({ createdAt, deal }) => this.present(deal, createdAt));
  }

  async save(user: AuthPrincipal, dealId: string) {
    const now = new Date();
    const deal = await this.prisma.deal.findFirst({ where: { id: dealId, ...publiclyVisibleDealWhere(now) }, select: { id: true } });
    if (!deal) throw new NotFoundException("Offer not found.");
    await this.prisma.favourite.upsert({ where: { userId_dealId: { userId: user.userId, dealId } }, create: { userId: user.userId, dealId }, update: {} });
    return { dealId, saved: true };
  }

  async remove(user: AuthPrincipal, dealId: string) {
    await this.prisma.favourite.deleteMany({ where: { userId: user.userId, dealId } });
    return { dealId, saved: false };
  }

  private present(deal: FavouriteDeal, savedAt: Date) {
    const offer = deal.offerType === "PERCENTAGE"
      ? `${(deal.discountBps ?? 0) / 100}% off`
      : deal.offerType === "FIXED_AMOUNT"
        ? `${deal.currency ?? ""} ${Number(deal.discountAmountMinor ?? 0n) / 100} off`
        : deal.offerType === "BUY_X_GET_Y" ? "Special bundle" : "Special offer";
    return {
      id: deal.id, slug: deal.slug, title: deal.title, summary: deal.summary, description: deal.details, terms: deal.terms,
      categoryId: deal.categoryId, category: deal.category,
      offerType: deal.offerType.toLowerCase(), discountBps: deal.discountBps,
      discountAmountMinor: deal.discountAmountMinor?.toString() ?? null, currency: deal.currency,
      originalPriceMinor: deal.originalPriceMinor?.toString() ?? null, offerPriceMinor: deal.offerPriceMinor?.toString() ?? null,
      offer,
      startsAt: deal.startsAt.toISOString(), endsAt: deal.endsAt.toISOString(), status: deal.status.toLowerCase(),
      image: deal.imageReference ?? (deal.images[0]?.mediaAsset.id ? `/media/${deal.images[0].mediaAsset.id}` : null),
      imageAlt: deal.images[0]?.mediaAsset.altText ?? deal.title,
      store: deal.store, savedAt: savedAt.toISOString(),
    };
  }
}
