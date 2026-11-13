import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

const apiOrigin = process.env.DEALSE_E2E_API_URL || "http://127.0.0.1:3102";
const customerEmail = process.env.DEALSE_E2E_CUSTOMER_EMAIL;
const customerPassword = process.env.DEALSE_E2E_CUSTOMER_PASSWORD;

type PublicDeal = { id: string; title: string; slug: string; store: { id: string; name: string } };

async function getUnclaimedDeal(request: APIRequestContext, claimedDealIds: Set<string>) {
  const response = await request.get(`${apiOrigin}/api/v1/deals?city=Ahmedabad&limit=100`);
  expect(response.ok()).toBeTruthy();
  const payload = await response.json() as { items?: PublicDeal[] };
  return payload.items?.find((deal) => !claimedDealIds.has(deal.id));
}

async function loginCustomer(page: Page) {
  await page.goto("/customer/login");
  await page.getByLabel("Email").fill(customerEmail!);
  await page.getByLabel("Password").fill(customerPassword!);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/$/, { timeout: 30_000 });
}

test("customer redemption shows a one-time token-only QR, clears it on close, and supports cancellation", async ({ page, request }) => {
  test.setTimeout(120_000);
  test.skip(!customerEmail || !customerPassword, "A disposable real customer account is required; credentials are never printed and mocked sessions are not accepted.");

  await loginCustomer(page);
  await page.goto("/customer/dashboard");
  const existingClaimIds = new Set(await page.locator(".customer-claim-row").evaluateAll((rows) => rows.map((row) => (row as HTMLElement).dataset.dealId || "")));
  const deal = await getUnclaimedDeal(request, existingClaimIds);
  test.skip(!deal, "No unclaimed published local offer is available for the disposable customer account.");

  await page.goto(`/?deal=${encodeURIComponent(deal!.id)}`);
  const details = page.locator(".offer-detail[role='dialog']");
  await expect(details).toBeVisible();
  await expect(details.getByRole("heading", { name: deal!.title })).toBeVisible();

  const actionResponse = page.waitForResponse((response) => response.request().method() === "POST" && Boolean(response.request().headers()["next-action"]));
  await details.getByRole("button", { name: "Redeem this offer" }).click();
  const qrDialog = page.getByRole("dialog", { name: "Your redemption QR" });
  const qr = qrDialog.getByTestId("redemption-qr");
  await expect(qr).toBeVisible({ timeout: 30_000 });
  const claimActionResponse = await actionResponse;
  expect(claimActionResponse.ok(), "the claim action should complete successfully").toBe(true);
  await expect(qrDialog).toContainText(deal!.title);
  await expect(qrDialog).toContainText(deal!.store.name);
  await expect(qrDialog).toContainText("Expires in");
  await expect(qrDialog).toContainText("Show this QR to the retailer");
  await expect(qr.locator("path")).toHaveAttribute("d", /M\d+ \d+h1v1h-1z/);
  await expect(page).not.toHaveURL(/credential=/i);

  await qrDialog.getByRole("button", { name: "Close dialog" }).click();
  await expect(qrDialog).toBeHidden();
  await details.getByRole("button", { name: "Redeem this offer" }).click();
  await expect(page.getByRole("dialog", { name: "Your redemption QR" })).toContainText("We can’t retrieve that credential again");
  await expect(page.getByTestId("redemption-qr")).toHaveCount(0);

  const retryDialog = page.getByRole("dialog", { name: "Your redemption QR" });
  await retryDialog.getByRole("button", { name: "Cancel this claim" }).click();
  await expect(retryDialog).toContainText("This claim was cancelled");
  await page.goto("/customer/dashboard#redemption-claims");
  await expect(page.getByRole("heading", { name: "Your offer claims" })).toBeVisible();
  const claimsError = page.locator("#redemption-claims [role='alert']");
  if (await claimsError.count()) throw new Error(`Claims listing failed: ${await claimsError.innerText()}`);
  await expect(page.locator(`.customer-claim-row[data-deal-id="${deal!.id}"] .customer-claim-status`)).toHaveText("revoked");
});

test("customer QR expiry clears the credential and the claim can be cancelled from the existing claims list", async ({ page, request }) => {
  test.setTimeout(120_000);
  test.skip(!customerEmail || !customerPassword, "A disposable real customer account is required; credentials are never printed and mocked sessions are not accepted.");

  await loginCustomer(page);
  await page.goto("/customer/dashboard#redemption-claims");
  const claimedDealIds = new Set(await page.locator(".customer-claim-row").evaluateAll((rows) => rows.map((row) => (row as HTMLElement).dataset.dealId || "")));
  const deal = await getUnclaimedDeal(request, claimedDealIds);
  test.skip(!deal, "No unclaimed published local offer is available for the disposable customer account.");

  await page.goto(`/?deal=${encodeURIComponent(deal!.id)}`);
  const details = page.locator(".offer-detail[role='dialog']");
  await details.getByRole("button", { name: "Redeem this offer" }).click();
  const qrDialog = page.getByRole("dialog", { name: "Your redemption QR" });
  await expect(page.getByTestId("redemption-qr")).toBeVisible({ timeout: 30_000 });
  await page.clock.install();
  await page.clock.fastForward(5 * 60 * 1000 + 10_000);
  await expect(qrDialog).toContainText("This QR has expired and can no longer be redeemed.");
  await expect(page.getByTestId("redemption-qr")).toHaveCount(0);

  await page.goto("/customer/dashboard#redemption-claims");
  const claimRow = page.locator(`.customer-claim-row[data-deal-id="${deal!.id}"]`);
  await expect(claimRow).toBeVisible();
  await claimRow.getByRole("button", { name: "Cancel claim" }).click();
  await expect(page.locator(`.customer-claim-row[data-deal-id="${deal!.id}"] .customer-claim-status`)).toHaveText("revoked");
});

test("customer redemption reports a network failure and allows retry", async ({ page, request }) => {
  test.setTimeout(120_000);
  test.skip(!customerEmail || !customerPassword, "A disposable real customer account is required; credentials are never printed and mocked sessions are not accepted.");

  await loginCustomer(page);
  await page.goto("/customer/dashboard#redemption-claims");
  const claimedDealIds = new Set(await page.locator(".customer-claim-row").evaluateAll((rows) => rows.map((row) => (row as HTMLElement).dataset.dealId || "")));
  const deal = await getUnclaimedDeal(request, claimedDealIds);
  test.skip(!deal, "No unclaimed published local offer is available for the disposable customer account.");

  await page.goto(`/?deal=${encodeURIComponent(deal!.id)}`);
  const details = page.locator(".offer-detail[role='dialog']");
  let interruptedAction = false;
  await page.route("**/*", async (route) => {
    const headers = route.request().headers();
    if (!interruptedAction && route.request().method() === "POST" && headers["next-action"]) {
      interruptedAction = true;
      await route.abort("failed");
      return;
    }
    await route.continue();
  });
  await details.getByRole("button", { name: "Redeem this offer" }).click();
  const qrDialog = page.getByRole("dialog", { name: "Your redemption QR" });
  await expect(qrDialog.getByRole("alert")).toBeVisible({ timeout: 30_000 });
  await expect(qrDialog.getByRole("button", { name: "Try again" })).toBeVisible();
  await expect.poll(() => interruptedAction).toBe(true);
  await qrDialog.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByTestId("redemption-qr")).toBeVisible({ timeout: 30_000 });
  await qrDialog.getByRole("button", { name: "Cancel claim" }).click();
  await expect(qrDialog).toContainText("This claim was cancelled");
});
