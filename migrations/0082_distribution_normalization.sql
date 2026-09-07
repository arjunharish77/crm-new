-- Gap checklist Module 3: "Add distribution schema: DistributionRuleSet, DistributionRule,
-- DistributionCondition, DistributionTarget, DistributionQuota, DistributionAvailability,
-- DistributionSimulation, and DistributionDecisionLog." Previously a deliberate consolidation
-- (one AssignmentRule row folding Rule+Condition+Target+Quota into a `conditions` jsonb blob
-- via a "__"-prefixed-key convention) -- reversed here into real normalized tables per an
-- explicit decision to prioritize schema integrity/reporting over the jsonb approach's raw
-- write-throughput edge, now that the blob has grown 10 special keys deep.
--
-- "DistributionRule" itself is NOT a new table -- the existing "AssignmentRule" table already
-- is that table (a real row per rule, not jsonb), so it's kept and extended rather than
-- renamed, avoiding pure-churn renames across ~10 call sites/tests for no behavioral gain.
-- Likewise "DistributionDecisionLog" is not a new parallel table -- "AssignmentLog" already
-- serves exactly that purpose (confirmed real, already populated by a prior pass) and is
-- extended in place with a `trace` column rather than duplicated under a new name.
--
-- Every new child table carries its own denormalized "tenantId" (not just reachable via a
-- ruleId join) to match this codebase's existing convention on every other tenant-scoped
-- child table, and to keep simple `where "tenantId" = $1` app-level scoping working uniformly.
-- No RLS policy is added for the new tables, matching the precedent set by the two immediately
-- prior migrations (0080, 0081): tenant scoping here is enforced at the application query
-- layer, not via Postgres RLS.

create table if not exists "DistributionRuleSet" (
  id text primary key,
  "tenantId" text not null references "Tenant"(id) on delete cascade,
  "entityType" text not null,
  name text not null,
  description text,
  "order" integer not null default 0,
  "isActive" boolean not null default true,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now(),
  unique ("tenantId", "entityType", name)
);

alter table "AssignmentRule" add column if not exists "ruleSetId" text references "DistributionRuleSet"(id) on delete set null;
create index if not exists "AssignmentRule_ruleSet_idx" on "AssignmentRule" ("tenantId", "ruleSetId");

-- Real column replacing the engine-internal conditions.__roundRobinCursor key -- was already
-- never author-facing, so moving it out of the jsonb blob into its own column only makes the
-- "don't reset engine state on an unrelated edit" property structural instead of something
-- updateAssignmentRuleForTenant had to carefully preserve by hand on every conditions rebuild.
alter table "AssignmentRule" add column if not exists "roundRobinCursor" integer not null default -1;

-- New TERRITORY_BASED strategy (closing the routing-strategies gap): the dotted-path record
-- field (e.g. "state", "lead.source") whose value is looked up against each SalesGroup's own
-- territories/states/countries/zipCodes jsonb lists to pick which group's members are eligible.
-- Only meaningful when strategy = 'TERRITORY_BASED'; null/ignored otherwise.
alter table "AssignmentRule" add column if not exists "territoryField" text;

create table if not exists "DistributionCondition" (
  id text primary key,
  "tenantId" text not null references "Tenant"(id) on delete cascade,
  "ruleId" text not null references "AssignmentRule"(id) on delete cascade,
  field text not null,
  operator text not null default 'equals'
    check (operator in (
      'equals', 'not_equals', 'in', 'not_in', 'contains', 'greater_than', 'less_than',
      'greater_than_or_equal', 'less_than_or_equal', 'before', 'after', 'contains_data', 'not_contains_data'
    )),
  value jsonb not null,
  "order" integer not null default 0,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);
create index if not exists "DistributionCondition_rule_idx" on "DistributionCondition" ("tenantId", "ruleId", "order");

-- One row per (rule, user) -- replaces AssignmentRule.targetUserIds (isPoolMember=true rows),
-- conditions.__fallbackUserId (isFallback=true row, which need not also be a pool member),
-- conditions.__userWeights (weight), and conditions.__weightedState (fairnessCredit, the
-- engine's own running per-user credit tally for the WEIGHTED strategy).
create table if not exists "DistributionTarget" (
  id text primary key,
  "tenantId" text not null references "Tenant"(id) on delete cascade,
  "ruleId" text not null references "AssignmentRule"(id) on delete cascade,
  "userId" text not null references "User"(id) on delete cascade,
  "isPoolMember" boolean not null default true,
  "isFallback" boolean not null default false,
  weight integer,
  "fairnessCredit" numeric not null default 0,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now(),
  unique ("ruleId", "userId")
);
create index if not exists "DistributionTarget_rule_idx" on "DistributionTarget" ("tenantId", "ruleId");
create index if not exists "DistributionTarget_user_idx" on "DistributionTarget" ("tenantId", "userId");

-- One optional row per rule -- absent means "no cap," same default as the old jsonb absence.
create table if not exists "DistributionQuota" (
  id text primary key,
  "tenantId" text not null references "Tenant"(id) on delete cascade,
  "ruleId" text not null references "AssignmentRule"(id) on delete cascade,
  "maxAssignmentsPerUser" integer,
  "maxAssignmentsPerWindow" integer,
  "windowPeriod" text check ("windowPeriod" in ('DAY', 'WEEK')),
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now(),
  unique ("ruleId")
);

-- One optional row per rule -- absent means "always active, no required skills," same default
-- as before.
create table if not exists "DistributionAvailability" (
  id text primary key,
  "tenantId" text not null references "Tenant"(id) on delete cascade,
  "ruleId" text not null references "AssignmentRule"(id) on delete cascade,
  "activeFrom" date,
  "activeUntil" date,
  "requiredSkills" text[],
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now(),
  unique ("ruleId")
);

-- Persisted simulation runs, replacing today's compute-and-discard simulate dialog. Covers
-- both the existing standalone simulator (draftRuleOverride null -- simulated against the real
-- saved rules) and the new in-builder draft simulation (draftRuleOverride holds the unsaved
-- rule-builder form's config, simulated in isolation without touching any saved rule).
create table if not exists "DistributionSimulation" (
  id text primary key,
  "tenantId" text not null references "Tenant"(id) on delete cascade,
  "entityType" text not null,
  "inputRecord" jsonb not null,
  "draftRuleOverride" jsonb,
  result jsonb not null,
  trace jsonb not null,
  "runBy" text references "User"(id),
  "createdAt" timestamptz not null default now()
);
create index if not exists "DistributionSimulation_tenant_idx" on "DistributionSimulation" ("tenantId", "entityType", "createdAt" desc);

-- AssignmentLog = the real DistributionDecisionLog. `trace` persists the full per-candidate
-- skip-reason trace for every real (non-simulated) decision, not just the final outcome/reason
-- string -- closes the "persisting the full skip-reason trace beyond the single point-in-time
-- decision" gap noted against the explainability item.
alter table "AssignmentLog" add column if not exists trace jsonb;

-- Reassignment governance (approval workflow + reassignment-count limits). A dedicated toggle
-- rather than reusing SecurityPolicy.privilegedActionApprovalRequired -- that flag already
-- gates 2 unrelated actions (permission template changes, API key rotation) with its own
-- hardcoded settings-page label set; folding reassignment approval into the same switch would
-- silently change behavior for any tenant that already turned it on for those, which they
-- never opted into for this.
alter table "SecurityPolicy" add column if not exists "reassignmentApprovalRequired" boolean not null default false;
alter table "SecurityPolicy" add column if not exists "reassignmentLimitCount" integer;
alter table "SecurityPolicy" add column if not exists "reassignmentLimitWindowDays" integer;

-- Extend the privileged-action-request closed set with the new tenant-scoped reassignment
-- approval action type.
alter table "PrivilegedActionRequest" drop constraint if exists "PrivilegedActionRequest_actionType_check";
alter table "PrivilegedActionRequest" add constraint "PrivilegedActionRequest_actionType_check"
  check ("actionType" in (
    'TENANT_SUSPEND', 'TENANT_UNSUSPEND', 'IMPERSONATION_START',
    'PERMISSION_TEMPLATE_UPDATE', 'CONNECTOR_SECRET_UPDATE', 'DISTRIBUTION_REASSIGNMENT'
  ));

-- ---------------------------------------------------------------------------------------------
-- Data backfill: parse every existing AssignmentRule.conditions/targetUserIds row into the new
-- normalized tables before the legacy columns are dropped below. md5(random()::text ||
-- clock_timestamp()::text || <natural key>) is used for generated ids -- no uuid/pgcrypto
-- extension is enabled anywhere in this schema (confirmed by grep) to rely on gen_random_uuid().
-- ---------------------------------------------------------------------------------------------

-- Real match conditions: every non-"__" key of `conditions`.
insert into "DistributionCondition" (id, "tenantId", "ruleId", field, operator, value, "order", "createdAt", "updatedAt")
select
  md5(random()::text || clock_timestamp()::text || r.id || kv.key),
  r."tenantId", r.id, kv.key,
  case when jsonb_typeof(kv.value) = 'object' and (kv.value ? 'operator')
    then coalesce(kv.value->>'operator', 'equals')
    else 'equals' end,
  case when jsonb_typeof(kv.value) = 'object' and (kv.value ? 'operator')
    then coalesce(kv.value->'value', 'null'::jsonb)
    else kv.value end,
  (row_number() over (partition by r.id order by kv.key))::int - 1,
  now(), now()
from "AssignmentRule" r
cross join lateral jsonb_each(coalesce(r.conditions, '{}'::jsonb)) as kv(key, value)
where kv.key not like '\_\_%' escape '\';

-- Targets: union of pool members (targetUserIds) and the fallback user, deduped per (rule,
-- user) since a fallback can also be a pool member. Dangling user ids (a user later deleted,
-- never cleaned out of the old jsonb/array) are silently skipped rather than failing the FK.
with rule_users as (
  select r.id as "ruleId", r."tenantId", u."userId", true as "isPoolMember", false as "isFallback"
  from "AssignmentRule" r
  cross join lateral unnest(coalesce(r."targetUserIds", '{}'::text[])) as u("userId")
  union all
  select r.id as "ruleId", r."tenantId", r.conditions->>'__fallbackUserId' as "userId", false as "isPoolMember", true as "isFallback"
  from "AssignmentRule" r
  where coalesce(r.conditions->>'__fallbackUserId', '') <> ''
),
merged as (
  select "ruleId", "tenantId", "userId",
    bool_or("isPoolMember") as "isPoolMember",
    bool_or("isFallback") as "isFallback"
  from rule_users
  group by "ruleId", "tenantId", "userId"
)
insert into "DistributionTarget" (id, "tenantId", "ruleId", "userId", "isPoolMember", "isFallback", weight, "fairnessCredit", "createdAt", "updatedAt")
select
  md5(random()::text || clock_timestamp()::text || m."ruleId" || m."userId"),
  m."tenantId", m."ruleId", m."userId", m."isPoolMember", m."isFallback",
  nullif(r.conditions->'__userWeights'->>m."userId", '')::integer,
  coalesce(nullif(r.conditions->'__weightedState'->>m."userId", '')::numeric, 0),
  now(), now()
from merged m
join "AssignmentRule" r on r.id = m."ruleId"
where exists (select 1 from "User" u where u.id = m."userId" and u."tenantId" = m."tenantId");

-- Quota: one row per rule that configured either cap.
insert into "DistributionQuota" (id, "tenantId", "ruleId", "maxAssignmentsPerUser", "maxAssignmentsPerWindow", "windowPeriod", "createdAt", "updatedAt")
select
  md5(random()::text || clock_timestamp()::text || r.id || 'quota'),
  r."tenantId", r.id,
  nullif(r.conditions->>'__maxAssignmentsPerUser', '')::integer,
  nullif(r.conditions->>'__maxAssignmentsPerWindow', '')::integer,
  nullif(r.conditions->>'__windowPeriod', ''),
  now(), now()
from "AssignmentRule" r
where (r.conditions ? '__maxAssignmentsPerUser') or (r.conditions ? '__maxAssignmentsPerWindow');

-- Availability: one row per rule that configured an activation window and/or required skills.
insert into "DistributionAvailability" (id, "tenantId", "ruleId", "activeFrom", "activeUntil", "requiredSkills", "createdAt", "updatedAt")
select
  md5(random()::text || clock_timestamp()::text || r.id || 'avail'),
  r."tenantId", r.id,
  nullif(r.conditions->>'__activeFrom', '')::date,
  nullif(r.conditions->>'__activeUntil', '')::date,
  case when jsonb_typeof(r.conditions->'__requiredSkills') = 'array'
    then (select array_agg(x) from jsonb_array_elements_text(r.conditions->'__requiredSkills') as t(x))
    else null end,
  now(), now()
from "AssignmentRule" r
where (r.conditions ? '__activeFrom')
   or (r.conditions ? '__activeUntil')
   or (jsonb_typeof(r.conditions->'__requiredSkills') = 'array');

-- Round-robin cursor: carry forward any in-flight position rather than resetting every rule's
-- queue back to the start.
update "AssignmentRule" set "roundRobinCursor" = coalesce(nullif(conditions->>'__roundRobinCursor', '')::integer, -1);

-- Legacy jsonb/array columns fully superseded by the tables above -- dropped now that every
-- row has been migrated, completing the move away from the jsonb consolidation.
alter table "AssignmentRule" drop column if exists conditions;
alter table "AssignmentRule" drop column if exists "targetUserIds";
