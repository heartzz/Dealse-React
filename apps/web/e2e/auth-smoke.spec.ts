import { existsSync } from "node:fs";
import path from "node:path";
import { loadEnvFile } from "node:process";
import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";

const webDirectory = process.cwd();
const webEnvFile = path.join(webDirectory, ".env.local");
if (existsSync(webEnvFile)) loadEnvFile(webEnvFile);

test.use({ trace: "off", screenshot: "off" });

const apiOrigin = process.env.DEALSE_E2E_API_URL || "http://127.0.0.1:3102";
const accounts = [
  { label: "Customer A", emailVariable: "DEALSE_E2E_CUSTOMER_EMAIL", passwordVariable: "DEALSE_E2E_CUSTOMER_PASSWORD", role: "customer", loginPath: "/customer/login", protectedPath: "/customer/dashboard" },
  { label: "Customer B", emailVariable: "DEALSE_E2E_CUSTOMER_B_EMAIL", passwordVariable: "DEALSE_E2E_CUSTOMER_B_PASSWORD", role: "customer", loginPath: "/customer/login", protectedPath: "/customer/dashboard" },
  { label: "Retailer A", emailVariable: "DEALSE_E2E_RETAILER_EMAIL", passwordVariable: "DEALSE_E2E_RETAILER_PASSWORD", role: "retailer", loginPath: "/retailer/login", protectedPath: "/retailer/dashboard" },
  { label: "Retailer B", emailVariable: "DEALSE_E2E_RETAILER_B_EMAIL", passwordVariable: "DEALSE_E2E_RETAILER_B_PASSWORD", role: "retailer", loginPath: "/retailer/login", protectedPath: "/retailer/dashboard" },
] as const;

type ApiUser = { roles: string[]; emailVerified: boolean };
type ApiRetailer = { id: string; status: string };
type ApiStore = { id: string; status: string };

async function getApiJson<T>(url: string, accessToken: string, label: string): Promise<T> {
  const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" } });
  expect(response.status, `${label}: DealSe API returned HTTP ${response.status} for an authenticated read`).toBe(200);
  return await response.json() as T;
}

for (const account of accounts) {
  test(`${account.label}: real sign-in, session persistence, logout and protected-route checks`, async ({ page }) => {
    const email = process.env[account.emailVariable];
    const password = process.env[account.passwordVariable];
    test.skip(!email || !password, `${account.label}: missing configured test-account variables; values are not displayed.`);

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    expect(Boolean(supabaseUrl && publishableKey), `${account.label}: Supabase browser configuration is missing from apps/web/.env.local.`).toBe(true);

    const supabase = createClient(supabaseUrl!, publishableKey!, {
      auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    });
    let report = "";
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email: email!, password: password! });
      expect(Boolean(data.session), `${account.label}: Supabase rejected the configured credentials (sanitized status ${error?.status ?? "unknown"}).`).toBe(true);
      const accessToken = data.session!.access_token;
      const user = await getApiJson<ApiUser>(`${apiOrigin}/api/v1/auth/me`, accessToken, account.label);
      expect(user.roles, `${account.label}: expected the ${account.role} role from /auth/me.`).toContain(account.role);

      if (account.role === "retailer") {
        const retailers = await getApiJson<ApiRetailer[]>(`${apiOrigin}/api/v1/retailers/mine`, accessToken, account.label);
        expect(retailers.length, `${account.label}: authenticated retailer account has no active retailer membership.`).toBeGreaterThan(0);
        const storesByRetailer = await Promise.all(retailers.map(async (retailer) => {
          const stores = await getApiJson<ApiStore[]>(`${apiOrigin}/api/v1/retailers/${encodeURIComponent(retailer.id)}/stores`, accessToken, account.label);
          const publicVisibility = await Promise.all(stores.map(async (store) => {
            const response = await fetch(`${apiOrigin}/api/v1/stores/${encodeURIComponent(store.id)}`);
            return response.status === 200;
          }));
          return { retailer: retailer.status, stores: stores.map((store, index) => `${store.status}(public=${publicVisibility[index] ? "yes" : "no"})`) };
        }));
        report = `roles=${user.roles.join(",")}; emailVerified=${user.emailVerified}; approvals=${storesByRetailer.map(({ retailer, stores }) => `retailer:${retailer},stores:${stores.length ? stores.join("|") : "none"}`).join(";")}`;
      } else {
        report = `roles=${user.roles.join(",")}; emailVerified=${user.emailVerified}`;
      }
      const { error: signOutError } = await supabase.auth.signOut({ scope: "local" });
      expect(!signOutError, `${account.label}: temporary API verification session could not be signed out.`).toBe(true);
    } finally {
      await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
    }

    const expectedLogin = account.loginPath;
    await page.goto(account.protectedPath);
    await expect(page, `${account.label}: unauthenticated protected route should redirect to its login page.`).toHaveURL(new RegExp(`${expectedLogin.replaceAll("/", "\\/")}(?:\\?.*)?$`));

    await page.getByLabel("Email").fill(email!);
    await page.getByLabel("Password").fill(password!);
    await page.getByRole("button", { name: "Sign in" }).click();
    if (account.role === "retailer") {
      await expect(page, `${account.label}: DealSe retailer login did not reach its dashboard.`).toHaveURL(/\/retailer\/dashboard(?:\?.*)?$/);
    } else {
      await expect(page, `${account.label}: DealSe customer login did not reach the marketplace.`).toHaveURL(/\/$/);
    }

    await page.goto(account.protectedPath);
    if (account.role === "customer") {
      await expect(page.getByRole("heading", { name: /^Welcome(?:,|$)/ })).toBeVisible();
    } else {
      await expect(page.locator(".retailer-workspace")).toBeVisible();
    }

    await page.reload();
    if (account.role === "customer") {
      await expect(page.getByRole("heading", { name: /^Welcome(?:,|$)/ })).toBeVisible();
    } else {
      await expect(page.locator(".retailer-workspace")).toBeVisible();
    }

    await page.getByRole("button", { name: "Log out" }).click();
    await expect(page).toHaveURL(new RegExp(`${expectedLogin.replaceAll("/", "\\/")}(?:\\?.*)?$`));
    await page.goto(account.protectedPath);
    await expect(page).toHaveURL(new RegExp(`${expectedLogin.replaceAll("/", "\\/")}(?:\\?.*)?$`));

    console.log(`AUTH_SMOKE ${account.label}: PASS; ${report}; refresh=persisted; logout=invalidated; protected-route=redirected`);
  });
}
