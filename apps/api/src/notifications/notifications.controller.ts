import { Controller, Delete, Get, Inject, Param, ParseUUIDPipe, Patch, Post, Query } from "@nestjs/common";
import { CurrentUser } from "../auth/current-user.decorator.js";
import type { AuthPrincipal } from "../auth/auth.types.js";
import { RequireAccountRole } from "../auth/require-account-role.decorator.js";
import { AccountRole } from "../generated/prisma/enums.js";
import { NotificationListDto } from "./dto/notification-list.dto.js";
import { NotificationsService } from "./notifications.service.js";

@Controller("notifications/me")
@RequireAccountRole(AccountRole.CUSTOMER, AccountRole.RETAILER)
export class NotificationsController {
  constructor(@Inject(NotificationsService) private readonly notifications: NotificationsService) {}

  @Get()
  list(@CurrentUser() user: AuthPrincipal, @Query() query: NotificationListDto) {
    return this.notifications.list(user, query.page, query.limit);
  }

  @Patch(":notificationId/read")
  markRead(@CurrentUser() user: AuthPrincipal, @Param("notificationId", new ParseUUIDPipe()) notificationId: string) {
    return this.notifications.markRead(user, notificationId);
  }

  @Post("read-all")
  markAllRead(@CurrentUser() user: AuthPrincipal) {
    return this.notifications.markAllRead(user);
  }
}

@Controller("customers/me/followed-stores")
@RequireAccountRole(AccountRole.CUSTOMER)
export class FollowedStoresController {
  constructor(@Inject(NotificationsService) private readonly notifications: NotificationsService) {}

  @Get()
  list(@CurrentUser() user: AuthPrincipal) {
    return this.notifications.followedStores(user);
  }

  @Post(":storeId")
  follow(@CurrentUser() user: AuthPrincipal, @Param("storeId", new ParseUUIDPipe()) storeId: string) {
    return this.notifications.followStore(user, storeId);
  }

  @Delete(":storeId")
  unfollow(@CurrentUser() user: AuthPrincipal, @Param("storeId", new ParseUUIDPipe()) storeId: string) {
    return this.notifications.unfollowStore(user, storeId);
  }
}
