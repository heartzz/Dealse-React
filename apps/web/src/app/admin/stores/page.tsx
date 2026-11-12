/* eslint-disable @typescript-eslint/no-explicit-any */
import Link from "next/link";
import { AdminMfaRequired, AdminRouteError, requireAdminRouteContext } from "../route-context";
import { AdminListToolbar, AdminNotice, AdminPagination, AdminTable, StatusBadge } from "../moderation-ui";
import { loadAdminPage, safeMessage, type PageParams } from "../moderation-data";

export default async function AdminStoresPage({ searchParams }: { searchParams: Promise<PageParams> }) {
  const params = await searchParams; const context = await requireAdminRouteContext();
  if (context.mfaRequired) return <main className="admin-content"><AdminMfaRequired /></main>;
  let data;
  try { data = await loadAdminPage<any>(context.accessToken, "/admin/stores", params); } catch (error) { return <main className="admin-content"><AdminRouteError message={safeMessage(error)} /></main>; }
  return <main className="admin-content"><header className="admin-page-heading"><div><span className="admin-eyebrow">Store safety</span><h1>Stores</h1><p>Review verification, location, images and marketplace eligibility.</p></div></header>
    <AdminNotice success={params.success} error={params.error} /><section className="admin-panel"><AdminListToolbar action="/admin/stores" query={params.q} status={params.status} statuses={["draft", "pending_verification", "active", "paused", "rejected"]} />
      {data.items.length ? <AdminTable headers={["Store", "Retailer", "Location", "Category", "Status", ""]}>{data.items.map((item) => <tr key={item.id}><td><Link href={`/admin/stores/${item.id}`} className="admin-table-link">{item.name}</Link><small>{item.images?.length ?? 0} images</small></td><td><Link href={`/admin/retailers/${item.retailer.id}`} className="admin-table-link">{item.retailer.displayName}</Link><small>{item.retailer.status}</small></td><td>{[item.locality, item.city, item.region].filter(Boolean).join(", ")}<small>{item.hasCoordinates ? "Mapped location" : "Location missing"}</small></td><td>{item.category?.name || "—"}</td><td><StatusBadge status={item.status} /></td><td><Link className="admin-button admin-button--quiet" href={`/admin/stores/${item.id}`}>Review</Link></td></tr>)}</AdminTable> : <p className="admin-empty">No stores match these filters.</p>}
      <AdminPagination pathname="/admin/stores" page={data.page} totalPages={data.totalPages} query={params.q} status={params.status} />
    </section></main>;
}
