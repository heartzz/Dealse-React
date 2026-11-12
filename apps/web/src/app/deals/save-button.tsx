"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toggleFavourite } from "../marketplace-actions";

export function DealSaveButton({ dealId, initiallySaved, customerSignedIn }: { dealId: string; initiallySaved: boolean; customerSignedIn: boolean }) {
  const router = useRouter();
  const [saved, setSaved] = useState(initiallySaved);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function toggle() {
    if (!customerSignedIn) {
      router.push("/customer/login");
      return;
    }
    if (busy) return;
    setBusy(true);
    setMessage("");
    try {
      await toggleFavourite(dealId, saved);
      setSaved(!saved);
      setMessage(saved ? "Removed from your saved offers." : "Saved to your offers.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "This offer could not be saved. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return <div className="deal-save-wrap"><button className={`deal-save-button${saved ? " is-saved" : ""}`} type="button" onClick={toggle} disabled={busy} aria-pressed={saved}>{busy ? "Saving…" : saved ? "♥ Saved offer" : "♡ Save offer"}</button>{message ? <p className="deal-save-message" role="status">{message}</p> : null}</div>;
}
