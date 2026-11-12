import path from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { defineConfig, devices } from "@playwright/test";

const webDirectory = path.dirname(fileURLToPath(import.meta.url));
const apiDirectory = path.resolve(webDirectory, "../api");
const testAccountEnvFile = path.join(webDirectory, ".env.test.local");
if (existsSync(testAccountEnvFile)) loadEnvFile(testAccountEnvFile);
const apiPort = process.env.DEALSE_E2E_API_PORT || "3102";
const webPort = process.env.DEALSE_E2E_WEB_PORT || "3100";
const apiOrigin = `http://127.0.0.1:${apiPort}`;
const baseURL = process.env.DEALSE_E2E_BASE_URL || `http://127.0.0.1:${webPort}`;
const browserChannel = process.env.PLAYWRIGHT_CHANNEL || (process.platform === "win32" ? "chrome" : undefined);
const accountCredentialsForRunnerOnly = {
  DEALSE_E2E_CUSTOMER_EMAIL: "",
  DEALSE_E2E_CUSTOMER_PASSWORD: "",
  DEALSE_E2E_CUSTOMER_B_EMAIL: "",
  DEALSE_E2E_CUSTOMER_B_PASSWORD: "",
  DEALSE_E2E_RETAILER_EMAIL: "",
  DEALSE_E2E_RETAILER_PASSWORD: "",
  DEALSE_E2E_RETAILER_B_EMAIL: "",
  DEALSE_E2E_RETAILER_B_PASSWORD: "",
  DEALSE_E2E_ADMIN_EMAIL: "",
  DEALSE_E2E_ADMIN_PASSWORD: "",
  DEALSE_E2E_ADMIN_TOTP_SECRET: "",
};

process.env.DEALSE_E2E_API_URL = process.env.DEALSE_E2E_API_URL || apiOrigin;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  timeout: 45_000,
  reporter: process.env.CI
    ? [["list"], ["html", { outputFolder: "playwright-report", open: "never" }]]
    : "list",
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    ...(browserChannel ? { channel: browserChannel } : {}),
    ...devices["Desktop Chrome"],
  },
  projects: [{
    name: "chromium",
    use: {
      ...devices["Desktop Chrome"],
      ...(browserChannel ? { channel: browserChannel } : {}),
    },
  }],
  webServer: [
    {
      command: "node node_modules/tsx/dist/cli.mjs watch src/main.ts",
      cwd: apiDirectory,
      url: `${apiOrigin}/api/v1/health`,
      timeout: 90_000,
      reuseExistingServer: !process.env.CI,
      env: { PORT: apiPort, ...accountCredentialsForRunnerOnly },
    },
    {
      command: `node node_modules/next/dist/bin/next dev --hostname 127.0.0.1 --port ${webPort}`,
      cwd: webDirectory,
      url: baseURL,
      timeout: 120_000,
      reuseExistingServer: !process.env.CI,
      env: { DEALSE_API_URL: apiOrigin, ...accountCredentialsForRunnerOnly },
    },
  ],
});
