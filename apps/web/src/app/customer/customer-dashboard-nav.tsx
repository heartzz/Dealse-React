"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BookmarkSimple, Compass, House, Storefront, UserCircle } from "@phosphor-icons/react";

const items = [
  { id: "home", label: "Home", href: "/", Icon: House },
  { id: "explore", label: "Explore", href: "/#deals", Icon: Compass },
  { id: "saved", label: "Saved", href: "#saved-deals", Icon: BookmarkSimple },
  { id: "stores", label: "Stores", href: "/#store-discovery", Icon: Storefront },
  { id: "profile", label: "Profile", href: "#customer-profile", Icon: UserCircle },
];

export function CustomerDashboardNav() {
  const [active, setActive] = useState("saved");

  useEffect(() => {
    const syncFromHash = () => setActive(window.location.hash === "#customer-profile" ? "profile" : "saved");
    syncFromHash();
    window.addEventListener("hashchange", syncFromHash);
    return () => window.removeEventListener("hashchange", syncFromHash);
  }, []);

  return <nav className="customer-dashboard-nav" aria-label="Customer navigation">
    {items.map(({ id, label, href, Icon }) => <Link key={id} href={href} className={active === id ? "is-active" : ""} aria-current={active === id ? "page" : undefined} onClick={() => setActive(id)}>
      <Icon size={21} weight={active === id ? "fill" : "regular"} />
      <span>{label}</span>
    </Link>)}
  </nav>;
}
