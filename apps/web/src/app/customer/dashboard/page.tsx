import { redirect } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { callDealseApi, type DealSeMarketplaceDeal, type DealSeUser } from "../../../lib/dealse-api";
import { toMarketplaceCard } from "../../../lib/marketplace-presenter";
import { requireWebSession } from "../../../lib/auth-session";
import { logoutCustomer, saveCustomerProfile } from "../../actions";
import { CustomerDashboardNav } from "../customer-dashboard-nav";

export const dynamic = "force-dynamic";

export default async function CustomerDashboardPage() {
  const { accessToken } = await requireWebSession("/customer/login");
  let user: DealSeUser;
  try {
    user = await callDealseApi<DealSeUser>("/auth/me", accessToken);
  } catch {
    redirect("/customer/login?error=setup");
  }
  if (!user.roles.includes("customer")) redirect("/customer/login?error=customer_profile");
  const [savedResult, notifications] = await Promise.all([
    callDealseApi<DealSeMarketplaceDeal[]>("/customers/me/favourites", accessToken)
      .then((items) => ({ items: items.map(toMarketplaceCard), error: false }))
      .catch(() => ({ items: [], error: true })),
    callDealseApi<{ unreadCount: number }>("/notifications/me?limit=1", accessToken)
      .then((result) => result.unreadCount)
      .catch(() => 0),
  ]);

  return (
    <main className="dashboard-shell">
      <header className="dashboard-header">
        <Link className="brand-mark" href="/">DealSe</Link>
        <div className="dashboard-header-actions"><Link className="notifications-entry" href="/customer/notifications">Notifications{notifications > 0 && <span>{notifications}</span>}</Link><form action={logoutCustomer}><button className="logout-button" type="submit">Log out</button></form></div>
      </header>
      <section className="dashboard-card" id="customer-profile">
        <p className="eyebrow">Customer profile</p>
        <h1>Welcome{user.profile.displayName ? `, ${user.profile.displayName}` : ""}</h1>
        <p className="muted">Your account is connected to DealSe. Your saved local offers stay here across visits.</p>
        <p className="muted">{user.email}</p>
        <span className="status-pill">{user.roles.join(" · ")}</span>
        <form className="customer-profile-edit" action={saveCustomerProfile}>
          <label htmlFor="customer-display-name">Your name</label>
          <div><input id="customer-display-name" name="displayName" type="text" autoComplete="name" maxLength={120} defaultValue={user.profile.displayName ?? ""} required /><button className="primary-button" type="submit">Save profile</button></div>
        </form>
      </section>
      <section className="dashboard-card saved-deals-panel" id="saved-deals">
        <h2>Saved deals</h2>
        {savedResult.error ? <div className="saved-deals-empty" role="alert"><p>Your saved offers could not be loaded. Please refresh to retry.</p><Link href="/customer/dashboard#saved-deals">Try again</Link></div> : savedResult.items.length ? <div className="saved-deals-list">{savedResult.items.map((deal) => <article className="saved-deal-row" key={deal.id}>
          <Image src={deal.image} alt={deal.alt} width={104} height={86} unoptimized />
          <div><p className="eyebrow">{deal.category} · {deal.area}</p><h3><Link href={`/stores/${encodeURIComponent(deal.storeId)}/${encodeURIComponent(deal.storeSlug)}`}>{deal.store}</Link></h3><p>{deal.description}</p><strong>{deal.offer}</strong></div>
          <Link href={`/deals/${encodeURIComponent(deal.id)}/${encodeURIComponent(deal.slug)}`}>View offer</Link>
        </article>)}</div> : <div className="saved-deals-empty"><p>You haven’t saved any offers yet.</p><Link href="/#deals">Explore local deals</Link></div>}
      </section>
      <CustomerDashboardNav />
    </main>
  );
}
