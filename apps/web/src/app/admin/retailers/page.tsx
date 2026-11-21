/* eslint-disable @typescript-eslint/no-explicit-any */
import Link from "next/link";
import { AdminApiRouteError, AdminMfaRequired, AdminPermissionDenied, requireAdminRouteContext } from "../route-context";
import { AdminListToolbar, AdminNotice, AdminPagination, AdminTable, StatusBadge } from "../moderation-ui";
import { loadAdminPage, type PageParams } from "../moderation-data";

export default async function AdminRetailersPage({ searchParams }: { searchParams: Promise<PageParams> }) {
  const params = await searchParams; const context = await requireAdminRouteContext("RETAILERS_READ");
  if (context.mfaRequired) return <main className="admin-content"><AdminMfaRequired /></main>;
  if (!context.permissionGranted) return <main className="admin-content"><AdminPermissionDenied /></main>;
  let data;
  try { data = await loadAdminPage<any>(context.accessToken, "/admin/retailers", params); } catch (error) { return <main className="admin-content"><AdminApiRouteError error={error} /></main>; }
  return <main className="admin-content"><header className="admin-page-heading"><div><span className="admin-eyebrow">Account oversight</span><h1>Retailers</h1><p>Review applications, ownership and retailer account status.</p></div></header>
    <AdminNotice success={params.success} error={params.error} /><section className="admin-panel"><AdminListToolbar action="/admin/retailers" query={params.q} status={params.status} statuses={["pending", "active", "suspended", "rejected"]} />
      {data.items.length ? <AdminTable headers={["Retailer", "Owner", "Stores", "Members", "Status", ""]}>{data.items.map((item) => { const owner = item.memberships?.[0]?.user ?? item.createdBy; return <tr key={item.id}><td><Link href={`/admin/retailers/${item.id}`} className="admin-table-link">{item.displayName}</Link><small>{item.legalName || "Legal name not provided"}</small></td><td>{owner?.profile?.displayName || "—"}<small>{owner?.emailNormalized || "—"}</small></td><td>{item._count?.stores ?? 0}</td><td>{item._count?.memberships ?? 0}</td><td><StatusBadge status={item.status} /></td><td><Link className="admin-button admin-button--quiet" href={`/admin/retailers/${item.id}`}>Review</Link></td></tr>; })}</AdminTable> : <p className="admin-empty">No retailers match these filters.</p>}
      <AdminPagination pathname="/admin/retailers" page={data.page} totalPages={data.totalPages} query={params.q} status={params.status} />
    </section></main>;
}
