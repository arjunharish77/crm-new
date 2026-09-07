-- Priority Module 21 -- Tenant Module Entitlements and Modular Platform.
--
-- Scope, deliberately narrow relative to the checklist's full 25-item vision (a genuine
-- multi-month platform initiative: dependency graphs, lifecycle hooks, usage telemetry,
-- billing metadata, retention policies, health badges, contract tests). This pass builds
-- the core catalog + per-tenant entitlement + audit trail, and wires real enforcement
-- into the two modules added earlier in this session that had NO tenant-level kill
-- switch at all (Next-Best Action, Marketing Journey Orchestration) -- closing a real
-- gap rather than only adding scaffolding. The existing ad-hoc `TenantFeature` boolean
-- columns (opportunityEnabled, payoutsEnabled, gamificationEnabled, etc.) are left as-is,
-- not retrofitted into this catalog -- migrating 8 already-wired flags across dozens of
-- existing call sites is a real, separate, high-regression-risk follow-up, not attempted
-- here alongside a new schema.
--
-- Run manually against the database, then re-export SCHEMA.md.

create table if not exists "PlatformModule" (
  "key" text primary key,
  "name" text not null,
  "description" text,
  "category" text not null default 'GENERAL',
  "isCore" boolean not null default false,
  "createdAt" timestamp with time zone not null default now()
);

create table if not exists "TenantModuleEntitlement" (
  "id" text primary key,
  "tenantId" text not null references "Tenant"("id"),
  "moduleKey" text not null references "PlatformModule"("key"),
  "status" text not null default 'ENABLED' check ("status" in ('ENABLED', 'DISABLED', 'SUSPENDED', 'TRIAL')),
  "reason" text,
  "effectiveAt" timestamp with time zone not null default now(),
  "updatedBy" text references "User"("id"),
  "createdAt" timestamp with time zone not null default now(),
  "updatedAt" timestamp with time zone not null default now(),
  unique ("tenantId", "moduleKey")
);

create table if not exists "TenantModuleAuditLog" (
  "id" text primary key,
  "tenantId" text not null references "Tenant"("id"),
  "moduleKey" text not null references "PlatformModule"("key"),
  "action" text not null check ("action" in ('ENABLED', 'DISABLED', 'SUSPENDED', 'TRIAL_STARTED', 'RETIRED')),
  "reason" text,
  "performedBy" text references "User"("id"),
  "performedAt" timestamp with time zone not null default now()
);

create index if not exists "TenantModuleEntitlement_tenant_idx" on "TenantModuleEntitlement" ("tenantId");
create index if not exists "TenantModuleAuditLog_tenant_module_idx" on "TenantModuleAuditLog" ("tenantId", "moduleKey", "performedAt" desc);

alter table "TenantModuleEntitlement" enable row level security;
create policy "tenant_isolation_tenant_module_entitlement" on "TenantModuleEntitlement"
  for all using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));

alter table "TenantModuleAuditLog" enable row level security;
create policy "tenant_isolation_tenant_module_audit_log" on "TenantModuleAuditLog"
  for all using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));

-- PlatformModule is platform-wide (not tenant-scoped), no RLS -- same convention as Tenant itself.

insert into "PlatformModule" ("key", "name", "description", "category", "isCore") values
  ('DASHBOARD', 'Dashboard', 'Home dashboard and widgets.', 'CORE', true),
  ('LEADS', 'Leads', 'Lead records and management.', 'CORE', true),
  ('LISTS', 'Lists', 'Static and smart lead lists.', 'CORE', true),
  ('OPPORTUNITIES', 'Opportunities', 'Opportunity pipeline management.', 'SALES', false),
  ('ACTIVITIES', 'Activities', 'Activity logging.', 'CORE', true),
  ('TASKS', 'Tasks', 'Task management and queues.', 'CORE', true),
  ('VIEWS', 'Views', 'Smart Views module.', 'CORE', true),
  ('FORMS', 'Forms', 'Form builder and CRM placement.', 'SALES', false),
  ('AUTOMATIONS', 'Automations', 'Workflow automation engine.', 'AUTOMATION', false),
  ('REPORTS', 'Reports', 'Inbuilt and custom reports.', 'ANALYTICS', false),
  ('MARKETING', 'Marketing Communications', 'Campaigns, templates, sender identities.', 'MARKETING', false),
  ('JOURNEY_ORCHESTRATION', 'Journey Orchestration', 'Branching multi-step marketing journeys and attribution.', 'MARKETING', false),
  ('PREDICTIVE_SCORING', 'Predictive Scoring', 'Self-learning lead/opportunity scoring.', 'ANALYTICS', false),
  ('NEXT_BEST_ACTION', 'Next-Best Action', 'Recommendation/ranking engine for leads and opportunities.', 'ANALYTICS', false),
  ('AI_COPILOT', 'AI Copilot', 'Optional generative AI assistant.', 'AI', false),
  ('DISTRIBUTION', 'Distribution Engine', 'Automated lead/opportunity assignment rules.', 'AUTOMATION', false),
  ('PARTNERS', 'Partners', 'Partner organizations and portal access.', 'PARTNER', false),
  ('PAYOUTS', 'Payouts', 'Commission and payout management.', 'PARTNER', false),
  ('GAMIFICATION', 'Gamification', 'Points, badges, leaderboard, rewards.', 'PARTNER', false),
  ('PRODUCT_CATALOG', 'Product Catalog', 'Product/course catalog and application management.', 'OPERATIONS', false),
  ('COUNSELING', 'Learning and Counseling Operations', 'Counseling/advising workflows.', 'OPERATIONS', false),
  ('TELEPHONY', 'Telephony', 'Call center and telephony integration.', 'OPERATIONS', false),
  ('SERVICE_DESK', 'Service Desk', 'Case and ticket management.', 'OPERATIONS', false),
  ('QUALITY_MANAGEMENT', 'Quality Management', 'Supervisor coaching and QA scorecards.', 'OPERATIONS', false),
  ('DATA_PLATFORM', 'Data Platform', 'Integrations, exports, data governance.', 'PLATFORM', false),
  ('MARKETPLACE', 'Marketplace', 'App ecosystem and marketplace listings.', 'PLATFORM', false),
  ('SECURITY_ADMIN', 'Security & Admin', 'Tenant-wide security and admin controls.', 'CORE', true),
  ('DEVOPS_OPS', 'DevOps & Ops', 'Release management and operations tooling.', 'PLATFORM', false)
on conflict ("key") do nothing;
