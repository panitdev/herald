# Panit workspace UI kit

Recreations of the Panit in-app product — the workspace sidebar, the dashboard, the per-workflow overview, and the agent builder chat — assembled as a click-through prototype.

## Files

- `index.html` — entry. Renders the workspace app starting on the dashboard. Click an app row → workflow overview. Click "Open builder" → agent chat.
- `workspace.css` — workspace shell layout (sidebar + scrolling content) + grain overlay + dashboard panels + agent chat composer.
- `WorkspaceSidebar.jsx` — workspace switcher dropdown, top-level nav, recent sessions, apps list with dashed "New app" tile.
- `WorkspaceDashboard.jsx` — home page: eyebrow + workspace name, building banner, two stat cards, apps overview panel, today's activity feed.
- `WorkflowOverview.jsx` — per-app page: stats trio, current-flow card with numbered plain-language steps, run history table.
- `AgentChat.jsx` — agent builder chat: message list with user/agent bubbles, tool-call cards, 28px-radius prompt composer with paperclip + model label + send.
- `WorkspaceApp.jsx` — top-level routing/state.

Lifted from `ui/components/workspace-sidebar.tsx`, `workspace-dashboard.tsx`, `workflow-overview.tsx`, `workspace-shell.tsx`, `workspace-empty-page.tsx`, `agent/AgentChat.tsx`, `agent/AgentPromptBox.tsx`, `workflow/run-history.tsx`.

## What's faithful and what's cosmetic

Layout, type, color, motion, hover states, the wiggling sparkle on the building banner, the active-pill in the sidebar, the prompt-box shadow and 28px radius — all match the source. Tool-call rendering uses the codebase's `--tool-success-bg` / `--tool-pending-bg` palette.

## Notes / things skipped

- No real chat backend — sends are simulated with a 1.2s delay and a hand-written response.
- The `view subagent conversation` / file-overlay flows are not recreated.
- The codebase has more nav routes (Members, Settings, Sessions list, new-app form) — these render simple empty pages here.
- Recent sessions and apps are seeded data, not a real store.
