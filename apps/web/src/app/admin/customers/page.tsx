import { AdminApiRouteError, AdminMfaRequired, AdminPermissionDenied, requireAdminRouteContext } from "../route-context";
import { AdminListToolbar, AdminNotice, AdminPagination, AdminTable, StatusBadge } from "../moderation-ui";
import { loadAdminPage, type PageParams } from "../moderation-data";
import { formatAdminDate } from "../admin-format";
import { CopyableId } from "../copyable-id";

type Customer = { id: string; status: string; emailNormalized: string | null; createdAt: string; lastSignedInAt: string | null; profile: { displayName: string | null } | null; _count: { favourites: number; customerRedemptions: number } };

export default async function AdminCustomersPage({ searchParams }: { searchParams: Promise<PageParams> }) {
  const params = await searchParams;
  const context = await requireAdminRouteContext("CUSTOMERS_READ");
  if (context.mfaRequired) return <main className="admin-content"><AdminMfaRequired /></main>;
  if (!context.permissionGranted) return <main className="admin-content"><AdminPermissionDenied /></main>;
  let data;
  try { data = await loadAdminPage<Customer>(context.accessToken, "/admin/customers", params); }
  catch (error) { return <main className="admin-content"><AdminApiRouteError error={error} /></main>; }
  return <main className="admin-content">
    <header className="admin-page-heading"><div><span className="admin-eyebrow">Account oversight</span><h1>Customers</h1><p>View customer account status and existing marketplace activity. Account suspension is not available in this release.</p></div></header>
    <AdminNotice success={params.success} error={params.error} />
    <section className="admin-panel"><AdminListToolbar action="/admin/customers" query={params.q} status={params.status} statuses={["active", "suspended", "deleted"]} />
      {data.items.length ? <AdminTable headers={["Customer", "Status", "Joined", "Last active", "Saved offers", "Redemptions", ""]}>{data.items.map((customer) => <tr key={customer.id}>
        <td>{customer.profile?.displayName || "Unnamed customer"}<small>{customer.emailNormalized || "Email unavailable"}</small></td>
        <td><StatusBadge status={customer.status} /></td><td>{formatAdminDate(customer.createdAt)}</td><td>{formatAdminDate(customer.lastSignedInAt, true)}</td>
        <td>{customer._count.favourites}</td><td>{customer._count.customerRedemptions}</td><td><CopyableId value={customer.id} label="Copy customer ID" /></td>
      </tr>)}</AdminTable> : <p className="admin-empty">No customers match these filters.</p>}
      <AdminPagination pathname="/admin/customers" page={data.page} totalPages={data.totalPages} query={params.q} status={params.status} />
    </section>
  </main>;
}
