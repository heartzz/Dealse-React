"use client";
import { useEffect, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { createSupabaseBrowserClient } from "../../../lib/supabase/browser";
import { acceptAdminInvitation } from "./actions";

export function AcceptInvitationClient() {
  const params = useSearchParams(); const invitationId = params.get("invitation");
  const [error, setError] = useState(""); const [hasSession, setHasSession] = useState(false); const [password, setPassword] = useState(""); const [confirmPassword, setConfirmPassword] = useState(""); const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        if (!invitationId) throw new Error("The invitation link is missing its invitation reference.");
        const supabase = createSupabaseBrowserClient();
        const { data, error: sessionError } = await supabase.auth.getSession();
        if (sessionError || !data.session) throw new Error("Open the invitation link from Supabase and finish verifying your email first.");
        if (active) setHasSession(true);
      } catch (cause) { if (active) setError(cause instanceof Error ? cause.message : "The invitation could not be accepted."); }
    })();
    return () => { active = false; };
  }, [invitationId]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError("");
    if (password.length < 8) { setError("Choose a password with at least 8 characters."); return; }
    if (password !== confirmPassword) { setError("The passwords do not match."); return; }
    setBusy(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const { error: passwordError } = await supabase.auth.updateUser({ password });
      if (passwordError) throw passwordError;
      const { data, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !data.session) throw new Error("Your verified Supabase session expired. Reopen the invitation link and try again.");
      setPassword(""); setConfirmPassword("");
      await acceptAdminInvitation(invitationId!, data.session.access_token);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The invitation could not be accepted."); setBusy(false); }
  }
  return <section className="admin-access-card"><span className="admin-eyebrow">Administrator access</span><h1>Accept invitation</h1>{error ? <p className="admin-notice admin-notice--error" role="alert">{error}</p> : null}{hasSession ? <><p>Choose the password you will use to sign in to DealSe Admin.</p><form className="admin-login-form" onSubmit={submit}><label>Password<input type="password" autoComplete="new-password" minLength={8} required value={password} onChange={(event) => setPassword(event.target.value)} /></label><label>Confirm password<input type="password" autoComplete="new-password" minLength={8} required value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} /></label><button className="admin-button" type="submit" disabled={busy || !invitationId}>{busy ? "Accepting invitation…" : "Set password and accept"}</button></form></> : !error ? <p>Checking the verified Supabase session…</p> : null}</section>;
}
