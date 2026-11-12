import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { callDealseApi, DealseApiError, type DealSePublicStore } from "../../../../lib/dealse-api";
import { toMarketplaceCard } from "../../../../lib/marketplace-presenter";
import { PublicMediaGallery } from "../../../../components/PublicMediaGallery";
import { imageByCategory } from "../../../../lib/marketplace-presenter";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";
import { FollowStoreButton } from "../../follow-store-button";

export const dynamic = "force-dynamic";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function readStore(storeId: string): Promise<DealSePublicStore> {
  return callDealseApi<DealSePublicStore>(`/stores/${encodeURIComponent(storeId)}`);
}

async function customerFollowState(storeId: string): Promise<{ signedIn: boolean; following: boolean }> {
  let accessToken: string;
  try {
    const supabase = await createSupabaseServerClient();
    const { data: claims, error } = await supabase.auth.getClaims();
    if (error || !claims?.claims.sub) return { signedIn: false, following: false };
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return { signedIn: false, following: false };
    accessToken = session.access_token;
  } catch {
    return { signedIn: false, following: false };
  }
  try {
    const user = await callDealseApi<{ roles: string[] }>("/auth/me", accessToken);
    if (!user.roles.includes("customer")) return { signedIn: false, following: false };
    const stores = await callDealseApi<Array<{ id: string }>>("/customers/me/followed-stores", accessToken);
    return { signedIn: true, following: stores.some((store) => store.id === storeId) };
  } catch {
    return { signedIn: true, following: false };
  }
}

export async function generateMetadata({ params }: { params: Promise<{ storeId: string; slug: string }> }): Promise<Metadata> {
  const { storeId } = await params;
  if (!uuidPattern.test(storeId)) return { title: "Local store — DealSe" };
  try {
    const store = await readStore(storeId);
    return {
      title: `${store.name} in ${store.locality || store.city} — DealSe`,
      description: store.description || `Discover current offers from ${store.name} in ${store.locality || store.city}, Ahmedabad.`,
    };
  } catch {
    return { title: "Local store — DealSe" };
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
  return Number.isNaN(parsed.valueOf()) ? "" : new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" }).format(parsed);
}

function safeImage(store: DealSePublicStore, deals: ReturnType<typeof toMarketplaceCard>[]): string {
  if (store.image?.startsWith("/") || store.image?.startsWith("https://")) return store.image;
  return deals[0]?.image || "/assets/hero-shopkeeper.png";
}

export default async function PublicStorePage({ params }: { params: Promise<{ storeId: string; slug: string }> }) {
  const { storeId, slug } = await params;
  if (!uuidPattern.test(storeId)) notFound();

  let store: DealSePublicStore;
  try {
    store = await readStore(storeId);
  } catch (error) {
    if (error instanceof DealseApiError && error.status === 404) notFound();
    return (
      <main className="public-store-shell">
        <header className="public-store-header"><Link className="public-store-brand" href="/" aria-label="DealSe home"><img src="/assets/dealse-logo.png" alt="" /><span><strong>DealSe</strong><small>Good Local Finds</small></span></Link></header>
        <section className="public-store-message" role="alert"><span className="store-eyebrow">Store details unavailable</span><h1>We couldn’t load this store right now.</h1><p>Check your connection and try again. The marketplace is still available.</p><Link className="store-primary-link" href="/">Back to local deals</Link></section>
      </main>
    );
  }

  if (slug !== store.slug) redirect(`/stores/${store.id}/${store.slug}`);

  const deals = store.offers.map(toMarketplaceCard);
  const followState = await customerFollowState(store.id);
  const cover = safeImage(store, deals);
  const address = [store.addressLine1, store.addressLine2, store.locality, store.city, store.region, store.postalCode].filter(Boolean).join(", ");

  return (
    <main className="public-store-shell">
      <header className="public-store-header"><Link className="public-store-brand" href="/" aria-label="DealSe home"><img src="/assets/dealse-logo.png" alt="" /><span><strong>DealSe</strong><small>Good Local Finds</small></span></Link><Link className="store-back-link" href="/">Explore local deals <span aria-hidden="true">→</span></Link></header>
      <div className="public-store-content">
        <Link className="store-breadcrumb" href="/">Ahmedabad local marketplace <span aria-hidden="true">/</span> {store.name}</Link>
        <section className="store-profile-hero">
          <div className="store-profile-image"><PublicMediaGallery images={store.images} primaryUrl={cover} alt={store.image ? store.imageAlt : `${store.name} and its current offers`} fallback={imageByCategory(store.category?.name || "")} variant="store" /></div>
          <div className="store-profile-copy">
            <span className="store-eyebrow">{store.category?.name || "Independent local store"} · {store.locality || store.city}</span>
            <h1>{store.name}</h1>
            <p className="store-byline">A local business on DealSe · {store.retailerName}</p>
            {store.description ? <p className="store-description">{store.description}</p> : null}
            <div className="store-contact-list">
              {address ? <p><span aria-hidden="true">⌖</span>{address}</p> : null}
              {store.phone ? <p><span aria-hidden="true">☎</span><a href={`tel:${store.phone}`}>{store.phone}</a></p> : null}
              {store.email ? <p><span aria-hidden="true">✉</span><a href={`mailto:${store.email}`}>{store.email}</a></p> : null}
            </div>
            <FollowStoreButton storeId={store.id} initiallyFollowing={followState.following} customerSignedIn={followState.signedIn} />
          </div>
        </section>

        <section className="store-offers-section" aria-labelledby="store-offers-title">
          <div className="store-offers-heading"><div><span className="store-eyebrow">Available now</span><h2 id="store-offers-title">Offers from {store.name}</h2><p>Only active offers from this verified store are shown.</p></div><span className="store-offers-count">{deals.length} {deals.length === 1 ? "offer" : "offers"}</span></div>
          {deals.length ? <div className="public-store-offer-grid">{store.offers.map((offer, index) => {
            const deal = deals[index];
            const original = money(offer.originalPriceMinor, offer.currency);
            const discounted = money(offer.offerPriceMinor, offer.currency);
            return <article className="public-store-offer" key={offer.id}>
              <a className="store-offer-image" href={`/deals/${encodeURIComponent(offer.id)}/${encodeURIComponent(offer.slug)}`}><img src={deal.image} alt={deal.alt} loading="lazy" /><span>{offer.offer}</span></a>
              <div className="store-offer-copy"><p className="store-offer-category">{offer.category?.name || store.category?.name || "Local offer"}</p><h3><a href={`/deals/${encodeURIComponent(offer.id)}/${encodeURIComponent(offer.slug)}`}>{offer.title}</a></h3><p className="store-offer-summary">{offer.summary || offer.description || "See the offer details and terms."}</p>
                {original || discounted ? <p className="store-offer-prices">{discounted ? <strong>{discounted}</strong> : null}{original ? <del>{original}</del> : null}</p> : null}
                <p className="store-offer-validity">Valid through {date(offer.endsAt)}</p><a className="store-offer-link" href={`/deals/${encodeURIComponent(offer.id)}/${encodeURIComponent(offer.slug)}`}>View offer details <span aria-hidden="true">→</span></a>
              </div>
            </article>;
          })}</div> : <div className="store-offers-empty"><h3>No active offers right now</h3><p>Check back later for new offers from {store.name}.</p><Link href="/">Explore other local deals</Link></div>}
        </section>
      </div>
    </main>
  );
}
