import { notFound } from "next/navigation";
import RetailerOfferWorkflowHarness from "./test-harness.jsx";

export const dynamic = "force-dynamic";

export default function RetailerOfferWorkflowTestPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <RetailerOfferWorkflowHarness />;
}
