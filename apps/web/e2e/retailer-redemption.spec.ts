import { expect, test, type Page } from "@playwright/test";

const retailerEmail = process.env.DEALSE_E2E_RETAILER_EMAIL;
const retailerPassword = process.env.DEALSE_E2E_RETAILER_PASSWORD;

async function loginRetailer(page: Page) {
  await page.goto("/retailer/login");
  await page.getByLabel("Email").fill(retailerEmail!);
  await page.getByLabel("Password").fill(retailerPassword!);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/retailer\/dashboard/, { timeout: 30_000 });
}

async function openRedemptions(page: Page) {
  await page.getByRole("button", { name: "Redemptions" }).click();
  await expect(page.getByRole("heading", { name: "Redemptions", exact: true })).toBeVisible();
}

test("retailer scanner handles denied camera permission and allows manual credential entry", async ({ page }) => {
  test.setTimeout(90_000);
  test.skip(!retailerEmail || !retailerPassword, "A disposable signed-in retailer account is required; credentials are never printed and mocked sessions are not accepted.");

  await page.addInitScript(() => {
    const mediaDevices = navigator.mediaDevices;
    if (mediaDevices) {
      Object.defineProperty(mediaDevices, "getUserMedia", {
        configurable: true,
        value: async () => { throw new DOMException("Permission denied", "NotAllowedError"); },
      });
    }
  });
  await loginRetailer(page);

  let failedHistoryRequest = false;
  let historyActionRequests = 0;
  await page.route("**/*", async (route) => {
    const request = route.request();
    if (request.method() === "POST" && request.headers()["next-action"]) {
      historyActionRequests += 1;
      if (!failedHistoryRequest) {
        failedHistoryRequest = true;
        await route.abort("failed");
        return;
      }
    }
    await route.continue();
  });
  await openRedemptions(page);
  const history = page.getByRole("region", { name: "Redemption history" });
  await expect(history.getByRole("alert")).toBeVisible();
  await expect.poll(() => failedHistoryRequest).toBe(true);
  await history.getByRole("button", { name: "Try again" }).click();
  await expect.poll(() => historyActionRequests).toBeGreaterThanOrEqual(2);
  await page.unrouteAll({ behavior: "wait" });

  await page.getByRole("button", { name: "Scan customer QR" }).click();
  const scanner = page.getByRole("dialog", { name: /Scan at/ });
  await expect(scanner).toBeVisible();
  await expect(scanner.getByRole("alert")).toContainText("Camera permission was denied");
  await scanner.getByLabel("Enter credential manually").fill("A".repeat(43));
  await scanner.getByRole("button", { name: "Validate" }).click();
  await expect(scanner.getByText("Invalid QR code. Please scan a valid DealSe QR.")).toBeVisible({ timeout: 20_000 });
  await expect(scanner.getByLabel("Close scanner")).toBeVisible();
  await scanner.getByLabel("Close scanner").click();
  await expect(scanner).toBeHidden();
});

test("retailer camera tracks stop when the scanner closes", async ({ page }) => {
  test.setTimeout(90_000);
  test.skip(!retailerEmail || !retailerPassword, "A disposable signed-in retailer account is required; credentials are never printed and mocked sessions are not accepted.");

  await page.addInitScript(() => {
    const mediaDevices = navigator.mediaDevices;
    if (mediaDevices) {
      Object.defineProperty(mediaDevices, "getUserMedia", {
        configurable: true,
        value: async (constraints: MediaStreamConstraints) => {
          (window as typeof window & { __redemptionCameraConstraints?: MediaStreamConstraints }).__redemptionCameraConstraints = constraints;
          const canvas = document.createElement("canvas");
          const stream = canvas.captureStream(1);
          (window as typeof window & { __redemptionCameraTrack?: MediaStreamTrack }).__redemptionCameraTrack = stream.getVideoTracks()[0];
          return stream;
        },
      });
    }
  });
  await loginRetailer(page);
  await openRedemptions(page);
  await page.getByRole("button", { name: "Scan customer QR" }).click();
  const scanner = page.getByRole("dialog", { name: /Scan at/ });
  await expect(scanner).toBeVisible();
  await expect.poll(() => page.evaluate(() => Boolean((window as typeof window & { __redemptionCameraTrack?: MediaStreamTrack }).__redemptionCameraTrack))).toBe(true);
  const facingMode = await page.evaluate(() => (window as typeof window & { __redemptionCameraConstraints?: MediaStreamConstraints }).__redemptionCameraConstraints?.video && ((window as typeof window & { __redemptionCameraConstraints?: MediaStreamConstraints }).__redemptionCameraConstraints!.video as MediaTrackConstraints).facingMode);
  expect(facingMode).toEqual({ ideal: "environment" });
  await scanner.getByLabel("Close scanner").click();
  await expect.poll(() => page.evaluate(() => (window as typeof window & { __redemptionCameraTrack?: MediaStreamTrack }).__redemptionCameraTrack?.readyState)).toBe("ended");
});
