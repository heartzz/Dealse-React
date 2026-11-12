import assert from "node:assert/strict";
import test from "node:test";
import { auditActorLabel } from "./audit-actor-label.mjs";

test("audit actor label handles an audit event whose actor was removed", () => {
  assert.equal(auditActorLabel(null, "admin"), "admin");
});

test("audit actor label falls back when the related profile is absent", () => {
  assert.equal(auditActorLabel({ emailNormalized: "admin@example.test", profile: null }), "admin@example.test");
});

test("audit actor label prefers profile name, then email, then actor type", () => {
  assert.equal(auditActorLabel({ emailNormalized: "admin@example.test", profile: { displayName: "DealSe Admin" } }, "admin"), "DealSe Admin");
  assert.equal(auditActorLabel({ emailNormalized: "admin@example.test", profile: null }, "admin"), "admin@example.test");
  assert.equal(auditActorLabel(null), "Administrator");
});
