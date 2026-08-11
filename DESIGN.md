# Calendar Contact Tools — Design System

## Product

Calendar Contact Tools is a set of browser utilities for inspecting and transforming ICS calendar and VCF contact files. The product promise is practical: choose a file, solve one problem, download the result. The interface should communicate local processing, precision, and long-term maintenance without behaving like a marketing funnel.

## Audience

Visitors usually arrive from search with an immediate task such as opening an ICS file, converting contacts to CSV, or removing duplicates. They need to identify the right tool, understand its limits, process a file, and leave. Navigation and uploader clarity take priority over storytelling.

## Design philosophy

The visual reference is a professionally maintained internet utility that has existed for years. The interface is calm, compact, and specific. Containment is used for functional surfaces; information relies on typography, whitespace, rules, tables, and definition lists. Visual interest comes from alignment and proportion rather than decoration.

The memorable principle is: **quiet confidence through useful density**.

## Anti-references

- Startup landing pages with large heroes or conversion funnels
- AI wrappers using card grids, gradient blobs, glowing controls, and pill labels
- Bento dashboards and crypto-style high-chroma dark themes
- Fake browser chrome, decorative monospace, or an icon beside every sentence
- Generic phrases such as “powerful,” “seamless,” “supercharge,” or “get started”

## Audit of the previous interface

Ranked by visual impact:

1. Nine identical rounded tool cards created card soup and an unnecessarily long mobile directory.
2. Uppercase eyebrow text appeared above most sections even when it conveyed no state.
3. Privacy appeared as a large tinted banner in the hero and again in tool headings.
4. The uploader was a large dashed rectangle inside a large rounded, shadowed outer card.
5. Sponsor and donation areas repeated the same bordered-card pattern as functional content.
6. Related tools used decorative pills rather than a compact directory.
7. Generous section gaps and a split hero delayed the tool directory.
8. Tool-group headings and cards lacked strong shared alignment, making the page feel assembled from components rather than composed.
9. Dark mode was mechanically related to light mode but too green and uniformly dark.

## Typeface

Primary: **Source Sans 3 Variable**, bundled locally through `@fontsource-variable/source-sans-3` under the OFL-1.1 license. It was selected for its excellent UI legibility, compact lowercase, broad weight range, and established editorial/utility character.

Alternatives evaluated:

- Geist: precise, but strongly associated with contemporary developer SaaS.
- Instrument Sans: distinctive, but more display-oriented than this data-heavy utility needs.
- IBM Plex Sans: credible and technical, but its personality is too prominent across dense tables.
- Archivo: efficient and sturdy, but slightly industrial for longer instructions.
- DM Sans: friendly and clear, but its geometry pushes the interface toward a generic product-template look.

Monospace is limited to raw ICS/vCard data, UID, TZID, file extensions, and code. The fallback is `ui-monospace, SFMono-Regular, Consolas, monospace`.

## Type scale

The root size is 16px with a 1.55 body line height.

- 13px: metadata, captions, table supporting text
- 14px: navigation, breadcrumbs, compact controls
- 16px: body and primary controls
- 18px: small heading or tool name
- 24px: section heading
- 36px: tool-page H1
- 42px: homepage H1, capped at 42px

Headings use weights 620–680 rather than maximum black weights. Headings use `text-wrap: balance`; tabular results use `font-variant-numeric: tabular-nums`.

## Color tokens

One cobalt accent supports actions, links, focus, and selected states.

Light:

- Canvas: `#f7f8fa`
- Surface: `#ffffff`
- Quiet surface: `#f0f3f7`
- Text: `#18202b`
- Muted text: `#596575`
- Border: `#d7dde6`
- Strong border: `#b8c1ce`
- Accent: `#2456a6`
- Accent hover: `#1d478a`
- Accent tint: `#eaf1fb`
- Success/local: `#176b51`
- Warning: `#8a5a00` on `#fff7df`
- Danger: `#b42318` on `#fff0ee`

Dark:

- Canvas: `#11151b`
- Surface: `#171c23`
- Quiet surface: `#1d2430`
- Text: `#e9edf3`
- Muted text: `#a4afbd`
- Border: `#303946`
- Strong border: `#465364`
- Accent: `#82acec`
- Accent hover: `#a2c2f2`
- Accent tint: `#192a44`
- Success/local: `#73c7aa`

No gradients are used.

## Radius scale

- 3px: inputs, table states, compact controls
- 5px: buttons and selected-file rows
- 8px: major functional surfaces such as the uploader and comparison panels
- Full radius: genuine status badges only

Informational sections generally have no radius because they have no containing card.

## Spacing scale

Base units: `4, 8, 12, 16, 24, 32, 48, 64px`.

- Control internals: 8–12px
- Closely related content: 12–16px
- Component separation: 24px
- Section separation: 40–48px
- Page top/bottom: 24–48px

The tool directory and tool surface use the wide layout. Instructions and policy prose use a readable 760px measure.

## Borders

Borders are 1px solid and communicate structure, input boundaries, or row separation. They do not decorate every section. Dashed borders are limited to the actual drop target and use the strong border token.

## Shadows

Shadows are reserved for an active drag state or the primary tool surface on light backgrounds. Default surfaces use a border and at most `0 1px 2px rgba(24, 32, 43, 0.05)`. Dark mode relies on borders, not shadows.

## Interaction timing

- Hover/focus color: 120ms
- Surface and drag state: 160ms
- No page entrance animations, floating effects, or continuous motion
- All transitions are removed under `prefers-reduced-motion`

## Component philosophy

- Header: compact product identification plus four destinations; no marketing CTA.
- Breadcrumbs: subdued location context, not a navigation feature wall.
- Tool directory: two-column textual lists with row separators and one directional affordance.
- Functional tool surface: the only dominant contained region on a tool page.
- Privacy: a compact local-processing statement close to the uploader.
- Instructions: prose or numbered steps without a card.
- FAQ: disclosure rows divided by rules.
- Related tools: textual links divided by separators, not pills.
- Donation: one restrained inline maintenance prompt near the footer.

## Table design

Tables use a dense 14px scale, tabular numerals, left-aligned text, sticky quiet-surface headers, 44px minimum row height, horizontal scrolling where necessary, and a subtle accent-tinted hover. Column rules are avoided; horizontal rules carry structure. Raw identifiers may use monospace. The table gets one boundary, never multiple nested cards.

## Uploader design

The uploader is compact and operational. Its hierarchy is:

1. “Drop your ICS/VCF files here”
2. A normal primary “Choose files” button
3. Accepted extensions, size limit, and “Processed locally” metadata
4. Sample and reset actions
5. Selected-file rows and one process action

The native input remains accessible. The drop target is approximately 150px high on desktop and 132px on mobile, not a half-screen tutorial panel. Drag, focus, loading, error, disabled, and selected-file states each have distinct feedback.

## Sponsor design

Sponsors resemble compact classified sponsorships: a small “Sponsored” label, name, factual sentence, and visit affordance in a horizontal row. Fallback sponsorship inventory uses the same subdued treatment. Sponsor content is visually secondary to tools, never shadowed, animated, or styled like a primary button.

## Dark mode

Dark mode uses deep blue-charcoal surfaces rather than pure black or green-black. Contrast comes from surface steps and borders. Cobalt is lighter, warning and error tints are recalibrated, and shadows are removed. Data density and hierarchy remain identical to light mode.

## Responsive behavior

- 1280–1440px: 1180px functional width; directory is two columns.
- 768px: navigation remains available, tool directory and instruction content can use two columns when space permits.
- 375px: compact header with a clear menu treatment, single-column tool directory, 44px targets, 132px uploader, horizontal table scrolling, and full-width process action.
- Comparison interfaces use horizontally scrollable or single-column panels rather than compressing field values.
- Mobile spacing is deliberately reduced instead of merely stacking desktop sections.
