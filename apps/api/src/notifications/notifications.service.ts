import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { AccountRole, UserStatus } from "../generated/prisma/enums.js";
import type { Prisma } from "../generated/prisma/client.js";
import type { AuthPrincipal } from "../auth/auth.types.js";
import { PrismaService } from "../database/prisma.service.js";
import { publiclyVisibleStoreWhere } from "../deals/public-deal-visibility.js";

export interface PublishedDealNotice {
  actorUserId: string;
  dealId: string;
  dealSlug: string;
  dealTitle: string;
  storeId: string;
  storeName: string;
  version: number;
}

@Injectable()
export class NotificationsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async list(user: AuthPrincipal, page: number, limit: number) {
    const where = { userId: user.userId };
    const [records, total, unreadCount] = await this.prisma.$transaction([
      this.prisma.notification.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (page - 1) * limit,
        take: limit,
        select: { id: true, kind: true, title: true, body: true, href: true, storeId: true, dealId: true, createdAt: true, readAt: true },
      }),
      this.prisma.notification.count({ where }),
      this.prisma.notification.count({ where: { ...where, readAt: null } }),
    ]);
    return {
      items: records.map((record) => ({ ...record, createdAt: record.createdAt.toISOString(), readAt: record.readAt?.toISOString() ?? null, isRead: record.readAt !== null })),
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      unreadCount,
    };
  }

  async markRead(user: AuthPrincipal, notificationId: string) {
    await this.prisma.notification.updateMany({
      where: { id: notificationId, userId: user.userId, readAt: null },
      data: { readAt: new Date() },
    });
    const notification = await this.prisma.notification.findFirst({
      where: { id: notificationId, userId: user.userId },
      select: { id: true, readAt: true },
    });
    if (!notification) throw new NotFoundException("Notification not found.");
    return { id: notification.id, isRead: notification.readAt !== null, readAt: notification.readAt?.toISOString() ?? null };
  }

  async markAllRead(user: AuthPrincipal) {
    const result = await this.prisma.notification.updateMany({
      where: { userId: user.userId, readAt: null },
      data: { readAt: new Date() },
    });
    return { updatedCount: result.count };
  }

  async followedStores(user: AuthPrincipal) {
    const records = await this.prisma.followedStore.findMany({
      where: { userId: user.userId, store: publiclyVisibleStoreWhere },
      orderBy: { createdAt: "desc" },
      select: {
        createdAt: true,
        store: { select: { id: true, slug: true, name: true, description: true, locality: true, city: true } },
      },
    });
    return records.map(({ createdAt, store }) => ({ ...store, followedAt: createdAt.toISOString() }));
  }

  async followStore(user: AuthPrincipal, storeId: string) {
    const store = await this.prisma.store.findFirst({ where: { id: storeId, ...publiclyVisibleStoreWhere }, select: { id: true } });
    if (!store) throw new NotFoundException("Store not found.");
    await this.prisma.followedStore.upsert({
      where: { userId_storeId: { userId: user.userId, storeId } },
      create: { userId: user.userId, storeId },
      update: {},
    });
    return { storeId, following: true };
  }

  async unfollowStore(user: AuthPrincipal, storeId: string) {
    await this.prisma.followedStore.deleteMany({ where: { userId: user.userId, storeId } });
    return { storeId, following: false };
  }

  async notifyStoreFollowersOfPublishedDeal(tx: Prisma.TransactionClient, input: PublishedDealNotice) {
    const followers = await tx.followedStore.findMany({
      where: {
        storeId: input.storeId,
        userId: { not: input.actorUserId },
        user: { status: UserStatus.ACTIVE, accountRoles: { some: { role: AccountRole.CUSTOMER } } },
      },
      select: { userId: true },
    });
    const eventKey = String(input.version);
    const href = `/deals/${input.dealId}/${input.dealSlug}`;
    const notifications = [
      {
        userId: input.actorUserId,
        kind: "RETAILER_PUBLISH_CONFIRMATION",
        title: "Your offer is live",
        body: `${input.dealTitle} is now published on DealSe.`,
        href: "/retailer/dashboard",
        storeId: input.storeId,
        dealId: input.dealId,
        dedupeKey: `retailer-publish:${input.dealId}:${eventKey}`,
      },
      ...followers.map(({ userId }) => ({
        userId,
        kind: "STORE_ANNOUNCEMENT",
        title: `New offer at ${input.storeName}`,
        body: `${input.storeName} published ${input.dealTitle}. View offer details and availability.`,
        href,
        storeId: input.storeId,
        dealId: input.dealId,
        dedupeKey: `store-announcement:${input.dealId}:${eventKey}`,
      })),
    ];
    if (notifications.length) await tx.notification.createMany({ data: notifications, skipDuplicates: true });
  }

  async notifyCustomersWhoSavedDeal(tx: Prisma.TransactionClient, input: Omit<PublishedDealNotice, "actorUserId">) {
    const customers = await tx.favourite.findMany({
      where: {
        dealId: input.dealId,
        user: { status: UserStatus.ACTIVE, accountRoles: { some: { role: AccountRole.CUSTOMER } } },
      },
      select: { userId: true },
    });
    if (!customers.length) return;
    await tx.notification.createMany({
      data: customers.map(({ userId }) => ({
        userId,
        kind: "FAVOURITE_DEAL_UPDATED",
        title: "A saved offer has changed",
        body: `${input.dealTitle} at ${input.storeName} was updated. Review the latest details.`,
        href: `/deals/${input.dealId}/${input.dealSlug}`,
        storeId: input.storeId,
        dealId: input.dealId,
        dedupeKey: `favourite-deal-update:${input.dealId}:${input.version}`,
      })),
      skipDuplicates: true,
    });
  }
}
