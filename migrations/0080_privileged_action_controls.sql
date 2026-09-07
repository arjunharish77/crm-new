-- Gap checklist: "Add privileged action controls" -- step-up authentication or approval for
-- tenant suspension, impersonation, permission template changes, and connector secret changes.
-- These 4 named actions had zero approval gate anywhere (payout transitions, destructive
-- imports, and sensitive-data exports already have their own independent gates from earlier
-- passes -- confirmed unaffected by this migration).
--
-- Deliberately a NEW generic table rather than reusing imports'/exports' "add a
-- PENDING_APPROVAL status to the existing job/request row" pattern: those two already had a
-- natural per-domain row to attach a status to (an ImportJob, an ExportRequest). None of these
-- 4 actions do -- a tenant status flip, an impersonation session, a permission-template PATCH,
-- and an API key rotation have no equivalent "job" row of their own, so a shared queue table is
-- the honest fit here instead of retrofitting 4 unrelated tables with a status column each.
create table if not exists "PrivilegedActionRequest" (
  id text primary key,
  "tenantId" text references "Tenant"(id), -- null for platform-scoped actions (tenant suspend/unsuspend, impersonation start)
  "actionType" text not null check ("actionType" in (
    'TENANT_SUSPEND', 'TENANT_UNSUSPEND', 'IMPERSONATION_START',
    'PERMISSION_TEMPLATE_UPDATE', 'CONNECTOR_SECRET_UPDATE'
  )),
  "targetType" text not null,
  "targetId" text,
  payload jsonb not null default '{}', -- the change to apply once approved (e.g. the permission-template patch body)
  reason text,
  status text not null default 'PENDING' check (status in ('PENDING', 'APPROVED', 'REJECTED', 'EXECUTED')),
  "requestedBy" text not null references "User"(id),
  "decidedBy" text references "User"(id),
  "decidedAt" timestamptz,
  "decisionNote" text,
  "executedAt" timestamptz,
  "createdAt" timestamptz not null default now()
);
create index if not exists "PrivilegedActionRequest_tenant_idx" on "PrivilegedActionRequest" ("tenantId", status, "createdAt" desc);

-- Tenant-level opt-in toggle (default off -- no existing tenant's workflow changes unless an
-- admin deliberately turns this on), gating the 2 tenant-scoped actions: permission template
-- changes and connector secret changes (API key rotation, in this pass -- see the checklist
-- writeup for the narrower-than-ideal scope on the connector-secret side).
alter table "SecurityPolicy" add column if not exists "privilegedActionApprovalRequired" boolean not null default false;

-- Platform-level equivalent for the 2 platform-scoped actions (tenant suspend/unsuspend,
-- impersonation start) -- no PlatformConfig/PlatformSettings singleton existed anywhere in this
-- codebase before this to hang a platform-wide toggle on, so this is a new, minimal one rather
-- than a broader settings table this pass doesn't need.
create table if not exists "PlatformSecuritySettings" (
  id text primary key,
  "privilegedActionApprovalRequired" boolean not null default false,
  "updatedBy" text,
  "updatedAt" timestamptz not null default now()
);
