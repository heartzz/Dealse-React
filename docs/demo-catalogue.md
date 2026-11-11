# DealSe local demo catalogue

The synthetic Ahmedabad catalogue is for local UI and workflow evaluation. It is fictional and must not be described as a real retailer or a live commercial offer.

## Seed

Use a local PostgreSQL database named `dealse_dev` on loopback only. The seed refuses production mode, remote hosts, and any other database name. It never creates an identity or changes Supabase Auth. The active DealSe retailer user is selected automatically only when exactly one exists; if there are several, add the intended internal user UUID to ignored `apps/api/.env` as `DEALSE_DEMO_RETAILER_USER_ID`.

From the repository root:

```powershell
pnpm --filter @dealse/api db:seed:demo
```

The seed uses stable IDs and upserts. It adds ten active demo retailers and owner memberships for the selected development retailer user, ten stores, twenty products, and twenty currently published offers. Each store, product, offer, and membership remains associated with its own retailer. Retailer APIs continue to enforce their existing membership and tenant checks.

The eight demo categories reuse the existing taxonomy and add only `Grocery & Supermarket` and `Footwear` when those slugs do not already exist. Promotions use original, optimized local catalogue photographs at `apps/web/public/assets/demo/catalogue/`; no external image host is required.

The seed does not delete or prune any records. Re-running it updates only the stable demo records and keeps counts unchanged.
