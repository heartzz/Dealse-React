# Prototype Instructions

Run the local server yourself and open the preview in the browser available to this environment. Do not give the user server-start instructions when you can run it.

Keep the existing selected DealSe local-discovery page design and layout: header/search, editorial hero and photo collage, category rail, nearby deal cards, local story and Ahmedabad skyline. Preserve the supplied DealSe logo, content hierarchy, spacing and responsive behavior. The customer-facing page uses the customer-app pink palette.

The public For Stores page is a separate destination with the retailer teal palette (`#009688`, `#00796B`, `#E6F4F2`). Its content should reflect the approved product materials: local customer discovery, retailer-controlled offers and terms, store/product information, in-store QR redemption, and performance/history only where those events are available. Do not present disputed fees, guaranteed reach, redemption fraud claims, or business results as settled facts.

Offer cards open the existing offer detail view. Keep its merchant, offer, details, terms, location and save/directions actions, and include a clear Redeem This Offer action. Its dialog may show an illustrative QR only when it is clearly marked as a non-redeemable sample; real redemption requires a backend credential.

Keep `.openai/hosting.json`, `worker/index.js`, `scripts/prepare-sites-build.mjs`, and `tests/sites-worker.test.mjs` intact so the same local prototype can be handed to Sites. Before a Sites handoff, run `npm run build` and `npm run test:sites`; the build must leave `dist/client/index.html`, `dist/server/index.js`, and `dist/.openai/hosting.json`.
