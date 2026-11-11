import { mkdir } from "node:fs/promises";
import path from "node:path";
import { expect, test, type APIRequestContext, type Page, type TestInfo } from "@playwright/test";

const apiOrigin = process.env.DEALSE_E2E_API_URL || "http://127.0.0.1:3102";
const widths = [360, 375, 390, 430, 768, 1024, 1280, 1440];

type PublicDeal = {
  id: string;
  title: string;
  slug: string;
  store: { id: string; name: string; slug: string };
};

async function getPublishedDeal(request: APIRequestContext): Promise<PublicDeal> {
  const response = await request.get(`${apiOrigin}/api/v1/deals?city=Ahmedabad&limit=1`);
  expect(response.ok(), "the live discovery endpoint should return a published demo deal").toBeTruthy();
  const payload = (await response.json()) as { items?: PublicDeal[] };
  expect(payload.items?.length, "seed the local demo catalogue before browser verification").toBeGreaterThan(0);
  return payload.items![0];
}

async function capture(page: Page, testInfo: TestInfo, name: string, fullPage = false) {
  const directory = testInfo.outputPath("screenshots");
  await mkdir(directory, { recursive: true });
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
  await page.screenshot({ path: path.join(directory, name), fullPage });
}

async function expectNoHorizontalOverflow(page: Page, width: number) {
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), {
    message: `page should not overflow horizontally at ${width}px`,
  }).toBeTruthy();
}

test("marketplace, deal and store pages fit all requested widths", async ({ page, request }, testInfo) => {
  const deal = await getPublishedDeal(request);
  const routes = [
    "/",
    `/deals/${encodeURIComponent(deal.id)}/${encodeURIComponent(deal.slug)}`,
    `/stores/${encodeURIComponent(deal.store.id)}/${encodeURIComponent(deal.store.slug)}`,
    "/customer/login",
    "/customer/register",
    "/retailer/login",
    "/retailer/register",
  ];

  for (const route of routes) {
    await page.goto(route);
    for (const width of widths) {
      await page.setViewportSize({ width, height: 900 });
      await expectNoHorizontalOverflow(page, width);
      const main = page.locator("main").first();
      if (await main.count()) {
        const bounds = await main.boundingBox();
        if (bounds) expect(bounds.x + bounds.width).toBeLessThanOrEqual(width + 1);
      }
      if (route === "/" && width <= 600) {
        const headerRows = await page.evaluate(() => {
          const header = document.querySelector(".site-header");
          const location = document.querySelector(".site-header .location-controls");
          const city = document.querySelector(".site-header .city-select");
          const near = document.querySelector(".site-header .location-button");
          const search = document.querySelector(".site-header .header-search");
          const bounds = (element: Element | null) => {
            if (!element) return null;
            const { x, y, width, height, bottom } = element.getBoundingClientRect();
            const style = getComputedStyle(element);
            return { x, y, width, height, bottom, gridColumn: style.gridColumn, gridRow: style.gridRow, display: style.display, flexWrap: style.flexWrap };
          };
          return header && location && search ? { header: bounds(header), location: bounds(location), city: bounds(city), near: bounds(near), search: bounds(search), grid: getComputedStyle(header).gridTemplateColumns } : null;
        });
        if (!headerRows?.location || !headerRows.search) throw new Error("Mobile header location and search controls are missing.");
        expect(headerRows.location.bottom, JSON.stringify(headerRows)).toBeLessThanOrEqual(headerRows.search.y + 1);
      }
      if (route === "/" && width > 800) {
        const headerColumns = await page.evaluate(() => {
          const controls = document.querySelector(".site-header .location-controls")?.getBoundingClientRect();
          const search = document.querySelector(".site-header .header-search")?.getBoundingClientRect();
          return controls && search ? { controlsRight: controls.right, searchLeft: search.left } : null;
        });
        if (!headerColumns) throw new Error("Desktop header location and search controls are missing.");
        expect(headerColumns.controlsRight, JSON.stringify(headerColumns)).toBeLessThanOrEqual(headerColumns.searchLeft + 1);
      }
    }
    if (route === "/") {
      await page.setViewportSize({ width: 390, height: 844 });
      await capture(page, testInfo, "marketplace-mobile-390.png");
      await page.setViewportSize({ width: 1440, height: 900 });
      await capture(page, testInfo, "marketplace-desktop-1440.png");
    }
    if (route.startsWith("/deals/")) {
      await page.setViewportSize({ width: 390, height: 844 });
      await capture(page, testInfo, "canonical-deal-390.png", true);
    }
    if (route.startsWith("/stores/")) {
      await page.setViewportSize({ width: 390, height: 844 });
      await capture(page, testInfo, "store-detail-390.png", true);
    }
    if (route === "/retailer/login") {
      await page.setViewportSize({ width: 390, height: 844 });
      await capture(page, testInfo, "retailer-login-390.png");
    }
  }
});

test("customer offer dialog has one vertical scroll area and keeps the actions in normal flow", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 600 });
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await page.locator(".deal-card__image-button").first().click();

  const overlay = page.locator(".detail-wrap.customer-offer-modal");
  const card = page.locator(".detail-wrap.customer-offer-modal .offer-detail");
  await expect(card).toBeVisible();
  const layout = await page.evaluate(() => {
    const dialog = document.querySelector(".detail-wrap.customer-offer-modal");
    const cardElement = document.querySelector(".detail-wrap.customer-offer-modal .offer-detail");
    const copyElement = document.querySelector(".detail-wrap.customer-offer-modal .detail-copy");
    if (!dialog || !cardElement || !copyElement) throw new Error("Offer dialog elements are missing.");
    return {
      overlayHeight: dialog.clientHeight,
      overlayContentHeight: dialog.scrollHeight,
      overlayOverflowY: getComputedStyle(dialog).overflowY,
      cardOverflowY: getComputedStyle(cardElement).overflowY,
      copyOverflowY: getComputedStyle(copyElement).overflowY,
      copyHeight: copyElement.clientHeight,
      copyContentHeight: copyElement.scrollHeight,
    };
  });
  expect(layout.overlayOverflowY).toBe("auto");
  expect(layout.cardOverflowY).toBe("visible");
  expect(layout.copyOverflowY).toBe("visible");
  expect(layout.overlayContentHeight).toBeGreaterThan(layout.overlayHeight);
  expect(layout.copyContentHeight).toBeLessThanOrEqual(layout.copyHeight + 1);

  await overlay.evaluate((element) => { element.scrollTop = element.scrollHeight; });
  await expect(page.getByRole("button", { name: /redeem this offer/i })).toBeVisible();
  await capture(page, testInfo, "deal-dialog-390-scrolled.png");
  await overlay.evaluate((element) => { element.scrollTop = 0; });
  await page.getByRole("button", { name: "Back to local deals" }).click();
  await expect(page.locator(".detail-wrap.customer-offer-modal")).toHaveCount(0);
});

test("canonical deal details scroll with the document instead of an inner pane", async ({ page, request }) => {
  const deal = await getPublishedDeal(request);
  await page.setViewportSize({ width: 390, height: 640 });
  await page.goto(`/deals/${encodeURIComponent(deal.id)}/${encodeURIComponent(deal.slug)}`);
  await expect(page.getByRole("heading", { level: 1, name: deal.title })).toBeVisible();

  const layout = await page.evaluate(() => {
    const content = document.querySelector(".public-deal-content");
    if (!content) throw new Error("Canonical offer content is missing.");
    return {
      pageHeight: document.documentElement.scrollHeight,
      viewportHeight: window.innerHeight,
      contentOverflowY: getComputedStyle(content).overflowY,
    };
  });
  expect(layout.pageHeight).toBeGreaterThan(layout.viewportHeight);
  expect(layout.contentOverflowY).toBe("visible");
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
});

test("retailer image picker opens Browse, accepts JPEG/PNG/WebP, supports same-file reselect, and reports invalid files", async ({ page }) => {
  await page.goto("/dev/media-picker");
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("heading", { name: "Retailer image picker browser check" })).toBeVisible();
  const picker = page.getByRole("region", { name: "Offer gallery" });
  const browse = picker.getByRole("button", { name: "Browse images" });
  const sourceBytes = await page.evaluate(async () => {
    const response = await fetch("/assets/hero-shopkeeper.png");
    const source = await createImageBitmap(await response.blob());
    const canvas = document.createElement("canvas");
    canvas.width = 400;
    canvas.height = 300;
    canvas.getContext("2d")!.drawImage(source, 0, 0);
    source.close();
    return await new Promise<Record<string, number[]>>((resolve, reject) => {
      const formats = ["image/png", "image/jpeg", "image/webp"];
      const results: Record<string, number[]> = {};
      Promise.all(formats.map(async (format) => {
        const blob = await new Promise<Blob>((resolveBlob, rejectBlob) => canvas.toBlob((value) => value ? resolveBlob(value) : rejectBlob(new Error(`Could not encode ${format}`)), format, 0.9));
        results[format] = Array.from(new Uint8Array(await blob.arrayBuffer()));
      })).then(() => resolve(results)).catch(reject);
    });
  });

  const choose = async (file: { name: string; mimeType: string; buffer: Buffer }) => {
    const fileChooserWaiter = page.waitForEvent("filechooser");
    await browse.click();
    const fileChooser = await fileChooserWaiter;
    await fileChooser.setFiles(file);
  };
  const cropDialog = page.getByRole("dialog", { name: "Adjust your image" });
  const png = { name: "retailer-browse-check.png", mimeType: "image/png", buffer: Buffer.from(sourceBytes["image/png"]) };

  await choose(png);
  await expect(cropDialog).toBeVisible();
  await cropDialog.getByRole("button", { name: "Cancel image crop" }).click();
  await choose(png);
  await expect(cropDialog).toBeVisible();
  await cropDialog.getByRole("button", { name: "Cancel image crop" }).click();

  for (const [mimeType, extension] of [["image/jpeg", "jpg"], ["image/webp", "webp"]]) {
    await choose({ name: `retailer-browse-check.${extension}`, mimeType, buffer: Buffer.from(sourceBytes[mimeType]) });
    await expect(cropDialog).toBeVisible();
    await cropDialog.getByRole("button", { name: "Cancel image crop" }).click();
  }

  await choose({ name: "not-an-image.txt", mimeType: "text/plain", buffer: Buffer.from("not an image") });
  await expect(picker.getByRole("alert")).toContainText("use a JPEG, PNG, or WebP image");
  await choose({ name: "too-large.png", mimeType: "image/png", buffer: Buffer.alloc(5 * 1024 * 1024 + 1) });
  await expect(picker.getByRole("alert")).toContainText("choose an image up to 5 MB");
});
