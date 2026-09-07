-- Gap checklist Module 11: closes the 10 remaining open items on top of the real Service Desk
-- core built earlier this session (migration 0038) -- email/message-to-case routing, escalation
-- management, a knowledge base, macros/templates, communication history, the remaining case
-- automation actions, CSAT/NPS capture, case analytics, merge/duplicate handling, and worker
-- jobs. No RLS policy added for the new tables, matching the precedent set by migrations
-- 0080-0083: tenant scoping is enforced at the application query layer.

-- ---------------------------------------------------------------------------------------------
-- Escalation / SLA-pause state on the existing Case row (item 8, part of item 7)
-- ---------------------------------------------------------------------------------------------
alter table "Case" add column if not exists "slaWarningFiredAt" timestamptz;
alter table "Case" add column if not exists "slaBreachedFiredAt" timestamptz;
alter table "Case" add column if not exists "escalatedAt" timestamptz;
alter table "Case" add column if not exists "escalatedToId" text references "User"(id) on delete set null;
-- Pause/resume (item 7): slaPausedAt marks the clock as currently stopped; on resume, the
-- paused duration is added to slaPausedTotalMinutes and both due dates are pushed out by it --
-- see resolveCaseSlaDueDates in cases-postgres.ts.
alter table "Case" add column if not exists "slaPausedAt" timestamptz;
alter table "Case" add column if not exists "slaPausedTotalMinutes" integer not null default 0;
-- Merge (item 18) -- soft-merge, mirroring Lead/Opportunity's own mergedIntoId/mergedAt columns
-- from the Dedupe/Merge Center (migration 0057).
alter table "Case" add column if not exists "mergedIntoId" text references "Case"(id) on delete set null;
alter table "Case" add column if not exists "mergedAt" timestamptz;

-- CaseComment gains optional links to what produced it (item 9's "attach article to response",
-- item 10's macros, item 5's inbound routing) -- all nullable, a plain manually-typed comment
-- is unaffected.
alter table "CaseComment" add column if not exists "linkedArticleId" text;
alter table "CaseComment" add column if not exists "linkedMacroId" text;
alter table "CaseComment" add column if not exists "inboundMessageId" text;

-- Task gains a real caseId link (item 13's "create task" case-automation action, and the
-- Case detail page's future task panel) -- Task had leadId/opportunityId/activityId but no
-- case equivalent at all before this.
alter table "Task" add column if not exists "caseId" text references "Case"(id) on delete set null;
create index if not exists "Task_case_idx" on "Task" ("tenantId", "caseId") where "caseId" is not null;

-- ---------------------------------------------------------------------------------------------
-- Knowledge base foundation (item 9)
-- ---------------------------------------------------------------------------------------------
create table if not exists "KnowledgeBaseCategory" (
  id text primary key,
  "tenantId" text not null references "Tenant"(id) on delete cascade,
  name text not null,
  description text,
  "parentId" text references "KnowledgeBaseCategory"(id) on delete set null,
  "order" integer not null default 0,
  "isActive" boolean not null default true,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now(),
  unique ("tenantId", name)
);

-- Versioned like AiPromptTemplate (migration 0083): editing never overwrites history, it
-- inserts version+1; the "current" version for a slug is the highest-numbered isActive row.
create table if not exists "KnowledgeBaseArticle" (
  id text primary key,
  "tenantId" text not null references "Tenant"(id) on delete cascade,
  "categoryId" text references "KnowledgeBaseCategory"(id) on delete set null,
  title text not null,
  slug text not null,
  body text not null,
  version integer not null default 1,
  visibility text not null default 'INTERNAL' check (visibility in ('INTERNAL', 'EXTERNAL')),
  "isActive" boolean not null default true,
  "createdBy" text references "User"(id),
  "updatedBy" text references "User"(id),
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now(),
  unique ("tenantId", slug, version)
);
create index if not exists "KnowledgeBaseArticle_tenant_slug_idx" on "KnowledgeBaseArticle" ("tenantId", slug, "isActive");
create index if not exists "KnowledgeBaseArticle_tenant_category_idx" on "KnowledgeBaseArticle" ("tenantId", "categoryId");

create table if not exists "KnowledgeBaseArticleFeedback" (
  id text primary key,
  "tenantId" text not null references "Tenant"(id) on delete cascade,
  "articleId" text not null references "KnowledgeBaseArticle"(id) on delete cascade,
  "caseId" text references "Case"(id) on delete set null,
  "userId" text references "User"(id) on delete set null,
  "isHelpful" boolean not null,
  comment text,
  "createdAt" timestamptz not null default now()
);
create index if not exists "KnowledgeBaseArticleFeedback_article_idx" on "KnowledgeBaseArticleFeedback" ("articleId");

alter table "CaseComment" add constraint "CaseComment_linkedArticleId_fkey"
  foreign key ("linkedArticleId") references "KnowledgeBaseArticle"(id) on delete set null;

-- ---------------------------------------------------------------------------------------------
-- Response templates and macros (item 10)
-- ---------------------------------------------------------------------------------------------
create table if not exists "CaseMacro" (
  id text primary key,
  "tenantId" text not null references "Tenant"(id) on delete cascade,
  name text not null,
  description text,
  channel text check (channel in ('EMAIL', 'WHATSAPP', 'SMS')),  -- null = internal-note-only macro
  "bodyTemplate" text not null,
  "isInternalNote" boolean not null default true,
  "requiresApprovalForExternalReply" boolean not null default false,
  "restrictedToRoleIds" jsonb not null default '[]',  -- empty = usable by every internal user
  "isActive" boolean not null default true,
  "createdBy" text references "User"(id),
  "updatedBy" text references "User"(id),
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now(),
  unique ("tenantId", name)
);

alter table "CaseComment" add constraint "CaseComment_linkedMacroId_fkey"
  foreign key ("linkedMacroId") references "CaseMacro"(id) on delete set null;

-- ---------------------------------------------------------------------------------------------
-- Email-to-case / message-to-case routing (item 5) -- reuses the existing per-tenant inbound
-- webhook HMAC secret (IntegrationSetting type='INBOUND_WEBHOOK', verifyInboundWebhookRequest
-- in inbound-webhooks.ts) rather than a new per-address secret scheme.
-- ---------------------------------------------------------------------------------------------
create table if not exists "CaseInboundAddress" (
  id text primary key,
  "tenantId" text not null references "Tenant"(id) on delete cascade,
  channel text not null check (channel in ('EMAIL', 'WHATSAPP', 'SMS')),
  address text not null,  -- the email address or phone number customers write to
  "defaultQueueId" text references "CaseQueue"(id) on delete set null,
  "defaultCaseTypeId" text references "CaseType"(id) on delete set null,
  "autoAckMacroId" text references "CaseMacro"(id) on delete set null,
  "isActive" boolean not null default true,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now(),
  unique ("tenantId", channel, address)
);

create table if not exists "CaseInboundMessage" (
  id text primary key,
  "tenantId" text not null references "Tenant"(id) on delete cascade,
  "inboundAddressId" text references "CaseInboundAddress"(id) on delete set null,
  channel text not null check (channel in ('EMAIL', 'WHATSAPP', 'SMS')),
  "fromAddress" text not null,
  "toAddress" text,
  subject text,
  body text not null,
  "providerMessageId" text,
  "threadKey" text,  -- normalized (stripped Re:/Fwd:, lowercased) subject+sender, or sender alone for WhatsApp/SMS
  "rawPayload" jsonb not null default '{}',
  "caseId" text references "Case"(id) on delete set null,
  "commentId" text references "CaseComment"(id) on delete set null,
  status text not null default 'PENDING' check (status in ('PENDING', 'ROUTED', 'DUPLICATE', 'REJECTED')),
  "duplicateOfId" text references "CaseInboundMessage"(id) on delete set null,
  "receivedAt" timestamptz not null default now(),
  "createdAt" timestamptz not null default now()
);
create index if not exists "CaseInboundMessage_tenant_thread_idx" on "CaseInboundMessage" ("tenantId", "threadKey");
create index if not exists "CaseInboundMessage_tenant_status_idx" on "CaseInboundMessage" ("tenantId", status);
create unique index if not exists "CaseInboundMessage_provider_msg_uidx"
  on "CaseInboundMessage" ("tenantId", "inboundAddressId", "providerMessageId") where "providerMessageId" is not null;

alter table "CaseComment" add constraint "CaseComment_inboundMessageId_fkey"
  foreign key ("inboundMessageId") references "CaseInboundMessage"(id) on delete set null;

-- Attachment capture (part of item 5 / item 1's deferred CaseAttachment) -- reuses the existing
-- FileObject storage mechanism rather than a new file pipeline.
create table if not exists "CaseAttachment" (
  id text primary key,
  "tenantId" text not null references "Tenant"(id) on delete cascade,
  "caseId" text not null references "Case"(id) on delete cascade,
  "fileObjectId" text not null references "FileObject"(id) on delete cascade,
  "commentId" text references "CaseComment"(id) on delete set null,
  filename text,
  "contentType" text,
  "byteSize" integer,
  source text not null default 'MANUAL' check (source in ('INBOUND', 'MANUAL')),
  "createdBy" text references "User"(id),
  "createdAt" timestamptz not null default now()
);
create index if not exists "CaseAttachment_case_idx" on "CaseAttachment" ("caseId");

-- ---------------------------------------------------------------------------------------------
-- Customer satisfaction capture (item 15)
-- ---------------------------------------------------------------------------------------------
create table if not exists "CaseSurveyResponse" (
  id text primary key,
  "tenantId" text not null references "Tenant"(id) on delete cascade,
  "caseId" text not null references "Case"(id) on delete cascade,
  channel text not null check (channel in ('EMAIL', 'WHATSAPP', 'SMS')),
  "sentAt" timestamptz not null default now(),
  "respondedAt" timestamptz,
  score integer check (score is null or (score >= 1 and score <= 5)),
  comment text,
  "createdAt" timestamptz not null default now()
);
create index if not exists "CaseSurveyResponse_tenant_case_idx" on "CaseSurveyResponse" ("tenantId", "caseId");
create index if not exists "CaseSurveyResponse_tenant_responded_idx" on "CaseSurveyResponse" ("tenantId", "respondedAt");

-- ---------------------------------------------------------------------------------------------
-- Case analytics rollups (item 16 report, item 20 worker job) -- a single-row-per-tenant cache
-- the worker job refreshes periodically; the report route serves from this when fresh, falling
-- back to a live computation when it isn't (matching this codebase's existing report-rollup
-- precedent, e.g. CustomReport's own scheduled-refresh mechanism).
-- ---------------------------------------------------------------------------------------------
create table if not exists "CaseAnalyticsSnapshot" (
  "tenantId" text primary key references "Tenant"(id) on delete cascade,
  "generatedAt" timestamptz not null default now(),
  payload jsonb not null default '{}'
);

-- ---------------------------------------------------------------------------------------------
-- Merge/duplicate handling (item 18) -- extends the existing Dedupe/Merge Center (migration
-- 0057, built for Lead/Opportunity) to also cover Case, rather than a parallel mechanism.
-- ---------------------------------------------------------------------------------------------
alter table "DedupeMatchRule" drop constraint if exists "DedupeMatchRule_entityType_check";
alter table "DedupeMatchRule" add constraint "DedupeMatchRule_entityType_check" check ("entityType" in ('LEAD', 'OPPORTUNITY', 'CASE'));
alter table "DedupeMatchRule" drop constraint if exists "DedupeMatchRule_ruleType_check";
alter table "DedupeMatchRule" add constraint "DedupeMatchRule_ruleType_check" check ("ruleType" in ('EXACT_EMAIL', 'EXACT_PHONE', 'FUZZY_NAME', 'SAME_REQUESTER_EMAIL_OPEN'));

alter table "DedupeMatch" drop constraint if exists "DedupeMatch_entityType_check";
alter table "DedupeMatch" add constraint "DedupeMatch_entityType_check" check ("entityType" in ('LEAD', 'OPPORTUNITY', 'CASE'));

alter table "MergeAudit" drop constraint if exists "MergeAudit_entityType_check";
alter table "MergeAudit" add constraint "MergeAudit_entityType_check" check ("entityType" in ('LEAD', 'OPPORTUNITY', 'CASE'));

-- ---------------------------------------------------------------------------------------------
-- Reuses the PrivilegedActionRequest mechanism (already extended twice this session: Module 3's
-- DISTRIBUTION_REASSIGNMENT, Module 7's AI_EXTERNAL_SEND) for macro-driven external replies a
-- tenant has opted into requiring a second admin's approval for (item 10's "approval for
-- external replies").
-- ---------------------------------------------------------------------------------------------
alter table "PrivilegedActionRequest" drop constraint if exists "PrivilegedActionRequest_actionType_check";
alter table "PrivilegedActionRequest" add constraint "PrivilegedActionRequest_actionType_check"
  check ("actionType" in (
    'TENANT_SUSPEND', 'TENANT_UNSUSPEND', 'IMPERSONATION_START',
    'PERMISSION_TEMPLATE_UPDATE', 'CONNECTOR_SECRET_UPDATE', 'DISTRIBUTION_REASSIGNMENT',
    'AI_EXTERNAL_SEND', 'CASE_MACRO_EXTERNAL_REPLY'
  ));
