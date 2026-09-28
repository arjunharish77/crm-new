# CRM UI design standard

Version: 1.0 proposed · 2026-09-09 · Applies to `crm/src` (localhost:3000).

This is the target contract for the remediation in [26_UI_REVIEW_AND_REMEDIATION_PLAN.md](26_UI_REVIEW_AND_REMEDIATION_PLAN.md) and subsequent CRM features. It is not implemented merely by adding this document. It extends the existing Radix/shadcn + Tailwind consolidation decision. The separate website and `apps/web` are outside scope.

## 1. Product principles

1. Start with the user's task: identify a record, understand the situation, act, confirm the outcome and continue.
2. Give the main work the most space. Navigation, filters, metadata and administration support it.
3. Show essentials first. Put advanced configuration behind a named control; do not remove capability to achieve a clean screenshot.
4. Use one predictable pattern for the same interaction everywhere.
5. Design for actual available content width, long real data and failure states.
6. Make state explicit: selected scope, unsaved changes, progress, blocked actions and errors.
7. Keep the existing green identity. Favor readable, quiet surfaces over decorative gradients, heavy shadows or many colored pills.

## 2. Navigation and information architecture

Use a shared navigation registry with stable key, label, route, group, icon, applicable role/permission, module entitlement and active-route matching. The sidebar, command palette, breadcrumbs and mobile navigation consume the same metadata. Existing authorization remains the enforcement boundary.

Suggested groups (proposal; preserve existing URLs):

| Group | Destinations | Default emphasis |
|---|---|---|
| My work | Dashboard/work summary, Tasks, Leads, Activities | Counselor |
| Sales | Opportunities, Lists, Smart Views | Counselor/manager |
| Service | Call Center, Cases | Enabled service users |
| Growth | Marketing, Forms, Automations | Marketing/operations |
| Insights | Reports, Leaderboard, My Points | Role/module dependent |
| Operations | Approvals, Exports, eligible payouts | Manager/finance/partner |
| Settings | Categorized tenant settings | Authorized administrators |
| Platform | Platform overview, tenants, audit, reviews, schema, marketplace | Platform administrators only |

These are navigation groups, not new backend modules. A proposed My work landing experience can initially use the existing Tasks/dashboard routes. Do not imply unfinished application/enrollment features exist.

- Prefer 5–7 prominent destinations in the user's default workspace; allow secondary groups to expand. Keep labels visible in the expanded sidebar.
- Default role changes ordering/prominence, not the meaning of destinations. Respect permitted feature visibility and user pins.
- Pins should not produce an unexplained duplicate list. Use a clearly labeled small Pinned group; keep canonical group membership discoverable.
- Use actual links for navigation, with `aria-current="page"`, support browser open-in-new-tab and reliable active state on child routes.
- Breadcrumb example: `Leads / Demo Student`. Back to list restores filters, sort, pagination, selection policy and scroll. A direct-linked record needs a safe module-list fallback.
- Mobile has a visible Menu button in the global header. Use the existing Radix Sheet infrastructure for focus, Escape and focus restoration; closed drawers must not remain keyboard-focusable.
- Settings gets searchable categories: Workspace; People & access; Sales configuration; Tasks & service; Marketing & automation; Finance & rewards; Integrations & data; Security & governance. Use existing item routes; do not rename business concepts silently.
- Below the width needed for a settings sidebar, show the current category/section selector above the form, opening navigation on demand. Never put the complete 35-item menu before the form.
- Keep personal preferences reachable for their intended users. Any change to existing settings access restrictions needs explicit product/authorization review, not a CSS workaround.

## 3. Layout dimensions and responsive behavior

These are target design choices, not measurements of the existing app.

| Element | Standard |
|---|---|
| Global header | 56px desktop; 56px mobile minimum; grows only if content requires it |
| Main sidebar | 240px expanded; 64px collapsed; independently scrollable within viewport |
| Settings navigation | 224px when remaining content width permits; otherwise section selector/drawer |
| Page gutter | 24px wide desktop, 16px constrained/mobile, 12px at 320px if necessary |
| Content width | Lists/workspaces fill available width; reading/forms typically max 960px; long prose max 720px |
| Page section gap | 24px; closely related regions 16px |
| Two-column record | Secondary summary about 280–320px; main workspace `minmax(0,1fr)`; collapse if main area would be under ~560px |
| Standard field form | One column; two columns only when each field has at least 260px plus gap |
| Main action row | 8px gaps, wraps or switches composition before clipping |
| Default dialog | 560px desired width; wide 880px; both capped to available viewport minus gutters |
| Drawer | 480px desired; wide editor/filter variant 640px; full-width with safe padding on narrow screens |

### Breakpoint policy

Viewport breakpoints describe shell behavior; component/container width determines inner layouts.

- **Below 768px:** navigation overlay, compact header/search, stacked forms, mobile list cards for high-use operational records, full-width drawers. Put frequent availability/create actions in a reachable menu if removed from the header.
- **768–1199px:** collapsed navigation by default; user may expand it if content still fits. Settings uses compact section navigation. Tables can scroll locally. Detail panels collapse based on remaining width.
- **1200px and above:** expanded sidebar is allowed; settings sidebar only if the form still has usable space. At 1280px with 240px navigation and 224px settings navigation, only 816px remain before gutters—do not lay out three editor columns inside it.
- Builder three-panel mode requires at least ~1120px **inside the builder**, not merely a 1280px browser. Between ~720–1119px use canvas + one panel; below that switch between canvas and settings views. Treat these thresholds as starting values and validate with real controls.

Use container queries where available in the project's existing CSS tooling, or measure available width in a shared layout hook. Do not duplicate `window.innerWidth` checks across modules.

### Overflow and scrolling contract

- Flex/grid children that contain data or dynamic text use `min-width:0`; bounded vertical panels use `min-height:0`.
- Grids use `minmax(0,1fr)` for flexible tracks. Avoid content-based automatic minimums expanding the page.
- One primary page vertical scroll. Side navigation, editor panels, dialogs and intentional data grids may have their own defined scrollports.
- Only wide data tables, board lanes, flow canvases and code/payload blocks may scroll horizontally. Their scroll stays inside their region; actions and pagination stay outside it.
- Never add `overflow-x:hidden` to `html`, `body` or the app shell as an overflow fix. It can hide buttons and focus rings.
- `height:100vh` is not a generic page layout. Use `min-height:100dvh` for full-screen shells; bounded editors fill measured remaining space.
- Never combine a viewport-derived editor height with an unconditional 600–720px minimum. Short laptop windows and mobile keyboards must leave save/cancel reachable.
- Long prose wraps; long URLs/identifiers get `overflow-wrap:anywhere`. Names may truncate in dense lists if full text is available by accessible reveal and on the detail page. Do not truncate validation, critical status or action names into ambiguity.

## 4. Typography, spacing and surfaces

### Live token ownership

Live colors currently come from `src/app/globals.css` and the color-theme implementation. Shared controls live in `src/components/ui`. Historical `src/app/design-tokens.css` and `src/lib/design-tokens.ts` are not imported in the inspected source; do not treat them as active authority. Consolidate into the live pipeline and migrate consumers deliberately.

Use a 4px spacing scale aligned with existing Tailwind utilities: **4, 8, 12, 16, 24, 32, 48px**. Introduce semantic layout tokens such as `--app-header-height`, `--page-gutter`, `--section-gap`, `--overlay-gutter` in the live stylesheet. Avoid a new numeric `--space-1` scale that disagrees with Tailwind `p-1`.

| Text role | Size / line height | Weight |
|---|---|---|
| Page title | 24/32px | 600 |
| Record identity / section title | 18/26px | 600 |
| Card title | 16/24px | 600 |
| Body, table, input, button | 14/20px | 400–500 |
| Field label | 14/20px | 500 |
| Secondary metadata | 12/18px | 400–500 |
| Important number | 28/36px | 600; tabular numerals |

On mobile, text inputs should use 16px text where needed to avoid browser auto-zoom. Do not shrink the entire interface to make it fit. Avoid 10–11px text for routine instructions and excessive extra-bold/all-caps labels. Keep the app's existing font stack unless a separate brand decision changes it.

| Surface | Treatment |
|---|---|
| App canvas | Quiet neutral/tinted background |
| Main workspace/card | One surface with subtle separator; no shadow by default |
| Section inside workspace | Spacing + heading/divider, usually no extra rounded enclosure |
| Input/control | Clear outline and focus state |
| Hover/selection | Restrained fill; selected state also has semantic indication |
| Overlay/menu | Elevated surface; shadow communicates layering |
| Status | Semantic color + readable label/icon, never color alone |

Target radius: 8px controls, 12px cards/dialogs, full radius only for intentional badges/avatars. Use one-pixel separators. Define separate subtle structural-border and stronger control-border roles so every panel does not look like an input. Verify text and focus contrast in every supported theme; do not assume a 20%-opacity green ring is visible on all surfaces.

## 5. Page templates

Every new route chooses a template. If it cannot fit one, add a documented shared variant before composing arbitrary wrappers.

### A. List workspace

```text
[Title + short context]                       [More] [Create record]
[Saved view] [Search................] [Filters (2)] [View options]
[Owner: Me ×] [Status: New ×] [Clear]                  [Count]
[Selection bar appears here only when records are selected]
┌────────────────────────────────────────────────────────────┐
│ Identity     Status     Owner     Last activity   Next task │
│ Rows / mobile record cards                                │
└────────────────────────────────────────────────────────────┘
[Rows per page]                              [Range] [‹] [›]
```

- Title/context is not inside another card. One primary Create action. Contextual create variants go in its menu when appropriate.
- Toolbar has search, saved view, filters and view options; do not repeat filters in the header, toolbar and card title.
- Export/import/rare operations live in More. If export is the page's primary task (Exports workspace), make it primary there.
- Default to 5–7 useful visible columns; column visibility exposes the rest. Keep identity and row actions discoverable.
- Filter chips represent active state, with Clear. New-empty state offers creation; filtered-empty state offers clear/edit filters.
- Keep a stable toolbar during loading and empty results. Preserve current rows during background refresh when safe, with a loading indication.
- Selection controls appear only during selection and explicitly distinguish this page from all matching results.

### B. Record workspace

```text
[Leads / Record name]                           [More] [Log outcome]
[Status · Owner · Contact information]          [Call] [Message]
[Next task / follow-up / meaningful blocker]
┌─────────────────────┬──────────────────────────────────────┐
│ Compact summary     │ Timeline | Details | Related         │
│ Key properties      │ Active workspace                     │
│                     │                                      │
└─────────────────────┴──────────────────────────────────────┘
```

The exact primary action depends on workflow: a fresh lead may prioritize Call, while completed contact prioritizes Log outcome. Do not display several filled primary buttons. Put sharing, external push and administrative actions in More. Assistant/advanced suggestions should not displace contact history and next task.

Mobile order: compact identity → next action → selected workspace; properties become a section/drawer. Do not force users past every summary card before seeing history. Related records show a concise summary/list and open their own workspace.

Header stickiness shares the shell offset. It must not hide the first field or active tab. Show status once prominently; repeat only when needed in a different context.

### C. Settings workspace

```text
[Settings / Integrations]
[Category navigation] │ [Integrations]                [Add connector]
                      │ [Search connectors] [Status]
                      │ Connector list / selected configuration
                      │ [Save changes] [Cancel] when editing
```

No second broad “Settings” hero followed by “General Settings” followed by another card heading for the same scope. Child modules do not add outer `p-8` inside already padded layouts. Use a section heading, concise explanation, labeled fields and one save area. Advanced policies collapse into clearly named sections. Configuration and operational history have separate destinations.

### D. Builder workspace

```text
[Back] [Workflow/form/report name] [Draft / Saved] [Preview] [Save]
┌──────────────┬──────────────────────────┬───────────────────┐
│ Library      │ Canvas / configuration   │ Selected item     │
│ (optional)   │                          │ properties        │
└──────────────┴──────────────────────────┴───────────────────┘
```

Only use three panels when the content area can support them. Library and inspector collapse independently. One bounded workspace; each visible panel has a defined scroll owner. Keep global app chrome compact in builder mode. Save state, validation and exit behavior remain visible.

Report builder uses steps: Setup → Columns → Filters & sort → Preview. Advanced joins/formulas should be progressive controls within relevant steps. Metrics/catalog administration is outside routine report viewing. Unsaved state survives step/panel changes.

### E. Overview/monitoring workspace

Title + timeframe/scope → a small set of meaningful summary metrics → actionable exceptions → main chart/list. Widget creation, layout editing and version management belong in an explicit edit mode. Do not show every available widget simply because it exists. Failure is “Unavailable” with recovery, never a believable zero.

## 6. Component contracts

| Component / proposed contract | Required behavior |
|---|---|
| `AppShell` (evolve dashboard/platform layouts) | Navigation, header, content width, responsive drawer, layer/offset ownership. No business-specific panels by default. |
| `PageHeader` (new shared composition) | Title, optional context, primary action, secondary menu; narrow-width composition built in. |
| `ListToolbar` (new) | Search, saved view, filters, view options; active-state summary; stable width during fetch. |
| `DataTable` (existing) | Controlled selection, local table scroll, responsive footer, loading/error/empty handling, readable column names, keyboard record link. |
| `RecordLayout` (new, using detail-shell pieces) | Identity, prioritized actions, optional summary and active workspace; shared sticky offsets. |
| `SectionNav` (standardize existing Tabs/WorkspaceTabs) | Accessible selected state, keyboard movement, panel association, overflow affordance; URL-driven where appropriate. |
| `StandardDialog` (existing) | Safe width/height, header/body/footer containment, field errors, focus trap/restore, unsaved-close policy. |
| `SettingsLayout` (existing) | Category navigation, compact mobile selector, one padding owner, no mandatory 600px blank card. |
| `BuilderLayout` (new) | Measured remaining height, collapsible library/inspector, responsive panel switch, save state. |
| `SelectionBar` (consolidate existing bulk bars) | Exact scope/count, 1–2 common actions plus More, clear selection, no overlay hiding pagination. |
| `FormSection` / `Field` | Label + helper + control + error; valid associations, responsive columns and required-state text. |
| `StatusBadge` | Shared semantic status mapping; human wording; color-independent meaning. |

These names describe proposed responsibilities. Do not claim the new components exist before implementation. Prefer adapting existing components and removing redundant wrappers over adding parallel abstractions.

### Buttons and actions

- One filled primary action per task region; default 40px control height, compact 36px desktop, touch targets 44px where practical.
- Secondary: outline or ghost. Destructive: explicit text in a secondary menu/confirmation, not a bright delete button on every row.
- Icon-only buttons always have an accessible name and a tooltip when meaning is not obvious. Hidden mobile text requires `aria-label`.
- Labels describe outcomes: Create lead, Save changes, Log call, Schedule follow-up. Avoid Submit when the actual operation can be named.
- Loading disables duplicate submission and states what is happening. “Saved” requires server confirmation. Do not reload the entire window to refresh one record.
- Do not treat a menu item as permission enforcement. Hide or explain unavailable actions based on existing policy, and preserve server checks.

### Tables and cards

- Target compact rows ≥36px; comfortable ≥44px. Rows may grow for essential wrapped content.
- Identity gets an actual link. Whole-row click is an optional convenience, not the only way to open a record.
- Align labels/text left, comparable numbers right, timestamps consistently. Use locale/tenant timezone helpers already provided by the app.
- Width limits apply to cells; reveal full important content accessibly. Avoid exposing raw UUIDs as labels; put technical IDs behind Copy ID/details.
- Mobile cards retain identity, status, next task, key metadata and record action. Do not render 12 metadata lines or all row actions on every card.
- Column preferences persist as intended, but must not allow hiding every record-identifying/navigation column without a recovery path.
- Bulk selection across pages must follow an explicit policy, particularly after filtering; show the affected count and any exclusions before execution.

### Forms and overlays

- Labels are persistent and programmatically connected. Placeholder text is an example, not a label. Explain required versus optional fields consistently.
- Group by task, not database table. Essential fields first; advanced fields disclosed without clearing their values.
- Validate near the field; on failure focus the first invalid field or an error summary. Preserve draft values on server/network errors.
- Dialog width: `min(desiredWidth, calc(100dvw - 2 * gutter))`; use real CSS expressions/classes generated by the existing build. Dialog height: `max-height:calc(100dvh - 2 * gutter)`.
- Use grid rows `auto minmax(0,1fr) auto`; body scrolls, header/footer remain visible. Long headers wrap without colliding with close.
- Mobile dialog may become full-screen with safe-area padding. Test landscape and on-screen keyboard. A confirmation is small; an advanced form is a drawer/full workspace, not a huge nested modal.
- Avoid stacking dialogs. If a related picker opens from a dialog, enforce deliberate focus/layer behavior and return to the parent field.
- Unsaved changes prompt before destructive dismissal; successful save exits or preserves editor consistently for that workflow.

### Tabs, menus and layer order

- Prefer 3–5 local destinations. When more are essential, use grouped section navigation or a compact selector. Horizontal tab scrolling is allowed but needs a visible affordance and the active tab brought into view.
- A tab changes a panel; a link navigates. Do not use ordinary buttons styled as tabs without selected state and keyboard semantics.
- Layer tokens: page 0, sticky data 10, record header 20, app header 30, overlay backdrop 40, overlay 50, portal menu/popover 60, tooltip 70. Implementation must account for stacking contexts and Radix portals, not just numbers.
- Header offset includes visible banners. Tooltip/toast must not cover a primary footer action. Respect reduced motion for route, panel and navigation transitions.

## 7. State, accessibility and content rules

Every list/editor/record must account for initial load, refresh, empty dataset, no matches, failed fetch, permission denied, disabled module, pending mutation, success and validation failure. Add offline/stale/conflict/job progress where applicable to the real feature. Do not fabricate support for states the backend cannot expose.

- Error copy: what failed, what remains safe, what the user can do. Keep technical diagnostics in expandable details.
- Empty dataset: explain first step. No matches: clear/change filters. Permission failure: explain access, not “not found” unless required by security policy.
- Status text is human-readable (`Pending approval`, not `PENDING_APPROVAL`). Dates consistently use the tenant/user format; relative time has exact time available. Values and currency use consistent units and formatting.
- Use semantic landmarks, one primary page `h1`, logical heading hierarchy, real labels, keyboard-accessible links/buttons and visible focus.
- Never rely on color, hover, drag or a toast alone for essential information. Provide keyboard alternatives to drag/reorder and persistent field-level errors.
- Target readable contrast: 4.5:1 for normal text, 3:1 for large text and meaningful UI boundaries/focus indicators where applicable. These are review targets, not a certification of compliance.
- Respect reduced motion, text zoom and reflow. Focused items must not sit behind sticky chrome. Screen-reader review must verify announcements and relationships, beyond checking that attributes exist.

## 8. Future feature design gate

Before implementation, describe:

1. User/role, task and successful outcome.
2. Existing route/group and selected page template.
3. What is primary, what is secondary, and what is advanced.
4. Proposed desktop and mobile arrangement; width and scroll owners.
5. Empty/loading/error/permission/disabled/draft states.
6. Existing shared components to reuse; any justified new variant.
7. Real data extremes and critical keyboard journey.

Before merging, attach:

- Before/after screenshots at 1280×720 and 390×844, plus the relevant constrained-width/overlay states.
- Evidence for document containment **and** unclipped controls, keyboard navigation, focus return and unsaved state.
- Role and theme used; viewport; tested scenarios and explicit exceptions.
- Applicable lint/type/build and meaningful behavior tests when code changes.
- Updates to the route UI inventory and WP12 tracking, without conflating feature delivery with visual acceptance.

Reject a UI change if it introduces a page-level horizontal scrollbar, hides required actions, creates another competing page layout/token scale, or makes a frequent workflow less discoverable. Record intentional exceptions with route, rationale, owner and validation; do not silently turn them into new defaults.

## 9. Adoption checklist

- [ ] Consolidate active layout/style tokens; retire misleading historical token files after checking consumers.
- [ ] Fix shell/menu/overlay contracts before screen-specific styling.
- [ ] Build and validate reference Leads list, lead detail and settings layouts.
- [ ] Convert repeated patterns into shared components with responsive behavior built in.
- [ ] Roll out by screen family in document 26; retain functional behavior and existing feature flags.
- [ ] Complete role/theme/viewport/state acceptance and record remaining limitations honestly.
- [ ] Require this design gate for all future CRM UI work.


## Implementation adoption — 2026-09-10

The first implementation uses `PageHeader`, `DetailPageHeader`, `RecordSummary`, and `BuilderWorkspace` as reference compositions. Reuse these before creating new page wrappers. The live theme remains `src/app/globals.css`; its base layer supplies the default border color, while component utilities may override it for inputs, focus, or status.

Builder panel changes must keep children mounted and hide inactive panels with CSS so unsaved draft state survives. Use available container width: forms expose all three panels at 1120px of workspace width; automation exposes both at 800px. Below those thresholds, use the explicit panel switch. Keep Save outside the hidden panels. These are workspace thresholds, not viewport thresholds.

Record section buttons currently use an explicitly labeled group and `aria-pressed`; they are not a full ARIA tab implementation. New same-page tab interfaces should use the Radix tab primitive, and migration must preserve existing record state.

See [implementation progress](28_UI_IMPLEMENTATION_PROGRESS.md) for remaining adoption and acceptance work. This standard does not imply every existing route already conforms.


### Work-module adoption — 2026-09-10

Cases, Lists, Call Center, Exports and Approvals now reuse the shared page-header or record-summary composition. Smart Views retains its specialized workspace but follows the same width/overflow contract. Keep filters below the page action row, place configuration such as sensitive-field rules behind a named disclosure, and reset paginated filters to the first page.

For failure states, a failed list request must not render a successful empty list. Polling workspaces may preserve previous data, but must label it as stale after a failed refresh. A failed secondary selector or queue must expose its own recovery action without presenting an empty result as successful.

Include component-level containment in browser acceptance. A card with `overflow-hidden` can conceal long text even when document width passes. Check full-title text containers against their own `clientWidth` and confirm action bounds separately. When a title is a flex child, give it an explicit bounded width or `min-w-0`; text wrapping alone is insufficient.


### Settings editor composition — 2026-09-10

Use `SettingsSections` for settings pages with many local sections. It switches by available container width (900px), mounts a section on first visit, and retains it afterward so drafts survive switching. Give it stable section IDs and a specific accessible name such as “Service Desk section,” distinct from the global settings selector. Test both the compact selector and wide button group.

`StandardDialog` owns viewport height, padding and scrolling. Its children should supply content spacing only; do not add another viewport-height scroll container or another full dialog gutter. For permission-like editors, a named module/type selector can replace a permanent inner sidebar when it leaves too little width for the controls.

A failed policy/configuration request must not reveal editable defaults as though they were saved server values. Show a persistent retryable error and restore editing only after a successful response. Tests should verify this distinction without submitting configuration changes.

### Administration and governance patterns — 2026-09-10

Keep one obvious row action, such as Edit, and group secondary administration actions in a named More actions menu. Use explicit action text in the menu; icons and hover tooltips alone are insufficient. Keep existing confirmation and permission checks on sensitive actions.

Compact selects should show a short selected label. Put longer explanations in the option list or adjacent help text, with wrapping and bounded widths. Connect visible field labels to their inputs and select triggers. A settings page must not add another outer gutter inside the settings layout.

Cancel must restore the saved configuration, and changing the configuration target must not silently discard an active draft. Disable target selection during editing or implement an explicit draft-handling flow. Do not invent timestamps or substitute empty configuration after a failed request.

Every settings destination needs a matching navigation entry. When a disabled feature is opened directly, show its actual section name rather than falsely selecting General. Acceptance should check the active destination as well as route rendering. Tables may scroll locally; page headers, filter controls and dialogs must remain inside the viewport.

### Bulk action feedback — 2026-09-10

Bulk actions must name the actual operation, remain labeled on narrow screens and wrap within the viewport. Disable submission while requests are pending. For independent per-record requests, wait for every result, refresh server data, report partial success accurately and retain failed records for retry. Cancelling confirmation sends no mutations. Never show simulated success for an unavailable endpoint or remove records only from local state while claiming deletion.

### Scoring and condition editors — 2026-09-11

Use compact, distinct section labels when the page title already establishes context. Keep unsaved settings mounted while switching sections. Treat independently loaded rules, settings and model/catalog data as separate error/retry regions.

Condition rows must respond to their own available width, including when used inside dialogs. The shared `ConditionBuilder` uses a 640px container threshold for its multi-column row; below that it stacks controls. Its header actions wrap independently. Verify a populated condition row, not only its empty state.

Distinguish a successful empty configuration from a failed request. An API response containing JSON `null` is valid when the endpoint contract permits it; logging and UI adapters must not turn it into an error.

### Integration and marketplace composition — 2026-09-11

Use `SettingsSections` for wide integration navigation; its optional `onValueChange` callback supports lazy section reads without discarding visited drafts. Within a section, prefer one named selector over another permanent navigation rail when it leaves too little room for configuration fields. Give the outer and inner selectors distinct names.

Keep long collections of per-app actions in a named disclosure with wrapping controls. Registration and sync rows must stack on narrow screens, including event permissions and field mappings. Use persistent error regions for independent connector requests; Retry should reload that section rather than overwrite drafts elsewhere.

A viewport-bounded dialog also needs a shrinkable internal grid column. `StandardDialog` supplies `minmax(0,1fr)` and wrapping titles; do not override these with intrinsic-width tracks. Acceptance must include an unbroken long name and verify the title, controls and footer inside the dialog, since an overflow-hidden outer shell can conceal oversized inner content.

### Report workspaces (iteration eight)

- Keep the report section selector and page header available while an individual section loads or retries. At narrow content widths, use a named native selector; wide layouts can use wrapping section tabs.
- Mount expensive sections on first visit and retain visited editors while switching sections. Explicit Edit actions must open and populate the builder on its first visit as well as subsequent visits; do not rely on a transient event reaching an unmounted editor.
- Use available workspace width to decide when column/filter rows can share a line. Shrinkable grid tracks (`minmax(0, …)`) and wrapping actions prevent long values from widening the page. Keep results tables locally scrollable.
- Keep optional AI assistance behind a named disclosure and show instructions outside placeholder text. Connect field labels to controls; give repeated column/filter controls distinct accessible names.
- Distinguish an unavailable report library or field catalog from an empty result. Retry only the failed data source and preserve unrelated drafts.

### Advanced report editors (iteration nine)

- Separate base metrics and calculated metrics into named, lazily visited sections, retaining draft state after navigation. Avoid stacking multiple complete editors in a single workspace.
- Size nested selectors against their own panel width. A half-width comparison panel must not inherit a three-column layout merely because the browser is wide. Give each comparison segment a fieldset/legend and visible labels for records, grouping and exact value.
- Clear comparison results when their inputs change or a new comparison begins. Ignore late responses from superseded requests so results never appear to describe newer inputs. Failed comparisons retain inputs and expose Retry.
- Treat unavailable schedules, source metrics and field/team metadata as failures, not empty data. Keep list recovery independent of the editor draft. Disable dependent actions while required metadata is unavailable.
- Long record names inside flex rows need `min-w-0` on the text item as well as the surrounding row. Verify populated examples with unbroken names and recipient addresses, not only empty screens.

### Marketing builders (iteration ten)

- Separate campaign audience, message and preview tasks into retained sections rather than squeezing three fixed-width panels into the workspace. Use the shared page header and keep campaign list/detail split mode for sufficiently wide content areas.
- New Campaign must open a fresh composer. Loading lists or refreshing metadata must not select a different record or replace a draft; apply initial deep-link/default selection only once.
- Preserve raw text while editing recipient lists. Parse a separate recipient array for the existing API payload without removing typed delimiters or line breaks from the input.
- When a journey changes target module, clear its incompatible audience selection, load only matching views and discard outdated view responses. Disable creation until required audience selection is ready.
- Put wrapping text in shrinkable parents. Test long campaign/journey names at the detail-header and card-row levels, and long message text in preview panels.

### Dashboard and payout workspaces (iteration eleven)

- Choose stacked versus draggable dashboard widgets by available workspace width, including sidebar changes. Below 900px of content width, use reading-order stacking.
- Keep routine dashboard actions visible; place persona-template controls behind a named disclosure. Long tab names must wrap inside shrinkable tab groups, with options accessible without hover.
- Distinguish unavailable dashboard/payout data from empty history or an uninitialized dashboard. Failed version/breakdown dialogs stay available for Retry instead of closing or claiming there are no versions.
- Payout names, references and dialog text must wrap within shrinkable parents. Connect profile, invoice-template and widget-editor labels to their controls.

### Connection-test settings

- A connection test must clearly indicate which saved configuration it uses. Disable testing while settings/key edits are unsaved, and clear old test results when inputs change.
- Keep secrets masked and outside errors/evidence. Distinguish provider quota exhaustion from network failures; a server response does not establish successful model generation.

### AI and incentive editors (iteration twelve)

- AI sheets must fit the viewport, keep their content locally scrollable and wrap long generated text. Action labels must remain readable at phone widths.
- Disable competing record actions during generation. Clear results on record changes and ignore late responses from previous records. A channel change must clear old drafts and recipient assumptions; keep human review before sending.
- Use shared page headers for commission and gamification settings. Required metadata failures must show Retry before editable defaults can be saved.
- Level/reward rows stack by available panel width. Give every repeated field a visible label and a distinct accessible name, including minimum points, color, cost and reward type. Retain unsaved editor state when moving between sections.

### AI report generation

- Describe supported operations beside the prompt. Unsupported requests must return an explicit explanation; never substitute ordinary rows for requested counts or totals.
- Applying a generated report must replace its source, filters, sort and limit consistently with the returned preview. Clear the previous preview while generating, and prevent repeated generation clicks.
- Validate generated structures before executing them. Handle invalid fields and formats as recoverable user-facing errors rather than generic server failures.

### Adding record AI workflows

- Keep quick record actions separate from longer planning workflows. Add workflows to the shared registry and use a labelled picker, a short purpose description and one Generate button instead of expanding the action grid indefinitely.
- Identify the workflow on its result. Show a busy state and disable competing record actions while it runs.
- State the context limits and distinguish generated plans from performed actions. Separate recorded facts, missing information and hypothetical concerns in each workflow's output contract.

### Partner and payout administration (iteration thirteen)

- Show partner identity and routine actions first. Place login access controls behind a labelled disclosure with a count. Give each repeated role, parent and status selector a visible associated label.
- Base partner rows and cycle/detail splits on available content width. Use shrinkable text parents and wrapping names, references and actions; keep ledger tables locally scrollable.
- Do not expose editable financial defaults after a failed settings load. Distinguish failures from empty cycles/disputes, and disable saving when required visibility options or role metadata are unavailable.
- Switching cycles clears prior selections and ignores older in-flight results. Cancelling an optional-notes prompt cancels the action; it must not submit an empty note automatically.

### Public-facing pages and platform entry screens (iteration fourteen)

- Use the same public-form wrapper for identifier and slug routes. Distinguish missing/expired links from recoverable network/server failures. Cancel older resource loads on navigation and Retry.
- Preserve visitor answers after failed submissions. Put submission errors next to the action and keep Retry possible; never describe a failed save as an invalid link.
- Bound text inside centered flex layouts explicitly. Long recipient addresses, case subjects, form labels and button text must wrap within the content width.
- Platform metrics without a data source must say unavailable. Failed loads must not display credible zero values or empty directories. Do not expose mock actions that claim persistence.
- Navigation drawers need an accessible title, independent scrolling and closure on navigation. Keep platform operations separate from fixture layout acceptance in verification records.

### Platform tenant details and governance (iteration fifteen)

- Split tenant operations, users, flags and modules into retained sections. Keep unsaved local input when switching sections, and distinguish missing metadata from valid empty data.
- Do not present an approval/security toggle with a fabricated default while its saved setting is unavailable. Keep the recovery action visible and render configuration only after a successful load.
- Filter changes reset pagination. Discard older responses when a new filter request begins; keep search scope explicit and ensure search controls actually filter their stated scope.
- Wrap long identities/reasons inside shrinkable flex children. Keep audit and migration tables locally scrollable and review-dialog inputs labelled.
- Clear stale status reports while refreshing. Metrics without a real source must display unavailable rather than a fabricated zero.

### Platform Marketplace (iteration sixteen)

- Separate publishing/permission reviews, blocked installs, health and registered installations into named sections; show queue counts in navigation.
- Do not render empty queues or editable trust controls when required Marketplace data has failed to load. Provide a persistent retry state and ignore older load responses.
- Keep app, owner and tenant names inside shrinkable flex children; wrap long badges and outage hostnames. Contain wide installation tables within their own scroll area.
- State that installation tables can have multiple rows per app. Search must cover the labelled fields, report matching row counts and retain input during section navigation.
- Cancelling any reason prompt ends the operation immediately. Only an explicitly submitted blank reason may lead to a separate confirmation.

### Authentication and tenant provisioning (iteration seventeen)

- Distinguish setup-status failures from completed setup. Provide Retry after failures and a persistent sign-in action after completion; remove creation controls after a successful submission.
- Connect every password and MFA label to its input. Use appropriate password and one-time-code autocomplete; allow alphanumeric backup codes. Busy buttons retain a readable action label.
- Keep submission errors visible near the form and preserve entered values after failure. Password confirmation mismatch must stop submission locally.
- Authentication cards need narrow-screen padding and document scrolling on short viewports. Long action labels wrap instead of extending beyond the card.
- Keep provisioning dialogs bounded and scrollable. While provisioning, disable inputs and prevent dismissal; after failure retain the draft and offer an explicit Cancel action.

### Personal security settings (iteration eighteen)

- Password, MFA and session pages use the shared page header without additional outer padding. Long device details and security action labels wrap within their cards.
- Treat failed session/trusted-device/status loads as errors with Retry, not empty lists or disabled MFA. Disable actions that depend on unavailable data.
- Connect password and verification-code labels to their inputs. Keep submission errors visible and retain input on failure; block duplicate submissions and dismissal while code verification is pending.
- Clear old enrollment secrets when opening or retrying setup, and ignore responses from closed enrollment attempts. Provide explicit Retry when setup cannot start.
- Newly regenerated backup codes belong in a bounded, selectable dialog with instructions and deliberate dismissal, rather than a timed toast. Do not include actual secrets in audit screenshots or test fixtures.

### API credentials and SCIM controls (iteration nineteen)

- Credential directories must distinguish failed loads from empty lists and disable creation until required data loads. Keep long names/identifiers and status badges within the available width.
- Credential creation dialogs use connected labels, named module-scope selectors and stacked fields at narrow widths. Validate positive integer rate limits before submitting; preserve the draft and show a persistent error on failure.
- Guard creation, rotation and revocation while pending. Creation/revocation dialogs cannot dismiss during their request. Rotation and revocation failures remain visible.
- One-time secret dialogs must fit long identifiers, secrets and example requests without horizontal overflow. Give copy controls accessible names and provide a manual-copy fallback on clipboard failure.
- For SCIM role changes, retain the saved value until the server accepts the new choice. Keep save errors beside the role selector and prevent refresh during its save.

### Theme and reflow acceptance (iteration twenty)

- Destructive buttons and badges pair `bg-destructive` with `text-destructive-foreground`. Do not hard-code white text or independently reduce the dark-mode background opacity; both can break the intended color contrast.
- Verify rendered component colors as well as token pairs. Passing token contrast does not prove a component uses those tokens correctly.
- Include light/dark, narrow/wide layouts and representative alternative palettes. Supplement geometry checks with screenshot review, especially for text contrast and enlarged content.
- Record doubled root text as a reflow simulation, separately from native browser zoom. Record fixture roles separately from real authorization acceptance. Neither constitutes full accessibility certification.

### Core CRM long-content reflow (iteration twenty-one)

- Mobile record cards must wrap names, source text, contact details and tags inside the card. An overflow-hidden card is not a sufficient fix: verify that text remains readable rather than clipped.
- Related-record preview triggers need shrinkable bounds, wrapping text and left alignment. Long references must not widen the task list or shift the document horizontally.
- Calendar lane counts respond to their content container, not only the browser breakpoint. Keep lane/card flex children shrinkable and allow titles/status badges to wrap.
- Distinguish blocked view-preference persistence attempts from record mutations in UI fixture tests. Neither may reach a live server during an isolated layout check.

### Task controls and keyboard focus (iteration twenty-two)

- Give filters persistent visible labels and associated controls. Use flexible widths and wrapping selected values so enlarged text retains meaning. View/period buttons expose their selected state with `aria-pressed`.
- A calendar card must not nest an interactive Complete control inside an Edit button. Use sibling native buttons with record-specific accessible names and visible keyboard focus; retain drag behavior on the noninteractive card container.
- Task editor labels must connect to inputs/select triggers. Name secondary controls such as bulk due-date and queue selection too.
- Programmatically opened shared dialogs remember the focused opener and restore focus on close when that element still exists. Validate focus containment, Escape dismissal and restoration through keyboard tests.

### Advanced filter accessibility (iteration twenty-three)

- Name each repeated filter control with its group/condition context: field, operator, value, date mode and date-range endpoint. Give removal actions distinct names and group condition controls semantically.
- Keep group logic, selected values and date inputs within the drawer. Date-mode/input combinations stack within their panel instead of relying on the window breakpoint; allow selected values and footer actions to wrap.
- A programmatically opened filter drawer remembers its opener and restores focus on close. Validate selector keyboard opening, condition/group removal, focus containment and Escape restoration.
- Name standalone Opportunity type selectors and connect bulk-owner/reason labels to their controls.

### Dynamic record editor recovery (iteration twenty-four)

- Metadata and required option-load failures need persistent Retry states. Cancel obsolete metadata requests and ignore option responses after unmount.
- Memoize the resolved field list so metadata-loading renders do not continually regenerate defaults/reset the form. Required markers must follow the same metadata flag used by validation.
- Keep save errors in the form, retain values on failure and prevent repeated saves from buttons/shortcuts while a request is pending. Disable form controls and Cancel during the pending save.
- Base dynamic field columns on the form container. Group names and footer actions wrap; textarea metadata renders an actual multiline control.
- Generate unique IDs per dynamic-field instance and associate help/error messages with controls. Connect custom Opportunity lead/type/stage/date labels as carefully as generated fields.

### Record detail and preview resilience (iteration twenty-five)

- Fetch complete record details before opening an editable form. If that read fails, show a persistent Retry state; never silently substitute a partial list record. Cancel obsolete requests.
- Preview caches belong to the entity type and ID. Reset state on identity changes, ignore cancelled responses, and provide an explicit retry action after failure.
- Bound popover width to the viewport and height to the available placement space. Wrap record text, permit internal vertical scrolling and verify Escape returns focus to the trigger.
- Treat desktop sidebars as narrow containers: wrap names/contact values, keep avatars/icons from shrinking, stack properties and metrics when necessary, and use semantic theme tokens. Include long linked-record names and emails in layout fixtures.

### Detail section navigation and failed loads (iteration twenty-six)

- Keep record section navigation discoverable: allow buttons to wrap onto additional rows and grow with enlarged labels. Use native buttons with selected state and keyboard focus.
- Align independent detail columns at the top. Do not stretch a short content card to match a much taller summary sidebar.
- Render load failures in the page render path, never inside unrelated event handlers. Related-data failures must not look like successful empty results or valid zero counts. Provide persistent Retry; document when recovery reloads the entire page.
- Give activity filters distinct accessible names and space for wrapping selected text. Stage transitions must accommodate long stage names, actor names and notes without widening their card.

- Supplement viewport checks with internal text bounds and screenshot review. Flex children containing unbroken text may need their own `min-w-0`/maximum width even when the parent already wraps. A clipped card can pass a document-width check.

### Related-panel recovery and readable content (iteration twenty-seven)

- Notes, communication events, recordings and audit history must distinguish failed reads from successful empty results. Reset loading/error state on reload, clear obsolete lists, cancel obsolete requests and offer persistent Retry.
- Give icon-only record actions accessible names. Preserve note drafts after failed creation, show inline failure feedback and guard repeated pending submissions.
- Wrap author/action groups and recording controls within their panel width. Audit before/after values and message bodies must remain readable; do not silently truncate the only displayed copy of meaningful content.
- Bound filter popovers to the viewport, handle missing actor details and validate status/pinned foreground colors in both themes.

### Record action safeguards and audit filters (iteration twenty-eight)

- Serialize overlapping note mutations with a synchronous pending guard and disabled controls. Preserve edited text on rejection, keep failed deletes/pin changes unchanged, and show persistent actionable feedback near the panel. Announce pending status.
- Guard recording-access requests against overlap and disable refresh while access is pending. Keep failure feedback visible so the user can retry an action.
- Audit field search needs an accessible name, announced selection state and an explicit Clear action. Filtered history decorations must follow the displayed list.
- Fixture checks should hold/reject requests to verify pending and error behavior, distinguish cancelled actions from attempted writes, and scope selectors to the panel rather than matching route announcements or sidebar labels.

### Successful actions and live data acceptance (iteration twenty-nine)

- Pair mocked failure tests with successful-response checks and scoped live persistence checks. Delete only temporary test records created for the check, and verify cleanup. Retain evidence of initial failures and subsequent fixes.
- For recording URLs obtained asynchronously, present an explicit user-clicked link with `noopener noreferrer`; clear prior links before requesting another and accept only HTTP(S) URLs. Verify destination handoff separately from actual media playback/download.
- Include real populated scoring panels, task summaries, pagination controls and activity timelines in enlarged-text checks. A wrapping selector may need to override the shared primitive's fixed height, line clamp and flex minimum width.
- Treat provider emptiness and output-budget exhaustion as distinct errors when response metadata permits. Do not silently increase configured spending/token budgets or claim an intermittent failure is resolved merely because a retry succeeds.

### AI recovery and provider diagnostics (iteration thirty)

- Keep the previous generated result visible after a failed request. Show persistent failure feedback with Retry bound to the original action, and guard repeated pending requests synchronously. Abort/ignore obsolete record responses.
- Verify AI drawer keyboard containment and focus return, as well as loading and error states. Exclude intentionally hidden assistive labels from visual clipping assertions.
- Diagnose empty responses using limited metadata, never raw reasoning text. Separate output-budget exhaustion from other empty responses. Scope provider-specific reasoning options to documented endpoint/model combinations and preserve the configured cap.
- Record live samples before and after an adjustment and distinguish observed improvement from a guarantee. Treat ordinary provider usage/audit logging as expected verification side effects.

- Real-role acceptance uses actual logins and existing role definitions. Keep temporary test accounts unavailable for assignment and deactivate them afterward. State whether checks covered populated record scopes or only empty pages and administrative denials; do not equate the latter with full permission acceptance.

### Populated scopes and native zoom (iteration thirty-one)

- Verify record access with populated team and owner accounts: list visibility, direct reads and denied updates must agree. Return a clear not-found response for an inaccessible update; never report success with an empty result. Re-read the record as an authorized user to confirm denied writes changed nothing.
- Give icon actions and compact selectors accessible names that identify their purpose, with record context for repeated actions. Tooltips alone are insufficient. Preview controls must open a preview, and Escape must restore focus to their trigger.
- Test native browser zoom separately from enlarged root text. Record viewport width, device-pixel ratio and root font size to prove the actual zoom level. Use isolated browser profiles and verify screenshot capture dimensions at zoomed settings.
- Combine automated accessibility checks with keyboard and visual review. Record scan scope and rules requiring manual review; a clean automated scan does not replace screen-reader acceptance or certify untested pages.
- Check important content bounds as well as document overflow: a clipped heading can escape an otherwise clean accessibility scan. Long record names in dialog headers need arbitrary-word wrapping and room for the close control; avoid anonymous flex text that cannot shrink.

### AI message drafts and navigation (iteration thirty-two)

- Generating alternatives must preserve an existing composed message and previous variants on failure. Replacing an unsent message or switching its channel requires explicit discard confirmation; closing and reopening the drawer on the same record preserves it.
- Serialize generation and submission synchronously, disable conflicting controls, and freeze recipient/subject/body while submitting. Submit the reviewed editor values only after the explicit Confirm & send action. Show submission failures beside the editor and retain its content.
- Distinguish queued messages from requests awaiting another administrator's approval. Neither response proves delivery. Ignore responses for obsolete records, and abort obsolete generation requests; cancelling a browser request is not proof that a server-side send was cancelled.
- Warn before document unload and intercepted same-tab link navigation with an unsent message or pending submission. Document the guard's boundary: programmatic routing and same-document Back/Forward need separate handling. Do not claim a component-level guard protects all CRM forms.

### Navigation-safe message state (iteration thirty-three)

- Keep unsent AI message state above the record route so client-side links and browser history cannot silently erase it. Key each draft by entity type and ID, and recreate the store when the authenticated user, tenant or impersonation scope changes.
- Keep this recovery state in memory only. Explain that refreshing/closing the tab or signing out clears it. Keep a document-unload warning active while any retained draft or submission exists, even when its record is no longer displayed.
- Pending submission state belongs to the retained draft. Returning to the record must not enable another send while the original request is pending. Settle the original record's state when its response arrives; do not mutate the newly displayed record or a later authentication scope.
- Provide an explicit confirmed Discard action and disable it during submission. Distinguish preservation from navigation cancellation: these drafts survive same-document navigation; the app does not claim to block every browser or router navigation.

Routing background: the browser exposes multiple navigation paths, with cancellation constraints described in the [Navigation API proposal](https://github.com/WICG/navigation-api). The CRM recovery implementation preserves state above routes and does not depend on this API or patch browser history methods.

### Editor dismissal and initial values (iteration thirty-four)

- Dynamic record forms register their dirty/pending state with their containing StandardDialog. Escape, the close icon and overlay dismissal must consult the same guard as Cancel. Untouched forms close immediately; edited forms ask before discard; pending saves block dismissal.
- Reset the form's dirty baseline after a successful save. Preserve dirty values and errors after rejection. A save callback may close the dialog directly after success without showing a discard prompt.
- Use the same opt-in guard for inline note edit cancellation/replacement and document unload. New note text also needs an unload warning. This guard does not retain notes/forms across SPA routing or intercept every navigation path.
- Verify initial select values after metadata/options load. Ignore transient empty events from native select initialization when empty is not a valid user option; explicit None/clear choices must remain available. Test saved Opportunity type and stage before any user edits.

### Retained record and note drafts (iteration thirty-five)

- Keep shared record-form and note drafts in an authentication-scoped memory provider above routes. Use separate keys for object/record, new versus edited notes, and create-form initial context. Never use browser storage for this recovery state.
- Restore only currently defined form fields. Keep a dirty baseline distinct from retained values; successful saves and accepted discards clear retained dirty state. Explain that refreshing, closing the tab or signing out clears recovery data.
- Preserve pending saves across remounts, block conflicting actions on return, and settle the originating draft when a late response arrives. Late success must clear the unsaved baseline and acknowledge completion; late failure must retain values and actionable feedback.
- Refresh notes after pending mutations settle so a newly mounted panel sees the server result. Provide an explicit confirmed discard action for an unsubmitted new note, independently of an existing note edit.

### Custom Task editor safeguards (iteration thirty-six)

- Custom editors must use the same draft lifecycle as metadata-driven forms: retain edits above routes, scope new drafts by their initial record links, confirm discard and prevent dismissal during saves.
- Guard submission synchronously using retained pending state, disable the form and conflicting actions, and show errors inside the editor. Returning to an editor must preserve the pending lock; late success clears the draft and acknowledges completion, while late failure retains edits.
- Test both create and edit flows and rerun keyboard/focus checks after changing dismissal behavior. Immediate checklist, queue and dependency operations remain separate actions and require their own acceptance coverage.
