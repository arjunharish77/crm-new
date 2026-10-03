# CRM UI/UX Improvement Plan

**Status:** Proposal with decisions recorded (§9: 35 decisions), the enterprise-polish deep dive (§10), the complete file-by-file UI review (§11) and the gap check of actions, wiring, back end and logic (§12). Detail is in [UI_UX_FINDINGS_BY_FILE.md](UI_UX_FINDINGS_BY_FILE.md). All written 2026-10-01. **Implemented 2026-10-02 to 2026-10-03:** Step 0, Step 0b, Phases 1–3, the deferred items, the large-file split and the §8 checks (see the results in §7 and §9 and the statuses in §8 and §10.6). The logo (decision 2) was added on 2026-10-03, so nothing in the plan is open.
**Date:** 2026-10-01
**Scope:** The CRM app under `src/app` and `src/components`, including the platform-admin screens. The Unnati Vidya website (`apps/unnatividya`) is out of scope.

**Where the evidence comes from:**
- A read-only code audit of all 111 `page.tsx` routes and the shared components.
- The existing screenshots and results in `ui-audit-2026-09/`. The latest core-screen layout pass, `live-layout-acceptance/`, dates from 2026-09-14.
- The existing design documents: `05_DESIGN_SYSTEM_PRD.md`, `06_DESIGN_SYSTEM_HANDOFF.md`, `26_UI_REVIEW_AND_REMEDIATION_PLAN.md`, `27_UI_DESIGN_STANDARD.md` and `28_UI_IMPLEMENTATION_PROGRESS.md`.

> **How this relates to docs 26–28.** Doc 27 already sets out a good design standard (type scale, spacing, layouts, page templates), and doc 28 records the layout fixes that are done. This plan does **not** replace them. It turns doc 27 into concrete components and tokens and fixes what the code still breaks. It also adds what those documents did not cover: the speed of everyday sales tasks, and problems found in the current code.

---

## 1. Summary

**Overall assessment.** The foundation is good:
- one stack (Radix/shadcn on Tailwind v4; MUI is fully gone);
- one consistent forest-green Material-3-style colour system, with dark mode and four palettes;
- a shared `StandardDialog` with focus restore and protection against losing unsaved changes;
- a `DataTable` with density, column visibility and selection;
- core screens that already pass layout checks at 320px, 1280px and 200% text.

The weak points are in two places:
- **Daily selling speed.** It is slow to find a lead, log an activity, change a stage or assign an owner. Search is broken, tables cannot be sorted, record actions are hidden, and record pickers are capped at 100 records.
- **Consistency at scale.**
  - 96 browser `confirm()`/`prompt()` boxes;
  - 409 hard-coded palette colours;
  - 140 text sizes below the type scale;
  - three table, filter and saved-view systems;
  - lead status shown with different values and colours on different screens;
  - personal settings locked behind the admin guard.

> **Deep-dive verdict (§10):** the "cluttered, not enterprise" feel is measurable.
> - **Lead detail:** 1,683 bordered elements, 181 badges, 1,185 uppercase text runs and 8 font sizes (down to 9.6px) on one page.
> - **Leads list:** 56 buttons above the fold.
> - **Colour:** everything is tinted green, so nothing stands out.
>
> Most of it comes from a dozen shared files (tokens, table header, badge, navigation, header, workspace tabs, timeline, data-table toolbar). Phase 1 now starts with those (§10.7): neutral surfaces, quiet navigation, sentence-case badges, 40px rows, one-row toolbar.

> **Complete review verdict (§11):** all 292 UI files reviewed (about 2,000 findings in the appendix).
> - **Destructive actions:** about 280 found, more than 150 with no confirmation. Two of them send messages to customers.
> - **Prompt bug:** 4 browser prompts still carry out the action when you press Cancel.
> - **Data-loss bugs:** 14 behaviours that silently lose or change data (step 0b).
> - **Daily rep flows:** 2–7 times more clicks than needed.
>
> §11.6 defines the standard patterns every screen will follow.

### Top 5 improvements (highest impact)

| # | Improvement | Why it matters | Effort |
|---|---|---|---|
| 1 | **Make finding a record instant.** Fix ⌘K search so results are not filtered out on the client. Add a search box and sortable columns to Leads, Opportunities and Activities. Show active filters as chips. | Today a search by phone, email or company returns server results, and the command palette then hides them because it only matches names (`global-search.tsx:258,338`). Leads has no search box (`leads/page.tsx:351-376`) and no table sorts anywhere (`data-table.tsx:223-238`). | M |
| 2 | **Put the daily actions on the record.** Lead and opportunity headers get a visible quick-action bar: Log call, Log activity, Add note, Add task, Change status/stage, Owner. A searchable record picker replaces the selects capped at 100 records. | Every action except "Log Call Outcome" sits behind a collapsed "More actions" (`detail-page-header.tsx:50-56`). Owner is never shown or editable on a record. Activity and opportunity forms list only the first 100 leads (`activity-form.tsx:68`, `opportunity-form.tsx:52`). | M |
| 3 | **Standardise status with status tokens and one `StatusBadge`.** Lead status, opportunity stage, priority, task status and SLA all take their values and colours from one map. | The inline status editor offers no CONTACTED, Smart Views offer no CONVERTED, and colours differ between list, detail and mobile (`leads/columns.tsx:19-26`, `leads/[id]/page.tsx:671-680`, `views/view-row-actions.tsx:36`). Low/Medium and High/Urgent priority are the same colour. Raw values such as `NO_ANSWER` are shown to users. | M |
| 4 | **Replace browser `confirm()`/`prompt()` with `ConfirmDialog` / `ReasonDialog`.** Destructive actions get the record name, the consequence and a red button. | 96 call sites across 52 files. A typed tenant name in `window.prompt` (`platform-admin/marketplace/page.tsx:156`) and a reject reason in a prompt (`approvals/page.tsx:68`) are error-prone and cannot be styled or made accessible. | M |
| 5 | **Fix the Settings structure and dead ends.** Move Password, Two-factor, Sessions and Appearance out of the admin-only guard into a "My account" area. Make `/dashboard/settings/*` the single canonical home. Fix the dead links and the pages no one can reach. | `settings/layout.tsx:8` wraps everything in `RoleGuard requiredRole="Tenant Admin"`, so ordinary users can't change their own password or two-factor settings. Custom Objects links lead to a 404 (`NavigationDrawer.tsx:301`). There are three different custom-field editors. Agents can't reach their call campaign workspace. | M |

---

## 2. Current state

### 2.1 Stack

| Area | What is used | Notes |
|---|---|---|
| Framework | Next.js 16.1.6 (App Router), React 19.2 | `next build --webpack` |
| Styling | Tailwind CSS v4, configured in CSS (`@theme inline` in `src/app/globals.css:368-421`); no `tailwind.config` | `tailwind-merge`, `cva`, `clsx` |
| Components | shadcn "new-york" on Radix (`src/components/ui/*`), `cmdk`, `react-day-picker` | **MUI is fully removed.** Only stale comments remain (`globals.css:4-7`, `standard-dialog.tsx:29`, and the file name `forms/mui-dynamic-field.tsx`). |
| Icons | `lucide-react` only | Good |
| Tables | `@tanstack/react-table` inside `ui/data-table.tsx`, core row model only | No sorting |
| Charts | `recharts` in 2 files; `reactflow` for automation and journey builders; `react-grid-layout` for the dashboard | Chart colours are hard-coded hex values |
| Toasts | `sonner`, mounted once in `layout.tsx:57` | Consistent |
| Motion | `framer-motion` with `MotionConfig reducedMotion="user"`, plus `PageTransition` | `tw-animate-css` is installed but never imported, so `animate-in`/`fade-in`/`zoom-in` classes on dialog, sheet, select and popover probably do nothing |
| Fonts | No `next/font`; `font-sans` uses Tailwind's system font stack | "Inter" is declared only in the unused `design-tokens.css` |
| Theme | `next-themes` with a `class` attribute (light, dark, system); palette via `html[data-color-theme]` (forest default, ocean, sunset, grape; `src/lib/color-themes.ts`) | Applied by a script before first paint, so there is no colour flash on load |

### 2.2 Existing patterns worth keeping

- **Colour tokens in `globals.css`:** Material-3-style roles (`--primary`, `--surface-container-*`, `--tertiary`, …) mapped onto shadcn roles, with full dark variants and four palettes.
- **`StandardDialog`** (`components/common/standard-dialog.tsx`, used by 70 files): a header / scrolling body / footer grid, focus restore, and a guard against dismissing unsaved changes.
- **`DataTable`:** controlled selection with "select all matching", density toggle, saved column visibility, and built-in skeleton, error and empty states.
- **`DynamicFormRenderer` and `mui-dynamic-field`:** `*` markers on required fields, inline errors with `aria-invalid`/`aria-describedby`, Cmd+S to save, a warning when a draft is unsaved.
- **Shell:** a grouped `NavigationDrawer` (rail with `aria-current` and tooltips), a ⌘K palette, a Create menu (`c`), a shortcuts help sheet (Shift+?), and a mobile navigation sheet.
- **Good page templates:** `module-bundles`, `module-health` and `retention-policies` use PageHeader, ErrorState, a preview step before destructive actions, and wrapping controls.

### 2.3 Main inconsistencies (measured from the code)

| Problem | Count | Examples |
|---|---|---|
| Hard-coded Tailwind palette colours (`text-amber-*`, `bg-emerald-*`, `text-blue-*`) instead of tokens | **409** in 51 files | `settings/marketplace` (18), `settings/integrations` (16), `common/field-history-panel` (11) |
| Raw hex colours in components | 129 in 13 files | Automation builder node colours (53), recharts defaults `#8884d8` (`analytics-dashboard.tsx:67`), stage hex with alpha appended (`opportunities/page.tsx:338`) |
| Text sizes below the scale (`text-[0.65rem]`, `text-[10px]`, `text-[11px]`, …) | **140** in 56 files | `automations-v2/[id]` (18), `reports` (10), `tasks` (9) |
| `font-extrabold` (doc 27 discourages it) | 138 | Page titles, dialog titles |
| Arbitrary radii | `rounded-[10px]` ×41, `rounded-[14px]` ×28, plus 11 others | `button.tsx` and `standard-dialog.tsx` hard-code radii |
| Browser `confirm()` / `prompt()` | **96** (71 confirm / 25 prompt) | `platform-admin/marketplace` (9), `reports` (6), `dashboard-manager` (5) |
| Hand-built `<h1>` instead of `PageHeader` | 32 pages, about 20 different heading styles | Opportunities `text-lg`, Audit logs `text-3xl`, Settings General |
| Table implementations | 3: `DataTable` (13 screens), `ui/table` used directly (17), task cards and Views' own table | Only Views has a sticky header |
| Filter systems | 3: `AdvancedFilterDrawer`, inline selects on Tasks, Smart View filters | Saved presets live only in the browser (`advanced-filter-drawer.tsx:60-75`) |
| Bulk-action bars | 2: floating `BulkActionsToolbar`, an inline bar on Tasks | Stage and status bulk dialogs exist but aren't connected |
| "Module not enabled" screens | 5 styles: Alert, EmptyState, ModuleGate, ErrorState, plain text | `marketing/page.tsx:328` uses developer wording |
| Loading patterns | `Loader2` spinners (62 files), "Loading..." text (about 40), skeletons (24) | `Button isLoading` exists but is never used |
| Icon-only buttons without an accessible name | about 70 | `settings/call-dispositions` (9), `settings/integrations` (10), form editor (6) |
| Missing tokens | No success, warning or info colours, no chart colours, no `--radius`, no `--sidebar` (yet `bg-sidebar` is used at `dashboard-layout.tsx:56`) | `design-tokens.css` and `lib/design-tokens.ts` are imported nowhere |

---

## 3. Proposed design direction

### 3.1 Style: calm, dense, functional ("Swiss minimal" on the existing Material-3 tonal surfaces)

Keep the current look and brand. Make it **quieter and denser**:
- flat cards with one-pixel borders and no shadows;
- one filled primary button per area;
- colour used only for meaning (status, risk, the primary action);
- 14px body text and tabular numbers.

**Why this suits this CRM:**
- **Long working days.** Counsellors and sales reps work here for 6–9 hours, mostly in lists, timelines and forms. Low visual noise reduces fatigue, and density shows more rows without scrolling.
- **Status must be readable at a glance.** When everything else is neutral, a red "Overdue" or amber "At risk" stands out immediately. Today primary green, status green, success emerald and the green "Low" priority all compete.
- **Low risk.** It keeps the forest identity, the dark mode and the four palettes users may already have chosen. Nothing needs re-branding.

> The UI/UX skill's generated system suggested a blue palette and Fira Code/Fira Sans fonts with a marketing "product demo" pattern. I deliberately **did not adopt** that. A blue palette would discard the existing brand and the four palettes. A code-style font for headings hurts readability of names and numbers in a CRM. The marketing pattern does not apply to an app. The useful parts (minimal style, high contrast, dense spacing, subtle 150–250ms motion, visible focus) are reflected below.

### 3.2 Colour palette (default "forest" theme; the other palettes keep their own primaries)

> **Updated by decision 19 (§9):** surfaces become **neutral grey and white**, and the green stays only as the action colour. The new surface values are in §10.3 and replace the tinted `--background`/`--card`/`--muted` values below. The status tokens below stay as they are.

**Core roles. These already exist in `globals.css` and are unchanged:**

| Token | Light | Dark | Use |
|---|---|---|---|
| `--primary` / on | `#1b6c31` / `#FFFFFF` | `#88d891` / `#003915` | The one filled action per area, links, the active tab underline, the focus ring |
| `--primary-container` / on | `#a3f5aa` / `#002108` | (existing) | Selected filter chips, the "current stage" marker |
| `--secondary` / on | `#516350` / `#FFFFFF` | `#b8ccb4` / `#243424` | Active navigation item (6.5:1) |
| `--tertiary` / on | `#39656b` / `#FFFFFF` | `#a1ced3` / `#00363c` | Secondary emphasis (informational chips), **not** status |
| `--background` / `--foreground` | `#f7fbf2` / `#181d18` | `#101410` / `#e0e4de` | Page background and text |
| `--card` = surface-container-low | `#f1f4f0` | (existing) | Cards and table body |
| `--muted-foreground` | `#424940` (8.9:1 on background) | `#c1c9be` | Secondary text, metadata |
| `--destructive` / on | `#B3261E` / `#FFFFFF` | `#F2B8B5` / `#601410` | Destructive buttons only |

**New status tokens.** These are needed because 409 hard-coded colours stand in for them today. All pairs were checked for WCAG AA contrast (≥ 4.5:1 text on fill):

| Token (fill / text) | Light | Contrast | Dark | Contrast | Meaning |
|---|---|---|---|---|---|
| `--status-success` | `#d7f0dc` / `#1e6b2f` | 5.4:1 | `#163b1f` / `#9be3a3` | 8.3:1 | Won, Converted, Completed, Delivered, Healthy |
| `--status-warning` | `#ffe3b8` / `#7a4a00` | 6.0:1 | `#3d2a00` / `#ffc46b` | 8.7:1 | Due soon, At risk, Trial, Setup incomplete, Medium |
| `--status-danger` | `#f9dedc` / `#8c1d18` | 7.2:1 | `#5c1612` / `#ffb4ab` | 7.8:1 | Lost, Overdue, Failed, Breached, High/Urgent |
| `--status-info` | `#d6ecfa` / `#0b5a85` | 6.1:1 | `#0f3149` / `#9ccfff` | 8.2:1 | New, Contacted, In progress, Scheduled |
| `--status-neutral` | `#e2e6df` / `#3f463e` | 7.7:1 | `#2f342e` / `#c9d0c5` | 8.1:1 | Draft, Not scored, Inactive, Low |
| `--status-accent` | `#ece3fb` / `#5b3d94` | 6.7:1 | `#33264f` / `#d3bcff` | 8.1:1 | Qualified and other "special" states that are not good or bad |

**Chart colours** (`--chart-1…8`, theme-aware, replacing `#8884d8`, `#0088FE`, …): primary, tertiary, info text, warning text, accent text, success text, danger text, neutral text, in that order. Each series also gets a label or pattern, so colour is never the only distinction.

**Rules:**
- Status colour always comes with text (and an icon or dot where space allows). It is never the only signal.
- Primary green is never used for status. "Won" uses `--status-success`, which is a different, lighter green with text.
- Stage colours that admins choose in the database (`StageDefinition.color`) appear only as a **dot** next to the label. They are never used as text or background colour, because a user-chosen hex value can't be relied on for contrast (and appending alpha to it is the bug at `opportunities/page.tsx:338`).

### 3.3 Typography (doc 27 §4, made concrete)

**Font:** keep the system font stack, which is fast, has no layout shift and doc 27 already decided on it. Turn on `font-variant-numeric: tabular-nums` for numbers, amounts, dates and counts. Inter via `next/font` is an option for later (see Open questions).

| Role | Size / line height | Weight | Tailwind | Replaces |
|---|---|---|---|---|
| Page title | 24/32 | 600 | `text-2xl font-semibold` | `text-lg font-bold`, `text-3xl`, `font-extrabold` page headers |
| Record or section title | 18/26 | 600 | `text-lg font-semibold` | `text-[18px] font-extrabold` (StandardDialog) |
| Card title | 16/24 | 600 | `text-base font-semibold` | — |
| Body, table, input, button | 14/20 | 400 / 500 | `text-sm` | — |
| Field label | 14/20 | 500 | `text-sm font-medium` | — |
| Metadata, badges, table headers | 12/16 | 500 | `text-xs font-medium` | `text-[0.65rem]`, `text-[10px]`, `text-[11px]` (140 places) |
| Key number (stat tiles) | 28/36 | 600, tabular | `text-[1.75rem]` via a token | — |

- No text smaller than 12px.
- Table headers use sentence case `text-xs font-medium text-muted-foreground`, instead of today's uppercase and wide letter-spacing (`ui/table.tsx:73`). This is easier to scan and takes less width.
- Inputs are 16px on mobile (already `text-base md:text-sm`).

### 3.4 Spacing, radius, elevation, motion, icons

| Item | Decision |
|---|---|
| Spacing | 4px base, using Tailwind steps 1/2/3/4/6/8/12 (4–48px). Page gutter 24px on desktop, 16px on tablet, 12px at 320px (from doc 27). Section gap 24px. Card padding 16px on dense screens, 24px on settings forms. |
| Density | Table rows 40px default ("comfortable"), 32px "compact", with the user's choice saved (already exists). Form fields 40px; compact toolbars 36px. |
| Radius | New tokens: `--radius-sm 6px` (badges, small controls), `--radius-md 8px` (buttons, inputs), `--radius-lg 12px` (cards, dialogs, sheets), `--radius-full` (avatars, dots). These replace `rounded-[10px]` and `rounded-[14px]`. |
| Elevation | Cards: border, no shadow. Popover and dropdown: `shadow-md`. Dialog and sheet: `shadow-lg` over a scrim. Remove `shadow-md`/`shadow-sm` from button variants. |
| Motion | 150ms for hover and press, 200ms enter, 150ms exit, ease-out. Either import `tw-animate-css` or remove the dead `animate-in` classes (decide in Phase 1). Keep `reducedMotion="user"`. Remove the full-page y-offset `PageTransition` on every route; it slows perceived navigation for heavy users. |
| Icons | Lucide only: 16px inline, 20px in navigation. Every icon-only button needs an `aria-label` and a tooltip with the same text. Decorative icons get `aria-hidden`. Don't reuse one icon for several meanings: the settings sidebar has Shield ×3 and ShieldCheck ×3. |
| Dark mode | Keep it. The new status and chart tokens have dark values (table above). Continue running `scripts/ui-theme-token-contrast.py` for every palette in light and dark. |

---

## 4. Design system: shared components

Paths are under `src/components/`. "New" means the component doesn't exist yet.

| Component | Current | Proposed variants and states | Replaces / fixes |
|---|---|---|---|
| **Button** (`ui/button.tsx`) | 6 variants; heights 40 (default), 36 (sm), 28 (xs), 48 (lg); hard-coded radii; `isLoading` unused | Keep primary, secondary (tonal), outline, ghost, destructive, link. Sizes: `md` 40px, `sm` 36px, `xs` 28px (inside tables only). Radius from tokens. Use `isLoading` everywhere: spinner, keeps its width, `aria-busy`. | 91 hand-made `Loader2` buttons; 60 height overrides |
| **IconButton** (new wrapper) | `size="icon"` with optional label | `label` prop is required, rendered as `aria-label` plus a tooltip. Sizes 40/36/28. | About 70 unlabelled icon buttons |
| **Input / Select / Textarea** | Input 36px with no focus ring width; Select `w-fit`; 15 native `<select>`s | One 40px height (36px compact), `ring-2` focus on all, `w-full` default, error state (`aria-invalid` with a red border and message), optional prefix and suffix. Replace native selects except where native is better on mobile. | Inconsistent focus |
| **RecordPicker** (new) | Radix `Select` loaded with `?limit=100` | An async searchable combobox (cmdk) for lead, opportunity, user, team or list. Shows name plus a secondary line (phone, email, stage) and recent items. Supports `multiple`. | `activity-form.tsx:68`, `opportunity-form.tsx:52`, `tasks/page.tsx:244`, raw user IDs (`dashboard-manager.tsx:330`) |
| **StatusBadge** (new; doc 27 §6) | `Badge` with 106 colour overrides; raw values | `tone`: success, warning, danger, info, neutral or accent. Optional `dot` (for admin-chosen stage colours) and `icon`. Always readable label text from one display map per domain (lead status, opportunity stage, priority, task status, SLA, delivery, health). Sizes `sm`/`md`. An editable version (`StatusSelect`) keeps the same look. | `leads/columns.tsx:19-26`, `leads/[id]/page.tsx:671`, `kanban-card.tsx:90` (priority shown only as a 1.5px dot), `NO_ANSWER`/`not-attempted` |
| **DataTable** (`ui/data-table.tsx`) | Selection, density, column visibility; no sorting; toolbar disappears while loading | Add: sortable headers (`aria-sort`, server sort params), sticky header, a toolbar slot that stays visible during loading, error and empty states, keyboard row open (Enter on a focused row), a row-actions slot, page numbers with "go to", a `mobileCard` render prop (one table for all sizes), numbers right-aligned, and a "Showing X–Y of N". | Leads, Opportunities, Activities, Lists, Cases, Views (the third table) |
| **ListToolbar** (new; doc 27) | Each page builds its own | Search box (debounced; scope on the URL), quick filters (Mine / Team / All, status), a **filter chip row** (each removable, plus "Clear all"), saved-view menu, density and columns, Export. State lives in the URL so it can be shared and survives a reload. | No search on Leads; filters invisible once applied; `?filters` read once (`leads/page.tsx:167`) |
| **SavedViews** | 3 systems (local presets, `SavedFiltersMenu`, Smart Views) | One server-backed saved-view menu (private / team / default), used by Leads, Opportunities, Activities and Tasks. Smart Views become the full-page version of the same object. | `advanced-filter-drawer.tsx:60-75` (localStorage plus `window.prompt`) |
| **SelectionBar** (new; doc 27) | `BulkActionsToolbar` plus the Tasks inline bar | One floating bar: "N selected (of M matching)", actions (Assign, Change status/stage, Add tag, Add to list, Delete), a clear explanation of what "select all matching" covers, progress for long jobs, a summary toast with undo where possible. | `opportunities/page.tsx:259` (page-only "select all"), unused `bulk-update-status-dialog` and `bulk-add-tags-dialog` |
| **ConfirmDialog / ReasonDialog** (new; `useConfirm()`) | 96 `confirm()`/`prompt()` calls | ConfirmDialog: title naming the item, a consequence line, a destructive button labelled with the action ("Delete 3 leads"), Escape to cancel, focus on Cancel. ReasonDialog: a required textarea with a minimum length and an inline error. TypedConfirm: for irreversible platform actions such as typing the tenant name. | All `window.confirm` / `window.prompt` |
| **PageHeader** (`layout/page-header.tsx`) | title, description, actions | Add `back`, `status` (StatusBadge), `primaryAction`, `secondaryActions` (overflow menu), `tabs` slot, `meta`. Keep the header visible while the page loads. | 32 hand-built headers |
| **RecordHeader** (`detail-shell/detail-page-header.tsx`) | primary action plus a collapsed "More actions" | Identity (name, status, owner avatar with "Change"), a **quick-action bar** with 4–5 visible actions (see §5), then an overflow menu for the rest. Sticky, compact when scrolled. | `detail-page-header.tsx:50-56` |
| **Tabs** (`ui/tabs.tsx`) | One pill style; `WorkspaceTabs` and `SettingsSections` use `aria-pressed` buttons | Two variants: **page tabs** (underline, `role=tablist`, count badges, scroll arrows, synced with `?tab=` in the URL) and **segmented** (2–4 options such as Board/List/Analytics). Ban tabs inside tabs; use a section menu instead. | `workspace-tabs.tsx:24-40`, `reports/page.tsx:252`, nested tabs on Gamification and Payout cycles |
| **Card** (`ui/card.tsx`) | `py-6 gap-6` everywhere | `padding="dense" (16px) | "default" (24px)`; `CardTitle` gets the card-title size. | Loose dashboards and sidebars |
| **Dialog / Sheet** | StandardDialog widths copied from MUI (444–1536px); Sheet `max-w-sm` (384px) | Sizes from doc 27: dialog `md` 560px / `lg` 880px; sheet 480px / 640px; `min(size, 100dvw − 2×gutter)`. No dialogs stacked on dialogs. | `standard-dialog.tsx:31-37`, `sheet.tsx` |
| **EmptyState / ErrorState** | One large size | Variants: `page`, `inline` (inside a table or card), **`no-match`** ("No leads match these filters", with a Clear filters button), **`module-disabled`** (one shared wording and action), **`permission`**. ErrorState always offers Retry and is never displayed as an empty state. | 5 module-disabled styles; error shown as empty on 7 screens |
| **Skeletons** | `TableSkeleton` used, `DashboardSkeleton` unused | `TableSkeleton` (keeps the toolbar), `RecordSkeleton`, `CardGridSkeleton`; `aria-busy` on the region. No plain "Loading..." text. | About 40 "Loading..." strings, full-page spinners on record pages |
| **Toast policy** | Sonner; about 478 `toast.error` | Success toasts for 3–4s, with Undo for reversible bulk changes. Errors that need action go **inline**, not toast-only (validation, required fields). Never use a toast as the only signal for a failed load. | Required-field toasts (`cases/page.tsx:166`, `log-call-outcome-dialog.tsx:68`, public form) |
| **Sidebar** (`NavigationDrawer.tsx`) | Grouped navigation, no counts | Count badges (my overdue tasks, approvals waiting, unread notifications), Pinned at the top, Custom Objects only when a route exists, Settings → "My account" for non-admins. | `NavigationDrawer.tsx:301` |
| **Breadcrumbs** (`layout/breadcrumbs.tsx`) | Not used (0 importers), shows raw segments | Delete it, or rebuild it with labels and `aria-current`. Record pages use the back link in RecordHeader instead. | — |

---

## 5. Screen-by-screen changes

Severity: **H** = blocks or slows daily work, or is an accessibility failure. **M** = clear friction or inconsistency. **L** = polish.
Effort: **S** < ½ day, **M** 1–3 days, **L** > 3 days (given Phase 1 components).

### 5.1 Global shell: header, navigation, search, notifications
**Files:** `components/layout/header.tsx`, `NavigationDrawer.tsx`, `dashboard-layout.tsx`, `components/search/global-search.tsx`, `notification-bell.tsx`

| Issue | Sev | Proposed change | Effort |
|---|---|---|---|
| ⌘K hides server results that don't match the name, such as phone, email or company (`global-search.tsx:258,338-355`); leads with the same name collapse into one item | H | `shouldFilter={false}` for server groups and a unique `value` per item. Show a secondary line (phone or email, status, owner). Group by type, with the top 5 each plus "See all N leads", which opens Leads with the search applied. | S |
| Activity and task results go to the list, not the record (`:158-159`) | M | Go to the record. For an activity, open the parent lead with the activity highlighted. | S |
| No actions on search results | M | Actions on a result row (Enter opens it; also Call, Log activity, Add task) using the same quick actions as RecordHeader. | M |
| Quick-create reloads the whole page (`header.tsx:208,214,220`) | H | After creating, go to the new record, or refresh the current list and keep filters; show a toast with "Open". | S |
| Header shows the email prefix and the **raw tenant ID** (`header.tsx:158,181`) | M | Show the user's name, role and workspace name; the ID only in a "Copy workspace ID" item. | S |
| Notifications: plain `<button>`s inside the menu, so arrow keys don't work; read and unread look the same; task notifications open the list (`notification-bell.tsx:30,88-100`) | M | `DropdownMenuItem`s, an unread dot plus bold text, "Mark all read" (with confirmation), deep links to the record, a count in the bell's label ("Notifications, 3 unread"). | S |
| Navigation has no counts; "Custom Objects" links lead to a 404 (`NavigationDrawer.tsx:301`) | M / H | Count badges (Tasks overdue, Approvals). Hide Custom Objects until the route exists, or route it to a generic records list. | S |
| `bg-sidebar` is undefined (`dashboard-layout.tsx:56`) | L | Add a `--sidebar` token, or use `bg-card`. | S |
| No skip link | M | "Skip to main content" as the first focusable element. | S |

### 5.2 Dashboard (`app/dashboard/page.tsx`, `components/dashboard/dashboard-manager.tsx`, `widget-library.tsx`)

| Issue | Sev | Proposed change | Effort |
|---|---|---|---|
| About three rows of configuration controls (templates, tabs with 9-item menus, saved layouts, an approvals panel) sit above any data | H | Split **"My day"** (the default for reps) from **"Manage dashboards"** (layout tools behind an "Edit dashboard" toggle). | M |
| No built-in "my work" view | H | Default "My day" widgets: overdue and due-today tasks, today's follow-ups and calls, new leads assigned to me, my pipeline by stage, recent activity. Each row has its action (Complete, Call, Open). | M |
| Tab rename, publish, clone, deprecate and transfer use `window.prompt`; transfer asks for a **raw user ID** (`:306-454`) | H | ReasonDialog, and RecordPicker for the user. | S |
| Widget delete has no confirmation or undo (`:204-213`) | M | Undo toast. | S |
| Widget errors are red text with no retry (`widget-library.tsx:251`); the widget menu button has no label (`:492`); dashboard tabs are not tabs | M | Inline ErrorState with Retry; IconButton labels; page tabs. | S |
| Chart colours hard-coded (`#ef4444`, `#8884d8`); charts have no text alternative | M | Chart tokens; a "View as table" toggle per chart; a visually hidden summary. | M |
| The drag handle is invisible until hover and can't be used with a keyboard (`:607`) | M | A visible handle in edit mode, plus "Move up/down" items in the widget menu. | S |

### 5.3 Leads list (`app/dashboard/leads/page.tsx`, `columns.tsx`, `mobile-list.tsx`)

| Issue | Sev | Proposed change | Effort |
|---|---|---|---|
| No search box; finding a lead needs the filter drawer (about 5 clicks) | H | ListToolbar with search across name, phone, email and company (`/` focuses it), and quick filters: **Mine / Team / All**, Status, Source, Owner. | M |
| No sorting | H | Sortable Name, Status, Score, Created and Last activity (server sort). | M (with DataTable work) |
| Missing columns: **Phone, Owner, Last activity, Next task**; Company hidden | H | Default columns: Name (with company underneath), Phone (click to call), Status, Owner, Last activity, Next task, Score, Source. Created stays optional. Email in the column chooser. | S |
| Filters applied are invisible; not saved in the URL | H | A chip row under the toolbar; URL-synced; "Save view". | M |
| Status chips are read-only (`:41-63`) | M | Make them quick filters (toggle, with counts). | S |
| Inline status offers 4 of 5 values (no CONTACTED); a failed save rolls back with no message (`columns.tsx:19-26,52-54`) | H | StatusSelect from the shared lead-status map (all values, tenant-configurable later), an error toast with Retry, and only `status` sent in the PATCH. | S |
| No quick actions on a row; the preview sheet's "Edit" button does nothing (`record-preview.tsx:111-114`) | H | A row-actions menu (Call, Log activity, Add task, Assign, Change status) plus hover icon buttons on desktop. The preview sheet gets the same quick-action bar and a working Edit. | M |
| Default 10 rows per page | M | Default 25, user preference remembered. | S |
| Empty state always says "add your first lead", even when filtered (`:443-448`) | M | `no-match` empty state with "Clear filters". | S |
| Bulk Change status and Add tags dialogs exist but aren't connected | M | Connect them to SelectionBar. | S |
| Mobile: no paging, no loading state ("No leads found" while loading), no selection, phone not tappable (`mobile-list.tsx`) | H | Use `DataTable mobileCard` (paging, skeleton, error), `tel:` and WhatsApp buttons on the card, coloured status badge, a long-press or checkbox selection mode. | M |
| Clickable rows with no keyboard support (`data-table.tsx:341`); triggers wrapped in `div onClick` (`create-lead-dialog.tsx:33`); labels not linked (`:497,540,555`) | H | Row Enter/Space handling with a focus style, real buttons as triggers, `htmlFor` on labels. | S |
| "Create Lead + Opportunity" appears in both the header and the create dialog | L | Keep it only in the Create menu and the dialog. | S |

### 5.4 Lead detail (`app/dashboard/leads/[id]/page.tsx`, `components/detail-shell/*`, `components/timeline/*`)

> **Decision 23 (§9):** keep the current layout (left summary column, right tabs) and simplify it, as set out in §10.5. Don't move to a new column structure.

| Issue | Sev | Proposed change | Effort |
|---|---|---|---|
| All daily actions are hidden behind "More actions" (Activity, Opportunity, Case, AI, Edit…) (`:262-331`) | H | RecordHeader with a quick-action bar: **Log call · Log activity · Add note · Add task · Status ▾ · Owner ▾**, then "…" for Opportunity, Case, AI, Share, Push, Forms, Favorite. Keyboard shortcuts `l` (log), `n` (note), `t` (task). | M |
| Owner is not shown or editable on the record | H | Owner avatar and name in the header with a "Change" RecordPicker (reason optional unless policy requires it). | S |
| Status appears 4 times and score 3 times plus a tab; the Details tab repeats the sidebar (`:249-483`) | M | Status once (header, editable), score once (header chip, opens Scoring), sidebar = key properties, Details tab = full field list only. | M |
| 8 tabs; Notes is the 7th; tabs wrap to two rows at 1280px (screenshot) | M | Tabs: **Activity (timeline including notes) · Details · Opportunities (n) · Tasks (n) · Communications · Scoring · History**. Note entry is a composer at the top of the timeline. | M |
| The timeline renders everything at once: the page is about 12,600px tall at 1280px (`live-layout-acceptance/lead-detail-*-1280.png`) | H | Group by day and collapse older days; "Load older" pages of 25; filters as chips (Calls, Emails, WhatsApp, Notes, Tasks). | M |
| Raw values (`NO_ANSWER`, `not-attempted`, `BREACHED`) and large badges in timeline cards | M | Display labels from the shared maps; outcome as StatusBadge `sm`; SLA as an icon plus text. | S |
| Full-page spinner while loading; the header disappears | M | RecordSkeleton with the header area kept. | S |
| Workspace tabs are `aria-pressed` buttons, not tabs (`workspace-tabs.tsx:24`); each timeline card is one big `role=button` | M | Page-tabs component; an expand button inside each card instead of the whole card being a button. | S |
| Mobile: the work area starts under several rows of actions and an identity card | M | On mobile: a compact header, a sticky bottom action bar (Call, Log, Note, More), and the timeline first. | M |

### 5.5 Opportunities list and board (`app/dashboard/opportunities/page.tsx`, `components/opportunities/kanban-*.tsx`)

| Issue | Sev | Proposed change | Effort |
|---|---|---|---|
| Hand-built `text-lg` header; up to 6 controls in a different arrangement from Leads (screenshot) | M | PageHeader plus ListToolbar, the same layout as Leads; Board/List/Analytics as a segmented control on the right. | S |
| Stage count chips are duplicated per opportunity type (for example "Inquiry: 84" three times; 16+ chips) | H | Group chips by stage name when the view covers all types, or show a compact stage bar (stacked bar with tooltips); chips act as filters. | S |
| No search, no sorting, no row click, no inline stage change | H | Same as Leads: search, sorting, row click to preview, an inline StageSelect (type-aware). | M |
| Missing columns: Owner, Lead, Expected close, Last activity; the Score column is cut off at 1280px | H | Default columns: Opportunity (lead underneath), Stage, Value (right-aligned), Expected close, Owner, Last activity, Priority, Score. Hide less important columns at narrower widths. | S |
| Values shown in `$` (screenshot) | H | Format with the tenant's currency and locale (INR, `₹1,10,000`); see Open questions. | S |
| Bulk "select all N" covers only the current page (`:259-263`); Stage bulk action not connected | H | Fix via SelectionBar (see §8 for the logic bug) and connect bulk stage change. | S |
| Board needs a type selected; no keyboard support (`kanban-board.tsx:35-42`); priority is only a 1.5px dot; edit button unlabelled and hover-only (`kanban-card.tsx:76-95`); opportunities with an unknown stage disappear | H | KeyboardSensor plus a "Move to stage" menu on each card; StatusBadge for priority; labelled visible actions; an "Unassigned stage" column; a type picker in the empty state; owner avatar and next task on cards; column totals in tabular figures. | M |
| Stage colour has alpha appended to admin hex values (`:338-342`, `kanban-card.tsx:116`) | M | Dot plus neutral badge (§3.2). | S |
| A second, unused kanban (`components/kanban/kanban-board.tsx`) | L | Remove it in Phase 3, after confirming it has no importers. | S |
| No mobile layout | M | `mobileCard`; on mobile the board becomes one column at a time with a stage switcher. | M |

### 5.6 Opportunity detail (`app/dashboard/opportunities/[id]/page.tsx`)

| Issue | Sev | Proposed change | Effort |
|---|---|---|---|
| Same hidden-actions header as Lead | H | The same RecordHeader quick-action bar, plus **Stage ▾** and **Mark won / lost**. | M |
| Stage progression buttons change stage in one click with no won/lost reason and no `aria-current`; on mobile they are hidden in the collapsed sidebar (`:381-414`) | H | A horizontal stage path in the header (current stage highlighted, `aria-current="step"`); a closed stage asks for a reason via ReasonDialog; available on mobile. | M |
| Header stage badge has no colour; owner not shown; the 380px metadata column squeezes the timeline | M | StatusBadge, owner in the header, a 320px sidebar that collapses at narrower widths. | S |

### 5.7 Activities (`app/dashboard/activities/page.tsx`, `activity-form.tsx`, `activities-mobile-list.tsx`)

| Issue | Sev | Proposed change | Effort |
|---|---|---|---|
| Lead and opportunity pickers are capped at 100 records (`activity-form.tsx:68-69`) | H | RecordPicker. | S |
| No completion status, owner or row actions columns; no row click | M | Add Status (Completed / Due / Overdue), Logged by, row actions (Complete, Edit, Open record). | S |
| "Mark completed" counts all matching records but updates only the current page (`:177,305`) | H | SelectionBar (logic fix in §8). | S |
| Refresh button labelled only by tooltip; type select unlabelled; form labels not linked (`activity-form.tsx:160-278`) | H | IconButton label, `aria-label` on the select, `htmlFor` on labels. | S |
| Mobile list: no paging; "No activities" shown while loading | H | `mobileCard`. | S |
| Form loading is plain text; custom-field load errors are ignored | M | Skeleton; inline warning with Retry. | S |

### 5.8 Tasks and team queues (`app/dashboard/tasks/page.tsx`, `tasks/queues/page.tsx`, `components/tasks/*`)

| Issue | Sev | Proposed change | Effort |
|---|---|---|---|
| Default view mixes completed tasks first (screenshot), so overdue work is buried | H | Default view **"My open tasks", sorted by due date** with Overdue / Today / Upcoming sections; completed tasks behind a filter. Remember the last view. | S |
| Priority colours: Low and Medium the same dark green, High and Urgent the same red | M | StatusBadge: Low neutral, Medium info, High warning, Urgent danger, each with text. | S |
| The filter card takes about 25% of the screen (Owner select at full width) | M | ListToolbar: search, Mine/Team/All, Status, Priority, Due chips in one row; Calendar as a segmented view toggle. | S |
| Stat tiles: "Open 391 / Overdue 391" don't filter | L | Tiles act as quick filters (selected state). | S |
| Fetches **all** tasks and pages them in the browser (`:211`); lead, opportunity and activity pickers capped at 200–300 | H | Server paging via DataTable or virtualised cards; RecordPicker. | M |
| Trash icon next to Edit on every card, so deletion is one click away | M | Move Delete to the "…" menu with ConfirmDialog; keep Complete, Snooze and Edit visible. | S |
| Title required but no marker or inline error (Save just stays disabled) | M | `*` plus an inline message. | S |
| Calendar rescheduling is drag-only (HTML5) | M | A "Reschedule" date picker on each card, with keyboard support. | S |
| Queues: back button unlabelled, selects unlabelled, no ErrorState, task titles don't link (`queues/page.tsx:134-236`) | H | Fix the labels; ErrorState; link titles. | S |

### 5.9 Smart Views and Lists (`app/dashboard/views/page.tsx`, `components/views/*`, `app/dashboard/lists/**`)

| Issue | Sev | Proposed change | Effort |
|---|---|---|---|
| A third table implementation; loads 500 rows and filters in the browser (`views/page.tsx:83,860-937`) | M | Move to DataTable (keep its sticky header and its per-row quick actions, which are the best in the app; reuse them on Leads and Opportunities). | M |
| Record names aren't links; "Open record" opens a new tab (`view-row-actions.tsx:138`); checkboxes labelled with UUIDs (`:913`); search input unlabelled (`:596`) | H | Name links (same tab); labels "Select {name}"; `aria-label` on search. | S |
| 12+ item actions menu and group-button section tabs | M | Split into primary actions plus an overflow menu; page tabs. | S |
| Lists: loads 5,000 leads and pages in the browser; column labelled "Stage" for lead status (`lists/[id]`) | M | Server paging; correct column label; StatusBadge. | S |

### 5.10 Reports (`app/dashboard/reports/page.tsx`, 3,245 lines)

| Issue | Sev | Proposed change | Effort |
|---|---|---|---|
| 9 top-level sections plus nested tabs, none in the URL | H | Report **library** (Overview, Inbuilt, Saved, Schedules) separate from **Build** (Builder, Data catalog, Metrics, Annotations, Compare) as two routes or sections; `?tab=` deep links. | L |
| No date range or global filter; "Export Data" exports with no filters (`:117`) | H | A sticky filter bar (date range presets, team, owner, source) used by every report and by export; the export dialog lists the filters it will apply. | M |
| "Opportunity Value by Stage" draws bars by **count** but labels them as value (`:173`); no empty state; CSS-div bars with no text alternative | H | Correct the measure, or rename the label; use recharts with chart tokens; "View as table"; empty state. | S |
| Inbuilt reports have no charts and preview only the first 10 rows; "Run Selected" is redundant; parameter selects unlabelled (`:790-952`) | M | Report page with a chart plus a paginated table; labelled parameters; open records in the same tab. | M |
| Metric certify/deprecate via clickable badges, one click with no confirmation (`:2564`) | M | A Select or a menu action with ConfirmDialog. | S |
| `confirm()` for deletes (`:1688,3047`); unlabelled icon button (`:2021`) | M | ConfirmDialog; IconButton. | S |

### 5.11 Marketing and journeys (`app/dashboard/marketing/page.tsx`, `components/marketing/journeys-panel.tsx`)

| Issue | Sev | Proposed change | Effort |
|---|---|---|---|
| Module-off screen has developer wording and keeps the full page title (`:295,328-332`) | M | Shared `module-disabled` EmptyState ("Marketing isn't included in your plan. Ask your administrator.", with a Request access action from Settings → Modules). | S |
| SettingsSections nested inside Tabs (Composer) | M | Composer as its own route or a full-width step flow with a stepper. | M |
| Pause and Enroll run with no confirmation; Restore uses `window.confirm` (`journeys-panel.tsx:223,331-337`) | M | ConfirmDialog stating how many records are affected. | S |
| The global "New Campaign" opens the page, not the composer (`header.tsx:133`) | L | Deep link to the composer. | S |

### 5.12 Automations (`app/dashboard/automations-v2/page.tsx`, `[id]/page.tsx`)

| Issue | Sev | Proposed change | Effort |
|---|---|---|---|
| Builder has **no unsaved-changes guard** | H | Track unsaved changes, warn before leaving the page, show a "Unsaved changes" indicator next to Save, and save with Cmd+S. | M |
| Required Name is hidden in a side panel (hidden on mobile); missing name reported by toast only (`:954,1351`) | H | Name editable inline in the builder header; inline error. | S |
| Step configuration drawn twice (side panel and dialog) | M | One inspector panel; the dialog only on narrow screens. | M |
| List: Filters button does nothing; load error shown as "No automations"; unlabelled menu; fixed `w-80` search | H / M | Remove the button or make it work; ErrorState; IconButton; responsive search. | S |
| 53 hard-coded node colours | L | Node category tokens (from chart and status tokens). | S |
| Canvas actions need drag and the minimap | M | Keyboard "Add step after", a list view of steps (doc 27 builder template). | L |

### 5.13 Forms (`app/dashboard/forms/page.tsx`, `forms/[formId]/page.tsx`, `components/forms/*`, `app/f/[slug]`, `app/public-form/[id]`)

| Issue | Sev | Proposed change | Effort |
|---|---|---|---|
| List cards are clickable divs; the inner "Edit" does nothing; Filters does nothing; unlabelled menu (`:152-236`) | H | A real link card (or DataTable); remove dead buttons; IconButton. | S |
| Two different public URLs shown for the same form (`/f/{slug}` vs `/public-form/{id}`) | M | One canonical public link with a copy button (decide which; see Open questions). | S |
| Editor field actions only appear on hover (`form-editor.tsx:1478`); field selection is a div with onClick; 6 unlabelled icons | H | Always-visible toolbar on the selected field; a selectable list item; labels. | M |
| Public form: required errors only in a toast listing names (`public-form-renderer.tsx:179`) | H | Inline errors with `aria-invalid`, focus moved to the first error, an error summary at the top. | S |
| Status shown twice in the builder header; load failure says "Form not found" | L / M | One StatusBadge; ErrorState. | S |

### 5.14 Call center (`app/dashboard/call-center/**`, `settings/call-campaigns/**`)

| Issue | Sev | Proposed change | Effort |
|---|---|---|---|
| Agents can't reach their campaign workspace; it is linked only from admin Settings | H | "My campaigns" list on the Call Center page. | S |
| Campaign page title never shows the campaign name; back link is fixed | M | PageHeader with the campaign name and status; a back link to where the user came from. | S |
| Analytics page: no header or back link; errors shown as "No analytics" | M | PageHeader; ErrorState; one simple chart per metric. | S |
| Empty-queue copy points to "Telephony settings" (it lives under Integrations) | L | Correct the copy and link. | S |

### 5.15 Cases / Service Desk (`app/dashboard/cases/page.tsx`, `cases/[id]/page.tsx`)

| Issue | Sev | Proposed change | Effort |
|---|---|---|---|
| No search; filters silently empty if the configuration fails to load (`:73`) | H | ListToolbar; ErrorState. | S |
| Subject required by toast only; labels not linked (`:166,285-305`) | M | Inline validation; `htmlFor`. | S |
| Overdue SLA shown only as red text; suggested articles not actionable; history toggle has no `aria-expanded`; upload not keyboard-reachable (`[id]:244-406`) | H | SLA StatusBadge with icon and text; article links with "Insert"; the toggle attribute; a real file button. | S |
| Status and priority change immediately on select, with no undo | M | Keep it, but add a toast with Undo. | S |

### 5.16 Applications (`app/dashboard/applications/**`)

| Issue | Sev | Proposed change | Effort |
|---|---|---|---|
| Card grid with no filters, sorting or table; "No applications match this search" even when nothing was searched | M | DataTable with stage, programme, owner and documents status; a correct empty state. | M |
| Numbering settings live outside Settings; free-text timezone; errors merged into one line | M | Move to Settings → Product catalog; timezone picker; inline errors. | S |
| Files written as minified single-line JSX | M (maintenance) | Reformat **before** any UI change, as a separate commit with no behaviour change. | S |

### 5.17 Approvals, Exports, Payouts, Leaderboard, My points

| Screen | Issue | Sev | Proposed change | Effort |
|---|---|---|---|---|
| Approvals (`approvals/page.tsx`) | Reject reason via `window.prompt`; approve in one click with no link to the item; no filter by type | H | ReasonDialog; a "Review" link to the item; type filter; approve with a summary of what is approved (amount for payouts). | S |
| Exports (`exports/page.tsx`) | Admin governance rules on a page every user can open; removing a rule has no confirmation; duplicates Approvals | M | Move the rules to Settings → Data privacy; ConfirmDialog; refresh automatically while jobs are pending. | S |
| Leaderboard | Errors shown as "No points earned yet"; top 3 shown with medal emoji only, no rank text; own row not highlighted | M | ErrorState; "#1" text plus a Lucide icon; highlight "You". | S |
| My points | Load errors make the balance read 0; redeeming has no confirmation; 5 stacked empty states | H | ErrorState; ConfirmDialog for redeem; one combined empty state. | S |
| Payouts | Change-request errors ignored | M | Inline error. | S |

### 5.18 Settings (`app/dashboard/settings/**`, `settings/components/sidebar-nav.tsx`, `components/layout/settings-sections.tsx`)

| Issue | Sev | Proposed change | Effort |
|---|---|---|---|
| **Everything is behind `RoleGuard requiredRole="Tenant Admin"`** (`settings/layout.tsx:8`), so non-admins can't change their own Password, Two-factor, Sessions or Appearance, and the Settings links send them back to the dashboard | H | A new **My account** area (`/dashboard/account`: Profile, Password, Two-factor, Sessions, Appearance, Notifications) open to every user. Settings stays admin-only; non-admins don't see the Settings navigation item. | M |
| "Settings → Security" is a platform-admin-only page (`admin/security/page.tsx:155`) | M | Move it to Platform admin; remove it from the tenant sidebar and from global search. | S |
| Three custom-field editors with contradictory delete warnings (`settings/custom-fields:50` vs `admin/custom-fields:67` vs `custom-field-manager:328`) | H | One editor (`custom-field-manager.tsx`) used everywhere, with create, edit and delete and one accurate warning. | M |
| General page: one Save covers 5 tabs but saves only 2; Appearance applies instantly; Workspace saves itself; permanently disabled Date Format (`page.tsx:363-505`) | M | Each section saves itself, with its own Save and an unsaved indicator; remove the disabled field or explain it. | S |
| Two-factor: closing the backup-codes step with X/Esc leaves the status "Not enabled" and loses the codes (`mfa/page.tsx:94,355`) | H | Don't allow dismissing until "I've saved these codes" is confirmed; refresh the status on close (also see §8). | S |
| Duplicate rules and Dedupe & Merge overlap | M | One "Duplicates" page: Rules tab and Review & merge tab. | M |
| Sidebar group names don't match their contents (telephony under "Tasks & service", AI under "Sales configuration"); repeated icons; search is desktop-only | M | Regroup: Workspace · People & access · Sales · Service · Calling · Finance & rewards · Integrations & data · Security & privacy; unique icons; search on mobile too. | S |
| Very long pages: Integrations (2,706 lines, 7 sections; page wider than the window, 1,517px at 1280px in the Sep 9 audit), Marketplace, Service desk (8 sections), Gamification and Payout cycles (two tab rows) | M | Settings template (doc 27 C): section menu on the left, one section per URL (`?section=`), max form width 960px. | L |
| Validation mostly by toast; required fields not marked | M | FormField with `*`, inline errors, and an error summary on save. | M |
| Icon-only buttons with no names: call-dispositions (9), integrations (10), task-playbooks, call-scripts, teams, permission-templates; the show/hide secret toggle uses Ban/Check icons | H | IconButton; Eye/EyeOff icons for show/hide. | S |

### 5.19 Duplicate `/dashboard/admin/*` pages

| Issue | Sev | Proposed change | Effort |
|---|---|---|---|
| 14 pages exist at two URLs (`settings/<x>` re-exports `admin/<x>`). `/dashboard/admin/*` has no layout, so opened directly it shows without the settings sidebar and without the Tenant Admin guard on screen | M | Redirect every `/dashboard/admin/<x>` to `/dashboard/settings/<x>` (`next.config.ts` redirects, a pattern already used for retention); later move the code under `settings/`. | S, then M |
| Links still point at `/dashboard/admin` (`reports/page.tsx:1583`, `global-search.tsx:160,212`, `view-switcher.tsx:62`) | M | Point them to the Settings URLs. | S |
| Platform-only pages under the tenant area with no navigation: `admin/plans`, `admin/rate-limits`, `admin/usage`, `admin/tenants` (duplicates `/platform-admin/tenants`), `admin/custom-fields` | M | Move them to Platform admin, or redirect them there, with navigation entries; remove the duplicate tenants page. | M |

### 5.20 Platform admin (`app/platform-admin/**`)

| Issue | Sev | Proposed change | Effort |
|---|---|---|---|
| **The Tenants list has no link to the tenant page** (reachable only from Module Health) | H | Tenant name as a link; row click opens it. | S |
| Tenant page: feature flags switch instantly with no confirmation and overlap with Modules; "Loading..." text; hand-built header (`tenants/[id]/page.tsx:419-612`) | M | Confirm risky switches (show which modules and users are affected); explain or merge the flag/module overlap (product decision, see Open questions); PageHeader; skeleton. | M |
| Marketplace: 5 `window.prompt`s including typing the tenant name; a 1,000px minimum-width table | H | TypedConfirm and ReasonDialog; a responsive table. | S |
| Suspend tenant uses `confirm` and a hard-coded reason "Admin Action" (`tenants/page.tsx:52`) | M | ReasonDialog. | S |
| Platform navigation shows 4 items in the main app sidebar but 10 in the platform layout (`NavigationDrawer.tsx:154` vs `platform-admin/layout.tsx:19`) | L | One shared list. | S |
| Audit logs: `text-3xl` header; search covers only the current page | M | PageHeader; server-side search. | S |

### 5.21 Authentication (`app/login`, `app/reset-password`, `app/bootstrap`, `settings/password`, `settings/mfa`)

| Issue | Sev | Proposed change | Effort |
|---|---|---|---|
| No "Forgot password" on login | H | A "Forgot password?" link with self-service email reset (needs the backend flow; see §8), or at least clear copy on how to get a reset link. | S (UI) |
| Password rules stated three ways (6 / 8 / none) | M | One rule (from the server policy) shown live under the field everywhere. | S |
| Two-factor code field missing `inputMode="numeric"` / `autocomplete="one-time-code"`; one error line above the form for all steps | M | Correct input attributes; errors next to the field. | S |
| Bootstrap uses jargon ("Checking Bootstrap Status…") | L | Plain copy. | S |

---

## 6. Cross-cutting fixes

### 6.1 Accessibility (WCAG 2.2 AA)

| Fix | Where | Sev |
|---|---|---|
| Give every icon-only button an accessible name (IconButton) | About 70 sites (§5) | H |
| Link every `<Label>` to its control (`htmlFor`/`id`) | Activity form, General settings, cases, automation builder, tenant page, leads dialogs | H |
| Replace clickable `div`, `Card`, `Badge` and `tr` elements with buttons or links, or add keyboard handlers and focus styles | Forms list, report metrics, AI-assistant modules, audit-log rows, form editor, DataTable rows | H |
| Use real tab semantics (`role=tablist/tab/tabpanel`, arrow keys) instead of `aria-pressed` groups | `WorkspaceTabs`, `SettingsSections` (wide mode), dashboard tabs, Views sections | M |
| Keyboard alternatives for every drag | Kanban (KeyboardSensor plus "Move to stage"), task calendar ("Reschedule"), dashboard widgets ("Move"), automation canvas ("Add step") | H |
| Never use colour alone: priority dot, overdue red text, filled/outline toggles, medal emoji | Kanban card, cases, AI-assistant modules, leaderboard | H |
| Visible focus ring on Input (`ring-2`, 3:1) to match Select and Textarea | `ui/input.tsx:11` | M |
| Text alternatives for charts ("View as table", summary) | Dashboard widgets, Reports overview, stage analytics | M |
| Skip link; visible, focusable record-header actions (not hover-only) | Shell, form editor, kanban card, dashboard handle | M |
| Announce status changes politely (bulk progress, save results) | SelectionBar, autosave | L |
| Keep the existing evidence checks: `scripts/ui-theme-token-contrast.py`, axe on the core screens, the 200%-text checks, and the shared overflow check in `scripts/ui-overflow.cjs` (now also catches clipped text) | Every phase | — |

### 6.2 Responsiveness

- **One DataTable with a `mobileCard` renderer** so paging, loading, errors and selection work on phones. This fixes the Leads and Activities mobile lists, and adds mobile layouts to Opportunities, Tasks, Views and Lists.
- **Record pages on mobile:** compact header, sticky bottom action bar, timeline first, properties in a collapsible section.
- **Builders** (automation, form, dashboard): on mobile show a read-only summary and a list editor with the message "Use a larger screen for the canvas". Don't try to squeeze the canvas.
- **Wide settings pages** (Integrations, Service desk, Marketplace): one section per URL; no fixed minimum widths.
- **Breakpoints:** below 768, 768–1199 and 1200+ (doc 27), with container queries inside panels. Test at 320, 390, 768, 1024, 1280 and 1440px, and at 200% text.

### 6.3 Loading, empty and error states

| Rule | Fixes |
|---|---|
| A failed load **never** looks like empty or zero: show ErrorState with Retry | Automations, forms list, form builder, leaderboard, my points (balance 0), call-campaign analytics, cases configuration |
| Separate "no results for these filters" from "nothing yet" | Leads, Opportunities, Activities, Applications |
| Keep the header and toolbar visible while loading; skeleton only the content | DataTable, record pages, settings pages, tenant page |
| One `module-disabled` state with one wording and a Request access action | Marketing, cases, payouts, leaderboard, my points, call center, applications, marketplace, API keys |
| `Button isLoading` for every async action; no plain "Loading..." text | About 62 files with spinners, about 40 "Loading..." strings |
| Show readable labels, never raw values or IDs | `NO_ANSWER`, `not-attempted`, tenant ID in the header, UUID checkbox labels, raw user ID prompts |
| Format numbers and currency with the tenant's locale | `$` on Opportunities vs hard-coded `₹` on My points |

---

## 7. Implementation phases

Order: impact against effort. Each phase ends with the existing evidence checks:
- layout and overflow at 320, 390, 1280 and 200% text, in light and dark;
- contrast script;
- unit suite, typecheck and build;
- before/after screenshots under `ui-audit-2026-09/`.

### Phase 1: Tokens and shared components (about 2 weeks)
1. **Tokens:**
   - add status, chart, radius and sidebar tokens to `globals.css` for all four palettes and dark mode;
   - retire the unused `design-tokens.css` and `lib/design-tokens.ts`;
   - decide on `tw-animate-css`;
   - add tabular numbers.
2. **Display maps:** `src/lib/display/` holds lead status, stage, priority, task status, SLA, delivery and health → label and tone; and currency/number/date formatters from the tenant settings.
3. **Components:**
   - StatusBadge and StatusSelect;
   - IconButton;
   - ConfirmDialog, ReasonDialog, TypedConfirm and `useConfirm`;
   - RecordPicker;
   - EmptyState / ErrorState variants (no-match, module-disabled, permission, inline);
   - skeleton set;
   - PageHeader slots;
   - page tabs (with URL sync) and segmented control;
   - Button `isLoading` adoption;
   - Input focus ring.
4. **DataTable upgrade:** sorting, sticky header, toolbar kept during load, keyboard row open, row-actions slot, `mobileCard`, page numbers.
5. ListToolbar (search, quick filters, chips, URL state) and SelectionBar.

**Risk:**
- **Breaking risk is medium in item 4,** because 13 screens use DataTable. Keep the new options off by default and switch screens over one at a time.
- Tokens and new components are additive, so the risk there is low.
- Server sorting needs API support per list. Check which endpoints accept `sort` before turning sorting on for each list; that's a backend item, see §8.

#### Phase 1 results (2026-10-02)

Done. The logo, which waited for the SVG (decision 2), was added on 2026-10-03. Contrast, unit tests, the gate audit and the real-database smoke tests pass, and the main screens were checked in a browser.

| Area | What changed |
|---|---|
| Tokens (`globals.css`) | Neutral surfaces in all four palettes, light and dark (decision 19, §10.3). `--input` is `#7F8A9C` so control borders reach 3:1 on the page as well as on cards. New tokens: `--subtle-foreground`, `--selected`, `--sidebar`, `--border-strong` (button borders), status tones (§3.2; neutral re-based to grey), chart series 1–8, `shadow-menu` and `shadow-dialog`. `tw-animate-css` is now imported, so the Radix enter/exit classes work and are shortened under reduced motion. `scripts/ui-theme-token-contrast.py` checks 168 pairs, all passing. |
| Retired | `app/design-tokens.css`, `lib/design-tokens.ts` (unused); the full-page `PageTransition` (it also remounted pages on navigation). |
| Shell | Quiet navigation (decision 24) in the main sidebar and the Settings menu; opaque white header and sticky record header; record tabs are one row of underline tabs. |
| Primitives | Table: sentence-case 12px headers, 40px rows, neutral hover, tinted selection, tabular numbers. Badge: tinted sentence-case pills with `tone` (call-site uppercase and bold are dropped). Button: neutral outline and secondary, `aria-busy` while loading. Input, Select and Textarea: 40px, white, visible 3px focus ring (Input had a ring colour but no width). Dialog and Sheet on card white. StandardDialog: 18px semibold titles, `xl` size removed. |
| Display (`lib/display/`) | `statusDisplay`/`statusLabel` for lead status, priority, task status, SLA, delivery, health, score band, lifecycle and outcome, with a readable fallback for unknown values. `formatMoney` (₹ INR default with Indian grouping, no decimals on whole amounts), `formatMoneyCompact` (₹2.5L, ₹1.5Cr), `formatCount`, `formatPercent`. `formatCurrency` now defaults to INR, not USD. |
| Components | StatusBadge, StatusSelect (used on the leads list, which also gained the missing "Contacted" option), IconButton, RecordPicker and `usePickRecordDialog` (activity form; "Transfer owner" no longer asks for a raw user id), `useConfirm`/`useAskText` app-wide (with a typed-confirmation tier), PageTabs with URL sync, SegmentedControl, `useUrlState`, PageHeader slots (primary, two secondary, "More" menu, back link, meta), EmptyState/ErrorState kinds and inline variant, ListToolbar, SelectionBar, Section/DescriptionList, FormField/ErrorSummary, StandardSheet, `undoToast`, one app-level TooltipProvider (400ms). |
| DataTable | Toolbar and headers stay during loading, empty and error states; Enter opens a focused row; page numbers. Opt-in: server or client sorting with `aria-sort`, sticky header with `maxHeight`, `rowActions`, `mobileCard`. |
| App-level (G1, G2, G5) | Branded `not-found`, `error` (root, dashboard, platform admin), `global-error`, dashboard `loading`. Tab titles such as "Diya Khan 0601 · Leads · Unnatify" (`lib/page-titles.ts`, record names on 9 record pages). Browser-locale dates in 7 files replaced with the workspace formatters; the task calendar's range labels follow in Phase 2. |
| `confirm()`/`prompt()` | Gone from the shared components, about 20 calls; the click-capture navigation guard in the AI panel has to stay synchronous. About 70 remain in pages, for Phases 2–3. |
| Storage | `lib/storage.ts`; all 12 files using `localStorage` go through it, so blocked storage can't throw. |
| Global (M) | **Search:** leads match on phone digits too; records are listed before commands; "Searching…" and error rows. cmdk's own filter is off, because it hid records found by email or phone. Activities open their record, tasks open in the editor, partners open their profile. **Notifications:** read and unread states, "Mark all as read" with Undo, a new "View all" page (`/dashboard/notifications`, with API paging and mark-unread), and the unread count in the button's name. **Header:** the user's name and workspace name instead of the tenant id; the Create menu holds record creates only, and refreshes open lists without a full reload; keyboard shortcuts are in the account menu. **Banners:** maintenance can be dismissed for the session. **Incoming call:** a docked, non-modal panel. |

**Tests:**
- New: `tests/display-maps.test.ts`, `tests/page-titles.test.ts`.
- Updated for the new behaviour: `tests/global-search.test.ts`, `tests/notification-deep-links.test.ts`.
- `scripts/activity-scope-smoke.ts` adds phone search (39 checks).

**Left for later phases:**
- Adopting the new components screen by screen (Phase 2 starts with Leads).
- Merging Dialog and StandardDialog.
- Converting the remaining page `confirm()` calls.
- The logo.

### Phase 2: Highest-traffic screens (about 2–3 weeks)
1. **Global search fix** (S, do first), quick-create without reload, header identity, notifications.
2. **Leads list:** toolbar, search, sorting, default columns, chips, quick actions, StatusSelect, mobile cards.
3. **Lead detail:** RecordHeader quick actions, owner, de-duplicated status and score, tab set, timeline grouping and paging, raw labels.
4. **Opportunities list and board:** same as Leads; stage chips; currency; keyboard kanban.
5. **Opportunity detail:** stage path with won/lost reason.
6. **Tasks:** "My open tasks" default, priority tones, toolbar, server paging, delete in the menu.
7. **Activities:** RecordPicker, columns, mobile.
8. **Dashboard:** "My day" default and an edit-mode toggle.
9. **Replace `confirm()`/`prompt()` on these screens.**

**Risk:**
- **Inline status and stage edits and bulk actions touch real data.** The logic bugs in §8 (select-all scope, silent rollback) must be fixed in the same change, with real-database checks.
- Changing default columns and the page size changes what users see. Treat it as a per-user preference migration; don't wipe saved column settings.
- Timeline paging changes how activities load; it needs API paging, or a client-side window first.

#### Phase 2 results (2026-10-02)

Done. Type check, lint (all changed files), unit tests (163 files, 2,021 tests), the gate audit, contrast (168 pairs) and six real-database smoke tests pass. Every screen below was checked in a browser at desktop and phone width on Demo University, using a temporary admin that is deleted afterwards.

| Area | What changed |
|---|---|
| Navigation (decision 27) | Sidebar regrouped: My work, Sales, Service, Marketing & automation, Insights, then Settings as one item. Payouts shows only to people who can see payouts. Exports moved out of the sidebar into each Export button's "Your exports" link. |
| Lead statuses (decision 6) | Migration `0124_lead_status_definitions.sql`: a per-workspace status list (label, tone, Open/Converted/Lost category, order, active), seeded with the defaults plus every value already in use (`DISQUALIFIED` → Lost). Settings → Lead statuses manages it (add, rename, recolour, reorder, deactivate; a status in use can't be deleted; the last Open status can't be removed). Every writer (UI, API v1, apps, automations, forms) resolves a status by key or label and refuses unknown ones; a lead keeps an undefined legacy value until it changes. Call queues, Next Best Action, retention and the converted-leads report use the category, not hard-coded names. New workspaces get the defaults. |
| Leads list | One toolbar: search (name, email, company, phone digits), quick views All / Open / Converted / Lost with counts, Filters (n) with removable chips; search, view and sort are in the URL. Columns: name and company, phone, inline status, owner, last activity, next task, score dot, source (email, created and NBA available but hidden). 25 rows; row click opens the record; a preview and a "More" menu per row; phone cards. Selection bar: change status (with Undo), assign (with required reason), add to list, delete (typed confirmation above 25). |
| Lead record | Header: name, inline status and owner (governed reassignment, reason optional), Log call or Log activity, Add note, Add task, AI, forms, and one "More" menu. One summary card (contact with call and WhatsApp, key facts, call script). Activity tab: a composer (note in one step; task as title + due chip) above a compact feed grouped by day, with type chips, a date range and server paging of 25. Tabs are in the URL. Opportunities come from the server for this lead (the old code filtered the first 100 in the workspace). After creating an opportunity, a toast offers to mark the lead Converted. Phones get a bottom action bar. |
| Opportunities list and board | Same toolbar: search, quick views Open / Won / Lost with counts (a new `stageCategory` filter), type select, List / Board / Analytics. Columns: title and lead, value (₹), stage, priority, owner, close date (overdue in red), score. The per-stage chip wall is gone. Selection bar: assign (required reason), delete. The board accepts keyboard moves, shows ₹ compactly, and says when it shows only the first 500. |
| Opportunity record | The lead record's layout, plus a stage path under the header. Moving to Won or Lost asks for the reason, which is saved on the stage history (`stageChangeNote`) and shown there; open-stage moves have Undo. The linked-lead lookup no longer stops at 500 leads. |
| Tasks | Opens on **my open tasks**. Server paging with real totals: the list used to stop at 500 rows without saying so; `?page=` now returns a page plus the total, and existing callers still get the array. Quick views Open / Overdue / Due today / Upcoming / Completed / All with counts; owner (Me / Anyone / a person) and priority; search. Columns: complete toggle (with Undo), task and flags (blocked, SLA breached, checklist, unclaimed, repeats), related record, due ("Overdue · …", "Today, 5:00 pm"), priority, owner, status. Delete is in the row menu, behind a confirmation. Selection bar: complete, assign, reschedule, delete. The editor picks lead and opportunity with RecordPicker (it preloaded 200 leads, 200 opportunities and 300 activities), and loads activities and sibling tasks for the linked record. Calendar headings use the workspace date format and time zone. The calendar says when it shows only the first 200. Export follows the Open view and search. |
| Activities | Toolbar: search notes, Any time / Today / Last 7 / Last 30 days, type, "Logged by me", Filters with chips. Columns: type (colour dot), notes, outcome and SLA as words, related record, by, when. Row click opens the related record's activity tab. Phone cards replace the separate mobile list. |
| Dashboard | Opens on **My day**: overdue tasks, due today (complete with Undo), follow-ups due, new leads this week and my open pipeline, each with its real total, the first five, and a link to the filtered list. The widget dashboards are one tab over, and moving, resizing, templates, saved layouts and tab management appear only after **Customize**. |
| `confirm()`/`prompt()` | None left on these screens. The AI panel's navigation guard stays synchronous. |

**Fixed along the way:**
- The list pages memoise their columns, so inline actions (complete a task, change a lead's status) used the first render's handler and refreshed with stale filters; they now call the latest handler.
- An older list or count request could finish after a newer one and overwrite it. Tasks and Opportunities counts now cancel the older request, like the lists.
- A Radix Select whose trigger shows its own text placed its menu off-screen. These use `position="popper"`.
- **Task visibility for Team access** (decided 2026-10-02: option (a)). Task lists narrowed only for Own-access and partner roles, so a Team-access user could list every task in the workspace, with the linked lead's name. Now, as for leads: Own sees their own tasks; Team sees their own plus tasks owned by members of their team (their own only when they have no team); All sees everything. One rule (`applyTaskScopeClause`, `lib/server/record-scope.ts`) covers the list and its totals, opening, editing, deleting, bulk edits and the task export. Two gaps on the same path are closed too: ticking a checklist item and choosing "blocked by" tasks now require tasks the user can see. Team queues keep their own membership rule. `scripts/tasks-scope-smoke.ts` checks this on a real database (18 checks).

**Tests:**
- New: `scripts/lead-statuses-smoke.ts` (21 checks) and `scripts/tasks-page-smoke.ts` (12 checks: totals, every task once across pages, Open view, literal `%` and `_` in search, owner and priority, Own-record access can't be widened, page-size cap).
- `scripts/tenant-provisioning-smoke.ts` checks a new workspace gets the default statuses.
- Updated for the new behaviour: `tests/leads-postgres.test.ts`, `tests/opportunities-postgres.test.ts`, `tests/lead-atomic-writes.test.ts` (status lookup stubbed; it has its own smoke), `tests/leads-crud.test.ts` and `tests/tenant-isolation.test.ts` (the list wrapper's new options argument).

**Noticed then (all fixed since):**
- "Due today" for tasks (list and export) and the activities time ranges used the server's or browser's midnight, not the workspace time zone. Fixed 2026-10-03: the server uses the workspace's today (`getTenantTodayRange`), and so do the call center's "missed today" and agent call counts; the browser uses `workspaceDayStart` for the activities ranges and the tasks calendar lanes. `scripts/workspace-today-smoke.ts` (a workspace in Pacific/Auckland, tasks due every hour across two days).
- The shared filter engine's `contains`, `starts with` and `ends with` treated `%` and `_` as wildcards. Fixed 2026-10-03 (`escapeLike` in `lib/query-filters.ts`; checked in `tests/smart-view-server-query.test.ts` and `scripts/smart-view-server-smoke.ts`).
- 66 `confirm()`/`prompt()` calls remained; Phase 3 replaced them all (none left in the code).

### Phase 3: Remaining screens and polish (about 3–4 weeks)
1. **Settings:**
   - the "My account" split (**access-control change:** needs explicit approval and tests that non-admins can reach only their own pages);
   - regroup the sidebar;
   - one custom-field editor;
   - one Duplicates page;
   - per-section save;
   - the settings template for Integrations, Service desk and Marketplace.
2. **`/dashboard/admin/*`:** redirects and link fixes; move the platform-only pages.
3. **Platform admin:** tenant link, confirmations, prompts → dialogs.
4. **Reports:** library vs builder, filter bar, chart fix, deep links.
5. **Other screens:**
   - Automations: unsaved-changes guard, name, single inspector, dead buttons;
   - Forms: link cards, editor toolbar, public-form inline errors, one public URL;
   - Marketing: module-off state, composer route, journey confirmations;
   - Call center: "My campaigns";
   - Cases;
   - Applications: reformat first, then DataTable;
   - Approvals, Exports, Leaderboard, My points.
6. **Auth:** forgot-password link (UI part), one password rule, two-factor input attributes.
7. **Clean-up:**
   - remaining hard-coded colours (409);
   - text sizes below 12px (140);
   - `font-extrabold` (138);
   - arbitrary radii;
   - dead components: `components/kanban/kanban-board.tsx`, `views/view-switcher.tsx`, `data/floating-bulk-actions.tsx`, `common/field-history-panel.tsx`, `leads/lead-quick-view.tsx`, `layout/breadcrumbs.tsx`;
   - stale MUI comments; rename `mui-dynamic-field.tsx`.

#### Phase 3 results (2026-10-03)

**Settings, account and platform:**
- **My account** (decision 8), `/dashboard/account`, for everyone: Profile (your own name, via a new `PATCH /api/auth/me` that changes nothing else), Preferences, Notifications, Sign-in & security (password with the workspace's actual rule shown and checked as you type, two-factor, sessions) and My activity. The old Settings Password, Two-factor and Sessions pages redirect there. Settings and its menu item show only to admins; non-admins who open a Settings URL land in My account.
- **One admin rule.** The Settings guard used to match role *names* containing "admin"; it now uses the server's `isTenantAdmin` (All-records access or full admin module access), so the guard and the admin APIs agree. No role in the local workspaces changes either way.
- **Settings structure** (decisions 22 and 28): ten groups with new URLs (`/dashboard/settings/<group>/<page>`) from one registry (`lib/settings-pages.ts`) that drives the menu, a new Settings home with search, global search and the breadcrumb "Settings › Group › Page". The main menu collapses to its icon rail inside Settings. Every old URL, including the 14 `/dashboard/admin/*` duplicates, redirects (`lib/legacy-routes.ts`, 72 entries, checked by `tests/legacy-routes.test.ts`). Plans, Rate limits, Usage and Security policies moved to Platform admin; the Plans page and the "Revenue: Unavailable" tile were removed (decision 35). Page headings now match the menu names.
- **Merged pages:** Roles & permissions (with Permission templates as a tab), Duplicates (Rules + Review and merge), Objects & fields (one field editor, `components/admin/fields-editor.tsx`, for workspace fields and per-type fields; stored data unchanged; the field key can't change after creation; one accurate delete warning). The faked "Create permission template" dialog was deleted.
- **Settings sections** (`SettingsSections`): real tabs with arrow keys, each section in the URL (`?section=…`), so Integrations › Phone system and › Email, SMS & WhatsApp are listed under Calling and Messaging & AI. Integrations, Service desk and Marketplace fit a 1280px window.
- **Workspace profile** keeps only the company and regional settings, with the shared save bar (`components/common/save-bar.tsx`: shown only with unsaved changes, Discard and Save, a warning before leaving).

- **Stage editor** (decision 34, G6), Settings › Opportunity types & stages › Stages: add, rename, recolour, reorder, change kind, remove. Removing a stage with opportunities moves them to another stage first (each move in the stage history) and archives the stage (migration `0125_stage_archive.sql`; stage names unique among active stages); a Won or Lost stage in use can't be removed; every type keeps an open, a Won and a Lost stage, also under concurrent removals; a stage's kind can't change while opportunities are in it. New types start with New, Won and Lost. `scripts/stages-smoke.ts` (22 checks).
- **Platform admin:** grouped navigation (Overview · Tenants · Marketplace · Security & compliance · System) in the quiet style; tenant rows open the tenant; Suspend explains what happens and goes through approval when that's on; the marketplace prompts and the tenant page's confirms are dialogs; Usage, Rate limits and Security policies have proper headers.
- **Reports** (decision 30): a Library (`/reports`: standard reports by category with search, saved reports), each standard report on its own page (`/reports/standard/<key>`), saved reports (`/reports/custom/<id>`), the builder (`/reports/new`), Schedules, Metrics and Compare segments on their own pages; Annotations and Data catalog moved to Settings › Analytics. Old links (`?report=`, `?reportId=`, `?create=1`, scheduled-report emails) open the new pages, and new schedule emails link to them directly. The 3,300-line page became `reports/_components/report-sections.tsx` with no behaviour change.
- **Sign-in and passwords:** "Forgot password?" (decision 16, platform SMTP, answered 2026-10-02): `POST /api/auth/forgot-password` gives the same answer whether or not the email has an account and sends after replying; rate-limited by IP and by email; a one-hour single-use link that replaces any earlier one; nothing for deactivated users or suspended workspaces. Configured with `SYSTEM_SMTP_*`, `SYSTEM_EMAIL_FROM` and `APP_URL` (`.env.example`); until then the link stays hidden. `nodemailer` 10 (7.x had open advisories). One password rule: the workspace's actual rule is shown and checked as you type on My account, the expired-password step and the reset page (`GET /api/auth/reset-password?token=` also says whether the link still works); sign-in no longer rejects passwords under 6 characters before asking the server. `scripts/forgot-password-smoke.ts` (9 checks).
- **Feature flags merged into modules** (decision 15): migration `0126_feature_flags_into_modules.sql` turns each of the six overlapping flags that is off into a DISABLED module, so nothing changes for any workspace; from then on the module alone decides (`isFeatureEnabledForTenant`, the user's feature list, module states, the scheduled-report sweep). The feature-flags API switches the module for those six (with its dependency checks and audit); Platform admin's Feature flags section keeps only API access and Sales groups. `scripts/flags-into-modules-smoke.ts` (14 checks); the module lifecycle, switches and health smokes were updated.

**Other screens (§5.8–§5.17):**
- **Payouts workspace** (decision 32). Insights › Payouts is now, for admins, one place for the day-to-day work: To approve (with select and approve), On hold, To pay, Disputes and Reward redemptions, each across every cycle (`GET /api/payouts?queue=`), plus Cycles (start the next cycle, recompute, export). Every payout row shows the next steps it allows (approve, invoice, mark paid, adjust, hold or release, invoice history). Settings › Rewards & payouts › Payout rules keeps only the rules, as one section menu instead of tabs inside tabs; the redemption queue left Gamification settings. Partners keep their own "My payouts", now with their invoices (download, and a one-hour share link) and a profile-change form with errors beside each field (GSTIN and PAN shapes checked; only changed fields are sent). Admins used to get "Something went wrong" from the Payouts menu item. `scripts/payout-queues-smoke.ts` (11 checks).
- **My points:** a load error shows an error, never a balance of 0; redeeming confirms the cost and what's left (points are taken at once and refunded if declined); one empty state instead of four; readable statuses. **Leaderboard:** rank as text (#1) as well as a trophy, your row marked "You", period and scope in the URL, an error state.
- **Automations:** list as a table with a working On/Off filter (the Filters button did nothing), readable trigger names, labelled row menu, turn on/off from the list, an error state. Builder: the name is edited in the header with its error beside it; one inspector (the 950-line unreachable copy in the side panel was removed; the builder went from 3,620 to about 2,700 lines); step colours from the chart tokens by category instead of 75 hex values.
- **Builder save model** (decision 29) for **automations** and **forms**: the builder saves a draft as you work ("All changes saved"); nothing changes what runs, or what the public form shows, until **Publish**, which shows what changes and takes optional notes; every publish is a numbered version that can be restored as the draft; Discard drops unpublished changes; undo and redo (⌘Z, ⇧⌘Z) in the automation builder; ⌘S saves the draft; leaving with unsaved changes asks first. New items start as an unpublished draft and can't be turned on until published. Existing automations and forms became version 1, so nothing that runs changed (migrations `0127_automation_drafts.sql`, `0128_form_drafts.sql`). Automations and forms created outside the builders (journeys, the API, apps) are published as before, and a direct change to an automation's definition is still recorded as a version. A test run tries the draft; Enroll runs the published version. For forms, placements, visibility and on/off still apply at once and are never overwritten by a publish. `scripts/automation-drafts-smoke.ts` (21 checks), `scripts/form-drafts-smoke.ts` (19 checks).
- **Archive and restore** (decision 31) for **automations** and **forms**, whose deletes used to destroy their run history and submissions: Delete now archives with an Undo toast and no dialog; an archived item stops at once (an automation no longer runs, test-runs or accepts edits; a form's public link and submissions stop), sits under an "Archived" filter with Restore, and is deleted for good after 30 days by a new worker job (`archive.purge`) or sooner with "Delete for good" (typing the name). An automation that runs a journey can't be archived. `scripts/archive-smoke.ts` (25 checks).
- **Forms:** a table instead of clickable cards with an Edit button that did nothing; a working Live/Off/Archived filter; one public address (`/f/{slug}`; `/public-form/{id}` shows that address) with Copy; the editor's status shown once; a missing form says so (the API returned 200 with null). Public forms show errors beside each field, a summary at the top and move focus to the first problem (it was one toast); email addresses are checked. Editor: fields are selectable from the keyboard, actions appear on focus as well as hover, every icon button is labelled.
- **Campaigns:** tabs in the URL (`?tab=composer` opens the composer), the module-off message in plain words with a link for admins, Pause confirms (it stops new enrolments; people already in carry on).
- **Call center:** "My campaigns" for agents (active campaigns they may call, with calls due now; `GET /api/call-campaigns?mine=1`, same rule as the next-call endpoint), the campaign workspace titled with the campaign's name and status, a results page with a header and an error state, the empty-queue copy pointing at Settings › Integrations › Phone system. `scripts/my-call-campaigns-smoke.ts` (7 checks).
- **Cases:** search (subject, requester or case number, on the server), an error when statuses and queues can't load, an inline subject error, SLA as "Overdue" text with an icon, suggested articles you can read and insert into the reply, the history toggle's `aria-expanded`, a real "Add file" button, Undo after a status or priority change.
- **Applications:** the minified files were reformatted first (no behaviour change), then a table with server paging and a correct empty state; numbering has a searchable time-zone picker and errors beside each field. Numbering stays on the Applications page rather than moving to Settings: non-admin roles with the Applications "manage" permission use it, and Settings is admin-only.
- **Smart Views:** record names link (same tab), checkboxes and menus are labelled with the record's name, the search box is labelled. Leads, opportunities and activities now load every page (up to 5,000) before the view's filters run; before, only the first 500 were checked, so matches past them were silently missing (a demo view showed 476 of 1,143 matches). Above the cap the tab says how many records were checked out of how many. **Lists:** the Status column (it said "Stage") and the "Add leads" picker searches the server 50 at a time instead of loading 5,000 leads. **Team queues:** a header, labelled selects, error states, task titles that open the task, the chosen queue in the URL.
- **Back-end features with no screen** (decision 33), now on screen: team members (add, remove), knowledge-base categories, "Was this helpful?" on suggested articles, call-queue release and queue health, consent and consent history on lead and opportunity pages (admins), message snippets (Settings › Messaging) with "Insert snippet" in the composer, template approval and versions, marketing costs and ROI (Campaigns › Costs & ROI), frequency limits (Settings › Messaging), journey enrolments with exit and mark converted, report export from the report page (through the governed export queue), export share links, GDPR export downloads, score preview, assignment simulation history, dashboard tab reordering, and in the marketplace: an app's permissions, record access, credentials (masked; rotate shows the new secret once) and action history; Platform admin › Failed jobs; a confirm before rejecting platform permissions.
- **No more browser `confirm()` or `prompt()`**: the last 36 were replaced with specific dialogs (titles naming the item, buttons naming the action, typed confirmation for permanent deletes). Two deliberate exceptions remain because they must answer synchronously: the editor dismiss guard and the AI panel's leave guard.
- **Clean-up:** text below 12px (82 places) is now `text-xs`; `font-extrabold` (82) became `font-semibold`; arbitrary radii (55) use the scale; 277 raw status colours (amber, emerald, blue, red pills) use the status tokens; the five unused components were deleted (`lead-quick-view` had already gone); stale MUI comments updated; `mui-dynamic-field.tsx` is now `dynamic-field.tsx`. Remaining hex values are deliberate: colours people pick for types and stages, PDFs, the embed snippet and form themes.

**Access fixes found on the way** (all pre-existing; tightened, never loosened):
- The workspace audit log (`/api/governance/audit-logs` and `/api/audit-logs`) returned every entry to any signed-in user; non-admins now get only their own. Reviewing, commenting on and legal-holding audit entries is admin-only.
- A record's history (`/api/governance/history/…`) and its notes (list, add, pin) answered for any record id in the tenant; they now need access to the record, and fields hidden by field permissions stay hidden in the history.
- 33 Settings write endpoints needed only a signed-in user: teams, sales groups, activity types, custom fields and per-type fields, lead-scoring rules and recompute, CSV import (preview, jobs, templates, approve, reject, cancel), phone suppression, export approve and reject and export sensitive-field rules, and automation `process-due`. They now need an admin (`tests/admin-only-routes.test.ts`, 43 checks).
- Custom reports could be changed or deleted by anyone, and export templates deleted by anyone; now only the owner or an admin.
- Opportunity-type writes and the self-learning scoring controls (promote, overrides, recompute) needed only a signed-in user; now admin. Report annotations: writes admin-only (they moved to Settings › Analytics).
- Tests: `scripts/access-hardening-smoke.ts` (real database, 27 checks); `tests/admin-only-routes.test.ts` (62 checks, including the stage routes and the messaging routes below).
- Adding a team member accepted a user or team from another workspace (foreign keys don't check that) and failed with a 500 on a repeat; both are refused clearly now (`scripts/team-members-smoke.ts`, 5 checks).
- The self-learning score list returned every score in the workspace to anyone signed in; the whole list is now admin-only, and one record's scores need access to that record.
- **Leaving a journey didn't stop it.** Exiting, converting, unsubscribing or being outranked by another journey marked the enrolment but left the journey's scheduled steps queued, so messages could still go out. All four now cancel that record's pending journey steps (`scripts/journey-exit-smoke.ts`, 7 checks).
- The report page's export used a direct CSV route with no export rules, approval, audit entry or rate limit; it now uses the governed export queue like the saved-reports list.
- Rotating a marketplace app's API secret also returned the (unchanged) webhook signing secret, so any admin could read it at will (decided 2026-10-03: stop returning it). Rotation now returns only the new API secret, for tenant and platform admins alike. A lost signing secret is replaced with the new **Rotate signing secret** (Settings › Marketplace › app › Credentials): the new one is shown once, and for 24 hours every delivery is also signed with the old one in `x-app-signature-previous` so receivers can switch without dropping messages (migration `0129_app_signing_secret_rotation.sql`; all five signing paths share `lib/server/app-signing.ts`). `scripts/app-signing-rotation-smoke.ts` (7 checks).
- **Role module permissions are enforced on the server** (decided 2026-10-03; they used to hide only the Create menu entries, while every API answered). One rule (`lib/module-access.ts`) for the API and the UI: **No access** blocks the module's API (403 naming the module) and hides its menu items, My day cards and Create entries, and its pages say "Your role can't see …"; **View only** allows reads; **Create and edit** allows adding and changing; **Full** also allows deleting. A module the role doesn't set isn't limited (as before), admins are never limited, and permission templates override the role module by module in the same order as field permissions. Covered: leads and lists, opportunities, activities, tasks and queues, Smart Views, reports and metrics, dashboards (My day always stays), forms (filling in a form on a record is always allowed), automations, payouts, partner management (the partner portal is unaffected). Enforced once in `requireCurrentUser`, so every route gets it; `serverError` turns it into the 403. The role editor now lists every module with "Not limited" for unset ones, and saving no longer drops what it doesn't show: before, saving a role erased its Tasks, Reports, Views, Payouts, Partners and Dashboard settings and its field permissions. `tests/module-access.test.ts`; checked over HTTP with a mixed role (leads none, opportunities and reports view only, tasks create and edit, activities full).
- **Lead lists respect record access.** A static list now shows each person only the members they may see, with "N more members you don't have access to" for the rest (the count still includes them), and adding leads someone can't see (another owner's under Own access, or another workspace's) is refused with a 400. A smart list notes when it shows the first N of M matches. `scripts/lead-list-scope-smoke.ts` (5 checks).
- **Unsubscribe links appear in consent history.** The public link records the opt-out with source "Unsubscribe link" and a consent-history row; the consent card's current state now comes from the stored consent (`GET /api/communications/consent`), not only from history. `scripts/unsubscribe-smoke.ts` (7 checks, including cancelling the record's journey steps).
- **Knowledge base:** a duplicate category name (any case) or an invalid parent is a clear 409/400 instead of a 500; renaming a missing category is a 404; "Was this helpful?" checks that the article and case belong to the workspace. `scripts/knowledge-base-integrity-smoke.ts` (11 checks).
- **Call queues:** a team's queued calls need membership (the Settings › Teams member list, their primary team, or team lead) or supervisor access; queue health lists only a rep's own teams. Admins, who are the ones shown the Team section, can now release a call even when their role has Own record access (before, the Release button they saw could fail), and release is audit-logged like claim. Opening a queue in the call center also never worked: the list failed on a uuid/text join, so it always said "Could not load queued calls"; fixed. `scripts/call-queue-access-smoke.ts` (12 checks); claim and release checked in the call center.
- **Template approval can gate sending** (decided 2026-10-03). A new workspace switch, **Send only approved templates** (Settings › Integrations › Email, SMS & WhatsApp › Templates), is off by default so nothing changes on deploy. When on, a template version sends only once Approved (manual sends, campaign test sends, and campaign launches, which are refused before they start rather than stopping halfway), and the author of a version can't approve it (also through the Approvals inbox). The review order is always enforced: Draft or Rejected → Waiting for approval → Approved or Rejected; an Approved version stays Approved, and editing makes a new Draft version. Turning the switch on asks first and says how many templates will stop sending. Migration `0130_messaging_settings.sql`; `GET/PUT /api/communications/settings` (admin, audit-logged). `scripts/template-approval-smoke.ts` (15 checks).
- **Custom reports can be private** (decided 2026-10-03). The report builder has **Who can see it**: *Everyone in this workspace* (the default) or *Only me and admins*. A private report is left out of other people's Saved reports list and can't be exported or cloned by them; the list marks it "Only me" (admins see "Private" on other people's). Before, the stored flag was never set by the builder and every save reset it, while every report was listed to everyone; migration `0131_custom_report_sharing.sql` marks every existing report *Everyone*, so nothing disappears. Saving without a choice keeps the current one. The governed "Reports" list export selected two columns that don't exist and failed every time; it works now and lists only reports the person can see. Exporting a report that's gone or not shared fails instead of producing an empty file. `scripts/report-sharing-smoke.ts` (11 checks).
- **Snippets (`{{snippet:key}}`) expand wherever someone writes them**: messages sent from the composer or outbox API, campaign subjects and bodies (launch and test send), automation message steps, and templates (including locked headers and footers). Before, they expanded only in template sends. They expand in the author's text *before* record values are filled in: template sends used to fill in tokens first, so a lead whose name contained `{{snippet:…}}` (for example from a public form) could pull a snippet into the message. System messages that echo other people's text (case replies, inbound auto-replies) don't expand snippets. `scripts/snippet-expansion-smoke.ts` (6 checks).
- **Message lists:** the workspace outbox (`GET /api/communications/outbox`: every recent message's recipient, body and, for automations, the source record) answered to anyone signed in; it's admin-only now (only Settings › Integrations uses it). A record's message history (`/api/communications/events`, the panel on lead and opportunity pages) answered for any record id; it now needs access to the record, like notes and history. Checked over HTTP: a rep gets 403 and 404, an admin 200.
- `scripts/api-regression-smoke.js` was out of date and broke its own cleanup: impersonation now needs a reason and sets an HttpOnly cookie (the script now checks that, and that no token is in the body); the score recompute answers 202 (queued); and removing the workspace it creates failed on module entitlements, which rolled back the whole cleanup. Created workspaces are now cleared across every tenant-scoped table, outside the transaction, and the forms and custom fields it archives are removed. 173 calls, no failures, nothing left behind.
- **Smart Views filter on the server** (deferred item, done 2026-10-03). A tab of leads, opportunities or activities asks the list API for one page of matches with the exact total, so the 5,000-record cap and its "checked the first 5,000" note are gone for those tabs; search, sort (column headers) and count chips are worked out on the server too, and the table is the shared `DataTable` (page sizes 25/50/100, selection, density). Owner and team segments become owner conditions ("someone else" includes unowned records; "my team" now works -- before, it never matched because records carry no team), and older relative-date values map to the server's (adding Tomorrow, This week (Monday–Sunday) and Next 7 days). The list APIs take `?strict=1`: a condition they can't apply is refused with a 400 naming it, instead of being skipped (which widens the result). A tab using a filter the server can't apply (pending next best actions, activity touch state) keeps filtering in the browser with the cap and its note; so do tasks, partners, payouts and reports tabs. Activities gained server search (`?q=`, notes or lead name) and sort. `components/views/smart-view-server-query.ts`; `tests/smart-view-server-query.test.ts`; `scripts/smart-view-server-smoke.ts` (7 checks, 6,000 leads with the only matches past the newest 5,000). Note: server semantics differ slightly from the old browser filter -- text "equals" is case-sensitive and "on date" means the whole day -- the same as the leads and opportunities lists' own filters.
- **Smart View audiences can't widen a send.** A campaign audience from a Smart View that was deleted fell through to "no filters" -- every lead; a journey's matched nothing (safe). And both skipped any view condition the server couldn't apply, so a send could reach more people than the view showed. Both now apply the view exactly as the Smart View does, strictly: a deleted or archived view, or a condition that can't be applied, stops the launch, test or enrolment with a clear message. Launch now works out the audience before marking the campaign running, so a refused audience doesn't leave it stuck as Running. A report whose record source is a Smart View no longer reports on every record when the view is gone, and no longer drops view conditions it can't apply (or turns "match any" into "match all"): it says so.
- **Archive and restore for more items** (decision 31, deferred item; decided 2026-10-03 to cover all of these). Delete now archives Smart Views, custom reports, assignment rules and rule sets, lead-scoring rules, recommended-action rules, commission rules, gamification (points) rules, CSV import templates and export templates: no dialog, an Undo toast, and an **Archived** section under each list (Smart Views: **Recently deleted**, since their existing Archive / Show archived is a separate state that stays) with Restore and Delete for good (typing the name). An archived item stops applying at once -- every engine and list skips it (assignment, scoring, recommendations, commission resolution, points, audiences, exports) -- and is purged after 30 days by the `archive.purge` worker job. Rows stay in place so ledgers, logs and versions keep their links; a commission or points rule that a ledger refers to is never purged or deleted for good (it stays archived). Rules are admin-only; views, reports and export templates follow their owner-or-admin rule. Shared helper `lib/server/archive-items.ts`, routes `/api/archive/<kind>` (list) and `/api/archive/<kind>/<id>` (restore, delete for good), component `ArchivedItemsSection`; migration `0132_archive_configuration_items.sql`. Lead lists have no delete, so nothing changed there; permission templates keep their confirm (they have users). An archived rule set's rules keep working and show as ungrouped. `scripts/archive-items-smoke.ts` (24 checks).
- **Builder save model for the report builder** (decision 29, deferred item). The builder saves a draft as you work ("Draft saved · version N is live", ⌘S saves now); the report page, exports, schedules and dashboards only change on **Publish**, which shows what changes (columns, filters, source, sort, limit) and takes notes; every publish is a numbered version; **Versions** restores one as the draft; **Discard changes** goes back to what's live. The name and "Who can see it" apply at once. A new report starts as an unpublished draft that only its owner (and admins) see and can't be exported yet; reports made any other way (the API, clones) are published as version 1, and a change made outside the builder applies at once and is recorded as a version. Existing reports became version 1 (migration `0133_custom_report_drafts.sql`). `scripts/report-drafts-smoke.ts` (17 checks).
- **Campaign composer** (decision 29, deferred item). A Draft campaign saves itself as you work ("All changes saved"); nothing is sent until it's approved and launched, which is its Publish. Fixed on the way: saving an approved, pending or scheduled campaign used to change what it would send without new approval -- now changing its audience or message (not its name) puts it back in Draft and clears the approval, after asking; and a campaign that has started can't have its content changed (it used to be editable while running). Campaigns have no version history: one runs once. `scripts/campaign-drafts-smoke.ts` (7 checks).
- **Dashboard edit mode** (decision 29, deferred item). While customizing a dashboard tab, moving, resizing and removing widgets go to the tab's draft (with Undo on remove); **Publish** applies them and records a tab version, **Discard changes** drops them, and leaving edit mode keeps the draft with a note. Only a move or resize the person makes counts (the grid's own re-layout on load used to be saved too). Adding or editing a widget still saves through its own dialog, and widgets that were never put on a tab save at once as before. Migration `0134_dashboard_tab_drafts.sql`; `scripts/dashboard-drafts-smoke.ts` (7 checks). Widget menus now have a label ("<title> options").
- **The campaign composer has its own page** (deferred item): `/dashboard/marketing/campaigns/new` and `/dashboard/marketing/campaigns/<id>`, with Back to Campaigns and "Approval, test and launch" links; leaving with unsaved changes asks first. A new campaign gets its address on its first save without reloading, so you stay on the section you were in. The Marketing page's Composer tab is gone: New campaign opens the page, and a selected campaign has **Edit campaign**. The suppression form on Marketing used the composer's channel; it has its own channel picker now. Shared pieces moved to `components/marketing/campaign-shared.ts`; the composer is `components/marketing/campaign-composer.tsx`. Checked in the browser (save → own address → autosave; links).
- **Automation builder: a list of steps and "Add step after" from the keyboard** (deferred item). A **Steps** tab beside Designer and History lists the steps in the order they run (indented, with the branch that leads to each; unconnected steps last), each with Configure and "Add a step after"; choosing one centres it on the canvas. Pressing **A** with a step selected (on the canvas or in the list) opens "Add automation step" after it. Checked in the browser.
- **Task playbook usage** (deferred item). Each playbook in Settings › Automation › Task playbooks has **Usage**: how often it was applied (in total, in the last 30 days, by hand or by automation), when last, and the latest 20 applications with their record, who applied it and how many of its tasks are done (`GET /api/settings/task-playbooks/<id>/usage`, admins). On the way: a record's playbook history (`/api/task-playbooks/applications`) answered for any lead or opportunity id; it now needs access to the record. Edit and Delete there have labels. `scripts/playbook-usage-smoke.ts` (3 checks).
- **Lists written to jsonb columns** (the sweep the Step 0b notes asked for). A bare JS array is sent as a Postgres array literal, which errors or turns an empty list into `{}`. Found and fixed: metric filters, calculated-metric steps, select-field options (create and update) and the sales-group routing lists (territories, zip codes, states, countries, skills, languages, product lines); plus the API regression script's restore of payout settings. Everything else on the 40 list columns was already safe. `scripts/jsonb-lists-smoke.ts` (8 checks). Noticed, not changed: an automation's "update field" step writes the value as given, so setting a jsonb field on a task or activity to a list would hit the same problem.
- **The three largest screens are split into files, with no behaviour change** (the Risk note's "split first"; decided 2026-10-03). Reports: `_components/report-sections.tsx` (3,300 lines) became one file per section (`inbuilt-reports-section`, `custom-report-builder`, `custom-reports-section`, `metrics-section`, `calculated-metrics-section`, `report-schedules-section`, `report-annotations-section`, `data-catalog-section`, `segment-comparison-section`) plus `report-shared.tsx`; `report-sections.tsx` re-exports them, so imports are unchanged. Settings › Integrations (2,900 lines): the page's state and handlers moved verbatim into `use-integrations-settings.tsx`, each section's markup into `section-*.tsx`, helpers into `integrations-shared.tsx` and `template-approval-card.tsx`; `page.tsx` is 340 lines. Automation builder (3,050 lines): state and handlers into `use-automation-builder.tsx`, the side panel into `builder-sidebar.tsx`, the step dialogs into `step-settings-dialog.tsx` and `add-step-dialog.tsx`, constants and helpers into `builder-shared.tsx`; `page.tsx` is 250 lines. The code was moved, not rewritten (a line-by-line comparison shows only imports and wrappers changed), and each section is a component that reads the same state, so it keeps type checking. Checked with the type check, lint, unit tests and a browser pass over every report route, every Integrations section and the builder's panels and dialogs.
- Checked and not a problem: the module-off cases thought to return a 500 (call queues, knowledge base, dashboard tabs, score preview) all return a 403, through `serverError`.

- **Forms and automations: only the creator or an admin archives them** (decided 2026-10-03). Archive, restore and delete for good now need the person who created the form or automation, or a workspace admin (module levels still apply on top); the lists hide those actions from everyone else. Neither table recorded a creator, so migration `0135_form_automation_created_by.sql` adds `createdBy` and fills it from an automation's create audit entry or a form's first published version; items with no known creator are admin-only. `scripts/archive-owner-smoke.ts` (10 checks).

**Deferred:** nothing left (the last three were built 2026-10-03, below).

**Removed (decision 33; confirmed 2026-10-03):** three direct-export routes with no screen that skipped export rules, approval, audit and rate limits: `GET /api/forms/[id]/export`, `GET /api/payout-cycles/[id]/finance-export` and `GET /api/reports/custom/[id]/export`. The governed export queue covers all three. On the way, the governed form-submissions export turned out to write only the newest 100 submissions (the reader caps each call at 100); it now pages through all of them (`scripts/form-drafts-smoke.ts` checks 250).

**Risk:**
- The Settings and RoleGuard change and the `/dashboard/admin` redirects change **who can reach what**. Do them as separate, reviewed changes, with checks for each role.
- The custom-field editor merge must not change what is stored.
- Large-file refactors carry a high regression risk: split the files without behaviour changes first, then change the UI. (Done 2026-10-03 for Reports, Integrations and the automation builder; see above.)

---

## 8. Out of scope at first (not UI): verified and fixed 2026-10-03

> More findings from the 2026-10-01 deep dive are in §10.6 (#16–#21). #16 confirms item 1 below on the current code. #17 (a rep sees all activities) is new and high severity.

**Status 2026-10-03 (decision: verify and fix).** Every item was checked against the current code, and each confirmed bug or security gap was fixed with a test. The status is at the end of each row. #4 and #5, first only noted, were fixed later the same day, and so was #24, found while fixing #4.

| # | Observation | Where | Why it matters |
|---|---|---|---|
| 1 | **The lead's Activity History may show other leads' activities.** In the 2026-09-14 capture, "Test Lead" lists activities for "Diya Khan 0601", "Aarav Rao 1200", and so on. The page does request `filters=leadId equals …` (`leads/[id]/page.tsx:137-139`), so the API may be ignoring that filter shape. | `api/activities/route.ts`, timeline | Wrong data on a record; possible scope leak. **Check first.** · ✓ Fixed 2026-10-02 (§10.6 #16) |
| 2 | "Select all N" bulk actions act only on the current page while showing N (Opportunities assign/delete; Activities mark completed) | `opportunities/page.tsx:259-285`, `activities/page.tsx:177` | Users believe they changed N records · ✓ Fixed (verified 2026-10-03) |
| 3 | Inline lead status: no error message on failure; sends `name` with `status` | `leads/page.tsx:219-223`, `columns.tsx:52` | Silent data loss; overwrite risk · ✓ Fixed (verified 2026-10-03) |
| 4 | Lead detail fetches **all** opportunities and filters in the browser; Tasks fetches all tasks; Lists load 5,000 leads; Views load 500 rows | `leads/[id]/page.tsx:125`, `tasks/page.tsx:211`, `lists/[id]`, `views/page.tsx:83` | Performance and scalability · ✓ Fixed 2026-10-03. Lead detail and Tasks page on the server. A list's page now gets one page of leads at a time, and searches on the server, for both static and smart lists (`GET /api/lead-lists/[id]?page=&limit=&q=`); the old smart-list cut-off at 500 is gone, and adding leads no longer loads the whole list. Smart Views: task tabs filter on the server (the tasks API takes `?filters=` and `?strict=1`; "Due segment" still filters in the browser, page by page). Before, a task tab made one call that stopped at 500 rows without saying so. Payout tabs page through every cycle (`GET /api/payouts?page=`); they used to read only the newest cycle. Partner and report tabs still load whole, which is complete and small. Tests: `scripts/lead-list-paging-smoke.ts`, `scripts/smart-view-tasks-payouts-smoke.ts`. |
| 5 | Opportunity bulk delete sends one DELETE per record in parallel | `opportunities/page.tsx:248` | Partial failures, rate limits · ✓ Fixed 2026-10-03. `DELETE /api/opportunities/bulk` with `{ ids }` (as `/api/leads/bulk` does; at most 1,000 per request, the page sends batches) deletes them in one statement with the usual record access. Ids that are gone or not visible come back as "Not found". An opportunity still linked to tasks, notes or commission entries is reported with that reason while the rest are deleted. A single delete of such an opportunity is now a 409 with that message, not a 500. Deleting one that is already gone is a 404. Test: `scripts/opportunity-bulk-delete-smoke.ts`. |
| 6 | Two-factor enrolment: dismissing the backup-codes step leaves the status stale and codes lost | `settings/mfa/page.tsx:94,355` | Users think 2FA is off · ✓ Fixed 2026-10-03 (`components/account/two-factor-section.tsx`). The status refreshes as soon as enrolment is confirmed. Esc, an outside click or X on the backup-codes step now asks first ("Keep codes open" / "Close without saving"), and "New backup codes" does the same. After an action, the section refreshes in place, so the dialog stays open. |
| 7 | `/dashboard/admin/*` pages render without the Tenant Admin guard on screen. The APIs probably enforce access, but this needs confirming. | `app/dashboard/admin/**` (no layout) | Access control · ✓ Fixed (verified 2026-10-03) |
| 8 | Login rejects passwords under 6 characters in the browser; three different password rules; no self-service reset flow | `login/page.tsx:22`, reset-password, bootstrap | Policy consistency · ✓ Fixed 2026-10-03. Sign-in, the reset link and My account already used the workspace rule. Now Invite user, Add partner and Add partner login also list it and check it as you type (`usePasswordRuleResolver`), and the 6-character minimum and its "Min. 6 characters" placeholder are gone. Partner logins now pass the rule on the server too; they had skipped it (`PASSWORD_POLICY` → 400, `scripts/partner-password-smoke.ts`). Self-service reset exists (forgot password). Bootstrap (the first platform admin, before any workspace exists) keeps its fixed 8-character minimum. |
| 9 | Report "Export Data" queues an export with no filters; the overview chart sizes bars by count but labels them as value | `reports/page.tsx:117,173` | Wrong numbers · ✓ Fixed (verified 2026-10-03). The button is now "Export report list", because it exports the list of reports, not one report's data. |
| 10 | Feature flags and modules are two overlapping on/off systems (the tenant page itself says so) | `platform-admin/tenants/[id]/page.tsx:604` | Admin confusion; product decision · ✓ Fixed (verified 2026-10-03) |
| 11 | Forms have two public URL schemes | `forms/page.tsx:117` vs `forms/[formId]/page.tsx:78` | Broken shared links if one is retired · ✓ Verified 2026-10-03: both URLs still work; the code comment in `lib/forms/public-url.ts` now says so |
| 12 | Tenant suspension reason hard-coded as "Admin Action" | `platform-admin/tenants/page.tsx:52` | Audit quality · ✓ Fixed 2026-10-03. Suspending a workspace (from the tenants list or the tenant page) asks for a reason; unsuspending takes an optional note. The API refuses a suspension with no reason. Both write `TENANT_SUSPENDED` / `TENANT_REACTIVATED` to that workspace's audit log, with who and why. When approval is required, the reason goes on the request and is logged with the approver. An unknown workspace is a 404, not a silent success. Tests: `scripts/tenant-suspend-audit-smoke.ts`, `tests/privileged-actions.test.ts`. |
| 13 | Opportunities whose stage isn't in the type's stage list disappear from the board | `kanban-board.tsx:44-50` | Hidden records · ✓ Fixed 2026-10-03: a "No matching stage" column shows them; dropping a card onto another card only moves it to a real stage |
| 14 | Server-side sorting and full-text search support per list endpoint needs checking before the UI exposes them | `/api/leads`, `/api/opportunities`, `/api/activities`, `/api/tasks` | Prerequisite for Phase 2 · ✓ Verified 2026-10-03; Tasks had no server sort, added (title, due, priority, status, owner) |
| 15 | Applications pages are minified single-line JSX | `app/dashboard/applications/**` | Maintainability · ✓ Fixed (verified 2026-10-03) |
| 22 | Public form custom CSS is injected as-is with `dangerouslySetInnerHTML` | `components/forms/public-form-renderer.tsx:265` | Verify that it can't break out of the `<style>` tag on the server-rendered page; sanitise it (§12.4 G7) · ✓ Hardened 2026-10-03. The form's config loads in the browser, so the CSS was never in server-rendered HTML. As well, `<` is now written as its CSS escape (`lib/forms/custom-css.ts`), so the CSS can't close the tag in any case. `@import` and `url()` are still allowed; only form editors can set the CSS. |
| 23 | GDPR request download uses a raw `/api${filePath}` link instead of the download endpoint | `settings/governance/gdpr/page.tsx:152` | It may fail or bypass checks (§12.1 W4) · ✓ Fixed (verified 2026-10-03) |
| 24 | **Campaign and journey audiences were cut off without saying so** (found 2026-10-03 while fixing #4). A smart-list audience read at most 500 leads, a saved-view audience at most 1,000, and any audience at most 5,000. The campaign queued only those and showed "Completed". Journeys ran their automation for only the first 500 newly enrolled records (the rest were marked enrolled and never messaged), and call campaigns added at most 500/1,000/5,000 members. | `marketing-communications.ts`, `marketing-journeys.ts`, `call-campaigns.ts`, `automations-postgres.ts` `enrollRecordsInAutomation` | Some recipients silently never got the campaign · ✓ Fixed 2026-10-03 (decision: reach everyone). Audiences are read in lead-id order a batch at a time (`listLeadAudiencePageForTenant`, `listOpportunityAudienceIdsForTenant`), with the same record access and filters. A campaign launch queues what fits in the request (about 20 s), saves its progress in `MarketingCampaign."launchState"` (migration 0136), and the new worker job `marketing.continueCampaignLaunches` carries on as the person who launched until it shows Completed. One run at a time (a lease), nobody queued twice, and it stops if the campaign is paused or cancelled. Journey enrolment works the same way: batches of 200, everyone already enrolled skipped in bulk, the automation run for every new record. A run that runs out of time is marked `enrollmentPending` and the journey worker finishes it as the same person. Call campaigns add every member, a batch at a time. Manual "enrol records" now refuses more than 500 instead of dropping the rest. Test: `scripts/audience-batches-smoke.ts` (650-lead audiences). |

---

## 9. Decisions (answered 2026-10-01)

These answers replace the earlier open questions and override the matching proposals above wherever they differ.

| # | Topic | Decision | Effect on the plan |
|---|---|---|---|
| 1 | Brand colour | Keep forest green (`#1b6c31`) as the default, with ocean, sunset and grape as user palettes | Status and chart tokens are defined for all four palettes, in light and dark (Phase 1) |
| 2 | Logo | **You will provide an SVG logo** (full logo plus a square mark) | Phase 1: wire it into the sidebar, collapsed rail, login, mobile header and favicon. Until the file arrives, the "U" tile stays. · ✓ Done 2026-10-03. The logo (an arrow rising out of a U, plus the wordmark in Figtree 800 as outlines) was rebuilt as clean vectors from the generated design. It is in the menu (the full logo; the mark when collapsed, which turns into the expand arrow on hover), the phone header, sign-in, forgot password, reset password, the 404 and error pages, the password-reset email, the favicon (16/32/48), the app and Apple icons, the web app manifest and the link-share image. Its colours follow light and dark mode (`--brand-mark`, `--brand-ink`) and stay the same in every palette. Files and usage: `public/brand/README.md`; component: `components/brand/brand-logo.tsx`. |
| 3 | Font | Keep the system font stack; add tabular numbers | As in §3.3 |
| 4 | Currency | A tenant setting (Settings → General → Localization), **default ₹ INR** with Indian grouping (`₹1,10,000`) | Phase 1 adds the formatter; Phase 2 applies it to Opportunities, kanban, reports, payouts and points (removing the hard-coded `$` and `₹`) |
| 5 | Leads list defaults | 25 rows per page; columns Name (company underneath), Phone (click to call), Status, Owner, Last activity, Next task, Score, Source; users' saved column choices are kept | Phase 2, Leads |
| 6 | Lead statuses | **Tenant-configurable now.** Each status has a label, colour (status tone) and order, and belongs to a **category: Open, Converted or Lost** (Lost includes disqualified) | **New scope in Phase 2 (L):** a Settings page for lead statuses; data migration: NEW/CONTACTED/QUALIFIED → Open, CONVERTED → Converted, LOST → Lost, existing custom values (for example "Hot", "Cold", "Test") → Open until an admin changes them. Everything that tests "closed" (retention, Next-Best Action, call queues, reports, inline status and filters, Smart Views) switches to the **category** instead of hard-coded names. A backend and data change: needs real-database tests and a careful migration (see §7 risks). |
| 7 | Record quick actions | **Log call** (or **Log activity** when Telephony is off) · Add note · Add task · Status/Stage ▾ · Owner ▾; everything else in "…" | Phase 2, Lead and Opportunity detail |
| 8 | Personal settings | Create **My account** (`/dashboard/account`: Profile, Password, Two-factor, Sessions, Appearance, Notifications) for every user, and **hide Settings from non-admins** | Phase 3 as planned (an access-control change, reviewed separately) |
| 9 | `/dashboard/admin/*` | Redirect the 14 duplicates to `/dashboard/settings/*`; move plans, rate limits and usage to Platform admin with menu entries; remove the duplicate tenants page | Phase 3 |
| 10 | Mobile | Reps use phones a lot: **include in Phase 2** | Phase 2: mobile cards with paging for every list, sticky bottom action bar on record pages (Call · Log · Note · More), timeline first, tap to call and WhatsApp |
| 11 | Phase 2 order | Search → Leads → Lead detail → Opportunities → Tasks → Activities → Dashboard | As listed |
| 12 | Dead components | Delete the 6 unused components in Phase 3 after a final importer check | Phase 3 clean-up |
| 13 | Public form link | **`/f/{slug}`** is official; `/public-form/{id}` keeps working and redirects | Phase 3, Forms |
| 14 | Timeline data bug (§8 item 1) | **Investigate and fix**, with a real-database test, **before the UI phases** | Step 0, before Phase 1 (below) |
| 15 | Feature flags vs Modules | **Merge into Modules.** The overlapping flags (Opportunities, Automations, Forms, Advanced reporting, Payouts, Gamification) are retired; their current values move into module entitlements so nothing turns off. Feature flags keep only non-module items such as API access. | **New backend scope (M–L), Phase 3:** data migration plus removing the double checks. Needs real-database tests and a platform-admin UI update. |
| 16 | Forgot password | **Self-service email reset:** a "Forgot password?" link that sends a time-limited link by email, rate-limited, with the same reply whether or not the email exists | **New backend scope (M), Phase 3:** needs a working email provider per deployment; uses the existing reset-password page |
| 17 | Owner change reason | Optional when changing one record; **required for bulk** reassignment | Phase 2, RecordHeader owner picker and SelectionBar |
| 18 | Dashboard | A **"My day"** default view for everyone (overdue and today's tasks, follow-ups, new leads assigned to me, my pipeline); existing custom dashboards stay as tabs; layout tools only in "Edit dashboard" mode | Phase 2, Dashboard |
| 19 | Surfaces | **Neutral surfaces, green as accent only.** Page `#F6F7F9`, cards and tables `#FFFFFF`, borders `#E4E7EC`, text `#101828` / `#475467`. Forest `#1b6c31` only for primary buttons, links, focus and selection. Ocean, sunset and grape work the same way (accent only). | Phase 1 tokens (§10.3); affects every screen. Visual change only, no logic. |
| 20 | List density | Rows **40px by default**, **32px compact** option (about 16 rows visible at 1440×900, up from 10) | Phase 1 DataTable; replaces today's 46px/36px |
| 21 | AI in lists | **One compact Score column** (number plus a small band dot; band, likelihood and confidence in a tooltip). Next Best Action hidden by default (column chooser) and shown on the record page. | Phase 2, Leads and Opportunities |
| 22 | Settings shell | **Keep both menus, but collapse the main sidebar to the 64px icon rail inside Settings** | Phase 3 (or Phase 1 shell work) |
| 23 | Record layout | **Keep the current layout (summary column plus tabs) and simplify it**: no green identity card, no duplicates, fewer boxes (§10.5) | Phase 2, Lead and Opportunity detail |
| 24 | Navigation | **Quiet style:** active item has a light grey background, a 2px green left bar and medium-weight text; group titles are 12px grey sentence case; groups stay collapsible; pinned items on top | Phase 1 shell |
| 25 | Badges | **Tinted pills, sentence case** (no uppercase, no letter-spacing), using the new status tones; a dropdown chevron only on an editable status | Phase 1 StatusBadge |
| 26 | Screenshot method | Temporary audit users in the local demo tenant, deleted afterwards (done 2026-10-01: 0 remaining) | Evidence for §10 |
| 27 | Main navigation | **5 task groups plus Settings:** My work (Dashboard, Tasks, Activities, Approvals) · Sales (Leads, Opportunities, Applications, Lists, Views) · Service (Cases, Call center) · Marketing & automation (Campaigns, Forms, Automations) · Insights (Reports, Leaderboard with My points, Payouts). Exports move into each list's Export menu. | Phase 2 shell (§11.5) |
| 28 | Settings structure | **New groups and new URLs, old URLs redirect;** duplicates merged; Integrations split into separate pages; every section deep-linkable | Phase 3 (§11.5) |
| 29 | Builder save model | **Draft autosave, explicit Publish, versions;** undo and redo; new items start as Draft | Phase 3, automation and form builders, plus the report builder, campaign composer and dashboard edit mode (§11.6 E) |
| 30 | Reports structure | **Library → Viewer → Builder,** each with its own URL; Overview KPIs move to the Dashboard; Compare becomes standard reports; admin tools move to Settings › Analytics | Phase 3 (§11.5) |
| 31 | Delete model | **Archive with Undo; restore for 30 days; then purge.** Records keep today's soft delete. Irreversible actions need typed confirmation with counts. | Phase 1 dialogs and toasts; archive storage is backend scope in Phase 3 (§11.6 D) |
| 32 | Finance work | **A new Payouts workspace** in the main navigation (To approve, On hold, Disputes, Invoices, Redemptions); Settings keeps only the rules | Phase 3 (§11.5) |
| 33 | Back-end features with no screen | **Add UI where each belongs,** in the phase that rebuilds that screen (§12.3). Anything not worth a UI is listed for removal after you confirm. | Phases 2–3 |
| 34 | Pipeline stage editor | **Moving records first is required:** deleting a stage asks where to move its N opportunities (stage history recorded), then archives it. Won/Lost stages can't be removed while in use. At least one open, one Won and one Lost stage must remain. | Phase 3, including the missing back end (§12.4 G6) |
| 35 | Plans and billing | **Remove** the broken hidden Plans page and the "Revenue: Unavailable" tile; billing becomes a separate project later | Phase 3 (§12.4 G8) |

### Updated sequence

0. **Step 0: activity scoping bugs.**
   - The lead timeline shows other leads' activities (§8 #1, confirmed in §10.6 #16).
   - A rep with own-records access sees every activity (§10.6 #17).
   - Find the shared cause, fix it, and add real-database tests for both the record filter and the record-access scope.
   - Together with step 0b, this is the only work before Phase 1.
   - **Done 2026-10-02.**
     - **Causes:**
       - The lead and opportunity timelines and the record preview send one filter group as an object, and the filter builder silently ignored anything that wasn't an array. That is why every activity in the tenant came back.
       - Activities had no record-access rule.
       - Global search had no record-access rule for any record type and included merged records.
     - **Rules (confirmed 2026-10-02):**
       - Own/Team users see an activity only if its linked lead or opportunity is visible to them (owned, on their team, or shared with them).
       - Unlinked activities are visible only to "All records" roles.
       - Own/Team users must link an activity, when they create or edit it, to a lead or opportunity they can see. An edit outside their access returns "not found".
       - Global search applies the same access to leads, opportunities, activities and tasks, leaves out merged records, and shows partners only to admins.
     - **Changes:**
       - The filter builder accepts a single group, which also fixes the same silent drop for leads and opportunities.
       - Activity access: `applyActivityScopeClause` and `assertActivityLinksAllowed` in `activities-postgres.ts`.
       - Global search: `searchTenantData` in `crm.ts`.
       - API errors: 400 when the filters aren't valid JSON, or when an Own/Team user leaves out the link; 404 for a record they can't access.
       - Activity form: for Own/Team users, an inline error ("Choose the lead or opportunity this activity is for") and a hint; label `htmlFor`s; the save button no longer reads "Save undefined".
     - **Tests:**
       - `scripts/activity-scope-smoke.ts` (real database, 30 checks).
       - Updated `tests/global-search.test.ts`.
       - Browser check on Demo University with temporary users, deleted afterwards. The lead timeline returns only that lead's activities, a counselor sees no other rep's activities or leads in search, and the form blocks an unlinked save without sending a request.
0b. **Step 0b: safety-critical behaviour fixes** B1–B16 (§11.3). These silently lose data, send messages, or change the wrong records.
   - **Done 2026-10-02.** See §11.3, "Step 0b results".
1. **Phase 1:** tokens (including currency formatting and the status category model), shared components, DataTable upgrade, logo once the SVG is provided.
   - **Done 2026-10-02**; the logo was added on 2026-10-03 (decision 2). See "Phase 1 results" in §7.
2. **Phase 2:** Search → Leads (including **configurable lead statuses**) → Lead detail → Opportunities → Tasks → Activities → Dashboard ("My day"), including mobile layouts.
   - **Done 2026-10-02**; see "Phase 2 results" in §7.
3. **Phase 3:**
   - Settings and My account;
   - admin redirects;
   - flags-into-modules merge;
   - self-service password reset;
   - remaining screens;
   - clean-up.

Changes that touch data or access, which are reviewed and tested separately:
- configurable lead statuses (6);
- My account and Settings visibility (8);
- admin redirects (9);
- flags-into-modules merge (15);
- password reset (16).

No code changes start until you say "approved" and name the step or phase.

---

## 10. Enterprise-polish deep dive (2026-10-01)

**Request:** "the UI seems too cluttered and not enterprise level."

**Method:**
- **Real data:** two temporary users in the local *Demo University* tenant (1,202 leads, 1,200 opportunities, 2,401 activities). One was an admin ("Demo CRM Administrator"); one was a rep ("Admissions Counselor", own records only). Both were deleted afterwards.
- **Current code:** a separate copy of the current code ran from the scratch folder. No repo code was changed.
- **Coverage:** 25 screens at 1440×900, plus the core screens at 390px.
- **Measurement:** each screen was measured in the browser (bordered elements, badges, uppercase text runs, font sizes, buttons above the fold).
- **Code:** the cause of each problem was traced to the component that produces it.
- **Skill guidance:** the ui-ux-pro-max skill's recommendation for "CRM & Client Management" is Flat Design + Minimalism / Swiss style with a data-dense dashboard pattern: neutral surfaces, colour reserved for status and actions, sticky headers, 12–14px dense type.

### 10.1 What makes it feel cluttered (measured)

| Screen | Page height | Bordered elements | Badges | Uppercase text runs | Font sizes in use | Buttons above the fold |
|---|---|---|---|---|---|---|
| Lead detail | **11,473px** | **1,683** | **181** | **1,185** | **8** (9.6, 10.4, 10.9, 12, 13.1, 14, 16, 18px) | 19 |
| Opportunity detail | 11,921px | 1,694 | 184 | 1,195 | 8 | 19 |
| Opportunities list | 1,834px | 134 | 94 | 81 | 3 | 47 |
| Leads list | 917px | 114 | 61 | 16 | 4 | **56** |
| Activities | 1,936px | 148 | 60 | 61 | 5 (incl. 10px, 11.2px) | 25 |
| Users (settings) | 1,759px | 66 | 38 | 24 | 4 | 35 |
| Roles (settings) | 1,961px | 66 | 49 | 12 | 5 (incl. 11px) | 13 |
| Modules (settings) | 1,789px | 72 | 42 | 0 | 5 (incl. 10.4px) | 6 |

**Across the code:**
- 312 `<Badge>`;
- 217 `<Card>` (up to 14 on one page: Integrations; Reports 13; Case detail 9);
- 251 `rounded-xl/2xl`;
- 121 `uppercase` and 33 wide letter-spacing classes;
- 342 `font-bold` and 138 `font-extrabold`;
- 39 `border-dashed`;
- 39 `shadow-*`.

### 10.2 Root causes: each shared pattern, its file, and the fix

| # | Pattern seen on screen | Source | Fix |
|---|---|---|---|
| C1 | Everything tinted green: page, cards, table, muted fills, nav, links, headings, buttons. No hierarchy between layers (page `#f7fbf2` vs card `#f1f4f0` is almost the same colour). | `src/app/globals.css:9-67` (surface tokens) | Neutral surfaces (§10.3); green only for actions and selection |
| C2 | Uppercase, tracked, bold table headers on every table | `components/ui/table.tsx:73` | `text-xs font-medium text-muted-foreground`, sentence case |
| C3 | Status as a bold uppercase pill with a chevron (looks like a button) | `app/dashboard/leads/columns.tsx:62` | StatusBadge tinted pill, sentence case; chevron only when hovered or focused for editing |
| C4 | "RISK 77% · 100% conf." badge on every row; RISK in amber next to a 77% score reads as a contradiction | `components/scoring/predictive-score.tsx:16-47` | Score column "● 77" with the details in a tooltip (decision 21) |
| C5 | Avatar with an initial on every row (all "A" or "U"), adding visual noise without information | `leads/columns.tsx`, users table, opportunity forms | Remove in lists; keep only where a real photo or owner identity matters (the Owner column) |
| C6 | A separate toolbar row about 48px tall holding only density and column icons | `components/ui/data-table.tsx` toolbar | Move into the ListToolbar row (right side) |
| C7 | Count-chip walls (Leads 6 chips; Opportunities **17 chips in 3 rows**, duplicated per type) | `LeadStatusChips`, `OpportunityStageChips` in `leads/page.tsx:41-63`, `opportunities/page.tsx:72-94` | One quiet "Status" summary inside the toolbar as filter chips (counts, merged by name), or a stacked stage bar |
| C8 | Navigation: filled dark-green active pill, bold uppercase green group titles, 7 groups, two items with the same icon (Opportunities and Applications both use a briefcase) | `components/layout/NavigationDrawer.tsx:172-189, 234` | Quiet navigation (decision 24); unique icons |
| C9 | Header: availability pill ("Offline") shown to every user; the identity is the email prefix truncated (`ui-audit-admin-ddc2…`); a keyboard icon; a large green-tinted search box | `components/layout/header.tsx:90-181` | Availability only for telephony agents; avatar with name and role in the menu; search as a neutral input; shortcuts in the help menu |
| C10 | Lead detail identity card is a **solid green gradient** (`bg-gradient-to-b from-primary/95 to-primary/90`) with an italic raw status | `app/dashboard/leads/[id]/page.tsx:345-356` | Neutral card: name, status pill, contact rows; no gradient (decision 23) |
| C11 | Every fact in its own bordered box (Score, Last touch, Open value…); 6 cards stacked; "Activity filters" in a card of its own | `leads/[id]/page.tsx:344-408`, `components/detail-shell/*` | One properties panel with dividers (label/value rows); filters as chips above the timeline |
| C12 | Timeline: each item is a bordered card with 2–3 badges, raw values (`NO_ANSWER`, `not-attempted`, `BREACHED`), a date chip, an expand button; 100 items rendered | `components/timeline/timeline.tsx:132-322` | Compact list rows with a 1px divider; type icon plus one-line summary; outcome as plain text; SLA as an icon with tooltip; grouped by day; "Load older" |
| C13 | Workspace tabs: the active tab is a solid green filled pill with extra-bold text; tabs wrap to 2 rows | `components/detail-shell/workspace-tabs.tsx:34` | Underline tabs (2px green indicator, medium-weight text), one row with scroll |
| C14 | Tiny text: 9.6–11.2px in timeline, tasks, score labels, opportunity types | `text-[0.6rem]`, `text-[0.65rem]`, `text-[0.68rem]` (140 uses; e.g. `timeline.tsx:216,224`, `predictive-score.tsx:265`, `tasks/page.tsx:73,80`) | Minimum 12px (§3.3) |
| C15 | KPI tiles about 230px tall for one number (Reports), and zero-value tiles in colour (Tasks "Overdue 0" in red, "Completed 0" in green) | `reports/page.tsx` Overview, `tasks/page.tsx:536-549`, `marketing/page.tsx` | Compact 72–88px stat strip; colour only when the value needs attention (overdue > 0) |
| C16 | Disabled buttons on view before anything is selected (Marketing: Test, Request approval, Approve, Launch, Pause) | `marketing/page.tsx` Campaign actions | Show actions only once a campaign is selected, inside its detail panel |
| C17 | Boxes in boxes (card → bordered sub-card → bordered section); dashed borders for empty states | Marketing, Integrations (14 cards), Reports (13), Case detail (9), AI assistant (8); 39 `border-dashed` | One container level per region; empty states without a dashed frame |
| C18 | Too many heavy weights (342 `font-bold`, 138 `font-extrabold`); bold green links in every row | Many files; `leads/columns.tsx` name link | 600 for titles only; record names in table cells 500 weight, default text colour, underline on hover |
| C19 | Roles page: one large card per role holding a wall of about 10 coloured permission badges; the red delete icon always visible | `app/dashboard/admin/roles/page.tsx` (used by Settings → Roles) | A roles table (Role, Users, Record access, Last changed); permissions in the role editor matrix; delete in the "…" menu |
| C20 | Settings: two full menus (240px + 224px) take about 480px before any content | `app/dashboard/settings/layout.tsx`, `dashboard-layout.tsx` | Main sidebar collapses to the 64px rail inside Settings (decision 22) |
| C21 | A new user's dashboard is an empty "Welcome… Initialize Default Dashboard" card | `components/dashboard/dashboard-manager.tsx:399-410` | "My day" default (decision 18), so it is never empty |

### 10.3 Neutral surface tokens (decision 19): values to use

All pairs were checked for contrast (WCAG AA). Status tokens (§3.2) stay as they are. The green primary is unchanged.

| Token | Light | Dark | Use | Contrast |
|---|---|---|---|---|
| `--background` (page) | `#F6F7F9` | `#0C111D` | App background | text 16.6:1 / 17.3:1 |
| `--card` / `--popover` | `#FFFFFF` | `#161B26` | Cards, tables, panels, menus | text 17.8:1 / 15.8:1 |
| `--foreground` | `#101828` | `#F5F5F6` | Main text | — |
| `--muted-foreground` | `#475467` | `#94969C` | Secondary text, metadata | 7.7:1 / 5.8:1 |
| `--subtle-foreground` (new) | `#667085` | `#85888E` | Placeholders, hints | 5.0:1 (light) |
| `--border` (subtle) | `#E4E7EC` | `#1F242F` | Card and table dividers (decorative) | — |
| `--input` (control border) | `#7F8A9C` | `#6C707A` | Input, select and checkbox borders (3:1 required, on the page and on cards) | 3.3:1 page, 3.5:1 card / 3.5:1 |
| `--muted` (fill) | `#F2F4F7` | `#1F242F` | Hover rows, active nav, segmented control | text 16.1:1 |
| `--selected` (new) | `#EEF6EF` (light green tint) | `#13261A` | Selected rows, selected filter chips | text 16.1:1 |
| `--primary` / on | `#1b6c31` / `#FFFFFF` | `#88d891` / `#003915` | Primary button, links, focus ring, active indicators | 6.5:1 / 7.7:1 |
| `--sidebar` (new) | `#FFFFFF` with a `#E4E7EC` right border | `#0C111D` | Navigation | — |

- **Other palettes:** ocean, sunset and grape keep their own `--primary` and use the same neutral surfaces.
- **Contrast check:** `scripts/ui-theme-token-contrast.py` must be updated with these pairs and kept passing for all palettes, in light and dark.
- **Shadows:** cards have none; menus and popovers `0 4px 12px rgba(16,24,40,.08)`; dialogs `0 12px 32px rgba(16,24,40,.16)`.

### 10.4 Enterprise rules: the clutter budget for every screen

1. **One accent.** Green appears only on the primary action, links, focus, selection and the active nav bar. Headings, group titles, counts and icons are neutral.
2. **One container level per region.** No card inside a card. Prefer dividers to borders and borders to shadows. No dashed frames.
3. **Type scale only.** Sizes are 12/14/16/18/24px and weights 400/500/600. **No uppercase** except abbreviations. No letter-spacing tricks.
4. **Badges carry status, not decoration.** At most one status badge and one priority indicator per table row. Metadata such as source, type or "100% conf." is plain text.
5. **Header budget.** A page header has a title, an optional one-line description, **one** primary button, at most two secondary buttons, then "…".
6. **Toolbar in one row.** Search, quick filters, filter chips, saved view, density and columns, Export. No separate icon row.
7. **Colour on values only when they need attention.** Zero is never red or green.
8. **No raw values.** Enums, IDs and email prefixes are mapped to labels.
9. **Show actions when they apply.** No walls of disabled buttons; contextual actions appear on selection.
10. **Density.** List rows 40px (32px compact); form fields 40px; section gap 24px; card padding 16px (24px on settings forms).

These rules become part of the doc 27 design gate. Every Phase 2 and 3 screen is checked against them, with the browser metrics from §10.1 re-measured. Targets for the core screens:
- uppercase text runs: 0 (except abbreviations);
- font sizes in use: 5 or fewer;
- no text under 12px;
- lead detail initial render: 3,000px tall or less (timeline paging);
- badges per list row: 2 or fewer.

### 10.5 Record page simplification (decision 23: keep the layout, simplify it)

- **Header:**
  - Back · Name · status pill · owner.
  - Quick-action bar (decision 7) on the right.
  - It stays sticky with an **opaque** background. Today, when scrolled, the timeline shows through behind the sticky header (screenshot `lead-detail-scrolled-1440`).
- **Left column (280px), as one neutral card with sections separated by dividers:**
  1. Contact (email, phone with call and WhatsApp, company, source);
  2. Key facts (score, last touch, open value) as label/value rows;
  3. Properties (collapsible);
  4. Next best action (collapsible).

  The green gradient card, the separate metric boxes and the "Quick snapshot" duplication are removed.
- **Right side, tabs (underline style):** Activity · Details · Opportunities (n) · Tasks (n) · Communications · Scoring · History.
  - Notes move into the Activity composer.
  - "Activity filters" becomes a chip row (All, Calls, WhatsApp, Email, Notes, Tasks) plus a date menu, with no card.
- **Timeline:**
  - compact divided rows grouped by day;
  - 25 items, then "Load older";
  - outcome and SLA as text or icon;
  - a "Lead / Opportunity" context line shown only when the item belongs to a different record. That should never happen on a lead's own timeline; see §8 #1, now confirmed.

### 10.6 New findings from the deep dive (not UI; added to §8)

| # | Finding | Evidence | Severity |
|---|---|---|---|
| 16 | **Confirmed on current code:** a lead's Activity History shows other leads' activities ("Test Lead" lists items for Kabir Das 0660, Aarav Rao 0720, …) | Screenshots `lead-1440`, `lead-detail-scrolled-1440`; request at `leads/[id]/page.tsx:137-139` | **High** (Step 0) · ✓ Fixed 2026-10-02 |
| 17 | **A rep with "own records" access sees all 2,401 activities** on the Activities page (a brand-new Admissions Counselor who owns nothing) | Rep screenshot of Activities: "1–25 of 2401" | **High**, likely the same scoping cause as #16. Investigate together in Step 0. · ✓ Fixed 2026-10-02 |
| 18 | Navigating at a normal pace (one page every 3–4s) triggers **HTTP 429 rate limiting**, because every page re-fetches shell data: `/api/settings/personalization` (41×), `/api/metadata/objects` (28×), `/api/agent-availability/me` (26×), `/api/settings/general` (14×) during one pass | Capture log | High for experience: errors appear as "Something went wrong" (Cases). Cache shell data per session, deduplicate requests, and review the per-user rate-limit budget. · ✓ Fixed (verified 2026-10-03). The last duplicate, the menu fetching personalization again for pinned items, was removed 2026-10-03. The menu now reads `useCachedPersonalization()` and updates as soon as pins change in Preferences. |
| 19 | The Payouts page calls partner-only endpoints for an admin (`/api/partners/me/*` → 403 ×5) | Capture log | Medium: wasted requests; the page should branch by role before fetching · ✓ Fixed (verified 2026-10-03) |
| 20 | A new user's dashboard is empty until they click "Initialize Default Dashboard" | Admin and rep screenshots | Medium: covered by "My day" (decision 18) · ✓ Fixed (verified 2026-10-03) |
| 21 | The local demo tenant contains leftover test users from earlier test runs (`UI Scope owner-a/b`, `UI Acceptance …`) | Settings → Users | Low, local data hygiene: clean up separately; not part of the UI work · ✓ Cleaned up 2026-10-03. The 5 inactive `ui-scope-*`/`ui-role-*@example.invalid` users and their sessions were deleted from the local database; the UI Acceptance users were already gone. |

### 10.7 Changes to the phases

- **Phase 1** now starts with the **neutral surface token switch** (§10.3), the quiet navigation (decision 24), table header and badge restyle (C2, C3; decision 25), 40/32px density (decision 20), the opaque sticky header, and the one-row toolbar (C6). These are shared-file changes with the largest visible effect for little effort:
  - `globals.css`
  - `ui/table.tsx`
  - `ui/badge.tsx`
  - `NavigationDrawer.tsx`
  - `header.tsx`
  - `data-table.tsx`
  - `workspace-tabs.tsx`

  **Risk:** low for logic, high for visual regressions. Re-run the screenshot and contrast checks in all palettes, light and dark, and compare before and after images of the 25 screens.
- **Phase 2** adds the record simplification (§10.5), the score column (decision 21), the chip-wall replacement (C7), the compact timeline (C12), the stat strip (C15), and row avatar removal (C5).
- **Phase 3** adds the Roles table (C19), the Settings icon-rail shell (decision 22), contextual actions on Marketing (C16), the remaining box-in-box clean-up (C17), and the weight and size sweep (C14, C18).

---

## 11. Complete UI review: every page, action, dialog, table and editor (2026-10-01)

**Request:** check pages, button actions, modals, views, tables, sections, editors and every piece of UI, so the whole app is intuitive, simple to navigate, uncluttered and enterprise level.

**Detail:** every file is covered in **[UI_UX_FINDINGS_BY_FILE.md](UI_UX_FINDINGS_BY_FILE.md)**, about 2,000 findings, each with rule, severity, line and fix. Its index lists all 292 files and which partition reviewed each one. This section is the synthesis: what to fix first, the navigation, and the standard patterns every screen will follow.

### 11.1 Coverage

| Partition | Area | Files |
|---|---|---|
| P1 | App shell and shared components | 74 |
| P2 | Core sales: leads, opportunities, activities, tasks, lists, views | 46 |
| P3 | Dashboard, reports, marketing | 10 |
| P4 | Builders: automations, forms | 19 |
| P5 | Service, platform admin, public and auth | 48 |
| P6 | Settings | 63 |
| P7 | Admin configuration pages (shown inside Settings) | 32 |
| **Total** | | **292 files · 73,855 lines** |

The files contain:

| Element | Count |
|---|---|
| Dialogs | 126 |
| Side panels (sheets) | 7 |
| Popovers | 8 |
| Menus | 31 |
| Tables | 47 |
| Tab or section sets | 33 |
| Buttons | 1,024 |
| Form controls | 1,000 |

Every file was read in full. Reviewer proposals that conflict with decisions 1–32 (§9) are overridden by the decisions.

### 11.2 Headline findings

**1. Actions with real consequences are under-protected.** The partitions list about 280 destructive or high-impact actions:
- the code makes 71 browser `confirm()` calls and 25 `window.prompt()` calls, and **4 of the prompts still run the action when you press Cancel** (Publish and Deprecate, on dashboards and reports);
- **more than 150 have no confirmation at all**;
- only about 10 use a proper in-app dialog: API-key revoke, MFA disable, retention enforce, invoice cancel-and-reissue, and module status change.

Two of the unconfirmed actions **send messages to customers**: campaign "Launch" and journey "Enroll audience now".

**2. Several behaviours silently lose or change data.** These are listed in §11.3 and are fixed before the visual phases.

**3. Navigation is spread across too many places:**
- 10 navigation groups;
- 39 settings pages that overlap: three custom-field editors, two duplicate-management pages, roles vs permission templates;
- a 2,700-line Integrations page;
- a 3,245-line Reports page with 9 tabs;
- no URL state for tabs anywhere;
- unreachable pages: platform tenant detail, an agent's call campaign, reset password;
- links to a missing Custom Objects route.

**4. Daily rep work takes too many clicks** (§11.4). Logging an activity takes 7 clicks and ends on a button labelled "Save undefined". Owner can't be changed on the record at all.

**5. Visual noise comes from shared defaults:**
- Badge used for any value (278 uses);
- tinted cards nested inside cards;
- uppercase table headers on every table;
- `font-extrabold` everywhere;
- text under 12px in about 140 places;
- raw enum values in about 40 places on Reports and Marketing alone.

The fixes are in Phase 1 (§10.7).

### 11.3 Safety-critical behaviour fixes (new step 0b, before Phase 1)

These are behaviour bugs found by the UI review, not style issues. Each needs a test that reproduces it before the fix. Step 0 (activity scoping, §10.6 #16–17) stays first.

| # | Problem | Where | Effect today | Fix |
|---|---|---|---|---|
| B1 | Cancel on a reason prompt still publishes or deprecates | `dashboard-manager.tsx` 306/343; `reports/page.tsx` 3058/3094 | Dashboards and reports published or deprecated by accident | Use ReasonDialog; Cancel aborts |
| B2 | Campaign **Launch** and journey **Enroll audience now** run immediately | `marketing/page.tsx` 440 → 241; `journeys-panel.tsx` 331 → 176 | Messages sent to the whole audience on one click | Confirm with recipient count and a summary |
| B3 | Share dialog saves empty lists if loading current shares failed | `common/record-share-dialog.tsx` 39 | Every existing share on the record is revoked | Block Save; show the error |
| B4 | Changing display settings remounts the whole app | `providers/general-settings-provider.tsx` 45 | Open dialogs, typed text and scroll position lost | Formatters read from a store; no remount key |
| B5 | Form builder: switching tabs discards unsaved work; two save paths overwrite each other; "Save placement" writes a stale snapshot | `forms/[formId]/page.tsx` 95-121; `crm-placement-editor.tsx` 209-224 | Silent loss of form edits | One form store; PATCH only changed parts with a version check; keep the editor mounted |
| B6 | Automation step dialog "Cancel" doesn't discard; there are two step-config implementations; Backspace deletes a node with no undo | `automations-v2/[id]/page.tsx` 981, 1550-2498, 2548 | Unintended step changes saved; steps lost | One inspector with Apply/Revert; undo; turn off silent Backspace delete |
| B7 | Deleting an automation can empty the list (stale state) | `automations-v2/page.tsx` 64/175 | Users think everything was deleted | Functional state update |
| B8 | "Select all" bulk actions: leads ignore the active filters (fetch up to 5,000); opportunities and activities act on the current page only | `leads/page.tsx` 289; `opportunities/page.tsx` 259-285; `activities/page.tsx` 177 | Wrong records changed, or fewer than shown | Bulk endpoints that respect filters; the count shown is the count changed (see §8 #2) |
| B9 | Bulk-action bar sits above every dialog (`z-[1300]`) | `bulk-actions/bulk-toolbar.tsx` 144 | Confirmation dialogs hidden behind the bar | Below the overlay layer; hidden while a modal is open |
| B10 | Notes list clears and reloads after every action | `common/notes-panel.tsx` 69-80 | Flicker; scroll and focus lost | Refetch only when the record changes |
| B11 | The scheduled-report email link `?report=` doesn't open the report | `reports/page.tsx` 54/82-88; `report-schedules-postgres.ts` 424 | Broken email links | Report viewer URLs (decision 30) |
| B12 | Payout bulk approve and partner bulk suspend report success even when some updates fail | P7: payout-cycles, partners | Admins think the work is done | Per-item results summary |
| B13 | The edit-user dialog drops `permissionTemplateId`; custom-field selects use an uncontrolled `defaultValue` | P7: users/edit-user-dialog, custom-fields | Edits silently not saved | Controlled fields; include in payload |
| B14 | The inbound-call "Assign to me" PATCHes the whole lead snapshot | `providers/inbound-call-popup-provider.tsx` 74 | Overwrites newer edits | PATCH only the owner |
| B15 | Settings › Users bulk "Assign manager" calls an endpoint that doesn't exist | `admin/users/bulk-assign-manager-dialog.tsx` 89 | The action always fails | Add `POST /api/users/bulk/assign-manager`, or reuse the per-user PATCH (§12.1 W1) |
| B16 | Sign-in ignores the `from` link; two proxy files with different logic, only one of which runs | `login/page.tsx` 39-41; `proxy.ts` and `src/proxy.ts` | Deep links from emails and notifications are lost; either the server-side login redirect or the cross-site check is off | Return to `from` (same-origin paths only); merge into one proxy and test both behaviours (§12.4 G3, G4) |


#### Step 0b results (2026-10-02)

All 16 fixes are done. Two related bugs turned up during the work and were fixed too (marked ➕).

| # | Change | Test |
|---|---|---|
| B1 | New `useReasonDialog` (`common/reason-dialog.tsx`) replaces `window.prompt` for publish and deprecate on dashboards and reports. Cancel, Escape and closing all stop the action. | Browser |
| B2 | New `useConfirmDialog` (`common/confirm-dialog.tsx`). **Launch** shows the campaign, channel, recipient count (from the audience preview) and step count, and its button reads "Send to N recipients". **Enroll audience now** shows the audience size (from journey simulate, which runs in TEST mode and sends nothing). If the count can't be loaded, nothing is sent. | Browser |
| B3 | The share dialog blocks Save, with Retry, when the current shares fail to load. A failed user or team list shows a note, and existing shares are kept. | Browser |
| B4 | Display settings no longer remount the app. Formatters read the current settings each time they run, and `hooks/use-display-settings` re-renders anything that has to update immediately. | Browser |
| B5 | **Server:** a form save replaces only the config keys it sends, and `expectedUpdatedAt` returns 409 when the form changed in the meantime. **Page:** the builder and placement tabs stay mounted. **Each editor:** saves only what changed and takes in the other tab's saved values for keys it hasn't touched. ➕ Every builder save of a form with fields had been failing, because `fields` went to Postgres as an array literal rather than JSON (an empty list was stored as `{}`). It is now sent as JSON. | `scripts/form-save-smoke.ts` (real DB, 9 checks); browser |
| B6 | Step Cancel and Close revert unapplied edits, and the side panel has Revert and Apply. Saving the automation refuses while a step has unapplied edits, instead of merging them in. Keyboard Backspace and Delete no longer remove steps; edges still can. Removing a step from its menu shows an Undo. | Browser |
| B7 | Delete uses a functional state update. ➕ The row menu could never open, because its open state was read inside columns memoised on `[router]`. | Browser |
| B8 | New `GET /api/{leads,opportunities,activities}/ids` returns the ids matching the list's filters under the same record access, up to 5,000. Above that it reports `truncated`, and the page asks the user to narrow the filters rather than act on part. Delete, add to list, reassign (in batches of 500) and mark completed act on exactly those ids. The confirmation and the result use the real count, and partial failures show as warnings. | `scripts/activity-scope-smoke.ts` (real DB, 7 more checks); browser |
| B9 | The bulk bar moved to `z-40`, below the dialog layer. | Browser |
| B10 | The notes list loads once per record and per Retry, and actions update it locally. A panel that remounts during a pending save still loads once the save settles. | Browser |
| B11 | Emails link custom reports with `?reportId=` and built-in ones with `?report=<key>`. The reports page opens and runs the linked built-in report, and also handles the old `?report=custom:<id>` links. | Vitest (existing) |
| B12 | Payout approve and partner suspend show one summary: green only when every item succeeded; otherwise a warning naming what failed, why, and what was skipped. Failed items stay selected for a retry. | Typecheck and lint |
| B13 | Edit user sends `permissionTemplateId`. The custom-field selects are controlled. | Browser (edit user) |
| B14 | **Assign to me** sends only `ownerId`. The lead PATCH route now needs `name` only when it is sent, which also fixes the leads list's inline status change resending a stale name. | Vitest |
| B15 | Bulk "Assign manager" uses the existing per-user update (same admin check and audit log), reports per-user results, and never makes someone their own manager. | Browser |
| B16 | One proxy (`src/proxy.ts`): the cross-site write check, the `/register` redirect, and a signed-out redirect to `/login?from=…`. The root `proxy.ts`, which Next.js never ran, is deleted. The login page, the 401 handler and the auth guards return to `from`, same-origin app paths only (`lib/safe-return-path.ts`). The root file's "signed-in users skip /login" rule was left out: with an expired cookie it would loop. | `tests/proxy-and-return-path.test.ts` (16); browser |

**Browser check:** run on Demo University at 1280px with temporary admin users, deleted afterwards. Response fixtures meant nothing was written. Every scenario passed (B1–B10, B13, B15, B16). B11 is covered by unit tests, and B12 by typecheck and lint, since it needs failing payouts to reproduce.

**Noticed, not fixed (outside Step 0b):**
- The form builder asked for `/api/custom-fields?objectType=TASK`, which returned a 500 on every load (tasks have no custom fields; the Task library still showed its six standard fields). Fixed 2026-10-03: it no longer asks, and an unsupported object type is a 400.
- The header shows "Offline" for agent availability in the dev environment.
- Other places may send a bare JS array to a `jsonb` column, the B5 bug. `jsonbParam` in `lib/db/query.ts` exists for exactly this, so a sweep is worth doing.

Shared helpers for later phases: `useReasonDialog`, `useConfirmDialog`, `lib/bulk-selection.ts` (`fetchMatchingIds`, `runForEach`, `reassignOwnersInBatches`, `showBulkResult`). They are a start on the Phase 1 shared components. The other `window.prompt` and `confirm()` calls are replaced in Phases 1–3.

### 11.4 Daily flows (rep, desktop): clicks today vs the target

| Flow | Today | Target | How |
|---|---|---|---|
| Find a lead | 5–6 (filter drawer) | 0–1 | List search (`/`), working ⌘K search across phone, email and company |
| Open it | 2 (preview, then "Full details") | 1 | Row click opens the record; preview on Space or the hover icon |
| Log a call or activity | 7, ending on a "Save undefined" button | 3 | Header "Log activity" or the timeline composer: type → outcome → Save |
| Add a note | 2 (go to the Notes tab) | 1–2 | Composer on the default Activity tab |
| Create a task | 5 | 2 | Composer "Task": title + "Tomorrow" chip → Enter |
| Change lead status | 5 on the record (via Edit) | 2 | Inline status in the header |
| Change opportunity stage | 1, with no safeguard | 1–2 | Stage path; Won/Lost asks for a reason |
| Reassign owner (one record) | Not possible on the record | 3 | Owner picker in the header; reason optional (decision 17) |
| Create an opportunity from a lead | 5–7 (lead picker capped at 100) | 2 | "Convert" with pre-filled values; sets the lead to Converted |
| Bulk change status | Not available | n + 2 | SelectionBar → Status |

### 11.5 Navigation and information architecture

**Main navigation (decision 27).** At most 5 groups plus Settings, in the quiet style (decision 24), with pinned items on top:

| Group | Items |
|---|---|
| My work | Dashboard ("My day"), Tasks, Activities, Approvals (count) |
| Sales | Leads, Opportunities, Applications, Lists, Views |
| Service | Cases, Call center |
| Marketing & automation | Campaigns, Forms, Automations |
| Insights | Reports, Leaderboard (My points merged in), Payouts (decision 32) |
| *(bottom)* | Settings (admins only, decision 8) |

- Exports move into each list's Export menu, with an "Export history" link under Reports.
- Custom Objects are hidden until their route exists.
- Each item has a unique icon.

**Settings (decisions 22 and 28).** The main sidebar collapses to the icon rail. New groups and URLs, with every old URL redirected:

| Group | Pages |
|---|---|
| My account (everyone) | Profile · Preferences · Notifications · Sign-in & security · My activity |
| Workspace | Profile & regional · Plan, modules & usage |
| Users & access | Users · Teams · Roles & permissions (merges Permission templates) · Sales groups · Partners · User provisioning (SCIM) |
| Security & compliance | Security policy · Approvals (was Privileged actions) · Audit log · Data privacy requests · API keys |
| Data model | Objects & fields (merges the 3 custom-field editors) · Opportunity types & stages (adds the missing stage editor) · Activity types · Product catalog · Duplicates (merges Duplicate rules + Dedupe & merge) · Import data |
| Sales automation | Assignment rules · Lead scoring · Recommended actions (was Next-best-action) · Task playbooks · Service levels (task + case SLAs) |
| Calling | Phone system (split out of Integrations) · Call outcomes · Call scripts · Call campaigns · Agent capacity |
| Service desk | Case setup · Queues · Macros · Knowledge base · Inbound channels |
| Messaging & AI | Email, SMS & WhatsApp · AI assistant |
| Integrations | Directory · Webhooks · Lead capture · External push · Connection health · Marketplace (an app detail page instead of 13 buttons and 11 dialogs) |
| Rewards & payouts | Payout cycle rules · Commission rules · Gamification rules (the day-to-day queues move to the Payouts workspace) |

- Settings search matches page names, keywords and sections.
- The breadcrumb reads "Settings › Group › Page".
- Every section is deep-linkable.

**Other areas:**

| Area | New structure |
|---|---|
| Reports (decision 30) | `/reports` Library (search, favourites, categories) → `/reports/standard/<key>` and `/reports/custom/<id>` viewers (chart plus sortable table, date range, Export, Schedule, Add to dashboard) → full-page builder with live preview → `/reports/schedules` and `/reports/metrics`. Overview KPIs move to the Dashboard. Compare becomes standard reports. Annotations, data catalog and rollups move to Settings › Analytics. |
| Marketing | Sub-routes Campaigns · Journeys · Delivery log · Compliance. Campaign list (table) → campaign detail with one status-driven primary action → composer (Setup, Audience, Message, Delivery, Review) with live preview, draft save and a leave guard. |
| Payouts (decision 32) | Workspace queues: To approve · On hold · Disputes · Invoices · Redemptions. Approvals also appear in My work › Approvals. |
| Call center | Agent workspace: queue (Next up, Callbacks, Missed), current call with record snapshot, script with compliance lines, always-visible disposition with "Save & next", and "My campaigns" for agents. |
| Cases | Case workspace: header actions (Resolve, Assign to me), a left property rail, Conversation/Attachments/History tabs, a "Reply / Internal note" composer, clickable suggested articles. |
| Platform admin | Grouped navigation: Overview (needs-attention home) · Tenants (list linking to detail, Module bundles) · Marketplace (Reviews, Apps, Blocks, Health) · Security & compliance (Approvals, Impersonation, Audit log, Retention) · System (Module health, Schema). Tenant detail sections: Overview · Modules & features · Users · Usage & limits · Environment · Demo data · Danger zone. |

### 11.6 Standard patterns (the pattern library every screen follows)

**A. Page templates**

| Template | Used for | Structure |
|---|---|---|
| List | Leads, Opportunities, Activities, Tasks, Cases, Applications, Campaigns, Reports library, every settings list | PageHeader (title, count, 1 primary) → one-row toolbar (view picker, search, quick filters, Filters (n), chips; columns, density and refresh on the right) → DataTable → SelectionBar when rows are selected |
| Record | Lead, Opportunity, Case, Application, Partner | Sticky header (back, name, status, owner, quick actions, ⋯) → summary column (one surface with dividers) + tabs (≤5) |
| Settings | All settings | Breadcrumb → PageHeader → sections (h2 + helper on the left, controls on the right) or URL-backed tabs (never nested) → save bar → Danger zone last |
| Builder | Automation, form, report builder, campaign composer, dashboard edit | Header (back, inline name, status pill, save state, Test/Preview, History, Publish) → palette / canvas / inspector → validation bar |
| Workspace | Call center, Payouts, Approvals, Case | Queue column → work area → context column; keyboard-first |

**B. Actions and buttons**
- One filled primary button per region. At most 2 secondary buttons; the rest go in "⋯".
- Labels say the result: "Create lead", "Save changes", "Send 1,240 messages", "Delete webhook".
- Icon-only buttons always have an accessible name and a tooltip.
- Destructive actions sit last, after a separator, in red text inside menus.
- Show an action only when it applies; never a wall of disabled buttons.

**C. Choosing an overlay**

| Need | Use | Size and rules |
|---|---|---|
| Pick from a short list, quick info | Popover or menu | Anchored; Escape closes |
| Create with ≤5 simple fields; confirmations | Dialog | 560px (max 880px). Footer: Cancel · primary. Enter submits. **No dialog opened from a dialog.** |
| Edit an item with up to about 15 fields or one rule builder; record quick view; task editor; filters | Right side sheet | 480px, or 640–800px for rules. Sticky footer. Unsaved-changes guard. Focus returns to the opener. |
| Complex objects with sub-lists (role and permissions, opportunity type and stages, partner, campaign, report, automation, form) | Full page | Own URL; tabs in the URL |

The current `xl` dialog (1536px) is removed: anything that big becomes a page.

**D. Confirmations and delete (decision 31)**

| Kind of action | Treatment |
|---|---|
| Reversible change (status, owner, pause) | Do it, then show an Undo toast for 5–8s |
| Delete of a configuration item or document (automation, form, view, report, list, rule, template) | Archive with an "Undo" toast; restore from "Archived" for 30 days, then purge. No dialog unless it has dependants. |
| Has dependants or affects others (role with users, field with data, type with records) | ConfirmDialog naming the item, the consequence and the counts; or block deletion with a reassignment path |
| Sends messages or affects many records (Launch, Enroll, bulk delete or update over N, Publish) | ConfirmDialog with counts and a summary of what changes; the button names the result ("Send to 1,240 people") |
| Irreversible (GDPR erase, uninstall app, purge, rotate secret) | ConfirmDialog plus typing the item's name, with counts |
| Needs a reason (reject, suspend, override) | ReasonDialog with a required field and an inline error |

Browser `confirm()` and `prompt()` are removed everywhere (about 100 calls).

**E. Save models**

| Context | Model |
|---|---|
| Single toggle or preference | Saves itself, with an inline "Saved" tick; undo for risky toggles |
| Settings form | Sticky bar "Unsaved changes · Discard · Save" shown only when there are changes; guard on leave |
| Side-sheet editor | Explicit Save in the footer, disabled until something changes; guard on close |
| Record fields | Inline edit per field (Enter or blur saves, Escape cancels) plus "Edit all fields" |
| Builders (decision 29) | Draft autosave ("All changes saved"); explicit **Publish** with validation and a change summary; versions vN; restore as draft; undo and redo; new items start as Draft |

**F. Lists and tables**
- **Toolbar:** search (URL-synced); at most 3 quick filters; "Filters (n)" opens the drawer; applied filters show as chips with "Clear all"; saved views use **one** system (Saved Views: private, team or default).
- **Table:**
  - sortable headers, sticky header, 40/32px rows;
  - sentence-case headers, numbers right-aligned;
  - the first cell is a real link (row click opens; keyboard Enter);
  - at most 2 inline row actions plus "⋯";
  - 25 or 50 rows per page with page numbers;
  - a mobile card layout from the same component.
- **States:** the skeleton keeps the toolbar; errors show ErrorState with Retry; "no matches" (with "Clear filters") is distinct from "nothing here yet".
- **Selection:** SelectionBar reads "N selected · Select all M matching", using verbs ("Change status", "Assign", "Add to list"), with destructive actions last. It respects the active filters.

**G. Forms**
- Visible labels linked to their controls; `*` and `aria-required` for required fields; helper text below.
- Inline errors with `aria-describedby`, plus an error summary and focus on the first error after submit. Toasts only for network errors.
- 40px fields, full width in forms.
- Pickers, never typed IDs: searchable record and user pickers, with no cap of 100.
- Units in the field suffix.
- One password policy shown live.
- Correct `type`, `inputMode` and `autocomplete` attributes.

**H. Rule and condition builder.** One engine replaces ConditionBuilder, FilterBuilder, the advanced filter drawer and the lead-scoring rules.
- It reads as a sentence: "When a **Lead** is **created** and **All ▾** of these match:".
- Field (searchable, grouped) → operator by field type → value by field type (picklist, user, relative date).
- One operator vocabulary: is, is not, is any of, has a value, is empty, greater than, before, after.
- A plain-language summary appears underneath.
- "Test against a record" shows pass or fail per condition.
- Each row's controls are labelled, and rows use stable keys.

**I. Reorderable lists**
- A visible position column is the only ordering model; the separate numeric priority fields are removed.
- The drag handle is a labelled button with keyboard reordering; the "⋯" menu has Move to top, up, down and bottom.
- One reorder request. Reordering is off while the list is filtered.

**J. Permission matrix (Roles)**
- Roles appear as a table (Users, Record access, Type) with a "Compare roles" view.
- The editor is a full page with these parts:
  - a matrix of modules × None/View/Edit/Full, one radio group per row;
  - record access as Own/Team/All;
  - a "Based on template" option with Overridden markers;
  - the line "Changes apply to 12 users".
- Delete is blocked while users are assigned.

**K. Record page (within decision 23).** The record page keeps its current layout.
- **Header (56px):** back, name, status pill (editable), favourite. A meta line with company, owner (editable) and last touch. On the right: Call, Email, primary **Log activity**, and "⋯" (New task, Convert, Edit all fields, Case, AI, Share, Push, Forms, Delete). Opportunities add a stage path with Won/Lost.
- **Summary column (280px), one surface:** About (key–value rows, empty fields hidden), Score ("Warm · 62% likely" with "Why?"), Next step (named by its effect), Related. Call script and custom fields start collapsed.
- **Tabs (5):** Activity (timeline, with a Call/Note/Task/Email composer; this absorbs the Notes and Communications tabs) · Tasks · Opportunities · Details · History.
- **Timeline item:**
  - a flat row with a type icon;
  - line 1, "Call · No answer · by Priya", with the time on the right;
  - line 2, notes clamped to 3 lines;
  - a 12px related-record line;
  - "SLA missed" shown only when it was missed;
  - edit, pin and "⋯" on hover or focus;
  - sticky day separators, and "Load older" after 25 items.
- **Kanban card (about 88px):** title and owner avatar; amount and close date (red only when overdue); one attention line only when needed. "Move to stage…" in the menu; drag also works from the keyboard; Won/Lost asks for a reason.
- **Task row (40px):** complete checkbox · title · related record · due (red only when overdue) · priority icon only for High or Urgent · owner avatar · Reschedule, "⋯". Row click opens the shared task sheet.

**L. Dashboard (decision 18)**
- **View mode (default):** "My day" plus a switcher, date range, Edit and "⋯". Widgets have no handles.
- **Edit mode:** a sticky bar "Editing · Add widget · Templates | Cancel · Save". Drag and resize also work from the keyboard. Changes are buffered and saved as a version, which replaces both "Saved layouts" and manual Publish.
- **Add widget:** a gallery sheet with a live preview.

**M. Global pieces**
- **⌘K search:** records first, matched on phone, email and company; "Searching…" and an error state; deep links to tasks, activities and partners.
- **Notifications:** a list with read and unread states, "Mark all as read" with undo, and a "View all" page. The count is included in the accessible name.
- **Header:** user name and workspace name (no raw tenant ID); the Create menu holds record creates only, with no full-page reload; shortcuts help moves into the account menu.
- **Incoming call:** a non-modal docked panel, never stacked dialogs.
- **Tooltips:** one provider with a delay of about 400ms.
- **Banners:** dark text on the impersonation banner; maintenance banner can be dismissed for the session.

**N. Copy**
- One shared label map turns every enum into readable text: statuses, outcomes, triggers, channels, frequencies, field types, record access.
- Sentence case throughout; plain words instead of jargon ("Recommended actions", "Duplicates", "User provisioning (SCIM)").
- No developer notes in the UI; "—" for empty values; dates in the tenant's timezone.

### 11.7 Shared components: create, merge, delete

**Create:**
- ConfirmDialog / ReasonDialog / TypedConfirm (`useConfirm`) and an Undo toast helper
- StatusBadge with the label map
- `Section` / `DescriptionList` (borderless, with dividers)
- `useUrlState` (tabs, sections, filters, pages)
- `ListToolbar`
- `DataTableViewOptions` (density and columns inside the toolbar)
- `SelectionBar` with a generic `actions[]`
- RecordPicker and UserPicker (async search)
- `RuleBuilder` (the single engine, §11.6 H)
- `ReorderableTable`
- `PermissionMatrix`
- `SettingsPage` template with a save bar and danger zone
- `BuilderShell` (header, save state, publish, versions, undo)
- Notifications page
- `usePermissions`
- One app-level TooltipProvider

**Merge:**

| Merge | Into |
|---|---|
| Dialog + StandardDialog | One system |
| Sheet | Gains sizes, a guard and an actions slot |
| SavedFiltersMenu + filter-drawer presets + Smart Views | Saved Views |
| ConditionBuilder + FilterBuilder + AdvancedFilterDrawer conditions | RuleBuilder |
| The two task editors | One task sheet |
| The three custom-field editors | Objects & fields |
| The two draft providers | One |
| Duplicate rules + Dedupe & merge | Duplicates |
| Roles + Permission templates | Roles & permissions |
| The two kanban boards | One |

**Delete** (after a final importer check, decision 12):
- `bulk-add-tags-dialog`, `bulk-update-status-dialog`, `data/floating-bulk-actions`, `data/import-dialog`
- `common/field-history-panel` (or rebuild it as the History tab), `layout/breadcrumbs` (or rebuild it in PageHeader), `dashboard-page-transition`
- `kanban/kanban-board`, `leads/lead-quick-view`, `views/view-switcher` (or wire it in as the view picker)
- `dashboard/analytics-dashboard`
- `settings/permission-templates/create-template-dialog`, whose save is faked with a timer
- `roles/role-editor-dialog` and `permission-matrix` (replaced by J)
- `/dashboard/admin/custom-fields`, `/dashboard/admin/tenants`, `/dashboard/admin/pipelines`

### 11.8 Changes to the phases

- **Step 0:** activity scoping (§10.6). ✓ Done 2026-10-02 (see the updated sequence in §9).
- **Step 0b (new):** the safety-critical fixes in §11.3 (B1–B16). Each fix comes with a real reproduction test. ✓ Done 2026-10-02 (§11.3, "Step 0b results").
- **Phase 1:**
  - add, from §11.7: ConfirmDialog with the confirmation tiers (§11.6 D), the overlay rules (C), the label map (N), `useUrlState`, ListToolbar, SelectionBar, the Section component, form primitives (G), and global search and notification fixes (M);
  - start replacing `confirm()`/`prompt()` in the shared components.
- **Phase 2:**
  - core sales flows to the §11.4 targets: record header and timeline composer, inline status and owner, Convert, shared task sheet, record pickers, list toolbar, kanban card, task row;
  - main navigation regroup (decision 27);
  - Dashboard "My day" with view and edit modes.
- **Phase 3:**
  - Settings IA and URLs (decision 28), the stage editor, permission matrix, rule builder and reorderable lists;
  - Reports Library/Viewer/Builder (decision 30) and Marketing campaign detail and composer;
  - the builders' save model (decision 29) and layouts (P4 proposals);
  - the archive-and-restore delete model (decision 31; needs backend support);
  - Payouts workspace (decision 32), call center and case workspaces, platform-admin IA, auth and public pages;
  - the dead-code removals.
- **Acceptance check for every screen:**
  - the clutter budget (§10.4);
  - no `confirm()`/`prompt()` anywhere;
  - every destructive action follows §11.6 D;
  - every tab and section is deep-linkable;
  - the findings for that file in the appendix are resolved or explicitly deferred.

---

## 12. Gap check: actions, wiring, back end and logic (2026-10-01)

**Request:** check whether anything was missed: actions, UI components, anything not linked to an action, back end or API, small things and logic.

**Method:** a static analysis of all 1,073 source files using the TypeScript compiler, kept in the scratch folder. It checked:
- every front-end API call (882) against the 592 API routes and the methods each route exports;
- every link and navigation call (111) against the 111 page routes and the configured redirects;
- every button and menu item for a handler;
- placeholder and fake code;
- the API routes that no screen calls;
- app-level files (error, 404 and loading pages, the proxy, page titles);
- risky logic patterns.

Every hit was verified by hand. False positives were dropped: dynamic URLs, conditional URLs (both branches checked), and triggers that are wired through a wrapper.

Full lists are in [UI_UX_FINDINGS_BY_FILE.md](UI_UX_FINDINGS_BY_FILE.md) › "Gap check".

### 12.1 Broken wiring: screens calling endpoints that don't exist

| # | Screen | Call | Effect | Plan |
|---|---|---|---|---|
| W1 | **Settings › Users › bulk "Assign manager"** (reachable today) | `POST /api/users/bulk/assign-manager`, which doesn't exist (`admin/users/bulk-assign-manager-dialog.tsx:89`) | The action always fails | **Step 0b, item B15:** add the endpoint, or reuse the existing per-user PATCH |
| W2 | Hidden "Subscription plans" page | `GET/POST/PATCH /api/plans`, which doesn't exist (`admin/plans/page.tsx:120-175`) | The page can't work | Remove the page (decision 35) |
| W3 | Hidden duplicate tenants page | `PATCH /api/platform-admin/tenants/:id/status`, which doesn't exist (`admin/tenants/page.tsx:69`) | Suspend can't work there | Removed with the page (decision 9) |
| W4 | GDPR request "Download" | Raw link `/api${filePath}` (`settings/governance/gdpr/page.tsx:152`), bypassing the existing `/api/governance/gdpr/requests/[id]/download` | Depends on the stored path format; may fail | Use the download endpoint |

No other broken calls: all other 876 calls resolve to an existing route and method.

### 12.2 Controls that do nothing or mislead

| # | Control | Where | Plan |
|---|---|---|---|
| D1 | "Filters" button (no handler) | `automations-v2/page.tsx:202` | Remove, or add Status and Trigger filters (Phase 3) |
| D2 | "Filters" button (no handler) | `forms/page.tsx:152` | Same |
| D3 | "Edit" button inside a form card (works only by click bubbling; not keyboard-accessible) | `forms/page.tsx:236` | Real link card |
| D4 | Record preview "Edit" (no handler) | `common/record-preview.tsx:111` | Open the edit dialog (Phase 2) |
| D5 | Export status shown as a disabled button ("Pending"/"Expired") | `exports/page.tsx:288` | Status text, with auto-refresh while pending |
| D6 | "+ Activity", "+ Opportunity" and "+ Case" triggers opened through a `<span>`/`<div onClick>` wrapper | `create-activity-dialog.tsx:39`, `create-opportunity-dialog.tsx:32`, `create-lead-dialog.tsx:33`, `cases/create-case-button.tsx:65` | Pass the trigger with `asChild` (accessibility, already A2) |
| D7 | "Create permission template" fakes its save with a timer ("Mock API call") | `settings/permission-templates/create-template-dialog.tsx:88-89` (never imported) | Delete (§11.7) |
| D8 | "Revenue (Est): Unavailable — Billing integration pending" tile | `platform-admin/page.tsx:85-92` | Remove (decision 35) |

### 12.3 Back-end features with no screen (decision 33: add UI where each belongs)

35 internal endpoints are never called from the UI. Another 35 are external by design and correctly have no UI: the public API (`/api/v1`), SCIM, inbound webhooks, tracking, the health check, public downloads, and scheduled jobs (`process-*`). Each internal feature gets a home in the phase that rebuilds its screen:

| Feature (endpoint) | Home in the new UI | Phase |
|---|---|---|
| Add or remove team members (`/api/teams/[id]/members`, `…/members/[userId]`) | Settings › Teams › team page › Members | 3 |
| Knowledge-base categories (`/api/knowledge-base/categories`, `[id]`) | Settings › Service desk › Knowledge base › Categories | 3 |
| Article "Was this helpful?" (`/api/knowledge-base/articles/[id]/feedback`) | Case › suggested articles and the article view | 3 |
| Resume SLA (`/api/cases/[id]/sla/resume`) | Case header ⋯ › Resume SLA (Pause already exists) | 3 |
| Release a queued call; queue health (`/api/call-queues/[callLogId]/release`, `/health`) | Call center › supervisor Team tab | 3 |
| Consent and consent history (`/api/communications/consent`, `/history`) | Record › Details › Communication preferences | 2 |
| Message snippets (`/api/communications/snippets`, `[id]`) | Composer "Insert snippet"; Settings › Messaging › Snippets | 3 |
| Template approval and versions (`/api/communications/templates/[id]/approval`, `/versions`) | Settings › Messaging › Templates (approval state, history) | 3 |
| Marketing costs and ROI (`/api/marketing/cost-entries`, `[id]`, `/roi`) | Marketing › Costs & ROI | 3 |
| Message-fatigue limits (`/api/marketing/fatigue-settings`) | Settings › Messaging › Frequency limits | 3 |
| Journey enrolments, simulation, exit/pause one enrolment (`/api/marketing/journeys/[id]/enrollments`, `/simulate`, `/journeys/enrollments/[id]`) | Journey detail › Enrolments tab; "Simulate" in the builder | 3 |
| Custom report export (`/api/reports/custom/[id]/export`) | Report viewer › Export | 3 |
| Form submissions export (`/api/forms/[id]/export`) | Form › Results › Export | 3 |
| Export download link (`/api/exports/[id]/signed-url`) | Exports list › Download (verify it replaces the current link) | 3 |
| GDPR request download (`/api/governance/gdpr/requests/[id]/download`) | Data privacy requests › Download (fixes W4) | 3 |
| Self-learning score preview (`/api/lead-scoring/self-learning/scores`) | Settings › Lead scoring › Model › Score preview | 3 |
| Partner invoices; invoice download; payout invoices; finance export (`/api/partners/me/invoices`, `/api/partner-invoices/[id]/signed-url`, `/api/payouts/[id]/invoices`, `/api/payout-cycles/[id]/finance-export`) | Payouts workspace › Invoices; cycle › Export (decision 32); partner portal › Invoices | 3 |
| Failed background jobs (`/api/platform-admin/jobs/dead-letter`) | Platform admin › System › Failed jobs | 3 |
| Reject platform permissions (`/api/platform-admin/marketplace/installs/[id]/reject-platform-permissions`) | Platform admin › Marketplace › Reviews | 3 |
| App action runs, install permissions, record scope, app secrets (`/api/marketplace/apps/[id]/actions/runs`, `/installs/[id]/permissions`, `/record-scope`, `/api/marketplace/secrets`) | Settings › Marketplace › app detail tabs: Actions history, Permissions, Record access, Credentials | 3 |
| Assignment simulation history (`/api/assignment/simulations`) | Assignment rules › Simulation history | 3 |
| Where a playbook was applied (`/api/task-playbooks/applications`) | Task playbooks › Usage | 3 |
| Reorder dashboard tabs (`/api/dashboard-tabs/reorder`) | Dashboard edit mode | 2 |

### 12.4 App-level gaps (not visible from any single screen)

| # | Gap | Evidence | Plan |
|---|---|---|---|
| G1 | **No error, 404 or loading pages.** There are no `error.tsx`, `global-error.tsx`, `not-found.tsx` or `loading.tsx` files, so a crash shows Next's unbranded default error page, a bad link shows the default 404, and routes have no loading view. | None found under `src/app` | Phase 1: branded `error.tsx` per area (with Retry and "Go to dashboard"), `global-error.tsx`, `not-found.tsx` ("This page doesn't exist" plus search), skeleton `loading.tsx` for list and record routes |
| G2 | **Every browser tab is titled "Unnatify".** | Only the root `metadata` in `app/layout.tsx:18` | Phase 1: titles in the form "Aarav Rao · Leads · Unnatify" (WCAG 2.4.2) |
| G3 | **After sign-in the user always lands on the dashboard**, so links from emails and notifications (report, task, record) are lost. The proxy adds `?from=`, but the login page ignores it. | `login/page.tsx:39-41`; `proxy.ts:14-16` | Step 0b, item B16: return to `from` (same-origin paths only) |
| G4 | **Two proxy files with different logic.** Root `proxy.ts` redirects to login; `src/proxy.ts` blocks cross-site writes. Only one runs, so either the server-side login redirect or the extra cross-site check is silently off. | `proxy.ts`, `src/proxy.ts` | Step 0b, item B16: merge into `src/proxy.ts`, then test both behaviours |
| G5 | At least 9 places format dates with the browser's locale (`toLocaleDateString`/`toLocaleTimeString`), and more pass dates to `toLocaleString`, instead of using the workspace formatters (`lib/date-format.ts`) | The full list is in the appendix › Gap check | Phase 1 label/format helpers (§11.6 N): tenant timezone and format everywhere |
| G6 | **Pipeline stages can't be managed at all.** No UI or back end creates, renames, reorders or deletes stages; they only come from seed data. | No `insert into "StageDefinition"` anywhere | Phase 3: stage editor, including the back end (decision 34) |
| G7 | Public form custom CSS is injected as-is (`<style dangerouslySetInnerHTML>`) | `public-form-renderer.tsx:265` | Verify and sanitise (allow-list CSS, strip `</style>` and `@import`/`url()` to other origins). See §8. |
| G8 | Hidden Plans page and the revenue tile (W2, D8) | | Remove (decision 35) |

### 12.5 Logic patterns checked

| Pattern | Count | Status | Plan |
|---|---|---|---|
| `react-hooks/exhaustive-deps` disabled | 19 | Each can serve stale data, the same kind of bug as B7. Review each one when its screen is rebuilt | Per screen in Phases 1–3 |
| List `key={index}` | 37 | Wrong rows are kept or focused after a reorder or remove (condition rows, form options, lists) | Stable ids wherever the list can change |
| `target="_blank"` without `rel="noopener"` | 9 | Minor safety issue; also inconsistent "opens in a new tab" behaviour | `rel="noopener noreferrer"`; open in the same tab unless it's an external site (§11.6) |
| `JSON.parse` in UI | 15 | ✓ All guarded with try/catch or validated | — |
| `localStorage` use | 13 files | Most are guarded; verify the rest | Phase 1 storage helper |
| `alert()` / `console.log` in UI | 0 | ✓ None | — |
| Fake or mocked code | 1 file | D7 | Delete |
| Unguarded `dangerouslySetInnerHTML` | 2 | One is the theme no-flash script (fine); the other is G7 | G7 |

### 12.6 Checked and clean

- 876 of 882 API calls resolve to a real route and method.
- 110 of 111 links resolve to a real page or redirect.
- Every conditional create-or-update call has both endpoints present.
- No `alert()` or stray `console.log` in the UI.
- All `JSON.parse` calls are guarded.
- The external endpoints have no UI by design.

### 12.7 Additions to the sequence

- **Step 0b** gains B15 (W1, bulk assign manager) and B16 (G3 return-to-link and G4 proxy merge).
- **Phase 1** gains G1 (error, 404 and loading pages), G2 (page titles) and G5 (formatting).
- **Phases 2–3** gain the feature homes in §12.3, the stage editor (G6, decision 34) and the removals (G8, decision 35).
- **Out of scope (§8)** gains G7 (verify CSS sanitising) and W4.
