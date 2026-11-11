import Link from "next/link";
import { AuthPanel, SubmitButton, TextField } from "../../../components/AuthPanel";
import { loginRetailer } from "../../actions";

export default async function RetailerLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <AuthPanel
      audience="Retailer"
      heading="Retailer sign in"
      description="Manage your store profile and DealSe account."
      action={loginRetailer}
      error={error}
      footer={<p>New retailer? <Link className="text-link" href="/retailer/register">Create an account</Link></p>}
    >
      <TextField label="Email" name="email" type="email" autoComplete="email" />
      <TextField label="Password" name="password" type="password" autoComplete="current-password" minLength={8} />
      <SubmitButton>Sign in</SubmitButton>
    </AuthPanel>
  );
}
