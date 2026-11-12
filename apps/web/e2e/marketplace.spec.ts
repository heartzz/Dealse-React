import { expect, test, type APIRequestContext } from "@playwright/test";

const apiOrigin = process.env.DEALSE_E2E_API_URL || "http://127.0.0.1:3102";

type PublicDeal = {
  id: string;
  title: string;
  slug: string;
  store: { id: string; name: string; slug: string };
};

async function getPublishedDeal(request: APIRequestContext): Promise<PublicDeal> {
  const response = await request.get(`${apiOrigin}/api/v1/deals?city=Ahmedabad&limit=20`);
  expect(response.ok(), "the live NestJS discovery endpoint should respond successfully").toBeTruthy();
  const payload = (await response.json()) as { items?: PublicDeal[] };
  expect(payload.items?.length, "seed the local demo catalogue before running browser acceptance tests").toBeGreaterThan(0);
  for (const candidate of payload.items!) {
    const detail = await request.get(`${apiOrigin}/api/v1/deals/${encodeURIComponent(candidate.id)}`);
    if (detail.ok()) return (await detail.json()) as PublicDeal;
  }
  throw new Error("The discovery API returned no offer that could be loaded from its canonical detail endpoint.");
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
  for (const width of [360, 375, 390, 430, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), {
      message: `canonical offer detail should fit a ${width}px viewport`,
    }).toBeTruthy();
  }

  await page.goto(`/stores/${encodeURIComponent(deal.store.id)}/${encodeURIComponent(deal.store.slug)}`);
  await expect(page.getByRole("heading", { level: 1, name: deal.store.name })).toBeVisible();
  for (const width of [360, 375, 390, 430, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), {
      message: `store detail should fit a ${width}px viewport`,
    }).toBeTruthy();
  }
});

test("customer and retailer dashboards require an authenticated session", async ({ page }) => {
  await page.goto("/customer/dashboard");
  await expect(page).toHaveURL(/\/customer\/login(?:\?|$)/);

  await page.goto("/retailer/dashboard");
  await expect(page).toHaveURL(/\/retailer\/login(?:\?|$)/);
});

test("customer marketplace has no horizontal overflow at phone, tablet and desktop widths", async ({ page }) => {
  await page.goto("/");
  for (const width of [360, 375, 390, 430, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), {
      message: `marketplace should fit a ${width}px viewport without horizontal scrolling`,
    }).toBeTruthy();
  }
});
