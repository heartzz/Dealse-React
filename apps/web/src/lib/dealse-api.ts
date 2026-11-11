import "server-only";

export const dealseApiOrigin = () =>
  (process.env.DEALSE_API_URL?.trim() || "http://127.0.0.1:3001").replace(/\/$/, "");

export class DealseApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "DealseApiError";
  }
}

export async function callDealseApi<T>(
  path: string,
  accessToken?: string,
  init: { method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"; body?: unknown } = {},
): Promise<T> {
  const response = await fetch(`${dealseApiOrigin()}/api/v1${path}`, {
    method: init.method ?? "GET",
    cache: "no-store",
    headers: {
      Accept: "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
  });
  if (!response.ok) {
    let message = "The DealSe API request failed. Please try again.";
    try {
      const problem = (await response.json()) as { message?: unknown; error?: unknown };
      if (response.status < 500 && typeof problem.message === "string") message = problem.message;
      else if (response.status < 500 && Array.isArray(problem.message)) {
        const details = problem.message.filter((item): item is string => typeof item === "string");
        if (details.length) message = details.join(" ");
      } else if (response.status === 401) message = "Your session has expired. Sign in again and retry.";
      else if (response.status === 403) message = "Your retailer account does not have permission to do that.";
    } catch {
      if (response.status === 401) message = "Your session has expired. Sign in again and retry.";
      else if (response.status === 403) message = "Your retailer account does not have permission to do that.";
    }
    throw new DealseApiError(message, response.status);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export interface DealSeUser {
  id: string;
  email: string | null;
  emailVerified: boolean;
  roles: ("customer" | "retailer" | "admin")[];
  profile: { displayName: string | null };
}

export interface DealSeRetailer {
  id: string;
  displayName: string;
  legalName: string | null;
  status: string;
  role: "owner" | "manager" | "staff";
  createdAt: string;
}

export interface DealSeStore {
  id: string;
  retailerId: string;
  categoryId: string | null;
  slug: string;
  name: string;
  description: string | null;
  city: string;
  region: string;
  addressLine1?: string | null;
  locality?: string | null;
  timezone: string;
  status: string;
  image?: string | null;
  imageAlt?: string;
  images?: DealSeMediaImage[];
}

export interface DealSeMediaImage {
  id: string;
  url: string;
  altText: string;
  sortOrder: number;
  isPrimary: boolean;
  width?: number | null;
  height?: number | null;
}

export interface DealSeProduct {
  id: string;
  retailerId: string;
  storeId: string | null;
  categoryId: string;
  slug: string;
  name: string;
  description: string | null;
  brand: string | null;
  status: string;
  image?: string | null;
  imageAlt?: string;
  images?: DealSeMediaImage[];
  category?: DealSeCategory;
  store?: { id: string; name: string } | null;
}

export interface DealSeCategory {
  id: string;
  slug: string;
  name: string;
}

export interface DealSeMarketplaceDeal {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  description: string | null;
  terms: string;
  categoryId: string | null;
  category: DealSeCategory | null;
  publishedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
  offerType: string;
  discountBps: number | null;
  discountAmountMinor: string | null;
  currency: string | null;
  originalPriceMinor: string | null;
  offerPriceMinor: string | null;
  offer: string;
  startsAt: string;
  endsAt: string;
  status: string;
  image: string | null;
  imageAlt: string;
  images?: DealSeMediaImage[];
  distanceMeters?: number | null;
  store: { id: string; name: string; slug: string; description: string | null; phone?: string | null; email?: string | null; city: string; region: string; addressLine1?: string | null; addressLine2?: string | null; locality?: string | null };
  products?: Array<{ id: string; name: string; image?: string | null; imageAlt?: string; images?: DealSeMediaImage[] }>;
}

export interface DealSePublicStore {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  phone: string | null;
  email: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  locality: string | null;
  city: string;
  region: string;
  postalCode: string | null;
  countryCode: string;
  openingHours: unknown;
  category: DealSeCategory | null;
  retailerName: string;
  image: string | null;
  imageAlt: string;
  images?: DealSeMediaImage[];
  offers: DealSeMarketplaceDeal[];
}

export interface DealSeNotification {
  id: string;
  kind: string;
  title: string;
  body: string;
  href: string | null;
  storeId: string | null;
  dealId: string | null;
  createdAt: string;
  readAt: string | null;
  isRead: boolean;
}

export interface DealSeNotificationPage {
  items: DealSeNotification[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  unreadCount: number;
}
