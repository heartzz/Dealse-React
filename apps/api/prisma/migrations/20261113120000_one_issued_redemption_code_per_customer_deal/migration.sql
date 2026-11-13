DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "redemption_codes"
    WHERE "status" = 'issued'::"redemption_code_status"
    GROUP BY "deal_id", "customer_user_id"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION
      'Cannot add the one-issued-redemption-code index: duplicate issued codes exist for a customer and deal.';
  END IF;
END;
$$;

CREATE UNIQUE INDEX "redemption_codes_one_issued_per_deal_customer_key"
  ON "redemption_codes" ("deal_id", "customer_user_id")
  WHERE "status" = 'issued'::"redemption_code_status";
