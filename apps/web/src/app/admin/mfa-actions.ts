"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { callDealseApi, type DealSeUser } from "../../lib/dealse-api";
import { requireWebSession } from "../../lib/auth-session";
import { createSupabaseServerClient } from "../../lib/supabase/server";
import { ADMIN_TOTP_FRIENDLY_NAME, removePendingAdminTotpFactors, safeMfaErrorCode, safeMfaErrorMessage } from "./mfa-flow";

function mfaFailure(error: unknown, fallback: string) {
  const errorCode = safeMfaErrorCode(error);
  return { error: safeMfaErrorMessage(error, fallback), ...(errorCode ? { errorCode } : {}) };
}

async function adminSupabase() {
  const { accessToken } = await requireWebSession("/admin/login");
  const user = await callDealseApi<DealSeUser>("/auth/me", accessToken);
  if (!user.roles.includes("admin")) redirect("/admin?error=admin_required");
  return createSupabaseServerClient();
}

export async function startAdminMfa(enroll: boolean) {
  const supabase = await adminSupabase();
  try {
    const { data: factors, error: factorsError } = await supabase.auth.mfa.listFactors();
    if (factorsError || !factors) {
      return mfaFailure(factorsError, "Your authenticator could not be loaded. Please retry.");
    }

    let factorId: string;
    let qrCode: string | undefined;
    let secret: string | undefined;

    if (enroll && factors.totp.length === 0) {
      const restart = await removePendingAdminTotpFactors(factors.all, async (factorId) => {
        const { error } = await supabase.auth.mfa.unenroll({ factorId });
        return { error };
      });
      if (restart.error) return mfaFailure(restart.error, "The unfinished authenticator setup could not be restarted. Please retry.");

      const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: ADMIN_TOTP_FRIENDLY_NAME });
      if (error) return mfaFailure(error, "Authenticator setup could not start. Please retry.");
      factorId = data.id;
      qrCode = data.totp.qr_code;
      secret = data.totp.secret;
    } else {
      const factor = factors.totp[0];
      if (!factor) return { error: "No verified authenticator is available. Start setup instead." };
      factorId = factor.id;
    }

    const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId });
    if (challengeError) return mfaFailure(challengeError, "The verification challenge could not be created. Please retry.");
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
    if (error) return mfaFailure(error, "That code could not be verified. Check your authenticator and try again.");
  } catch {
    return { error: "Verification is temporarily unavailable. Please retry." };
  }
  revalidatePath("/admin");
  redirect("/admin");
}
