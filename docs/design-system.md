# DealSe Web Design System

**Status:** Initial design direction for the UI/UX blueprint. Values are design tokens to review before implementation, not production CSS.

## Brand direction

DealSe should feel **local, useful, confident, and fair**. The experience connects a customer to a nearby business and gives a retailer practical control over an offer. Use warm human imagery and recognizable shop contexts where genuine assets are available. Avoid loud “coupon app” styling, countdown pressure without a real end time, or visual treatment that makes every offer look like a clearance sale.

**Audience-specific palette:** the customer-facing discovery experience uses the pink accent from the supplied customer-app reference. The For Stores page and retailer workspace use the teal palette below. Keep shared neutrals, typography, and layout principles consistent across both experiences.

## Color roles

Use the palette supplied in the brief as the starting point. Apply color by role, keeping teal as the main action color and orange as a selective attention cue.

| Token | Value | Use |
|---|---|---|
| `color.primary` | `#009688` | Retailer-facing primary action, selected controls, and brand highlights |
| `color.primary-hover` | `#00796B` | Hover/pressed primary action; also the supplied primary-dark shade |
| `color.primary-soft` | `#E6F4F2` | Selected chips, subtle callouts, focus-adjacent surfaces |
| `color.accent` | `#FF9800` | Limited emphasis for real promotions or highlights; not all buttons |
| `color.background` | `#F8FAFC` | Page background |
| `color.surface` | `#FFFFFF` | Cards, dialogs, panels |
| `color.text` | `#17202A` | Main text and headings |
| `color.muted` | `#6B7280` | Secondary text, helper text, metadata |
| `color.border` | `#E5E7EB` | Dividers, input/card outlines |
| `color.success` | `#16A34A` | Success status with text/icon |
| `color.warning` | `#B45309` | Warning status; use a sufficiently pale background |
| `color.error` | `#DC2626` | Error/destructive status with text/icon |
| `color.info` | `#2563EB` | Informational status where teal could imply an action |

Accessibility note: validate every foreground/background pair for WCAG AA. Do not use white text on the supplied orange without contrast verification; reserve it for accents or use dark text. Pair status colors with labels/icons and never communicate status through color alone.

## Typography

- **Font family:** use a legible modern sans-serif with good Latin and Gujarati/Devanagari fallback coverage. Candidate stack: `Inter, "Noto Sans Gujarati", "Noto Sans Devanagari", system-ui, sans-serif`; confirm font licensing and actual script needs before implementation.
- **Weights:** 400 body, 500 controls/labels, 600 section headings, 700 page/hero headings. Avoid excessive bold copy.
- **Scale:**

| Token | Size / line height | Typical use |
|---|---|---|
| `text-xs` | 12 / 16 px | Compact metadata, only where readable |
| `text-sm` | 14 / 20 px | Helper text, labels, table metadata |
| `text-base` | 16 / 24 px | Body copy, inputs, navigation |
| `text-lg` | 18 / 28 px | Card heading, lead-in copy |
| `text-xl` | 20 / 28 px | Section heading |
| `text-2xl` | 24 / 32 px | Workspace page heading |
| `text-3xl` | 30 / 36 px | Public section/marketing heading |
| `text-4xl` | 36 / 44 px | Desktop hero heading; reduce responsively |

Use sentence case. Keep body line length around 60–75 characters where possible; use tabular numerals for metrics and dates.

## Layout and spacing

- **Spacing scale:** 4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80 px.
- **Content width:** public content max 1200 px; long-form reading 720 px; workspace content max 1440 px excluding sidebar.
- **Grid:** 12-column desktop public grid; retailer/admin workspace uses fixed navigation plus flexible content; cards align to a consistent gutter.
- **Page padding:** 16 px mobile, 24 px tablet, 32 px desktop; allow larger hero breathing room on public pages.
- **Density:** customer browsing prioritizes imagery and scannability; retailer/admin tables prioritize clear labels and actions while avoiding cramped rows.

## Shape, elevation, and focus

| Token | Value | Use |
|---|---|---|
| `radius-sm` | 6 px | Inputs, compact badges |
| `radius-md` | 10 px | Buttons, cards, menus |
| `radius-lg` | 16 px | Feature panels, dialogs |
| `radius-pill` | 999 px | Chips and status pills |
| `shadow-sm` | `0 1px 2px rgb(15 23 42 / 0.06)` | Cards at rest |
| `shadow-md` | `0 8px 24px rgb(15 23 42 / 0.10)` | Menus, dialogs, elevated panels |
| `focus-ring` | 2 px outline + 2 px offset | Keyboard focus, high contrast against adjacent surface |

Prefer borders and spacing to heavy shadows. Respect reduced-motion preferences; animation should clarify state, not create urgency.

## Component specifications

### Buttons

- **Primary:** teal fill, white text only after contrast validation; one dominant primary action per section/dialog.
- **Secondary:** white or transparent surface with teal/dark text and neutral border.
- **Tertiary:** text action for low-emphasis navigation.
- **Destructive:** red treatment for ending/rejecting; require confirmation for consequential actions.
- Minimum height 44 px on touch screens (40 px desktop compact variant); include hover, pressed, focus, disabled, and loading states. Disabled controls need adjacent reason text when the reason is not obvious.

### Inputs and selection

- 44–48 px control height, visible label, optional helper text, clear required/optional indication, and error below the control.
- Do not rely on placeholder text as a label. Use examples that match local formats, such as phone/address, but never prefill a real person's information.
- Selects support keyboard operation. For long category/location lists, use searchable selection with a manual fallback.

### Cards

- **DealCard:** image with stable aspect ratio, offer/title, store, location/distance, validity, and save affordance. Whole card navigation must not conflict with nested actions.
- **StoreCard:** recognizable image/name/category, area/distance, and current offer count/status if known.
- **MetricCard:** value, label, period, and definition/source. Do not render fabricated data as a real metric.
- Cards use white surface, subtle border, consistent padding; hover elevation is optional and must not be required for content discovery.

### Badges and status

Use concise text plus optional icon. Standard deal states: Draft, Pending review, Active, Paused, Scheduled, Expired, Rejected. Retailer states: Incomplete, Pending review, Active, Changes requested, Rejected. Keep the same wording everywhere and distinguish scheduled from active.

### Navigation, tables, and overlays

- Public header collapses navigation into a labeled mobile menu; search and location remain easy to reach.
- Workspace sidebar has a visible current item, text labels, and a mobile drawer with close action and focus management.
- Tables use persistent headers, understandable sort state, adequate row height, and responsive card conversion. Keep actions in a predictable final column/menu.
- Dialogs are for short focused decisions; drawers are for contextual filters or mobile forms. Always provide a title, clear close/cancel behavior, and keyboard/focus handling.

### Feedback and empty states

- **Toast:** brief, non-blocking confirmation; include a status icon and dismiss behavior.
- **Inline notice:** persistent pending/rejected/error information close to affected content.
- **Loading:** skeleton for known layout; progress indicator for an active save/upload.
- **Empty:** one sentence explaining the state plus one relevant next action. Avoid decorative illustrations that obscure the action.
- **Error:** explain what failed in plain language, preserve user input, and provide retry or support route.

## Imagery and iconography

- Favor real local retailer/store imagery with permission. Keep crop behavior consistent and provide a neutral placeholder for missing images.
- Deal thumbnails should show the product, service, or shop clearly; do not place essential offer terms only inside an image.
- Use a consistent line-icon set with 20/24 px sizes and labels for ambiguous actions. Do not use emoji as the primary icon system.
- Provide useful alt text for informative imagery; mark decorative imagery as decorative.

## Responsive rules

- Mobile: 16 px side padding, single-column forms/cards, bottom-sheet filters, menu drawer, touch-safe controls.
- Tablet: two-column customer card grid where cards remain legible; workspace navigation can collapse.
- Desktop: multi-column customer grid, persistent workspace sidebar, optional side-by-side form preview.
- Large desktop: cap content width and maintain readable line lengths rather than stretching components.
- At 200% zoom, content and controls remain usable without loss of information; no horizontal page scroll at 320 px.

## Token naming and implementation handoff

Use semantic tokens (`primary`, `surface`, `text-muted`, `border`, `success`) rather than component-specific raw colors. Keep spacing/radius/type values in a shared token layer. Document component variants and interaction states alongside the implementation. Recheck contrast, localization, and the actual Gujarati/Hindi font stack before shipping.
