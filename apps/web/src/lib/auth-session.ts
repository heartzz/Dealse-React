import "server-only";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "./supabase/server";

export async function requireWebSession(loginPath: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims.sub) redirect(loginPath);
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) redirect(loginPath);
  return { accessToken: session.access_token };
}
