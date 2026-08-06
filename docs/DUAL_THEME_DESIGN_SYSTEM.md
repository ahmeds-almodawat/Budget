# Dual-Theme Design System

One platform, two visual themes. Light, Dark, and System share the same component tree, layout, data, routes, and interactions. Only semantic visual tokens change.

## Design principles

- Enterprise financial-control and hospital-operations clarity over decoration.
- Equal polish for light and dark — light is not a fallback.
- Dense operational tables and forms remain readable.
- Theme switching never mutates business data, permissions, or form state.
- Arabic RTL parity is mandatory for both themes.

## One-platform / two-theme rule

Identical across themes:

- page structure, navigation, sidebar width, header height
- cards, tables, forms, charts, filters, dialogs, tabs
- permissions, routes, responsive behavior, empty/loading/error states

May differ:

- backgrounds, surfaces, borders, text, shadows
- chart palette, status surface tints, glow intensity
- selected/hover colors and focus rings

## Token architecture

Tokens live in `src/app/globals.css`:

- `:root` — light theme
- `.dark` — dark theme
- `@theme inline` — Tailwind v4 color bridges

Provider: `src/components/theme/theme-provider.tsx`  
Helpers: `src/lib/theme/theme.ts`  
Toggle: `src/components/theme/theme-toggle.tsx`

Storage key: `almodawat-theme` (`light` | `dark` | `system`)

Flash prevention: blocking inline script (`themeInitScript`) runs in `<head>` before paint.

## Light palette (summary)

| Token | Role |
|-------|------|
| `--background` `#f4f6f9` | Page canvas |
| `--sidebar` `#f8fafc` | Light sidebar |
| `--card` `#ffffff` | Cards / elevated surfaces |
| `--foreground` `#0f172a` | Primary text |
| `--text-muted` `#64748b` | Secondary text |
| `--primary` `#1d4ed8` | Actions / accent |
| `--border` `#e2e8f0` | Dividers |

## Dark palette (summary)

| Token | Role |
|-------|------|
| `--background` `#0b1220` | Midnight canvas |
| `--sidebar` `#0a101c` | Dark sidebar |
| `--card` `#111827` | Elevated card |
| `--foreground` `#f1f5f9` | Off-white text |
| `--text-muted` `#94a3b8` | Cool muted text |
| `--primary` `#38bdf8` | Cyan accent |
| `--border` `rgba(148,163,184,0.16)` | Soft dividers |
| `--glow` | Restrained selected-nav glow |

## Typography

- Latin: Plus Jakarta Sans
- Arabic: Noto Sans Arabic
- Shared scale via Tailwind utilities (`text-xs` … `text-3xl`)
- Tabular nums for financial amounts (`.tabular-nums`)

## Spacing and radii

- Content padding: `p-4` / `sm:p-6` / `lg:p-8`
- Card radius: `--radius` `0.75rem`
- Compact controls: `--radius-sm` `0.5rem`
- Sidebar width: `17.5rem` (both themes)

## Shadows

- Light: soft multi-layer slate shadows (`--shadow`, `--shadow-card`)
- Dark: deeper black shadows; selected nav may use `--glow`

## Component states

Semantic classes preferred:

- `bg-card`, `bg-surface-muted`, `border-border`
- `text-foreground`, `text-muted-foreground`, `text-text-secondary`
- `bg-primary`, `text-primary-foreground`
- Status: `success` / `warning` / `danger` / `information` (+ `-surface`)

## Charts

Future series map to `--chart-1` … `--chart-6`; axes, grids, and tooltip chrome map to the corresponding `--chart-*` semantic tokens. Geometry and series order must stay identical between themes.

The audited repository currently has no rendered Recharts component or chart wrapper. `recharts` is installed as a dependency, but chart presentation remains a scaffold rather than a completed visual module.

## Theme persistence and System mode

1. Default preference: `system`
2. System follows `prefers-color-scheme`
3. Explicit Light/Dark override persists in `localStorage`
4. Invalid stored values fall back to `system`
5. Switching themes does not refetch or mutate business data

## RTL

- `dir="rtl"` on `<html>` for Arabic
- Sidebar border uses logical `border-e`
- Icon/label order uses flex start/end
- Mobile drawer uses RTL-aware translate classes

## Accessibility

- Keyboard-operable theme radiogroup (`role="radiogroup"` / `role="radio"`)
- Visible `focus-visible:ring-ring`
- WCAG AA contrast targets for body text and controls
- Status not conveyed by color alone where badges exist
- `prefers-reduced-motion` disables non-essential transitions

## Responsive breakpoints

- Desktop: 1440 / 1280
- Tablet: 1024 / 768
- Mobile: 390 / 360
- Sidebar collapses to drawer below `lg`
- Tables scroll inside controlled containers

## Motion

Short theme/sidebar/hover transitions only. No looping glow or multi-direction page entrance animations.

## Route coverage

Shell + semantic tokens apply to all authenticated routes and auth pages under `src/app/[locale]/…`.

Primary groups covered via shared shell and migrated workspace/page chrome:

- authentication, home, executive dashboard
- budgets / revenue budget / Budget vs Actual / cost control
- forecasts, imports, reports
- projects, milestones, tasks, changes
- governance (risks, approvals, delegations, period close, approval rules, audit)
- procurement (requisitions, purchase orders)
- administration / master data
- hospital/restaurant dashboards, performance, placeholders

Nested detail routes inherit the shell automatically.

## Known limitations

- Charts are not implemented; any future chart must consume the documented semantic chart tokens and receive dual-theme visual regression coverage.
- Moderate npm advisory for `uuid` via `exceljs` remains (no unsafe override).
- Decorative brand logo assets referenced in product config are still text/initial-based.
- Dual-theme visual QA for every nested dialog variant is ongoing; shell + primary workspaces are the baseline.
