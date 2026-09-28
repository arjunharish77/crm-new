-- Module 12 first operational slice. A tenant-wide monotonic counter deliberately does
-- not reset when numbering rules or financial years change.
create table "ApplicationNumberCounter" (
  "tenantId" text primary key references "Tenant"(id),
  "value" bigint not null default 0 check ("value" >= 0)
);
create table "ApplicationNumberRule" (
  id text primary key,
  "tenantId" text not null references "Tenant"(id),
  "universityId" text references "University"(id),
  "opportunityTypeId" text references "OpportunityType"(id),
  "intakeId" text references "Intake"(id),
  prefix text not null default 'APP-{YYYY}-',
  suffix text not null default '',
  padding integer not null default 6 check (padding between 1 and 12),
  "financialYearStartMonth" integer not null default 4 check ("financialYearStartMonth" between 1 and 12),
  timezone text not null default 'Asia/Kolkata',
  "updatedBy" text references "User"(id),
  "updatedAt" timestamptz not null default now()
);
create unique index "ApplicationNumberRule_scope_key" on "ApplicationNumberRule"
  ("tenantId", coalesce("universityId", ''), coalesce("opportunityTypeId", ''), coalesce("intakeId", ''));
alter table "Application" add column "requestKey" text, add column "requestHash" text;
create unique index "Application_request_key" on "Application" ("tenantId", "createdBy", "requestKey") where "requestKey" is not null;
create index "Application_tenant_created_idx" on "Application" ("tenantId", "createdAt" desc, id);
create index "Application_tenant_owner_idx" on "Application" ("tenantId", "ownerId");
alter table "ApplicationNumberCounter" enable row level security;
alter table "ApplicationNumberRule" enable row level security;
create policy application_counter_tenant on "ApplicationNumberCounter" for all using ("tenantId" = current_setting('app.tenant_id', true)) with check ("tenantId" = current_setting('app.tenant_id', true));
create policy application_rule_tenant on "ApplicationNumberRule" for all using ("tenantId" = current_setting('app.tenant_id', true)) with check ("tenantId" = current_setting('app.tenant_id', true));
