import Link from "next/link";
import { AuthPanel, SubmitButton, TextField } from "../../../components/AuthPanel";
import { loginCustomer } from "../../actions";

export default async function CustomerLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <AuthPanel
      audience="Customer"
      heading="Welcome back"
      description="Sign in to see your saved offers and profile."
      action={loginCustomer}
      error={error}
      footer={<p>New to DealSe? <Link className="text-link" href="/customer/register">Create an account</Link></p>}
    >
      <TextField label="Email" name="email" type="email" autoComplete="email" />
      <TextField label="Password" name="password" type="password" autoComplete="current-password" minLength={8} />
      <SubmitButton>Sign in</SubmitButton>
    </AuthPanel>
  );
}
