import { redirect } from "next/navigation";
import { NotificationInbox } from "../../../components/NotificationInbox";
import { requireWebSession } from "../../../lib/auth-session";
import { callDealseApi, type DealSeNotificationPage, type DealSeUser } from "../../../lib/dealse-api";

export const dynamic = "force-dynamic";

export default async function RetailerNotificationsPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { accessToken } = await requireWebSession("/retailer/login");
  let user: DealSeUser;
  try {
    user = await callDealseApi<DealSeUser>("/auth/me", accessToken);
  } catch {
    redirect("/retailer/login?error=session");
  }
  if (!user.roles.includes("retailer")) redirect("/retailer/setup");

  const params = await searchParams;
  let result: DealSeNotificationPage | null = null;
  let error = params.error === "update";
  try {
    result = await callDealseApi<DealSeNotificationPage>("/notifications/me?page=1&limit=50", accessToken);
  } catch {
    error = true;
  }
  return <NotificationInbox surface="retailer" result={result} error={error} />;
}
