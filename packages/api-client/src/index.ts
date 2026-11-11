export type RetailerStatus = "pending" | "active" | "suspended" | "closed";
export type RetailerRole = "owner" | "manager" | "staff";
export type StoreStatus =
  | "draft"
  | "pending_verification"
  | "active"
  | "paused"
  | "closed";

export interface CurrentUser {
  id: string;
  email: string | null;
  emailVerified: boolean;
}

export interface Retailer {
  id: string;
  displayName: string;
  legalName: string | null;
  status: RetailerStatus;
  role?: RetailerRole;
  createdAt: string;
}

export interface CreateRetailerInput {
  displayName: string;
  legalName?: string | null;
}

export interface Store {
  id: string;
  retailerId: string;
  categoryId: string | null;
  slug: string;
  name: string;
  description?: string | null;
  city: string;
  region: string;
  countryCode: string;
  timezone: string;
  status: StoreStatus;
  latitude: number | null;
  longitude: number | null;
  createdAt: string;
}

export interface Category {
  id: string;
  slug: string;
  name: string;
}

export interface Product {
  id: string;
  retailerId: string;
  storeId: string | null;
  categoryId: string;
  slug: string;
  name: string;
  description: string | null;
  brand: string | null;
  status: "draft" | "active" | "archived";
}

export type DealStatus = "draft" | "published" | "paused" | "ended";
export type DealOfferType = "percentage" | "fixed_amount" | "buy_x_get_y" | "other";

export interface Deal {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  description: string | null;
  terms: string;
  categoryId: string | null;
  category: Category | null;
  offerType: DealOfferType;
  discountBps: number | null;
  discountAmountMinor: string | null;
  currency: string | null;
  originalPriceMinor: string | null;
  offerPriceMinor: string | null;
  offer: string;
  startsAt: string;
  endsAt: string;
  status: DealStatus;
  image: string | null;
  imageAlt: string;
  store: Pick<Store, "id" | "name" | "slug" | "city" | "region">;
}

export interface DealInput {
  title: string;
  summary?: string;
  details?: string;
  terms: string;
  storeId: string;
  categoryId: string;
  offerType: "PERCENTAGE" | "FIXED_AMOUNT" | "BUY_X_GET_Y" | "OTHER";
  discountBps?: number;
  discountAmountMinor?: number;
  currency?: string;
  originalPriceMinor?: number;
  offerPriceMinor?: number;
  startsAt: string;
  endsAt: string;
  imageReference?: string;
  productIds?: string[];
}

export interface CreateStoreInput {
  slug: string;
  name: string;
  description?: string | null;
  categoryId?: string | null;
  phone?: string | null;
  email?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  locality?: string | null;
  city: string;
  region: string;
  postalCode?: string | null;
  countryCode?: string;
  timezone?: string;
  latitude?: number | null;
  longitude?: number | null;
}

export interface ApiErrorBody {
  statusCode?: number;
  message?: string | string[];
  error?: string;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: ApiErrorBody | undefined,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export interface DealseApiClientOptions {
  /** API origin, for example http://localhost:3001. */
  baseUrl: string;
  /** Return a short-lived access token from platform-appropriate secure storage. */
  getAccessToken?: () => Promise<string | null>;
  fetch?: typeof fetch;
}

export function createDealseApiClient(options: DealseApiClientOptions) {
  const request = options.fetch ?? globalThis.fetch;
  const apiRoot = `${options.baseUrl.replace(/\/$/, "")}/api/v1`;

  async function send<T>(path: string, init: RequestInit = {}): Promise<T> {
    const token = await options.getAccessToken?.();
    const headers = new Headers(init.headers);
    headers.set("Accept", "application/json");
    if (init.body !== undefined) headers.set("Content-Type", "application/json");
    if (token) headers.set("Authorization", `Bearer ${token}`);

    const response = await request(`${apiRoot}${path}`, {
      ...init,
      headers,
    });

    if (!response.ok) {
      let body: ApiErrorBody | undefined;
      try {
        body = (await response.json()) as ApiErrorBody;
      } catch {
        body = undefined;
      }
      const detail = Array.isArray(body?.message)
        ? body.message.join(", ")
        : body?.message;
      throw new ApiError(
        detail ?? response.statusText ?? "The API request failed.",
        response.status,
        body,
      );
    }

    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  }

  return {
    health: () => send<{ status: "ok" }>("/health"),
    me: () => send<CurrentUser>("/auth/me"),
    createRetailer: (input: CreateRetailerInput) =>
      send<Retailer>("/retailers", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    myRetailers: () => send<Retailer[]>("/retailers/mine"),
    createStore: (retailerId: string, input: CreateStoreInput) =>
      send<Store>(`/retailers/${encodeURIComponent(retailerId)}/stores`, {
        method: "POST",
        body: JSON.stringify(input),
      }),
    stores: (retailerId: string) =>
      send<Store[]>(`/retailers/${encodeURIComponent(retailerId)}/stores`),
    updateStore: (retailerId: string, storeId: string, input: Partial<CreateStoreInput>) =>
      send<Store>(`/retailers/${encodeURIComponent(retailerId)}/stores/${encodeURIComponent(storeId)}`, {
        method: "PATCH", body: JSON.stringify(input),
      }),
    categories: () => send<Category[]>("/categories"),
    products: (retailerId: string) => send<Product[]>(`/retailers/${encodeURIComponent(retailerId)}/products`),
    product: (retailerId: string, productId: string) => send<Product>(`/retailers/${encodeURIComponent(retailerId)}/products/${encodeURIComponent(productId)}`),
    createProduct: (retailerId: string, input: { slug: string; name: string; categoryId: string; storeId?: string; brand?: string; description?: string }) =>
      send<Product>(`/retailers/${encodeURIComponent(retailerId)}/products`, { method: "POST", body: JSON.stringify(input) }),
    updateProduct: (retailerId: string, productId: string, input: Partial<{ slug: string; name: string; categoryId: string; storeId: string | null; brand: string | null; description: string | null }>) =>
      send<Product>(`/retailers/${encodeURIComponent(retailerId)}/products/${encodeURIComponent(productId)}`, { method: "PATCH", body: JSON.stringify(input) }),
    archiveProduct: (retailerId: string, productId: string) =>
      send<{ id: string; status: "archived" }>(`/retailers/${encodeURIComponent(retailerId)}/products/${encodeURIComponent(productId)}`, { method: "DELETE" }),
    deals: (retailerId: string) => send<Deal[]>(`/retailers/${encodeURIComponent(retailerId)}/deals`),
    createDeal: (retailerId: string, input: DealInput) => send<Deal>(`/retailers/${encodeURIComponent(retailerId)}/deals`, { method: "POST", body: JSON.stringify(input) }),
    updateDeal: (retailerId: string, dealId: string, input: Partial<DealInput>) => send<Deal>(`/retailers/${encodeURIComponent(retailerId)}/deals/${encodeURIComponent(dealId)}`, { method: "PATCH", body: JSON.stringify(input) }),
    previewDeal: (retailerId: string, dealId: string) => send<Deal>(`/retailers/${encodeURIComponent(retailerId)}/deals/${encodeURIComponent(dealId)}/preview`),
    publishDeal: (retailerId: string, dealId: string) => send<Deal>(`/retailers/${encodeURIComponent(retailerId)}/deals/${encodeURIComponent(dealId)}/publish`, { method: "POST" }),
    pauseDeal: (retailerId: string, dealId: string) => send<{ id: string; status: "paused" }>(`/retailers/${encodeURIComponent(retailerId)}/deals/${encodeURIComponent(dealId)}/pause`, { method: "POST" }),
    discoverDeals: (query: { page?: number; limit?: number; q?: string; category?: string; city?: string } = {}) => {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(query)) if (value !== undefined && value !== "") params.set(key, String(value));
      return send<{ items: Deal[]; page: number; limit: number; total: number; totalPages: number }>(`/deals${params.size ? `?${params.toString()}` : ""}`);
    },
    deal: (dealId: string) => send<Deal>(`/deals/${encodeURIComponent(dealId)}`),
    favouriteDeals: () => send<Array<Deal & { savedAt: string }>>("/customers/me/favourites"),
    saveDeal: (dealId: string) => send<{ dealId: string; saved: boolean }>(`/customers/me/favourites/${encodeURIComponent(dealId)}`, { method: "POST" }),
    unsaveDeal: (dealId: string) => send<{ dealId: string; saved: boolean }>(`/customers/me/favourites/${encodeURIComponent(dealId)}`, { method: "DELETE" }),
  };
}
