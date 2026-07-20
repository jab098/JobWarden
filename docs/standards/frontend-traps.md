# Frontend traps in this stack

Silent failures already paid for once, in this repository, on this exact
Next 16 / React 19 / Tailwind v4 / Base UI combination. Each entry is here
because the code looked correct, typechecked, passed tests, and did nothing.

Companion to the stack failure map in `shipping-standards.md`, which covers
services. This file covers the browser.

---

## Tailwind v4: `@theme inline` does not emit the custom property

Adding `--container-flow` to the `@theme inline` block and using
`max-w-[var(--container-flow)]` produces **no max-width at all**, and no
error. `@theme inline` inlines the value into generated utilities rather than
declaring a CSS custom property, so `var()` resolves to nothing.

The generated utility (`max-w-flow`) may also not appear, because it is only
emitted when the build picks the token up. So both routes can fail at once, and
the element simply renders full width.

**Do this instead.** Follow `--rail-width`: declare the token in `:root`, where
it is a real custom property, and consume it as `max-w-[var(--container-flow)]`.
`--container-page` and `--container-list` predate this and live in `@theme`;
they work as named utilities (`max-w-page`) and should be left alone.

**How this got shipped broken.** The onboarding column was verified as
vertically centred and never checked horizontally. It was full width, so
`mx-auto` had no spare space and the whole flow sat against the left edge.
Measure the axis you changed, and the one you did not.

---

## Chrome does not run transitions on `::details-content`

A CSS-only animated `<details>` cannot work here yet. `CSS.supports` reports
the selector, `interpolate-size: allow-keywords` resolves, `@starting-style` is
supported, every computed value reads correctly, and **zero transition events
fire** — verified on a clean isolated probe as well as on real markup. Ordinary
transitions on the same page work, so it is specific to that pseudo-element.

**Do this instead.** `components/ui/disclosure.tsx` animates a grid row from
`0fr` to `1fr` on a real element. No height is measured, so a four-line panel
and a forty-line one open at the same speed. Do not reintroduce a bare
`<details>` for a collapsible panel.

---

## A route-change "blink" is a gap, not a missing animation

The entrance animation ran the whole time. It started at `opacity: 0`, and the
outgoing page is removed in the **same frame** the incoming one mounts, so the
column was briefly empty. Animating an arrival cannot cover a gap that exists
before the arrival begins.

**Do this instead.** `page-enter` and `page-fade` both start part-way visible
(0.55–0.6). Something is on screen continuously and the movement carries the
change.

**Two dead ends, so nobody repeats them:**

- `experimental.viewTransition` in `next.config.ts` does **not** wrap router
  navigations automatically. It enables React's `<ViewTransition>` component.
- `unstable_ViewTransition` is **not exported** from the React build pinned
  here. Importing it fails at runtime with "Element type is invalid", which
  surfaces as a 500 on every route in that segment.

`@view-transition { navigation: auto; }` in `globals.css` is real and does work,
but only for **cross-document** navigations. It is what removes the white flash
between the landing page, the walkthrough, and the hub.

---

## `components/ui/enter.tsx`: two things that look fine and are not

Both were found in the browser, not by tests.

- **The surface key must be a `key` on an inner component, not on the returned
  element.** A key on the element leaves the outer component's state alive, so
  every surface after the first inherits the first one's answer and only ever
  fades.
- **Record the visit in an effect, never in the `useState` initialiser.** React
  calls initialisers twice in development; writing there marks the surface seen
  during the discarded pass, and every entrance degrades to a fade.

`data-enter` is on the rendered element on purpose. It is how the resolved key
is inspected from the DOM, and it is what made both bugs findable.

---

## Onboarding does not hydrate

`OnboardingFlow` attaches no React fiber. Its buttons work only because form
actions are progressively enhanced, which is why it looks fine. `useActionState`
pending states, `ActionFeedback`, and every client effect inside onboarding are
inert.

Pre-existing at merge commit `9d2b49b`, proven by stashing local work and
retesting. Unchanged by a clean dev-server restart with `.next` cleared. All
client chunks return 200 and the console is clean, so it is not a missing
bundle. Tracked as **Task 27**.

Anything relying on client behaviour inside onboarding is currently dead code.
Check before building on it.

---

## Fictional previews disable writes, not controls

A reviewer who cannot work a control cannot judge it, and a dead grey block is
not an honest preview of a live one. Ticking a box changes nothing outside the
component; only the write is refused.

Applied in two places, and the rule for the next one:

- the digest schedule in settings toggles freely, and only **Save** is disabled;
- the onboarding walkthrough advances through every step, while confirming
  evidence stays off.

`dataMode` says where the data came from. It is not the same question as
whether the surface may be operated, which is why `OnboardingView.canAdvance`
exists separately.

---

## Verifying UI: assert the result, not the mechanism

Both regressions above shipped as "done" because the mechanism was checked
instead of the outcome.

| Not sufficient                      | What actually proves it                                                |
| ----------------------------------- | ---------------------------------------------------------------------- |
| The animation class is applied      | Slow it down, read `opacity`/`transform` mid-flight                    |
| `getAnimations()` lists it          | It never blanks: opacity stays above zero across the swap              |
| It is vertically centred            | Both gutters measured, on the axis you changed and the one you did not |
| The element has a `max-width` class | `getComputedStyle().maxWidth` is not `none`                            |
| The component renders               | A fiber attaches and a client effect runs                              |

**The Browser pane's screenshots go stale after a resize.** They repeatedly
showed a wider layout painted into a narrower frame, and showed stale content
after a server action. DOM measurement is authoritative; a screenshot is
supporting evidence, never the proof. When the two disagree, believe
`getBoundingClientRect`.

Console logs also persist across navigations, so errors from an earlier broken
edit keep appearing after the code is fixed. Check timestamps before chasing a
ghost.
