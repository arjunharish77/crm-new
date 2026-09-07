-- Priority Module 15 -- Telephony: agent availability and capacity.
-- Confirmed by audit before building: User has no online/offline, break-state, working-hours,
-- or call-cap columns at all -- only a plain account "status" enum (ACTIVE/etc.), not a live
-- availability signal. "workingHours" jsonb exists only on Team/SalesGroup, not per-user.
-- User does already have a real "managerId" column, though -- reused directly below as the
-- supervisor relationship for override permission, rather than introducing a parallel
-- supervisor concept.

create table if not exists "AgentAvailability" (
  id text primary key,
  "tenantId" text not null references "Tenant"(id),
  "userId" text not null references "User"(id) on delete cascade,
  status text not null default 'OFFLINE' check (status in ('ONLINE', 'OFFLINE', 'BREAK')),
  "statusReason" text,
  "workingHours" jsonb not null default '{}',
  "dailyCallCap" integer,
  "maxSimultaneousAssignments" integer,
  "lastStatusChangeAt" timestamptz not null default now(),
  "lastStatusChangedBy" text,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now(),
  unique ("tenantId", "userId")
);
create index if not exists "AgentAvailability_tenant_idx" on "AgentAvailability" ("tenantId");
