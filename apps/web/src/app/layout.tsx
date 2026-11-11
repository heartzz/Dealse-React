import type { Metadata } from "next";
import "./globals.css";
import "./marketplace.css";
import "./marketplace-catalogue.css";
import "../../../../prototype/src/customer-detail.css";
import "../../../../prototype/src/retailer-workspace.css";
import "./customer-mobile.css";
import "./retailer-mobile.css";
import "./admin.css";
import "./public-store.css";
import "./public-deal.css";
import "./notification-inbox.css";

export const metadata: Metadata = {
  title: "DealSe",
  description: "Discover good local offers, stores, and finds around Ahmedabad.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
