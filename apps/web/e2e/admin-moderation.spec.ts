import { createHmac } from "node:crypto";
import { expect, test } from "@playwright/test";

function decodeBase32(secret: string) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const bits = secret.toUpperCase().replace(/=+$/g, "").split("").map((char) => alphabet.indexOf(char).toString(2).padStart(5, "0")).join("");
  const bytes: number[] = [];
  for (let index = 0; index + 8 <= bits.length; index += 8) bytes.push(Number.parseInt(bits.slice(index, index + 8), 2));
  return Buffer.from(bytes);
}

function currentTotp(secret: string) {
  const counter = Math.floor(Date.now() / 30_000);
  const counterBuffer = Buffer.alloc(8); counterBuffer.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac("sha1", decodeBase32(secret)).update(counterBuffer).digest();
  const offset = digest[digest.length - 1]! & 0x0f;
  const binary = ((digest[offset]! & 0x7f) << 24) | (digest[offset + 1]! << 16) | (digest[offset + 2]! << 8) | digest[offset + 3]!;
  return String(binary % 1_000_000).padStart(6, "0");
}

test("admin moderation routes redirect anonymous users to the dedicated sign-in", async ({ page }) => {
  for (const path of ["/admin/retailers", "/admin/stores", "/admin/offers", "/admin/admin-users", "/admin/admin-users/00000000-0000-4000-8000-000000000000"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/admin\/login/);
    await expect(page.getByRole("heading", { name: "Sign in to DealSe Admin" })).toBeVisible();
  }
});

test("admin sign-in and moderation list pages work with a real Supabase AAL2 account", async ({ page }) => {
  const email = process.env.DEALSE_E2E_ADMIN_EMAIL;
  const password = process.env.DEALSE_E2E_ADMIN_PASSWORD;
  const totpSecret = process.env.DEALSE_E2E_ADMIN_TOTP_SECRET;
  test.skip(!email || !password || !totpSecret, "Real admin browser verification needs DEALSE_E2E_ADMIN_EMAIL, DEALSE_E2E_ADMIN_PASSWORD and DEALSE_E2E_ADMIN_TOTP_SECRET; credentials are never displayed.");

  await page.goto("/admin/login");
  await page.getByLabel("Email").fill(email!);
  await page.getByLabel("Password").fill(password!);
  await page.getByRole("button", { name: "Sign in securely" }).click();
  await expect(page).toHaveURL(/\/admin(?:\?.*)?$/);
  await page.getByRole("button", { name: "Verify with authenticator" }).click();
  await page.getByLabel("Authenticator code").fill(currentTotp(totpSecret!));
  await page.getByRole("button", { name: "Verify and continue" }).click();
  await expect(page).toHaveURL(/\/admin(?:\?.*)?$/);

  for (const [path, heading] of [["/admin/retailers", "Retailers"], ["/admin/stores", "Stores"], ["/admin/offers", "Offer moderation"], ["/admin/admin-users", "Admin users"]] as const) {
    for (const width of [360, 390, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(path);
      await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible();
      const widths = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth, document: document.documentElement.scrollWidth }));
      expect(widths.document, `${path} overflows at ${width}px`).toBeLessThanOrEqual(widths.viewport + 1);
      await expect(page.locator(".admin-table")).toBeVisible();
      await expect(page.getByRole("button", { name: "Apply filters" })).toBeVisible();
      if (path === "/admin/admin-users") {
        await expect(page.getByRole("heading", { name: "Invite an administrator" })).toBeVisible();
        await expect(page.getByLabel("Email")).toBeVisible();
        const rootAdminRow = page.locator(".admin-table tbody tr").filter({ hasText: "Root Admin" }).first();
        if (await rootAdminRow.count()) await expect(rootAdminRow).toContainText("Full access");
      }
    }
    const review = page.getByRole("link", { name: "Review" }).first();
    if (await review.count()) {
      await review.click();
      await expect(page.getByRole("link", { name: "← Back to list" })).toBeVisible();
      const actions = path.includes("retailers")
        ? ["Approve retailer", "Reject application", "Suspend retailer", "Reactivate retailer"]
        : path.includes("stores")
          ? ["Verify and activate", "Reject verification", "Suspend store", "Reactivate store"]
          : ["Approve and publish", "Reject offer", "Suspend offer", "Resume offer"];
      for (const action of actions) {
        const button = page.getByRole("button", { name: action, exact: true });
        if (!(await button.count())) continue;
        const reason = page.locator('input[name="reason"]');
        if (action.startsWith("Reject") || action.startsWith("Suspend")) await expect(reason).toHaveAttribute("required", "");
        const currentUrl = page.url();
        page.once("dialog", (dialog) => dialog.dismiss());
        await button.click();
        await expect(page).toHaveURL(currentUrl);
      }
    }
  }
  await page.goto("/admin/admin-users");
  const adminDetails = page.getByRole("link", { name: "Manage" }).first();
  if (await adminDetails.count()) {
    await adminDetails.click();
    await expect(page.getByRole("heading", { name: "Account overview" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Save role and permissions" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Apply account action" })).toBeVisible();
  }
});
