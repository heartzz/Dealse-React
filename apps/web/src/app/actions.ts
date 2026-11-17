"use server";

import { redirect } from "next/navigation";
import { callDealseApi, DealseApiError, type DealSeUser } from "../lib/dealse-api";
import { createSupabaseServerClient } from "../lib/supabase/server";

type Flow = "customer" | "retailer";

function value(formData: FormData, name: string): string {
  return String(formData.get(name) ?? "").trim();
}

function validCredentials(email: string, password: string): boolean {
  return email.length > 3 && email.includes("@") && password.length >= 8;
}

function errorCode(error: unknown): string {
  return error instanceof Error && error.message.startsWith("Supabase is not configured")
    ? "config"
    : "setup";
}

function logAuthFailure(flow: Flow | "admin", stage: string, error: unknown): void {
  if (error instanceof DealseApiError) {
    console.error("[DealSe Auth] flow failed", {
      flow,
      stage,
      apiStatus: error.status || null,
      apiCategory: error.category,
    });
    return;
  }
  const providerCode = error && typeof error === "object" && "code" in error && typeof error.code === "string" && /^[a-z0-9_-]{1,80}$/i.test(error.code)
    ? error.code
    : null;
  const providerStatus = error && typeof error === "object" && "status" in error && typeof error.status === "number" && Number.isInteger(error.status)
    ? error.status
    : null;
  console.error("[DealSe Auth] flow failed", { flow, stage, providerCode, providerStatus });
}

async function completeCustomerProfile(
  accessToken: string,
  displayName: string,
  setStage?: (stage: string) => void,
): Promise<void> {
  setStage?.("api_auth_me");
  await callDealseApi("/auth/me", accessToken);
  setStage?.("api_profile_update");
  await callDealseApi("/auth/me/profile", accessToken, {
    method: "PUT",
    body: { displayName },
  });
}

async function register(flow: Flow, formData: FormData): Promise<string | null> {
  const email = value(formData, "email").toLowerCase();
  const password = value(formData, "password");
  const displayName = value(formData, "displayName");
  const businessName = value(formData, "businessName");
  if (!validCredentials(email, password) || !displayName || (flow === "retailer" && !businessName)) {
    return "invalid";
  }

  let stage = "supabase_signup";
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) {
      logAuthFailure(flow, stage, error);
      console.warn("[DealSe Auth] signup completed without a session", { flow, stage, sessionReturned: false, providerRejected: true });
      return "auth";
    }
    if (!data.session) {
      console.info("[DealSe Auth] signup requires email confirmation", { flow, stage, sessionReturned: false, providerAccepted: true });
      return "confirm";
    }
    console.info("[DealSe Auth] signup returned a session", { flow, stage, sessionReturned: true });

    await completeCustomerProfile(data.session.access_token, displayName, (nextStage) => { stage = nextStage; });
    if (flow === "retailer") {
      stage = "api_retailer_registration";
      await callDealseApi("/retailers", data.session.access_token, {
        method: "POST",
        body: { displayName: businessName, legalName: value(formData, "legalName") || null },
      });
      console.info("[DealSe Auth] retailer registration accepted", { flow, stage, apiStatus: 201 });
    }
    return null;
  } catch (error) {
    logAuthFailure(flow, stage, error);
    return errorCode(error);
  }
}

async function login(flow: Flow, formData: FormData): Promise<string | null> {
  const email = value(formData, "email").toLowerCase();
  const password = value(formData, "password");
  if (!validCredentials(email, password)) return "invalid";

  let stage = "supabase_password_sign_in";
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      logAuthFailure(flow, stage, error);
      console.warn("[DealSe Auth] password sign-in rejected", { flow, stage, sessionReturned: false });
      return "auth";
    }
    if (!data.session) {
      console.warn("[DealSe Auth] password sign-in returned no session", { flow, stage, sessionReturned: false });
      return "auth";
    }
    console.info("[DealSe Auth] password sign-in returned a session", { flow, stage, sessionReturned: true });

    stage = "api_auth_me";
    const user = await callDealseApi<DealSeUser>("/auth/me", data.session.access_token);
    console.info("[DealSe Auth] API accepted the access token and resolved identity", {
      flow,
      stage,
      apiStatus: 200,
      accessTokenAccepted: true,
      identityMapped: true,
      roleCheck: flow === "retailer" ? user.roles.includes("retailer") : user.roles.includes("customer"),
    });
    if (flow === "retailer" && !user.roles.includes("retailer")) return "retailer_setup";
    if (flow === "customer" && !user.roles.includes("customer")) return "customer_profile";
    return null;
  } catch (error) {
    logAuthFailure(flow, stage, error);
    return errorCode(error);
  }
}

export async function registerCustomer(formData: FormData): Promise<void> {
  const error = await register("customer", formData);
  if (error === "setup") redirect("/customer/setup?error=setup");
  if (error) redirect(`/customer/register?error=${error}`);
  redirect("/");
}

export async function registerRetailer(formData: FormData): Promise<void> {
  const error = await register("retailer", formData);
  if (error === "setup") redirect("/retailer/setup?error=setup");
  if (error) redirect(`/retailer/register?error=${error}`);
  redirect("/retailer/dashboard");
}

export async function saveCustomerProfile(formData: FormData): Promise<void> {
  const displayName = value(formData, "displayName");
  if (!displayName) redirect("/customer/setup?error=invalid");

  let accessToken: string | undefined;
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { session } } = await supabase.auth.getSession();
    accessToken = session?.access_token;
  } catch {
    redirect("/customer/setup?error=setup");
  }
  if (!accessToken) redirect("/customer/login");

  try {
    await completeCustomerProfile(accessToken, displayName);
  } catch {
    redirect("/customer/setup?error=setup");
  }
  redirect("/customer/dashboard");
}

export async function loginCustomer(formData: FormData): Promise<void> {
  const error = await login("customer", formData);
  if (error) redirect(`/customer/login?error=${error}`);
  redirect("/");
}

export async function loginRetailer(formData: FormData): Promise<void> {
  const error = await login("retailer", formData);
  if (error === "retailer_setup") redirect("/retailer/setup");
  if (error) redirect(`/retailer/login?error=${error}`);
  redirect("/retailer/dashboard");
}

export async function loginAdmin(formData: FormData): Promise<void> {
  const email = value(formData, "email").toLowerCase();
  const password = value(formData, "password");
  if (!validCredentials(email, password)) redirect("/admin/login?error=invalid");

  let stage = "supabase_password_sign_in";
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      logAuthFailure("admin", stage, error);
      console.warn("[DealSe Admin Auth] password sign-in rejected", { stage, sessionReturned: false });
      redirect("/admin/login?error=auth");
    }
    if (!data.session) {
      console.warn("[DealSe Admin Auth] password sign-in returned no session", {
        stage: "supabase_password_sign_in",
        sessionReturned: false,
      });
      redirect("/admin/login?error=auth");
    }
    console.info("[DealSe Admin Auth] password sign-in returned a session", {
      stage: "supabase_password_sign_in",
      sessionReturned: true,
    });
    stage = "api_auth_me";
    const user = await callDealseApi<DealSeUser>("/auth/me", data.session.access_token);
    console.info("[DealSe Admin Auth] API accepted the access token and resolved identity", {
      stage,
      apiStatus: 200,
      accessTokenAccepted: true,
      identityMapped: true,
      adminRole: user.roles.includes("admin"),
    });
    if (!user.roles.includes("admin")) {
      console.warn("[DealSe Admin Auth] API identity lacks the admin role", {
        stage: "api_identity_role_check",
        adminRole: false,
      });
      await supabase.auth.signOut({ scope: "local" });
      redirect("/admin/login?error=unauthorized");
    }
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) throw error;
    logAuthFailure("admin", stage, error);
    redirect(`/admin/login?error=${errorCode(error)}`);
  }
  redirect("/admin");
}

export async function createRetailerProfile(formData: FormData): Promise<void> {
  const displayName = value(formData, "displayName");
  const businessName = value(formData, "businessName");
  const legalName = value(formData, "legalName");
  if (!displayName || !businessName) redirect("/retailer/setup?error=invalid");

  let accessToken: string | undefined;
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { session } } = await supabase.auth.getSession();
    accessToken = session?.access_token;
  } catch {
    redirect("/retailer/setup?error=setup");
  }
  if (!accessToken) redirect("/retailer/login");

  try {
    await completeCustomerProfile(accessToken, displayName);
    await callDealseApi("/retailers", accessToken, {
      method: "POST",
      body: { displayName: businessName, legalName: legalName || null },
    });
  } catch {
    redirect("/retailer/setup?error=setup");
  }
  redirect("/retailer/dashboard");
}

export async function logoutCustomer(): Promise<void> {
  await signOut("/customer/login");
}

export async function logoutRetailer(): Promise<void> {
  await signOut("/retailer/login");
}

export async function logoutAdmin(): Promise<void> {
  await signOut("/admin/login");
}

async function signOut(destination: string): Promise<void> {
  try {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut({ scope: "local" });
  } finally {
    redirect(destination);
  }
}
