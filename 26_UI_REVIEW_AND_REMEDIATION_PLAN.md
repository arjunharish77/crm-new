# CRM UI review and remediation plan

Date: 2026-09-09. Target: `crm` on localhost:3000, confirmed by the owner. Status: baseline review retained below; phased implementation is underway. See [implementation progress and verification](28_UI_IMPLEMENTATION_PROGRESS.md) for current delivery status.

Browser review: **20 findings**, supported by source inspection and **201 viewport/state captures**. At a 1280px window, Integrations measured 1517px and a loaded lead detail measured 1385px. The form builder also clips controls without increasing document width. See [browser findings and limitations](ui-audit-2026-09/BROWSER_REVIEW.md) and the [searchable screenshot gallery](ui-audit-2026-09/index.html).

## 1. Decision

Treat this as a shared layout and workflow repair, followed by a screen-by-screen rollout. The product has reusable controls, but lacks enforced page composition rules. Adding features and tabs has outpaced decisions about what a user should see first, what belongs in secondary navigation, and how a workspace adapts to its actual available width.

The first release should make navigation, list actions, record work, and settings usable on a normal laptop and narrow screens. Retain the existing green brand, theme support, Radix/shadcn components, Tailwind, and working business behavior. Changing the UI library is unnecessary.

The main causes are:

1. Multiple navigation and action layers compete with the work itself.
2. Layout breakpoints follow viewport width even when two sidebars and multiple padding layers consume the content width.
3. Fixed widths, nonwrapping action rows, and inconsistent dialog containment create overflow or clipping.
4. Too many panels have equal borders, visual weight, and prominence.
5. Feature existence and compilation have sometimes been treated as evidence of usable UI.

## 2. Scope and evidence

The source inventory covers all **104 `page.tsx` routes** in `src/app`, including dashboard modules, tenant settings, admin aliases, platform administration, authentication, and public CRM forms/feedback routes. See [route inventory](ui-audit-2026-09/ROUTE_UI_INVENTORY.csv). Every route received a structural source review; complex shared layouts and high-use journeys received deeper code inspection. This does not mean every conditional branch, record state, or user role was exercised.

Excluded: the separate `apps/web` frontend on port 3001, Unnati Vidya's website, backend security re-audit, and implementation of missing CRM features. Existing uncommitted changes were left in place. Source references describe the current working tree, which already contains remediation work.

Evidence types:

- **S — source-confirmed:** an actual implementation choice or missing contract, with file references. Its impact may depend on viewport/data.
- **V — browser-observed:** reproduced in the running application; see the [browser evidence notes](ui-audit-2026-09/BROWSER_REVIEW.md) and linked screenshots.
- **R — recommendation:** proposed interaction or visual rule; not a claim that functionality is already built.

Automated overflow candidates require human interpretation. A table or flow canvas can legitimately be wider than its own scrollport. Conversely, `overflow-hidden` can conceal unusable controls without making the document wider.

### Relationship to existing documents

| Existing document | How this review relates |
|---|---|
| [Comprehensive audit, section 7](crm-audit-bundle-new/CRM_COMPREHENSIVE_AUDIT.md#7-frontend-and-counselor-experience-specification) | Retains its counselor journeys and shared-component direction; adds concrete layout findings and acceptance gates. |
| [25_AUDIT_REMEDIATION_PLAN.md](25_AUDIT_REMEDIATION_PLAN.md) | This is the detailed UI workstream for **WP12**, not a replacement for WP01–WP16. Security and data fixes remain governed there. |
| [LEADSQUARED_GAP_CHECKLIST.md](LEADSQUARED_GAP_CHECKLIST.md) | Feature tracker remains authoritative for functionality. UI completion requires separate browser evidence. Do not erase working features to simplify screens. |
| [05_DESIGN_SYSTEM_PRD.md](05_DESIGN_SYSTEM_PRD.md), [06_DESIGN_SYSTEM_HANDOFF.md](06_DESIGN_SYSTEM_HANDOFF.md) | Retain library consolidation direction. These historical snapshots are not proof of current screen quality. |
| [27_UI_DESIGN_STANDARD.md](27_UI_DESIGN_STANDARD.md) | Proposed implementation standard for this remediation and future features. |

### Reconcile completion claims

The checklist's responsive pass explicitly relies heavily on source inspection, and its mobile test item acknowledges the lack of browser tooling. Its information architecture section confirms tabs were added and builds passed. Preserve that implementation history, but attach a separate **visual verification pending** status until the relevant route/state is tested. In particular, integrations and service-desk settings still use unconstrained tab strips; the form builder still has three concurrent panels; the automation sidebar remains 380px wide. “Has tabs” is not an acceptance criterion for decluttering.

### Browser coverage achieved

The tenant-admin account reached the core CRM workspaces, settings, existing record and form pages, and new automation/report editors. Browser capture attempts map to 81 of the 104 source route patterns; this includes restricted/error states and is not an acceptance-pass count. A broad sweep encountered rate limiting, followed by successful slower rechecks of the core record/report/task pages. Platform screens redirected under this account. Other roles, themes and several token/campaign routes remain explicitly unverified in the inventory. No application code was changed.

## 3. Findings register

UI severity is independent of the backend audit's P0/P1 scale: **UI-P1** blocks navigation or essential work at a supported size; **UI-P2** materially slows or confuses work; **UI-P3** is consistency/polish. All findings below are source-confirmed unless a browser addendum upgrades their evidence.

| ID | Priority | Finding and evidence | Required change / verification |
|---|---|---|---|
| UI-01 | P1 | Mobile navigation closes on entering `<768px`, but `Header` does not render an opener and `handleDrawerToggle` is only passed to `NavigationDrawer`. The remaining toggle is inside the translated-offscreen drawer. `src/components/layout/dashboard-layout.tsx`, `header.tsx`, `NavigationDrawer.tsx`. | Put an always-reachable mobile menu button in the header. Closed drawer must be inert/unmounted; opening traps focus and closing restores it. Verify navigation from a fresh 390px load and after desktop resize. |
| UI-02 | P1 | Leads header uses a single `flex items-center justify-between` row containing title plus Export, Filters, contextual creation and Create Lead. Opportunities adds type selector, export, view switches and creation to another nonwrapping row. `dashboard/leads/page.tsx:344`, `opportunities/page.tsx:496`. | Shared responsive page header and toolbar; one primary create action, secondary operations under More, type/view controls in the toolbar. Verify 390/768/1024px with contextual forms enabled. |
| UI-03 | P1 | Settings adds a 260px secondary sidebar, a padded bordered container, and child-page padding. Integrations adds `p-8` and seven inline tabs without local overflow handling. `dashboard/settings/layout.tsx:19`, `settings/integrations/page.tsx:1091`, `ui/tabs.tsx:17`. | Remove redundant page padding/card wrapper. Use categorized settings navigation and a local-width-responsive section selector. Verify 1280/1440px with expanded main nav, not only wide monitors. |
| UI-04 | P1 | Generic `DialogContent` is vertically unbounded. `StandardDialog` constrains height but replaces the mobile maximum width at `sm` with 600/900/1200/1536px maxima while retaining `w-full`. Wide variants can reach the viewport edge or beyond. `ui/dialog.tsx:62`, `common/standard-dialog.tsx:33`. | One overlay contract: viewport gutters, `dvh` height, fixed header/footer, scrolling body, long-title handling. Audit all raw `DialogContent` callers. Test 667px landscape height and mobile keyboard. |
| UI-05 | P1 | Automation editor always reserves a `w-[380px] shrink-0` sidebar inside a clipped flex row; editor height subtracts only 64px despite outer page spacing. `automations-v2/[id]/page.tsx:1271,1313`. | Dedicated builder shell with measured available height; collapse palette/config into drawers by available width. Canvas must remain usable. Test existing workflow, node selection, history and unsaved exit. |
| UI-06 | P1 | Form builder keeps library (`w-60`), canvas, and inspector (`w-80`) together and enforces `min-h-[720px]` inside viewport-derived height. `components/forms/form-editor.tsx:578,582,712`. | One editor panel at a time on narrow layouts; independently scrolling panels on large screens; remove height floor that exceeds normal laptop space. Verify drag, keyboard alternative, field selection, preview and save. |
| UI-07 | P1 | Global header and record header both stick at `top-0`, at z50 and z30 respectively. Record header can sit underneath global chrome. `layout/header.tsx:100`, `detail-shell/detail-page-header.tsx:28`. | Shared header-offset and layer tokens, including maintenance/impersonation banners. Verify by scrolling real lead and opportunity details, plus keyboard focus on sticky actions. |
| UI-08 | P2 | Settings sidebar has 35 configured destinations and becomes a full vertical list above the form below `lg`, with a height cap only at `lg`. `settings/components/sidebar-nav.tsx`, `settings/layout.tsx:31`. | Desktop categorized searchable navigation; compact current-section selector on smaller screens. Opening Security must reveal Security content immediately, not require scrolling through every setting. |
| UI-09 | P2 | Nonpartner main navigation has 16 ungrouped module entries before admin/platform/custom/pinned groups. Pinned modules are repeated in the main list. Main navigation distinguishes partners but does not provide equivalent counselor/manager workgroup prioritization. Scrolled lead screenshots also show the upper navigation moving offscreen with the page. `layout/NavigationDrawer.tsx:183`. | Stable task-based groups, permission-aware entries, role defaults, discoverable secondary destinations and a small pinned group. Preserve URLs and feature gates. |
| UI-10 | P2 | Lead header exposes many equal actions: opportunity/case creation, assistant, contextual forms, external push, call outcome, sharing, edit. Identity also repeats in a left card; left panels stack before the timeline on mobile. `leads/[id]/page.tsx:249–396`; opportunity detail has fixed 380px left track (`opportunities/[id]/page.tsx:314`). | Prioritize contact/log outcome and next follow-up; move administrative/rare actions into More. Compact identity before timeline on mobile; show secondary properties on demand. |
| UI-11 | P2 | Nested visual containers and divergent titles: settings outer card plus module cards, leads 18px title, reports/dashboard 30px headings, record header ~15px extra-bold, numerous custom 10/14/20/22/28px radii. See settings layout, reports:121, button primitive, StandardDialog. | Shared page/section typography and surface hierarchy. Use whitespace/dividers inside a surface instead of another full card; reduce routine button shadows. |
| UI-12 | P2 | DataTable's controls and pagination are outside `Table`'s horizontal scroll container but use nonwrapping rows. Leads wraps the entire DataTable in an 800px minimum wrapper, making controls scroll with data. Row click handlers do not themselves provide a keyboard target. `ui/data-table.tsx:289,405`, `leads/page.tsx:421`. | Keep controls/pagination within content width; scroll only the table body/columns; explicit record link in identity cell. Test selection, empty filters and 100-row page-size label at narrow width. |
| UI-13 | P2 | Different tab contracts: Radix default centered inline strip; ad hoc scrolling wrappers; record `WorkspaceTabs` uses plain buttons without tab roles, selected state or tab-panel linkage. Reports has nine top-level destinations plus nested builder/schedule tabs. `ui/tabs.tsx`, `detail-shell/workspace-tabs.tsx`, `reports/page.tsx:134`. | One accessible local-navigation contract; group reports into library, builder, schedules and administration. Use links for URL navigation, Radix tabs for same-page panels; preserve drafts and deep links. |
| UI-14 | P2 | Filter condition rows switch to horizontal at viewport `sm`, even inside a narrow sheet; fields/values specify 150–180px minima plus operator and delete. `filters/advanced-filter-drawer.tsx:351`. | Condition editor responds to its own width. Stack field/operator/value on narrow panels; footer actions remain reachable and preview count wraps. |
| UI-15 | P2 | Global chrome exposes a shortened tenant ID and user email fragment instead of useful workspace identity. Login labels lack `htmlFor`/input IDs, email lacks email input type, and password-visibility button lacks a name. `layout/header.tsx:191`, `login/page.tsx:230`. | Friendly tenant name, account details in profile menu, real label associations and accessible names. Review all icon-only actions, not just primary buttons. |
| UI-16 | P2 | Platform shell has a separate 280px sidebar and main area without `min-w-0`; its navigation omits schema-status and marketplace while the dashboard Platform group links them. Dashboard group labels `/platform-admin` as Tenants though that route is an overview. `platform-admin/layout.tsx`, `layout/NavigationDrawer.tsx`. | Shared shell sizing rules, consistent destination names, complete platform navigation and explicit return to tenant context. Verify selected nav on tenant details. |
| UI-17 | P3 | Historical `src/app/design-tokens.css` and `src/lib/design-tokens.ts` declare an 8px step while actual Tailwind spacing uses a 4px scale and components hardcode values. No imports of either historical token file were found in `src`; live colors are in `globals.css` with theme overrides. | Document the live token source; remove/deprecate unused competing declarations after consumer verification. Do not create another disconnected token file. |
| UI-18 | P2 | Global search competes with several header controls at small widths; no explicit narrow search variant, while create/availability disappear below `sm`. Mobile drawer remains mounted with focusable children while translated offscreen. `layout/header.tsx:101`, `NavigationDrawer.tsx` mobile branch. | Header width budget: menu, compact search, notifications and profile; preserve access to availability/create in a menu. Hidden navigation cannot receive focus. |

| UI-19 | P1 | **Browser-observed error ambiguity:** Reports displayed 0 leads / $0 opportunity value alongside “Failed to load reports”; Tasks showed zero counts with a rate-limit toast; an existing lead's detail showed “Lead not found” with “Failed to fetch lead details.” `reports/page.tsx` summary defaults, `tasks/page.tsx` derived counts, `leads/[id]/page.tsx:113`. Some failures occurred during the audit sweep, so this does not establish a normal-load backend outage. | Model loading, error, not-found and loaded-empty separately. Keep a persistent Retry error state; do not replace unavailable data with believable zeros. Isolate ancillary-panel failures from core record identity. Recheck populated journeys after backend availability recovers. |
| UI-20 | P2 | **Browser-observed readability:** Qualified lead status uses white `text-secondary-foreground` on a pale `bg-secondary/15` background, visibly faint in the default light theme. `dashboard/leads/columns.tsx:23`. | Pair background/foreground as semantic badge tokens; use a dark status foreground on pale fill. Verify computed contrast across all supported themes; screenshot review alone is not a measured contrast ratio. |

Line numbers are starting points, not permanent identifiers; search the named component/class if ongoing edits move them.

### Useful foundations to retain

`Table` already contains horizontal data scrolling. `StandardDialog` already separates scrollable content from actions. `DataTable` already implements density, column visibility and error/empty states. Tasks already wraps many filters and has a card layout. Reports already separates major content into tabs. Root `MotionConfig` respects reduced motion. Build on these foundations and fix their composition/edge cases.

## 4. Screen-family remediation map

This table is the implementation coverage map; the CSV contains individual routes and alias targets. A listed family is not a claim that all its behavior was browser-tested.

| Family | Specific redesign focus | Acceptance scenarios |
|---|---|---|
| Dashboard | Default to useful work/exception summary; move widget/layout/version management into Edit dashboard. Limit simultaneous summary cards and provide clear empty-widget recovery. | New user, populated dashboard, failed widget, edit/save/cancel, narrow layout. |
| Leads, lead lists, activities | Shared list shell, search/filter summary, readable status, predictable preview/open-record behavior, contained data scroll. | Long contact names/email, empty/no matches, filters, preview, back restoration, create, selection. |
| Opportunities | Separate type/pipeline selection from page actions; one List/Board switch; board owns its horizontal scroll. | Many stages, long stage names, no type, disabled module, card/row details. |
| Tasks, team queues, call center | Due/overdue work first; advanced filters collapsed; concise outcome/follow-up interaction; avoid repeated action bars for every task. | Overdue work, calendar, reassignment permission, no assigned work, failed call and retry. |
| Lead/opportunity/case details | Identity, next action and timeline first. Properties and related records secondary; consistent headers and action priority. | Long names, large histories, missing data, linked records, 200% zoom, open drawer during scroll. |
| Smart Views | Clarify definition editing versus executing a saved view; reduce view tiles and action duplication. | Long saved-view names, many views, restricted view, filters, bulk work, edit cancellation. |
| Forms and public forms | Builder shell, selected-field inspector, preview modes; visitor form gets single readable column and clear progress/errors. | Existing/new form, CRM Placement, long option labels, validation, draft recovery, submit success/failure. |
| Automations | Builder workspace with discoverable selected-step editing, workflow status and save state; history/testing secondary. | New/existing, selecting node, long branches, validation, test results, publish/activation distinction. |
| Reports | Report library first, builder wizard, schedules separate; metrics/catalog administration secondary. Avoid showing configuration controls around routine report reading. | Loading/error/partial data, wide preview, filter drilldown, saved report, schedule editor. |
| Marketing | Separate campaign list, composer, delivery monitoring, sender setup and journeys. Composer's fixed 320px + 360px side panels need local-width adaptation. | Long campaign name, audience preview, draft, send review, delivery failure, split view. |
| Exports and approvals | Clear status and scope; show action required, timestamps and downloadable result; secondary rules/setup outside routine queue. | Pending/failed/partial/complete export; allowed and disallowed approval; no results. |
| Payouts, points, leaderboard | Separate personal statements/rewards from finance configuration; explain status and next action with restrained visual emphasis. | Empty cycle, long amounts, disputed/held payout, reward unavailable, narrow tables. |
| General settings | Remove duplicate Settings/General Settings heading weight; separate personal workspace settings from organization settings using appropriate existing access rules. | Appearance, localization, dirty form, permission denied, short content without giant empty box. |
| Users, roles, teams, sales groups, partners | Common list/editor; searchable permissions grouped by task; related membership drawers. | Long roles/names, many permissions, invitation/error, partner scope, member list. |
| Pipelines, activity types, custom fields, catalog | Ordered configuration lists; item editor on demand; clear dependencies and reorder affordance. | Many fields/stages, long labels, disabled item, create/edit validation. |
| Assignment, scoring, NBA, gamification | Summary and enabled state first; advanced model/rule/guardrail controls in focused editors. | Large rule sets, disabled feature, validation, simulation, historical state. |
| Telephony and service desk settings | Group dispositions/scripts/campaigns; replace eight-wide service-desk tab row with section navigation. | Queue/SLA/macro editor, long scripts, preview, unknown/unavailable connector. |
| Integrations and marketplace | Connector list and health summary; each connector has Overview / Configuration / Activity / Diagnostics. Keep payload/debug views secondary and contained. | Long URLs/JSON, failed health, edit credential field, installed app, permission review. |
| Security, sessions, MFA, SCIM, governance | Readable policy sections, explanatory labels and distinct sensitive-action confirmation. | Validation, long audit values, no records, revoked session, MFA states. |
| Platform admin | Consistent platform navigation; readable tenant, usage, audit and review workspaces. | Tenant detail, missing metric, narrow viewport, platform-to-tenant return. |
| Login/reset/bootstrap/survey/unsubscribe | Short forms with usable labels, height-safe layout and distinct success/error states. | Mobile landscape, keyboard, expired password, invalid token, success. |

Do not design application progression as if the unfinished admissions modules already exist. Use existing related-opportunity/stage information; keep future documents/payment/eligibility work tracked under the feature roadmap and WP13.

## 5. Implementation sequence

Every package produces an isolated reviewable change, screenshots, and a route/state checklist. Do not mix backend migrations with cosmetic work. Sequence is dependency-based; no calendar estimate is asserted without implementation sizing.

| Package | Scope and deliverable | Depends on | Exit gate |
|---|---|---|---|
| UI-A | Baseline authenticated route captures; reconcile source/browser evidence; agree reference list/detail/settings compositions. | Local test account | Supported viewport evidence for representative routes and explicit blocked states. |
| UI-B | Shared shell, mobile menu, page width/padding, header offsets, overlay layers, safe dialogs, tab variants. Address UI-01/03/04/07/18; implement the shared error contract for UI-19. | UI-A | No inaccessible mobile navigation; no hidden modal actions; core layout containment checks pass. |
| UI-C | Implement reference Leads list + detail, then Tasks follow-up journey. Shared PageHeader, ListToolbar, RecordLayout, SelectionBar, responsive DataTable footer. | UI-B | Fresh lead → preview → log outcome → follow-up; list state restored on return; keyboard completion. |
| UI-D | Apply same patterns to opportunities, activities, lists, views, cases, call center, exports and approvals. | UI-C | All family scenarios above verified; no per-page forks of shared layout behavior. |
| UI-E | Settings navigation and section layout; migrate integrations/service desk first, then remaining 35 navigation destinations and admin aliases. | UI-B, UI-C patterns | Content visible immediately on mobile; tabs and forms fit 1024/1280px with sidebar open. |
| UI-F | Builder shell for automations and forms; report library/builder; marketing composer/journeys. | UI-B, UI-C patterns | All editor controls reachable at 1280×720; narrow-screen panel switching preserves draft; 1440px side panels usable. |
| UI-G | Dashboard, finance/rewards, platform administration, authentication and public CRM routes. | UI-C, UI-E | Consistent templates and all remaining route families verified. |
| UI-H | Cross-role, theme, keyboard, zoom, large-data and long-content sweep; tracker reconciliation; adoption gate for future work. | UI-D–G | Route inventory has evidence/status for every route; no open UI-P1; agreed UI-P2 exceptions have owner and reason. |

Assign implementation and review owners when scheduling each package. Parallel package work is possible only after the shared contracts stabilize; this review does not require a wholesale redesign branch.

## 6. Verification and release gate

### Viewports and content

- Routine desktop: 1440×900 and **1280×720**, sidebar expanded and collapsed.
- Constrained desktop/tablet: 1024×768 and 768×1024.
- Mobile: 390×844 and 320×568; landscape 844×390 for dialogs/login.
- Zoom: real browser 200%; 320 CSS-pixel reflow check is separate from browser zoom.
- Light and dark theme; default green plus one alternate theme to detect fixed-color assumptions.
- Data: empty, one record, normal page, many columns/stages, long names/emails/URLs, unbroken identifier, multi-line error, selected records and loading/failed states.
- Roles: counselor, manager, tenant admin, partner and platform admin using proper test accounts. Hidden entry points do not replace server authorization.

### Pass criteria

1. Document width ≤ viewport width + 1 CSS pixel except an explicitly recorded browser rounding allowance. Horizontal overflow is confined to intentional tables/canvases and visibly discoverable.
2. No clipped title, essential action, field error, dropdown option or dialog footer. A clean `scrollWidth` result alone is insufficient.
3. Main content uses one vertical page scroll. Deliberate navigation/editor/overlay scroll areas are independently usable and never trap the user.
4. Menu, search, filters, create, record open, back, save/cancel and retry can be completed by keyboard. Focus remains visible and is restored after overlays.
5. One dominant action per page/workflow; secondary actions remain discoverable. A counselor can locate the next task without scanning admin tools.
6. Failure preserves entered data; selection scope and active filters remain explicit; server success is reflected without an unnecessary full reload.
7. Layout repair preserves feature gates, permission-based actions, query/filter semantics, audit-backed mutations and drafts.
8. Compare five counselor journeys against baseline for completion, wrong turns and missing context. Set timing targets after measuring; do not invent performance improvements from screenshots.

Use browser tests for menu reachability, overflow, dialog containment, critical keyboard flows and state restoration. Use existing unit/integration tests where a shared interaction or state contract changes, plus project lint/type/build checks. A documentation-only review does not need an application build. Automated screenshots and geometry checks complement manual visual/interaction inspection; they do not prove screen-reader quality or all business states.

### Completion tracking

For each route/family record: implementation status, browser status, role, viewport, scenario, screenshot, finding IDs, owner and remaining exception. Suggested statuses: `not started → implemented → browser verified → accepted`. Mark aliases separately from canonical pages. Do not mark the whole family done because one alias or one empty state renders.

## 7. Design direction for the owner

Recommended direction: a calm, compact enterprise workspace with readable 14px content, restrained green emphasis, fewer enclosing cards, explicit action hierarchy and task-based navigation. Preserve comfortable density as an option. The priority is fitting real work into normal windows; color and decorative styling follow that.

The companion design standard defines concrete sizes, responsive behavior, page templates and component ownership. It is a proposed standard ready for implementation review, not a claim that the current app conforms.
