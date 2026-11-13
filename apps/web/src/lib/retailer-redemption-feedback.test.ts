import assert from "node:assert/strict";
import { test } from "node:test";
import { retailerRedemptionErrorMessage, retailerRedemptionMessages } from "./retailer-redemption-feedback";

test("successful validation and confirmation have distinct retailer messages", () => {
  assert.equal(retailerRedemptionMessages.verified, "QR verified — ready to redeem.");
  assert.equal(retailerRedemptionMessages.success, "Redemption successful!");
});

test("maps already redeemed credentials", () => {
  assert.equal(
    retailerRedemptionErrorMessage({ status: 409, message: "Credential has already been redeemed." }, "validation"),
    "This QR code has already been used.",
  );
});

test("maps invalid credentials without exposing the backend message", () => {
  assert.equal(
    retailerRedemptionErrorMessage({ status: 404, message: "Credential is unavailable." }, "validation"),
    "Invalid QR code. Please scan a valid DealSe QR.",
  );
});

test("maps expired credentials from validation and confirmation", () => {
  const failure = { status: 409, message: "Credential has expired." };
  assert.equal(retailerRedemptionErrorMessage(failure, "validation"), "This QR code has expired. Ask the customer to generate a new one.");
  assert.equal(retailerRedemptionErrorMessage(failure, "confirmation"), "This QR code has expired. Ask the customer to generate a new one.");
});

test("maps cancelled credentials", () => {
  assert.equal(
    retailerRedemptionErrorMessage({ status: 409, message: "Credential has been cancelled." }, "confirmation"),
    "This redemption has been cancelled and cannot be used.",
  );
});

test("maps a missing or mismatched selected store", () => {
  assert.equal(
    retailerRedemptionErrorMessage({ status: 404, message: "Store not found." }, "validation"),
    "This offer belongs to another store. Select the correct store.",
  );
});

test("maps unavailable offers and capacity conflicts", () => {
  assert.equal(
    retailerRedemptionErrorMessage({ status: 409, message: "Offer is no longer eligible for redemption." }, "confirmation"),
    "This offer is currently unavailable.",
  );
  assert.equal(
    retailerRedemptionErrorMessage({ status: 409, message: "This offer has reached its redemption limit." }, "confirmation"),
    "This offer is currently unavailable.",
  );
});

test("maps network failures and retailer authorization failures", () => {
  assert.equal(retailerRedemptionErrorMessage({ status: 0, message: "internal network detail" }, "validation"), retailerRedemptionMessages.network);
  assert.equal(retailerRedemptionErrorMessage({ status: 403, message: "Active retailer membership is required." }, "confirmation"), retailerRedemptionMessages.unauthorized);
  assert.equal(retailerRedemptionErrorMessage({ status: 401, message: "Bearer token rejected" }, "validation"), retailerRedemptionMessages.unauthorized);
});

test("keeps ambiguous legacy conflict responses safe and does not guess a specific credential state", () => {
  assert.equal(
    retailerRedemptionErrorMessage({ status: 409, message: "Credential is expired or already used." }, "validation"),
    retailerRedemptionMessages.notValid,
  );
});

test("uses safe phase-specific fallbacks instead of displaying backend details", () => {
  assert.equal(
    retailerRedemptionErrorMessage({ status: 500, message: "secret stack trace and credential" }, "validation"),
    "We could not verify this QR code. Please scan a valid DealSe QR and try again.",
  );
  assert.equal(
    retailerRedemptionErrorMessage({ status: 500, message: "secret stack trace and credential" }, "confirmation"),
    "We could not confirm this redemption. Please review the QR and try again.",
  );
});
