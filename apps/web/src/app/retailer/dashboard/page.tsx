import { redirect } from "next/navigation";
import { App } from "../../../../../../prototype/src/App.jsx";
import { logoutRetailer } from "../../actions";
import { callDealseApi, type DealSeRetailer, type DealSeUser } from "../../../lib/dealse-api";
import { requireWebSession } from "../../../lib/auth-session";
import { createStore, updateStore, createProduct, updateProduct, archiveProduct, createDeal, updateDeal, publishDeal, pauseDeal, previewDeal } from "../../marketplace-actions";
import { toMarketplaceCard } from "../../../lib/marketplace-presenter";
import type { DealSeCategory, DealSeMarketplaceDeal, DealSeProduct, DealSeStore } from "../../../lib/dealse-api";

export const dynamic = "force-dynamic";

export default async function RetailerDashboardPage() {
  const { accessToken } = await requireWebSession("/retailer/login");
  let user: DealSeUser;
  let retailers: DealSeRetailer[];
  try {
    user = await callDealseApi<DealSeUser>("/auth/me", accessToken);
  } catch {
    redirect("/retailer/login?error=setup");
  }
  if (!user.roles.includes("retailer")) redirect("/retailer/setup");

  try {
    retailers = await callDealseApi<DealSeRetailer[]>("/retailers/mine", accessToken);
  } catch {
    redirect("/retailer/login?error=setup");
  }
  if (retailers.length === 0) redirect("/retailer/setup");

  const retailer = retailers[0];
  let stores: DealSeStore[];
  let products: DealSeProduct[];
  let deals: DealSeMarketplaceDeal[];
  let categories: DealSeCategory[];
  try {
    [stores, products, deals, categories] = await Promise.all([
      callDealseApi<DealSeStore[]>(`/retailers/${retailer.id}/stores`, accessToken),
      callDealseApi<DealSeProduct[]>(`/retailers/${retailer.id}/products`, accessToken),
      callDealseApi<DealSeMarketplaceDeal[]>(`/retailers/${retailer.id}/deals`, accessToken),
      callDealseApi<DealSeCategory[]>("/categories"),
    ]);
  } catch {
    redirect("/retailer/login?error=setup");
  }
  const notificationCount = await callDealseApi<{ unreadCount: number }>("/notifications/me?limit=1", accessToken)
    .then(({ unreadCount }) => unreadCount)
    .catch(() => 0);
  const firstStore = stores[0];
  const workspace = firstStore ? {
    retailerId: retailer.id,
    id: firstStore.id,
    hasStore: true,
    storeName: firstStore.name,
    ownerName: user.profile.displayName || user.email?.split("@")[0] || "Store owner",
    email: user.email || "",
    categoryId: firstStore.categoryId || "",
    category: categories.find(({ id }) => id === firstStore.categoryId)?.name || "Local business",
    area: firstStore.locality || firstStore.region || firstStore.city,
    city: firstStore.city,
    address: firstStore.addressLine1 || "",
    hours: "",
    description: firstStore.description || retailer.legalName || "Manage your DealSe store profile and offers.",
  } : {
    retailerId: retailer.id, hasStore: false,
    ownerName: user.profile.displayName || user.email?.split("@")[0] || "Store owner",
    email: user.email || "", storeName: retailer.displayName, category: "Local business", categoryId: "",
    area: "", city: "Ahmedabad", address: "", hours: "", description: retailer.legalName || "Complete your store profile.",
  };

  const workspaceDeals = deals.map((deal) => ({
    ...toMarketplaceCard(deal), title: deal.title, description: deal.description || deal.summary || deal.title,
    startDate: deal.startsAt.slice(0, 10), endDate: deal.endsAt.slice(0, 10), image: toMarketplaceCard(deal).image,
    imageAlt: deal.imageAlt, categoryId: deal.categoryId || "", offerType: deal.offerType, discountBps: deal.discountBps || 2000,
    status: deal.status, terms: deal.terms,
  }));
  return <App mode="retailer" initialUser={user} initialRetailer={workspace} initialStores={stores} initialProducts={products} initialRetailerDeals={workspaceDeals} initialCategories={categories} initialNotificationCount={notificationCount} onCreateStore={createStore} onUpdateStore={updateStore} onCreateProduct={createProduct} onUpdateProduct={updateProduct} onArchiveProduct={archiveProduct} onCreateDeal={createDeal} onUpdateDeal={updateDeal} onPublishDeal={publishDeal} onPauseDeal={pauseDeal} onPreviewDeal={previewDeal} onRetailerLogout={logoutRetailer} />;
}
