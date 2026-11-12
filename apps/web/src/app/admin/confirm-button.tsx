"use client";
import type { ReactNode } from "react";

export function ConfirmButton({ children, question, danger = false }: { children: ReactNode; question: string; danger?: boolean }) {
  return <button className={`admin-button ${danger ? "admin-button--danger" : ""}`} type="submit" onClick={(event) => { if (!window.confirm(question)) event.preventDefault(); }}>{children}</button>;
}
