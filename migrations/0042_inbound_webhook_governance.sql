-- Priority Module 9 -- Data Platform, Governance: inbound webhook governance.
-- The inbound lead-capture endpoint (POST /api/integrations/inbound/leads/[tenantId]) had
-- exactly one global secret (WEBHOOK_SIGNING_SECRET env var) shared across every tenant --
-- anyone holding it could push a lead into ANY tenant by swapping the tenantId in the URL.
-- Per-tenant secrets live in the existing generic "IntegrationSetting" table
-- (type = 'INBOUND_WEBHOOK', same pattern TELEPHONY already uses) -- no new table needed
-- for that. This migration adds the one genuinely new concept: a durable log of inbound
-- events, used for BOTH idempotency-key dedupe (replay protection) and as a dead-letter
-- queue for requests that authenticated fine but failed downstream.

create table if not exists "InboundWebhookEvent" (
  id text primary key,
  "tenantId" text not null references "Tenant"(id),
  "idempotencyKey" text,
  status text not null check (status in ('ACCEPTED', 'DUPLICATE', 'REJECTED', 'FAILED')),
  payload jsonb,
  "leadId" text references "Lead"(id) on delete set null,
  "errorMessage" text,
  "createdAt" timestamptz not null default now()
);

create index if not exists "InboundWebhookEvent_tenantId_createdAt_idx"
  on "InboundWebhookEvent" ("tenantId", "createdAt" desc);

-- Partial unique index: only enforce idempotency-key uniqueness when a key was actually
-- supplied (many callers won't send one, and null-vs-null shouldn't collide).
create unique index if not exists "InboundWebhookEvent_tenantId_idempotencyKey_key"
  on "InboundWebhookEvent" ("tenantId", "idempotencyKey")
  where "idempotencyKey" is not null;
