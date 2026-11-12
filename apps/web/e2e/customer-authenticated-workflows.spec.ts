import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

const apiOrigin = process.env.DEALSE_E2E_API_URL || "http://127.0.0.1:3102";
const accounts = [
  { label: "Customer A", email: process.env.DEALSE_E2E_CUSTOMER_EMAIL, password: process.env.DEALSE_E2E_CUSTOMER_PASSWORD },
  { label: "Customer B", email: process.env.DEALSE_E2E_CUSTOMER_B_EMAIL, password: process.env.DEALSE_E2E_CUSTOMER_B_PASSWORD },
] as const;

type Deal = { id: string; title: string; slug: string; store: { id: string; name: string; slug: string } };
type User = { id: string; roles: string[]; profile: { displayName: string | null } };
type NoticePage = { items: Array<{ id: string; isRead: boolean }>; unreadCount: number; total: number };
type Session = { client: SupabaseClient; token: string; user: User };

test.use({ trace: "off", screenshot: "off" });

async function api<T>(path: string, token: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${apiOrigin}/api/v1${path}`, {
    ...init,
    headers: { Accept: "application/json", Authorization: `Bearer ${token}`, ...(init.body ? { "Content-Type": "application/json" } : {}), ...init.headers },
  });
  if (!response.ok) {
    let safeMessage = "";
    try {
      const payload = await response.json() as { message?: unknown };
      if (typeof payload.message === "string") safeMessage = ` (${payload.message.slice(0, 180)})`;
    } catch { /* response body is not needed to report the status */ }
    throw new Error(`DealSe API request failed with HTTP ${response.status} for ${init.method ?? "GET"} ${path}${safeMessage}`);
  }
  return await response.json() as T;
}

async function startSession(account: (typeof accounts)[number]): Promise<Session> {
  test.skip(!account.email || !account.password, `${account.label}: required local E2E account variables are missing; credentials are not displayed.`);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  expect(Boolean(url && key), "Supabase browser configuration is missing from apps/web/.env.test.local.").toBe(true);
  const client = createClient(url!, key!, { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } });
  const { data, error } = await client.auth.signInWithPassword({ email: account.email!, password: account.password! });
  expect(Boolean(data.session), `${account.label}: Supabase sign-in failed (sanitized status ${error?.status ?? "unknown"}).`).toBe(true);
  const token = data.session!.access_token;
  try {
    const user = await api<User>("/auth/me", token);
    expect(user.roles).toContain("customer");
    return { client, token, user };
  } catch (error) {
    await client.auth.signOut({ scope: "local" });
    throw error;
  }
}

async function finishSession(session: Session) {
  await session.client.auth.signOut({ scope: "local" }).catch(() => undefined);
}

async function getDeal(request: APIRequestContext, favs: Array<{ id: string }>, follows: Array<{ id: string }>): Promise<Deal> {
  const response = await request.get(`${apiOrigin}/api/v1/deals?city=Ahmedabad&limit=50`);
  expect(response.ok(), "public deal discovery should use the live DealSe API").toBeTruthy();
  const payload = await response.json() as { items?: Deal[] };
  const excludedDealIds = new Set(favs.map(({ id }) => id));
  const excludedStoreIds = new Set(follows.map(({ id }) => id));
  for (const candidate of payload.items ?? []) {
    if (excludedDealIds.has(candidate.id) || excludedStoreIds.has(candidate.store.id)) continue;
    const detail = await request.get(`${apiOrigin}/api/v1/deals/${encodeURIComponent(candidate.id)}`);
    if (detail.ok()) return await detail.json() as Deal;
  }
  throw new Error("No published deal and store are available that this account is not already using; no existing customer data was changed.");
}

async function login(page: Page, account: (typeof accounts)[number]) {
  await page.goto("/customer/login");
  await page.getByLabel("Email").fill(account.email!);
  await page.getByLabel("Password").fill(account.password!);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/$/);
}

async function toggleSave(page: Page, deal: Deal, saving: boolean) {
  await page.goto(`/deals/${deal.id}/${deal.slug}`);
  if (saving) {
    await page.getByRole("button", { name: /Save offer/ }).click();
    await expect(page.getByRole("status")).toContainText("Saved to your offers");
  } else {
    await page.getByRole("button", { name: /Saved offer/ }).click();
    await expect(page.getByRole("status")).toContainText("Removed from your saved offers");
  }
}

async function toggleFollow(page: Page, deal: Deal, following: boolean) {
  await page.goto(`/stores/${deal.store.id}/${deal.store.slug}`);
  if (following) {
    await page.getByRole("button", { name: "Follow store" }).click();
    await expect(page.getByRole("button", { name: "Following store" })).toHaveAttribute("aria-pressed", "true");
  } else {
    await page.getByRole("button", { name: "Following store" }).click();
    await expect(page.getByRole("button", { name: "Follow store" })).toHaveAttribute("aria-pressed", "false");
  }
}

for (const [index, account] of accounts.entries()) {
  test(`${account.label}: dashboard, profile, save/unsave, follow/unfollow and persistence`, async ({ page, request }) => {
    test.setTimeout(120_000);
    const session = await startSession(account);
    const [initialFavourites, initialFollows] = await Promise.all([
      api<Array<{ id: string }>>("/customers/me/favourites", session.token),
      api<Array<{ id: string }>>("/customers/me/followed-stores", session.token),
    ]);
    const deal = await getDeal(request, initialFavourites, initialFollows);
    const originalName = session.user.profile.displayName;
    const testName = `DealSe E2E Customer ${index + 1}`;
    let savedByTest = false;
    let followedByTest = false;
    let profileChanged = false;
    try {
      await login(page, account);
      await page.goto("/customer/dashboard");
      await expect(page.getByRole("heading", { name: /^Welcome(?:,|$)/ })).toBeVisible();
      await expect(page.getByLabel("Your name")).toBeVisible();
      await expect(page.locator("#saved-deals")).toBeVisible();
      await expect(page.locator("#followed-stores")).toBeVisible();

      await page.getByLabel("Your name").fill(testName);
      await page.getByRole("button", { name: "Save profile" }).click();
      profileChanged = true;
      await expect(page.getByRole("heading", { name: `Welcome, ${testName}` })).toBeVisible();
      await page.reload();
      await expect(page.getByRole("heading", { name: `Welcome, ${testName}` })).toBeVisible();

      await toggleSave(page, deal, true);
      savedByTest = true;
      await page.reload();
      await expect(page.getByRole("button", { name: /Saved offer/ })).toHaveAttribute("aria-pressed", "true");
      await page.goto("/customer/dashboard");
      await expect(page.locator("#saved-deals").getByRole("link", { name: "View offer" })).toBeVisible();
      await toggleSave(page, deal, false);
      savedByTest = false;
      await page.goto("/customer/dashboard");
      await expect(page.locator("#saved-deals")).toContainText("You haven’t saved any offers yet.");

      await toggleFollow(page, deal, true);
      followedByTest = true;
      await page.reload();
      await expect(page.getByRole("button", { name: "Following store" })).toHaveAttribute("aria-pressed", "true");
      await page.goto("/customer/dashboard");
      await expect(page.locator("#followed-stores").getByRole("link", { name: "View store" })).toBeVisible();
      await page.reload();
      await expect(page.locator("#followed-stores")).toContainText(deal.store.name);
      await toggleFollow(page, deal, false);
      followedByTest = false;
      await page.goto("/customer/dashboard");
      await expect(page.locator("#followed-stores")).toContainText("You’re not following any stores yet.");

      await page.getByRole("button", { name: "Log out" }).click();
      await expect(page).toHaveURL(/\/customer\/login/);
      await page.goto("/customer/dashboard");
      await expect(page).toHaveURL(/\/customer\/login/);
      await login(page, account);
      await page.goto("/customer/dashboard");
      await expect(page.getByRole("heading", { name: `Welcome, ${testName}` })).toBeVisible();
      await expect(page.locator("#saved-deals")).toContainText("You haven’t saved any offers yet.");
      await expect(page.locator("#followed-stores")).toContainText("You’re not following any stores yet.");
    } finally {
      if (savedByTest) await api(`/customers/me/favourites/${deal.id}`, session.token, { method: "DELETE" }).catch(() => undefined);
      if (followedByTest) await api(`/customers/me/followed-stores/${deal.store.id}`, session.token, { method: "DELETE" }).catch(() => undefined);
      if (profileChanged && originalName) await api("/auth/me/profile", session.token, { method: "PUT", body: JSON.stringify({ displayName: originalName }) }).catch(() => undefined);
      await finishSession(session);
    }
  });
}

for (const account of accounts) {
  test(`${account.label}: notification inbox, individual/read-all state and logout/login persistence`, async ({ page }) => {
    test.setTimeout(90_000);
    const session = await startSession(account);
    try {
      const before = await api<NoticePage>("/notifications/me?page=1&limit=50", session.token);
      await login(page, account);
      await page.goto("/customer/notifications");
      await expect(page.getByRole("heading", { name: "Notifications" })).toBeVisible();
      await expect(page.locator(".notification-empty, .notification-list")).toBeVisible();
      if (before.unreadCount === 0) {
        console.log(`${account.label}: notification read mutations skipped; inbox has no unread notifications and no synthetic data was created.`);
      } else {
        const unreadBefore = before.items.filter((item) => !item.isRead);
        expect(unreadBefore.length).toBeGreaterThan(0);
        const firstUnreadId = unreadBefore[0]!.id;
        const firstUnread = page.locator(`.notification-item.is-unread`).first();
        await firstUnread.getByRole("button", { name: "Mark read" }).click();
        await expect(page.locator(`.notification-item.is-read`)).toHaveCount(1);
        const afterIndividual = await api<NoticePage>("/notifications/me?page=1&limit=50", session.token);
        expect(afterIndividual.items.find(({ id }) => id === firstUnreadId)?.isRead).toBe(true);

        if (afterIndividual.unreadCount > 0) {
          await page.getByRole("button", { name: "Mark all as read" }).click();
          await expect(page.getByText("0 unread", { exact: true })).toBeVisible();
          const afterAll = await api<NoticePage>("/notifications/me?page=1&limit=50", session.token);
          expect(afterAll.unreadCount).toBe(0);
          expect(afterAll.items.every(({ isRead }) => isRead)).toBe(true);
        } else {
          console.log(`${account.label}: mark-all UI step skipped; individual mark-read consumed the only unread notification.`);
        }
      }

      await page.reload();
      await expect(page.getByText("0 unread", { exact: true })).toBeVisible();
      await page.getByRole("link", { name: "Back to profile" }).click();
      await page.getByRole("button", { name: "Log out" }).click();
      await expect(page).toHaveURL(/\/customer\/login/);
      await login(page, account);
      await page.goto("/customer/notifications");
      await expect(page.getByText("0 unread", { exact: true })).toBeVisible();
    } finally {
      await finishSession(session);
    }
  });
}

test("Customer A and Customer B: favourites and follows stay isolated in both directions", async ({ page, request }) => {
  test.setTimeout(120_000);
  const a = await startSession(accounts[0]!);
  const b = await startSession(accounts[1]!);
  const [aFavourites, aFollows, bFavourites, bFollows] = await Promise.all([
    api<Array<{ id: string }>>("/customers/me/favourites", a.token),
    api<Array<{ id: string }>>("/customers/me/followed-stores", a.token),
    api<Array<{ id: string }>>("/customers/me/favourites", b.token),
    api<Array<{ id: string }>>("/customers/me/followed-stores", b.token),
  ]);
  if (a.user.id === b.user.id) {
    await finishSession(a);
    await finishSession(b);
    test.skip(true, "Customer A and Customer B resolve to the same DealSe user ID; distinct accounts are required to verify cross-account isolation.");
  }
  const deal = await getDeal(request, [...aFavourites, ...bFavourites], [...aFollows, ...bFollows]);
  let aCreated = false;
  let bCreated = false;
  try {
    expect(bFavourites.some(({ id }) => id === deal.id)).toBe(false);
    expect(bFollows.some(({ id }) => id === deal.store.id)).toBe(false);
    await login(page, accounts[0]!);
    await toggleSave(page, deal, true);
    aCreated = true;
    await toggleFollow(page, deal, true);
    await expect.poll(async () => (await api<Array<{ id: string }>>("/customers/me/favourites", a.token)).some(({ id }) => id === deal.id)).toBe(true);
    await expect.poll(async () => (await api<Array<{ id: string }>>("/customers/me/followed-stores", a.token)).some(({ id }) => id === deal.store.id)).toBe(true);
    expect((await api<Array<{ id: string }>>("/customers/me/favourites", b.token)).some(({ id }) => id === deal.id)).toBe(false);
    expect((await api<Array<{ id: string }>>("/customers/me/followed-stores", b.token)).some(({ id }) => id === deal.store.id)).toBe(false);

    await page.goto("/customer/dashboard");
    await page.getByRole("button", { name: "Log out" }).click();
    await login(page, accounts[1]!);
    await toggleSave(page, deal, true);
    bCreated = true;
    await toggleFollow(page, deal, true);
    expect((await api<Array<{ id: string }>>("/customers/me/favourites", a.token)).some(({ id }) => id === deal.id)).toBe(true);
    expect((await api<Array<{ id: string }>>("/customers/me/followed-stores", a.token)).some(({ id }) => id === deal.store.id)).toBe(true);
    expect((await api<Array<{ id: string }>>("/customers/me/favourites", b.token)).some(({ id }) => id === deal.id)).toBe(true);
    expect((await api<Array<{ id: string }>>("/customers/me/followed-stores", b.token)).some(({ id }) => id === deal.store.id)).toBe(true);
  } finally {
    if (aCreated) {
      await api(`/customers/me/favourites/${deal.id}`, a.token, { method: "DELETE" }).catch(() => undefined);
      await api(`/customers/me/followed-stores/${deal.store.id}`, a.token, { method: "DELETE" }).catch(() => undefined);
    }
    if (bCreated) {
      await api(`/customers/me/favourites/${deal.id}`, b.token, { method: "DELETE" }).catch(() => undefined);
      await api(`/customers/me/followed-stores/${deal.store.id}`, b.token, { method: "DELETE" }).catch(() => undefined);
    }
    await finishSession(a);
    await finishSession(b);
  }
});
