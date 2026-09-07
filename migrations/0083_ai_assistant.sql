-- Gap checklist Module 7: "Optional AI Assistant / Generative Copilot" -- a genuinely optional
-- add-on (per the module's own scope decision: "Keep core CRM workflows independent of paid LLM
-- calls"). Confirmed zero AI-provider code existed anywhere in this codebase before this pass
-- (no OpenAI/Anthropic/generic-LLM reference in src/, and the ml-service Python microservice is
-- sklearn-classifier + sentence-embedding only -- no text-generation capability at all). The
-- `AI_COPILOT` key already existed in the `PlatformModule` catalog (migration 0037) but was
-- completely unwired; this pass is the first real code behind it.
--
-- Provider abstraction: ONE generic connector speaking an OpenAI-compatible Chat Completions
-- wire format (POST {endpointUrl}/chat/completions, {model, messages, max_tokens}), the closest
-- thing to a real industry-standard contract -- supported natively by OpenAI/Azure OpenAI, and
-- by virtually every self-hosted inference server (vLLM, Ollama, LM Studio, text-generation-
-- webui, LocalAI). "EXTERNAL_API" and "SELF_HOSTED" are the same code path with a different
-- configured endpoint/secret, exactly like CommunicationProviderConfig's GENERIC_HTTP treats
-- "the provider" as whatever endpoint the tenant configured rather than hardcoded per-vendor
-- logic. No RLS policy added, matching the precedent set by migrations 0080-0082: tenant scoping
-- is enforced at the application query layer.

-- One row per tenant -- provider mode/endpoint/secret/limits/guardrails (checklist item 1).
create table if not exists "AiProviderSettings" (
  "tenantId" text primary key references "Tenant"(id) on delete cascade,
  enabled boolean not null default false,
  "providerMode" text not null default 'DISABLED' check ("providerMode" in ('DISABLED', 'EXTERNAL_API', 'SELF_HOSTED')),
  "endpointUrl" text,
  model text,
  "secretConfig" jsonb not null default '{}',  -- e.g. {apiKey: "..."} -- redacted on every read, matching CommunicationProviderConfig's convention
  "maxTokensPerRequest" integer not null default 1024,
  "timeoutMs" integer not null default 30000,
  "dailySpendLimitUsd" numeric,
  "monthlySpendLimitUsd" numeric,
  "allowedModules" jsonb not null default '["LEAD","OPPORTUNITY","REPORTS"]',
  "approvalRequiredForExternalSends" boolean not null default false,
  "createdBy" text references "User"(id),
  "updatedBy" text references "User"(id),
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);

-- Prompt governance (checklist item 3): versioned, one row per (tenant, key, version); the
-- current version for a key is the highest-numbered isActive row. `allowedContextFields`/
-- `blockedFields` are dotted-path field lists enforced by buildRecordContextPack before any
-- context ever reaches a rendered prompt -- blockedFields wins if a field appears in both.
create table if not exists "AiPromptTemplate" (
  id text primary key,
  "tenantId" text not null references "Tenant"(id) on delete cascade,
  key text not null,
  name text not null,
  version integer not null default 1,
  template text not null,
  variables jsonb not null default '[]',
  "allowedContextFields" jsonb not null default '[]',
  "blockedFields" jsonb not null default '[]',
  "isActive" boolean not null default true,
  "createdBy" text references "User"(id),
  "updatedBy" text references "User"(id),
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now(),
  unique ("tenantId", key, version)
);
create index if not exists "AiPromptTemplate_tenant_key_idx" on "AiPromptTemplate" ("tenantId", key, "isActive");

-- Real per-request usage/audit trail (checklist items 2's "per-tenant usage accounting", 8's
-- "full audit history", and 9's usage/cost dashboard all draw on this single table). No generic
-- $-spend tracking mechanism existed anywhere in this codebase before this (confirmed: every
-- existing "rate limit" is a short-window Redis counter, not a persistent, dashboard-queryable,
-- currency-denominated running total) -- this is genuinely new ground, not a reuse.
create table if not exists "AiUsageLog" (
  id text primary key,
  "tenantId" text not null references "Tenant"(id) on delete cascade,
  "userId" text references "User"(id),
  module text not null,               -- e.g. "LEAD_SUMMARY", "DRAFT_EMAIL", "NL_REPORT"
  "promptTemplateKey" text,
  "entityType" text,
  "entityId" text,
  "tokensIn" integer,
  "tokensOut" integer,
  "estimatedCostUsd" numeric,
  "latencyMs" integer,
  status text not null check (status in ('SUCCESS', 'FAILED', 'BLOCKED_BUDGET', 'BLOCKED_GUARDRAIL', 'BLOCKED_MODULE')),
  "errorMessage" text,
  "createdAt" timestamptz not null default now()
);
create index if not exists "AiUsageLog_tenant_created_idx" on "AiUsageLog" ("tenantId", "createdAt" desc);
create index if not exists "AiUsageLog_tenant_user_idx" on "AiUsageLog" ("tenantId", "userId", "createdAt" desc);
create index if not exists "AiUsageLog_tenant_module_idx" on "AiUsageLog" ("tenantId", module, "createdAt" desc);

-- Reuses the PrivilegedActionRequest mechanism (built for Module 18, already reused once for
-- Module 3's reassignment-approval workflow) rather than inventing a parallel one -- "no
-- external sends without approval" (checklist item 8) is structurally identical to that same
-- "does this tenant require a second person's sign-off" shape. Gated by AiProviderSettings' own
-- dedicated `approvalRequiredForExternalSends` toggle, not the unrelated
-- SecurityPolicy.privilegedActionApprovalRequired flag -- same reasoning as
-- DISTRIBUTION_REASSIGNMENT's own dedicated toggle in migration 0082.
alter table "PrivilegedActionRequest" drop constraint if exists "PrivilegedActionRequest_actionType_check";
alter table "PrivilegedActionRequest" add constraint "PrivilegedActionRequest_actionType_check"
  check ("actionType" in (
    'TENANT_SUSPEND', 'TENANT_UNSUSPEND', 'IMPERSONATION_START',
    'PERMISSION_TEMPLATE_UPDATE', 'CONNECTOR_SECRET_UPDATE', 'DISTRIBUTION_REASSIGNMENT',
    'AI_EXTERNAL_SEND'
  ));
