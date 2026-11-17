import "server-only";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "./supabase/server";

export async function requireWebSession(loginPath: string) {
  const flow = loginPath.startsWith("/admin/") ? "admin" : loginPath.startsWith("/retailer/") ? "retailer" : "customer";
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims.sub) {
    const code = error && typeof error.code === "string" && /^[a-z0-9_-]{1,80}$/i.test(error.code) ? error.code : null;
    const status = error && typeof error.status === "number" && Number.isInteger(error.status) ? error.status : null;
    console.warn("[DealSe Auth] server session claims unavailable", {
      flow,
      stage: "session_claims",
      httpStatus: status,
      providerErrorCode: code,
      claimsPresent: false,
    });
    redirect(loginPath);
  }
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    console.warn("[DealSe Auth] server session cookie was not readable", {
      flow,
      stage: "session_cookie_read",
      sessionReturned: false,
    });
    redirect(loginPath);
  }
  console.info("[DealSe Auth] server session cookie read", {
    flow,
    stage: "session_cookie_read",
    sessionReturned: true,
    claimsPresent: true,
    assuranceLevel: data.claims.aal === "aal1" || data.claims.aal === "aal2" ? data.claims.aal : "unknown",
  });
  return { accessToken: session.access_token };
}
