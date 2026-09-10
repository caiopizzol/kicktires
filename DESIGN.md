---
version: alpha
name: kicktires
description: Receipt identity for a code reviewer that runs the code. One ink, one paper, one highlighter.
colors:
  primary: "#151515"
  secondary: "#6F6F68"
  secondary-dark: "#9A9A92"
  tertiary: "#FF5A1F"
  neutral: "#F7F4EC"
  surface: "#1C1C1C"
  highlight: "#FABA9E"
typography:
  wordmark:
    fontFamily: VT323
    fontSize: 40px
    fontWeight: 400
    lineHeight: 0.9
    letterSpacing: -0.01em
  display:
    fontFamily: Work Sans
    fontSize: 52px
    fontWeight: 700
    lineHeight: 1.06
    letterSpacing: -0.025em
  heading:
    fontFamily: Work Sans
    fontSize: 18px
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: -0.01em
  body:
    fontFamily: Work Sans
    fontSize: 15px
    fontWeight: 400
    lineHeight: 1.55
  mono:
    fontFamily: Space Mono
    fontSize: 12.5px
    fontWeight: 400
    lineHeight: 1.55
  label:
    fontFamily: Space Mono
    fontSize: 11px
    fontWeight: 700
    lineHeight: 1.4
    letterSpacing: 0.14em
rounded:
  none: 0px
  sm: 4px
  full: 9999px
spacing:
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 56px
components:
  page:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.neutral}"
    typography: "{typography.body}"
    padding: "{spacing.xl}"
  caption-on-dark:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.secondary-dark}"
    typography: "{typography.mono}"
  wordmark:
    textColor: "{colors.neutral}"
    typography: "{typography.wordmark}"
  headline:
    textColor: "{colors.neutral}"
    typography: "{typography.display}"
  section-label:
    textColor: "{colors.tertiary}"
    typography: "{typography.label}"
  receipt:
    backgroundColor: "{colors.neutral}"
    textColor: "{colors.primary}"
    typography: "{typography.mono}"
    rounded: "{rounded.none}"
    padding: "{spacing.lg}"
  receipt-title:
    backgroundColor: "{colors.neutral}"
    textColor: "{colors.primary}"
    typography: "{typography.heading}"
  receipt-meta:
    backgroundColor: "{colors.neutral}"
    textColor: "{colors.secondary}"
    typography: "{typography.mono}"
    padding: "{spacing.md}"
  highlight:
    backgroundColor: "{colors.highlight}"
    textColor: "{colors.primary}"
    typography: "{typography.mono}"
    padding: "{spacing.xs}"
  button-primary:
    backgroundColor: "{colors.tertiary}"
    textColor: "{colors.primary}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    padding: "{spacing.sm}"
  avatar:
    backgroundColor: "{colors.primary}"
    rounded: "{rounded.full}"
    size: 40px
---

# kicktires

## Overview

kicktires is a self-hosted code reviewer that runs the code it reviews. The identity is a
printed record: a thermal receipt on a dark counter. One ink, one paper, one highlighter.
Flat, literal, monospaced where the content is data. It should feel like terminal output a
careful colleague handed you, not a dashboard.

Audience: developers who configure their own tools and read exit codes.

Surfaces, in order of importance: the GitHub review comment (native Markdown, unstyled),
the receipt on the website and in the CLI, the README.

## Colors

Paper, ink and one highlighter.

- **Primary (#151515)** "Toner": ink on the receipt; the mark on light backgrounds.
- **Secondary (#6F6F68)** "Muted": metadata and evidence IDs on paper. On dark surfaces
  the same role uses `secondary-dark` (#9A9A92).
- **Tertiary (#FF5A1F)** "Highlighter": exactly one element per surface. The dotted i in
  the wordmark, the failing cell, the finding location, the contact patch on the mark.
- **Neutral (#F7F4EC)** "Thermal": the receipt paper; text and mark on dark.
- **Surface (#1C1C1C)** "Counter": the page behind the receipt.
- **Highlight (#FABA9E)**: highlighter at 38% over thermal, for the one line that matters.

Never gradients, a second accent, green or red for pass and fail (GitHub supplies those in
its own rendering), pure #000 or #FFF.

## Typography

Three families, one job each.

- **VT323** for the wordmark and nothing else.
- **Work Sans** for anything read as a sentence: display, headings, body.
- **Space Mono** for anything that is data: the receipt, commands, evidence IDs. Labels
  are Space Mono Bold, uppercase, tracked +14%.

Rule: if it is longer than a label, it is not monospaced.

## Layout

Left-aligned. One column below 900px, two columns above with the receipt on the right.
Receipt max width 560px. Sections divide with a 1px rule on dark and dashed rules on paper.
Spacing scale 4 / 8 / 16 / 24 / 56. Generous outside the receipt, tight inside it.

## Elevation & Depth

Flat. The receipt has one soft shadow (`0 30px 50px -28px #000`) to lift it off the
counter. Nothing else casts a shadow. No blur, no glass.

## Shapes

Receipts are square-cornered with scalloped top and bottom edges. Buttons and chips use a
4px radius. Avatars are circles.

**The mark: a tire under load.** On a 100-unit canvas, a ring with outer radius 42 and
inner radius 22, centred at (50, 50), flattened at y = 84 where it meets the ground. A
9-unit contact patch in highlighter runs across the flat. Ink is Toner on light and Thermal
on dark; the patch never changes. Files: `.github/assets/logo-light.svg` and
`.github/assets/logo-dark.svg`. Minimum 16px. Pair with the wordmark only at 24px and above.

## Components

- **Receipt:** thermal background, toner text, mono, 24px padding, no radius, scalloped edges.
- **Receipt title:** Work Sans 600, one sentence, leads with what happened.
- **Highlight:** soft orange behind the one cell, ID or line that matters. Never two per receipt.
- **Status chip:** label type in a 1px toner border; incomplete gets the highlight background.
- **Primary button:** highlighter background, toner text, label type, 4px radius.
- **Avatar:** toner circle with the mark in thermal.
- **GitHub comment:** native Markdown only: heading, table, details, inline comment. The
  brand appears through the avatar, the name and the order of information.

## Do's and Don'ts

- Do lead with the outcome and its cause. Put status last.
- Do use one highlighter element per surface.
- Do keep the wordmark lowercase, one word.
- Don't add a second accent or a gradient.
- Don't use green or red for pass and fail outside GitHub's own rendering.
- Don't put racing, road or garage imagery anywhere. The name carries the metaphor.
- Don't style the GitHub comment. It will not survive.
- Don't use the mark below 16px or the wordmark below 24px.
