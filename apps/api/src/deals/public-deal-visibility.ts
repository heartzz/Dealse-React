import { DealStatus, RetailerStatus, StoreStatus } from "../generated/prisma/enums.js";
import type { Prisma } from "../generated/prisma/client.js";

export const publiclyVisibleStoreWhere = {
  status: StoreStatus.ACTIVE,
  verifiedAt: { not: null },
  retailer: { is: { status: RetailerStatus.ACTIVE } },
} satisfies Prisma.StoreWhereInput;

export function publiclyVisibleDealWhere(now: Date = new Date()): Prisma.DealWhereInput {
  return {
    status: DealStatus.PUBLISHED,
    moderationHoldAt: null,
    startsAt: { lte: now },
    endsAt: { gt: now },
    store: { is: publiclyVisibleStoreWhere },
  };
}
