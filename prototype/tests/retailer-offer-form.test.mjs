import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeOptionalOfferFields, optionalOfferPayload } from "../src/retailer-offer-form.js";

test("nullable optional API text fields hydrate as controlled form strings", () => {
  assert.deepEqual(normalizeOptionalOfferFields({ summary: null, details: null, imageReference: null }), {
    summary: "",
    details: "",
    imageReference: "",
  });
});

test("optional create payload omits empty text fields and trims provided values", () => {
  assert.deepEqual(optionalOfferPayload({ summary: "  ", details: "  More detail  ", imageReference: null }), {
    details: "More detail",
  });
});

test("optional update payload preserves explicit clears without coercing unrelated values", () => {
  assert.deepEqual(optionalOfferPayload({ summary: "", details: "Terms apply", imageReference: "" }, { editing: true }), {
    summary: null,
    details: "Terms apply",
    imageReference: null,
  });
});
