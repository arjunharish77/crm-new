-- Generic external-system push integrations (e.g. LeadSquared), plus an append-only log
-- of every push attempt with the captured request/response. Deliberately synchronous
-- (no queue/retry columns) -- a push happens live when a user clicks Send in the UI.

create table if not exists "ExternalIntegration" (
  "id" text primary key,
  "tenantId" text not null references "Tenant"("id"),
  "name" text not null,
  "targetSystem" text,
  "endpointUrl" text not null,
  "httpMethod" text not null default 'POST',
  "authType" text not null default 'NONE'
    check ("authType" in ('NONE', 'API_KEY_HEADER', 'API_KEY_QUERY', 'BEARER', 'BASIC')),
  "config" jsonb not null default '{}'::jsonb,
  "secretConfig" jsonb not null default '{}'::jsonb,
  "isActive" boolean not null default true,
  "createdBy" text references "User"("id"),
  "updatedBy" text references "User"("id"),
  "createdAt" timestamp with time zone not null default current_timestamp,
  "updatedAt" timestamp with time zone not null default current_timestamp,
  unique ("tenantId", "name")
);

create table if not exists "ExternalPushAttempt" (
  "id" text primary key,
  "tenantId" text not null references "Tenant"("id"),
  "integrationId" text references "ExternalIntegration"("id") on delete set null,
  "leadId" text references "Lead"("id") on delete set null,
  "opportunityId" text references "Opportunity"("id") on delete set null,
  "requestPayload" jsonb,
  "responseStatusCode" integer,
  "responseBody" jsonb,
  "externalRecordId" text,
  "status" text not null check ("status" in ('SUCCESS', 'FAILED')),
  "errorMessage" text,
  "createdBy" text references "User"("id"),
  "createdAt" timestamp with time zone not null default current_timestamp
);

create index if not exists "ExternalPushAttempt_lead_idx"
  on "ExternalPushAttempt" ("tenantId", "integrationId", "leadId", "createdAt" desc);
create index if not exists "ExternalPushAttempt_opportunity_idx"
  on "ExternalPushAttempt" ("tenantId", "integrationId", "opportunityId", "createdAt" desc);
