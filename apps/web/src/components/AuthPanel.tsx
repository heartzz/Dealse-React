import type { FormHTMLAttributes, ReactNode } from "react";
import Link from "next/link";
export { SubmitButton } from "./SubmitButton";

type Props = {
  audience: "Customer" | "Retailer";
  heading: string;
  description: string;
  action: FormHTMLAttributes<HTMLFormElement>["action"];
  error?: string;
  children: ReactNode;
  footer: ReactNode;
};

const errorMessages: Record<string, string> = {
  config: "Authentication configuration is missing. Add the Supabase project URL and publishable key to apps/web/.env.local, then restart the web app.",
  invalid: "Enter a valid email, a password with at least 8 characters, and the required profile details.",
  auth: "We could not authenticate that account. Check your details and try again.",
  confirm: "Your account was created. Check your email to confirm it, then log in.",
  setup: "Authentication succeeded, but DealSe could not finish creating your profile. Check that the API is running and try again.",
  retailer_setup: "This account does not have a retailer profile yet. Finish retailer setup to continue.",
  customer_profile: "This account does not have a customer profile yet. Register as a customer to continue.",
};

export function AuthPanel({ audience, heading, description, action, error, children, footer }: Props) {
  return (
    <main className="auth-shell">
      <header className="auth-brand">
        <Link className="brand-mark" href="/">DealSe</Link>
        <span>{audience} account</span>
      </header>
      <section className="auth-card" aria-labelledby="auth-heading">
        <p className="eyebrow">{audience} access</p>
        <h1 id="auth-heading">{heading}</h1>
        <p className="auth-description">{description}</p>
        {error && errorMessages[error] && (
          <p className={`form-message ${error === "confirm" ? "form-message--info" : "form-message--error"}`} role="status">
            {errorMessages[error]}
          </p>
        )}
        <form className="auth-form" action={action}>
          {children}
        </form>
        <div className="auth-footer">{footer}</div>
      </section>
    </main>
  );
}

export function TextField({
  label,
  name,
  type = "text",
  autoComplete,
  required = true,
  minLength,
}: {
  label: string;
  name: string;
  type?: string;
  autoComplete?: string;
  required?: boolean;
  minLength?: number;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input name={name} type={type} autoComplete={autoComplete} required={required} minLength={minLength} />
    </label>
  );
}
