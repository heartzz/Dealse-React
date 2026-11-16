export function marketplaceDiscoveryPath(
  query: string,
  category: string,
  city: string,
  latitude?: number,
  longitude?: number,
  sort: "newest" | "discount" | "nearest" = "newest",
) {
  const params = new URLSearchParams({ limit: "100", page: "1", sort });
  if (query.trim()) params.set("q", query.trim());
  if (category && category !== "All") {
    params.set("category", category.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""));
  }
  if (latitude !== undefined || longitude !== undefined) {
    if (latitude === undefined || longitude === undefined || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      throw new Error("Your current location could not be used. Please try again.");
    }
    params.set("latitude", String(latitude));
    params.set("longitude", String(longitude));
    params.set("radiusKm", "10");
  } else if (city) {
    params.set("city", city);
  }
  return `/deals?${params.toString()}`;
}
