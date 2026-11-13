import "server-only";

export const dealseApiOrigin = () =>
  (process.env.DEALSE_API_URL?.trim() || "http://127.0.0.1:3001")
    .replace(/\/+$/, "")
    .replace(/\/api\/v1$/i, "");

type ApiErrorCategory = "network_error" | "unauthorized" | "forbidden" | "not_found" | "request_rejected" | "server_error";

function categoryForStatus(status: number): ApiErrorCategory {
  if (status === 401) return "unauthorized";
  if (status === 403) return "forbidden";
  if (status === 404) return "not_found";
  if (status >= 500) return "server_error";
  return "request_rejected";
}

function safeRequestId(value: string | null, fallback: string): string {
  return value && /^[0-9a-f-]{36}$/i.test(value) ? value : fallback;
}

function stripControlCharacters(value: string): string {
  return [...value].filter((character) => {
    const code = character.charCodeAt(0);
    return code === 9 || code === 10 || code === 13 || (code >= 32 && code !== 127);
  }).join("");
}

function safeClientError(responseBody: unknown, fallback: string): string {
  if (!responseBody || typeof responseBody !== "object" || !("message" in responseBody)) return fallback;
  const raw = responseBody.message;
  const message = typeof raw === "string" ? raw : Array.isArray(raw) ? raw.filter((item): item is string => typeof item === "string").join(" ") : "";
  return stripControlCharacters(message).replace(/\s+/g, " ").trim().slice(0, 300) || fallback;
}

export class DealseApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly endpoint: string,
    readonly method: string,
    readonly requestId: string,
    readonly category: ApiErrorCategory,
  ) {
    super(message);
    this.name = "DealseApiError";
  }
}

export async function callDealseApi<T>(
  path: string,
  accessToken?: string,
  init: { method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"; body?: unknown; idempotencyKey?: string } = {},
): Promise<T> {
  const method = init.method ?? "GET";
  const endpoint = path.split("?", 1)[0] || "/";
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const requestId = crypto.randomUUID();
  let response: Response;
  try {
    response = await fetch(`${dealseApiOrigin()}/api/v1${normalizedPath}`, {
      method,
      cache: "no-store",
      headers: {
        Accept: "application/json",
        "X-Request-ID": requestId,
        ...(init.idempotencyKey ? { "Idempotency-Key": init.idempotencyKey } : {}),
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
    });
  } catch {
    console.error("[DealSe API] request failed", {
      endpoint,
      method,
      status: null,
      requestId,
      category: "network_error",
    });
    throw new DealseApiError(
      `The DealSe API could not be reached. Request ID: ${requestId}.`,
      0,
      endpoint,
      method,
      requestId,
      "network_error",
    );
  }
  if (!response.ok) {
    const responseRequestId = safeRequestId(response.headers.get("x-request-id"), requestId);
    const category = categoryForStatus(response.status);
    console.error("[DealSe API] request failed", {
      endpoint,
      method,
      status: response.status,
      requestId: responseRequestId,
      category,
    });
    const fallback = response.status === 401 ? "The API rejected the current session. Sign in again and retry."
      : response.status === 403 ? "Your administrator account does not have the required permission."
      : response.status === 404 ? "The requested API endpoint or record was not found."
      : response.status >= 500 ? "The DealSe API returned an internal error."
      : "The DealSe API rejected the request.";
    let message = fallback;
    if (response.status >= 400 && response.status < 500 && ![401, 403, 404].includes(response.status)) {
      try { message = safeClientError(await response.json(), fallback); } catch { /* Keep the safe status-based message. */ }
    }
    message = `${message} (HTTP ${response.status}; request ID: ${responseRequestId}).`;
    throw new DealseApiError(message, response.status, endpoint, method, responseRequestId, category);
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
