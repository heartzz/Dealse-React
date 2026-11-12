import assert from "node:assert/strict";
import { test } from "node:test";
import { assertAllowedBootstrapDatabaseTarget, assertDevelopmentBootstrapEnvironment } from "./bootstrap-root-admin-guards.js";

const localDevelopmentDatabaseUrl = "postgresql://dealse_dev_app:local-test-password@127.0.0.1:5432/dealse_dev?schema=public";

test("Root Admin bootstrap requires both explicit development environment settings", () => {
  assert.doesNotThrow(() => assertDevelopmentBootstrapEnvironment("development", "development"));
  for (const [nodeEnv, bootstrapEnv] of [
    [undefined, "development"],
    ["test", "development"],
    ["production", "development"],
    ["development", undefined],
    ["development", "production"],
  ] as const) {
    assert.throws(() => assertDevelopmentBootstrapEnvironment(nodeEnv, bootstrapEnv));
  }
});

test("Root Admin bootstrap accepts only the exact local development database target", () => {
  assert.doesNotThrow(() => assertAllowedBootstrapDatabaseTarget(localDevelopmentDatabaseUrl));
  const rejectedTargets = [
    "postgresql://dealse_dev_app:placeholder@localhost:5432/dealse_dev?schema=public",
    "postgresql://dealse_dev_app:placeholder@192.168.1.20:5432/dealse_dev?schema=public",
    "postgresql://dealse_dev_app:placeholder@db.example.invalid:5432/dealse_dev?schema=public",
    "postgresql://dealse_dev_app:placeholder@127.0.0.1:5433/dealse_dev?schema=public",
    "postgresql://dealse_dev_app:placeholder@127.0.0.1:5432/dealse_staging?schema=public",
    "postgresql://dealse_dev_app:placeholder@127.0.0.1:5432/dealse_prod?schema=public",
    "postgresql://other_user:placeholder@127.0.0.1:5432/dealse_dev?schema=public",
    "postgresql://dealse_dev_app:placeholder@127.0.0.1:5432/dealse_dev?schema=private",
    "postgresql://dealse_dev_app:placeholder@127.0.0.1:5432/dealse_dev?schema=public&host=remote.example.invalid",
  ];
  for (const target of rejectedTargets) assert.throws(() => assertAllowedBootstrapDatabaseTarget(target));
});
