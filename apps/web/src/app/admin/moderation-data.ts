import "server-only";
import { callDealseApi } from "../../lib/dealse-api";

export type PageParams = { page?: string; q?: string; status?: string; role?: string; success?: string; error?: string };

export async function loadAdminPage<T>(accessToken: string, endpoint: string, params: PageParams) {
  const query = new URLSearchParams({ page: params.page || "1", limit: "20", ...(!params.status || params.status === "all" ? { all: "true" } : { status: params.status }), ...(params.role && params.role !== "all" ? { role: params.role } : {}), ...(params.q ? { q: params.q } : {}) });
  return callDealseApi<{ items: T[]; page: number; limit: number; total: number; totalPages: number }>(`${endpoint}?${query}`, accessToken);
}

export async function loadAdminRecord<T>(accessToken: string, endpoint: string, id: string) {
  return callDealseApi<T>(`${endpoint}/${encodeURIComponent(id)}`, accessToken);
}

export function safeMessage(error: unknown) {
  return error instanceof Error ? error.message : "The requested admin data could not be loaded.";
}
