import { notFound } from "next/navigation";
import MediaPickerHarness from "./test-harness.jsx";

export const dynamic = "force-dynamic";

export default function MediaPickerTestPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <MediaPickerHarness />;
}
