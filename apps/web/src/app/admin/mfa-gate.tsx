"use client";

import { useState, type FormEvent } from "react";
import Image from "next/image";
import { startAdminMfa, verifyAdminMfa } from "./mfa-actions";

type Challenge = { factorId: string; challengeId: string; qrCode?: string; secret?: string };

export function AdminMfaGate({ hasVerifiedTotp, initialError }: { hasVerifiedTotp: boolean; initialError?: string }) {
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState(initialError || "");
  const [busy, setBusy] = useState(false);

  async function begin() {
    setBusy(true);
    setError("");
    try {
      const result = await startAdminMfa(!hasVerifiedTotp);
      if ("error" in result && typeof result.error === "string") {
        setError(result.error);
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
      if (result && "error" in result) setError(result.error);
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
      {!challenge ? <><button className="admin-button" type="button" onClick={begin} disabled={busy}>{busy ? "Preparing…" : hasVerifiedTotp ? "Verify with authenticator" : "Set up authenticator"}</button>{initialError ? <p className="admin-notice admin-notice--error" role="alert">{initialError}</p> : null}</> : <form className="admin-mfa-form" onSubmit={submit}>
        {challenge.qrCode ? <div className="admin-mfa-enrollment"><Image src={`data:image/svg+xml;utf-8,${encodeURIComponent(challenge.qrCode)}`} alt="QR code to add DealSe to your authenticator app" width={192} height={192} unoptimized /><p>Scan the code with your authenticator app. If you can’t scan it, enter this setup key manually:</p><code>{challenge.secret}</code></div> : null}
        <label>Authenticator code<input autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{6,8}" minLength={6} maxLength={8} required value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 8))} placeholder="6-digit code" /></label>
        {error ? <p className="admin-notice admin-notice--error" role="alert">{error}</p> : null}
        <div className="admin-mfa-actions"><button className="admin-button" type="submit" disabled={busy || code.length < 6}>{busy ? "Verifying…" : challenge.qrCode ? "Verify and finish setup" : "Verify and continue"}</button><button className="admin-button admin-button--quiet" type="button" disabled={busy} onClick={() => { setChallenge(null); setCode(""); setError(""); }}>Cancel</button></div>
      </form>}
      {error && !challenge && !initialError ? <p className="admin-notice admin-notice--error" role="alert">{error}</p> : null}
    </section>
  );
}
