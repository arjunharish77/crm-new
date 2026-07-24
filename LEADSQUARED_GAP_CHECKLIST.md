# LeadSquared-Level CRM Gap Checklist

This is the working implementation checklist. Mark items complete only when the feature is implemented, wired to real data/runtime behavior, and verified.

## Phase 0 — Foundation

- [x] Export real Supabase schema into repo as SCHEMA.md
- [x] Add .env.example
- [x] Add minimal smoke tests (auth, leads CRUD, RLS check)
- [x] Confirm rate-limits / retention / usage admin pages are wired to real enforcement (all three are UI stubs — see 00_ROADMAP.md note)

## Gamification & Payouts

- [x] Partner role + portal (admin-only creation; `isPartnerRole` flag on Role.permissions; partners scoped to their own `ownerId`-assigned leads/opportunities; blocked from admin/settings/automation screens via `requireInternalUser` + hardened `RoleGuard`)
- [x] Partner organizations with multiple logins and hierarchy — implemented via `PartnerOrganization`, `PartnerProfile.partnerOrganizationId`, parent profile links, login roles, automatic org creation/backfill, admin API for additional partner logins, and Partners UI controls to add/manage child logins, parent login, login role, status, and payout visibility. Migration `0013_partner_org_visibility_targeting.sql`, partner/payout/gamification tests, `tsc`, and build verified.
- [x] Commission rule engine — condition-based (reuses the automation engine's field-condition matcher), priority-ordered, first-match-wins, admin UI at Settings → Commission Rules
- [x] Commission ledger — append-only, enforced by both application code and a Postgres trigger; corrections are new offsetting rows, never edits
- [x] Commission calculation wired into the existing automation engine (`calculate_commission` node) — no second event pipeline
- [x] Payout cycles — configurable recurring interval, Draft → Approved → Invoiced/Paid status flow, admin UI at Settings → Payout Cycles
- [x] Advanced payout controls — tenant-level minimum payout amount, manual vs auto-below-threshold approval mode, payout hold/release workflow with configured reasons, invoice-before-payment enforcement, partner self-invoice toggle, adjustment/hold reason catalogs, and server-side transition guards; migration `0010_advanced_payout_gamification_settings.sql`, payout tests, `tsc`, and build verified.
- [x] Payout module visibility targeting — admin can select all partners or specific users, teams, sales groups, and partner organizations in Payout Settings; partner payout nav/API/invoice self-service are gated by the same server-side targeting. Migration `0013_partner_org_visibility_targeting.sql`, payout tests, `tsc`, and build verified.
- [x] Partner payout aggregation across multiple logins — `computePayoutsForCycle` now resolves each commission ledger `partnerId` to its partner organization and creates one payout for the primary org login while preserving original per-login ledger attribution. Migration `0013_partner_org_visibility_targeting.sql`, payout tests, `tsc`, and build verified.
- [x] Payout adjustment workflow — admins can create credit/debit adjustments against unlocked payouts using configured reasons; adjustments write append-only `CommissionLedger` correction rows, update payout totals, and audit the change.
- [x] GST-compliant invoice generation — per-partner configurable numbering pattern (incl. financial-year-scoped), CGST+SGST/IGST place-of-supply split, non-GST receipts for unregistered partners, PDFs persisted to Supabase Storage, one-click partner self-service generation
- [x] Finance CSV export per payout cycle
- [x] Gamification points engine — rule-based, additive (multiple matching rules stack, unlike commission's single-winner), hooked into the same automation engine (`award_points` node)
- [x] Advanced gamification settings — tenant-level levels, leaderboard configuration, redemption catalog, and anti-gaming caps persisted via `GamificationSettings` with admin UI/API; migration `0010_advanced_payout_gamification_settings.sql`, `tsc`, and build verified.
- [x] Gamification participant targeting — admin can select all eligible users or specific users, teams, sales groups, and partner organizations; awards, redemptions, and leaderboards now enforce the targeting server-side. Migration `0013_partner_org_visibility_targeting.sql`, gamification tests, `tsc`, and build verified.
- [x] Gamification anti-gaming enforcement — duplicate event window suppression, daily positive-point caps, and high-value award review threshold checks now run inside `awardPointsForEvent`; skipped awards are audit-logged.
- [x] Badges — threshold/window-based, deduplicated per window via a DB unique constraint, admin UI at Settings → Gamification
- [x] Leaderboard — individual and team scope, date-range filterable, computed-on-read (no materialized view needed at this scale)
- [x] Self-service pages: My Payouts + invoice template editor (partners), My Points + badges (partners and reps), Leaderboard (internal-only — partners must not see other partners)
- [x] Audit trail extended (not duplicated) — every new mutation type flows through the existing `createAuditLog`/`AuditLog` table
- [x] Points-to-money / 3rd-party reward redemption — active reward catalog on My Points, request flow with immediate point reservation, admin redemption queue on Settings → Gamification, fulfillment/failure review, automatic point refund on failed requests, and migration `0011_gamification_redemptions.sql`; gamification tests, `tsc`, and build verified.
- [ ] Full RBAC lockdown across all ~103 existing API routes — only new routes plus a targeted set of the most sensitive existing ones (roles, permission-templates, users, settings, automations-v2) got `requireInternalUser`; a full sweep is separate follow-up work
- [ ] Credit-note handling for a corrected/superseded invoice (only additive commission corrections are supported; invoice-level correction flow — `supersedesInvoiceId` — was flagged as a later-phase item and not built)
- [ ] End-to-end verification of PDF generation against a real Supabase Storage bucket — the pure numbering/tax-split logic is unit-tested and the full flow is build-verified, but not run against live Storage infrastructure
- [ ] Migrations `0001`–`0007` in `migrations/` have not been applied to the real database — run them manually in the Supabase SQL Editor, then re-export `SCHEMA.md`

## Forms and CRM Placement

- [x] Enhance existing CRM placement into process-style placement rules without creating a separate Process Designer module.
- [x] Add per-placement display order and launch label.
- [x] Add per-placement record-field conditions.
- [x] Add per-placement visibility overrides for users, teams, and sales groups.
- [x] Move CRM Placement into a dedicated Forms tab.
- [x] Add role-based CRM placement visibility.
- [x] Add user custom-field/skills based CRM placement conditions.
- [x] Add form draft save/resume.
- [ ] Add section/tab-level conditional rules.
- [ ] Add Task fields to forms after Tasks module exists.

## Priority Module 1 — Tasks

- [x] Add Task object/table/API with tenant isolation, owner scope, related lead/opportunity/activity links, priority, status, due/reminder timestamps, completion metadata, audit trail, and migration `0012_tasks.sql`; task tests, `tsc`, and build verified.
- [ ] Add task list workspace with saved views, quick filters (today/overdue/upcoming/completed), owner/status/priority filters, bulk complete/reassign/reschedule, and mobile cards. Foundation workspace exists at `/dashboard/tasks` with quick filters, status/owner/priority filters, create/edit/complete/reopen/delete, and scoped lead/opportunity selectors; bulk actions and mobile-specific cards still pending.
- [ ] Add calendar view with day/week/month modes, overdue lane, drag-to-reschedule, and reminder visibility.
- [ ] Add task detail/edit drawer with comments/notes, related record preview, assignment changes, reminder changes, completion workflow, and field history.
- [ ] Add tasks on lead, opportunity, and activity detail pages as contextual related panels. Lead and Opportunity detail tabs now have contextual task panels; Activity detail panel is pending because there is no standalone activity detail page yet.
- [x] Add task triggers to automation runtime: created, updated, completed, and reminder-due events are emitted from task create/update/reminder processing; overdue scheduled trigger still pending.
- [x] Add task actions to automation runtime: create task, assign task, update task, complete task, reschedule task, add reminder.
- [ ] Add task fields to forms after the object exists.

## Priority Module 2 — Views

- [x] Upgrade saved views into a LeadSquared-style standalone Views module. `/dashboard/views` now uses a Smart View dropdown, renders each View's tabs and record lists in the same page, supports inline refresh/search/count chips, and no longer redirects tabs into Leads/Activities/Opportunities/Tasks pages.
- [x] Add view scopes: private, shared with users/teams/sales groups, role-visible, tenant default, pinned/favorite. Views remain stored as `CustomReport` rows with richer `config` JSON; server-side visibility enforces user/team/sales-group/role targets, admins can assign Views, and non-admin users create private Views for themselves.
- [x] Add view builder with filters, columns, sort, grouping, density, charts/count chips, and quick actions. The View save dialog acts as a tabbed builder with add/remove/rename tabs, module selection per tab, tab-specific filter conditions, visible column selection, sort/group controls, density selection, chart/count-chip configuration, and quick-action selection; dialog width/scroll behavior has been improved for normal browser zoom.
- [ ] Add dynamic view segments (relative dates, current user/team, SLA state, score bands, untouched records, overdue tasks).
- [ ] Add view audit trail, rename, reorder, and default view per module/persona. Permissions/visibility, clone, delete, pin, and default are implemented; rename UI, audit trail, reorder, and persona defaults remain pending.
- [ ] Add view use in dashboards and reports as a selectable record source.

## Priority Module 3 — Distribution Engine Module

- [ ] Promote assignment rules into a full Distribution module for lead and opportunity distribution.
- [ ] Add distribution rule folders, rule ordering, default catch-all rules, activation windows, and simulation/test mode.
- [ ] Add routing strategies: round robin, weighted round robin, capacity/quota based, skill based, territory based, working-hours aware, availability/check-in aware, and account/owner affinity.
- [ ] Add user/team quotas, daily caps, open-workload caps, holidays, working hours, and pause/availability states.
- [ ] Add distribution logs with explainability: matched rule, skipped users with reasons, selected user, reassignment source, and SLA impact.
- [ ] Add bulk redistribution, manual redistribution, reassignment approval controls, and fairness/performance reports.
- [ ] Add distribution automation actions and triggers for distribution success/failure/reassignment.

## Priority Module 4 — Marketing Communications

- [ ] Add Marketing Communications module for nurturing over Email, WhatsApp, SMS, and future channels.
- [ ] Add provider configuration, sender identities, consent/opt-in/opt-out tracking, templates, variables, UTM defaults, and compliance settings.
- [ ] Add campaign builder for one-time broadcasts and drip/nurture journeys using smart views/lists as audiences.
- [ ] Add message composer with personalization tokens, preview, test send, approval workflow, throttling, quiet hours, and channel fallback.
- [ ] Add delivery/event ingestion for sent, delivered, opened, clicked, replied, bounced, failed, unsubscribed, and WhatsApp/SMS statuses.
- [ ] Add lead/opportunity timeline integration and automation triggers/actions for communication events.
- [ ] Add campaign analytics: funnel impact, source ROI, engagement scoring, attribution, and suppression reports.

## Priority Module 5 — Predictive Scoring

### Initial Production Scope — Build First

- [x] Add predictive scoring schema migration with tenant isolation: `ScoringModel`, `ScoringModelVersion`, `ScoringTrainingRun`, `ScoringFeatureSnapshot`, `RecordScore`, `RecordScoreHistory`, and `ScoringSettings`. Migration `0014_predictive_scoring.sql` added; run manually in Supabase and re-export `SCHEMA.md`.
- [x] Keep existing rule-based lead scoring as the fallback score when predictive scoring is disabled, training data is insufficient, or a model version is not promoted. Recompute stores `RULE_FALLBACK` source when confidence is low/disabled and keeps existing rule scoring as the visible fallback path.
- [x] Add tenant scoring settings: enabled/disabled, target module (`LEAD`, `OPPORTUNITY`, or both), scoring objective, minimum historical records, lookback window, retrain cadence, promoted model version, and fallback behavior. Settings API and Settings → Lead Scoring UI tab are implemented.
- [x] Build deterministic predictive feature extraction for leads: source, campaign, status, created age, owner/team/sales group, custom field values, activity count, last activity age, task count, overdue task count, first response time, and opportunity-created outcome. Implemented core lead fields/source/status/owner, activities, tasks, first response, and opportunity count; campaign/custom-field/team/sales-group enrichment remains for full feature catalog.
- [x] Build deterministic predictive feature extraction for opportunities: stage, value band, age in current stage, activity count, last activity age, task health, owner/team/sales group, stage progression speed, and won/lost outcome. Implemented stage, value band, age, activities, task health, owner, and won/lost inference; stage-history speed/team/sales-group enrichment remains for full feature catalog.
- [x] Store feature snapshots per scored record with the model version, source data timestamp, and feature JSON so score changes are explainable and reproducible. Predictive scoring stores snapshots and score history; model version linkage is nullable until full model promotion is built.
- [x] Add a simple explainable predictive scoring engine before full ML: weighted feature scoring plus probability-style calibration from historic conversion/win rates by feature buckets.
- [x] Add score outputs for predictive scoring: `fitScore`, `engagementScore`, `conversionProbability`, `winProbability`, `stallRisk`, score band (`HOT`, `WARM`, `COLD`, `RISK`), confidence, and top positive/negative reasons.
- [x] Add batch recompute endpoint/job for all leads and opportunities in a tenant, with progress tracking, skipped-record counts, and audit logs. `/api/lead-scoring/self-learning/recompute` writes `ScoringTrainingRun`, feature snapshots, latest scores, score history, audit log, and updates `Lead.score` when enabled.
- [x] Add event-based recompute hooks for lead create/update, opportunity create/update/stage change, activity create/update, and task create/update/complete. Lead, opportunity, activity, and task mutation paths now schedule predictive score refreshes for the affected module set.
- [x] Add Settings → Lead Scoring admin UI for predictive scoring controls: enable predictive scoring, choose objective, minimum data threshold, retrain/recompute button, current model status, fallback state, and latest run metrics.
- [x] Add lead list and opportunity list score columns with score band badges, sortable values, and filters by score band/confidence. List APIs now enrich rows with `predictiveScore` and translate score filters through `RecordScore`.
- [x] Add lead detail and opportunity detail score panels showing current score, score trend, confidence, top reasons, last calculated timestamp, and fallback/model source.
- [x] Add score history timeline per record so admins can see when and why a score changed.
- [x] Add automation condition support for score band, score value, confidence, stall risk, and score changed by threshold. Automation builder exposes scoring fields and runtime condition matching resolves predictive-score paths/aliases when present on the event payload.
- [x] Add basic dashboard/report widgets for score distribution, hot leads, high-risk opportunities, stale high-fit leads, and score-to-conversion performance through the existing report-backed DashboardWidget flow.
- [x] Add tests for predictive scoring edge cases: empty tenant, insufficient history, records with no activity, missing owner/team, partial opportunity data, stale activity, and fallback-to-rules behavior. `tests/self-learning-scoring.test.ts` covers settings, calibration, sparse/missing data, empty tenant, fallback-to-rules, recompute persistence/history, and enabled Lead.score updates.
- [x] Seed tenant with id:`d3b6693a-7aa2-4b91-94cf-43ab37ffed90` with representative scoring data and verify scores against known fixture outcomes. Seed script writes `ScoringSettings`, `ScoringFeatureSnapshot`, `RecordScore`, and `RecordScoreHistory`; live Supabase seed completed with 520 leads, 520 opportunities, and representative score rows. Live DB still has the older `RecordScore_source_check`, so seed rows used the safe fallback source until migration `0014_predictive_scoring.sql` is rerun.
- [x] Run `npx tsc --noEmit` and `npm run build` after the predictive scoring schema/API/service batch, after UI wiring, and after tests/seed verification. `npx tsc --noEmit`, predictive scoring tests, and `npm run build` are clean.

### Advanced Model Scope — After Initial Release

- [ ] Add real model training jobs with tenant-level data windows, train/validation split, holdout metrics, model comparison, promotion workflow, rollback, and model retirement.
- [ ] Add feature catalog management: admin can include/exclude fields, mark sensitive fields as prohibited, configure derived features, and preview feature coverage before training.
- [ ] Add advanced feature extraction from forms, marketing communications, website visits, inbound call outcomes, partner source quality, reassignment history, SLA breaches, and campaign/source ROI.
- [ ] Add model quality metrics: precision/recall, lift by score band, calibration chart, confusion matrix, conversion by decile, feature importance, and drift from previous model version.
- [ ] Add opportunity-specific predictions: win probability, expected close risk, stage-stall risk, next-best activity recommendation, and suggested close date movement.
- [ ] Add lead-specific predictions: lead fit, engagement, conversion propensity, expected response likelihood, duplicate/stale risk, and recommended next action.
- [ ] Add model governance: training run audit trail, promoted-by/reviewed-by, notes, approval mode, restricted-field checks, and rollback reason capture.
- [ ] Add manual score override workflow with reason, expiry date, override owner, audit log, and clear/revert action.
- [ ] Add score explainability UI with top drivers, missing-data warnings, similar converted records, and suggested data improvements.
- [ ] Add scoring integration into Views, Distribution Engine, Reports, Dashboards, Marketing Communications audiences, and Automations.
- [ ] Add scheduled retraining processor with queue state, failed-run retry, notification on drift/low quality, and retrain lock to prevent concurrent tenant runs.
- [ ] Add safeguards for cold-start tenants, sparse data, class imbalance, biased outcomes, overfitting, low-confidence predictions, and human-readable fallback rules.
- [ ] Add data retention and privacy controls for feature snapshots and model training data.
- [ ] Add performance controls for large tenants: incremental feature refresh, chunked recompute, cached latest scores, and indexes for score filters/sorts.
- [ ] Add full test coverage for model promotion/rollback, drift detection, feature exclusion, manual override precedence, automation triggers, and reporting/dashboard aggregates.

## Automations

- [x] Add automation-level exit conditions. Builder exposes workflow-level exit rules with AND/OR matching and dropdown-backed values where field options exist; runtime stops matching records before node execution.
- [x] Add loop protection and per-record execution caps. Builder exposes max runs per record and max steps per run; runtime records skipped executions once a record reaches its cap and stops long runs at the step cap.
- [x] Make builder context-aware by trigger. Add-step popup now filters available nodes based on lead, opportunity, activity, or task trigger scope, and condition defaults use the current trigger module instead of always defaulting to lead fields.
- [x] Fix Multi If/Else branch defaults. New Multi If/Else nodes now create only `If 1` and `Else`; else-if branches are added only when configured, and stale empty else-if branch nodes are cleaned up on save.
- [x] Add task actions to automation builder/runtime. Automations can create, update, assign, reschedule, and complete tasks where trigger context supports tasks.
- [x] Add real messaging queue actions when email/SMS/WhatsApp integrations are configured. Automation Send Message nodes now enqueue Email, WhatsApp, or SMS into `CommunicationOutbox` for worker delivery instead of being UI-only.
- [ ] Add bulk enrollment and bulk update execution tracking.
- [ ] Add sub-automation action.
- [ ] Enhance split test with percentage allocation and performance analytics. Percentage allocation and variant branch creation are implemented; performance analytics remains pending.
- [ ] Enhance wait nodes with exact date/time, timezone, day/time windows, timeout continue/exit, and max wait limits. Exact resume, simple day/time window, timeout continue/exit, and max wait cap are implemented; timezone-aware calendar semantics still need a deeper pass.
- [ ] Add explicit Triggered Activity vs Lead Activity condition source.
- [ ] Add opportunity share/stop-share actions after sharing model exists.

## Distribution

- [ ] Add assignment quotas for leads and opportunities.
- [ ] Add user availability/check-in and working-hours support.
- [ ] Add distribution rule simulator/tester.
- [ ] Add drag/drop rule ordering and default-rule enforcement UI.
- [ ] Add user-property based distribution matching.
- [ ] Add distribution fairness reports.

## CRM Objects

- [x] Add core/system activities.
- [x] Add website tracking script and web activity ingestion.
- [x] Add static lists and smart lists.
- [x] Add list automation triggers and add/remove list actions.

## Imports and Integrations

- [x] Add full lead import with mapping and validation report.
- [x] Add opportunity import.
- [x] Add activity import.
- [x] Add duplicate-handling configuration for imports.
- [x] Add trigger automation on import.
- [x] Add real webhook management APIs.
- [x] Add telephony/agent-popup integration.

## Reporting and Admin

- [x] Add field-level audit trail for leads, opportunities, and activities.
- [x] Show activity modification history with changed values in activity timeline.
- [x] Add tenant-wide audit log endpoint for all modules.
- [x] Add custom report builder with joins — backend-safe structured JSON query endpoint added at `/api/reports/query`; supports Lead/Opportunity/Activity roots plus owner, stage/type, activity, and assignment-log joins without raw user SQL.
- [x] Add scheduled report subscriptions.
- [ ] Add automation performance reports.
- [ ] Add form drop-off analytics by step/tab/field.
- [x] Add activity SLA reports.
- [x] Add field-level permissions.
- [ ] Add record sharing and opportunity sharing.

## Reporting & Dashboards

- [x] Audit current dashboard/reporting implementation: widgets support `STAT`, `TREND`, `BAR`, `FUNNEL`; existing reports were leads/opportunities/activities summary plus metadata-only custom reports; existing custom report model had no join execution.
- [x] Add reporting rollup schema migration (`migrations/0008_reporting_rollups.sql`) for `ReportDefinition`, `ReportRollup`, `ReportRefreshState`, and `ReportRefreshJob`, with tenant RLS, refresh state, manual refresh job tracking, and null-scope uniqueness.
- [x] Add safe cross-object report query backend (`src/lib/server/reporting-query.ts`, `/api/reports/query`) using a structured JSON definition validated against a hardcoded object/field catalog and Supabase query builder/in-memory joins.
- [x] Ship all 10 inbuilt report endpoints, each `tsc` + build verified and checked against real `tenant_demo` data where seeded data exists:
  - `/api/reports/inbuilt/funnel-by-stage`
  - `/api/reports/inbuilt/funnel-by-source-campaign`
  - `/api/reports/inbuilt/rep-performance`
  - `/api/reports/inbuilt/sla-response-breaches`
  - `/api/reports/inbuilt/lead-source-roi`
  - `/api/reports/inbuilt/reassignment-impact`
  - `/api/reports/inbuilt/activity-call-volume-trends`
  - `/api/reports/inbuilt/commission-payout-summary`
  - `/api/reports/inbuilt/cohort-funnel-progression`
  - `/api/reports/inbuilt/data-quality`
- [x] Add persona dashboard presets for Admin, Manager, Rep, and Partner as ordinary customizable `DashboardWidget` rows via `/api/dashboard-widgets/presets`; dashboard manager now seeds the server-chosen persona preset instead of hard-coded client defaults.
- [x] Extend dashboard widget data mapping to support report-backed `STAT`, `BAR`, and `TREND` widgets while preserving the existing widget-library/dashboard-manager components.
- [x] Validate permission-scoped internal dashboard/report behavior against seeded Admin/Manager/Rep users. Partner preset/report filtering is implemented via partner role detection and `partnerId = user.id`, but the current seed data has no partner user/profile, so live partner-scope verification still needs a partner fixture.
- [x] Add scheduled report email subscriptions: `ReportSchedule` + `ReportEmailDelivery` migration (`0009_report_schedules.sql`), CRUD APIs under `/api/reports/schedules`, and cron-style processor at `/api/reports/schedules/process-due`. Current app has no SMTP/mail adapter, so processor records PENDING delivery/outbox rows with rendered report payloads for a future sender.
- [x] Add drill-down links from aggregate report/dashboard values to filtered record lists — inbuilt report previews now link stage/source/owner/activity-period/partner/cohort/data-quality rows to the relevant filtered records where a safe destination exists.
- [x] Add rollup/report calculation unit tests for edge cases (empty date ranges, leads with no activity, partial periods): `tests/reporting-calculations.test.ts` covers activity buckets, reassignment/no-activity breaches, cohort partial periods, and data-quality stale/missing/duplicate cases.
- [x] Wire rollup refresh execution jobs to compute and persist heavy report snapshots — `/api/reports/rollups/refresh` supports manual queue/run-now, `/api/reports/rollups/process-jobs` processes pending jobs, `ReportRollup` stores computed payloads, and `ReportRefreshState` tracks freshness/error state.

## UX Information Architecture

- [x] Replace long-scroll, everything-visible module pages with focused sections, tabs, drawers, or dialogs where appropriate. Reports, Settings, Payout Cycles, Gamification Settings, Forms builder, and Automation builder side panels now use focused tabs/sections for their main workflows.
- [x] Reports workspace declutter — split overview metrics/charts, inbuilt reports, saved reports, custom builder, and schedules into focused tabs; custom report builder is further split into Setup, Columns, Filters & Sort, and Preview; report scheduling is split into Create Schedule and Existing Schedules. Existing export/run/save behavior remains wired; `tsc` verified.
- [x] Settings/admin module declutter — General Settings is split into Appearance, Organization, and Localization tabs; Payout Cycles is split into Configuration, Visibility, Billing Identity, and Cycles & Payouts, with Configuration further split into Cycle Rules, Tax & Invoice, and Finance Controls; Gamification Settings is split into Point Rules, Badges, Settings, and Redemptions, with Settings further split into Levels, Leaderboard, Rewards, Guardrails, and Participants. Existing actions remain wired; `tsc` verified.
- [x] Forms and automation builder declutter — Form detail already uses focused Builder, Submissions, Analytics, and CRM Placement tabs; Automation builder sidebar now separates Workflow setup from Selected Step configuration while preserving the existing designer/history split. `tsc` verified.
- [x] Add a UI review pass for mobile on the decluttered pages: tab lists now horizontally scroll where needed, primary report export is full-width on mobile, and dense payout/gamification action rows wrap instead of squeezing/overlapping; `tsc` and build verified.
- [x] Role creation UX fix for partners — Settings/Admin → Roles now exposes the `External partner role` switch used by Add Partner, so admins can create selectable partner roles without hidden JSON/API edits; `tsc` and build verified.

## Design System Consolidation

- [x] Audit every MUI-importing file (128 found) and confirm the color-token source of truth (`src/theme.ts`'s M3 `md3Colors`, ported byte-for-byte).
- [x] Migrate M3 color tokens to Tailwind v4 CSS variables in `src/app/globals.css` (`:root`/`.dark` blocks + `@theme inline` mapping), preserving every ported hex value exactly; verified against compiled CSS output.
- [x] Migrate all 128 MUI-importing files to shadcn/Tailwind — zero `@mui/*`/`@emotion/*` imports remain anywhere in `src/`.
- [x] Build a TanStack-Table-based `DataTable` primitive (`src/components/ui/data-table.tsx`) as the shadcn-idiomatic replacement for MUI's `x-data-grid`/`StandardDataGrid`, migrate every consumer, then delete `standard-data-grid.tsx` and remove `@mui/x-data-grid`.
- [x] Build new shadcn primitives as gaps were found, following existing `src/components/ui/` conventions: `skeleton`, `tooltip`, `avatar`, `badge`, `alert`, `accordion`, `radio-group` (all Radix-backed, no new MUI usage introduced at any point).
- [x] Delete `src/theme.ts` and `src/types/mui-theme.d.ts`; strip `ThemeRegistry.tsx` down to just the `next-themes` provider (no more `AppRouterCacheProvider`/`ThemeProvider`/`CssBaseline`/`LocalizationProvider`); remove `@mui/*` and `@emotion/*` from `package.json`.
- [x] Theme registry + selector — 4 named M3-structured color themes (Forest [default/original green], Ocean, Sunset, Grape), each with light+dark variants, selected via a `data-color-theme` attribute on `<html>` (`src/app/globals.css`), persisted to `localStorage` + a `next-themes`-style no-flash inline script in `layout.tsx`, with a live-preview swatch picker plus a light/dark/system mode toggle under Settings → General → Appearance (`src/components/settings/color-theme-picker.tsx`, `mode-toggle.tsx`). Root-mounted via `ColorThemeProvider`.
- [x] Baseline UX pass: compact/comfortable density toggle (built into `DataTable`, persisted per-table via `localStorage`); empty/loading/error states standardized on `EmptyState`/`ErrorState`/`TableSkeleton`/`PageSkeleton`; action-label-vs-toast-text audit (spot-checked across gamification/payouts, automations builder, and settings/integrations — no wording drift found, since toast text is business logic and was preserved verbatim throughout the migration); keyboard focus-visible audit found and fixed ~30 plain `<button>` elements across the app (drag handles, color/icon swatches, floating toolbars, tab strips, node-canvas controls) that were missing a visible focus ring — all now have `focus-visible:ring-2 focus-visible:ring-ring` (or an inverse-surface-appropriate ring color on dark floating pills).
- [ ] Full WCAG contrast audit of the 3 new color themes (Ocean/Sunset/Grape) — built with reasonable contrast by construction (white text on mid-tone accents, dark text on light containers) but not run through an automated contrast checker.
- [ ] Public-facing embedded form renderer (`public-form-renderer.tsx`) relies on the host page having no CSS reset conflicts when embedded cross-origin via `EmbedCodeDialog`'s snippet — not verified against a real third-party page.
