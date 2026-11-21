import { AdminApiRouteError, AdminMfaRequired, AdminPermissionDenied, requireAdminRouteContext } from "../route-context";
import { AdminTable, StatusBadge } from "../moderation-ui";
import { AdminNotice } from "../moderation-ui";
import type { PageParams } from "../moderation-data";
import { formatAdminDate } from "../admin-format";
import { CopyableId } from "../copyable-id";
import { callDealseApi } from "../../../lib/dealse-api";

type Page<T> = { items: T[]; page: number; limit: number; total: number; totalPages: number };
type Claim = { id: string; status: string; issuedAt: string; expiresAt: string; redeemedAt: string | null; deal: { id: string; title: string; store: { id: string; name: string; retailerId: string } }; customer: { id: string; profile: { displayName: string | null } | null } };
type Redemption = { id: string; redeemedAt: string; customerRedemptionNumber: number; deal: { id: string; title: string }; store: { id: string; name: string }; customer: { id: string; profile: { displayName: string | null } | null }; redeemedBy: { id: string; profile: { displayName: string | null } | null } };

function pageNumber(value?: string) { const parsed = Number(value ?? 1); return Number.isInteger(parsed) && parsed > 0 ? parsed : 1; }

function dateFilterBoundary(value: string | undefined, endOfDay: boolean): string | undefined {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const boundary = new Date(`${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}+05:30`);
  return Number.isNaN(boundary.valueOf()) ? value : boundary.toISOString();
}

export default async function AdminRedemptionsPage({ searchParams }: { searchParams: Promise<PageParams & { view?: string; dealId?: string; storeId?: string; customerUserId?: string; from?: string; to?: string }> }) {
  const params = await searchParams; const view = params.view === "claims" ? "claims" : "redemptions";
  const context = await requireAdminRouteContext("REDEMPTIONS_READ");
  if (context.mfaRequired) return <main className="admin-content"><AdminMfaRequired /></main>;
  if (!context.permissionGranted) return <main className="admin-content"><AdminPermissionDenied /></main>;
  const page = pageNumber(params.page);
  const filters = { ...(params.status && params.status !== "all" && view === "claims" ? { status: params.status } : {}), ...(params.dealId ? { dealId: params.dealId } : {}), ...(params.customerUserId ? { customerUserId: params.customerUserId } : {}), ...(params.from ? { from: dateFilterBoundary(params.from, false) } : {}), ...(params.to ? { to: dateFilterBoundary(params.to, true) } : {}), ...(params.storeId && view === "redemptions" ? { storeId: params.storeId } : {}) };
  const query = new URLSearchParams({ page: String(page), limit: "20", ...filters });
  let data: Page<Claim | Redemption>;
  try { data = await callDealseApi<Page<Claim | Redemption>>(`/admin/${view === "claims" ? "redemption-claims" : "redemptions"}?${query}`, context.accessToken); }
  catch (error) { return <main className="admin-content"><AdminApiRouteError error={error} /></main>; }
  const href = (nextPage: number) => `/admin/redemptions?${new URLSearchParams({ view, page: String(nextPage), ...filters })}`;
  return <main className="admin-content">
    <header className="admin-page-heading"><div><span className="admin-eyebrow">Redemption oversight</span><h1>Redemptions</h1><p>Inspect confirmed redemptions and customer claims. QR credentials and token hashes are never displayed.</p></div></header>
    <AdminNotice success={params.success} error={params.error} />
    <nav className="admin-section-tabs" aria-label="Redemption records"><a className={view === "redemptions" ? "is-current" : undefined} href="/admin/redemptions?view=redemptions">Confirmed redemptions</a><a className={view === "claims" ? "is-current" : undefined} href="/admin/redemptions?view=claims">Claims</a></nav>
    <section className="admin-panel"><form className="admin-list-toolbar" action="/admin/redemptions"><input type="hidden" name="view" value={view} />{view === "claims" ? <label>Claim status<select name="status" defaultValue={params.status ?? "all"}><option value="all">All statuses</option>{["issued", "redeemed", "expired", "revoked"].map((status) => <option value={status} key={status}>{status.replaceAll("_", " ")}</option>)}</select></label> : null}<label>Offer ID<input name="dealId" defaultValue={params.dealId} placeholder="Optional UUID filter" /></label>{view === "redemptions" ? <label>Store ID<input name="storeId" defaultValue={params.storeId} placeholder="Optional UUID filter" /></label> : null}<label>Customer ID<input name="customerUserId" defaultValue={params.customerUserId} placeholder="Optional UUID filter" /></label><label>From<input type="date" name="from" defaultValue={params.from} /></label><label>To<input type="date" name="to" defaultValue={params.to} /></label><button className="admin-button" type="submit">Apply filters</button></form>
      {data.items.length ? view === "claims" ? <AdminTable headers={["Customer", "Offer", "Store", "Claim status", "Issued", "Expires", ""]}>{(data.items as Claim[]).map((item) => <tr key={item.id}><td>{item.customer.profile?.displayName || "Unnamed customer"}<small>Customer record</small></td><td>{item.deal.title}</td><td>{item.deal.store.name}</td><td><StatusBadge status={item.status} /></td><td>{formatAdminDate(item.issuedAt, true)}</td><td>{formatAdminDate(item.expiresAt, true)}</td><td><CopyableId value={item.id} label="Copy claim ID" /></td></tr>)}</AdminTable>
      : <AdminTable headers={["Customer", "Offer", "Store", "Redeemed by", "Redeemed at", "Customer use", ""]}>{(data.items as Redemption[]).map((item) => <tr key={item.id}><td>{item.customer.profile?.displayName || "Unnamed customer"}</td><td>{item.deal.title}</td><td>{item.store.name}</td><td>{item.redeemedBy.profile?.displayName || "Retailer staff"}</td><td>{formatAdminDate(item.redeemedAt, true)}</td><td>{item.customerRedemptionNumber}</td><td><CopyableId value={item.id} label="Copy redemption ID" /></td></tr>)}</AdminTable> : <p className="admin-empty">No {view === "claims" ? "claims" : "confirmed redemptions"} match these filters.</p>}
      <nav className="admin-pagination" aria-label="Pagination"><span>Page {data.page} of {data.totalPages} · {data.total} records</span><div>{data.page > 1 ? <a className="admin-button admin-button--quiet" href={href(data.page - 1)}>Previous</a> : null}{data.page < data.totalPages ? <a className="admin-button admin-button--quiet" href={href(data.page + 1)}>Next</a> : null}</div></nav>
    </section>
  </main>;
}
