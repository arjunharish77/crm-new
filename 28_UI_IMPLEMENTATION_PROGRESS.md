# CRM UI implementation progress

Updated: 2026-09-12. Application: `crm`, port 3000. This tracks phased implementation following [the UI remediation plan](26_UI_REVIEW_AND_REMEDIATION_PLAN.md) and [design standard](27_UI_DESIGN_STANDARD.md).

## Initial delivery (subsequent iterations below)

The shared shell now provides usable mobile navigation, a compact header, independent desktop navigation scrolling, flexible page width, measured sticky-header offsets, bounded dialogs and locally scrolling tab strips. Navigation is grouped by task and pinned destinations are removed from the ordinary module list. Existing URLs and feature gates remain in use.

Leads, Tasks and Activities now use a shared page header. List controls, selection actions and pagination wrap inside the workspace; only the table scrolls horizontally. Opportunities has wrapping controls. Lead and opportunity details use flexible grid tracks, a primary call-outcome action, a secondary action disclosure, and collapsible mobile properties so the working content appears sooner. Qualified lead status now uses a readable foreground on its pale fill.

Settings uses one outer layout, a compact section selector on narrow screens and categorized searchable navigation on wide screens. Integrations no longer reserves its secondary fixed track on ordinary laptop widths. Form and automation editors use a shared workspace with panel switching based on available width. Form fields can be added with a click or Enter, and panel switching preserves unsaved fields. Save remains outside hidden panels.

Reports now shows a persistent retryable overview error instead of credible-looking zero metrics after a failed request. Tasks uses unavailable count placeholders on failure; record details distinguish load failure from missing data. Shared card and border styling is quieter. The setup checklist starts collapsed. Login labels and password visibility controls have accessible names. Platform navigation received source-level sizing and destination corrections.

## Phase status

“Implemented” is not the same as full acceptance. The original roadmap gates remain open where business journeys or route families have not been exercised.

| Package | Current status | Remaining acceptance work |
|---|---|---|
| UI-A — baseline | Review delivered | Retain baseline evidence; extend role/state coverage during rollout. |
| UI-B — shared shell | Implemented; representative browser checks passed | Sweep all overlay callers, keyboard/zoom combinations, maintenance and impersonation banner combinations. |
| UI-C — reference work | Leads/Tasks layout and detail composition implemented | Full fresh-lead → call outcome → follow-up journey, return-state restoration and selection workflows. |
| UI-D — work modules | Opportunities/Activities plus Cases, Call Center, Lists, Views, Exports and Approvals layout migrated; representative browser checks | Live Call Center recovery verified in iteration three; full mutation workflows and cross-role states remain open. |
| UI-E — settings | Shared navigation/layout, Integrations, ten settings editors and seven administration/governance pages, four scoring/routing pages and detailed integrations/marketplace layouts migrated | Remaining settings destinations, admin aliases, nested configuration states and save/reload acceptance remain open. |
| UI-F — builders and reports | Form/automation workspaces, report library/builder, metrics/schedules/comparison and marketing composer/journey setup migrated | Real save/reload, report semantics, delivery/enrollment, version/history and remaining metadata-state acceptance. |
| UI-G — remaining families | Dashboard, My Payouts, AI panel, commission/gamification settings, partner administration and payout-cycle configuration migrated; setup/login/platform navigation received targeted changes | Remaining authentication/public states, authenticated platform detail/governance screens, remaining financial dialog states and financial mutation acceptance. |
| UI-H — final acceptance | Not complete | Cross-role, themes, real 200% zoom, long-content/large-data and full route-state sweep; reconcile open findings. |

## Verification evidence

- Production build completed successfully; TypeScript passed.
- Existing automated suite: **146 test files, 1,833 tests passed**. The initial sandbox run failed DNS-dependent outbound-guard cases; the authorized rerun with network access passed. These are repository checks, not proof of every UI workflow.
- Targeted ESLint checks passed for the changed UI components and pages; whitespace checks passed.
- [Phase B evidence](ui-audit-2026-09/phase-b/): mobile drawer opening, Escape dismissal, focus return, closed-drawer removal, navigation and dialog containment.
- [Phase C results](ui-audit-2026-09/phase-c/results.json): 15 route/viewport combinations (Leads, Opportunities, Tasks, Activities and a loaded lead detail at 390/768/1280px).
- [Phase E results](ui-audit-2026-09/phase-e/results.json): 12 combinations (Settings, Integrations, Service Desk and Users at 390/768/1280px).
- [Theme samples](ui-audit-2026-09/phase-h-sample/theme-results.json): Leads in Forest/Ocean, light/dark at 1280px; containment checked and representative screenshots visually inspected. This is not an all-theme contrast audit.
- [Narrow/wide results](ui-audit-2026-09/phase-h-sample/results.json): Leads, Tasks and Integrations also fit at 320/1440px (six combinations); active navigation groups can collapse and reopen.
- [Form interaction evidence](ui-audit-2026-09/phase-f-interactions/form-unsaved-keyboard-click.png): Enter and pointer click add fields; both survive panel switches; Save stays in the mobile viewport. The draft was not saved.
- [Phase F results](ui-audit-2026-09/phase-f/results.json): 12 combinations (form editor, new automation, Reports and Marketing at 390/768/1280px). Marketing coverage here is containment evidence; its composer has not been redesigned.

The tenant-admin test account was used. Screenshots contain local test CRM data. A session expired during resumed testing and was refreshed through normal login. The browser helper waits for bootstrap before testing navigation and rejects redirected routes so a login screen cannot accidentally count as a passing page. Temporary authentication storage is not part of the evidence bundle. The form metadata request `/api/custom-fields` returned HTTP 500 during diagnosis; built-in field checks passed, but custom-field library availability remains a separate unresolved backend/environment dependency. Intermittent initial-loading checks were rerun after bootstrap; this is not evidence of every loading state being accepted.

## Reusable browser check

Run `node scripts/ui-layout-smoke.cjs` against a running local CRM with a separately obtained Playwright storage-state file. Set `CRM_AUDIT_AUTH_STATE` to that file. Optional variables: `CRM_UI_BASE_URL`, `CRM_UI_ROUTES` (comma-separated paths), `CRM_UI_WIDTHS` (CSS pixel widths), `CRM_UI_OUTPUT`, `CRM_PLAYWRIGHT_MODULE` and `CRM_CHROMIUM_PATH`.

Set `CRM_UI_FORM_ROUTE` to an editable test form to check keyboard/click field addition, panel retention and Save visibility. This interaction check deliberately leaves changes unsaved. The helper uses existing routes/data; do not interpret it as a complete workflow or accessibility test. It stops on rate limiting. Never commit session storage or credentials.

## Next implementation order

1. Complete UI-C/D workflow acceptance: filtering/pagination, list membership and bulk selection, case replies/assignment/SLA, approval decisions, exports and live telephony. The layout migration is delivered; full business-workflow acceptance remains open.
2. Migrate the remaining settings editors and complex service-desk/integration panels; test long field names, validation and nested dialogs.
3. Complete UI-F for reports and marketing, plus existing automation/form editing and save/reload regression with disposable records.
4. Finish UI-G families, then UI-H with appropriate role accounts and the full viewport/theme/data matrix.

No backend migration or deployment is required by these UI changes. Existing unrelated workspace changes were preserved. Do not mark WP12 or feature checklist items globally complete from this iteration alone.


## Second iteration — work modules (2026-09-10)

### Delivered

- **Cases:** shared page header, filters below the primary action, named filters that reset to page one, and single-column create fields on mobile. Detail pages use flexible grid tracks and the shared mobile properties disclosure; subject, status and overdue SLA remain visible above the conversation. Long subjects and comments wrap.
- **Lists:** shared header and wrapping search/type controls, named create fields and persistent retryable errors. List details preserve error visibility and defer the large lead picker fetch until Add Leads opens. Picker loading/failure is distinct from no available leads. The popover uses the actual trigger width.
- **Call Center:** wrapping record/action rows, persistent initial-load error, explicit stale-data warning after a failed background refresh, and retryable queue errors. Switching queues ignores an older request's late response. Campaign workspace actions wrap and next-call failures remain visible.
- **Smart Views:** removed viewport-derived minimum height and fixed selector minimum width; bounded section navigation has a selected state; selection actions wrap. View-load and tab-load failures have Retry, and failed tab counts use an unavailable marker. Existing view/filter/query semantics remain intact.
- **Exports:** shared header, contained table with a mobile scrolling hint, persistent history errors, and sensitive-field configuration behind a disclosure. Rules no longer appear empty after a failed request, and an empty rules list no longer claims every export runs immediately.
- **Approvals:** shared header, wrapping long request content and reachable actions. Existing decision endpoints and confirmation behavior remain unchanged.

### Verification and limits

- [Live route results](ui-audit-2026-09/phase-d/results.json): **24 route/viewport combinations** across six module pages plus populated case/list details at 390, 768 and 1280px. Screenshots preserve the actual loaded/error states; geometry passing does not imply the API succeeded.
- [Minimum-width results](ui-audit-2026-09/phase-d-narrow/results.json): all eight routes also passed document containment at 320px.
- [Browser fixture checks](ui-audit-2026-09/phase-d-interactions/results.json): **14 checks** covering six failed-load/Retry journeys, unsaved Cases/Lists create dialogs, and long populated Call Center/Approvals content at 320/390/1280px. Action bounds are checked as well as document width. Fixtures are intercepted only in the browser and are labeled as such; no call, approval or record creation is submitted.
- [Final long-content checks](ui-audit-2026-09/phase-d-long-content/results.json): six targeted rechecks passed after visual inspection found a clipped approval title. The final assertion checks the title’s own scroll width and bounds, not just the page width. These screenshots supersede the approval-title screenshots in the earlier fixture run.
- **62 existing tests across seven relevant files passed**, covering Cases, Call Center, Approvals and export behavior. Targeted ESLint, TypeScript and the production build passed; whitespace checks passed.
- Live Call Center displayed its retryable unavailable state during this run. Its populated layout and recovery are verified with fixtures, not a healthy live endpoint. Resolving that live dependency and checking telephony actions remain necessary for acceptance.
- Campaign workspace changes received source/lint/type coverage; fetching/claiming campaign members and placing calls were not exercised. Partner/counselor/platform roles, actual approval decisions, case reply/assignment/SLA mutations, list membership changes, and export downloads remain outside this iteration's browser checks.

Run `scripts/ui-work-modules-smoke.cjs` with the same local Playwright/auth environment variables as the layout helper. Its responses are deliberately controlled test fixtures. Keep authentication storage outside the repository.


## Third iteration — Call Center repair and settings editors (2026-09-10)

### Call Center endpoint fixed

`GET /api/call-center/workspace` failed for two independent SQL reasons: the disposition-history query used an unqualified `tenantId` in a multi-table join, and the live/missed-call queries compared text CRM ids directly with UUID telephony references. The fix qualifies disposition filters with `cd` and casts the telephony references to text. Core Lead/Opportunity ids remain uncast, preserving compatibility with text ids and their indexes. Tenant and agent filters remain in place. No schema migration was required.

[Live endpoint verification](ui-audit-2026-09/phase-e-editors/call-center-live.json) records HTTP 200 with the supervisor team section present. The test account's personal call/record arrays were empty, a successful response rather than a fabricated populated state. [Live browser screenshot](ui-audit-2026-09/phase-e-editors/dashboard_call-center-1280.png) confirms the workspace now renders. The unavailable-endpoint limitation recorded in iteration two is resolved; placing calls and campaign mutations are still separate acceptance checks.

Regression coverage adds qualified-filter and UUID/text-join checks to the existing disposition and Call Center suites. **30 tests across those two files passed**, and the live database check independently confirms PostgreSQL accepts the corrected queries.

### Settings implementation

- **Service Desk:** eight sections now use `SettingsSections`, which responds to content width. It loads sections on first visit and retains visited forms when hidden, preserving unsaved drafts. Inline creation rows wrap; section failures expose Retry rather than looking empty.
- **Call dispositions, scripts and campaigns:** shared headers and wrapping action rows, focused descriptions, responsive form grids and persistent load errors. Removed duplicate dialog padding and nested viewport-height scroll containers so the standard dialog owns scrolling.
- **Task SLA policies and playbooks:** shared headers and readable controls. A failed SLA policy load prevents editing synthetic defaults until Retry succeeds. Priority inputs/switches have names for keyboard and assistive-technology use.
- **Teams:** shared header and removal of the fixed 600px table container.
- **Permission Templates:** full-width module/type selection replaces the inner sidebar; list failures have Retry and form controls wrap. Permission semantics and save payloads are unchanged.
- **Catalog:** shared header, more conservative two-column layout, wrapping entity actions, persistent load failures and corrected keyboard handling so child action keys do not also select the parent row.
- **Custom Fields:** shared header, distinct loading/error states, and request ordering so a late response from the previous object tab cannot replace the current tab's fields. The previously observed live custom-field API failure is not claimed fixed by this UI change.

[Route evidence](ui-audit-2026-09/phase-e-editors/results.json) covers **33 combinations**: ten settings pages and live Call Center at 390/768/1280px. This does not prove every conditional editor or all 35 settings destinations are accepted. Remaining work includes Users/Roles and other admin aliases, security/governance, assignment/scoring, marketplace and deep integration configuration, plus actual configuration save/reload workflows.


[Settings interaction evidence](ui-audit-2026-09/phase-e-settings-interactions/results.json): **19 checks passed**—Service Desk draft retention, all eight sections at 320/1280px with control-bound checks, permission-template draft retention/dialog containment/Escape, and a browser-fixture SLA load failure followed by Retry recovery. No configuration was saved by these checks. Targeted ESLint, TypeScript and the production build passed. The route screenshots and interaction checks are representative evidence, not blanket acceptance of every editor.

## Fourth iteration — administration and governance UI (2026-09-10)

### Implemented

- **Users:** shared page header, persistent list/session failures with Retry, wrapping session details, labeled form fields, and an Edit action plus named More actions menu replacing five row icons. Missing last-login timestamps are no longer fabricated from the current time. Password-reset copy controls have accessible names.
- **Roles:** quieter responsive cards, wrapping names/descriptions, list failure recovery and a shared header. The role editor uses linked labels and short selected permission text, with descriptions retained in the option list. Shared select triggers allow their values to shrink within the available width.
- **Assignment Rules:** wrapping header controls and rule rows, named edit/delete controls, list failure recovery and a bounded sheet body/footer. Draft routing semantics and save payloads remain the same.
- **Security Policies:** shared header, linked field labels, conservative column widths, failed/empty-load states and restoration of saved values on Cancel. Policy selection is disabled during editing/saving. Backend policy enforcement and access requirements are unchanged.
- **SCIM:** shared header, bounded role selector, wrapping synchronization rows, persistent load errors and a disabled role editor while loading. No provisioning or default-role changes were submitted.
- **Audit Logs / Data Privacy:** shared page headers, responsive filters and wrapping dialog controls, and persistent list errors with Retry. The Privacy activity filter has a short label and contextual description; its previous long button overflowed the phone viewport.
- **Settings navigation:** Audit Logs and Data Privacy now appear in the Security group. Directly opening a feature-disabled destination retains its correct section name in the compact selector.

### Verification and limits

[Interaction evidence](ui-audit-2026-09/phase-e-admin-interactions/results.json) records **13 passing checks**: role/invitation/assignment editors at 320 and 1280px, five failed-list/Retry scenarios, and audit filter containment at both widths. Role and invitation drafts survive resizing; changing a role permission preserves the name draft and displays only the compact selected label. Dialogs are closed without saving. Failure responses are browser fixtures, explicitly labeled in the results.

[Route evidence](ui-audit-2026-09/phase-e-admin/results.json) records **21 passing route/viewport checks** across the seven destinations at 390/768/1280px. The Security route shows the test account's permission-denied state; SCIM shows its feature-disabled state. These are **not** acceptance of the platform policy editor or populated SCIM configuration. Those branches still need browser coverage with appropriate access, as do populated audit review/comment dialogs, user session/reset workflows, rule strategy variants and actual save/reload workflows.

Remaining implementation includes scoring/assignment variants, deep integrations and marketplace, report and marketing builders, other settings/admin destinations and final cross-role/theme/zoom acceptance. The existing custom-field endpoint failure remains open. Existing Users bulk-delete code only changes local state, and select-all deactivation passes no ids; these pre-existing functional gaps require separate remediation and are not accepted by this UI phase.

Targeted ESLint, TypeScript, whitespace checks and the production build passed for this iteration. The build compiled and generated all 365 static pages successfully.

## Fifth iteration — truthful user bulk actions and live Custom Fields verification (2026-09-10)

- **Custom Fields:** the previously observed 500 could not be reproduced in the current local app. All three live requests return HTTP 200: Leads (7 fields), Opportunities (7), Activities (0). The Leads UI renders populated data. No backend/query/schema change was made in this iteration, and the cause of the earlier failure is not established. [Live evidence](ui-audit-2026-09/phase-e-user-bulk/custom-fields-live.json), [screenshot](ui-audit-2026-09/phase-e-user-bulk/custom-fields-live-1280.png).
- **User deactivation:** the bulk action uses the actual selected IDs, including all-loaded-user selection, and is labeled Deactivate. It waits for every request, refreshes server data, reports partial results, and retains only failed IDs for retry. A pending guard prevents duplicate submissions. Existing tenant-admin PATCH authorization and audit behavior are retained.
- **Unsupported deletion:** removed the Users bulk Delete action and its local-only success handler. The user API has no DELETE endpoint. This removes a misleading action; it does not implement permanent user deletion. Deactivation remains available, preserving record ownership/history.
- **Bulk toolbar:** action labels remain visible on mobile; the toolbar wraps within the viewport and supports a disabled state while updates run.
- **Manager assignment:** removed the fallback that reported mock success on request failure. The dialog now reports the failure and keeps the selection/draft. The bulk assignment endpoint is absent and remains functional work; individual-user editing remains the existing route for manager changes.

[Browser evidence](ui-audit-2026-09/phase-e-user-bulk/results.json): **six checks passed**, covering toolbar containment at 320/1280px, cancelled confirmation, all-selected IDs, partial-failure selection, retrying only the failed ID, refreshed results, and preservation of a manager draft after failure. All user mutations were intercepted fixtures; no real accounts were changed. The helper is `scripts/ui-user-bulk-smoke.cjs` and requires external authentication storage like the other UI runners.

TypeScript, targeted ESLint, whitespace checks and the production build passed. Permanent user deletion and a working bulk manager-assignment endpoint remain unimplemented; other UI-E through UI-H work remains as recorded above. Custom Fields is currently healthy locally, superseding the earlier open-outage status without claiming a root-cause fix.

## Sixth iteration — scoring, recommendations and routing settings (2026-09-11)

### Implemented

- **Lead Scoring:** shared header, compact section labels, conservative column widths and a wrapping rule dialog. Predictive settings remain mounted across section switches, preserving unsaved edits. Rules, predictive settings, model versions and feature catalog have independent Retry states. Failed settings do not expose editable defaults; rule recomputation is disabled while rules are loading/unavailable. Static form labels are linked to controls.
- **Next-Best-Action:** shared header, wrapping rule rows/actions, named controls and a persistent configuration-load error. Failed requests block the strategy editor; a successful empty strategy still exposes the existing first-configuration defaults.
- **Agent Availability:** shared header, wrapping working-hour controls, bounded long names/emails, named status/hour/cap controls and a persistent load error. Existing immediate-save behavior is unchanged.
- **Sales Groups:** shared header, removal of duplicate workspace padding and persistent list failure recovery. Nested membership and template mutation workflows remain separate acceptance work.
- **Shared condition editor:** wrapping header controls and columns based on actual container width (640px), instead of fixed minimum columns selected by viewport width. Conditions remain usable inside narrow dialogs.

### Successful null response fix

`apiFetch` called `Object.keys(data)` while constructing debug metadata for every JSON response. A successful `null` response therefore threw even with debug logging disabled. Added a null guard and a regression test. This matters for a workspace with no Next-Best-Action strategy: the endpoint legitimately returns `null`, and the editor supports that state.

[Live API evidence](ui-audit-2026-09/phase-e-scoring/next-best-action-live.json) confirms both Lead and Opportunity strategy requests return HTTP 200 with an empty strategy. No strategy was created by verification. The earlier live unavailable state in this iteration was client parsing, not proof of a failed backend endpoint.

### Verification and remaining scope

[Interaction evidence](ui-audit-2026-09/phase-e-scoring-interactions/results.json): **17 passing checks**, including four scoring failure/Retry states, draft retention across tabs, condition-dependent rule fields, dialog/working-hour containment at 320/1280px with long agent text, sales-group recovery, and an empty recommendation configuration followed by a populated draft condition row. Responses are browser fixtures. Configuration writes were blocked; background availability GET polling was excluded from the mutation counter.

[Route evidence](ui-audit-2026-09/phase-e-scoring/results.json) records **12 passing checks** across four destinations at 390/768/1280px. The refreshed live Next-Best-Action screenshot shows its initial strategy controls loading successfully after the null-response fix. The API helper suite passes **9 tests**, including the new null-response regression. These checks do not validate scoring calibration, model promotion, recomputation, strategy saves, availability mutations or membership changes. Integration/marketplace detail, remaining settings, reports/marketing builders and final cross-role/theme/zoom acceptance remain pending.

Final checks for iteration six: TypeScript, targeted ESLint, whitespace checks and the production build passed. No scoring, availability or recommendation configuration was saved during verification.

## Seventh iteration — detailed integrations and marketplace UI (2026-09-11)

### Implemented

- **Integration navigation:** seven sections now use `SettingsSections`, with a compact named selector when space is limited and a wrapping button group when enough content width is available. Sections remain mounted after first visit so unsaved drafts survive navigation. Optional section-change callbacks preserve lazy inbound/health loading.
- **Telephony:** replaced the twelve-item inner rail with a named section selector. Configuration rows, header actions, secrets and mapping controls wrap; messaging/external-push side panels use more conservative grid widths.
- **Load states:** failed base integration requests show Retry rather than empty webhooks/imports. Inbound capture, telephony, messaging, external integrations and health have independent loading/error states and retry their own requests. Telephony inputs cannot be edited before its configuration loads successfully. Ancillary call-log/suppression/team metadata failure handling remains outside this pass.
- **Marketplace:** shared header, compact tabs, persistent load failure recovery, wrapping app text/statuses and an App actions disclosure to reduce row clutter. Registration, sync/mapping and other configuration rows stack or wrap within narrow dialogs. Existing permission/approval requirements and action payloads are unchanged.
- **Shared dialogs:** added a bounded grid column and wrapping titles/descriptions to `StandardDialog`. A long unbroken marketplace name previously forced the dialog's inner column outside the viewport despite the outer dialog width; the column now shrinks with its container. The checks cover title scroll width, action bounds and dialog bounds, rather than document width alone.
- **Labels:** integration field helpers use `useId` for connected labels; static webhook, registration and configuration fields have explicit label/control links.

### Evidence and remaining acceptance

[Interaction evidence](ui-audit-2026-09/phase-e-integrations-interactions/results.json): **55 passing checks** cover all seven integration sections and twelve telephony panels at 320/1280px, telephony draft retention, independent load failure/Retry states, marketplace recovery, collapsed/expanded app actions, webhook registration, app registration and sync mapping dialogs with a long app name. All connector/marketplace responses are fixtures, and configuration writes are blocked. No apps were registered, installed or published; no secrets were rotated and no external payloads were sent.

[Live route evidence](ui-audit-2026-09/phase-e-integrations/results.json) records **six passing route/viewport checks** for Integrations and Marketplace at 390/768/1280px. These initial route captures do not establish live delivery, health, inbound capture or sync functionality. Marketplace approvals, version rollback, contract/action/report editors, CSV execution, real connector save/reload and remaining nested error states still require workflow acceptance. Other remaining settings and UI-F through UI-H remain open.

Final iteration-seven checks: TypeScript, targeted ESLint, whitespace checks and the production build passed. The browser fixture suite reported zero configuration mutations.

## Eighth iteration — report library and builder (2026-09-11)

### Implemented

- Shared report page header and nine-section navigation: a named selector below 1000px of report workspace and wrapping tabs above it. Visited sections retain unsaved state; overview loading/retry no longer replaces the entire page.
- Saved-report Edit now opens and populates the builder even before its first mount. Parent-owned selection delivers the chosen report after the editor mounts; existing URL deep links remain supported.
- Builder setup, columns, filters, sorting, inbuilt report rail, schedule and annotation grids use more conservative content-width breakpoints. Action rows wrap, saved-report names break within their rows, and mobile builder cards have smaller padding.
- Optional AI report assistance is collapsed under “Build with AI.” Setup/sort and other static form fields have linked labels; repeated builder column/filter controls have distinct accessible names.
- Saved library and builder field-catalog failures show persistent recovery controls rather than a misleading empty library or unusable editor.

### Verification and remaining scope

[Fixture evidence](ui-audit-2026-09/phase-f-reports/results.json): 15 passing checks cover saved reports with a long unbroken name, builder setup, populated columns and filters at 320/768/1280px, independent library/catalog failure recovery, first-visit Edit navigation and unsaved name/column retention. Report requests are intercepted. The single usage-tracking POST is fulfilled by the fixture; no real reports were saved, queried, exported or deleted.

This iteration does not complete UI-F. Advanced metric/compare workflows, scheduled delivery, real save/reload/version acceptance, marketing builders, remaining settings and UI-G/UI-H remain pending. Ancillary metadata and other report-section error states still need deeper acceptance.

[Live report evidence](ui-audit-2026-09/phase-f-reports-live/results.json): all nine report sections passed document-width checks at 390/1280px (18 checks), with no report API errors observed during the run. Captures are initial section states and do not establish successful scheduling, metric evaluation, exports or delivery.

Final iteration-eight checks: TypeScript, targeted ESLint, whitespace checks and the production build passed (365 static pages generated). Temporary browser authentication files were removed after verification.

## Ninth iteration — advanced report editors and recovery (2026-09-11)

### Implemented

- **Metrics:** separate Metrics and Calculated metrics sections reduce editor clutter and retain drafts after navigation. Metric form grids and nested field selectors stack at narrow widths; repeated filters and calculated steps have accessible names.
- **Recovery:** metric list loading and field/team metadata have independent persistent error states. Calculated metrics retry both their definition list and source metric list. Schedule-list failures no longer appear as “No recurring schedules”; custom report source failures show recovery and disable dependent scheduling actions.
- **Schedules:** long report names and recipient addresses wrap within the schedule row instead of forcing document overflow. Existing actions and schedule payloads remain unchanged.
- **Comparison:** each segment has visible labels and a named fieldset; nested controls respond to panel width. Changes clear previous results. Request-version checks discard delayed responses after inputs change. Failure recovery keeps the draft, and Compare remains disabled until both segments have values.

### Verification and remaining scope

[Fixture evidence](ui-audit-2026-09/phase-f-advanced-reports/results.json): **22 passing checks**, including metric field/list recovery, calculated source recovery, schedule-list/custom-source recovery, comparison recovery, editor/formula/schedule/comparison containment at 320/768/1280px, retained metric drafts, clearing old results on input change and rejecting a delayed stale response. Test responses are fixtures; the suite reports zero configuration writes.

Real metric saves, governance changes, scheduled delivery, populated production comparison semantics and history/version acceptance remain pending. Marketing builders are the next UI-F area; remaining settings, UI-G and final role/theme/zoom acceptance remain open.

[Live evidence](ui-audit-2026-09/phase-f-advanced-reports-live/results.json): eight passing layout checks across Metrics, Calculated metrics, Schedules and Compare at 390/1280px. No report/metric/team API errors were observed. These initial-state checks do not validate real saves or scheduled delivery.

Final iteration-nine checks: TypeScript, targeted ESLint, whitespace checks and production build passed. Temporary browser authentication files were removed after verification.

## Tenth iteration — campaign composer and journey setup (2026-09-11)

### Implemented

- Shared Marketing page header, more conservative campaign list/detail split width, wrapping action rows and containment for long campaign/journey names and preview text.
- Campaign composer separates Audience, Message and Preview into retained sections. Composer and journey state survive navigation to other Marketing sections.
- New Campaign opens Composer. Loading no longer depends on the selected campaign; default/deep-link selection applies only on initial successful load. Refresh preserves an unsaved draft.
- Manual-recipient input keeps raw text separately from the parsed API recipient list, so typing a line break no longer deletes it.
- Persistent Marketing and Journey list failure states replace false empty results. Required campaign actions are disabled during failed/loading data states.
- Journey target-module changes clear audience configuration and move incompatible Lead List selection to Saved View. View loading/retry is module-scoped, stale responses are discarded, and Create requires a ready audience. Create has a pending state; static editor/dialog labels are connected to controls.

### Acceptance scope

No messages were sent, campaigns launched, journeys enrolled or workflow versions published during UI verification. Real save/reload, audience preview freshness, delivery/approval workflows, journey version recovery and remaining ancillary metadata errors still require acceptance. Existing automation workflow editing was handled in the earlier builder phase; this pass covers its marketing entry/setup surface. Remaining settings, UI-G and final role/theme/zoom acceptance remain open.

[Fixture evidence](ui-audit-2026-09/phase-f-marketing/results.json): **23 passing checks** cover base load recovery, campaign/journey long-name containment, audience/message/preview layouts and journey dialogs at 320/768/1280px, manual-recipient line-break entry, New Campaign without a selection-triggered refetch, drafts surviving navigation/Refresh, and target-module audience recovery. Configuration writes were blocked; the mutation count was zero.

[Live evidence](ui-audit-2026-09/phase-f-marketing-live/results.json): **10 passing layout checks** across all five Marketing sections at 390/1280px; no Marketing/Communications API errors were observed. These initial-state checks do not establish delivery or enrollment behavior. Final visual refinements align selector widths/field spacing and show summary cards only on Campaigns and Delivery Analytics.

Final iteration-ten checks: TypeScript, targeted ESLint, whitespace checks and production build passed. Temporary browser authentication files were removed after verification.

## Eleventh iteration — dashboard, My Payouts and AI verification (2026-09-11)

### UI implemented

- Dashboard uses shared workspace spacing/header and stacks widgets below 900px of actual workspace width. Persona-template controls are disclosed separately; long tab names wrap and tab-option buttons remain visible to keyboard/touch users.
- Dashboard and My Payouts load failures show persistent Retry instead of initialization/empty-history states. Dashboard versions and payout breakdowns have recoverable errors; stale version/breakdown responses are guarded. Widget/profile/invoice fields have connected labels, and payout names/references/actions wrap.
- AI settings distinguish saved configuration from draft edits, prevent testing stale credentials and clear outdated test results.

[Dashboard/payout fixture evidence](ui-audit-2026-09/phase-g-dashboard-payout/results.json): **24 passing checks** cover long dashboard tabs, workspace-width stacking, widget/version/profile/breakdown dialogs and payout history at 320/768/1280px, plus failure recovery. Dashboard writes are intercepted; no payout mutations occur. This is UI fixture evidence, not payout accounting or payment execution acceptance.

The user requested AI connection and feature verification during this phase. See [AI verification](29_AI_ASSISTANT_VERIFICATION.md) for coverage, fixes and the pending successful provider generation check. Administrative payout cycles, partner/commission screens, rewards, remaining settings and UI-H still remain open.

AI verification also passes **37 unit tests** and [three settings browser checks](ui-audit-2026-09/ai-settings/results.json). The user's live OpenAI test reached the provider but returned exhausted API credits; successful live generation remains pending a usable provider quota. No claims of complete AI production acceptance are made.

Final iteration-eleven checks: TypeScript, targeted ESLint, whitespace checks and production build passed. The focused AI suite passed 37 tests; UI fixture suites passed 24 dashboard/payout checks and three AI settings checks. Temporary browser authentication files were removed.

## Twelfth iteration — Groq verification, AI panel and incentive settings (2026-09-12)

### Implemented

- AI sheet uses readable wrapping action buttons, contained generated text and a scrollable body. Concurrent record actions are disabled; record changes discard old results and delayed responses. Changing draft channels clears the prior draft and recipient state. Draft controls have associated labels.
- Commission Rules and Gamification use shared headers, wrapping rule rows and persistent load-error recovery. Required metadata must load before editors become available, preventing failed loads from looking like editable defaults.
- Level and reward editors stack according to available workspace width. Repeated controls now have visible labels and distinct accessible names. Unsaved rewards survive section navigation. Badge icon/name fields stack on phones.
- Updated the shared design standard with these interaction and layout requirements.

### Verification and remaining scope

[AI/finance fixture evidence](ui-audit-2026-09/phase-g-ai-finance/results.json): **19 passing browser checks**, including action/result/draft sheets, commission list/dialog, level/reward editors at 320/1280px, action busy guards, channel resets, commission/gamification recovery and retained reward drafts. The suite intercepts provider responses and blocks finance/send mutations; zero writes occurred.

[AI verification](29_AI_ASSISTANT_VERIFICATION.md) now records **19 successful live Groq checks**: connection, six actions on each of Lead and Opportunity, Lead Email/SMS/WhatsApp drafting, Opportunity two-variant Email drafting, a simple natural-language report preview, and usage/template availability. Evidence records statuses and response lengths without keys or record text. No messages were sent or customer records updated. Human output-quality review, complex report prompts and actual send/approval delivery acceptance remain separate.

Administrative payout cycles, partner administration, remaining settings and final role/theme/zoom acceptance remain open. Real commission saves, reward redemptions, accounting and payment execution are not accepted by these UI checks.

[Live finance evidence](ui-audit-2026-09/phase-g-finance-live/results.json): four passing initial-state checks for Commission Rules and Gamification at 390/1280px, with no API errors observed. This verifies live loading and containment, not financial mutations.

Final iteration-twelve checks: TypeScript, targeted ESLint, whitespace checks and production build passed. The focused AI suite passed 37 tests. Browser evidence includes 19 fixture checks and four live finance layout checks; live Groq evidence contains 19 successful checks. Temporary authentication storage and browser/provider helpers were removed after verification.

## Report verification follow-up — 2026-09-12

Expanded live AI report verification exposed invalid sort shapes, a misleading grouped-count response and date comparisons excluding PostgreSQL Date values. Fixed strict generated-definition validation, added explicit capability instructions/rejections and repaired date comparison/sorting. The builder now resets source/sort/limit when applying AI definitions; its help identifies the row-report scope and directs aggregates to Metrics.

See [extended AI report verification](29_AI_ASSISTANT_VERIFICATION.md) for before/after evidence, independent result checks and limits. This follow-up does not add AI grouping/aggregation or accept full-tenant results beyond the query engine's 1,000-root-record fetch limit. No reports or customer records were saved.

Final report-follow-up validation: 61 focused tests, TypeScript, targeted ESLint, whitespace checks and production build passed. Temporary browser authentication files were removed.

## Additional AI workflows — 2026-09-12

Added qualification review, follow-up planning, objection preparation and rep handoff briefs to Leads and Opportunities. A labelled workflow picker with a short description and one Generate button keeps the existing AI sheet compact. Generation shares the existing record-action busy guard, result labels and copy control.

Workflows use existing governed templates, record context and module/spend policies. Outputs are reviewable plans; they do not create tasks, contact customers or modify records. See [workflow verification](29_AI_ASSISTANT_VERIFICATION.md) for coverage.

[Live workflow evidence](ui-audit-2026-09/ai-workflows/results.json): all four workflows passed on Leads through the browser and on Opportunities through the API (**eight live Groq generations**). Layout checks passed at 320/1280px. Responses were nonempty and between 154 and 317 words in these samples; this does not establish factual accuracy for arbitrary records. Evidence stores lengths and counts, not keys or full generated content. No tasks, messages or owner changes were made.

Final workflow validation: 54 focused AI tests, eight live Groq generations, two viewport checks, TypeScript, targeted ESLint, whitespace checks and production build passed. Temporary authenticated browser files were removed.

## Thirteenth iteration — partner administration and payout cycles (2026-09-12)

### Implemented

- Partner administration uses a shared page header, wrapping organization names/actions, and a per-partner login disclosure. Login controls have visible labels and use the available workspace width to choose one, two or five columns.
- Add Partner and Add Login fields have associated labels. Role loading failures show Retry; creation stays disabled until partner roles are available. Failed partner-dashboard loads no longer appear as “Partner not found.” Dashboard metric/ledger layouts stack based on content width.
- Payout configuration uses the shared header and narrower grids for tax, billing, finance controls and visibility targets. Cycles and payouts stack until the workspace has room for both panels. Long cycle/partner text wraps and configuration labels are associated with controls.
- Settings failures block editable defaults. Cycle, payout and dispute failures have persistent Retry states. Visibility metadata failures are visible and disable settings saves until recovered.
- Cycle changes clear payout selections, and late responses cannot replace the newly selected cycle. Cancelling dispute resolution/dismissal notes now exits without submitting an update.

### Verification and remaining scope

[Fixture evidence](ui-audit-2026-09/phase-g-partner-admin/results.json): **36 checks passed**, covering partner summaries/login controls, create/login dialogs, partner dashboards, payout configuration sections, cycle payouts and hold/adjustment dialogs at 320/1280px; load recovery, visibility metadata recovery and rejection of a delayed cycle response. All partner/financial writes were intercepted; none occurred.

Public CRM pages, authenticated platform administration, remaining settings and full cross-role/theme/zoom acceptance remain open. Real partner creation/access changes, billing saves, approvals, invoices and payment execution are not accepted by these layout tests.

[Live-screen and cancellation evidence](ui-audit-2026-09/phase-g-partner-live/results.json): four live initial-state layout checks passed for Partners and Payout Cycles at 390/1280px with no API errors observed. Two fixture checks confirm cancelling Mark Resolved or Dismiss sends no dispute update. These checks do not execute financial operations.

Final iteration-thirteen validation: 42 browser checks (36 fixture, four live initial-state and two fixture cancellation checks), TypeScript, targeted ESLint, whitespace checks and production build passed. Temporary browser authentication files were removed.

## Fourteenth iteration — public forms, feedback and platform entry screens (2026-09-12)

### Implemented

- Both public-form routes share one page wrapper with consistent spacing/theme colors, bounded content, loading status and explicit closed/missing/recoverable-error states. Public resource requests cancel on navigation/retry so older loads cannot replace the current resource.
- Form fields respond to their panel width; long labels, section names, submit buttons and draft controls wrap. Existing field mapping, visibility, drafts and submission payloads remain in use.
- Survey and unsubscribe failures retain inputs/actions rather than replacing the page with an invalid-link message. Survey comments have a visible label and selected stars expose pressed state; rating/comment controls wait during submission. Long case subjects and recipient addresses stay within the viewport.
- Platform overview and tenant-list failures show Retry instead of zero statistics/empty lists. Revenue without a billing source displays unavailable. The tenant list uses the shared header and a bounded table; its mock bulk-delete action has been removed because it only hid local rows and claimed success.
- Platform navigation has an accessible drawer title, scrollable navigation, a bounded mobile width and closes on a destination click. Desktop navigation retains its reserved width.

### Scope limits

Platform browser checks in this iteration use a fixture user and intercepted platform API responses. They do not establish real platform-admin authentication or tenant operations. No live form responses, feedback, subscriptions or tenants are changed by these tests. Platform tenant-detail/governance/marketplace screens, remaining authentication/settings states and full cross-role/theme/zoom acceptance remain open.

[Public/platform fixture evidence](ui-audit-2026-09/phase-g-public-platform/results.json): **29 checks passed**, including public forms by slug and ID, long-text survey/unsubscribe layouts and platform overview/tenants at 320/768/1280px; load-error recovery, multi-step draft retention, failed-submit recovery and drawer closure. All submissions and platform API responses were intercepted.

[Live public missing-link evidence](ui-audit-2026-09/phase-g-public-live/results.json): **four checks passed** against actual public routes. Live inspection found forms returning `200` with null and surveys returning `400` when missing; those GET endpoints now return `404`, allowing the correct invalid-link UI. Existing/closed resources still return their metadata. Four focused API regression tests passed. No live submissions or subscription changes occurred.

Final iteration-fourteen validation: 33 browser checks (29 fixture and four live missing-link checks), four API regression tests, TypeScript, targeted ESLint, whitespace checks and production build passed. Temporary browser helpers were removed; no authenticated storage was required for these checks.

## Fifteenth iteration — platform tenant details and governance (2026-09-12)

### Implemented

- Tenant details separate Environment & demo, Users & usage, Feature flags and Modules into retained sections. Long tenant/module names and action rows wrap; maintenance and module controls are named. Required metadata failures show Retry instead of editable defaults or a false missing-tenant state. Unsourced storage usage displays unavailable instead of 0 GB.
- Impersonation Review and Privileged Actions use shared headers, wrapping record summaries and persistent load-error recovery. Review notes have an accessible name. Late impersonation-filter responses are ignored; approval configuration is not rendered until its saved setting loads successfully.
- Audit filters use valid nonempty select options for All actions/types. Filter changes reset pagination and late responses cannot replace newer results. The existing search input now actually filters the current page, handles missing user details and shows an explicit no-match row. Pagination and filter controls wrap.
- Schema Status uses a shared header, responsive summary cards and Retry. Refresh clears the previous report so a failure cannot continue displaying stale success.

[Governance fixture evidence](ui-audit-2026-09/phase-g-platform-governance/results.json): **37 checks passed**, covering tenant sections, impersonation summaries/review dialog, privileged actions, schema status and audit logs at 320/768/1280px; metadata recovery, draft retention, delayed filter response protection, approval-setting load guard, audit search and filter pagination reset. All platform API responses and the platform-admin identity were fixtures; all mutation requests were blocked and the observed write count was zero.

Real platform-admin authentication and mutation acceptance remain pending. These checks did not suspend tenants, impersonate users, change flags/entitlements, seed/reset demo data, approve requests or mark sessions reviewed. Platform Marketplace, remaining authentication/settings states and the full role/theme/zoom sweep remain open.

Final iteration-fifteen validation: 37 fixture browser checks, TypeScript, targeted ESLint, whitespace checks and production build passed. Temporary browser helpers were removed.

## Sixteenth iteration — Platform Marketplace (2026-09-12)

### Implemented

- Split the long Marketplace page into Reviews, Blocked installs, App health and Registered apps, with queue/row counts and responsive section navigation.
- Added persistent load-error recovery across the required resources, suppressed false empty queues on failure and guarded against older load responses.
- Wrapped long app/owner/tenant names, badges, review notes and outage hostnames. Installation tables remain locally scrollable; trust selectors have accessible names.
- Added app/owner/installing-tenant/category search, explicit per-installation row counts, no-match feedback and search retention between sections.
- Cancelling block-reason, rejection, unpublish or suspend prompts now stops the action immediately. Explicit blank-reason confirmation and existing API payloads remain supported.

[Marketplace fixture evidence](ui-audit-2026-09/phase-g-platform-marketplace/results.json): **19 checks passed** covering all four sections at 320/768/1280px, load-error recovery, search retention, rejection/suspend/unpublish/rotation cancellation and zero platform writes. The first layout run exposed a long app-name overflow at 320px; the corrected layout passed the complete rerun.

Platform identity and API responses were intercepted fixtures. Real platform-admin authentication, publishing/permission approvals, blocking, suspension and secret rotation remain unverified. Remaining authentication/settings states and full cross-role/theme/zoom acceptance are still open.

Final iteration-sixteen validation: 19 fixture browser checks, targeted ESLint, whitespace checks, production build and a separate post-build TypeScript check passed. An overlapping type-check attempt encountered generated files being replaced by the build; the sequential rerun passed. Temporary browser helpers were removed.

## Seventeenth iteration — authentication and tenant provisioning (2026-09-13)

### Implemented

- Bootstrap status failures now show an explicit retry state instead of Bootstrap Complete. Successful creation removes the creation action and exposes a persistent sign-in button; existing setup has the same clear exit. Short screens scroll instead of centering a fixed-height page out of reach.
- Sign-in, MFA, expired-password and reset forms show persistent submission errors. Password/MFA inputs have connected labels and autocomplete, backup codes support letters, busy actions retain readable text and long submit labels wrap at narrow widths.
- Reset links without a token explain how to recover and offer sign-in navigation. Password confirmation errors stop submission locally; failed requests retain inputs.
- Tenant provisioning has a labelled plan selector, wrapping module label, inline failure feedback and Cancel. Pending requests lock the fields and prevent dismissal; failed requests preserve the draft for correction/retry.

[Authentication/provisioning fixture evidence](ui-audit-2026-09/phase-g-auth-provisioning/results.json): **44 checks passed** covering nine screen states at 320/768/1280px and 390×420px, status recovery, failed-submit retention, password mismatch, MFA back navigation, provisioning pending/dismissal guards, bootstrap completion and reset-to-sign-in navigation. Screenshots include error and success states.

All API responses and submissions were intercepted, including the platform identity and simulated account creation/reset success. No real accounts, passwords or tenants were changed. This establishes UI behavior, not live authentication/MFA/reset/provisioning acceptance. Existing API error normalization remains in use; the browser assertions were corrected to expect its displayed message.

Remaining settings states, full cross-role/theme/zoom acceptance and real platform operations remain open.

Final iteration-seventeen validation: 44 fixture browser checks, TypeScript, targeted ESLint, whitespace checks and production build passed. Temporary browser helpers were removed.

## Eighteenth iteration — personal security settings (2026-09-13)

### Implemented

- Password settings use the shared header, associated labels/autocomplete, persistent validation/request errors and a pending guard. Failed changes retain the entered values; mismatched confirmation stops the request locally.
- Active Sessions uses a wrapping shared-header action, bounded device details and load-error Retry. Failed loads no longer appear as an empty session list; revoke controls wait for pending actions.
- MFA status and remembered-device failures now produce Retry instead of false disabled/empty states. Cards, long device details and security actions fit narrow widths.
- Enrollment clears previous setup data, ignores closed-attempt responses and provides setup Retry. Enrollment/code-confirmation errors persist beside the controls; pending verification prevents dismissal and input changes.
- Regenerated backup codes display in a dedicated dialog instead of a 15-second toast. Codes remain in local page state until dismissed; navigating away discards them. The existing enrollment backup-code display also uses a responsive grid.

[Personal-security fixture evidence](ui-audit-2026-09/phase-g-personal-security/results.json): **28 checks passed**, including seven screen/dialog states at 320/768/1280px, password mismatch/failure retention, session and MFA load recovery, cancelled session revocation, enrollment-start retry and regenerated-code dismissal. Initial checks found a 320px MFA overflow; constrained cards/buttons and wrapping card titles passed the full rerun.

All profile/API responses and mutations were intercepted. No real passwords, sessions, trusted devices, MFA enrollment or backup codes changed. All displayed keys/codes are explicit fixtures. Live security operations, additional settings states and full role/theme/zoom acceptance remain open.

Final iteration-eighteen validation: 28 fixture browser checks, TypeScript, whitespace checks and production build passed. Targeted ESLint reported zero errors and the existing Next.js warning for the enrollment QR `<img>`. Temporary browser helpers were removed.

## Nineteenth iteration — API keys and SCIM controls (2026-09-13)

### Implemented

- API Keys uses the shared header, wrapping key summaries and persistent load-error Retry. Failed loads no longer appear as an empty directory, and dependent creation waits for recovery.
- Creation fields have connected labels and module-scope selectors have accessible names. Access/rate/expiry controls stack at narrow widths. Invalid or fractional/nonpositive rate limits are blocked locally; server failures retain the draft and show an inline error.
- Creation, rotation and revocation have pending guards. Creation/revocation dialogs prevent dismissal during requests, and mutation failures stay visible.
- The one-time secret dialog uses a neutral title for both creation and rotation, wraps long values and names its copy controls. Failed clipboard writes explain manual copying.
- SCIM default-role failures display next to the selector, retain the saved role and disable Refresh while the save is pending.
- Security Policy was inspected and already has the shared header and persistent load-error recovery; no security-policy behavior was changed or newly accepted in this iteration.

[API-access fixture evidence](ui-audit-2026-09/phase-g-api-access/results.json): **26 checks passed**, covering key lists, create/revoke errors, secret disclosure, SCIM and both disabled-feature states at 320/768/1280px; load recovery, invalid-rate rejection, draft retention, pending rotation and failed SCIM role-save retention.

All profile/API responses and submissions were fixtures. No actual API keys were created, rotated or revoked; no real provisioning roles changed. Displayed secrets are explicit test values. Live credential/provisioning acceptance, other nested settings states and the full role/theme/zoom sweep remain open.

Final iteration-nineteen validation: 26 fixture browser checks, TypeScript, targeted ESLint, whitespace checks and production build passed. Temporary browser helpers were removed. Next planned UI acceptance work is the broader theme and responsive-layout sweep; nested workflow and live mutation acceptance remain separately tracked.

## Twentieth iteration — representative theme and reflow sweep (2026-09-13)

### Finding and fix

- Shared destructive buttons and badges hard-coded white text over the pale destructive color in dark mode. Screenshot review caught this despite passing geometry and token-definition checks. Both primitives now use `text-destructive-foreground` and the opaque destructive background, retaining the intended token pairing.
- Added repeatable browser theme/reflow coverage and a standalone token-contrast checker. The browser sweep checks rendered destructive button/badge contrast where those components appear, in addition to viewport/control bounds.

[Theme/reflow browser evidence](ui-audit-2026-09/phase-h-theme-reflow/results.json): **61 checks passed**: eight destinations (sign-in, password settings, sessions, MFA, API keys, SCIM, platform tenants, public form) in light/dark at 320/1280px and 1280px with doubled root text; sign-in/password in Ocean, Sunset and Grape light/dark at 390px; plus the mutation-interception check. This totals 60 screenshot combinations and one interception check.

[Token contrast evidence](ui-audit-2026-09/phase-h-theme-reflow/token-contrast.json): **48 checks passed**, covering six foreground/background pairs across all four palettes in light/dark modes at a 4.5:1 threshold. This is a token check, not a page-wide contrast audit. Run `python3 scripts/ui-theme-token-contrast.py` from the app directory to repeat it.

All identity/data responses were fixtures. The public form attempted its automatic progress requests; both were intercepted and blocked. No live submissions or account changes occurred. The initial test assertion incorrectly treated those blocked progress attempts as account writes; the corrected assertion explicitly permits only that known attempted path and the rerun passed.

Doubled root text is an enlargement/reflow simulation, not native browser zoom. This iteration does not close UI-H: broader core CRM workflow theme checks, real role authorization, keyboard/focus acceptance, actual browser zoom, remaining nested states and live workflow operations are still open.

Final iteration-twenty validation: 61 fixture browser checks, 48 token-contrast checks, TypeScript, targeted ESLint, whitespace checks and production build passed. Temporary browser helpers were removed. Next: extend theme/reflow coverage into core CRM work screens.

## Twenty-first iteration — core CRM theme and long-content reflow (2026-09-13)

### Findings and fixes

- Mobile Lead cards clipped long customer names, sources, emails and tags despite passing document-width checks. Text parents now shrink/wrap, contact icons retain their size and tags wrap inside their cards. Added a card-bound text check to the browser runner.
- Task lists overflowed with long linked Lead/Opportunity names. Related-record triggers, task titles and descriptions now wrap within shrinkable bounds.
- Task calendar cards widened their grid with long titles. Lanes now use container-based one/two/four-column layouts, with shrinkable cards and wrapping title/status controls.

[Core CRM fixture evidence](ui-audit-2026-09/phase-h-core-theme/results.json): **38 checks passed**: Leads, Lead filters, Opportunities list, Opportunity board, Tasks list and Task calendar in light/dark at 320/1280px and doubled-root-text 1280px (36 screen combinations), plus no-page-error and mutation-interception assertions. The initial run found 12 Task list/calendar layout failures; corrected layouts passed the complete rerun. Mobile Lead clipping was additionally found through screenshot review and fixed.

All records/profile/API responses were fixtures. View switches attempted two personalization saves; both were blocked, and the runner now explicitly distinguishes those attempts from record updates. No record, task, stage, export or saved preference changed on the server. Theme coverage here uses Forest light/dark; alternate palette sampling remains as recorded in iteration twenty.

Remaining acceptance includes additional work modules, record-detail/dialog states, real roles, keyboard/focus and native browser zoom. Enlarged-text screenshots also show fixed-width task filter labels shortening; a control-label/accessibility pass is still needed. Doubled root text remains a simulation, not native zoom acceptance.

Final iteration-twenty-one validation: 38 fixture browser checks, TypeScript, targeted ESLint, whitespace checks and production build passed. Temporary browser helpers were removed. Next: control labels and keyboard/focus behavior, including the enlarged task filters noted above.

## Twenty-second iteration — Task labels and keyboard focus (2026-09-13)

### Implemented

- Task filters now have visible associated labels, flexible widths and wrapping selected values. This resolves the shortened filter text noted in iteration twenty-one's enlarged-text screenshots.
- List/Calendar and calendar period controls expose pressed state. Task editor labels now connect to their controls; bulk due-date and queue selectors also have accessible names.
- Calendar Edit and Complete are sibling native buttons with record-specific accessible names. The card's drag behavior remains on its container; completion no longer relies on a nested role-button inside the editor-opening button.
- Keyboard testing found that closing a programmatically opened task editor did not restore focus to Edit. StandardDialog now remembers the opener and restores focus when it remains connected.

[Task keyboard fixture evidence](ui-audit-2026-09/phase-h-task-keyboard/results.json): **23 checks passed**: filters, calendar actions and editor at 320/1280px and doubled-root-text 1280px in light/dark (18 screen combinations), plus named-filter keyboard/Escape behavior, editor labels and 35-Tab focus containment with Escape restoration, separate keyboard completion, no page errors and mutation interception.

All API responses and submissions were fixtures. A view-preference save and the tested Task completion request were blocked; no actual task or saved preference changed. Drag/reschedule persistence was not tested. This is a targeted keyboard pass, not full screen-reader, role or native browser-zoom acceptance. Additional core/detail screens and workflow states remain open.

Final iteration-twenty-two validation: 23 fixture browser checks, TypeScript, targeted ESLint, whitespace checks and production build passed. Temporary browser helpers were removed.

## Twenty-third iteration — advanced filter keyboard access (2026-09-13)

### Implemented

- Advanced filter groups/conditions now have distinct accessible identities. Field, operator, text/boolean/multiselect values, date mode and start/end date controls are named; removal buttons distinguish the affected group/condition.
- Filter selected values/footer actions wrap, date controls stack within their available width, and fixed minimum widths no longer force controls beyond a narrow drawer.
- The filter drawer remembers its opener and restores focus on close, matching the programmatic-dialog behavior introduced in iteration twenty-two.
- Opportunity type selection has an accessible name; bulk-owner and reason labels are connected to controls.

[Filter keyboard fixture evidence](ui-audit-2026-09/phase-h-filter-keyboard/results.json): **29 checks passed**: text, date-range, owner and Opportunity filter drawers in light/dark at 320/1280px and doubled-root-text 1280px (24 screenshot combinations), plus distinct-condition keyboard removal, 25-Tab focus containment/Escape restoration, named Opportunity type/shared drawer, no page errors and zero record writes.

All API records/profile responses were fixtures, and mutations were blocked. This pass did not create records, save bulk ownership changes, persist filter presets or verify real filtered-query semantics. It covers the shared filter drawer and selected Opportunity labels; full dynamic Lead/Opportunity editors, all roles, screen readers and native browser zoom still require acceptance.

Final iteration-twenty-three validation: 29 fixture browser checks, TypeScript, targeted ESLint, whitespace checks and production build passed. Temporary browser helpers were removed.

## Twenty-fourth iteration — dynamic Lead/Opportunity editors (2026-09-13)

### Implemented

- Object metadata now exposes an explicit error/retry state, clears obsolete metadata and cancels old requests. Dynamic forms provide Retry rather than a dead-end missing-metadata message.
- Opportunity lead/type options have loading and retry states with handled failures. Labels connect to Lead, Opportunity Type, Stage and Expected Close Date controls.
- Dynamic forms memoize their field list, use container-based columns, wrap group/footer content and show persistent save errors. A pending ref prevents duplicate button/shortcut submissions; the form fieldset and Cancel disable while saving.
- Required markers use the metadata validation flag. Dynamic fields use unique instance IDs and connect helper/error text. TEXTAREA fields now render multiline controls instead of falling through to a single-line input.

[Record-editor fixture evidence](ui-audit-2026-09/phase-h-record-editors/results.json): **19 checks passed**, including Lead/Opportunity failed-save dialogs in light/dark at 320/1280px and doubled-root-text 1280px (12 screenshot combinations), metadata/options Retry, pending shortcut guard, multiline draft retention, simulated successful retry, Opportunity type-change draft retention, no page errors and intercepted mutations.

All metadata, records/profile responses and submissions were fixtures. No Lead or Opportunity was actually created or modified. The simulated Lead success only tests dialog handling. Real schema variants, edit-record saves, custom-field payload acceptance, all roles and native browser zoom remain pending. Pending fieldset behavior does not establish dismissal guards for every surrounding dialog/route.

Final iteration-twenty-four validation: 19 fixture browser checks, TypeScript, targeted ESLint, whitespace checks and production build passed. Temporary browser helpers were removed.

## Twenty-fifth iteration — record details and related previews (2026-09-13)

### Implemented

- Lead and Opportunity edit dialogs wait for complete record details. Failed reads show persistent Retry states instead of opening an editor with partial list data; obsolete requests are cancelled.
- Related-record previews have bounded width/height, wrapping content, explicit Retry, cancellation on unmount and a fresh cache when the record identity changes. Opportunity stages accept the name or label supplied by the API.
- Long names, contact details and property values wrap within Lead/Opportunity sidebars. Summary metrics stack within the narrow sidebar and use theme foreground/background tokens. Linked Lead content no longer widens the Opportunity document.

[Record detail and preview fixture evidence](ui-audit-2026-09/phase-h-record-previews/results.json): **42 checks passed**: Lead/Opportunity detail pages, recovered edit dialogs and related previews in light/dark at 320/1280px and doubled-root-text 1280px (36 screen combinations), four recovery/keyboard interactions, no page errors and zero writes. Initial geometry failures exposed sidebar overflow; all combinations passed after correction.

All API responses and identities were fixtures. No records or credentials changed, and no live AI provider requests were made. These checks verify load recovery, layout and preview keyboard behavior, not live edit-save acceptance or backend authorization. Full detail-tab workflows, sidebar/content density, real roles, screen readers and native browser zoom remain pending. Doubled root text is a simulation.

Final iteration-twenty-five validation: 42 fixture browser checks, TypeScript, targeted ESLint, whitespace checks and production build passed. Temporary browser helpers were removed. Next: detail-tab workflow states and content density, followed by remaining role/accessibility acceptance.

## Twenty-sixth iteration — detail navigation and load recovery (2026-09-13)

### Implemented

- Record section navigation wraps and grows with its text, exposing all sections instead of hiding later sections beyond a horizontal scroll area. Activity type/time selectors have accessible names and wrapping values.
- Detail grid panels align at the top rather than stretching to the sidebar height, eliminating the oversized empty Opportunity panel. This does not shorten every sidebar or remove natural page space below a shorter column.
- The Lead load-error return was incorrectly inside the Favorite handler. It now renders at page level. Both detail pages show persistent Retry for failed record/related-data loads, including failures after the main record has loaded, instead of displaying incomplete counts/empty tabs. The current recovery reloads the entire detail page; independent per-tab fetching remains outside this change.
- Stage-history names, actor details and notes wrap within shrinkable rows; avatars and actor icons retain their size.

[Detail-tab fixture evidence](ui-audit-2026-09/phase-h-detail-tabs/results.json): **55 checks passed**: 48 screenshot/geometry combinations covering Lead/Opportunity Activity and Details, populated Stage History, and three failed-load states in light/dark at 320/1280px and doubled-root-text 1280px; two keyboard/content-height assertions, three failure/Retry interactions, no page errors and zero mutations. Failures were injected into Lead retrieval, related activities and Opportunity stage history.

All API responses/identities were fixtures; no live records, credentials or AI providers were changed or called. Notes, communications, audit and task persistence workflows still require separate acceptance. Real roles, screen readers and native browser zoom remain pending; doubled root text is a simulation.

Screenshot review additionally found internally clipped stage/actor names that viewport checks missed. Flex text bounds were corrected and text-range assertions now check history content against its card; the full 55-check rerun passed. Final iteration-twenty-six validation: TypeScript, targeted ESLint, whitespace checks and production build passed, including the final actor-name fix verified in the compiled bundle. Temporary browser helpers were removed. Next: Notes, Communications and Audit tab recovery and workflow states.

## Twenty-seventh iteration — Notes, Communications and Audit recovery (2026-09-13)

### Implemented

- Notes, communication events, call recordings and audit history now distinguish failed reads from successful empty results with persistent Retry states. Reloads clear obsolete lists, and requests abort when their panel unmounts or record changes.
- Notes expose accessible names for composing, adding, editing, saving, cancelling, pinning and deleting. Creation blocks duplicate pending submissions, disables the composer while loading/saving, retains the draft after rejection and shows an inline error. Author/action rows wrap; pinned badges use readable foreground text.
- Communication headers/content wrap, message bodies are readable instead of silently clamped, and recording actions wrap below their summary when space is limited. Refresh/download icon buttons are named.
- Audit actor/field values wrap instead of truncating within narrow cards. The field-filter popover is bounded by the viewport, and missing actor details have a fallback. Success colors account for dark mode.

[Detail workflow fixture evidence](ui-audit-2026-09/phase-h-detail-workflows/results.json): **74 checks passed**: 66 screenshot/geometry combinations for both records' three tabs, four failed-read states and a failed note-create state in light/dark at 320/1280px and doubled-root-text 1280px; four Retry interactions, draft retention, named note edit/cancel, no page errors and mutation interception. Narrow Notes, Audit and Communications screenshots were manually reviewed.

All API responses and identities were fixtures. One attempted note POST was intercepted and rejected; no note or other live record changed. No message was sent and no recording was played/downloaded. Successful live note creation, edit/delete/pin persistence, pending edit guards, recording access, audit filter behavior, real roles, screen readers and native browser zoom remain pending. Root-text enlargement is a simulation, not native zoom.

Final iteration-twenty-seven validation: 74 fixture browser checks, TypeScript, targeted ESLint, whitespace checks and production build passed. Temporary browser helpers were removed. Next: note edit/delete/pin pending and failure handling, followed by recording-access feedback and audit filter acceptance.

## Twenty-eighth iteration — note actions, recording feedback and audit filters (2026-09-13)

### Implemented

- Note edit/delete/pin requests share a pending ref and disabled controls, preventing overlapping actions with note creation. Edits retain their draft after rejection; delete/pin failures retain the note and show persistent inline feedback. Pending actions announce their status. Existing delete confirmation remains in place.
- Recording access serializes requests, disables access/refresh controls while pending and shows persistent API error feedback. Existing recording-consent confirmation remains unchanged.
- Audit field search has an accessible name, options announce selection, and Clear field filters restores the full history. Timeline connector length follows the filtered list.

[Detail action fixture evidence](ui-audit-2026-09/phase-h-detail-actions/results.json): **37 checks passed**: 30 light/dark screenshots/geometry checks across 320/1280px and doubled-root-text 1280px for edit/pin/delete errors, recording access failure and filtered audit history; five interaction assertions plus no page errors and mutation interception. Held edit/recording requests verified disabled controls. Cancelling delete produced no request; three attempted note mutations were intercepted and rejected. Keyboard search/selection and Clear restored the expected audit values.

All identities, records and request results were fixtures. No live notes changed, and no recording was opened/downloaded. Successful note persistence, recording URL/browser-popup behavior, broader roles and native browser zoom remain unverified. These safeguards disable controls inside the panel; they do not prevent navigation away during a pending request. Root-text enlargement is a simulation.

Final iteration-twenty-eight validation: 37 fixture browser checks, TypeScript, targeted ESLint, whitespace checks and production build passed. Temporary browser helpers were removed. Next: successful action-response handling and recording access handoff, followed by remaining role/accessibility acceptance.

## Twenty-ninth iteration — successful actions and live regression (2026-09-14)

### Implemented and verified

- Successful note create/edit/pin/delete UI responses now have fixture acceptance for both record types. Recording access returns an explicit Open recording/Open download link after authorization, avoiding an asynchronous popup handoff. Only HTTP(S) links are accepted; a fresh request clears the previous link.
- Live testing exposed the imported `Note_lead_fk`: it required every note, including Opportunity notes, to reference a Lead. Migration `0109_note_entity_foreign_keys.sql` replaces this with generated references and foreign keys for Lead, Opportunity and Activity, plus a supported-type check. Existing notes remain; parent deletion remains restricted. Parent IDs are treated as immutable. The migration was applied transactionally to the local database only; other environments must apply it through their normal migration process.
- Live Lead and Opportunity note create/edit/pin persistence now passes, including re-reading saved values and verifying deletion of temporary notes. No existing notes were edited/deleted. Six transactional database checks verified valid references and rejected missing references for all three entity types; all test inserts were rolled back.
- Added a distinct AI output-limit error when a provider returns no visible content with `finish_reason: length`, while preserving the generic empty-response error for other cases. This is clearer feedback, not an automatic token-budget increase.
- Live data revealed additional clipping missed by fixtures: task summary cards, pagination/type selectors, Opportunity type text, scoring metrics and timeline times. Layouts now wrap or adapt to their content/font size.

[Successful action fixtures](ui-audit-2026-09/phase-h-detail-success/results.json): **46 checks passed**, including 36 layout combinations, successful note actions, recording links opening intercepted local destinations, rejected unsafe links, no page errors and eight intercepted note mutations. This tests UI response handling, not actual audio playback.

[Live note persistence](ui-audit-2026-09/live-note-persistence-fixed/results.json) and [database reference checks](ui-audit-2026-09/note-reference-integrity/results.json) record the database acceptance. The original failed Opportunity creation remains recorded in [initial live acceptance](ui-audit-2026-09/live-acceptance-20260913/results.json). The local admin authenticated through the real login endpoint. Authentication/audit logs and AI usage records are expected side effects of these checks.

Live AI connection/report/action results are detailed in document 29. All 20 action/entity combinations eventually returned nonempty text; Opportunity call preparation returned empty responses on two attempts before succeeding. That intermittent provider behavior is not proven resolved. No AI-generated tasks, customer messages or reports were saved.

Remaining: real manager/agent roles, screen-reader and native zoom acceptance, actual recording media/download behavior, customer-message draft/confirmation regression and navigation-away safeguards. The live UI checks use one admin identity and doubled root text, not native browser zoom.

[Live layout acceptance](ui-audit-2026-09/live-layout-acceptance/results.json): **32 checks passed** across Leads, Opportunities, Tasks and both detail pages in light/dark at 320/1280px and doubled-root-text 1280px, plus page-error and blocked-write assertions. The first run identified internal clipping; the full rerun passed after the fixes above. This covers representative live core pages, not every module/role.

Final iteration-twenty-nine validation: 46 successful-response fixture checks, 32 live layout checks, six transactional reference checks, live note persistence/cleanup, saved AI connection, successful samples for all 20 AI action/entity combinations, matching AI report preview/query, 55 AI tests, TypeScript, targeted ESLint, whitespace checks and production build passed. Intermittent AI emptiness remains recorded above. Temporary browser helpers and authenticated storage were removed.

## Thirtieth iteration — AI recovery, reasoning budget and keyboard access (2026-09-14)

### Implemented

- AI action failures now remain visible with Retry for the exact failed action. The previous result stays available, duplicate requests are guarded synchronously, and obsolete requests are aborted/ignored. Draft-generation errors also remain inline. Closing the assistant restores keyboard focus to its opener.
- Empty-provider responses log only finish reason, completion-token count and whether a reasoning field was present. Model reasoning text, prompts and credentials are not included in this diagnostic metadata. A unit regression verifies this separation.
- Three live call-preparation samples reproduced one failure. Its metadata established `finish_reason: length`, reasoning present and 1,024 completion tokens: the configured output budget was exhausted before a visible answer. The Groq GPT-OSS 20B/120B adapter now sends `reasoning_effort: low`, keeping the configured token cap unchanged. Other endpoints/models retain their existing parameters. This trades reasoning effort for room for the final answer; it is not an increased budget or a guarantee against future limit failures.

[AI recovery fixture evidence](ui-audit-2026-09/phase-h-ai-recovery/results.json): **28 checks passed**: 24 light/dark layout combinations at 320/1280px and doubled-root-text 1280px, two recovery/keyboard checks, no page errors and no record mutations. Six AI requests were intercepted. Checks cover pending controls, preserved prior output, retrying the same action, 25-Tab focus containment and Escape focus restoration for both record types. Intentionally hidden screen-reader labels are excluded from visual clipping checks.

[Before adjustment](ui-audit-2026-09/ai-live-diagnostics/results.json): two of three live call-preparation samples succeeded; the failed sample supplied the metadata above. [After adjustment](ui-audit-2026-09/ai-reasoning-budget-fixed/results.json): all three samples succeeded. These are real provider calls with normal usage logging; no messages, tasks or reports were saved. The focused AI suite passes **60 tests**, including parameter scoping for two supported Groq models and two unsupported endpoint/model combinations.

The sample Lead and Opportunity recording lists both returned HTTP 200 with zero available recordings. This establishes the sampled records' state only; it does not certify playback/download or the whole workspace's recording inventory. Real manager/agent access, screen-reader use and native browser zoom remain outstanding. The user authorized creating isolated test accounts; results follow below.

[Reasoning/report follow-up](ui-audit-2026-09/ai-reasoning-report/results.json): an additional live call brief succeeded, and the AI report's five-row preview matched direct query execution.

[Real-role acceptance](ui-audit-2026-09/real-role-acceptance/results.json): **51 checks passed** using newly created users assigned the existing Admissions Manager and Admissions Counselor roles. Both authenticated through the real login endpoint. AI settings, platform tenant listing, user creation and role creation correctly returned 403 for both roles. Leads, Opportunities and Tasks passed 36 light/dark layout combinations at 320/1280px and doubled root text, with no page errors. Browser-originated writes were intercepted. The two test users were made unavailable for assignment and deactivated afterward; existing users/passwords/roles were unchanged. No invitations or customer messages were sent.

These users had no team/owned records, so the role pass covers authentication, selected administrative denials and empty core-page layouts; it does not establish every permission or populated TEAM/OWN record-scope behavior. Deactivated test-user rows and normal login/session audit records remain for traceability. Actual screen-reader use, native browser zoom and real recording playback remain open.

A subsequent tenant-scoped database inventory found **zero non-expired stored recording URLs** in this workspace ([count evidence](ui-audit-2026-09/ai-live-diagnostics/recording-inventory.json)). Real playback acceptance therefore requires a recording to be captured first; the URL handoff remains covered by fixture tests.

Final iteration-thirty validation: 28 AI recovery browser checks, 51 real-role checks, 60 focused AI tests, four successful post-adjustment call-brief samples, matching live AI report preview/query, TypeScript, targeted ESLint, whitespace checks and production build passed. Temporary browser/authentication helpers were removed; the two test accounts remain inactive and unavailable for assignment.

## Thirty-first iteration — populated roles, native zoom and accessible controls (2026-09-14)

### Implemented and verified

- Opportunity PATCH now returns 404 when the tenant/record-scoped update finds no accessible record. Previously this returned 200 with null, which could falsely signal success despite no mutation. Two response tests plus existing record-scope tests passed (15 tests total).
- Leads status and Tasks pagination selectors now have explicit accessible names. Opportunity preview/open/edit actions identify the affected record. The Opportunity preview icon had no action attached; it now opens the existing record preview popover, with Escape and trigger focus return verified.
- [Populated scope acceptance](ui-audit-2026-09/populated-scope-acceptance/results.json): **77 checks passed** using real manager/team and counselor/owner logins, two temporary teams and six temporary Lead/Opportunity records. Manager access included a teammate and excluded the other team; counselors accessed only their own test records. Lists, direct reads, denied writes, admin re-reads and 36 populated detail layouts were checked. Denied writes left records unchanged.
- Temporary test records and teams were deleted and cleanup verified. Three test accounts remain inactive, unavailable for assignment and without team membership; ordinary session/audit rows remain for traceability. No customer messages were sent.
- [Native zoom and accessibility acceptance](ui-audit-2026-09/native-zoom-accessibility/results.json): **27 checks passed** across Leads, Opportunities, Tasks, both record details and the AI Assistant sheet. Six states × two themes × native 100%/200% zoom produced 24 scans, plus preview behavior, page-error and blocked-write checks. These scans use long-content fixtures and axe-core 4.11.1 WCAG 2 A/AA and 2.1 AA rules, scoped to main content or the open dialog.
- Native zoom uses an isolated Chrome for Testing profile and a temporary extension. At 200%, viewport width changes from 1280 to 640 CSS pixels and device-pixel ratio from 1 to 2; root font remains 16px. No document overflow or automated accessibility violations were detected in these scoped scans. This closes native-zoom acceptance for these representative screens, not every CRM route.

Remaining: manual screen-reader acceptance; automated rules flagged for manual review; native zoom/accessibility in other modules and overlays; additional sharing/permission combinations; actual recording playback (the last tenant inventory contained no non-expired recording URLs); customer-message draft/confirmation regression and navigation-away safeguards. Earlier AI live verification remains recorded in document 29; this phase does not add new provider calls.

Final iteration-thirty-one validation: **77 populated-scope checks, 27 native-zoom/accessibility checks and 15 unit tests passed**, along with TypeScript, targeted ESLint, whitespace checks and the production build. Full native-zoom screenshots were captured using Chrome's layout metrics after discovering that the ordinary screenshot helper cropped zoomed captures. Remaining axe review items concern closed popover `aria-controls`, contrast over the Lead header gradient, short avatar text and partially obscured/offscreen sheet content. These are retained in the results rather than counted as confirmed passes. Representative zoomed Opportunity and AI sheet screenshots were visually inspected; this does not establish contrast ratios or screen-reader behavior for those review items.

Visual review additionally caught a long, unbroken record name extending beyond the AI Assistant title. Its header now wraps arbitrary names within its available width and reserves room for the close button. The native-zoom runner includes a direct dialog-heading overflow assertion because document overflow and axe alone did not detect this clipped content.

## Thirty-second iteration — AI message composer safeguards (2026-09-14)

### Implemented and verified

- Draft regeneration now preserves the current editor and prior variants on failure. Channel changes and variant replacement ask before discarding a composed message. Closing/reopening the AI drawer retains the same-record draft.
- Generation and confirmation have synchronous pending guards. Pending submission freezes recipient, subject and body and disables generation/replacement/channel changes. Empty or whitespace-only recipients/messages receive inline validation. Submission errors persist beside the editor, preserving the reviewed text for recovery.
- Obsolete generation is aborted; stale generation/submission responses cannot clear another record's composer. A request already submitted to the server is not assumed cancelled by navigation. This is a client-side overlap guard, not server idempotency across reloads or multiple tabs.
- Added document-unload and same-tab link warnings for composed messages/pending submissions. Cancelled link navigation preserves the record and draft. Browser Back/Forward within the SPA and programmatic router navigation are not covered by this component-level link guard; broader unsaved-form navigation remains open.
- [Message safeguard acceptance](ui-audit-2026-09/phase-h-ai-message-safeguards/results.json): **86 checks passed** for Email, SMS and WhatsApp on both Lead and Opportunity. Checks cover no confirmation before human action, regeneration failure retention, cancelled replacement/channel changes/navigation, drawer close/reopen, unload-handler registration, duplicate pending confirmation, immutable edited payload, failed-send recovery and success cleanup. Thirty-six light/dark layouts cover 320/1280px and doubled root text. The unload check dispatches a cancellable event; native browser prompt behavior is not certified by that assertion.
- All twelve confirmation requests were intercepted locally. Queued and approval-required responses were simulated and their distinct feedback verified. No provider calls or customer deliveries were made. These checks validate UI request/response behavior, not provider delivery or approval execution.

Remaining: manual accessibility review and unresolved axe manual-review items; broader module/permission/native-zoom coverage; actual recording playback; end-to-end delivery/approval acceptance with authorized test destinations; browser-history/programmatic navigation and other unsaved editors.

Final iteration-thirty-two validation: **86 browser checks, TypeScript, targeted ESLint, whitespace checks and production build passed**. Narrow-screen composer/error screenshots were visually reviewed. The temporary browser helper was removed.

## Thirty-third iteration — draft recovery across record navigation (2026-09-14)

### Implemented and verified

- Added an in-memory AI message draft provider above record routes. State is keyed by entity type/ID; the provider is recreated when the authenticated user, tenant or impersonation state changes. No message content is written to browser storage or the server for recovery.
- Browser Back/Forward and client-side record links now preserve the composed recipient, subject, body, channel and error state. Reopening AI Assistant on a record with a draft opens its composer and explains the retention limit. Added a confirmed Discard message action.
- Pending submission is retained too. Returning to a record cannot enable another send or discard while the original request is pending. Success clears the original record's draft; failure updates that draft even if the submitting component unmounted. Obsolete UI result handlers remain guarded.
- The document-unload warning now lives with the retained drafts, so leaving a record does not remove it. Draft recovery ends on refresh/tab closure or authentication-scope reset. Same-document navigation is preserved rather than blocked; other CRM editors are not covered by this provider.
- [Navigation acceptance](ui-audit-2026-09/phase-h-ai-draft-navigation/results.json): **32 checks passed**, using actual browser Back/Forward and client-side record links for both Leads and Opportunities. Covered record isolation, restored edited values, pending send/discard locks, late failure handling, cancelled/accepted discard, persistent unload-handler registration and cleared state on return. Includes twelve light/dark, narrow/desktop/enlarged-text layouts. Unload-handler assertions use a synthetic cancellable event, not certification of every browser's native prompt.
- All message requests were intercepted. No customer messages or AI provider requests were made. Authentication-scope isolation is implemented by keyed provider lifetime; this phase's browser fixtures use one admin identity and do not certify live logout/impersonation transitions.

Remaining: manual accessibility review; broader module/permission/native-zoom coverage; actual recording playback and authorized test delivery/approval; unsaved-state handling for other editors; live authentication-transition acceptance. Browser-history and client-link retention for the AI message composer are now covered.

Final iteration-thirty-three validation: **32 navigation checks plus 86 message-regression checks passed (118 total)**, along with TypeScript, targeted ESLint, whitespace checks and the production build. Restored narrow-screen composer screenshots were visually reviewed. The temporary browser helper was removed.

## Thirty-fourth iteration — unsaved record forms and notes (2026-09-14)

### Implemented and verified

- Added an opt-in editor-dismiss guard and StandardDialog registration. Dynamic record forms now protect Escape/close-icon/overlay dismissal as well as Cancel. Pending saves block dismissal, dirty forms ask before discard, and pristine forms close immediately. Successful saves reset the dirty baseline.
- Note edit cancellation and replacement now ask before losing changed text. New and edited notes register an unload warning. These are dismissal/unload protections; note text and non-AI forms do not yet have cross-route draft recovery.
- Testing found an Opportunity initialization defect: transient empty native-select events could clear the saved type and stage and mark an untouched form dirty. Lead/type/stage selectors now ignore empty initialization events; choosing the explicit None type still clears it intentionally.
- [Editor dismissal acceptance](ui-audit-2026-09/phase-h-editor-dismissal/results.json): **73 checks passed** across Lead/Opportunity create/edit forms and note editors. Covered pristine closure, cancelled discard through Escape/Close/Cancel, unload registration, pending dismissal prevention, accepted discard/reset, preserved initial Opportunity type/stage and 36 light/dark/narrow/desktop/enlarged-text layouts. Four save attempts were intercepted and rejected; no real records were changed.
- Updated the existing record-editor acceptance runner to explicitly accept its intentional dirty-form discard. Save/retry and shortcut regression evidence remains in [record editor acceptance](ui-audit-2026-09/phase-h-record-editors/results.json).

Remaining: other custom editors not using DynamicFormRenderer; cross-route draft retention for notes and non-AI forms; manual accessibility and broader role/module/native-zoom coverage; real recording playback and authorized delivery/approval acceptance. Activity and other metadata-driven forms inherit the guard but were not individually exercised in this phase. Native unload prompt behavior remains separate from the synthetic event assertions.

Final iteration-thirty-four validation: **73 dismissal checks plus 19 record-editor regression checks passed (92 total)**, along with TypeScript, targeted ESLint, whitespace checks and the production build. The narrow-screen Opportunity error/editor layout was visually reviewed. Temporary browser/debug helpers were removed.

## Thirty-fifth iteration — record and note draft recovery (2026-09-14)

### Implemented and verified

- Added a shared in-memory editor provider under the authenticated scope. DynamicFormRenderer retains values by record/object or create context; notes retain new text and the active note edit separately by entity/record. Authentication changes recreate the provider. No recovery data is written to localStorage, sessionStorage or the server.
- Back/Forward navigation now restores record edits and both note drafts. Retention notices explain refresh/sign-out limits. The provider keeps an unload warning active away from the original record. Added Discard note draft for new notes; confirmed form/note discard clears retained state.
- Pending writes remain locked across remounts. Late failures update the original draft. Late successful record saves clear the dirty baseline and acknowledge completion; successful creates clear their draft. Notes reload after mutations settle so a returning panel sees the server result.
- [Editor navigation acceptance](ui-audit-2026-09/phase-h-editor-navigation/results.json): **44 checks passed** across Lead and Opportunity edits, new notes and note edits, including late success/failure, pending locks, independent discard, warning cleanup and 24 responsive/theme/enlarged-text layouts. Six writes were intercepted. These are UI fixtures, not live database persistence tests.
- [Dismissal regression](ui-audit-2026-09/phase-h-editor-dismissal/results.json): **73 checks passed** after adding retained state. [Record-editor regression](ui-audit-2026-09/phase-h-record-editors/results.json): **20 checks passed**, including successful-create draft cleanup.

Remaining: custom editors not backed by DynamicFormRenderer; manual accessibility and broader role/module/native-zoom checks; live authentication-transition acceptance; real recording playback and authorized delivery/approval acceptance. Cross-route checks in this phase cover Lead/Opportunity edit forms and notes; other metadata-driven/create contexts inherit the mechanism but do not have equivalent navigation acceptance. Retained edits require user review if server data changed while away; this change does not add conflict resolution or server-side idempotency.

Final iteration-thirty-five validation: **183 browser checks passed** (44 navigation, 73 dismissal, 20 record-editor regression and 46 successful-action regression), plus TypeScript, targeted ESLint, whitespace checks and production build. The restored narrow-screen notes layout was visually reviewed. All tested mutations were intercepted; the temporary browser helper was removed.

## Thirty-sixth iteration — custom Task editor recovery (2026-09-15)

### Implemented and verified

- Tasks now retain form drafts in the authenticated editor store, keyed by task ID or the initial Lead/Opportunity links for a new task. Back/Forward navigation restores the editor values. Accepted discard and successful saves clear retained state.
- Added synchronous duplicate-save prevention, disabled editor controls while saving, protected Escape/Close/Cancel, inline failure feedback and a retention notice. Pending saves remain locked after returning to Tasks. Late success clears the draft and acknowledges completion; late failure preserves it.
- [Task recovery acceptance](ui-audit-2026-09/phase-h-task-editor-recovery/results.json): **34 checks passed** across create/edit, dirty/pristine dismissal, actual Back/Forward, pending locks, duplicate confirmation, late failure/success and 12 light/dark/narrow/desktop/enlarged-text layouts. Four save requests were intercepted; no actual tasks were changed.
- [Task keyboard regression](ui-audit-2026-09/phase-h-task-keyboard/results.json): **23 checks passed**, including named controls, focus containment/return and separate calendar actions. The intentional dirty-editor dismissal now explicitly accepts the discard prompt.

Remaining: other custom editors, separate checklist/dependency/queue mutations, live authentication transitions, manual accessibility and broader module/role/native-zoom coverage, real recording playback and authorized delivery/approval checks. Prelinked new-task contexts have separate draft keys; exhaustive deep-link combinations were not tested in this phase.

Final iteration-thirty-six validation: **57 browser checks passed** (34 Task recovery and 23 keyboard regression), plus TypeScript, targeted ESLint, whitespace checks and production build. The narrow-screen Task editor/error layout was visually reviewed. Temporary browser helpers were removed.

## Module 12 — Applications phase one (2026-09-15)

Implemented application numbering and initial application create/list/detail workflows. Numbering supports scoped rules, timezone-aware calendar/financial-year templates, a locked tenant sequence and retry-safe creation. Application access requires explicit internal-role permissions; record visibility respects owner/team/all scope within the tenant. Migration `0110_application_numbering.sql` was applied locally. See [phase scope and setup](30_APPLICATIONS_PHASE_ONE.md).

The new pages use responsive cards, labeled selectors, retained drafts, pending locks and inline failure/retry feedback. Browser checks exposed enlarged-text overflow; action buttons, long page headings and the shared top header now wrap. The first-phase details page includes initial stage history; documents, eligibility, fees, decisions and enrollment remain subsequent phases.

Validation: **55 checks passed** — 15 unit tests, 15 local database assertions, 19 fixture-browser checks and 6 live admin/unauthenticated HTTP checks. Concurrent identical submissions produce one application/history/audit entry; concurrent distinct submissions receive unique numbers. Temporary integration fixtures were removed; sequence values were intentionally not reset. Browser evidence is in [module-12-phase-one](ui-audit-2026-09/module-12-phase-one/results.json). TypeScript, targeted ESLint, whitespace checks and production build passed. No customer communications were sent. Live non-admin role browser acceptance and exhaustive rule precedence combinations remain to be covered.

Module 12 is now **5/20** checklist items complete. Next: document/checklist workflows and guarded stage transitions. Full detail, granular permission and lifecycle checklist items remain open.

## Module 12 — Checklist visibility and stage transitions (2026-09-15)

Application details now show active checklist requirements and missing/pending/verified/rejected/expired states, reviewer, expiry and rejection feedback. The newest document record determines readiness, including after an older document's metadata changes. Storage paths are not exposed in the checklist response.

Added stage updates with reasons, expected-stage conflict detection, tenant/record permissions, manage permission for closing/won/reopening, and atomic stage/history/audit writes. Configurable verified-document entry requirements are available in Catalog. Creation cannot bypass those requirements by starting in a guarded stage. Fixed a concurrency failure discovered by the integration test: lock the Application base row before reading joined stage data, avoiding a false 404 when another writer changes the stage.

The stage editor preserves failed drafts and pending locks. Detail-page cards now use tighter spacing and the history card no longer stretches to match a long details card. Migration `0111_application_stage_document_guard.sql` was applied locally. [Setup and limits](31_APPLICATION_WORKFLOW_PHASE_TWO.md).

Validation: **100 checks passed** — 38 unit tests, 37 local database checks and 25 fixture-browser checks. [Browser evidence](ui-audit-2026-09/module-12-phase-two/results.json), [database results](ui-audit-2026-09/module-12-phase-two/database-results.json). All temporary catalog/application/document/audit records were cleaned; synthetic storage references did not create files. TypeScript, targeted ESLint and whitespace checks passed. Final production build: passed.

Module 12 remains **5/20 complete**. Document upload/download, review actions, comments and reminders are next. Payment/task/approval guards, operational SLA jobs, application automation events and live non-admin browser acceptance remain open. This phase does not claim complete document or stage workflow checklist items.

## Module 12 — Private document uploads and reviews (2026-09-15)

Added private PDF/PNG/JPEG uploads (5 MB maximum), retry deduplication, replacement documents, permission-checked downloads and versioned review actions with reasons, comments and expiry. FileObject/document/audit persistence is transactional; uploads and reviews use the same Application lock as stage transitions. Download checks revalidate active account and application access. Legacy unlinked files are not exposed through the new endpoints.

Upload/review dialogs retain authenticated in-memory drafts, prevent pending edits and protect dirty dismissal. Added explicit stale-review recovery and inline download failures. The shared scan hook remains a placeholder and the UI discloses that scanning is not configured. Migration `0112_application_document_files.sql` applied locally. [Setup and limits](32_APPLICATION_DOCUMENTS_PHASE_THREE.md).

Validation: **120 checks passed** — 36 unit tests, 64 database/real-HTTP assertions and 20 fixture-browser checks. [Database/HTTP evidence](ui-audit-2026-09/module-12-phase-three/database-http-results.json), [browser evidence](ui-audit-2026-09/module-12-phase-three/results.json). Private test files and temporary database records were cleaned. TypeScript, targeted ESLint and whitespace checks passed. Final phase-three production build: passed.

The port-3000 development server was restarted to clear stale exported modules; real binary upload/review/download checks then passed. Module 12 remains **5/20 fully complete** because automated document reminders and the broader lifecycle requirements remain open. No customer communications were sent.

## Module 12 — Opt-in daily document reminders (2026-09-15)

Added owner-only daily document reminder subscriptions, default off, with a first check after 24 hours. The operational worker sends an internal notification for outstanding required documents, respecting ownership, read access, active account/tenant/module, closed/won stages and the new Application notification preference. Concurrency tests confirm one notification per due interval. Notification links open the application.

Owner controls include pending-save protection, inline errors and retry. Migration `0113_application_document_reminders.sql` was applied locally. The existing worker was gracefully refreshed after test cleanup. [Setup and scope](33_APPLICATION_DOCUMENT_REMINDERS.md).

Validation: **136 checks passed** — 65 unit tests, 58 local database/HTTP checks and 13 fixture-browser checks. [Database/HTTP evidence](ui-audit-2026-09/module-12-phase-four/database-http-results.json), [browser evidence](ui-audit-2026-09/module-12-phase-four/results.json). Temporary recipients, notifications and catalog/application records were removed. Live HTTP subscriptions were disabled before becoming due. TypeScript, targeted ESLint and whitespace checks passed. Final phase-four production build passed; the restarted worker completed its first scheduled `applications.documentReminders` tick.

Module 12 is now **6/20 fully complete**. The document checklist workflow includes automated internal owner reminders. Applicant outbound reminders are not implemented or sent. Eligibility and broader stage gates/SLA processing are next; upload-phase scanner/storage/retention follow-ups remain open.

## Module 12 — Explainable eligibility checks (2026-09-15)

Added a compact eligibility summary and expandable explanations on application details. Supported checks cover canonical minimum education, qualifying marks and completed entrance exams. Current active program/course rules are evaluated on fetch. Missing data, unknown qualifications, empty rules and unsupported custom criteria cannot silently pass. Catalog education choices are explicit; diploma/other legacy pathways require manual review.

The permission-scoped facts editor retains drafts, handles stale-version conflicts and protects pending saves. Saves use the application lock and write an audit entry atomically. Migration `0114_application_eligibility_facts.sql` was applied locally. [Scope and setup](34_APPLICATION_ELIGIBILITY_PHASE_FIVE.md).

Validation: **77 checks passed** — 31 unit tests, 33 local database/HTTP checks and 13 fixture-browser checks. [Database/HTTP evidence](ui-audit-2026-09/module-12-phase-five/database-http-results.json), [browser evidence](ui-audit-2026-09/module-12-phase-five/results.json). Test fixtures were cleaned; no existing application facts were changed. TypeScript, targeted ESLint and whitespace checks passed. Final phase-five production build: passed.

Module 12 remains **6/20 complete** because the full eligibility builder includes additional conditions. Next: extended eligibility criteria and stage gating. These checks do not automatically approve admission, change stages or verify documents.


## Module 12 — Eligibility stage gates (2026-09-28)

Closed the pending phase-six verification: 47 local database/HTTP checks passed. Opt-in stages now require a fresh `MET` evaluation and can combine eligibility with verified-document requirements. Initial creation excludes guarded stages; failed transitions retain the editor draft. See [scope and limitations](35_APPLICATION_ELIGIBILITY_STAGE_GATES.md). Module 12 remains 6/20 complete.

## Platform administration — Tenant module selection (2026-09-28)

The creation dialog previously exposed only Opportunities. It now loads the full platform catalog, displays all 28 modules, protects seven core modules, and provides independent API Access/Sales Groups switches. Selections, feature flags, tenant/admin records and initial module audit rows are written in the same transaction. Catalog-load failure blocks provisioning; failed saves retain choices. Existing tenant pages explain module/feature overlap and identify known catalog limitations. See [review and verification](docs/PLATFORM_ADMIN_MODULE_REVIEW.md).
