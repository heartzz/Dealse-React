import { expect, test, type APIRequestContext } from "@playwright/test";

const apiOrigin = process.env.DEALSE_E2E_API_URL || "http://127.0.0.1:3102";

type PublicDeal = {
  id: string;
  title: string;
  slug: string;
  store: { id: string; name: string; slug: string };
};

async function getPublishedDeal(request: APIRequestContext): Promise<PublicDeal> {
  const response = await request.get(`${apiOrigin}/api/v1/deals?city=Ahmedabad&limit=1`);
  expect(response.ok(), "the live NestJS discovery endpoint should respond successfully").toBeTruthy();
  const payload = (await response.json()) as { items?: PublicDeal[] };
  expect(payload.items?.length, "seed the local demo catalogue before running browser acceptance tests").toBeGreaterThan(0);
  return payload.items![0];
}

test("customer marketplace loads live deals and canonical deal/store pages", async ({ page, request }) => {
  const deal = await getPublishedDeal(request);

  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Good offers from great local stores/i })).toBeVisible();
  await expect(page.locator(".demo-catalogue-note")).toContainText("fictional retailers and offers");

  const heroImage = page.locator(".hero-main-photo img");
  await expect(heroImage).toBeVisible();
  await expect.poll(() => heroImage.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);

  await page.goto(`/deals/${encodeURIComponent(deal.id)}/${encodeURIComponent(deal.slug)}`);
  await expect(page.getByRole("heading", { level: 1, name: deal.title })).toBeVisible();
  await expect(page.getByRole("heading", { name: deal.store.name }).first()).toBeVisible();

  await page.goto(`/stores/${encodeURIComponent(deal.store.id)}/${encodeURIComponent(deal.store.slug)}`);
  await expect(page.getByRole("heading", { level: 1, name: deal.store.name })).toBeVisible();
});

test("customer and retailer dashboards require an authenticated session", async ({ page }) => {
  await page.goto("/customer/dashboard");
  await expect(page).toHaveURL(/\/customer\/login(?:\?|$)/);

  await page.goto("/retailer/dashboard");
  await expect(page).toHaveURL(/\/retailer\/login(?:\?|$)/);
});

test("customer marketplace has no horizontal overflow at phone, tablet and desktop widths", async ({ page }) => {
  await page.goto("/");
  for (const width of [360, 375, 390, 414, 768, 1366]) {
    await page.setViewportSize({ width, height: 900 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), {
      message: `marketplace should fit a ${width}px viewport without horizontal scrolling`,
    }).toBeTruthy();
  }
});
