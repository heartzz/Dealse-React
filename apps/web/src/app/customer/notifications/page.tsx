import { redirect } from "next/navigation";
import { NotificationInbox } from "../../../components/NotificationInbox";
import { requireWebSession } from "../../../lib/auth-session";
import { callDealseApi, type DealSeNotificationPage, type DealSeUser } from "../../../lib/dealse-api";

export const dynamic = "force-dynamic";

export default async function CustomerNotificationsPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { accessToken } = await requireWebSession("/customer/login");
  let user: DealSeUser;
  try {
    user = await callDealseApi<DealSeUser>("/auth/me", accessToken);
  } catch {
    redirect("/customer/login?error=session");
  }
  if (!user.roles.includes("customer")) redirect("/customer/login?error=customer_profile");

  const params = await searchParams;
  let result: DealSeNotificationPage | null = null;
  let error = params.error === "update";
  try {
    result = await callDealseApi<DealSeNotificationPage>("/notifications/me?page=1&limit=50", accessToken);
  } catch {
    error = true;
  }
  return <NotificationInbox surface="customer" result={result} error={error} />;
}
