"use client";

import { useState } from "react";

export function CopyableId({ value, label = "Copy record ID" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }
  return <button type="button" className="admin-button admin-button--quiet" onClick={copy} aria-label={label}>{copied ? "ID copied" : "Copy ID"}</button>;
}
