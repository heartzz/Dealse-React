/* eslint-disable @typescript-eslint/no-explicit-any */
import Link from "next/link";
import type { ReactNode } from "react";

export type AdminPageData<T = Record<string, any>> = { items: T[]; page: number; limit: number; total: number; totalPages: number };

export function displayStatus(value: unknown) {
  return typeof value === "string" ? value.toLowerCase().replaceAll("_", " ") : "unknown";
}

export function AdminNotice({ success, error }: { success?: string; error?: string }) {
  return <>{success ? <p className="admin-notice admin-notice--success" role="status">{success}</p> : null}{error ? <p className="admin-notice admin-notice--error" role="alert">{error}</p> : null}</>;
}

export function AdminListToolbar({ action, query, status, statuses }: { action: string; query?: string; status?: string; statuses: string[] }) {
  return <form className="admin-list-toolbar" action={action}>
    <label>Search<input type="search" name="q" defaultValue={query} placeholder="Search name, owner or title" /></label>
    <label>Status<select name="status" defaultValue={status ?? "all"}><option value="all">All statuses</option>{statuses.map((item) => <option value={item} key={item}>{displayStatus(item)}</option>)}</select></label>
    <button className="admin-button" type="submit">Apply filters</button>
  </form>;
}

export function AdminPagination({ pathname, page, totalPages, query, status, role }: { pathname: string; page: number; totalPages: number; query?: string; status?: string; role?: string }) {
  const href = (next: number) => `${pathname}?${new URLSearchParams({ page: String(next), ...(query ? { q: query } : {}), ...(status ? { status } : {}), ...(role ? { role } : {}) })}`;
  return <nav className="admin-pagination" aria-label="Pagination"><span>Page {page} of {totalPages}</span><div>{page > 1 ? <Link className="admin-button admin-button--quiet" href={href(page - 1)}>Previous</Link> : null}{page < totalPages ? <Link className="admin-button admin-button--quiet" href={href(page + 1)}>Next</Link> : null}</div></nav>;
}

export function AdminTable({ headers, children }: { headers: string[]; children: ReactNode }) {
  return <div className="admin-table-wrap"><table className="admin-table"><thead><tr>{headers.map((header) => <th key={header} scope="col">{header}</th>)}</tr></thead><tbody>{children}</tbody></table></div>;
}

export function StatusBadge({ status }: { status: unknown }) {
  const value = displayStatus(status).replaceAll(" ", "_");
  return <span className={`admin-status admin-status--${value}`}>{displayStatus(status)}</span>;
}

export function BackLink({ href = "/admin" }: { href?: string }) { return <Link className="admin-back-link" href={href}>← Back to list</Link>; }

export function AuditHistory({ items }: { items: any[] }) {
  return <section className="admin-panel"><div className="admin-section-heading"><div><span className="admin-eyebrow">Accountability</span><h2>Application and action history</h2></div></div>{items?.length ? <div className="admin-audit-list">{items.map((entry) => <article className="admin-audit-row" key={entry.id}><div><strong>{String(entry.action).replaceAll(".", " ")}</strong><span>{entry.entityType} · {entry.entityId}</span>{entry.afterSnapshot?.reason ? <span>Reason: {entry.afterSnapshot.reason}</span> : null}</div><div><strong>{entry.actor?.profile?.displayName || entry.actor?.emailNormalized || entry.actorType}</strong><span>{new Date(entry.createdAt).toLocaleString()}</span></div></article>)}</div> : <p className="admin-empty">No application or moderation history is recorded.</p>}</section>;
}
