# Module 12 — Explainable eligibility checks

Implemented 15 September 2026 in `crm`, port 3000.

## Available behavior

Application details now include a compact eligibility summary, with expandable check-by-check explanations. The saved applicant facts are qualifying education level, qualifying marks percentage, completed entrance exams, confirmation that exam information is complete, and reviewer notes. Missing facts remain unknown; they are not silently treated as zero marks or no exams.

Users with Applications read permission can view the results within their existing record scope. Editing requires Applications update as well. The editor retains drafts and failed-save feedback, protects dirty dismissal and pending saves, and offers discard/reload recovery after stale-write conflicts.

Each read evaluates the current active rules for the application's program and selected course. Program-wide rules always apply; course-specific rules apply only to the selected course. All applicable checks must be met. This phase does not implement OR groups or alternative admission pathways.

Supported checks:

- Minimum education: `CLASS_10`, `CLASS_12`, `BACHELORS`, `MASTERS`, `DOCTORATE`, in that order. Catalog editing now offers these explicit choices. Unknown legacy levels, including diploma pathways, require manual review rather than being assigned a guessed rank.
- Minimum qualifying percentage: inclusive boundary, from 0–100. Invalid configured thresholds require manual review. Marks are entered for the qualifying education; the system does not infer marks from arbitrary Lead custom fields.
- Required completed entrance exam: exact name match after trimming and case normalization. Exam grades, scores, pass/fail evidence and entrance-exam cutoffs are not inferred.

Outcomes are **Configured checks met**, **Requirements not met**, **More information needed**, **Manual review required**, or **No eligibility rules configured**. No rules never yields a pass. Nonempty legacy `criteria` JSON is flagged for manual review rather than ignored. A rule with no supported constraints also requires review. Individual explanations remain visible when the summary prioritizes a failed check over other unresolved checks.

These checks support a human review. They do not verify documents, approve admission, change stages or create enrollment. Facts and result computation are separate from formal admission decisions.

## Persistence and migration

Apply `migrations/0114_application_eligibility_facts.sql` before deployment; applied locally in this session only. It adds an empty facts object and version zero to existing applications.

Fact saves lock the accessible application and compare an expected integer version. Competing writes cannot silently overwrite each other: one commits, the stale one receives 409. Fact changes and an audit entry commit together. Results are recomputed on each eligibility fetch using current rules; there is no persisted admission approval or historical evaluation snapshot. A catalog change is reflected on the next fetch/refresh, not through a live push to an already-open page.

## Verification

- 31 unit tests passed across eligibility evaluation and existing catalog CRUD. Coverage includes exact marks boundaries, zero marks, missing facts, confirmed no exams, case-insensitive exam matching, lower education levels, unrecognized qualifications, unsupported conditions, empty rules and invalid percentages.
- 33 local database/HTTP checks passed: phase-one regressions, no-rule/missing-data/met/not-met results, live rule updates, inactive-rule exclusion, tenant and edit-permission failures, competing saves, saved facts, actual HTTP read/save, stale-version 409 and unauthenticated 401. Temporary application/catalog/rule/audit records were removed; allocation counters were not reset.
- 13 fixture-browser checks passed: 320px/1280px, light/dark, enlarged text, expanded explanations, dirty dismissal, conflict recovery, pending controls and expected-version retention. Evidence: `ui-audit-2026-09/module-12-phase-five`.
- TypeScript, targeted ESLint and whitespace checks passed. Production build status is recorded in `28_UI_IMPLEMENTATION_PROGRESS.md`.

The local development server was refreshed to load the new API exports. No customer communications were sent and no existing application facts were changed.

## Remaining

Module 12 remains **6/20 fully complete**. This is the first eligibility slice, not the complete rule-builder checklist item. Location, nationality, work experience, document/course prerequisites, arbitrary custom-field conditions, alternative rule groups, exam scoring and approval-history snapshots remain open. Linking eligibility to a guarded stage transition is also a separate phase. Existing document reminders and private document workflows remain available.
