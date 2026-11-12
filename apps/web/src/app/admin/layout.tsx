import type { ReactNode } from "react";
import { AdminWorkspaceFrame } from "./workspace-frame";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return <AdminWorkspaceFrame>{children}</AdminWorkspaceFrame>;
}
