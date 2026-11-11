# DealSe customer and retailer pages — visual QA

Final result: **passed**

## Review

- Kept the selected local-deals homepage layout: header and search, editorial hero collage, category rail, offer cards, local story, Ahmedabad skyline and footer.
- Replaced teal interface accents with the customer's pink palette. The supplied logo and existing layout remain in place.
- Reviewed the homepage and offer details in the browser at desktop and 390 × 844 mobile sizes.
- Confirmed offer details display the offer, merchant, location, rating, details and terms, with Redeem This Offer visible in the mobile view.
- Customer redemption now issues a readable one-time preview code; the dialog explains that it works only in the matching retailer workspace during the current page session.
- Reviewed the new For Stores page at desktop and 390 × 844 mobile sizes. It has a distinct teal palette and presents the store setup → offer creation → in-store redemption flow, plus profile and activity/history features grounded in the provided materials.
- Confirmed Get started opens a four-step retailer profile setup: contact, store identity and location, optional store details, and review.
- Checked required-field validation, edit links from review, and successful completion on desktop and 390 × 844 mobile. The mobile fields, review cards, and fixed footer controls remain usable without horizontal overflow.
- Confirmed setup completion leads into a retailer workspace preview with Overview, Offers, Redeem, Activity, and Store profile views. The dashboard shows only draft and session-redemption counts, with no invented reach, sales, or performance data.
- Completed a sample offer draft from title, description, dates, and terms through a customer-facing preview; saved draft stays in the current page session and is clearly not published.
- Reviewed workspace and offer preview at desktop and 390 × 844 mobile sizes. Mobile navigation, form fields, offer preview, and draft list remain usable without horizontal overflow.
- Audited the create-offer task for blank-page friction, unclear copy expectations, and repetitive date entry. Added four editable quick starts (discount, bundle, gift, and quiet-time), optional category-specific Gemini ideas, clearer field guidance, and one-tap 7/14-day schedules.
- Checked the create-offer builder at 390 × 844: quick starts stack in a two-column grid, the optional AI section is distinct, the form remains single-column, and the terms/review controls continue below the fold without horizontal overflow. Placeholder details are blocked at review until replaced; date shortcuts populate local calendar dates.
- Confirmed missing Gemini configuration gives a clear fallback and does not clear the entered offer. Gemini is off by default; enabling real requests requires a server-side key plus retailer authentication and request limits. The prompt sends only category and the optional retailer note, with an in-product warning about Google free-tier data use.
- Added a category-and-wording image suggestion, retailer image upload (PNG/JPG/WebP up to 5 MB), and an optional Gemini image-generation action. The selected visual appears in the customer-style offer preview and saved draft thumbnail.
- Checked the customer-page draft preview and uploaded image at 390 × 844. The image crops responsively, and a visible draft-only notice makes clear the offer is not live.
- Gemini image generation uses the paid Gemini 3.1 Flash Image model and remains disabled until a server-side key, retailer authentication, and request limits are configured. Only an explicit click sends category, headline, and description to Google. Image uploads stay in the current browser session.
- Confirmed the prototype still does not create an account, publish offers, or persist retailer data beyond the page session. AI text/image requests transmit only the fields disclosed beside their controls, and the customer marketplace’s live publishing connection remains out of scope.

- Added an in-store code entry flow: check a code, verify its store and valid-through date, confirm redemption once, and see used, expired, wrong-store, and unknown-code states.
- Redemption history and counts are scoped to the current page session. This prototype does not issue a signed credential, synchronize across devices, authenticate staff, or provide camera/QR scanning.
- A production flow needs authenticated retailer access, server-side offer and expiry checks, atomic one-time redemption, and an audit record. A signed QR scanner can then be connected to the same backend redemption operation.
