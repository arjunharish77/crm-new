# Module 12 — Checklist visibility and stage transitions

Implemented 15 September 2026 in `crm` (port 3000). Upload/download and review actions were subsequently added in [phase three](32_APPLICATION_DOCUMENTS_PHASE_THREE.md); the remaining-work notes below describe the end of phase two. This extends phase one; Module 12 remains 5/20 fully completed checklist items because the document and stage workflow bullets include additional capabilities.

## Available behavior

Application details now show active program checklist requirements, with required/optional labels, missing/pending/verified/rejected/expired status, rejection feedback, expiry date and reviewer. Only metadata is returned; storage paths are not exposed. The newest document record by `createdAt` (ID breaks ties) determines an item's status, so editing an older verified record does not hide a rejected replacement. Inactive checklist items are excluded.

A verified requirement must have uploaded status, verified status, a nonempty storage reference, verification timestamp, and a reviewer belonging to the tenant. An expiry date before the database's current date makes it expired; the expiry date itself remains valid. This checks stored verification metadata, not file existence, malware scanning or file content.

The stage editor requires a target and a reason (3–2,000 trimmed characters). Read and update permissions are required, alongside normal tenant/owner/team visibility. Closing, marking won or leaving a closed/won stage also requires Applications manage permission. Partners cannot access this workflow.

Settings → Catalog → Application Stages has a **Require verified documents before entry** switch. It defaults off for existing stages. When enabled, entering that stage requires every active required checklist item to be verified and unexpired. If no active required items exist, there is nothing to block entry. All roles, including administrators, obey an enabled document guard. Configure an unguarded open initial stage: creation rejects closed, won and document-gated initial stages, preventing a create-time bypass.

Stage changes lock the accessible Application base row, then reread its related data. Locking the joined stage in the original snapshot caused a concurrent retry to return a false 404; the base-row-first sequence fixes that. A stale expected stage receives 409. Retrying a move to the current stage is a no-op, with no duplicate history or audit entry. A successful change, its reason/history and its audit entry commit in one transaction. A stage change does not create an enrollment or emit application automation events yet.

The editor retains drafts and failed-save feedback during navigation and prevents duplicate submissions while pending. **Discard and refresh** clears a draft after confirmation and reloads the current stage. Stale-write errors instruct the user to refresh. Cards and controls wrap at narrow widths; the history card no longer stretches to match long application details.

## Migration and setup

Apply `migrations/0111_application_stage_document_guard.sql` before deploying this code. It adds the opt-in stage flag and a document lookup index. It was applied only to the local development database in this session.

Use existing catalog controls to configure checklist definitions and stage requirements. Grant Applications update for ordinary stage changes, and manage for terminal-stage operations. Existing read-only users retain checklist visibility but cannot edit stages.

## Verification

- `tests/application-numbering.test.ts`, `tests/application-transition.test.ts`, `tests/catalog-entity-crud.test.ts`: 38 unit tests passed.
- `scripts/application-workflow-smoke.ts`: local integration checks cover phase-one regressions plus missing/pending/rejected/expired/verified documents, newest-document precedence, initial-stage bypass rejection, foreign-tenant/permission failures, six simultaneous stage retries, single history/audit insertion, stale-stage conflict, invalid target, closing and reopening. Temporary records are removed, including synthetic storage references; no files are uploaded.
- `scripts/ui-application-workflow-smoke.cjs`: 25 browser checks passed with intercepted API fixtures, including narrow/desktop, light/dark, enlarged text, failed-save retention and stable expected-stage retry. Evidence: `ui-audit-2026-09/module-12-phase-two`.
- Final database count, static checks and production build result are recorded in `28_UI_IMPLEMENTATION_PROGRESS.md`.

## Remaining work

Document upload/download authorization, file linking, replacement/review actions, review comments and reminders are not implemented by this phase. The checklist is a read-only view of existing records. Before adding document mutation endpoints, require the same Application row lock for mutations affecting stage readiness, so document review and stage transitions serialize consistently.

The stage checklist item remains incomplete: activity/task prerequisites, fee/payment gates, eligibility/approval gates, operational SLA processing and next-stage suggestions are still pending. Current catalog SLA fields alone do not schedule jobs. Dedicated document-review permissions and application events/automations remain separate work. Full live-role browser acceptance and concurrent catalog configuration edits are not covered by the fixture-based UI tests.
