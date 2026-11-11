import { AuthPanel, SubmitButton, TextField } from "../../../components/AuthPanel";
import Link from "next/link";
import { requireWebSession } from "../../../lib/auth-session";
import { saveCustomerProfile } from "../../actions";

export const dynamic = "force-dynamic";

export default async function CustomerSetupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  await requireWebSession("/customer/login");
  return (
    <AuthPanel
      audience="Customer"
      heading="Finish your profile"
      description="Your login is ready. Add your name to complete your DealSe customer profile."
      action={saveCustomerProfile}
      error={error}
      footer={<p><Link className="text-link" href="/customer/dashboard">Return to your account</Link></p>}
    >
      <TextField label="Your name" name="displayName" autoComplete="name" />
      <SubmitButton>Save profile</SubmitButton>
    </AuthPanel>
  );
}
