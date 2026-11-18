import { redirect } from "next/navigation";
import { callDealseApi, type DealSeUser } from "../../lib/dealse-api";
import { requireWebSession } from "../../lib/auth-session";
import { createSupabaseServerClient } from "../../lib/supabase/server";
import { AdminMfaGate } from "./mfa-gate";
import { pendingAdminTotpFactors, verifiedAdminTotpFactors } from "./mfa-flow";

export async function requireAdminRouteContext() {
  const { accessToken } = await requireWebSession("/admin/login");
  let user: DealSeUser;
  try {
    user = await callDealseApi<DealSeUser>("/auth/me", accessToken);
  } catch {
    redirect("/admin/login?error=setup");
  }
  if (!user.roles.includes("admin")) redirect("/admin/login?error=unauthorized");
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims.sub) redirect("/admin/login");
  return { accessToken, user, mfaRequired: data.claims.aal !== "aal2" };
}

export async function AdminMfaRequired() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.mfa.listFactors();
  return <AdminMfaGate hasVerifiedDealSeTotp={Boolean(data && verifiedAdminTotpFactors(data.all).length)} hasPendingTotp={Boolean(data && pendingAdminTotpFactors(data.all).length)} initialError={error ? "Supabase could not list authenticator factors. Check the Auth configuration and retry." : undefined} />;
}

export function AdminRouteError({ message }: { message: string }) {
  return <section className="admin-route-state admin-route-state--error" role="alert"><h2>Could not load this admin section</h2><p>{message}</p><a className="admin-button admin-button--quiet" href="/admin">Return to overview</a></section>;
}

export function AdminEmptyState({ message }: { message: string }) {
  return <p className="admin-empty">{message}</p>;
}
