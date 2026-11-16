import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createPostgresPoolConfig } from "./prisma.service.js";

test("local PostgreSQL config does not require the Render CA file", () => {
  const connectionString = "postgresql://user:password@127.0.0.1:5432/dealse_dev";
  const config = createPostgresPoolConfig(connectionString, "development");

  assert.equal(config.connectionString, connectionString);
  assert.equal(config.ssl, undefined);
});

test("production PostgreSQL config uses the Aiven CA and verified TLS", () => {
  const directory = mkdtempSync(join(tmpdir(), "dealse-ca-test-"));
  const caCertificatePath = join(directory, "aiven-ca.pem");
  const caCertificate = "test CA certificate contents";
  writeFileSync(caCertificatePath, caCertificate);

  try {
    const config = createPostgresPoolConfig(
      "postgresql://user:password@aiven.example:19206/defaultdb?sslmode=require&sslrootcert=%2Fwrong%2Fca.pem&application_name=dealse",
      "production",
      caCertificatePath,
    );
    const parsedUrl = new URL(config.connectionString!);

    assert.equal(parsedUrl.hostname, "aiven.example");
    assert.equal(parsedUrl.searchParams.get("application_name"), "dealse");
    assert.equal(parsedUrl.searchParams.has("sslmode"), false);
    assert.equal(parsedUrl.searchParams.has("sslrootcert"), false);
    assert.deepEqual(config.ssl, {
      ca: readFileSync(caCertificatePath, "utf8"),
      rejectUnauthorized: true,
    });
    if (typeof config.ssl === "object" && config.ssl !== null) {
      assert.equal("checkServerIdentity" in config.ssl, false);
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
