export type RetailerRedemptionPhase = "validation" | "confirmation";

export type RetailerRedemptionFailure = {
  status: number;
  message: string;
};

export const retailerRedemptionMessages = {
  verified: "QR verified — ready to redeem.",
  success: "Redemption successful!",
  alreadyUsed: "This QR code has already been used.",
  invalid: "Invalid QR code. Please scan a valid DealSe QR.",
  expired: "This QR code has expired. Ask the customer to generate a new one.",
  cancelled: "This redemption has been cancelled and cannot be used.",
  wrongStore: "This offer belongs to another store. Select the correct store.",
  unavailable: "This offer is currently unavailable.",
  network: "Unable to connect to DealSe. Check your connection and try again.",
  unauthorized: "You are not authorized to redeem offers for this store.",
  notValid: "This QR code is no longer valid. Ask the customer to show a current DealSe QR.",
} as const;

/** Convert only known API outcomes to retailer-safe text. Never display raw API details. */
export function retailerRedemptionErrorMessage(
  failure: RetailerRedemptionFailure,
  phase: RetailerRedemptionPhase,
): string {
  const message = failure.message.toLowerCase();

  if (failure.status === 0) return retailerRedemptionMessages.network;
  if (failure.status === 401 || failure.status === 403 || /retailer membership|not authorized|forbidden/.test(message)) {
    return retailerRedemptionMessages.unauthorized;
  }
  if (/expired or already used/.test(message)) return retailerRedemptionMessages.notValid;
  if (/cancelled|revoked/.test(message)) return retailerRedemptionMessages.cancelled;
  if (/expired/.test(message)) return retailerRedemptionMessages.expired;
  if (/already (?:been )?redeemed|already used|redeemed by another request/.test(message)) return retailerRedemptionMessages.alreadyUsed;
  if (/belongs to another store|wrong store|store not found/.test(message)) return retailerRedemptionMessages.wrongStore;
  if (/offer is no longer eligible|offer has reached|customer has reached|offer is unavailable/.test(message)) {
    return retailerRedemptionMessages.unavailable;
  }
  if (failure.status === 404 || /credential is unavailable|invalid credential/.test(message)) {
    return retailerRedemptionMessages.invalid;
  }
  return phase === "validation"
    ? "We could not verify this QR code. Please scan a valid DealSe QR and try again."
    : "We could not confirm this redemption. Please review the QR and try again.";
}
