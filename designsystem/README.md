# Panit Design System

> **Panit** — Workflow automation for worker teams.
> _"Build agents that **do the busywork** for your team."_

Panit is an LLM-agent workflow builder for operations managers. Managers describe a recurring task ("when a new support email arrives, summarize it, label urgency, draft a reply"), Panit composes a workflow that connects the right tools (Sheets, KakaoTalk, Slack, NAVER WORKS, email), and the agent runs it on autopilot — with human checkpoints. The product is bilingual (English + Korean) and aimed at small ops teams in Korea and elsewhere.

## Sources

This design system was derived directly from a Next.js + Tailwind v4 + shadcn (radix) + framer-motion codebase the user attached at `ui/`. Highlights the system was lifted from:

- `ui/app/globals.css` — full color token table (oklch), Tailwind v4 `@theme inline` block, the `.grain` paper texture.
- `ui/components/panit-logo.tsx` — the workflow-graph mark and animated orbiting dot.
- `ui/components/home-page.tsx`, `ui/components/auth-shell.tsx`, `ui/components/workflow-showcase.tsx` — the split-screen marketing/auth shell + animated 4-step flow card on the right.
- `ui/components/pulse-button.tsx`, `ui/components/animated-field.tsx`, `ui/components/ui/*` — interaction patterns.
- `ui/components/workspace-*`, `ui/components/workflow/*`, `ui/components/agent/*` — the workspace app (sidebar, dashboard, workflow overview, agent chat).
- `ui/lib/i18n/messages.ts` — voice + copy in EN and KO.
- `ui/lib/animations.ts` — `EASE_OUT = cubic-bezier(0.32, 0.72, 0, 1)` shared everywhere.
- `ui/public/icon.svg` — the alternate "PN" geometric mark (favicon).

If you have access, **the original codebase is the source of truth** for any pattern not captured here.

---

## Index

- `README.md` — this file
- `colors_and_type.css` — all design tokens (colors, type, radii, motion, shadows) as CSS custom properties
- `SKILL.md` — Agent-Skills-compatible entry for using this system inside Claude Code
- `assets/` — logos, icons, brand marks copied from the codebase
- `fonts/` — webfont notes (all fonts are CDN-loaded, no binary files needed)
- `ui_kits/`
  - `_shared/kit.css` + `PanitLogo.jsx` + `Primitives.jsx` — shared logo, icons, button, field, status dot/pill
  - `marketing/` — public-facing site: `index.html` (Home → Login → Signup), `WorkflowShowcase.jsx`, `Screens.jsx`
  - `workspace/` — in-app product: `index.html` (Dashboard → Workflow → Agent chat), `WorkspaceSidebar.jsx`, `WorkspaceDashboard.jsx`, `WorkflowOverview.jsx`, `AgentChat.jsx`, `WorkspaceApp.jsx`
- `preview/` — small HTML specimen cards for each token / component / pattern in the Design System tab

---

## Content fundamentals

Panit's voice is **calm, practical, and slightly literary**. Marketing copy uses a serif italic for one emphasized phrase ("Build agents that _do the busywork_ for your team."), but the surrounding text stays grounded — no superlatives, no exclamation points, no "blazing fast." The product is bilingual; the Korean voice mirrors the English voice (warm, plain, finished verb endings — `~합니다`/`~세요`, not `~해요`).

### Tone & casing

- **Sentence case** everywhere — buttons, headings, eyebrows. Capitalize a proper noun ("Slack", "Gmail", "KakaoTalk"), not every word in a label.
- **Eyebrow caps** are the one exception: short labels like `LIVE EXAMPLE`, `FOR WORKER-TEAM MANAGERS`, `STEP 1`, set in tracked uppercase (`letter-spacing: 0.14em`) in the primary cobalt.
- **Hyphens, not em dashes**, in compound modifiers ("worker-team managers", "auto-respond", "roll-up").
- **No exclamation points.** Confidence comes from a clear sentence, not punctuation.
- **No emoji.** Panit relies on Lucide icons and the Panit logo dot for any visual punctuation.

### Person & address

- **"You" for the manager** ("Give your team back their afternoons.", "Log in to check on your agents."). The manager is always the reader.
- **"Your team" / "the team"** for the workers — Panit is built _for_ the team, but the buyer is the manager. Never directly address the worker in primary marketing.
- **"Panit" as the actor** in the third person inside copy ("Panit connects your tools.", "Panit just does it."). Treat Panit like a teammate, not a product.
- **"Panit Labs"** is the legal entity used in footers (`© 2026 Panit Labs`).

### Patterns to copy

- **One italic word per headline.** Example: `Build agents that *do the busywork* for your team.` / `Give your team back their *afternoons*.` The italic phrase is always the verb-or-payoff, set in `font-serif italic text-primary`.
- **Lead with the verb.** "Describe it once. Panit runs it forever." "Log in to check on your agents."
- **Promise a concrete time saving, not a percentage.** "Saved your team ~14 hrs this week." "Invite your team in under 2 minutes."
- **Numbered, plain-language workflow steps.** Example, lifted from `workflow-overview.tsx`:
  1. Capture a new worker submission or attendance event.
  2. Validate the payload and extract structured fields.
  3. Summarize exceptions and notify the responsible lead.
  4. Store the final record for reporting.

### Testimonial style

Short, specific, attributed to a real-sounding ops role at a real-sounding company. Example from the codebase:
> "My ops team stopped copy-pasting between six tools. Panit just does it."
> — Maya R., Operations Manager, Fieldwork Co.

### Footnotes & legal

Quiet, single-sentence, small, muted color. Examples: `No credit card. Invite your team in under 2 minutes.` / `By creating an account you agree to Panit's Terms and Privacy Policy.`

---

## Visual foundations

### Color

The palette is a deliberate **warm cream + cobalt blue + amber** combination — calm, not sterile. All values are in oklch (see `colors_and_type.css`).

- **Background** — warm off-white (`oklch(0.985 0.012 85)`). Not pure white. Reads as paper.
- **Foreground** — deep navy ink (`oklch(0.18 0.06 264)`).
- **Primary / Panit blue** — cobalt (`oklch(0.48 0.24 264)`). Used for the brand mark, italic headline accents, primary CTAs, eyebrow caps, the live status dot.
- **Accent / amber** — `oklch(0.82 0.13 75)`. Used very sparingly for the secondary node in the logo and warning/attention states.
- **Muted** — soft cream (`oklch(0.955 0.015 85)`) for secondary surfaces, sidebar background, ghost button hover.
- **Border** — `oklch(0.90 0.015 85)`, very low-contrast. Often dashed for "in progress" containers.
- **Destructive** — `oklch(0.55 0.20 25)`, restrained terracotta-red. Errors only.

Dark mode swaps backgrounds for a deep navy (`oklch(0.16 0.06 264)`) and brightens the cobalt to `oklch(0.68 0.20 264)` for contrast.

### Type

- **Sans — Pretendard.** A Korean-friendly humanist sans with crisp Latin glyphs. Loaded from the official CDN. Used for 95% of UI text.
- **Serif — Noto Serif KR.** Used for headlines, stat numbers, and the italic accent phrases. Tracking is tight (`-0.01em`), weight is 500 (not 700 — keeps it editorial).
- **Mono — Geist Mono.** Tabular nums for stats, timestamps, IDs, code blocks in agent tool calls.
- The **italic primary-blue serif phrase** is a brand signature — preserve this treatment exactly when writing new headlines.

### Spacing & layout

- **Card padding** is consistently `p-4` or `p-5` (16–20px). The dashboard uses `space-y-5` between panels.
- **Sidebar** is fixed at `260px`, separated by a 1px border, on a slightly tinted `--panit-sidebar` surface.
- **Marketing/auth pages** use a fixed grid: `max-w-7xl`, **`grid-cols-1 lg:grid-cols-2`** — form on the left, animated showcase on the right. The showcase column is **hidden below `lg`**.
- **In-app content** is centered in a `max-w-3xl` column with `px-6` (`sm:px-8 lg:px-10`).

### Backgrounds

- **The `.grain` overlay** is applied to every full-bleed shell (`grain min-h-dvh bg-background`). It's a 3×3px radial-dot pattern in warm light brown at `opacity: 0.35`, blended `multiply`. Gives every page the paper feel.
- **The showcase column** has a soft tinted gradient (`from-primary/8 via-background to-accent/10`) plus a faint 32×32px grid lined in `var(--border)`, masked by a radial ellipse so it fades out into the page.
- **No photography. No illustrations.** The brand's visual interest comes from animated component fragments (workflow nodes, the orbiting logo dot), not imagery.

### Animation

The codebase uses framer-motion universally. There are **two easings**:

- **`EASE_OUT = cubic-bezier(0.32, 0.72, 0, 1)`** for page transitions / list reveals.
- **`cubic-bezier(0.22, 1, 0.36, 1)`** for hero copy fade-up and per-section reveals.

Patterns to reuse:

- **Hero copy:** `initial={{ opacity: 0, y: 12 }}`, `animate={{ opacity: 1, y: 0 }}`, `duration: 0.5`, page ease.
- **Buttons (PulseButton):** `whileTap={{ scale: 0.97 }}`, `whileHover={{ y: -1 }}`, spring `stiffness: 600, damping: 30`.
- **Validation icons (AnimatedField):** spring pop, `stiffness: 500, damping: 22`, `scale: 0 → 1` with a small initial rotate.
- **Logo orbit:** the bright dot loops a triangle path over **4.5s, easeInOut**, repeating forever.
- **Status dot:** an `animate-ping` halo behind a small solid dot, primary cobalt for "live", muted gray for "paused".
- **Active sidebar pill:** uses `layoutId="sidebar-active"` for an FLIP-style spring between active items (`stiffness: 380, damping: 30`).
- **Progress bars** sweep from 0 to target in **1.1s, page ease**.
- **Loops** (logo, status ping, building banner sparkle) run `4–5s` with `repeat: Infinity`.

### Hover & press

- **Buttons** lift 1px on hover (`y: -1`) and shrink to 0.97 on tap. Primary uses a subtle inner highlight + drop shadow (`--panit-shadow-cta`). Outline buttons darken their border to `foreground/20`.
- **Cards** lift 2px (`whileHover={{ y: -2 }}`) with a spring.
- **Sidebar items** swap background to `sidebar-accent/60` on hover and add a vertical primary bar (animated by `layoutId`) when active.
- **Text links** go from `muted-foreground` to `foreground` — never to primary on hover. Primary is reserved for emphasis, not interactivity.
- **Inputs** swap their border to `primary` and add a `ring-4 ring-primary/10` halo on focus. Validation errors swap the same ring to destructive.

### Borders, shadows, radii

- **Default border-radius is 12px** (`var(--radius) = 0.75rem`). Cards, buttons, sidebar items.
- **Pills (status badges, profile chip, dot indicators)** use `rounded-full`.
- **Prompt box** has an exceptionally large `1.75rem` (28px) radius — a brand signature.
- **Shadows are restrained.** The standard card uses `shadow-sm` (a 1px-offset, 3px-blur navy ink shadow). The primary CTA gets a cobalt-tinted drop shadow; popovers get a navy ink shadow `0 12px 32px -12px oklch(0.18 0.06 264 / 0.25)`. **No heavy or colored shadows otherwise.**
- **Dashed borders** mark "in progress" / "create new" affordances. The new-app button is `border-dashed border-sidebar-border` and turns `border-primary/60 bg-primary/5` on hover.

### Transparency & blur

Used sparingly. The agent **prompt box** uses `bg-white/96 backdrop-blur` to feel slightly floating. Popovers and dropdowns use solid `bg-popover`. **Avoid frosted-glass effects elsewhere** — the design wants paper, not glass.

### Layout rules / fixed elements

- Workspace shell uses `h-dvh flex overflow-hidden` with the sidebar fixed at 260px and the content area scrolling internally.
- Marketing/auth pages use `min-h-dvh` (not h-dvh) so content can scroll if it exceeds the viewport.
- The hero/showcase grid is **never stacked vertically on lg+** — at `lg:` the right column appears, below `lg:` it's hidden entirely (no mobile-optimized variant).

### Cards

Standard card recipe:
```css
border: 1px solid var(--panit-border);
background: var(--panit-card);
border-radius: 12px;
padding: 16–20px;
box-shadow: 0 1px 3px oklch(0.18 0.06 264 / 0.08);
```

Variants:
- **Stat card** — same recipe + a thin 2px accent stripe on the left (`bg-primary` / `bg-accent` / `bg-destructive` depending on tone).
- **Inline alert / "building" banner** — dashed primary border, `bg-primary/[0.04]`, sparkle icon that wiggles on a 4s loop.
- **Tool-call card** (agent) — uses `--tool-success-bg` / `--tool-error-bg` / `--tool-pending-bg` for tint by status.

---

## Iconography

**Panit uses Lucide React** (`lucide-react@^0.564`) exclusively for product icons. Every icon in the codebase comes from Lucide; there is no custom icon set, no icon font, and no PNG icons. Common Lucide icons in use:

- `ArrowRight`, `ArrowUpRight`, `ArrowDown` — flow direction
- `Sparkles` — agent / AI affordance, always in primary cobalt
- `Mail`, `FileSpreadsheet`, `MessageSquareText`, `MessageSquare`, `Inbox` — integrations
- `CheckCircle2`, `XCircle`, `Check`, `AlertCircle` — run results, field validation
- `Activity`, `Clock`, `Clock3`, `Bot`, `ListChecks`, `FileCheck2`, `Zap` — workflow status and types
- `Home`, `Users`, `Settings`, `Plus`, `ChevronDown`, `LogOut`, `Building2` — navigation
- `Paperclip`, `SendHorizontal`, `Loader2`, `Eye`, `EyeOff` — composer / form
- `PanelLeftClose`, `PanelLeftOpen` — sidebar collapse

### Sizing & stroke

- Icons in nav rows / buttons: `h-4 w-4` (16px).
- Icons in tile containers (with a square colored background): `h-3.5 w-3.5` (14px) inside an `h-7 w-7` or `h-9 w-9` tile.
- Stroke weight is Lucide default (1.5). The Check inside the field-valid indicator uses `strokeWidth={3}` for emphasis.

### Color rules

- Use `text-muted-foreground` by default.
- Switch to `text-primary` when the icon represents agent activity, a success state, or an active nav item.
- Inside a colored tile (`bg-primary/10`, `bg-accent/20`), the icon inherits the corresponding `text-primary` or `text-accent-foreground`.
- **Never use a colored icon on a white card without a tile** — Panit pairs colored icons with a tinted backdrop tile.

### Logos

Two marks ship in `assets/`:

- **`panit-icon.svg`** — the geometric "PN" mark from `ui/public/icon.svg`. Used as favicon and the dark-mode app icon. Has a built-in `prefers-color-scheme` swap.
- **`panit-icon-light-32.png`** / **`panit-icon-dark-32.png`** — pre-rendered 32×32 favicons.
- **The wordmark** is the JSX `PanitWordmark` component in `ui/components/panit-logo.tsx`: the workflow-graph mark + the text `Panit` set in `font-sans text-2xl tracking-tight`. The graph mark is **three corner nodes + a brighter amber center node + an orbiting dot that loops a triangle path over 4.5s**.

For new contexts, prefer the workflow-graph mark from `panit-logo.tsx` — the geometric "PN" mark is more of a system favicon.

### Emoji & unicode

**No emoji are used in the product.** No unicode-as-icon either (no `→`, no `•` as a visual element). Use Lucide for every glyph, including arrows (`ArrowRight`) and bullets (the `StatusDot` + `animate-ping` pattern).

---
