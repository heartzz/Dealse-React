import { App } from "../../../../prototype/src/App.jsx";
import { logoutCustomer } from "./actions";
import { reportDeal, searchMarketplaceDeals, toggleFavourite } from "./marketplace-actions";
import { callDealseApi, type DealSeCategory, type DealSeMarketplaceDeal, type DealSeUser } from "../lib/dealse-api";
import { toMarketplaceCard } from "../lib/marketplace-presenter";
import { createSupabaseServerClient } from "../lib/supabase/server";

export const dynamic = "force-dynamic";

async function getHomeData(initialActiveDealId?: string) {
  let user: DealSeUser | null = null;
  let accessToken: string | undefined;
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.getClaims();
    if (!error && data?.claims.sub) {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        accessToken = session.access_token;
        user = await callDealseApi<DealSeUser>("/auth/me", accessToken);
      }
    }
  } catch {
    user = null;
  }
  const [discoveryResult, categoriesResult] = await Promise.all([
    callDealseApi<{ items: DealSeMarketplaceDeal[] }>("/deals?city=Ahmedabad&limit=100").then((value) => ({ value })).catch((error: unknown) => ({ error })),
    callDealseApi<DealSeCategory[]>("/categories").then((value) => ({ value })).catch((error: unknown) => ({ error })),
  ]);
  const discovery = "value" in discoveryResult ? discoveryResult.value : { items: [] };
  const categories = "value" in categoriesResult ? categoriesResult.value : [];
  const deepLinkedDeal = initialActiveDealId && !discovery.items.some((deal) => deal.id === initialActiveDealId)
    ? await callDealseApi<DealSeMarketplaceDeal>(`/deals/${encodeURIComponent(initialActiveDealId)}`).catch(() => null)
    : null;
  const deals = deepLinkedDeal ? [...discovery.items, deepLinkedDeal] : discovery.items;
  const savedIds = user?.roles.includes("customer") && accessToken
    ? await callDealseApi<Array<{ id: string }>>("/customers/me/favourites", accessToken).then((items) => items.map((item) => item.id)).catch(() => [])
    : [];
  const marketplaceError = [discoveryResult, categoriesResult].flatMap((result) => {
    if (!("error" in result)) return [];
    return [result.error instanceof Error ? result.error.message : "DealSe marketplace data could not be loaded. Please try again."];
  }).join(" ");
  return { user, deals: deals.map(toMarketplaceCard), categories, savedIds, marketplaceError };
}

export default async function HomePage({ searchParams }: { searchParams: Promise<{ deal?: string | string[] }> }) {
  const params = await searchParams;
  const rawDealId = Array.isArray(params.deal) ? params.deal[0] : params.deal;
  const activeDealId = rawDealId && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(rawDealId) ? rawDealId : undefined;
  const { user, deals, categories, savedIds, marketplaceError } = await getHomeData(activeDealId);
  return <App initialUser={user} initialDeals={deals} initialCategories={categories} initialSavedDealIds={savedIds} initialActiveDealId={activeDealId} initialMarketplaceError={marketplaceError} marketplaceReady onSearchDeals={searchMarketplaceDeals} onToggleFavourite={toggleFavourite} onReportDeal={reportDeal} onCustomerLogout={logoutCustomer} />;
}
