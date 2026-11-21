import Link from "next/link";
import { redirect } from "next/navigation";
import { callDealseApi, DealseApiError, type DealSeUser } from "../../lib/dealse-api";
import { requireWebSession } from "../../lib/auth-session";
import { createSupabaseServerClient } from "../../lib/supabase/server";
import { logoutAdmin } from "../actions";
import {
  approveRetailer,
  createCategory,
  pauseDeal,
  pauseStore,
  reactivateRetailer,
  releaseDeal,
  resumeStore,
  reviewReport,
  suspendRetailer,
  updateCategory,
  verifyStore,
} from "./actions";
import { AdminMfaGate } from "./mfa-gate";
import { pendingAdminTotpFactors, verifiedAdminTotpFactors } from "./mfa-flow";
import { auditActorLabel } from "./audit-actor-label.mjs";
import { CopyableId } from "./copyable-id";

export const dynamic = "force-dynamic";

type Page<T> = { items: T[]; total: number; page: number; limit: number; totalPages: number };
type Retailer = { id: string; displayName: string; legalName: string | null; status: string; createdAt: string; _count: { memberships: number; stores: number } };
type Store = { id: string; name: string; city: string; locality: string | null; status: string; hasCoordinates: boolean; verifiedAt: string | null; retailer: { id: string; displayName: string; status: string }; category: { name: string } | null };
type Deal = { id: string; title: string; status: string; moderationHoldAt: string | null; moderationReason: string | null; endsAt: string; store: { name: string; city: string; retailer: { displayName: string } }; category: { name: string } | null };
type Report = { id: string; reason: string; details: string | null; createdAt: string; reporter: { emailNormalized: string | null; profile: { displayName: string | null } | null }; deal: { id: string; title: string; status: string; store: { name: string; retailer: { displayName: string } } } };
type Category = { id: string; slug: string; name: string; sortOrder: number; isActive: boolean };
type AuditLog = { id: string; actorType: string; action: string; entityType: string; entityId: string; createdAt: string; afterSnapshot: unknown; actor: { emailNormalized: string | null; profile: { displayName: string | null } | null } | null };
type Overview = { pendingRetailers: number; unreviewedStores: number; publishedDeals: number; openReports: number };

function date(value: string | null | undefined): string {
  if (!value) return "—";
  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf()) ? "—" : new Intl.DateTimeFormat("en-IN", { dateStyle: "medium" }).format(parsed);
}

function statusLabel(value: string): string {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

async function getData<T>(path: string, token: string, fallback: T): Promise<{ value: T; error?: string }> {
  try {
    return { value: await callDealseApi<T>(path, token) };
  } catch (error) {
    return { value: fallback, error: error instanceof Error ? error.message : "Could not load this section." };
  }
}

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ success?: string; error?: string }> }) {
  const { accessToken } = await requireWebSession("/admin/login");
  let user: DealSeUser;
  try {
    user = await callDealseApi<DealSeUser>("/auth/me", accessToken);
  } catch (error) {
    console.error("[DealSe Admin Auth] API identity lookup failed", {
      stage: "api_auth_me",
      apiStatus: error instanceof DealseApiError ? error.status || null : null,
      apiCategory: error instanceof DealseApiError ? error.category : "unknown",
    });
    redirect("/admin/login?error=setup");
  }
  if (!user.roles.includes("admin")) {
    console.warn("[DealSe Admin Auth] API identity lacks the admin role", {
      stage: "api_identity_role_check",
      adminRole: false,
    });
    return (
      <main className="admin-shell">
        <header className="admin-header"><Link className="brand-mark" href="/">DealSe</Link><form action={logoutAdmin}><button className="admin-button admin-button--quiet" type="submit">Log out</button></form></header>
        <section className="admin-access-card"><span className="admin-eyebrow">Restricted workspace</span><h1>Admin access required</h1><p>Your DealSe account does not have the database-backed admin role. Ask an authorized operator to grant access.</p><Link className="admin-button" href="/">Return to marketplace</Link></section>
      </main>
    );
  }

  const supabase = await createSupabaseServerClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  if (claimsError || !claimsData?.claims.sub) {
    console.warn("[DealSe Admin Auth] MFA assurance claims unavailable", {
      stage: "mfa_assurance",
      claimsPresent: false,
      providerErrorCode: claimsError && typeof claimsError.code === "string" && /^[a-z0-9_-]{1,80}$/i.test(claimsError.code) ? claimsError.code : null,
      providerStatus: claimsError && typeof claimsError.status === "number" && Number.isInteger(claimsError.status) ? claimsError.status : null,
    });
    redirect("/admin/login");
  }
  const assuranceLevel = claimsData.claims.aal;
  console.info("[DealSe Admin Auth] MFA assurance evaluated", {
    stage: "mfa_assurance",
    assuranceLevel: assuranceLevel === "aal1" || assuranceLevel === "aal2" ? assuranceLevel : "unknown",
  });
  if (claimsData.claims.aal !== "aal2") {
    const { data: factorData, error: factorError } = await supabase.auth.mfa.listFactors();
    return <main className="admin-shell"><header className="admin-header"><Link className="brand-mark" href="/">DealSe</Link></header><AdminMfaGate hasVerifiedDealSeTotp={Boolean(factorData && verifiedAdminTotpFactors(factorData.all).length)} hasPendingTotp={Boolean(factorData && pendingAdminTotpFactors(factorData.all).length)} initialError={factorError ? "Supabase could not list authenticator factors. Check the Auth configuration and retry." : undefined} /></main>;
  }

  try {
    const adminAccess = await callDealseApi<{ role: string; status: string; permissions: string[] }>("/admin/me", accessToken);
    console.info("[DealSe Admin Auth] database admin account accepted", {
      stage: "database_admin_account",
      apiStatus: 200,
      status: adminAccess.status,
      role: adminAccess.role,
      permissions: adminAccess.permissions,
    });
  } catch (error) {
    console.error("[DealSe Admin Auth] database admin account rejected", {
      stage: "database_admin_account",
      apiStatus: error instanceof DealseApiError ? error.status || null : null,
      apiCategory: error instanceof DealseApiError ? error.category : "unknown",
    });
    redirect("/admin/login?error=unauthorized");
  }

  const params = await searchParams;
  const [overview, pendingRetailers, activeRetailers, suspendedRetailers, reviewStores, activeStores, pausedStores, publishedDeals, heldDeals, reports, categories, auditLogs] = await Promise.all([
    getData<Overview>("/admin/overview", accessToken, { pendingRetailers: 0, unreviewedStores: 0, publishedDeals: 0, openReports: 0 }),
    getData<Page<Retailer>>("/admin/retailers?status=pending&limit=100", accessToken, { items: [], total: 0, page: 1, limit: 100, totalPages: 0 }),
    getData<Page<Retailer>>("/admin/retailers?status=active&limit=100", accessToken, { items: [], total: 0, page: 1, limit: 100, totalPages: 0 }),
    getData<Page<Retailer>>("/admin/retailers?status=suspended&limit=100", accessToken, { items: [], total: 0, page: 1, limit: 100, totalPages: 0 }),
    getData<Page<Store>>("/admin/stores?limit=100", accessToken, { items: [], total: 0, page: 1, limit: 100, totalPages: 0 }),
    getData<Page<Store>>("/admin/stores?status=active&limit=100", accessToken, { items: [], total: 0, page: 1, limit: 100, totalPages: 0 }),
    getData<Page<Store>>("/admin/stores?status=paused&limit=100", accessToken, { items: [], total: 0, page: 1, limit: 100, totalPages: 0 }),
    getData<Page<Deal>>("/admin/deals?status=published&limit=100", accessToken, { items: [], total: 0, page: 1, limit: 100, totalPages: 0 }),
    getData<Page<Deal>>("/admin/deals?status=paused&limit=100", accessToken, { items: [], total: 0, page: 1, limit: 100, totalPages: 0 }),
    getData<Page<Report>>("/admin/reports?status=open&limit=100", accessToken, { items: [], total: 0, page: 1, limit: 100, totalPages: 0 }),
    getData<Category[]>("/admin/categories", accessToken, []),
    getData<Page<AuditLog>>("/admin/audit-logs?limit=30", accessToken, { items: [], total: 0, page: 1, limit: 30, totalPages: 0 }),
  ]);
  const errors = [overview, pendingRetailers, activeRetailers, suspendedRetailers, reviewStores, activeStores, pausedStores, publishedDeals, heldDeals, reports, categories, auditLogs].flatMap((section) => section.error ? [section.error] : []);
  const message = params.error === "admin_required"
    ? "Admin access is required for this action."
    : params.success === "mfa_verified"
      ? "DealSe authenticator verified. Admin access is ready."
      : params.success === "mfa_replaced"
        ? "New DealSe authenticator verified. The previous DealSe authenticator was removed."
        : params.success === "mfa_replaced_previous_retained"
          ? "New DealSe authenticator verified. Your previous authenticator is still active and can be removed after checking your account factors."
          : params.error || params.success;

  if (errors.length) {
    return <main className="admin-content"><header className="admin-page-heading"><div><span className="admin-eyebrow">DealSe administration</span><h1>Marketplace operations</h1><p>Dashboard data is temporarily unavailable. No failed request is being shown as a zero count.</p></div></header>
      <div className="admin-notice admin-notice--error" role="alert"><strong>Some Admin data could not be loaded.</strong><ul>{errors.map((error, index) => <li key={`${index}-${error}`}>{error}</li>)}</ul><Link className="admin-button admin-button--quiet" href="/admin">Retry</Link></div>
    </main>;
  }

  return (
    <main className="admin-shell">
      <header className="admin-header">
        <div className="admin-brand"><Link className="brand-mark" href="/">DealSe</Link><span>Operations</span></div>
        <form action={logoutAdmin}><button className="admin-button admin-button--quiet" type="submit">Log out</button></form>
      </header>
      <div className="admin-content">
        <section className="admin-page-heading" id="overview"><div><span className="admin-eyebrow">DealSe administration</span><h1>Marketplace operations</h1><p>Review retailer onboarding, protect offer quality and keep a clear record of administrative changes.</p></div><span className="admin-user-chip">{user.profile.displayName || user.email || "Administrator"}</span></section>
        {message ? <p className={`admin-notice ${params.error ? "admin-notice--error" : "admin-notice--success"}`} role="status">{message}</p> : null}
        {errors.length ? <div className="admin-notice admin-notice--error" role="status"><strong>Some sections could not be loaded.</strong><ul>{errors.map((error, index) => <li key={`${index}-${error}`}>{error}</li>)}</ul></div> : null}

        <section className="admin-metrics" aria-label="Marketplace overview">
          <article><span>Retailers awaiting approval</span><strong>{overview.value.pendingRetailers}</strong></article>
          <article><span>Stores awaiting review</span><strong>{overview.value.unreviewedStores}</strong></article>
          <article><span>Published offers</span><strong>{overview.value.publishedDeals}</strong></article>
          <article><span>Open reports</span><strong>{overview.value.openReports}</strong></article>
        </section>

        <section className="admin-panel" id="review"><div className="admin-section-heading"><div><span className="admin-eyebrow">Onboarding</span><h2>Retailer review</h2><p>Approve eligible marketplace businesses or suspend an active account.</p></div><span className="admin-count">{pendingRetailers.value.total}</span></div>
          {pendingRetailers.value.items.length ? <div className="admin-record-list">{pendingRetailers.value.items.map((retailer) => <article className="admin-record" key={retailer.id}><div className="admin-record-main"><div className="admin-record-title"><h3>{retailer.displayName}</h3><span className={`admin-status admin-status--${retailer.status}`}>{statusLabel(retailer.status)}</span></div><p>{retailer.legalName || "Legal name not provided"} · {retailer._count.stores} stores · Requested {date(retailer.createdAt)}</p></div><div className="admin-actions">
            {retailer.status === "pending" ? <form action={approveRetailer}><input type="hidden" name="retailerId" value={retailer.id} /><button className="admin-button" type="submit">Approve retailer</button></form> : null}
          </div></article>)}</div> : <p className="admin-empty">No retailers need action in this queue.</p>}
          <h3 className="admin-subheading">Active retailers</h3>{activeRetailers.value.items.length ? <div className="admin-record-list">{activeRetailers.value.items.map((retailer) => <article className="admin-record" key={retailer.id}><div className="admin-record-main"><div className="admin-record-title"><h3>{retailer.displayName}</h3><span className="admin-status admin-status--active">Active</span></div><p>{retailer.legalName || "Legal name not provided"} · {retailer._count.stores} stores · Joined {date(retailer.createdAt)}</p></div><form action={suspendRetailer} className="admin-inline-form"><input type="hidden" name="retailerId" value={retailer.id} /><label><span className="sr-only">Reason for suspending {retailer.displayName}</span><input name="reason" minLength={5} maxLength={500} required placeholder="Reason for suspension" /></label><button className="admin-button admin-button--danger" type="submit">Suspend</button></form></article>)}</div> : <p className="admin-empty">No active retailers are listed.</p>}
          <h3 className="admin-subheading">Suspended retailers</h3>{suspendedRetailers.value.items.length ? <div className="admin-record-list">{suspendedRetailers.value.items.map((retailer) => <article className="admin-record" key={retailer.id}><div className="admin-record-main"><div className="admin-record-title"><h3>{retailer.displayName}</h3><span className="admin-status admin-status--suspended">Suspended</span></div><p>{retailer.legalName || "Legal name not provided"} · {retailer._count.stores} stores</p></div><form action={reactivateRetailer}><input type="hidden" name="retailerId" value={retailer.id} /><button className="admin-button admin-button--quiet" type="submit">Reactivate</button></form></article>)}</div> : <p className="admin-empty">No suspended retailers.</p>}
        </section>

        <section className="admin-panel" id="stores"><div className="admin-section-heading"><div><span className="admin-eyebrow">Store safety</span><h2>Store verification</h2><p>Stores need an approved retailer and a mapped location before appearing publicly.</p></div><span className="admin-count">{reviewStores.value.total + activeStores.value.total}</span></div>
          {reviewStores.value.items.length ? <div className="admin-record-list">{reviewStores.value.items.map((store) => <article className="admin-record" key={store.id}><div className="admin-record-main"><div className="admin-record-title"><h3>{store.name}</h3><span className={`admin-status admin-status--${store.status}`}>{statusLabel(store.status)}</span></div><p>{store.retailer.displayName} · {[store.locality, store.city].filter(Boolean).join(", ")} · {store.category?.name || "Uncategorized"}</p><span className="admin-substatus">{store.hasCoordinates ? "Location on file" : "Location required"} · Retailer {statusLabel(store.retailer.status)}</span></div><div className="admin-actions">{store.retailer.status === "active" && store.hasCoordinates ? <form action={verifyStore}><input type="hidden" name="storeId" value={store.id} /><button className="admin-button" type="submit">Verify and activate</button></form> : <span className="admin-requirement">{store.retailer.status !== "active" ? "Approve retailer first" : "Coordinates required"}</span>}</div></article>)}</div> : <p className="admin-empty">No stores are awaiting review.</p>}
          <h3 className="admin-subheading">Active stores</h3>{activeStores.value.items.length ? <div className="admin-record-list">{activeStores.value.items.map((store) => <article className="admin-record" key={store.id}><div className="admin-record-main"><div className="admin-record-title"><h3>{store.name}</h3><span className="admin-status admin-status--active">Active</span></div><p>{store.retailer.displayName} · {[store.locality, store.city].filter(Boolean).join(", ")}</p></div><form action={pauseStore} className="admin-inline-form"><input type="hidden" name="storeId" value={store.id} /><label><span className="sr-only">Reason for pausing {store.name}</span><input name="reason" minLength={5} maxLength={500} required placeholder="Reason for pausing" /></label><button className="admin-button admin-button--danger" type="submit">Pause store</button></form></article>)}</div> : <p className="admin-empty">No active stores are listed.</p>}
          <h3 className="admin-subheading">Paused stores</h3>{pausedStores.value.items.length ? <div className="admin-record-list">{pausedStores.value.items.map((store) => <article className="admin-record" key={store.id}><div className="admin-record-main"><div className="admin-record-title"><h3>{store.name}</h3><span className="admin-status admin-status--paused">Paused</span></div><p>{store.retailer.displayName} · {[store.locality, store.city].filter(Boolean).join(", ")}</p></div><form action={resumeStore}><input type="hidden" name="storeId" value={store.id} /><button className="admin-button admin-button--quiet" type="submit">Resume store</button></form></article>)}</div> : <p className="admin-empty">No paused stores.</p>}
        </section>

        <section className="admin-panel" id="offers"><div className="admin-section-heading"><div><span className="admin-eyebrow">Marketplace quality</span><h2>Offer moderation</h2><p>Place public offers on hold when reported or found to violate marketplace policy.</p></div><span className="admin-count">{publishedDeals.value.total + heldDeals.value.items.filter((deal) => deal.moderationHoldAt).length}</span></div>
          <h3 className="admin-subheading">Published offers</h3>{publishedDeals.value.items.length ? <div className="admin-record-list">{publishedDeals.value.items.map((deal) => <article className="admin-record" key={deal.id}><div className="admin-record-main"><div className="admin-record-title"><h3>{deal.title}</h3><span className="admin-status admin-status--published">Published</span></div><p>{deal.store.retailer.displayName} · {deal.store.name}, {deal.store.city} · Ends {date(deal.endsAt)}</p></div><form action={pauseDeal} className="admin-inline-form"><input type="hidden" name="dealId" value={deal.id} /><label><span className="sr-only">Moderation reason for {deal.title}</span><input name="reason" minLength={5} maxLength={500} required placeholder="Moderation reason" /></label><button className="admin-button admin-button--danger" type="submit">Place on hold</button></form></article>)}</div> : <p className="admin-empty">There are no published offers to review.</p>}
          <h3 className="admin-subheading">Paused offers</h3>{heldDeals.value.items.length ? <div className="admin-record-list">{heldDeals.value.items.map((deal) => <article className="admin-record" key={deal.id}><div className="admin-record-main"><div className="admin-record-title"><h3>{deal.title}</h3><span className={`admin-status ${deal.moderationHoldAt ? "admin-status--suspended" : "admin-status--paused"}`}>{deal.moderationHoldAt ? "Moderation hold" : "Retailer paused"}</span></div><p>{deal.store.retailer.displayName} · {deal.store.name} · {deal.moderationReason || "No moderation reason recorded"}</p></div>{deal.moderationHoldAt ? <form action={releaseDeal}><input type="hidden" name="dealId" value={deal.id} /><button className="admin-button admin-button--quiet" type="submit">Release to retailer draft</button></form> : null}</article>)}</div> : <p className="admin-empty">No paused offers.</p>}
        </section>

        <section className="admin-panel" id="reports"><div className="admin-section-heading"><div><span className="admin-eyebrow">Customer feedback</span><h2>Offer reports</h2><p>Review reports submitted by signed-in customers. Resolve or dismiss with a recorded reason.</p></div><span className="admin-count">{reports.value.total}</span></div>
          {reports.value.items.length ? <div className="admin-record-list">{reports.value.items.map((report) => <article className="admin-record admin-record--stacked" key={report.id}><div className="admin-record-main"><div className="admin-record-title"><h3>{report.deal.title}</h3><span className="admin-status admin-status--pending">{statusLabel(report.reason)}</span></div><p>{report.deal.store.retailer.displayName} · {report.deal.store.name} · Reported {date(report.createdAt)}</p><p>From {report.reporter.profile?.displayName || report.reporter.emailNormalized || "Customer"}{report.details ? ` · ${report.details}` : ""}</p></div><form action={reviewReport} className="admin-report-form"><input type="hidden" name="reportId" value={report.id} /><label>Resolution note<input name="resolution" required minLength={5} maxLength={1000} placeholder="Describe the review outcome" /></label><label>Outcome<select name="status" defaultValue="resolved"><option value="resolved">Resolve report</option><option value="dismissed">Dismiss report</option></select></label><button className="admin-button" type="submit">Save review</button></form></article>)}</div> : <p className="admin-empty">No open customer reports.</p>}
        </section>

        <section className="admin-panel" id="categories"><div className="admin-section-heading"><div><span className="admin-eyebrow">Marketplace taxonomy</span><h2>Categories</h2><p>Create categories and deactivate ones that should no longer appear in discovery.</p></div></div>
          <form action={createCategory} className="admin-category-create"><label>Category name<input name="name" required minLength={2} maxLength={100} placeholder="For example, Footwear" /></label><label>URL slug<input name="slug" required minLength={2} maxLength={100} pattern="[a-z0-9]+(-[a-z0-9]+)*" placeholder="footwear" /></label><button className="admin-button" type="submit">Add category</button></form>
          {categories.value.length ? <div className="admin-category-list">{categories.value.map((category) => <form action={updateCategory} className="admin-category-row" key={category.id}><input type="hidden" name="categoryId" value={category.id} /><span className="admin-category-slug">{category.slug}</span><label><span className="sr-only">Category name for {category.slug}</span><input name="name" defaultValue={category.name} required minLength={2} maxLength={100} /></label><label><span className="sr-only">Status for {category.name}</span><select name="isActive" defaultValue={String(category.isActive)}><option value="true">Active</option><option value="false">Inactive</option></select></label><button className="admin-button admin-button--quiet" type="submit">Save</button></form>)}</div> : <p className="admin-empty">No categories are available.</p>}
        </section>

        <section className="admin-panel" id="audit"><div className="admin-section-heading"><div><span className="admin-eyebrow">Accountability</span><h2>Recent admin activity</h2><p>Administrative state changes are written to PostgreSQL in the same transaction.</p></div><span className="admin-count">{auditLogs.value.total}</span></div>
          {auditLogs.value.items.length ? <div className="admin-audit-list">{auditLogs.value.items.map((entry) => <article className="admin-audit-row" key={entry.id}><div><strong>{entry.action.replaceAll(".", " ")}</strong><span>{entry.entityType}</span>{entry.entityId ? <CopyableId value={entry.entityId} label={`Copy ${entry.entityType} ID`} /> : null}</div><div><strong>{auditActorLabel(entry.actor, entry.actorType)}</strong><span>{date(entry.createdAt)}</span></div></article>)}</div> : <p className="admin-empty">No administrative actions have been recorded yet.</p>}
        </section>
      </div>
    </main>
  );
}
