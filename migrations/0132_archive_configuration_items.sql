-- Archive and restore for more configuration items (decision 31, extended 2026-10-03): Smart
-- Views, custom reports, assignment rules and rule sets, lead-scoring rules, recommended-action
-- rules, commission rules, gamification rules, CSV import templates and export templates.
-- Delete now sets "deletedAt"; the item stops applying at once, can be restored for 30 days, and
-- is then purged by the archive.purge worker job (or deleted for good sooner). Rows stay in place
-- so ledgers, logs and versions that point at them keep their links.
alter table "CustomReport" add column if not exists "deletedAt" timestamptz, add column if not exists "deletedBy" text;
alter table "AssignmentRule" add column if not exists "deletedAt" timestamptz, add column if not exists "deletedBy" text;
alter table "DistributionRuleSet" add column if not exists "deletedAt" timestamptz, add column if not exists "deletedBy" text;
alter table "LeadScoringRule" add column if not exists "deletedAt" timestamptz, add column if not exists "deletedBy" text;
alter table "NextBestActionRule" add column if not exists "deletedAt" timestamptz, add column if not exists "deletedBy" text;
alter table "CommissionRule" add column if not exists "deletedAt" timestamptz, add column if not exists "deletedBy" text;
alter table "GamificationRule" add column if not exists "deletedAt" timestamptz, add column if not exists "deletedBy" text;
alter table "ImportTemplate" add column if not exists "deletedAt" timestamptz, add column if not exists "deletedBy" text;
alter table "ExportTemplate" add column if not exists "deletedAt" timestamptz, add column if not exists "deletedBy" text;

create index if not exists "CustomReport_deletedAt_idx" on "CustomReport" ("deletedAt") where "deletedAt" is not null;
create index if not exists "AssignmentRule_deletedAt_idx" on "AssignmentRule" ("deletedAt") where "deletedAt" is not null;
create index if not exists "CommissionRule_deletedAt_idx" on "CommissionRule" ("deletedAt") where "deletedAt" is not null;
create index if not exists "GamificationRule_deletedAt_idx" on "GamificationRule" ("deletedAt") where "deletedAt" is not null;
