# UI/UX findings by file

**Companion to:** [UI_UX_IMPROVEMENT_PLAN.md](UI_UX_IMPROVEMENT_PLAN.md), §11. This file holds the detail; the plan holds the synthesis, standard patterns, navigation and phases.

**Status:** read-only review of the current code, 2026-10-01. Nothing here has been implemented.

**What was reviewed:**
- **Scope:** every UI file under `src/app` (except `src/app/api`) and `src/components` — 292 files, about 73,855 lines.
- **Elements:**

  | Element | Count |
  |---|---|
  | Dialogs | 126 |
  | Side panels (sheets) | 7 |
  | Popovers | 8 |
  | Dropdown menus | 31 |
  | Tables | 47 |
  | Tab or section sets | 33 |
  | Buttons | 1024 |
  | Form controls | 1000 |
  | `confirm()` / `prompt()` calls | 96 |
- **Method:** the files were split into 7 partitions, and each file was read in full by a dedicated reviewer against one shared rubric (the clutter budget in plan §10.4 plus the ui-ux-pro-max accessibility, interaction, form and navigation rules).
- **Line numbers** refer to the code as of 2026-10-01.
- **Superseded proposals:** where a reviewer's proposal conflicts with a decision recorded in plan §9 (decisions 1–32), the decision wins. For example, record pages keep their current layout (decision 23), and settings keeps both menus with the main sidebar collapsed to icons (decision 22).

## How to read a finding

`[rule] [severity] issue (line) → improvement`

**Severity:** H = blocks or slows daily work, loses data, or fails accessibility; M = clear friction or inconsistency; L = polish.

**Rules:**

| ID | Rule |
|---|---|
| R1 | One accent: brand colour only for actions and selection |
| R2 | One container level: no card in a card; prefer dividers |
| R3 | Type scale only: 12/14/16/18/24px, weights 400/500/600, no uppercase, nothing under 12px |
| R4 | Badges only for status, at most 2 per row |
| R5 | Header budget: title, 1 primary button, at most 2 secondary, the rest in an overflow menu |
| R6 | Toolbar in one row |
| R7 | Colour only when a value needs attention |
| R8 | No raw enums, IDs or emails as labels |
| R9 | Actions shown only when they apply; no walls of disabled buttons |
| R10 | Density: rows 40/32px, fields 40px |
| A1 | Accessible names and labels |
| A2 | Keyboard support and semantics |
| F1 | Forms: labels, required markers, inline errors |
| F2 | Destructive actions: confirmation or undo |
| N1 | Navigation and IA |
| S1 | Loading, empty and error states |
| M1 | Overlays: dialogs, sheets, popovers |
| T1 | Tables |
| E1 | Editors and builders |
| C1 | Copy |
| CH | Charts |

## Coverage

| Partition | Area | Files |
|---|---|---|
| P1 | App shell and shared components | 74 |
| P2 | Core sales: leads, opportunities, activities, tasks, lists, views | 46 |
| P3 | Dashboard, reports, marketing | 10 |
| P4 | Builders: automations, forms | 19 |
| P5 | Service, platform admin, public and auth | 48 |
| P6 | Settings | 63 |
| P7 | Admin configuration pages (rendered inside Settings) | 32 |
| **Total** | | **292** |

Each partition ends with its top changes, proposed layouts and patterns, and a table of every destructive or high-impact action and how it is confirmed today.


---

# P1 · App shell and shared components

## P1: app shell and shared components

All 73 files in the list were reviewed. "Used by" counts are importers, found by grep of `@/…` and relative imports. A count of 0 means the file is dead code.

**Repo-wide facts that shape every screen:**
- `--card` is a tinted surface, and `--accent` is the primary colour at 8%, so every hover glows brand colour.
- There is no ConfirmDialog component: 47 files call `confirm()` and 11 call `window.prompt()`.
- `<Badge>` has 278 usages in 107 files.

### src/components/layout/dashboard-layout.tsx — dashboard shell (used by 1)
- Elements: NavigationDrawer (rail/drawer/mobile sheet), sticky chrome (ImpersonationBanner, MaintenanceBanner, Header), content with PageTransition, KeyboardShortcutsProvider.
- `[S1][M]` The pre-mount placeholder (64px rail, blank bar, fake 112px card) jumps to 240px once the saved sidebar state loads (54-62), so the layout shifts on every hard load → server-readable cookie, or the final width via CSS.
- `[A2][M]` `<main>` wraps the header and banners (68-73), and there is no skip link → move the header out of `<main>`; add "Skip to content".
- `[M1][L]` PageTransition here and DashboardPageTransition both animate every route → remove one.

### src/components/layout/NavigationDrawer.tsx — primary navigation (used by 1)
- Elements: brand "U / Unnatify"; Collapse/Expand navigation; sections Pinned, My work, Sales, Service, Growth, Insights, Data operations, Administration, Custom Objects, Platform; partner flat list; mobile Sheet; rail tooltips.
- `[N1][H]` 10 sections, several with only 1–2 items ("Data operations" = Exports only; Approvals buried under Administration) → 5 groups plus Settings (decision 27).
- `[R3][M]` Section headers are `text-xs font-bold uppercase tracking-[0.04em]` (234) → sentence case, 12px, weight 500.
- `[R1][M]` The active state is shown three ways at once: header text-primary (235), rail bar bg-primary (222), item bg-secondary (176) → one indicator (decision 24).
- `[R3][L]` The active label is font-bold (189) and the brand name font-extrabold (255) → 600.
- `[N1][M]` Group open state isn't saved (70-78) → save it in localStorage.
- `[N1][M]` The collapsed rail shows about 20 icons with no dividers; icons are reused (BriefcaseBusiness for both Opportunities and Applications, 133/137; Shield/ShieldCheck) → unique icons and separators.
- `[S1][L]` Custom objects and pinned items load late and push the navigation down; errors only go to the console (97).
- `[C1][L]` Mixed casing; the brand is hard-coded (252-255) → tenant logo.

### src/components/layout/header.tsx — global top bar (used by 1)
- Elements:
  - Open navigation (mobile).
  - Search trigger "Search or run a command... ⌘K".
  - Create menu: New Lead, New Opportunity, New Task, Log Activity | New List, New Report, New Dashboard Widget, New Campaign, New Automation.
  - AgentAvailabilityToggle; Keyboard shortcuts; NotificationBell; username.
  - Account menu: email, "Tenant: {id}", Settings, Log out.
  - Dialogs: GlobalSearch, CreateLead, CreateOpportunity, CreateActivity.
- `[R8][H]` Raw `Tenant: {user?.tenantId}` (181); the username and initials come from the email (78, 158) → tenant name and user.name.
- `[S1][H]` The create dialogs call `window.location.reload()` on success (208/214/220) → toast with "Open record", plus router.refresh.
- `[N1][M]` The Create menu mixes 4 dialogs with 5 page jumps (124-135); "New Campaign" and "New Dashboard Widget" don't create anything → keep only record creates here.
- `[R6][M]` The right-hand cluster has 7 items and both rows can wrap (82, 107) → no wrap; move shortcuts into the account menu.
- `[C1][M]` Title Case labels → sentence case.
- `[R1][L]` The avatar fallback is bg-primary (169) → neutral.
- `[F2][L]` Log out silently drops unsaved drafts → warn first.

### src/components/layout/agent-availability-toggle.tsx — rep status (used by 1, telephony only)
- `[S1][M]` Shows "Offline" before the fetch and when it fails (30, 35) → unknown/loading state.
- `[A2][L]` Options are plain menu items → DropdownMenuRadioGroup.
- `[C1][L]` "On Break" → "On break".

### src/components/layout/breadcrumbs.tsx — breadcrumbs (used by 0, dead)
- `[N1][M]` Not mounted anywhere.
- `[R8][H if mounted]` Labels are URL segments, so record IDs would show (31); text is 13px.
- → Delete, or rebuild with route labels inside PageHeader.

### src/components/layout/builder-workspace.tsx — editor shell (used by 2)
- `[A2][M]` The panel switcher is a button group acting as tabs (32-33) → tablist.
- `[N1][M]` The active panel isn't in the URL.
- `[S1][L]` Height is measured in JS with a 300ms timeout (17-29) → CSS calc.

### src/components/layout/dashboard-page-transition.tsx (used by 1)
- `[M1][L]` Duplicates PageTransition, and its exit animation never runs (constant key) → delete.

### src/components/layout/impersonation-banner.tsx (used by 1)
- `[A2][L]` White text on yellow-600 has low contrast (55) → dark text.
- Typo `wh-5` (44).
- Narrower `container` than the rest of the shell.
- "Exit Impersonation" → "Exit impersonation".

### src/components/layout/maintenance-banner.tsx (used by 1)
- `[R7][L]` Amber full-width banner that can't be dismissed → dismiss per session; info Alert style.

### src/components/layout/notification-bell.tsx — notifications (used by 1)
- `[A2][H]` Rows are `<button>`s inside DropdownMenuContent and "Clear all" sits inside the label (70-100), so arrow keys don't work → Popover list, or real menu items.
- `[F2][M]` "Clear all" is irreversible (72) → "Mark all as read" plus undo.
- `[N1][M]` Clicking a notification deletes it; there's no history or "View all" → keep read items, add a notifications page.
- `[R3][M]` The count is 11px bold (54) → 12px, "9+", include the count in aria-label.

### src/components/layout/page-header.tsx — page title bar (used by 59)
- `[R5][H]` `actions` accepts any ReactNode and wraps (14) → primaryAction / ≤2 secondaryActions / overflowActions, no wrap.
- `[N1][M]` No back, breadcrumb or meta slot.
- `[R3][L]` `tracking-tight` (11).

### src/components/layout/settings-sections.tsx — section switcher (used by 6)
- `[N1][H]` The active section isn't in the URL (13) → `?section=`.
- `[A2][M]` Buttons behave as tabs, and aria-controls points at sections that aren't mounted yet (28) → tablist/tabpanel.
- `[R6][M]` Buttons wrap onto several rows (27) → a scrollable tab bar, or a left nav.

### src/components/providers/ThemeRegistry.tsx (used by 1)
- OK. `[L]` defaultTheme "light" ignores the system setting → "system".

### src/components/search/global-search.tsx — command palette (used by 1)
- Elements:
  - Input.
  - Groups: Favorites, Recent, Quick Create, Navigate, Settings, Leads, Opportunities, Activities, Tasks, Partners.
  - "No results found."
- `[S1][H]` cmdk re-filters server results by `value={lead.name}` (340, 357), so matches by email, phone or company are hidden and duplicate names collide → `shouldFilter={false}` for record groups, value = id.
- `[S1][H]` Search errors only go to the console (145), so the user just sees "No results" → show "Search failed. Retry".
- `[S1][M]` No "Searching…" state.
- `[N1][M]` Commands appear above records (314 vs 335) → records first once a query is typed.
- `[N1][M]` Task, activity and partner hits open list pages without an id (158-160) → deep links.
- `[A1][M]` No DialogTitle (257).
- `[C1][M]` "Open Views / Run Reports / Queue Exports / Launch Automations" → "Go to …".

### src/lib/keyboard-shortcuts.tsx — shortcut registry and help (used by 4)
- `[A1][M]` Nested labels (193-195).
- `[R3][M]` Uppercase group headings (199, 211).
- `[N1][L]` Disabling shortcuts hides the list (197).
- `[A2][L]` Bare-key shortcuts fire while menus are open (54-58).
- `[C1][L]` Title Case labels.

### src/lib/server/invoice-pdf.tsx (used by 1)
- `[R8][L]` CGST, SGST and IGST all print even when zero (205-216).
- 8pt uppercase labels (12).
- Otherwise OK.

### src/lib/server/report-pdf.tsx (used by 1)
- `[R8][M]` Raw object keys as column headers (44, 170), objects printed with JSON.stringify (25), raw widget.type (162) → labels and formatted values.
- `[T1][M]` Numbers aren't formatted or aligned.
- `[C1][L]` Dates use the server timezone (39, 150) → formatTenantDate.

### src/components/common/standard-dialog.tsx — app dialog (used by 71)
- `[R3][M]` Title is font-extrabold (84).
- `[R1][M]` Every dialog gets a brand-tinted icon tile (79) → remove it, or make it neutral.
- `[F2][H]` No destructive/confirm variant, which is why `confirm()` is used in 47 files → ConfirmDialog.
- `[M1][M]` The xl size is 1536px, i.e. a full page → cap at lg; anything bigger becomes a page or sheet.
- `[F1][M]` The footer sits outside the form, so Enter doesn't submit → formId / onSubmit.
- `[M1][L]` Padding differs between header, body and footer: 18/16/18 (76/102/107).
- The dirty guard uses `window.confirm`.

### src/components/common/empty-state.tsx (used by 25 + DataTable + ModuleGate)
- `[S1][H]` No difference between "nothing exists yet" and "no matches" → variant prop with "Clear filters".
- `[R1][M]` bg-primary/8 circle (27-28).
- `[R3][M]` text-lg font-bold (32).
- `[R10][L]` About 300px tall inside panels → compact size.

### src/components/common/error-state.tsx (used by 66)
- `[R3][M]` text-lg font-bold (36).
- `[S1][L]` Needs an inline variant.
- `[C1][L]` Default copy is generic.
- Otherwise OK.

### src/components/common/module-gate.tsx (used by 8)
- `[S1][M]` "Ask a platform admin" comes with no action → link for admins. Otherwise OK.

### src/components/common/skeletons.tsx (used by 18 + DataTable)
- `[S1][M]` TableSkeleton draws a different toolbar and card from the real table, so the content shifts when it loads.
- `[R2][M]` PageSkeleton stacks bordered cards.

### src/components/common/DynamicFormRenderer.tsx — record forms (used by 3)
- `[C1][H]` The button reads `Save ${objectName}`, which renders a raw key or "Save undefined" (273) → "Create lead" / "Save changes".
- `[F1][H]` No error summary or focus on the first invalid field; the save error shows at the bottom (264).
- `[F1][M]` An empty required NUMBER becomes 0 and passes validation (75).
- `[S1][M]` A spinner instead of field skeletons (204-209).
- `[E1][M]` A long "unsaved changes" sentence (221) → a small "Unsaved" marker.
- `[L]` A "General Information" heading shows even when there is only one group (217).

### src/components/common/condition-builder.tsx — rule conditions (used by 5)
- `[A1][M]` The Field/Operator/Value labels aren't linked to their controls (169, 189, 203); remove buttons don't name the row.
- `[R3][M]` Uppercase title (134).
- `[R2][M]` Every row is a bordered tinted card (167).
- `[C1][M]` Jargon in the empty note; Title Case.
- `[E1][L]` `key={index}` (166).
- `[L]` Its operator vocabulary differs from FilterBuilder and AdvancedFilterDrawer → merge.

### src/components/common/field-history-panel.tsx (used by 0, dead)
- If revived:
  - `[R8][H]` Raw keys, enums and JSON (82, 174, 191).
  - `[R7][M]` Solid red/green chips.
  - `[S1][M]` An error shows as "No history".
- → Delete, or rebuild as the History tab.

### src/components/common/notes-panel.tsx — record notes (used by 2)
- `[F2][H]` Delete uses `confirm()` (126) and discard uses `window.confirm` (200) → ConfirmDialog plus undo.
- `[S1][H]` The fetch effect depends on submitting/pendingAction (69-80), so the list clears and reloads after every action → refetch only when the entity changes.
- `[R3][M]` Text below 12px: 0.6rem, 0.72rem, 0.7rem (248, 238, 180).
- `[R4][M]` Count badge, Pinned badge and an amber border together → a "Pinned" subsection.
- `[R2][M]` Card per note → dividers.
- `[R9][M]` Three icon actions always visible on every note → show on hover, or a ⋯ menu.
- `[C1][L]` The submit is an icon-only Send → a text button.

### src/components/common/record-preview-popover.tsx (used by 2)
- `[R8][M]` Raw status in an uppercase badge (79).
- `[R3][M]` 0.65rem uppercase text (79, 93).
- `[C1][L]` Placeholder text when values are empty → hide those lines.

### src/components/common/record-preview.tsx — quick-view sheet (used by 1)
- `[R9][H]` The "Edit" button has no onClick (111-114).
- `[M1][H]` The "open" icon overlaps the sheet's default X (67-78).
- `[S1][M]` Only leads load; opportunity/activity show "No data found"; errors also show "No data found"; loading is plain text.
- `[R3][M]` Uppercase tracked labels (97, 105).
- `[R2][M]` A Company box next to the contact card.
- `[A1][L]` `title` used instead of aria-label (74).

### src/components/common/record-share-dialog.tsx (used by 2)
- `[F2][H]` If loading the current shares fails, it falls back to empty lists (39), and Save then revokes every share → block Save and show an error.
- `[R9][M]` Shows only "N selected", with no search → a combobox with chips.
- `[S1][M]` Load failures show as "No users".
- `[A1][M]` Labels aren't linked to controls.
- `[R8][L]` Raw IDs as a fallback.

### src/components/common/saved-filters-menu.tsx (used by 1)
- `[A2][H]` The delete button is nested in a menu item and only appears on hover (199-206).
- `[F2][M]` Delete is immediate.
- `[N1][M]` A third saved-filter system, and `isDefault` is never applied → Saved Views.
- `[C1][L]` "Filter" and "view" used interchangeably.

### src/components/data/floating-bulk-actions.tsx (used by 0, dead)
- `[A1][M]` Unlabelled buttons. Duplicates BulkActionsToolbar → delete.

### src/components/data/import-dialog.tsx (used by 0, dead)
- `[F1][H]` The CSV parser splits on commas, so quoted fields break (66).
- "Drag and drop" is promised but missing.
- No column mapping; rows are imported one by one → delete.

### src/components/filters/advanced-filter-drawer.tsx — filter sheet (used by 4)
- `[F1][H]` Presets are named via `window.prompt` (163).
- `[E1][M]` How groups combine is never shown.
- `[F2][M]` Preset delete is immediate; presets live only in localStorage.
- `[S1][M]` No "Clear all"; closing discards edits silently.
- `[R2][M]` Tinted group boxes.
- `[C1][M]` Jargon ("AND/OR logic across groups"); Title Case.

### src/components/filters/filter-builder.tsx (used by 1)
- `[A1][H]` Unlabelled remove buttons and controls (269-276).
- `[C1][M]` Raw AND/OR toggle → "All / Any".
- `[R3][M]` font-extrabold.
- `[R4][L]` Badges for counts and logic.
- `[C1][L]` "True/False" here vs "Yes/No" elsewhere.

### src/components/bulk-actions/bulk-toolbar.tsx — floating bulk bar (used by 8)
- `[M1][H]` `z-[1300]` (144) sits above every dialog, including the confirmations it opens → z-40, hidden while a modal is open.
- `[T1][M]` Covers pagination.
- `[C1][M]` Noun labels → verbs.
- `[R9][M]` 7 inline actions with destructive ones mixed in → 3 plus "More", destructive last.
- `[R3][L]` 13px text.
- `[A2][L]` The selection count isn't announced.
- `[L]` 16 module-specific props → a generic `actions[]`.

### src/components/bulk-actions/bulk-add-tags-dialog.tsx (used by 0, dead)
- `[F2][H]` "Update Tags" replaces existing tags → delete.

### src/components/bulk-actions/bulk-update-status-dialog.tsx (used by 0, dead)
- `[R8][M]` Hard-coded statuses; toast typo "Leads improved successfully" → delete.

### src/components/ui/button.tsx (used by 177)
- `[R10][M]` Radius 10px here vs 6px inputs vs 12px popovers → one radius token.
- px-6 is wide; xs (28px) is below the density target.
- `[L]` Shadows are inconsistent → none.

### src/components/ui/badge.tsx (used by 107 files / 278 usages)
- `[R4][H]` It's the default way to render any value → tone variants, status only.
- `[R1][M]` Default is a solid brand colour.
- `[R7][M]` Destructive is solid red → soft.

### src/components/ui/card.tsx (used by 81)
- `[R2][H]` Tinted, bordered default; about 20 files stack more than 3 cards → borderless Section with dividers; Card only at the top level, on white.
- `[R10][M]` 24px padding → 16px.
- `[R3][L]` CardTitle has no size set.

### src/components/ui/checkbox.tsx (used by 31)
- `[R1][M]` Unchecked border is border-primary (16) → border-input.

### src/components/ui/color-picker.tsx, icon-picker.tsx (used by 0, dead)
- `[A1][M]` title-only swatches and icons.
- The icon picker imports all of lucide.
- → Reuse after fixing, or delete. P7 found duplicate hand-rolled pickers in the type dialogs.

### src/components/ui/command.tsx (used by 2)
- `[A1][M]` No DialogTitle (31).
- `[R3][L]` tracking-widest.
- GlobalSearch duplicates its styles.

### src/components/ui/data-table.tsx (used by 13)
- `[A2][H]` Row click is a `tr onClick` with no keyboard support (341-345) → a link in the primary cell, Enter, focus ring.
- `[S1][H]` Loading, error and empty states return early and drop the toolbar, pagination and selection (250-273) → keep the chrome; add `isFiltered`.
- `[T1][H]` No sort, search, sticky header, numeric alignment or mobile layout.
- `[R6][M]` A whole toolbar row for 2 icons; toolbarActions is unused (277-325) → move into the page toolbar.
- `[R10][M]` Row heights 36/46px → 32/40px.
- `[R8][M]` The column menu falls back to column.id (320).
- `[T1][M]` Prev/next only, with no page count.
- `[R1][L]` Primary-tinted selection banners.

### src/components/ui/dialog.tsx (used by 15 directly, 71 via StandardDialog)
- `[M1][M]` Two dialog systems with different padding, radius and title weight, and the header scrolls away (64) → one system.

### src/components/ui/dropdown-menu.tsx (used by 23)
- OK. `[R3][L]` The shortcut uses tracking-widest.

### src/components/ui/form.tsx (used by 2)
- `[F1][M]` No required marker, and only 2 forms use it → add `required`; adopt it everywhere.

### src/components/ui/input.tsx (used by 98)
- `[A2][M]` Focus has a ring colour but no ring width, so only the border changes (12) → ring-2.
- `[R10][M]` h-9 next to 40px buttons → h-10.

### src/components/ui/label.tsx (used by 102)
- `[F1][M]` No required indicator → `required` prop.

### src/components/ui/page-transition.tsx (used by 2)
- `[M1][L]` Applied twice per route.

### src/components/ui/popover.tsx (used by 7)
- OK. `[L]` rounded-xl vs rounded-md menus.

### src/components/ui/radio-group.tsx (used by 4)
- `[R1][L]` Primary unchecked border.

### src/components/ui/scroll-area.tsx (used by 1)
- OK.

### src/components/ui/select.tsx (used by 91)
- `[R10][M]` h-9 and w-fit by default (40), so form fields end up with uneven widths → h-10, and w-full in forms.

### src/components/ui/separator.tsx (used by 5)
- OK. Many files hand-roll `h-px bg-border` → use Separator.

### src/components/ui/sheet.tsx (used by 7)
- `[M1][M]` 384px default with no size presets, no focus restore or dirty guard; the default X overlaps header actions → sizes sm/md/lg, guard, actions slot.

### src/components/ui/skeleton.tsx (used by 6)
- `[R1][L]` bg-accent is brand-tinted → muted.

### src/components/ui/sonner.tsx (used by 1)
- OK.

### src/components/ui/switch.tsx (used by 36)
- OK; callers must supply labels.

### src/components/ui/table.tsx (used by 18 + DataTable)
- `[R3][H]` TableHead is uppercase, tracking-wider, font-semibold, h-12 (79) and affects every table → sentence case, 500.
- `[R10][M]` TableCell is p-4 nowrap (92), so raw tables have rows over 52px → px-3 py-2.
- `[T1][M]` No sticky or numeric options.

### src/components/ui/tabs.tsx (used by 21)
- `[N1][M]` No URL sync; overflow has no cue.

### src/components/ui/textarea.tsx (used by 41)
- OK.

### src/components/ui/tooltip.tsx (used by 21)
- `[M1][M]` One Provider per tooltip with delayDuration=0 (8-11, 25), so tooltips pop instantly → one app-level provider, ~400ms.

### src/components/ui/accordion.tsx (used by 2)
- OK.

### src/components/ui/alert.tsx (used by 21)
- `[A2][M]` Always role="alert", so static info is announced assertively (32) → role="status" for info.
- `[R1][L]` Brand-tinted info.

### src/components/ui/avatar.tsx (used by 17)
- `[R1][L]` Fallback is bg-primary/10, text-primary, bold (45) → neutral.

### src/providers/notification-provider.tsx (used by 3)
- `[S1][M]` markAsRead deletes the item, and the unread count uses `max(prev, length)` (74, 126).
- `[R9][L]` Every server event becomes a toast → only high-priority ones.

### src/providers/inbound-call-popup-provider.tsx — incoming call (used by 1)
- `[M1][H]` A modal blocks the app during a live call, and a second modal can stack on top (238-258) → a non-modal docked panel.
- `[R8][H]` Raw lead.status and activity.outcome (139, 211).
- `[A2][M]` A Link wraps a Button (151-156).
- `[F1][M]` Unlabelled task input; validation via toast.
- `[S1][M]` "Assign to me" PATCHes the whole lead snapshot (74).
- `[R2][M]` Cards inside the dialog.
- `[N1][L]` "Open Timeline" doesn't select the tab.

### src/providers/auth-provider.tsx (used by 28)
- `[S1][M]` A network failure on /auth/me looks the same as being logged out (27-38).
- `[F2][L]` Logout doesn't check for unsaved drafts.

### src/providers/general-settings-provider.tsx (used by 1)
- `[S1][H]` `<div key={…version}>` (45) remounts the entire app whenever display settings change, so open dialogs, typed input and scroll position are lost → formatters subscribe to a store.

### src/providers/editor-draft-provider.tsx (used by 9), ai-message-draft-provider.tsx (used by 1)
- `[E1][M]` In-memory only; no route-change guard; the only cue is a long sentence → "Draft" chip and a guard; merge the two stores.

### src/providers/color-theme-provider.tsx (used by 1)
- OK.

### P1 summary
**Top changes:**
- ConfirmDialog.
- Table header fix.
- DataTable chrome, sort, keyboard and density.
- GeneralSettingsProvider remount.
- Global search fixes.
- PageHeader action budget.
- Navigation simplification.
- Badge tones.
- Card/Section.
- Bulk toolbar z-index and verbs.
- Header identity and no reload.
- Share-dialog safety.
- Docked call panel.
- URL state for tabs and sections.
- Form primitives (40px, focus ring, required marker, error summary).

**Create:**
- ConfirmDialog
- Section/DescriptionList
- StatusBadge
- useUrlState
- DataTableViewOptions
- Notifications page
- usePermissions
- app TooltipProvider

**Merge:**
- ConditionBuilder + FilterBuilder + AdvancedFilterDrawer
- SavedFiltersMenu + drawer presets → Saved Views
- Dialog + StandardDialog
- the two draft providers
- Sheet → sizes, guard and actions slot

**Delete:**
- bulk-add-tags-dialog
- bulk-update-status-dialog
- floating-bulk-actions
- import-dialog
- field-history-panel (or rebuild)
- breadcrumbs (or rebuild)
- color-picker / icon-picker (or fix and reuse)
- dashboard-page-transition

**Destructive or irreversible actions in this partition:**

| Action | Confirmation today |
|---|---|
| Notes delete / discard | `confirm()` |
| Dialog dirty close | `window.confirm` |
| Saved filter delete | None |
| Filter-drawer preset delete | None |
| Notifications "Clear all" | None |
| Notification click | Deletes it, no undo |
| Log out | None; unsaved drafts are lost |
| Share dialog Save | None; can revoke every share |
| Bulk bar actions | Left to each page (mostly `confirm()`) |
| DataTable "Select all N" | Widens bulk scope with no confirmation |
| Inbound call "Assign to me" / "Dismiss" | None |

---

# P2 · Core sales: leads, opportunities, activities, tasks, lists, views

## P2 core sales UI/UX review

I opened and reviewed all 46 files in P2-core-sales.txt. To check behaviour I also read four helpers outside the list: `/Users/arjunh/Documents/crm/crm/src/components/common/record-preview.tsx`, `standard-dialog.tsx`, `DynamicFormRenderer.tsx` and `/Users/arjunh/Documents/crm/crm/src/components/ui/data-table.tsx`.

**Platform facts that apply everywhere below:**
- **No sorting or sticky header in DataTable.** It has no sort handlers and no sticky header, so every `sortingFn` defined in the column files does nothing.
- **Save button sits in the scrolling body.** DynamicFormRenderer puts its Save/Cancel inside the form body, not in the dialog footer, and labels the button `Save ${objectName}`.
- **Most dialogs use StandardDialog.** Sizes: xs 444px, sm 600px (the default), md 900px, xl 1536px.

---

### /Users/arjunh/Documents/crm/crm/src/app/dashboard/activities/activities-mobile-list.tsx — mobile activity cards
- Elements: one card per activity (type badge, notes, outcome badge, due/completed line, Lead/Opp links); empty box "No activities found."
- `[R3] [H]` Text smaller than 12px: type badge is 10px bold uppercase (35), outcome badge 10px (50), links 11.2px bold (75) → use 12px at weight 500, no uppercase.
- `[R8] [H]` Outcome shows the raw enum, e.g. `FOLLOW_UP_NEEDED` (52) → map to labels.
- `[R7] [M]` Every activity with a due date is amber, even future ones (60-64) → colour only when overdue.
- `[R1] [M]` Type badge takes colour from the database hex (36-40) → neutral badge with an 8px colour dot.
- `[N1] [M]` The card itself does nothing when tapped and has no "Mark done" (25-27) → make the card open the related record and add a done action.
- `[S1] [M]` Empty state looks the same for "nothing exists" and "no match", and has no call to action (14-19).
- `[C1] [L]` "Opp:" abbreviation (89) and the "✓" glyph (68).

### /Users/arjunh/Documents/crm/crm/src/app/dashboard/activities/activity-form.tsx — Log Activity form
- Elements (StandardDialog, sm 600px): Activity Type* (select; only required field; inline zod error), Related Lead, Related Opportunity, Outcome, Notes (textarea), Due Date (optional, datetime), plus fields specific to the chosen type. Buttons Cancel and Save, inside the body. Unsaved-changes guard comes from the renderer.
- `[C1/F1] [H]` The Save button reads **"Save undefined"**: `metadata` is passed but no `objectName` (313-319; DynamicFormRenderer L273) → pass `objectName="activity"` and label it "Log activity".
- `[T1/F1] [H]` Lead and opportunity pickers load only the first 100 records (68-69) and have no search. Records beyond 100 cannot be linked, and the lead pre-filled from a detail page can show blank → async searchable combobox that preloads the default record.
- `[A1] [M]` Labels are not linked to their controls: Activity Type (160), Outcome (204), Related Lead (251), Related Opportunity (278). The asterisk is typed into the label text.
- `[F1] [M]` When opened from a record, Lead/Opp should collapse to a read-only "Related to: X" chip, with Notes directly under Type (call-logging order).
- `[E1] [M]` Fetching the type-specific fields has no catch, so failures are silent (122-135).
- `[S1] [L]` "Loading activity form..." is plain text (302) → skeleton.
- `[F1] [L]` Only "Due Date (optional)" says optional (231) → be consistent.
- `[R7] [L]` SLA info box is primary-tinted (189).

### /Users/arjunh/Documents/crm/crm/src/app/dashboard/activities/columns.tsx — activities table columns
- Elements: Type, Description, Outcome, Time, Related To, Forms (a panel button in every row).
- `[R3/R8] [H]` Type badge bold uppercase (27); outcome raw enum in uppercase (58-59).
- `[R1/R7] [M]` Each row's type badge is painted in its database hex colour (28-32).
- `[T1/R9] [M]` A Forms button is rendered in every row (115-130), and there are no edit, complete or delete row actions → one row overflow menu (Edit, Mark done, Forms, Delete).
- `[C1/R1] [M]` "(Lead)"/"(Opp)" suffixes with a "|" separator (99, 108); the opportunity link uses `text-secondary`, a second accent → "Lead · Name" with the same link style.
- `[R10] [L]` Time cell has `min-h-11` (44px) (73), pushing rows past 40px.

### /Users/arjunh/Documents/crm/crm/src/app/dashboard/activities/create-activity-dialog.tsx — Log Activity dialog wrapper
- Elements: trigger "Log Activity"; StandardDialog sm titled "Log Activity", subtitle "Record an interaction…", contains ActivityForm.
- `[A2] [M]` Custom triggers are wrapped in `<div onClick>` (39) → use a Radix `asChild` trigger.
- `[C1] [M]` Title doesn't say which record the activity is for → "Log activity · {record name}".
- `[M1] [M]` Save sits in the scrolling body, not the footer.

### /Users/arjunh/Documents/crm/crm/src/app/dashboard/activities/page.tsx — Activities list
- Elements: header actions (Export, Refresh icon, Activity-type select, Filters (n), Log Activity); AdvancedFilterDrawer; DataTable (25 rows) or mobile list; bulk toolbar with "Mark Completed".
- `[T1] [H]` "Select all" claims "All N activities selected" (168), but it only takes the current page's IDs, and bulk complete patches only those (165-168, 177) → real server-side bulk, or honest wording.
- `[R5] [H]` Filter controls live in the page header (195-244) → header = title + "Log activity" + overflow (Export); a toolbar row holds search, type, Filters and refresh.
- `[T1] [H]` No search, no sort, row click does nothing.
- `[A1] [M]` Refresh icon button has no aria-label; the tooltip is not an accessible name (210).
- `[N1] [M]` Filters are read from the URL once (149-151) but never written back.
- `[S1] [M]` Same copy for "no activities" and "no match" (259-265, 289-294) → no-match state with "Clear filters". There is also a duplicate page-level and table-level empty state.
- `[F2] [L]` Bulk complete gives no undo.

### /Users/arjunh/Documents/crm/crm/src/app/dashboard/leads/[id]/page.tsx — Lead record
- Elements:
  - **Header:** Back, title, status badge, primary "Log Call Outcome" (telephony only), and a "More actions" disclosure holding Favorite, +Activity, +Opportunity, Case, AI Assistant, Forms, Push to External, Share and Edit.
  - **Left panel:** gradient identity card (avatar, name, italic status, email/phone/company/source, three metrics); "Lead Properties"; "Quick Snapshot"; PredictiveScore; Next-best-action panel; CallScript.
  - **Main area, 8 tabs:** Activity History (n), Lead Details, Scoring, Opportunities (n), Tasks (n), Communications, Notes, Audit. The Activity tab has a filter bar (type, time) and the Timeline.
  - **Dialogs:** EditLead (sm), ExternalPush, LogCallOutcome, RecordShare, ApplyPlaybook (sm).
- `[R5/R9] [H]` Edit, +Activity and +Opportunity are all hidden inside "More actions". Without telephony the header has **no visible action at all** (254-333) → show Log activity (primary), New task, Edit; everything else in a ⋯ menu.
- `[R1/R5] [H]` Two filled primaries ("Log Call Outcome" 254 and "Edit" 324) plus a third style (secondary-container, 277).
- `[E1] [H]` Nothing can be edited in place. Changing status = More actions → Edit → form → Save (5+ clicks) → inline-editable property rows.
- `[N1] [H]` Owner is shown nowhere on the record, and there is no single-record reassign → Owner row with an inline picker.
- `[R2] [H]` Cards inside cards: identity, properties and snapshot cards with inner SnapshotCard boxes (345-403); tab Card with DetailPanel Cards inside (467-478); extra rounded wrappers (532, 538, 550, 557) → one surface with dividers.
- `[R4/C1] [H]` The same data repeats across the panels:

  | Field | Times shown | Lines |
  |---|---|---|
  | Status | 4 | 250, 355, 380, 469 |
  | Score | 3, plus the whole score panel in both the left panel and the Scoring tab | 368, 399, 405, 483 |
  | Email/phone | 4 | 336-337, 360-361, 387-388, 474-475 |
  | Created/Updated | 2 | — |

  → one "About" section.
- `[R7/R1] [H]` Saturated primary-gradient hero block (346).
- `[R3] [H]` 9.6px extrabold uppercase badge (250), 10.9px badge (382), extrabold throughout (354, 376, 397, 489, 515, 642), uppercase "ACTIVITY FILTERS" (431), italic status (355).
- `[R8] [H]` Status and source shown as raw enums.
- `[T1] [H]` Loads `/opportunities` without a lead filter and filters in the browser (125, 134). Once results paginate, linked opportunities go missing → use a `?leadId=` query.
- `[N1] [M]` Tab state is not in the URL (107). `router.back()` (246) can leave the app on a deep link → fall back to `/dashboard/leads`.
- `[N1] [M]` Eight tabs is too many: the Scoring tab duplicates the left panel; Notes, Communications and Activity should merge into one timeline.
- `[S1] [M]` Full-page spinner (217-223) → skeleton. Activities capped at 100 with no "load more" (139).
- `[C1] [M]` "Deals" vs "Opportunities" (370). "Open Opportunity Value" sums every opportunity, including closed ones (208).
- `[R10] [M]` Placeholder rows "No email" / "No phone" (360-363) → hide empty fields. The push badge takes a whole row (339-341).

### /Users/arjunh/Documents/crm/crm/src/app/dashboard/leads/columns.tsx — Leads table columns
- Elements: Lead Name (avatar + link), Email, Status (inline select), Source, Predictive Score, Next Best Action chip, Created, actions (Preview, Open, Edit).
- `[R8/R3] [H]` Inline status select shows the raw uppercase enum in bold (62-70).
- `[F/Data] [H]` Status options are NEW/QUALIFIED/LOST/CONVERTED (19-26). The filter drawer adds CONTACTED (`leads/page.tsx` 393) and `view-row-actions.tsx` (36) has a different set. A CONTACTED lead gets no style and can't be re-selected → one shared status source.
- `[R7] [M]` Every status is coloured (NEW is blue on every row) → colour LOST only.
- `[E1/F2] [M]` Inline status change has no confirm for LOST/CONVERTED and no undo (48-55).
- `[T1] [M]` `sortingFn` (120) is dead code because the table has no sorting.
- `[R9] [M]` Three icon buttons in every row (146-189); Preview duplicates the row click and Open duplicates the name link → one ⋯ menu.
- `[R4] [M]` Status pill, score band badge and NBA chip = 3 badges per row.
- `[T1] [M]` No Owner, Phone, "Last activity" or "Next task" columns.
- `[R3] [L]` Name is bold in primary colour (90).

### /Users/arjunh/Documents/crm/crm/src/app/dashboard/leads/create-lead-dialog.tsx — Create lead
- Elements (StandardDialog sm): title "Create New Lead", subtitle "Add a new prospect…"; a Forms panel button above the form; fields from metadata with inline zod errors and required markers from the renderer; Cancel / "Save lead" in the body.
- `[R5/M1] [H]` A second create entry point (ContextualFormsPanel) sits inside the create dialog (48-57) → remove it.
- `[A2] [M]` `<div onClick>` trigger (33).
- `[N1] [M]` No "Save & open" or "Save & add another"; no link to the new lead after saving.
- `[C1] [L]` "Add Lead" button, "Create New Lead" title and "Save lead" button use three different verbs.

### /Users/arjunh/Documents/crm/crm/src/app/dashboard/leads/edit-lead-dialog.tsx — Edit lead
- Elements (StandardDialog sm): "Edit Lead", subtitle "Update lead details and classification"; spinner while loading, then ErrorState with retry or LeadForm; Cancel / "Save lead".
- `[C1] [L]` Button should say "Save changes"; the subtitle is filler.
- `[S1] [L]` Spinner (65-68) → skeleton.
- Otherwise OK.

### /Users/arjunh/Documents/crm/crm/src/app/dashboard/leads/lead-form.tsx — LeadForm wrapper
- OK (thin wrapper).

### /Users/arjunh/Documents/crm/crm/src/app/dashboard/leads/lead-quick-view.tsx — legacy lead sheet
- Elements: Sheet 400/540px; title = name, email, status badge; "View Full Profile"; tabs Details / Recent Activity.
- `[N1] [H]` **Not imported anywhere** (the list uses RecordPreview) → delete it.
- `[A2] [M]` `<Link><Button>` nests one interactive element in another (72-75).
- `[S1] [M]` Errors only go to `console.error` (39), so the skeleton spins forever.
- `[C1] [M]` "Recent Activity" tab actually shows audit history (140-145).
- `[R3] [L]` Uppercase headings (88, 109, 127).

### /Users/arjunh/Documents/crm/crm/src/app/dashboard/leads/mobile-list.tsx — mobile lead cards
- Elements: card with name link, source + first tag, status badge, email, phone, every tag as a badge, "Added" date.
- `[N1] [H]` Phone and email are not tappable `tel:`/`mailto:` links (45-56). This is the most important action for mobile reps.
- `[R8] [H]` Raw status enum (38-40).
- `[R4] [M]` Status plus every tag as badges (38, 61-65).
- `[R2] [M]` Heavy Card with CardHeader/CardContent for each row (24) → list rows.
- `[S1] [M]` "No leads found." with no call to action and no no-match distinction (13-18).

### /Users/arjunh/Documents/crm/crm/src/app/dashboard/leads/page.tsx — Leads list
- Elements: header (Export, Filters, "Create Lead + Opportunity", "Add Lead"); a row of status count badges; AdvancedFilterDrawer (12 fields); DataTable (10 rows) inside a Card; mobile list; bulk toolbar (Assign, Add To List, Delete); RecordPreview sheet; EditLeadDialog; shortcuts `r` and `a`.
  - **Dialog "Add selected leads to list":** xs; Static List select, silently pre-filled; Cancel / "Add To List".
  - **Dialog "Reassign selected leads":** xs; New Owner and Reason, both required but unmarked, labels not linked; Reassign stays disabled with no explanation.
- `[T1/F2] [H] DATA-INTEGRITY BUG` After "Select all", Assign and Add-to-list fetch `/leads?page=1&limit=5000` **without the active filters** (287-292), so they act on every lead in the tenant. Delete sends `all:true` with no filters (271-276); confirm what the server does. → send the filter payload to the bulk endpoints.
- `[F2] [H]` Bulk delete is a `window.confirm` (268) with no typed confirmation and no undo.
- `[T1] [H]` No search box on the busiest list. No sort, no sticky header, 10 rows by default (111).
- `[N1] [H]` Applied filters never reach the URL (171-176), so back, refresh and share lose them. No saved-view picker (ViewSwitcher exists but isn't used).
- `[N1] [H] Dead ends` Row click opens RecordPreview, and inside it:
  - its **Edit button has no handler** (`record-preview.tsx` 111-114);
  - **"Log Activity" and "Create Opportunity" do nothing** (`lead-contact-card.tsx` 168-175, handlers never passed).

  → row click opens the record; wire up or remove the preview actions.
- `[R5] [H]` Four header actions including two create buttons (353-375) → title + "New lead" split button (▾ Lead + opportunity); Export in ⋯; Filters move to the toolbar.
- `[R6/R4/R8] [M]` Status count badges are a separate, non-clickable row of raw enums (41-63, 378) → clickable status segments inside the toolbar.
- `[S1] [M]` Empty state says "Get started by adding your first lead" even when it's a filter no-match (443-448).
- `[F1] [M]` Add-to-list with no lists shows red text with no link (512) → link to "Create list".
- `[R9] [M]` Bulk "Status" and "Tags" exist in BulkActionsToolbar but aren't wired.

### /Users/arjunh/Documents/crm/crm/src/app/dashboard/lists/[id]/page.tsx — List detail
- Elements: custom header (back icon, H1, type badge, count badge, description, Refresh, Add Leads); search inside its own Card; DataTable (Lead Name, Email, Phone, Company, "Stage", Source, Created On, Open / Remove); bulk "Delete" (actually removes from list).
  - **Dialog "Add leads to {name}":** md 900px; multi-select combobox; Cancel / "Add To List".
- `[T1] [H]` The add dialog loads up to 5000 leads into the browser and renders them all (82, 391-411) → server-side search.
- `[N1] [H]` No rename, edit filters, delete list, export, or bulk Assign/Status from a list, so the "bulk update from a list" flow can't happen here.
- `[R8/C1] [H]` Column "Stage" shows the raw lead status (199-205) → "Status" with labels.
- `[F2/C1] [M]` Bulk action labelled "Delete" removes membership (342); both confirms are `window.confirm` (141, 154).
- `[A1] [M]` Remove icon button has no aria-label (243-253).
- `[A2] [M]` Clickable Badges nested inside the trigger button (369-381).
- `[R2/R5] [M]` Search in a separate Card from the table (300-310); two badges next to the title (276-279) → count as plain text.
- `[S1] [M]` Same empty state for "no match" and "empty list".
- `[C1] [L]` Help text about smart lists shown in a static-only dialog (417-419).

### /Users/arjunh/Documents/crm/crm/src/app/dashboard/lists/page.tsx — Lead Lists
- Elements: header "New List"; toolbar Card (search, type select, count); DataTable (List Name + description, Type badge, Leads, Modified On, View button).
  - **Dialog "New lead list":** sm; Name (required, but only enforced by a toast), Description, Type, "Configure filters" (opens a drawer over the dialog) with a "n conditions" count; Cancel / Create.
- `[E1/N1] [H]` A list can't be renamed, deleted, or have its smart filters edited anywhere.
- `[M1] [H]` The filter drawer stacks on top of the dialog (322, 329-345) → put the filter builder inside a md dialog.
- `[F1] [H]` Name validation is only a toast (112-114); no required marker.
- `[T1] [M]` A "View" button in every row duplicates the row click and the name link (209-223).
- `[R4/R3] [M]` Coloured type badge on every row (175-184); extrabold text (163, 192).
- `[F1] [M]` A smart list with 0 conditions silently means "all leads". The condition count includes empty conditions (323).
- `[S1] [M]` Empty state has no call to action.
- `[C1] [L]` "Modified On" → "Updated". Duplicate `Button` import (15-16).

### /Users/arjunh/Documents/crm/crm/src/app/dashboard/opportunities/[id]/page.tsx — Opportunity record
- Elements:
  - **Header:** like the lead header; "More actions" holds Favorite, +Activity, Forms, +Case, AI, Push, Share, Edit.
  - **Left panel:** bg-secondary hero (stage and priority badges, Value/Probability/Activities); Deal Properties; Score; Next-best-action; CallScript; "Stage Progression" (one button per stage); Linked Lead (Open Lead, Call).
  - **Tabs:** Activity History, Deal Details, Scoring, Stage History, Tasks, Communications, Notes, Audit.
  - **Dialogs:** Edit (sm), Push, LogCall, Share, Playbook.
- `[F2/E1] [H]` One click on a Stage Progression button changes the stage (389-392, 177-188): no confirm for Won/Lost, no close reason, no undo.
- `[R5/R9] [H]` Same hidden-actions header; no "New task".
- `[N1] [H]` The stage control is buried under score, NBA and call script (377-414), and hidden on mobile → a stage path bar in the header.
- `[R4/C1] [H]` Stage shown 5 times (229, 346, 366, 517, path); value 3; probability 2; priority 2.
- `[R8] [H]` Priority is a raw enum, and the hero invents "MEDIUM" when it's empty (349) while properties show "—" (369).
- `[R1/R7] [H]` bg-secondary hero block is a second accent colour (329); hard-coded `#fff` dot (403).
- `[R3/R2] [H]` 9.6px badge (228), extrabold (337, 363, 383, 417, 427); bordered blocks nested in a card (328-452, 514-527).
- `[C1] [M]` Lead and opportunity pages use different shell values: padding `p-3 md:p-4` (221) vs none, a 300px vs 280px left column, `min-h-9`/sm vs `h-9` buttons → one shared RecordLayout.
- `[C1] [M]` Expected Close is a date in properties (371) but date-time in details (524).
- `[N1] [M]` Tabs not in the URL; `router.back()`; four sequential fetches (104-127) → parallel.
- `[N1] [M]` Owner not shown and can't be reassigned.

### /Users/arjunh/Documents/crm/crm/src/app/dashboard/opportunities/create-opportunity-dialog.tsx — Add opportunity
- Elements (StandardDialog sm): "Add Opportunity", subtitle about type and stage; a Forms button above the form; OpportunityForm; Cancel / "Save opportunity".
- `[N1] [H]` There is no "Convert lead" flow: creating an opportunity from a lead doesn't set the lead to CONVERTED or carry over its name/company.
- `[R1] [H]` Default trigger is `bg-secondary` (34), a second accent.
- `[R5/M1] [M]` Forms panel inside the dialog (48-57).
- `[A2] [M]` `<div onClick>` trigger (32); inline style padding (47).
- `[C1] [M]` "Add" here vs "Create" elsewhere; title doesn't name the lead.

### /Users/arjunh/Documents/crm/crm/src/app/dashboard/opportunities/edit-opportunity-dialog.tsx — Edit opportunity
- Elements: sm; "Edit Opportunity", "Update deal details."; spinner, ErrorState with retry, or form; Cancel / "Save opportunity".
- `[C1] [L]` "Save changes" label; inline style padding (76); spinner → skeleton.
- Otherwise OK.

### /Users/arjunh/Documents/crm/crm/src/app/dashboard/opportunities/opportunity-form.tsx — Opportunity form
- Elements: metadata fields plus overrides: Lead* (select), Opportunity Type* (select with "None"), Stage (disabled until a type is chosen), Expected Close Date (date). Labels are linked (OK). Inline zod errors.
- `[T1/R8] [H]` Lead picker loads only 100 leads with no search (52). Options read "name (email)", which prints "(null)" when there's no email (91).
- `[F1] [M]` A required Type still offers "None" (128).
- `[E1] [M]` Changing type silently resets stage (119-121); stage is disabled with no hint (151).
- `[C1] [L]` "✓ Won" / "✗ Closed" glyphs in option text (161).
- `[S1] [L]` Loading text (203).
- `[E1] [M]` The effect depends on `initialData`, and the create dialog passes a new inline object on every render (74) → refetch/reset risk.

### /Users/arjunh/Documents/crm/crm/src/app/dashboard/opportunities/page.tsx — Opportunities list / board / analytics
- Elements: custom header (H1 18px, type select, Export, Board/List/Analytics toggle, Filters (n), "Create Lead + Opportunity", "Add Opportunity"); stage count badge row; content area (Kanban, Analytics, or DataTable: Opportunity, Value, Stage, Priority, Score, NBA, Preview/Open/Edit); bulk Assign / Delete; Filter drawer; EditOpportunityDialog.
  - **Dialog "Reassign selected opportunities":** xs; New Owner and Reason (labels linked); Cancel / Reassign.
- `[N1] [H]` Board view with the default "All opportunity types" is a dead end: "Select an opportunity type", whose button creates instead of selecting (580-586) → auto-pick the last-used or first type.
- `[T1] [H]` "Select all" toasts "All N" but bulk uses only the page rows (259-263, 645-651).
- `[T1] [H]` No search or sort; board silently capped at 500 (139).
- `[F2/C1] [H]` Bulk delete: `window.confirm`, N parallel DELETEs, no undo; toast says "opportunityies" (250).
- `[R5] [H]` Seven controls in the header (495-568).
- `[R8/R3/R7] [M]` Stage badge uppercase in database colours (335-345); priority uppercase and coloured, with LOW in primary blue (352-363).
- `[R1] [M]` Value in bold primary colour (325) → foreground, tabular numbers, right-aligned.
- `[R4] [M]` 4 badges per row; 3 icon actions per row (389-421).
- `[S1] [M]` Kanban shows a table skeleton while loading (576); empty and no-match look the same.
- `[N1] [M]` Filters not in the URL; view mode and type live only in localStorage.
- `[F1] [M]` Filter field "Stage" has no options unless a type is selected (453).
- `[R9] [M]` Bulk "Stage" is supported by the toolbar but not wired.

### /Users/arjunh/Documents/crm/crm/src/app/dashboard/tasks/page.tsx — Tasks
- Elements:
  - **Page:** header (Export, Refresh, Team Queues, New Task); 3 stat cards (Open Work, Overdue, Completed); filter card (List/Calendar toggle plus Due range, Task status, Task priority, Task owner, each with a stacked label); inline bulk bar (Complete, owner select + Reassign, date-time + Reschedule, Delete, Clear).
  - **Task cards:** checkbox; title; badges for status, priority, Blocked, checklist x/y, SLA, "Unclaimed in queue"; description; owner/due/reminder/Lead/Opp; actions Complete/Reopen, Skip, Favorite, Edit, Delete. Custom pager. TaskCalendar (Day/Week/Month, lanes).
  - **Dialog "Create Task"/"Edit Task" (sm 600px):** Title (required; Save disabled, no marker), Description (single-line input), Status, Priority, Owner, Due, Reminder, Repeat / Based on / Escalate after / Escalate to, Lead, Opportunity, Related Activity, "Related Record Preview", NBA panel, Add Comment, the checklist & dependencies panel (its own Save buttons), Team Queue (send, claim, unclaim act immediately). Cancel / "Save Task". Draft and dirty guard: yes.
- `[M1/E1] [H]` A 600px modal with about 16 fields and 4 sub-panels using **three different save models** (form Save, separate "Save Dependencies"/"Save Completion Settings", and instant changes) (804-999) → a right-side task sheet (480-560px): core fields first, Advanced collapsed, one save model.
- `[R10/R4] [H]` Each task is a padded card (p-4) with up to 6 badges and 5 actions (672-751) → a 40px row (layout d6).
- `[R9] [H]` A "Complete" button and a selection checkbox side by side is ambiguous → the leading circle completes; selection appears on hover.
- `[R6] [H]` Filter bar wraps to 2+ rows of labelled selects (550-614).
- `[T1] [H]` No search. All tasks are fetched then paged in the browser (211, 280-287). Default owner is "All owners", not "Me" (159).
- `[R3/R8] [H]` 10.4px badges; raw "IN PROGRESS" / "URGENT" (684-686); uppercase stat labels (537).
- `[F1] [M]` Complete ignores `requireCompletionNote` (728), so the rep only sees an error → prompt for the note inline.
- `[F1] [M]` Description and Comment are single-line inputs (826, 964); Title not marked required.
- `[R7] [M]` Overdue number is always red, even at 0; Completed is primary colour; stat cards aren't clickable filters (535-548).
- `[F2] [M]` Delete and bulk delete via `window.confirm` (434, 463); no undo on bulk complete/reassign.
- `[A2/C1] [M]` Calendar:
  - tasks with no due date are dumped in the last lane (1131);
  - lane labels use `toLocaleDateString` instead of workspace formatting (1126-1129);
  - rescheduling is drag-only with no keyboard alternative (1070-1076).
- `[N1] [M]` Filters and view mode not in the URL. "Team Queues" is a header button, not a tab.
- `[C1] [L]` Draft notice copy (816). Stats are computed over the filtered list, so "Completed" changes with filters.

### /Users/arjunh/Documents/crm/crm/src/app/dashboard/tasks/queues/page.tsx — Team queues
- Elements: back-icon link; title and long description; health cards (unclaimed badge, queued, average age, oldest, SLA breached); queue select; "Auto-balance" (supervisors); task cards (status, priority, Claimed/Unclaimed, SLA badges; queued age, due; Claim/Unclaim; "Reassign to…" select).
- `[A1] [H]` Back icon link has no name (134-136); selects have no labels (172, 236).
- `[S1] [H]` Load failure only shows a toast and then "Pick a team queue" (65) → ErrorState.
- `[F2] [M]` Auto-balance reassigns many tasks with no confirm or preview (117-129); picking from the reassign select acts immediately (235).
- `[T1/N1] [M]` Health cards aren't clickable to choose a queue; selection not in the URL; rows don't link to the task or its record; no bulk claim.
- `[R4/R3/R8] [M]` 3-4 badges per row, 10.4px, raw priority (200-213).

### /Users/arjunh/Documents/crm/crm/src/app/dashboard/views/page.tsx — Smart Views
- Elements:
  - **Header row:** icon, H1, view Select, "Show archived" checkbox, pinned star, favourite, up to 6 badges (Tenant/Assigned/Private, module, Archived, Stale, Possible duplicate), "Shared with…", "Opened Nx", Refresh, New Smart View, and a ⋯ menu with 15 items (Edit, Rename via prompt, Move up/down, Default for module/Admin/Manager/Rep/Partner, Clone, Archive, Comments, Transfer ownership, Delete).
  - **Below:** tab buttons (name, filter-count badge, count, module); sub-toolbar (status dot, Last Updated, Refresh link, a "n filters" look-alike button, search, records badge, truncation badge); count chips; selection bar (Export, Clear); InlineRecordsTable (checkbox, columns, row ⋯).
  - **Dialogs:** "Transfer ownership" (425px; user select; Cancel / Transfer); "Comments" (425px; list, input, Post).
- `[T1] [H]` Each tab loads the first 500 records and filters in the browser (759-763, 227), so counts and chips are wrong beyond 500. Up to 500 rows render with no pagination (907), no sort, no row click, and names aren't links.
- `[R8] [H]` `formatCell` shows raw enums and JSON-stringifies objects (993); **empty values render as "..."** (987) → "—".
- `[R5] [H]` About 14 elements in the header (398-524) → title + view picker + New view; badges become one muted meta line.
- `[R9/C1] [M]` 15-item menu; Rename uses `window.prompt` (332); Refresh appears twice (449, 584).
- `[R9] [M]` "n filters" looks like a button but isn't interactive (589-592).
- `[R3] [H]` Uppercase extrabold table headers (899); 18px extrabold tab counts (568); 10.4px badges.
- `[A1/A2] [M]` Search has no label (595); row checkbox label is "Select {uuid}" (913); tabs use `role=group` with `aria-pressed` (544-553).
- `[N1] [M]` View and tab not synced to the URL beyond the initial `?viewId`.
- `[R9] [M]` Selection bar offers only Export.
- `[S1] [M]` Loading states are plain text (529, 642).

### /Users/arjunh/Documents/crm/crm/src/components/ai/ai-assistant-panel.tsx — AI Assistant sheet
- Elements: trigger "AI Assistant" (inside More actions); right Sheet 560px titled "AI Assistant — {name}"; 6 action buttons; Workflow section (select, description, "Generate workflow"); result card with copy; "Draft a follow-up message" disclosure (channel, instructions, "Generate variants", variant cards with "Use this draft", compose card with Recipient, Subject, Message, "Discard message", "Confirm & send").
- `[E1] [H]` Results can't be acted on. "Suggest next task" can't create a task; call notes can't be saved as a note → result actions: Create task / Save as note / Log activity.
- `[R9] [M]` Three overlapping entry points (205-227) → one prompt list.
- `[F2] [M]` While composing, every link click anywhere on the page is captured with `window.confirm` (81-94) → in-app guard.
- `[R2] [M]` Cards inside the sheet (236, 272, 279).
- `[F1] [M]` Recipient required but unmarked; error appears only after send (155-157).
- `[C1] [L]` Explanatory lines (200, 226, 252); "Generate workflow" is vague.

### /Users/arjunh/Documents/crm/crm/src/components/detail-shell/detail-page-header.tsx — sticky record header
- Elements: "Back" button; H1 with status badge; subtitle; optional primary; "More actions" toggle that expands an inline row containing all other actions.
- `[R5/R9] [H]` Every secondary action lives in an inline disclosure, not a menu (50-56). When there's no primary, the header has no actions → 1 primary + ≤2 secondary inline + a DropdownMenu overflow.
- `[R6] [M]` Back/title row stacked above the action row (32-56): roughly 100px of sticky height → one 56px row.
- `[N1] [M]` "Back" uses history (39) → breadcrumb "Leads / Name".

### /Users/arjunh/Documents/crm/crm/src/components/detail-shell/record-summary.tsx — left panel collapse
- `[N1] [M]` Below the `lg` breakpoint all properties sit behind "Record properties & guidance" (11-13) → always show status, owner and phone; collapse only secondary panels.
- `[C1] [L]` Label → "Details".

### /Users/arjunh/Documents/crm/crm/src/components/detail-shell/workspace-tabs.tsx — record tabs
- `[A2] [H]` Buttons with `aria-pressed` inside `role=group` (24-30) → Radix Tabs (tablist, arrow keys).
- `[R3/R6] [M]` 13px font (32); filled primary active pill with extrabold (34); tabs wrap to 2 rows → 14px/500 underline tabs, horizontal scroll.
- `[N1] [M]` No URL-sync option.

### /Users/arjunh/Documents/crm/crm/src/components/kanban/kanban-board.tsx — legacy kanban
- `[N1] [H]` Not imported anywhere (replaced by `components/opportunities/kanban-board.tsx`) → delete.

### /Users/arjunh/Documents/crm/crm/src/components/leads/custom-fields-card.tsx — custom fields card
- `[N1] [M]` Not imported anywhere → delete or adopt.
- `[A1] [M]` Icon buttons without names (28-35, 51-58); edit only visible on hover (55); uppercase labels (48).

### /Users/arjunh/Documents/crm/crm/src/components/leads/lead-contact-card.tsx — contact card (used in RecordPreview)
- Elements: name, company, status badge; email link with copy; phone (click-to-call) with copy; "Log Activity" and "Create Opportunity" buttons.
- `[N1] [H]` Buttons are dead when no handlers are passed, which is the case in RecordPreview (168-175) → hide when there's no handler.
- `[F2] [M]` Click-to-call places the call immediately (`execute: true`, 126-136) and duplicates the `useClickToCall` hook.
- `[A1] [M]` Copy buttons have no name and appear on hover only (103-110, 147-154).
- `[R3/R8] [M]` 10px raw uppercase status (76-80); status colours don't match `columns.tsx` (39-44).
- `[R2] [L]` Decorative hover shadow (61).

### /Users/arjunh/Documents/crm/crm/src/components/next-best-action/nba-count-chip.tsx — NBA chip
- OK.
- `[R7/A1] [L]` Primary-coloured chip on every row; the meaning is only in `title` → add aria-label and use a neutral style.

### /Users/arjunh/Documents/crm/crm/src/components/next-best-action/nba-panel.tsx — Recommended Next Actions
- Elements: card per recommendation (action label, score badge, reason, Accept / Snooze / Dismiss / Not useful).
- `[F2/C1] [H]` "Accept" runs the action immediately ("Action executed", 75), including send or reassign, with no preview → button names the effect ("Create follow-up task"); confirm side-effect actions.
- `[R9] [M]` Four buttons per item (108-147) → one primary + ⋯.
- `[R8] [M]` Unexplained raw score (103); falls back to the raw `actionType` (101).
- `[R10/R3] [L]` 28px buttons, 10.4px badge.

### /Users/arjunh/Documents/crm/crm/src/components/next-best-action/nba-pending-approvals-panel.tsx — manager approvals (dashboard)
- Mostly OK.
- `[F2] [M]` Reject with no reason or confirm (95-103).
- `[R3] [L]` 10.4px badge (66); 28px buttons.

### /Users/arjunh/Documents/crm/crm/src/components/opportunities/kanban-board.tsx — pipeline board
- `[A2] [H]` Only mouse and touch sensors, no KeyboardSensor (35-42) → add one, plus a "Move to stage…" menu on each card.
- `[F2] [H]` Dropping into a Won/Lost stage applies at once (61-77) → confirm with a reason.
- `[R1] [M]` Column total in primary colour (133).
- `[T1] [M]` No empty-column drop hint and no indication of the 500 cap.

### /Users/arjunh/Documents/crm/crm/src/components/opportunities/kanban-card.tsx — pipeline card
- `[A1] [H]` Edit icon button has no name and is hover-only (76-87); priority is shown by dot colour alone (90-95).
- `[R4] [M]` Type badge is redundant on a board already filtered to one type; plus 2 tag badges (110-135).
- `[R1/R3] [M]` Amount in primary extrabold (100); 10.4px badges.
- `[T1] [M]` Missing owner, days in stage and next task.

### /Users/arjunh/Documents/crm/crm/src/components/opportunities/opportunity-stage-analytics.tsx — Analytics view
- `[R1/R7] [H]` Hard-coded rainbow hex colours (32) and `#888` axes (69, 75); breaks in dark mode.
- `[S1] [M]` Raw loading div (28); on error it shows only a toast and then renders zeros as if real (24).
- `[F/Data] [M]` Ignores the page's type and filter selection (22).
- `[A1] [M]` Chart has no text or table alternative.
- `[R2] [L]` 2 KPI cards in a 4-column grid.

### /Users/arjunh/Documents/crm/crm/src/components/opportunities/opportunity-stage-history.tsx — stage history
- OK.
- `[R2] [L]` Every item is a bordered card → divided rows; target stage in primary extrabold (48); add the absolute time as a tooltip.

### /Users/arjunh/Documents/crm/crm/src/components/scoring/predictive-score.tsx — score badge and panel
- `[F1/E1] [H]` Override uses two `window.prompt` calls with no 0-100 check (NaN possible) (110-113) → dialog with a validated number and a reason.
- `[R2] [H]` 8 bordered metric boxes plus a next-action box inside a card (148-243) → one line: band, %, top 3 drivers, and a "Why?" popover.
- `[R3] [H]` 10.9px uppercase labels (265); uppercase headings (189, 224).
- `[S1] [M]` Panel doesn't refresh after an override (128).
- `[R7] [M]` HOT is shown in destructive red (16).
- `[R8] [M]` Raw values: band (43), `nextBestActivityType` (191), `changeReason` (231).
- `[R9] [M]` Four "No … yet." empty lines.
- `[F2] [L]` Clearing an override has no confirm (136).

### /Users/arjunh/Documents/crm/crm/src/components/tasks/apply-playbook-dialog.tsx — Apply Task Playbook
- Elements: sm; Playbook select; "Apply Playbook" button in the body; no Cancel; success replaces the content.
- `[S1] [M]` Shows "No active playbooks" while still loading (64); errors swallowed (37).
- `[F1/A1] [M]` Label not linked (80); Apply in the body, no Cancel/Done (92-97); no preview of the tasks it will create.
- `[N1] [L]` The Settings path is plain text, not a link (67).

### /Users/arjunh/Documents/crm/crm/src/components/tasks/related-tasks-panel.tsx — Tasks tab on records
- Elements: header ("Tasks", "n open", "+ Task"); task cards (badges; Complete/Reopen, Skip, Edit, Delete).
  - **Dialog "Create Task"/"Edit Task" (sm):** Title, Description, Status, Priority, Owner, Due, Reminder, recurrence/escalation, checklist panel; Cancel / "Save Task"; **no dirty guard**.
- `[A1] [H]` No label is linked to its control (319-360).
- `[R8] [H]` Shows the raw `ownerId` (278) and `user.id` (347) when the name is missing.
- `[E1] [H]` A second, different task editor from the one on `tasks/page.tsx`, with no draft or dirty guard and no lead/opp/activity fields → one shared task sheet.
- `[T1] [M]` No inline quick-add; open and completed tasks are mixed with no due-date sort; overdue not highlighted.
- `[R4/R3] [M]` Badge wall at 10.4px (259-274).
- `[F2] [M]` Delete via `window.confirm` (223).

### /Users/arjunh/Documents/crm/crm/src/components/tasks/task-checklist-dependencies-panel.tsx — checklist and dependencies
- `[E1] [H]` Four save models in one panel: parent saves on change (117-128), checklist saves per toggle, "Save Dependencies" (202), "Save Completion Settings" (221).
- `[A1] [H]` Unlabelled checkboxes (161); X remove button (163-165) and + add button (176-178) have no names; Switch not linked to its label (210-211).
- `[R3/R8] [M]` 9.6px raw status badge (197).
- `[C1] [M]` "Require note" toggle and the note text field are mixed together.
- `[F2] [L]` Removing a checklist item has no undo.

### /Users/arjunh/Documents/crm/crm/src/components/tasks/task-recurrence-escalation-fields.tsx — recurrence and escalation
- `[A1] [H]` Labels not linked (34, 60, 74, 85).
- `[F1] [M]` Escalation counts from the reminder, but reminder is optional, so escalation can silently never fire → inline warning. No end date despite `endDate` in the type (10); no max on minutes.
- `[R9] [L]` Should sit in a collapsed "Advanced" section.

### /Users/arjunh/Documents/crm/crm/src/components/timeline/timeline.tsx — activity timeline
- Elements: day chips; per item a card (icon, time, type, outcome badge, SLA badge, relative time, chevron, notes, related, author, change count, expandable audit diffs and field grid).
- `[N1] [H]` Shows activities only. Notes, tasks, communications, stage changes and audit live in separate tabs → one filterable timeline with a composer.
- `[R8] [H]` Raw outcome (217); raw SLA "BREACHED" (230); custom field keys used as labels (168-169); objects JSON-stringified (53, 163).
- `[R2/R10] [M]` Each item is a rounded-2xl card with a type-tinted hover shadow (186-190); bordered field boxes (318-321).
- `[R3] [H]` Uppercase extrabold day chips (132) and field labels (322); 10.4px badges.
- `[A2] [M]` Whole card is `role=button` with no `aria-expanded` (176-185).
- `[E1] [M]` No edit, delete or pin on items.
- `[S1] [M]` Empty state has no call to action (109-118).
- `[Perf] [M]` `import * as LucideIcons` (5) pulls every icon into the bundle.
- `[C1] [L]` Filler line "No notes were added…" (256-258); "->" (306); sky-600 adds an extra accent (300).

### /Users/arjunh/Documents/crm/crm/src/components/views/save-view-dialog.tsx — Smart View builder
- Elements: StandardDialog xl 1536px, "Create/Edit Smart View".
  - **Side panel:** Setup (Name); Visibility (scope select; Users/Teams/Sales groups/Roles check menus; "Tenant-wide…" checkbox; "Preview recipients"); Default and Pinned switches.
  - **Main panel:** Tabs list with "Add Tab"; tab editor (Tab name, Module, Remove); steps Filters / Layout / Insights / Actions; Filters (FilterBuilder); Layout (Visible columns, Density, Sort field, Sort order, Group by); Insights (Chart, Metric, Chart field, Count Chips rows); Actions (checkboxes).
  - Cancel / Save. Name required (2+ characters) via toast only. No dirty guard.
- `[M1/R2] [H]` 1536px modal with about 5 levels of nested bordered cards (469-913) → a dedicated page or a stepper on a single surface.
- `[F1] [H]` Toast-only validation (248-251); no required marker; closing loses all work (454).
- `[C1] [H]` Chart, metric and group-by are configurable but `views/page.tsx` never renders them, so this is dead configuration.
- `[E1] [M]` Changing module wipes the tab's configuration without confirm (317-330).
- `[R3] [H]` Uppercase labels throughout (612, 621, 691…), 11.2px descriptions (663), 9.6px badge (601).
- `[A1] [M]` Labels not linked; step switcher isn't real tabs; the "Tenant-wide" checkbox can't meaningfully be unchecked (509-521).
- `[T1] [M]` Filter value options are truncated to 300 leads/opps (216-217).

### /Users/arjunh/Documents/crm/crm/src/components/views/view-row-actions.tsx — Smart View row menu
- Elements: menu (Open record (new tab), Create task, Log activity, Assign owner, Add to list, Send message, Change stage, Create follow-up, Mark done, Complete task, Reassign task, Reschedule task). Seven 425px dialogs: "Create task" (title), "Log activity" (type, notes), "Assign owner"/"Reassign task" (user, Reason, workload preview), "Add to list", "Send message", "Change stage", "Reschedule task".
- `[Bug] [H]` "Log activity" always posts `leadId: record.id` (288), even on opportunity or task rows.
- `[Bug] [H]` Assign maps every non-lead module to "OPPORTUNITY" (107, 358).
- `[A1] [H]` Dialog fields are placeholder-only with no labels (243, 273, 279, 304, 383, 410, 440, 466).
- `[Bug] [M]` Reschedule uses `new Date()` instead of the workspace time-zone helper (472).
- `[F2] [M]` Follow-up, Mark done and Complete run instantly with no undo (180-221).
- `[N1] [M]` "Open record" opens a new tab (138).
- `[C1] [M]` Created task is fixed to "due tomorrow" (241, 255); email has no subject.
- `[R9] [L]` Disabled "Send message" gives no reason (169).

### /Users/arjunh/Documents/crm/crm/src/components/views/view-switcher.tsx — list saved-view picker
- `[N1] [H]` Not imported anywhere, so list pages have no saved views → wire it into the list toolbars, or delete it.
- If wired:
  - `[R4/R8] [M]` Up to 5 badges of internal configuration (260-264); raw module (331) and raw `quickActions` (347).
  - `[A1] [M]` Save icon has no name (270).
  - `[N1] [M]` Navigates with `window.location.href` (183); errors only go to `console.error` (133).

---

### (a) Daily-flow click counts (desktop, telephony off)

| Flow | Today | Proposed |
|---|---|---|
| Find a lead | No list search: Filters → add condition → field → value → Apply ≈ **5-6** plus typing | Type in list search (`/` to focus) = **0-1** |
| Open it | Row click opens preview → "Full Details" = **2** (name link = 1) | Row click opens record = **1** (preview on hover icon / Space) |
| Log call/activity | More actions → +Activity → Type (2) → Outcome (2) → notes → "Save undefined" = **7** | Header "Log activity" or timeline composer: Call chip → outcome chip → Save = **3** |
| Add a note | Notes tab → type → Save = **2** | Composer "Note" on the default tab → Save = **1-2** |
| Create task | Tasks tab → +Task → title → Due picker (≈2) → Save = **5** | Header "New task" or composer: title + "Tomorrow" chip → Enter = **2** |
| Change lead status | Detail: More actions → Edit → wait → select (2) → Save = **5**. List: inline select = 2 | Inline status in header = **2** |
| Change opportunity stage | 1 click with no safeguard | Stage path 1 click; Won/Lost adds confirm = **2** |
| Reassign owner (one record) | Not possible on the record. List: find → checkbox → Assign → user (2) → reason → Reassign = **5** plus find | Owner field on record → user → (reason) → Confirm = **3** |
| Create opportunity from lead | More actions → +Opportunity → [lead select 2 if outside first 100] → Type (2) → title/amount → Save = **5-7**; lead status unchanged | Header "Convert" → pre-filled dialog → Convert = **2** (sets Converted, opens the opportunity) |
| Bulk update from list | Reassign = n + 4. Bulk status impossible (≈5 × n). "Select all" ignores filters | Select n → bulk "Status" → value = **n + 2**; Assign = **n + 3**; "Select all matching" respects filters |

### (b) Top 15 changes
1. **Fix the select-all data bugs:** leads bulk actions ignore filters (and fetch up to 5000); activities and opportunities act on the current page only. Make bulk endpoints filter-aware.
2. **Rebuild DetailPageHeader:** one 56px row, 1 primary (Log activity), ≤2 secondary (New task, Edit), a ⋯ DropdownMenu for the rest; status and owner inline in the header.
3. **Leads (and every list) toolbar:** search, URL-synced filters, saved views (wire up ViewSwitcher), and status segments with counts replacing the badge row.
4. **Inline-editable record properties,** with Owner visible and reassignable and Status as an inline select.
5. **One timeline with an inline composer** (Call / Note / Task / Email) replacing the Activity, Notes and Communications tabs. Records go from 8 tabs to 5: Activity, Tasks, Opportunities, Details, History.
6. **Collapse the left panel into one "About" surface** with no nested cards and no duplicated status/score/contact. Score, next-best-action and call script move into one collapsible "Assist" section; remove the Scoring tab.
7. **Opportunity stage path in the header and safe stage changes:** confirm with a reason for closed stages on the detail page, the kanban and the row menu; undo toast otherwise; keyboard move on the kanban.
8. **"Convert lead" flow:** pre-filled opportunity; sets lead status to Converted.
9. **One shared task sheet** (480-560px, single save model, advanced fields collapsed) replacing both task editors. 40px task rows; "My tasks" by default; inline quick-add.
10. **Searchable async record pickers** replacing the 100-record selects (activity, opportunity and task forms) and the 5000-lead list-add dialog.
11. **Replace `window.confirm`/`window.prompt` with AlertDialogs and Undo toasts.** Bulk delete states the count and filter and needs typed confirmation above a threshold.
12. **Central enum label maps and one shared lead status list** (fix the CONTACTED inconsistency). No raw enums, IDs or "..." anywhere.
13. **Design-token cleanup:** remove uppercase, extrabold and sub-12px text; one accent colour; neutral badges, coloured only for attention; remove the gradient and secondary hero blocks and hard-coded chart hex colours.
14. **Tables:** sortable headers, sticky header, 50 rows by default, 40/32px density, a single row ⋯ menu, row click opens the record, no-match empty state with "Clear filters".
15. **Fix dead ends and accessibility:**
    - dead ends: RecordPreview Edit, LeadContactCard buttons, the kanban "Select type" state, lists that can't be edited or deleted, "Save undefined", and the orphan files (LeadQuickView, `kanban/kanban-board.tsx`, CustomFieldsCard, ViewSwitcher);
    - accessibility: link labels to controls, real tablists, aria-labels on icon buttons, keyboard alternatives to drag.

### (c) Destructive or irreversible actions and how they are confirmed today

| Action | File (line) | Confirmation today |
|---|---|---|
| Leads bulk delete | `leads/page.tsx` (268) | `window.confirm`; "select all" sends `all:true` with no filters |
| Lead inline status change (incl. LOST/CONVERTED) | `leads/columns.tsx` (48-55) | None |
| Leads bulk reassign | `leads/page.tsx` | Dialog requires a reason; no undo |
| Add leads to list | `leads/page.tsx` | Dialog; reversible |
| Remove lead from list (single / bulk "Delete") | `lists/[id]/page.tsx` (141 / 154) | `window.confirm` |
| Opportunities bulk delete | `opportunities/page.tsx` (246) | `window.confirm`; no undo |
| Opportunity bulk reassign | `opportunities/page.tsx` | Dialog with reason |
| Opportunity stage change (detail Stage Progression) | `opportunities/[id]/page.tsx` (389-392) | None |
| Opportunity stage change (kanban drag) | `kanban-board.tsx` (61-77) | None (optimistic) |
| Opportunity stage change (view row "Change stage") | `view-row-actions.tsx` | Dialog select only; no closed-stage warning |
| Activities bulk "Mark Completed" | `activities/page.tsx` (176) | None |
| View row: Mark done / Complete task / Create follow-up | `view-row-actions.tsx` (180-221) | None, immediate |
| Task delete (single) | `tasks/page.tsx` (463), `related-tasks-panel.tsx` (223) | `window.confirm` |
| Task bulk delete | `tasks/page.tsx` (434) | `window.confirm` |
| Task bulk Complete / Reassign / Reschedule | `tasks/page.tsx` | None |
| Task Complete / Reopen / Skip occurrence | `tasks/page.tsx` (402) | None |
| Task send to queue / Claim / Unclaim | `tasks/page.tsx` (987) | None, immediate |
| Task parent / dependency changes | `task-checklist-dependencies-panel.tsx` | Parent: immediate; dependencies: explicit "Save Dependencies" button |
| Checklist item remove | `task-checklist-dependencies-panel.tsx` (81) | None |
| Queue Auto-balance | `tasks/queues/page.tsx` (117) | None |
| Supervisor reassign from queue | `tasks/queues/page.tsx` (235) | Immediate on select |
| Smart View delete | `views/page.tsx` (258), `view-switcher.tsx` (170) | `window.confirm` |
| Smart View archive / persona default / move up-down / pin | `views/page.tsx` | None |
| Smart View rename | `views/page.tsx` (332) | `window.prompt` |
| Smart View transfer ownership | `views/page.tsx` | Dialog with descriptive text only |
| Builder: remove tab | `save-view-dialog.tsx` | None |
| Builder: change module (wipes tab configuration) | `save-view-dialog.tsx` (317-330) | None |
| Builder: close dialog | `save-view-dialog.tsx` (454) | No unsaved guard |
| Score override | `predictive-score.tsx` (110-113) | Two prompts, no validation |
| Clear score override | `predictive-score.tsx` (136) | None |
| NBA Accept (executes send/assign/etc.) | `nba-panel.tsx` (75) | None |
| NBA Dismiss / Not useful; approvals Approve / Reject | `nba-panel.tsx`, `nba-pending-approvals-panel.tsx` | None |
| AI message send | `ai-assistant-panel.tsx` | Explicit "Confirm & send"; Discard and channel change use `window.confirm` |
| View-row "Send message" (queues email) | `view-row-actions.tsx` | Dialog with Send; no preview |
| Click-to-call from contact card | `lead-contact-card.tsx` (126-136) | Immediate |
| Apply playbook (creates N tasks) | `apply-playbook-dialog.tsx` | No preview, no undo |
| Record/task create, edit dialogs | DynamicFormRenderer, `tasks/page.tsx` | Unsaved guard. Not in related-tasks, the Smart View builder, or the row-action dialogs |

### (d) Proposed layouts

**1. Leads list toolbar** — one 48px row on top of the table container.
- Page header above it: "Leads" (24/600), muted count "1,240", primary split button "New lead ▾" (Lead + opportunity). Export and Import go in ⋯.
- Toolbar, left side, in order:
  - View picker combobox (200px, groups Pinned / My / Shared);
  - Search (280px, "Search name, email, phone", `/` hint, debounced, URL-synced);
  - Status segmented control "All · New 120 · Contacted 40 · Qualified 12 · Lost 8";
  - Owner ▾ (default "Anyone"; "Me" available);
  - "Filters (n)" button opening the drawer.
- Toolbar, right side: Columns icon, density icon, refresh icon (all with aria-labels).
- When rows are selected, the same row becomes: "12 selected · Select all 1,240 matching" | Assign | Status | Add to list | Tags | ⋯ (Export, Delete) | Clear.

**2. Record header** — one sticky 56px row.
- Left: back chevron with aria "Back to Leads"; breadcrumb "Leads /"; H1 name (18/600); status inline-select pill (neutral, label case); ☆ favourite.
- After the title, one muted 14px meta line: "Acme Corp · Owner Priya ▾ · Last touch 2d ago".
- Right: secondary Call (if there's a phone) and Email; primary "Log activity"; ⋯ menu (New task, Convert to opportunity, Edit all fields, Create case, AI assistant, Share, Push to external, Forms, Delete).
- Opportunities add a 40px stage path below: chevron segments, current stage in the accent colour, Won/Lost at the end opening a confirm dialog with a reason.

**3. Record left panel** — 280px, one surface, sections separated by `border-t`, section titles 14/600.
- **About:** 32px key-value rows: Status (inline select), Owner (inline user picker), Phone (`tel:` plus copy on hover or focus), Email (`mailto:` plus copy), Company, Source, Created (absolute date, relative in a tooltip). Empty fields hide under "Show 3 empty fields".
- **Score:** one line "Warm · 62% likely to convert" with a "Why?" popover.
- **Next step:** the top recommendation as a text button named by its effect ("Create follow-up task") plus ⋯ (Snooze 1 day, Dismiss, Not useful).
- **Related:** Opportunities (n) as compact links; list memberships.
- Collapsed by default: Call script, Custom fields.

**4. Timeline item** — flat row, no card. A 24px neutral icon circle on a left rail; type colour only as an 8px dot.
- Line 1 (14px): "Call · No answer · by Priya", with the absolute time "10:42" right-aligned (relative in a tooltip).
- Line 2 (14px): notes clamped to 3 lines, with "Show more".
- Line 3 (12px muted): related link "Opportunity: Fall Intake". SLA appears only when missed, as destructive 12px text "SLA missed".
- Hover or focus actions on the right: Edit, Pin, ⋯ (Create task from this, Delete with undo).
- A "Details" disclosure button (with `aria-expanded`) shows custom fields as label–value rows and the change history.
- Sticky day separators "Today", "Yesterday", "12 Sep" (12/500 muted).
- Composer above the list with tabs Call / Note / Task / Email.

**5. Kanban card** — 280px column, 12px padding, about 88px tall.
- Row 1: title (14/500 link, 2-line clamp) with the owner avatar (20px) on the right.
- Row 2: amount (14px, tabular, foreground) with the close date (12px muted) on the right; the date turns destructive only when past.
- Row 3, only when there's something to flag: one attention line, e.g. "No activity 14d", "Overdue task", or the next task "Call tomorrow".
- No type badge; at most 1 tag.
- Focusable: Enter opens; ⋯ offers "Move to stage…". Dropping onto Won/Lost asks for confirmation and a reason.

**6. Task row** — 40px, in a list or table.
- Left to right:
  - circular complete checkbox (aria "Complete {title}"; prompts for a note if one is required);
  - title (14/500, truncated, struck through when done);
  - related record link (14px muted, "Acme · Lead");
  - due ("Today 4:00 PM"; destructive when overdue or SLA missed, muted otherwise);
  - priority flag icon only for High/Urgent (with a screen-reader label);
  - owner avatar (24px);
  - hover/focus actions: Reschedule (calendar popover), ⋯ (Edit, Send to queue, Duplicate, Delete with undo).
- "In progress" shows as small muted text only when it isn't Open; Blocked shows as a lock icon with a tooltip.
- The selection checkbox appears on hover to the left.
- Row click opens the shared task sheet on the right (480px).

---

# P3 · Dashboard, reports, marketing

## UI/UX review: P3, Dashboard, Reports and Marketing

I opened and read every file on the P3 list in full: all 3,246 lines of reports/page.tsx, all 1,311 lines of dashboard-manager.tsx, and all of widget-library.tsx, marketing/page.tsx, journeys-panel.tsx, communication-events-panel.tsx, analytics-dashboard.tsx, onboarding-checklist-banner.tsx, stat-card.tsx and dashboard/page.tsx. I also checked a few shared components for context: `settings-sections.tsx`, `badge.tsx` (Badge renders as a `<span>`), `page-header.tsx` and `global-search.tsx`, plus `report-schedules-postgres.ts`. Every path below is under /Users/arjunh/Documents/crm/crm/src.

Problems that cut across several files:
- **Native browser dialogs:** `window.prompt`, `window.confirm` and `confirm` are used 13 times.
- **Cancelling a prompt still runs the action:** `prompt() ?? undefined` turns Cancel into "no notes". This affects Publish version and Deprecate, in both dashboards and reports.
- **No URL state:** tabs and sub-tabs are not reflected in the URL anywhere.
- **Raw enum values on screen:** about 40 places show values like `EMAIL`, `WEEKLY` or `COUNT` instead of labels.
- **Text below 12px:** `text-[0.65rem]` / `text-[10px]` appears about 20 times.
- **Heavy weights:** `font-extrabold`/`font-bold` is used everywhere instead of 600.

---

### app/dashboard/page.tsx — Dashboard route shell
- Elements: wrapper `#dashboard-workspace` containing OnboardingChecklistBanner, then DashboardManager.
- Findings:
  - `[R5][M]` The onboarding banner renders above the page title (9–11), so the H1 is not the first thing on the page → render the PageHeader first and put the banner below it, or inside the header area.
  - `[R10][L]` The banner adds `mb-4` inside a `space-y-4` parent, which doubles the gap (banner line 52) → remove `mb-4`.

### components/dashboard/dashboard-manager.tsx — Dashboard tabs, grid, layouts, versions, Add/Edit Widget dialog
- Elements:
  - PageHeader "Dashboard" ("Your saved performance views and widgets."), with buttons [Refresh] and [Add Widget].
  - Collapsible `<details>` "Add widgets from a template": Template select (Admin/Manager/Rep/Partner) and [Apply Template].
  - Tab bar: one button per dashboard tab, each with a "Deprecated" badge when relevant and a ⋮ menu. Menu items: Rename (prompt), Set as Default / Your default tab, Publish Version (current vN) (prompt), Version History, Clone (prompt), Transfer Owner (prompt), Deprecate/Reactivate (prompt), Export PDF, Delete. After the tabs: "Shared with you" pseudo-tab, then [+] add-tab, which becomes an inline input with [+] and [x].
  - "SAVED LAYOUTS" toolbar: Layout name input, [Save Current], saved-layout select, [Restore], and a trash icon.
  - Cross-filter chip "Filtering by: …" with [x].
  - NbaPendingApprovalsPanel.
  - Widget area: a react-grid-layout with a hover-only drag handle, or a stacked list on mobile.
  - Empty state: "Welcome to your Dashboard" with [Initialize Default Dashboard]. Loading is a spinner; errors show ErrorState.
  - TabVersionHistoryDialog "Version History": one row per version with [Restore].
  - AddWidgetDialog "Add/Edit Dashboard Widget":
    - Always shown: Widget Title, Data Source (CRM module / Inbuilt report / App report), Widget Type (13 types), Auto-refresh (minutes), Sharing (Only me / My team / Everyone) with a team select.
    - Shown depending on type/source: NBA or SANKEY help text; PIVOT (Metric, plus Column Dimension object and field); Module (Data Module, Group Leads By); App report (App Report, Metric, Group By Column, Value Column); Inbuilt report (Report, Metric).
    - Footer: [Cancel] [Add Widget / Save Changes].
- Findings:
  - `[F2][H]` Deleting a widget has no confirmation and no undo (204, triggered from widget-library 498) → AlertDialog, or an undo toast.
  - `[F2][H]` Deleting a tab has no confirmation, even though it moves every widget on it (291, 490) → AlertDialog naming the tab and the number of widgets that will move.
  - `[F2][M]` The saved-layout trash icon deletes with no confirmation (380, 550). [Restore] overwrites every widget's position with no confirmation (369, 548). Restoring a tab version has no confirmation (657, 688) → confirm all three, or drop "Saved layouts" entirely in favour of versions.
  - `[M1][H]` Rename (454), Publish notes (306), Clone (317), Transfer owner (330) and Deprecation reason (343) all use `window.prompt` → replace with small dialogs.
  - `[E1][H]` Bug: Cancel on the Publish prompt (306) or the Deprecate prompt (343) still runs the action → check for `null` and abort.
  - `[R8][H]` Transfer Owner asks for a raw "New owner's user id" (330) → user picker.
  - `[E1][H]` There is no edit mode. Layout is always draggable and every move is saved straight away through PATCH (178–202, 594), so accidental drags persist → default to view mode and add an explicit Edit/Save/Cancel (design in section c).
  - `[A2][H]` The drag handle is a 40×8 bar at opacity 0 until hover, with no keyboard support (607) → a visible handle in edit mode, plus arrow-key move and resize.
  - `[R6][H]` Three stacked control rows (template details 419, tab bar 431, Saved Layouts bar 533) plus a filter chip sit above the content → one row: dashboard switcher + date range + Edit + ⋯. Templates and layouts move into edit mode.
  - `[R3][M]` "Saved Layouts" is uppercase, bold and 12px (534). The Deprecated badge is 10px (443) → sentence case at 12–14px, weight 500.
  - `[N1][M]` The active tab is not in the URL (60, 168). `?create=1` is read but never cleared (137) → `?tab=<id>`, and remove the param once used.
  - `[A2][M]` The tab bar is plain buttons with no `role="tablist"` or `aria-selected`. The ⋮ trigger is only 12px (448–449) → Radix Tabs or a dropdown switcher, with a 24px+ trigger.
  - `[R9][M]` The tab menu has 10 items mixing everyday actions (Rename) with governance (Transfer Owner, Deprecate, Publish Version) (453–497) → keep Rename, Duplicate, Set default, Export, Delete; move governance into a "Manage" dialog.
  - `[R1][L]` The active tab is a solid primary fill (438) → underline or a subtle secondary fill.
  - `[S1][M]` The empty state has no PageHeader, no choice of persona, and a 64px icon with a 24px bold title (399–410) → show the header and a "Start from template" picker (My day / Manager / Admin / Blank).
  - `[S1][L]` Loading is a centred spinner (391–396) → skeleton widgets. The error state renders a separate PageHeader (390), which is fine.
  - `[R5][L]` The header [Refresh] reloads every widget but duplicates the per-widget refresh (416) → move it to the ⋯ menu.
  - `[R10][M]` NbaPendingApprovalsPanel is dropped between the filter chip and the grid, outside the widget system (569) → make it a widget, e.g. "Approvals waiting on me".
  - `[F1][M]` Widget dialog field order puts Auto-refresh and Sharing before the data configuration (1086–1126) → order as Type, then Source, then data fields, then Title (auto-suggested), then Advanced (refresh, sharing) collapsed.
  - `[F1][M]` The Data Source select is still shown for NBA, SANKEY and PIVOT, where it is ignored (1053) → hide it for those types.
  - `[F1][M]` Save is only disabled on an empty title. PIVOT can be saved with no metric, and TEAM with no team (1036) → validate inline.
  - `[F1][L]` There is no saving state, so double submits are possible (1036) → add a spinner and disable.
  - `[E1][M]` The widget dialog has no preview → show live widget data next to the form.
  - `[E1][L]` A type the chosen report doesn't support is silently swapped (945) → only list the valid types and say why.
  - `[R8][M]` The pivot column dimension shows raw object and field keys (1159, 1165). Type labels are odd, e.g. "Sankey (Source -> Stage Flow)" (714) → use the OBJECT_LABELS/FIELD_LABELS helpers, and add a short description per type in a visual gallery.
  - `[C1][L]` Copy uses "--" as a dash in toasts and help text (296, 673, 677, 1124, 1130, 1147, 1220) → use a real em dash or rewrite.
  - `[N1][L]` Export PDF opens a raw `/api/...` link in a new tab with no progress (485) → queue the export with a toast, like QueueExportButton.
  - `[S1][L]` `isMobile` starts as `true`, so desktop briefly shows the stacked list (83) → start as `null` and render a skeleton.

### components/dashboard/widget-library.tsx — Widget renderer (13 chart types) and widget menu
- Elements: Card with title, a refresh icon and a ⋮ menu (Edit, Delete), or a "Shared" label for non-owners. Below that, a freshness line ("Updated x ago" / "Refresh failed…"). Bodies: STAT (StatCard), TREND line with annotation ReferenceLines, BAR (click to cross-filter), FUNNEL, AREA, PIE/donut, STACKED_BAR, SCORE_DISTRIBUTION bar, HEATMAP html table, TABLE, SANKEY, PIVOT table, NBA list of links. Fallback: "Unknown widget type".
- Findings:
  - `[CH][H]` None of the charts has text alternatives (no `aria-label` summary, no "view as table" toggle) (279–438) → `role="img"` with a generated summary, plus a "Show data" toggle.
  - `[CH][H]` TREND, BAR, AREA, SCORE and STACKED show empty axes when there is no data (281–415) → a shared "No data for this period" empty state.
  - `[CH][H]` PIE, STACKED_BAR and FUNNEL have no legend. Pie slices are unlabelled (369–401) → add a Legend or direct labels with %.
  - `[CH][M]` No axis or tooltip formatting: tooltips show the key name "value", with no currency, percent or thousands separators (293, 320, 363) → pass formatter props by metric type.
  - `[CH][M]` The palette mixes primary, secondary, a red fallback and `muted-foreground` as a series colour, and the annotation line is red (46, 304) → a validated categorical palette, with a neutral annotation colour.
  - `[R3][M]` Annotation labels are 10px (306) and funnel labels 11px (347) → at least 12px.
  - `[A2][M]` BAR cross-filter is mouse-only, and nothing tells the user bars are clickable (227–238, 325) → a hint ("Click a bar to filter") plus keyboard-focusable bars or a filter select.
  - `[R3][M]` The freshness line is 0.65rem (258) and the "Shared" label 0.65rem (507) → 12px. Show freshness only on hover or when stale.
  - `[R8][M]` TABLE widget headers are raw keys, and values go through `String()` with no formatting. The 20-row cap is silent (122–137) → humanised headers, typed formatting, "Showing 20 of N".
  - `[A1][M]` The ⋮ trigger has no `aria-label` (492). Refresh relies only on `title` (513) → add `aria-label="Widget options for {title}"` and `aria-label="Refresh"`.
  - `[F2][H]` Delete in the menu has no confirmation (498) → confirm or undo.
  - `[S1][M]` The first-load error is just red text, with no retry (251–255) → ErrorState with a retry button.
  - `[R8][L]` "Unknown widget type: X" (481) → hide the widget or show a neutral "This widget is no longer supported".
  - `[R2][M]` On STAT widgets the refresh button and menu are absolutely positioned over the StatCard's 44px icon tile, so they collide (518–527) → put the actions in a consistent header for every type.
  - `[A2][L]` Heatmap cells use colour plus a number, but text on dark cells can lose contrast (76) → switch the text colour above ~60% intensity.
  - `[R10][L]` Every TREND widget fetches `/reports/annotations` separately (213–219) → fetch once at dashboard level.
  - `[R8][L]` NBA rows fall back to the raw `actionType` (468) → always use a mapped label.

### components/dashboard/stat-card.tsx — KPI tile (also used on the teams and partners pages)
- Elements: uppercase title, 44px icon tile, 30px value, trend line, rotated 100px watermark icon.
- Findings:
  - `[R3][H]` Title is `text-xs font-bold uppercase tracking-wide` (30). The value is `text-3xl font-extrabold` (43), which is outside the scale. The icon uses `text-[22px]` (35) → title 14/500 in sentence case, value 24/600.
  - `[R7][M]` The icon tile is always primary-tinted; trend colour depends only on sign (20–24, 52) → neutral icon, or none. Colour the trend only when the change matters, with neutral for ±0.
  - `[R10][M]` The decorative watermark icon (63–67) → remove.
  - `[C1][L]` The `color` prop is unused (16) → remove it. Trend shows "-" with no arrow, so it reads by colour only → add an arrow icon.

### components/dashboard/analytics-dashboard.tsx — Opp value by stage, activity trend and activity distribution charts (no callers found; dead code)
- Elements: three Cards: "Opportunity Value by Stage" (bar), "Activity Trends (Last 7 Days)" (line with legend), "Activity Distribution" (horizontal bar).
- Findings:
  - `[N1][M]` No callers anywhere: forms uses `components/forms/form-analytics` → delete the file.
  - If it is kept:
    - `[R1][M]` Hard-coded colours `#8884d8`, `#82ca9d`, `#ffc658` (67, 88, 108).
    - `[CH][M]` The Y axis has no currency formatting (63).
    - `[CH][L]` A legend on a single-series chart (84).
    - `[R8][M]` Raw stage and type keys on the axes (62, 106).
    - `[S1][M]` No error or empty state; failures only go to `console.error` (35).

### components/dashboard/onboarding-checklist-banner.tsx — Admin setup checklist
- Elements: Card "Get your workspace ready" with "x of y steps complete", [Setup steps / Hide steps], [x dismiss], and a grid of step links (done or not).
- Findings:
  - `[F2][M]` Dismiss hides the banner permanently, server-side, with no confirmation or undo (39–49, 61) → undo toast, or "Remind me later" vs "Dismiss for everyone".
  - `[R3][L]` The heading is `font-extrabold` (55) → 600.
  - `[R2][M]` Bordered step cards sit inside a tinted Card (52, 70) → a plain checklist with dividers.
  - `[R10][L]` "x of y" is text only → add a thin progress bar and link to the next incomplete step directly.
  - `[S1][L]` A fetch error silently hides the banner (32) → acceptable, but log it.
  - `[R1][L]` Done items use a primary check plus strikethrough (73, 78) → a neutral check is enough.

### components/communications/communication-events-panel.tsx — Communication timeline on lead and opportunity pages
- Elements: header "Communication Timeline" with [Refresh]. States: loading text, ErrorState, empty text. A list of event cards: channel icon, subject or event type, "CHANNEL · recipient", event-type badge, time, body.
- Findings:
  - `[R8][H]` Raw `event.channel` (81) and `event.eventType` in the badge (85), e.g. "WHATSAPP", "DELIVERED" → label maps.
  - `[R7][M]` Every success state (SENT, DELIVERED, OPENED…) is green (23) → neutral for normal outcomes; colour only BOUNCED, FAILED and UNSUBSCRIBED.
  - `[R3][L]` `font-extrabold` (59, 80) → 600 / 500.
  - `[R2][M]` Each event is a bordered card inside a tab panel (73) → a timeline list with dividers. Clamp long bodies with "Show more" (89).
  - `[S1][L]` Loading is a text box (67) → skeleton rows.
  - `[R10][L]` The 36px icon tile for every row (76) → 16px inline icon.

### app/dashboard/marketing/page.tsx — Marketing Communications (campaigns, composer, compliance, delivery, journeys)
- Elements:
  - PageHeader "Marketing Communications" (long description) with [Refresh] and [New Campaign].
  - ErrorState.
  - KPI strip (only on the Campaigns and Analytics tabs): CAMPAIGNS / AUDIENCE / SENT / CLICKS.
  - Tabs: Campaigns, Composer, Senders & Compliance, Delivery Analytics, Journeys. When the module is disabled, a text notice replaces the first four.
  - **Campaigns tab:**
    - "Campaign List" card: count badge, Split/Full toggle, clickable rows (name, "CHANNEL · TYPE", status badge, ☆ favourite, then audience/sent/failed/updated), empty text.
    - "Campaign Actions" card (or the campaign name): [Back to list] in full view, status badge.
    - Box "Test recipient": input + [Test].
    - Box "Launch workflow": [Request approval] [Approve] [Launch] [Pause].
  - **Composer tab:** "Campaign Builder" with SettingsSections:
    - "1. Audience": Name, Channel, Campaign type, Audience (Lead list / View / Manual), then a list select, view select or manual textarea, and [Preview audience].
    - "2. Message": Template, Provider, Sender, Subject (email only), Message textarea, token help, Throttle / minute, Quiet start, Quiet end, [Save Campaign].
    - "3. Preview": "Audience Preview" with a records badge, an NBA summary line, expandable recipient rows each containing a NextBestActionPanel, and "No reachable recipients". Then "Rendered Preview" (subject and body).
  - **Senders & Compliance tab:** table "Sender Identities" (Channel/Name/Address/State); card "Suppression List" with an input, [Suppress] and a table (Channel/Address/Reason).
  - **Delivery Analytics tab:** table "Recent Delivery Queue" (Channel/Recipient/Status/Source/Updated).
  - **Journeys tab:** JourneysPanel.
- Findings:
  - `[F2][H]` [Launch] sends real messages with no confirmation and no recipient count (440, 241) → AlertDialog: "Send to 2,341 recipients via Email now?" Exclude suppressions and show the sender.
  - `[R9][H]` The 4-button Launch workflow group is always enabled whatever the status (Approve on a running campaign, Launch on a draft). With nothing selected it becomes a wall of disabled buttons (438–447, 432) → one primary action that depends on status (section b), others in ⋯. Hide the panel when nothing is selected.
  - `[E1][H]` Clicking another campaign in the list, or [New Campaign], silently overwrites unsaved composer changes (128–140, 189–195) → dirty flag, a "Discard changes?" guard and `beforeunload`.
  - `[E1][H]` Composer is a separate tab that edits whichever campaign is selected, but its title is only "Campaign Builder" and never names the campaign (458). Users can't tell which campaign they are editing → route `/marketing/campaigns/[id]/edit` with the name in the header and Save in a sticky footer.
  - `[E1][H]` [Save Campaign] only exists in section 2 (582). Section 1 has no save, and nothing shows unsaved state → sticky footer with Save draft · Preview · Continue, plus an "Unsaved changes" indicator.
  - `[E1][H]` The rendered preview shows raw `{{name}}` tokens (636–639). [Preview audience] is in section 1 but its result is in section 3 (516, 586) → render with the first sample recipient, put the preview beside the editor, show the audience count inline next to the audience picker, and make tokens insertable chips.
  - `[E1][M]` Test send uses the saved server copy, not the current draft (252–258) → save before testing, or warn "Testing last saved version".
  - `[F1][M]` Quiet start and end are free-text inputs, not `type="time"`. There is no enable toggle (574–580). Throttle has no min or unit hint (571) → time inputs, a switch, and "messages / minute" with min 1.
  - `[F1][M]` Name, subject and body are never validated. Errors appear only as toasts. The lead list and view selects have no visible label (497, 503) → inline required errors and visible labels.
  - `[F1][M]` Changing channel silently clears template, provider and sender. Changing audience type clears recipients (470, 487) → keep compatible values, or warn.
  - `[F1][M]` The SAVED_VIEW picker loads views for every module (152). journeys-panel already scopes these (114–125) → filter to LEADS.
  - `[F1][L]` Manual recipients are not validated or counted (509–514) → "12 valid · 1 invalid".
  - `[F2][H]` Suppress uses the composer's current `draft.channel` as a hidden channel (272) → explicit Channel select in a "Suppress address" dialog.
  - `[T1][M]` The suppression table is silently cut to 10 rows, with no search, paging or remove action (680) → paginated, searchable table with a confirmed "Remove".
  - `[S1][M]` The Senders, Suppression and Delivery tables have no empty states (652–706) → add them.
  - `[R8][H]` Raw enums appear in: campaign row "EMAIL · BROADCAST" (385); status uppercase with underscores replaced, e.g. "PENDING APPROVAL" (388, 425); sender channel (657); suppression channel (681); outbox channel, status and source type (698–701) → label maps (Email, One-time broadcast, Pending approval…).
  - `[C1][M]` "Delivery Analytics" is just a 50-row queue table with no analytics (689–708) → rename it "Delivery log", add campaign/channel/status filters and paging, and put real rate charts on the campaign detail or link the Sender Reputation report.
  - `[R3][M]` KPI labels are uppercase with letter-spacing (310). Values are `text-2xl font-extrabold` (311). Headings use `font-extrabold` (590, 635) and `font-bold` (614, 637) → 12/500 sentence case, 24/600, 16/600.
  - `[R7][M]` KPI icons are primary-coloured (313). Each row always shows "0 failed" (402). The "Audience" KPI adds recipients across all campaigns, which is misleading (284) → neutral icons, show Failed only when >0 (and colour it then), replace Audience with Delivered %.
  - `[R4][L]` Count badges: "N total" (342) and "0 records" before any preview has run (591) → plain text, hidden until a preview exists.
  - `[R2][M]` Card, then bordered row cards, then bordered boxes (338–451). The KPI cards are another level → a flat table for the list, plain sections in the detail.
  - `[T1][H]` The campaign "list" is a stack of cards with no search, filter, sort or paging (368–406) → DataTable with Name, Channel, Status, Recipients, Delivered %, Clicks, Failed, Updated.
  - `[A2][M]` A favourite button sits inside a `role="button"` div (369–396), which nests interactive elements → make the row a link or a table row with the name as a link.
  - `[R1][L]` Favourite star is amber (395) → foreground, or primary.
  - `[N1][H]` Tabs are not in the URL (118). `?campaignId` is read but never written (168). Back to list doesn't update the URL (417) → routes from section b.
  - `[C1][M]` The disabled-module notice uses dev-style copy with "--" (330). The Launch error toast always claims approval is missing (248) → show the server's error message.
  - `[R5][L]` Header [Refresh] reloads 8 endpoints, and every action triggers a full refetch (296, 207, 235) → drop the button; refetch only what changed.
  - `[IA][M]` Campaign type "Drip / nurture journey" (481) overlaps with the Journeys tab → remove DRIP from campaigns, or point it to Journeys.
  - `[R10][M]` A full NextBestActionPanel is nested inside each audience preview row (623–627) → show a count chip and a link to the record.
  - `[S1][L]` While loading, the list shows only a "Loading" badge (342) → skeleton rows.

### components/marketing/journeys-panel.tsx — Journey list, create dialog, version history
- Elements:
  - Header "Marketing Journeys" (technical description) with [New Journey].
  - Health strip: "Journey health:" with N healthy / N degraded / N at risk badges.
  - Journey cards: name, then status, module, version and health badges, description. Actions: [Edit Workflow ↗] [Versions] [Approve/Activate] [Enroll Audience Now] [Pause].
  - Dialog "New Marketing Journey": Name, Description (optional), Target Module, Audience Source, then Lead List, Saved View (with an error state) or Record Ids, and a Continuous enrollment switch. Footer [Cancel] [Create Journey].
  - Dialog "Version History — X": [Publish Current], version rows with a Current badge and [Restore], [Close].
- Findings:
  - `[F2][H]` [Enroll Audience Now] enrols the whole audience with no confirmation or count (331, 176). [Approve/Activate] (324) and [Pause] (335) have no confirmation → confirm Activate and Enroll with the audience count.
  - `[M1][M]` Restore uses `window.confirm` (223). Publish Current has no confirmation and no notes field (448) → AlertDialog, and a dialog with a notes field.
  - `[R9][H]` Up to 5 buttons per row (312–341) → one primary action that depends on status, plus ⋯ (Edit workflow, Versions, Enroll now, Pause).
  - `[R8][H]` Status shown raw ("ACTIVE") (286). Target module shown raw ("LEAD/OPPORTUNITY") (288).
  - `[R8][H]` "Manual Record Ids (comma-separated)" asks users to type raw IDs (421–426) → record picker or paste list with name lookup.
  - `[R3][M]` Badges are `text-[0.65rem]` (285, 288, 289, 299, 466). Headings are `font-bold` (249, 284, 464) → 12px/500.
  - `[R4][M]` The version and module badges are not statuses (288–291) → plain meta text: "Leads · v3".
  - `[R7][M]` The health strip colours zero counts, e.g. a red "0 at risk" (263–271) → only render a segment when its count is >0; hide the strip when everything is healthy.
  - `[F1][M]` Create is disabled with no explanation when the audience isn't ready (356). The name error only appears as a toast (133) → inline helper text.
  - `[C1][M]` The description "…on top of Views/Lists as audiences and the existing Automation workflow builder" (251) and the switch label "(worker re-checks the audience periodically)" (431) read as internal notes → "Automated multi-step outreach" / "Automatically enrol new matching records".
  - `[N1][M]` Edit Workflow opens a new browser tab (314). After creating a journey there is no next step (139) → open the workflow in the same tab with a Back link; after create, go straight to the editor.
  - `[R2][M]` Cards in a list inside a tab inside a page, with bordered version rows in the dialog (280, 461) → a table with Name, Status, Audience, Version, Health, Actions.
  - `[S1][L]` A 2-column table skeleton is shown for a card list (243) → a matching skeleton.
  - `[C1][L]` Dates use `toLocaleString` (470) instead of `formatWorkspaceDateTime` → use the shared formatter.
  - `[R9][L]` SCHEDULED and ARCHIVED states have no actions, and there is no Archive action (51–55) → add Archive (with confirmation).

### app/dashboard/reports/page.tsx — Reports & Analytics (9 sections)
- Elements:
  - PageHeader "Reports & Analytics" with [Export Data] (a page-level QueueExportButton).
  - Section switcher: native `<select>` "Report section" below 1000px, TabsList above.
  - Top-level tabs: Overview, Inbuilt Reports, Saved Reports, Builder, Schedules, Annotations, Data Catalog, Metrics, Compare.
  - **Overview:** MetricCards "Total Leads", "Open Opportunity Value", "Total Activities". Card "Opportunity Value by Stage" (progress bars with "N Deals" and a value). Card "Leads by Source" (rows with counts). Skeleton or ErrorState.
  - **Inbuilt Reports:**
    - Card header "Inbuilt Reports" with a "N reports" badge, [Run Selected], [Export], [Refresh Rollup].
    - Rollup bar: "Rollup STATUS" badge, last-refreshed text, "Auto-refresh every [n] min" with [Save].
    - Left list of 28 report buttons (label, category badge, description).
    - Right panel: title and description; parameter selects (Attribution model ×8; Period preset ×3; Cohort dimension ×7; Funnel segment ×4); "Generated" badge.
    - Preview table: up to 8 columns × 10 rows, with an "Open records" link per row. Empty texts.
  - **Saved Reports:** card "Custom Reports". Rows: name, Deprecated badge, "MODULE • Created • vN • Opened Nx", then ☆, [Edit], [Export CSV], ⋮ (Publish Version, Version History, Clone, Transfer Owner, Deprecate/Reactivate), and a trash icon. ReportVersionHistoryDialog has a [Restore] per version.
  - **Builder:** "Custom Report Builder" with "Cross-object" and "Editing" badges, [Run Preview], [Save/Update], [New Report]. Collapsible "Build with AI" (prompt input, [Ask AI]). Sub-tabs:
    - Setup: Report Name, Root Object, Record Source, Row Limit.
    - Columns: [Add Column]; per row object, field, display label, trash.
    - Filters & Sort: [Add Filter]; per row object, field, operator, value, trash. Then Sort Object, Sort Field, Direction.
    - Preview: table of 10 rows with "x of y rows".
  - **Schedules:** "Report Scheduling" with a "Recurring" badge and [Create Schedule] in the header. Sub-tabs:
    - Create Schedule: Source, Report, Frequency, Day of week/month, Recipients, Format.
    - Existing Schedules: rows with frequency and format badges, a "paused" badge, next run, recipients, last run and status, an active Switch and a trash icon.
  - **Annotations:** "Analytics Annotations". Form: Label, Category, Date, [Add], Description. Table: Date, Label, Category badge, Description, delete icon.
  - **Data Catalog:** a grid of object cards, each with a "N fields" badge and raw field-name badges, plus a long footnote.
  - **Metrics** (SettingsSections "Metrics" / "Calculated metrics"):
    - Metric form "New/Edit Metric": Name, Description, Root, Aggregation, Field to aggregate (object + field), Group by (object + field), Grain, Filters (with [Add Filter]), Sharing (+ team), [Cancel] [Create/Save].
    - Table "Metrics": Name, Definition, Governance (clickable Certified/Active badges), Sharing, Value ([Compute]), Actions (history, edit, delete).
    - MetricGrainHistoryDialog: a table of Period Start and Value.
    - Calculated Metrics: Name, steps (operator + metric + trash), [Add Metric], [Create Calculated Metric]. Table: Name, Formula, Value ([Compute]), delete.
  - **Compare:** "Compare Segments". Two fieldsets, Segment A and Segment B, each with Records, Group by and Exact value. [Compare], ErrorState, and a results table: Segment, Records, Won, Win Rate, Avg Deal Value.
- Findings:
  - **Navigation and structure**
    - `[N1][H]` Nine flat tabs mix consumption (Overview, Inbuilt), authoring (Builder, Metrics), admin (Catalog, rollups) and config (Schedules, Annotations) (54, 125) → restructure as in section b.
    - `[N1][H]` Tab state is not in the URL (61). Builder sub-tabs are uncontrolled (1232) → route-based sections.
    - `[N1][H]` Broken deep link: scheduled-report emails link to `/dashboard/reports?report=<key>` (`lib/repositories/report-schedules-postgres.ts:424`), but the page only reads `create` and `reportId` (82–88) → a viewer route per report, e.g. `/reports/standard/<key>`.
    - `[E1][H]` Saved reports can only be edited, never viewed. [Edit] is the only way to open one and it lands in the builder (3136, 3039–3044) → a viewer page as the default open; Edit as a secondary action.
    - `[CH][H]` Custom reports are always saved as `chartType: "TABLE"` (1166). Inbuilt reports render only as tables. No report on this page has a chart → a chart picker in the builder (bar, line, stacked, funnel, KPI) and a default chart per inbuilt report.
  - **Overview tab**
    - `[CH][H]` "Opportunity Value by Stage" sizes its bars by deal count, not value, while labelling both (170–177) → size by value, or rename it "Deals by stage". Use a horizontal bar chart with currency formatting.
    - `[N1][M]` Overview has no date range and duplicates the Dashboard (129–209) → remove it, or make it a date-scoped "Key metrics" view.
    - `[R8][M]` Raw stage and source keys (167, 198) → labels.
    - `[R10][M]` Hover lift and slide effects on non-clickable cards and rows (278, 194) → remove, or make them drill-down links to filtered lists.
    - `[R1][M]` MetricCards each use a different accent (primary, secondary, tertiary icon tiles) (139–153) → single accent or neutral.
    - `[R3][M]` The value is 18px extrabold with −1px tracking, smaller than the bold title (291–296); `font-extrabold` is used throughout (200) → value 24/600, label 14/500.
  - **Inbuilt Reports tab**
    - `[N1][M]` 28 reports in one long list with no search or category grouping (831–849) → search plus category groups (Pipeline, Marketing, Team, Service, Finance, Governance), with favourites first.
    - `[R4][M]` Category badges (843) and the "N reports" count badge (784) are not statuses → plain group headings.
    - `[R3][M]` Category badges are 0.65rem (843) → 12px.
    - `[E1][M]` Changing a parameter (model, preset, dimension, segment) doesn't re-run the report. [Run Selected] duplicates clicking a card (791, 859–916) → re-run automatically when a parameter changes; drop Run Selected.
    - `[A1][M]` Parameter selects have no labels (861, 877, 889, 905) → visible labels such as "Attribution model".
    - `[R9][M]` Admin rollup controls (Refresh Rollup, interval input, Save) are shown to everyone. Non-admins only lose the status text (800–826, 699) → move them to Settings > Analytics and show a simple "Updated 5 min ago · Refresh" in the viewer.
    - `[R8][M]` "Rollup FRESH" shows the raw status, and FRESH is green (656, 641) → "Up to date", neutral; colour only Stale and Error.
    - `[T1][H]` The preview is silently limited to 10 rows × 8 columns (691, 944). Cells use `String`/`JSON.stringify` with no number, currency, percent or date formatting (1484–1489) → a full paginated, sortable table with typed formatters and enum labels.
    - `[C1][L]` A success toast fires on every report load (730) and every preview (1150) → no toast on success.
    - `[N1][L]` "Open records" opens a new tab (952). The data-quality drill only links the first record (1591) → same tab; drill into all affected records.
    - `[R4][L]` "Generated <date>" is a badge (918) → plain meta text.
  - **Builder tab**
    - `[E1][H]` Bug: [New Report] only clears `editingReportId` and keeps every field, so it actually creates "Save as new" with the old name (1205–1209) → reset to a blank definition, and add a separate "Save as…".
    - `[E1][H]` Nothing tracks unsaved changes. The default name "Lead activity report" makes Save immediately available (975, 1201) → dirty tracking, a disabled-until-changed Update, and a leave guard.
    - `[E1][H]` The preview is a separate sub-tab, so changes can't be seen while editing (1232–1477) → split layout: config rail on the left, live preview on the right that auto-runs after a debounce.
    - `[T1][M]` The preview header says "100 of 500 rows" but shows only 10 (1450, 1462) → show all returned rows, paginated.
    - `[F2][M]` Changing Root Object wipes columns and filters with no confirmation (1116–1123) → confirm if any columns or filters exist.
    - `[E1][M]` Columns can't be reordered (1294–1328) → drag or up/down controls.
    - `[R8][M]` Status, priority and SLA filter values are raw uppercase ("IN PROGRESS", "LOW", "BREACHED"), and the status list mixes modules (402–404, 1099–1101) → per-object picklists from the server with labels.
    - `[R3][M]` Uppercase bold "Columns" and "Filters" labels that aren't tied to controls (1287, 1336) → 14/600 headings.
    - `[R4][L]` "Cross-object" badge (1189) → remove it. Keep "Editing" as a title prefix instead.
    - `[A1][L]` "Remove column" and "Remove filter" have the same label on every row (1324, 1398) → include the index or name.
    - `[R2][M]` Tinted row panels inside a Card (1295, 1351) → a plain list with dividers.
    - `[F1][L]` Row limit isn't validated (an empty value becomes 0) (1279) → clamp to 1–1000 with an inline error.
    - `[R10][L]` "Build with AI" is a collapsible inside the builder (1213) → a prominent entry option on the "New report" screen.
  - **Saved Reports tab**
    - `[F2][M]` Delete uses native `confirm` (3047). Restoring a version has no confirmation (3204) → AlertDialog that also lists schedules and dashboards using the report.
    - `[M1][H]` Publish (3058), Clone (3069), Transfer Owner (3081, raw user id) and Deprecate (3094) use `window.prompt`. Bug: Cancel still publishes or deprecates (3058, 3094) → dialogs and a user picker.
    - `[R8][M]` Raw module "LEAD" in row meta (3122) → "Leads".
    - `[R3][L]` Deprecated badge is 10px (3119).
    - `[T1][M]` Saved reports are a card list with no search, owner, last run or sort (3113–3181) → a table, merged into the library.
    - `[R9][L]` Each row shows Favourite, Edit, Export CSV, ⋮ and Delete → Open as the row click, with ⋯ for the rest.
  - **Schedules tab**
    - `[F1][H]` [Create Schedule] sits in the card header and submits the hidden "Create" form even while the "Existing" sub-tab is showing (1712) → make the list the default view, and put Create in a dialog with its own submit.
    - `[F1][M]` Recipients are not validated (1664). There is no time of day or timezone. Inbuilt report parameters can't be set (1655–1667) → email chips with validation, a time + timezone field, and parameter fields.
    - `[A1][M]` The Day of month / Day of week label points to an id that only exists on the disabled DAILY input (1779–1803) → give the select the id.
    - `[R8][M]` Badges "WEEKLY" / "CSV" at 0.65rem; a lowercase "paused" badge; last status raw, with "UNKNOWN" as a fallback (1847–1856) → "Weekly · CSV" as plain text, Status "Paused" / "Failed" as the only badges.
    - `[C1][M]` "Until mail transport is connected, due runs create pending delivery records." (1709) → remove it, or show it as an admin-only warning.
    - `[R4][L]` "Recurring" badge (1706) → remove it.
    - `[F1][L]` The inbuilt report picker ignores the payouts feature flag (1758) → use the filtered `reportOptions`.
    - `[A1][L]` The Switch is labelled "Toggle schedule" on every row (1864) → "Pause {report name}".
  - **Annotations tab**
    - `[F2][M]` Delete has no confirmation, and the icon button has no `aria-label` (1942, 2021) → confirm or undo, and add a label.
    - `[S1][M]` A load error only shows a toast and then "No annotations yet." (1910) → ErrorState.
    - `[R10][L]` Breakpoint classes (`lg:col-span-2`/`5`) are mixed into a container-query grid (1963, 1988) → fix the layout.
    - `[R4][L]` Category is a badge (2015) → plain text.
    - `[N1][M]` Annotations are managed in a separate tab, away from the charts they mark → add them from a trend chart, and keep the list under Settings.
  - **Data Catalog tab**
    - `[C1][H]` A 6-line developer footnote (2124–2131) → remove it.
    - `[R8][H]` Raw field keys shown as 0.65rem badges (2114). Object count badges (2110) → a searchable list with humanised labels.
    - `[N1][M]` A top-level tab for reference data → a "Fields" help drawer inside the builder.
    - `[S1][L]` Errors only show a toast (2084) → ErrorState.
  - **Metrics tab**
    - `[A2][H]` The governance toggles are clickable `<span>` badges: not focusable, no confirmation, and they change certification and deprecation for everyone (2564–2577) → ⋯ menu items "Certify" / "Deprecate…" with confirmation, and status shown as a badge.
    - `[F2][H]` Deleting a metric has no confirmation, though pivot widgets and calculated metrics depend on it (2310, 2601). Deleting a calculated metric has no confirmation and no feedback (2736, 2835) → AlertDialog with dependency warnings.
    - `[C1][M]` The Edit button uses the RefreshCw icon (2598–2600) → Pencil.
    - `[R8][M]` Definition shows "COUNT of Lead.Name" (2558). The grain badge is a raw "DAILY" at 10px (2560) → "Count of leads by Source · Daily".
    - `[S1][M]` Values need a manual [Compute] per row (2586, 2829) → compute automatically on load (lazy or batched) and format the result.
    - `[E1][M]` The create form is always open above the list (2350–2529). Calculated metrics can be created but not edited (2675–2848) → list first, with New/Edit in a side sheet for both kinds.
    - `[F1][M]` Group-by and Grain silently reset each other (2420, 2443) → disable one with an explanation.
    - `[F1][M]` Metric filter values are free text, unlike the builder's value pickers (2484) → reuse the builder's value picker.
    - `[F1][L]` Calculated Save is enabled with 1 step but then fails with "Pick at least 2" (2805, 2718) → disable it until there are 2 steps.
    - `[CH][M]` Grain history is a table in a dialog. Load errors show a toast followed by "No periods computed yet." (2622–2660) → line chart with a table toggle, and ErrorState.
    - `[R3][L]` Uppercase "Filters" label (2455). "Root" is jargon (2372) → "Based on".
  - **Compare tab**
    - `[F1][H]` "Exact value" is free text with a single placeholder, so typos give empty results (2897) → a value combobox filled from the chosen dimension.
    - `[R8][M]` Results show "Lead: SOURCE = Website" (2976) → "Leads · Source: Website".
    - `[CH][M]` Results are a table with no difference column or chart (2962–2985) → add a Δ column and a paired bar chart.
    - `[IA][M]` A standalone tab → a standard report in the library ("Segment comparison").
  - **Whole page**
    - `[R4][M]` The page header [Export Data] doesn't say what it exports (117) → remove it; exporting belongs in each report viewer.
    - `[R3][M]` About 36 bold or extrabold uses and 12 sub-12px sizes across the page (line list in Top-15 item 8) → 16/600 for section titles, 14/500 for labels.
    - `[R2][M]` Every section is a `rounded-2xl` Card that holds more bordered panels (777, 852, 1183, 1699, 1953, 2091, 2350, 2764, 2942, 3107) → page-level sections with one container level.
    - `[R10][L]` Metric and catalog loads fetch the same `/reports/query` catalog 4 times on this page (1023, 2082, 2208, plus the dashboard dialog) → shared cache.

---

### (a) Top 15 changes
1. **Restructure Reports** into Library → Viewer → Builder routes with URL state. Fix the broken `?report=` link in scheduled-report emails (reports/page.tsx 54/82–88; report-schedules-postgres.ts:424).
2. **One shared ConfirmDialog/PromptDialog** to replace all 13 `window.prompt`/`confirm` calls. Fix the bug where Cancel on a prompt still publishes or deprecates (dashboard-manager 306/343; reports 3058/3094).
3. **Confirm everything that sends messages or can't be undone:** campaign Launch (with recipient count), journey Activate and Enroll, deleting widgets, tabs, layouts, metrics, calculated metrics and annotations, governance changes, and all version restores (inventory in d).
4. **Campaign detail page** with one primary action that depends on status, replacing the always-enabled 4-button "Launch workflow" wall (marketing 427–450).
5. **Campaign composer with a real save model:** route-based, campaign name in the header, sticky Save draft, dirty guard on campaign switch and navigation, live token-rendered preview beside the editor, inline audience count, and a Review & launch step.
6. **Dashboard view/edit mode:** view by default; Edit buffers drag, resize and remove until Save/Cancel; keyboard move and resize. Remove the "Saved layouts" bar and "template" details from the main view (replaced by versions and "Start from template").
7. **Typed cell and value formatting** across reports and widgets (currency, %, numbers, dates), plus label maps for every enum (campaign channel/type/status, outbox, journey status/module, schedule frequency/format/status, metric aggregation/grain, report module, rollup status, filter picklists).
8. **Charts everywhere they belong:** a chart type in the builder (custom reports are hard-coded to TABLE); a default chart per inbuilt report; legends and data labels for pie, stacked and funnel; axis and tooltip formatters with units; a shared empty-data state; an accessible validated palette; `role="img"` summaries and a "Show data" table toggle; keyboard-accessible cross-filter. Fix the Overview "value by stage" bars, which are sized by count.
9. **Apply the type scale:**
   - Remove `font-extrabold`, uppercase micro-labels and every `text-[0.65rem]`/`text-[10px]`/`[11px]`.
   - Redesign StatCard/MetricCard: 14/500 label, 24/600 value, no watermark, no hover lift, no coloured icon tiles.
   - Hotspots: stat-card 30/35/43; marketing 310/311; journeys 285–299/466; reports 843/1847–1849/2110–2114/2560–2577/3119; dashboard-manager 443/534; widget-library 258/306/347/507.
10. **Badges only for status:** remove count, category, "Cross-object", "Recurring", "Generated", version, module and format badges, and show colour only when something needs attention. That means no green for normal success states, no coloured zero health counts, no "0 failed" noise.
11. **Pickers instead of raw IDs and free text:** user picker for Transfer owner; record picker for journey "Manual Record Ids"; value combobox for Compare "Exact value"; server picklists for builder and metric filter values.
12. **Marketing compliance and delivery:**
    - Suppress gets an explicit channel; the suppression table gets search, paging and Remove.
    - Rename "Delivery Analytics" to "Delivery log", with filters and paging.
    - Senders get an empty state and a link to add or verify.
    - Turn the campaign list into a DataTable.
13. **Metrics list first:** create and edit in a side sheet, including calculated metrics; governance as menu actions instead of clickable spans; fix the RefreshCw "Edit" icon; compute values automatically; grain history as a chart.
14. **Inbuilt report catalogue:** search plus category groups and favourites; parameters re-run automatically with visible labels; rollup admin controls move to Settings > Analytics; no success toasts on load or preview.
15. **Remove developer and internal-note copy and dead code:**
    - Copy: the Data Catalog footnote, "mail transport" text, the journeys description, "worker re-checks", "--" dashes throughout, and "Approve the campaign before launch…" as a catch-all error.
    - Code: delete the unused `components/dashboard/analytics-dashboard.tsx`.

### (b) Proposed information architecture

**Reports** (3 URL-backed tabs; admin items move to Settings):
- `/dashboard/reports` is the **Library**, with one searchable table of all reports.
  - Columns: Name, Type (Standard/Custom), Category, Owner, Last run, Scheduled ✓, ☆.
  - Filters: type, category, owner, "Favourites", "Recently viewed".
  - Primary button: [New report]. That goes to `/reports/new`, which offers "Start blank", "Describe with AI" and "Start from a standard report".
- `/dashboard/reports/standard/<key>?range=…&model=…&segment=…` is the **Viewer** for inbuilt reports.
  - Header: name and description, then "Updated x ago · Refresh".
  - One-row toolbar: Date range, report parameters, [Export ▾], [Schedule], [Add to dashboard], ⋯.
  - Body: a default chart, then a sortable, paginated table with formatted cells and drill-down links in the same tab.
  - Segment comparison, Period comparison, Funnel explorer and similar reports live here as standard reports, so the Compare tab goes away.
- `/dashboard/reports/custom/<id>` is the Viewer for custom reports: the same layout, plus ⋯ (Edit, Duplicate, Version history, Transfer ownership, Deprecate, Delete).
- `/dashboard/reports/custom/<id>/edit` and `/reports/new` are the **Builder**, full page:
  - Left rail: Source (object + view), Columns (reorderable), Filters, Sort & limit, Visualization (Table/Bar/Line/Stacked/Funnel/KPI), and a "Fields reference" drawer that replaces the Data Catalog tab.
  - Right: live preview.
  - Sticky footer: Cancel · Save as… · Save, with dirty tracking and a leave guard. Versions are created on Save.
- `/dashboard/reports/schedules` lists every schedule.
  - Columns: Report, Frequency, Next run, Recipients, Format, Last status, Active switch, ⋯.
  - Create from the report viewer's [Schedule], or from [New schedule], in a dialog.
- `/dashboard/reports/metrics` is one table for metrics and calculated metrics.
  - Columns: Name, Definition (humanised), Type, Status (Certified/Deprecated), Value, Owner.
  - `/metrics/<id>` is a side sheet or page with a trend chart (grain history), definition editing and governance actions.
- Settings > Analytics (admin only) holds rollup refresh policies, the annotations list, and the dataset catalogue. Annotations can also be added from any trend chart.
- The Overview tab is removed and its KPIs go to the Dashboard. If it has to stay, make it a date-scoped "Key metrics" standard report.

**Marketing:**
- Tabs as sub-routes: `/dashboard/marketing` (Campaigns) | `/marketing/journeys` | `/marketing/delivery` | `/marketing/compliance`.
- **Campaign list** (`/marketing`): a DataTable with Name, Channel, Status badge, Recipients, Delivered %, Clicks, Failed (shown and coloured only if >0), Updated, Owner.
  - Toolbar: search, Status, Channel, [New campaign].
  - Row click opens the detail page.
- **Campaign detail** (`/marketing/campaigns/<id>`):
  - Header: name, status badge, and one primary action set by status. Draft → [Edit] [Request approval]. Pending → approver sees [Approve] / [Reject]. Approved → [Launch…] / [Schedule…], with confirmation. Running → [Pause]. Paused → [Resume] / [Cancel…].
  - ⋯ menu: Duplicate, Send test, Archive.
  - Body:
    - KPI row: Recipients, Delivered, Opened, Clicked, Failed.
    - Delivery-over-time chart.
    - Message preview and audience summary.
    - Approval and activity log.
    - Recipient/outbox table filtered to this campaign.
- **Composer** (`/marketing/campaigns/new` and `/<id>/edit`, Draft only; otherwise "Duplicate to edit"). A stepper with a persistent side preview:
  1. Setup: Name, Channel, Description.
  2. Audience: Source, then list, view or paste. Live count and sample. Suppressed and unreachable recipients excluded, with counts.
  3. Message: Template, which pre-fills the body; Sender, with a verified indicator; Subject; Body with insertable tokens. Live rendered preview using a sample recipient.
  4. Delivery: Throttle (messages/min), Quiet hours (switch + time inputs), Send now or Schedule.
  5. Review: a checklist (sender verified, audience > 0, subject present, approval state), [Send test], [Request approval] / [Launch…].
  - Sticky footer: Save draft · Back · Continue, with "Unsaved changes" and a leave guard.
- **Journeys:** a table (Name, Status, Audience, Version, Health shown only if not healthy, ⋯).
  - [New journey] dialog, then the workflow editor opens in the same tab.
  - `/journeys/<id>` shows Overview, Versions and Enrolments. Activate and Enroll confirm with counts.
- **Delivery:** the outbox log with Campaign, Channel, Status and Date filters, paging, and a link to the Sender Reputation report.
- **Compliance:** Senders table ([Add sender] / verify link, empty state). Suppressions table: search, Channel filter, [Suppress address] dialog with an explicit channel, row Remove with confirmation, paging.

### (c) "My day" dashboard and edit mode

**Default "My day" widgets** (rep persona; red only when the count is >0):
1. **My tasks:** due today and overdue, with complete checkboxes and an overdue count. Large, top-left.
2. **Waiting on first response / SLA at risk:** leads past or near their SLA, with time remaining. Builds on the sla_response_breaches data.
3. **Next best actions:** the existing NBA widget, top 5.
4. **Today's calls & meetings:** agenda list, with click-to-call or join.
5. **New leads assigned to me:** last 24 hours, with source and age.
6. **Approvals waiting on me:** NbaPendingApprovalsPanel turned into a widget, plus campaign approvals.
7. **My pipeline:** open value and deals closing this month (KPI pair), with a small bar chart by stage.
8. **Deals at risk:** predictive_scoring highRiskOpportunities as a list.
9. **Activity this week vs last:** one KPI with a change arrow (activity_call_volume_trends).

The Manager template swaps in: team SLA breaches by owner (bar), rep performance (table), pipeline by stage (funnel), forecast (line), and data quality issues (KPI with a link).

**View mode (default):**
- Header: "Dashboard" plus a dashboard switcher dropdown (My day ★ default, other dashboards, "Shared with you"), a date-range select, [Edit], and ⋯ (Export PDF, Duplicate, Version history, Sharing & ownership, Delete…).
- Widgets: no drag handles. Each has a title, freshness shown on hover or when stale, and ⋯ (Open report/records, Refresh, View data table).
- Cross-filter chip below the header.
- `?dashboard=<id>` in the URL.

**Edit mode:**
- A sticky bar replaces the header: "Editing My day · [Add widget] [Templates] [Rename] | [Cancel] [Save]".
- Widgets get a visible grip handle, resize corners, a ✎ configure button and an ✕ remove button (with an undo toast).
- Keyboard: Tab to a widget, Space to pick it up, arrows to move, Shift+arrows to resize, Esc to drop.
- All changes are buffered locally. Save sends one batch PATCH and automatically creates a version, which replaces both "Saved layouts" and the manual "Publish". Cancel asks "Discard changes?" when there are edits, and there is a `beforeunload` guard.
- [Add widget] opens a right-side sheet: a gallery grouped by My work / Pipeline / Marketing / Service / Reports and metrics, each card with a description and a live thumbnail. Choosing one goes to a configure step: data, then a title that is auto-suggested, then Advanced (auto-refresh, sharing) collapsed. A live preview sits beside the form, and the widget is placed in the first free slot.
- Tab and dashboard delete, rename and deprecate live only in edit mode or the ⋯ "Manage" dialog.

### (d) Destructive and high-impact actions, and how each is confirmed today

| # | Action | Location | Confirmation today |
|---|---|---|---|
| 1 | Delete widget | widget-library 498 → dashboard-manager 204 | None |
| 2 | Delete dashboard tab (moves its widgets) | dashboard-manager 490 → 291 | None (disabled when only one tab) |
| 3 | Delete saved layout | dashboard-manager 550 → 380 | None (unlabelled-looking trash icon) |
| 4 | Restore saved layout (overwrites positions) | 548 → 369 | None |
| 5 | Restore dashboard version | 688 → 657 | None (dialog subtitle reassurance only) |
| 6 | Transfer dashboard owner | 476 → 329 | `window.prompt` for raw user id; no confirmation |
| 7 | Deprecate dashboard tab | 480 → 341 | `window.prompt` for reason; **Cancel still deprecates** |
| 8 | Publish dashboard version | 464 → 306 | `window.prompt`; **Cancel still publishes** |
| 9 | Dismiss onboarding checklist (permanent) | onboarding-checklist-banner 61 → 39 | None |
| 10 | Delete report schedule | reports 1866 → 1688 | Native `confirm()` |
| 11 | Pause or resume schedule | reports 1861 | None (reversible switch, acceptable) |
| 12 | Delete annotation | reports 2021 → 1942 | None |
| 13 | Delete metric (dependants may break) | reports 2601 → 2310 | None |
| 14 | Certify, uncertify, deprecate or reactivate metric | reports 2564–2577 → 2332 | None (click on a badge) |
| 15 | Delete calculated metric | reports 2835 → 2736 | None, and no success toast |
| 16 | Delete custom report | reports 3175 → 3046 | Native `confirm()` |
| 17 | Restore report version | reports 3235 → 3204 | None |
| 18 | Transfer report owner | reports 3165 → 3080 | `window.prompt` for raw user id |
| 19 | Deprecate custom report | reports 3169 → 3092 | `window.prompt`; **Cancel still deprecates** |
| 20 | Publish report version | reports 3153 → 3057 | `window.prompt`; **Cancel still publishes** |
| 21 | Change builder Root Object (wipes columns and filters) | reports 1250 → 1116 | None |
| 22 | Change metric Root (wipes filters) | reports 2373 → 2233 | None |
| 23 | Remove builder column, filter or metric filter / calculated step | 1324, 1398, 2490, 2793 | None (local; undo would be nice) |
| 24 | "New Report" in builder (keeps the old definition, saves a copy) | reports 1206 | None. Misleading |
| 25 | **Launch campaign (sends messages)** | marketing 440 → 241 | **None** |
| 26 | Pause campaign | marketing 444 → 227 | None |
| 27 | Request approval / Approve campaign | marketing 438–439 | None, and offered in every status |
| 28 | Suppress address (channel taken from the composer draft) | marketing 672 → 267 | None |
| 29 | Switch campaign or New Campaign (discards unsaved draft) | marketing 373 / 297 → 128 / 189 | None |
| 30 | Change channel (clears template, provider, sender) / change audience type (clears recipients) | marketing 470 / 487 | None |
| 31 | Approve or Activate journey | journeys-panel 324 → 148 | None |
| 32 | **Enroll Audience Now (sends to the whole audience)** | journeys-panel 331 → 176 | **None** |
| 33 | Pause journey | journeys-panel 335 → 163 | None |
| 34 | Publish current journey workflow | journeys-panel 448 → 205 | None |
| 35 | Restore journey version | journeys-panel 477 → 221 | Native `window.confirm` |

Summary: 3 actions use native `confirm`, 6 use `window.prompt` (4 of which still run when cancelled), and the other 26 have no confirmation. That includes the two that send messages to customers (#25 and #32).

---

# P4 · Builders: automations, forms

## Builders/Editors UI/UX review: automation builder and form builder

I opened all 19 files in P4-builders.txt and read every line. I also checked four supporting files: `builder-workspace.tsx`, `standard-dialog.tsx`, `tabs.tsx` and the builder CSS in `globals.css`.

The biggest problems are not visual. Each of the following can silently lose data or run live actions:
- The automation step config is implemented twice.
- The form builder's tabs discard unsaved work.
- The two form save buttons overwrite each other.
- Half the builder's promises (validation rules, theme presets, Update Task) do nothing.

Line numbers below are from the current files. All paths are relative to `/Users/arjunh/Documents/crm/crm/`.

---

### src/app/dashboard/automations-v2/page.tsx — Automation list
- **Elements:**
  - Header: H1 "Workflow Automations", subtitle, "New Automation" button.
  - Toolbar: "Search automations..." input, "Filters" button.
  - DataTable columns: Automation Name (with description), Status, Trigger, Steps, Runs, ⋮ menu.
  - ⋮ menu items: "Edit Designer", "Delete".
  - Empty state: "No automations found".
- **Findings:**
  - `[S1] [H]` After a delete the list can go empty. `deleteAutomation` is captured inside `columns` memoised on `[router]` only (175). It calls `setAutomations(automations.filter…)` (64) using the stale first-render `automations` (`[]`). → Use the functional form `setAutomations(prev => prev.filter(…))`, or add the handler to the deps.
  - `[R8] [H]` The Trigger column shows a raw enum: `trigger.type.replace('_',' ')` (115) only replaces the first underscore ("OPPORTUNITY DISTRIBUTION_FAILED"). → Map through the same `TRIGGER_TYPES` labels the builder uses (move them to a shared module).
  - `[C1/R9] [H]` "Filters" does nothing (202-205). → Remove it, or add Status/Trigger/Module filters.
  - `[F2] [M]` Delete uses native `confirm()` (60) and has no undo. → Use a destructive AlertDialog that names the automation and its run count, plus an undo toast or a recoverable archive.
  - `[R9] [M]` The ⋮ menu lacks Activate/Deactivate, Duplicate, View history and Test. "Edit Designer" duplicates the row click. → Menu: Open, Duplicate, Pause/Resume, View runs, Delete.
  - `[R3/R4] [M]` The status badge is `font-bold uppercase` (100-101). The name uses `font-bold text-primary` (84), a second accent. → Sentence-case status pill using the shared status token; plain foreground name.
  - `[R10] [M]` Missing "Last run", "Last modified by/at" and "Errors (24h)" columns, which enterprise lists expect. Steps counts include branch pseudo-nodes. → Add those columns; count real steps only.
  - `[A1] [M]` The ⋮ IconButton has no `aria-label` (151). → `aria-label="Actions for {name}"`.
  - `[R2] [L]` `rounded-xl` overrides on the buttons and input (186, 199, 202) differ from the system radius. The fixed `h-[calc(100vh-280px)] min-h-[600px]` (208) makes the page scroll twice on short screens. → Use default radii and a flex-fill layout.

### src/app/dashboard/automations-v2/[id]/page.tsx — Automation builder (3,558 lines)
- **Elements:**
  - **Header (1275-1313):**
    - Back arrow, H1 "New Automation" / "Edit Workflow".
    - Sub-line: name • "Designer View".
    - Active switch ("Active"/"Inactive"), "Test" (saved automations only), "Enroll" (saved only), "Save"/"Saving...".
  - **Panel switcher from BuilderWorkspace (1315):** "Canvas", "Workflow & history".
  - **Left panel tabs (1319-1334):** "Designer" | "History".
  - **Designer inner tab list (1338-1341):** a single "Workflow" tab. Its sections:
    - "DETAILS": Name, Trigger select, conditional Opportunity Type / Activity Type, "App (leave unset for any app)", "Event Name (leave blank for any event)".
    - "ADD STEPS": helper copy plus an "Add trigger" button when the canvas is empty.
    - "SAFETY GUARDS": Max runs per record, Max steps per run, Exit conditions (+Add, any/all, field/operator/value rows, trash).
  - **Hidden "step" TabsContent (1550-2498):** "STEP CONFIGURATION", ending in "Update Step". It is unreachable because no trigger exists and `designerSection` is reset to "workflow" on every selection (600-602).
  - **History tab (2502-2542):** "EXECUTION LOG" cards (status badge, timestamp, entity type, ExecutionLogViewer).
  - **Canvas (2547-2570):** ReactFlow with Controls, MiniMap, dot Background, smoothstep edges, snap-to-grid.
  - **Step config dialog (2591-3508):**
    - Title is the step label; subtitle "Choose conditions and actions from controlled lists…".
    - Buttons "Cancel" / "Save Step"; common fields "Step Name" and "Step Type".
    - Per-type sections: Trigger Event; Conditions (+Add Condition, Match all/any, Else-if branches, +Add Else-if); Field Updates (+Add Update); Activity; Opportunity; Create Task; Playbook; Assign/Reschedule/Complete Task; Traffic Split (+Add Variant); Wait (Resume At, Timezone, Fallback Duration, Unit, Allowed From/Until, Max Wait Minutes, Timeout Duration/Action).
    - Further sections: Assign Owner; Change Stage; the Case steps (Owner/Reason, Comment + Internal note, Subject/Description, Escalate to, Channel/Message, Macro ID, Queue ID, info-only alerts); Share/Stop Share (Users/Teams multi-selects); Lead List; Value/Score/Reason; Field to Clear; Email/Notify/Webhook; info-only alert; Run Automation; App Action (+ dynamic inputs).
  - **"Add automation step" dialog (3509-3545):** "Available for {trigger}" note, a "Paste {label}" row when a step was copied, and a flat list of every allowed step type.
  - **Step types (`NODE_TYPES`, 96-150, 53 types):** Trigger, If/Else, Multi If/Else, Compare, Wait, Wait Until Activity, Split Test, Update Lead, Update Opportunity, Update Activity, Add Activity, Add Opportunity, Distribute Lead, Distribute Opportunity, Assign Owner, Change Stage, Share Opportunity, Stop Sharing Opportunity, Calculate Partner Commission, Award Gamification Points, Evaluate Badges, Tag Lead, Remove Tag, Add to List, Remove from List, Star Lead, Change Lead Score, Create Task, Apply Task Playbook, Update Task, Assign Task, Reschedule Task, Complete Task, Clear Field, Notify User, Stop Automation, Send Email / Notify, Webhook, Run Another Automation, Call App Action, and 13 Case steps.
  - Plus a "branch" pseudo-step (Yes/No/If 1/Else If n/Else/Variant X).
  - **Trigger types (210-274):** 61.
- **Findings, editor model (E1):**
  - `[E1] [H]` There is no dirty state, no unsaved-changes guard and no `beforeunload`. The back arrow (1276) and route changes silently discard work. → Track `isDirty` by diffing against the last-saved snapshot. Show "Unsaved changes" / "Saved 2m ago" in the header. Guard back/navigation and tab close.
  - `[E1] [H]` Cancelled edits get saved. "Cancel" in the step dialog (2599) leaves `nodeConfig` in place, and `handleSave` merges `nodeConfig` into the selected node (981). Edits the user cancelled are persisted on the next header Save. → Keep dialog edits in a local draft. Commit only on "Apply"; Cancel discards (with a dirty guard via EditorDismissContext).
  - `[E1] [H]` New automations default to `isActive=true` (556). The header Active switch (1293) is the only "publish" and takes effect on the generic Save, so a half-built workflow goes live on first save. → Separate Draft from Published: "Save draft" and "Publish…" (with validation), plus a "Pause" action. New automations start as Draft.
  - `[E1/N1] [H]` After creating, Save goes to the list (998), not to `/automations-v2/{id}`. Test and Enroll are hidden until the page is reopened (1296-1307). → `router.replace` to the new id and keep the user in the builder.
  - `[E1] [H]` There is no validation before save or publish. Nothing checks for unconfigured steps (send_email with no To, webhook with no URL, a step with no list/stage), disconnected nodes, multiple triggers, an empty canvas, split percentages not totalling 100 (3019-3027), cycles, or steps left incompatible after a trigger change. → Add a validation engine that marks issues on nodes and lists them in a bottom bar ("3 issues – Fix"), and block Publish while errors remain.
  - `[E1] [H]` There is no undo/redo, autosave, versioning, last-published diff or "restore version". → See the model in section (c).
  - `[E1] [M]` "Test" runs the saved server-side version (TestWorkflowDialog posts only the automation id), not the unsaved canvas. → Disable Test while dirty ("Save to test"), or send the draft workflow in the test payload.
  - `[E1] [M]` Changing the trigger (1361 or 2629) filters only the palette (1119). Existing incompatible steps stay on the canvas with no warning. → On a trigger change, list the incompatible steps in a confirm dialog and flag them on the canvas.
- **Findings, overlays and duplication (M1):**
  - `[M1] [H]` The step inspector exists twice: ~950 lines of unreachable sidebar config (1550-2498, with different labels and operators) plus the modal (2591-3508). A modal for every node click also hides the canvas, so users lose context. → Delete the dead sidebar copy. Replace the modal with one right-hand inspector panel (non-modal, with Apply/Revert). Keep the canvas visible with the selected node highlighted.
  - `[M1] [M]` The "Add automation step" dialog (3509) is a separate `maxWidth="xs"` modal. It holds a flat, unsearchable list of up to 53 items. → Make it a popover anchored to the "+" handle, with search, recent items and groups (Logic, Timing, Lead, Opportunity, Task, Case, Communication, Integrations, Gamification).
  - `[M1] [M]` After adding a step the user must click it again to configure it (784). → Select the new node and open its inspector automatically.
  - `[R6/C1] [M]` The panel switcher "Canvas / Workflow & history" (1315) still shows at ≥800px. At that width the CSS displays all panels, so the switch does nothing (globals.css 479-481). → Hide `.builder-panel-switch` when panels are side by side.
- **Findings, header and layout (R1-R6):**
  - `[R5] [M]` The header spends two lines on the title, name and "Designer View" (1280-1289). "Edit Workflow" duplicates the name, and the name is not editable in place. → Use an inline-editable name, then a status pill (Draft/Live/Paused), the save state, and actions on the right.
  - `[R2/R6] [M]` The inner tab list has one tab ("Workflow", 1339-1341), and "Designer/History" sits on top of it. That is two stacked tab bars, one pointless. → Remove the inner Tabs. Move History into its own right-panel tab or a "Runs" header tab.
  - `[R3] [M]` Uppercase 11px eyebrows: "Details" (1346), "Add Steps" (1429), "Safety Guards" (1444), "Step Configuration" (1556), "Execution Log" (2503). 11px helper text at 1474 and 3518; a 10px badge at 2518. → Use sentence-case 12-13px semibold section headers; nothing below 12px.
  - `[R2] [M]` Nested containers inside containers: a rounded-lg box inside a section (1447 → 1470 → 1495). The modal uses a `rounded-xl border bg-card p-4` card per block (2627, 2641…), with condition rows inside more borders (2663, 2756). → Use one container level; separate groups with headings and dividers.
  - `[R1] [L]` The removed step card uses `rounded-[24px] border-2 border-primary bg-primary/5` (1553) and a primary-tinted paste row (3524). Defaults to `stroke: var(--primary)` for every edge (2563) make the canvas mostly accent colour. → Neutral edges; colour the selected or failing path only.
  - `[R7] [M]` Step colours are hard-coded Material hex values (97-149) and repeated in a different map in expressive-node.tsx. Most Case and Task steps fall back to the primary colour. Colour encodes nothing consistent (four greens, five blues). → Use around 5 semantic category tokens (Trigger, Logic, Timing, Action, Exit) from design tokens, defined in one shared registry.
- **Findings, copy, enums and IDs (R8/C1):**
  - `[R8] [H]` "Step Type" shows the raw enum `selectedNode.data?.type` ("send_case_acknowledgement", 2621). → Show the friendly label and icon.
  - `[R8] [H]` "Macro ID" and "Queue ID" are free-text inputs with "Copy from Settings…" placeholders (3194-3203). → Use pickers that load macros and queues.
  - `[R8] [M]` History cards show a raw `exe.status` enum (2524) and `entityType.replace` (2531). There is no record name or link. → Status label map; record name linked to the record; duration; "View path on canvas".
  - `[C1] [H]` For a simple Wait the duration is labelled "Fallback Duration". Seven fields sit around it: Resume At, Timezone (free text), Allowed From/Until, Max Wait Minutes (3030-3065). → Use modes: "Wait for [n] [unit]" / "Wait until [date]" / "Wait until [weekday/time window]". Timezone becomes a picker.
  - `[C1] [M]` "Wait Until Activity" has no activity-type or condition selector (3066-3082), so it cannot say what it is waiting for. → Add "Activity type" and "Outcome" pickers plus a timeout branch.
  - `[F1] [H]` "Update Task" has no configuration at all. It is missing from the updates block list (2835); only the field options exist (1253). → Add a Field Updates block for update_task.
  - `[C1] [M]` Operator vocabulary is inconsistent within this file ("Is / Has value / No value" at 2675-2685 vs "Equals / Contains Data / Does Not Contain Data" at 1653-1659). → One operator registry with type-aware operators (text, number, date, picklist).
  - `[C1] [M]` "Notify User" shows Title, Subject and Message. Subject is unused for notify (3354-3361). → Show only Recipient, Title and Message.
  - `[C1] [M]` Long explanatory alerts make up most of the modal (2324-2378, 3449-3454, 3498-3503), and the info alerts use `text-[13px]`. → Use a one-line description plus a "Learn more" link.
  - `[C1] [L]` The modal subtitle "Choose conditions and actions from controlled lists wherever values are known." is generic filler (2595). → Replace it with the step's own description.
  - `[F1] [M]` Webhook offers GET/POST only, an unvalidated JSON textarea, and no headers or auth (3335-3366). Send-email "To" is free text with no merge-field picker. App-action inputs say "{{lead.email}}" with no insert-variable control (3492). → JSON validation, a headers list, and an "Insert field" token picker in every text input.
  - `[F1] [M]` Labels are not tied to inputs (`<Label>` without `htmlFor` throughout, e.g. 1360, 2615, 2628). Required app-action fields use " *" text only (3477). Errors appear only as toasts (954). → `htmlFor`/`id` pairs, `aria-required`, inline error text.
  - `[R4] [L]` The trigger can be set in three places (sidebar Trigger 1361, trigger-node dialog 2629, dead sidebar copy 1572). → Make the trigger node the single source; the sidebar shows a summary.
- **Findings, canvas behaviour (A2/F2):**
  - `[F2] [H]` Deleting a step happens instantly from the node trash (903-908). It leaves orphaned child sub-trees, and removing a condition orphans its branch nodes. ReactFlow's default Backspace delete is also on, again without confirmation or undo. → Undo stack plus a toast with "Undo". Confirm when the step has descendants, offering "Delete step only (reconnect)" or "Delete step and branch".
  - `[E1/A2] [M]` `layoutWorkflow` re-lays out every node on each edge change (604-609), discarding manual drags, while nodes stay draggable. → Choose one: fully auto-layout (nodes locked, with a "Tidy" button) or free layout that persists positions.
  - `[A2] [M]` Manual `onConnect` (681) lets users draw unlabelled edges out of If/Else or Split nodes, and there is no edge delete or label UI. → Disable free connections for branch types; add an edge "×" with confirmation.
  - `[A2] [H]` There is no keyboard alternative for the canvas: no arrow-key traversal between nodes, no "Add step after selected" shortcut, and no list/outline view. → Add an accessible "Outline" view (indented step list with add, move and delete actions) plus keyboard focus on nodes (Tab, Enter to open, Delete with confirmation, Cmd+Z).
  - `[C1] [M]` Copy/paste is hidden: "Node copied. Click + elsewhere to paste it." (920). Only one step is copied, not its branch. → Use standard Cmd+C/Cmd+V plus a context menu (Duplicate, Copy, Delete), with "Duplicate branch" for logic steps.
  - `[S1] [M]` Loading is a full-screen spinner (1259-1265). A failed fetch leaves an empty "Edit Workflow" page behind only a toast (675). There is no not-found state, and the 13 lookups fail silently (`.catch(() => undefined)`, 612-632). `/activity-types` is fetched twice (612, 618). → Skeleton layout, error state with Retry, a single fetch per lookup.
  - `[R10] [L]` Branch pseudo-nodes are clickable and open a modal with "Step Type: branch" and no fields. → Render branches as edge labels or chips, not nodes.

### src/components/automation/expressive-node.tsx — Canvas node card
- **Elements:** target handle, coloured icon circle, uppercase type eyebrow, label, summary line, hover action group (Clone node, Delete node, decorative MoreHorizontal), source handle, floating "+" ("Add next step").
- **Findings:**
  - `[A2] [H]` Clone and Delete are hover-only (`opacity-0 group-hover:opacity-100`, 162-166), so they are unreachable on touch or keyboard unless the node is selected. → Make them always reachable via a node "⋯" menu that is focusable.
  - `[A1] [H]` The icon buttons (170, 185, 213) are named only by a Tooltip (aria-describedby, not a name). → `aria-label` "Duplicate {label}", "Delete {label}", "Add step after {label}".
  - `[R3/R8] [M]` The eyebrow is `text-[0.65rem]` (~10px), uppercase, showing the raw type with underscores replaced (151-152): "SEND CASE ACKNOWLEDGEMENT". → Category label (12px, sentence case), or drop it because the label already says it.
  - `[R7] [M]` `ICONS`/`COLORS` are hard-coded hex maps (25-73) covering only 21 types. Every Case/Task/Share/Gamification/App step renders as a Zap in primary colour. The `${color}4d` glow shadow is decorative. → Import from a single step registry shared with the builder; use tokens.
  - `[S1] [H]` There is no invalid/unconfigured or runtime-error state on nodes. `summarizeNode` covers only 9 types (96-118). → Add a summary per type, an amber "Needs setup" chip, a red error count from the last runs, and a run-count overlay in "Runs" mode.
  - `[A2] [L]` The 24px action targets (`size-6`) and 10px handles are hard to hit. The "+" appears even on "Stop" nodes. → 32px targets; hide "+" on terminal steps.
  - `[R2] [L]` `rounded-[24px] border-2` pill nodes, plus selected-state shadow-lg. → Standard radius, 1px border, selection ring.

### src/components/automation/TestWorkflowDialog.tsx — "Test Workflow" dialog
- **Elements:** title "Test Workflow" with the automation name; dry-run note; "Entity Type" (Lead/Opportunity); record Select ("Select a record"); "Run Test"; then "Test Results" with a Passed/Failed alert, an "Execution Log" list, and a "This was a test run…" note.
- **Findings:**
  - `[E1] [H]` Test ignores the trigger scope: only Lead/Opportunity, while Case, Task, Communication and App Event triggers exist. It also tests the saved, not current, workflow. → Derive the entity type from the trigger; send the draft workflow.
  - `[R8] [M]` The log shows the raw `entry.type` (179) and "Result: true" (183). The record picker is a 100-item Select with no search (128). → Step labels, human-readable outcomes ("Condition matched → Yes branch"), a searchable record combobox.
  - `[E1] [M]` Results are not shown on the canvas. → Highlight the executed path and mark each node pass/fail ("Test mode" overlay), as HubSpot and Salesforce do.
  - `[R7] [L]` The success icon uses `text-primary` (171) while history uses emerald (execution-log-viewer 111). → Use the shared success token.
  - `[C1] [L]` "Entity Type" (102). → "Record type".

### src/components/automation/EnrollRecordsDialog.tsx — "Enroll Records" dialog
- **Elements:** title "Enroll Records", description, "Entity Type" select, checkbox list "Leads (n selected)", "Enroll N Records" button, result alert, "Enrollment History" list (entity type · count, ok/failed, status badge).
- **Findings:**
  - `[F2] [H]` Enrolling runs live actions on up to 200 records with no confirmation, preview, or check that the automation is active (62-79). → Confirm step: "Run '{name}' for 37 leads now? Emails/updates will execute." Show inactive and unsaved warnings.
  - `[R10] [M]` The list is capped at 200 records, with no search, filter, select-all or saved-list source (39-43, 113-124). → Searchable table with filters and "Enroll a list/view".
  - `[R8] [M]` Job rows show raw `job.entityType` and `job.status` enums (152, 155) with no timestamp. → Labels, time, link to the run log.
  - `[S1] [L]` Partial errors (`COMPLETED_WITH_ERRORS`) use the destructive variant (133). → Use a warning variant.

### src/components/automation/execution-log-viewer.tsx — Step timeline in History
- **Elements:** per-step card (icon tile, type, time, action text, "Matched/No Match" badge, error line, status icon), connector line.
- **Findings:**
  - `[R8] [M]` `step.type.replace('_',' ')` (86) only replaces the first underscore. → Use the step registry label and the node's custom label.
  - `[R2] [M]` A `rounded-2xl` card per step inside a `rounded-2xl` history card (builder 2513), so three container levels. → Plain timeline rows.
  - `[R7] [M]` The success, waiting and neutral icon tiles are all `bg-primary/10 text-primary` (75-78). Raw `emerald-500/red-500/blue-500` icons (111-115). → Status tokens; colour only for fail/wait.
  - `[S1] [L]` The ICONS map covers 7 types (19-27). → Shared registry.

### src/app/dashboard/forms/page.tsx — Forms list
- **Elements:**
  - Header: H1 "Forms", subtitle, QueueExportButton, "Create Form".
  - Filter card: "Search forms...", "Filters".
  - Card grid: name, Active/Draft badge, relative time, ⋮ menu (Edit, View Public, Delete), description, "N Submissions", ghost "Edit".
  - Empty state.
  - "Create New Form" dialog: Form Name, Cancel, "Create & Edit".
- **Findings:**
  - `[E1] [H]` New forms are created with `isActive: true` (85), so an empty form is publicly live immediately. → Create as Draft; publish explicitly.
  - `[C1/R9] [H]` "Filters" does nothing (152-155). → Remove it or add Status/Has submissions/Placement filters.
  - `[N1] [M]` The public URL schemes conflict: list uses `/f/{slug}` (117), builder header uses `/public-form/{id}` (forms/[formId] 78), embed uses `/f/{id}` (EmbedCodeDialog 38). → One canonical `/f/{slug}` everywhere.
  - `[F2] [M]` Delete uses native `confirm()` (99). → AlertDialog stating the submission count, plus an option to export first.
  - `[R2] [M]` The filter bar is wrapped in a Card (142) above a grid of Cards. Hover `-translate-y-0.5` (179). → Plain toolbar row; table view for scale (name, status, submissions, last submission, placements, updated).
  - `[R4/R3] [L]` The badge is `text-[10px] font-bold` (187). → 12px status pill.
  - `[R9] [L]` "Edit" appears three times (card click, menu, footer button at 236-239). The menu lacks Duplicate, Copy link and Unpublish. → Remove the footer button; menu: Open, Copy link, Duplicate, Unpublish, Delete.
  - `[A1] [L]` The ⋮ button has no aria-label (197). → Add one.
  - `[F1] [L]` The create dialog asks only for a name (no description or template), and the builder never lets you rename. → Add Description, a template picker ("Contact us", "Demo request", blank) and inline rename in the builder.

### src/app/dashboard/forms/[formId]/page.tsx — Form builder shell
- **Elements:** "Back" ghost button; H1 form name; "Active/Draft" text • "View Public Page ↗"; Badge "Live Form"/"Draft Form"; a Card with the tabs "Builder | Submissions | Analytics | CRM Placement".
- **Findings:**
  - `[E1] [H]` Switching tabs silently discards unsaved Builder edits. Radix TabsContent unmounts inactive panels (tabs.tsx has no forceMount), and FormEditor keeps its state locally (form-editor 193-236). → Keep the editor mounted (`forceMount` + hidden) and guard tab changes when dirty.
  - `[E1] [H]` The page's `form` is never updated when FormEditor saves (no onSaved prop, 107). Returning to Builder remounts it from stale data. Worse, "Save Placement" sends the stale `initialForm.config` and `isActive` (crm-placement-editor 214), overwriting fields and the Active state saved in Builder. → Use one form store (context/SWR) with optimistic version and ETag checks, and one save path for the whole form.
  - `[N1] [M]` Tabs are not deep-linkable: there is no `?tab=` (25), so refresh always lands on Builder. → Sync the tab with the URL.
  - `[R5/R4] [M]` Status appears twice ("Active" text at 74 plus "Live Form" badge at 88-90) and the Back button sits on its own row (59-66). → One header row: back arrow, name (inline rename), status pill, "Copy link", "Preview", "Publish".
  - `[R2] [M]` Tabs live inside a `rounded-2xl` Card (94), and inside that the editor has its own cards and toolbar card. → Full-bleed workspace, no outer card.
  - `[S1] [L]` A fetch error falls through to "Form not found" (44-52) with no retry, and errors go only to `console.error` (32). → Separate not-found and error states with Retry.

### src/components/forms/form-editor.tsx — Form builder (Fields / Canvas / Inspector)
- **Elements:**
  - Toolbar row: panel switcher "Fields | Canvas | Properties" and "Save Form".
  - Left "FIELD LIBRARY" panel:
    - "Source Module" select (Lead/Opportunity/Activity/Task), plus "Opportunity Type" / "Activity Type" selects for those modules.
    - "{Module} Fields" list (draggable, "Already added").
    - "Special Fields": Short Text, Long Text, Number, Email, Phone, Date, Dropdown, Checkboxes, Radio Buttons, Hidden Field.
  - Canvas card: "CANVAS PREVIEW", name and description; buttons "+ Tab", "+ Section", "Embed".
  - Canvas body: tab strip with an × on each tab; section headers with ×; field cards with drag grip and hover width-toggle / ×.
  - Right "INSPECTOR" tabs "Field | Design | Settings":
    - Field:
      - "Basic Properties": Label, Tab, Section, Placeholder, Help Text, Required switch.
      - "Options (comma separated)".
      - "Data Mapping": Source Module, Module Field, Default Value.
      - "Validation": Min, Max, Pattern (Regex).
      - "Conditional Logic", then "Remove Field".
    - Design: StyleEditor.
    - Settings: Submit Button Text, Form Layout, "Use as multi-step form", "Show section names", Tabs Placement, Tabs list (rename, ×, logic), Sections list (rename, ×, logic), Success Message, Redirect URL, Notification Emails, "Security & Limits" (Spam Protection, Rate Limit), "Duplicate Handling", "Form Active".
  - Drag overlay; EmbedCodeDialog.
- **Findings:**
  - `[E1] [H]` No dirty indicator, no guard, no autosave, no undo, no versioning. "Form Active" (the publish control) is buried as the last Settings item (1199-1205) and saved by the generic "Save Form". → Header "Publish"/"Unpublish" with a validation summary; draft autosave; a "Saved • 10:42" indicator. See section (c).
  - `[E1] [H]` There is no real preview. The canvas is a disabled mock: checkboxes and radios render as Switches (1414-1421) and selects are empty. There is no desktop/mobile preview and no test submission. "View Public Page" shows only the saved version. → "Preview" toggle rendering the real PublicFormRenderer with the draft config, a device switch, and a "Submit test" that is not stored as a lead.
  - `[F1] [H]` The Min/Max/Pattern rules (945-981) are shown for every type (date, checkbox, hidden), and nothing enforces them. No renderer or server code reads `validation.*`; the only match is form-editor.tsx itself. → Show type-appropriate validation (length for text, range for number, date bounds) and enforce it in both renderers and on the server.
  - `[F2] [H]` Tabs and sections are removed instantly along with all their fields: canvas × (1330-1340, 1353-1360), Settings × (1082-1089, 1113-1120), via `removeTab`/`removeSection` (502-537). Field × (1497-1508) and "Remove Field" (997-1004) have no confirmation or undo either. → Confirm when the container is not empty ("Delete tab 'Details' and its 6 fields?" with an option to move fields), plus an undo toast.
  - `[A2] [H]` Field cards are clickable `div`s (1448-1462), not focusable, so keyboard users cannot select a field. DnD uses only `PointerSensor` (347), so there is no keyboard reordering. → Make cards buttons or `role="option"` in a listbox; add dnd-kit `KeyboardSensor` plus "Move up/down / Move to section" in the inspector.
  - `[E1] [H]` Library fields always land in the first section of the active tab (365, 394). Dragging cannot target a section, and reordering only moves the array (421-425) without changing `sectionId`. The canvas still says "Drop fields into this section" (1371). → Make each section a droppable target and let reordering across sections update `sectionId`, or change the copy and rely on the inspector Section picker.
  - `[M1/R4] [M]` Tabs and sections are managed in two places (canvas toolbar plus inline ×, and the Settings tab lists with rename and logic). → Manage structure on the canvas (inline rename, ⋯ menu with Logic, Delete); keep Settings for form behaviour.
  - `[A2] [M]` The width toggle and × only appear on hover (1477-1482), are 22px (1487, 1500), and have no aria-label. The tab × is 18px (1333). → Use a focusable ⋯ menu per field (Duplicate, Make full width, Move, Delete) with 32px targets.
  - `[F1] [M]` Options are a comma-separated textarea (841-849). Commas in labels break it, `{value,label}` pairs are flattened to labels, and options cannot be reordered or given a default. → Option list editor (rows with label/value, drag, add/remove, default, "Paste many").
  - `[R8] [M]` Lead Status and Task Status options are raw enums ("NEW", "IN_PROGRESS"; 127, 143) and end up visible on public forms. → `{value,label}` pairs with friendly labels.
  - `[F1] [M]` The field type cannot be changed after adding. Generic labels are "New textarea" / "New select" / "New hidden" (361). → "Change type" in the inspector; default labels "Long answer", "Dropdown"…
  - `[F1] [M]` Settings inputs are unvalidated: Redirect URL (1143-1149), Notification Emails as a free string (1152-1158), and Rate Limit (`parseInt||10` makes 0 or blank impossible; 1178). → URL validation, an email chips input, a min/max number with inline errors.
  - `[C1] [M]` "Duplicate Handling" assumes Leads ("Always Create New Lead", 1190-1192) even for opportunity or activity mappings. "Spam Protection" has no explanation. → Copy based on the primary module, plus helper text.
  - `[C1] [M]` "Form Layout" offers Single/Two columns while per-field width toggles exist only in two-column mode (1483). "Tabs Placement: Left" has no visible preview. → Show the layout live in the canvas; group these under "Layout".
  - `[R3] [M]` Uppercase eyebrows "Field Library" (595), "Canvas Preview" (679), "Inspector" (724). `text-[1.1rem]` heading (682). → Sentence-case 12-14px; drop "Inspector" and "Canvas Preview".
  - `[R1] [M]` Section names use `font-extrabold text-primary` (1350) and the selected field has a primary left bar plus a tinted background (1515). The inspector tabs use `text-primary` (732-746). → Neutral headings; one selection treatment.
  - `[R2] [M]` The canvas toolbar is a card with a custom shadow (677) above a canvas card with `shadow-md` (1306), on a `bg-primary/[0.02]` surface (675). → Flat canvas, with the toolbar in the header row.
  - `[S1] [L]` Lookup fetches silently fall back to `[]` (239-248). The "Opportunity Type" list can be empty with no explanation. → An empty or error hint inside the library.
  - `[R10] [L]` About 50 lines of placement logic (`placementRuleFor`, `updatePlacementRule`…, 539-585) and the `CRM_PLACEMENTS`, `users` and `salesGroups` state are dead code in this file. Its save also re-sends `placements`/`placementRules` from mount (432-437). → Remove them; save only fields, layout and settings.
  - `[A1] [L]` Tab, Section, Source Module, Module Field and Form Layout labels have no `htmlFor` (771, 791, 868, 902, 1031). → Pair them with their inputs.

### src/components/forms/logic-builder.tsx — Conditional logic rule (field, section, tab)
- **Elements:** empty state "No conditional logic applied." with "Add Rule"; rule card "→ Condition" with trash; "Then [Show/Hide] this {field} when:"; Field select; Operator (Equals, Not Equals, Contains, Greater Than, Less Than); Value input.
- **Findings:**
  - `[E1] [H]` The rule shown can belong to a different field. Local `rule` state only syncs when `value` is truthy (39-43), and the component isn't keyed by field (form-editor 987). Selecting a field without logic after one with logic keeps showing the previous rule, and any edit then applies it to the new field. → Derive from props (controlled), or `key={currentFieldId}`.
  - `[F1] [M]` Only one condition is possible (no AND/OR). The value is free text even when the source field is a dropdown or radio. Greater/Less Than are offered for text fields. → Multi-condition group with All/Any, type-aware operators, and a value picker using the source field's options.
  - `[C1] [M]` "Then Show this field when:" (100-110) reads backwards. → "Show this field when [field] [is] [value]".
  - `[A1] [L]` The trash icon has no aria-label (88-95). `rounded-full` ghost "Add Rule" button, and `text-primary` header (85). → "Remove rule" label; standard button.

### src/components/forms/style-editor.tsx — Design tab
- **Elements:** "Theme Preset" (Default, Minimal, Modern, Dark); "COLOR PALETTE" card (Primary, Background, Text swatches with hex buttons); "TYPOGRAPHY" card (Font Family, "Corner Smoothing" 0/4/8/16px/Round); "Custom CSS" textarea.
- **Findings:**
  - `[C1] [H]` "Theme Preset" does nothing. No CSS defines `.form-theme-*` (the class is only emitted in public-form-renderer 266). → Implement the presets as token sets, or remove the control.
  - `[C1] [M]` The fonts Roboto, Open Sans and Merriweather (31-37) are never loaded on the public page. → Load them via next/font or limit to system and brand fonts.
  - `[A2] [M]` The colour `<input>` is a 0×0 transparent element (173-179) and the visible "button" is a `<label>` (180-182), so keyboard focus is invisible. → Visible swatch button plus a popover picker and a hex input with contrast warnings.
  - `[E1] [M]` The visual controls rewrite the Custom CSS through regex (42-63). Manual CSS edits and the controls overwrite each other with no live preview. → Store tokens structurally; keep Custom CSS as a separate advanced (collapsed) field; live preview.
  - `[R3/R2] [L]` Uppercase 12px headers (89, 113), `rounded-3xl` tinted cards (88, 112), an 11px hex label (180). → Flat sections; 12px minimum.

### src/components/forms/crm-placement-editor.tsx — "CRM Placement" tab
- **Elements:**
  - H2 "CRM Placement" and description; "Save Placement".
  - Per placement (Lead detail, Opportunity detail, Activity detail, Lead create, Opportunity create), a Card containing:
    - Title, "Enabled/Off" badge, helper text, "Enable" switch.
    - When enabled: Button Label, Order, "Visible Here To" (Use form visibility, All users, Selected roles/users/sales groups/teams), MultiSelect.
    - "Record Conditions" and "User Conditions" groups (All/Any, "+ Condition", Field/Operator/Value rows, ×).
- **Findings:**
  - `[E1] [H]` Save sends `{ config, isActive: initialForm.isActive }` (214) from a possibly stale snapshot, overwriting builder changes and the Active state, and it is a separate save button from "Save Form". → Single form save model; PATCH only `placementRules`/`placements` with a version check.
  - `[C1] [M]` "Use form visibility" (285) refers to form-level visibility (`visibilityMode`, `visibleUserIds`) that has no UI anywhere. → Add form-level "Who can use this form" in Settings, or drop INHERIT.
  - `[R8/C1] [M]` User-condition copy exposes keys ("roleId, email, managerId, skills.region", 324, 328). The record-condition value placeholder is "status or lead.source" (315), a field hint shown in the value box. → Friendly copy; value placeholder "Value".
  - `[R4] [L]` The "Enabled/Off" badge duplicates the Enable switch (252-262). → Keep the switch only.
  - `[F1] [L]` "Order" is a raw number (272-275) and labels have no `htmlFor`. → Drag order or "Position: 1 of 3"; paired labels.
  - `[A1] [L]` The condition × has no aria-label (532). → "Remove condition".
  - `[R2] [L]` A Card for each placement, inside the tab card. → A list with expandable rows.

### src/components/forms/EmbedCodeDialog.tsx — "Embed Form" dialog
- **Elements:** tabs "Iframe | JavaScript | WordPress | Direct Link"; code block plus "Copy Code" / "Copied!"; Direct Link with "Copy Link" and "Open Preview"; "Tips" alert.
- **Findings:**
  - `[N1] [M]` It uses `/f/{formId}` (38) instead of the slug. → Canonical slug URL; warn when the form is a draft ("Embeds will show 'Form Closed' until published").
  - `[F1] [L]` Height is fixed at 600 and there is no auto-resize script. The WordPress tab asks users to edit functions.php (62-72). → Auto-resize embed script; drop or simplify WordPress.
  - `[S1] [L]` A copy failure only logs to the console (81-83). → Error toast.
  - `[R7] [L]` Code block uses `bg-neutral-900` and `text-[13px]` (27). → Token-based code surface.

### src/components/forms/submissions-table.tsx — Submissions tab
- **Elements:** H2 "Submissions (n)"; Refresh icon button with tooltip; "Export CSV"; KPI cards "PROCESSED" and "NEEDS REVIEW"; DataTable (Date, Status badge, Lead link, Email, Spam Score, ⋯ menu: Copy raw data, Open lead).
- **Findings:**
  - `[S1] [H]` The KPI cards count only the current 20-row page (85-89) but read as totals. → Use the server totals from /stats, or remove them (Analytics already has them).
  - `[R9] [H]` There is no submission detail view (answers per field). The only option is "Copy raw data" JSON (165-173). → Row click opens a side panel with label/value pairs and metadata (UTM, referrer), plus actions "Mark not spam", "Create lead", "Delete".
  - `[R8] [M]` The status badge shows the raw enum ("PROCESSED", 108) at 11px bold (107). → "Processed / Spam / Duplicate / Error" pills; 12px.
  - `[R10] [M]` There are no per-field columns and no status or date filters. Page size is fixed at 20. → Column picker from form fields; status and date filters.
  - `[R1/R3] [L]` The lead link is bold primary (122). Uppercase KPI labels (220, 228). → Standard link style; sentence case.
  - `[A1] [L]` The ⋯ and Refresh buttons have no aria-label (160, 204). → Add labels.

### src/components/forms/form-analytics.tsx — Analytics tab
- **Elements:** H2 "Performance Snapshot"; 4 MetricCards (Total Submissions, Processed Leads, Spam Detected, Duplicates); "Conversion Health" progress bars; "Recent Activity" (30-day count, errors line).
- **Findings:**
  - `[R10] [M]` There is no date range, no time series and no field/step drop-off, although the renderer sends tab-progress beacons (public-form-renderer 90-104). → Range picker, submissions-over-time chart, multi-step drop-off funnel.
  - `[R3/R2] [M]` Uppercase metric titles (50), `text-4xl font-black` (216), and a dashed tinted box inside a card (215). → 12px sentence-case labels; one container level.
  - `[S1] [L]` Zero data shows "0%" bars instead of an empty state. Errors show as a destructive alert with no retry (122-128). → Empty state ("No submissions yet – share your form"); Retry.

### src/components/forms/public-form-renderer.tsx — Hosted form renderer
- **Elements:** draft banner "Draft is saved automatically on this device." with "Clear draft"; empty notice; tab strip; section headings; fields (Hidden, Textarea, Select, Checkbox group or single, Radio, File not-supported notice, Formula read-only, Text/Number/Email/Date); "Previous", "Next", submit (custom text); success screen "Success!"; redirect after 2s.
- **Findings:**
  - `[F1] [H]` Required errors are a single toast listing labels (180-184). There are no inline errors, `aria-invalid`, `aria-required`, or focus on the first error, and missing fields on other tabs are not navigated to. → Inline per-field errors, error summary at the top with links, jump to the tab with the error.
  - `[F1] [H]` Multi-step "Next" (421-424) advances without validating the current step, and there is no progress indicator ("Step 2 of 4"). → Validate the step on Next; show a stepper with progress.
  - `[F1] [H]` Builder validation (min, max, pattern) is ignored, and PHONE renders as `type="text"` (399). → Enforce the rules; `type="tel"` with `autocomplete` attributes.
  - `[A1] [M]` Checkbox and radio groups have no `fieldset`/`legend`, and their group `Label htmlFor={field.id}` (302) points to no element. → `fieldset` + `legend`; RadioGroup primitive.
  - `[A2] [M]` The tab strip is plain buttons without `role="tab"`/`aria-selected` (280-289). → Radix Tabs or the ARIA tab pattern.
  - `[C1] [M]` The draft banner appears even when only defaults or URL prefill exist (267). The draft lives in localStorage on shared devices. → Show it only after user input, with "Saved on this device" and an expiry.
  - `[R7/C1] [L]` The success state uses hard-coded `green-100/green-600` and "Success!" (243-248). The 2s redirect has no notice. → Tokens; "Redirecting…" with a link.

### src/components/forms/public-form-page.tsx — Public form page shell
- **Elements:** a Card with loading / "Form unavailable" / ErrorState / "Form Closed" / header (name, description) / renderer / "Powered by Unnatify".
- **Findings:**
  - `[S1] [L]` Loading is plain text (13). → Skeleton.
  - `[C1] [L]` "Form Closed / This form is currently inactive." (16) is the only draft preview admins can see. → Admin preview mode (`?preview=token`) that renders drafts with a "Preview – not live" banner.
  - `[R2] [L]` Fixed `max-w-xl` Card (12) ignores the two-column layout setting. → Width that follows `layoutColumns`.

### src/components/forms/contextual-forms-panel.tsx — In-CRM "Forms" button and dialog renderer
- **Elements:** "Forms ▾" dropdown (rule label or form name) or a single button; StandardDialog with the form name; draft banner + "Clear draft"; grid of fields; "Save Changes"; "Saved!" success.
- **Findings:**
  - `[E1] [H]` The saved localStorage draft overrides fresh record data (`{...data, ...draftData}`, 379). A stale draft can revert newer record values on save, which PATCHes the record directly (468-491). → Show a draft newer/older prompt ("Restore unsaved changes from 2 days ago?") and diff against current values before PATCH.
  - `[F1] [M]` Its own third renderer ignores tabs, section headings, `layoutColumns`, field width, validation and submitButtonText (it hard-codes "Save Changes", 672). Errors are a toast only (427). → Reuse one shared FormRenderer component in a "dialog" variant.
  - `[R9] [M]` There is no Cancel button, and the dialog auto-closes after 800ms (512). → Footer with "Cancel" and the primary button; close on success with a toast.
  - `[S1] [M]` The module-level `formsCache` (65-97) is never invalidated, so edited or unpublished forms stay stale until a full reload. → SWR with revalidation.
  - `[A1] [L]` Checkbox and radio group titles are `<p>` (595, 624) with no fieldset/legend; required is shown only as text " *". → `fieldset` + `legend`, `aria-required`.

### src/components/forms/mui-dynamic-field.tsx — Custom-field input renderer
- **Elements:** a field per type: TEXT, TEXTAREA, NUMBER, DROPDOWN, MULTI_SELECT (checkbox list), BOOLEAN, DATE, DATETIME, default.
- **Findings:**
  - `[A1] [M]` MULTI_SELECT `<Label>` has no target and no fieldset; its error message isn't linked (121-142). BOOLEAN has no `aria-describedby` (150-159). → `fieldset`/`legend` plus `aria-describedby`.
  - `[F1] [L]` Required is shown as " *" in the label text (36), read as "star", with no `aria-required`. → Visual asterisk with `aria-hidden` plus `aria-required`.
  - `[F1] [L]` A DROPDOWN cannot be cleared back to empty (91-103). → Add a "None" or clear item.
  - `[C1] [L]` The "Mui" name is legacy. → Rename to `DynamicField`.

---

### (a) Top 15 changes (by impact)
1. **One save model per builder:**
   - Draft autosave, a dirty indicator, an unsaved-changes guard (route, back, tab, close).
   - Separate "Publish" from Save.
   - New automations and forms start as Draft (fixes builder 556, forms 85, form-editor 1199).
2. **Fix the form data-loss bugs:**
   - Keep FormEditor mounted across tabs.
   - Use a single form store and PATCH only changed slices with a version or ETag.
   - Remove the stale-config overwrite in CrmPlacementEditor (214) and the dead placement state in FormEditor.
3. **Fix the automation step-config defects:**
   - Delete the dead sidebar inspector (1550-2498).
   - Move to one non-modal right inspector with Apply/Revert.
   - Make Cancel actually discard (981 bug).
4. **Validation engine with a summary bar:**
   - Per-node "Needs setup" chips, a bottom "N issues" bar, and Publish blocked on errors.
   - Covers split totals, required step inputs, orphans and trigger incompatibility.
   - Forms: required mapping (e.g. email for leads), invalid options, empty tabs.
5. **Undo/redo and safe deletes:**
   - Cmd+Z/Shift+Cmd+Z.
   - An undo toast on every node, field, tab or section delete.
   - A confirm when the deleted item contains children or fields.
   - Disable the silent ReactFlow Backspace delete.
6. **Single step registry:**
   - Labels, icons, semantic category tokens (no hex), summaries, config schema and validators.
   - Shared by the palette, nodes, inspector, history, test results and the list page. Fixes raw enums everywhere.
7. **Searchable, grouped step picker** anchored to "+" (Logic, Timing, Records, Tasks, Cases, Messaging, Integrations), with recents and paste. Auto-open the inspector for the new step.
8. **Test and preview against the draft:**
   - Automation test uses the draft and the trigger's record type, and highlights the path on the canvas.
   - Form "Preview" renders the real renderer with the draft (desktop/mobile) plus "Submit test".
9. **One shared FormRenderer** for public, contextual and preview use, with inline errors, error summary, per-step validation, a stepper, enforced min/max/pattern, `tel`/`autocomplete`, fieldsets, and ARIA tabs.
10. **Keyboard and accessibility alternatives:**
    - Automation "Outline" list view; focusable nodes and field cards.
    - dnd-kit KeyboardSensor plus Move up/down/to section.
    - Visible ⋯ menus instead of hover-only icons.
    - `aria-label` on every icon button.
11. **Fix the logic-builder rule desync** (controlled component or key). Then support multi-condition All/Any with type-aware operators and value pickers from the source field's options.
12. **Header redesign for both builders:**
    - Back, inline-editable name, status pill, save state, then Preview/Test, History, Publish and an overflow menu.
    - Remove the duplicate status, "Designer View" and the no-op panel switch on desktop.
13. **Remove or implement dead controls:** both "Filters" buttons, "Theme Preset", unloaded fonts, and Update Task (no config). Add an activity selector to Wait Until Activity. Use pickers instead of raw Macro ID/Queue ID inputs.
14. **Submissions:** detail side panel, server-side totals, status/date filters, per-field columns, friendly status labels.
15. **Visual system clean-up:**
    - No uppercase eyebrows; nothing under 12px (11px, 10px and 0.65rem currently in use); one container level.
    - Neutral canvas edges; primary colour reserved for the primary action and the selection.
    - One operator vocabulary ("is / is not / is any of / has a value / is empty / greater than / before / after").
    - One canonical public URL `/f/{slug}`.

### (b) Proposed layouts

#### Automation builder (Salesforce Flow / HubSpot pattern)
- **Header (56px, one row):**
  - Left: back "←" (to the list, with dirty guard), inline-editable name, status pill (Draft / Live vN / Paused), save state ("Saving…", "All changes saved", "Unsaved changes").
  - Right: "History" (runs drawer), "Test" (draft), "Publish" (primary; becomes "Publish changes" when the live version differs), ⋯ menu (Duplicate, Pause, Version history, Export JSON, Delete).
  - A trigger summary chip under the name is optional.
- **Left rail (280px, collapsible):**
  - Tabs: "Steps" | "Outline".
  - Steps: search, then grouped draggable/clickable step types. It can stay closed by default because "+" on the canvas is the main way to add steps.
  - Outline: accessible indented list of all steps and branches with add, move and delete actions. This is the keyboard and screen-reader alternative to the canvas.
- **Canvas (fill):**
  - Top-down auto-layout (lock positions; "Tidy" only if free layout is kept).
  - The trigger node is always present (no "Add trigger" in a sidebar). New automations open with an empty trigger card: "Choose what starts this workflow".
  - "+" sits on each edge, not only under nodes, so a step can be inserted between two others. Branches appear as labelled edge chips.
  - Nodes show icon, label, one-line summary and a "Needs setup" or error chip.
  - Zoom controls and fit live bottom-left; the minimap is an optional toggle.
  - Overlay modes: Edit | Test result | Run stats.
- **Right inspector (380px, non-modal):**
  - Opens on selection. Header: step icon, editable step name, ⋯ menu (Duplicate, Copy, Delete).
  - Body: schema-driven sections. For example, Condition shows Match All/Any and condition rows; Wait has modes; Send email has channel, to (token picker), subject, body and an advanced fallback/throttle section.
  - Footer: "Apply" / "Revert" (or live-apply backed by the undo stack).
  - With nothing selected it shows "Workflow settings": trigger details, enrollment and re-enrollment (Max runs per record), safety (Max steps), exit conditions, description.
- **Bottom bar (36px, collapsible):**
  - Validation summary ("2 errors · 1 warning", click to focus the node), last test result, "Live since 12 Sep · v4".
  - Expands to a Problems list.
- **Runs drawer (from "History"):** run list (status, record link, started, duration, filters) and a step timeline. Clicking a run highlights its path on the canvas.
- **Mobile (<800px):**
  - Read-mostly: the Outline is the primary view, with step editing in a full-screen sheet and the canvas as an optional view.
  - Publish stays in the header.
  - Banner: "For complex edits use a larger screen".

#### Form builder (Typeform/Jotform/HubSpot forms pattern)
- **Header (one row):**
  - ← Forms, inline-editable name, status pill (Draft / Published / Unpublished changes), save state.
  - Top-level tabs as a centred segmented control, synced to `?tab=`: "Build | Settings | Share | Results".
  - Right: "Preview" and "Publish" (primary), ⋯ menu (Duplicate, Unpublish, Delete).
- **Build tab:**
  - **Left (240px), "Add fields":**
    - Search.
    - Groups: "CRM fields" (module switcher Lead / Opportunity / Activity / Task, plus type context), "Basic" (Short answer, Long answer, Number, Email, Phone, Date, Dropdown, Checkboxes, Multiple choice), "Layout" (Section, Page/Step), "Hidden".
    - Click adds the field after the current selection; drag works too.
  - **Canvas (fill, max 760px, centred):**
    - What-you-see rendering using the real renderer in an edit wrapper.
    - Pages/tabs shown as a step strip, with rename and a ⋯ menu.
    - Sections are drop targets.
    - Each field card is focusable, with a visible ⋯ menu (Duplicate, Width, Move to…, Delete), drag handle and required marker.
    - An empty section shows "Add field here".
  - **Right inspector (320px):** for the selected field. Sections:
    - Content: label, help text, placeholder, required.
    - Options: list editor.
    - Mapping: CRM field picker with a type mismatch warning.
    - Validation: type-specific.
    - Logic: multi-condition.
    - Advanced: default value, URL prefill key.
    - A selected section or page shows its name and logic.
    - With nothing selected: form-level quick settings (layout, submit text).
- **Settings tab (single scroll page with left anchors):**
  - General: name, description, active window.
  - After submit: message or redirect.
  - Notifications: email chips.
  - Data handling: duplicate rule, primary module.
  - Security: spam, rate limit.
  - Access: who can use it inside the CRM.
  - CRM placement: the rules moved here as an expandable list.
  - Design: theme tokens, colours, font, radius; Custom CSS under "Advanced".
- **Share tab:** canonical link with copy, QR code, embed (auto-resize script, iframe), UTM builder, and a warning when the form is a draft.
- **Results tab:** sub-tabs "Submissions" (table plus detail side panel) and "Analytics" (range, trend, drop-off).
- **Preview:** a full-screen overlay with Desktop / Tablet / Mobile toggles that renders the draft. "Submit test" goes to a sandbox and does not create a CRM record. "Exit preview".
- **Publish flow:**
  1. "Publish" runs validation: no fields, required mapping missing (e.g. a lead form without email or name), invalid options, broken logic references, empty pages.
  2. A modal lists the issues, or summarises the changes since the last publish ("3 fields added, logic changed").
  3. "Publish" creates version vN and the live URL serves it.
  4. Later edits stay in the draft with an "Unpublished changes" pill until "Publish changes".
- **Mobile:** single-column view with field list, "Add field" sheet and full-screen inspector sheet. Publish stays in the header.

### (c) Proposed save / publish / version model (both builders)
- **Working copy (draft):**
  - Autosaved (debounced 1-2s plus on blur) to `/…/{id}/draft` with an optimistic version number.
  - Header shows "Saving… / All changes saved / Offline – retrying".
  - On a version conflict (edited elsewhere): banner "Updated by Priya 2 min ago – Reload / Overwrite".
- **Dirty and guard:**
  - Once autosave exists, "dirty" means "not yet saved to the server". The `beforeunload` and route guards fire only while saving is pending or failed.
  - A separate "Unpublished changes" state compares the draft with the live version.
- **Publish:**
  - Explicit and validated. Errors block; warnings require acknowledgement.
  - A confirmation modal summarises the diff and impact. For automations: "Applies to new enrollments; 124 records mid-workflow continue on v3 / migrate to v4" (choice). For forms: "Live URL and embeds update immediately".
  - Creates an immutable version vN with author, time and optional note.
- **Status:**
  - Automations: Draft (never published), Live, Paused (published but not enrolling; "Resume"), Archived.
  - Forms: Draft, Published, Closed (unpublished; the public URL shows "closed"), Archived.
  - The current Active switch maps to Pause/Resume or Close/Reopen, each with a confirmation.
- **Undo/redo:** an in-session command stack (Cmd+Z / Shift+Cmd+Z, toolbar buttons) covering add, delete, move, config change and structure changes. Every delete shows a toast with "Undo".
- **Version history:**
  - A drawer lists versions (vN, publisher, date, note, Live badge).
  - Actions: "View" (read-only canvas or form), "Compare with current", "Restore as draft".
  - Automation runs record the version they executed.
- **Test/preview** always targets the current draft. Automation test runs are dry by default; "Run for real on 1 record" needs a confirmation. Form test submissions are sandboxed.
- **Deletion:** "Delete" moves the item to Archived and offers undo; permanent delete happens after 30 days or by admin action. Deleting a form names its submission count and offers "Export first".

### (d) Every destructive action and how it is confirmed today
| # | Action | Where | Confirmation today |
|---|---|---|---|
| 1 | Delete automation | automations-v2/page.tsx 60 (⋮ → Delete) | Native `confirm('Are you sure…')`; no undo. Stale-closure bug may also empty the list |
| 2 | Delete step (node trash) | expressive-node.tsx 185-196 → page.tsx 903 | None; toast "Node removed"; children orphaned; no undo |
| 3 | Delete selected node or edge with Backspace (ReactFlow default) | page.tsx 2548-2553 (`onNodesChange`/`onEdgesChange`) | None, no undo |
| 4 | Remove condition, else-if branch, field update, split variant | step dialog 2703, 2736, 2799, 2868, 3023 | None (branch nodes removed from the canvas on "Save Step", 834-837) |
| 5 | Remove exit condition | page.tsx 1537 | None |
| 6 | "Cancel" in the step dialog | page.tsx 2599 | Appears to discard but doesn't; edits persist on the next Save (981) |
| 7 | Change trigger type (strands incompatible steps) | page.tsx 1361, 2629 | None, no warning |
| 8 | Deactivate automation (Active switch) | page.tsx 1293 | None; applied on Save |
| 9 | Leave builder with unsaved changes (back arrow, nav, tab close) | page.tsx 1276 | None (no dirty tracking or `beforeunload`) |
| 10 | Enroll records (live execution on up to 200 records) | EnrollRecordsDialog.tsx 62-79 | None; runs immediately |
| 11 | Delete form (and all submissions) | forms/page.tsx 99 | Native `confirm("Are you sure? This will delete the form and all submissions.")`; no undo |
| 12 | Remove field (canvas hover ×, inspector "Remove Field") | form-editor.tsx 1497-1508, 997-1004 | None, no undo |
| 13 | Remove tab, deleting all its sections and fields (canvas tab ×, Settings ×) | form-editor.tsx 1330-1340, 1082-1089 → 502-517 | None (only blocked when it is the last tab) |
| 14 | Remove section, deleting its fields (canvas ×, Settings ×) | form-editor.tsx 1353-1360, 1113-1120 → 527-537 | None (only blocked when it is the last section) |
| 15 | Clear a conditional logic rule (trash) | logic-builder.tsx 88-95 | None |
| 16 | Change a field's Source Module (clears or remaps its mapping) | form-editor.tsx 869-886 | None |
| 17 | Edit options textarea (flattens `{value,label}` pairs) | form-editor.tsx 841-849 | None |
| 18 | Custom CSS overwritten by the visual style controls | style-editor.tsx 42-63 | None |
| 19 | Deactivate form ("Form Active" off) | form-editor.tsx 1199-1205 | None; applied on "Save Form" |
| 20 | Switch builder tab with unsaved edits (Builder → Submissions / Analytics / Placement) | forms/[formId]/page.tsx 95-121 | None; edits silently discarded on unmount |
| 21 | "Save Placement" overwriting fields and Active state with a stale snapshot | crm-placement-editor.tsx 209-224 | None; silent data loss |
| 22 | Remove placement condition (×) / disable placement | crm-placement-editor.tsx 532, 257-260 | None |
| 23 | "Clear draft" (public form and in-CRM form) | public-form-renderer.tsx 257-261; contextual-forms-panel.tsx 531-535 | None; toast "Draft cleared" |
| 24 | In-CRM "Save Changes" PATCHing lead / opportunity / activity (a stale local draft can overwrite newer values) | contextual-forms-panel.tsx 466-495 | None; no review or diff |

---

# P5 · Service, platform admin, public and auth

## UI/UX review for P5: service, platform-admin and public screens

I opened all 47 files in the inventory and read each one in full. Line numbers refer to the file under each heading. I also checked a few shared pieces and nav links (NavigationDrawer, ModuleGate, SettingsSections, StandardDialog, PageHeader, bulk-toolbar, settings/catalog, settings/call-campaigns) to confirm which pages can actually be reached.

---

### src/app/bootstrap/page.tsx — first-run creation of the platform admin
- Elements: cards for "Checking Bootstrap Status..." / "Setup status unavailable" (Try again) / "Bootstrap Complete" (Go to Sign In) / "Bootstrap Platform Admin" form (Full Name, Email, Password, Create Platform Admin).
- Findings:
  - `[C1][M]` "Bootstrap Platform Admin", "Checking Bootstrap Status..." and "Bootstrap Complete" are developer words (86,104,119) → use "Set up your platform", "Checking setup…" and "Setup complete".
  - `[C1][M]` If an admin already exists, the page still says "Bootstrap Complete" (99-106) → say "This platform is already set up" and redirect to /login automatically.
  - `[F1][M]` No confirm-password field, and the password hint sits outside the field without aria-describedby (160,166) → add a Confirm password field and use FormDescription.
  - `[C1][L]` A success toast and a success card show together (72,106) → keep only the card.

### src/app/case-survey/[id]/page.tsx — public CSAT survey
- Elements: star rating (5 buttons), "Comments (optional)" textarea, "Submit feedback"; states for loading, invalid link, error and thank-you.
- Findings:
  - `[A2][M]` The stars are separate toggle buttons, not a radio group (69-75) → use role="radiogroup" with arrow keys and a visible "1 = poor, 5 = excellent" legend.
  - `[R9][L]` Submit stays disabled with no hint until a score is picked (85) → show "Pick a rating to continue" text.
  - `[C1][L]` The page has no tenant branding or name, so recipients can't tell who is asking → show the workspace name and logo.
  - `[R1][L]` The stars use yellow-400 (72) → acceptable as a rating idiom; keep them as the only off-accent colour.

### src/app/dashboard/applications/[id]/page.tsx — application detail
- Elements: "Back to applications" button, PageHeader (number / applicant), cards for "Application details" (dl) and "Stage history", then ApplicationEligibility and ApplicationWorkflow.
- Findings:
  - `[R5][M]` A full outline back button sits above the header (13) → replace it with a breadcrumb (Applications › APP-…).
  - `[R5][M]` The header doesn't show the current stage or owner; they are buried in the dl (13) → show the stage as a status chip and the owner next to the title.
  - `[R2][M]` Six stacked cards (details, history, eligibility, checklist, change stage) → use a two-column workspace: main area with tabs for Checklist, Eligibility and History; side rail with the summary dl.
  - `[S1][L]` Loading is a bare `<p>` (13) → use the PageSkeleton used elsewhere.
  - `[E1][L]` Stage history is all text with no visual marker for the current stage → use a vertical timeline with the current stage highlighted.

### src/app/dashboard/applications/numbering/page.tsx — numbering rules
- Elements: PageHeader + "Back to Applications"; "Saved rules" card ("Workspace default" button, rule cards with "Edit rule"); "Rule editor" card (University, Opportunity type, Intake, Prefix, Suffix, Timezone, Minimum sequence digits, Financial year starting month, preview, "Save rule").
- Findings:
  - `[N1][M]` This is configuration but lives under /dashboard/applications, reached from a header button (32) → move it to Settings › Applications › Numbering.
  - `[F1][H]` Timezone is a free-text Input (39) → use a searchable timezone select.
  - `[F1][M]` Validation errors are joined into one paragraph at the bottom (27,43) → show errors inline per field.
  - `[E1][M]` The editor never shows which rule is being edited, and rules can't be deleted (34-35) → show an "Editing: <scope>" header and add a Delete action with confirmation.
  - `[C1][M]` "Workspace default" is a cryptic button, and the two cards open with long paragraphs (34-35,40) → name it "Edit default rule" and move the explanation into a help popover.
  - `[F2][L]` Discarding unsaved changes uses window.confirm (26) → use the shared AlertDialog.
  - `[R8][L]` Saved rules show raw pattern tokens such as `{YYYY}` + zeros (34) → show the formatted example, e.g. APP-2026-000001.
  - `[S1][L]` A missing permission is shown as an ErrorState (31) → use a "No access" empty state with no retry.

### src/app/dashboard/applications/page.tsx — applications list
- Elements: PageHeader ("Numbering rules", "New Application"), "Search applications" input, count, card grid, Previous/Next pager; "New Application" StandardDialog (Find applicant, Applicant (Lead), Program, Initial stage, Course, Intake, Linked opportunity).
- Findings:
  - `[T1][H]` A records list is shown as a two-column card grid (36) → use DataTable with Number, Applicant, Program, Stage, Intake, Owner and Created columns, plus sorting and row click.
  - `[T1][M]` No filters for stage, university, intake or owner; page size is fixed at 25 (36) → add a single-row filter toolbar and persist filters in the URL.
  - `[F1][H]` The applicant picker is a separate search input plus a Select of 50 Leads (38-40) → use one async combobox.
  - `[F1][M]` Required fields (Applicant, Program, Initial stage) aren't marked, and Create stays disabled with no reason (37) → add required markers and inline "Select a program" hints.
  - `[C1][M]` The empty state tells every user to "Configure a program … in Catalog" (36) → show that only to catalog admins, with a link.
  - `[C1][L]` "Applicant (Lead)" and the draft-retention notice (38,40) are system wording → use "Applicant" and drop the notice.
  - `[R10][L]` Buttons use custom `h-auto min-h-10 whitespace-normal`, unlike the rest of the app → use the standard Button sizes.

### src/app/dashboard/approvals/page.tsx — approval inbox
- Elements: PageHeader "Approval Inbox"; list rows with a type Badge, title, summary, requester/time, and Reject / Approve buttons; EmptyState "Nothing waiting on you".
- Findings:
  - `[F2][H]` Reject asks for its reason with `window.prompt` (69) → use a dialog with a reason textarea.
  - `[N1][H]` Rows don't link to the underlying payout, campaign, template, export, model or partner request, so approvers decide without seeing it (108-131) → make the title a link and add "View details", ideally in a side sheet.
  - `[F2][M]` Approve runs with one click, even for payouts and exports (127) → add a confirmation for money and data-egress types, or an Undo toast.
  - `[R4][M]` The entity type is shown as a Badge (111) → show it as plain muted text or a filter tab.
  - `[T1][M]` No grouping or filtering by type and no bulk approve → add tabs by type with counts and multi-select.
  - `[R3][L]` The summary is text-xs (114) → use text-sm.

### src/app/dashboard/call-center/campaigns/[id]/page.tsx — campaign dialer workspace
- Elements: PageHeader "Call Campaign Workspace" + "Back to Call Center"; empty card with "Get Next Call"; current-record card (name link, "Attempt N" badge, phone, Call / Log Outcome / Skip / Next); LogCallOutcomeDialog.
- Findings:
  - `[N1][H]` The only way in is Settings › Call campaigns (settings/call-campaigns/page.tsx:145); agents have no list of their campaigns → add a "My campaigns" list to the Call Center.
  - `[R5][H]` The title is generic and the header shows no campaign name, progress or remaining count (80) → title it with the campaign name and add "12 of 140 done · 3 callbacks due".
  - `[E1][H]` The call script (CallScriptPanel), compliance lines and record context are missing here; they only appear on lead and opportunity pages → embed the script and record summary next to the current call.
  - `[F2][M]` "Skip / Next" drops the current record with no disposition, reason or confirmation (112) → require a skip reason or a quick "No answer" disposition.
  - `[E1][M]` After logging an outcome, `setCurrent(null)` sends the agent back to the empty card (128-131) → auto-advance to the next call, with a "Pause after this call" option.
  - `[R9][M]` "Log Outcome" is a secondary outline button even though it is the required step → make it primary once a call has been placed.
  - `[S1][M]` Failure to fetch the disposition group is swallowed (43-45) → show an inline warning.
  - `[S1][L]` On error, the ErrorState and the "Get Next Call" card both show (82-84) → show one.
  - `[C1][L]` The toast text uses "--" (55) → "No calls are due right now."
  - `[R4][L]` "Attempt N" is a Badge (101) → use muted text.

### src/app/dashboard/call-center/page.tsx — agent and supervisor call center
- Elements: PageHeader "Call Center" + Refresh; error banner; "My Workspace" grid (Live Calls, Missed Calls Today, Callbacks Due, Recent Dispositions, My Open Leads, My Open Opportunities); "Team Overview" grid (Team Live Calls, Team Missed, Team Callbacks, Agent Availability, Queue Backlog with expandable teams and Claim, Team Recent Dispositions); LogCallOutcomeDialog.
- Findings:
  - `[R2][H]`/`[R10][H]` Up to 12 equal-weight cards in two grids, all on one scroll → split into "My calls" and "Team" tabs, and lead with a single "Next up" queue (see layout (b)).
  - `[R9][H]` Callback and missed-call rows have no Call button, only "Log Outcome" or nothing (179,116-130) → make Call the primary action and put Log Outcome after it.
  - `[R8][H]` Rows show raw `direction · status` and `queueType · priority` enums (126,365) → map them to labels such as "Outbound · No answer".
  - `[N1][H]` No list of assigned campaigns, so the dialer is unreachable from here → add a campaigns card or tab.
  - `[R4][M]` Every card header carries a count Badge and a primary-coloured icon (104-106,153-155,…) → use plain "(3)" counts and no icons.
  - `[R7][M]` Any unclaimed count above 0 turns the badge destructive red, and overdue callbacks are red badges (345,178) → reserve red for SLA breach and use plain text for counts.
  - `[C1][M]` The empty Queue Backlog tells agents to "Configure a default call queue team in Telephony settings" (333) → show that only to admins.
  - `[E1][M]` Agents can't set their own status (Online / Break) here; it is read-only for supervisors (254-281) → add a status switcher in the header.
  - `[R10][L]` The spinner animates on every 20-second auto refresh (398-409) → show "Updated 10s ago" text instead.
  - `[S1][L]` The error banner is a custom div (431) → use the shared Alert.

### src/app/dashboard/cases/[id]/page.tsx — case workspace
- Elements: back icon, h1 subject, "Case #N", status Badge, "SLA overdue" Badge; left rail with summary card (Status, Priority, Owner + Reassign, First response due, Resolution due, SLA paused/running + Pause/Resume), Suggested articles, Communication history (Show/Hide), Requester, Related records; main column with Description, Comments (list, macro Select + Apply, textarea, Internal note checkbox, Post), Attachments (Upload), Assignment history; Reassign dialog (New Owner, Reason).
- Findings:
  - `[A1][H]` The Status, Priority, New Owner and Reason Labels have no htmlFor/id, and the comment Textarea has no label (214-229,473-483,387) → link the labels and add an sr-only "Comment" label.
  - `[A2][H]` Upload is a `<label>` around an `<input type=file className="hidden">`, so keyboard users can't reach it (406-414) → use a Button that triggers a visually-hidden but focusable input, plus drag-and-drop.
  - `[F2][H]` "Apply" runs the macro immediately and can send a customer reply (105-106) → show a preview dialog listing what it will change and send.
  - `[F2][M]` Unticking "Internal note" posts a public reply with no warning, and the same "Post" button is used (389-395) → split into a "Reply to requester" / "Internal note" toggle with distinct send labels.
  - `[E1][M]` Status and priority save immediately on select with only a toast and no undo (139-147) → add an Undo action to the toast; make "Resolve" a primary header action.
  - `[R5][M]` The header has no primary actions (Resolve, Assign to me) and doesn't use PageHeader (200-207) → use PageHeader with the status chip and add Resolve and Reassign actions.
  - `[R2][M]` The left rail stacks 5–6 cards and the main column 4 → use one rail panel with dividers, and put Conversation, Attachments and History in tabs.
  - `[R3][H]` The Internal badge is `text-[10px]` (359), and section headings use `uppercase tracking-wide` (320,329,339) → use text-xs sentence-case headings.
  - `[R8][M]` Owner and comment author fall back to email (234,356,444), and history shows raw `channel` and `eventType`/`status` (306) → show the name or "Unknown user" and map enums to labels.
  - `[N1][M]` Suggested articles can't be clicked, so they are a dead end (277-281) → link them to the article and add "Insert link in reply".
  - `[F2][M]` SLA pause and resume happen with one click and no reason (88-99) → ask for a pause reason in a small dialog and record it.
  - `[S1][M]` Failures loading statuses, priorities, users, macros, articles or attachments are swallowed (73-78), leaving a blank Select or "Status unavailable" → show inline retry notices.
  - `[F1][L]` Reassign validation uses a toast (165) → show inline errors.

### src/app/dashboard/cases/page.tsx — case list
- Elements: PageHeader "Cases" + "Create Case"; filter group (Status, Priority, Queue Selects); DataTable (Case, Status, Priority, Queue, Owner, SLA Due); empty state; "Create Case" dialog (Subject, Description, Type, Priority, Queue, Requester name, Requester email).
- Findings:
  - `[T1][H]` No text search, "My cases" / "Unassigned" views, or owner filter → add search, saved views (My open, Unassigned, Breached) and an owner filter in a one-row toolbar.
  - `[N1][M]` Filters and page aren't in the URL (51-53), so they can't be deep-linked and are lost on Back → sync them to search params.
  - `[R3][M]` Status and priority badges are `uppercase tracking-wide font-bold` (128,136) → use sentence case at normal weight.
  - `[R7][M]` Four priority colours, including primary for Medium (28-33) → colour only Urgent (destructive) and maybe High; leave the rest neutral.
  - `[R8][L]` Owner falls back to email (149) → show the name.
  - `[A1][M]` The Type, Priority and Queue labels in the create dialog aren't associated (285-310) → add htmlFor/id.
  - `[F1][M]` Subject isn't marked required, and validation is a toast (165) → add a required marker and an inline error.
  - `[S1][M]` A config fetch failure is swallowed (73-75), so filters show empty; list errors show both a toast and the table error (92-93) → show one inline error, plus a notice when filters failed.
  - `[S1][M]` A disabled Service Desk uses a custom EmptyState saying "for this tenant", not ModuleGate (195-205) → use `<ModuleGate moduleKey="SERVICE_DESK">` for consistent copy.
  - `[F1][L]` Requester email has no autocomplete="email" (319) → add it.

### src/app/dashboard/exports/page.tsx — export requests and sensitive-field rules
- Elements: PageHeader "Export Requests" + Refresh; "Request History" card + "Worker pending" Badge; table (Module, Status, Records, Queued, Completed, Expires, Size, Action: Approve/Reject/Download/disabled Pending/Expired); `<details>` "Sensitive field rules" (module Select, Field key input, Add Rule, removable rule badges).
- Findings:
  - `[R8][H]` The Module column and rule chips show raw `LEADS` / `LEADS.ssn`, the module Select lists raw enums, and status shows "PENDING APPROVAL" (255,259,318,339) → map to "Leads" and "Pending approval".
  - `[R7][M]`/`[R1][M]` Each status gets its own palette: amber, blue, green, red (79-88) → keep neutral text and colour only Failed/Rejected (destructive) and Pending approval (attention).
  - `[R9][M]` Non-actionable rows show disabled "Pending"/"Expired" buttons (287-291) → show plain text or nothing.
  - `[F2][M]` Reject uses confirm() (172); Approve has no confirmation even though it releases sensitive data (161); deleting a rule happens immediately with no undo (200-207) → use AlertDialog for Reject and Approve-sensitive, and an Undo toast for rule removal.
  - `[S1][M]` Non-admins see "Tenant admin access is required" as an ErrorState with Retry (145,333) → hide the rules section for non-admins.
  - `[N1][M]` Sensitive-field rules are configuration on an operational page → move them to Settings › Data & privacy.
  - `[R5][M]` The details summary "Sensitive field rules" is followed by the CardTitle "Sensitive Field Rules" (303-305) → keep one title.
  - `[C1][M]` "Worker pending", "Field key, e.g. ssn", "Counting after export" and "Scroll the table horizontally…" (220,324,112,223) → use "Preparing…", a field picker instead of a free key, and "Calculated when ready"; drop the scroll hint.
  - `[T1][M]` The table has no requester, no sorting or pagination, and Expires uses `toLocaleDateString` instead of the workspace format (271) → move to DataTable, add a Requested by column, and use formatWorkspaceDate.

### src/app/dashboard/layout.tsx — dashboard shell wrapper
- Elements: DashboardLayout + DashboardPageTransition.
- Findings:
  - `[R10][L]` An animated transition runs on every navigation → keep it to an opacity fade only (or none) for a work tool.

### src/app/dashboard/leaderboard/page.tsx — gamification leaderboard
- Elements: h1 "Leaderboard", scope segmented control (Individual/Team), range segmented control (7/30/90/All); ranked rows with medal emoji, avatar, name, email, points.
- Findings:
  - `[S1][H]` A fetch error shows a toast, then the "No points earned yet" empty state (86-88,122) → show ErrorState with retry.
  - `[R5][M]` Custom h1 `text-lg font-extrabold` and a text-xs description instead of PageHeader (112-113) → use PageHeader.
  - `[R8][M]` Email shown under each name (155-157) → remove it, or show team or role.
  - `[R7][M]`/`[C1][M]` The top 3 get amber cards and medal emojis 🥇🥈🥉 (35,134,144,159) → use a neutral rank number and at most a subtle accent on #1.
  - `[A1][M]` The segmented controls have no group label (47) → add role="group" with aria-label "Scope" / "Period", or use ToggleGroup.
  - `[R10][L]` Stagger and hover animation on every row (125-130) → remove.
  - `[S1][L]` Gamification-disabled copy differs from ModuleGate copy (100) → use one shared "not enabled" component.

### src/app/dashboard/my-points/page.tsx — my points, rewards, badges
- Elements: h1 "My Points"; "Total Points" hero; "Reward Catalog" cards (Redeem / "Not enough points"); "Redemption History"; "Badges Earned" (tooltip tiles); "Recent Activity".
- Findings:
  - `[S1][H]` Every fetch has `.catch(() => [])` (64-67), so errors look like empty states → show an ErrorState per section.
  - `[F2][H]` Redeem spends points with one click and no confirmation (157-163) → confirm "Redeem 500 pts for X?"
  - `[R3][H]` Badges are `text-[0.65rem]` (~10px) (147,188), and "Total Points" is uppercase (128) → use at least 12px, sentence case.
  - `[R8][M]` Shows `rewardType.replaceAll("_"," ")` → "THIRD PARTY REWARD", raw `redemption.status`, and raw `triggerEvent ?? entryType` (145,189,236) → map to labels.
  - `[R9][M]` Unaffordable rewards show a wall of disabled "Not enough points" buttons (164) → show "Need 120 more pts" as text with no button.
  - `[R1][M]`/`[R2][M]` Gradient hero, amber badge tiles, rounded-[18px]/2xl cards (126,209) → one neutral summary row and a standard card radius.
  - `[A2][M]` Badge tooltips sit on non-focusable divs (208-216) → make them focusable or show the description inline.
  - `[R5][L]` No PageHeader (116); five stacked sections → put Rewards, History, Badges and Activity in tabs.
  - `[C1][L]` Currency is hardcoded ₹ (152) → use the workspace currency formatter.

### src/app/dashboard/payouts/page.tsx — partner payouts
- Elements: PageHeader "My Payouts" + Export; "Tax details incomplete" destructive Alert / "My Profile" strip + "Request Profile Change"; Request Profile Change dialog (Legal Business Name, GSTIN, PAN, Registered State, Your requests); "Invoice Template" accordion (Logo URL, Footer Notes, Signatory Name, Save Template); "Payout Cycles" rows (amount, status Badge, Generate Invoice, Invoice, Details); "Commission Ledger"; "Payout Breakdown" dialog (Cycle, Disputes, Included Conversions, History; Download Statement, Raise a Dispute); "Raise a Payout Dispute" dialog.
- Findings:
  - `[R8][H]` Status badges show raw DRAFT/APPROVED/PAID and change-request/dispute statuses; ledger shows raw `CORRECTION_DEBIT`; history shows raw `event.action` and `adjustment.direction` (412,341,515,458,532,558-559) → map all to labels.
  - `[R3][H]` Badges are `text-[0.65rem]` (411,515), and dialog sections use uppercase micro-labels (333,504,510,524,547) → 12px, sentence case.
  - `[R5][M]`/`[R10][M]` Five stacked regions: alert, profile, template accordion, cycles, ledger → summary header (Pending / Paid YTD), then Cycles and Ledger tabs; move Profile and Invoice template to a "Payout settings" sheet.
  - `[N1][M]` The Invoice Template settings sit on a transactional page (350-390) → move them to profile settings.
  - `[R7][M]`/`[R9][M]` "Raise a Dispute" is a red destructive button in the breakdown footer (488-494) and the submit is destructive too (577) → use an outline button; disputing isn't destructive.
  - `[M1][M]` The Dispute dialog opens on top of the Breakdown dialog (474-592) → put the dispute form inline inside the breakdown, or close one first.
  - `[F2][M]` Generate Invoice creates a GST invoice with one click (415-423) → confirm with an invoice preview (amount, GSTIN).
  - `[F1][M]` GSTIN and PAN have no format pattern, maxlength or uppercase handling, Registered State is free text, and Logo URL isn't type=url (319-329,363) → add input masks and validation, a state select, and type=url.
  - `[T1][M]` Payout rows lead with the creation timestamp and never show the cycle label (404-406) → lead with the cycle label and period.
  - `[R7][L]` The tax Alert is `destructive` for missing info (270) → use the warning/attention style.
  - `[S1][L]` A redundant `loading` branch at 392 can never trigger.

### src/app/f/[slug]/page.tsx — public form by slug
- Elements: wrapper for PublicFormPageContent.
- Findings:
  - `[N1][L]` This duplicates /public-form/[id] (same component, two URL schemes) → canonicalise on /f/[slug] and redirect the other.

### src/app/layout.tsx — root layout and providers
- Elements: html/body, MotionConfig, providers, Toaster.
- Findings:
  - `[A1][M]`/`[N1][M]` Every page has the static title "Unnatify" (18-21) → give each route a title via metadata or a client document-title hook ("Case #123 · Cases · Unnatify").
  - `[A2][M]` No skip-to-content link at root (and none in either shell) → add one in the dashboard and platform shells.
  - `[C1][L]` The description "Secure, multi-tenant CRM SaaS" is internal wording.

### src/app/login/page.tsx — sign-in, MFA and expired password
- Elements: card heading (Welcome back / Two-factor authentication / Update your password); Email, Password (+ show/hide), Sign in; MFA code, "Remember this device", Verify, "Back to sign in"; New/Confirm password, "Update Password & Sign In"; footer "Need help? Contact your administrator".
- Findings:
  - `[N1][M]` No "Forgot password?" path, and the help line isn't a link (307-309) → add "Forgot password?" with an admin-reset explanation or a mailto.
  - `[F1][M]` The expired-password step gives no rule hint and the button stays disabled until 6 characters (176-198); the rule (6) conflicts with bootstrap (8) → show the policy text and use one minimum everywhere.
  - `[F1][L]` Login validates `min(6)` on the password (22), which leaks policy and blocks legacy passwords → only require it to be non-empty.
  - `[A1][L]` Field errors aren't linked with aria-describedby (260-262,293-295) → link them.
  - `[R2][L]` rounded-[28px] card and h-14 rounded-2xl buttons are off-system (155,197,224,300) → use standard radius and height.
  - `[C1][L]` The "Logged in successfully" toast after redirect is noise (89,116) → remove.

### src/app/page.tsx — root redirect
- Findings:
  - `[N1][L]` Always redirects to /login, even when signed in → redirect to the landing page if a session exists.

### src/app/platform-admin/audit-logs/page.tsx — platform audit log
- Elements: h1 "Audit Logs" + decorative icon; "Filters" card (Action, Entity Type, "Search current page"); table (Timestamp, User, Tenant, Action, Entity Type, Record, Changes); pager.
- Findings:
  - `[N1][H]` The Record column says "Linked record" but links nowhere (239) → link to the entity, or show its name.
  - `[T1][H]` Search only filters the loaded page (95,158); there is no date-range, tenant or user filter and no export → use server-side search and add date range, tenant and actor filters plus Export.
  - `[R6][H]`/`[R2][M]` Filters sit in a separate titled card above a table card (116-171) → one-row toolbar above a single table.
  - `[R5][M]` Custom h1 `text-3xl` plus a decorative FileText icon (105-113) → PageHeader.
  - `[R8][M]` Raw `log.action` / `entityType` (LEAD, CREATE) and "N/A" (234,237) → labels and "—".
  - `[R7][M]` Action badges get default, secondary or destructive colour by type (227-233) → plain text; colour only failures or deletes if needed.
  - `[T1][M]` Filter values are hardcoded (5 actions, 6 entity types) and miss most domains (129-153) → load the distinct values from the API.
  - `[E1][M]` Changes appear as raw JSON in `<pre>` with a `text-blue-600` summary (243-249) → show a field-level before/after diff in a side sheet; use the accent colour.
  - `[A1][L]` The `<label>`s aren't associated (123,140,158) → use htmlFor.
  - `[S1][L]` The error is a custom block, not ErrorState (181-184).

### src/app/platform-admin/impersonation-review/page.tsx — impersonation sessions
- Elements: PageHeader; Tabs (Pending Review / Reviewed / All); session rows (who impersonated whom, Reviewed badge, "N actions taken" badge, tenant, started/ended, reason, review note, "Mark Reviewed"); dialog with a note.
- Findings:
  - `[N1][H]` "N actions taken" doesn't link to those actions (107) → link to the audit log filtered by session id.
  - `[C1][M]` The description duplicates Privileged Actions verbatim (77 vs privileged-actions:125) → "Review sessions where an admin signed in as a user."
  - `[C1][M]` The tenant falls back to the user's email (109) → "Platform user".
  - `[R4][M]` The action count is a Badge (107) → muted text.
  - `[R1][L]` The emerald "Reviewed" badge (102) → neutral, with a check icon.
  - `[C1][L]` "--" used as an em dash in copy and placeholder (110,144) → use "–" or "to".
  - `[S1][L]` Empty copy is the same for every tab (91) → "No sessions waiting for review" on the pending tab.

### src/app/platform-admin/layout.tsx — platform-admin shell
- Elements: sidebar ("Platform Administration") with 10 flat links; "Back to App"; mobile Sheet + menu button.
- Findings:
  - `[N1][H]` Ten flat links with no grouping, from Dashboard down to Marketplace (19-30) → group them (see IA (c)).
  - `[N1][M]` No top bar: no signed-in identity, sign-out, environment indicator or breadcrumbs → add a slim header with breadcrumb and user menu.
  - `[R10][M]` `min-h-14` rounded-full pills with size-6 icons (57,63) are oversized next to the 240px main app nav → use 36–40px rows and size-4 icons.
  - `[R1][M]` The active item uses `bg-secondary`, not the main accent pattern (59) → match NavigationDrawer.
  - `[C1][L]` "Back to App" uses a LogOut icon (73) → use ArrowLeft or "Open workspace".

### src/app/platform-admin/marketplace/page.tsx — marketplace governance
- Elements: PageHeader; SettingsSections (Reviews (n), Blocked installs (n), App health, Registered apps (n)); Pending Publish Reviews (Reject/Approve); Pending Write-Permission Approvals (Reject/Approve); Blocked Installs (Unblock); Platform-wide App Health tiles + Suspected outages; All Registered Apps (search, table: App, Owner, Installing Tenant, Category, Install Status, Trust Level native select, Registered, Actions: Rotate / Block Tenant / Unpublish / Suspend).
- Findings:
  - `[F2][H]`/`[F1][H]` "Block Tenant" uses two `window.prompt`s and asks the admin to type the exact tenant name (156-167) → use a dialog with a tenant combobox and a reason field.
  - `[F2][H]` Reject, Unpublish and Suspend use `window.prompt` for the reason, then `window.confirm` if it's blank (197-199,242-244,258-260); Rotate uses confirm() (278) → one shared reason dialog (AlertDialog) with impact text.
  - `[F2][H]` Approving or rejecting write permissions has no confirmation or reason, even though it grants a third-party app write access (225-239,365-372) → confirm with the list of scopes.
  - `[R9][H]` Four action buttons on every row of a 1000px-wide table (499-534) → one row overflow menu with Rotate secret, Block tenant…, Unpublish…, Suspend….
  - `[N1][H]` Suspended apps have no Reinstate action; Suspend just goes disabled (528) → add "Reinstate".
  - `[E1][M]` Trust Level is an inline native select that saves immediately, coloured per level (485-495) → move it to the row menu, confirm the change, and use neutral styling.
  - `[R8][M]` Raw `installStatus`, "NO INSTALL", "PLATFORM SUSPENDED", health keys (OK/DEGRADED), raw permission keys, and a raw tenantId fallback (481,426,360,357) → map to labels; never show IDs.
  - `[T1][M]` One row per (app × tenant) mixes catalog and install concerns (454) → split into Apps (one row per app) and an installs drill-down.
  - `[C1][L]` Developer copy: "Aggregate counts only -- no tenant…", "(cross-tenant)", "--" (419,437,477) → trim it.
  - `[S1][L]` Seven parallel fetches fail as one (117-137) → load each section independently so one failure doesn't blank the page.

### src/app/platform-admin/module-bundles/page.tsx — module bundle presets
- Elements: PageHeader; "New bundle"; bundle sections ("Edit {name}"); inline form (Key, Name, Description, module switches, dependency alerts, Cancel / Save bundle).
- Findings:
  - `[E1][M]` The edit form replaces the list in place (99-139), so you lose your place and there is no Back → open it in a Sheet or a /module-bundles/[key] route.
  - `[R5][M]` "New bundle" floats above the grid instead of sitting in the header actions (82) → move it into PageHeader actions.
  - `[C1][M]` The Key field is a developer concept with the placeholder "E.G. PARTNER_NETWORK" (106-108) → derive the key from Name and show it read-only under "Advanced".
  - `[E1][M]` Bundles can't be deleted or reordered (sortOrder is hidden) → add Delete (with confirmation) and drag-to-reorder.
  - `[C1][L]` Each button reads "Edit {bundle.name}" (92) → visible "Edit", with the full name in aria-label.
  - `[F2][L]` Cancel discards edits with no dirty guard (134).

### src/app/platform-admin/module-health/page.tsx — cross-tenant module health
- Elements: PageHeader; stale/never-checked alert; "Show" filter Select (with counts) + Refresh; list of tenant link · module · health badge · issues · checked time.
- Findings:
  - `[C1][L]` Raw `toLocaleString()` instead of the workspace formatter (58,87) → formatWorkspaceDateTime.
  - `[T1][L]` No grouping by tenant or sorting by severity → group by tenant, worst first.
  - `[R5][L]` The description is long and dynamic (55) → keep the counts and move the cadence into a muted footer.
  - Good: tenant links work (82); this is the only way into tenant detail today.

### src/app/platform-admin/page.tsx — platform dashboard
- Elements: PageHeader "Dashboard Overview"; KPI cards (Total Tenants, Total Users, Total Leads, Revenue (Est)).
- Findings:
  - `[C1][H]` A dead "Revenue (Est) — Unavailable / Billing integration pending" tile (83-94) → remove it.
  - `[N1][H]` Nothing actionable: no pending publish reviews, privileged requests, impersonation reviews, module problems or failed migrations → replace with an "Needs attention" list linking to each queue, plus KPIs.
  - `[C1][L]` The title "Dashboard Overview" and the description "Workspace status…" are vague → "Platform overview".
  - `[S1][L]` Stats are derived client-side from the full tenants list (22-30) → use a summary endpoint.

### src/app/platform-admin/privileged-actions/page.tsx — two-person approval queue
- Elements: PageHeader; "Require a second platform admin's approval" Switch; request rows (action label, status Badge, requested time, reason; Approve / Reject / "Awaiting another admin's approval" / "Start Impersonation").
- Findings:
  - `[T1][H]`/`[R8][H]` Rows never show the target (which tenant or user) or the requester's name (145-153) → show "Suspend tenant Acme · requested by Priya".
  - `[F2][H]` The two-person-rule switch saves immediately, and turning it OFF isn't confirmed (65-79,132) → confirm the disable with a reason.
  - `[F2][H]` Approve and Reject have no confirmation and capture no reason (81-105) → use a dialog showing impact and a reason field.
  - `[R8][M]` Raw status Badge "PENDING", "EXECUTED" (149) → labels; badge only for Pending.
  - `[T1][M]` No pending/history tabs; all requests are mixed → add Pending, Approved and History tabs like impersonation review.
  - `[C1][M]` Same description as impersonation review (125) → "Approve or reject sensitive platform actions."
  - `[R4][L]` The "Awaiting another admin's approval" Badge (168) → muted text.

### src/app/platform-admin/retention/page.tsx — data retention (wrapper)
- Elements: renders RetentionPolicies (which has its own PageHeader).
- Findings:
  - `[C1][L]` It reuses the tenant-level component; make sure the copy and scope say whether this is platform default or per tenant → add a scope line ("Platform defaults; tenants may override").

### src/app/platform-admin/schema-status/page.tsx — migration status
- Elements: PageHeader + Refresh; alerts (missing table, failed, pending, SCHEMA.md stale, all good); Applied/Pending/Failed tiles; "Migration Files" table (File, Status, Applied At, Error).
- Findings:
  - `[C1][M]` Developer-repo copy: "SCHEMA.md looks stale… 01_SCHEMA_EXPORT_INSTRUCTIONS.md", "SchemaMigration tracking table" (77,97) → show only in non-production, or rewrite for operators.
  - `[R7][M]` The Pending and Failed tiles are amber and red even at 0 (110-111) → colour only when the value is above 0.
  - `[N1][M]` This is an engineering page in the primary admin nav → move it under System › Diagnostics.
  - `[S1][L]` Errors are swallowed (54-56), though "!report" still shows ErrorState, so that is acceptable; the Alert "info" variant uses an emerald icon (102-103) (R1 L).

### src/app/platform-admin/tenants/[id]/page.tsx — tenant detail
- Elements: back icon, h1, status/environment Badges, Plan, "Suspend/Unsuspend Tenant"; SettingsSections (Environment & demo, Users & usage, Feature flags, Modules); Environment & Maintenance card (Environment Select, Maintenance Banner switch + message, Save); Demo Data (Seed / Reset); Usage & limits; User Management table (Name, Email, Role, Joined, Impersonate); Feature Flags switches; Modules list (pending requests Decline/Approve…, status Select per module, health); dialogs (Change module status, Approve/Decline request, Impersonate with required reason).
- Findings:
  - `[N1][H]` The tenants list never links here; the only entry is module-health → see tenants/page.tsx.
  - `[E1][H]` Mixed save models: Environment, Feature flags and Module status save immediately, while Maintenance needs a "Save" (325-371,495) → pick one model; prefer explicit save or confirmation for consequential changes.
  - `[C1][H]`/`[N1][H]` Feature flags and Modules overlap, and the UI tells admins to "review both sections" (602,632,687) → merge them into one "Modules & features" list where each module carries its flag.
  - `[R5][M]`/`[R9][M]` A large destructive "Suspend Tenant" button is permanently in the header (442-450) → move it to an overflow menu or a "Danger zone" section; keep the header for identity and status.
  - `[N1][M]` The first section is "Environment & demo", the least-used one, and the section isn't in the URL (453-454) → add an Overview section first (status, plan, usage, health summary, recent activity) and sync `?section=` to the URL.
  - `[F2][M]` The environment change (which affects billing/reporting) has no confirmation (325-336); suspend uses confirm() and captures no reason (308); demo reset uses confirm() (235) → AlertDialog with a reason for Suspend and Environment change.
  - `[R3][H]` Module badges are `text-[0.65rem]` (675,678) → 12px.
  - `[R8][M]` Raw `tenant.status`, `environment` (PRODUCTION) and module status are shown as-is (435,437,676) → labels.
  - `[R4][M]`/`[R10][M]` Every module row carries status, Core and health badges plus 4–6 lines of help text (674-687) → status as text in the select only, Core as muted text, health only when unhealthy, help in a popover.
  - `[S1][M]` A demo-status or modules fetch failure sets a page-wide `loadError` and blanks the whole tenant page (149,188) → degrade per section.
  - `[S1][L]` Loading shows "Loading..." and "Tenant not found" as bare divs (419-420) → skeleton plus a not-found state with a link back.
  - `[C1][L]` "Plan: Basic" is shown as a fallback when there is no plan (438) → "No plan".
  - `[M1][L]` The Approve dialog uses a native select (785), unlike the Radix Selects elsewhere.
  - Good: the module-change dialog with impact preview and audit reason (712-764), and impersonation with a required reason (806-836), are the patterns to copy.

### src/app/platform-admin/tenants/create-tenant-dialog.tsx — provision tenant
- Elements: "Create Tenant" trigger; dialog "Provision New Tenant": Tenant Name, Plan, Module access (bundle select, collapsible module switches with search), API Access / Sales Groups switches, Usage limits (collapsible), Tenant Admin Account (Admin Name, Admin Email, Password), Cancel / Provision Tenant.
- Findings:
  - `[M1][M]` One long scrolling dialog covering identity, modules, features, limits and admin → use a 3-step wizard (Workspace → Modules & limits → Admin & review) or a full page.
  - `[F1][M]` The platform admin types the tenant admin's password, with placeholder "*******" and no confirm (237-247) → send an invite email, or generate a one-time password with copy.
  - `[C1][M]` "The plan label does not choose modules automatically" (181) shows Plan and modules are disconnected → either have Plan preselect a bundle or drop Plan from provisioning.
  - `[N1][M]` API Access and Sales Groups switches are mixed into Module access (196-199) → fold them into the module list (same merge as tenant detail).
  - `[F1][M]` Required fields carry `required` but no visual marker; errors appear only at submit as one message (252) → markers plus inline errors.
  - `[C1][L]` The button says "Create Tenant" but the dialog says "Provision New Tenant" (128,133) → "Create tenant" everywhere.
  - `[M1][L]` The bundle picker is a native select (173) → use the Radix Select.

### src/app/platform-admin/tenants/page.tsx — tenants list
- Elements: PageHeader "Tenants" + Create Tenant; DataTable (Name + plan, Status, Plan, Users, Created, Suspend/Unsuspend icon button); row selection + BulkActionsToolbar.
- Findings:
  - `[N1][H]` The name isn't a link and there's no `onRowClick`, so tenant detail can't be reached from the list (72-82,165-186) → link the name and add onRowClick to `/platform-admin/tenants/{id}`.
  - `[R9][H]` Row selection opens a BulkActionsToolbar with no handlers (189-193), so selecting rows does nothing (bulk-toolbar.tsx:118-122 needs onToggleFeatures/onExport/onDelete) → remove selection or wire real actions.
  - `[F2][H]` Suspend is an icon button with `confirm()` and a hardcoded reason "Admin Action" (43-59); it ignores `pendingApproval` and toasts "Tenant suspended" even when only a request was filed → use a reason dialog and handle the pending-approval response like tenant detail does.
  - `[T1][H]` No search or filters (status, plan, environment) → one-row toolbar.
  - `[R4][M]`/`[R1][M]` Plan appears twice (under the name and as a primary-coloured Badge) (80,109-111) → plain text in one column.
  - `[R8][M]` Raw "ACTIVE"/"SUSPENDED" (99) → labels; badge only for Suspended.
  - `[C1][L]` "Manage workspaces and subscriptions" (162), but there is no subscription UI → "Workspaces on this platform".

### src/app/public-form/[id]/page.tsx — public form by id
- Findings:
  - `[N1][L]` Duplicate of /f/[slug] → redirect to the canonical route.

### src/app/reset-password/page.tsx — admin-issued reset link
- Elements: card heading; New / Confirm password; Reset Password; incomplete-link state; done state (Go to Sign In).
- Findings:
  - `[F1][M]` The hint says 6 characters while bootstrap requires 8 (82), and there's no show-password toggle → one shared password policy component, with a toggle.
  - `[S1][L]` `Suspense fallback={null}` gives a blank flash (98) → a skeleton card.
  - `[F1][L]` A mismatch is reported only at submit (32-35) → validate inline on blur.

### src/app/unsubscribe/[outboxId]/page.tsx — public unsubscribe
- Elements: preference copy, "Unsubscribe from {channel} only", "Unsubscribe from all marketing", done state.
- Findings:
  - `[R8][M]` `channel.toLowerCase()` produces "sms" / "whatsapp" (52,60,65) → map to "SMS", "WhatsApp", "email".
  - `[F2][M]` No undo or re-subscribe after unsubscribing → add "Changed your mind? Resubscribe".
  - `[R7][L]` "Unsubscribe from all" is a red destructive button (67) → outline; it isn't destructive for the recipient.
  - `[C1][L]` No sender or workspace name, so recipients can't tell who it is → show "Messages from <Workspace>".

### src/components/applications/application-eligibility.tsx — eligibility card and editor
- Elements: card "Eligibility" + "Edit eligibility information"; disclaimer; status line; "View check details" disclosure; dialog (Qualifying education level, Qualifying marks %, Completed entrance exams, exam-complete checkbox, Reviewer notes, Discard and reload).
- Findings:
  - `[C1][M]`/`[R10][M]` A 3-sentence legal-style disclaimer is always visible (27) → one line plus an info popover.
  - `[R7][L]` The status is plain text with no visual differentiation for NOT_MET/NEEDS_INFO (28) → a status chip (badge allowed, since it is status).
  - `[E1][L]` Raw `<textarea>` instead of the Textarea component (33,35) → use Textarea.
  - `[F1][L]` One exam per line in a textarea → a tag input.

### src/components/applications/application-workflow.tsx — checklist and stage change
- Elements: "Document checklist" card (Daily document reminders block with toggle; checklist items with status lines and DocumentActions); "Change stage" card (Next stage, requirement notes, Reason for change, Save stage change, Discard and refresh).
- Findings:
  - `[C1][H]`/`[R10][H]` Every block opens with a long paragraph (56,59,75) → one-line descriptions; move policy to help.
  - `[E1][M]` The stage-change form is always open in the page (73-86) → a "Change stage" button that opens a dialog, or a stage stepper in the header.
  - `[R8][M]` Expiry shown as `String(item.expiryDate).slice(0,10)` (69) → workspace date format.
  - `[R7][M]` Checklist status is text only, so a missing required document doesn't stand out (66) → a status chip, with attention colour only for Missing, Rejected or Expired.
  - `[F2][L]` window.confirm when discarding (48) → shared AlertDialog.
  - `[R9][L]` "Discard and refresh" carries the same visual weight next to Save (84) → ghost or link style.
  - `[C1][L]` "Configure requirements in Settings → Catalog" is shown to all users (64) → admins only, with a link.

### src/components/applications/document-actions.tsx — upload, download, review per checklist item
- Elements: File/Comments lines; "Upload document/replacement", "Download", "Review document"; dialog (Choose file / Review decision, Rejection reason, Expiry date, Review comments).
- Findings:
  - `[C1][M]` "Files are private. Automated malware scanning is not configured." shown to end users (55) → remove, or show to admins only.
  - `[F1][M]` The review decision defaults to "Verified" (25,56) → no default; require an explicit choice.
  - `[F1][M]` The rejection reason isn't required when Rejected (57) → required, with an inline error.
  - `[F2][L]` window.confirm on discard (24).
  - `[E1][L]` Raw `<textarea>` (59) → Textarea.

### src/components/applications/fields.tsx — ApplicationSelect and error helper
- Elements: labelled Radix Select with a "Select…" or "None / any" first option.
- Findings:
  - `[F1][M]` For required selects, "Select…" is a real selectable item that maps to "" (5) → use a placeholder (no item), plus `aria-required` and a required marker prop.
  - `[C1][L]` Optional fields get both "(optional)" in the label and a "None / any" item (numbering 36-38) → pick one convention.

### src/components/auth/feature-gate.tsx — feature/module hooks
- Findings:
  - `[S1][M]` The default-feature map is duplicated (31-40, 59-68), and pages show different "not enabled" UIs (ModuleGate, custom EmptyStates, nothing) → export one `useFeature` and one `<FeatureGate>` fallback component for consistent messaging.
  - `[S1][L]` Platform admins always see every feature as enabled (26,57,81), so impersonation previews may differ from what users see → note this in the impersonation banner.

### src/components/auth/role-guard.tsx — role guard
- Findings:
  - `[S1][M]` It returns null while redirecting and shows "Loading authorization..." as plain text (59,63) → a skeleton, plus a "You don't have access" state instead of a silent redirect.
  - `[C1][L]` Admin is detected by name heuristics ("includes('admin')") (36), so the UI may show pages the API refuses (security and consistency) → rely on the permissions flag.

### src/components/auth/super-admin-guard.tsx — platform admin guard
- Findings:
  - `[S1][L]` A non-admin is silently redirected to /dashboard (16-17) → a brief "Platform administrators only" notice.

### src/components/cases/create-case-button.tsx — quick case from lead/opportunity
- Elements: trigger button "Case"; dialog (Subject, Description).
- Findings:
  - `[A1][H]` The labels have no htmlFor and the inputs no id (90-95) → link them.
  - `[A2][M]` The trigger is wrapped in `<span onClick>` (65) → pass the handler to the Button and use asChild for custom triggers.
  - `[F1][M]` No Type, Priority or Queue (unlike the list dialog), Subject isn't marked required, and validation is a toast → share one CaseForm with the list page.
  - `[C1][L]` The button label "Case" is ambiguous → "New case".

### src/components/catalog/catalog-entity-manager.tsx — generic catalog CRUD
- Elements: title + "Add {singular}"; selectable rows (Edit / Delete icons); dialog of configured fields; Cancel / Update / Create.
- Findings:
  - `[C1][H]` A bug in `singular()` (53-55) produces "Add Universitie", "Add Campuse", "Universitie updated" (settings/catalog titles "Universities", "Campuses") → pass an explicit `singularTitle` prop.
  - `[F2][M]` Delete uses `confirm()` and doesn't mention children (Programs, Courses, Applications) (147) → AlertDialog with dependent counts, or archive instead of delete.
  - `[A2][M]` A `role="button"` div contains real buttons (nested interactive) (181-209) → use a row-level link or button for selection, with actions outside it.
  - `[F1][M]` Name is validated only by toast, with no required marker; selects have no placeholder (124-127,256-259) → inline validation, required marker and placeholder.
  - `[C1][L]` "Update"/"Create" and the bare "Loading..." (172,226) → "Save" and a skeleton.

### src/components/exports/queue-export-button.tsx — export trigger and scope popover
- Elements: optional format Select (CSV/XLSX/PDF), Export button; popover with "Export scope", Load saved template, scope radio cards, "Save as a reusable template" checkbox + name, Cancel / Queue export.
- Findings:
  - `[E1][M]` The template checkbox state is tied to the name text (241-244), so clearing the name unticks the box → keep a separate boolean.
  - `[A1][M]` The checkbox and template select labels aren't associated, and the format Select has no label (163,203,240-244) → add ids or aria-labels.
  - `[C1][M]` "Choose exactly which records should go into the CSV" even when XLSX/PDF is chosen (199) → "into the export".
  - `[N1][L]` The toast "Open" action uses `window.location.href` (142), a full reload → router.push.
  - `[R9][L]` With no scoped choices it exports full view on one click (174) → acceptable, but show the record count in the label ("Export 1,240").

### src/components/telephony/call-recordings-panel.tsx — recordings on record pages
- Elements: "Call Recordings" + refresh icon; ready-link strip; rows (direction · status · duration, time, Play / Download / Expired / No recording).
- Findings:
  - `[F2][M]` A native `confirm()` consent notice appears before every Play or Download (65) → a one-time inline consent notice per session, or a styled dialog.
  - `[E1][M]` Play opens a link in a new tab via a second "Open recording" click (93-96) → an inline `<audio>` player.
  - `[R8][M]` Raw `direction · status` enums (110) → labels.
  - `[C1][L]` Duration in raw seconds (111) → mm:ss.

### src/components/telephony/call-script-panel.tsx — script during a call
- Elements: "Call Script" + name Badge; "Required Compliance Lines" block; content; "Objection Handling"; top NBA hint.
- Findings:
  - `[N1][H]` Not used in the campaign dialer, where it is needed most (it only appears on lead and opportunity detail) → embed it in the dialer workspace.
  - `[R4][L]` The script name is shown as a Badge (50) → muted text.
  - `[R7][L]` Compliance lines use a destructive-tinted block (54) → attention style (warning), not error.
  - `[S1][L]` Errors are swallowed and render nothing (36-41) → acceptable for an optional panel, but show "Script unavailable" in the dialer.
  - `[E1][L]` Objections are always expanded → a collapsible accordion, searchable during the call.

### src/components/telephony/log-call-outcome-dialog.tsx — disposition capture
- Elements: dialog "Log Call Outcome": Disposition Group, Outcome, Sub-Outcome, Interest Level, Next Action, Callback Date/Time, Reason Lost, Notes; Cancel / Log Outcome.
- Findings:
  - `[A1][H]` None of the Labels are associated with their controls (170,195,219,238,256,261,269,274) → add htmlFor/id.
  - `[F1][H]` Required-field errors come as a toast using the internal key, e.g. "This outcome requires callbackAt" (110) → inline errors with human labels.
  - `[E1][M]` Every optional field shows for every outcome, including Reason Lost on a positive outcome (235-277) → show only fields relevant to (or required by) the chosen outcome; collapse the rest under "More details".
  - `[R8][M]` Interest levels shown as raw HOT/WARM/COLD (246-249) → Hot, Warm, Cold.
  - `[E1][M]` Outcomes are drop-downs, which is slow for agents → large outcome buttons or chips with keyboard shortcuts (1–9).
  - `[S1][M]` A group-load error shows a toast and then "No call disposition groups configured yet" (75,162-165) → ErrorState with retry.
  - `[F2][L]` Cancel discards entered data with no dirty guard (97-100).
  - `[C1][L]` "Settings > Call Dispositions" is shown to agents (164) → "Ask an admin to set up call outcomes."
  - `[M1][L]` Inner padding `p-[18px] pt-1` is off-system (159).

---

### (a) Top 15 changes
1. **Make tenant detail reachable.** Link the tenant name and add onRowClick in tenants/page.tsx, and remove the row selection whose bulk toolbar does nothing.
2. **Replace every window.prompt and window.confirm** with one shared `ConfirmActionDialog` (title, impact text, optional or required reason, destructive styling). This covers marketplace (9 calls), approvals, exports, tenants, tenant detail, catalog, numbering, document actions, application workflow and recordings.
3. **Confirm consequential one-click actions and capture a reason:** approval-inbox Approve (payouts/exports), privileged-action approve/reject, the two-person-rule switch, marketplace write-permission approval, Redeem points, Generate invoice, macro apply, tenant environment change.
4. **Rebuild the campaign dialer as an agent workspace** (layout (b)) and give agents a "My campaigns" entry from the Call Center.
5. **Replace raw enums and IDs everywhere with a shared `labelFor(enum)` map.** Covers exports, call center, payouts, my-points, audit, privileged actions, marketplace, tenants, recordings, the outcome dialog and unsubscribe. Stop showing email as a name fallback.
6. **Show errors as errors, not empty states:** my-points, leaderboard, the outcome dialog, case config/meta, call-campaign disposition group, platform marketplace (load per section).
7. **Approval inbox: link every item to its source,** with a details side sheet, type tabs and a reason dialog.
8. **Case workspace (layout (b)):** header actions (Resolve, Assign to me), linked labels, an accessible upload control, reply versus internal-note modes, Undo on field changes, clickable articles.
9. **Remove sub-12px and uppercase text:** `text-[10px]` and `text-[0.65rem]` badges and `uppercase tracking-wide` labels in cases, payouts, my-points and tenant detail; use the PageHeader type scale on leaderboard, my-points and audit logs.
10. **Colour discipline:** status badges neutral by default, with destructive only for breach/failure/suspended and warning only for "needs action". Drop the amber/blue/green/emerald palettes, medal emojis and gradients.
11. **Applications list to a DataTable** with filters in a one-row toolbar; one combobox for the applicant; numbering moves to Settings with a timezone select and inline errors.
12. **Platform admin IA** (layout (c)): grouped nav, an actionable home page (needs-attention queues), top bar with breadcrumb and user menu; the dead revenue tile goes.
13. **Tenant detail:** an Overview section first, deep-linkable sections, one save model, Feature flags merged into Modules, Suspend moved to a danger zone with a reason, failures contained per section.
14. **Forms baseline:** a required marker, aria-required, inline errors (no toasts for validation), linked labels everywhere (cases ×3, outcome dialog, create-case button, export popover, audit labels), one password policy (8+) across login, reset and bootstrap, autocomplete/input types.
15. **Tables baseline:** audit logs get server-side search, date/tenant/actor filters, a real record link and a diff viewer; exports and marketplace get row overflow menus instead of four inline buttons and no disabled "Pending" buttons; filters and pages persist in the URL (cases, applications, audit).

### (b) Proposed layouts

**Agent call center: /dashboard/call-center** (one screen, three columns on wide screens, stacked on small ones)
- **Top bar (the only header):** agent status switcher (Online / Break / Offline), today's stats as plain text (calls · talk time · callbacks done), and an active-campaign selector ("Working: Spring Intake ▾ · 112 left").
- **Left, Queue (about 300px):** tabs Next up | Callbacks | Missed | Queue. One list with overdue items first; each row shows name, reason (Callback 10:30, Missed 09:12, Campaign), and an inline Call icon. Supervisors get an extra Team tab with agent availability and queue backlog; nothing team-level shows to agents.
- **Centre, Current call:** a record header (name link, phone, attempt n, owner, last outcome). A big primary Call / Hang up button with a timer, plus Mute and Hold if the provider supports them. A record snapshot below (stage, last 3 activities, open tasks, predictive score) without leaving the page.
- **Right, Script:** CallScriptPanel with compliance lines pinned at top (warning style, with a tick-to-confirm), the script body, and an objection accordion with search. The top next-best-action hint sits at the bottom.
- **Bottom of centre, Disposition (always visible once the call ends):** outcome chips with shortcuts 1–9; only the fields that outcome requires appear inline (callback datetime picker, notes). Primary "Save & next" and secondary "Save & pause". Skip needs a skip reason chip.
- **Next call:** a "Next: Ravi K. · Callback due 10:30" preview strip under the disposition bar. Auto-advance happens after Save, with a 3-second "Undo" toast.

**Case workspace: /dashboard/cases/[id]**
- **Header:** breadcrumb Cases › #1234. Title is the subject. Inline status chip, priority text (red only for Urgent) and SLA countdown (red only when breached). Actions: primary "Resolve"; secondary "Assign to me"; overflow menu with Reassign…, Pause SLA…, Merge, Close.
- **Left rail (single panel, dividers, no stacked cards):** Status and Priority selects (labelled, with Undo toast); Owner with Reassign; Queue; SLA (first response, resolution, paused state); Requester (name, contact, previous cases link); Related lead/opportunity links.
- **Main tabs:** Conversation (default) | Attachments (n) | History.
  - *Conversation:* timeline of comments and communications, with internal notes tinted and labelled. Composer at the bottom with a "Reply to requester" / "Internal note" toggle, macro picker with preview, attach button and a distinct send label ("Send reply" / "Add note").
  - *Attachments:* drop zone plus an accessible Upload button and file list.
  - *History:* assignment log plus field-change audit.
- **Right sidebar (collapsible, about 280px):** Suggested articles (clickable, with "Insert link") and the latest CSAT result.

### (c) Platform-admin information architecture
- **Top bar:** "Platform admin" wordmark, global tenant search (jump to a tenant), environment indicator, user menu (profile, "Open workspace", Sign out). Breadcrumbs on every page.
- **Left nav (grouped, compact 36–40px rows):**
  - **Overview:** Home (needs-attention list: pending publish reviews, write-permission requests, privileged requests, unreviewed impersonations, module problems, failed migrations; plus KPIs).
  - **Tenants:** All tenants (searchable DataTable linking to detail) · Module bundles (presets).
  - **Tenant detail /tenants/[id]?section=:** Overview · Modules & features (merged) · Users & impersonation · Usage & limits · Environment & maintenance · Demo data · Danger zone (Suspend, Delete).
  - **Marketplace:** Reviews (publish + permissions, with counts) · Apps (one row per app, installs drill-down) · Blocks · App health.
  - **Security & compliance:** Approvals (privileged actions: Pending / History tabs, plus the two-person-rule setting in a settings card with confirmation) · Impersonation sessions (Pending review / Reviewed, linked to audit) · Audit log · Data retention.
  - **System:** Module health · Schema status (diagnostics; developer copy shown only outside production).
- **Patterns:** every list uses DataTable with a one-row toolbar and URL-synced filters. Every destructive or privileged action goes through a ConfirmActionDialog with reason and impact. Section state lives in `?section=`, so deep links from Home and notifications open the right place.

### (d) Destructive and consequential actions, and how each is confirmed today
| Screen / action | Confirmation today |
|---|---|
| Approvals: Reject | `window.prompt` for the reason (optional) |
| Approvals: Approve (payouts, exports, campaigns…) | None |
| Exports: Reject export | `confirm()` |
| Exports: Approve sensitive export | None |
| Exports: Delete sensitive-field rule | None (immediate) |
| Cases detail: Status / Priority change | None (immediate PATCH, toast) |
| Cases detail: Apply macro (may send a reply) | None |
| Cases detail: Post public comment (Internal unticked) | None |
| Cases detail: Pause / Resume SLA | None |
| Cases detail: Reassign | StandardDialog with required reason |
| Call center: Claim queued call | None |
| Campaign dialer: Skip / Next (no disposition) | None |
| Log call outcome: Cancel with entered data | None |
| Call recordings: Play / Download | `confirm()` consent notice |
| Payouts: Generate invoice | None |
| Payouts: Raise dispute | StandardDialog (reason required) |
| Payouts: Request profile change | StandardDialog |
| My points: Redeem reward | None |
| Applications: discard numbering draft | `window.confirm` |
| Applications: save numbering rule (replaces scope rule) | None |
| Application workflow: Discard stage draft | `window.confirm` |
| Application workflow: Save stage change | Reason required (≥3 characters), no confirmation |
| Document actions: Discard document draft | `window.confirm` |
| Document actions: Reject document | Dialog (reason not enforced) |
| Catalog: Delete entity | `confirm()` "cannot be undone" |
| Platform tenants list: Suspend / Unsuspend | `confirm()`; reason hardcoded "Admin Action"; pending approval ignored |
| Tenant detail: Suspend | `confirm()` (no reason) |
| Tenant detail: Unsuspend | None |
| Tenant detail: Environment change | None (immediate) |
| Tenant detail: Feature flag toggle | None (immediate) |
| Tenant detail: Module status change | StandardDialog with impact preview and optional reason |
| Tenant detail: Approve / Decline module request | StandardDialog |
| Tenant detail: Impersonate user | StandardDialog with required reason |
| Tenant detail: Seed demo data | None |
| Tenant detail: Reset demo data | `confirm()` |
| Tenant detail: Save maintenance banner | None |
| Create tenant: Provision | Dialog submit only |
| Module bundles: Save (affects future tenants) | None |
| Module bundles: Cancel edits | None |
| Privileged actions: Two-person-rule switch on/off | None (immediate) |
| Privileged actions: Approve / Reject request | None |
| Privileged actions: Start impersonation | None |
| Impersonation review: Mark reviewed | StandardDialog (optional note) |
| Marketplace: Trust level change | None (inline select saves) |
| Marketplace: Block tenant | Two `window.prompt`s (type the tenant name, then the reason) |
| Marketplace: Unblock | None |
| Marketplace: Approve version (publishes cross-tenant) | None |
| Marketplace: Reject version | `window.prompt` reason, then `window.confirm` if blank |
| Marketplace: Approve / Reject write permissions | None |
| Marketplace: Unpublish app | `window.prompt` reason, then `window.confirm` if blank |
| Marketplace: Suspend app | `window.prompt` reason, then `window.confirm` if blank (no reinstate exists) |
| Marketplace: Rotate secret | `confirm()` |
| Unsubscribe: Channel / All | None (no undo or resubscribe) |

Key file paths (all under /Users/arjunh/Documents/crm/crm/src):
- app/dashboard/{cases,cases/[id],call-center,call-center/campaigns/[id],approvals,exports,payouts,leaderboard,my-points,applications,applications/[id],applications/numbering}/page.tsx
- app/platform-admin/{page,layout,tenants/page,tenants/[id]/page,tenants/create-tenant-dialog,marketplace/page,privileged-actions/page,impersonation-review/page,audit-logs/page,module-bundles/page,module-health/page,schema-status/page,retention/page}.tsx
- app/{login,reset-password,bootstrap,case-survey/[id],unsubscribe/[outboxId],f/[slug],public-form/[id]}/page.tsx and app/layout.tsx, app/page.tsx
- components/{telephony/*,applications/*,auth/*,cases/create-case-button,catalog/catalog-entity-manager,exports/queue-export-button}.tsx
- Supporting evidence: components/layout/NavigationDrawer.tsx:49-56,126,150; app/dashboard/settings/call-campaigns/page.tsx:145; components/bulk-actions/bulk-toolbar.tsx:118-122; app/dashboard/settings/catalog/page.tsx:43,70.

---

# P6 · Settings

## Settings UI/UX review (P6): every file in the inventory has been reviewed

I opened and read every file in `P6-settings.txt`, which covers about 15.2k lines. Paths are relative to `/Users/arjunh/Documents/crm/crm/`. Line numbers come from the current working tree.

**Re-exports (reviewed under P7).** These settings pages are one-line `export { default } from "../../admin/..."` files, so their target pages live in `src/app/dashboard/admin/*` and are reviewed under P7: `activity-types`, `assignment-rules`, `commission-rules`, `gamification`, `lead-scoring`, `next-best-action`, `opportunity-types`, `partners`, `partners/[id]`, `payout-cycles`, `roles`, `sales-groups`, `security`, `users`. `settings/pipelines/page.tsx` is a `redirect()` to `/dashboard/settings/opportunity-types`, yet `src/app/dashboard/admin/pipelines` still exists separately, which is a duplicate route.

**Pages under `/dashboard/admin` that settings doesn't link to:** `admin/custom-fields` (duplicates `settings/custom-fields`), `admin/pipelines`, `admin/plans`, `admin/rate-limits`, `admin/tenants`, `admin/usage`. Global search (`src/components/search/global-search.tsx:212`) sends "Security" to `/dashboard/admin/security`, not to `/dashboard/settings/security`.

**Dead code:**
- `src/app/dashboard/settings/permission-templates/create-template-dialog.tsx` is never imported, and its API call is mocked (`setTimeout`, lines 88-89).
- `src/components/roles/role-editor-dialog.tsx` is never imported. `permission-matrix.tsx` is used only by that dead file.

---

### src/app/dashboard/settings/layout.tsx — the settings shell
- **Elements:** a breadcrumb (always just "Settings"), a 2-column grid (224px sidebar plus content), and a `RoleGuard requiredRole="Tenant Admin"` around everything.
- Findings:
  - `[N1] [H]` The whole settings area is admin-only (line 8). Password, Two-factor, Active sessions, Appearance, My Workspace and My Activity all sit inside it, and no other route exists for them (only `settings/*` calls `/auth/change-password` and `/mfa/enroll`). **Non-admin users can't change their password, turn on MFA or sign out other devices.** → Split the area: `/settings/account/*` with no admin guard, and `/settings/*` for admins.
  - `[N1] [M]` The breadcrumb never shows the current page (line 10-12). → Show `Settings › <Group> › <Page>`, using the group from the nav config.
  - `[R2] [L]` The max-width is set here (1680px), and some child pages add their own container too (teams/[id], privileged-actions). → Let only the layout own width and padding.

### src/app/dashboard/settings/components/sidebar-nav.tsx — settings navigation
- **Elements:** a "Find a setting…" search box, 7 groups (Workspace, People & access, Sales configuration, Tasks & service, Finance & rewards, Integrations & data, Security) holding 38 links, and a native `<select>` with optgroups on screens below `xl`.
- Findings:
  - `[N1] [H]` 38 links in one flat list, with personal and admin pages mixed. The "Security" group holds personal pages (Active Sessions, Two-Factor, Password) next to admin pages (Security policy, Privileged Actions, Audit logs, GDPR) (lines 285, 189-213). → Use the IA in (b): a "My account" group pinned at the top and admin groups below.
  - `[N1] [H]` Duplicate or overlapping entries:
    - "Duplicate rules" (line 43) vs "Dedupe & Merge" (232).
    - "Roles & Permissions" (67) vs "Permission Templates" (205).
    - "Task SLA Policies" (117) vs the SLA tab in Service Desk.
    - "Security" (185) vs "Two-Factor Authentication" (195).
    → Merge them as described in (b).
  - `[N1] [M]` The array order doesn't match the rendered order: Duplicate rules, Audit logs and Data Privacy are declared first (lines 43-45) and only re-grouped by key. If a new item's key is missing from `groups`, it silently never renders. → Store the group on each item, and keep one ordered config.
  - `[N1] [M]` Search matches titles only (line 304), so "SMTP", "webhook", "SLA", "MFA", "SSO", "timezone" and "WhatsApp" find nothing. Results also link only to pages, not sections. → Add `keywords[]` and section-level entries, for example "Integrations › Messaging", deep-linked as `#messaging`.
  - `[C1] [M]` Labels use mixed case ("Duplicate rules", "Audit logs" next to "Payout Cycles", "Task SLA Policies") and jargon ("SCIM Provisioning", "Dedupe & Merge", "Next-Best-Action"). → Use sentence case and plain names ("User provisioning (SCIM)", "Merge duplicates", "Recommended actions").
  - `[R1] [L]` Icons repeat: Shield ×3, ShieldCheck ×3, Sparkles ×2, FileText ×2, KeyRound ×2. → Use one distinct icon per group, or icons on group headers only.
  - `[S1] [L]` `journeyOrchestrationEnabled` is computed and never used (line 252). Gated items vanish with no hint, so an admin can't discover modules they could request. → Show them disabled, linking to Modules ("Not included — request").
  - `[A2] [L]` The search input has no clear button or keyboard shortcut (line 301). → Add a "/" shortcut and an Esc-to-clear.

### src/app/dashboard/settings/page.tsx — "General Settings" (personal and organisation settings mixed)
- **Elements:**
  - Custom header with an icon tile and h1 "General Settings".
  - 5 tabs: Appearance, My Workspace, My Activity, Organization, Localization.
  - Appearance tab: section "Appearance" (Mode toggle, Color theme).
  - My Workspace tab, 4 sections:
    - "Navigation": Default landing page, Default table density, Pinned modules (16 checkboxes).
    - "Notification preferences": 10 checkboxes.
    - "Timezone & currency override".
    - "Reset" with a "Reset to Defaults" button.
  - My Activity tab: renders `MyActivityTab`.
  - Organization tab: "Company Name".
  - Localization tab: Timezone, Currency, Language, Date Format (disabled).
  - A global "Save Settings" button below the tabs.
- Findings:
  - `[F1] [H]` There are two save models on one page. My Workspace and Appearance save instantly (lines 102-123); Organization and Localization need the global "Save Settings" button (500-505). That button stays visible on the instant-save tabs too, and nothing marks unsaved changes. Switching tabs hides unsaved edits. → One save model per section: autosave with a "Saved" tick for personal preferences, and a sticky "Save changes / Discard" bar that appears only when the organisation form is dirty.
  - `[N1] [H]` Personal preferences (Appearance, My Workspace, My Activity) share a page with organisation-wide settings (Organization, Localization), and the page opens on "Appearance" (line 362). → Move the personal tabs to "My account › Preferences". "General" becomes "Workspace profile" (name, locale, currency).
  - `[N1] [M]` Tabs use `defaultValue` and never touch the URL (line 362), so you can't link to "Localization". → Sync tabs to the URL (`?tab=` or a sub-route).
  - `[R3] [M]` Section labels are uppercase `text-xs font-bold tracking-wide text-muted-foreground/60` (lines 159, 215, 228, 282, 381, 399, 417), at low contrast. → Use sentence-case `text-sm font-semibold` section headings (h2).
  - `[R5] [M]` The header is custom (icon tile, `text-xl font-extrabold`, lines 352-357) and doesn't use `PageHeader` like the other pages. → Use `PageHeader`.
  - `[A1] [M]` Labels have no `htmlFor` on Selects (162, 181, 201, 232, 257, 386, 390, 422, 445, 464, 480), and the Mode/Color theme groups have no group name. → Pass an `id` to each `SelectTrigger`, and put radio groups in a `fieldset`/`legend`.
  - `[F1] [M]` The timezone list has only 8 hard-coded zones (lines 245-252, 432-439), and Date Format is a disabled select with one option (480-493). → Use a searchable IANA timezone combobox, and turn the date format into read-only text.
  - `[C1] [L]` Reset help text uses developer phrasing ("split/full layout choice --", line 284), and the confirm is `window.confirm` (132). → Use a plain sentence and the standard confirmation dialog.
  - `[S1] [L]` A load failure only shows a toast, then the defaults (INR, Kolkata) appear as if they were real values (321-323). → Show an inline error with Retry, and disable the form.

### src/components/settings/color-theme-picker.tsx — color theme cards
- **Elements:** a 4-column grid of theme cards (swatches, label, description, check mark).
- Findings:
  - `[A2] [L]` These are toggle buttons with `aria-pressed` (line 31), but the choice is single-select. → Use `role="radiogroup"` with `role="radio"` and arrow-key navigation.
  - `[R3] [L]` `font-bold` on the label (line 50). → Use `font-medium`.

### src/components/settings/mode-toggle.tsx — Light/Dark/System toggle
- **Elements:** a 3-button segmented control.
- Findings:
  - `[A2] [L]` It's single-select but built from `aria-pressed` buttons (line 28). → Use ToggleGroup `type="single"` (a radio group).

### src/components/settings/my-activity-tab.tsx — "My Activity" (today's audit entries)
- **Elements:** a "Today's activity (N)" section of per-entity count badges, and a "Timeline" list (action badge, entity, impersonation badge, relative time).
- Findings:
  - `[R3] [H]` Badge text is too small: `text-[0.65rem]` (about 10.4px, line 93) and `text-[0.6rem]` (about 9.6px, line 98), the latter on the security-relevant "Performed by an admin impersonating you" notice. → Minimum 12px. Make the impersonation notice an amber inline row with an icon.
  - `[R8] [H]` Raw uppercase action enums are shown (`log.action`, lines 93-95). → Map them to verbs ("Updated", "Exported") and form a sentence: "You updated Lead · 10:42".
  - `[R4] [M]` Per-entity counts are badges (lines 79-83). → Use plain text ("Leads 4 · Tasks 2").
  - `[R3] [L]` Uppercase section labels (lines 75, 88).
  - `[S1] [L]` Today only, with no date picker or paging. → Add a "Today / 7 days" switch and a link to Audit logs filtered to "me".

### src/app/dashboard/settings/integrations/page.tsx — Integrations (2,706 lines)
- **Elements:**
  - `PageHeader` "Integrations", and `SettingsSections` (pill buttons; a select on narrow screens) with numeric ids "0"–"6".
  - **Outbound Webhooks:** "Webhook Subscriptions" plus "Add Webhook". Each row: status icon, name, URL, event badges, rate badge, and Pause/Resume, Test, Deliveries, delete (icon).
  - **Inbound Capture:**
    - Card "Lead Capture Webhook": endpoint ApiBox, a signing-instructions Alert, "Signing secret" (show/copy/"Rotate Secret").
    - Card "Test Payload Console": textarea plus "Send Test Payload".
    - Card "Recent Events": table with Time, Status, Detail, Retry.
  - **CSV Imports:** "Recent Imports" plus "Import CSV". Table columns: Module, Status, Created, Updated, Skipped, Failed, Errors, plus Approve/Reject/Cancel.
  - **Telephony:**
    - A native "Telephony section" `<select>` with 12 sub-sections: Virtual Numbers, Call Route API, Agent Popup API, Call Log API, Click 2 Call, Call Disposition, Agent Panel, Team Assignment, User-Agent Mapping, Call Status Mapping, Compliance & Consent, Queue Routing.
    - Header "Universal Telephony Connector" with an "Enabled" switch, and a "Save Telephony" button.
    - Accordion "Click-to-call test" (Phone Number, Lead ID, "Generate Payload").
    - Card "Recent Call Logs": table with Direction, From, To, Status, Duration, Started.
  - **Messaging:**
    - Channel buttons: Email, WhatsApp, SMS.
    - Card "{CHANNEL} Provider": Connector Name, Provider Type, Default From Name, From Email/Sender, Rate Limit/Minute, Connector enabled, Public Config JSON, Secret Config JSON, "Save Connector".
    - Card "Saved Connectors" (a list).
    - Card "{CHANNEL} Template": Template Name, Category, Subject, Message Body, token badges, "Save Template".
    - Card "Recent Deliveries": table with Channel, Recipient, Status.
  - **External Push:**
    - A plaintext-secrets Alert.
    - Card "New/Edit Integration": Integration Name, Target System, Endpoint URL, HTTP Method, Auth Type, conditional credential fields, Payload Template (JSON), "Integration enabled", New/Create/Update.
    - Card "Configured Integrations": edit and delete icons.
  - **Health:** "Connector Health" with "Refresh" and a list of checks (icon, label, detail, ms, status badge).
  - **Dialogs:**
    - "Add Webhook Subscription": Name, URL, Secret, a 20-item Events checkbox list, Rate Limit.
    - "Deliveries -- {name}": table with Time, Event, Status, Attempts, HTTP, Error.
    - "Import CSV": Load saved mapping (plus delete), Module, Duplicates, Choose CSV, Template, a mapping table (CSV Column, CRM Field, Sample Value), a preview Alert, "Save this mapping as a reusable template", and Cancel/Preview/Run Import.
- Findings:
  - `[N1] [H]` One URL holds 7 unrelated products (webhooks, lead capture, CSV import, telephony, messaging, external push, health), and Telephony nests 12 more sub-sections in a native select (lines 1386-1403), so there are tabs inside tabs. → Split into pages: `/settings/integrations` (a directory of connector cards with status), `/settings/integrations/webhooks`, `/settings/data/import`, `/settings/channels/telephony/*` (a left list of sub-sections, each its own URL), `/settings/channels/messaging`, `/settings/integrations/external-push`.
  - `[N1] [H]` Section ids are "0"…"6" and aren't stored in the URL (lines 1140-2350; `src/components/layout/settings-sections.tsx` uses `useState` only), so nothing can be deep-linked or bookmarked, including from Service Desk's "Settings > Integrations" pointer. → Use slug ids (`webhooks`, `inbound`, `import`, `telephony`, `messaging`, `push`, `health`) kept in sync with the URL hash or search params.
  - `[F1] [H]` A single "Save Telephony" button (line 1828) saves all 12 sub-sections, which are each shown separately. Nothing marks unsaved changes, and switching sub-sections hides edits. → Save per sub-section, plus a dirty indicator and a guard before leaving.
  - `[E1] [H]` Raw JSON editors with no validation feedback:
    - "Mappings JSON" for user↔agent mapping (1672-1679); invalid JSON is silently stored in `userAgentMappingsRaw` and never saved.
    - "Public Config JSON" and "Secret Config JSON" (1982-1993), which hold SMTP host, port and password.
    - "Payload Template (JSON)" (2285-2290).
    → Use structured forms (SMTP host, port, TLS, username, password), a user→agent mapping table with a user picker, and a code editor with inline JSON errors and a token picker.
  - `[C1] [H]` The inbound endpoint shows a literal `/api/integrations/inbound/leads/YOUR_TENANT_ID` (line 1210). The admin can't copy a working URL. → Fill in the real tenant ID and the absolute origin.
  - `[C1] [H]` The External Push alert says secrets "are stored in plaintext -- there is no secret encryption anywhere in this app" (2157-2158), shown as a blue info alert. → Fix the storage. Until then, show it as a destructive warning; don't present it as routine info.
  - `[A1] [H]` Icon-only buttons have no accessible name:
    - ApiBox copy (346).
    - Webhook delete (1191).
    - Show/hide secret, which uses Ban and CheckCircle icons as an "eye" (1232, 1460).
    - Copy secret (1235, 1463).
    - Do-not-call remove (1761).
    - Edit/delete integration (2336, 2339).
    - Delete import template (2578).
    → Add `aria-label`s, and use the Eye/EyeOff icons for show/hide.
  - `[A1] [M]` Switches and checkboxes sit next to `<Label>` with no association: "Enabled" (1414-1418), the agent-popup checkboxes (1502-1520), team assignment (1656-1660), quiet hours (1704-1708), "Connector enabled" (1973-1977), "Integration enabled" (2294-2298). "Default Call Queue Team" is a native select with an unlinked Label (1807-1812). The test payload textarea has no label (1259). → Add `id`/`htmlFor`, or wrap them in a `<label>`.
  - `[R8] [H]` Raw enums are shown to admins:
    - Webhook events `LEAD_CREATED`… as badges and as checkbox labels (1173-1175, 2470-2480).
    - Inbound status (1304), call direction and status (1889, 1892), `{provider.channel} / {provider.providerType}` (2036).
    - "EMAIL Provider" and "EMAIL Template" card titles (1929, 2053).
    - Outbox channel and status (2130, 2134).
    - Health `not configured` via a single `replace('_')` (2406).
    → Map to labels ("Lead created", "Inbound", "Email"), and group events by object in the picker.
  - `[R8] [M]` The click-to-call test asks for a raw "Lead ID" (1850-1855), and inbound events show `Lead ${leadId}` (1307). → Use a lead search picker, and link to the lead.
  - `[R4] [M]` Rate limit shown as a badge (`60/min`, line 1176), and every subscribed event becomes a badge, so rows get long. → Show "Events: Lead created +4" as text with a popover, and the rate as muted text.
  - `[R7] [M]` Status colors: green/grey icons per webhook (1164-1168), emerald for "OK", and Messaging channel buttons use the filled primary variant as a segmented control (1913-1921). → Keep color for failing/paused only, and use a neutral segmented control (Tabs).
  - `[R9] [M]` Each webhook row has 4 visible actions (Pause, Test, Deliveries, Delete) (1180-1194). → Put "Test" and "Deliveries" inline, and Pause and Delete in an overflow menu.
  - `[F2] [M]` Destructive or irreversible actions use `window.confirm` or no confirmation at all:
    - `window.confirm`: delete webhook (719), reject import (893), rotate secrets (658, 933), delete integration (1099).
    - No confirmation: delete import template (864), remove do-not-call number (975), cancel import (874), approve an overwriting import (884).
    → Use the standard ConfirmDialog, with a destructive button that names the object.
  - `[F1] [M]` "Add Webhook" has no validation; empty name/URL and zero events go straight to the API and fail with a toast (703-716). CSV required-field checks also only toast (801). → Inline errors, a disabled submit until valid, and `*` markers on required labels.
  - `[S1] [M]` Inbound Capture loads only after its pill is clicked (line 1138), and Health likewise (1137). Health's empty state says "Click Refresh". → Load sections lazily on visit including the first, and run the health check automatically.
  - `[C1] [M]` Quiet hours are "server local time" (1712). → Use the workspace timezone and print it ("9 PM–9 AM IST").
  - `[C1] [M]` The "Call Route API" and "Agent Popup API" panels show the same URL (1494, 1500). One is a copy bug, or the labels are wrong. → Verify, and give each section a one-line purpose.
  - `[C1] [L]` "Click 2 Call", "iFrame Permissions", "Mail-merge tokens like @AgentNumberWithoutCC" (1394, 1646, 1544). → Use plain labels with a token reference popover.
  - `[R3] [L]` Mixed date formatting: `new Date().toLocaleString()` (1241, 1302, 1469, 2356, 2528) next to `formatWorkspaceDateTime` (1758, 1894). → Always use the workspace formatter.
  - `[T1] [M]` The Recent Imports table has 8 columns of bare counts with no total, created time or "by" (1338-1380), and Outbox is silently truncated to 8 rows (2128). → Add Created at, By, Total, and a "View all" link.
  - `[M1] [L]` "Deliveries --" uses a double hyphen in its title (2503), as do many copy strings. → Use an em dash or a middle dot.

### src/app/dashboard/settings/marketplace/page.tsx — Marketplace (1,865 lines)
- **Elements:**
  - `PageHeader` with "Register App". Tabs: My Apps, Requests (count badge), Catalog.
  - **My Apps:** each row has name, install-status badge, category badge, publish badge, deprecated badge, permission text, and a `<details>` "App actions" holding up to 13 buttons: Test, Health, Deliveries, Contract, Versions, Deprecate/Undeprecate, Actions, Reports, Sync, Request Publish, Rotate Secret, Suspend/Reinstate, Uninstall.
  - **Requests:** permission-increase rows (Reject / Approve Change), and install requests (Check Compatibility, Review, Reject, Approve & Install).
  - **Catalog:** rows with Request Install.
  - **11 dialogs:**
    - Register App: Name, Category, Description, Webhook URL, Redirect URLs, Required Contract Version, Depends On App IDs, Required CRM Modules, Event Subscriptions (20), Requested Module Permissions (10, each with Read/Write).
    - App Actions: list plus an Add Action builder (key, name, description, input fields).
    - App Reports: list plus an Add Report builder (key, name, TTL, columns).
    - Report Data: Refresh Now.
    - App Credentials.
    - Health & Usage: Daily Delivery Limit, Inbound API Rate Limit, Usage.
    - Connector Contract: JSON.
    - Version History: Roll back.
    - Sync Settings: Direction, Conflict, Cadence, Default Owner, Notify, Enabled Modules, Field Mappings, Sync Now, Dry Run, Recent Runs.
    - Deliveries: Export CSV, Support Bundle, Replay.
    - Test Event.
- Findings:
  - `[R9] [H]` Up to 13 equal-weight outline buttons are hidden in a `<details>` per row (888-965), and every app management task opens a separate modal. → Give each app a detail page `/settings/marketplace/apps/[id]` with tabs (Overview, Health & usage, Deliveries, Sync, Actions, Reports, Versions, Credentials). Rows keep 1 primary action plus a menu.
  - `[F1] [H]` `window.prompt` is used for the deprecation message (501) and for the security review comment (663); the review step is required before approval. → Use proper dialogs with labelled textareas.
  - `[F1] [H]` Sync Settings mixes save models. Selects and checkboxes save on change, cadence and owner save on blur (`defaultValue` plus `onBlur`, 1650-1664), and field mappings need "Save Mappings" (1733). Nothing confirms a change except a toast. → Use one form with Save/Discard.
  - `[R8] [H]` Admins must type raw identifiers: "Depends On App IDs (one per line)" (1171), "Required CRM Modules (one key per line)" with a placeholder of `SERVICE_DESK` (1181-1186), and "Default Owner (user ID, optional)" (1659). CRM fields in mappings are raw keys (`leadId`, `opportunityTypeId`, `ownerId`, 122-125, 1715). → Use an app multi-select, a module multi-select, a user picker, and labelled fields.
  - `[R8] [M]` Raw enums appear in badges and selects: `NO INSTALL`, `PENDING_APPROVAL`, `PUBLISHED`, `CUSTOM` (862-867), `CATEGORIES` shown verbatim (1143), event names (1198), module keys (1212), `leads (read)` permission strings (884, 1022), health `OK`/`DEGRADED` (1485), `SUCCESS`/`FAILED` (1753). → Map them to labels.
  - `[R4] [M]` Up to 4 badges sit next to an app name (install status, category, publish status, deprecated, 862-873). → One status badge; category as muted text.
  - `[F2] [H]` These run with no confirmation: Suspend (941), Reject install (1055), Reject permission change (994), Rotate secret (396, 935), delete Action (730/1268), delete Report (778/1348). Uninstall, rollback and publish use `window.confirm` (644, 485, 323). → Use ConfirmDialog. Uninstall also needs typed confirmation, since it "cannot be undone".
  - `[A1] [H]` Icon-only buttons have no names: delete action/report (1268, 1348), copy secret (1453, 1462). Every scope `SelectTrigger` gets the same `id="marketplace-requested-module-permissions-1"` (1221), which duplicates the id and points the label at the wrong control. Add-Action/Report inputs and the mapping rows have no labels (1281-1305, 1362-1372, 1712-1724). → Give each control a unique id and an aria-label.
  - `[R3] [M]` The "Sensitive" badge is `text-[0.65rem]` (1214), and a ⚠ glyph is the only sensitivity cue in the request text (989). → 12px minimum, an icon with text "Sensitive: write access".
  - `[E1] [M]` Connector Contract and Dry Run show raw JSON `<pre>` (1565, 1743). → Use a readable summary with a "View JSON" toggle.
  - `[S1] [M]` Loading is the bare text "Loading..." everywhere (851, 1072, 1256, …), and per-dialog load errors only toast. → Use skeletons and an inline ErrorState.
  - `[N1] [M]` Tabs aren't stored in the URL (837). The disabled-module branch draws its own h1 (819). → Use URL tabs, plus the shared ModuleGate and header.
  - `[R2] [L]` Health grid classes conflict (`grid-cols-1 sm:grid-cols-2 gap-3 sm:grid-cols-4`, line 1482).
  - `[C1] [M]` "Connector contract", "contract v1.0", "Request Publish", "Undeprecate" are unexplained. → Add a short helper line per concept, and rename to "Retire app" / "Restore app".

### src/app/dashboard/settings/service-desk/page.tsx — Service Desk configuration
- **Elements:** `PageHeader`, and `SettingsSections` with 8 sections:
  - Types (rows plus an add input).
  - Statuses (name, category select, Add, "Make default").
  - Priorities (name, level, Add).
  - Queues (cards, each with a member checkbox grid of all users).
  - SLA Policies (name, type, priority, first response, resolution minutes).
  - Macros (name, channel, template textarea, approval checkbox).
  - Knowledge Base (title, body, Activate/Deactivate).
  - Inbound Addresses (channel, address).
- Findings:
  - `[F2] [H]` Every delete (type, status, priority, queue, SLA, macro, address) fires immediately, with no confirmation and no undo (52-59, 104-111, 175-182, 228-235, 327-334, 418-425, 550-557). → ConfirmDialog, or an undo toast.
  - `[F1] [H]` Nothing can be edited, only added or deleted. There's no rename, no level change, no SLA edit, no macro edit, and no KB article edit; KB "edit" means re-adding with the same title. → Inline edit per row, or an edit drawer.
  - `[A1] [M]` Missing labels: priority "Level" input (197), category select (140-145), SLA type/priority selects (356-369), raw `<textarea>` for macro and KB bodies (454, 521), and "Make default" as a bare `<button>` (134). The SLA minute fields use Labels with no `htmlFor` (372-377). The inbound address aria-label is the placeholder text (583). → Add proper labels.
  - `[R8] [M]` `OPEN`/`PENDING`/`RESOLVED`/`CLOSED` appear in the select and badge (143, 129), the `EMAIL` channel badge (571), and `article.visibility` raw (513). → Use labels.
  - `[C1] [M]` SLA times are bare minutes ("Resolution 1440m", 349-350). → Use a duration input (hours/days) and display "1 day".
  - `[S1] [M]` No empty states; an empty list shows only the add form. → "No case types yet — add your first."
  - `[R10] [M]` The queue members grid lists every user as checkboxes per queue (262-271), and each click saves immediately. → Use a member multi-select (combobox with chips) and an explicit Save.
  - `[N1] [M]` Case SLA policies duplicate the "Task SLA Policies" concept, and Macros overlap messaging templates. The 8 sections aren't stored in the URL. → Group under "Service › Cases" with URL sections, and cross-link SLA pages.
  - `[R3] [L]` Helper text is `text-xs` (340, 431, 508, 563), and the inbound pointer reads "Settings > Integrations" as text, not a link (565). → Make it a link to `/settings/integrations/inbound`.

### src/app/dashboard/settings/ai-assistant/page.tsx — AI Assistant
- **Elements:** custom h1. Tabs: Provider & Guardrails, Prompt Templates, Usage & Cost.
  - Provider & Guardrails: Enable switch, Provider mode, Model name, Endpoint URL, API key, Max tokens, Timeout (ms), Daily and Monthly spend limits, Allowed modules (clickable badges), second-approval switch, Test connection, Save settings.
  - Prompt Templates: "New / edit template" (key, display name, template textarea, Save as new version), a list with Active badge and switch.
  - Usage & Cost: 4 KPI cards, a budget alert, By module, Recent requests.
- Findings:
  - `[S1] [H]` The load-error branch is inside `saveSettings` (line 70), so it can never render. When loading fails, the page stays on "Loading..." forever (121). → Render `<ErrorState onRetry>` when `loadError` is set.
  - `[A2] [H]` "Allowed modules" are `<Badge onClick>` (214-231): not focusable, no role, no pressed state. → Use checkboxes or a ToggleGroup with labels. Also, the label's `htmlFor="ai-field-9"` (212) points at the template key input on another tab (278).
  - `[A1] [M]` Template editor inputs and textarea have no labels (278-281). Enable and approval switches aren't tied to their text (150, 240). → Add labels.
  - `[R8] [M]` Modules appear as `LEAD`/`OPPORTUNITY`/`REPORTS` (214, 328, 339), status as `SUCCESS` (340). → Use labels.
  - `[R4] [L]` A template row shows both an "Active" badge and a switch (297-298). → Keep the switch only.
  - `[F1] [M]` Number fields fall back with `|| 1024` and `|| 30000`, so they can't be cleared and invalid values are swallowed (187, 191). Timeout is in ms. → Validate inline, and use seconds.
  - `[R5] [L]` Custom h1 with `text-xs` description (126-133). → Use `PageHeader`.
  - `[E1] [M]` There's no way to edit an existing template (the button says "New / edit" but opens blank), and there's no version history or diff. → Add Edit to load a row, and a version list.

### src/app/dashboard/settings/api-keys/page.tsx — API Keys
- **Elements:**
  - `PageHeader` with "New API Key", and a key list (name, Active/Revoked/Expired badges, id, scopes, rate, IP, last used, expiry, Rotate, Revoke).
  - Dialogs: New API Key (Name, Module Access ×3, IP Allowlist, Rate Limit, Expires), API Key Secret (Key ID, Secret, Example request), Revoke API Key (proper confirmation).
- Findings:
  - `[F2] [M]` Rotate runs immediately with no confirmation (227). → Confirm first: "A new secret is issued; the old one works for 24h."
  - `[R7] [L]` "Active" gets an outline badge (203). → Show a badge only for Revoked or Expired.
  - `[T1] [M]` Revoked keys stay mixed in with active ones, with disabled buttons and no filter or sort (198-243). → Default the filter to Active, and use a table with sortable "Last used".
  - `[C1] [M]` "Users (SCIM provisioning)" scope (40). Disabled-state copy says "Ask a platform admin" (178), while SCIM says to enable it in Settings > General. → Use consistent wording.
  - `[R8] [L]` The raw key id is shown on every row (208). → Show a truncated prefix with copy.
  - (Positive: inline errors, a revoke dialog, aria-labels on copy buttons. Use this as a reference pattern.)

### src/app/dashboard/settings/mfa/page.tsx — Two-Factor Authentication (personal)
- **Elements:**
  - Status card (Enabled / Not Enabled) with Regenerate Backup Codes, Disable, or Enable.
  - Card "Remembered Devices" with Remove.
  - Dialogs: Enable 2FA (QR code, manual key, 6-digit code, Verify & Enable, then backup codes with Copy/Done), the code-prompt dialog for Disable and Regenerate, and "New backup codes".
- Findings:
  - `[N1] [H]` Admin-only because of the layout guard (see layout). → Move to "My account › Security".
  - `[F2] [L]` Remove trusted device has no confirmation (337). The code-prompt "Regenerate" uses the destructive variant (212). → Undo toast; neutral variant for Regenerate.
  - `[F1] [L]` Backup codes can only be copied, not downloaded or printed (151). Closing the dialog loses them (348). → Add "Download .txt" and an "I saved these" checkbox before Done.
  - `[A1] [L]` A `<Label>` wraps non-form text ("Can't scan?", line 111). → Use `<p>`.

### src/app/dashboard/settings/sessions/page.tsx — Active Sessions (personal)
- **Elements:** `PageHeader` with "Log Out Other Devices", and a session list (device, "This device" badge, IP, signed-in, last active, Log Out/Revoke).
- Findings:
  - `[N1] [H]` Admin-gated, same as MFA.
  - `[F2] [M]` `window.confirm` for logging out the current session and all others (53, 71). → ConfirmDialog.
  - `[C1] [L]` The button says "Log Out" on the current row and "Revoke" elsewhere (119), and `describeDevice` (24-32) is duplicated in `mfa/page.tsx` (21-29), giving only "Chrome"/"Safari" with no OS. → Use one shared util that includes OS ("Chrome on macOS"), and the label "Sign out".
  - `[R7] [L]` The emerald "This device" badge (107). → Neutral badge.

### src/app/dashboard/settings/password/page.tsx — Password (personal)
- **Elements:** a Card "Change Password" with Current, New and Confirm fields and a "Change Password" button.
- Findings:
  - `[N1] [H]` Admin-gated, same as MFA.
  - `[F1] [M]` The policy isn't shown ("must meet your workspace's password policy", line 52), there's no strength meter or show/hide toggle, and the mismatch error appears only on submit (24-27). → Show live requirement checks and an inline mismatch error.
  - `[R2] [L]` A card inside the page for a single form. → Use a plain form section.

### src/app/dashboard/settings/scim/page.tsx — SCIM Provisioning
- **Elements:** `PageHeader` with Refresh, endpoint text, a "no SSO" info alert, a card "Default Role for New SCIM Users" (select, saves on change), a card "Reconciliation -- SCIM-Provisioned Users", and a card "Sync Activity Log".
- Findings:
  - `[C1] [H]` The disabled state tells admins to "enable API access first (Settings > General)" (102), but General has no such control; it's a platform-admin feature. → Fix the copy and link to Modules/request.
  - `[C1] [M]` "SCIM", "external id" and "reconciliation" are unexplained, and the endpoint is shown as the relative `/api/scim/v2` (113). → Lead with one sentence ("Automatically create and deactivate users from Okta, Azure AD…"), and give the absolute URL with copy.
  - `[R8] [M]` Raw `row.status`, `resourceType` and `SUCCESS`/`ERROR` (156, 184, 188). → Use labels.
  - `[R2] [L]` 3 stacked cards. → One page with sections.
  - `[N1] [M]` Belongs with Users / identity, not "Integrations & data". → Move to "Users & access › Provisioning".

### src/app/dashboard/settings/call-campaigns/page.tsx — Call Campaigns
- **Elements:**
  - `PageHeader` with "Add Campaign". Campaign cards: name, status badge, completion count, Activate/Pause, Add Audience, Work Campaign, edit icon, delete icon, member-status badges, Analytics link.
  - Dialog "Add/Edit Call Campaign": Name, Description, Module, Audience Source, List / Saved View / Record Ids, Call Script, Disposition Set, Assigned Team, Max Attempts, Retry Delay.
- Findings:
  - `[A1] [H]` Every dialog `<Label>` lacks `htmlFor`, and the native `<select>`s and inputs are unlabelled (287-394). Edit and delete icon buttons have no names (149-154). → Associate labels and add aria-labels.
  - `[R8] [H]` "Record Ids (one per line)" for manual audiences (346-347), and raw `DRAFT`/`ACTIVE` and member statuses (125, 159-163). → Use a record search multi-picker, and label the statuses.
  - `[C1] [M]` The header promises "calling windows" (101), but no calling-window field exists. The dialog says "Disposition Set" while the dispositions page says "Disposition group" (364). → Align the copy and naming.
  - `[F2] [M]` Activate starts calling with no confirmation; delete uses `window.confirm` (89). → Confirm Activate with an audience count; use ConfirmDialog for delete.
  - `[M1] [L]` Native selects are mixed with Radix selects across settings. → Use the shared Select.
  - `[R9] [M]` 5 to 6 controls per card. → Put the primary state action plus "Work campaign" inline, and the rest in a menu.

### src/app/dashboard/settings/call-campaigns/[id]/analytics/page.tsx — Campaign analytics
- **Elements:** h1 "Campaign Outcome Analytics", 4 KPI cards, "Members by Status" badges, "Disposition Breakdown".
- Findings:
  - `[N1] [M]` No campaign name, no back link and no `PageHeader` (40-43). → "‹ Call campaigns / {name} › Analytics".
  - `[S1] [M]` A load error shows as "No analytics available" (31, 36). → ErrorState with Retry.
  - `[R8] [L]` Raw statuses (67-71).

### src/app/dashboard/settings/call-dispositions/page.tsx — Call Dispositions
- **Elements:**
  - `PageHeader` with "Add Group". Collapsible group cards with up/down/add-outcome/edit/delete icons, and outcome rows with up/down/edit/delete.
  - Dialogs: Group (Name, Active) and Outcome (Name, Parent Outcome, Required fields ×5, Active).
- Findings:
  - `[E1] [H]` Sub-outcomes can be created (Parent Outcome, 401-418) but are never rendered: only `topLevelOutcomes` show (154, 193). The group count includes them (167). → Render nested outcomes indented under their parent.
  - `[A1] [H]` 5 icon-only buttons per group and 4 per outcome have no names (170-184, 205-230). The expand button has no `aria-expanded` (158). Switch/Label pairs aren't associated (329-330, 432-433). → Fix all three.
  - `[R8] [M]` Required fields are listed as raw keys ("requires: reasonLost, callbackAt", line 200). → Use the labels from `REQUIRABLE_FIELDS`.
  - `[F2] [M]` `window.confirm` for deleting groups and outcomes (73, 84).
  - `[S1] [L]` Groups are collapsed by default, which hides the content. → Expand the first group, or all if there are 3 or fewer.

### src/app/dashboard/settings/call-scripts/page.tsx — Call Scripts & Guidance
- **Elements:**
  - `PageHeader` with "Add Script". Script cards with history/edit/delete icons.
  - Script dialog: Name, Match Conditions builder, Script Content, Objection Handling rows, Required Compliance Lines, Active.
  - Version History dialog.
- Findings:
  - `[R8] [H]` Condition fields "Opportunity Stage Id" and "Opportunity Type (Course)" are free-text ID inputs (44-45), and the score band options are raw `HOT`/`WARM` (46). → Use selects loaded from stages and types, with labelled bands.
  - `[A1] [H]` Icon-only history/edit/delete (130-138) and remove-row buttons (290, 309) have no names. Objection and compliance inputs are unlabelled (287-289, 308). The Active switch isn't associated (317-318).
  - `[E1] [M]` Version history lists full content with no diff or restore (161-178). → Add diff against current and "Restore this version".
  - `[F2] [M]` `window.confirm` for delete (80).
  - `[C1] [L]` The page title "Call Scripts & Guidance" differs from the nav label "Call Scripts". → Use one name.

### src/app/dashboard/settings/agent-availability/page.tsx — Agent Availability
- **Elements:** `PageHeader`, and per-agent rows with Status select, Working Hours (switch, start, end, In/Outside-hours badge), Daily Call Cap (input, "N today" badge), Max Simultaneous Assignments (input, "N open" badge).
- Findings:
  - `[T1] [M]` A wrapped flex row per agent with 6 controls (88-181), and no search, sort or team filter. → Use a table (Agent, Status, Hours, Call cap, Assignment cap) with a team filter, and sticky headers.
  - `[F1] [M]` Every blur or change saves and toasts "Availability updated" (61-69), so editing one row fires 5 toasts. There's no undo and no validation (the cap is sent as a string, 160). → Save per row with a quiet "Saved" tick, and validate numbers.
  - `[R4] [L]` Counts shown as badges ("12 today", "3 open", 162, 178). → Plain text, red only when over the cap.
  - `[N1] [L]` Agent status is operational, not configuration. → Keep the caps and hours in settings, and move live status to Call Center.

### src/app/dashboard/settings/catalog/page.tsx — Product Catalog (education hierarchy)
- **Elements:** `PageHeader`, a Universities card (entity manager), a selected-university card (Campuses, Programs), and a selected-program card with 7 tabs (Courses, Intakes, Fee Plans, Scholarships, Eligibility, Stages, Document Checklist).
- Findings:
  - `[R2] [M]` Up to 3 stacked cards, the last holding 7 tabs (39-232). → Use a master-detail layout: a tree or list on the left (University ▸ Program) and a detail panel with tabs.
  - `[N1] [M]` The selection isn't stored in the URL and there's no breadcrumb for the drill-down (32-33). → Use `/settings/catalog/[universityId]/programs/[programId]?tab=intakes`.
  - `[R3] [M]` Uppercase micro-labels act as section titles (63, 102). → Use h2 sentence case.
  - `[E1] [L]` Stage "Color" is a hex text field (207). → Use a color swatch picker. The "Won stage (does not create enrollment)" copy is confusing (209).

### src/app/dashboard/settings/custom-fields/page.tsx — Custom Fields
- **Elements:** `PageHeader` with "Add Field" (dialog), tabs Leads/Opportunities/Activities, and a table (Label with System badge, Key, Type, Required, Actions with delete).
- Findings:
  - `[N1] [H]` There are 3 custom-field UIs: this page, `/dashboard/admin/custom-fields` (its own page plus `custom-field-dialog.tsx`), and `CustomFieldManager` per opportunity/activity type. → Use one "Fields" page per object, with "applies to all / specific types" scoping.
  - `[T1] [H]` No editing (label, required, options) and no reordering; only delete (117-127). → Add row click to edit, and drag to reorder.
  - `[R3] [H]` The "System" badge is `text-[10px]` (97).
  - `[R8] [M]` Type shown as `TEXT`/`MULTI_SELECT` (105). The dialog subtitle is "Define a new field for LEAD" (`create-custom-field-dialog.tsx:105`), and the Type select lists raw enums (166). → Use labels.
  - `[R7] [L]` "Required" is a destructive red badge (109), and the header row is `bg-primary/5` (75). → Neutral text "Required"; neutral header.
  - `[C1] [M]` The delete confirm says "Are you sure? This will not delete existing data but will hide the field" (50), but the toast says "Field deleted". → "Hide field 'Budget'? Existing values are kept and can be restored."

### src/app/dashboard/settings/custom-fields/create-custom-field-dialog.tsx — Add Custom Field dialog
- **Elements:** Label, Key (auto from label), Type, Options (comma separated), Required checkbox, Save.
- Findings:
  - `[A1] [M]` Type has no `htmlFor` (159). The key error replaces the helper text in muted color, so it isn't styled as an error (147-149).
  - `[F1] [M]` No required markers. Options are comma-separated (so an option can't contain a comma), with no preview. → Use one option per row with add/remove.

### src/app/dashboard/settings/dedupe/page.tsx — "Dedupe & Merge Center"
- **Elements:** h1, tabs Leads/Opportunities/Cases. Each tab has "Match Rules" (switches, fuzzy threshold, Run Scan), match cards (survivor radio group, "Not a duplicate", Merge), and a collapsible "Merge History" (Undo).
- Findings:
  - `[N1] [H]` Overlaps with "Duplicate rules" (prevention at save time), and a different rule model runs here (scan-time). → Merge into one "Duplicates" page with tabs: Prevention rules | Review queue | Merge history.
  - `[R8] [H]` Merge history shows ID fragments ("Survivor 3fa2b1c0 -- absorbed 9d…", line 270). → Show record names linking to the records.
  - `[A1] [H]` Rule switches have no labels (195). The threshold label isn't associated (182-191).
  - `[F2] [M]` Merge and Undo merge run without confirmation (138-160). → Confirm the merge with a field-by-field preview of the surviving values.
  - `[C1] [M]` "Dedupe", and the threshold entered as 0.5–1 (184-188). The description says "Leads and Opportunities", but there's a Cases tab (294). → Plain naming and a percentage slider.
  - `[S1] [M]` Load errors only toast (88), which then reads as "No pending duplicates". → ErrorState.
  - `[R5] [L]` Custom h1 (292). → Use `PageHeader`.

### src/app/dashboard/settings/duplicate-rules/page.tsx — Duplicate rules
- **Elements:** `PageHeader`, a rules list with "New rule", and a form (Name, Module, Matching fields checkboxes, "When a duplicate matches", Enabled, Save rule) that keeps the draft when you navigate away.
- Findings:
  - `[R8] [H]` Matching fields are raw keys (`leadId`, `opportunityTypeId`, `stageId`), both as checkbox labels and in the list summary (45, 38; values from `src/lib/duplicate-rules.ts:3-4`). → Use field labels.
  - `[F2] [M]` No delete or disable-from-list. Discarding unsaved changes uses `window.confirm` (20).
  - `[M1] [L]` Native checkbox, select and input elements instead of the shared components (44-47). The code is minified onto single lines, which hurts maintainability.
  - (Positive: the retained draft, the unsaved note at 49 and the role=status save message are good patterns to reuse.)

### src/app/dashboard/settings/modules/page.tsx — Modules
- **Elements:** `PageHeader`, optional module cards (name, status badge, health badge, issues with links, description, trial/suspended notes, requirements, Request/Withdraw), "Always included" text, "Usage and limits" (`TenantUsageLimits`), and a dialog "Request {module}" (Message).
- Findings:
  - `[C1] [M]` Health shows the label "Not built yet" (`module-health.tsx:22`). Dates use `toLocaleDateString` (117, 123). → Hide unbuilt modules; use the workspace formatter.
  - `[N1] [L]` Usage and limits is buried at the bottom. → Move it to "Workspace › Plan & usage".
  - (Positive: clear copy, separate health loading, request flow.)

### src/app/dashboard/settings/privileged-actions/page.tsx — Privileged Actions (approval queue)
- **Elements:** custom h1 and description, and request rows (action label, status badge, requested time, Approve/Reject or "Awaiting another admin's approval").
- Findings:
  - `[F2] [H]` Approve and Reject run with one click and no confirmation, and the row doesn't show what will change (target type/ID, before/after, requester name) (99-122). → Add a detail drawer with diff and requester, plus a confirmation.
  - `[S1] [H]` A load error only toasts, and then the empty state "No privileged action requests" shows (45, 92-93). → ErrorState.
  - `[R8] [M]` Raw `PENDING`/`EXECUTED` status (103), and `requestedBy` is an ID that's never resolved to a name.
  - `[R2] [M]` Its own `p-6` padding and h1 (78-86). → Use `PageHeader` without extra padding.
  - `[T1] [M]` No filter between pending and history. → Tabs: Pending (n) | History.

### src/app/dashboard/settings/task-playbooks/page.tsx — Task Playbooks
- **Elements:** `PageHeader` with "New Playbook", playbook rows (name, Active/Off badge, module and task-count badges, edit/delete icons), and a dialog "New/Edit Playbook" (Name, Applies To, Description, enabled; task items with title, description, priority, due days, assign-to-owner; reorder and remove).
- Findings:
  - `[A1] [H]` Labels are never associated (236, 240, 252, 257, 298, 310, 323). Icon-only edit/delete (208-213) and 24px up/down/remove buttons have no names (274-282).
  - `[R4] [L]` 3 badges per row; "Off" in one place versus "Inactive" elsewhere. → Muted text; consistent "Inactive".
  - `[F2] [M]` `window.confirm` (160).
  - `[S1] [L]` The empty state is an info Alert, not the shared EmptyState (184-187).

### src/app/dashboard/settings/task-sla-policies/page.tsx — Task SLA Policies
- **Elements:** `PageHeader`, and 4 priority rows (first-action minutes, completion minutes, Enabled switch, Save).
- Findings:
  - `[F1] [M]` 4 separate Save buttons, with no dirty indicator per row (145). → One form with a sticky save bar.
  - `[C1] [M]` Minutes only (120, 131). → Hours/days unit selects.
  - `[N1] [M]` Separate from case SLA (Service Desk). → Group both under "Service levels".

### src/app/dashboard/settings/teams/page.tsx — Teams
- **Elements:** `PageHeader` with "Create Team" (pill button), a DataTable (Team Name with avatar and description, Members badge, edit/delete icons, row click to detail, row selection), an empty state, and `CreateTeamDialog`.
- Findings:
  - `[T1] [M]` Row selection is enabled but there are no bulk actions (177-179). → Remove selection, or add bulk delete/assign.
  - `[A1] [M]` Edit/delete icons are named only by Tooltip, with no `aria-label` (119-149).
  - `[R1] [L]` The `rounded-full` primary button (159) differs from every other page.
  - `[R4] [L]` The member count is a badge (108). → Plain number.
  - `[S1] [M]` A fetch error only toasts (48-50). → ErrorState.

### src/app/dashboard/settings/teams/[id]/page.tsx — Team detail
- **Elements:** "Back to Teams", a header (avatar, name, Active badge), 5 StatCards, and a Members table (Name, Role, Leads Owned, Opportunities, Won, Activities, Conversion Rate).
- Findings:
  - `[N1] [H]` Members can't be added or removed, and settings (hours, defaults) can't be edited, from the team's own page. It's a read-only analytics page under Settings. → Tabs: Members (add/remove), Settings (the dialog's fields), Performance (or link to Reports).
  - `[R2] [M]` Its own `mx-auto max-w-[1200px] p-4` container (67, 87) inside the layout. "Back" duplicates the breadcrumb. → Use the layout breadcrumb and drop the extra container.
  - `[S1] [M]` A non-404 error leaves "Team not found" (55, 74). → ErrorState.

### src/app/dashboard/settings/teams/create-team-dialog.tsx — Create/Edit Team dialog
- **Elements:** Team Name, Description, Working Hours (Start, End, Timezone, Days), SCIM Group Sync Defaults (Default Role, Default Sales Group).
- Findings:
  - `[F1] [M]` Timezone is free-text IANA (214-216), and there's no check that start comes before end. → Timezone combobox and inline validation.
  - `[C1] [M]` The subtitle "Add a new functional group" shows in edit mode too (139). "SCIM Group Sync Defaults" and "Distribution Engine" are jargon (200, 231). → Plain copy ("Defaults for users added by your identity provider").

### src/app/dashboard/settings/permission-templates/page.tsx — Permission Templates
- **Elements:** `PageHeader` with "Create Template", template rows (name, Active badge, "N actions" and "N field rules" badges, edit/delete with tooltips), an empty state, and a Dialog "Create/Edit Permission Template" (Name, Active, Description, "Module or type" select, Actions switches ×6, per-field segmented Editable/Read Only/Hidden).
- Findings:
  - `[N1] [H]` Permissions are split across "Roles & Permissions" (the module matrix, record scope) and "Permission Templates" (actions, field masking). An admin can't see effective access in one place. → One "Roles" page: role detail tabs Access (matrix) | Field visibility | Members; templates become "copy from role".
  - `[A2] [H]` The field-access segmented buttons have no `aria-pressed` and no group label (375-390). Edit/delete are named by tooltip only (276-296). → Add those states and names.
  - `[E1] [M]` One scope at a time via a native select listing every opportunity and activity type (334-337), and no "apply to all fields" or "copy from scope". → Use a matrix with modules or types as rows and actions as columns, plus bulk set.
  - `[R3] [M]` `font-extrabold`/`font-black` throughout (245, 261, 343, 347, 362, 372). → `font-semibold`.
  - `[S1] [L]` "Loading templates" renders twice (242 and 301).
  - `[M1] [L]` Uses a raw `Dialog` rather than `StandardDialog` (305), and has no unsaved-changes guard.
  - `[R8] [L]` Shows `field.key · field.type` (373).

### src/app/dashboard/settings/permission-templates/create-template-dialog.tsx — unused, mocked
- **Elements:** Template Name, Description, a Permissions checkbox list (Leads, Opportunities, Users).
- Findings:
  - `[N1] [M]` Never imported, and its save is a mock (`setTimeout`, 88-89). → Delete it.
  - `[R3] [L]` Uppercase category labels (177).

### src/app/dashboard/settings/governance/audit-logs/page.tsx — Audit logs
- **Elements:**
  - `PageHeader` with "Export Evidence", chip filters (All Activity, Privacy activity, Flagged, Legal Hold), and a filter row (Entity, Action, User ID, Review status, From, To, Search, Saved filters).
  - Table: Timestamp, User, Action, Entity, Status, Details (eye icon).
  - Detail dialog: flag banner, Review Status, Reviewer with "Assign to me", Review note with "Save note", Legal Hold with Apply/Remove, Changes (Diff) JSON, Metadata JSON, Comments with input and send.
- Findings:
  - `[R8] [H]` Free-text filters for raw enums and IDs: "Filter by Entity (e.g. LEAD)", "Action (e.g. UPDATE)", "User ID" (260-280). → Use entity and action selects with labels, and a user picker.
  - `[S1] [H]` "Export Evidence" leaves out the date range, user and category filters (211-219), so the export doesn't match what's on screen. → Pass all active filters, and show "Export N entries".
  - `[E1] [H]` Changes and metadata are raw JSON dumps (459-469). → Reuse the `RecordHistory` field-diff renderer; metadata as key/value rows.
  - `[R6] [M]` Filters take 2 to 3 rows: chips, 6 inputs, Search and Saved (224-309). Every keystroke also refetches (`useEffect` on filters, 93-96), which makes the Search button redundant. → One toolbar: search, a "Filters" popover, date range, saved views; debounce the input.
  - `[R7] [M]` Multicolor action badges (green, blue, red, amber, 59-67), a purple "Hold" (368), and a tinted header (326). → Color only failed logins, deletes and flags.
  - `[F2] [M]` Applying or removing a legal hold has no confirmation (172-188).
  - `[A1] [M]` The eye button has no name (376-385), nor does the send button (498). The comment input has no label (492), and the "Review note" label isn't associated (437).
  - `[R3] [M]` Uppercase micro-labels in the dialog (416, 427, 456, 464, 473).
  - `[T1] [M]` No pagination or count, and the row click and the eye button do the same thing. The static "Record change" sub-label repeats on every row (354).

### src/app/dashboard/settings/governance/gdpr/page.tsx — "GDPR & Data Privacy"
- **Elements:** `PageHeader`, a warning banner, "Request History" with "New Request", a table (Date, Contact Email, Type, Status, Actions with Download), and a dialog "New Privacy Request" (Contact Email, Request Type radio Export/Delete, Initiate Request).
- Findings:
  - `[F2] [H]` A DELETE request "will permanently purge all leads, opportunities, and activities" (86-87) but runs straight from "Initiate Request" with no second confirmation, no typed email and no record count (61-76, 175). → Step 2 shows "Found 3 leads, 5 opportunities…", then a destructive button "Permanently delete" after typing the email.
  - `[R7] [H]` The permanent-deletion warning uses primary info styling (83-89), and the confirm button is primary whatever the type. → Destructive alert and destructive button for Delete.
  - `[C1] [M]` The toast says "GDPR request completed" on create (71). "GDPR & Data Privacy" vs the sidebar's "Data Privacy". Raw `EXPORT`/`DELETE` and status (134, 146). Anything not `COMPLETED` is amber, failures included (141-143). → Labelled statuses with correct tones.
  - `[F1] [M]` No email format validation (62).

### src/components/admin/custom-field-manager.tsx — per-type custom fields dialog (used by admin opportunity- and activity-types)
- **Elements:** "Manage Fields: {type}" with "Add Field", a sortable list (drag handle, label, type, edit, delete), and a nested "Add/Edit Field" dialog (Field Label, Type, Options, Placeholder, Required).
- Findings:
  - `[N1] [H]` The third custom-field system (see Custom Fields). → Unify.
  - `[M1] [M]` A dialog stacked on a dialog (387-399). → Edit inline in a side panel.
  - `[F2] [M]` `window.confirm("Delete this field? Data will be lost.")` (328).
  - `[A1] [L]` Type label isn't associated (226). A load error only toasts (302).
  - (Positive: accessible keyboard drag with aria-labelled handles.)

### src/components/admin/create-tenant-dialog.tsx — Create Tenant (platform admin; listed for completeness)
- **Elements:** Tenant Name, Plan, Admin Name, Admin Email, Feature Flags ×6, then a credentials view (Email, Temporary Password, copy).
- Findings:
  - `[A1] [M]` The shared `Field` renders a `<Label>` with no `htmlFor` (86). The copy icon has no name (176).
  - `[R3] [L]` Uppercase labels (169, 173).
  - `[C1] [L]` "Feature Flags" heading (237). → "Included features".

### src/components/admin/features-dialog.tsx — Manage Features (platform admin)
- **Elements:** 6 feature switches, Cancel / Save Changes.
- Findings:
  - `[A2] [M]` The trigger is a `<span onClick>` wrapper (119), and Labels aren't tied to the switches (167).
  - `[C1] [L]` No description of what each flag gates. Uses raw `fetch`, not `apiFetch` (76, 93).

### src/components/admin/module-health.tsx — module health badge and issues
- **Elements:** a badge and an issue list with fix-it links.
- Findings:
  - `[R3] [M]` The badge is `text-[0.65rem]` (47).
  - `[R7] [L]` Healthy uses the primary tint (26). → No badge when healthy.
  - `[C1] [M]` "Not built yet" (22).

### src/components/admin/retention-policies.tsx — Data retention (platform admin)
- **Elements:** `PageHeader` with "Enforce now…", "Add a policy for", policy cards (definition list, Edit form with 6 day fields), and the dialog "Enforce retention now?" (counts, by tenant).
- Findings:
  - (Positive: the best destructive pattern in scope. It previews counts, says "cannot be undone", and its destructive button is labelled "Anonymize and delete now" (201-241). → Copy this for GDPR, Uninstall and Merge.)
  - `[C1] [L]` The header description is a long paragraph (129). → One line plus "Learn more".

### src/components/admin/simulate-distribution-dialog.tsx — Simulate Distribution (admin assignment rules)
- **Elements:** Entity Type, record select, Run Simulation, a result Alert, and the "Rules Evaluated" trace.
- Findings:
  - `[R8] [H]` "Would assign to user {assignedUserId}" (121). Candidates fall back to `candidate.id` (150). → Resolve to names.
  - `[T1] [M]` The record picker is only the first 100 records, with no search (36-37). → Async search combobox.
  - `[A1] [L]` Labels not associated (82, 92).

### src/components/admin/tenant-usage-limits.tsx — usage vs limits
- **Elements:** 4 usage cards (progress bar, limit text) and an optional limits form.
- Findings:
  - (Positive: accessible progressbar, color only at 80% and above. No significant issues.)
  - `[R2] [L]` Cards nested inside the Modules page section. → Flat rows.

### src/components/governance/record-history.tsx — record history timeline (lead and opportunity pages)
- **Elements:** a "Filter fields" popover (Command), "Clear field filters", and timeline cards (action line, "by user", field before→after badges).
- Findings:
  - `[R5] [L]` The actor appears twice ("Lead modified by X" plus "by X (email)", 210-228).
  - `[R4] [M]` Every before and after value is a Badge, with green for "after" (238-244). → Plain text with strike-through for before and an arrow.
  - `[R3] [L]` `font-extrabold` (218, 234). Values fall back to `JSON.stringify` for objects (63).

### src/components/integrations/external-push-badge.tsx — push status badge
- **Elements:** a "Pushed / Push failed to X · date" badge.
- Findings:
  - `[R4] [L]` A long sentence inside a `whitespace-nowrap` badge (34-36) can overflow. → An icon plus a short label, with details in a tooltip.

### src/components/integrations/external-push-dialog.tsx — Push to External System
- **Elements:** Integration select, Opportunity select, Request Preview (method, URL, auth, headers, body, unresolved tokens), a result Alert, and Send / Push again.
- Findings:
  - `[M1] [L]` No Cancel button; Send sits in the body, not the footer (204-213). → Use `actions`.
  - `[A1] [L]` Labels not associated (126, 141, 160). `Auth: BEARER` is a raw enum (172).

### src/components/roles/permission-matrix.tsx — role permission matrix (used only by the dead role-editor-dialog)
- **Elements:** a "Record Visibility Scope" select, and a module × action table (Full Access switch plus 6 checkboxes, 10 modules).
- Findings:
  - `[A1] [H]` 70 checkboxes and 10 switches have no accessible names (138-151), and the scope select is unlabelled (107). → `aria-label="{Module}: {Action}"`.
  - `[E1] [M]` Turning off Full Access resets the module to `{}`, losing the granular picks (83). There's no select-all per column, and no sticky first column on narrow screens. → Keep the previous granular state, and add column toggles.

### src/components/roles/role-editor-dialog.tsx — unused
- **Elements:** Role Name, Description, Permission Template, External partner role, and the PermissionMatrix.
- Findings:
  - `[N1] [M]` Never imported. Either delete it, or make it the single role editor (see the IA).
  - `[A1] [L]` "Permission Template" label isn't associated (151).

---

### (a) Top 15 changes
1. **Unblock personal settings for every user.** Move Password, Two-factor, Sessions, Preferences (appearance, landing page, density, notifications, timezone override) and My activity into `/settings/account/*`, outside the `RoleGuard "Tenant Admin"` (`layout.tsx:8`).
2. **Rebuild the sidebar from one ordered config** with group, keywords, section anchors, a "My account" group at top, and admin groups below. Search matches keywords and sections, and the breadcrumb shows the group and page.
3. **Break up Integrations (2,706 lines)** into a connector directory plus separate pages for Webhooks, Lead capture, Data import, Telephony (each of the 12 sub-sections at its own URL), Messaging, External push and Health. Use slug ids kept in the URL.
4. **Put every tab and section in the URL.** That covers `SettingsSections`, General's tabs, Marketplace, AI, Dedupe, Custom fields, Catalog and Service Desk.
5. **Use one save model per section** (autosave with a "Saved" tick for single toggles; a sticky Save/Discard bar for forms), with dirty tracking and a guard before leaving. Fix General's global Save, Telephony's one Save for 12 sections, and Marketplace Sync's mixed blur/change/button saves.
6. **Replace `window.confirm`/`window.prompt` with a shared ConfirmDialog** (based on `RetentionPolicies`). Add confirmation where there's none: Service Desk deletes, Suspend app, Rotate keys/secrets, Merge, Legal hold, Privileged approve, GDPR Delete (typed confirmation and record counts).
7. **Remove raw IDs and enums from inputs and displays**:
   - Inputs: Record Ids, Lead ID, Depends On App IDs, Default Owner user ID, Stage Id, the audit User ID/Entity/Action filters, raw field keys in Duplicate rules.
   - Displays: Merge history ID fragments, "assign to user {id}", webhook event constants, `EMAIL Provider`.
   → One shared enum→label map, plus record and user pickers.
8. **Fix accessible names** on all icon-only buttons (more than 60 across integrations, marketplace, dispositions, scripts, campaigns, playbooks, teams, audit) and associate every Label with its control. Make Allowed-modules badges, permission segmented buttons and matrix checkboxes real, named controls.
9. **One place for each concept.** Merge "Duplicate rules" and "Dedupe & Merge" into Duplicates. Merge the three custom-field UIs into one Fields page. Merge Roles and Permission Templates. Group Task SLA and Case SLA under Service levels. Remove `/dashboard/admin/*` duplicates and the dead files.
10. **Replace raw JSON editors with structured forms**: SMTP or HTTP provider fields, a user↔agent mapping table, a payload template with a token picker and validation, and audit-log diffs rendered like RecordHistory.
11. **Add the missing editing**: rename and edit everything in Service Desk, edit and reorder custom fields, edit AI prompt templates, team membership on the team page, and render the sub-outcomes in Call dispositions that are currently never shown.
12. **Fix broken or misleading states**:
    - AI Assistant's endless "Loading…" on error.
    - Privileged Actions, Teams and Dedupe showing an empty state after a failed load.
    - The audit export ignoring date and user filters.
    - Inbound endpoint `YOUR_TENANT_ID`.
    - The SCIM pointer to a non-existent General setting.
    - The plaintext-secrets notice styled as info.
13. **Type scale clean-up**: remove sub-12px text (`text-[10px]`, `0.6rem`, `0.65rem` in custom-fields, my-activity, marketplace, module-health). Replace the uppercase `text-xs font-bold tracking-wide` section labels with sentence-case h2. Normalise `font-extrabold`/`font-black` to semibold. Use `PageHeader` everywhere (General, AI, Dedupe, Privileged, Analytics, Team detail, disabled-module states).
14. **Badge and color discipline**: badges only for status; plain text for counts, categories, rate limits, event lists and "N today"; color only for failing, expired or over-limit. Make the segmented controls neutral (Messaging channel buttons).
15. **Lists into proper tables or detail pages**:
    - Marketplace app detail page in place of a 13-button `<details>` plus 11 modals.
    - Agent availability as a filterable table.
    - Teams without the useless row selection.
    - Audit logs with paging and a single-row toolbar.
    - API keys filtered to Active by default.

### (b) Proposed Settings information architecture
Every group and page has its own URL, and sections are anchors (`#section`) or `?tab=`. Pages marked **[Personal]** are open to every signed-in user; all others are **[Admin]**.

**My account** — `/settings/account` [Personal]
- Profile — `/settings/account/profile` (name, avatar, email)
- Preferences — `/settings/account/preferences` with sections `#appearance` (mode, theme), `#navigation` (landing page, pinned modules, density), `#regional` (timezone and currency override), `#reset`
- Notifications — `/settings/account/notifications` (the mute categories, moved from My Workspace)
- Sign-in & security — `/settings/account/security` with sections `#password`, `#two-factor`, `#remembered-devices`, `#sessions` (merges the Password, MFA and Sessions pages)
- My activity — `/settings/account/activity`

**Workspace** [Admin]
- Workspace profile — `/settings/workspace` with `#profile` (company name), `#regional` (timezone, currency, language, date format)
- Plan, modules & usage — `/settings/workspace/modules` with `#modules`, `#usage` (Modules plus usage limits)

**Users & access** [Admin]
- Users — `/settings/users`
- Teams — `/settings/teams`, with `/settings/teams/[id]?tab=members|settings|performance`
- Roles & permissions — `/settings/roles`, with `/settings/roles/[id]?tab=access|fields|members` (merges Roles, Permission Templates and the permission matrix; "Field visibility" replaces templates)
- Sales groups — `/settings/sales-groups`
- Partners — `/settings/partners` (module-gated)
- User provisioning (SCIM) — `/settings/users/provisioning`

**Security & compliance** [Admin]
- Security policy — `/settings/security` (password policy, MFA enforcement, IP rules; the admin security page)
- Approvals — `/settings/security/approvals` (was Privileged Actions; tabs Pending | History)
- Audit log — `/settings/audit-log`
- Data privacy requests — `/settings/privacy` (was GDPR)
- API keys — `/settings/api-keys`

**Data model** [Admin]
- Objects & fields — `/settings/fields?object=lead|opportunity|activity` (merges the 3 custom-field UIs; type-specific scoping inside)
- Opportunity types & pipelines — `/settings/opportunity-types` (the pipelines redirect goes away)
- Activity types — `/settings/activity-types`
- Product catalog — `/settings/catalog/[universityId]/[programId]?tab=…` (module-gated)
- Duplicates — `/settings/duplicates?tab=rules|review|history` (merges Duplicate rules and Dedupe & Merge)
- Import data — `/settings/data/import` (from Integrations › CSV Imports)

**Sales automation** [Admin]
- Assignment rules — `/settings/assignment-rules`
- Lead scoring — `/settings/lead-scoring`
- Recommended actions — `/settings/recommended-actions` (was Next-Best-Action)
- Task playbooks — `/settings/task-playbooks`
- Service levels — `/settings/service-levels?tab=tasks|cases` (merges Task SLA Policies and Service Desk SLA)

**Calling** (module TELEPHONY) [Admin]
- Phone system — `/settings/calling/phone-system`, with sub-pages for numbers, click-to-call, popups, dispositions-webhook, agent panel, mappings, compliance and queue routing (from Integrations › Telephony)
- Call outcomes — `/settings/calling/outcomes` (was Call Dispositions)
- Call scripts — `/settings/calling/scripts`
- Call campaigns — `/settings/calling/campaigns`, plus `/[id]/analytics`
- Agent capacity — `/settings/calling/agents` (hours and caps only; live status moves to Call Center)

**Service desk** (module SERVICE_DESK) [Admin]
- Case setup — `/settings/service/cases?tab=types|statuses|priorities`
- Queues — `/settings/service/queues`
- Macros — `/settings/service/macros`
- Knowledge base — `/settings/service/knowledge-base`
- Inbound channels — `/settings/service/inbound`

**Messaging & AI** [Admin]
- Email, SMS & WhatsApp — `/settings/messaging?channel=email|sms|whatsapp` with `#provider`, `#templates`, `#deliveries`
- AI assistant — `/settings/ai?tab=provider|templates|usage`

**Integrations** [Admin]
- All integrations (directory with status) — `/settings/integrations`
- Webhooks — `/settings/integrations/webhooks`
- Lead capture — `/settings/integrations/lead-capture`
- External push — `/settings/integrations/external-push`
- Connection health — `/settings/integrations/health`
- Marketplace — `/settings/marketplace?tab=installed|requests|catalog`, with `/settings/marketplace/apps/[id]?tab=overview|health|deliveries|sync|actions|reports|versions|credentials`

**Rewards & payouts** (feature-gated) [Admin]
- Payout cycles — `/settings/payouts/cycles`
- Commission rules — `/settings/payouts/commission`
- Gamification — `/settings/gamification`

**Remove or redirect:** every `/dashboard/admin/*` route that has a settings equivalent (301 to the settings URL), `/dashboard/admin/custom-fields`, `/dashboard/admin/pipelines`, `create-template-dialog.tsx`, `role-editor-dialog.tsx`. Point global search at the new URLs.

### (c) Standard settings page template
1. **Shell:** breadcrumb `Settings › {Group} › {Page}`; the layout owns width (max about 960px for forms, full width for tables), with no page-level padding or containers.
2. **Header (PageHeader only):**
   - h1 `text-2xl font-semibold`, plus one sentence of description (`text-sm muted`) and an optional "Learn more" link.
   - At most one primary action on the right ("Add …"), plus at most one secondary or overflow menu.
   - No icon tiles, no badges in the header except one status if needed (for example "Module: Trial").
3. **Section navigation:**
   - With 4 or fewer sections: a single scrolling page, sections separated by `border-t`, each an anchor (`id`), plus an "On this page" list on wide screens.
   - With more than 4 independent sections: URL-synced tabs (`?tab=`) or sub-routes. Never tabs inside tabs.
4. **Section layout:**
   - A two-column row at md and up: left column has an h2 (`text-base font-semibold`, sentence case) and a short helper paragraph; right column has the controls.
   - No cards inside cards; one container level (a section divider, not a Card per section).
5. **Form rules:**
   - Every control has a visible `<Label htmlFor>`; required fields get a `*` and an `aria-required`.
   - Helper text sits below the field (12px minimum); inline errors go below the field with `aria-describedby` (toasts only for network failures).
   - Units go in the input suffix (min, hrs, days, %); show durations in human units.
   - Pickers instead of IDs (user, record, team, module, field); labels instead of enums; native `<select>` only for the mobile section switcher.
6. **Save model:**
   - Single toggles or preferences autosave, with an inline "Saved" tick and an undo toast for risky toggles.
   - Multi-field forms show a sticky bottom bar "You have unsaved changes · Discard · Save" only when dirty. There's one bar per page or tab; it saves the whole form; navigation is blocked when dirty (reuse `useRetainedEditorDraft` or the StandardDialog guard).
   - Lists use row actions, and add/edit happens in a side sheet (not a nested modal) with its own Save/Cancel.
7. **Lists and tables:** one-row toolbar (search, Filters popover, view toggle, primary "Add" in the header); a table with sortable headers, empty state (illustration-free, one sentence plus action), skeleton loading, ErrorState with Retry, pagination over 50 rows; row click opens detail; at most 2 inline row actions, the rest in "⋯" with `aria-label`s.
8. **Status and color:** badges only for status (Active is the default and isn't badged; show Paused, Failed, Expired, Trial); amber and red only when the admin should act; one accent (primary) for selection and focus.
9. **Danger zone:** the last section, with a `border-destructive/30` divider and h2 "Danger zone". Each action is a row: a title, a one-line consequence, and a right-aligned outline-destructive button.
   - Confirmation uses the shared ConfirmDialog: the title names the object; the body states the consequence and counts (preview, as in `RetentionPolicies`); a destructive button reads verb + object ("Delete webhook").
   - For irreversible bulk data loss (GDPR delete, uninstall, purge), the admin also types the object name or email.
   - Reversible actions (archive, deactivate, dismiss) use an undo toast instead of a dialog.

### (d) Every destructive or irreversible action and how it is confirmed today
| Action | Location (file:line) | Confirmation today |
|---|---|---|
| Reset all personal preferences | settings/page.tsx:132 | `window.confirm` |
| Delete webhook | integrations/page.tsx:719 | `confirm()` |
| Pause webhook | integrations/page.tsx:729 | none |
| Rotate inbound webhook secret | integrations/page.tsx:658 | `confirm()` |
| Rotate telephony webhook secret | integrations/page.tsx:933 | `confirm()` |
| Retry failed inbound event | integrations/page.tsx:693 | none |
| Delete CSV import template | integrations/page.tsx:862 | none |
| Cancel import job | integrations/page.tsx:872 | none |
| Approve overwriting import | integrations/page.tsx:882 | none (preview alert only) |
| Reject import | integrations/page.tsx:893 | `confirm()` |
| Remove do-not-call number | integrations/page.tsx:973 | none |
| Delete external push integration | integrations/page.tsx:1099 | `confirm()` |
| Overwrite messaging connector/template (PUT by name) | integrations/page.tsx:1037, 1110 | none |
| Request publish app | marketplace/page.tsx:323 | `window.confirm` |
| Rotate app secret | marketplace/page.tsx:396 | none |
| Roll back app version | marketplace/page.tsx:485 | `window.confirm` |
| Deprecate app | marketplace/page.tsx:501 | `window.prompt` (Cancel aborts) |
| Uninstall app | marketplace/page.tsx:644 | `window.confirm` ("cannot be undone") |
| Suspend / reinstate app | marketplace/page.tsx:941, 947 | none |
| Reject install request | marketplace/page.tsx:1055 | none |
| Approve & install (after review) | marketplace/page.tsx:1058 | review step via `window.prompt` (663) |
| Approve / reject permission increase | marketplace/page.tsx:994-999 | none |
| Delete app action | marketplace/page.tsx:730 | none |
| Delete app report | marketplace/page.tsx:778 | none |
| Replay delivery | marketplace/page.tsx:617 | none |
| Change sync direction/conflict (applies instantly) | marketplace/page.tsx:1628-1646 | none |
| Delete case type / status / priority / queue / SLA / macro / inbound address | service-desk/page.tsx:52, 104, 175, 228, 327, 418, 550 | none |
| Remove queue member | service-desk/page.tsx:237 | none (instant) |
| Deactivate KB article | service-desk/page.tsx:495 | none |
| Rotate API key | api-keys/page.tsx:137 | none (may need second-admin approval server-side) |
| Revoke API key | api-keys/page.tsx:155, 349-366 | proper StandardDialog with destructive button |
| Disable two-factor | mfa/page.tsx:247, 356-363 | dialog that requires a TOTP or backup code |
| Regenerate backup codes | mfa/page.tsx:253, 364-371 | dialog that requires a TOTP code |
| Remove remembered device | mfa/page.tsx:262 | none |
| Revoke a session / log out current | sessions/page.tsx:52-53 | `window.confirm` only for the current session; none for others |
| Log out all other devices | sessions/page.tsx:71 | `window.confirm` |
| Change SCIM default role | scim/page.tsx:79 | none (instant) |
| Delete call campaign | call-campaigns/page.tsx:89 | `confirm()` |
| Activate / pause campaign | call-campaigns/page.tsx:79 | none |
| Delete disposition group | call-dispositions/page.tsx:73 | `confirm()` |
| Delete disposition outcome | call-dispositions/page.tsx:84 | `confirm()` |
| Delete call script | call-scripts/page.tsx:80 | `confirm()` |
| Delete (hide) custom field | custom-fields/page.tsx:50 | `confirm()` |
| Delete type-specific custom field | components/admin/custom-field-manager.tsx:328 | `confirm()` ("Data will be lost") |
| Merge duplicate records | dedupe/page.tsx:138 | none (Undo exists in history) |
| Undo merge | dedupe/page.tsx:152 | none |
| Dismiss "not a duplicate" | dedupe/page.tsx:125 | none |
| Disable a match rule | dedupe/page.tsx:94 | none |
| Discard unsaved duplicate-rule edits | duplicate-rules/page.tsx:20 | `window.confirm` |
| Withdraw module request | modules/page.tsx:81 | none |
| Approve / reject privileged action | privileged-actions/page.tsx:51, 64 | none (no detail shown) |
| Delete task playbook | task-playbooks/page.tsx:160 | `confirm()` |
| Delete team | teams/page.tsx:71 | `confirm()` |
| Delete permission template | permission-templates/page.tsx:227 | `confirm()` |
| Apply / remove legal hold on audit entry | governance/audit-logs/page.tsx:172 | none |
| GDPR DELETE (permanent purge of all records for an email) | governance/gdpr/page.tsx:61-76, 175 | none beyond the dialog's "Initiate Request" (no typed confirmation, no counts, primary button) |
| Retention "Enforce now" (anonymize/delete) | components/admin/retention-policies.tsx:104, 201-241 | proper preview dialog with counts and a destructive "Anonymize and delete now" (reference pattern) |
| Toggle platform feature flags | components/admin/features-dialog.tsx:90 | Save button only |

**Summary:** 20 actions use `window.confirm` or `confirm()`, 2 use `window.prompt`, and 34 or more have no confirmation at all. Only API-key revoke, MFA disable/regenerate and Retention enforce use a proper in-app confirmation.

---

# P7 · Admin configuration pages (rendered inside Settings)

## Admin / Settings UI/UX review (P7, all 32 files read in full)

Paths are relative to `/Users/arjunh/Documents/crm/crm/src/app/dashboard/admin/`. I also checked the shared pieces these pages depend on: `src/components/common/condition-builder.tsx`, `standard-dialog.tsx`, `src/components/layout/page-header.tsx`, `src/components/ui/data-table.tsx` and `src/app/dashboard/settings/components/sidebar-nav.tsx`.

**Context that changes the verdicts:**
- **Re-exported into Settings:** users, roles, sales-groups, partners, opportunity-types, activity-types, assignment-rules, lead-scoring, next-best-action, commission-rules, payout-cycles, gamification and security are all shown inside Settings via `settings/*/page.tsx`.
- **Custom Fields is duplicated.** Settings uses its own `settings/custom-fields/page.tsx`, so `admin/custom-fields/*` can only be reached by typing the URL.
- **Orphan pages.** plans, usage, rate-limits and tenants are not linked from the Settings nav or from `/platform-admin`. `/platform-admin/tenants` already exists separately.
- **No stage editor exists anywhere** under admin or settings, even though the brief expects one.
- **No confirm-dialog component exists** in `components/ui` or `components/common`. The pages use 17 `confirm()` calls and 5 `window.prompt()` calls.
- **Unused shared pickers.** `components/ui/icon-picker.tsx` and `color-picker.tsx` exist, but the opportunity-type and activity-type dialogs build their own instead.

---

### users/page.tsx — Users list (Settings › Users)
- **Elements:**
  - PageHeader "Users" with "Invite User".
  - Load-error alert with Retry.
  - DataTable columns: User (avatar, name, email), Role, Team, Status, Last Login, row actions.
  - Row actions: an "Edit" text button plus a kebab with "View active sessions", "Generate password reset link", "Reset MFA", "Deactivate user".
  - Empty state with "Invite User".
  - BulkActionsToolbar: Deactivate, Assign manager.
  - Dialogs: Invite, Edit, Bulk Assign Manager, "Active Sessions -- {name}" (Revoke per session, Close), "Password Reset Link -- {name}" (read-only input, Copy, Close).
- **Findings:**
  - `[T1] [H]` No search, no filters (role, status, team) and no sort. `Input` is imported but never used (l.9, 285-313) → add a one-row toolbar through DataTable `toolbarActions`: search, Role/Status/Team selects, a "Show inactive" toggle.
  - `[T1] [M]` Loads every user with no paging; the comment says "Assuming no pagination" (l.49, 58) → server paging using `manualPagination`/`totalItems`.
  - `[S1] [M]` A stub fakes the team as `{id:'unassigned'}` (l.53) → keep it null and show "—".
  - `[R3/R8] [M]` Role and Status badges are `font-bold uppercase` (l.204, 233-234) and show the raw status "ACTIVE"/"INACTIVE" (l.237) → sentence-case label map.
  - `[R4/R7] [M]` Role is shown as a coloured badge but it is not a status; Active is shown in the primary colour (l.204, 233) → role as plain text; colour only for Inactive or Invited.
  - `[R9] [L]` A visible "Edit" button plus a kebab on every row (l.258-261) → clicking the row opens editing; keep only the kebab.
  - `[F2] [H]` Deactivate and Reset MFA use `window.confirm` (l.106, 137). Revoke session has no confirmation (l.91-103, 382-389) → shared ConfirmDialog that names the user.
  - `[F2] [H]` There is no "Reactivate user" action; the menu only offers deactivate when the user is ACTIVE (l.267) → add Reactivate, and offer undo in the toast.
  - `[F2] [M]` Bulk deactivate can include the current admin and shows a generic message (l.134-162) → exclude self and list the names.
  - `[A1] [L]` The Revoke buttons have no per-session name (l.382) → `aria-label="Revoke session on {device}"`.
  - `[C1] [L]` Titles and toasts use "--" (l.110, 362, 379, 399, 406) → use an em dash or rewrite.
  - `[S1] [L]` Sessions show plain "Loading..." text (l.368) → skeleton rows.
  - `[R10] [L]` Comfortable density plus `min-h-14` cells (l.181, 301) → compact by default for admin tables.
  - `[M1] [L]` Editing a user (including the skills editor) is a centred dialog → right-hand side panel so the list stays visible.

### users/invite-user-dialog.tsx — Invite user
- **Elements:** "Invite User" dialog with Full Name, Email, Temporary Password, Role, Permission Template Override ("Use role template"), Team, Manager; Cancel / Invite User.
- **Findings:**
  - `[C1/F1] [H]` "Invite" actually creates an ACTIVE account with a password the admin types; no email is sent (l.48, 131-134, 187-195) → either a real invite by email (no password field) or rename it "Add user" with "Generate password + copy" and "must change on first login".
  - `[F1] [M]` Password minimum is 6 characters, ignoring the tenant's `minPasswordLength` policy (security l.229) → validate against the policy and show the rules.
  - `[F1] [M]` No required/optional markers, though Role is required (l.44, 201).
  - `[C1] [L]` "Permission Template Override" is jargon (l.222) → put it under an "Advanced" section, labelled "Permissions: same as role".
  - `[T1] [L]` The Manager select lists every user with no search (l.282) → combobox.
  - `[S1] [L]` If the reference data fails to load, the user only gets a toast and empty selects (l.113-115).

### users/edit-user-dialog.tsx — Edit user
- **Elements:** "Edit User" dialog with Full Name, Email (disabled), Role, Permission Template Override, Team, Manager; a switch card "Available for lead/opportunity assignment"; an "Assignment Skills" card with "Add Category" and per-category rows ("Category (Key)", Values tag input + Add, remove); Cancel / Save Changes.
- **Findings:**
  - `[E1] [H]` **Bug:** `permissionTemplateId` can be edited but is not sent in the PATCH (l.233-242), so the change is silently lost → include it in the payload.
  - `[A1] [H]` The availability Switch has no id and its Label is not linked to it (l.398-400).
  - `[A1] [M]` The Category and Values fields have no `htmlFor` (l.441-455).
  - `[E1] [M]` Skill categories and values are free text, but they must match the "Required skills" tags in the assignment rule builder (rule-builder l.611-648) → pick from existing tags (combobox that can also create).
  - `[R2] [M]` A bordered card contains muted cards, all inside a dialog (l.409, 424) → one section heading with simple rows.
  - `[C1] [M]` "Category (Key)" (l.442) → "Skill category"; the helper text uses "--" (l.402).
  - `[F2] [L]` Cancel throws away edits without asking → use the StandardDialog unsaved-changes guard (`EditorDismissContext`).
  - `[T1] [L]` The Manager list has no search and includes inactive users.

### users/bulk-assign-manager-dialog.tsx — Bulk assign manager
- **Elements:** "Assign Manager" dialog (subtitle shows the count); "Select Manager" (avatar, name, email); Cancel / Assign Manager.
- **Findings:**
  - `[A1] [M]` The Label is not linked to the trigger (l.135-137).
  - `[E1] [M]` The selected users themselves can be picked as their own manager (l.71-73) → exclude them.
  - `[T1] [L]` No search in the user list → combobox.

### roles/page.tsx — Roles & Permissions
- **Elements:**
  - PageHeader with "Create Role"; spinner; error alert with Retry; empty state "Add your first role".
  - A grid of role cards. Each card has an icon tile, name, "N users assigned", Edit/Delete icons, description, a "MODULE ACCESS" badge cloud and a "RECORD DATA ACCESS" value.
- **Findings:**
  - `[T1] [H]` Large cards with badge clouds (l.114-193) → table: Role | Users | Record access | Leads | Opportunities | Activities | Admin | Integrations | ⋯. Optionally add a "Compare" matrix view.
  - `[R3] [H]` Section labels are `text-[11px] font-extrabold uppercase` (l.161, 183).
  - `[R4/R7] [M]` Permission levels use four accent colours: tertiary, primary, secondary, muted (l.32-37) → plain text ("Full", "Edit", "View", "None"); colour only for risky grants such as Admin Full.
  - `[R8] [M]` Record access shows raw "OWN"/"TEAM"/"ALL" (l.188), and modules render like "Leads: write" (l.174) → label map.
  - `[F2] [H]` Delete uses `confirm()` even when users are assigned, with no way to reassign them (l.64-76) → disable delete when users > 0, or a dialog with "Reassign N users to [role]".
  - `[N1] [M]` Partner roles (`isPartnerRole`) are not marked on the list, and there is no protection for system or admin roles.
  - `[S1] [L]` No Duplicate-role action. `framer-motion` fade-in (l.89-94) is inconsistent with other Settings pages.

### roles/role-dialog.tsx — Role editor (the permission matrix)
- **Elements:** "Create/Edit Role" dialog (md, 900px) with:
  - Role Name; Description (Optional); Permission Template select.
  - Switch card "External partner role".
  - "Module Permissions": 5 full-width selects (Leads, Opportunities, Activities, Admin & Settings, Integrations), each None/Read/Write/Full with descriptions.
  - "Record Access Scope" select.
  - Cancel / Create|Update Role.
- **Findings:**
  - `[E1] [H]` Permissions are 5 stacked selects (l.284-312) → a modules × levels radio matrix (keyboard arrow navigation), Record access as a segmented control, and an impact line ("affects 12 users").
  - `[E1] [H]` It is never explained whether the Permission Template or the per-module values win (l.234-256) → show the template's values with per-row "Overridden" markers and a reset.
  - `[F2] [M]` Turning on "External partner role" for a role that already has internal users blocks them from admin, with no warning (l.260-278) → confirm with the user count.
  - `[E1] [M]` Granting Admin "Full" gives no warning.
  - `[C1] [M]` "Write — create and edit own records" contradicts the separate record-access scope (l.71) → labels "View", "Edit", "Full (incl. delete)", with scope explained once.
  - `[F1] [L]` Required/optional marking is inconsistent ("Description (Optional)" but no `*` on Role Name).
  - `[M1] [M]` A real matrix plus the role's assigned users should be a full page, `/settings/roles/[id]`.

### sales-groups/page.tsx — Sales Groups
- **Elements:**
  - PageHeader with "Create Group".
  - Error alert; a header strip "Sales Organization" with an icon.
  - DataTable columns: Group Name (+ description), Members (avatar stack, "N total"), Permission Template (inline select), Created, Actions ("Members" dashed button, delete icon).
- **Findings:**
  - `[N1] [H]` The Settings nav has both "Teams" and "Sales Groups", and both say they group users for routing and reporting → merge them, or state the difference clearly (reporting hierarchy vs routing pool).
  - `[A1] [H]` The delete icon button has no `aria-label` (l.179-189).
  - `[E1] [M]` Changing the permission template in the table cell saves instantly and changes permissions for every member (l.133-148) → edit in a panel with Save, or confirm.
  - `[S1] [M]` A group's name and description cannot be edited after creation → clicking a row opens an edit panel (details, template, members).
  - `[F2] [M]` Delete uses `confirm()` and does not mention member count or the assignment rules that target the group (l.69).
  - `[R5/R2] [M]` The decorative "Sales Organization" strip repeats the page title (l.206-211) → remove.
  - `[C1] [L]` "Members" uses a Settings gear icon and a dashed border (l.167-178) → "Manage members" as a ghost button. The "Actions" column header text is inconsistent with other tables.

### sales-groups/sales-group-dialog.tsx — Create group
- **Elements:** "Create Group" trigger; small dialog with Group Name (required), Description, Permission Template; Cancel / Create Group.
- **Findings:**
  - `[A1] [M]` The Permission Template label is not linked (l.108-115).
  - `[F1] [L]` Only native `required`; no inline errors; the error toast is a string concatenation (l.55); the form is not reset on Cancel.
  - `[N1] [L]` Create only → reuse it for editing.
  - `[C1] [L]` The subtitle says "pool leads" while the page says "routing and reporting".

### sales-groups/manage-members-dialog.tsx — Group members
- **Elements:** "Manage Members: {group}" with an "Add user" select, a role select (Member/Manager) and an add icon button; member rows (avatar, name, email, role badge, remove).
- **Findings:**
  - `[A1] [M]` Neither select has a label or `aria-label` (l.94-115).
  - `[R3/R8] [M]` The role badge is `text-[10px]` and shows the raw "MEMBER"/"MANAGER" (l.145-147) → plain text, editable inline.
  - `[F2] [M]` Remove happens instantly with no undo (l.57-67, 148-156) → undo toast.
  - `[T1] [L]` No search and no multi-add → multi-select combobox.

### partners/page.tsx — Partners list
- **Elements:**
  - PageHeader with Export and "Add Partner"; a note when the module is disabled; skeleton, error and empty states.
  - Partner cards: checkbox, avatar, legal name, contact name and email, "View Dashboard", "Add Login", a "GST Registered/Unregistered" badge, a status badge.
  - A `<details>` "Partner Logins (N)" section with per-login inline selects (Login role, Reports to, Status) and a Payouts checkbox.
  - BulkActionsToolbar: Suspend.
- **Findings:**
  - `[T1] [H]` Cards with nested `<details>` and inline-edit selects (l.140-266); no search, filter or sort → DataTable of partner organisations (Name, Contact, GST, Logins, Status); clicking a row opens the partner page.
  - `[F2] [H]` Setting a login's Status to SUSPENDED applies instantly, as do changes to role, parent and payout access (l.211-258) → edit with explicit Save, and confirm suspensions.
  - `[F2] [M]` Bulk suspend uses `confirm()` and shows `toast.success` even if every update failed (l.93, 104).
  - `[R4/R3] [M]` The "GST Registered" badge is not a status (l.183-185); raw "ACTIVE"/"SUSPENDED" text (l.194); `text-[0.65rem]` (about 10px) (l.183, 190-191) → plain columns, sentence case, at least 12px.
  - `[R9] [M]` Every card always shows two buttons and two badges → kebab for secondary actions.
  - `[R2] [M]` A `details` panel inside a card inside the page, with nested `surface-container-low` boxes (l.198, 252).
  - `[R8] [L]` "Reports to" falls back to a raw id (l.235).
  - `[A1] [L]` Labels have a leading space (" Login role") (l.210, 224, 240).
  - `[C1] [L]` "View Dashboard" → "View partner"; the banner uses "--" (l.118).
  - `[N1] [L]` The primary-partner heuristic (l.67) can list sub-logins as organisations.

### partners/[id]/page.tsx — Partner detail
- **Elements:** "Back to Partners"; header (avatar, legal name, contact, status badge); 3 StatCards (Total Commission Earned, Total Paid Out, Pending Payouts); "Recent Commission Ledger" table (Type, Amount, Date); "Recent Payouts" table (Status, Amount, Date).
- **Findings:**
  - `[N1] [H]` The page is read-only. Profile fields (GSTIN, PAN, state, invoice prefix), logins and suspension can only be changed on the list page → make this the main partner page with tabs Overview | Logins | Commission | Payouts | Profile.
  - `[R8] [M]` Raw `entryType` (l.138), payout status (l.166) and partner status (l.108).
  - `[S1] [M]` "Pending Payouts" is a count shown next to currency totals (l.116) → label it as a count, or show an amount.
  - `[R5/R3] [L]` A Back button instead of a breadcrumb; the h1 is `text-xl font-extrabold` (l.103) and does not use PageHeader.
  - `[T1] [L]` No "View all" link on the recent tables. The error state has no back navigation.

### partners/add-partner-dialog.tsx — Add partner
- **Elements:** "Add Partner" dialog with a roles ErrorState, two "no partner role" hints, Contact Name, Email, Temporary Password, Partner Role, Legal Business Name (with hint), GSTIN (optional), PAN (optional), Registered State (optional, with hint); Cancel / Create Partner.
- **Findings:**
  - `[S1] [H]` Two "no partner role" messages can show together, and the primary-coloured one shows even while roles are still loading (l.111, 114-119) → one empty state with a "Create partner role" link; skeleton while loading.
  - `[A1] [M]` The Legal Business Name input has no id, so its label is unlinked. The ids are derived from label text (l.179, 233), which is fragile → pass ids explicitly.
  - `[F1] [M]` No GSTIN/PAN format checks (l.30-31). Registered State is free text while Payout settings uses a state dropdown → reuse that dropdown.
  - `[F1] [M]` Same issue as Invite user: an admin-set temporary password, and nothing tells the partner their credentials.
  - `[R7] [L]` A primary-coloured box is used for a warning (l.115).

### partners/add-partner-login-dialog.tsx — Add partner login
- **Elements:** Login Name, Email, Temporary Password, Partner Role, Login Role (Manager/Member/Finance), Reports To, a "Payout module visible for this login" checkbox; Cancel / Create Login.
- **Findings:**
  - `[C1/N1] [H]` "Partner Role" and "Login Role" sit side by side and are easily confused (l.134-156) → rename them "Access role" and "Position in partner org", or default the access role from the primary login.
  - `[R8] [L]` Reports To falls back to a raw id (l.165).
  - `[F1] [L]` No password hint or placeholder.
  - `[R2] [L]` A bordered box for a single checkbox (l.174) → switch row.

### opportunity-types/page.tsx and pipelines/page.tsx — Opportunity Types (and the Pipelines redirect)
- **Elements:**
  - Custom header "Opportunity Types" with "Create Type"; spinner; empty state.
  - A sortable 3-column card grid. Each card: drag handle, coloured icon tile, name, ACTIVE/INACTIVE badge, CATALOG LINKED badge, description, OPPORTUNITIES and CUSTOM FIELDS counts, "Fields" (opens CustomFieldManager), Edit, Delete.
  - `pipelines/page.tsx` redirects to `/dashboard/admin/opportunity-types`.
- **Findings:**
  - `[E1] [H]` **No stage or pipeline editor exists**, although the subtitle promises "picklists and stages" (l.263) and Pipelines redirects here → a Stages editor per type (ordered rows: name, probability %, Open/Won/Lost, rotting days) on a type detail page.
  - `[A2] [H]` Reordering is drag-only in a grid (`rectSortingStrategy`). There are no instructions, no screen-reader announcements and no Move up/down (l.171-176, 285-299) → table plus "Move up/down" menu items plus dnd-kit announcements.
  - `[R3] [H]` `text-[10px] uppercase` badges (l.106, 113) and `text-[11px] uppercase` labels (l.127, 131).
  - `[R5] [M]` Custom header with `mx-auto max-w-[1200px] px-4 py-4` (l.257-270) gives double padding inside Settings → use PageHeader.
  - `[N1] [M]` The redirect goes to an `/admin/...` route, not `/settings/...`.
  - `[T1] [M]` Cards → table (Name, Opportunities, Fields, Program, Status) with a drag column.
  - `[A2/S1] [M]` Delete is disabled with no explanation when the type has opportunities (l.153), and `isActive` cannot be edited anywhere → a tooltip "Used by N — deactivate instead" and an active switch.
  - `[F2] [M]` Delete uses `confirm()` (l.237).
  - `[R4] [L]` "Catalog Linked" is metadata shown as a badge.
  - `[R7] [L]` Cards lift on hover (l.80).
  - `[S1] [L]` A failed load shows only a toast (l.183); every drag shows an "Order updated" toast.
  - `[C1] [L]` "Fields" → "Custom fields".

### opportunity-types/opportunity-type-dialog.tsx — Opportunity type editor
- **Elements:** "Create/Edit Opportunity Type" (sm) with Name, Description, Program select (with a long hint), an Icon popover (search, 36-icon grid) and a Color popover (24 swatches, Hex input); Cancel / Create|Update.
- **Findings:**
  - `[F1] [M]` A missing name is reported by toast (l.104-106), and Save uses `onClick` instead of submitting the form (l.145) → inline error and real form submit.
  - `[A1] [M]` The Program, Icon and Color labels are unlinked (l.176, 199, 248). Icon and swatch buttons have only `title` (l.228, 268) → `aria-label` and `aria-pressed`.
  - `[F1] [M]` The Hex field accepts invalid colours (l.286-291).
  - `[N1] [M]` There is no Active toggle.
  - `[E1] [L]` Re-implements the existing `ui/icon-picker` and `ui/color-picker`.
  - `[R1] [L]` 24 free hues → a limited palette of about 8 token colours.
  - `[C1] [L]` The hint text (l.192) is long and uses "--".

### activity-types/page.tsx — Activity Types
- **Elements:** Custom header with "Create Activity Type"; a Card "Configuration" ("Drag and drop to reorder"); sortable rows: drag handle, coloured tile with a fixed Workflow icon, name, "Identifier: {icon}" or "Standard Interaction", ACTIVE/INACTIVE badge, "Fields", Edit, Delete.
- **Findings:**
  - `[A1] [H]` The Edit and Delete icon buttons have no `aria-label` (l.126-136).
  - `[S1] [M]` Every row shows the Workflow icon whatever icon was chosen (l.99), and "Identifier: Phone" exposes the internal icon key (l.105) → show the chosen icon; use SLA or default outcome as the subtitle.
  - `[R5/R2] [M]` The extra "Configuration" card with icon tile and separator (l.252-264), the custom header and `text-lg font-extrabold` (l.232-236) → PageHeader plus the list.
  - `[R3] [M]` `text-[10px] font-bold uppercase` badge (l.112).
  - `[A2] [M]` Reordering is drag-only, and each reorder sends N PATCH requests (l.185-190) → one reorder endpoint plus Move up/down.
  - `[F2] [M]` Delete uses `confirm()` and gives no usage count (l.200) → prefer Deactivate.
  - `[S1] [L]` A failed load shows only a toast.

### activity-types/activity-type-dialog.tsx — Activity type editor
- **Elements:** Name, Icon select (10 icons), Color (native picker plus 8 swatches), Default SLA (Minutes) "Expected duration", Default Outcome, an Active switch; Cancel / Create|Update Type.
- **Findings:**
  - `[C1] [M]` "Default SLA" is described as "Expected duration" (l.286-288), mixing two ideas → "Default duration (min)", or explain what the SLA means.
  - `[E1] [M]` The outcome list here (SUCCESS, FOLLOW_UP_NEEDED, NO_ANSWER, VOICEMAIL, NOT_INTERESTED) differs from Gamification's `activity.outcome` list (gamification l.428) → one shared list.
  - `[A1] [M]` The Icon and Outcome labels are unlinked (l.219, 297); the native colour input has no label (l.254); the Color label is styled muted xs (l.248).
  - `[F1/E1] [L]` No required marker; reuse IconPicker and ColorPicker.

### custom-fields/page.tsx — Custom Fields (admin copy, not used by Settings)
- **Elements:** Custom header with "Add Custom Field"; Tabs Leads | Opportunities | Activities; card rows: Braces tile, label, field-type badge, Required badge, "Key:" code, options, Edit/Delete.
- **Findings:**
  - `[N1] [H]` A duplicate of `settings/custom-fields/page.tsx`, reachable only by URL → delete one of them.
  - `[R7] [M]` "Required" is a red destructive badge (l.160).
  - `[R4/R8/R3] [M]` Raw type badges ("TEXT", "SELECT") colour-coded by type, `text-[10px] font-extrabold` (l.33-40, 155-157).
  - `[T1] [M]` Cards → table with search; the model has an `order` field but there is no reordering.
  - `[C1] [L]` The description leaves out Opportunities (l.101); the empty state reads "No fields for leads" built from the lower-cased enum (l.130).

### custom-fields/custom-field-dialog.tsx — Custom field editor
- **Elements:** Raw Dialog (500px) with Object Type, Field Label, Field Key (auto-generated), Field Type, Dropdown Options textarea (comma-separated), Required switch; Cancel / Create|Update Field.
- **Findings:**
  - `[E1] [H]` The selects use `defaultValue`, so they are uncontrolled (l.217, 289). The editing values may not show after `reset` → `value={field.value}`.
  - `[E1] [M]` Options are a comma-separated textarea (l.321-331): no commas in values, no reordering, and renaming an option orphans existing data → a row-based list editor.
  - `[F1] [M]` Options and key-format checks are reported by toast (l.141-153) → inline errors via a schema refine.
  - `[M1] [M]` Uses raw Dialog instead of StandardDialog (l.196).
  - `[C1] [L]` "Object Type" → "Applies to".

### assignment-rules/page.tsx — Assignment Rules
- **Elements:**
  - PageHeader actions: Folder filter, Simulate, Create Rule.
  - A "Routing Logic" header strip.
  - Sortable rows: drag handle, name, entity-type badge, folder badge, Default badge, Active/Paused badge, description, a "P{priority}" chip, Edit, Delete.
  - A separate non-draggable list when a folder filter is on; the RuleBuilder sheet; SimulateDistributionDialog.
- **Findings:**
  - `[E1] [H]` Two competing ordering models: drag order and a numeric priority (the "P100" chip, l.84, 185-198; the builder's "Higher priority runs first", rule-builder l.406-415). The P values go stale after a drag → keep drag order only, shown as position numbers.
  - `[E1] [H]` A rule cannot be paused anywhere (no switch in the list or the builder), yet "Paused" is displayed → add a status switch column.
  - `[R8] [M]` Raw "LEAD"/"OPPORTUNITY" badges (l.57, 274) → Leads/Opportunities tabs, since ordering is per entity anyway.
  - `[R4/R3] [M]` Up to 5 badges per row; `font-extrabold uppercase` status (l.57-78) → table columns.
  - `[S1] [M]` The filtered view drops the status badge and duplicates the row markup (l.268-295).
  - `[A2] [M]` Reordering is silently disabled under a folder filter (explained only in a code comment, l.263-266) → visible hint; also add Move up/down.
  - `[R5/R2] [M]` The decorative "Routing Logic" strip (l.228-234) → remove; move the folder filter into a list toolbar.
  - `[F2] [M]` Delete uses `confirm()` (l.156). A failed reorder is not reverted (l.192-195).
  - `[S1] [L]` "Loading..." text (l.237); the empty state has no call to action (l.241).
  - `[N1] [L]` Folders can only be created inside the builder; they cannot be renamed or deleted.

### assignment-rules/rule-builder.tsx — Rule builder (right Sheet, 600–800px)
- **Elements:** Sections in order:
  - Rule Name, Description; Folder plus "New folder name"/Add.
  - Entity Type; Assignment Strategy (6 options with contextual help); Priority; Territory Field (conditional).
  - "Default (catch-all) rule" switch; Activation Window (Active from/until).
  - Routing Target ("Specific Users" / "Sales Group" toggle; a user checkbox grid with weights, or a group select).
  - Workload Limits & Skills (max open records; max new assignments per period, per day/week; required skills tags).
  - Fallback Owner; Rule Criteria (ConditionBuilder).
  - "Simulate this draft" (record select, Run, result Alert with candidates).
  - Footer: Cancel / Save Rule.
- **Findings:**
  - `[E1] [H]` The order is backwards: the criteria (the "when") come last (l.681-694) → When (entity, criteria) → Assign to (strategy, target, weights) → Limits → Schedule → Advanced (folder, fallback), using collapsible sections.
  - `[E1] [H]` No Active/Paused control, even though `form.isActive` exists (l.62, 129).
  - `[F1] [H]` No validation at all: blank name, empty user pool, no group selected, end date before start date. Save has no loading or disabled state (l.172-188, 760) → inline errors and a saving state.
  - `[R8] [H]` Territory Field is a free-text field key (l.424-428) → select from the condition fields.
  - `[R8] [M]` Picklist values are raw: NEW/QUALIFIED/LOST/WON, "FORM", LOW/MEDIUM/HIGH (l.44-53). They also disagree with the NBA lead statuses (NEW, CONTACTED, …) → one shared, labelled source.
  - `[A1] [M]` Many labels are unlinked: Folder, Entity Type, Strategy, Sales Group, both limits, Required skills, Fallback (l.330, 360, 375, 543, 571, 584, 611, 656). Also unlabelled: the default switch (l.433), the skill remove buttons (l.641), the weight inputs (l.516) and the "+" button (l.624).
  - `[R2] [M]` 8 bordered boxes stacked inside the sheet (l.419-696) → headings and dividers.
  - `[C1] [M]` Long helper paragraphs with "--" and internal wording ("no cursor/fairness state is touched", "rolling 24h/7d") (l.437, 445, 580, 607, 701) → one-line helpers.
  - `[E1] [M]` Switching Entity Type keeps conditions that refer to the other entity's fields (l.363) → warn and clear.
  - `[T1] [M]` The user pool is an unsearchable 2-column checkbox grid (l.495-534) → searchable multi-select with chips.
  - `[E1] [M]` Simulation is buried at the bottom; records fall back to showing their id (l.719); "no assignee" is shown as a destructive Alert (l.729) → a "Test rule" button in the footer.
  - `[E1] [L]` A new folder is saved immediately even if the rule is then cancelled (l.192-206). The description says "leads" even for opportunity rules (l.298). No unsaved-changes guard.
  - **Shared `components/common/condition-builder.tsx`** (also used by NBA, Commission and Gamification):
    - `[R3]` The title label is `text-xs font-bold uppercase` (l.134).
    - `[A1]` The Field/Operator/Value labels are repeated on every row and not linked (l.169, 189, 203).
    - `key={index}` (l.167).
    - No groups and no plain-language summary.
    - The generic empty text "applies whenever the event and audience match" (l.155) is wrong in several contexts.

### lead-scoring/page.tsx — Lead Scoring
- **Elements:**
  - PageHeader with "Recompute All" and "Add Rule"; Tabs Predictive | Features | Rules.
  - Predictive tab:
    - Info Alert.
    - "Predictive Scoring Controls": Enable switch; Leads/Opportunities switches; Objective; Minimum Historical Records; Lookback Window; Retrain Cadence; Fallback Mode; Promotion Approval; Feature Retention Days; Save Settings; Recompute Scores.
    - "Current State" card.
    - "Model Versions" tables (Version, Status, Algorithm, Brier, Holdout accuracy, Precision/Recall, Lift, Train/Holdout, Created, Promote / "Roll back to this").
  - Features tab: "Profile Coverage"; table (Feature, Module, Source, Coverage, Use/Sensitive/Prohibited switches).
  - Rules tab: info Alert; table (Rule Name, Condition, Score Δ, Status switch, Edit/Delete).
  - Rule dialog: Rule name *, Description, Field, Operator, Value, Score change, Order, Active.
- **Findings:**
  - `[N1] [H]` Opens on the advanced "Predictive" tab. The header's "Add Rule" and "Recompute All" only make sense on the Rules tab (l.169, 435-446) → open on Rules and move the actions into each tab's toolbar.
  - `[C1] [H]` Data-science jargon: Brier, Lift, Holdout, "Weighted calibration", Fallback Mode, Feature Retention Days (l.588, 664-673) → plain summaries ("78% accurate, better than current") with a "Technical metrics" disclosure.
  - `[E1] [H]` A separate home-made condition editor: 6 hard-coded fields, its own EQUALS/GT operators, free-text values, no custom fields (l.125-142, 972-1017) → use the shared ConditionBuilder.
  - `[E1] [H]` No way to preview or test scores → "Test against a lead" plus a score distribution.
  - `[R8] [M]` Raw values shown: the condition as monospace `source equals "x"` (l.878-882), LEAD/OPPORTUNITY badges (l.657, 799), "PROMOTED" (l.682), "LEAD, OPPORTUNITY" (l.622).
  - `[A2] [M]` Ordering is a numeric "Order — lower = first" (l.1031-1039), while Assignment uses drag plus "higher first" → one pattern.
  - `[A1] [M]` The table switches have no labels (l.806-822, 901). Edit/Delete have only tooltips, no `aria-label` (l.907, 915).
  - `[F2] [M]` Promote uses `confirm()` and then `window.prompt` (l.244-245) → one dialog with a notes field.
  - `[E1] [M]` Mixed save models: settings need Save, but rule and feature toggles save instantly (l.228-241, 357-367) → state the save behaviour visibly.
  - `[R2] [M]` Two info Alerts plus cards inside tabs (l.456, 834).
  - `[T1] [L]` The versions table has 10 columns; the feature catalog has no search.

### next-best-action/page.tsx — Next-Best-Action
- **Elements:**
  - EmptyState when the module is disabled; PageHeader; Tabs Leads | Opportunities.
  - Each tab, "Strategy Settings": Active switch, Max visible recommendations / user, Cooldown (hours), Daily action cap / user, Suppression Conditions (ConditionBuilder with All/Any).
  - Each tab, "Rules": Add Rule; rows (name, action-type badge, Inactive, "Needs manager approval", base priority · business value, Edit/Delete).
  - Rule dialog: Rule Name, Action Type, Eligibility Conditions, Base Priority (0-100), Business Value, Tie-break Priority, Task Title/Notes, Field Key/Field Value, List Id, Active, Requires manager approval.
- **Findings:**
  - `[E1] [H]` Strategy settings auto-save on every edit: any condition change sends a PUT and shows a "Strategy saved" toast (l.148-162, 274-276). The number fields are uncontrolled and save on blur (l.243-260) → a Save bar with dirty state, or debounced autosave with a quiet "Saved" note.
  - `[R8] [H]` Users have to type IDs: "Owner User Id" (l.69, 78), "Stage Id" (l.72), "List Id" (l.405-409), "Field Key" (l.388-392) → user picker, stage select, list picker, field select.
  - `[C1] [H]` Three unexplained priority numbers: Base Priority, Business Value, Tie-break (l.357-370) → one High/Med/Low priority, with the rest under Advanced and explained.
  - `[R8/R3] [M]` Raw "CREATE_TASK" badges at `text-[0.65rem]` (l.298); raw status and score-band options (l.64-66, 74).
  - `[M1] [M]` A 600px dialog holds the ConditionBuilder, and its `2xl:grid-cols-3` layout never applies there (l.357) → side sheet.
  - `[F1] [M]` Name is checked by toast; Save has no loading state (l.187-190, 328).
  - `[A1] [M]` The Task Title/Notes label is unlinked (l.373).
  - `[F2] [M]` Delete uses `confirm()` (l.206).
  - `[S1] [L]` "Add to List (Lead only)" is offered on the Opportunities tab.
  - `[C1] [L]` "Next-Best-Action" → "Recommendations".

### commission-rules/page.tsx — Commission Rules
- **Elements:** EmptyState when the feature is off; PageHeader with "Add Rule"; rule cards (name, "priority N" badge, "inactive" badge, partner · product · conditions, ₹ or % value, Edit/Delete); dialog with Name, Partner (optional), Product (optional), Type, Percentage/Flat Amount, Priority ("Higher tried first"), Eligibility Conditions, Active.
- **Findings:**
  - `[F1] [H]` No value checks: a percentage over 100, negative values or 0 are all accepted (l.301-308); Save only needs a name (l.236).
  - `[E1] [H]` "First match wins", but there is no way to test which rule matches and what it pays → a "Test against an opportunity" panel.
  - `[T1] [M]` The list does not show evaluation order (l.188-225) → table sorted by order with a position column, drag instead of a priority number.
  - `[R3/R4] [M]` Lower-case "priority N" and "inactive" badges at `text-[0.65rem]` (l.195-201).
  - `[C1] [M]` "Product" here vs "Opportunity Type" elsewhere (l.150, 267); "₹" is hard-coded (l.213, 302) → workspace currency.
  - `[R8] [M]` The partner name falls back to an id (l.143); raw picklist values (l.149-153).
  - `[F2] [M]` Delete uses `confirm()` and says nothing about the commission ledger history (l.133).
  - `[S1] [L]` A duplicate loading branch (l.169, 174).
  - `[M1] [L]` Small dialog containing a ConditionBuilder → sheet.

### payout-cycles/page.tsx — Payout Cycles
- **Elements:**
  - Tabs Configuration | Visibility | Billing Identity | Cycles & Payouts | Disputes(N).
  - Configuration has **nested tabs**:
    - Cycle Rules: Frequency, Anchor Day, Custom Interval; Save Settings; Generate Next Cycle.
    - Tax & Invoice: HSN/SAC, GST Rate, Invoice Number Pattern; Save Tax Rules.
    - Finance Controls: Minimum Payout, Approval Mode, Auto-Approve Below, Hold Reasons (comma-separated), two switches, Adjustment Reasons (comma-separated); Save Finance Controls.
  - Visibility: Visibility Mode plus 4 checklists (Users, Teams, Sales Groups, Partner Orgs); Save Visibility.
  - Billing Identity: Legal Name, GSTIN, State, Address 1/2, City, Postal Code; Save Billing Identity.
  - Cycles & Payouts:
    - Cycle list buttons; Export CSV; "Recompute from ledger".
    - Payout cards: checkbox, partner, amount, status, HELD.
    - Card buttons: Approve, Adjust, Generate Invoice, Hold/Release Hold, Invoice download, Cancel & Reissue, Mark Paid.
  - Disputes: Dismiss / Mark Resolved.
  - Dialogs: Mark Payout as Paid (UTR), Place Payout on Hold, Create Payout Adjustment, Cancel & Reissue Invoice. Bulk action: Approve.
- **Findings:**
  - `[N1] [H]` Day-to-day finance work (cycles, approvals, invoices, disputes) lives inside Settings (l.513-524) → move Cycles & Payouts and Disputes to a Finance/Payouts workspace; Settings keeps configuration only.
  - `[N1] [H]` Tabs inside tabs (l.527-534) → one scrolling settings page with sections.
  - `[E1] [H]` One settings object is saved by 5 differently named buttons, and each one PUTs everything (l.294-304, 608, 673, 755, 800, 884). This is misleading, and edits made on another tab are saved silently → one page-level Save bar.
  - `[R9] [H]` Up to 7 inline buttons per payout (l.984-1041) → one next-step button (Approve → Generate invoice → Mark paid) plus a kebab; payouts in a DataTable with status filter and search.
  - `[F2] [H]` Approve, bulk Approve and "Recompute from ledger" have no confirmation (l.347-394, 939-942). Bulk approve shows success even when some fail (l.391).
  - `[F2] [M]` Disputes are resolved through `window.prompt` (l.227), and dispute rows do not show the payout amount or a link to it (l.1079-1105).
  - `[F1] [M]` The Hold and Adjust dialogs show a Select and an always-visible text box that edit the same value (l.1150-1166, 1203-1213) → show the text box only for "Custom reason".
  - `[F1] [M]` Reason lists are edited as comma-separated text (l.725-752); no GSTIN or postal-code validation (l.829-881); "Auto-Approve Below" stays visible in Manual mode (l.716-723).
  - `[R8/R3] [M]` Raw DRAFT/APPROVED/INVOICED/PAID, OPEN/CLOSED and HELD at `text-[0.65rem]` (l.913-983); uppercase checklist titles (l.1273).
  - `[R7] [M]` A red HELD badge, red hold text and a destructive icon tile on Disputes (l.980, 1048, 1063).
  - `[S1] [M]` Cycles show no dates or totals (l.901-918). "Generate Next Cycle" is on the Configuration tab, while the Cycles empty state says "Generate … above" (l.611, 898).
  - `[S1] [L]` If the visibility targets fail to load, saving is blocked for all settings (l.608).
  - `[R1] [L]` Decorative icon tiles in 4 colours (l.539-1063).
  - `[C1] [L]` "₹" and the Indian states list are hard-coded (l.133, 974); meta copy such as "not just UI hints" (l.688).
  - `[N1] [L]` `TargetChecklist` is duplicated in Gamification → shared, searchable AudiencePicker.

### gamification/page.tsx — Gamification
- **Elements:**
  - 3 KPI tiles; Tabs Point Rules | Badges | Settings | Redemptions.
  - Settings tab has its own Save and **nested tabs**:
    - Levels: Name, Minimum points, Color, remove; Add Level.
    - Leaderboard: Scope, Period, Include partners, Anonymize partners.
    - Rewards: Name, Points cost, Reward type, remove; Add Reward.
    - Guardrails: Daily Cap, Duplicate Window, Review Above.
    - Participants: mode plus 4 checklists.
  - Redemptions queue: Fail & Refund, Fulfill.
  - Rule list and Badge list.
  - Point Rule dialog: Name, Trigger Event, Audience, Points Preset, Priority Preset, Custom Points, Custom Priority, Award Conditions, Active.
  - Badge dialog: Icon, Name, Description, Counts Trigger Event, Threshold Preset, Window, Custom Threshold, Custom Window Days, Audience, Active.
- **Findings:**
  - `[R8] [H]` Raw event enums (LEAD_CREATED, STAGE_CHANGED) in selects and badges, and raw audience values (l.23-31, 805-808, 860-862, 906, 1032) → label map.
  - `[F1/E1] [H]` Each value appears twice: a preset select and a "Custom" number box for Points, Priority, Threshold and Window (l.923-972, 1040-1086) → one number input with suggestion chips.
  - `[N1] [H]` Tabs inside the Settings tab, with one Save covering 5 sub-tabs (l.493-507). The Redemptions queue is day-to-day work → flat sections; move redemptions to a workspace page.
  - `[F2] [H]` Fulfil and Fail & Refund use chained `window.prompt` calls (l.245-248), and the refund cannot be undone → a reason/reference dialog with confirmation.
  - `[M1] [H]` The Rule and Badge dialogs are 444px wide ("xs") but hold a ConditionBuilder and 10+ fields (l.886, 993) → sheet of at least 640px.
  - `[R5] [M]` KPI tiles on a settings page (l.448-472) → remove; put counts in the tab labels.
  - `[R3] [M]` Uppercase xs labels (l.452-689, 1123) and badges at `text-[0.6rem]` and `text-[0.65rem]` (l.731, 804-817).
  - `[E1] [M]` Level colours are typed as hex (l.522); no check that minimum points rise or are unique.
  - `[C1] [M]` The page description "Matching point rules stack." (l.446) is cryptic; "Point Rule above" refers to a different tab (l.1037).
  - `[R8] [M]` Raw userId fallback (l.747), raw "REQUESTED" (l.755), raw outcome enums (l.428); "Record Owner" offers only partners (l.431).
  - `[F2] [M]` Rule and badge delete use `confirm()` (l.331, 390).
  - `[T1] [L]` Redemptions are cut at 12 (`slice(0,12)`) with no paging (l.741).
  - `[A1] [L]` The Participants mode select has no label (l.694).
  - `[S1] [L]` Ten requests in one `Promise.all` (l.193); any single failure blanks the whole page.

### security/page.tsx — Security Policies
- **Elements:**
  - Permission gate; PageHeader with "Edit Policy" (switches to Cancel / Save Changes); a Policy selector.
  - Cards:
    - Password Policy: 3 number fields, 4 switches.
    - Login & Session: 4 number fields, 3 switches.
    - Multi-Factor Authentication: mode and grace period.
    - Audit & Compliance: 2 switches.
    - Privileged Action Controls.
    - Reassignment Governance: switch and 2 number fields.
- **Findings:**
  - `[N1] [H]` Only platform admins can use it (it calls `/platform-admin/security`), yet it appears in the tenant Settings nav as "Security". Tenant admins see a red "no permission" message (l.155-161) → hide the nav item, or give tenant admins their own scoped policy page.
  - `[C1/S1] [H]` Toggles labelled "not yet enforced" are shown and saved (l.321, 327, 383) → hide them, or show them disabled as "coming soon".
  - `[F2] [H]` Requiring MFA for everyone, shortening session timeouts or changing lockout applies org-wide with no impact check (l.350-362) → confirm with an impact summary.
  - `[E1] [M]` Everything is read-only until "Edit Policy" is clicked (l.186) → always editable, with a sticky Save/Discard bar when there are changes.
  - `[F1] [M]` Number fields have no min/max, so 0 or negative values are accepted (l.64-78).
  - `[R7] [M]` The permission-denied message is red (l.157).
  - `[C1] [M]` Card descriptions point to other screens and internals (l.226, 383, 423).
  - `[R2] [L]` Six cards with bordered switch rows (l.90).
  - `[S1] [L]` The save toast ends with "!"; a raw `toLocaleString` instead of the workspace formatter (l.374).

### plans/page.tsx — Subscription Plans (orphan, platform data)
- **Elements:** Custom header with "Create Plan"; plan cards (Active switch, $ price per month/year, Users/Storage/API limits, Edit Plan); raw Dialog with Name, Price, Billing Cycle, Limits (Users, Storage, API Calls).
- **Findings:**
  - `[N1] [H]` Not linked anywhere, platform-scoped, and **the only one of the four platform pages with no `isPlatformAdmin` check** (l.101-131) → move to `/platform-admin/plans` with a gate, or delete.
  - `[F2] [H]` The Active switch deactivates a plan instantly with no confirmation and no success message (l.173-183, 209).
  - `[A1] [M]` FormField labels are not linked to inputs (l.83-91).
  - `[M1] [M]` Raw Dialog; Save has no loading state (l.259, 363).
  - `[S1] [M]` No empty state and no error state (l.198-257).
  - `[C1] [L]` "$" hard-coded; `features` and `description` cannot be edited; the custom header has a border (l.186-196).

### rate-limits/page.tsx — Rate Limiting Dashboard (orphan)
- **Elements:** Permission text; full-screen loader; h2 "Rate Limiting Dashboard"; yellow or blue info card; 2 KPI cards; "Tenants With Active Violations" list; "By Category" list.
- **Findings:**
  - `[N1] [H]` Orphaned platform page → move to `/platform-admin`, or remove.
  - `[R1/R7] [M]` Raw palette colours (yellow-500, blue-500, red-500) instead of design tokens (l.76-145).
  - `[S1] [M]` A "live snapshot" with no refresh button and no timestamp.
  - `[R5] [M]` `text-3xl` header, `p-8` padding, `h-screen` loader (l.63-73).
  - `[C1] [L]` Long internal explanations; "Tenant workspace" filler text (l.142); raw category keys (l.178).

### usage/page.tsx — Usage Monitoring (orphan)
- **Elements:** h2 "Usage Monitoring"; warning card; 4 KPI cards (Tenants, Users, Leads, Activities); an "Automation Monitoring" card (Total Rules, Success Rate, Failed, Last 24h, Top rules).
- **Findings:**
  - `[N1] [H]` Orphaned platform page.
  - `[S1] [M]` When data is unavailable it still shows "0" because of `|| 0` (l.131-220), contradicting its own banner → show "—".
  - `[R7/R5] [L]` green-500 and red-500 icons (l.198, 209); custom header; no time range.

### tenants/page.tsx — Tenants (orphan, duplicates /platform-admin/tenants)
- **Elements:** Access-denied block; custom header with "Create Tenant"; DataTable (Organization, Plan, Status, Users, Data Usage, Created, a Manage Features gear, a kebab with Suspend/Activate Tenant).
- **Findings:**
  - `[N1] [H]` Duplicates `/platform-admin/tenants`, which already has approval flows → delete this one.
  - `[F2] [H]` Suspend Tenant runs immediately from the menu (l.191-198) → confirm by typing the tenant name.
  - `[C1] [M]` The toast `${status.toLowerCase()}d` produces "suspendedd" and "actived" (l.73).
  - `[A1] [M]` Icon buttons have only tooltips, no `aria-label` (l.171, 183).
  - `[R4/R3] [M]` The plan is shown twice (l.94, 104); uppercase bold badges.
  - `[T1] [L]` No search or filters; a failed load shows only a toast.

### Settings nav — `settings/components/sidebar-nav.tsx` (context, not in P7)
- `[N1] [H]` About 35 items in one flat list. Personal items (Password, 2FA, Active Sessions) sit next to org admin; Teams and Sales Groups are far apart; Payouts and Commission sit between Partners and Opportunity Types → group into: Organization · People & access · Sales process · Automation & intelligence · Partners & finance · Security & compliance · My account.

---

### (a) Top 15 changes
1. **Add one ConfirmDialog/ReasonDialog primitive** (AlertDialog based). Replace all 17 `confirm()` and 5 `window.prompt()` calls, and add confirmation to the unconfirmed risky actions: tenant suspend, partner-login suspend, payout approve/recompute, plan deactivate, MFA "required for all", session revoke. Offer undo toasts where the action can be reversed.
2. **Fix the silent-failure bugs:**
   - edit-user drops `permissionTemplateId`;
   - custom-field selects use uncontrolled `defaultValue`;
   - NBA strategy sends a PUT and a toast on every edit;
   - bulk partner suspend and bulk payout approve report success even when updates fail;
   - the tenants toast typo ("suspendedd");
   - stale "P" numbers after an assignment-rule drag.
3. **Clean up the IA:**
   - delete the duplicate `admin/custom-fields` and `admin/tenants`;
   - move plans, usage and rate-limits under `/platform-admin` with gates;
   - hide Security from non-platform admins;
   - point the Pipelines redirect at `/settings`;
   - group the Settings sidebar;
   - merge or clearly separate Teams and Sales Groups.
4. **Move day-to-day queues out of Settings:** payout cycles, approvals, invoices and disputes, and gamification redemptions, go to a Finance/Payouts workspace.
5. **One save model:**
   - configuration pages use a sticky "Unsaved changes · Discard / Save" bar;
   - items in a list are edited in a side panel with an explicit Save;
   - no per-tab Save buttons, no autosave toasts, no read-only "Edit mode" (Security).
6. **Standard config-list page:** PageHeader, then a one-row toolbar (search, at most 2 filters, the primary action), then a DataTable, with row click opening a side panel. Apply it to roles, opportunity types, activity types, custom fields, assignment/commission/NBA/gamification rules, partners and payouts.
7. **A central label map for every enum** (statuses, entity types, trigger events, action types, outcomes, field types, record access, partner login roles). Remove every typed-ID field (NBA owner, stage, list and field key; assignment territory field).
8. **One rule-builder model.** Lead scoring moves to the shared ConditionBuilder. Picklists come from one shared source. Editors follow "When → Assign/Award → Limits → Advanced". A "Test against record" panel is added to scoring, commission, NBA and gamification (Assignment already has a simulator).
9. **One ordering model:** drag plus Move up/down menu items, shown as position numbers. Remove the numeric priority/order fields (assignment, commission, gamification, scoring order, NBA tie-break) or move them under Advanced.
10. **Roles become a permission matrix** (modules × None/View/Edit/Full) with record-access as a segmented control, visible template inheritance, a users-affected count, and deletion blocked or a reassignment flow. Add Duplicate role.
11. **Build the missing editors:**
    - a stage/pipeline editor per opportunity type;
    - Active toggles for opportunity types and assignment rules;
    - sales-group editing;
    - partner profile and logins on the partner page;
    - a Reactivate user action.
12. **Visual de-cluttering:**
    - remove `uppercase` and all text below 12px (`text-[10px]`/`[11px]`/`[0.6rem]`/`[0.65rem]`);
    - badges only for status; "Required" and "HELD" shown neutral unless action is needed;
    - remove the decorative strips ("Sales Organization", "Routing Logic", "Configuration"), icon tiles, KPI tiles on settings pages, hover lifts and framer-motion;
    - use PageHeader everywhere and drop the extra `px-4 py-4`.
13. **Accessibility pass:**
    - `aria-label` on every icon button (activity types, sales-group delete, scoring actions, tenants, opportunity-type icon and colour swatches);
    - `htmlFor`/id on every label (rule builder, edit user, dialogs);
    - labelled switches inside tables;
    - ConditionBuilder per-row labels such as "Condition 2 field";
    - dnd announcements.
14. **Form quality:**
    - zod inline errors (commission percentage ≤ 100, GSTIN/PAN, hex colours, date ranges, security min/max, rule name and target);
    - a consistent required/optional convention; Save loading and disabled states; unsaved-changes guards;
    - list editors instead of comma-separated text (dropdown options, hold and adjustment reasons);
    - one number field instead of preset + custom pairs;
    - reuse `ui/icon-picker` and `ui/color-picker`.
15. **Users and invites:**
    - users list gets search, filters, server paging and compact density;
    - real email invites (or an honest "Add user" with a generated password and force-change on first login);
    - password rules from the security policy;
    - a searchable manager/user combobox;
    - a shared skills vocabulary between users and assignment rules.

### (b) Standard patterns

**List of configuration items (table, side panel or dialog)**
- **Page:**
  - PageHeader: title, one-line description, one primary "New X" button.
  - Toolbar row: search, at most 2 filter selects (for example Status, Applies to), with secondary actions in an overflow menu.
  - DataTable columns: position or drag (if ordered), Name + secondary line, 2–4 key attributes as plain text, Status (inline Switch for active/paused; otherwise status text), Updated, ⋯ menu (Duplicate, Move, Delete).
  - States: skeleton rows, ErrorState with Retry, empty state with the primary call to action.
- **Editor choice:**
  - **Dialog** (StandardDialog, at most 600px): only for create forms with 5 or fewer simple fields (activity type, sales group create, custom field) and for confirmations.
  - **Right side panel** (Sheet, 640–800px): items with up to about 15 fields or one condition builder (assignment, commission, NBA, gamification and scoring rules; user edit; partner login). Header: name + status switch + ⋯. Body: titled sections with dividers, not boxes. Sticky footer: Cancel, Test (if a rule), Save (disabled until changed, shows loading). Unsaved-changes guard.
  - **Full page** `/settings/x/[id]` with tabs: complex objects with sub-lists, namely Role (permission matrix + Users), Opportunity type (Details / Stages / Fields), Partner (Overview / Logins / Commission / Payouts / Profile), Sales group (Details / Members / Territories).

**Condition / rule builder**
- Reads as a sentence: "When a **[Lead]** is **[created/updated]** and **[All ▾ / Any ▾]** of these match:".
- Rows: Field → Operator → Value.
  - **Field:** searchable, grouped by object, includes custom fields.
  - **Operator:** depends on the field type.
  - **Value:** depends on the field type: picklist multi-select from the shared enum source with labels, user/team picker, date with relative options ("in last 7 days"), number with units. Never a typed ID.
- Row ⋯ menu: Duplicate, Remove. "Add condition" and at most one level of "Add group".
- A plain-language summary under the builder ("Leads from Website or Referral with score ≥ 50").
- Validation: incomplete rows highlighted inline; changing the field resets the value; changing the entity warns and clears.
- "Test against a record" (searchable record picker) shows pass/fail per row and the resulting outcome (owner, score Δ, commission, points).
- Accessibility: column headers shown once; each row's controls get `aria-label` "Condition N field/operator/value"; key on a stable id.
- Then/Assign section beneath, then Limits and schedule, then an Advanced section, collapsed.

**Reorderable lists**
- Table with a visible position column (1, 2, 3 …), which is the only ordering model (no separate numeric priority).
- Drag handle is a `button` with `aria-label` "Reorder {name}" and `aria-describedby` instructions. Use the dnd-kit keyboard sensor with `accessibility.announcements`; vertical list strategy only, no grids.
- Row ⋯ menu: Move to top / Move up / Move down / Move to bottom.
- Persist with one reorder endpoint (no N PATCH requests). Update optimistically and revert and refetch on failure. A quiet inline "Order saved" note, not a toast.
- When filtered or searched, reordering is disabled and a visible banner says "Clear filters to reorder".
- Applies to: stages, opportunity types, activity types, custom fields, assignment, commission and scoring rules, gamification levels (auto-sorted by minimum points instead).

**Permission matrix**
- **List view:** a roles table (Users, Record access, Type Internal/Partner) plus a "Compare roles" read-only matrix (roles as columns).
- **Editor** (full page):
  - Role type (Internal / Partner) chosen at creation and shown as text.
  - Template: "Based on [template] ▾", with per-row "Overridden" markers and a Reset.
  - Matrix: rows are modules (grouped Sales / Activities / Admin / Integrations); columns None · View · Edit · Full, one `role="radiogroup"` per row with arrow-key navigation. A column-header "Set all".
  - Record access as a segmented control (Own / Team / All) with one sentence of explanation.
  - Risk callouts only where needed (Admin Full, Integrations Full).
  - Impact line "Changes apply to 12 users", Save bar, and "Last changed by … on …".
- **Delete:** blocked while users are assigned, or a dialog that forces reassignment.

### (c) Destructive and high-impact actions: how they are confirmed today

| Page | Action | Confirmation today |
|---|---|---|
| Users | Deactivate user (single and bulk) | `confirm()` l.137 |
| Users | Reset MFA | `confirm()` l.106 |
| Users | Revoke session | **none** l.91 |
| Users | Bulk assign manager | form dialog only |
| Users | Reactivate | does not exist |
| Edit user | Remove skill category | none (form not yet saved); Cancel discards edits without asking |
| Roles | Delete role | `confirm()` l.65 (even when users are assigned) |
| Roles | Toggle "External partner role" | **none** |
| Sales groups | Delete group | `confirm()` l.69 |
| Sales groups | Inline permission-template change | **none**, saves instantly l.136 |
| Sales groups | Remove member | **none** manage-members l.57 |
| Partners | Bulk suspend | `confirm()` l.93 |
| Partners | Per-login Status → Suspended | **none**, instant l.244 |
| Partners | Login role / reports-to / payout access changes | **none**, instant |
| Opportunity types | Delete | `confirm()` l.237 (blocked if it has opportunities) |
| Opportunity types | Reorder | none |
| Activity types | Delete | `confirm()` l.200 |
| Activity types | Reorder | none |
| Custom fields (admin) | Delete ("Existing data will be lost") | `confirm()` l.67 |
| Assignment rules | Delete | `confirm()` l.156 |
| Assignment rules | Reorder | none, no revert on failure |
| Assignment rules | Create folder (saved even if rule cancelled) | none |
| Lead scoring | Delete rule | `confirm()` l.347 |
| Lead scoring | Toggle rule | none |
| Lead scoring | Feature Use / Sensitive / Prohibited toggles | **none**, instant |
| Lead scoring | Promote / roll back model | `confirm()` + `window.prompt` l.244-245 |
| Lead scoring | Recompute all | `confirm()` l.370 |
| Lead scoring | Predictive recompute | `confirm()` l.403 |
| Next-best-action | Delete rule | `confirm()` l.206 |
| Next-best-action | Strategy Active toggle, caps, suppression edits | **none**, auto-saved |
| Commission rules | Delete | `confirm()` l.133 |
| Payout cycles | Approve (single) | **none** l.361 |
| Payout cycles | Bulk approve | **none** l.375 |
| Payout cycles | Recompute from ledger | **none** l.347 |
| Payout cycles | Generate next cycle | none |
| Payout cycles | Generate invoice | none |
| Payout cycles | Release hold | none |
| Payout cycles | Mark paid | dialog requiring a UTR, but no warning text |
| Payout cycles | Hold | dialog requiring a reason |
| Payout cycles | Adjustment | dialog |
| Payout cycles | Cancel & Reissue invoice | dialog with destructive button + required reason (best current example) |
| Payout cycles | Resolve / dismiss dispute | `window.prompt` l.227 |
| Gamification | Delete rule | `confirm()` l.331 |
| Gamification | Delete badge | `confirm()` l.390 |
| Gamification | Remove level / reward | none (until Save) |
| Gamification | Fulfil / Fail & Refund redemption | chained `window.prompt` l.245-247 |
| Security | Save policy (MFA required, timeouts, lockout) | **none** (only the Edit-mode gate) |
| Plans | Toggle plan active | **none** l.173 |
| Tenants | Suspend / activate tenant | **none** l.191-206 |

Totals: 17 `confirm()` calls and 5 `window.prompt()` calls. There is no confirm-dialog component in the codebase.

---

# Index: all files and where each is reviewed

| # | File | Lines | Partition | Note |
|---|---|---|---|---|
| 1 | `src/app/bootstrap/page.tsx` | 178 | P5 |  |
| 2 | `src/app/case-survey/[id]/page.tsx` | 93 | P5 |  |
| 3 | `src/app/dashboard/activities/activities-mobile-list.tsx` | 100 | P2 |  |
| 4 | `src/app/dashboard/activities/activity-form.tsx` | 323 | P2 |  |
| 5 | `src/app/dashboard/activities/columns.tsx` | 134 | P2 |  |
| 6 | `src/app/dashboard/activities/create-activity-dialog.tsx` | 71 | P2 |  |
| 7 | `src/app/dashboard/activities/page.tsx` | 313 | P2 |  |
| 8 | `src/app/dashboard/admin/activity-types/activity-type-dialog.tsx` | 335 | P7 |  |
| 9 | `src/app/dashboard/admin/activity-types/page.tsx` | 323 | P7 |  |
| 10 | `src/app/dashboard/admin/assignment-rules/page.tsx` | 306 | P7 |  |
| 11 | `src/app/dashboard/admin/assignment-rules/rule-builder.tsx` | 768 | P7 |  |
| 12 | `src/app/dashboard/admin/commission-rules/page.tsx` | 343 | P7 |  |
| 13 | `src/app/dashboard/admin/custom-fields/custom-field-dialog.tsx` | 378 | P7 |  |
| 14 | `src/app/dashboard/admin/custom-fields/page.tsx` | 217 | P7 |  |
| 15 | `src/app/dashboard/admin/gamification/page.tsx` | 1147 | P7 |  |
| 16 | `src/app/dashboard/admin/lead-scoring/page.tsx` | 1055 | P7 |  |
| 17 | `src/app/dashboard/admin/next-best-action/page.tsx` | 460 | P7 |  |
| 18 | `src/app/dashboard/admin/opportunity-types/opportunity-type-dialog.tsx` | 301 | P7 |  |
| 19 | `src/app/dashboard/admin/opportunity-types/page.tsx` | 324 | P7 |  |
| 20 | `src/app/dashboard/admin/partners/[id]/page.tsx` | 180 | P7 |  |
| 21 | `src/app/dashboard/admin/partners/add-partner-dialog.tsx` | 243 | P7 |  |
| 22 | `src/app/dashboard/admin/partners/add-partner-login-dialog.tsx` | 194 | P7 |  |
| 23 | `src/app/dashboard/admin/partners/page.tsx` | 299 | P7 |  |
| 24 | `src/app/dashboard/admin/payout-cycles/page.tsx` | 1296 | P7 |  |
| 25 | `src/app/dashboard/admin/pipelines/page.tsx` | 6 | P7 | Redirect only |
| 26 | `src/app/dashboard/admin/plans/page.tsx` | 372 | P7 |  |
| 27 | `src/app/dashboard/admin/rate-limits/page.tsx` | 196 | P7 |  |
| 28 | `src/app/dashboard/admin/roles/page.tsx` | 209 | P7 |  |
| 29 | `src/app/dashboard/admin/roles/role-dialog.tsx` | 344 | P7 |  |
| 30 | `src/app/dashboard/admin/sales-groups/manage-members-dialog.tsx` | 165 | P7 |  |
| 31 | `src/app/dashboard/admin/sales-groups/page.tsx` | 237 | P7 |  |
| 32 | `src/app/dashboard/admin/sales-groups/sales-group-dialog.tsx` | 131 | P7 |  |
| 33 | `src/app/dashboard/admin/security/page.tsx` | 455 | P7 |  |
| 34 | `src/app/dashboard/admin/tenants/page.tsx` | 262 | P7 |  |
| 35 | `src/app/dashboard/admin/usage/page.tsx` | 247 | P7 |  |
| 36 | `src/app/dashboard/admin/users/bulk-assign-manager-dialog.tsx` | 169 | P7 |  |
| 37 | `src/app/dashboard/admin/users/edit-user-dialog.tsx` | 468 | P7 |  |
| 38 | `src/app/dashboard/admin/users/invite-user-dialog.tsx` | 297 | P7 |  |
| 39 | `src/app/dashboard/admin/users/page.tsx` | 426 | P7 |  |
| 40 | `src/app/dashboard/applications/[id]/page.tsx` | 14 | P5 |  |
| 41 | `src/app/dashboard/applications/numbering/page.tsx` | 46 | P5 |  |
| 42 | `src/app/dashboard/applications/page.tsx` | 49 | P5 |  |
| 43 | `src/app/dashboard/approvals/page.tsx` | 141 | P5 |  |
| 44 | `src/app/dashboard/automations-v2/[id]/page.tsx` | 3558 | P4 |  |
| 45 | `src/app/dashboard/automations-v2/page.tsx` | 226 | P4 |  |
| 46 | `src/app/dashboard/call-center/campaigns/[id]/page.tsx` | 141 | P5 |  |
| 47 | `src/app/dashboard/call-center/page.tsx` | 473 | P5 |  |
| 48 | `src/app/dashboard/cases/[id]/page.tsx` | 490 | P5 |  |
| 49 | `src/app/dashboard/cases/page.tsx` | 327 | P5 |  |
| 50 | `src/app/dashboard/exports/page.tsx` | 352 | P5 |  |
| 51 | `src/app/dashboard/forms/[formId]/page.tsx` | 128 | P4 |  |
| 52 | `src/app/dashboard/forms/page.tsx` | 281 | P4 |  |
| 53 | `src/app/dashboard/layout.tsx` | 12 | P5 |  |
| 54 | `src/app/dashboard/leaderboard/page.tsx` | 174 | P5 |  |
| 55 | `src/app/dashboard/leads/[id]/page.tsx` | 686 | P2 |  |
| 56 | `src/app/dashboard/leads/columns.tsx` | 194 | P2 |  |
| 57 | `src/app/dashboard/leads/create-lead-dialog.tsx` | 70 | P2 |  |
| 58 | `src/app/dashboard/leads/edit-lead-dialog.tsx` | 86 | P2 |  |
| 59 | `src/app/dashboard/leads/lead-form.tsx` | 23 | P2 |  |
| 60 | `src/app/dashboard/leads/lead-quick-view.tsx` | 155 | P2 |  |
| 61 | `src/app/dashboard/leads/mobile-list.tsx` | 78 | P2 |  |
| 62 | `src/app/dashboard/leads/page.tsx` | 584 | P2 |  |
| 63 | `src/app/dashboard/lists/[id]/page.tsx` | 425 | P2 |  |
| 64 | `src/app/dashboard/lists/page.tsx` | 349 | P2 |  |
| 65 | `src/app/dashboard/marketing/page.tsx` | 720 | P3 |  |
| 66 | `src/app/dashboard/my-points/page.tsx` | 252 | P5 |  |
| 67 | `src/app/dashboard/opportunities/[id]/page.tsx` | 638 | P2 |  |
| 68 | `src/app/dashboard/opportunities/create-opportunity-dialog.tsx` | 71 | P2 |  |
| 69 | `src/app/dashboard/opportunities/edit-opportunity-dialog.tsx` | 97 | P2 |  |
| 70 | `src/app/dashboard/opportunities/opportunity-form.tsx` | 216 | P2 |  |
| 71 | `src/app/dashboard/opportunities/page.tsx` | 729 | P2 |  |
| 72 | `src/app/dashboard/page.tsx` | 16 | P3 |  |
| 73 | `src/app/dashboard/payouts/page.tsx` | 596 | P5 |  |
| 74 | `src/app/dashboard/reports/page.tsx` | 3246 | P3 |  |
| 75 | `src/app/dashboard/settings/activity-types/page.tsx` | 2 | P6 | Re-export of `../../admin/activity-types/page`; reviewed under P7 |
| 76 | `src/app/dashboard/settings/agent-availability/page.tsx` | 194 | P6 |  |
| 77 | `src/app/dashboard/settings/ai-assistant/page.tsx` | 354 | P6 |  |
| 78 | `src/app/dashboard/settings/api-keys/page.tsx` | 370 | P6 |  |
| 79 | `src/app/dashboard/settings/assignment-rules/page.tsx` | 2 | P6 | Re-export of `../../admin/assignment-rules/page`; reviewed under P7 |
| 80 | `src/app/dashboard/settings/call-campaigns/[id]/analytics/page.tsx` | 97 | P6 |  |
| 81 | `src/app/dashboard/settings/call-campaigns/page.tsx` | 405 | P6 |  |
| 82 | `src/app/dashboard/settings/call-dispositions/page.tsx` | 443 | P6 |  |
| 83 | `src/app/dashboard/settings/call-scripts/page.tsx` | 328 | P6 |  |
| 84 | `src/app/dashboard/settings/catalog/page.tsx` | 236 | P6 |  |
| 85 | `src/app/dashboard/settings/commission-rules/page.tsx` | 2 | P6 | Re-export of `../../admin/commission-rules/page`; reviewed under P7 |
| 86 | `src/app/dashboard/settings/components/sidebar-nav.tsx` | 323 | P6 |  |
| 87 | `src/app/dashboard/settings/custom-fields/create-custom-field-dialog.tsx` | 204 | P6 |  |
| 88 | `src/app/dashboard/settings/custom-fields/page.tsx` | 137 | P6 |  |
| 89 | `src/app/dashboard/settings/dedupe/page.tsx` | 316 | P6 |  |
| 90 | `src/app/dashboard/settings/duplicate-rules/page.tsx` | 57 | P6 |  |
| 91 | `src/app/dashboard/settings/gamification/page.tsx` | 2 | P6 | Re-export of `../../admin/gamification/page`; reviewed under P7 |
| 92 | `src/app/dashboard/settings/governance/audit-logs/page.tsx` | 509 | P6 |  |
| 93 | `src/app/dashboard/settings/governance/gdpr/page.tsx` | 214 | P6 |  |
| 94 | `src/app/dashboard/settings/integrations/page.tsx` | 2707 | P6 |  |
| 95 | `src/app/dashboard/settings/layout.tsx` | 20 | P6 |  |
| 96 | `src/app/dashboard/settings/lead-scoring/page.tsx` | 2 | P6 | Re-export of `../../admin/lead-scoring/page`; reviewed under P7 |
| 97 | `src/app/dashboard/settings/marketplace/page.tsx` | 1866 | P6 |  |
| 98 | `src/app/dashboard/settings/mfa/page.tsx` | 375 | P6 |  |
| 99 | `src/app/dashboard/settings/modules/page.tsx` | 163 | P6 |  |
| 100 | `src/app/dashboard/settings/next-best-action/page.tsx` | 2 | P6 | Re-export of `../../admin/next-best-action/page`; reviewed under P7 |
| 101 | `src/app/dashboard/settings/opportunity-types/page.tsx` | 2 | P6 | Re-export of `../../admin/opportunity-types/page`; reviewed under P7 |
| 102 | `src/app/dashboard/settings/page.tsx` | 509 | P6 |  |
| 103 | `src/app/dashboard/settings/partners/[id]/page.tsx` | 2 | P6 | Re-export of `../../../admin/partners/[id]/page`; reviewed under P7 |
| 104 | `src/app/dashboard/settings/partners/page.tsx` | 2 | P6 | Re-export of `../../admin/partners/page`; reviewed under P7 |
| 105 | `src/app/dashboard/settings/password/page.tsx` | 79 | P6 |  |
| 106 | `src/app/dashboard/settings/payout-cycles/page.tsx` | 2 | P6 | Re-export of `../../admin/payout-cycles/page`; reviewed under P7 |
| 107 | `src/app/dashboard/settings/permission-templates/create-template-dialog.tsx` | 199 | P6 |  |
| 108 | `src/app/dashboard/settings/permission-templates/page.tsx` | 410 | P6 |  |
| 109 | `src/app/dashboard/settings/pipelines/page.tsx` | 6 | P6 | Redirect only |
| 110 | `src/app/dashboard/settings/privileged-actions/page.tsx` | 132 | P6 |  |
| 111 | `src/app/dashboard/settings/roles/page.tsx` | 2 | P6 | Re-export of `../../admin/roles/page`; reviewed under P7 |
| 112 | `src/app/dashboard/settings/sales-groups/page.tsx` | 2 | P6 | Re-export of `../../admin/sales-groups/page`; reviewed under P7 |
| 113 | `src/app/dashboard/settings/scim/page.tsx` | 200 | P6 |  |
| 114 | `src/app/dashboard/settings/security/page.tsx` | 2 | P6 | Re-export of `../../admin/security/page`; reviewed under P7 |
| 115 | `src/app/dashboard/settings/service-desk/page.tsx` | 607 | P6 |  |
| 116 | `src/app/dashboard/settings/sessions/page.tsx` | 129 | P6 |  |
| 117 | `src/app/dashboard/settings/task-playbooks/page.tsx` | 338 | P6 |  |
| 118 | `src/app/dashboard/settings/task-sla-policies/page.tsx` | 157 | P6 |  |
| 119 | `src/app/dashboard/settings/teams/[id]/page.tsx` | 159 | P6 |  |
| 120 | `src/app/dashboard/settings/teams/create-team-dialog.tsx` | 262 | P6 |  |
| 121 | `src/app/dashboard/settings/teams/page.tsx` | 204 | P6 |  |
| 122 | `src/app/dashboard/settings/users/page.tsx` | 2 | P6 | Re-export of `../../admin/users/page`; reviewed under P7 |
| 123 | `src/app/dashboard/tasks/page.tsx` | 1140 | P2 |  |
| 124 | `src/app/dashboard/tasks/queues/page.tsx` | 255 | P2 |  |
| 125 | `src/app/dashboard/views/page.tsx` | 1022 | P2 |  |
| 126 | `src/app/f/[slug]/page.tsx` | 8 | P5 |  |
| 127 | `src/app/layout.tsx` | 69 | P5 |  |
| 128 | `src/app/login/page.tsx` | 314 | P5 |  |
| 129 | `src/app/page.tsx` | 7 | P5 | Redirect only |
| 130 | `src/app/platform-admin/audit-logs/page.tsx` | 297 | P5 |  |
| 131 | `src/app/platform-admin/impersonation-review/page.tsx` | 150 | P5 |  |
| 132 | `src/app/platform-admin/layout.tsx` | 111 | P5 |  |
| 133 | `src/app/platform-admin/marketplace/page.tsx` | 547 | P5 |  |
| 134 | `src/app/platform-admin/module-bundles/page.tsx` | 143 | P5 |  |
| 135 | `src/app/platform-admin/module-health/page.tsx` | 95 | P5 |  |
| 136 | `src/app/platform-admin/page.tsx` | 101 | P5 |  |
| 137 | `src/app/platform-admin/privileged-actions/page.tsx` | 186 | P5 |  |
| 138 | `src/app/platform-admin/retention/page.tsx` | 8 | P5 |  |
| 139 | `src/app/platform-admin/schema-status/page.tsx` | 151 | P5 |  |
| 140 | `src/app/platform-admin/tenants/[id]/page.tsx` | 840 | P5 |  |
| 141 | `src/app/platform-admin/tenants/create-tenant-dialog.tsx` | 266 | P5 |  |
| 142 | `src/app/platform-admin/tenants/page.tsx` | 197 | P5 |  |
| 143 | `src/app/public-form/[id]/page.tsx` | 8 | P5 |  |
| 144 | `src/app/reset-password/page.tsx` | 103 | P5 |  |
| 145 | `src/app/unsubscribe/[outboxId]/page.tsx` | 76 | P5 |  |
| 146 | `src/components/admin/create-tenant-dialog.tsx` | 281 | P6 |  |
| 147 | `src/components/admin/custom-field-manager.tsx` | 403 | P6 |  |
| 148 | `src/components/admin/features-dialog.tsx` | 172 | P6 |  |
| 149 | `src/components/admin/module-health.tsx` | 69 | P6 |  |
| 150 | `src/components/admin/retention-policies.tsx` | 245 | P6 |  |
| 151 | `src/components/admin/simulate-distribution-dialog.tsx` | 166 | P6 |  |
| 152 | `src/components/admin/tenant-usage-limits.tsx` | 116 | P6 |  |
| 153 | `src/components/ai/ai-assistant-panel.tsx` | 310 | P2 |  |
| 154 | `src/components/applications/application-eligibility.tsx` | 42 | P5 |  |
| 155 | `src/components/applications/application-workflow.tsx` | 89 | P5 |  |
| 156 | `src/components/applications/document-actions.tsx` | 67 | P5 |  |
| 157 | `src/components/applications/fields.tsx` | 8 | P5 |  |
| 158 | `src/components/auth/feature-gate.tsx` | 85 | P5 |  |
| 159 | `src/components/auth/role-guard.tsx` | 68 | P5 |  |
| 160 | `src/components/auth/super-admin-guard.tsx` | 38 | P5 |  |
| 161 | `src/components/automation/EnrollRecordsDialog.tsx` | 165 | P4 |  |
| 162 | `src/components/automation/TestWorkflowDialog.tsx` | 201 | P4 |  |
| 163 | `src/components/automation/execution-log-viewer.tsx` | 126 | P4 |  |
| 164 | `src/components/automation/expressive-node.tsx` | 231 | P4 |  |
| 165 | `src/components/bulk-actions/bulk-add-tags-dialog.tsx` | 133 | P1 |  |
| 166 | `src/components/bulk-actions/bulk-toolbar.tsx` | 190 | P1 |  |
| 167 | `src/components/bulk-actions/bulk-update-status-dialog.tsx` | 98 | P1 |  |
| 168 | `src/components/cases/create-case-button.tsx` | 102 | P5 |  |
| 169 | `src/components/catalog/catalog-entity-manager.tsx` | 283 | P5 |  |
| 170 | `src/components/common/DynamicFormRenderer.tsx` | 281 | P1 |  |
| 171 | `src/components/common/condition-builder.tsx` | 255 | P1 |  |
| 172 | `src/components/common/empty-state.tsx` | 43 | P1 |  |
| 173 | `src/components/common/error-state.tsx` | 50 | P1 |  |
| 174 | `src/components/common/field-history-panel.tsx` | 204 | P1 |  |
| 175 | `src/components/common/module-gate.tsx` | 29 | P1 |  |
| 176 | `src/components/common/notes-panel.tsx` | 340 | P1 |  |
| 177 | `src/components/common/record-preview-popover.tsx` | 111 | P1 |  |
| 178 | `src/components/common/record-preview.tsx` | 137 | P1 |  |
| 179 | `src/components/common/record-share-dialog.tsx` | 138 | P1 |  |
| 180 | `src/components/common/saved-filters-menu.tsx` | 254 | P1 |  |
| 181 | `src/components/common/skeletons.tsx` | 128 | P1 |  |
| 182 | `src/components/common/standard-dialog.tsx` | 116 | P1 |  |
| 183 | `src/components/communications/communication-events-panel.tsx` | 96 | P3 |  |
| 184 | `src/components/dashboard/analytics-dashboard.tsx` | 116 | P3 |  |
| 185 | `src/components/dashboard/dashboard-manager.tsx` | 1311 | P3 |  |
| 186 | `src/components/dashboard/onboarding-checklist-banner.tsx` | 87 | P3 |  |
| 187 | `src/components/dashboard/stat-card.tsx` | 71 | P3 |  |
| 188 | `src/components/dashboard/widget-library.tsx` | 547 | P3 |  |
| 189 | `src/components/data/floating-bulk-actions.tsx` | 91 | P1 |  |
| 190 | `src/components/data/import-dialog.tsx` | 230 | P1 |  |
| 191 | `src/components/detail-shell/detail-page-header.tsx` | 61 | P2 |  |
| 192 | `src/components/detail-shell/record-summary.tsx` | 19 | P2 |  |
| 193 | `src/components/detail-shell/workspace-tabs.tsx` | 45 | P2 |  |
| 194 | `src/components/exports/queue-export-button.tsx` | 275 | P5 |  |
| 195 | `src/components/filters/advanced-filter-drawer.tsx` | 399 | P1 |  |
| 196 | `src/components/filters/filter-builder.tsx` | 291 | P1 |  |
| 197 | `src/components/forms/EmbedCodeDialog.tsx` | 176 | P4 |  |
| 198 | `src/components/forms/contextual-forms-panel.tsx` | 695 | P4 |  |
| 199 | `src/components/forms/crm-placement-editor.tsx` | 541 | P4 |  |
| 200 | `src/components/forms/form-analytics.tsx` | 231 | P4 |  |
| 201 | `src/components/forms/form-editor.tsx` | 1521 | P4 |  |
| 202 | `src/components/forms/logic-builder.tsx` | 150 | P4 |  |
| 203 | `src/components/forms/mui-dynamic-field.tsx` | 217 | P4 |  |
| 204 | `src/components/forms/public-form-page.tsx` | 29 | P4 |  |
| 205 | `src/components/forms/public-form-renderer.tsx` | 449 | P4 |  |
| 206 | `src/components/forms/style-editor.tsx` | 187 | P4 |  |
| 207 | `src/components/forms/submissions-table.tsx` | 262 | P4 |  |
| 208 | `src/components/governance/record-history.tsx` | 259 | P6 |  |
| 209 | `src/components/integrations/external-push-badge.tsx` | 46 | P6 |  |
| 210 | `src/components/integrations/external-push-dialog.tsx` | 226 | P6 |  |
| 211 | `src/components/kanban/kanban-board.tsx` | 111 | P2 |  |
| 212 | `src/components/layout/NavigationDrawer.tsx` | 342 | P1 |  |
| 213 | `src/components/layout/agent-availability-toggle.tsx` | 85 | P1 |  |
| 214 | `src/components/layout/breadcrumbs.tsx` | 56 | P1 |  |
| 215 | `src/components/layout/builder-workspace.tsx` | 40 | P1 |  |
| 216 | `src/components/layout/dashboard-layout.tsx` | 82 | P1 |  |
| 217 | `src/components/layout/dashboard-page-transition.tsx` | 19 | P1 |  |
| 218 | `src/components/layout/header.tsx` | 229 | P1 |  |
| 219 | `src/components/layout/impersonation-banner.tsx` | 64 | P1 |  |
| 220 | `src/components/layout/maintenance-banner.tsx` | 29 | P1 |  |
| 221 | `src/components/layout/notification-bell.tsx` | 111 | P1 |  |
| 222 | `src/components/layout/page-header.tsx` | 18 | P1 |  |
| 223 | `src/components/layout/settings-sections.tsx` | 35 | P1 |  |
| 224 | `src/components/leads/custom-fields-card.tsx` | 70 | P2 |  |
| 225 | `src/components/leads/lead-contact-card.tsx` | 182 | P2 |  |
| 226 | `src/components/marketing/journeys-panel.tsx` | 491 | P3 |  |
| 227 | `src/components/next-best-action/nba-count-chip.tsx` | 22 | P2 |  |
| 228 | `src/components/next-best-action/nba-panel.tsx` | 155 | P2 |  |
| 229 | `src/components/next-best-action/nba-pending-approvals-panel.tsx` | 113 | P2 |  |
| 230 | `src/components/opportunities/kanban-board.tsx` | 151 | P2 |  |
| 231 | `src/components/opportunities/kanban-card.tsx` | 141 | P2 |  |
| 232 | `src/components/opportunities/opportunity-stage-analytics.tsx` | 104 | P2 |  |
| 233 | `src/components/opportunities/opportunity-stage-history.tsx` | 72 | P2 |  |
| 234 | `src/components/providers/ThemeRegistry.tsx` | 13 | P1 |  |
| 235 | `src/components/roles/permission-matrix.tsx` | 161 | P6 |  |
| 236 | `src/components/roles/role-editor-dialog.tsx` | 196 | P6 |  |
| 237 | `src/components/scoring/predictive-score.tsx` | 307 | P2 |  |
| 238 | `src/components/search/global-search.tsx` | 429 | P1 |  |
| 239 | `src/components/settings/color-theme-picker.tsx` | 59 | P6 |  |
| 240 | `src/components/settings/mode-toggle.tsx` | 43 | P6 |  |
| 241 | `src/components/settings/my-activity-tab.tsx` | 111 | P6 |  |
| 242 | `src/components/tasks/apply-playbook-dialog.tsx` | 104 | P2 |  |
| 243 | `src/components/tasks/related-tasks-panel.tsx` | 375 | P2 |  |
| 244 | `src/components/tasks/task-checklist-dependencies-panel.tsx` | 226 | P2 |  |
| 245 | `src/components/tasks/task-recurrence-escalation-fields.tsx` | 102 | P2 |  |
| 246 | `src/components/telephony/call-recordings-panel.tsx` | 164 | P5 |  |
| 247 | `src/components/telephony/call-script-panel.tsx` | 101 | P5 |  |
| 248 | `src/components/telephony/log-call-outcome-dialog.tsx` | 285 | P5 |  |
| 249 | `src/components/timeline/timeline.tsx` | 351 | P2 |  |
| 250 | `src/components/ui/accordion.tsx` | 67 | P1 |  |
| 251 | `src/components/ui/alert.tsx` | 68 | P1 |  |
| 252 | `src/components/ui/avatar.tsx` | 54 | P1 |  |
| 253 | `src/components/ui/badge.tsx` | 47 | P1 |  |
| 254 | `src/components/ui/button.tsx` | 74 | P1 |  |
| 255 | `src/components/ui/card.tsx` | 93 | P1 |  |
| 256 | `src/components/ui/checkbox.tsx` | 31 | P1 |  |
| 257 | `src/components/ui/color-picker.tsx` | 73 | P1 |  |
| 258 | `src/components/ui/command.tsx` | 156 | P1 |  |
| 259 | `src/components/ui/data-table.tsx` | 422 | P1 |  |
| 260 | `src/components/ui/dialog.tsx` | 159 | P1 |  |
| 261 | `src/components/ui/dropdown-menu.tsx` | 258 | P1 |  |
| 262 | `src/components/ui/form.tsx` | 168 | P1 |  |
| 263 | `src/components/ui/icon-picker.tsx` | 100 | P1 |  |
| 264 | `src/components/ui/input.tsx` | 22 | P1 |  |
| 265 | `src/components/ui/label.tsx` | 25 | P1 |  |
| 266 | `src/components/ui/page-transition.tsx` | 22 | P1 |  |
| 267 | `src/components/ui/popover.tsx` | 31 | P1 |  |
| 268 | `src/components/ui/radio-group.tsx` | 46 | P1 |  |
| 269 | `src/components/ui/scroll-area.tsx` | 59 | P1 |  |
| 270 | `src/components/ui/select.tsx` | 191 | P1 |  |
| 271 | `src/components/ui/separator.tsx` | 27 | P1 |  |
| 272 | `src/components/ui/sheet.tsx` | 144 | P1 |  |
| 273 | `src/components/ui/skeleton.tsx` | 16 | P1 |  |
| 274 | `src/components/ui/sonner.tsx` | 41 | P1 |  |
| 275 | `src/components/ui/switch.tsx` | 36 | P1 |  |
| 276 | `src/components/ui/table.tsx` | 117 | P1 |  |
| 277 | `src/components/ui/tabs.tsx` | 56 | P1 |  |
| 278 | `src/components/ui/textarea.tsx` | 19 | P1 |  |
| 279 | `src/components/ui/tooltip.tsx` | 62 | P1 |  |
| 280 | `src/components/views/save-view-dialog.tsx` | 917 | P2 |  |
| 281 | `src/components/views/view-row-actions.tsx` | 486 | P2 |  |
| 282 | `src/components/views/view-switcher.tsx` | 355 | P2 |  |
| 283 | `src/lib/keyboard-shortcuts.tsx` | 249 | P1 |  |
| 284 | `src/lib/server/invoice-pdf.tsx` | 259 | P1 |  |
| 285 | `src/lib/server/report-pdf.tsx` | 255 | P1 |  |
| 286 | `src/providers/ai-message-draft-provider.tsx` | 47 | P1 |  |
| 287 | `src/providers/auth-provider.tsx` | 90 | P1 |  |
| 288 | `src/providers/color-theme-provider.tsx` | 20 | P1 |  |
| 289 | `src/providers/editor-draft-provider.tsx` | 40 | P1 |  |
| 290 | `src/providers/general-settings-provider.tsx` | 47 | P1 |  |
| 291 | `src/providers/inbound-call-popup-provider.tsx` | 262 | P1 |  |
| 292 | `src/providers/notification-provider.tsx` | 154 | P1 |  |

---

# Gap check: actions, wiring, back end and logic (plan §12)

**Method:** a static analysis with the TypeScript compiler, verified by hand, covering:
- 1073 source files;
- 882 front-end API calls against 592 API routes and their exported methods;
- 111 links and navigation calls against 111 page routes and the redirects;
- every button and menu item for a handler;
- placeholder and fake code;
- routes with no UI caller;
- risky logic patterns.

False positives were removed: dynamic and conditional URLs (both branches checked by hand), and triggers wired through a wrapper.

## Calls to missing endpoints

| Method | URL | Where |
|---|---|---|
| GET | `/api/plans` | `src/app/dashboard/admin/plans/page.tsx:120` |
| PATCH | `/api/plans/:p` | `src/app/dashboard/admin/plans/page.tsx:154` |
| POST | `/api/plans` | `src/app/dashboard/admin/plans/page.tsx:160` |
| PATCH | `/api/plans/:p` | `src/app/dashboard/admin/plans/page.tsx:175` |
| PATCH | `/api/platform-admin/tenants/:p/status` | `src/app/dashboard/admin/tenants/page.tsx:69` |
| POST | `/api/users/bulk/assign-manager` | `src/app/dashboard/admin/users/bulk-assign-manager-dialog.tsx:89` |

The 17 dynamic URLs could not be checked statically. All were checked by hand: their conditional create/update endpoints and methods exist.

## Controls with no handler (after manual verification)

| Control | Label | Where | Verdict |
|---|---|---|---|
| Button | <ListFilter className="size-4" /> Filters | `src/app/dashboard/automations-v2/page.tsx:202` | Dead |
| Button | {request.status === "EXPIRED" ? "Expired" : "Pending"} | `src/app/dashboard/exports/page.tsx:288` | Status shown as a disabled button |
| Button | <FilterListIcon className="size-4" /> Filters | `src/app/dashboard/forms/page.tsx:152` | Dead |
| Button | Edit <EditIcon className="size-3.5" /> | `src/app/dashboard/forms/page.tsx:236` | Works only by click bubbling |
| Button | <Plus className="size-4" /> Activity | `src/app/dashboard/leads/[id]/page.tsx:277` | Wired through a wrapper or trigger prop (works; accessibility issue A2) |
| Button | <Plus className="size-4" /> Opportunity | `src/app/dashboard/leads/[id]/page.tsx:287` | Wired through a wrapper or trigger prop (works; accessibility issue A2) |
| Button | <Plus className="size-4" /> New Opportunity | `src/app/dashboard/leads/[id]/page.tsx:494` | Wired through a wrapper or trigger prop (works; accessibility issue A2) |
| Button | <Plus className="size-4" /> Activity | `src/app/dashboard/opportunities/[id]/page.tsx:257` | Wired through a wrapper or trigger prop (works; accessibility issue A2) |
| Button | <Plus className="size-4" /> Case | `src/app/dashboard/opportunities/[id]/page.tsx:277` | Wired through a wrapper or trigger prop (works; accessibility issue A2) |
| button | Lead: {task.lead.name} | `src/app/dashboard/tasks/page.tsx:711` | Wired through a wrapper or trigger prop (works; accessibility issue A2) |
| button | Opportunity: {task.opportunity.title} | `src/app/dashboard/tasks/page.tsx:718` | Wired through a wrapper or trigger prop (works; accessibility issue A2) |
| Button | <LifeBuoy className="size-4" /> Case | `src/components/cases/create-case-button.tsx:67` | Wired through a wrapper or trigger prop (works; accessibility issue A2) |
| Button | <Pencil className="size-4" /> Edit | `src/components/common/record-preview.tsx:111` | Dead |
| Button | <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Importing. | `src/components/data/import-dialog.tsx:221` | Dead file |

## Placeholder or fake code

- `src/app/dashboard/settings/permission-templates/create-template-dialog.tsx:88` — // Mock API call
- `src/app/dashboard/settings/permission-templates/create-template-dialog.tsx:89` — await new Promise(resolve => setTimeout(resolve, 1000));

## API routes with no UI caller

**External by design** (35): public API, SCIM, inbound webhooks, tracking, health check, public downloads, scheduled jobs.

- `/api/automation-v2/process-due` [POST]
- `/api/communications/process-due` [POST]
- `/api/communications/webhooks/[channel]` [POST]
- `/api/health` [GET]
- `/api/integrations/inbound/case-messages/[tenantId]` [POST]
- `/api/integrations/inbound/leads/[tenantId]` [POST]
- `/api/integrations/telephony/webhook` [POST]
- `/api/metrics/process-grain-snapshots` [POST]
- `/api/public/exports/[id]/download` [GET]
- `/api/public/forms/[identifier]/progress` [POST]
- `/api/public/partner-invoices/[id]/download` [GET]
- `/api/public/report-deliveries/[deliveryId]/download` [GET]
- `/api/reports/rollups/process-jobs` [POST]
- `/api/reports/rollups/process-schedule` [POST]
- `/api/reports/schedules/process-due` [POST]
- `/api/reports/schedules/retry-failed` [POST]
- `/api/scim/v2/Groups/[id]` [GET,PUT,PATCH,DELETE]
- `/api/scim/v2/Groups` [GET,POST]
- `/api/scim/v2/ResourceTypes` [GET]
- `/api/scim/v2/Schemas` [GET]
- `/api/scim/v2/ServiceProviderConfig` [GET]
- `/api/scim/v2/Users/[id]` [GET,PUT,PATCH,DELETE]
- `/api/scim/v2/Users` [GET,POST]
- `/api/tasks/process-reminders` [POST]
- `/api/tracking/page-visit` [POST]
- `/api/tracking/script` [GET]
- `/api/v1/apps/automation-events` [POST]
- `/api/v1/apps/leads/[id]` [PATCH]
- `/api/v1/apps/leads` [GET,POST]
- `/api/v1/apps/opportunities/[id]` [PATCH]
- `/api/v1/apps/opportunities` [GET,POST]
- `/api/v1/leads` [GET,POST]
- `/api/v1/leads-with-opportunity` [POST]
- `/api/v1/opportunities` [GET,POST]
- `/api/v1/opportunity-types` [GET]

**Called with dynamic URLs** (53). Verified as used:

- `/api/assignment/rule-sets/[id]` [PATCH,DELETE], from `src/app/dashboard/admin/assignment-rules/page.tsx`
- `/api/auth/logout` [POST], from `src/providers/auth-provider.tsx`
- `/api/catalog/programs/[id]` [PATCH,DELETE], from `src/app/dashboard/settings/catalog/page.tsx`
- `/api/exports/templates/[id]` [DELETE], from `src/components/exports/queue-export-button.tsx`
- `/api/integrations/telephony/agent-popup` [GET], from `src/app/dashboard/settings/integrations/page.tsx`
- `/api/marketing/campaigns/[id]` [GET,PUT], from `src/app/dashboard/marketing/page.tsx`
- `/api/marketing/journeys/[id]` [GET,PATCH], from `src/app/dashboard/marketing/page.tsx`
- `/api/marketplace/apps/[id]` [PATCH], from `src/app/platform-admin/marketplace/page.tsx`
- `/api/marketplace/installs/[id]/approve-permission-change` [POST], from `src/app/dashboard/settings/marketplace/page.tsx`
- `/api/marketplace/installs/[id]/reinstate` [POST], from `src/app/dashboard/settings/marketplace/page.tsx`
- `/api/marketplace/installs/[id]/reject` [POST], from `src/app/platform-admin/marketplace/page.tsx`
- `/api/marketplace/installs/[id]/reject-permission-change` [POST], from `src/app/dashboard/settings/marketplace/page.tsx`
- `/api/marketplace/installs/[id]/suspend` [POST], from `src/app/platform-admin/marketplace/page.tsx`
- `/api/marketplace/installs/[id]/uninstall` [POST], from `src/app/dashboard/settings/marketplace/page.tsx`
- `/api/next-best-action/approvals/[id]/reject` [POST], from `src/components/next-best-action/nba-pending-approvals-panel.tsx`
- `/api/notifications` [GET,PATCH], from `src/providers/notification-provider.tsx`
- `/api/notifications/sse` [GET], from `src/providers/notification-provider.tsx`
- `/api/partners/[id]/invoice-template` [GET,PUT], from `src/app/dashboard/payouts/page.tsx`
- `/api/platform-admin/marketplace/versions/[id]/reject` [POST], from `src/app/platform-admin/marketplace/page.tsx`
- `/api/platform-admin/tenants/[id]/unsuspend` [POST], from `src/app/platform-admin/tenants/page.tsx`
- `/api/platform-admin/tenants/[id]/usage` [GET,PUT], from `src/app/platform-admin/tenants/[id]/page.tsx`
- `/api/reports/inbuilt/activity-call-volume-trends` [GET], from `src/app/dashboard/reports/page.tsx`
- `/api/reports/inbuilt/anomaly-detection` [GET], from `src/app/dashboard/reports/page.tsx`
- `/api/reports/inbuilt/attribution-explorer` [GET], from `src/app/dashboard/reports/page.tsx`
- `/api/reports/inbuilt/automation-performance` [GET], from `src/app/dashboard/reports/page.tsx`
- `/api/reports/inbuilt/campaign-roi` [GET], from `src/app/dashboard/reports/page.tsx`
- `/api/reports/inbuilt/case-analytics` [GET], from `src/app/dashboard/reports/page.tsx`
- `/api/reports/inbuilt/cohort-funnel-progression` [GET], from `src/app/dashboard/reports/page.tsx`
- `/api/reports/inbuilt/commission-payout-summary` [GET], from `src/app/dashboard/reports/page.tsx`
- `/api/reports/inbuilt/data-quality` [GET], from `src/app/dashboard/reports/page.tsx`
- `/api/reports/inbuilt/data-quality-history` [GET], from `src/app/dashboard/reports/page.tsx`
- `/api/reports/inbuilt/distribution-fairness` [GET], from `src/app/dashboard/reports/page.tsx`
- `/api/reports/inbuilt/executive-scorecard` [GET], from `src/app/dashboard/reports/page.tsx`
- `/api/reports/inbuilt/forecast` [GET], from `src/app/dashboard/reports/page.tsx`
- `/api/reports/inbuilt/form-drop-off` [GET], from `src/app/dashboard/reports/page.tsx`
- `/api/reports/inbuilt/funnel-by-source-campaign` [GET], from `src/app/dashboard/reports/page.tsx`
- `/api/reports/inbuilt/funnel-by-stage` [GET], from `src/app/dashboard/reports/page.tsx`
- `/api/reports/inbuilt/funnel-explorer` [GET], from `src/app/dashboard/reports/page.tsx`
- `/api/reports/inbuilt/journey-performance` [GET], from `src/app/dashboard/reports/page.tsx`
- `/api/reports/inbuilt/lead-source-roi` [GET], from `src/app/dashboard/reports/page.tsx`
- `/api/reports/inbuilt/marketing-attribution-summary` [GET], from `src/app/dashboard/reports/page.tsx`
- `/api/reports/inbuilt/next-best-action-performance` [GET], from `src/app/dashboard/reports/page.tsx`
- `/api/reports/inbuilt/period-comparison` [GET], from `src/app/dashboard/reports/page.tsx`
- `/api/reports/inbuilt/reassignment-impact` [GET], from `src/app/dashboard/reports/page.tsx`
- `/api/reports/inbuilt/rep-performance` [GET], from `src/app/dashboard/reports/page.tsx`
- `/api/reports/inbuilt/sender-reputation` [GET], from `src/app/dashboard/reports/page.tsx`
- `/api/reports/inbuilt/sla-response-breaches` [GET], from `src/app/dashboard/reports/page.tsx`
- `/api/reports/inbuilt/split-test-performance` [GET], from `src/app/dashboard/reports/page.tsx`
- `/api/reports/inbuilt/task-sla-performance` [GET], from `src/app/dashboard/reports/page.tsx`
- `/api/reports/inbuilt/telephony-call-performance` [GET], from `src/app/dashboard/reports/page.tsx`
- `/api/settings/task-sla-policies/[priority]` [DELETE], from `src/app/dashboard/settings/task-sla-policies/page.tsx`
- `/api/settings/usage` [GET], from `src/app/platform-admin/tenants/[id]/page.tsx`
- `/api/type-custom-fields` [POST], from `src/app/dashboard/automations-v2/[id]/page.tsx`

**No screen at all** (40). The one false positive (`/api/opportunities/[id]/share`) is marked; plan §12.3 gives each of the others a home:

- `/api/assignment/simulations` [GET]
- `/api/call-queues/[callLogId]/release` [POST]
- `/api/call-queues/health` [GET]
- `/api/cases/[id]/sla/resume` [POST]
- `/api/communications/consent/history` [GET]
- `/api/communications/consent` [PUT]
- `/api/communications/snippets/[id]` [DELETE]
- `/api/communications/snippets` [GET,PUT]
- `/api/communications/templates/[id]/approval` [POST]
- `/api/communications/templates/versions` [GET]
- `/api/dashboard-tabs/reorder` [POST]
- `/api/exports/[id]/signed-url` [POST]
- `/api/forms/[id]/export` [GET]
- `/api/governance/gdpr/requests/[id]/download` [GET]
- `/api/knowledge-base/articles/[id]/feedback` [POST]
- `/api/knowledge-base/categories/[id]` [PATCH,DELETE]
- `/api/knowledge-base/categories` [GET,POST]
- `/api/lead-scoring/self-learning/scores` [GET]
- `/api/marketing/cost-entries/[id]` [DELETE]
- `/api/marketing/cost-entries/roi` [GET]
- `/api/marketing/cost-entries` [GET,POST]
- `/api/marketing/fatigue-settings` [GET,PUT]
- `/api/marketing/journeys/[id]/enrollments` [GET]
- `/api/marketing/journeys/[id]/simulate` [POST]
- `/api/marketing/journeys/enrollments/[id]` [PATCH]
- `/api/marketplace/apps/[id]/actions/runs` [GET]
- `/api/marketplace/installs/[id]/permissions` [GET]
- `/api/marketplace/installs/[id]/record-scope` [GET,PATCH]
- `/api/marketplace/secrets` [GET]
- `/api/opportunities/[id]/share` [GET,PUT] — false positive (used by the shared share dialog)
- `/api/partner-invoices/[id]/signed-url` [POST]
- `/api/partners/me/invoices` [GET]
- `/api/payout-cycles/[id]/finance-export` [GET]
- `/api/payouts/[id]/invoices` [GET]
- `/api/platform-admin/jobs/dead-letter` [GET]
- `/api/platform-admin/marketplace/installs/[id]/reject-platform-permissions` [POST]
- `/api/reports/custom/[id]/export` [GET]
- `/api/task-playbooks/applications` [GET]
- `/api/teams/[id]/members/[userId]` [DELETE]
- `/api/teams/[id]/members` [POST]

## Logic patterns: every occurrence

### `eslint-disable` for `react-hooks/exhaustive-deps` (19)

- `src/app/dashboard/settings/governance/audit-logs/page.tsx:95`
- `src/app/dashboard/settings/call-campaigns/page.tsx:229`
- `src/app/dashboard/tasks/page.tsx:330`
- `src/app/dashboard/lists/page.tsx:108`
- `src/app/dashboard/call-center/campaigns/[id]/page.tsx:46`
- `src/app/dashboard/reports/page.tsx:87`
- `src/app/dashboard/reports/page.tsx:1068`
- `src/components/filters/advanced-filter-drawer.tsx:107`
- `src/components/forms/contextual-forms-panel.tsx:380`
- `src/components/forms/submissions-table.tsx:82`
- `src/components/forms/public-form-renderer.tsx:103`
- `src/components/catalog/catalog-entity-manager.tsx:96`
- `src/components/exports/queue-export-button.tsx:88`
- `src/components/dashboard/dashboard-manager.tsx:129`
- `src/components/dashboard/dashboard-manager.tsx:140`
- `src/components/dashboard/dashboard-manager.tsx:896`
- `src/components/dashboard/dashboard-manager.tsx:904`
- `src/components/dashboard/dashboard-manager.tsx:963`
- `src/components/integrations/external-push-dialog.tsx:81`

### List `key={index}` (37)

- `src/app/dashboard/settings/task-playbooks/page.tsx:270`
- `src/app/dashboard/settings/call-scripts/page.tsx:286`
- `src/app/dashboard/settings/call-scripts/page.tsx:307`
- `src/app/dashboard/settings/marketplace/page.tsx:1286`
- `src/app/dashboard/settings/marketplace/page.tsx:1368`
- `src/app/dashboard/settings/marketplace/page.tsx:1422`
- `src/app/dashboard/settings/marketplace/page.tsx:1711`
- `src/app/dashboard/automations-v2/[id]/page.tsx:1495`
- `src/app/dashboard/automations-v2/[id]/page.tsx:1615`
- `src/app/dashboard/automations-v2/[id]/page.tsx:1700`
- `src/app/dashboard/automations-v2/[id]/page.tsx:1862`
- `src/app/dashboard/automations-v2/[id]/page.tsx:2663`
- `src/app/dashboard/automations-v2/[id]/page.tsx:2847`
- `src/app/dashboard/automations-v2/[id]/page.tsx:3020`
- `src/app/dashboard/admin/gamification/page.tsx:519`
- `src/app/dashboard/admin/gamification/page.tsx:620`
- `src/app/dashboard/reports/page.tsx:1295`
- `src/app/dashboard/reports/page.tsx:1351`
- `src/app/dashboard/reports/page.tsx:2465`
- `src/app/dashboard/reports/page.tsx:2778`
- `src/app/dashboard/reports/page.tsx:2974`
- `src/components/filters/advanced-filter-drawer.tsx:255`
- `src/components/settings/color-theme-picker.tsx:41`
- `src/components/forms/crm-placement-editor.tsx:483`
- `src/components/forms/form-editor.tsx:1416`
- `src/components/admin/simulate-distribution-dialog.tsx:134`
- `src/components/dashboard/analytics-dashboard.tsx:47`
- `src/components/telephony/call-script-panel.tsx:60`
- `src/components/telephony/call-script-panel.tsx:76`
- `src/components/common/skeletons.tsx:80`
- `src/components/common/skeletons.tsx:106`
- `src/components/common/condition-builder.tsx:167`
- `src/components/ai/ai-assistant-panel.tsx:272`
- `src/components/automation/TestWorkflowDialog.tsx:166`
- `src/components/automation/execution-log-viewer.tsx:61`
- `src/components/data/import-dialog.tsx:196`
- `src/components/data/floating-bulk-actions.tsx:72`

### `target="_blank"` (11)

- `src/app/dashboard/settings/marketplace/page.tsx:1097`
- `src/app/dashboard/forms/[formId]/page.tsx:79`
- `src/app/dashboard/admin/payout-cycles/page.tsx:1020`
- `src/app/dashboard/cases/[id]/page.tsx:424`
- `src/app/dashboard/payouts/page.tsx:427`
- `src/app/dashboard/payouts/page.tsx:483`
- `src/app/dashboard/reports/page.tsx:952`
- `src/components/dashboard/dashboard-manager.tsx:485`
- `src/components/telephony/call-recordings-panel.tsx:95`
- `src/components/marketing/journeys-panel.tsx:314`
- `src/components/views/view-row-actions.tsx:138`

### Browser-locale date formatting (`toLocaleDateString` / `toLocaleTimeString`) (9)

- `src/app/platform-admin/tenants/[id]/page.tsx:655`
- `src/app/platform-admin/tenants/[id]/page.tsx:684`
- `src/app/dashboard/settings/integrations/page.tsx:2356`
- `src/app/dashboard/settings/modules/page.tsx:117`
- `src/app/dashboard/settings/modules/page.tsx:123`
- `src/app/dashboard/tasks/page.tsx:1126`
- `src/app/dashboard/tasks/page.tsx:1128`
- `src/app/dashboard/tasks/page.tsx:1129`
- `src/app/dashboard/exports/page.tsx:271`

### `window.open(` (2)

- `src/app/dashboard/forms/page.tsx:210`
- `src/components/forms/EmbedCodeDialog.tsx:154`

## App-level checks

- **Missing files:** no `error.tsx`, `global-error.tsx`, `not-found.tsx` or `loading.tsx` anywhere under `src/app`.
- **Page titles:** only `app/layout.tsx` sets `metadata.title` ("Unnatify"); no page has its own title.
- **Sign-in:** `app/login/page.tsx:39-41` always navigates to the landing page or `/dashboard`; the `from` parameter set by `proxy.ts:15` is never read.
- **Two proxy files** with different logic: `proxy.ts` (login redirect) and `src/proxy.ts` (cross-site write block). Next.js runs only one.
- **Pipeline stages:** no code inserts into `StageDefinition`, so stages can't be created or edited anywhere.
- **Public forms:** `components/forms/public-form-renderer.tsx:265` injects tenant CSS with `dangerouslySetInnerHTML`.

