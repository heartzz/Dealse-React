import { redirect } from "next/navigation";
import { callDealseApi, DealseApiError, type DealSeUser } from "../../lib/dealse-api";
import { requireWebSession } from "../../lib/auth-session";
import { createSupabaseServerClient } from "../../lib/supabase/server";
import { AdminMfaGate } from "./mfa-gate";
import { pendingAdminTotpFactors, verifiedAdminTotpFactors } from "./mfa-flow";

export async function requireAdminRouteContext(requiredPermission?: string) {
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
  const mfaRequired = data.claims.aal !== "aal2";
  let permissionGranted = true;
  if (requiredPermission === "DASHBOARD_READ" && !mfaRequired) {
    try {
      const admin = await callDealseApi<{ role: string; status: string; permissions: string[] }>("/admin/me", accessToken);
      permissionGranted = admin.status === "ACTIVE" && (admin.role === "ROOT_ADMIN" || admin.permissions.includes(requiredPermission));
    } catch {
      permissionGranted = false;
    }
  }
  return { accessToken, user, mfaRequired, permissionGranted };
}

export async function AdminMfaRequired() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.mfa.listFactors();
  return <AdminMfaGate hasVerifiedDealSeTotp={Boolean(data && verifiedAdminTotpFactors(data.all).length)} hasPendingTotp={Boolean(data && pendingAdminTotpFactors(data.all).length)} initialError={error ? "Supabase could not list authenticator factors. Check the Auth configuration and retry." : undefined} />;
}

export function AdminRouteError({ message }: { message: string }) {
  return <section className="admin-route-state admin-route-state--error" role="alert"><h2>Could not load this admin section</h2><p>{message}</p><a className="admin-button admin-button--quiet" href="/admin">Return to overview</a></section>;
}

export function AdminApiRouteError({ error }: { error: unknown }) {
  if (error instanceof DealseApiError && error.status === 403) return <AdminPermissionDenied />;
  return <AdminRouteError message={error instanceof Error ? error.message : "The requested admin data could not be loaded."} />;
}

export function AdminPermissionDenied() {
  return <section className="admin-route-state" role="alert"><h2>Permission required</h2><p>Your active administrator account does not have access to this section.</p><a className="admin-button admin-button--quiet" href="/admin">Return to overview</a></section>;
}

export function AdminEmptyState({ message }: { message: string }) {
  return <p className="admin-empty">{message}</p>;
}
