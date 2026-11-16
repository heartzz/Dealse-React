import "server-only";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "./supabase/server";

export async function requireWebSession(loginPath: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims.sub) {
    if (loginPath === "/admin/login") {
      console.warn("[DealSe Admin Auth] session claims unavailable", {
        stage: "session_claims",
        claimsPresent: false,
        code: error && typeof error.code === "string" && /^[a-z0-9_]+$/i.test(error.code) ? error.code : null,
      });
    }
    redirect(loginPath);
  }
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    if (loginPath === "/admin/login") {
      console.warn("[DealSe Admin Auth] server session unavailable", {
        stage: "session_cookie_read",
        sessionReturned: false,
      });
    }
    redirect(loginPath);
  }
  return { accessToken: session.access_token };
}
