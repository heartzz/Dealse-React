"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { callDealseApi, type DealSeUser } from "../../lib/dealse-api";
import { requireWebSession } from "../../lib/auth-session";

function field(formData: FormData, name: string): string {
  return String(formData.get(name) ?? "").trim();
}

async function adminToken(): Promise<string> {
  const { accessToken } = await requireWebSession("/customer/login");
  const user = await callDealseApi<DealSeUser>("/auth/me", accessToken);
  if (!user.roles.includes("admin")) redirect("/admin?error=admin_required");
  return accessToken;
}

async function mutate(
  success: string,
  operation: (accessToken: string) => Promise<unknown>,
): Promise<void> {
  const accessToken = await adminToken();
  try {
    await operation(accessToken);
  } catch (error) {
    const message = error instanceof Error ? error.message : "The change could not be saved.";
    redirect(`/admin?error=${encodeURIComponent(message)}`);
  }
  revalidatePath("/admin");
  revalidatePath("/");
  redirect(`/admin?success=${encodeURIComponent(success)}`);
}

function required(formData: FormData, name: string): string {
  const value = field(formData, name);
  if (!value) redirect("/admin?error=Complete%20the%20required%20fields%20and%20try%20again.");
  return value;
}

export async function approveRetailer(formData: FormData): Promise<void> {
  const id = required(formData, "retailerId");
  return mutate("Retailer approved.", (token) => callDealseApi(`/admin/retailers/${encodeURIComponent(id)}/approve`, token, { method: "POST" }));
}

export async function suspendRetailer(formData: FormData): Promise<void> {
  const id = required(formData, "retailerId");
  const reason = required(formData, "reason");
  return mutate("Retailer suspended.", (token) => callDealseApi(`/admin/retailers/${encodeURIComponent(id)}/suspend`, token, { method: "POST", body: { reason } }));
}

export async function reactivateRetailer(formData: FormData): Promise<void> {
  const id = required(formData, "retailerId");
  return mutate("Retailer reactivated.", (token) => callDealseApi(`/admin/retailers/${encodeURIComponent(id)}/reactivate`, token, { method: "POST" }));
}

export async function verifyStore(formData: FormData): Promise<void> {
  const id = required(formData, "storeId");
  return mutate("Store verified and activated.", (token) => callDealseApi(`/admin/stores/${encodeURIComponent(id)}/verify`, token, { method: "POST" }));
}

export async function pauseStore(formData: FormData): Promise<void> {
  const id = required(formData, "storeId");
  const reason = required(formData, "reason");
  return mutate("Store paused.", (token) => callDealseApi(`/admin/stores/${encodeURIComponent(id)}/pause`, token, { method: "POST", body: { reason } }));
}

export async function resumeStore(formData: FormData): Promise<void> {
  const id = required(formData, "storeId");
  return mutate("Store resumed.", (token) => callDealseApi(`/admin/stores/${encodeURIComponent(id)}/resume`, token, { method: "POST" }));
}

export async function pauseDeal(formData: FormData): Promise<void> {
  const id = required(formData, "dealId");
  const reason = required(formData, "reason");
  return mutate("Offer placed on moderation hold.", (token) => callDealseApi(`/admin/deals/${encodeURIComponent(id)}/pause`, token, { method: "POST", body: { reason } }));
}

export async function releaseDeal(formData: FormData): Promise<void> {
  const id = required(formData, "dealId");
  return mutate("Moderation hold released. Retailer can review and republish the draft.", (token) => callDealseApi(`/admin/deals/${encodeURIComponent(id)}/release`, token, { method: "POST" }));
}

export async function reviewReport(formData: FormData): Promise<void> {
  const id = required(formData, "reportId");
  const status = field(formData, "status");
  const resolution = required(formData, "resolution");
  if (status !== "resolved" && status !== "dismissed") redirect("/admin?error=Choose%20a%20valid%20report%20outcome.");
  return mutate("Report review saved.", (token) => callDealseApi(`/admin/reports/${encodeURIComponent(id)}`, token, { method: "PATCH", body: { status, resolution } }));
}

export async function createCategory(formData: FormData): Promise<void> {
  const slug = required(formData, "slug");
  const name = required(formData, "name");
  return mutate("Category created.", (token) => callDealseApi("/admin/categories", token, { method: "POST", body: { slug, name } }));
}

export async function updateCategory(formData: FormData): Promise<void> {
  const id = required(formData, "categoryId");
  const name = required(formData, "name");
  const status = field(formData, "isActive");
  if (status !== "true" && status !== "false") redirect("/admin?error=Choose%20whether%20the%20category%20is%20active.");
  return mutate("Category updated.", (token) => callDealseApi(`/admin/categories/${encodeURIComponent(id)}`, token, { method: "PATCH", body: { name, isActive: status === "true" } }));
}
