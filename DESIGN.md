# Calendar Contact Tools — Design Contract

## Product intent

Calendar Contact Tools is a set of browser utilities for inspecting and transforming ICS calendar and VCF contact files. A visitor normally arrives with one job: choose a file, review the result, and download when needed. The interface prioritizes that path over storytelling or promotion.

The visual principle is **quiet confidence through useful density**: compact, precise, familiar, and trustworthy. It should resemble a maintained internet utility, not a startup landing page, dashboard, or marketing funnel.

## Permanent rules

1. No emojis or text glyphs as interface icons.
2. Use one icon family only; the product mark is the sole custom symbol.
3. Color communicates state or action, not decoration.
4. Every page has one primary intent.
5. Remove before adding.
6. Avoid repeated card layouts; use spacing, rules, and typography first.
7. Use consistent verbs for consistent actions.
8. Put the primary tool or action before supporting content.
9. Supporting content exists only when it helps use, trust, or search intent.
10. Empty space does not need decoration.

No gradients, glow, decorative pills, animated entrances, floating cards, fake browser chrome, or icon beside every heading. Functional containment is appropriate for uploaders, tables, comparisons, errors, and warnings.

## Typography

Use locally bundled **Source Sans 3 Variable** for interface and prose. Use the system monospace stack only for raw ICS/vCard data, UID, TZID, file extensions, and code.

- 13px: metadata, captions, table support text
- 14px: navigation, breadcrumbs, dense controls, and tables
- 16px: body and primary controls
- 18px: tool names and small headings
- 24px: section headings
- 32–42px: page headings; never oversized

Heading weight is 620–680. Bold identifies hierarchy, not whole paragraphs. Prose uses a readable maximum width; data surfaces may use the wide layout.

## Color

One cobalt accent is reserved for links, primary actions, focus, and selection.

Light tokens:

- Canvas `#f7f8fa`, surface `#ffffff`, quiet surface `#f0f3f7`
- Text `#18202b`, muted `#596575`
- Border `#d7dde6`, strong border `#b8c1ce`
- Accent `#2456a6`, hover `#1d478a`, tint `#eaf1fb`
- Local/success `#176b51`, warning `#8a5a00`, danger `#b42318`

Dark tokens:

- Canvas `#11151b`, surface `#171c23`, quiet surface `#1d2430`
- Text `#e9edf3`, muted `#a4afbd`
- Border `#303946`, strong border `#465364`
- Accent `#82acec`, hover `#a2c2f2`, tint `#192a44`
- Local/success `#73c7aa`

Dark mode uses blue-charcoal rather than pure black. Status color must always have a text or structural cue; color alone never carries meaning.

## Spacing, borders, and motion

Use the `4, 8, 12, 16, 24, 32, 48, 64px` spacing scale. Closely related content uses 12–16px, components 24px, and major sections 32–48px. Mobile reduces vertical spacing deliberately.

Radius is 3px for inputs and dense table states, 5px for buttons and file rows, and 8px for major functional surfaces. Full radius is reserved for genuine status badges. Borders communicate input boundaries or grouping; shadows are limited to active drag feedback or a subtle light-mode tool surface.

Hover and focus transitions run for 100–160ms. Do not animate page entry, icons, sponsor cards, or layout position. Remove all transitions under `prefers-reduced-motion`.

## Logo and icons

The product mark combines a calendar outline with a person silhouette. It is monoline, geometric, uses `currentColor` in the interface, and appears consistently in the header, footer, favicon, app icons, and Open Graph asset.

Interface icons use the curated local Lucide subset in `src/components/Icon.ts`. Ship only icons used for recognition or interaction. Standard sizes are 16px for compact actions, 18px for controls, and 20px for categories. Decorative icons use `aria-hidden`; an icon-only control always has an accessible label.

## Page hierarchy

Tool pages follow:

1. Unique title and one sentence explaining the job
2. Compact local-processing statement
3. Functional tool surface: options, uploader, results
4. Secondary sponsor placement
5. Concise steps, limitations, FAQ, and related links

When input is empty, the uploader is primary. Once processed, results, review controls, and download become primary. Supporting text never competes with either state.

The homepage contains a short introduction, the calendar/contact tool directory, one sponsor row, and the footer. Do not add repeated trust blocks, generic FAQs, or marketing sections.

## Components

- Header: product mark and name, primary Calendar/Contacts navigation, quieter Sponsor/About links, icon-only theme control.
- Uploader: one clear choose action, secondary sample action, selected-file rows, and a process action shown only when meaningful. Keep native input, drag/drop, and keyboard behavior.
- Tables: dense 14px text, sticky headers, 44px minimum rows, horizontal scrolling inside the table region, and no nested cards.
- Errors and warnings: clear heading or message, semantic color, screen-reader announcement, and recovery direction.
- FAQ: divided disclosure rows, never individual cards.
- Related tools: compact text links with separators.
- Sponsor: clearly labeled horizontal placement, visually secondary, locally served artwork, and no animation or imitation download controls.

## Action vocabulary

Use these verbs consistently:

- **Choose file / Choose files** for file picker activation
- **Use sample** for fictional local sample input
- **Process** for starting parsing or transformation
- **Search** and **Filter** for narrowing visible results
- **Reset** for returning a current interface to its initial state
- **Remove** for removing selected input or an exact copy
- **Review** for inspecting a candidate decision
- **Merge**, **Keep**, and **Exclude** for explicit resolution choices
- **Preview** and **Apply** for the two stages of a reviewed merge
- **Undo** for reverting the last reversible resolution
- **Download** for creating any output file
- **Cancel** for stopping bounded background work

Inspect and View remain valid nouns or modes when they describe distinct tool behavior. Do not use Export when the action creates a download.

## Accessibility and responsive behavior

Maintain visible focus, explicit labels, semantic tables, live status regions, 44px touch targets, AA-oriented contrast, and keyboard operation. Do not trade labels or decision clarity for icon-only minimalism.

- At 1280–1440px, functional content may use the 1180px width and the directory uses two columns.
- At 768px, controls wrap without forcing page overflow.
- At 375–430px, navigation remains obvious, the directory is one column, the uploader compresses, and process actions use full width.
- Tables and comparison areas own their horizontal scrolling; the page does not.
- Duplicate resolution keeps explicit text because its choices are consequential.
