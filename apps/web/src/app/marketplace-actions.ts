"use server";

import { revalidatePath } from "next/cache";
import { callDealseApi, type DealSeMarketplaceDeal } from "../lib/dealse-api";
import { createSupabaseServerClient } from "../lib/supabase/server";
import { toMarketplaceCard } from "../lib/marketplace-presenter";

export async function searchMarketplaceDeals(query: string, category: string, city: string, latitude?: number, longitude?: number, sort: "newest" | "discount" | "nearest" = "newest") {
  const params = new URLSearchParams({ limit: "100", page: "1" });
  params.set("sort", sort);
  if (query.trim()) params.set("q", query.trim());
  if (category && category !== "All") params.set("category", category.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""));
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
  const response = await callDealseApi<{ items: DealSeMarketplaceDeal[] }>(`/deals?${params.toString()}`);
  return response.items.map(toMarketplaceCard);
}

async function accessToken() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session?.access_token) throw new Error("Sign in to continue.");
  return data.session.access_token;
}

export async function toggleFavourite(dealId: string, saved: boolean) {
  const token = await accessToken();
  const result = await callDealseApi<{ saved: boolean }>(`/customers/me/favourites/${dealId}`, token, { method: saved ? "DELETE" : "POST" });
  revalidatePath("/");
  revalidatePath("/customer/dashboard");
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
