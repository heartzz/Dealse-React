"use server";

import { revalidatePath } from "next/cache";
import { callDealseApi, DealseApiError, type DealSeMarketplaceDeal } from "../lib/dealse-api";
import { createSupabaseServerClient } from "../lib/supabase/server";
import { toMarketplaceCard } from "../lib/marketplace-presenter";
import { marketplaceDiscoveryPath } from "../lib/marketplace-query";

export async function searchMarketplaceDeals(query: string, category: string, city: string, latitude?: number, longitude?: number, sort: "newest" | "discount" | "nearest" = "newest") {
  const response = await callDealseApi<{ items: DealSeMarketplaceDeal[] }>(marketplaceDiscoveryPath(query, category, city, latitude, longitude, sort));
  return response.items.map(toMarketplaceCard);
}

async function accessToken() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session?.access_token) throw new Error("Sign in to continue.");
  return data.session.access_token;
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type CustomerRedemptionClaim = {
  id: string;
  dealId: string;
  dealTitle: string;
  storeId: string;
  storeName: string;
  status: "ISSUED" | "REDEEMED" | "EXPIRED" | "REVOKED";
  issuedAt: string;
  expiresAt: string;
  redeemedAt: string | null;
  credential?: string;
};

export async function claimCustomerOffer(dealId: string) {
  if (!uuidPattern.test(dealId)) throw new Error("This offer could not be found. Refresh the page and try again.");
  const token = await accessToken();
  return callDealseApi<{ claim: CustomerRedemptionClaim; replayed: boolean }>("/customers/me/claims", token, {
    method: "POST",
    body: { dealId },
  });
}

export async function cancelCustomerClaim(claimId: string) {
  if (!uuidPattern.test(claimId)) throw new Error("This claim could not be found. Refresh the page and try again.");
  const token = await accessToken();
  const result = await callDealseApi<{ id: string; status: "REVOKED" }>(`/customers/me/claims/${claimId}`, token, { method: "DELETE" });
  revalidatePath("/customer/dashboard");
  return result;
}

export async function cancelCustomerClaimFromForm(formData: FormData) {
  const claimId = String(formData.get("claimId") || "");
  await cancelCustomerClaim(claimId);
}

export type RetailerRedemptionPreview = {
  status: "available";
  claimId: string;
  expiresAt: string;
  offer: {
    id: string;
    title: string;
    terms: string;
    startsAt: string;
    endsAt: string;
    offerType: "PERCENTAGE" | "FIXED_AMOUNT" | "BUY_X_GET_Y" | "OTHER";
    discountBps: number | null;
    discountAmountMinor: string | null;
    currency: string | null;
    originalPriceMinor: string | null;
    offerPriceMinor: string | null;
  };
  store: { id: string; name: string };
};

export type RetailerRedemptionHistoryItem = {
  id: string;
  dealId: string;
  dealTitle: string;
  redeemedAt: string;
  customerRedemptionNumber: number;
  status: "redeemed";
};

export type RetailerRedemptionHistoryPage = {
  items: RetailerRedemptionHistoryItem[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

export type RetailerRedemptionActionResult<T> =
  | { success: true; data: T }
  | { success: false; status: number; message: string; retryable: boolean };

function redemptionActionError<T>(error: unknown): RetailerRedemptionActionResult<T> {
  if (error instanceof DealseApiError) {
    return { success: false, status: error.status, message: error.message, retryable: error.status === 0 || error.status >= 500 };
  }
  return { success: false, status: 0, message: error instanceof Error ? error.message : "The redemption service could not be reached. Try again.", retryable: true };
}

const redemptionCredentialPattern = /^[A-Za-z0-9_-]{43,128}$/;

function assertRetailerRedemptionScope(retailerId: string, storeId: string) {
  if (!uuidPattern.test(retailerId) || !uuidPattern.test(storeId)) {
    throw new Error("Your selected store could not be verified. Refresh the workspace and try again.");
  }
}

function assertRedemptionCredential(credential: string) {
  if (!redemptionCredentialPattern.test(credential)) {
    throw new Error("This QR does not contain a valid DealSe offer credential.");
  }
}

export async function validateRetailerRedemptionCredential(retailerId: string, storeId: string, credential: string) {
  assertRetailerRedemptionScope(retailerId, storeId);
  assertRedemptionCredential(credential);
  const token = await accessToken();
  try {
    const data = await callDealseApi<RetailerRedemptionPreview>(
      `/retailers/${retailerId}/stores/${storeId}/redemptions/validate`,
      token,
      { method: "POST", body: { credential } },
    );
    return { success: true as const, data };
  } catch (error) {
    return redemptionActionError<RetailerRedemptionPreview>(error);
  }
}

export async function confirmRetailerRedemptionCredential(retailerId: string, storeId: string, credential: string, idempotencyKey: string) {
  assertRetailerRedemptionScope(retailerId, storeId);
  assertRedemptionCredential(credential);
  if (!idempotencyKey || idempotencyKey.length > 128) throw new Error("The confirmation could not be retried safely. Scan the customer QR again.");
  const token = await accessToken();
  try {
    const data = await callDealseApi<RetailerRedemptionHistoryItem>(
      `/retailers/${retailerId}/stores/${storeId}/redemptions/confirm`,
      token,
      { method: "POST", body: { credential }, idempotencyKey },
    );
    revalidatePath("/retailer/dashboard");
    return { success: true as const, data };
  } catch (error) {
    return redemptionActionError<RetailerRedemptionHistoryItem>(error);
  }
}

export async function getRetailerRedemptionHistory(retailerId: string, storeId: string, page = 1, limit = 20) {
  assertRetailerRedemptionScope(retailerId, storeId);
  if (!Number.isInteger(page) || page < 1 || !Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new Error("The redemption history request is invalid.");
  }
  const token = await accessToken();
  return callDealseApi<RetailerRedemptionHistoryPage>(
    `/retailers/${retailerId}/stores/${storeId}/redemptions?page=${page}&limit=${limit}`,
    token,
  );
}

export async function toggleFavourite(dealId: string, saved: boolean) {
  const token = await accessToken();
  const result = await callDealseApi<{ saved: boolean }>(`/customers/me/favourites/${dealId}`, token, { method: saved ? "DELETE" : "POST" });
  revalidatePath("/");
  revalidatePath("/customer/dashboard");
  return result;
}

export async function toggleFollowedStore(storeId: string, following: boolean) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(storeId)) {
    throw new Error("This store could not be found. Please refresh and try again.");
  }
  const token = await accessToken();
  const result = await callDealseApi<{ following: boolean }>(
    `/customers/me/followed-stores/${storeId}`,
    token,
    { method: following ? "DELETE" : "POST" },
  );
  revalidatePath(`/stores/${storeId}`);
  revalidatePath("/customer/dashboard");
  revalidatePath("/customer/notifications");
  return result;
}

export async function reportDeal(dealId: string, reason: string, details: string) {
  const token = await accessToken();
  const result = await callDealseApi(`/deals/${encodeURIComponent(dealId)}/reports`, token, {
    method: "POST",
    body: { reason, details: details.trim() || undefined },
  });
  revalidatePath("/admin");
  return result;
}

export async function createStore(retailerId: string, input: Record<string, unknown>) {
  const token = await accessToken();
  const result = await callDealseApi(`/retailers/${retailerId}/stores`, token, { method: "POST", body: input });
  revalidatePath("/retailer/dashboard");
  return result;
}

export async function updateStore(retailerId: string, storeId: string, input: Record<string, unknown>) {
  const token = await accessToken();
  const result = await callDealseApi(`/retailers/${retailerId}/stores/${storeId}`, token, { method: "PATCH", body: input });
  revalidatePath("/retailer/dashboard");
  return result;
}

export async function createProduct(retailerId: string, input: Record<string, unknown>) {
  const token = await accessToken();
  const result = await callDealseApi(`/retailers/${retailerId}/products`, token, { method: "POST", body: input });
  revalidatePath("/retailer/dashboard");
  return result;
}

export async function updateProduct(retailerId: string, productId: string, input: Record<string, unknown>) {
  const token = await accessToken();
  const result = await callDealseApi(`/retailers/${retailerId}/products/${productId}`, token, { method: "PATCH", body: input });
  revalidatePath("/retailer/dashboard");
  return result;
}

export async function archiveProduct(retailerId: string, productId: string) {
  const token = await accessToken();
  const result = await callDealseApi(`/retailers/${retailerId}/products/${productId}`, token, { method: "DELETE" });
  revalidatePath("/retailer/dashboard");
  return result;
}

export async function createDeal(retailerId: string, input: Record<string, unknown>) {
  const token = await accessToken();
  const result = await callDealseApi<DealSeMarketplaceDeal>(`/retailers/${retailerId}/deals`, token, { method: "POST", body: input });
  revalidatePath("/retailer/dashboard");
  revalidatePath("/");
  return result;
}

export async function updateDeal(retailerId: string, dealId: string, input: Record<string, unknown>) {
  const token = await accessToken();
  const result = await callDealseApi<DealSeMarketplaceDeal>(`/retailers/${retailerId}/deals/${dealId}`, token, { method: "PATCH", body: input });
  revalidatePath("/retailer/dashboard");
  return result;
}

export async function publishDeal(retailerId: string, dealId: string) {
  const token = await accessToken();
  const result = await callDealseApi<DealSeMarketplaceDeal>(`/retailers/${retailerId}/deals/${dealId}/publish`, token, { method: "POST" });
  revalidatePath("/retailer/dashboard");
  revalidatePath("/");
  return result;
}

export async function pauseDeal(retailerId: string, dealId: string) {
  const token = await accessToken();
  const result = await callDealseApi(`/retailers/${retailerId}/deals/${dealId}/pause`, token, { method: "POST" });
  revalidatePath("/retailer/dashboard");
  revalidatePath("/");
  return result;
}

export async function previewDeal(retailerId: string, dealId: string) {
  const token = await accessToken();
  return callDealseApi<DealSeMarketplaceDeal>(`/retailers/${retailerId}/deals/${dealId}/preview`, token);
}
