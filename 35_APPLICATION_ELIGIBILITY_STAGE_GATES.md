# Application eligibility stage gates

Completed verification 2026-09-28. Migration: `0115_application_stage_eligibility_guard.sql` (already applied locally; include it in the VPS upgrade).

Application stages can opt into **Require eligibility checks to be met before entry**. During a stage transition, the server locks the application and re-evaluates its saved facts against active program/course rules. Only `MET` permits entry. Missing facts, failed checks, manual-review conditions and no configured rules block entry. There is no administrator override. If a stage also requires verified documents, both requirements must pass.

Guarded stages are excluded from initial creation. The workflow explains requirements before saving and retains the selected stage/reason after a failed attempt. Retries and concurrent transitions do not duplicate stage history. Existing facts/stages are not automatically changed by enabling this option.

The rule query uses the current transaction snapshot; catalog rule editing is not serialized with application transitions, and historical eligibility snapshots are not yet stored. Advanced eligibility conditions and broader admission/enrollment workflows remain incomplete. Module 12 stays **6/20 complete**.

Validation: 47 local database/HTTP checks passed in `scripts/application-eligibility-gate-smoke.ts`, including real authentication, document-plus-eligibility blocking, valid transition, stale facts and concurrent retries. Earlier phase-six fixture-browser checks covered stage warnings, failed-save retention and responsive layout. Application/catalog fixtures were removed. The complete regression suite and production builds were checked during the release review.
