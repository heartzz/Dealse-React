import { expect, test } from "@playwright/test";

const retailerEmail = process.env.DEALSE_E2E_RETAILER_EMAIL;
const retailerPassword = process.env.DEALSE_E2E_RETAILER_PASSWORD;

test("authenticated retailer store setup has a usable desktop width and no mobile overflow", async ({ page }, testInfo) => {
  const missing = [
    !retailerEmail ? "DEALSE_E2E_RETAILER_EMAIL" : null,
    !retailerPassword ? "DEALSE_E2E_RETAILER_PASSWORD" : null,
  ].filter((name): name is string => name !== null);
  test.skip(missing.length > 0, `Retailer A is not configured; missing ${missing.join(", ")}. See docs/e2e-test-account-setup.md. Credentials are never printed and mocked sessions are not accepted.`);

  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const failedRequests: string[] = [];
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("requestfailed", (request) => failedRequests.push(`${request.method()} ${request.url()}: ${request.failure()?.errorText || "failed"}`));
  page.on("response", (response) => { if (response.status() >= 400) failedRequests.push(`${response.status()} ${response.url()}`); });

  await page.goto("/retailer/dashboard");
  if (new URL(page.url()).pathname === "/retailer/login") {
    await page.getByLabel("Email").fill(retailerEmail!);
    await page.getByLabel("Password").fill(retailerPassword!);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/retailer\/dashboard(?:\?.*)?$/);
  }

  await expect(page.getByRole("heading", { name: "Complete your store profile" })).toBeVisible({ timeout: 30_000 });
  const form = page.locator(".retailer-workspace--setup .workspace-form-panel");
  await expect(form).toBeVisible();
  await expect(page.getByLabel("Store name")).toBeVisible();
  await expect(page.getByLabel("Category")).toBeVisible();

  for (const width of [360, 375, 390, 430, 768, 1024, 1280, 1366]) {
    await page.setViewportSize({ width, height: 830 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), {
      message: `retailer store setup should not overflow horizontally at ${width}px`,
    }).toBeTruthy();
    const formBounds = await form.boundingBox();
    expect(formBounds, "store form should have measurable bounds").not.toBeNull();
    for (const control of await form.locator("input, select, textarea").all()) {
      const bounds = await control.boundingBox();
      expect(bounds, "form controls should be visible within the card").not.toBeNull();
      expect(bounds!.x).toBeGreaterThanOrEqual(formBounds!.x);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(formBounds!.x + formBounds!.width + 1);
    }

    if (width >= 1024) {
      await expect.poll(() => form.evaluate((element) => element.getBoundingClientRect().width), {
        message: `store profile form should be 560–720px wide at ${width}px`,
      }).toBeGreaterThanOrEqual(560);
      await expect.poll(() => form.evaluate((element) => element.getBoundingClientRect().width)).toBeLessThanOrEqual(720);
    } else if (width <= 430) {
      await expect.poll(() => form.evaluate((element) => getComputedStyle(element.querySelector(".workspace-form-grid")!).gridTemplateColumns.split(" ").length)).toBe(1);
    }

    if ([390, 1366].includes(width)) {
      await page.screenshot({ path: testInfo.outputPath(`retailer-store-setup-${width}.png`), fullPage: true });
    }
  }

  expect(consoleErrors, "retailer setup should not produce browser console errors").toEqual([]);
  expect(pageErrors, "retailer setup should not throw uncaught browser errors").toEqual([]);
  expect(failedRequests, "retailer setup should not produce failed requests").toEqual([]);
});
