import { existsSync } from "node:fs";
import path from "node:path";
import { loadEnvFile } from "node:process";
import { fileURLToPath } from "node:url";

const webDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const localEnvFile = path.join(webDirectory, ".env.test.local");
if (existsSync(localEnvFile)) loadEnvFile(localEnvFile);

const accounts = [
  ["Customer A", ["DEALSE_E2E_CUSTOMER_EMAIL", "DEALSE_E2E_CUSTOMER_PASSWORD"]],
  ["Customer B", ["DEALSE_E2E_CUSTOMER_B_EMAIL", "DEALSE_E2E_CUSTOMER_B_PASSWORD"]],
  ["Retailer A", ["DEALSE_E2E_RETAILER_EMAIL", "DEALSE_E2E_RETAILER_PASSWORD"]],
  ["Retailer B", ["DEALSE_E2E_RETAILER_B_EMAIL", "DEALSE_E2E_RETAILER_B_PASSWORD"]],
];

let missingCount = 0;
for (const [accountName, variables] of accounts) {
  const missing = variables.filter((name) => !process.env[name]?.trim());
  if (missing.length) {
    missingCount += missing.length;
    process.stdout.write(`${accountName}: missing ${missing.join(", ")}\n`);
  } else {
    process.stdout.write(`${accountName}: credentials configured (not validated against Supabase)\n`);
  }
}

if (missingCount) {
  process.stdout.write(`\n${missingCount} required E2E credential variable(s) are missing. Set them in apps/web/.env.test.local; values are never displayed.\n`);
  process.exitCode = 1;
} else {
  process.stdout.write("\nAll four account credential pairs are configured. This check does not sign in or run authenticated tests.\n");
}
