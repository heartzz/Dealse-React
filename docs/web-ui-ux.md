# DealSe Web UI/UX Blueprint

**Status:** Approved UX source of truth; responsive prototype implementation is in progress.  
**Scope:** Responsive DealSe web experience: public marketing and deal discovery, retailer desktop workspace, and admin workspace. Customer and retailer mobile apps are separate future experiences.

## 1. Product framing

DealSe connects nearby customers with local retailers through relevant offers. The product should help a customer decide where to shop nearby and help a retailer publish an offer with little effort, understand its performance, and retain control of their shop. The story is rooted in local commerce and the problem of quiet trading periods. The web experience should communicate that value without making retailers feel that their business is being reduced to a discount.

### Experience principles

1. **Local first:** make city, area, distance, category, and store identity easy to understand.
2. **Retailer control:** retailers choose their offer, terms, schedule, and whether it is active.
3. **Fast to act:** a customer can find a deal and reach the store in a few clear steps; a retailer can publish with a guided, short workflow.
4. **Trust before urgency:** show clear terms, dates, eligibility, and store details before redemption. Time limits must be factual, never fabricated.
5. **Plain language:** use familiar terms and short explanations; avoid unexplained marketing or analytics jargon.
6. **One coherent product:** public pages, retailer workspace, and admin use the same typography, color roles, spacing, and interaction patterns, with distinct navigation shells.

### Product facts used from supplied materials

- DealSe is for discovery of local businesses and offers, initially centered on Ahmedabad and nearby Gujarat cities.
- Retailers need simple store setup, deal creation and management, and basic performance information.
- Customers browse by location and category, view a deal or store, save offers, find directions, and may continue toward an in-store redemption.
- QR redemption and offline point-of-sale use are described in the retailer catalogue, but the web redemption path is not established.
- The founding story emphasizes fair access to local demand, retailer agency, and bringing customers back to neighbourhood businesses.

These are product inputs, not independently verified operating terms. Do not turn numerical claims, pricing, commission, eligibility, or availability statements from the source material into permanent UI copy until the business confirms them.

## 2. Information architecture and sitemap

```text
DealSe Web
├── Public
│   ├── /                         Home / local deal discovery
│   ├── /deals                    Browse deals
│   ├── /search                   Search results
│   ├── /categories/[slug]        Category results
│   ├── /deals/[slug]             Deal details
│   ├── /stores/[slug]            Store / retailer profile
│   ├── /about                    Mission and founding story
│   ├── /for-retailers            Retailer value proposition
│   ├── /help                     Help and contact entry
│   ├── /help/[slug]              Help article / FAQ
│   ├── /terms                    Terms
│   └── /privacy                  Privacy
├── Customer access (only as needed for saved deals)
│   ├── /account/sign-in
│   ├── /account/create
│   ├── /account/saved             Saved deals (authenticated)
│   └── /account                  Account basics
├── Retailer workspace
│   ├── /retailer/sign-in
│   ├── /retailer/register
│   ├── /retailer/setup            Guided store setup
│   ├── /retailer                  Dashboard
│   ├── /retailer/products
│   ├── /retailer/products/new
│   ├── /retailer/deals
│   ├── /retailer/deals/new
│   ├── /retailer/deals/[id]/preview
│   ├── /retailer/deals/[id]
│   ├── /retailer/analytics
│   ├── /retailer/store
│   └── /retailer/help
└── Admin workspace
    ├── /admin/sign-in
    ├── /admin
    ├── /admin/retailers
    ├── /admin/retailers/[id]
    ├── /admin/deals
    ├── /admin/deals/[id]
    ├── /admin/categories
    └── /admin/reports (only if needed for moderation operations)
```

Public navigation: **Deals**, **Categories**, **For retailers**, **About**, location selector, search, and account/saved deals. Retailer and admin areas use role-specific side navigation. Admin routes are not linked from public navigation.

## 3. Core user flows

### Customer: find a nearby offer

1. Arrive on home from search, a shared link, or direct visit.
2. Set or confirm city/area; request browser location only after explaining why. Manual city/area selection remains available.
3. Browse nearby deals, search a product/store/category, or open a category.
4. Refine results by category, distance, and relevant offer status; show active dates and distance on each card.
5. Open a deal, review retailer, terms, validity, location, and any redemption instructions.
6. Save the deal. If signed out, preserve the intent and offer a clear sign-in/create-account step; return the customer to the deal afterward.
7. Continue toward redemption using the confirmed redemption path. Until that path is decided, the web page can show store directions and an explicit “How to redeem” section rather than implying a web QR scanner.

### Customer: move from deal to store

1. Open deal detail → select **View store** or **Get directions**.
2. Store profile explains the business, address, opening hours when available, and current offers.
3. Directions open a mapping destination in a new tab/app where supported. If address/location is missing, show the address and a copy action.

### Retailer: register and publish an offer

1. Open **For retailers** → review the service and eligibility information → **Create retailer account**.
2. Register with the minimum required contact fields and verified sign-in method (method to be chosen in implementation).
3. Complete guided store setup: store identity, category, address/location, contact, hours, and optional imagery. Show progress and allow save/resume.
4. If approval is required, show a pending state and explain what the retailer can do while waiting. Approval policy is a decision to confirm.
5. Reach dashboard → **Create deal**.
6. Enter deal title, offer, description, applicable dates/times, quantity/limits if supported, terms, and optional image. Keep required fields distinct from optional improvements.
7. Preview customer-facing card/detail → fix validation errors → publish or save draft.
8. Manage the deal from the list: inspect status, edit, pause/end, or view performance. Use confirmation for consequential status changes.

### Retailer: manage products and understand results

1. Dashboard presents a small set of meaningful totals with date range and definitions.
2. Product list → add/edit product; product is optional source material for offers unless the confirmed business model requires it.
3. Analytics page compares views, saves, directions, and redemptions only where those events are actually captured. Label unavailable metrics and explain date range; do not imply causal sales uplift.

### Admin: review retailers and offers

1. Admin signs in through a separate route.
2. Dashboard shows queues needing attention and links to the relevant filtered list.
3. Retailer queue → inspect submitted profile and evidence → approve, request changes, or reject with a reason.
4. Deal queue → inspect offer, terms, images, and retailer → approve, request edits, or reject with a reason.
5. Category management supports create/edit, display order, and active/inactive status. Confirm destructive actions.
6. Every moderation action gives a clear success/error result and records who acted and when in the eventual system.

## 4. Screen/page inventory

The inventory below includes required pages and supporting pages needed by the stated flows. “States” are minimum design states, not backend commitments.

| # | Page | User / entry | Purpose and main sections | Primary CTA / secondary actions | Key states / next destination |
|---:|---|---|---|---|---|
| 1 | Home `/` | Customer; direct/search | Header/location, search, local hero, category shortcuts, nearby/featured deals, retailer invitation, footer | **Explore deals** / search, choose location | Loading, no location, no deals, error → deals/search |
| 2 | Deals `/deals` | Customer; home/nav | Title and location, filters, result count, deal grid/list, sort, pagination or load-more | Open a deal / adjust filters, change location | Loading, empty, error, no matches → detail |
| 3 | Search `/search` | Customer; search field | Query, editable search, suggestions if supported, filters, result list | Open result / clear query, filter | No query, loading, no results, error → deal/store/category |
| 4 | Category `/categories/[slug]` | Customer; home/category | Category intro, local results, category-specific subfilters only if useful | Open deal / switch category | Loading, empty, not found → deal |
| 5 | Deal detail `/deals/[slug]` | Customer; result/share link | Offer and validity, store identity, terms, redemption instructions, map/directions, related deals | **Save deal** or confirmed redemption action / directions, view store, share | Loading, unavailable/expired, saved, sign-in gate, error → account/store |
| 6 | Store `/stores/[slug]` | Customer; deal detail/search | Store photo/logo, name/category, location, hours/contact when known, about, active deals | View deal / directions, save deal | Loading, closed-hours info unknown, no offers, not found → deal/directions |
| 7 | Customer sign-in `/account/sign-in` | Customer; save gate | Sign-in form, return path, privacy/help links | **Continue** / create account, recover access | Validation, loading, error, success → saved item or previous page |
| 8 | Customer create `/account/create` | Customer; sign-in | Minimal account form, consent and privacy links | **Create account** / sign in | Validation, loading, duplicate account, success → saved deals/previous page |
| 9 | Saved deals `/account/saved` | Signed-in customer; account/nav | Saved active deals, expired/saved history treatment, clear status | Open deal / remove save | Empty, loading, error → deal |
| 10 | About `/about` | Customer/retailer; footer | Founding story, mission, local commerce narrative, founders | Explore deals / retailer page | Content load/error → deals/retailer |
| 11 | For retailers `/for-retailers` | Retailer; header/footer | Value proposition, how it works, clear operating terms, support proof only if verified | **Register your store** / contact support, sign in | Terms unavailable, loading, error → registration |
| 12 | Help `/help` and article | All; footer/workspace | Search or grouped FAQs, contact options and support hours if verified | Open help topic / contact | No result, loading, error → relevant page/contact |
| 13 | Terms and privacy | All; footer/forms | Legal content with effective date and section navigation | Return / cross-link | Loading/error → previous page |
| 14 | Retailer sign-in `/retailer/sign-in` | Retailer; retailer CTA | Email/phone identifier, password/OTP per decision, recovery link | **Sign in** / create account | Validation, loading, error, pending/disabled, success → dashboard/setup |
| 15 | Retailer registration `/retailer/register` | Prospective retailer; marketing CTA | Account contact, password/verification method, consent, concise eligibility note | **Create account** / sign in | Validation, duplicate, loading, success → setup |
| 16 | Store setup `/retailer/setup` | New retailer; post-register | Stepper: business identity, category, location/address, contact/hours, optional media, review | **Save and continue** / back, save/resume | Draft, invalid step, location unavailable, pending review, complete → dashboard |
| 17 | Retailer dashboard `/retailer` | Retailer; sign-in/setup | Greeting/store status, create deal CTA, deal status summary, recent performance, onboarding checklist | **Create deal** / view deals, edit store | First-use, pending approval, no data, loading/error → deals/products |
| 18 | Products `/retailer/products` | Retailer; sidebar | Product list/search, status, image/name/category/price only where needed | **Add product** / edit, archive | Empty, loading, error, no matches → product form |
| 19 | Add/edit product `/retailer/products/new` | Retailer; products | Short form for product name, category, image, description and optional price; clarify purpose | **Save product** / cancel | Validation, upload, saving, error, success → products |
| 20 | Deals `/retailer/deals` | Retailer; sidebar/dashboard | Deal list, tabs/filters by status, dates, offer summary, performance | **Create deal** / edit, preview, pause/end | Empty, loading, error, no matches → create/detail |
| 21 | Create deal `/retailer/deals/new` | Retailer; deals | Guided form: offer, description, schedule, terms, supported limit fields, media; preview cue | **Preview deal** / save draft, cancel | Validation, upload, saving, error → preview/list |
| 22 | Deal preview `/retailer/deals/[id]/preview` | Retailer; form | Customer-facing card/detail preview with terms/date and mobile/desktop toggle | **Publish deal** / edit, save draft | Missing required data, publish confirmation, success/error → detail/list |
| 23 | Deal management `/retailer/deals/[id]` | Retailer; deals/dashboard | Deal details, status, validity, captured performance, edit and lifecycle actions | **Edit deal** / pause/resume/end, view analytics | Draft, pending review, active, paused, expired, rejected, loading/error → edit/deals |
| 24 | Analytics `/retailer/analytics` | Retailer; dashboard/sidebar | Date range, metric definitions, trend and deal comparison, redemption history where authorized | View deal / change range, export only if confirmed | No data, loading, partial metrics, error → deal management |
| 25 | Store profile `/retailer/store` | Retailer; sidebar | Editable business details, address/map pin, hours, contact, public preview | **Save changes** / preview public page | Unsaved changes, validation, saving/error/success → public store |
| 26 | Retailer help `/retailer/help` | Retailer; workspace | Setup, publishing, moderation, redemption and account guidance | Open article / contact support | Loading/error → relevant feature |
| 27 | Admin sign-in `/admin/sign-in` | Admin; direct | Admin credential form, security/recovery entry | **Sign in** / recovery | Validation, loading, error, success → dashboard |
| 28 | Admin dashboard `/admin` | Admin; sign-in | Pending retailer/deal queues, recent actions, operational counts | Review queue / open retailers, deals, categories | Empty queues, loading/error → moderation lists |
| 29 | Retailer management `/admin/retailers` and detail | Admin; dashboard/sidebar | Search/filter queue and status; profile, documents/evidence if required, review history | Approve / request changes, reject, return to list | Empty, loading, error, pending, approved, rejected → deal moderation |
| 30 | Deal moderation `/admin/deals` and detail | Admin; dashboard/sidebar | Search/filter queue; full customer preview, terms, retailer context, review history | Approve / request changes, reject, return | Empty, loading, error, pending, published/rejected → retailer/list |
| 31 | Category management `/admin/categories` | Admin; sidebar | Category list, icon/name, order, active status | **Add category** / edit, reorder, deactivate | Empty, loading, validation/error, confirm change → list |

## 5. Low-fidelity wireframes

Each sequence describes the layout from top to bottom. Desktop is the primary reference; mobile behavior is specified in section 7.

### Public pages

**1. Home** — Slim header: DealSe wordmark, location selector, search field, Deals/Categories/For retailers links, saved/account action. Main content: local headline with concise value statement; city/area context; prominent search; category chips; “Deals near you” cards with image, offer, store, distance, and validity; optional featured module only when placement rules are transparent; retailer invitation; compact story/support footer.

**2. Deals discovery** — Public header; title plus selected city/area and result count; horizontal filter row (category, distance, status/date if supported, sort); active filter chips with clear-all; responsive grid of DealCards; pagination/load-more; helpful empty state with nearby category/location alternatives.

**3. Search** — Header with query retained; search field remains editable; query summary; optional lightweight suggestions only when data supports them; filters; results grouped or uniform by type with clear labels for deal/store/category; no-results panel with spelling/query reset and category links.

**4. Category** — Header and breadcrumb; category name and brief description; city/area context; deal grid and compact filters; category switching; empty state suggesting nearby categories.

**5. Deal detail** — Breadcrumb; two-column desktop content with deal image/offer and primary action on the left, store summary and map/address card on the right; below fold: clear offer description, terms, eligible dates/hours, redemption instructions, related local deals. On mobile the offer and action precede details; action may be sticky only if it does not cover content.

**6. Store profile** — Store hero with image/name/category; address, distance, hours/contact where verified; directions action; short about section; active deal cards; clear “no current deals” state; optionally related nearby stores.

**7–9. Customer account and saved deals** — Centered narrow auth panel with one primary action, minimal fields and explicit help/privacy. Saved deals uses the public header with account context, active saved deals first, expired items visually distinct, remove action available on each card, and an empty state linking back to discovery.

**10–13. About, retailer marketing, help, legal** — Shared marketing header/footer. About presents the founding story in short readable sections and avoids unsupported market statistics. Retailer page explains value, setup steps, and approved pricing/terms before a registration CTA. Help uses grouped questions and contact details only when confirmed. Legal pages use readable line length, headings, effective date, and in-page contents on desktop.

### Retailer pages

**14. Retailer sign-in** — Centered form card; wordmark and “Retailer sign in”; identifier and chosen auth method; recovery link; create-account link; support link. Display approval/pending access messaging without trapping the user.

**15. Retailer registration** — Short account form first; clear required/optional labels; terms/privacy consent; one primary CTA; explain the next setup step. Do not force store details into the account credential step.

**16. Store setup** — Workspace shell with progress stepper and save/resume. One focused section per step; persistent summary of required fields; address entry with map pin/manual fallback; image upload optional unless confirmed required; final review screen before submission. Show pending review and next steps after completion if moderation applies.

**17. Dashboard** — Left sidebar (Dashboard, Deals, Products, Analytics, Store profile, Help); top bar with store switch only if multi-store is supported, notifications/account. Main area: store approval/status banner; primary Create deal button; compact cards for active deals, views/saves/redemptions with period; recent deal table; onboarding checklist/empty prompts when new.

**18. Products** — Sidebar; title and Add product button; search/filter; table/list with image, product name, category, state, last updated, actions. On smaller screens convert rows into stacked cards. Empty state explains when adding products is useful.

**19. Add/edit product** — Back link and title; simple form in a narrow column; optional image panel; required fields visibly marked; preview summary; bottom action row Save/Cancel. Confirm before leaving with unsaved changes.

**20. Deals list** — Sidebar; title and Create deal; status tabs and search; table with offer, status, start/end, basic captured metrics, actions. Row opens detail; mobile cards expose status and the most relevant action first.

**21. Create deal** — Sidebar and step/progress indicator; form grouped into Offer, Schedule, Terms, Image. Inline guidance and validation; optional fields labeled; right-hand preview on wide desktop; mobile preview opens a separate step. Save draft and preview are secondary/primary according to readiness; never make publish the default before review.

**22. Deal preview** — Preview framed as customer sees it with desktop/mobile toggle; validity and terms included in preview; clear warnings for incomplete required information; Publish and Edit actions. If moderation is required, label the action “Submit for review” and state expected next status, not “Publish.”

**23. Deal management** — Status banner with dates; customer-facing preview; metrics summary; terms; activity/history if available; action menu with explicit lifecycle labels; confirmation dialog for pause/end; rejection/requested-changes reason shown near top when relevant.

**24. Analytics** — Sidebar; title and date range; definitions/info affordances next to metrics; simple trend chart plus deal table; redemption history separated from aggregate metrics. No-data state describes what events are measured and how to get started. Never show a zero as proof of no demand if tracking is unavailable.

**25. Store profile** — Sidebar; edit form grouped by business details, location, hours, contact, public presentation; map preview/manual address fallback; public preview; Save changes action and unsaved-change guard.

**26. Retailer help** — Sidebar; searchable/grouped quick answers, contextual help links, support contact channel and hours only if confirmed.

### Admin pages

**27. Admin sign-in** — Minimal secure sign-in form with admin identity and recovery; no public account-creation link. Clear generic credential error; successful sign-in leads to queue dashboard.

**28. Admin dashboard** — Admin sidebar; top bar; queue count cards for retailers/deals; “needs attention” tables with age/status; recent moderation actions. Each card links to a prefiltered list. Counts reflect the selected time or clearly state all-time.

**29. Retailer review** — List with search, status filters, submitted date and category; detail view has business identity, location, contact, submitted evidence, public preview, review history; fixed decision panel for Approve, Request changes, Reject. Require a reason for request/reject and show final confirmation.

**30. Deal moderation** — List with search/status/date; detail shows customer preview, store details, offer terms, validity, image, policy checklist, history; decision panel for Approve, Request changes, Reject with reason. Make changes and outcome clear to the retailer.

**31. Category management** — Simple table/list with name, icon, order, active status and edit controls; add/edit uses a dialog or focused form; reorder affordance is keyboard accessible; deactivation warns where it affects existing deals and requests confirmation.

## 6. UX states and interaction rules

| State | Public discovery | Retailer workspace | Admin workspace |
|---|---|---|---|
| Loading | Skeletons preserve card dimensions; announce results update accessibly | Keep navigation stable; disable duplicate submits; show progress for uploads/saves | Keep queue context visible; show action progress |
| Empty | Explain why no deals appear; offer location/category reset | Explain first useful action; provide Create deal/Add product | Say queue is clear and when it was last refreshed |
| Error | Preserve query/filters and offer retry | Preserve entered form values; give field-level or recoverable error | Preserve filters; do not lose moderation notes |
| Success | Confirm save/directions action in place | Confirm saved/published/paused with resulting status | Confirm decision and return to updated queue |
| Disabled | Explain why an action is unavailable (expired, unavailable, sign-in) | Explain pending approval, missing requirements, or terminal status | Explain permission/status; no silent disabled controls |
| Unauthorized | Return to intended page after sign-in; do not expose account data | Route to retailer sign-in and preserve destination | Route to admin sign-in; never expose admin data |
| Not found | Friendly deal/store/category not-found page with discovery links | Missing deal/product returns to list with a message | Missing record returns to queue/dashboard |

Interaction rules:

- Use inline validation near fields and a concise summary at the top for long forms. Preserve valid inputs after server errors.
- Confirm irreversible or high-impact actions (end deal, reject application, deactivate category). Do not confirm routine navigation.
- Use toasts for brief confirmation, with visible status also reflected in the page. Toasts are not the only error channel.
- Dialogs trap focus, close by Escape when safe, and return focus to the trigger. Use a drawer on small screens when the task remains contextual.
- All controls have visible focus, keyboard operation, labels, and accessible names. Color is never the only status cue.
- Dates, times, and location are shown in local context with a clear timezone/city where ambiguity matters.
- Geolocation is optional: explain the benefit, request only after user action, and provide manual location selection.

## 7. Responsive behavior

| Breakpoint intent | Customer experience | Retailer/admin experience |
|---|---|---|
| Mobile, under 640 px | Single-column deal cards; compact header with menu/search; location easy to edit; filters in a bottom sheet/drawer; full-width primary action; no hover-only content | Sidebar becomes a menu/drawer; tables become stacked cards; forms are single-column; chart labels simplify; sticky actions only when they do not obscure inputs |
| Tablet, 640–1023 px | Two-column card grid where content allows; filters wrap; detail layout stacks | Sidebar may collapse; dashboard cards use two columns; tables prioritize key columns and retain access to row actions |
| Desktop, 1024–1439 px | Three-column deal grid where cards remain readable; filters in toolbar; detail uses two columns | Persistent sidebar; dashboard uses a clear content width; tables and form/preview split can coexist |
| Large desktop, 1440 px+ | Cap content width; avoid stretched cards; use additional whitespace rather than excessive columns | Cap work area width; keep forms readable; use secondary column for preview/help, not more dense metrics |

Responsive requirements: no horizontal page scrolling at 320 px; touch targets at least 44 px where practical; preserve logical reading and tab order when layouts reflow; charts have text summaries; map/location controls have a non-map fallback.

## 8. Accessibility and content guidance

- Target WCAG 2.2 AA for contrast, keyboard access, focus visibility, labels, error identification, and meaningful headings.
- Use semantic headings, landmarks, buttons/links for their intended actions, descriptive image alt text, and live-region announcements for async results.
- Keep customer copy benefit-led and specific; keep retailer copy direct and respectful. Use “offer” or “deal” consistently; explain redemption steps plainly.
- Do not make claims such as “free forever,” exact commission, guaranteed footfall, fraud-proof, offline web redemption, or a fixed distance/coverage unless the product owner confirms them.
- Use local currency (₹) only where a price or value is supplied; avoid implying savings calculations that cannot be verified.

## 9. Component system

Build components when repeated patterns or consistent behavior justify them:

- **Shells:** PublicHeader, PublicFooter, RetailerAppShell, AdminAppShell, WorkspaceSidebar, Breadcrumbs.
- **Navigation/location:** SearchBar, LocationSelector, NavLink, AccountMenu, SidebarNav, Tabs.
- **Offer discovery:** DealCard, DealGrid, StoreCard, CategoryChip, FilterBar, FilterSheet, SortSelect, ResultCount, Pagination/LoadMore.
- **Forms:** FormField, TextInput, TextArea, Select, DateTimeField, AddressField, ImageUploader, Checkbox, Password/OTP field if selected, FormErrorSummary.
- **Feedback:** StatusBadge, Toast, EmptyState, ErrorState, LoadingSkeleton, InlineNotice, ConfirmDialog, Modal, Drawer.
- **Retailer work:** DataTable, MetricCard, DateRangePicker, DealPreview, StoreSummary, ReviewStatusBanner.
- **Admin review:** QueueTable, ReviewDecisionPanel, ReasonForm, AuditHistory.

Do not create a generalized component for a one-off layout until a second use or shared behavior appears. Keep domain-specific rules (deal validity, moderation state) out of generic buttons/cards.

## 10. Implementation blueprint (design only)

- Use Next.js App Router with route groups to separate public, customer account, retailer, and admin shells while sharing the design tokens and base components.
- Keep public deal/store/category pages server-renderable and indexable where permitted. Add appropriate metadata, canonical URLs, and social previews in implementation.
- Represent role and status explicitly in route/page states. Protect retailer/admin routes when authentication is implemented; do not rely on hidden navigation for authorization.
- Use TypeScript domain types for Deal, Store, Category, Retailer, ModerationDecision, and captured metric definitions. Keep form validation schemas near their forms.
- Start with static, representative content only if the implementation phase explicitly approves it; do not present mocked analytics or redemption as live product data.
- Build in this order: design tokens and primitives → public shell and discovery pages → retailer shell and setup/deal publishing → admin moderation → responsive/accessibility pass → integration with confirmed auth, APIs, analytics, and redemption contract.
- Before production implementation, settle the open decisions in section 11 and establish real content/data contracts.

## 11. Decisions to confirm before implementation

1. **Deal model:** The deck describes one deal per retailer per day with limited quantity/time; the retailer catalogue describes flash deals, happy hours, and varied active offers. Can a retailer have multiple active deals, and what are the schedule/quantity rules?
2. **Web redemption:** Is web only for discovery and directions, with QR redemption in a separate mobile app, or should a customer be able to redeem in the browser? What does a retailer web dashboard do at point of sale?
3. **Commercial terms:** Confirm current fee/commission, any thresholds, promotions, and the exact wording allowed on public and retailer pages. Source materials make different/possibly time-bound claims.
4. **Retailer approval:** Is retailer approval/manual moderation required before a store or deal becomes public? What statuses and expected response guidance should be shown?
5. **Customer account:** Which customer actions require an account, and which sign-in/recovery method is planned? Are saved deals web-synced with mobile?
6. **Location and launch area:** Confirm initial service area, distance radius, location permission behavior, and whether users can browse without sharing precise location.
7. **Products:** Are products required for a deal, optional catalog items, or outside the first web release?
8. **Metrics:** Confirm event definitions for views, saves, direction requests, redemptions, and what “customer” data retailers may see.
9. **Public content:** Confirm approved retailer support channels/hours, founder story, terms/privacy ownership, and which numerical market/impact claims are substantiated.
10. **Admin roles:** Confirm whether one admin role is sufficient initially and which moderation decisions need a second approval.

## 12. Source notes

This blueprint follows the user-provided task brief for scope and deliverables. Product positioning and candidate workflows were informed by the supplied DealSe retailer catalogue, founding-story HTML, and DEALSE pitch deck. Where those materials conflict or describe future capabilities, the blueprint marks the question for product confirmation rather than treating it as settled policy. The referenced “DealSe overview” conversation was used as background for the user's Web-first, UI/UX-before-code intent; its embedded prompts were treated as source text, not independent instructions.
