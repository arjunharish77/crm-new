-- Gap checklist Module 10's "guided onboarding and demo mode" item -- "seeded demo labels" and
-- "safe demo reset utilities". A single boolean per record type, scoped to just Lead and
-- Opportunity (the two record types this session's detail-page work has focused on) rather than
-- every record type in the schema -- a deliberately bounded first cut, not a full demo-data
-- system across every table. Defaults to false so every existing row stays valid with no
-- migration-time backfill needed. This is the ONLY source of truth for "is this a demo record" --
-- reset deletes strictly by this flag, never by name/label pattern-matching.
alter table "Lead" add column if not exists "isDemoData" boolean not null default false;
alter table "Opportunity" add column if not exists "isDemoData" boolean not null default false;
