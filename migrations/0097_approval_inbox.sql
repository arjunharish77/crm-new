-- Gap checklist Module 10's "approval inbox" item, "partner changes" sub-item -- the one named
-- domain with genuinely no approval concept at all (confirmed by audit: PATCH /api/partners/[id]
-- is already tenant-admin-only, so a partner has never been able to change their own profile at
-- all, self-service or otherwise). A partner submits a proposed change to their own profile;
-- it only actually applies once a tenant admin approves it.
create table if not exists "PartnerChangeRequest" (
  id text primary key,
  "tenantId" text not null,
  "partnerProfileId" text not null references "PartnerProfile"(id),
  "requestedBy" text not null references "User"(id),
  "proposedChanges" jsonb not null,
  status text not null default 'PENDING' check (status in ('PENDING', 'APPROVED', 'REJECTED')),
  "reviewedBy" text references "User"(id),
  "reviewedAt" timestamp with time zone,
  "reviewComment" text,
  "createdAt" timestamp with time zone not null default now(),
  "updatedAt" timestamp with time zone not null default now()
);

create index if not exists "PartnerChangeRequest_tenant_status_idx" on "PartnerChangeRequest" ("tenantId", status);
