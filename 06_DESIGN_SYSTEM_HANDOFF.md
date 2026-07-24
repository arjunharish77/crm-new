# Design System Consolidation — Handoff Notes

Status snapshot for handing this work off to another agent (e.g. Codex) mid-project.
Source spec: `05_DESIGN_SYSTEM_PRD.md` — read that first, it's the actual brief.
This file is the "what's actually happened so far" companion to it.

Everything below was verified with `npx tsc --noEmit` and `npm run build` after
each change. **Nothing has been visually/interactively verified** (no login,
no screenshots) — the user explicitly asked to skip that for now and move
faster. Whoever continues this should budget for an actual click-through
pass, especially of `leads/page.tsx` (see below), before trusting any of it
in production.

## Original plan (from the PRD prompt), for reference

1. Audit — grep every MUI import, list what each renders, confirm token
   source-of-truth. **Done.**
2. Propose + implement token migration (M3 roles in `theme.ts` → Tailwind CSS
   vars), preserving exact values. **Done.**
3. Migrate MUI-only pages/components to shadcn equivalents, one at a time,
   confirming each still renders. **In progress — small fraction done.**
4. Build the theme registry + selector (token sets, persistence, live
   preview, root provider), current green palette as first theme + 2-3 more.
   **Not started.**
5. Baseline UX pass: empty/loading/error states everywhere, density toggle
   on data tables, action-label/toast consistency audit, visible focus
   states everywhere. **Partially covered as a side effect of Step 3
   (see below) — not done as its own pass.**
6. Update `LEADSQUARED_GAP_CHECKLIST.md` with a "Design System
   Consolidation" section. **Not done yet.**

Constraint from the user, still in force: **no new MUI usage anywhere**
during this work. If unsure whether to build a new shadcn primitive vs.
reuse an existing one, ask rather than guess.

---

## Step 1 findings (the audit) — still true, re-read before continuing

- **Scope is much bigger than the PRD assumed.** The PRD says "~10 pages
  import MUI directly." The actual count is **128 files** (ran
  `grep -rl "@mui/material\|@mui/icons-material\|@mui/x-data-grid\|@mui/x-date-pickers\|@emotion" src`).
- **`src/components/ui/button.tsx` (the shadcn Button) was secretly a MUI
  facade** before this work started — it defined shadcn CVA variants but
  rendered MUI's `Button` underneath. Already fixed (see Step 3 log below).
- **Tailwind CSS was never actually compiling.** No file had
  `@import "tailwindcss"`. Verified by fetching the dev server's actual
  served CSS — it was the hand-written `globals.css` passed through
  byte-for-byte, zero generated utility classes. Already fixed in Step 2.
- **Color tokens**: `src/theme.ts` was confirmed as the only color-token
  source. `src/app/design-tokens.css` exists but only covers
  spacing/radius/shadow/typography/z-index, not color — and turned out to
  be **completely orphaned** (never `@import`-ed anywhere). Left as-is,
  out of scope for the color pass, but worth knowing it's dead.
- **`src/app/dashboard/leads/columns.tsx` was dead code** — a fully-written
  TanStack Table `ColumnDef<Lead>[]` that nothing rendered (`leads/page.tsx`
  used its own inline MUI `GridColDef[]` instead). This has since been
  revived and rewritten for real (see below) — it's no longer dead.
- **Dark mode has never actually worked in this app.** `next-themes`'s
  `<ThemeProvider>` is never mounted anywhere (checked the whole `src/`
  tree). `src/components/providers/ThemeRegistry.tsx` and
  `src/components/ui/sonner.tsx` both call `useTheme()` from `next-themes`
  with no provider above them, so `resolvedTheme` is always undefined and
  the app always renders the light palette. **This directly blocks Step 4**
  — building the theme registry's "root-level provider" needs to actually
  wire this up correctly, since nothing does today. Not fixed yet.

---

## Step 2 — token migration (done)

Changed: **`src/app/globals.css` only.**

- Added `@import "tailwindcss";` at the top (the fix that makes Tailwind
  compile at all).
- Ported all 25 M3 color roles from `theme.ts`'s `md3Colors` object (light +
  dark) into `:root` / `.dark` CSS custom properties, byte-for-byte, no
  color changes.
- Added a `@theme inline` block mapping each `--foo` variable to
  `--color-foo`, which is what makes `bg-foo`/`text-foo`/etc. Tailwind
  utility classes actually work.
- Four tokens shadcn primitives expect that M3 doesn't define — mapped to
  the closest existing equivalent, not invented from nothing:
  - `--card` = `--surface-container-low` (matches MUI Card's actual bg)
  - `--popover` = `--surface-container` (matches MUI Menu/Popover bg)
  - `--card-foreground` / `--popover-foreground` = `--foreground`
  - `--ring` = `--primary` (standard shadcn convention)
  - `--accent` = `color-mix(in srgb, var(--primary) 8%, transparent)` /
    `--accent-foreground` = `--foreground` (matches MUI's actual hover
    treatment, `alpha(primary, 0.08)`, used throughout `theme.ts`)
- Full role→variable table with exact hex values is in the conversation
  history / can be regenerated by re-reading `theme.ts`'s `md3Colors`
  object and `globals.css`'s new `:root`/`.dark` blocks side by side.

Verified: fetched the actual compiled `.next` CSS output and confirmed real
Tailwind v4 utility rules exist, e.g.
`.bg-primary,.bg-primary\/10{background-color:var(--primary)}`.

`src/theme.ts` itself was **not touched** — it's still there, still the
active MUI theme for every page that hasn't been migrated off MUI yet. It
should be treated as deprecated and eventually deleted once Step 3 finishes
converting everything off MUI.

---

## Step 3 — component migration (in progress)

### Done and verified (tsc + build clean)

New/rewritten shadcn primitives in `src/components/ui/`:
- **`button.tsx`** — rewritten from scratch, no MUI. Real shadcn CVA
  variants, Radix `Slot` for `asChild` (previously declared but silently
  ignored — now actually works). Checked all 19 consumers for
  MUI-specific props (`sx`, `startIcon`) before removing MUI — none relied
  on them.
- **`skeleton.tsx`** (new — didn't exist) — standard shadcn pulsing-div
  pattern.
- **`tooltip.tsx`** (new — didn't exist) — had to `npm install
  @radix-ui/react-tooltip` first, it wasn't a dependency yet.
- **`avatar.tsx`** (new — didn't exist) — `@radix-ui/react-avatar` was
  already a dependency, just unused.
- **`badge.tsx`** (new — didn't exist) — shadcn's equivalent of MUI `Chip`.
- **`data-table.tsx`** (new, the big one) — TanStack-Table-based
  replacement for MUI's `x-data-grid`. See "DataTable API" section below
  for what it supports.

Rewritten to use the above instead of MUI:
- **`src/components/common/standard-dialog.tsx`** — now wraps the real
  shadcn `Dialog` (`src/components/ui/dialog.tsx`, which was already
  genuine Radix, not MUI). Preserved the exact same external prop API
  (`open`, `onClose`, `title`, `subtitle`, `icon`, `children`, `actions`,
  `maxWidth`, `fullWidth`) so its ~14 callers didn't need changes. Mapped
  MUI's `maxWidth` breakpoint pixel values exactly (`xs`→444px,
  `sm`→600px, `md`→900px, etc.) rather than guessing at Tailwind's own
  scale. Found and dropped a dead `framer-motion` import (`MotionPaper`
  was declared, never used).
- **`src/components/common/empty-state.tsx`** / **`error-state.tsx`** —
  rewritten in Tailwind, kept the real (functioning) `framer-motion`
  entrance animation. Icon defaults: `SearchX` / `CircleAlert` from
  `lucide-react` (previously MUI's `SearchOff/ErrorOutline`).
- **`src/components/common/skeletons.tsx`** (`TableSkeleton`,
  `PageSkeleton`, `DashboardSkeleton`) — rebuilt on the new `Skeleton`
  primitive + Tailwind grid/flex. Kept the deterministic width arrays
  (`HEADER_WIDTHS`/`ROW_WIDTHS`) that avoid hydration mismatches — don't
  reintroduce `Math.random()` here.
- **`src/app/dashboard/leads/columns.tsx`** — completely rewritten. The old
  version was dead code that also still imported MUI `Chip` and had a
  plain HTML checkbox instead of the shadcn `Checkbox`. New version exports
  `buildLeadColumns(actions)` returning `ColumnDef<Lead, any>[]`, using
  `Avatar`/`Badge`/`Tooltip`/`Button` from `ui/`. Status→color mapping
  preserved (`STATUS_CLASSNAMES` record) but keyed to M3 Tailwind tokens
  instead of fixed hex values.
- **`src/app/dashboard/leads/page.tsx`** — full DataGrid section migrated:
  removed the inline MUI `GridColDef[]` columns array, swapped
  `StandardDataGrid` for `DataTable` (using `buildLeadColumns`), converted
  `GridPaginationModel`/`GridRowId[]` state to plain
  `{page, pageSize}`/`string[]`. Removed now-dead MUI imports (`Avatar`,
  `Chip`, `Tooltip`, `IconButton`, `useTheme`, `alpha`,
  `GridColDef`/`GridPaginationModel`/`GridRowId`, `EmptyState` — the last
  because `DataTable` renders its own empty state now via the
  `emptyState` prop). **Did not touch** this page's other MUI usage (the
  "add to list" `Dialog`/`FormControl`/`Select` at the bottom) — that's a
  separate migration unit, left alone on purpose.

### `DataTable` API (`src/components/ui/data-table.tsx`)

Built to match `StandardDataGrid`'s real feature set (checked actual usage
in `leads/page.tsx` before designing it, not guessed):

```
<DataTable
  columns={ColumnDef<T, any>[]}
  data={T[]}
  getRowId={(row) => string}
  loading={boolean}
  emptyState={{ title, description?, icon?, action? }}
  onRowClick={(row) => void}

  enableRowSelection
  rowSelectionIds={string[]}
  onRowSelectionIdsChange={(ids) => void}
  totalItems={number}
  isAllSelected={boolean}
  onSelectAllFiltered={() => void}
  onClearSelection={() => void}

  manualPagination={boolean}   // default true — server-side, matches how this app fetches
  pageIndex={number}
  pageSize={number}
  pageSizeOptions={number[]}
  onPaginationChange={({ pageIndex, pageSize }) => void}

  storageKey={string}          // persists density to localStorage per-table
  defaultDensity="compact" | "comfortable"
  toolbarActions={ReactNode}   // slot for page-specific extra buttons
/>
```

Built-in: density toggle (compact/comfortable, persisted), column
visibility dropdown, the exact "select all filtered / all N selected"
banner UX the old `CustomToolbar` had, loading → renders `TableSkeleton`,
empty → renders `EmptyState`. **This already satisfies Step 5's density
requirement** for every page that migrates to it — don't build density
twice.

### Not started — remaining `StandardDataGrid` consumers

`src/components/common/standard-data-grid.tsx` (the MUI-based one) is
**still alive on purpose** — do not delete it until every consumer below is
migrated. Each needs the same treatment as `leads/page.tsx`: convert its
inline `GridColDef[]` to a `ColumnDef[]` (probably worth its own
`columns.tsx` file per page, matching the `leads/` pattern), swap the
component, remove dead MUI imports, verify build+tsc.

```
src/app/dashboard/activities/page.tsx
src/app/dashboard/admin/assignment-rules/page.tsx
src/app/dashboard/admin/sales-groups/page.tsx
src/app/dashboard/admin/tenants/page.tsx
src/app/dashboard/admin/users/page.tsx
src/app/dashboard/automations-v2/page.tsx
src/app/dashboard/lists/[id]/page.tsx
src/app/dashboard/lists/page.tsx
src/app/dashboard/opportunities/page.tsx
src/app/dashboard/settings/teams/page.tsx
```

Once that list is empty, delete `standard-data-grid.tsx` and remove
`@mui/x-data-grid` from `package.json` if nothing else uses it (check
first — `src/components/forms/submissions-table.tsx` and a few admin pages
use raw MUI `Table`, not `x-data-grid`, so they're a different migration
concern, not blocked by this).

### Not started — everything else from the Step 1 audit

The full one-line-per-file catalogue of all 128 originally-MUI files was
produced during Step 1 (in the conversation, not saved to a file — worth
regenerating if needed via the same grep). Roughly what's left, grouped:

- **Load-bearing shared infra** (migrate carefully, everything depends on
  these): `src/components/layout/dashboard-layout.tsx`,
  `NavigationDrawer.tsx`, `header.tsx`, `breadcrumbs.tsx`,
  `notification-bell.tsx`, `src/components/providers/ThemeRegistry.tsx`
  (this one is also where the dark-mode provider bug needs fixing),
  `src/components/ui-mui/m3-components.tsx` (`M3Button`/`M3Card` — used
  across many pages including the still-unmigrated part of
  `leads/page.tsx`).
- **Admin pages/dialogs** (~40 files) — activity-types, assignment-rules,
  custom-fields, lead-scoring, opportunity-types, partners, pipelines,
  plans, roles, sales-groups, security, tenants, users, and their dialogs.
  Many of these were written by an earlier phase of work (Gamification +
  Partner Payouts) using MUI directly — `commission-rules/page.tsx`,
  `gamification/page.tsx`, `payout-cycles/page.tsx`, `partners/page.tsx`,
  `leaderboard/page.tsx`, `my-points/page.tsx`, `payouts/page.tsx` are all
  in-scope MUI usage from that work, not pre-existing.
- **Forms module** (~10 files) — `form-editor.tsx` (drag-and-drop builder,
  the biggest one here), `submissions-table.tsx`, `logic-builder.tsx`,
  `style-editor.tsx`, `mui-dynamic-field.tsx`, etc.
- **Settings pages** (~13 files) — integrations (838 lines, the largest
  single file in the whole audit), governance, permission-templates,
  teams, custom-fields.
- **Automations builder** —
  `src/app/dashboard/automations-v2/[id]/page.tsx` (1526 lines, ReactFlow
  canvas + MUI `AppBar`/`Drawer`/`Dialog` chrome around it — don't touch
  the ReactFlow canvas itself, just the MUI chrome).
- **Login page** — `src/app/login/page.tsx`.
- **Platform-admin** — layout + tenants pages.
- **Misc shared components** — `record-preview.tsx`, `notes-panel.tsx`,
  `field-history-panel.tsx`, `saved-filters-menu.tsx`, `timeline.tsx`,
  `kanban-board.tsx` (x2, opportunities + generic), `permission-matrix.tsx`,
  `role-editor-dialog.tsx`, `view-switcher.tsx`, `save-view-dialog.tsx`,
  `stat-card.tsx`, `widget-library.tsx` (Recharts-based), `dashboard-manager.tsx`.

None of these have been started. Pick them off the same way: read the file,
identify the MUI components in play, find or build the shadcn equivalent,
rewrite, verify tsc+build, move to the next.

---

## Step 4 — theme registry + selector (not started)

Blocked on nothing technically, but should happen after more of Step 3 is
done since it's pointless to add a theme *selector* while most pages are
still hardcoded to MUI's `theme.ts` and won't respond to it. Needs:

- Fix the missing `next-themes` `<ThemeProvider>` wiring first (see Step 1
  finding above) — without it, dark mode (and any future theme switching)
  has no activation path.
- A registry of named token sets following the same CSS-variable structure
  Step 2 established (primary/secondary/tertiary/surface/error/outline,
  light+dark for each). "Forest" (current green) as the first registered
  theme, pixel-identical to today.
- 2-3 additional palettes.
- Persistence — PRD says "same place other user preferences live," check
  `src/providers/general-settings-provider.tsx` for the existing pattern
  before inventing a new storage mechanism.
- Root-level provider applying the selected theme's CSS variables, no page
  reload.
- Live preview in the picker UI before committing.

---

## Step 5 — baseline UX pass (not started as its own pass)

Partially riding along with Step 3:
- Empty/loading/error states: `EmptyState`/`ErrorState`/`TableSkeleton` are
  migrated and reusable; `DataTable` wires empty+loading in automatically
  for anything using it. Still need to audit every list/panel that *isn't*
  a `DataTable` yet for missing states.
- Density toggle: built into `DataTable`, so it's covered for every page
  once migrated to it. Not present anywhere else yet.
- Action-label vs. toast/confirmation-text consistency audit: **not started
  at all.**
- Visible keyboard focus states audit: **not started at all.** Worth
  checking the new shadcn primitives got Tailwind's `focus-visible:`
  classes correctly (they should have, they follow the standard shadcn
  patterns), but the ~120 still-MUI files haven't been checked, and
  MUI/shadcn focus rings may look inconsistent where both exist side by
  side on the same page during the transition.

---

## Step 6 — checklist update (not started)

Add a "Design System Consolidation" section to `LEADSQUARED_GAP_CHECKLIST.md`
once there's enough done to report honestly (same format as the existing
"Gamification & Payouts" section there — done items with `[x]`, explicitly
deferred/remaining items with `[ ]` and a one-line note on why).

---

## Prompt to hand to the next agent

```
Continue the design system consolidation work described in
06_DESIGN_SYSTEM_HANDOFF.md — read that file in full first, then
05_DESIGN_SYSTEM_PRD.md for the original spec. Do not start over; the
audit, the token migration (Step 2), and part of the component migration
(Step 3) are already done and verified — the handoff file has the exact
details of what changed and why.

Rules carrying forward:
- No new MUI usage anywhere, including in code you write to replace other
  MUI code. If a shadcn equivalent doesn't exist yet in src/components/ui/,
  build it following the patterns already there (see button.tsx,
  skeleton.tsx, tooltip.tsx, avatar.tsx, badge.tsx, data-table.tsx for
  examples of what "built following existing patterns" looks like in this
  repo).
- Migrate one file/component at a time. Run `npx tsc --noEmit` and
  `npm run build` after each one and confirm clean before moving to the
  next — don't batch several risky changes together unverified.
- Preserve existing external prop APIs on shared components where
  possible, so callers don't all need simultaneous changes (see how
  standard-dialog.tsx kept its exact prop signature).
- Before deleting anything MUI-based that still has live consumers (e.g.
  standard-data-grid.tsx), migrate every consumer first — check with grep,
  don't assume.
- Ask before making an architectural call you're not confident about
  (e.g. whether something needs a new primitive vs. reusing one), same as
  the standing instruction from the user.

Start with: the 10 remaining StandardDataGrid consumers listed in the
handoff file's "Not started — remaining StandardDataGrid consumers"
section, using leads/page.tsx + leads/columns.tsx as the reference
pattern for how a migration should look. Then move to the load-bearing
shared infra (dashboard-layout.tsx, NavigationDrawer.tsx, header.tsx,
ThemeRegistry.tsx) — fix the missing next-themes provider wiring while
you're in ThemeRegistry.tsx, since Step 4 depends on it. After that, work
through the remaining ~100 files by area (admin pages, forms module,
settings pages, automations builder), verifying each individually.

Report progress in small batches, not as one giant diff — this codebase's
owner wants to review as you go, not review one enormous change at the
end.
```
