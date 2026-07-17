# JobWarden UI Direction

This document is the durable taste and interaction standard for JobWarden. The supplied SearchSteward screenshots are information-architecture references only; do not copy their styling or density problems.

## Required skill workflow

Before changing product UI, load these skills when available:

1. `anthropic-skills:web-artifacts-builder` for its design guidance against generic AI-generated interfaces. Use its style principles only; do not replace JobWarden's Next.js application with its artifact scaffold or bundler.
2. `vercel:shadcn` for accessible primitives, composition, theming, and component-specific guidance.
3. `vercel:react-best-practices` after editing multiple TSX files.

Use browser verification at desktop and 390-pixel mobile widths before declaring a UI task complete.

## Visual character

JobWarden is a calm, capable work tool rather than a marketing template. It is light-first and editorially structured because users will scan dense job information for long periods.

- Use Geist Sans for interface text and Geist Mono only for identifiers, dates, rates, run IDs, and compact operational metadata.
- Use warm neutral or white surfaces, dark ink text, quiet borders, and one restrained blue action colour.
- Let typography, alignment, spacing, and information hierarchy create structure before adding containers.
- Use modest radii selectively. Panels, inputs, buttons, badges, and every nested element must not all become identical rounded rectangles.
- Keep icons small and quiet. Text labels carry meaning; icons support them.
- Prefer compact but breathable density: consistent 4- and 8-pixel spacing increments, short line lengths for prose, and aligned metadata columns for scanning.
- Use semantic colour only for state: approved/success, pending/warning, rejected/error, and neutral/unknown.

## Avoid

- Purple or multicolour gradients, glassmorphism, glowing borders, decorative blobs, and oversized hero copy.
- Excessive centred layouts, pill-shaped controls, nested cards, uniform rounded corners, and repeated `rounded-xl border p-6` containers.
- Template dashboard rows of interchangeable statistic cards when a single clear sentence or compact count is enough.
- Mixed table/card modes on one feed, view toggles without a real user need, premium labels, upgrade prompts, AI sparkle icons, and fake match precision.
- Union Jack motifs, London landmark decoration, or other UK clichés. UK specificity comes from employment vocabulary, locations, rates, and clear language.
- Animation that delays work. Motion should explain state change, not decorate routine navigation.

## Product composition

- Desktop uses a persistent, narrow navigation rail and one dominant content column. Mobile uses an accessible sheet/drawer.
- Page headers pair one clear title with a short status line and at most one primary action.
- Jobs use one consistent responsive list. Employer, UK location, workplace, employment type, working time, compensation, IR35 status when relevant, and posting age must scan in a stable order.
- Filters stay URL-backed. Desktop filters can remain visible; mobile filters use a sheet that shows active values and a clear-all action.
- Admin pages are visually separated from the job-search experience and favour compact tables or lists over decorative cards.
- Loading, empty, no-results, error, pending-access, rejected, and suspended states are designed surfaces, not placeholder paragraphs.

## Review bar

A UI task is not complete until it passes keyboard navigation, visible focus, WCAG 2.2 AA contrast, responsive layout, loading/empty/error-state review, and real browser screenshots. Reviewers must explicitly check for generic AI-dashboard patterns as well as functional correctness.
