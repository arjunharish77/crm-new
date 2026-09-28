# Module 12 — Applications phase one

Implemented 15 September 2026 for the `crm` app on port 3000.

## Available workflow

Sales → Applications provides a searchable, paginated application list, a create dialog, and application details with initial stage history. Creation requires an accessible Lead, active university/program, and an open stage belonging to that program. Course, intake and a compatible linked opportunity are optional. The current user owns new applications. Creation, initial history and audit entry commit together.

Applications → Numbering rules configures a workspace default or university/opportunity-type/intake scope. An opportunity-type rule matches only when an application links to an opportunity of that type. References must belong to the current tenant, and combined scopes must refer to compatible programs/universities.

The most specific matching rule wins; ties prefer intake, then opportunity type. Default format: `APP-{YYYY}-000001`. Prefix/suffix support `{YYYY}` and `{FY}`, with a configurable timezone, financial-year start month and minimum digit width. Example: an April start changes `{FY}` from `2025-26` to `2026-27` at local midnight on 1 April 2026.

One tenant-wide bigint counter increases across all scopes and years. It never resets when rules change. PostgreSQL locks the counter row during allocation. Existing-number collisions are skipped (maximum 100 attempts); failure rolls back the transaction. Existing application numbers remain unchanged after configuration changes. Gaps are valid; this is not a gapless accounting sequence.

Each create draft has a UUID request key. Concurrent retries with identical details return the original record; changed details with an already committed key receive 409. The key and normalized payload hash are stored with the application. A distinct new draft intentionally creates another application, even for the same applicant/program.

## Setup and access

- Apply `migrations/0110_application_numbering.sql` through the normal migration process before deploying these routes. It has been applied only to the local development database in this session.
- Enable the existing `PRODUCT_CATALOG` module. Configure catalog programs and open application stages in Settings → Catalog.
- Tenant administrators can use all first-phase actions. Other internal roles need explicit Applications `read`, `create`, and/or `manage` grants in the role permission matrix. Creating requires both read and create; numbering requires manage.
- OWN limits application visibility to its owner; TEAM adds owners in the user's tenant/team; ALL includes the current tenant. Leads and linked opportunities use their existing record-scope rules. Partners are denied. Application record sharing is not implemented.
- The shared permission matrix also displays standard actions such as update/export/delete; no application endpoints implement those actions yet.

## UI conventions

Use the existing page header, cards, labeled controls, standard dialog, inline errors, retry states, and authenticated in-memory draft store. Application data and action labels wrap at narrow widths. Do not depend on wide tables for essential application navigation. Numbering settings explain how scope selection affects saving; changing scope does not remove the old rule.

Create and numbering drafts survive in-app navigation, with pending-save locks and unload protection. Refresh/sign-out clears in-memory drafts. Never persist API credentials or application drafts to browser local storage. Keep follow-on documents, fees and decisions in focused sections rather than extending the create dialog indefinitely.

## Verification

- `tests/application-numbering.test.ts`: 15 passing checks covering financial-year timezone boundaries, bigint precision, invalid sequences/templates/settings and explicit permission grants.
- `scripts/application-phase-one-smoke.ts`: 15 passing local database assertions covering rule upsert, six simultaneous identical requests, six distinct concurrent requests, payload conflicts, invalid Lead/stage rejection, foreign-tenant and OWN visibility, denied create, and exactly one initial history/audit entry. Temporary catalog/application/rule/audit fixtures were removed. Allocated sequence values remain consumed intentionally.
- `scripts/ui-applications-smoke.cjs`: 19 passing browser checks with intercepted API fixtures; 320px/1280px, light/dark and 32px root text across four screens, failure/retry, stable request key and numbering save. Evidence: `ui-audit-2026-09/module-12-phase-one/results.json` and screenshots.
- Browser testing found and fixed action-button overflow and shared header wrapping at narrow widths with enlarged text. No real customer communications were sent.
- Six live HTTP checks passed: unauthenticated denial, authorized local admin login, list/options/numbering success, and missing detail 404. See `ui-audit-2026-09/module-12-phase-one/live-http.json`.
- TypeScript, targeted ESLint, whitespace checks and the production build passed.

These are repository/database checks, fixture-based browser checks and a live admin HTTP smoke, not a complete live-role end-to-end acceptance suite. Exhaustive scope precedence combinations, TEAM membership changes, permission changes during an in-flight request, native browser zoom and manual assistive-technology checks remain outside this phase.

## Next phases

1. Document requirements, uploads and verification; guarded stage transitions with reasons and history.
2. Eligibility checks and counselor review.
3. Fee milestones, offers, decisions and idempotent application-to-enrollment conversion.
4. Application reporting, automations, imports, granular document/fee/decision permissions and wider catalog integrations.

The full Module 12 detail page, lifecycle and permissions checklist items remain open. This phase supplies their initial foundation only.
