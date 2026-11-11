"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { callDealseApi, type DealSeUser } from "../../lib/dealse-api";
import { requireWebSession } from "../../lib/auth-session";
import { createSupabaseServerClient } from "../../lib/supabase/server";

async function adminSupabase() {
  const { accessToken } = await requireWebSession("/customer/login");
  const user = await callDealseApi<DealSeUser>("/auth/me", accessToken);
  if (!user.roles.includes("admin")) redirect("/admin?error=admin_required");
  return createSupabaseServerClient();
}

export async function startAdminMfa(enroll: boolean) {
  const supabase = await adminSupabase();
  try {
    let factorId: string;
    let qrCode: string | undefined;
    let secret: string | undefined;

    if (enroll) {
      const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: "DealSe administrator" });
      if (error) return { error: "Authenticator setup could not start. Please retry." };
      factorId = data.id;
      qrCode = data.totp.qr_code;
      secret = data.totp.secret;
    } else {
      const { data, error } = await supabase.auth.mfa.listFactors();
      if (error) return { error: "Your authenticator could not be loaded. Please retry." };
      const factor = data.totp[0];
      if (!factor) return { error: "No verified authenticator is available. Start setup instead." };
      factorId = factor.id;
    }

    const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId });
    if (challengeError) return { error: "The verification challenge could not be created. Please retry." };
    return { factorId, challengeId: challenge.id, qrCode, secret };
  } catch {
    return { error: "The authenticator service is unavailable. Please retry." };
  }
}

export async function verifyAdminMfa(factorId: string, challengeId: string, code: string) {
  const supabase = await adminSupabase();
  if (!/^\d{6,8}$/.test(code)) return { error: "Enter the current code from your authenticator app." };
  try {
    const { error } = await supabase.auth.mfa.verify({ factorId, challengeId, code });
    if (error) return { error: "That code could not be verified. Check your authenticator and try again." };
  } catch {
    return { error: "Verification is temporarily unavailable. Please retry." };
  }
  revalidatePath("/admin");
  redirect("/admin");
}
