import { Suspense } from "react";
import { AcceptInvitationClient } from "./accept-client";

export default function AcceptInvitationPage() {
  return <main className="admin-login-shell"><header className="admin-login-header"><span className="brand-mark">DealSe</span><span>Administrator access</span></header><Suspense fallback={<section className="admin-access-card"><h1>Accept invitation</h1><p>Loading invitation…</p></section>}><AcceptInvitationClient /></Suspense></main>;
}
