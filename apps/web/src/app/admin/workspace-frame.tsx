"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

const sections = [
  { label: "Overview", href: "/admin" },
  { label: "Retailers", href: "/admin/retailers" },
  { label: "Stores", href: "/admin/stores" },
  { label: "Offers", href: "/admin/offers" },
  { label: "Customers", href: "/admin/customers" },
  { label: "Redemptions", href: "/admin/redemptions" },
  { label: "Admin users", href: "/admin/admin-users" },
  { label: "Reports", href: "/admin/reports" },
  { label: "Offer reports", href: "/admin#reports" },
  { label: "Categories", href: "/admin#categories" },
  { label: "Audit log", href: "/admin#audit" },
];

export function AdminWorkspaceFrame({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  if (pathname === "/admin/login" || pathname === "/admin/accept-invitation") return children;

  return (
    <div className="admin-workspace-frame">
      <aside className="admin-sidebar" aria-label="Administrator workspace">
        <Link href="/admin" className="admin-sidebar-brand"><span className="brand-mark">DealSe</span><small>Admin</small></Link>
        <nav aria-label="Admin sections">
          {sections.map(({ label, href }) => <Link className={(href === "/admin" ? pathname === "/admin" : href === "/admin#reports" ? false : pathname === href || pathname.startsWith(`${href}/`)) ? "is-current" : undefined} key={label} href={href}>{label}</Link>)}
        </nav>
        <p>Access to each section is checked by the DealSe API.</p>
      </aside>
      <div className="admin-workspace-body">{children}</div>
    </div>
  );
}
