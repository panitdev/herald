# Panit marketing UI kit

Recreations of the public-facing Panit screens — the home page, log-in, and sign-up — built as a click-through prototype. Lifted from `ui/components/home-page.tsx`, `ui/components/auth-shell.tsx`, `ui/components/workflow-showcase.tsx`, `ui/components/panit-logo.tsx`, `ui/components/pulse-button.tsx`, `ui/components/animated-field.tsx`.

## Files

- `index.html` — entry. Renders the home page and lets you click through to log-in / sign-up. Submitting either form simulates loading then "navigates" to the workspace kit.
- `marketing.css` — split-screen shell layout + showcase column gradient + grid texture + flow-step animation.
- `PanitLogo.jsx` — animated workflow-graph mark + wordmark.
- `Primitives.jsx` — Lucide-style `Icon`, `PulseButton`, `AnimatedField`.
- `WorkflowShowcase.jsx` — the right-side animated 4-step demo flow.
- `Screens.jsx` — `HomeScreen`, `LoginScreen`, `SignupScreen`, and the `MarketingApp` router.

## What's faithful and what's cosmetic

This is a recreation, not production code. The cosmetic surfaces (layout, type, color, motion, hover/focus states, the showcase staircase animation, italic-accent headlines) match the source pixel-for-pixel. The behavior is stubbed: there are no real auth requests, the locale switcher is decorative, and "submit" just delays 700ms before pretending to navigate.

## Notes / things skipped

- The codebase has full Korean copy (see `ui/lib/i18n/messages.ts`). Only the English copy is wired up here; the locale chip is decorative.
- The onboarding flow (multi-step) was not recreated — only the entry points are present.
- Form validation is a simple regex / length check; the original uses zod schemas with localized error messages.
