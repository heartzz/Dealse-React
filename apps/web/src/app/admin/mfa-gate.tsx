"use client";

import { useState, type FormEvent } from "react";
import { startAdminMfa, verifyAdminMfa } from "./mfa-actions";
import { supabaseTotpQrSource } from "./mfa-flow";

/* eslint-disable @next/next/no-img-element -- Supabase returns an inline SVG data URI for TOTP QR codes. */

type Challenge = { factorId: string; challengeId: string; qrCode?: string; secret?: string };

export function AdminMfaGate({ hasVerifiedTotp, hasPendingTotp, initialError }: { hasVerifiedTotp: boolean; hasPendingTotp: boolean; initialError?: string }) {
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState(initialError || "");
  const [busy, setBusy] = useState(false);
  const qrSource = challenge?.qrCode ? supabaseTotpQrSource(challenge.qrCode) : undefined;

  async function begin() {
    setBusy(true);
    setError("");
    try {
      const result = await startAdminMfa(!hasVerifiedTotp);
      if ("error" in result && typeof result.error === "string") {
        setError(result.errorCode ? `${result.error} (Supabase Auth: ${result.errorCode})` : result.error);
      } else if ("factorId" in result && "challengeId" in result) {
        setChallenge({ factorId: result.factorId, challengeId: result.challengeId, qrCode: result.qrCode, secret: result.secret });
      } else {
        setError("Authenticator setup could not start. Please refresh and retry.");
      }
    } catch {
      setError("Authenticator setup could not start. Please refresh and retry.");
    } finally {
      setBusy(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!challenge) return;
    setBusy(true);
    setError("");
    try {
      const result = await verifyAdminMfa(challenge.factorId, challenge.challengeId, code.trim());
      if (result && "error" in result) setError(result.errorCode ? `${result.error} (Supabase Auth: ${result.errorCode})` : result.error);
    } catch {
      setError("The code could not be checked. Confirm the code and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="admin-access-card admin-mfa-card" aria-labelledby="admin-mfa-title">
      <span className="admin-eyebrow">Extra account protection</span>
      <h1 id="admin-mfa-title">Verify administrator access</h1>
      <p>DealSe administrator actions require a verified authenticator code. Your second-factor check is handled by Supabase Auth.</p>
      {!challenge ? <><button className="admin-button" type="button" onClick={begin} disabled={busy}>{busy ? "Preparing…" : hasVerifiedTotp ? "Verify with authenticator" : hasPendingTotp ? "Restart authenticator setup" : "Set up authenticator"}</button>{hasPendingTotp && !hasVerifiedTotp ? <p className="admin-mfa-help">An unfinished DealSe setup exists. Restarting replaces only its unverified authenticator factor.</p> : null}{initialError ? <p className="admin-notice admin-notice--error" role="alert">{initialError}</p> : null}</> : <form className="admin-mfa-form" onSubmit={submit}>
        {challenge.secret ? <div className="admin-mfa-enrollment">{qrSource ? <><img src={qrSource} alt="QR code to add DealSe to your authenticator app" width={192} height={192} /><p>Scan the code with your authenticator app. If you can’t scan it, enter this setup key manually:</p></> : <p role="status">QR code is unavailable. Enter the setup key manually:</p>}<code>{challenge.secret}</code></div> : null}
        <label>Authenticator code<input autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{6,8}" minLength={6} maxLength={8} required value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 8))} placeholder="6-digit code" /></label>
        {error ? <p className="admin-notice admin-notice--error" role="alert">{error}</p> : null}
        <div className="admin-mfa-actions"><button className="admin-button" type="submit" disabled={busy || code.length < 6}>{busy ? "Verifying…" : challenge.qrCode ? "Verify and finish setup" : "Verify and continue"}</button><button className="admin-button admin-button--quiet" type="button" disabled={busy} onClick={() => { setChallenge(null); setCode(""); setError(""); }}>Cancel</button></div>
      </form>}
      {error && !challenge && !initialError ? <p className="admin-notice admin-notice--error" role="alert">{error}</p> : null}
    </section>
  );
}
