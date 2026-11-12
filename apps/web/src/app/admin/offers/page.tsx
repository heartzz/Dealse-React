/* eslint-disable @typescript-eslint/no-explicit-any */
import Link from "next/link";
import { AdminMfaRequired, AdminRouteError, requireAdminRouteContext } from "../route-context";
import { AdminListToolbar, AdminNotice, AdminPagination, AdminTable, StatusBadge } from "../moderation-ui";
import { loadAdminPage, safeMessage, type PageParams } from "../moderation-data";

const statuses = ["draft", "pending", "published", "rejected", "paused", "suspended", "expired"];

export default async function AdminOffersPage({ searchParams }: { searchParams: Promise<PageParams> }) {
  const params = await searchParams; const context = await requireAdminRouteContext();
  if (context.mfaRequired) return <main className="admin-content"><AdminMfaRequired /></main>;
  let data;
  try { data = await loadAdminPage<any>(context.accessToken, "/admin/deals", params); } catch (error) { return <main className="admin-content"><AdminRouteError message={safeMessage(error)} /></main>; }
  return <main className="admin-content"><header className="admin-page-heading"><div><span className="admin-eyebrow">Marketplace quality</span><h1>Offer moderation</h1><p>Review real offers and preserve the existing publication eligibility checks.</p></div></header>
    <AdminNotice success={params.success} error={params.error} /><section className="admin-panel"><AdminListToolbar action="/admin/offers" query={params.q} status={params.status} statuses={statuses} />
      {data.items.length ? <AdminTable headers={["Offer", "Retailer and store", "Dates", "Images", "Status", ""]}>{data.items.map((item) => <tr key={item.id}><td><Link href={`/admin/offers/${item.id}`} className="admin-table-link">{item.title}</Link><small>{item.category?.name || "Uncategorized"}</small></td><td><Link href={`/admin/retailers/${item.store.retailer.id}`} className="admin-table-link">{item.store.retailer.displayName}</Link><small><Link href={`/admin/stores/${item.store.id}`} className="admin-table-link">{item.store.name}</Link> · {item.store.city}</small></td><td>{new Date(item.startsAt).toLocaleDateString()} – {new Date(item.endsAt).toLocaleDateString()}</td><td>{item.images?.length ?? 0}</td><td><StatusBadge status={item.moderationHoldAt ? "suspended" : item.status} /></td><td><Link className="admin-button admin-button--quiet" href={`/admin/offers/${item.id}`}>Review</Link></td></tr>)}</AdminTable> : <p className="admin-empty">No offers match these filters.</p>}
      <AdminPagination pathname="/admin/offers" page={data.page} totalPages={data.totalPages} query={params.q} status={params.status} />
    </section></main>;
}
