"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toggleFollowedStore } from "../marketplace-actions";

export function FollowStoreButton({
  storeId,
  initiallyFollowing,
  customerSignedIn,
}: {
  storeId: string;
  initiallyFollowing: boolean;
  customerSignedIn: boolean;
}) {
  const router = useRouter();
  const [following, setFollowing] = useState(initiallyFollowing);
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
      await toggleFollowedStore(storeId, following);
      setFollowing(!following);
      setMessage(following ? "You no longer follow this store." : "You’ll hear about new offers from this store.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "This store could not be updated. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return <div className="store-follow-wrap">
    <button className={`store-follow-button${following ? " is-following" : ""}`} type="button" onClick={toggle} disabled={busy} aria-pressed={following}>
      {busy ? "Updating…" : following ? "Following store" : "Follow store"}
    </button>
    {message ? <p role="status">{message}</p> : null}
  </div>;
}
