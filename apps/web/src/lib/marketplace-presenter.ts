import type { DealSeMarketplaceDeal } from "./dealse-api";

export const imageByCategory = (category: string) => {
  const value = category.toLowerCase();
  if (/food|beverage|cafe|coffee|grocery/.test(value)) return "/assets/deal-cafe.png";
  if (/fashion|cloth|textile|apparel/.test(value)) return "/assets/deal-fashion.png";
  if (/book|stationery/.test(value)) return "/assets/deal-bookstore.png";
  if (/home|living|plant|garden/.test(value)) return "/assets/deal-garden.png";
  return "/assets/hero-shopkeeper.png";
};

export function toMarketplaceCard(deal: DealSeMarketplaceDeal) {
  const category = deal.category?.name ?? "Local offers";
  const image = deal.image?.startsWith("/") || deal.image?.startsWith("https://") ? deal.image : imageByCategory(category);
  const distanceMeters = deal.distanceMeters;
  const distance = typeof distanceMeters === "number" && Number.isFinite(distanceMeters)
    ? distanceMeters < 1000 ? `${Math.round(distanceMeters)} m` : `${(distanceMeters / 1000).toFixed(1)} km`
    : "";
  return {
    id: deal.id,
    slug: deal.slug,
    categoryId: deal.categoryId,
    store: deal.store.name,
    title: deal.title,
    category,
    offerType: deal.offerType,
    discountBps: deal.discountBps,
    discountAmountMinor: deal.discountAmountMinor,
    offer: deal.offer,
    originalPriceMinor: deal.originalPriceMinor,
    offerPriceMinor: deal.offerPriceMinor,
    description: deal.summary || deal.description || deal.title,
    area: deal.store.locality || deal.store.city,
    distance,
    valid: new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" }).format(new Date(deal.endsAt)),
    image,
    fallbackImage: imageByCategory(category),
    images: deal.images || [],
    products: deal.products || [],
    alt: deal.image ? deal.imageAlt : `Offer at ${deal.store.name}`,
    tint: /food|beverage/i.test(category) ? "orange" : /fashion/i.test(category) ? "coral" : /book/i.test(category) ? "teal" : "green",
    terms: deal.terms,
    rating: null,
    reviews: null,
    descriptionDetails: deal.description || deal.summary || deal.title,
    startsAt: deal.startsAt,
    endsAt: deal.endsAt,
    status: deal.status,
    storeId: deal.store.id,
    storeSlug: deal.store.slug,
    createdAt: deal.createdAt,
    publishedAt: deal.publishedAt,
    demoCatalog: deal.store.description?.startsWith("DEMO CATALOGUE:") ?? false,
  };
}
