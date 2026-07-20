# JobWarden Design System

This is the binding design language for every JobWarden surface. `docs/design/ui-direction.md` holds the taste rationale; this file holds the concrete rules. When they disagree, this file wins. All values live as CSS custom properties in `apps/web/src/app/globals.css`; never hardcode a hex that has a token.

## Character

JobWarden is a calm, dense, professional work tool. Cool near-white ground, white working surfaces, dark cool ink, hairline borders. Structure comes from typography, alignment and spacing before containers. Nothing is decorated; everything states.

## Colour

| Role             | Token                             | Rule                                                                                |
| ---------------- | --------------------------------- | ----------------------------------------------------------------------------------- |
| Page ground      | `--background`                    | Tinted cool gray, never vanilla white and never warm beige.                         |
| Working surface  | `--card`                          | Pure white panels raised on the tinted ground; the sidebar is the same white.       |
| Ink              | `--foreground`                    | Headings and primary values.                                                        |
| Secondary ink    | `--ink-secondary`                 | Labels, metadata that must stay readable.                                           |
| Faint ink        | `--ink-faint`                     | Tertiary hints only; never for essential facts.                                     |
| Sunken surface   | `--surface-sunken`                | Insets (board columns, code-ish wells).                                             |
| Border           | `--border`                        | 1px hairlines. The default separator.                                               |
| Input border     | `--input`                         | Slightly stronger than `--border`.                                                  |
| Primary action   | `--primary`                       | Ink-black buttons. Colour is never the primary action.                              |
| Interactive blue | `--link` / `--ring`               | Links, focus rings, active nav text, selected markers. The only interactive colour. |
| Success          | `--success` + `--success-surface` | Good outcomes, strong fit, approved, advertised salary.                             |
| Warning          | `--warning` + `--warning-surface` | Deadlines near, moderate fit, pending.                                              |
| Danger           | `--danger` + `--danger-surface`   | Errors, rejected, destructive actions.                                              |

Rules:

- One accent (the interactive blue). Semantic colours appear only when they carry state; never as decoration.
- Tinted text sits on its paired `-surface` tint or on white; never saturated fills with white text except the primary ink button.
- No gradients, no glows, no glassmorphism, no coloured left-border strips.

### Fit-score tiers

Fit scores colour by threshold, everywhere they appear:

- `>= 80` strong: `--success`
- `55–79` moderate: `--warning`
- `< 55` weak: `--muted-foreground` (neutral; a low score is information, not an alarm)

## Typography

- Schibsted Grotesk (`--font-display`) for the wordmark, page titles, headings, and legends; applied to `h1`-`h3` in the base layer with `-0.015em` tracking. Geist Sans for all working text. Geist Mono only for identifiers, dates, rates, counters and operational metadata.
- Page titles: `text-xl font-semibold tracking-[-0.02em]`. Never larger inside the product.
- Section titles: `text-sm font-semibold`.
- Body and controls: `text-sm`. Metadata: `text-xs`.
- Numbers in columns or stat blocks use `tabular-nums` (`.tnum` utility).
- No uppercase letter-spaced eyebrow labels above headings. The heading is enough.
- No em dashes anywhere in interface copy.

## Space, shape, elevation

- 4/8px spacing increments, tuned dense: page containers `px-4 py-5 lg:px-6`, panels `p-4`, grid gaps `gap-2.5`, card list gaps `gap-2`. Whitespace separates groups, not every element.
- Radius scale from `--radius: 0.5rem`: panels/cards `rounded-lg`, inputs/buttons `rounded-md`–`rounded-lg`, badges `rounded-sm` or `rounded-full` for count pills only. Not every element the same radius.
- Elevation: borders first. Shadows only on overlays (popovers, sheets, dialogs: `shadow-lg` tinted low-alpha) and at most `0 2px 8px rgba(16,20,28,0.05)` on hover of an interactive card.
- Focus: `focus-visible:ring-2 ring-ring/60` with `ring-offset-1`; never remove the visible focus state.

## Motion

Tokens (`--duration-*`, `--ease-*`) come from the transitions.dev scale in `globals.css`.

- Animate only `transform` and `opacity`.
- State-change transitions 150–250ms; entrances `--ease-smooth-out`; exits faster than entrances.
- Pressed buttons scale to 0.98. Hovered interactive rows/cards may lift 1px with a border-colour shift.
- Dropdowns/popovers: origin-aware scale+fade in at `--duration-fast`, out at `--duration-quick`.
- Route content enters with `.page-enter` (fade + 6px rise, `--duration-medium`), replayed per navigation through the route-group `template.tsx`; grids of cards may add `.stagger-children` (40ms steps, capped at the fifth child). Nothing else animates on scroll.
- No scroll-triggered reveals on work surfaces, no infinite loops, no motion that delays work.
- Everything collapses under `prefers-reduced-motion: reduce` (global guard in `globals.css`).

## Components

- Dropdowns are always the custom Base UI select/menu (`components/ui/select.tsx`), never the system control. Multi-select shows checkmarks and a selected-count summary in the trigger.
- Result filtering uses a horizontal toolbar over the results (search fields + submit on the first row, compact `variant="pill"` dropdowns beneath, removable chips below), not a persistent side column. Single-choice dropdowns apply on change; multi-choice dropdowns (`MultiFilterSelect`) stay open while values accumulate and apply when the popup closes. The mobile sheet keeps the stacked field layout with an explicit Search button.
- Day-by-day activity draws with the hand-rolled `ActivityChart` (light horizontal grid, quiet mono ticks, rounded bars, grey placeholder feet on empty days, hover tooltip). No charting dependency: recharts 3 renders empty against this React/Next pair. Time windows switch with the segmented-link control.
- The persistent shell renders once from the protected layout; nav active state is pathname-derived (`app-nav.tsx`), the rail's bottom carries Settings, Support, and Sign out, and every route's `loading.tsx` is a skeleton shaped like its page. Users never read about access checks.
- Every page opens with its title plus one plain sentence saying what the page is for.
- Key job facts render as the shared `JobFacts` row: location with a small quiet icon and medium ink; compensation as a mono chip whose tint is its provenance (advertised = success, estimated = warning, unknown = neutral); IR35 as a small outlined chip. Facts scan in one stable order everywhere: location, workplace, employment type, working time, compensation, IR35, then posted age/closing.
- Status is a small dot + label, one per element, only when it conveys real state.
- Tables for admin; list rows for product surfaces. Loading = skeletons shaped like the final layout. Empty/error states are designed surfaces with one clear next action.
- Navigation: white-on-ground rail, active item = subtle neutral fill + ink text + small icon; never a coloured edge bar or overlay.

## Voice

Plain, factual, short. Say what a number is counting. Never imply activity that did not happen (silence is silence, not rejection). No marketing verbs inside the product.
