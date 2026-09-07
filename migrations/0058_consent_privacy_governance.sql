-- Priority Module 9 -- Data Platform, Integrations, and Governance: consent and privacy governance.

-- Real, independently-discovered bug fix, found while investigating this item: the export-
-- governance sensitive-field approval gate (exports.ts createExportRequestForUser sets
-- 'PENDING_APPROVAL'; approveExportRequest/rejectExportRequest set 'QUEUED'/'REJECTED'; the
-- expiry worker sets 'EXPIRED') uses three status values that were never added to
-- ExportRequest's own CHECK constraint, which only ever allowed
-- ('QUEUED','RUNNING','COMPLETED','FAILED','CANCELLED'). Any export that actually trips the
-- sensitive-field rule fails its own INSERT with a constraint violation, and the file-expiry
-- worker job (built the same session as the export governance feature itself) has been failing
-- every time it tries to mark a file EXPIRED. Directly relevant here since a right-to-access
-- export of personal data is exactly the kind of export likely to touch sensitive fields.
alter table "ExportRequest" drop constraint if exists "ExportRequest_status_check";
alter table "ExportRequest" add constraint "ExportRequest_status_check"
  check (status = any (array['PENDING_APPROVAL','QUEUED','RUNNING','COMPLETED','FAILED','CANCELLED','REJECTED','EXPIRED']));

-- Lawful-basis metadata -- confirmed by audit to not exist anywhere; CommunicationConsent was
-- purely a binary opted-in/out flag with no basis for *why* consent is valid.
alter table "CommunicationConsent" add column if not exists "lawfulBasis" text
  check ("lawfulBasis" in ('CONSENT','CONTRACT','LEGITIMATE_INTEREST','LEGAL_OBLIGATION'));

-- Channel consent HISTORY -- CommunicationConsent itself is upsert-only (one row per
-- tenant+entity+channel, overwritten on every change), so no record of prior states survives
-- outside whatever happens to land in the generic AuditLog. This is an explicit, append-only,
-- insert-only log of every consent change, independent of AuditLog (which is generic and not
-- guaranteed to be queried specifically for consent history).
create table if not exists "CommunicationConsentHistory" (
  id text primary key,
  "tenantId" text not null references "Tenant"(id),
  "entityType" text not null,
  "entityId" text not null,
  channel text not null,
  status text not null check (status in ('OPTED_IN','OPTED_OUT')),
  "lawfulBasis" text,
  source text,
  "changedBy" text,
  "createdAt" timestamptz not null default now()
);
create index if not exists "CommunicationConsentHistory_entity_idx" on "CommunicationConsentHistory" ("tenantId", "entityType", "entityId", "createdAt" desc);

-- Suppression retention -- CommunicationSuppression previously lived forever once created, with
-- no TTL/review concept at all. Nullable so existing/most suppressions remain permanent by
-- default (a hard bounce or explicit legal hold generally SHOULD stay suppressed indefinitely);
-- an expiresAt can be set explicitly for time-boxed suppressions (e.g. a temporary complaint
-- hold) that should be eligible for automatic review/removal later.
alter table "CommunicationSuppression" add column if not exists "expiresAt" timestamptz;

-- Right-to-delete / right-to-access flows -- confirmed by audit to not exist anywhere; the
-- existing /dashboard/settings/governance/gdpr page is a pure dead frontend stub (calls
-- /api/governance/gdpr/requests and /api/governance/gdpr/request, neither of which exist).
create table if not exists "PrivacyRequest" (
  id text primary key,
  "tenantId" text not null references "Tenant"(id),
  "requestType" text not null check ("requestType" in ('EXPORT','DELETE')),
  "entityType" text not null check ("entityType" in ('LEAD')),
  "entityId" text not null,
  status text not null default 'PENDING' check (status in ('PENDING','PROCESSING','COMPLETED','PARTIAL','FAILED')),
  "resultFileObjectId" text references "FileObject"(id) on delete set null,
  "resultSummary" jsonb,
  error text,
  "requestedBy" text not null,
  "completedAt" timestamptz,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);
create index if not exists "PrivacyRequest_tenant_idx" on "PrivacyRequest" ("tenantId", "createdAt" desc);
