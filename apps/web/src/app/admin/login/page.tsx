import Link from "next/link";
import { loginAdmin } from "../../actions";

const messages: Record<string, string> = {
  invalid: "Enter a valid email and password.",
  auth: "We could not authenticate that account. Check your details and try again.",
  unauthorized: "This account is not authorized for the DealSe admin workspace.",
  config: "Admin sign in is unavailable because authentication is not configured.",
  setup: "Sign in could not be completed. Check the authentication and API configuration.",
  invitation_accepted: "Invitation accepted. Sign in and complete authenticator verification to enter the admin workspace.",
  invalid_invitation: "This invitation is invalid, expired or revoked. Ask an administrator to send a new one.",
};

export default async function AdminLoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <main className="admin-login-shell">
      <header className="admin-login-header"><Link className="brand-mark" href="/">DealSe</Link><span>Administrator access</span></header>
      <section className="admin-access-card" aria-labelledby="admin-login-heading">
        <span className="admin-eyebrow">Restricted workspace</span>
        <h1 id="admin-login-heading">Sign in to DealSe Admin</h1>
        <p>Use your existing DealSe identity. Administrator access requires an active, approved admin account and verified two-step authentication.</p>
        {error && messages[error] ? <p className={`admin-notice admin-notice--${error === "invitation_accepted" ? "success" : "error"}`} role={error === "invitation_accepted" ? "status" : "alert"}>{messages[error]}</p> : null}
        <form action={loginAdmin} className="admin-login-form">
          <label>Email<input name="email" type="email" autoComplete="username" required /></label>
          <label>Password<input name="password" type="password" autoComplete="current-password" minLength={8} required /></label>
          <button className="admin-button" type="submit">Sign in securely</button>
        </form>
        <Link href="/" className="admin-login-back">Return to DealSe</Link>
      </section>
    </main>
  );
}
