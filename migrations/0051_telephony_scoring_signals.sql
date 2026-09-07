-- Priority Module 15 -- Telephony: telephony-aware predictive scoring and next-best-action
-- signals. Confirmed by research before building: neither self-learning-scoring.ts nor
-- next-best-action.ts referenced TelephonyCallLog/CallDisposition at all -- a total gap, not
-- partially started. Rather than a parallel signal system, telephony data feeds into the
-- existing feature-snapshot -> weighted-score -> NBA-ranking pipeline this app already has.
-- "callEngagementScore" is a new, explicit, telephony-derived 0-100 signal (answered-call
-- rate, disposition quality, missed callbacks, talk time) kept as its own RecordScore column
-- -- distinct from the generic "engagementScore" -- so it's independently visible to both the
-- scoring UI and next-best-action.ts's ranking formula, rather than being silently folded into
-- an existing composite where it couldn't be inspected or weighted on its own.

alter table "RecordScore" add column if not exists "callEngagementScore" integer;
