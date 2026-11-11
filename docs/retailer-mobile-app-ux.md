# DealSe Retailer App — Mobile UX Specification

**Status:** UX specification for review. No React Native implementation is included in this milestone.

## Product principles

- Help a local retailer publish a clear, accurate offer in a few minutes, from a phone.
- Keep retailer actions direct and forgiving: save partial drafts, explain errors beside fields, and never hide pricing or validity requirements.
- Keep DealSe teal actions (`#009688`, `#00796B`) distinct from customer-facing pink.
- Make API-backed state explicit. Do not invent unread counts, analytics, or upload success when those services are unavailable.

## Navigation

Use a native bottom tab bar with **Home**, **Offers**, **Products**, **Store**, and **Account**. A prominent teal **Create offer** action opens the offer wizard from Home and Offers. Keep platform-native navigation headers, safe areas, keyboard avoidance, and back gestures. The wizard uses a stack above the tabs; opening it preserves the current tab and draft.

## Screens and flows

### 1. Login and OTP

- Email/password is the currently implemented Supabase identity flow. Phone OTP is a later milestone; show it only after the OTP provider and backend session contract are configured.
- Login screen: DealSe retailer mark, email, password, show/hide password, validation, sign-in action, registration link, and password recovery entry point if supported.
- Loading disables duplicate submit. Authentication errors appear below the relevant field or as a readable form message. Never place credentials in logs or analytics.

### 2. Onboarding

- Show steps for retailer profile and first store setup, with a clear progress header and “finish later” where the backend allows it.
- Store fields: name, category, address, locality, city, region, optional description. Review and confirm before save.
- A successful save opens Home. If the retailer has no store, make store setup the next action before offer creation.

### 3. Dashboard / Home

- Greeting and active store selector at the top; primary **Create offer** action directly below.
- Compact summary cards for offers, products, and published offers using real API values only.
- Recent offers list with status and one-tap edit. Helpful empty state points to Create offer.
- Refresh on pull and show last-load retry state when the API fails.

### 4. Store management

- Store list/selector; store details use grouped business, location, and public description fields.
- Save action remains visible above the keyboard when editing. Confirm successful save and preserve unsaved input after recoverable API errors.
- Store logo/image is unavailable until the media upload endpoint is implemented; do not display an active upload control before then.

### 5. Product management

- Search field, status filter, product rows with image only when the API has a real image, title, category, and status.
- Add/edit form: name and category required; brand, store assignment, and description optional as allowed by API.
- Archive asks for confirmation and updates only after the API succeeds. Empty, no-search-results, and error states are distinct.

### 6. Create offer wizard

Keep one editable draft object across all steps. The visible stepper supports going back; leaving the wizard prompts only when unsaved changes cannot be preserved. A persistent Save draft action is available throughout.

1. **Basic offer:** title, store, category, short description. Keep the first step focused on those essentials.
2. **Pricing:** discount mechanic, percentage or fixed amount, original price, and calculated offer price. For percentage, calculate `original × (1 − percent / 100)`; for fixed amount, calculate `original − amount`. Round to the currency’s supported precision and prevent negative or greater-than-original results. Let the retailer adjust a calculated price; recalculate when the discount inputs change.
3. **Details:** detailed description, terms, start/end dates, optional featured products. Explain required fields before publishing; draft may retain incomplete optional content.
4. **Image:** preview, replace, and remove an image using an approved media picker once backend upload/storage is available. Until then, show a truthful unavailable state and any supported existing hosted image reference. Crop using a fixed card ratio and preserve the source.
5. **Preview and publish:** customer-like image, store, category, offer text, savings/prices, dates, and terms. Save draft and publish are separate actions; publishing requires server validation and confirmation.

Validation should be field-specific. On error, move to the first invalid step, focus the relevant field, and preserve every entered value. Do not require optional products, image, long description, or terms to save an early draft. Do not claim that a draft is publicly discoverable.

### 7. Published offers and drafts

- Offers screen has Published, Draft, and Paused filters based on returned status.
- Rows show image, title, validity, store, status, and contextual actions: edit draft, preview, pause published, or resume/publish when the API permits.
- Confirm pause/publish, prevent duplicate submits, refresh from the API after success, and show per-list loading, empty, and error states.

### 8. Notifications

- Notifications tab/entry is a later capability until an authenticated retailer notifications API and push provider are configured.
- Once available: permission is requested only after explaining value; inbox groups unread/recent, marks read through the API, and deep-links to the related offer/store. No fabricated notification cards or badges.

### 9. Account and settings

- Show authenticated retailer name/email and sign-out. Add session/device controls only when supported by auth APIs.
- Confirm sign-out, clear app session through Supabase, and return to login. Account/profile edits should use backend-supported fields only.

## Shared components

- `RetailerTopBar`, `StoreSwitcher`, `BottomTabs`, `CreateOfferAction`
- `StepProgress`, `FormSection`, `TextField`, `CurrencyField`, `SelectSheet`, `DatePickerField`
- `DealCustomerPreview`, `DealStatusPill`, `ProductRow`, `StoreSummaryCard`
- `StickyFormActions`, `InlineFieldError`, `LoadingView`, `EmptyState`, `RetryState`, `ConfirmActionSheet`

## Tokens and touch behavior

Use the web workspace’s teal palette and shared typography: primary `#009688`, pressed `#00796B`, soft `#E6F4F2`, surface `#FFFFFF`, background `#F8FAFC`, text `#17202A`, muted `#6B7280`, border `#E5E7EB`. Use 8-point spacing increments (4 for compact icon gaps), 12–16 pt control corner radii, and restrained elevation. Body text should remain at least 14 pt, labels at least 12 pt, and touch targets at least 44×44 pt. Respect Dynamic Type, contrast, VoiceOver labels, Reduce Motion, keyboard safe areas, and device safe areas.

## Data and state behavior

- NestJS remains the business authorization layer; call the generated/shared API client with the authenticated session and never expose service credentials.
- Keep server state in a query cache with invalidation after successful mutations; keep the current wizard draft in local form state and restore it on a network retry.
- Do not cache long-lived access tokens in general-purpose storage. Use the approved Supabase mobile session integration and secure platform storage.
- No offline publishing. If offline, preserve the local draft and clearly mark it as unsynced; retry idempotently when connectivity returns.

## Open dependencies before native implementation

- Approve this UX specification.
- Decide and configure the phone OTP milestone before showing OTP as a real login method.
- Add and secure the retailer media upload API before implementing native image upload.
- Add a retailer notifications API and push delivery decision before building a populated notification inbox.
- Keep product imagery optional until the product image APIs and assets are available.
