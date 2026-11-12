import { expect, test, type APIRequestContext, type Page, type Request } from "@playwright/test";

const apiOrigin = process.env.DEALSE_E2E_API_URL || "http://127.0.0.1:3102";
const webOrigin = process.env.DEALSE_E2E_BASE_URL || "http://127.0.0.1:3100";
const customerEmail = process.env.DEALSE_E2E_CUSTOMER_EMAIL;
const customerPassword = process.env.DEALSE_E2E_CUSTOMER_PASSWORD;

type PublicDeal = {
  id: string;
  title: string;
  slug: string;
  category: { id: string; name: string; slug: string } | null;
  store: { id: string; name: string; slug: string };
};

async function getPublishedDeal(request: APIRequestContext): Promise<PublicDeal> {
  const response = await request.get(`${apiOrigin}/api/v1/deals?city=Ahmedabad&limit=20`);
  expect(response.ok(), "customer pages should use the real NestJS discovery API").toBeTruthy();
  const payload = (await response.json()) as { items?: PublicDeal[] };
  expect(payload.items?.length, "seed the local demo catalogue before customer browser tests").toBeGreaterThan(0);
  for (const candidate of payload.items!) {
    const detail = await request.get(`${apiOrigin}/api/v1/deals/${encodeURIComponent(candidate.id)}`);
    if (detail.ok()) return (await detail.json()) as PublicDeal;
  }
  throw new Error("The discovery API returned no offer that could be loaded from its canonical detail endpoint.");
}

async function expectNoHorizontalOverflow(page: Page, width: number) {
  await page.setViewportSize({ width, height: 900 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), {
    message: `customer page should not overflow at ${width}px`,
  }).toBeTruthy();
}

test("customer discovery uses live filters, explicit location, cards and canonical details", async ({ page, request, context }, testInfo) => {
  test.setTimeout(180_000);
  const deal = await getPublishedDeal(request);
  const consoleErrors: string[] = [];
  const failedRequests: string[] = [];
  const pendingActions = new Set<Request>();
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(`${message.text()} at ${message.location().url || "unknown source"}`); });
  page.on("pageerror", (error) => consoleErrors.push(error.message));
  page.on("request", (requestEvent) => { if (requestEvent.method() === "POST" && requestEvent.url().startsWith(`${webOrigin}/`)) pendingActions.add(requestEvent); });
  page.on("requestfinished", (requestEvent) => pendingActions.delete(requestEvent));
  page.on("requestfailed", (requestEvent) => {
    pendingActions.delete(requestEvent);
    failedRequests.push(`${requestEvent.method()} ${requestEvent.url()}: ${requestEvent.failure()?.errorText || "failed"}`);
  });
  page.on("response", (response) => { if (response.status() >= 400) failedRequests.push(`${response.status()} ${response.url()}`); });

  await page.goto("/");
  await page.evaluate(() => document.fonts.ready);
  await expect(page.getByRole("heading", { name: /Good offers from great local stores/i })).toBeVisible();
  await expect(page.locator(".hero-main-photo img")).toBeVisible();
  await expect(page.locator(".spotlight-card").first()).toBeVisible();
  await expect(page.locator(".deal-card").first()).toBeVisible();

  const categoryButton = deal.category && page.locator(".category-tile").filter({ hasText: deal.category.name.split(/[& ]/)[0] }).first();
  if (categoryButton) {
    await categoryButton.click();
    await expect(categoryButton).toHaveClass(/active/);
    await expect(page.locator(".deal-card").first()).toBeVisible();
  }
  await page.getByLabel("Search stores, products or deals").fill("no-match-customer-test-981734");
  await expect(page.locator(".deals-section .deal-grid .deal-card")).toHaveCount(0);
  await page.getByLabel("Search stores, products or deals").fill("");
  await page.locator(".city-select select").selectOption({ label: "Gandhinagar" });
  await expect(page.locator(".deals-section .section-subtitle")).toContainText("Gandhinagar");
  await page.locator(".city-select select").selectOption({ label: "Ahmedabad" });
  await page.getByLabel("Sort deals").selectOption("discount");
  await expect(page.getByLabel("Sort deals")).toHaveValue("discount");

  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ latitude: 23.0225, longitude: 72.5714 });
  await page.getByRole("button", { name: "Find deals near me" }).click();
  await expect(page.getByRole("button", { name: "Stop using your location" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".toast")).toContainText("within 10 km");
  await page.getByRole("button", { name: "Stop using your location" }).click();
  await page.getByRole("button", { name: "See all local deals" }).click();

  const refreshStatus = page.getByTestId("marketplace-loading");
  await expect(refreshStatus).toBeVisible({ timeout: 5_000 });
  await expect(refreshStatus).toBeHidden({ timeout: 60_000 });
  await expect.poll(() => pendingActions.size, { timeout: 60_000, message: "marketplace filter/location server actions should complete before navigation" }).toBe(0);
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => document.fonts.ready);
  await page.getByLabel("Search stores, products or deals").fill(deal.title);
  const dealCard = page.locator(".deal-card").filter({ hasText: deal.title }).first();
  await expect(dealCard).toBeVisible();
  const openDealButton = dealCard.getByRole("button", { name: new RegExp(`Open ${deal.title}`) });
  await openDealButton.scrollIntoViewIfNeeded();
  await openDealButton.click({ force: true });
  const offerDialog = page.locator(".offer-detail[role='dialog']");
  await expect(offerDialog).toBeVisible();
  const cardImage = offerDialog.locator(".public-media-gallery-main img").first();
  await expect(cardImage).toBeVisible();
  await expect.poll(() => cardImage.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBeTruthy();
  await page.getByRole("link", { name: "Full offer details" }).click();
  await page.evaluate(() => document.fonts.ready);
  await expect(page).toHaveURL(new RegExp(`/deals/${deal.id}/${deal.slug}$`));
  await expect(page.getByRole("heading", { level: 1, name: deal.title })).toBeVisible();
  await expect(page.getByRole("link", { name: deal.store.name }).first()).toBeVisible();
  await expect(page.locator(".public-media-gallery-main img").first()).toBeVisible();

  await page.goto(`/stores/${deal.store.id}/${deal.store.slug}`);
  await page.evaluate(() => document.fonts.ready);
  await expect(page.getByRole("heading", { level: 1, name: deal.store.name })).toBeVisible();
  await expect(page.getByRole("button", { name: "Follow store" })).toBeVisible();
  const storeImage = page.locator(".public-media-gallery-main img").first();
  await expect(storeImage).toBeVisible();
  await expect.poll(() => storeImage.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBeTruthy();
  const storeThumbnails = page.getByRole("group", { name: "More photos" }).getByRole("button");
  if (await storeThumbnails.count() > 1) {
    await storeThumbnails.nth(1).click();
    await expect(storeThumbnails.nth(1)).toHaveAttribute("aria-pressed", "true");
  }
  await page.getByRole("button", { name: "Follow store" }).click();
  await expect(page).toHaveURL(/\/customer\/login/);
  await page.evaluate(() => document.fonts.ready);

  await page.goto("/customer/register");
  await page.evaluate(() => document.fonts.ready);
  await expect(page.getByRole("heading", { name: "Create your account" })).toBeVisible();
  await expect(page.getByLabel("Your name")).toBeVisible();
  await expect(page.getByLabel("Email")).toBeVisible();
  await expect(page.getByLabel("Password")).toBeVisible();

  await page.goto("/customer/notifications");
  await expect(page).toHaveURL(/\/customer\/login/);
  await page.evaluate(() => document.fonts.ready);
  await page.goto("/");
  await expectNoHorizontalOverflow(page, 390);
  await page.screenshot({ path: testInfo.outputPath("customer-marketplace-390.png"), fullPage: true });
  await expectNoHorizontalOverflow(page, 1440);
  await page.screenshot({ path: testInfo.outputPath("customer-marketplace-1440.png"), fullPage: true });

  for (const width of [360, 375, 390, 430, 768, 1024, 1440]) {
    await expectNoHorizontalOverflow(page, width);
  }
  await expect(page.evaluate(() => document.body.style.overflow)).resolves.toBe("");
  console.log("Customer browser diagnostics", JSON.stringify({ consoleErrors, failedRequests }));
  expect(failedRequests, "customer browser interactions should not produce failed network requests").toEqual([]);
  expect(consoleErrors, "customer browser interactions should not produce console errors").toEqual([]);
});

test("real customer session persists saved deals and store follows across refresh", async ({ page, request }) => {
  const missingCustomerA = [
    !customerEmail ? "DEALSE_E2E_CUSTOMER_EMAIL" : null,
    !customerPassword ? "DEALSE_E2E_CUSTOMER_PASSWORD" : null,
  ].filter((name): name is string => name !== null);
  test.skip(missingCustomerA.length > 0, `Customer A is not configured; missing ${missingCustomerA.join(", ")}. See docs/e2e-test-account-setup.md. Credentials are never printed and mocked sessions are not accepted.`);
  const deal = await getPublishedDeal(request);

  await page.goto("/customer/login");
  await page.getByLabel("Email").fill(customerEmail!);
  await page.getByLabel("Password").fill(customerPassword!);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/$/);

  await page.goto(`/deals/${deal.id}/${deal.slug}`);
  const save = page.getByRole("button", { name: "Save offer" });
  await save.click();
  await expect(page.getByRole("status")).toContainText("Saved to your offers");
  await page.reload();
  await expect(page.getByRole("button", { name: "♥ Saved offer" })).toHaveAttribute("aria-pressed", "true");

  await page.goto(`/stores/${deal.store.id}/${deal.store.slug}`);
  await page.getByRole("button", { name: "Follow store" }).click();
  await expect(page.getByRole("button", { name: "Following store" })).toHaveAttribute("aria-pressed", "true");
  await page.reload();
  await expect(page.getByRole("button", { name: "Following store" })).toHaveAttribute("aria-pressed", "true");

  await page.goto("/customer/dashboard");
  await expect(page.getByRole("heading", { name: /Welcome/ })).toBeVisible();
  await expect(page.getByRole("link", { name: "View offer" })).toBeVisible();
  await expect(page.getByRole("link", { name: "View store" })).toBeVisible();
  const profileName = page.getByLabel("Your name");
  await profileName.fill("DealSe Browser Customer");
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page.getByRole("heading", { name: "Welcome, DealSe Browser Customer" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Welcome, DealSe Browser Customer" })).toBeVisible();

  await page.goto("/customer/notifications");
  await expect(page.getByRole("heading", { name: "Notifications" })).toBeVisible();
  await expect(page.locator(".notification-empty, .notification-list")).toBeVisible();
  const unreadNotification = page.locator(".notification-item.is-unread").first();
  if (await unreadNotification.count()) {
    const title = await unreadNotification.locator("h2").innerText();
    await unreadNotification.getByRole("button", { name: new RegExp(`Mark.*${title}`) }).click();
    await expect(page.locator(".notification-item").filter({ hasText: title })).toHaveClass(/is-read/);
  }

  await page.goto("/customer/dashboard");
  await page.getByRole("button", { name: "Log out" }).click();
  await expect(page).toHaveURL(/\/customer\/login/);
  await page.goto("/customer/dashboard");
  await expect(page).toHaveURL(/\/customer\/login/);
});
