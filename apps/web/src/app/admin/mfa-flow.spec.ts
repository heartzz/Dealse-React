import assert from "node:assert/strict";
import test from "node:test";
import { pendingAdminTotpFactors, removePendingAdminTotpFactors, safeMfaErrorCode, safeMfaErrorMessage, supabaseTotpQrSource } from "./mfa-flow.js";

test("converts Supabase raw SVG QR payload to a local image data URI", () => {
  const source = supabaseTotpQrSource("\n<svg xmlns=\"http://www.w3.org/2000/svg\"></svg>\n");
  assert.equal(source, "data:image/svg+xml;utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3C%2Fsvg%3E");
});

test("trims data URI boundary whitespace and rejects provisioning or remote URLs", () => {
  const dataUri = "data:image/svg+xml;utf-8,%3Csvg%2F%3E";
  assert.equal(supabaseTotpQrSource(`${dataUri}\r\n`), dataUri);
  assert.equal(supabaseTotpQrSource("otpauth://totp/DealSe:admin?algorithm=SHA1"), undefined);
  assert.equal(supabaseTotpQrSource("https://example.invalid/qr.svg"), undefined);
});

test("finds only unverified DealSe TOTP enrollments for safe restart", () => {
  const factors = [
    { id: "pending-admin", factor_type: "totp", status: "unverified", friendly_name: "DealSe administrator" },
    { id: "verified-admin", factor_type: "totp", status: "verified", friendly_name: "DealSe administrator" },
    { id: "pending-personal", factor_type: "totp", status: "unverified", friendly_name: "Personal authenticator" },
    { id: "pending-phone", factor_type: "phone", status: "unverified", friendly_name: "DealSe administrator" },
  ];

  assert.deepEqual(pendingAdminTotpFactors(factors).map((factor) => factor.id), ["pending-admin"]);
});

test("does not report a pending factor when none exists", () => {
  assert.deepEqual(pendingAdminTotpFactors([]), []);
});

test("restart removes only pending DealSe TOTP factors and keeps verified or unrelated factors", async () => {
  const removed: string[] = [];
  const factors = [
    { id: "pending-admin", factor_type: "totp", status: "unverified", friendly_name: "DealSe administrator" },
    { id: "verified-admin", factor_type: "totp", status: "verified", friendly_name: "DealSe administrator" },
    { id: "pending-personal", factor_type: "totp", status: "unverified", friendly_name: "Personal authenticator" },
  ];

  const result = await removePendingAdminTotpFactors(factors, async (id) => {
    removed.push(id);
    return { error: null };
  });

  assert.deepEqual(result, { removedCount: 1, error: null });
  assert.deepEqual(removed, ["pending-admin"]);
});

test("restart stops without enrolling further when pending-factor removal fails", async () => {
  const failure = { code: "insufficient_aal" };
  const result = await removePendingAdminTotpFactors([
    { id: "pending-admin", factor_type: "totp", status: "unverified", friendly_name: "DealSe administrator" },
  ], async () => ({ error: failure }));

  assert.equal(result.removedCount, 0);
  assert.equal(result.error, failure);
});

test("maps known Supabase MFA codes without returning raw error details", () => {
  assert.match(safeMfaErrorMessage({ code: "mfa_factor_name_conflict", message: "contains sensitive details" }, "fallback"), /unfinished DealSe authenticator setup/);
  assert.match(safeMfaErrorMessage({ code: "mfa_totp_enroll_not_enabled", message: "ignored" }, "fallback"), /disabled in this Supabase project/);
  assert.equal(safeMfaErrorMessage({ message: "raw server response" }, "safe fallback"), "safe fallback");
  assert.equal(safeMfaErrorCode({ code: "mfa_factor_name_conflict", message: "not shown" }), "mfa_factor_name_conflict");
  assert.equal(safeMfaErrorCode({ code: "custom-secret-bearing-message", message: "not shown" }), undefined);
});
