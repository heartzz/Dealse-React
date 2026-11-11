import { notFound } from "next/navigation";
import MediaEditorHarness from "./test-harness.jsx";

export const dynamic = "force-dynamic";

export default function MediaEditorTestPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <MediaEditorHarness />;
}
