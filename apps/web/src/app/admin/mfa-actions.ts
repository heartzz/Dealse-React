"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { callDealseApi, type DealSeUser } from "../../lib/dealse-api";
import { requireWebSession } from "../../lib/auth-session";
import { createSupabaseServerClient } from "../../lib/supabase/server";
import {
  ADMIN_TOTP_FRIENDLY_NAME,
  ADMIN_TOTP_ISSUER,
  isDealSeTotpUri,
  removePendingAdminTotpFactors,
  safeMfaErrorCode,
  safeMfaErrorMessage,
  verifyAdminTotpAndReplacePrevious,
  verifiedAdminTotpFactors,
} from "./mfa-flow";

function mfaFailure(error: unknown, fallback: string) {
  const errorCode = safeMfaErrorCode(error);
  return { error: safeMfaErrorMessage(error, fallback), ...(errorCode ? { errorCode } : {}) };
}

async function adminSupabase() {
  const { accessToken } = await requireWebSession("/admin/login");
  const user = await callDealseApi<DealSeUser>("/auth/me", accessToken);
  if (!user.roles.includes("admin")) redirect("/admin?error=admin_required");
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user?.email) throw new Error("An authenticated email is required for authenticator setup.");
  return { supabase, email: data.user.email };
}

export async function startAdminMfa(mode: "verify" | "enroll" | "replace") {
  if (mode !== "verify" && mode !== "enroll" && mode !== "replace") {
    return { error: "Choose a valid authenticator action." };
  }
  const { supabase, email } = await adminSupabase();
  try {
    const { data: factors, error: factorsError } = await supabase.auth.mfa.listFactors();
    if (factorsError || !factors) {
      return mfaFailure(factorsError, "Your authenticator could not be loaded. Please retry.");
    }

    let factorId: string;
    let qrCode: string | undefined;
    let secret: string | undefined;

    const verifiedAdminFactors = verifiedAdminTotpFactors(factors.all);
    const isReplacement = mode === "replace";

    if (mode === "enroll" || isReplacement) {
      if (mode === "enroll" && verifiedAdminFactors.length) {
        return { error: "A verified DealSe authenticator is already active. Choose Replace authenticator to keep it active until the new one is verified." };
      }
      const restart = await removePendingAdminTotpFactors(factors.all, async (pendingFactorId) => {
        const { error } = await supabase.auth.mfa.unenroll({ factorId: pendingFactorId });
        return { error };
      });
      if (restart.error) return mfaFailure(restart.error, "The unfinished authenticator setup could not be restarted. Please retry.");

      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: isReplacement
          ? `${ADMIN_TOTP_FRIENDLY_NAME} replacement ${randomUUID()}`
          : ADMIN_TOTP_FRIENDLY_NAME,
        issuer: ADMIN_TOTP_ISSUER,
      });
      if (error) return mfaFailure(error, "Authenticator setup could not start. Please retry.");
      if (!data.totp?.qr_code || !data.totp.secret || !data.totp.uri || !isDealSeTotpUri(data.totp.uri, email, data.totp.secret)) {
        try {
          const { error: cleanupError } = await supabase.auth.mfa.unenroll({ factorId: data.id });
          return {
            error: cleanupError
              ? "Supabase returned an unexpected authenticator identity. The unfinished factor could not be cleared; retry setup before scanning any code."
              : "Supabase returned an unexpected authenticator identity. The unfinished factor was cleared; retry setup.",
          };
        } catch {
          return { error: "Supabase returned an unexpected authenticator identity. The unfinished factor could not be cleared; retry setup before scanning any code." };
        }
      }
      factorId = data.id;
      qrCode = data.totp.qr_code;
      secret = data.totp.secret;
    } else {
      const factor = verifiedAdminFactors[0];
      if (!factor) return { error: "No verified authenticator is available. Start setup instead." };
      factorId = factor.id;
    }

    const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId });
    if (challengeError) return mfaFailure(challengeError, "The verification challenge could not be created. Please retry.");
    return { factorId, challengeId: challenge.id, qrCode, secret, replacing: isReplacement };
  } catch {
    return { error: "The authenticator service is unavailable. Please retry." };
  }
}

export async function verifyAdminMfa(factorId: string, challengeId: string, code: string, replacing = false) {
  const { supabase } = await adminSupabase();
  if (typeof factorId !== "string" || factorId.length > 128 || typeof challengeId !== "string" || challengeId.length > 128) {
    return { error: "The authenticator challenge is invalid. Start again and retry." };
  }
  if (typeof code !== "string" || !/^\d{6}$/.test(code)) return { error: "Enter the six-digit code from your authenticator app." };
  if (typeof replacing !== "boolean") return { error: "The authenticator action is invalid. Start again and retry." };
  let verification: { verificationError: unknown | null; previousAuthenticatorRetained: boolean };
  try {
    verification = await verifyAdminTotpAndReplacePrevious(
      factorId,
      replacing,
      async () => {
        const { error } = await supabase.auth.mfa.verify({ factorId, challengeId, code });
        return { error };
      },
      async () => {
        const { data, error } = await supabase.auth.mfa.listFactors();
        return { factors: data?.all ?? null, error };
      },
      async (previousFactorId) => {
        const { error } = await supabase.auth.mfa.unenroll({ factorId: previousFactorId });
        return { error };
      },
    );
  } catch {
    return { error: "Verification is temporarily unavailable. Please retry." };
  }
  if (verification.verificationError) return mfaFailure(verification.verificationError, "That code could not be verified. Check your authenticator and try again.");
  revalidatePath("/admin");
  const success = replacing
    ? verification.previousAuthenticatorRetained ? "mfa_replaced_previous_retained" : "mfa_replaced"
    : "mfa_verified";
  redirect(`/admin?success=${success}`);
}
