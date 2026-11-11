import Link from "next/link";
import { AuthPanel, SubmitButton, TextField } from "../../../components/AuthPanel";
import { registerCustomer } from "../../actions";

export default async function CustomerRegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <AuthPanel
      audience="Customer"
      heading="Create your account"
      description="Save local offers and keep your favourites together."
      action={registerCustomer}
      error={error}
      footer={<p>Already have an account? <Link className="text-link" href="/customer/login">Sign in</Link></p>}
    >
      <TextField label="Your name" name="displayName" autoComplete="name" />
      <TextField label="Email" name="email" type="email" autoComplete="email" />
      <TextField label="Password" name="password" type="password" autoComplete="new-password" minLength={8} />
      <SubmitButton>Create customer account</SubmitButton>
    </AuthPanel>
  );
}
