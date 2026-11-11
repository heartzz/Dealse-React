# DealSe Customer App — Native UX Specification

**Status:** Design specification only. No React Native screens or authentication provider changes are included in this milestone.

## Product principles

- Let people browse public offers before asking them to sign in or share precise location.
- Make the store, offer, price and validity easy to understand before the customer travels.
- Ask for location in context and provide a city/locality selection fallback.
- Keep promotional language grounded in offer data; never invent distance, savings or availability.
- Use familiar native navigation, safe-area handling, gestures, keyboard behavior and permission prompts.

## App entry and navigation

```text
Splash
├── First launch → Onboarding → Location choice → Home
└── Returning launch → Home

Home tabs: Home | Explore | Saved | Stores | Profile
Each tab owns a native stack. Deal and store detail screens can be opened from every discovery surface.

Profile → Sign in with phone → Enter OTP → Profile
Saved (signed out) → Sign in with phone → return to Saved
```

Browsing remains available while signed out. Saving, managing account details and viewing account-linked activity prompt for sign-in. On successful authentication, return to the screen that requested it.

### Transitions

- Use a short native fade from Splash; show the logo on a plain surface and finish promptly.
- Onboarding advances horizontally with a visible page indicator and Skip/Continue actions.
- Home, Explore, Saved, Stores and Profile switch using a native bottom tab bar with retained tab state.
- Deal and store details push onto their tab’s stack; use the platform back gesture and a visible back button.
- Filters, sort options and location selection use a bottom sheet on phones; full-height sheet on compact devices.
- Search opens a focused search screen with the keyboard active; selecting a result closes search and pushes its detail.
- OTP entry stays in the auth stack. Back preserves the phone number and lets the customer edit it.
- Notification deep links open the relevant deal or store; expired/unavailable items show an explanatory state.

## Screen specifications

### 1. Splash

Show the supplied DealSe mark, wordmark and “Good Local Finds” on a white or pale-pink surface. Keep the splash short, use a system launch screen, and do not wait for a location lookup or network request before entering the app.

### 2. Onboarding

Three concise slides: discover nearby local offers; explore independent stores; save offers for later. Use original DealSe marketplace imagery, large headings, short copy, a page indicator, Skip and Continue. The final action is “Find local offers.” Do not promise guaranteed discounts or retailer coverage.

### 3. Location permission and choice

Explain the benefit before invoking the OS permission prompt. Offer “Use my location” and “Choose city” as equally understandable paths. Permission denial falls back to city and locality selection; never block the home screen. Show the selected locality in the app bar, provide a change action, and let customers browse with approximate location only when the user consents.

### 4. Phone OTP sign-in

Phone entry uses the India country prefix by default with an editable country selector, numeric keypad, clear formatting, and an explicit consent/privacy link. The OTP screen has six accessible digit positions, paste/autofill support, verification progress, resend cooldown, “Change number,” and clear invalid/expired/network errors. Do not reveal whether an unverified phone belongs to another account. On success, return to the initiating destination.

**Milestone boundary:** OTP is a planned native-app flow. The current website uses its existing email/password flow; this document does not activate or configure phone OTP.

### 5. Home

Compact top bar with DealSe mark, current locality and profile action; full-width search; swipeable featured offer cards; a compact category grid; trending deals; nearby two-column cards; a local-store carousel; best savings; recent offers. Keep each offer tied to the API result and show a demo-data notice when the development catalogue is active. Use pull to refresh, retain the last successful content during refresh, and announce refresh/results accessibly.

### 6. Explore

Search entry, category chips, result count, and filter/sort controls above a two-column deal grid. Filters are applied with a bottom sheet and summarized as removable chips. Search supports deal, product and store terms returned by the API. Keep the query and selected category when opening a detail and returning.

### 7. Categories

Show a four-column icon grid using a single icon family, consistent icon size and short labels. Category selection pushes a category results screen with the category name, active filters and matching offers. Empty categories suggest nearby categories without fabricating results.

### 8. Search results

Keep the search field editable at the top, show the query and result count, then filters and results. Suggestions may use known categories/stores only. Empty results offer clear-query and browse-category actions. Loading, offline and server-error states distinguish retry from no matches.

### 9. Deal details

Use a large, cropped promotional image; offer badge; title; store and locality; original and offer price when returned; validity; full description; terms; and a persistent, safe-area-aware primary “Redeem this offer” action only where the current redemption capability is available. Save is secondary. Explain redemption before the customer commits; expired offers disable redemption and explain why. Do not invent price data or eligibility.

### 10. Store details

Show store image, name, category and locality, followed by current deals from that store. Show directions/contact only when real, verified values exist. Include a no-current-offers state and nearby-store suggestions only when supplied by discovery data.

### 11. Saved deals

Show active saved offers first, with title, store, image, offer value, validity, and remove/save state. Preserve saved state through the backend. Expired or removed offers have clear labels and cannot be redeemed. Signed-out entry explains sign-in and returns here after authentication. Empty state links back to Explore.

### 12. Notifications

Ask permission after the customer has seen value, not on first launch. Provide an in-app inbox with unread state, timestamp and source store/offer; tapping opens the relevant destination. A denied OS permission leaves the inbox available and provides a link to system settings. Notifications are only shown when the backend provides them.

### 13. Customer profile

Show display name and verified contact method; saved count; notification preferences; location preference; help, privacy and terms; sign out. Keep account deletion/recovery actions explicit and confirm consequential actions. Never display access tokens or sensitive auth details.

## Loading, empty and error behavior

| State | Behavior |
|---|---|
| Initial content | Use card-shaped skeletons that reserve image and text dimensions; avoid a full-screen spinner after splash. |
| Refresh | Keep current data visible, show a small progress indicator, and announce when refreshed. |
| No deals | Explain that no live offers match; offer clear filters, another category or locality. |
| No saved deals | Explain how to save an offer and link to Explore. |
| No stores | Keep search and category discovery available; do not render empty branded cards. |
| Offline | Preserve previously loaded data where available, mark it as last updated, and provide retry. Do not describe stale offers as current. |
| API error | Plain-language message, retry action, preserve the user’s query/filters and avoid losing the current screen. |
| Image failure | Use a designed neutral fallback with the category icon; never show a broken-image glyph. |
| Authentication error | Keep entered phone/email as appropriate, expose the cause and next action, and do not lose the intended destination. |

## Native design tokens

These values continue the existing customer website palette and design system. Validate contrast again in the native rendering before release.

### Color

| Token | Value | Use |
|---|---|---|
| `brand.pink` | `#FF4081` | Main customer action and selected tab |
| `brand.pinkDark` | `#DF2D70` | Pressed action |
| `brand.pinkInk` | `#C92F68` | Emphasis text, offer labels and icons |
| `brand.pinkSoft` | `#FFF0F5` | Selected/quiet surfaces |
| `surface.default` | `#FFFFFF` | Cards and sheets |
| `surface.subtle` | `#F7F8F9` | Search and secondary panels |
| `text.primary` | `#17202A` | Headings and primary copy |
| `text.secondary` | `#67717D` | Supporting text |
| `border.default` | `#E8ECEE` | Dividers and outlines |
| `status.success` | `#16804A` | Success with text/icon |
| `status.warning` | `#B45309` | Warning with text/icon |
| `status.error` | `#B42318` | Error with text/icon |
| `accent.orange` | `#FF9800` | Limited offer emphasis; verify foreground contrast |

### Type, spacing and shape

- **Font:** Manrope for prominent headings; DM Sans for body and controls, with system fallbacks for Gujarati and Devanagari. Use native platform font rendering and avoid loading remote fonts at runtime.
- **Type scale:** 32/38 hero title; 24/30 screen title; 20/26 section title; 16/22 card title/body; 14/20 secondary body; 12/16 metadata; 11/14 compact labels. Avoid below 12 px equivalent for important information.
- **Spacing:** 4, 8, 12, 16, 20, 24, 32, 40. Screen horizontal padding 16; card gap 10–12; section gap 24–32.
- **Radii:** 8 small controls; 12 deal cards; 16 sheets and feature cards; pill for filter chips.
- **Elevation:** subtle card border/shadow; stronger only for sheets and floating navigation. Respect reduced-motion and system contrast preferences.
- **Touch targets:** at least 44 × 44 points; visible pressed and focus states; labels accompany tab icons.

## Reusable component inventory

- `CustomerAppBar`: logo, locality selector, profile action.
- `SearchField`: labeled search, clear, submit, loading and error states.
- `FeaturedOfferCarousel`: API-backed offers, snap paging, accessible page count.
- `CategoryTile` / `CategoryGrid`: consistent icon silhouette, dimensions and labels.
- `DealCard`: image, offer badge, title, store, locality, verified prices, favorite and validity.
- `StoreCard`: image, name, locality and offer count from discovery data.
- `FilterSheet`: category and supported sort/filter options; active filter chips.
- `CustomerTabBar`: five labeled destinations, selected state, safe-area inset.
- `PricePair`: original price strike-through and current price only when supplied.
- `OfferValidity`: date/status text independent of badge color.
- `LoadingSkeleton`, `EmptyState`, `OfflineNotice`, `ErrorState`, `InlineToast`.
- `AuthFormField`, `OtpCodeInput`, `PermissionExplainer`.

## Interaction and accessibility rules

- Respect safe-area insets and keyboard avoidance; keep the primary action visible above the keyboard where applicable.
- Use native back gestures and preserve list scroll position when returning from detail.
- Haptics are limited to successful save/selection and can be disabled by OS settings.
- Announce result counts, save state, loading and errors for screen readers; do not rely on pink/green alone.
- Provide accessibility labels for icon-only close, save, location and share controls.
- Support large text without clipping offer titles or terms; cards may grow vertically when system type size increases.
- Use reduced motion for carousel and navigation animations when requested by the OS.

## API and implementation boundary

The native app consumes the existing versioned REST API and typed client. PostgreSQL and all authorization remain behind NestJS. Customer favorites, profile, discovery, store/deal detail and notifications are server-backed; client state is limited to transient UI, search input and cache. Do not embed retailer ownership or authorization rules in the app. Phone OTP requires a separately approved provider/ADR and backend integration before implementation.
