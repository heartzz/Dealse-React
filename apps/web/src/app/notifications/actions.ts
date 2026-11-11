"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireWebSession } from "../../lib/auth-session";
import { callDealseApi, type DealSeUser } from "../../lib/dealse-api";

type Surface = "customer" | "retailer";

async function updateNotifications(surface: Surface, notificationId?: string) {
  const destination = `/${surface}/notifications`;
  if (notificationId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(notificationId)) {
    redirect(`${destination}?error=update`);
  }

  const { accessToken } = await requireWebSession(`/${surface}/login`);
  let user: DealSeUser;
  try {
    user = await callDealseApi<DealSeUser>("/auth/me", accessToken);
  } catch {
    redirect(`/${surface}/login?error=session`);
  }
  if (!user.roles.includes(surface)) redirect(`/${surface}/login`);
  try {
    if (notificationId) {
      await callDealseApi(`/notifications/me/${notificationId}/read`, accessToken, { method: "PATCH" });
    } else {
      await callDealseApi("/notifications/me/read-all", accessToken, { method: "POST" });
    }
    revalidatePath(destination);
    revalidatePath(`/${surface}/dashboard`);
  } catch {
    redirect(`${destination}?error=update`);
  }

  redirect(destination);
}

export async function markNotificationRead(surface: Surface, notificationId: string) {
  return updateNotifications(surface, notificationId);
}

export async function markAllNotificationsRead(surface: Surface) {
  return updateNotifications(surface);
}
