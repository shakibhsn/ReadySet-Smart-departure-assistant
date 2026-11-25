# ReadySet design system (purple and lime)

A UI-only redesign: no backend, database, API contract, authentication or business-logic change. The look follows the brief (soft purple page, large rounded dashboard container, slim white icon rail, purple and lime accents, rounded bordered cards) adapted to ReadySet's real features.

## Tokens (`src/styles/index.css`)
All colours are CSS variables; components use token classes only (a test fails on hard-coded hex colours in components).

| Token | Light | Use |
|---|---|---|
| `shell` | `#DDD9F3` | the soft purple page behind the dashboard container |
| `canvas` / `surface` | `#F5F4FA` / `#FFFFFF` | app background / cards |
| `ink` / `muted` / `line` | `#1C1930` / `#6F6C82` / `#E7E4F2` | text, secondary text, borders |
| `brand-50…900` | primary `#7650D8` (600), deep purple `#452778` (900) | actions, links, emphasis |
| `lavender` | `#C9C9FF` | soft accents |
| `lime` / `lime-ink` | `#D7FF35` / `#2B1A55` | the highlight, used sparingly: active navigation, the one key action per screen |
| `accent-50…700`, `accent-fill`, `on-accent` | lime-green family, olive text | success, "ready", progress, checked boxes |
| `amber`, `rose` | `#EDAE49`, `#D1495B` | weather cautions, alerts |

Note on `muted`: the brief's `#777487` gives about 4.1:1 on the canvas, so the token is `#6F6C82` to keep 4.5:1 for small text. The dark theme (the existing Light / Dark / System switch) has its own purple-black values. `src/test/redesign.test.jsx` computes WCAG contrast for the key text/background pairs in both themes (all at least 4.5:1).

Radius: cards 22 px, controls 16 px, the page container 32 px. Shadows are purple-tinted. Motion is unchanged (short, one-shot, disabled by `prefers-reduced-motion`).

## Layout
- **Shell** (`src/layouts/AppLayout.jsx`): on desktop, a soft purple page with one large rounded container; a slim white **icon rail** (`SidebarRail`, tooltips, lime pill for the active page, unread count on Notifications, log out at the bottom) and the top bar + page. On phones and tablets the container is edge to edge and the rail becomes the labelled drawer (`AppSidebar`).
- **Top bar** (`AppNavbar`): page title, notifications (existing feature), account menu (shadcn DropdownMenu). The old search box was removed: it never searched anything and there is no search API.
- **Dashboard**: greeting and quick actions; a two-column bento (main: next departure, weather-aware departure reminder, today and upcoming events, preparation checklist, calendar; side: weather, assistant entry, readiness, explore preview, saved places, event weather).
- **Explore**: location and weather on the left, map and destination cards on the right.
- **Assistant**: a compact chat panel with its own scrolling and the input inside it, plus a "what I can help with" side card. The dashboard's suggested questions open it with the question filled in (never sent automatically).

## shadcn/ui components
Existing (restyled through tokens): Button (new `lime` variant), Card, Badge, Checkbox, Progress, Switch. Added: **Tooltip** and **DropdownMenu** (`@radix-ui/react-tooltip`, `@radix-ui/react-dropdown-menu`, the only new dependencies). The compact month calendar reuses the existing `MonthCalendar` (with a `compact` option) instead of adding `react-day-picker`; confirmation dialogs keep the existing native `<dialog>` component.

## Rules
- No hard-coded colours in components; add a token instead.
- Lime is for the active page and the single most important action; do not colour everything.
- Every icon-only control has an accessible name and a tooltip.
- Empty states and errors are real (no placeholder data); every card must work with no data.
