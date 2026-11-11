import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { callDealseApi, DealseApiError, type DealSeMarketplaceDeal } from "../../../../lib/dealse-api";
import { toMarketplaceCard } from "../../../../lib/marketplace-presenter";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";
import { DealSaveButton } from "../../save-button";
import { PublicMediaGallery } from "../../../../components/PublicMediaGallery";
import { imageByCategory } from "../../../../lib/marketplace-presenter";

export const dynamic = "force-dynamic";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function readDeal(dealId: string): Promise<DealSeMarketplaceDeal> {
  return callDealseApi<DealSeMarketplaceDeal>(`/deals/${encodeURIComponent(dealId)}`);
}

export async function generateMetadata({ params }: { params: Promise<{ dealId: string; slug: string }> }): Promise<Metadata> {
  const { dealId } = await params;
  if (!uuidPattern.test(dealId)) return { title: "Local offer — DealSe" };
  try {
    const deal = await readDeal(dealId);
    return {
      title: `${deal.title} at ${deal.store.name} — DealSe`,
      description: deal.summary || deal.description || `${deal.offer} at ${deal.store.name}, ${deal.store.locality || deal.store.city}.`,
      openGraph: { title: `${deal.title} at ${deal.store.name}`, description: deal.summary || deal.description || deal.offer, images: deal.image ? [deal.image] : [] },
    };
  } catch {
    return { title: "Local offer — DealSe" };
  }
}

function money(minor: string | null, currency: string | null): string | null {
  if (minor === null) return null;
  const amount = Number(minor);
  if (!Number.isSafeInteger(amount)) return null;
  try {
    return new Intl.NumberFormat("en-IN", { style: "currency", currency: currency || "INR", maximumFractionDigits: 0 }).format(amount / 100);
  } catch {
    return `₹${new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(amount / 100)}`;
  }
}

function date(value: string): string {
  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf()) ? "" : new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "long", year: "numeric" }).format(parsed);
}

async function customerSaveState(dealId: string): Promise<{ signedIn: boolean; saved: boolean }> {
  let accessToken: string;
  try {
    const supabase = await createSupabaseServerClient();
    const { data: claims } = await supabase.auth.getClaims();
    if (!claims?.claims.sub) return { signedIn: false, saved: false };
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return { signedIn: false, saved: false };
    accessToken = token;
  } catch {
    return { signedIn: false, saved: false };
  }
  let user: { roles: string[] };
  try {
    user = await callDealseApi<{ roles: string[] }>("/auth/me", accessToken);
  } catch {
    return { signedIn: true, saved: false };
  }
  if (!user.roles.includes("customer")) return { signedIn: false, saved: false };
  try {
    const saved = await callDealseApi<Array<{ id: string }>>("/customers/me/favourites", accessToken);
    return { signedIn: true, saved: saved.some((item) => item.id === dealId) };
  } catch {
    return { signedIn: true, saved: false };
  }
}

export default async function PublicDealPage({ params }: { params: Promise<{ dealId: string; slug: string }> }) {
  const { dealId, slug } = await params;
  if (!uuidPattern.test(dealId)) notFound();

  let deal: DealSeMarketplaceDeal;
  try {
    deal = await readDeal(dealId);
  } catch (error) {
    if (error instanceof DealseApiError && error.status === 404) notFound();
    return <main className="public-deal-shell"><header className="public-deal-header"><Link className="public-deal-brand" href="/" aria-label="DealSe home"><img src="/assets/dealse-logo.png" alt="" /><span><strong>DealSe</strong><small>Good Local Finds</small></span></Link></header><section className="public-deal-message" role="alert"><span className="deal-eyebrow">Offer details unavailable</span><h1>We couldn’t load this offer right now.</h1><p>Check your connection and try again. The marketplace is still available.</p><Link href="/">Back to local deals</Link></section></main>;
  }
  if (slug !== deal.slug) redirect(`/deals/${deal.id}/${deal.slug}`);

  const card = toMarketplaceCard(deal);
  const saveState = await customerSaveState(deal.id);
  const original = money(deal.originalPriceMinor, deal.currency);
  const discounted = money(deal.offerPriceMinor, deal.currency);
  const storeAddress = [deal.store.addressLine1, deal.store.addressLine2, deal.store.locality, deal.store.city, deal.store.region].filter(Boolean).join(", ");

  return (
    <main className="public-deal-shell">
      <header className="public-deal-header"><Link className="public-deal-brand" href="/" aria-label="DealSe home"><img src="/assets/dealse-logo.png" alt="" /><span><strong>DealSe</strong><small>Good Local Finds</small></span></Link><Link className="deal-header-back" href="/">Explore local deals <span aria-hidden="true">→</span></Link></header>
      <div className="public-deal-content"><Link className="deal-breadcrumb" href="/">Ahmedabad local marketplace <span aria-hidden="true">/</span> {deal.category?.name || "Offer"}</Link>
        <article className="public-deal-card">
          <div className="public-deal-image"><PublicMediaGallery images={deal.images} primaryUrl={deal.image} alt={card.alt} fallback={imageByCategory(deal.category?.name || "")} variant="deal" badge={deal.offer} /></div>
          <div className="public-deal-main">
            <span className="deal-eyebrow">{deal.category?.name || "Local offer"} · {deal.store.locality || deal.store.city}</span>
            <h1>{deal.title}</h1>
            <Link className="deal-store-name" href={`/stores/${encodeURIComponent(deal.store.id)}/${encodeURIComponent(deal.store.slug)}`}>{deal.store.name} <span aria-hidden="true">↗</span></Link>
            {original || discounted ? <div className="public-deal-price">{discounted ? <strong>{discounted}</strong> : null}{original ? <del>{original}</del> : null}{deal.offerType === "percentage" ? <span>{deal.offer}</span> : null}</div> : <p className="public-deal-offer-label">{deal.offer}</p>}
            <p className="public-deal-summary">{deal.summary || deal.description || "Discover this offer from a local Ahmedabad business."}</p>
            {deal.description ? <section className="public-deal-section"><h2>About this offer</h2><p>{deal.description}</p></section> : null}
            <div className="public-deal-validity"><span>Valid from <strong>{date(deal.startsAt)}</strong></span><span>Through <strong>{date(deal.endsAt)}</strong></span></div>
            <section className="public-deal-section"><h2>Terms and conditions</h2><p>{deal.terms}</p></section>
            {deal.products?.length ? <section className="public-deal-section"><h2>Featured products</h2><ul className="deal-products-list">{deal.products.map((product) => <li key={product.id}>{product.image ? <img src={product.image} alt={product.imageAlt || product.name} loading="lazy" onError={(event) => { event.currentTarget.onerror = null; event.currentTarget.src = imageByCategory(deal.category?.name || ""); }} /> : null}<span>{product.name}</span></li>)}</ul></section> : null}
            <DealSaveButton dealId={deal.id} initiallySaved={saveState.saved} customerSignedIn={saveState.signedIn} />
          </div>
        </article>
        <aside className="deal-store-panel"><div><span className="deal-eyebrow">Visit the store</span><h2>{deal.store.name}</h2><p>{storeAddress || deal.store.locality || deal.store.city}</p>{deal.store.description ? <p>{deal.store.description}</p> : null}{deal.store.phone ? <a href={`tel:${deal.store.phone}`}>{deal.store.phone}</a> : null}</div><Link className="deal-store-link" href={`/stores/${encodeURIComponent(deal.store.id)}/${encodeURIComponent(deal.store.slug)}`}>Store details <span aria-hidden="true">→</span></Link></aside>
      </div>
    </main>
  );
}
