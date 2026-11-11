import { expect, test } from "@playwright/test";

test("crop editor loads a real image, adjusts it, and exports a cropped WebP file", async ({ page }) => {
  await page.goto("/dev/media-editor");

  const dialog = page.getByRole("dialog", { name: "Adjust your image" });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator(".retailer-crop-preview canvas")).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Zoom in" })).toBeEnabled();
  await dialog.getByRole("button", { name: "Zoom in" }).click();
  await dialog.getByRole("button", { name: "Rotate" }).click();
  await dialog.getByRole("button", { name: "Reset" }).click();
  await dialog.getByRole("button", { name: "Use this crop" }).click();

  await expect(page.getByRole("status")).toContainText("image/webp");
  await expect(page.getByRole("status")).toContainText("media-editor-test-crop.webp");
});
