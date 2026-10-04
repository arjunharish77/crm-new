-- Round-2 plan wave 1, B3: indexes for the busiest queries, and C6's backfill.
-- Built inside the migration transaction (the runner wraps each file in one), which briefly
-- blocks writes to each table; at current data sizes each index takes seconds.

-- Opportunities by lead (lead page, related lists) and by creation date (the default sort).
create index if not exists "Opportunity_tenant_lead_idx" on "Opportunity" ("tenantId", "leadId");
create index if not exists "Opportunity_tenant_created_idx" on "Opportunity" ("tenantId", "createdAt" desc);

-- Search boxes use `ilike '%text%'`, which a normal index can't serve; trigram indexes can.
create extension if not exists pg_trgm;
create index if not exists "Lead_name_trgm_idx" on "Lead" using gin (name gin_trgm_ops);
create index if not exists "Lead_email_trgm_idx" on "Lead" using gin (email gin_trgm_ops);
create index if not exists "Lead_company_trgm_idx" on "Lead" using gin (company gin_trgm_ops);
create index if not exists "Opportunity_title_trgm_idx" on "Opportunity" using gin (title gin_trgm_ops);
create index if not exists "Task_title_trgm_idx" on "Task" using gin (title gin_trgm_ops);

-- Exact email lookups written as lower(email) = $n (website visits, inbound email, privacy
-- requests, assignment). The duplicate-check index uses lower(btrim(email)), which these can't use.
create index if not exists "Lead_tenant_lower_email_idx" on "Lead" ("tenantId", lower(email));
create index if not exists "User_lower_email_idx" on "User" (lower(email));

-- The per-record run limit counted every execution of an automation for a record with no
-- matching index.
create index if not exists "AutomationExecution_record_idx" on "AutomationExecution" ("tenantId", "automationId", "entityType", "entityId");

-- C6: tasks created on an opportunity before this release didn't record its lead, so they
-- never showed on the lead. Fill it in from the opportunity.
update "Task" t
   set "leadId" = o."leadId"
  from "Opportunity" o
 where t."opportunityId" = o.id
   and t."tenantId" = o."tenantId"
   and t."leadId" is null
   and o."leadId" is not null;
