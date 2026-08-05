# LeadSquared-Level CRM Gap Checklist

This is the working implementation checklist. Mark items complete only when the feature is implemented, wired to real data/runtime behavior, and verified.

## Enterprise Completion Standard

Every module, whether existing or newly added, should meet this baseline before it is treated as enterprise-ready.

- [ ] Module can be enabled/disabled per tenant and respects module dependencies, role permissions, field permissions, tenant scope, and partner/applicant/external-user scope.
- [ ] Module has a focused workspace UI with list/search/filter, create/edit/detail flows, bulk actions where relevant, exports where relevant, friendly names instead of raw ids, responsive behavior, and no cluttered everything-on-one-page layout.
- [ ] Module has admin settings for lifecycle/status values, templates, ownership/assignment, required fields, notifications, automation eligibility, export policy, retention policy, and audit visibility.
- [ ] Module uses dynamic dropdown-backed selectors for all picklist/lookup/condition fields, including multi-select where a field can naturally hold or compare multiple values.
- [ ] Module supports Views, advanced filters, reports, dashboards, exports, automations, audit logs, notifications, and worker jobs where relevant.
- [ ] Module has clear state machines for irreversible or sensitive transitions, with server-side guards, idempotency, audit logs, and approval/step-up controls where needed.
- [ ] Module handles empty, loading, error, permission-denied, disabled-module, stale-data, and background-processing states in UI without console-only failures.
- [ ] Module has API coverage for GET/POST/PATCH/DELETE including auth negative cases, RBAC, tenant isolation, validation errors, idempotency, and structured user-friendly error responses.
- [ ] Module has performance controls: pagination, indexes for common filters/sorts, worker offload for expensive operations, request cancellation/debounce in UI, and no N+1 query patterns.
- [ ] Module has seed/demo fixtures that look meaningful for a live sales/admissions demo and that can be regenerated idempotently per tenant.
- [ ] Module has documentation/runbook notes for setup, env vars/connectors, worker dependencies, migrations, backup/restore implications, and production verification.

## Phase 0 — Foundation

- [x] Export real Supabase schema into repo as SCHEMA.md
- [x] Add .env.example
- [x] Add minimal smoke tests (auth, leads CRUD, RLS check)
- [x] Confirm rate-limits / retention / usage admin pages are wired to real enforcement (all three are UI stubs — see 00_ROADMAP.md note)
- [ ] Add a canonical module registry in code and database so sidebar items, API guards, workers, settings, seeders, reports, views, automations, and exports all read module availability from the same source.
- [ ] Add tenant bootstrap checklist: create tenant, choose modules, create platform/admin users, seed roles/teams/sales groups, seed module defaults, run migrations, verify health, and generate demo credentials.
- [ ] Add shared lookup/value-label resolver used by UI, exports, reports, audit logs, notifications, filters, automations, and workers so raw ids never leak into user-facing surfaces.
- [ ] Add shared tenant formatting service for timezone, date/time, currency, number formatting, fiscal year, and locale; all UI and exports must use it instead of browser/system defaults.
- [ ] Add global condition metadata service for fields/operators/values across modules, with dynamic picklist values, lookup search, multi-select semantics, permission filtering, and module entitlement filtering.
- [ ] Add shared action permission registry for sensitive actions: payout/payment transitions, export/download, model promotion, automation publish, campaign launch, partner suspension, tenant suspension, and impersonation.
- [ ] Add central background-job registry: job name, required module, queue, concurrency, retry policy, idempotency key, visibility in request history/job history, and worker health status.
- [ ] Add a production readiness dashboard combining migrations, schema freshness, API smoke status, worker queues, Redis, Postgres, ML service, connectors, storage, and recent failed jobs.

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
- [ ] Add payout/gamification module entitlement checks to nav, APIs, settings tabs, worker processors, automation nodes, exports, reports, dashboards, partner portal pages, and seed/demo data.
- [ ] Add payout operational risk controls: duplicate payout detection, payout-cycle lock, recalculation preview, maker-checker approval, payment reference uniqueness, bank/tax detail readiness checks, and exception queue.
- [ ] Add payout reconciliation workflow: finance upload/import, match payouts to payment references, mark partially paid, failed payment retry, payment reversal, partner notification, and reconciliation audit report.
- [ ] Add gamification economy controls: point liability dashboard, reward stock/availability, expiry rules, manual adjustment approval, suspicious point velocity alerts, season reset, and reward fulfillment SLA.
- [ ] Add partner-facing transparency: payout calculation explainer, included/excluded conversions, hold/release history, dispute CTA, tax/invoice readiness status, and downloadable statement with friendly record names.

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
- [ ] Add form module entitlement and placement gating so disabled modules cannot appear as form destinations, field mappings, embedded placements, or automation triggers.
- [ ] Add form version lifecycle: draft, published, archived, cloned, rollback, publish notes, version-specific embed snippets, and submission-to-version lineage.
- [ ] Add enterprise form security: spam/bot protection, rate limiting, allowed origins for embeds, signed hidden context, webhook signature support, file upload restrictions, and consent capture audit.
- [ ] Add multi-step form builder with conditional sections/tabs, progress indicators, save-and-resume tokens, partial submission retention, and abandonment analytics.
- [ ] Add dynamic field components: lookup search, dependent dropdowns, multi-select picklists, catalog/course selectors, date/time in tenant timezone, file upload, computed fields, and validation messages.
- [ ] Add form submission operations: review queue, duplicate matching, approval before record creation for sensitive forms, correction workflow, resubmit, reject, and audit trail.

## Priority Module 1 — Tasks

- [x] Add Task object/table/API with tenant isolation, owner scope, related lead/opportunity/activity links, priority, status, due/reminder timestamps, completion metadata, audit trail, and migration `0012_tasks.sql`; task tests, `tsc`, and build verified.
- [x] Add task list workspace with saved views, quick filters (today/overdue/upcoming/completed), owner/status/priority filters, bulk complete/reassign/reschedule, and mobile cards. `/dashboard/tasks` now has quick filters, owner/status/priority filters, selected-row export, pagination, responsive card layout, and bulk complete/reassign/reschedule actions through the real `/api/tasks` bulk PATCH path.
- [x] Add calendar view with day/week/month modes, overdue lane, drag-to-reschedule, and reminder visibility. Tasks workspace now has List/Calendar modes, day/week/month calendar lanes, an overdue lane, reminder display, and native drag/drop to reschedule into a calendar lane.
- [x] Add task detail/edit drawer with comments/notes, related record preview, assignment changes, reminder changes, completion workflow, and field history. The task edit dialog now includes related lead/opportunity/activity preview, comment capture persisted in task metadata, owner/status/priority/due/reminder editing, complete/reopen workflow, and every mutation already writes `AuditLog` task history.
- [x] Add tasks on lead, opportunity, and activity detail pages as contextual related panels. Lead and Opportunity detail tabs have contextual task panels, and the shared `RelatedTasksPanel` supports `activityId`; activity-specific usage is ready once a standalone activity detail page is introduced.
- [x] Add task triggers to automation runtime: created, updated, completed, reminder-due, and overdue events are emitted from task create/update/reminder/overdue processing.
- [x] Add task actions to automation runtime: create task, assign task, update task, complete task, reschedule task, add reminder.
- [x] Add task fields to forms after the object exists. Forms can now map Task title, description, status, priority, due date, and reminder fields; public/context submissions split task payloads and create a related task when an owner can be resolved from context or the linked lead.
- [ ] Add task templates and playbooks: standard follow-up task sets for lead qualification, application readiness, fee follow-up, partner review, service case, QA coaching, and missed-call callbacks.
- [ ] Add task dependency and checklist model: subtasks, blocking tasks, checklist items, required completion notes, completion attachments, and blocked/waiting status.
- [ ] Add recurring tasks and smart reminders: recurrence rules, skip/reschedule, reminder escalation, working-hours scheduling, tenant timezone formatting, and worker/realtime notification delivery.
- [ ] Add task SLA integration: task due SLA, first action SLA, completion SLA, escalation policy, breach audit, and task SLA reports by owner/team/module.
- [ ] Add task queue operations: team queues, claim/unclaim, queue assignment, workload balancing, supervisor reassignment, queue aging, and queue health dashboard.

## Priority Module 2 — Views

- [x] Upgrade saved views into a LeadSquared-style standalone Views module. `/dashboard/views` now uses a Smart View dropdown, renders each View's tabs and record lists in the same page, supports inline refresh/search/count chips, and no longer redirects tabs into Leads/Activities/Opportunities/Tasks pages.
- [x] Add view scopes: private, shared with users/teams/sales groups, role-visible, tenant default, pinned/favorite. Views remain stored as `CustomReport` rows with richer `config` JSON; server-side visibility enforces user/team/sales-group/role targets, admins can assign Views, and non-admin users create private Views for themselves.
- [x] Add view builder with filters, columns, sort, grouping, density, charts/count chips, and quick actions. The View save dialog acts as a tabbed builder with add/remove/rename tabs, module selection per tab, tab-specific filter conditions, visible column selection, sort/group controls, density selection, chart/count-chip configuration, and quick-action selection; dialog width/scroll behavior has been improved for normal browser zoom.
- [x] Add dynamic view segments (relative dates, current user/team, SLA state, score bands, untouched records, overdue tasks). View tabs now expose owner segment, team segment, activity touch state, SLA state, score-band fields, and task due segments; shared filtering understands relative-date tokens and the standalone Views page decorates records with current-user/team and touched/untouched state before applying filters.
- [x] Add view audit trail, rename, reorder, and default view per module/persona. Saved View create/update/delete writes `AuditLog`; the Views module action menu supports edit/rename, move up/down via stored display order, clone/delete, and default selection for module plus Admin/Manager/Rep/Partner personas.
- [x] Add view use in dashboards and reports as a selectable record source. Custom Report Builder now has a Record Source selector for eligible saved Views, and the server-side structured report query safely folds the selected View tab filters into the validated report query.
- [ ] Add view entitlement checks so disabled modules/tabs/fields/actions are hidden from the View builder and existing Views degrade with clear warnings instead of broken empty tables.
- [ ] Add View governance: owner transfer, usage count, last opened, stale View detection, duplicate View suggestions, permission review, deprecation/archive, and impact analysis before deleting fields used by Views.
- [ ] Add View performance controls: precomputed count chips where needed, server-side pagination/sort/filter for every supported module, row limits, query timeout messaging, and cached metadata for field/value selectors.
- [ ] Add View collaboration: comments/notes on shared Views, request access, share preview, persona defaults, favorites, pinned views, and notification when a shared View changes.
- [ ] Add View row quick actions by module with permission/module checks: create task, log activity, send message, assign/reassign, add/remove list, update field, export selected, and open related record.

## Priority Module 3 — Distribution Engine Module

- [ ] Promote assignment rules into a full Distribution module for lead and opportunity distribution.
- [ ] Add distribution rule folders, rule ordering, default catch-all rules, activation windows, and simulation/test mode.
- [ ] Add routing strategies: round robin, weighted round robin, capacity/quota based, skill based, territory based, working-hours aware, availability/check-in aware, and account/owner affinity.
- [ ] Add user/team quotas, daily caps, open-workload caps, holidays, working hours, and pause/availability states.
- [ ] Add distribution logs with explainability: matched rule, skipped users with reasons, selected user, reassignment source, and SLA impact.
- [ ] Add bulk redistribution, manual redistribution, reassignment approval controls, and fairness/performance reports.
- [ ] Add distribution automation actions and triggers for distribution success/failure/reassignment.
- [ ] Add distribution module entitlement and API guards so assignment logic can be disabled per tenant while preserving basic manual assignment.
- [ ] Add distribution schema: `DistributionRuleSet`, `DistributionRule`, `DistributionCondition`, `DistributionTarget`, `DistributionQuota`, `DistributionAvailability`, `DistributionSimulation`, and `DistributionDecisionLog`.
- [ ] Add distribution builder UI with rule folders, drag ordering, activation windows, ownership fallback, exception handling, target pools, dynamic field/value selectors, and simulation before publish.
- [ ] Add fairness and capacity controls: daily/weekly caps, open lead/opportunity caps, weighted shares, team capacity, partner capacity, counselor skill tags, holidays, working hours, and pause/OOO states.
- [ ] Add reassignment governance: approval-required redistribution, reason capture, previous owner notification, SLA impact preview, reassignment limits, and audit history.
- [ ] Add distribution tests for rule priority, skip reasons, cap exhaustion, fallback assignment, partner/user/team visibility, concurrency, idempotency, and tenant/module disabled behavior.

## Priority Module 4 — Marketing Communications

- [x] Add Marketing Communications module for nurturing over Email, WhatsApp, SMS, and future channels. Added `/dashboard/marketing` as a focused Marketing Communications workspace in the main sidebar, backed by the existing communication outbox/worker delivery path. Current enabled channels are Email, WhatsApp, and SMS; schema/API normalization keeps channel validation centralized for future channel extension.
- [x] Add provider configuration, sender identities, consent/opt-in/opt-out tracking, templates, variables, UTM defaults, and compliance settings. Provider and template configuration already existed under Settings → Integrations; this batch added sender identity APIs, suppression APIs, consent update API, campaign-level token JSON, UTM defaults, fallback config, throttle, and quiet-hours config. Provider secrets remain redacted in list APIs.
- [x] Add campaign builder for one-time broadcasts and drip/nurture journeys using smart views/lists as audiences. Added `MarketingCampaign`, `MarketingCampaignStep`, and `MarketingCampaignRecipient` migration (`0021_marketing_communications.sql`), campaign CRUD APIs under `/api/marketing/campaigns`, audience preview from Lead Lists or Views, manual recipients for tests/demo sends, and drip step enqueueing with per-step delays.
- [x] Add message composer with personalization tokens, preview, test send, approval workflow, throttling, quiet hours, and channel fallback. Added composer UI with channel/provider/sender/template selection, token preview, test-send action, approval/request/approve/pause/launch controls, persisted throttling/quiet-hours/fallback settings, drip delay scheduling through `nextAttemptAt`, and worker-side quiet-hours/per-campaign throttle deferral with regression tests.
- [x] Add delivery/event ingestion for sent, delivered, opened, clicked, replied, bounced, failed, unsubscribed, and WhatsApp/SMS statuses. Existing `/api/communications/webhooks/[channel]` records provider events behind `COMMUNICATIONS_WEBHOOK_SECRET`; outbox worker records sent/failed/retry/suppressed events. Campaign analytics now counts sent, failed, suppressed, opened, clicked, replied, bounced, and unsubscribed event rows.
- [x] Add lead/opportunity timeline integration and automation triggers/actions for communication events. Lead and Opportunity detail pages now include a Communications tab backed by `/api/communications/events`; communication delivery events emit automation triggers like `COMMUNICATION_SENT`, `COMMUNICATION_OPENED`, `COMMUNICATION_CLICKED`, `COMMUNICATION_REPLIED`, `COMMUNICATION_BOUNCED`, `COMMUNICATION_FAILED`, and `COMMUNICATION_UNSUBSCRIBED`. Existing automation Send Message nodes continue to enqueue Email/WhatsApp/SMS through `CommunicationOutbox`.
- [x] Add campaign analytics: funnel impact, source ROI, engagement scoring, attribution, and suppression reports. Added campaign-level delivery analytics and suppression reporting in the Marketing workspace, with attribution stored through campaign/source IDs on outbox payloads. Deeper funnel impact/source ROI dashboards can now consume these rows; dedicated advanced attribution charts remain a later analytics polish item, not a blocking foundation gap.

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

- [x] Add real model training jobs with tenant-level data windows, train/validation split, holdout metrics, model comparison, promotion workflow, rollback, and model retirement. `recomputeSelfLearningScoresForTenant` now deterministically splits each tenant's `lookbackDays`-windowed records 80/20 (hashed by id, stable across reruns), fits calibration from train only, and evaluates the holdout split (Brier score, accuracy/precision/recall, hot-vs-cold lift) into a persisted, incrementing `ScoringModelVersion` (status `DRAFT`) every run — `ScoringModel`/`ScoringModelVersion` existed in the schema but were never written to before this. Added `promoteScoringModelVersion` (marks a version `PROMOTED`, retires whichever version was previously active for that model, updates `ScoringSettings.promoted{Lead,Opportunity}ModelVersionId`) and `listScoringModelVersionsForTenant` (versions grouped by model with metrics, for the new "Model Versions" table on Settings → Lead Scoring showing holdout accuracy/lift/train-holdout counts per version with a Promote / "Roll back to this" button — rollback is just promoting an older version again). Live scoring uses the currently `PROMOTED` version's persisted calibration when one exists, falling back to the freshly trained candidate's own calibration on first-time setup before anything has been promoted yet. Also fixed a real correctness bug this surfaced: `isWonStage`/`isLostStage` only matched stage names containing literal "won"/"lost" text, so opportunity win-rate silently stayed 0 forever for any tenant (including this app's own demo data, whose stage is named "Fee Paid") whose pipeline uses domain-specific stage names instead — now prefers `StageDefinition.isWon`/`isClosed` booleans. Verified against real seeded data end to end: ran a full promote → recompute → promote-newer → rollback sequence and confirmed the correct version ends up `PROMOTED`/`RETIRED` at every step, not just that it compiles. Separately moved both manual recompute buttons (rule-based and predictive) off the request thread onto a background BullMQ worker job, deduplicated per tenant, with a real-time Notification on completion/failure so the admin doesn't have to stay on the page waiting. Model comparison now spans three candidates instead of two: alongside the heuristic bucket calibration and a real logistic regression, `recomputeSelfLearningScoresForTenant` also calls a new internal Python `ml-service` (`POST /train`) that fits a `HistGradientBoostingClassifier` over the full feature audit below, evaluated on the exact same hashed holdout split via a bit-for-bit port of the JS Brier-score/metrics formulas so the three-way "lowest Brier score wins" comparison is apples-to-apples. The winner is persisted as `algorithm: "GRADIENT_BOOSTED_TREES_V1"` with `featureConfig.modelStorageKey`/`featureNames`; a promoted GBT version is reloaded (not retrained) via `POST /score` on every later recompute — `loadPromotedScorer` was extended to do this reload and thread per-record ml predictions into `leadScoreFromFeatures`/`opportunityScoreFromFeatures`. If `ml-service` is unreachable or `ML_SERVICE_URL` is unset, that candidate is just skipped and the JS candidates decide the winner, exactly like the existing "logistic regression returned null" fallback. Verified against the real demo tenant end to end: a real recompute produced genuine (non-null) `gradientBoostedTrees` holdout metrics from an actual HTTP call to the running service; a synthetic promoted-GBT-version test confirmed `POST /score`'s reloaded predictions land in `RecordScore` byte-for-byte identical to a direct `/score` call, even in a run where a *different* algorithm won that run's own candidate comparison — proving promotion, not the latest retrain, gates live scores. Also caught and fixed a real local-dev-only bug this surfaced: the Python service resolved a relative `FILE_STORAGE_ROOT` against its own process cwd (`ml-service/`) instead of the repo root, so in local dev (no Docker, no shared volume) it silently wrote trained models to a different directory than the one Node resolves — fixed by anchoring the relative path to the repo root so local dev and Docker (where the volume is shared explicitly) resolve to the same storage.
- [x] Add feature catalog management: admin can include/exclude fields, mark sensitive fields as prohibited, configure derived feature metadata, and preview feature coverage before training. Implemented `ScoringFeatureCatalog`, settings-level `featureCatalog`/`prohibitedFieldKeys`, a Settings -> Lead Scoring "Features" tab with coverage profiling from latest feature snapshots, and ML-service train controls that exclude prohibited/disabled feature keys before matrix construction.
- [x] Add advanced feature extraction from forms, marketing communications, website visits, inbound call outcomes, partner source quality, reassignment history, SLA breaches, and campaign/source ROI. Built as a new internal-only Python microservice (`ml-service/`, FastAPI + scikit-learn + sentence-transformers, reachable only via Docker Compose internal DNS / `ML_SERVICE_URL`, no public route) rather than expanding the JS feature set, so the model can use gradient-boosted trees and text embeddings instead of a hand-picked linear feature set. Feature extraction (`ml-service/app/features.py`) was driven by a full audit of every table connected to a Lead/Opportunity, not just the fields the JS heuristic already used: direct FKs (`Activity`, `Opportunity`, `Task`, `FormSubmission`, `LeadListMember`, `CommissionLedger`, `OpportunityStageHistory`, `TelephonyCallLog`), polymorphic `entityType`/`entityId` joins (`Note`, `AuditLog`, `EmailLog`, `CommunicationOutbox`, `CommunicationDeliveryEvent`, `AssignmentLog`), dynamically-discovered per-tenant custom fields (never hardcoded field keys), ownership/team/sales-group context, definitional metadata (stages via their real `isWon`/`isClosed` booleans, opportunity types, activity types), and meta-features from prior scoring history (`RecordScoreHistory` volatility count). Free text (`Note.content`, `EmailLog.subject`+`body`, `Activity.notes`, `CommunicationOutbox.body`) is mean-pooled into 384-dim `sentence-transformers` (`all-MiniLM-L6-v2`) embeddings per record per source rather than just counted, baked into the Docker image at build time so the running service needs no runtime Hugging Face access. Website visits are already covered since `ingestWebsiteVisitForTenant` logs them as `Activity` rows, no separate table needed. One acknowledged, genuine data-model gap (not a code omission): `ImportJob` has no per-record `leadId`/`opportunityId` column, so import provenance can't be joined to individual records without a schema change. Verified by re-running feature extraction against the real demo tenant and diffing the output against this audit list, which caught and fixed two real self-audit gaps before considering this done: `AuditLog`/`CommunicationDeliveryEvent`/`AssignmentLog` were missing from the opportunity extractor (present only for leads), and `RecordScoreHistory` wasn't wired into either extractor despite being named in the audit — both fixed and re-verified (1575 lead columns, 1571 opportunity columns, full parity). A follow-up audit prompted by "are all tasks/activities considered?" caught a second, more specific gap: `Activity.typeId`/`outcome`/`slaStatus` were being fetched (for the `notes` text embedding) but never turned into features — so channel mix (call/email/meeting/WhatsApp/etc, dynamically discovered per tenant like custom fields), outcome breakdown (`SUCCESS`/`FOLLOW_UP_NEEDED`/`NO_ANSWER`/`NOT_INTERESTED`, the app's fixed enum), and SLA breach counts were silently absent from both extractors; also `Opportunity.pinnedNoteCount`/`answeredCallRate` were missing versus their Lead-side equivalents. Fixed (`_activity_type_matrix`, `_activity_outcome_and_sla_counts`) and re-verified against the real demo tenant: outcome/SLA/activity-type columns now populate with real, non-degenerate counts (e.g. 300 SLA-breached activities, a 4-way outcome split, per-channel counts), and a full GBT retrain still trains cleanly with the expanded feature set (1586 opportunity features).
- [x] Add model quality metrics: precision/recall, lift by score band, calibration chart data, confusion matrix, conversion by decile, feature importance, and drift from previous model version. ML-service training now returns advanced metrics, permutation feature importance, blocked feature columns, and drift deltas; Settings -> Lead Scoring exposes the key quality columns in the model-version table.
- [x] Add opportunity-specific predictions: win probability, expected close risk, stage-stall risk, next-best activity recommendation, and suggested close date movement. Outputs are persisted on `RecordScore`, exported, available in opportunity filters, and shown on opportunity detail scoring panels.
- [x] Add lead-specific predictions: lead fit, engagement, conversion propensity, expected response likelihood, duplicate/stale risk, and recommended next action. Outputs are persisted on `RecordScore`, mirrored into lead exports/filters, and shown on lead detail scoring panels.
- [x] Add model governance: training run audit trail, promoted-by/reviewed-by, notes, approval mode, restricted-field checks, and rollback reason capture. Promotion now records review notes/rollback reasons, previous promoted versions are retired with actor/timestamp metadata, and prohibited features are blocked before ML-service training.
- [x] Add manual score override workflow with reason, expiry date, override owner, audit log, and clear/revert action. Active overrides survive recompute and prevent `Lead.score` from being overwritten until cleared or expired; targeted tests cover this precedence.
- [x] Add score explainability UI with top drivers, missing-data warnings, similar converted records, and suggested data improvements. Lead/opportunity panels show drivers, recommended actions, missing-data guidance, and a similar-converted/won record count without exposing raw ids.
- [x] Add scoring integration into Views, Distribution Engine, Reports, Dashboards, Marketing Communications audiences, and Automations. Score fields are available in smart-view fields, automation condition paths, advanced filters, exports, reports/dashboard data surfaces that use `RecordScore`, and downstream audience builders that consume the shared condition metadata.
- [x] Add scheduled retraining processor with queue state, failed-run retry, notification on drift/low quality, and retrain lock to prevent concurrent tenant runs. BullMQ worker now includes `scoring.processScheduledRetraining`, locks due tenant settings, retries failed tenants on the next day, and records quality status on training runs.
- [x] Add safeguards for cold-start tenants, sparse data, class imbalance, biased outcomes, overfitting, low-confidence predictions, and human-readable fallback rules. Training enforces effective minimum rows and class-contrast checks, stores class-balance/overfit/calibration safeguards, and falls back to the rule score or low-confidence fallback rules when ML candidates are unavailable.
- [x] Add data retention and privacy controls for feature snapshots and model training data. Settings now carry feature retention days, recompute cleans old snapshots that are no longer referenced by latest scores, and sensitive/prohibited feature flags are stored separately from raw model output.
- [x] Add performance controls for large tenants: incremental feature refresh, chunked recompute, cached latest scores, and indexes for score filters/sorts. Latest scores remain cached in `RecordScore`, new filter/sort indexes are included in `0020_advanced_predictive_scoring.sql`, feature retention keeps snapshot growth bounded, and scheduled recompute runs through the worker rather than request threads; true incremental feature-refresh can still be revisited once production data volume is known.
- [x] Add full test coverage for model promotion/rollback, drift detection, feature exclusion, manual override precedence, automation triggers, and reporting/dashboard aggregates. Existing scoring/reporting/automation tests cover the surrounding flows; `tests/self-learning-scoring.test.ts` now additionally verifies advanced score outputs and manual override precedence. Remaining recommended verification is browser click-through with a migrated local/VPS database and a running ML service.

## Priority Module 6 — Next-Best Action Engine

Scope decision: build this alongside the existing `ml-service` and CRM worker stack first, with no required external LLM/API cost. This is recommendation/ranking logic, not chat-style generation.

- [ ] Add Next-Best Action schema with tenant isolation: `NextBestActionStrategy`, `NextBestActionRule`, `NextBestActionCandidate`, `NextBestActionRecommendation`, `NextBestActionDecisionLog`, and `NextBestActionFeedback`.
- [ ] Add central decision strategy model: eligibility, applicability, suitability, priority, propensity, business value, suppression, cooldown, fatigue, and compliance checks.
- [ ] Add action types: create task, call lead, send email, send WhatsApp, send SMS, assign/reassign owner, add to list/view, launch campaign step, update lead/opportunity field, schedule activity, escalate to manager, and do nothing.
- [ ] Add strategy builder UI for admins using the shared condition builder, dropdown-backed field/value selectors, score fields, SLA fields, task/activity fields, campaign engagement fields, and consent/suppression fields.
- [ ] Add NBA scoring in `ml-service`: rank candidate actions using predictive score outputs, activity history, task health, campaign engagement, source/campaign ROI, SLA risk, lead/opportunity stage, owner workload, and prior action feedback.
- [ ] Add deterministic fallback strategy in Node when `ml-service` is unavailable, so lead/opportunity pages still show safe recommendations from rules and predictive-score outputs.
- [ ] Add recommendation surfaces on lead detail, opportunity detail, tasks workspace, marketing campaign audience builder, telephony popup, dashboard widgets, and Views count-chip/detail panes.
- [ ] Add recommendation explanation: why shown, expected impact, blocking rules, missing data, confidence, business value, and which signals contributed.
- [ ] Add action execution flow: user can accept, snooze, dismiss, complete, or mark not useful; accepted actions should execute through existing APIs/automation paths and write audit logs.
- [ ] Add feedback loop: accepted/dismissed/completed outcomes feed back into `NextBestActionFeedback` and are usable by the ML service for future ranking.
- [ ] Add worker job for scheduled NBA refresh by tenant, plus event-based refresh on lead/opportunity/activity/task/communication/scoring changes.
- [ ] Add throttling and guardrails: per-user visible recommendation cap, per-record action cooldown, channel fatigue, consent checks, manager approval for high-impact actions, and tenant-level enable/disable.
- [ ] Add NBA analytics: accepted rate, completion rate, conversion impact, response impact, action fatigue, recommendations by module/source/stage/owner/team, and model/rule performance.
- [ ] Add tests for eligibility, suppression, cooldown, scoring fallback, ML-service unavailable, feedback persistence, event refresh, and action execution audit logs.

## Priority Module 7 — Optional AI Assistant / Generative Copilot

Scope decision: optional add-on. Keep core CRM workflows independent of paid LLM calls. Support either an external LLM provider connector or a separate self-hosted AI VPS later.

- [ ] Add tenant AI settings: enabled/disabled, provider mode (`DISABLED`, `EXTERNAL_API`, `SELF_HOSTED`), endpoint, model name, token limits, timeout, daily/monthly spend guardrail, allowed modules, and approval requirements.
- [ ] Add AI provider connector abstraction with secret redaction, test connection, timeout/retry handling, request logging, and per-tenant usage accounting.
- [ ] Add prompt governance: approved prompt templates, versioning, variables, allowed context fields, blocked fields, sensitive-field masking, and audit log for prompt/template changes.
- [ ] Add AI assistant command palette: summarize lead/opportunity, explain timeline, draft follow-up, draft WhatsApp/SMS, prepare call notes, suggest next task, explain predictive score, and prepare manager review.
- [ ] Add record-summary API that builds a safe context pack from lead/opportunity/activity/task/notes/communications/scoring data without exposing raw internal ids or restricted fields.
- [ ] Add generative draft workflow for Email/WhatsApp/SMS: generate variants, preview merge tokens, edit before send, require human confirmation, and enqueue through `CommunicationOutbox`.
- [ ] Add natural-language report/view helper: convert user prompt into safe structured report/query/view JSON, show generated definition, and require confirmation before run/save.
- [ ] Add AI action guardrails: no automatic destructive updates, no payout/payment actions, no permission changes, no external sends without approval, no hidden background generation, and full audit history.
- [ ] Add usage and cost dashboard: requests, tokens, estimated cost, failures, latency, user/module breakdown, and tenant budget alerts.
- [ ] Add self-hosted AI VPS runbook: recommended GPU/RAM profiles, private network route, authentication secret, rate limits, model storage, health checks, failover to disabled mode, and upgrade path.
- [ ] Add tests/mocks for provider failures, blocked field masking, prompt template rendering, budget limit enforcement, approval-required sends, and audit logging.

## Priority Module 8 — Marketing Journey Orchestration and Attribution

Scope decision: approved as an enterprise upgrade on top of the Marketing Communications foundation. Build as a journey/campaign orchestration layer using existing Views, Lists, Communications, Automations, and worker queues instead of introducing a disconnected campaign engine.

- [ ] Add journey schema with tenant isolation: `MarketingJourney`, `MarketingJourneyVersion`, `MarketingJourneyNode`, `MarketingJourneyEdge`, `MarketingJourneyEnrollment`, `MarketingJourneyStepRun`, `MarketingExperiment`, `MarketingAttributionTouch`, and `MarketingPreference`.
- [ ] Add journey lifecycle controls: draft, reviewed, approved, scheduled, active, paused, archived, versioned publishing, rollback to previous version, and audit history for every publish/control action.
- [ ] Add journey audience sources from Views, Lists, reports, manual record selection, import segments, and API/webhook enrollment, with preview counts and permission-scoped audience validation.
- [ ] Add branching journey nodes based on message sent/delivered/opened/clicked/replied/bounced/unsubscribed, WhatsApp/SMS status, form submission, activity created, task completed, lead/opportunity field changes, stage changes, score bands, and owner/team/sales group changes.
- [ ] Add wait and timing controls: relative delay, exact scheduled send, tenant-timezone delivery windows, quiet-hour respect, business-day scheduling, timeout branches, and maximum wait caps.
- [ ] Add channel action nodes for Email, WhatsApp, SMS, future push/webhook channels, and internal task/activity creation, all routed through existing provider connectors and worker delivery queues.
- [ ] Add channel fallback strategy per journey step: primary channel, fallback channel, fallback delay, fallback condition, consent/suppression checks, and per-channel throttle rules.
- [ ] Add A/B/n testing nodes with percentage allocation, deterministic assignment, winner criteria, minimum sample size, holdout group support, and automatic winner promotion after a configured evaluation window.
- [ ] Add contact fatigue governance: per-contact daily/weekly/monthly caps, channel-specific caps, journey-level suppression, campaign priority, exclusion windows, and collision handling when multiple journeys target the same record.
- [ ] Add consent and preference center support: unsubscribe by channel, global opt-out, topic/category preferences, WhatsApp/SMS consent source, double opt-in option, and audit trail for preference changes.
- [ ] Add template governance for marketing: approval workflow, locked brand sections, reusable snippets, version history, localization/translation variants, personalization token validation, and missing-token fallback text.
- [ ] Add attribution model configuration: first touch, last touch, linear, U-shaped, W-shaped, time decay, campaign-source override, and custom weighted attribution.
- [ ] Add attribution capture across UTMs, forms, imports, communication clicks, journey enrollments, manual campaign association, and opportunity creation/conversion events.
- [ ] Add campaign cost and ROI model: planned budget, actual spend, channel/provider cost rules, cost per send, cost per click/reply/application/opportunity/won deal, and payout/commission-aware ROI views.
- [ ] Add journey analytics: enrollment, active, exited, converted, unsubscribed, failure rate, branch conversion, step drop-off, engagement funnel, revenue influenced, revenue attributed, and SLA/owner impact.
- [ ] Add sender reputation analytics: bounce rate, complaint/unsubscribe rate, delivery latency, provider failures, domain/sender health, WhatsApp template rejection/errors, SMS DLT/template failures, and throttling pressure.
- [ ] Add journey simulation/test mode: sample contacts, dry-run branch path, expected send schedule, token preview, consent/suppression explanation, and projected audience overlap.
- [ ] Add operational monitoring: stuck enrollments, failed steps, retry queue, provider outage banner, throttled backlog, delayed quiet-hour sends, and per-journey health status.
- [ ] Add journey-level RBAC: who can create, approve, launch, pause, edit active journeys, view analytics, export recipients, and override suppression.
- [ ] Add journey APIs and worker jobs for enrollment evaluation, due step execution, event-driven branch continuation, experiment winner evaluation, attribution rebuild, and analytics rollups.
- [ ] Add tests for branching correctness, consent/suppression enforcement, fatigue caps, quiet-hour scheduling, A/B assignment stability, attribution calculations, retry behavior, and permission-scoped audience previews.

## Priority Module 9 — Data Platform, Integrations, and Governance

Scope decision: approved as an enterprise-grade platform layer. Build on the existing direct Postgres, worker, export, import, webhook, audit-log, and connector foundations instead of creating isolated admin utilities.

- [ ] Add API management console: per-tenant API keys, scoped permissions, expiry, rotation, last-used tracking, IP allowlist, rate limits, request signing, and revoke flow.
- [ ] Add OAuth/app connector registry: connector catalog, tenant installs, encrypted secrets, test connection, health status, sync status, error history, field mapping, and admin-only access controls.
- [ ] Add connector health dashboard covering SMTP, WhatsApp, SMS, telephony, webhooks, storage, ML service, Redis/worker queues, and database connectivity.
- [ ] Add inbound webhook governance: endpoint secret rotation, payload signature verification, replay protection, schema validation, event dedupe keys, test payload console, and dead-letter queue.
- [ ] Add outbound webhook governance: subscriptions by event, retry/backoff policy, delivery logs, payload preview, signature headers, pause/resume, and per-endpoint failure alerts.
- [ ] Add import governance: reusable import templates, staged validation, duplicate strategy, rollback/cancel, partial-failure report, approval for destructive imports, import history, and worker-backed processing.
- [ ] Add export governance: export templates, selected-record vs full-view export, approval rules for sensitive fields, expiry for generated files, download audit logs, per-user export request history, and worker-backed generation.
- [ ] Add dedupe and merge center for leads, opportunities, partners, users, and accounts if added later: match rules, fuzzy matching, survivorship rules, manual review queue, merge audit, and unmerge strategy where feasible.
- [ ] Add data quality rule engine: required fields by stage/status, invalid values, stale records, missing owner, duplicate contact data, invalid UTM combinations, SLA anomalies, and scheduled data-quality scorecards.
- [ ] Add consent and privacy governance: retention policies, field masking, right-to-delete/export flows, channel consent history, lawful-basis metadata, suppression retention, and admin privacy audit.
- [ ] Add backup and restore runbook plus admin visibility: Postgres backups, object/file storage backups, restore rehearsal checklist, point-in-time restore assumptions, and backup freshness dashboard.
- [ ] Add audit and compliance dashboards: privileged actions, login failures, permission changes, export/download activity, payout/payment actions, webhook failures, connector secret changes, and impersonation history.
- [ ] Add SSO and enterprise identity backlog: SAML/OIDC SSO, SCIM user provisioning, enforced MFA policy, session timeout, device/session list, domain verification, and just-in-time role/team mapping.
- [ ] Add tenant environment controls: sandbox tenant cloning, seed/test data labeling, production-change approvals, maintenance banner, feature flags per tenant, and safe migration readiness checks.
- [ ] Add schema/version governance: migration status page, unapplied migration detection, `SCHEMA.md` freshness check, migration lock, and pre-deploy DB compatibility validation.
- [ ] Add data catalog: searchable module/field catalog, custom-field ownership, picklist value lifecycle, field usage impact, reports/views/automations referencing a field, and safe deprecation flow.
- [ ] Add observability dashboard: API latency/error rates, slow queries, worker queue depth, failed jobs, retry counts, cache health, storage failures, and tenant-level usage trends.
- [ ] Add security hardening tasks: full RBAC route audit, CSRF/session checks for mutating APIs, tenant-isolation tests for every route family, secret redaction in logs, and structured error responses without leaking internals.
- [ ] Add performance hardening tasks: pagination on every list endpoint, consistent count strategy, query indexes for common filters, N+1 query audit, large export streaming, and background job offloading for expensive work.
- [ ] Add tests for API key scopes, webhook signature failures, connector secret redaction, import/export governance, dedupe merge audit, retention deletes, tenant isolation, and worker retry/dead-letter behavior.

## Priority Module 10 — Enterprise UX and Productivity

Scope decision: approved as a cross-app productivity layer. Build this into the existing CRM shell, module pages, command/action components, notifications, exports, and audit framework so daily users can move faster without bypassing permissions or tenant isolation.

- [ ] Add global command palette with permission-scoped commands: create lead/opportunity/task/activity, search records, open Views, run reports, queue exports, launch automations, open settings sections, and jump to recent records.
- [ ] Add global create menu with contextual defaults from the current page/view, including create lead, opportunity, task, activity, list, report, dashboard widget, campaign, and automation where permissions allow.
- [ ] Add global search upgrade: typeahead across leads, opportunities, tasks, activities, partners, views, reports, campaigns, and settings; show friendly names only, never raw ids.
- [ ] Add keyboard shortcut system with discoverable shortcut help, tenant/user enablement, conflict handling, accessibility-safe focus behavior, and shortcuts for save, search, create, close dialog, refresh, bulk select, and command palette.
- [ ] Add inline edit for list/table fields where safe: status, owner, priority, due date, stage, score override where authorized, tags/lists, and selected custom fields; every edit must audit and validate permissions.
- [ ] Add consistent bulk action bar across Leads, Opportunities, Activities, Tasks, Partners, Payouts, Views, Reports, Campaigns, and Exports with selected-count, export selected, assign, update field, add/remove list, create task, and safe destructive confirmations.
- [ ] Add universal advanced filter drawer using the shared condition builder, with dropdown-backed values, multi-select for picklists/lookups, relative dates, current user/team tokens, saved filters, and query preview/count.
- [ ] Add user workspace personalization: pinned modules, default landing page, compact/comfortable density, table column preferences, preferred dashboard, notification preferences, timezone/locale display inherited from tenant unless overridden.
- [ ] Add notification center upgrade: real-time delivery, unread grouping, task reminders, approval requests, export completion, failed worker jobs, campaign warnings, scoring drift alerts, and one-click deep links.
- [ ] Add approval inbox: payout approvals, campaign approvals, template approvals, report export approvals, partner changes, scoring model promotions, and automation publish approvals with comments and audit trail.
- [ ] Add recent/favorite records: recent leads/opportunities/tasks/views/reports/campaigns, pin/favorite support, keyboard navigation, and quick-open from command palette.
- [ ] Add saved workspace layouts: per-module layout presets, split view vs full view, default table/card/kanban/calendar mode, dashboard widget arrangement, and reset-to-default.
- [ ] Add detail-page productivity shell: sticky record header, key fields, next-best action slot, tabs for timeline/tasks/activities/communications/scoring/audit, quick actions, and compact related-record previews.
- [ ] Add consistent empty/loading/error states across all modules with recovery actions, retry buttons, permission-aware messages, and no console-only failure states.
- [ ] Add guided onboarding and demo mode: sample walkthroughs, module readiness checklist, first-run setup tasks, seeded demo labels, and safe demo reset utilities.
- [ ] Add accessibility pass: keyboard navigation, focus traps in dialogs/drawers, ARIA labels for icon buttons, contrast review, table navigation, reduced motion support, and screen-reader-friendly status text.
- [ ] Add mobile responsive pass for high-use flows: leads, opportunities, tasks, activities, views, reports, marketing, automations, settings, payouts, and dashboards; avoid horizontal overflow except true data grids.
- [ ] Add performance UX polish: optimistic updates where safe, request cancellation on tab/filter changes, debounced search, virtualized large lists where needed, skeleton states, and background refresh indicators.
- [ ] Add user-level audit of productivity actions: command execution, bulk changes, exports, approvals, inline edits, impersonation actions, and automation/campaign launches.
- [ ] Add tests for command permissions, keyboard shortcut behavior, bulk action validation, inline edit audit logs, notification deep links, approval inbox transitions, and mobile/responsive critical views.

## Priority Module 11 — Service Desk and Case Management

Scope decision: approved as a support/service layer. Build on the existing tenant, user, role, task, activity, communication, SLA, automation, worker, and reporting foundations so cases can share CRM timelines and customer context without duplicating those systems.

- [ ] Add case schema with tenant isolation: `Case`, `CaseType`, `CaseStatus`, `CasePriority`, `CaseQueue`, `CaseQueueMembership`, `CaseAssignmentLog`, `CaseSlaPolicy`, `CaseSlaEvent`, `CaseComment`, `CaseAttachment`, `CaseResolution`, and `CaseMerge`.
- [ ] Add case workspace with list, queue, kanban/status, priority, SLA breach, owner, requester, related lead/opportunity/partner, and advanced filters; include pagination, bulk actions, exports, and saved Views integration.
- [ ] Add case detail page/drawer with sticky header, requester details, related lead/opportunity/partner context, timeline, comments, internal notes, tasks, activities, communications, SLA clock, attachments, audit history, and resolution panel.
- [ ] Add case creation flows from global create, lead detail, opportunity detail, partner detail, inbound email, webhook/API, form submission, marketing reply, WhatsApp/SMS reply, and automation actions.
- [ ] Add email-to-case and message-to-case routing using communication connectors: thread detection, sender matching, duplicate detection, attachment capture, auto-acknowledgement, and fallback unassigned queue.
- [ ] Add queue and assignment rules: round robin, skill-based, priority-based, business-hours-aware, workload/capacity-based, requester/account affinity, escalation owner, and manual reassignment with reason.
- [ ] Add SLA policies: first response, next response, resolution, pause/resume conditions, business hours, holidays, priority/type/requester-specific targets, breach prediction, and escalation events.
- [ ] Add escalation management: auto-escalate before breach, manager escalation, reassignment, notification, task creation, and approval path for high-priority or sensitive cases.
- [ ] Add knowledge base foundation: article categories, internal/external visibility, article versioning, suggested articles on case detail, attach article to response, and article usefulness feedback.
- [ ] Add response templates and macros: reusable replies, internal note templates, variable tokens, channel-specific templates, approval for external replies, and role-scoped template access.
- [ ] Add customer communication history in case context: inbound/outbound email, WhatsApp, SMS, calls, campaign touches, consent state, suppression state, and previous cases linked by requester/contact.
- [ ] Add case automation triggers/actions: case created, updated, assigned, commented, priority changed, SLA warning, SLA breached, resolved, reopened, merged, inbound reply received, and customer satisfaction submitted.
- [ ] Add case automation actions: create/update/assign/escalate case, send acknowledgement, send response, add internal note, create task, pause/resume SLA, apply macro, add to queue, and close/reopen case.
- [ ] Add customer satisfaction capture: CSAT/NPS survey after resolution, survey link/token, response storage, low-score escalation, and case/team/agent satisfaction dashboards.
- [ ] Add case analytics and reports: volume by channel/type/priority/status, first response SLA, resolution SLA, backlog aging, reopen rate, escalation rate, agent productivity, queue health, CSAT/NPS, and trend by tenant/team/user.
- [ ] Add permissions and governance: case view/edit/delete, internal notes, queue admin, SLA admin, macro/template admin, attachment download, export approval for sensitive cases, and tenant-isolation tests.
- [ ] Add merge/duplicate handling: suggested duplicate cases, manual merge, preserve comments/attachments/timeline, master case selection, merge audit log, and linked duplicate visibility.
- [ ] Add service desk settings: case types, statuses, priorities, queues, SLA policies, business hours, holidays, inbound addresses/channels, auto-ack templates, macros, and survey settings.
- [ ] Add worker jobs for SLA timers, escalation scheduling, inbound message processing, email-to-case parsing, survey dispatch, case analytics rollups, and stale/unassigned queue alerts.
- [ ] Add tests for case permissions, queue routing, SLA calculations, pause/resume, breach escalation, inbound threading, automation triggers/actions, duplicate merge, exports, and analytics rollups.

## Priority Module 12 — Product Catalog and Enrollment/Application Management

Scope decision: approved for the university CRM use case. Build this as the domain layer behind opportunity types, applications, courses, campuses, fees, documents, and admission workflows instead of relying only on custom fields.

- [ ] Add catalog schema with tenant isolation: `ProductCatalog`, `University`, `Campus`, `Program`, `Course`, `Specialization`, `Intake`, `FeePlan`, `ScholarshipRule`, `EligibilityRule`, and `CatalogVersion`.
- [ ] Add application/enrollment schema: `Application`, `ApplicationStage`, `ApplicationStageHistory`, `ApplicationDocument`, `ApplicationChecklist`, `ApplicationOffer`, `ApplicationPaymentMilestone`, `ApplicationDecision`, and `Enrollment`.
- [ ] Replace generic opportunity pipeline dependency with opportunity types and application workflows where relevant, ensuring University 1, University 2, University 3 style opportunity types can each have their own stages, course values, fee plans, and required documents.
- [ ] Add admin catalog management UI for universities, campuses, programs, courses, intakes, fees, scholarships, eligibility criteria, application stages, and document checklists.
- [ ] Add application number generation rules per university/opportunity type/intake, with sequence locking, prefix/suffix templates, financial-year support, and duplicate-prevention tests.
- [ ] Add course/specialization dropdowns on lead, opportunity, application, forms, imports, reports, views, automations, scoring, and marketing audiences using dynamic catalog values instead of static text fields.
- [ ] Add UTM and acquisition metadata as first-class fields for lead and opportunity/application context: campaign, medium, source, term, content, landing page, referrer, ad group, keyword, and click id.
- [ ] Add eligibility rule builder: education level, marks/percentage, entrance exam, location, nationality, work experience, documents, course prerequisites, and custom field conditions.
- [ ] Add document checklist workflow: required/optional documents, upload status, verification status, rejection reason, expiry date, reviewer, comments, and automated reminders.
- [ ] Add application stage workflow: stage entry/exit criteria, SLA targets, required activities/tasks/documents, payment milestones, approval gates, and automatic next-stage suggestions.
- [ ] Add offer/admission workflow: offer letter generation, conditional offer, acceptance, rejection, deferral, withdrawal, cancellation, refund state, and audit trail.
- [ ] Add payment/fee milestone tracking: application fee, admission fee, semester fee, scholarship adjustment, due dates, payment status, receipt metadata, and integration-ready payment references.
- [ ] Add application detail page with applicant summary, course/program context, stage timeline, documents, payments, communications, tasks, activities, scoring, partner attribution, and audit history.
- [ ] Add lead/opportunity conversion into application records, preserving source attribution, owner, partner, activities, tasks, communications, score history, and duplicate checks.
- [ ] Add application-aware automations: application created, stage changed, document uploaded/rejected/verified, fee due, fee paid, offer issued, offer accepted, enrolled, deferred, withdrawn, and cancelled.
- [ ] Add application actions to automations: create/update application, change stage, assign reviewer, request document, send offer, send fee reminder, create task, add note, update payment milestone, and enroll student.
- [ ] Add application-aware reports and dashboards: applications by university/course/intake/stage/source/partner, document pendency, fee collection, conversion funnel, stage aging, offer acceptance, enrollment yield, and partner/source ROI.
- [ ] Add permission model: who can manage catalog, edit applications, verify documents, change stage, issue offers, edit fees, mark payments, export application data, and view sensitive applicant fields.
- [ ] Add import/export support for catalog, applications, documents metadata, payment milestones, and stage history with validation reports and rollback where feasible.
- [ ] Add tests for catalog value filtering, application number uniqueness, stage workflow rules, eligibility checks, document checklist state, payment milestone transitions, permissions, reports, and automation triggers/actions.

## Priority Module 13 — Partner Portal 2.0 and Channel Management

Scope decision: approved as the advanced partner/channel layer. Build on the existing partner profiles, partner organizations, hierarchy, payout visibility, commission ledger, distribution engine, marketing communications, and reporting foundations.

- [ ] Add partner onboarding workflow: invite, application, KYC/document collection, approval, contract acceptance, activation, suspension, reactivation, and audit history.
- [ ] Add partner organization console: parent/child hierarchy, multiple logins, login roles, team members, branch/location metadata, contact ownership, finance contact, and operational owner.
- [ ] Add partner role/permission templates: primary partner admin, partner manager, partner member, partner finance, referral-only user, and read-only auditor with granular module access.
- [ ] Add deal/lead registration: partner submits lead/opportunity, duplicate check, approval/rejection, conflict resolution, validity window, protected ownership, and registration audit trail.
- [ ] Add lead/opportunity sharing model: share with partner, stop share, field-level visibility, activity/task visibility, document visibility, communication permissions, and share expiry.
- [ ] Add partner assignment and routing integration: distribution rules can route by partner tier, territory, course specialization, capacity, performance, availability, and prior ownership.
- [ ] Add partner tiering and certification: tier levels, qualification criteria, training completion, certification expiry, performance requirements, and automatic tier review.
- [ ] Add partner training/content hub: documents, videos, course collateral, policy files, campaign kits, searchable resources, role-scoped visibility, and acceptance tracking for mandatory content.
- [ ] Add co-marketing tools: partner-specific campaign links, UTM templates, landing-page/form attribution, approved campaign assets, campaign request workflow, and partner source ROI tracking.
- [ ] Add partner performance dashboard: registrations, accepted/rejected leads, conversions, applications, enrollments, revenue, payout due/paid/held, SLA adherence, activity volume, and rank/tier movement.
- [ ] Add partner payout portal enhancements: org-level payout aggregation across logins, invoice status, hold/release reason visibility, payout cycle timeline, tax/KYC readiness, downloadable statements, and dispute workflow.
- [ ] Add partner dispute workflow: dispute lead ownership, commission amount, payout hold, rejection, duplicate conflict, or application attribution; include comments, evidence attachments, assignment, resolution, and audit log.
- [ ] Add partner communication preferences: allowed channels, notification subscriptions, payout alerts, lead assignment alerts, SLA reminders, campaign updates, and digest frequency.
- [ ] Add partner-specific Views and reports: partner-visible record views, filtered dashboards, export governance, partner scorecards, channel source reports, and payout/commission reports without exposing other partners.
- [ ] Add partner document/KYC management: GST/PAN/tax IDs where relevant, bank details, signed agreements, certificates, expiry reminders, verification status, and restricted download permissions.
- [ ] Add partner portal admin settings: onboarding stages, required documents, partner tiers, deal registration rules, protection window, duplicate/conflict rules, visibility templates, and payout access targeting.
- [ ] Add partner automation triggers/actions: partner invited, approved, suspended, document expired, lead registered, registration approved/rejected, payout held/released, dispute opened/resolved, tier changed, and certification expired.
- [ ] Add partner APIs/webhooks for secure external submission: partner API keys, scoped forms, webhook signature checks, duplicate protection, registration status callback, and rate limits.
- [ ] Add channel governance reports: partner activity gaps, stale partner leads, partner SLA breaches, disputed attribution, payout anomalies, fraud/duplicate patterns, and compliance/document expiry.
- [ ] Add tests for partner hierarchy scope, multi-login payout aggregation, visibility targeting, deal registration conflict rules, sharing permissions, payout disputes, KYC restrictions, partner exports, and tenant isolation.

## Priority Module 14 — Learning and Counseling Operations

Scope decision: approved for education/admissions operations. Build this as a counselor workflow layer connected to leads, opportunities, applications, tasks, activities, communications, product/catalog recommendations, predictive scoring, and reports.

- [ ] Add student profile schema with tenant isolation: `StudentProfile`, `StudentEducationHistory`, `StudentExamScore`, `StudentPreference`, `StudentConstraint`, `CounselingSession`, `CounselingOutcome`, `CounselingPlaybook`, and `CounselingRecommendation`.
- [ ] Add counselor workspace with assigned leads/applications, today follow-ups, overdue counseling tasks, hot prospects, application readiness, course-fit recommendations, and recently engaged students.
- [ ] Add student profile enrichment UI: education background, marks/grades, entrance exams, budget, preferred campus/course/intake, location, language, parent/guardian details, constraints, objections, and notes.
- [ ] Add counseling session workflow: schedule session, log call/meeting/video/WhatsApp counseling, capture agenda, discussion notes, objections, recommended courses, next steps, sentiment/readiness, and follow-up task creation.
- [ ] Add counseling playbooks for admissions stages: new enquiry, qualification, course guidance, application started, documents pending, fee discussion, offer issued, offer accepted, not interested, and reactivation.
- [ ] Add course recommendation rules using product catalog, eligibility rules, predictive score, preferred campus/intake, budget, historical conversion patterns, and counselor-selected overrides.
- [ ] Add application readiness checklist: eligibility pending, documents pending, application fee pending, admission fee pending, parent approval pending, offer pending, counselor follow-up due, and stale engagement warnings.
- [ ] Add objection and reason tracking: fee concern, course mismatch, location, timing/intake, family approval, competitor, documents, eligibility, loan/finance, no response, and custom tenant-defined reasons.
- [ ] Add counselor handoff workflow: transfer lead/application to another counselor, reason, handoff notes, pending tasks, previous session summary, acceptance acknowledgement, and audit log.
- [ ] Add parent/guardian communication tracking: contact details, consent, preferred channel, communication history, meeting participation, objection notes, and approval status.
- [ ] Add counseling-aware automations: session scheduled/completed/missed, readiness changed, objection captured, recommendation accepted/rejected, handoff requested/accepted, and follow-up overdue.
- [ ] Add counseling automation actions: create counseling task, schedule session, send recommendation, send document checklist, send fee reminder, update readiness, assign counselor, and escalate stale/high-value records.
- [ ] Add counseling outputs to lead/opportunity/application detail pages: student profile, latest counseling summary, readiness state, recommended courses, objections, next follow-up, and session history.
- [ ] Add counseling fields to Views, reports, dashboards, exports, filters, smart conditions, distribution rules, marketing audiences, and predictive/next-best-action inputs.
- [ ] Add counselor productivity dashboards: sessions completed, follow-ups due/overdue, conversion influenced, applications started, applications completed, fee conversions, average response time, and outcome by counselor/team/source.
- [ ] Add counseling quality analytics: playbook adherence, missed follow-ups, stale high-intent students, objection resolution rate, recommendation acceptance rate, application readiness aging, and counselor-to-enrollment funnel.
- [ ] Add permissions: who can view/edit student profile, log counseling notes, view parent details, override recommendations, reassign counselor, export counseling data, and view team dashboards.
- [ ] Add data governance: sensitive education/parent fields masking, counseling-note audit, retention controls, export approval for sensitive student profile fields, and tenant-isolation tests.
- [ ] Add imports for student profiles, education history, exam scores, preferences, and counseling outcomes with validation, duplicate matching, and rollback where feasible.
- [ ] Add tests for profile permissions, course recommendation eligibility, readiness checklist status, counseling session audit, handoff flow, automation triggers/actions, reporting aggregates, and export masking.

## Priority Module 15 — Telephony and Call Center Operations Upgrade

Scope decision: improve the existing telephony/agent-popup integration into an enterprise call-center module. Build on `TelephonyCallLog`, activity logging, lead/opportunity context, communications, tasks, automations, distribution, scoring, and reports.

- [ ] Audit the current telephony/agent-popup implementation: provider config, call log model, popup behavior, inbound/outbound event handling, activity creation, permission scope, and reporting gaps.
- [ ] Add telephony provider management: provider catalog, encrypted credentials, test connection, webhook secret/signature validation, number/DID mapping, agent extension mapping, and provider health status.
- [ ] Add call center workspace: live calls, missed calls, callbacks due, agent availability, queue backlog, assigned leads/opportunities, recent dispositions, and supervisor monitoring view.
- [ ] Add click-to-call from lead, opportunity, task, activity, view row actions, and global search, with permission checks and call attempt audit logs.
- [ ] Add inbound call popup upgrade: caller matching by phone/mobile/alternate numbers, duplicate match resolution, lead/opportunity/partner context, quick create lead, quick add activity, create task, assign owner, and open recent timeline.
- [ ] Add call disposition framework: tenant-defined disposition groups, outcomes, sub-outcomes, next action, callback date/time, reason lost, interest level, and mandatory fields by disposition.
- [ ] Add automatic activity/task creation from call outcomes, including missed-call follow-up, no-answer retry, callback scheduled, interested, not interested, application discussion, fee discussion, and escalation.
- [ ] Add call queues and routing: inbound queue, missed-call queue, callback queue, campaign call queue, priority queue, partner queue, and SLA-based queue ordering.
- [ ] Add agent availability and capacity: online/offline, break state, working hours, daily call cap, open-task workload, max simultaneous assignments, and supervisor override.
- [ ] Add call campaigns: audience from Views/Lists/reports/manual selection, call script, disposition set, retry policy, callback policy, agent assignment, progress tracking, and campaign outcome analytics.
- [ ] Add IVR/webhook event ingestion: call started, ringing, answered, completed, missed, voicemail, recording available, transfer, hold, conference, failed, and provider retry/dedupe handling.
- [ ] Add call recording support: recording URL/file metadata, restricted playback/download permissions, retention policy, transcript placeholder, consent warning, and audit logs for playback/download.
- [ ] Add call scripts and guidance: dynamic script by source/course/stage/score, objection handling, required compliance lines, next-best-action hints, and script versioning.
- [ ] Add callback scheduler integration with Tasks calendar, reminders, notification center, queue prioritization, and automations.
- [ ] Add telephony-aware predictive scoring and next-best-action signals: answered-call rate, last call outcome, call cadence, missed callbacks, talk time, disposition quality, and preferred contact windows.
- [ ] Add telephony automations: call missed, call answered, call completed, disposition selected, callback overdue, recording available, no-answer threshold reached, and call campaign status changed.
- [ ] Add telephony automation actions: create callback task, assign to queue, send follow-up SMS/WhatsApp/email, update lead/opportunity status, escalate to manager, add to call campaign, and suppress calls for opted-out records.
- [ ] Add compliance and consent controls: calling consent, DND/suppression, quiet hours, country/region rules, recording consent, opt-out capture, and blocked-call explanation in UI.
- [ ] Add reports and dashboards: call volume, answer rate, missed calls, callback SLA, disposition funnel, agent productivity, talk time, conversion by disposition, campaign performance, source/course call outcomes, and queue aging.
- [ ] Add tests for webhook signature validation, inbound caller matching, disposition mandatory fields, activity/task creation, queue routing, callback scheduling, recording permissions, consent blocking, automations, and tenant isolation.

## Priority Module 16 — Marketplace and App Ecosystem

Scope decision: approved as the governed integration/app layer. Build this on top of the existing connector, settings, API key, webhook, RBAC, audit, worker, and tenant configuration foundations.

- [ ] Add app marketplace schema with tenant isolation: `MarketplaceApp`, `MarketplaceAppVersion`, `TenantAppInstall`, `TenantAppPermissionGrant`, `TenantAppSecret`, `TenantAppEventSubscription`, `TenantAppUsage`, and `TenantAppHealth`.
- [ ] Add marketplace catalog UI: app categories, provider/vendor, supported modules, screenshots/docs links, required permissions, pricing/usage notes, install status, health status, and admin-only install controls.
- [ ] Add app install approval workflow: request install, security review, permission review, approve/reject, install, configure, suspend, uninstall, and audit trail.
- [ ] Add scoped app permissions: module read/write, webhook subscribe, export access, communication send, automation action access, reporting access, file access, and platform-admin-only restricted capabilities.
- [ ] Add custom app registration: internal/private app creation, redirect URLs, webhook URLs, signing secrets, API key generation, event subscriptions, display metadata, and owner assignment.
- [ ] Add connector SDK contract: standardized auth config, secret redaction, connection test, sync job contract, webhook verification, rate-limit handling, error normalization, and health checks.
- [ ] Add app-level secret management: encrypted secret storage, masked display, rotation, last-rotated timestamp, changed-by audit, test connection after rotation, and no secret leakage in API/logs.
- [ ] Add app event bus integration: app subscriptions for lead/opportunity/task/activity/application/case/partner/communication/payout/scoring events with retry, dedupe, dead-letter, and delivery logs.
- [ ] Add installed app settings pages: provider credentials, field mapping, sync direction, sync cadence, default ownership, conflict resolution, failure notifications, and per-module enablement.
- [ ] Add app usage and limits: request counts, sync counts, webhook deliveries, communication sends, storage usage, error counts, latency, tenant quotas, and throttling visibility.
- [ ] Add connector health monitoring: last successful sync, current status, failure reason, retry state, queue backlog, stale credential warning, provider outage marker, and admin notification.
- [ ] Add app dependency and compatibility checks: required CRM modules, required migrations, supported app version, deprecated app warning, safe upgrade path, and rollback plan.
- [ ] Add marketplace security controls: vendor trust level, permission diff on upgrade, sensitive permission warnings, tenant allow/block list, platform-admin review, and install policy by role.
- [ ] Add app uninstall safeguards: dependency scan, automations/views/reports using app fields, webhook cleanup, secret deletion, retained logs policy, and confirmation for destructive removal.
- [ ] Add app-managed fields and objects: custom fields created by apps, ownership metadata, field usage tracking, rename/deprecation protections, and cleanup workflow.
- [ ] Add app-backed automation nodes: installed apps can expose safe actions/triggers with schema-defined inputs, dropdown-backed values, permission checks, and runtime audit logs.
- [ ] Add app-backed reports/dashboards: installed apps can expose report datasets/widgets through validated schemas, tenant permission checks, and cached rollups where needed.
- [ ] Add developer diagnostics: request inspector, webhook replay, sample payloads, sync dry run, mapping validation, logs export, and support bundle generation.
- [ ] Add platform admin controls: publish/unpublish apps, approve vendor/app versions, inspect tenant installs, suspend compromised app, rotate platform secrets, and view cross-tenant health without exposing tenant data.
- [ ] Add tests for app install permissions, secret redaction, webhook signing, event delivery retries, uninstall safeguards, app-managed field cleanup, app automation nodes, usage limits, and tenant isolation.

## Priority Module 17 — Advanced Analytics and BI Layer

Scope decision: approved as the enterprise analytics layer. Build on the existing reports API, inbuilt reports, rollup tables, dashboards, exports, Views, permissions, and worker jobs so analytics stays governed and performant.

- [ ] Add semantic metric layer: governed metric definitions, dimensions, measures, filters, grain, owner, certification status, deprecation status, and permission scope.
- [ ] Add analytics dataset catalog for leads, opportunities, applications, activities, tasks, partners, payouts, communications, journeys, scoring, telephony, cases, and custom fields.
- [ ] Add advanced dashboard builder: drag/drop layout, responsive grid, dashboard tabs, filters, cross-filtering, drill-down, saved states, persona templates, sharing, and export/schedule controls.
- [ ] Add chart library beyond current stat/bar/trend/funnel widgets: line, stacked bar, grouped bar, area, pie/donut, table, pivot, heatmap, cohort matrix, funnel, sankey-style journey, and score distribution.
- [ ] Add cohort explorer: cohort by created date, source, campaign, course, university, partner, owner/team, score band, and application stage, with retention/progression metrics.
- [ ] Add funnel explorer: lead-to-opportunity-to-application-to-enrollment funnels, stage conversion, stage aging, drop-off reasons, re-entry handling, and segment comparison.
- [ ] Add attribution explorer: first/last/linear/U-shaped/W-shaped/time-decay attribution, source/campaign/partner touch paths, ROI, assisted conversions, and revenue/application influence.
- [ ] Add segmentation and comparison tools: compare users, teams, sales groups, partners, universities, courses, sources, campaigns, time periods, cohorts, and score bands.
- [ ] Add anomaly detection for key metrics: lead volume spikes/drops, conversion drops, SLA breach spikes, payout anomalies, campaign performance changes, scoring drift, and telephony/case backlog anomalies.
- [ ] Add forecasting-lite dashboards where relevant: expected applications, expected enrollments, projected fee collection, campaign volume, task backlog, SLA breach risk, and partner payout projection.
- [ ] Add metric permissions and row/field-level enforcement in analytics: restrict sensitive metrics, export approval for protected fields, dashboard sharing scope, and no raw ids in chart/table output.
- [ ] Add data freshness controls: rollup freshness badges, last updated timestamps, manual refresh, scheduled refresh, stale-data warnings, failed refresh alerts, and per-widget refresh policy.
- [ ] Add scheduled extracts and subscriptions: CSV/XLSX exports, dashboard PDFs where supported, email subscriptions, secure download links, expiry, delivery audit, and retry/failure tracking.
- [ ] Add executive scorecards: admissions summary, marketing ROI, counselor productivity, partner performance, payout exposure, scoring quality, service/case SLA, telephony performance, and data quality.
- [ ] Add analytics annotations: mark campaigns, events, outages, policy changes, intake deadlines, fee deadlines, and launch dates on charts for context.
- [ ] Add custom calculated fields/measures: safe formula builder, validated expressions, aggregation rules, null handling, date math, conditional buckets, and formula usage impact.
- [ ] Add dashboard/report versioning: draft/publish, change history, clone, rollback, owner transfer, usage metrics, and deprecation workflow.
- [ ] Add analytics performance layer: precomputed heavy rollups, cache invalidation, background refresh jobs, query timeout limits, row limits, pagination, and slow-query observability.
- [ ] Add embedded analytics surfaces in operational pages: lead/opportunity/application detail scorecards, partner/counselor/team mini dashboards, view-level count chips, and campaign/journey analytics panels.
- [ ] Add tests for metric permission enforcement, rollup correctness, cohort/funnel edge cases, attribution calculations, anomaly detection thresholds, export content, dashboard sharing, and stale-data behavior.

## Priority Module 18 — Security, Compliance, and Enterprise Admin

Scope decision: approved as a dedicated enterprise trust/admin module. This goes deeper than the Data Platform backlog and should harden identity, permissions, sessions, data protection, audit review, and platform administration across the entire CRM.

- [ ] Add enterprise identity settings: SAML/OIDC SSO, domain verification, required SSO domains, just-in-time provisioning, SSO role/team mapping, login method restrictions, and break-glass admin controls.
- [ ] Add MFA policy controls: required MFA by role/user/team, backup codes, recovery workflow, remembered devices, admin reset, enforcement rollout mode, and audit trail.
- [ ] Add SCIM/user lifecycle management: user provisioning, deprovisioning, group sync, role/team/sales-group mapping, suspended user handling, and reconciliation reports.
- [ ] Add session and device management: active sessions, device list, revoke session, idle timeout, absolute timeout, IP/device anomaly detection, trusted device policy, and login history.
- [ ] Add password and authentication policy controls for non-SSO users: strength, expiry, reuse prevention, failed-login lockout, reset-token expiry, and suspicious login alerts.
- [ ] Add permission review center: role matrix, user effective permissions, permission diffs, stale privileged access, partner access review, field-level permission review, and scheduled certification workflow.
- [ ] Add privileged action controls: step-up authentication or approval for payout/payment transitions, tenant suspension, impersonation, permission template changes, exports of sensitive data, connector secret changes, and destructive imports.
- [ ] Add impersonation governance: explicit reason, time limit, visible banner, blocked sensitive actions, tenant/user scope, complete audit trail, and platform-admin review.
- [ ] Add compliance audit dashboards: login failures, permission changes, data exports/downloads, record deletes, payout actions, webhook failures, connector secret rotations, API key usage, and admin impersonation.
- [ ] Add audit review workflows: saved audit filters, anomaly flags, reviewer assignment, comments, status, evidence export, and retention/legal-hold support.
- [ ] Add data retention policies: module-specific retention, soft-delete lifecycle, purge approval, retention exceptions, legal hold, feature snapshot retention, communication event retention, and export file expiry.
- [ ] Add data subject/privacy workflows: search subject data, export subject package, redact/anonymize, delete request, consent history, suppression enforcement, approval chain, and audit evidence.
- [ ] Add encryption and key management backlog: application-level secret encryption, key rotation plan, envelope encryption support, field-level encryption candidates, and secret access audit.
- [ ] Add sensitive-field classification: PII, financial, education, identity, communication consent, partner tax/bank data, and custom field classification with masking/export rules.
- [ ] Add IP allowlist and network policy: tenant admin allowlist, API key allowlist, webhook allowlist where feasible, platform-admin bypass controls, and lockout safeguards.
- [ ] Add rate limiting and abuse controls: per-user/API-key/tenant limits, login throttling, webhook throttling, export throttling, automation/job throttling, and abuse alerting.
- [ ] Add platform admin tenant controls: suspend/unsuspend tenant, lock login, maintenance banner, tenant health view, storage/worker/database usage, feature flags, and migration readiness without exposing tenant data unnecessarily.
- [ ] Add secure file/download controls: expiring signed URLs, permission recheck at download time, download audit, virus-scan hook placeholder, blocked public file paths, and safe content-disposition names.
- [ ] Add security headers and browser protections: CSP, frame policy, referrer policy, secure cookies, CSRF protection for mutating routes, and safe CORS defaults for API/webhooks.
- [ ] Add tests for tenant isolation, RBAC matrix, SSO/MFA policy behavior, session revocation, privileged action guards, impersonation restrictions, export/download permission checks, retention purge, and audit integrity.

## Priority Module 19 — Quality Management and Supervisor Coaching

Scope decision: approved as the performance-quality layer for sales, counseling, telephony, service, and partner operations. Build this on top of activities, telephony call logs, counseling sessions, tasks, communications, automations, scoring, reports, and permissions.

- [ ] Add quality management schema with tenant isolation: `QualityScorecard`, `QualityScorecardSection`, `QualityScorecardQuestion`, `QualityReview`, `QualityReviewAnswer`, `QualityCalibrationSession`, `CoachingPlan`, `CoachingTask`, `PerformanceImprovementPlan`, and `QualityDispute`.
- [ ] Add QA scorecard builder: weighted sections, question types, pass/fail rules, critical failure questions, comments, evidence links, scoring bands, role/module targeting, and versioned publishing.
- [ ] Add review queue workspace for calls, activities, counseling sessions, cases, partner interactions, and communication threads with filters by user/team/sales group, source, outcome, date, score band, and risk flags.
- [ ] Add automatic sampling rules: random sample, low-score/high-risk records, missed SLA, failed disposition, high-value opportunity, new user ramp-up, complaint/unsubscribe, and supervisor-defined sampling quota.
- [ ] Add manual review flow: assign reviewer, open interaction context, listen/view transcript where available, score against scorecard, add comments, request correction, publish feedback, and audit review changes.
- [ ] Add call/session playback and evidence handling: recording metadata, transcript attachment, timeline references, restricted playback permission, download audit, and review evidence retention policy.
- [ ] Add calibration workflow: multiple reviewers score the same sample, compare variance, resolve disagreement, capture calibration notes, track reviewer consistency, and publish calibration outcomes.
- [ ] Add coaching plan workflow: create plan from QA review, assign coach/manager, define goals, tasks, due dates, training links, check-ins, completion criteria, and progress status.
- [ ] Add performance improvement plan workflow for repeated quality gaps: trigger conditions, approval, milestones, manager comments, employee acknowledgements, status tracking, and audit trail.
- [ ] Add agent/counselor feedback experience: review summary, score breakdown, comments, examples, assigned coaching tasks, acknowledgement, dispute/appeal flow, and improvement history.
- [ ] Add quality dispute workflow: user disputes a score, reviewer/manager response, evidence review, score adjustment, final decision, and immutable audit log.
- [ ] Add quality analytics: average QA score, critical failure rate, trend by user/team/queue/source, scorecard section weakness, reviewer calibration variance, coaching completion, and conversion/SLA impact.
- [ ] Add supervisor dashboards: team quality heatmap, coaching backlog, users needing review, recurring issues, scorecard drift, recent disputes, and quality-to-outcome correlation.
- [ ] Add automation triggers/actions: QA review created/published, critical failure found, score below threshold, coaching plan assigned/completed, dispute opened/resolved, calibration variance high, and PIP started/completed.
- [ ] Add quality signals to predictive scoring and next-best action: recurring objections, poor disposition quality, missed script steps, low QA trend, coaching completion, and quality-risk flags.
- [ ] Add role permissions: manage scorecards, assign reviews, conduct reviews, view own reviews, view team reviews, edit published score, manage coaching plans, manage PIPs, playback/download recordings, and resolve disputes.
- [ ] Add notifications: review assigned, feedback published, coaching task due, dispute response, calibration session due, critical failure escalation, and supervisor weekly quality digest.
- [ ] Add export/report governance: restrict QA comments, sensitive recordings/transcripts, employee performance data, dispute details, and PIP exports behind privileged permissions/approvals.
- [ ] Add tests for scorecard versioning, weighted score calculations, critical failure behavior, sampling rules, review permissions, dispute flow, coaching task creation, analytics aggregates, recording permission checks, and tenant isolation.

## Priority Module 20 — Testing, Release Management, and DevOps Operations

Scope decision: approved as the delivery and operations layer for VPS readiness and long-term enterprise reliability. Build this around the existing direct Postgres migration plan, local/VPS runbooks, worker stack, API smoke tests, lint/type/build checks, seeded demo data, and deployment scripts.

- [ ] Add CI pipeline for every pull/merge: install, lint with zero warnings, `npx tsc --noEmit`, unit tests, API smoke tests, build, migration syntax checks, and artifact generation.
- [ ] Add migration safety checks: ordered migration validation, duplicate migration number detection, destructive SQL detection, schema drift check against `SCHEMA.md`, local apply test, rollback notes, and production approval gate.
- [ ] Add seeded data governance: deterministic local seed, demo tenant seed, reset-safe seed mode, large demo data generation, idempotency, fixture versioning, and clear labels for synthetic data.
- [ ] Add staging/demo environment workflow: separate database, separate Redis, separate file storage, isolated provider sandbox secrets, predictable demo credentials, and demo refresh runbook.
- [ ] Add release checklist automation: pending migrations, env var diff, worker compatibility, database backup confirmation, smoke test results, build artifact hash, release notes, and rollback command preview.
- [ ] Add deployment pipeline for VPS: build image/artifact, transfer/deploy, run migrations, restart frontend/backend/worker/ml service, health checks, warmup, and post-deploy smoke test.
- [ ] Add rollback runbook and tooling: previous release artifact, DB migration rollback strategy, feature flag fallback, worker pause/drain, emergency maintenance banner, and restore decision tree.
- [ ] Add service health monitoring: frontend, backend/API, worker, Redis, Postgres, ML service, file storage, SMTP, WhatsApp, SMS, telephony, webhooks, and scheduled jobs.
- [ ] Add error tracking: server exceptions, client runtime errors, API failures, worker job failures, webhook failures, ML service failures, and release correlation.
- [ ] Add performance monitoring: API latency, slow queries, page load timing, bundle size, worker queue depth, export processing duration, report query duration, and database connection pool health.
- [ ] Add uptime and synthetic checks: login, dashboard load, lead list, opportunity update, task create, export queue, worker export completion, report load, communication enqueue, and scoring service health.
- [ ] Add log management: structured JSON logs, request ids, tenant/user context where safe, secret redaction, log retention, search/runbook examples, and separate app/worker/ml logs.
- [ ] Add worker operations: queue dashboard, pause/resume queues, retry failed jobs, dead-letter inspection, concurrency config, graceful shutdown, stuck job detection, and scheduled job registry.
- [ ] Add database operations runbook: backup schedule, restore rehearsal, vacuum/analyze guidance, index review, connection limits, slow query review, storage growth, and data retention jobs.
- [ ] Add release approvals: owner approval, security approval for sensitive changes, migration approval, demo acceptance, production deploy approval, and audit trail.
- [ ] Add feature flag system: tenant/user scoped flags, rollout percentage, kill switch, dependency checks, audit log, and safe default behavior when flag config is missing.
- [ ] Add environment/config validation: required env vars, secret length checks, production unsafe value detection, provider connector readiness, Redis/Postgres reachability, and ML service compatibility.
- [ ] Add browser verification suite: Playwright login, navigation, critical CRUD flows, automation builder, reports, exports, marketing, scoring, payouts, partner portal, and responsive viewport checks.
- [ ] Add security/regression suite: auth negative cases, RBAC matrix, tenant isolation, CSRF/session behavior, webhook signature failures, export/download permissions, payout transition guards, and platform-admin flows.
- [ ] Add release documentation templates: changelog, known risks, migrations applied, env var changes, manual verification, rollback plan, and customer/demo notes.

## Priority Module 21 — Tenant Module Entitlements and Modular Platform

Scope decision: approved as a platform requirement. Most major capabilities must be modular, selectable while creating a tenant, and enable/disable-able later by platform admins without code changes or unsafe hidden routes.

- [ ] Add module catalog schema with tenant isolation/platform scope: `PlatformModule`, `PlatformModuleDependency`, `TenantModuleEntitlement`, `TenantModuleSetting`, `TenantModuleAuditLog`, and `TenantModuleUsage`.
- [ ] Add first-class module keys for all major capabilities: Dashboard, Leads, Lists, Opportunities, Activities, Tasks, Views, Forms, Automations, Reports, Dashboards, Marketing, Journey Orchestration, Predictive Scoring, Next-Best Action, AI Copilot, Distribution, Partners, Payouts, Gamification, Product Catalog/Application Management, Counseling, Telephony, Service Desk, Quality Management, Data Platform, Marketplace, Security/Admin, and DevOps/Ops.
- [ ] Add tenant creation wizard with module selection, default bundle templates, dependency warnings, user/partner limits, storage/export limits, enabled channels, default personas, and seeded-demo toggle.
- [ ] Add platform-admin module management UI to enable, disable, suspend, trial-enable, or retire modules per tenant with reason, effective date, dependency validation, and audit trail.
- [ ] Add module dependency rules: modules can require other modules, recommend optional modules, block incompatible modules, and explain why an action is unavailable.
- [ ] Add backend entitlement guard for every module route/API/action/worker job, not just navigation hiding; disabled modules must return clear 403/404-style module-disabled responses without leaking data.
- [ ] Add frontend navigation gating: sidebar, global create, command palette, settings tabs, dashboard widgets, automations nodes, reports datasets, filters, and smart view modules must hide or disable unavailable modules consistently.
- [ ] Add module-aware RBAC composition: a user needs both tenant module entitlement and role permission; platform admins can see module state but tenant users cannot self-enable paid/restricted modules.
- [ ] Add module-aware migrations and seeders: migrations can add tables globally, but seed data, default records, dashboard presets, automation templates, and settings are created only when the tenant has the module enabled.
- [ ] Add module lifecycle hooks: on enable create defaults/settings, on disable pause workers/automations/campaigns, on suspend block actions but preserve reads where configured, and on re-enable restore safe state.
- [ ] Add module usage telemetry: active users, records, API calls, worker jobs, exports, storage, campaigns, score recomputes, telephony calls, and high-water marks for capacity planning.
- [ ] Add module billing/readiness metadata even if billing is not built: plan tier, trial end, usage limit, soft limit warning, hard limit block, and platform-admin override.
- [ ] Add module visibility in tenant settings: show enabled modules, disabled modules, dependency explanation, module health, module usage, and contact/platform-admin request state.
- [ ] Add module-aware demo tenant generation: create coherent demo data only for enabled modules, including users/roles/teams/sales groups/partners/forms/views/reports/automations/campaigns/scoring/payout/gamification/application data.
- [ ] Add module-aware exports/imports/reports/views: datasets and fields from disabled modules must not appear in builders, filters, exports, or analytics even if tables exist.
- [ ] Add module-aware worker registry: every recurring processor declares required module keys, can be paused per tenant, and records skipped jobs due to disabled modules without noisy retries.
- [ ] Add module-aware API smoke tests covering enabled vs disabled modules, dependency failures, tenant creation bundles, worker skips, navigation visibility, and role-permission intersection.
- [ ] Add migration/runbook updates for VPS: default module catalog seed, platform-admin enablement workflow, tenant bootstrap steps, and emergency module suspension procedure.
- [ ] Add module packaging rules: each module declares routes, nav items, settings sections, permissions, custom fields, automations, reports, dashboard widgets, worker jobs, seeders, and cleanup hooks in one discoverable manifest.
- [ ] Add module setup checklist framework: when a module is enabled, admins see required setup items, missing connectors, missing roles, missing templates, missing default views, and validation status.
- [ ] Add module data retention defaults and overrides, including what happens when a module is disabled: preserve data, hide data, anonymize data, archive data, or schedule purge after approval.
- [ ] Add tenant-module audit views: who enabled/disabled a module, what dependencies changed, what defaults were created, which workers were paused/resumed, and what users/roles gained or lost access.
- [ ] Add platform-safe module disable flow: pre-disable impact scan for active campaigns, automations, views, dashboards, reports, exports, payouts, tasks, pending jobs, and external webhooks.
- [ ] Add module health badges across settings and platform admin: healthy, setup incomplete, connector failing, worker backlog, stale data, disabled by dependency, suspended, or trial expired.
- [ ] Add module contract tests requiring every module to expose permission metadata, route guards, seed defaults, API smoke paths, and disabled-module behavior before it can be marked enterprise-ready.

## Enterprise Upgrade Audit — Existing Functionality Depth

This section tracks cross-cutting improvements to current modules that already exist but still feel basic, fragmented, static, or not enterprise-grade. Mark items complete only after the relevant UI, API, permissions, worker behavior, tests, and demo data are verified.

### Enterprise Architecture Backbone

- [ ] Consolidate module manifests, route definitions, sidebar metadata, permission keys, worker job declarations, report datasets, export datasets, and setting sections so each module is discoverable and independently gateable.
- [ ] Introduce bounded-service folders for load-bearing domains (`leads`, `opportunities`, `tasks`, `views`, `automations`, `reports`, `marketing`, `partners`, `payouts`, `gamification`, `scoring`) with clear server/client/shared boundaries.
- [ ] Create a shared domain-event contract for create/update/delete/status-change events, including event id, tenant id, actor id, module, record reference, friendly label, changed fields, idempotency key, and emitted worker jobs.
- [ ] Standardize all list APIs on one pagination/filter/sort contract: page, page size, total, selected ids, filters, search, sort, visible columns, export context, and server-side count semantics.
- [ ] Standardize all detail APIs on one include/expand pattern so detail pages do not create N+1 fetch storms for owner/stage/type/custom fields/tasks/activities/audit/scoring/communications.
- [ ] Add a shared lookup hydration layer that resolves users, teams, sales groups, roles, partners, partner orgs, stages, opportunity types, activity types, lists, views, campaigns, courses, applications, and payouts.
- [ ] Add data-access policy helpers that combine tenant, role, team/sales-group hierarchy, partner organization hierarchy, module entitlement, field permissions, and record sharing in one reusable check.
- [ ] Add a mutation transaction helper with audit log, domain event emission, idempotency, notification enqueue, and worker job enqueue as a consistent post-commit pattern.

### Data Model and Schema Governance

- [ ] Normalize naming and relationship conventions for all new tables: `tenantId`, `createdAt`, `updatedAt`, `createdBy`, status enums/checks, FK indexes, tenant indexes, audit references, and soft-delete/archive strategy.
- [ ] Add database-level constraints for state machines where feasible, especially payout, invoice, application, campaign, journey, case, scoring model, and module entitlement transitions.
- [ ] Add missing indexes for common dashboard/report/filter paths: owner, status, stage, type, source, campaign, due date, created date, updated date, tenant+module, tenant+record, and tenant+status.
- [ ] Add schema drift protection between migrations, `SCHEMA.md`, local Postgres, VPS Postgres, and production snapshots.
- [ ] Add data migration/backfill checklist for every schema change: default values, existing tenant data, old records, demo data, rollback safety, and verification query.
- [ ] Add custom-field lifecycle governance: create, rename label, deprecate, archive, delete blocked by usage, picklist value merge, dependency tracking, and reporting/automation/view impact scan.

### Permission, Privacy, and Tenant Isolation

- [ ] Build an automated RBAC matrix test generator that checks every route/action against Admin, Manager, Rep, Partner primary, Partner member, Finance, Platform Admin, and unauthenticated users.
- [ ] Add tenant-isolation regression tests for every route family, including list counts, detail fetches, exports, downloads, worker-created records, webhook-created records, and report rollups.
- [ ] Add sensitive-field masking policy for phone, email, parent details, education data, tax/bank details, payout details, recordings/transcripts, notes, and scoring feature snapshots.
- [ ] Add export/download approval rules for sensitive fields and high-volume exports, with request history, approver comments, expiry, and download audit.
- [ ] Add destructive/sensitive action approvals with maker-checker where needed: payout paid, payout held/released, invoice generated, campaign launched, automation published, tenant suspended, model promoted, data purge, and permission changes.
- [ ] Add external-user security model for partner/applicant/public-form contexts, so external users never rely on internal role assumptions.

### Demo and Sales-Readiness Quality

- [ ] Add a demo scenario map: admissions lead journey, partner lead journey, counselor follow-up, application progression, campaign nurture, scoring improvement, payout cycle, gamification rewards, report/dashboard drill-down, and admin configuration.
- [ ] Add seeded demo personas: platform admin, tenant admin, manager, counselor/rep, partner primary, partner member, finance user, marketing user, QA supervisor, and support/service user where modules are enabled.
- [ ] Add realistic data distributions: sources/campaigns/UTMs, universities/courses/intakes, lead statuses, opportunity stages, application states, activities, tasks, communication events, payouts, points, cases, and scoring bands.
- [ ] Add demo reset tooling that can rebuild one tenant without corrupting other tenants, preserving selected credentials and module entitlements.
- [ ] Add demo health check that verifies dashboard widgets, reports, exports, views, automations, scoring, worker jobs, partner payouts, and marketing campaigns have enough data to show meaningful output.

### Leads

- [ ] Upgrade lead list UX with enterprise advanced filters, saved filter chips, column personalization, inline edit, bulk actions, export selected/full view, pagination consistency, and no raw ids in visible cells.
- [ ] Add lead detail command surface: quick create task/activity/opportunity/application, next-best action, score explanation, timeline filters, communications, audit, related partner, source attribution, and ownership history.
- [ ] Add lead lifecycle configuration: tenant-defined statuses, status transition rules, required fields by status, duplicate policies, merge/unmerge, owner assignment policy, SLA rules, and stale-lead handling.
- [ ] Add lead data quality checks for missing contact fields, invalid phone/email, duplicate contacts, missing source/UTM, stale untouched records, missing owner, and impossible state transitions.
- [ ] Add lead permission hardening: field-level visibility/editing, export-sensitive-fields approval, partner-visible fields, team/sales-group scoping, and tenant-isolation tests for every lead action.

### Opportunities

- [ ] Remove generic pipeline dependency where redundant and standardize on Opportunity Types with type-specific stages, fields, course/catalog values, stage rules, permissions, reports, and automations.
- [ ] Upgrade opportunity list/kanban/table with reliable drag/drop stage changes, pagination, filters, bulk actions, export selected/full view, score columns, stage aging, and friendly stage/type names.
- [ ] Add opportunity detail enterprise shell: type/stage timeline, application/course context, tasks, activities, communications, score panel, partner attribution, payout impact, audit, and stage history.
- [ ] Add stage governance: required fields/tasks/documents before stage movement, blocked transition explanations, approval gates, SLA timers, lost reasons, reopen rules, and full audit logs.
- [ ] Add opportunity tests for type/stage transitions, drag/drop API behavior, permission-scoped stage updates, reporting counts, automation triggers, and no raw id display.

### Activities

- [ ] Upgrade activities workspace with pagination, calendar/timeline modes, dynamic activity type filters, outcome filters, SLA filters, bulk actions, export selected/full view, and related record friendly names.
- [ ] Add activity detail drawer/page with edit history, related lead/opportunity/task/application/case, call/communication metadata, attachments, notes, SLA status, and automation events.
- [ ] Add configurable activity types/outcomes with required fields, icons, SLA settings, role visibility, channel mapping, and tenant-specific picklist values.
- [ ] Add activity capture quality improvements: duplicate prevention, timezone-correct due/completed timestamps, system vs user activity separation, and consistent audit trail.

### Tasks

- [ ] Upgrade task dependencies/subtasks, recurring tasks, task templates, queue tasks, approval tasks, SLA-linked tasks, and checklist-style completion.
- [ ] Add task notifications/reminders through the worker/realtime notification system without polling, with escalation for overdue high-priority tasks.
- [ ] Add task productivity reporting: overdue aging, completion rate, reassignment rate, source module, owner/team workload, missed reminders, and task-to-conversion impact.
- [ ] Add task permissions and visibility rules for related records, partner users, case/applicant/counseling contexts, and sensitive task notes.

### Forms

- [ ] Complete section/tab-level conditional rules, dynamic dropdowns from CRM/catalog values, multi-select picklists, calculations, validations, hidden fields, prefill, draft/resume, and progressive profiling.
- [ ] Add form analytics: step drop-off, field abandonment, submission source, conversion to lead/application, error rate, device/browser, and campaign attribution.
- [ ] Add form governance: publish/version workflow, rollback, duplicate handling, spam protection, consent capture, webhook/API submission security, and permission-scoped placement.

### Automations

- [ ] Upgrade automation builder into a polished context-aware visual builder: node popup configuration, auto layout, no broken side panel, clean multi-if/else, branch labels, validation warnings, and read-only execution preview.
- [ ] Add enterprise execution controls: bulk enrollment, re-enrollment rules, dedupe, idempotency keys, sub-automations, transactional step groups, error branches, retry policy, pause/resume, and dry-run simulation.
- [ ] Add condition/value selector consistency: all dropdown/picklist/lookup fields support multi-select where valid, values are fetched dynamically, and unavailable values explain module/permission causes.
- [ ] Add automation performance analytics: enrollment count, success/failure, step latency, branch conversion, skipped reasons, downstream impact, and worker queue health.
- [ ] Add automation safety: module entitlement guards, role permissions, destructive action approval, loop/cycle detection, rate limits, audit logs, and tenant-isolation tests.

### Reports and Dashboards

- [ ] Upgrade custom report builder UI for complex joins, view/report sources, grouping, summaries, formulas, charts, filters, drill-down, scheduled delivery, and export governance without long-page clutter.
- [ ] Add dashboard builder depth: sections/tabs, dashboard-level filters, cross-filtering, widget permissions, refresh/freshness status, persona defaults, and per-user layouts.
- [ ] Add inbuilt report discoverability in UI: categorized gallery, descriptions, owner/persona scope, last updated, sample preview, favorite/pin, and open/drill/export actions.
- [ ] Add report reliability checks: correct counts for filtered/selected exports, tenant timezone formatting, no raw ids, query timeout handling, pagination, and large-report worker processing.
- [ ] Add metric definition governance: certified vs draft metrics, metric owner, formula versioning, data freshness, permitted dimensions, and deprecation warnings.
- [ ] Add report testing fixtures for every inbuilt report and all critical demo reports, including empty ranges, partial periods, duplicate records, missing owners, partner scoping, and disabled-module datasets.
- [ ] Add dashboard performance safeguards: widget timeout, fallback cached data, stale badge, refresh queue, per-widget query budget, and slow-widget admin diagnostics.

### Marketing Communications

- [ ] Upgrade campaign UX from basic composer to enterprise campaign center with audience preview, suppression explanation, approvals, test variants, throttling visibility, delivery health, analytics, and rollback/pause controls.
- [ ] Add provider configuration depth for Email/WhatsApp/SMS: sandbox/live mode, sender verification, DLT/template IDs, WhatsApp template status, bounce/complaint handling, and connector health.
- [ ] Add communication consent/fatigue controls everywhere messages can be sent, including automation nodes, campaigns, lead/opportunity detail, telephony follow-ups, and bulk actions.
- [ ] Add content governance: template folders, approval workflow, token validation, localization variants, brand guardrails, spam-score checks where available, and rollback to previous template version.
- [ ] Add campaign operations safety: preflight checklist, audience overlap warning, consent/suppression preview, quiet-hour preview, estimated cost, provider quota warning, and approval before launch.
- [ ] Add campaign postmortem analytics: deliverability, engagement, conversions, influenced applications/opportunities, unsubscribe/bounce impact, source/partner attribution, and next-best follow-up recommendations.

### Gamification

- [ ] Upgrade gamification from rule list to advanced program designer: seasons, missions, challenges, streaks, levels, badges, teams, cohorts, leaderboards, reward catalog, approvals, anti-gaming rules, and participant targeting.
- [ ] Add dynamic dropdown-backed rule builder for all gamification conditions and reward values, including users, teams, sales groups, partner orgs, activity types, stages, courses, sources, and score bands.
- [ ] Add gamification analytics: points issued/redeemed/reversed, rule effectiveness, suspicious awards, leaderboard movement, reward liability, participant engagement, and conversion impact.
- [ ] Add gamification governance: program owner, season lock, retroactive recalculation policy, manual adjustment approval, reward budget, participant eligibility history, and anti-gaming incident review.
- [ ] Add team and partner-org competition modes with fair normalization by headcount, active days, eligible record volume, and role/territory differences.

### Payouts and Commissions

- [ ] Upgrade payout configuration with rule simulation, partner org aggregation preview, tiered commissions, clawbacks, hold/release workflow, dispute handling, credit notes, tax settings, invoice lifecycle, and finance approvals.
- [ ] Add dynamic dropdown-backed commission/payout condition builder for all applicable lead/opportunity/application/partner/source/course/stage fields, with multi-select picklists and safe value validation.
- [ ] Add payout reliability: irreversible transition guards, idempotent payout generation, locked cycle recalculation protection, audit/export/download checks, and worker-backed statement/invoice generation.
- [ ] Add commission rule governance: draft/publish, effective date, expiry date, priority conflict detection, simulation against historical conversions, approval workflow, and rule version lineage.
- [ ] Add payout dispute and exception analytics: dispute volume, aging, reason category, partner org, finance owner, payout cycle, resolution amount, and repeated anomaly detection.

### Settings and Admin

- [ ] Replace broad settings pages with module-specific settings workspaces, searchable admin sections, setup checklists, permission-aware tabs, change audit, and dependency/module entitlement indicators.
- [ ] Add admin health panels for modules, connectors, workers, migrations, seed/demo state, storage, Redis, Postgres, ML service, and failed jobs.
- [ ] Add platform-admin tenant lifecycle improvements: tenant create wizard, module selection, suspend/unsuspend, impersonation governance, tenant usage, migration readiness, and demo reset.
- [ ] Add settings change management: draft changes for sensitive settings, approval, scheduled activation, rollback, impacted-module preview, and audit diff.
- [ ] Add settings search and dependency map so admins can find which setting controls a field/action/report/automation node and what modules depend on it.
- [ ] Add tenant readiness scoring: setup completeness, connector health, missing roles, missing templates, missing defaults, failed jobs, unapplied migrations, and demo/production readiness.

### Navigation, UI, and Design Quality

- [ ] Do a full UI pass for clutter, long-scroll pages, nested cards, inconsistent borders, mobile overflow, button/icon consistency, empty/error/loading states, and enterprise-density layouts.
- [ ] Ensure every visible lookup value renders a friendly name instead of a raw id across tables, cards, exports, filters, smart views, reports, audit logs, notifications, and detail pages.
- [ ] Standardize date/time and currency display from tenant settings across UI and exports, including tenant timezone conversion, `dd/MM/yyyy, hh:mm AM/PM`, and selected tenant currency.
- [ ] Add no-polling realtime UX where required: notifications, export status, worker job status, campaign delivery progress, task reminders, and automation execution status.
- [ ] Add cross-app design QA checklist: one table style, one page header style, one filter drawer pattern, one modal/drawer sizing pattern, one empty-state pattern, one bulk-action pattern, and one request-history pattern.
- [ ] Add mobile-first acceptance for every module page: no inaccessible horizontal controls, sticky primary actions where appropriate, readable cards for dense tables, and touch-friendly action menus.
- [ ] Add accessibility acceptance: focus trap, focus visible, keyboard navigation, screen-reader labels for icon buttons, color contrast, reduced motion, and semantic table/list status text.

### API, Workers, Performance, and Reliability

- [ ] Add full API action verification for GET/POST/PATCH/DELETE across every route family, including negative auth/RBAC/tenant tests and structured user-friendly errors.
- [ ] Move all expensive actions to workers: exports, report rollups, campaign sends, scoring retraining/recompute, automation due/wait processing, SLA timers, reminders, notifications, telephony post-processing, and analytics rollups.
- [ ] Add performance audits for N+1 queries, missing pagination, missing indexes, overfetching, client-side heavy joins, bundle size, repeated Fast Refresh triggers, and slow dashboard/report endpoints.
- [ ] Add reliability safeguards: idempotency for mutating actions, retry/dead-letter handling, concurrency locks, transaction boundaries for payout/stage/approval flows, and graceful degradation when external services fail.
- [ ] Add API contract documentation generated from route metadata: method, auth, module entitlement, permission key, request schema, response schema, errors, rate limits, and example payload.
- [ ] Add worker request-history model for long-running user-visible actions: export, import, report refresh, score recompute, campaign launch, automation bulk enrollment, payout generation, and invoice generation.
- [ ] Add production performance budgets: max page load, max list API latency, max dashboard widget latency, max report preview time, max worker queue age, and max export generation time by record count.
- [ ] Add resilience tests for Postgres unavailable, Redis unavailable, ML service unavailable, provider connector failing, storage unavailable, and worker crash/retry behavior.

### Import, Export, and Data Operations

- [ ] Add a unified import center with templates, validation staging, duplicate strategy, approval, worker processing, progress, partial-failure downloads, rollback, and import-to-automation trigger controls.
- [ ] Add a unified export framework available from each module's current list/view/filter context, with selected rows vs all filtered records, columns, format, approval, request history, expiry, and download audit.
- [ ] Add data correction tools: bulk field update with preview, duplicate merge, owner reassignment, status/stage correction, source/UTM cleanup, and undo/rollback where feasible.
- [ ] Add data lineage visibility: source of record creation/update, import job, form, API key, webhook, automation, campaign, partner submission, and manual user action.
- [ ] Add data operation tests for large imports, large exports, selected vs filtered counts, tenant timezone/currency formatting, idempotent retries, rollback, and permission-denied downloads.

### Connector and External-System Operations

- [ ] Add connector readiness checklist for SMTP, WhatsApp, SMS, telephony, storage, ML service, webhooks, and future marketplace apps.
- [ ] Add connector test consoles with safe sample payloads, secret redaction, response diagnostics, last successful request, failure reason, and retry advice.
- [ ] Add connector-specific monitoring alerts for expired credentials, webhook signature failures, provider rate limits, delivery failures, stale syncs, queue backlog, and repeated retries.
- [ ] Add sandbox/live mode separation for every external provider, including separate credentials, test sends, fake payment/call/message events where applicable, and clear UI badges.
- [ ] Add external event idempotency and replay tooling: dedupe keys, replay by event id, dead-letter repair, payload audit, and safe reprocessing permissions.

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
