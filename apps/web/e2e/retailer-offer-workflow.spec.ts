import { mkdir } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";

const widths = [360, 375, 390, 430, 768, 1024, 1440];

test("retailer offer draft round-trip, image selection, preview, and publish fit supported viewports", async ({ page }, testInfo) => {
  await page.goto("/dev/retailer-offer-workflow");
  await page.getByRole("button", { name: "Create an offer" }).click();
  await expect(page.getByRole("heading", { name: "Create a deal" })).toBeVisible();

  const progress = page.locator(".deal-wizard-progress");
  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), {
      message: `retailer offer wizard should fit ${width}px without horizontal scrolling`,
    }).toBeTruthy();
    const bounds = await progress.locator("button").evaluateAll((buttons) => buttons.map((button) => {
      const { x, y, right, bottom } = button.getBoundingClientRect();
      return { x, y, right, bottom };
    }));
    expect(bounds).toHaveLength(5);
    await expect.poll(() => progress.evaluate((element) => getComputedStyle(element).borderBottomWidth), {
      message: `stepper should not draw a full-width bottom separator at ${width}px`,
    }).toBe("0px");
    await expect.poll(() => progress.locator("button").first().evaluate((button) => getComputedStyle(button, "::after").height)).toBe("1px");
    await expect(progress.locator("button > span")).toHaveCount(5);
    for (let index = 0; index < bounds.length - 1; index += 1) {
      expect(bounds[index].right, `wizard steps overlap horizontally at ${width}px`).toBeLessThanOrEqual(bounds[index + 1].x + 1);
    }
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByLabel("Offer title").fill("20% off test textiles");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByRole("status")).toContainText("Draft saved.");
  const firstSave = JSON.parse((await page.getByTestId("offer-workflow-events").textContent()) || "[]")[0];
  expect(firstSave.action).toBe("create");
  expect(firstSave.input).not.toHaveProperty("summary");
  expect(firstSave.input).not.toHaveProperty("details");
  expect(firstSave.input).not.toHaveProperty("imageReference");

  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Edit your offer" })).toBeVisible();
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByRole("status")).toContainText("Draft updated.");
  const eventsAfterEdit = JSON.parse((await page.getByTestId("offer-workflow-events").textContent()) || "[]");
  expect(eventsAfterEdit[1].input.summary).toBeNull();
  expect(eventsAfterEdit[1].input.details).toBeNull();

  await page.locator(".deal-wizard-progress").getByRole("button", { name: "Pricing" }).click();
  await page.locator(".deal-wizard-progress").getByRole("button", { name: "Details" }).click();
  await page.getByLabel("Terms and conditions").fill("Valid on selected test items through the expiry date.");

  await page.locator(".deal-wizard-progress").getByRole("button", { name: "Image" }).click();
  const uploaded = {
    id: "00000000-0000-4000-8000-000000000005",
    url: "/media/00000000-0000-4000-8000-000000000005",
    altText: "Offer image",
    sortOrder: 0,
    isPrimary: true,
    width: 400,
    height: 300,
  };
  let uploadCount = 0;
  let associationPayload: { mediaIds?: string[] } = {};
  const imageBytes = await page.evaluate(async () => Array.from(new Uint8Array(await (await fetch("/assets/hero-shopkeeper.png")).arrayBuffer())));
  await page.route("**/api/media/upload", async (route) => {
    uploadCount += 1;
    await route.fulfill({ json: uploaded });
  });
  await page.route("**/api/media/associations", async (route) => {
    associationPayload = route.request().postDataJSON() as { mediaIds?: string[] };
    await route.fulfill({ json: [uploaded] });
  });
  await page.route(`**${uploaded.url}`, async (route) => {
    await route.fulfill({ status: 200, contentType: "image/png", body: Buffer.from(imageBytes) });
  });
  const fileChooserWaiter = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Browse images" }).click();
  const fileChooser = await fileChooserWaiter;
  await fileChooser.setFiles({ name: "offer-image.png", mimeType: "image/png", buffer: Buffer.from(imageBytes) });
  const cropDialog = page.getByRole("dialog", { name: "Adjust your image" });
  await expect(cropDialog).toBeVisible();
  await cropDialog.getByRole("button", { name: "Use this crop" }).click();
  await expect.poll(() => uploadCount).toBe(1);
  await expect(page.locator(".retailer-image-card img")).toHaveAttribute("src", uploaded.url);
  await expect.poll(() => page.locator(".retailer-image-card img").evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);
  expect(associationPayload.mediaIds).toEqual([uploaded.id]);

  await page.locator(".deal-wizard-progress").getByRole("button", { name: "Preview" }).click();
  await expect(page.locator(".workspace-marketplace-card")).toContainText("20% off test textiles");
  await page.getByRole("button", { name: "Full preview" }).click();
  await expect(page.getByText("CUSTOMER PREVIEW")).toBeVisible();
  const screenshotsDirectory = testInfo.outputPath("screenshots");
  await mkdir(screenshotsDirectory, { recursive: true });
  await page.screenshot({ path: path.join(screenshotsDirectory, "retailer-offer-preview-390.png"), fullPage: true });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.screenshot({ path: path.join(screenshotsDirectory, "retailer-offer-preview-1440.png"), fullPage: true });
  await page.getByRole("button", { name: "Publish offer" }).click();
  await expect(page.locator(".offer-idea-status")).toContainText("Offer published and available for customer discovery.");
  const finalEvents = JSON.parse((await page.getByTestId("offer-workflow-events").textContent()) || "[]");
  expect(finalEvents.some((event: { action: string; status?: string }) => event.action === "publish" && event.status === "published")).toBe(true);
});
