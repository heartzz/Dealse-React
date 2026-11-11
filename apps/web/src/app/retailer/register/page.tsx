import Link from "next/link";
import { AuthPanel, SubmitButton, TextField } from "../../../components/AuthPanel";
import { registerRetailer } from "../../actions";

export default async function RetailerRegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <AuthPanel
      audience="Retailer"
      heading="Set up your retailer account"
      description="Create your login and add the business profile that will own your stores and offers."
      action={registerRetailer}
      error={error}
      footer={<p>Already registered? <Link className="text-link" href="/retailer/login">Sign in</Link></p>}
    >
      <TextField label="Your name" name="displayName" autoComplete="name" />
      <TextField label="Business name" name="businessName" autoComplete="organization" />
      <TextField label="Legal name (optional)" name="legalName" autoComplete="organization" required={false} />
      <TextField label="Email" name="email" type="email" autoComplete="email" />
      <TextField label="Password" name="password" type="password" autoComplete="new-password" minLength={8} />
      <SubmitButton>Create retailer account</SubmitButton>
    </AuthPanel>
  );
}
