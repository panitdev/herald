---
name: panit-design
description: Use this skill to generate well-branded interfaces and assets for Panit, either for production or throwaway prototypes/mocks/etc. Panit is a calm, bilingual (EN+KR) LLM-agent workflow automation product for worker-team managers; the system covers its cobalt-and-cream palette, Pretendard + Noto Serif KR typography, signature italic-headline treatment, paper-grain backgrounds, framer-motion micro-interactions, Lucide iconography, and a recreated UI kit for the marketing site and the workspace app.
user-invocable: true
---

# Panit design skill

Read the `README.md` file within this skill, and explore the other available files.

If creating visual artifacts (slides, mocks, throwaway prototypes, etc), copy assets out and create static HTML files for the user to view. If working on production code, you can copy assets and read the rules here to become an expert in designing with this brand.

If the user invokes this skill without any other guidance, ask them what they want to build or design, ask some questions, and act as an expert designer who outputs HTML artifacts _or_ production code, depending on the need.

## What's in here

- `README.md` — voice, color, type, visual foundations, iconography rules (start here)
- `colors_and_type.css` — every token as a CSS custom property; drop into a page and prefix-reference (`var(--panit-primary)` etc.)
- `assets/` — logos and the geometric "PN" favicon mark
- `ui_kits/marketing/` — HTML + JSX recreations of the home, login, signup screens
- `ui_kits/workspace/` — HTML + JSX recreations of the sidebar, dashboard, workflow overview, agent chat
- `preview/` — small specimen cards used in the Design System tab

## Non-negotiables

- Italic primary-blue serif accent in headlines. One word per headline, max.
- Pretendard for UI, Noto Serif KR for headlines and stat numbers, Geist Mono for tabular nums.
- `.panit-grain` overlay on every full-bleed shell.
- Lucide icons only. No emoji.
- Framer-motion easings: `cubic-bezier(0.32, 0.72, 0, 1)` (lists/pages) and `cubic-bezier(0.22, 1, 0.36, 1)` (hero copy).
- Default border radius 12px; prompt box uses 28px.
- Calm tone. Sentence case. No exclamation points.

## Font substitution note

Pretendard and Noto Serif KR are loaded from CDN (jsdelivr + Google Fonts). No binary font files ship with this system — the import URLs in `colors_and_type.css` cover Latin + Korean glyphs. If the user wants self-hosted fonts, ask them to upload the official `.woff2` files and we'll wire them in.
