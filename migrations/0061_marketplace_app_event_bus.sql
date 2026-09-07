-- Priority Module 16 -- Marketplace and App Ecosystem: app event bus integration.
-- Confirmed by audit before building: registered/installed apps (built in the previous pass
-- this session) had no live event delivery at all -- TenantAppEventSubscription rows were
-- created but nothing ever read them or called an app's webhookUrl. This closes that gap by
-- reusing the exact WebhookOutbox pattern already built for outbound webhook governance
-- (retry/backoff schedule, atomic claim, HMAC-SHA256 signing) rather than a second delivery
-- mechanism, and hooks into the same 5 call sites (leads-postgres.ts/opportunities-postgres.ts)
-- runAutomationsForEvent/enqueueWebhookEvent already use -- scoped to the same event vocabulary
-- (LEAD_CREATED/LEAD_UPDATED/OPPORTUNITY_CREATED/OPPORTUNITY_UPDATED/STAGE_CHANGED), not the
-- checklist's full aspirational list (application/case/partner/payout/scoring events have no
-- equivalent trigger-emission infrastructure anywhere in this codebase yet).

create table if not exists "TenantAppDelivery" (
  id text primary key,
  "tenantId" text not null references "Tenant"(id),
  "appId" text not null references "MarketplaceApp"(id) on delete cascade,
  "eventType" text not null,
  payload jsonb not null,
  "idempotencyKey" text,
  status text not null default 'PENDING' check (status in ('PENDING', 'SENDING', 'DELIVERED', 'FAILED', 'CANCELLED')),
  attempts integer not null default 0,
  "nextRetryAt" timestamptz,
  "httpStatus" integer,
  "responseBody" text,
  error text,
  "processedAt" timestamptz,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now(),
  unique ("appId", "idempotencyKey")
);

create index if not exists "TenantAppDelivery_due_idx" on "TenantAppDelivery" (status, "nextRetryAt");
create index if not exists "TenantAppDelivery_app_idx" on "TenantAppDelivery" ("appId", "createdAt" desc);
