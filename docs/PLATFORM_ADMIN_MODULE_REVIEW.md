# Platform-admin tenant/module review

2026-09-28. Reviewed the CRM application, not the separate public website. The latest pushed local commit at the start of this follow-up was `ba453da`; the fixes described here were made **after** that push and need another commit/push/deployment.

## What was wrong and what changed

1. **Create Tenant exposed only Opportunities.** It now fetches the same `PlatformModule` catalog used for existing tenants and offers all **28 catalog entries**. Seven core modules remain enabled and cannot be switched off. A searchable, expandable selector limits clutter. API Access and Sales Groups have separate switches, covering the two feature flags without an equivalent individual catalog entry.
2. **Provisioning did not save module entitlements.** It now saves explicit choices for every catalog entry and initial module audit records, together with the tenant, admin account, feature flags and default objects, in one database transaction. Failure rolls everything back. No migration or new environment variable is required for this follow-up; the catalog tables already come from migration `0037`.
3. **Missing/stale catalog choices could be misleading.** Catalog-load failure prevents submission, unknown keys and disabled core selections are rejected, and failed saves retain selections. Duplicate tenant/admin details return a conflict instead of an unexplained server error.
4. **Older feature switches could bypass overlapping module restrictions.** For Opportunities, Automations, Forms, Reports, Payouts and Gamification, the shared server feature gate now requires both the feature flag and module entitlement to permit access. The authenticated user's effective feature flags and feature-gate components respect explicit disabled/suspended modules. Existing tenant pages identify overlapping feature flags that are still off.
5. **Canceling a module-status reason prompt still saved the change.** Cancel now stops the update.
6. **Creation dialog overflowed with enlarged text on small screens.** Reduced nested padding, wrapped actions/switches and block labels keep it within the viewport. The module catalog is expandable rather than forcing 28 controls into the initial view.

Existing tenant entitlements are not rewritten or bulk-enabled by these changes. The plan label does not automatically apply a pricing/module bundle.

## How to inspect an existing tenant

1. Sign in as a **Platform Admin** and open `/platform-admin/tenants`.
2. Click the tenant's name.
3. Open **Modules**. On narrow screens, select it in **Tenant section**.
4. Inspect each module's status. `ENABLED` and `TRIAL` permit module access where the module gate is implemented. `DISABLED` and `SUSPENDED` block gated access. Core modules remain enabled.
5. Open **Feature flags**. Check all eight flags, especially **API Access**, which defaults off. Where a feature overlaps a catalog module, both controls must allow it.
6. Review the user's **Roles & Permissions** in that tenant. A tenant entitlement does not replace user permissions.
7. Verify the resulting navigation and API behavior as a **real tenant user** after refreshing/signing in. Platform admins intentionally bypass many feature checks and are not a reliable negative-access test account.

Changes to an existing tenant save immediately. Disabling a module does not erase its records. Enabling a module does not configure providers, create an API key, or complete unfinished roadmap features.

## Catalog availability is not full feature completion

The catalog contains 28 entries, but the gap checklist still records unfinished work. Do not interpret 28 visible switches as 28 fully finished, universally enforced modules.

| Catalog entry | Current limitation found in this review |
| --- | --- |
| Counseling | Full counseling workspace/workflows remain roadmap work. |
| Quality Management | Full QA/coaching workspace remains roadmap work. |
| DevOps & Ops | Full operations workspace remains roadmap work. |
| Product Catalog | Catalog and Applications are available, but the full Module 12 checklist is still only 6/20 complete. |

The known limitations are stated beside the relevant create/edit controls where applicable. This review is not a certification that every endpoint/worker path in every catalog module has complete entitlement enforcement. Telephony and Data Platform enforcement was completed on 2026-09-29 (see the next section).

## Validation

- Full automated suite: **1,959 tests passed** across 156 files.
- Local database provisioning: **15 checks passed**; 28 module choices, seven protected core modules, matching feature flags, audit attribution and rollback. Test tenants/users were removed.
- Browser tests cover catalog load failure, all catalog choices, core locks, search, retained failed saves, payload/retry and mobile/desktop layout with 200% text. Existing-tenant checks cover Modules, all eight feature flags and canceling status changes.
- TypeScript and full ESLint were checked; the existing MFA QR-image performance warning is separate from these changes.
- See `ui-audit-2026-09/platform-tenant-modules/results.json` for the final browser result and `scripts/tenant-provisioning-smoke.ts` for the database test.

Production deployment still requires building the actual Docker images, applying pending migrations if the VPS remains at `0023`, and checking the deployed workspace. Use [the existing-VPS upgrade guide](VPS_UPGRADE_2026_09.md), not the old wipe/reinstall runbook.

## Follow-up 2026-09-29: Telephony, Data Platform, dependencies and impact preview

Decisions confirmed by the operator:

- **Data Platform off** blocks outbound webhooks, inbound lead capture, external push and the dedupe & merge center. Imports, exports, audit logs and GDPR requests stay available; API keys stay controlled by the API Access flag. Inbound email-to-case stays under Service Desk.
- **Telephony off** blocks the call center, campaigns, scripts, dispositions, agent availability, queues, recordings, click-to-call, telephony settings and the telephony call-performance report. Provider webhooks receive `403` with code `MODULE_DISABLED` and nothing is recorded. Existing call activities remain visible on timelines; phone suppression lists (shared with SMS/WhatsApp) remain available; recording-retention cleanup keeps running.
- **Dependencies are enforced by refusal with an explanation**: Journey Orchestration requires Automations and Marketing Communications; Payouts requires Partners. Nothing is enabled or disabled implicitly.

What was built:

| Area | Behaviour |
| --- | --- |
| Server gates | 49 Telephony and 28 Data Platform server functions check the module first (platform admins bypass, as elsewhere). Source-contract tests fail if a new user-facing function in those modules is added without a check. |
| Error responses | Any `MODULE_DISABLED:<KEY>` now returns `403` `{ code: "MODULE_DISABLED", message: "<Module> is not enabled for this workspace" }` from every route via the shared `serverError`, instead of a 500. |
| Outbound webhooks | Nothing is queued for a tenant with Data Platform off (record writes are never failed by this). Deliveries queued before it was switched off are cancelled, not sent, so re-enabling does not replay stale events. |
| Dependencies | Checked in one transaction with a per-tenant lock for module-status changes, for the overlapping legacy flags (e.g. `automationEnabled`, `payoutsEnabled`), and for tenant creation. Verified with 8 rounds of concurrent "enable Payouts" vs "disable Partners" on a real database: never ends in a broken state. |
| Impact preview | Disabling or suspending a module opens a dialog listing what stops (e.g. active automations, scheduled campaigns, pending webhook deliveries, open cases, unpaid payouts) with an optional audit reason. A refused change keeps the dialog open with the explanation. Existing broken combinations are shown as a banner on the tenant's Modules section. |
| Screens | Menu items, settings entries, header availability toggle, record-page call/push buttons and panels are hidden when their module is off; direct URLs show "<Module> is not enabled". The Integrations page keeps CSV imports, messaging and health available with either module off. |

Validation: unit suite (1,975+ tests incl. `tests/module-entitlements.test.ts`, `tests/telephony-module-gate.test.ts`, `tests/data-platform-module-gate.test.ts`), real-database check `scripts/module-switches-smoke.ts` (16 checks), browser checks `scripts/ui-module-switches-smoke.cjs` (10 checks, incl. 320px at 200% text) and the updated `scripts/ui-platform-tenant-modules-smoke.cjs` (15 checks). No migration or environment change is required.

Still open: Counseling, Quality Management and DevOps have no product surface to gate yet; module lifecycle hooks, usage telemetry, billing limits and health badges remain roadmap items.

## Follow-up 2026-09-29 (second pass): every switchable module audited per handler

A static audit (`node scripts/audit-module-gates.cjs --verbose`) follows each API handler of each non-core module into the server functions it calls and reports handlers that never reach a module or overlapping feature-flag check. It now runs in the unit suite (`tests/module-gate-audit.test.ts`), so a new route that skips its gate fails CI.

First run: **178 of 444 handlers unchecked** across 16 modules (Telephony and Data Platform, done earlier the same day, were clean). The pattern was consistent: creates/updates/deletes were gated, reads were not — with Service Desk off, `GET /cases` still returned every case. All 178 are fixed; 0 remain.

Most important fixes:

| Module | Gap that was open |
| --- | --- |
| Marketplace | Installed-app credentials kept working after Marketplace was switched off (`/api/v1/apps/leads`, `/opportunities` read and write), outbound app events kept being queued and delivered, scheduled CRM→app syncs kept pushing data. Now refused/skipped; a queued backlog is cancelled, not sent. |
| Payouts / Partners | Partner self-service payouts, invoices, commission ledger and invoice PDFs, payout settings and finance export. Partner payout access now requires both modules and answers "no" instead of erroring. |
| Service Desk | Case, status, priority, queue, SLA, macro, inbound-address and knowledge-base reads; attachments; public satisfaction-survey links. |
| Reports | All 31 inbuilt reports and the lead/opportunity/activity reports, annotations, roll-up status/refresh, schedules list, custom-report versions. |
| Others | Opportunities (detail, list, stats, history, sharing, type config, API list), Forms (list/detail/export/stats/submissions, public form render and progress), Automations, Marketing, Journeys, Predictive Scoring, Next-Best Action, AI Copilot, Distribution simulations/rules, Gamification, Product Catalog. |

Deliberate exceptions (allow-listed with reasons): manual owner reassignment (used from the Leads/Opportunities lists — core CRM, not the Distribution Engine) and two cron-secret report roll-up endpoints. Lists that other core screens depend on return an empty result instead of an error when their module is off: opportunity types (≈14 filter/dropdown screens), catalog programs (Opportunity-type dialog) and placement forms (lead page panel). Save-time hooks (gamification points, next-best-action refresh) check the module once, as before; the new route-level checks were moved off that hot path.

No migration or environment change. Validation: full unit suite (1,981 tests), real-database check `scripts/module-switches-smoke.ts` (22 checks), both browser checks re-run.

## Follow-up 2026-09-29: module health badges

Each non-core module now shows a health state next to its status: Setup incomplete, Connector failing, Work backed up, Stale data, Disabled by dependency or Trial expired (or Healthy). Placeholder modules show "Not built yet".

| Who | Where | What they see |
| --- | --- | --- |
| Tenant admin | Settings → Modules | The badge, the problem in plain words and a link to the page that fixes it. No worker job names. |
| Platform admin | Tenant page → Modules | The same, plus which worker job clears the work; "Recheck health" recomputes it. |
| Platform admin | Platform Admin → Module Health | Every active tenant's problems, filterable by state, with a warning when checks have not run for an hour. |

"Work backed up" means due work is more than 15 minutes overdue for the worker job that processes it. "Connector failing" needs at least 3 failures and at least 20% of deliveries in 24 hours, so one bad address does not raise it. Failing connectors and backed-up work send tenant and platform admins one in-app notice per module per day; setup-incomplete and stale data only show the badge.

Deploy: migration `0120_module_health.sql` (two tables with RLS, three additive indexes) and the new worker job `modules.processHealth`; rebuild web and worker. No environment change.

Also fixed: the service-desk analytics and data-quality background jobs processed the same first 50 / 25 tenants every minute and never the rest, and one tenant with reporting off stopped either run. They now take eligible tenants least-recently-refreshed first and skip a failing tenant. Data-quality scorecards are written once per tenant per day (they were written every minute); migration `0121_data_quality_scorecard_daily.sql` keeps each tenant's latest scorecard per day and deletes the duplicates.

