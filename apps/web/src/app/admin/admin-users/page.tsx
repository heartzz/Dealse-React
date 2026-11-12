import Link from "next/link";
import { AdminMfaRequired, AdminRouteError, requireAdminRouteContext } from "../route-context";
import { AdminNotice, AdminPagination, AdminTable, StatusBadge } from "../moderation-ui";
import { loadAdminPage, safeMessage, type PageParams } from "../moderation-data";
import { inviteAdmin, resendAdminInvitation, revokeAdminInvitation } from "../actions";
import { callDealseApi } from "../../../lib/dealse-api";
import { ConfirmButton } from "../confirm-button";
import { permissionSummary } from "../permission-summary.mjs";

export const dynamic = "force-dynamic";
const permissions = ["DASHBOARD_READ", "RETAILERS_READ", "RETAILERS_REVIEW", "RETAILERS_SUSPEND", "STORES_READ", "STORES_VERIFY", "STORES_SUSPEND", "OFFERS_READ", "OFFERS_REVIEW", "OFFERS_PAUSE", "OFFERS_REMOVE", "CUSTOMERS_READ", "CUSTOMERS_SUSPEND", "REDEMPTIONS_READ", "CATEGORIES_READ", "CATEGORIES_MANAGE", "ANALYTICS_READ", "AUDIT_READ", "ADMINS_MANAGE", "SETTINGS_MANAGE"];
type AdminRecord = { id: string; name: string | null; email: string | null; role: string; status: string; permissions: string[]; invitationStatus: string; lastLoginAt: string | null; createdAt: string };
type Invitation = { id: string; emailNormalized: string; role: string; permissionKeys: string[]; expiresAt: string; createdAt: string; invitedBy: { emailNormalized: string | null } };
const date = (value: string | null) => value ? new Date(value).toLocaleString() : "—";

export default async function AdminUsersPage({ searchParams }: { searchParams: Promise<PageParams> }) {
  const params = await searchParams; const context = await requireAdminRouteContext();
  if (context.mfaRequired) return <main className="admin-content"><AdminMfaRequired /></main>;
  let data: Awaited<ReturnType<typeof loadAdminPage<AdminRecord>>> & { actorRole?: string };
  let invitations: Invitation[];
  try {
    data = await loadAdminPage<AdminRecord>(context.accessToken, "/admin/admin-users", params) as typeof data;
    invitations = await callDealseApi<Invitation[]>("/admin/admin-users/invitations", context.accessToken);
  } catch (error) { return <main className="admin-content"><AdminRouteError message={safeMessage(error)} /></main>; }
  return <main className="admin-content"><header className="admin-page-heading"><div><span className="admin-eyebrow">Access governance</span><h1>Admin users</h1><p>Manage administrator roles, permissions and invitations.</p></div></header>
    <AdminNotice success={params.success} error={params.error} />
    <section className="admin-panel"><div className="admin-section-heading"><div><h2>Invite an administrator</h2><p>Supabase sends a secure, expiring invitation email. Password setup stays with Supabase.</p></div></div>
      <form action={inviteAdmin} className="admin-category-create"><label>Email<input name="email" type="email" required maxLength={320} /></label><label>Role<select name="role" defaultValue="ADMIN"><option value="ADMIN">Admin</option>{data.actorRole === "ROOT_ADMIN" ? <option value="SUPER_ADMIN">Super Admin</option> : null}</select></label><label>Reason<input name="reason" required minLength={5} maxLength={500} /></label><fieldset className="admin-permission-choices"><legend>Initial permissions</legend>{permissions.map((permission) => <label key={permission}><input type="checkbox" name="permissions" value={permission} />{permission.toLowerCase().replaceAll("_", " ")}</label>)}</fieldset><button className="admin-button" type="submit">Send invitation</button></form>
    </section>
    <section className="admin-panel"><div className="admin-section-heading"><div><h2>Pending invitations</h2><p>Invitation records expire after one hour. Resending replaces the existing link.</p></div><span className="admin-count">{invitations.length}</span></div>
      {invitations.length ? <AdminTable headers={["Email", "Role", "Permissions", "Invited by", "Expires", "Actions"]}>{invitations.map((invite) => <tr key={invite.id}><td>{invite.emailNormalized}</td><td><StatusBadge status={invite.role} /></td><td>{invite.permissionKeys.length ? invite.permissionKeys.map((value) => value.toLowerCase().replaceAll("_", " ")).join(", ") : "None"}</td><td>{invite.invitedBy.emailNormalized ?? "—"}</td><td>{date(invite.expiresAt)}</td><td>{invite.role === "SUPER_ADMIN" && data.actorRole !== "ROOT_ADMIN" ? "Restricted to Root Admin" : <><form action={resendAdminInvitation}><input type="hidden" name="invitationId" value={invite.id} /><input aria-label="Reason for resending" name="reason" required minLength={5} placeholder="Reason" /><button className="admin-button admin-button--quiet" type="submit">Resend</button></form><form action={revokeAdminInvitation}><input type="hidden" name="invitationId" value={invite.id} /><input aria-label="Reason for revoking" name="reason" required minLength={5} placeholder="Reason" /><ConfirmButton danger question="Revoke this pending administrator invitation?">Revoke</ConfirmButton></form></>}</td></tr>)}</AdminTable> : <p className="admin-empty">There are no pending invitations.</p>}
    </section>
    <section className="admin-panel"><form className="admin-list-toolbar" action="/admin/admin-users"><label>Search<input name="q" type="search" defaultValue={params.q} placeholder="Name or email" /></label><label>Role<select name="role" defaultValue={params.role ?? "all"}><option value="all">All roles</option><option value="ROOT_ADMIN">Root Admin</option><option value="SUPER_ADMIN">Super Admin</option><option value="ADMIN">Admin</option></select></label><label>Status<select name="status" defaultValue={params.status ?? "all"}><option value="all">All statuses</option><option value="ACTIVE">Active</option><option value="PENDING">Pending</option><option value="SUSPENDED">Suspended</option><option value="REVOKED">Revoked</option></select></label><button className="admin-button" type="submit">Apply filters</button></form>
      {data.items.length ? <AdminTable headers={["Administrator", "Role", "Status", "Permissions", "Invitation", "Last login", "Created", ""]}>{data.items.map((item) => <tr key={item.id}><td>{data.actorRole === "SUPER_ADMIN" && item.role !== "ADMIN" ? item.name || "Name not set" : <Link className="admin-table-link" href={`/admin/admin-users/${item.id}`}>{item.name || "Name not set"}</Link>}<small>{item.email || "Email unavailable"}</small></td><td><StatusBadge status={item.role} /></td><td><StatusBadge status={item.status} /></td><td>{permissionSummary(item.role, item.permissions)}</td><td>{item.invitationStatus}</td><td>{date(item.lastLoginAt)}</td><td>{date(item.createdAt)}</td><td>{data.actorRole === "SUPER_ADMIN" && item.role !== "ADMIN" ? "Restricted" : <Link className="admin-button admin-button--quiet" href={`/admin/admin-users/${item.id}`}>Manage</Link>}</td></tr>)}</AdminTable> : <p className="admin-empty">No administrators match these filters.</p>}
      <AdminPagination pathname="/admin/admin-users" page={data.page} totalPages={data.totalPages} query={params.q} status={params.status} role={params.role} />
    </section>
  </main>;
}
