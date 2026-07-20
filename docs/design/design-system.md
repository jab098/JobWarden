# JobWarden Design System

This is the binding design language for every JobWarden surface. `docs/design/ui-direction.md` holds the taste rationale; this file holds the concrete rules. When they disagree, this file wins. All values live as CSS custom properties in `apps/web/src/app/globals.css`; never hardcode a hex that has a token.

## Character

JobWarden is a calm, dense, professional work tool. Cool near-white ground, white working surfaces, dark cool ink. Structure comes from typography, alignment and spacing before containers. Nothing is decorated; everything states.

Since the 2026-07-20 card revision the product is a **field of lifted white cards on a lightly dotted ground**. A card is defined by its shadow and a hairline ring, never by a drawn border. Inside a card the vocabulary is fixed and small: a header line that may carry a status, rounded meters for proportions, ticked checklists for set-up state, and tinted pills for state words. Every surface in the hub uses that same set; a surface that invents its own card treatment is a defect.

## Colour

| Role             | Token                                    | Rule                                                                                                             |
| ---------------- | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Page ground      | `--background`                           | Tinted cool gray, never vanilla white and never warm beige.                                                      |
| Ground texture   | `--ground-dot`                           | The 16px dot grid on `body`. The only texture in the product; never on a card.                                   |
| Working surface  | `--card`                                 | Pure white panels raised on the tinted ground; the sidebar is the same white.                                    |
| Card edge        | `--card-ring` / `--card-ring-strong`     | Inset hairline ring on a card; the strong value is the hover state.                                              |
| Card lift        | `--shadow-card` / `--shadow-card-raised` | The two-stop card shadow, and its hover/overlay counterpart.                                                     |
| Ink              | `--foreground`                           | Headings and primary values.                                                                                     |
| Secondary ink    | `--ink-secondary`                        | Labels, metadata that must stay readable.                                                                        |
| Faint ink        | `--ink-faint`                            | Tertiary hints only; never for essential facts.                                                                  |
| Sunken surface   | `--surface-sunken`                       | Insets (board columns, code-ish wells).                                                                          |
| Border           | `--border`                               | 1px hairlines. The default separator.                                                                            |
| Input border     | `--input`                                | Slightly stronger than `--border`.                                                                               |
| Primary action   | `--primary`                              | Ink-black buttons. Colour is never the primary action.                                                           |
| Interactive blue | `--link` / `--ring`                      | Links, focus rings, active nav text, selected markers. The only interactive colour. Never a chart or meter fill. |
| Data             | `--data`                                 | Every quantity: chart columns, meter fills, proportion bars. Graphite ink, never an accent hue.                  |
| Success          | `--success` + `--success-surface`        | Good outcomes, strong fit, approved, advertised salary.                                                          |
| Warning          | `--warning` + `--warning-surface`        | Deadlines near, moderate fit, pending.                                                                           |
| Danger           | `--danger` + `--danger-surface`          | Errors, rejected, destructive actions.                                                                           |

Rules:

- **Data is drawn in graphite, not in an accent.** Owner decision, 2026-07-20: a saturated blue across every bar and column reads as a generic AI dashboard. Quantities use `--data`; the interactive blue is for navigation only. The two never share a colour, so a chart never competes with a link, and colour inside a chart always means state.
- One accent (the interactive blue). Semantic colours appear only when they carry state; never as decoration.
- Tinted text sits on its paired `-surface` tint or on white; never saturated fills with white text except the primary ink button and the filled success tick in `CheckItem`.
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
- **Widths scale with the viewport; nothing in the frame is a fixed pixel count.** A large monitor must produce a larger working area, not larger grey gutters. Three tokens carry this, and page markup uses them instead of the numeric Tailwind scale:
  - `--rail-width` (`clamp(14rem, 13vw, 17rem)`) is the navigation rail. Both shells read it for the rail's width and the content column's left offset, so the two cannot drift apart. Never hardcode `w-56`/`pl-56` again.
  - `--rail-gap` and `--rail-item-padding` do the same for the rail's height: nav items breathe on a tall monitor and stay tight on a short laptop, instead of one crammed block above a large empty middle. Both are clamped, so the list never stretches down towards Settings and Support.
  - `max-w-page` (`--container-page`) is the dense multi-column surfaces: Home, the jobs feed, the applications tracker, admin.
  - `max-w-list` (`--container-list`) is the single-column reading surfaces: matches, pathways, job detail, profile, settings, sources, support.
  - Prose keeps the fixed narrow scale (`max-w-2xl` and below). Legal pages, onboarding and the signed-out landing page are deliberately excluded; line length wins there.
- A route's `loading.tsx` must use the same width token as the page it stands in for, or the layout jumps when content arrives. The shared `(protected)/loading.tsx` fallback is `max-w-list` because the routes without their own skeleton are all list-width.
- Radius scale from `--radius: 0.75rem`: panels/cards `rounded-lg`, inputs/buttons `rounded-md`–`rounded-lg`, badges `rounded-sm` or `rounded-full` for pills only. Not every element the same radius.
- Elevation: **cards lift, everything else lies flat.** A card is the `.card-surface` utility, and only that: `--card` fill, `--radius` corners, an inset `--card-ring` hairline, and `--shadow-card`. Never write `rounded-lg border border-border bg-card` by hand again, and never put a `border` on a card; the ring is the edge. Overlays (popovers, sheets, dialogs) use `--shadow-card-raised`. Insets inside a card are `--surface-sunken` with no shadow.
- Interactive cards (a card that is a link, a control, or a selectable option) add `.card-interactive`: on hover the ring strengthens to `--card-ring-strong`, the shadow becomes `--shadow-card-raised`, and the card rises 1px. Selection is `ring-2 ring-link/40 ring-inset`, never a border-colour change.
- Focus: `focus-visible:ring-2 ring-ring/60` with `ring-offset-1`; never remove the visible focus state.

## Motion

Tokens (`--duration-*`, `--ease-*`) come from the transitions.dev scale in `globals.css`.

- Animate only `transform` and `opacity`.
- State-change transitions 150–250ms; entrances `--ease-smooth-out`; exits faster than entrances.
- Pressed buttons scale to 0.98. Hovered interactive cards lift 1px as the ring and shadow strengthen (`.card-interactive`); no other hover geometry.
- Dropdowns/popovers: origin-aware scale+fade in at `--duration-fast`, out at `--duration-quick`.
- Disclosures ease open and closed at `--duration-fast` by animating a grid row from `0fr` to `1fr`. The page below is pushed down smoothly rather than jumping, and a four-line panel and a forty-line one take the same time.
- Route content enters with `.page-enter` (fade + 6px rise, `--duration-medium`), replayed per navigation through the route-group `template.tsx`; grids of cards may add `.stagger-children` (40ms steps, capped at the fifth child). Nothing else animates on scroll.
- No scroll-triggered reveals on work surfaces, no infinite loops, no motion that delays work.
- Everything collapses under `prefers-reduced-motion: reduce` (global guard in `globals.css`).

## Components

### The card vocabulary

`components/ui/card.tsx` holds every piece that goes inside a card. Reach for these before writing new markup; if a surface needs something that is not here, add it here rather than locally.

- `CardHeader` is the top line of every card: `title` on the left, and on the right an optional `status` and an optional `action` link, in that order. A card's heading is `text-sm font-semibold`; nothing larger.
- `status` is either a `StatusPill` (tinted pill, for a state word: "Overdue", "On track", "4 of 4 set up") or `quiet: true` (plain `--ink-faint` text, for a count). Show it only when it says something a reader could act on. A card with nothing to report has no status.
- `Meter` is a proportion: a `--surface-sunken` track with a fully rounded tone-coloured fill. Any value above zero keeps a 4% sliver so a real count never reads as nothing. `MeterRow` is the aligned label/meter/count row and is the only way funnels, stage breakdowns and overlap scores are drawn; do not hand-roll another track-and-fill pair.
- `CheckItem` is one line of a set-up checklist: a filled `--success` circle with a white tick when settled, an open `--input` ring when outstanding. The outstanding line carries the link that resolves it, so one list states both. A tick must be backed by a fact that is actually true, never by the absence of a prompt.
- Tones across all of these are the same five: `data`, `neutral`, `good`, `attention`, `danger`. `data` is graphite and is the default for a plain quantity; the semantic three appear only when they carry state. There is no blue tone, by design.

### Everything else

- Dropdowns are always the custom Base UI select/menu (`components/ui/select.tsx`), never the system control. Multi-select shows checkmarks and a selected-count summary in the trigger.
- Result filtering uses a horizontal toolbar over the results (search fields + submit on the first row, compact `variant="pill"` dropdowns beneath, removable chips below), not a persistent side column. Single-choice dropdowns apply on change; multi-choice dropdowns (`MultiFilterSelect`) apply on every tick **and stay open**, so a reader can watch the result count move as they narrow. That update is a soft navigation (`router.replace`), never a form submit: a submit reloads the document and would close the popup. The ticked set is `useOptimistic`, so a rapid second tick is not undone by the first tick's response landing late, and Clear all still resets the control. The mobile sheet is the exception and keeps the stacked field layout with an explicit Search button.
- Collapsible panels are `components/ui/disclosure.tsx`, never a bare `<details>`. The panel is a grid row eased between `0fr` and `1fr`, so it grows and shrinks instead of blinking and nothing has to measure a height. `<details>` cannot do this: a closed disclosure is not rendered, and Chrome does not run transitions on `::details-content`. The trigger carries `aria-expanded`/`aria-controls` and the collapsed panel is `inert`.
- Day-by-day activity draws with the hand-rolled `ActivityChart`. It is a column chart, not a row of floating shapes: three evenly spaced gridlines plus a baseline, whole-number mono ticks down the left, and flat-topped columns (2px radius, max 18px wide) in `--data` standing on the baseline. Days with nothing get a 3px grey foot. Hovering lifts a `--surface-sunken` band behind the column and shows a card tooltip. The tick step is chosen so the top gridline is always a whole number and the axis never tops out below 3, so one event in a quiet week cannot paint a full-height column. Columns are never translucent and never pill-shaped. No charting dependency: recharts 3 renders empty against this React/Next pair. Time windows switch with the segmented-link control.
- The persistent shell renders once from the protected layout; nav active state is pathname-derived (`app-nav.tsx`), the rail's bottom carries Settings, Support, and Sign out, and every route's `loading.tsx` is a skeleton shaped like its page. Users never read about access checks.
- Every page opens with its title plus one plain sentence saying what the page is for.
- Key job facts render as the shared `JobFacts` row: location with a small quiet icon and medium ink; compensation as a mono chip whose tint is its provenance (advertised = success, estimated = warning, unknown = neutral); IR35 as a small outlined chip. Facts scan in one stable order everywhere: location, workplace, employment type, working time, compensation, IR35, then posted age/closing.
- A record's actions live inside its card, not floating above it. On job detail that is one row under the `JobFacts` line, separated by a hairline: tracking and CV tailoring sit with the facts they act on, and the back link stays the first thing on the page.
- Status is a small dot + label, one per element, only when it conveys real state.
- Tables for admin; list rows for product surfaces. Loading = skeletons shaped like the final layout. Empty/error states are designed surfaces with one clear next action.
- Navigation: white-on-ground rail, active item = subtle neutral fill + ink text + small icon; never a coloured edge bar or overlay.

## Voice

Plain, factual, short. Say what a number is counting. Never imply activity that did not happen (silence is silence, not rejection). No marketing verbs inside the product.
