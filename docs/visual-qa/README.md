# Retailer UI visual QA

Screenshots captured from the shared retailer UI and shared retailer workspace styles at desktop and tablet viewport sizes. The preview uses an isolated fixture to exercise presentation only; it does not represent live API data or an authenticated Next.js session.

- `create-deal-and-customer-preview.png` — desktop offer editor and customer-facing preview
- `create-deal-tablet.png` — tablet offer editor layout
- `store-profile.png` — store profile form
- `products.png` — product catalogue and add-product form

## Customer offer detail review

- `customer-offer-detail-before.png` — screenshot supplied by the user, showing the customer offer detail at 1366 × 768.
- Findings: the card could clip long content; the overlay had no bounded detail scroll region on desktop; the deal title was omitted in the API presenter and the store name took its place as the heading; detail text was too small; and area/city could repeat.

## Customer demo catalogue

- `demo-catalogue-home.png` and `demo-catalogue-mobile.png` — historical captures from the earlier catalogue visual QA. Use the final responsive captures below for current layout review.

## Customer responsive marketplace — final production captures

Captured from the built Next.js production server on 10 Nov 2026 using the live API-backed demo catalogue. Viewport sizing was set through Chrome DevTools Protocol; all four mobile widths and tablet/desktop widths were checked for horizontal overflow. No broken images were reported in the rendered 390 px homepage.

- `customer-mobile-390.png` — 390 × 844 customer homepage, including the compact header, featured carousel, category grid and five-tab navigation.
- `customer-mobile-390-deals.png` — 390 × 844 two-column offer cards with image, badge, pricing, locality and validity.
- `customer-mobile-390-deal-detail.png` — 390 × 844 offer detail with image, terms, validity, redeem and save actions.
- `customer-desktop-1440.png` — 1440 × 1000 desktop marketplace homepage.

The home sections use distinct offer records in the default view. Search and category filtering continue to query the full API-backed offer set.
