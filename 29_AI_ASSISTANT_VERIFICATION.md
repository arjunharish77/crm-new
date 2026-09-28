# AI Assistant verification — 2026-09-11

## Current conclusion — updated 2026-09-12

The workspace now uses Groq in External API mode with model `openai/gpt-oss-20b` and endpoint `https://api.groq.com/openai/v1`. The live connection test succeeded. All six Lead actions returned generated text, Email/SMS/WhatsApp drafting returned content, and a natural-language report returned a validated definition and CRM preview. Usage and eight prompt templates were readable. [Live Lead/provider evidence](ui-audit-2026-09/ai-groq-live/results.json) contains 12 successful checks with response lengths/statuses, without keys or record content.

The earlier OpenAI connection reached the provider but failed with exhausted credits. Groq resolves that connection/generation blocker for this workspace. Successful responses establish functional generation for the tested requests; they do not establish factual quality for every record or prompt.

[Live Opportunity evidence](ui-audit-2026-09/ai-groq-opportunity-live/results.json) adds seven successful checks: all six record actions and an Email draft with two generated variants. Across both record types, **19 live checks passed**. No messages were sent or customer records changed.

## Fixes

- Test uses saved settings explicitly: unsaved key/configuration edits disable Test; edits clear previous test results; failed settings loads offer Retry.
- Provider requests do not follow redirects with credentials. Provider errors redact any echoed API key.
- Exhausted provider credits produce an actionable message rather than an opaque provider JSON error.
- Communication drafts and natural-language reports now enforce the same module and estimated-spend policy as record actions. Draft variants check policy before each provider call.

## Verification coverage

The AI test suite covers secret redaction/preservation, configured connector requests, all six built-in record actions (summary, timeline, call notes, next task, score explanation and manager review), generated communication drafts without automatic sends, confirmation/approval routing, natural-language report validation, usage logging, prompt-template versions, record/field permissions, module restrictions, estimated-spend limits, provider failures, timeouts, empty responses and quota errors. Provider and database responses in this suite are mocked.

The browser settings test uses fixture credentials/responses and verifies Save-before-Test, clearing a successful test after edits, and narrow/wide layout. It never changes the workspace's real provider configuration.

## Remaining acceptance

- Human review of provider output quality across representative records and more complex report requests. The live report check used a deliberately small Lead-name query; complex joins and aggregations are not accepted by that check.
- Real send/approval delivery acceptance is separate; no customer messages were sent.
- Spend checks use estimated historical costs and the existing model-rate table; unknown models have zero estimated cost. They are not a provider-enforced billing cap or a reservation against concurrent requests.
- This connector expects Chat Completions-compatible HTTP requests; native provider APIs are not automatically supported by entering a key alone.

Final focused results: **37 AI tests passed**. [Settings browser evidence](ui-audit-2026-09/ai-settings/results.json) records three passing checks covering the Save/Test interaction and 320/1280px layouts. Provider form width and unbroken endpoint help text were corrected during visual verification. All browser saves/tests here used intercepted fixture responses.

## AI panel UI — iteration twelve

Actions wrap and stack on phones, generated text wraps within the sheet, and the scrollable body stays within the viewport. All record-action buttons wait for the current record action. Record changes discard old generated results and delayed responses. Changing communication channels clears generated/composed drafts; channel edits are disabled while drafting or sending. Draft recipient, subject and message fields have associated labels.

[AI/finance browser evidence](ui-audit-2026-09/phase-g-ai-finance/results.json) covers action/result/draft layouts at 320/1280px, the action busy guard and channel reset. Provider responses in this browser suite are fixtures. Live provider evidence is listed separately above. No confirm/send calls or customer communications were made during verification.

Iteration-twelve verification reran the focused AI suite: **37 tests passed**. TypeScript, targeted ESLint and the production build also passed. Temporary authenticated browser files were removed.

## Extended report verification — 2026-09-12

The broader live test found that the earlier simple-report success did not establish complex report reliability. [Initial evidence](ui-audit-2026-09/ai-report-extended/results.json) records five server errors and one misleading grouped-count response: ordinary Lead IDs were labelled “Count.”

Corrections:

- Add a system-level report contract with supported operators, exact ordering shape, related-field syntax, current UTC date and an explicit unsupported-request response. This applies even when an existing saved prompt template is used.
- Validate generated definitions strictly before query execution. Normalize a singleton sort array; reject multiple sorts and unknown properties instead of silently dropping requested operations. Invalid fields/formats return actionable errors.
- PostgreSQL `Date` values now participate in date comparisons and sorting. Previously date-range filters could exclude valid records.
- Applying an AI definition resets the builder's previous source view, sort and row limit to match the generated preview. Clear the previous preview when a new generation starts and guard repeated generation clicks.
- Builder help directs grouped counts and totals to Metrics. The AI row-report helper does **not** implement aggregations or grouping.

[Post-contract live evidence](ui-audit-2026-09/ai-report-extended-fixed/results.json): score-filtered and sorted Leads, Opportunity/Lead/Owner related columns, a date-range definition and deliberate no-match filtering generate valid definitions and previews. Grouped count and summed-amount requests are explicitly rejected with HTTP 400 rather than approximated. The date check in this intermediate capture preceded the Date-value fix; final independent verification is recorded separately.

These tests verify the accessible query-engine dataset, which currently fetches at most 1,000 root records before filtering. They do not establish full-tenant reporting completeness for larger datasets. Relative-date timezone interpretation, arbitrary prompts, additional related-object paths and aggregate metric generation remain outside this acceptance.

[Final independent and browser evidence](ui-audit-2026-09/ai-report-final/results.json): five checks passed. Independent filtering found 359 qualifying scored Leads, 1,000 qualifying dates within the fetched dataset and zero deliberately unmatched names; top-five ordering matched independently calculated values, allowing unspecified tie ordering. A live AI date request through the builder returned five rows, matched a direct query, and populated the source/sort/limit used by Run Preview. No reports were saved. The focused AI/report suites passed **61 tests**, including a regression for PostgreSQL Date values and mixed serialized dates.

Final report-follow-up validation: 61 focused tests, TypeScript, targeted ESLint, whitespace checks and production build passed. Temporary browser authentication files were removed.

## Additional record workflows — 2026-09-12

Open a Lead or Opportunity → More actions → AI Assistant → Workflow. Choose a workflow and select Generate workflow. Results remain in the assistant for review and copying.

| Workflow | Reviewable output |
|---|---|
| Qualification review | Known facts, missing qualification details, discovery questions and a suggested next step. Missing facts are labelled unknown. |
| Follow-up plan | Evidence of delay, open commitments, three suggested next steps and when to stop or ask the owner. Does not assume every record is stalled. |
| Objection preparation | Recorded objections, clarification questions, suggested responses and clearly separated hypothetical concerns. No invented prices, discounts or guarantees. |
| Rep handoff brief | Context, recent history, open commitments, risks and a next-owner checklist. Does not transfer ownership. |

These workflows reuse governed prompt templates, record context, module/spend checks and usage logging. Context includes a limited recent history, not every interaction. They generate text only: no task creation, status changes, owner reassignment, scheduling or customer messages. Labels and descriptions live in one shared workflow registry; the picker prevents adding another large action-button grid to the panel.

The focused AI suite now passes **54 tests**, including each workflow on both record types, blocked-module behavior, unsupported workflow/entity rejection and no communication queue calls. Provider responses in unit tests are mocked; live evidence is recorded separately.

[Live workflow evidence](ui-audit-2026-09/ai-workflows/results.json): all four workflows passed on Leads through the browser and on Opportunities through the API (**eight live Groq generations**). Layout checks passed at 320/1280px. Responses were nonempty and between 154 and 317 words in these samples; this does not establish factual accuracy for arbitrary records. Evidence stores lengths and counts, not keys or full generated content. No tasks, messages or owner changes were made.

Final workflow validation: 54 focused AI tests, eight live Groq generations, two viewport checks, TypeScript, targeted ESLint, whitespace checks and production build passed. Temporary authenticated browser files were removed.

## Live regression — 2026-09-14

The saved provider connection passed. The ten record actions (six original actions plus four workflows) were called for both a live Lead and Opportunity: 19 of the first 20 requests returned nonempty text. Opportunity call preparation returned HTTP 400/empty content, failed once more with the same empty-response message, then succeeded on a later retry. All 20 combinations therefore have a successful sample, but this does not establish consistently reliable output or factual accuracy.

A live AI report generated successfully; follow-up independently executed the generated definition and matched all five preview rows. No report was saved. [Initial regression](ui-audit-2026-09/live-acceptance-20260913/results.json) and [final follow-up](ui-audit-2026-09/ai-regression-followup/results.json) retain status/length evidence, not keys or generated record content. Intermediate empty-response retries were observed during this run.

The connector now reports output-budget exhaustion separately when an empty response has `finish_reason: length`. The intermittent call-preparation failure was not conclusively attributed to that condition. Provider/model/token settings were not changed. Groq documents reasoning effort and completion budget controls in its [API reference](https://console.groq.com/docs/api-reference); no provider-specific parameter was added in this phase. The focused AI suite passes **55 tests**, including the new output-limit error case.

This pass did not regenerate communication drafts, confirm/send messages, or validate every role. Successful action requests write normal AI usage logs.

The final [saved-provider connection check](ui-audit-2026-09/ai-regression-followup/connection.json) explicitly returned HTTP 200 and `ok: true`.

## Empty response diagnosed and mitigated — 2026-09-14

The [diagnostic run](ui-audit-2026-09/ai-live-diagnostics/results.json) reproduced a failed Opportunity call brief with `finish_reason: length`, a reasoning field and 1,024 completion tokens. This confirms output-budget exhaustion for that sample; earlier failures without metadata cannot be assigned the same cause conclusively.

For Groq's `openai/gpt-oss-20b` and `openai/gpt-oss-120b` only, requests now use `reasoning_effort: low`. The saved 1,024-token cap and credentials remain unchanged. Groq documents the option as reducing reasoning-token use in its [reasoning guide](https://console.groq.com/docs/reasoning). The [three-sample rerun](ui-audit-2026-09/ai-reasoning-budget-fixed/results.json) passed; future longer requests can still exhaust the cap. No automatic provider retry or token increase was introduced.

UI failures now have persistent Retry and preserve the previous answer. Limited diagnostic metadata is stored with failure logs, but raw reasoning text is never used as a fallback answer or recorded by this change. **60 focused tests** and **28 fixture browser checks** pass.

The [follow-up report check](ui-audit-2026-09/ai-reasoning-report/results.json) passed after the reasoning change: an additional call-preparation response was nonempty and the AI report's five-row preview matched direct execution. Across the two post-adjustment checks, four sampled call briefs succeeded. Manager and counselor real-login checks also confirmed both roles receive 403 from the tenant-admin AI settings endpoint; this is not full role coverage for every AI action.
