import { mkdir } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";

test("retailer can capture and review store map coordinates before saving", async ({ page }, testInfo) => {
  await page.context().grantPermissions(["geolocation"]);
  await page.context().setGeolocation({ latitude: 23.0225, longitude: 72.5714 });
  await page.goto("/dev/retailer-offer-workflow");
  await page.getByRole("button", { name: /Store profile/ }).click();

  const latitude = page.getByLabel("Latitude");
  const longitude = page.getByLabel("Longitude");
  await expect(latitude).toHaveValue("");
  await expect(longitude).toHaveValue("");
  await page.getByRole("button", { name: "Use current location" }).click();
  await expect(latitude).toHaveValue("23.022500");
  await expect(longitude).toHaveValue("72.571400");
  await expect(page.getByText(/A street address does not set a map location/)).toBeVisible();

  const screenshotsDirectory = testInfo.outputPath("screenshots");
  await mkdir(screenshotsDirectory, { recursive: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: path.join(screenshotsDirectory, "retailer-store-location-390.png"), fullPage: true });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.screenshot({ path: path.join(screenshotsDirectory, "retailer-store-location-1440.png"), fullPage: true });
});
