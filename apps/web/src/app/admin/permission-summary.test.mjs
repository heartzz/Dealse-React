import assert from "node:assert/strict";
import test from "node:test";
import { permissionSummary } from "./permission-summary.mjs";

test("Root Admin displays effective full access without individual permission grants", () => {
  assert.equal(permissionSummary("ROOT_ADMIN", []), "Full access");
});

test("other roles display their explicit permissions or None", () => {
  assert.equal(permissionSummary("ADMIN", ["RETAILERS_READ", "OFFERS_REVIEW"]), "retailers read, offers review");
  assert.equal(permissionSummary("ADMIN", []), "None");
});
