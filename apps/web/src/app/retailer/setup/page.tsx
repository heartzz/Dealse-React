import { redirect } from "next/navigation";
import Link from "next/link";
import { callDealseApi, type DealSeUser } from "../../../lib/dealse-api";
import { requireWebSession } from "../../../lib/auth-session";
import { AuthPanel, SubmitButton, TextField } from "../../../components/AuthPanel";
import { createRetailerProfile } from "../../actions";

export const dynamic = "force-dynamic";

export default async function RetailerSetupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const { accessToken } = await requireWebSession("/retailer/login");
  let user: DealSeUser;
  try {
    user = await callDealseApi<DealSeUser>("/auth/me", accessToken);
  } catch {
    redirect("/retailer/login?error=setup");
  }
  if (user.roles.includes("retailer")) redirect("/retailer/dashboard");

  return (
    <AuthPanel
      audience="Retailer"
      heading="Create your retailer profile"
      description="Your account is signed in. Add the business profile that will own your DealSe stores."
      action={createRetailerProfile}
      error={error}
      footer={<p><Link className="text-link" href="/retailer/dashboard">Return to retailer dashboard</Link></p>}
    >
      <TextField label="Your name" name="displayName" autoComplete="name" />
      <TextField label="Business name" name="businessName" autoComplete="organization" />
      <TextField label="Legal name (optional)" name="legalName" autoComplete="organization" required={false} />
      <SubmitButton>Create retailer profile</SubmitButton>
    </AuthPanel>
  );
}
