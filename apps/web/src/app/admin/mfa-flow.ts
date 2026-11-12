export const ADMIN_TOTP_FRIENDLY_NAME = "DealSe administrator";

/** Supabase Auth's JS client returns totp.qr_code as raw SVG (the separate
 * totp.uri field is an otpauth provisioning URI). Convert only SVG markup to a
 * local data URI; never treat a provisioning URI or remote URL as an image. */
export function supabaseTotpQrSource(qrCode: string): string | undefined {
  const normalized = qrCode.trim();
  if (/^data:image\/svg\+xml(?:;[^,]*)?,/i.test(normalized)) return normalized;
  if (/^(?:<\?xml\b[\s\S]*?\?>\s*)?<svg\b/i.test(normalized)) {
    return `data:image/svg+xml;utf-8,${encodeURIComponent(normalized)}`;
  }
  return undefined;
}
export interface MfaFactorSummary {
  id: string;
  factor_type: string;
  status: string;
  friendly_name?: string | null;
}

export function pendingAdminTotpFactors(factors: readonly MfaFactorSummary[]): MfaFactorSummary[] {
  return factors.filter((factor) =>
    factor.factor_type === "totp" &&
    factor.status === "unverified" &&
    factor.friendly_name === ADMIN_TOTP_FRIENDLY_NAME,
  );
}

export async function removePendingAdminTotpFactors(
  factors: readonly MfaFactorSummary[],
  unenroll: (factorId: string) => Promise<{ error: unknown | null }>,
): Promise<{ removedCount: number; error: unknown | null }> {
  const pending = pendingAdminTotpFactors(factors);
  let removedCount = 0;
  for (const factor of pending) {
    const { error } = await unenroll(factor.id);
    if (error) return { removedCount, error };
    removedCount += 1;
  }
  return { removedCount, error: null };
}

const SAFE_MFA_ERROR_CODES = new Set([
  "insufficient_aal",
  "mfa_challenge_expired",
  "mfa_factor_name_conflict",
  "mfa_factor_not_found",
  "mfa_ip_address_mismatch",
  "mfa_totp_enroll_not_enabled",
  "mfa_totp_verify_not_enabled",
  "mfa_verification_failed",
  "mfa_verification_rejected",
  "over_request_rate_limit",
  "too_many_enrolled_mfa_factors",
]);

export function safeMfaErrorCode(error: unknown): string | undefined {
  const code = error && typeof error === "object" && "code" in error && typeof error.code === "string"
    ? error.code
    : undefined;
  return code && SAFE_MFA_ERROR_CODES.has(code) ? code : undefined;
}

export function safeMfaErrorMessage(error: unknown, fallback: string): string {
  const code = safeMfaErrorCode(error);

  switch (code) {
    case "mfa_factor_name_conflict":
      return "An unfinished DealSe authenticator setup was found. Restart setup to replace it.";
    case "mfa_totp_enroll_not_enabled":
      return "TOTP enrollment is disabled in this Supabase project. Enable authenticator enrollment in Supabase Auth settings.";
    case "mfa_totp_verify_not_enabled":
      return "TOTP verification is disabled in this Supabase project. Enable authenticator verification in Supabase Auth settings.";
    case "insufficient_aal":
      return "Your Supabase session has expired or changed. Sign in again, then retry authenticator setup.";
    case "over_request_rate_limit":
      return "Too many authenticator requests were made. Wait a few minutes, then retry.";
    case "mfa_challenge_expired":
      return "This authenticator challenge expired. Start a new challenge and try again.";
    case "mfa_verification_failed":
      return "That code was not accepted. Check the current code from your authenticator app and retry.";
    case "mfa_ip_address_mismatch":
      return "The network changed during authenticator setup. Restart setup from the same network.";
    case "too_many_enrolled_mfa_factors":
      return "This account has reached Supabase’s authenticator factor limit. Contact the project operator.";
    default:
      return fallback;
  }
}
