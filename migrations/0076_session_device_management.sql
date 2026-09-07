-- Gap checklist: "Add session and device management." Confirmed by direct audit before
-- building: auth is a single stateless JWT (signAuthToken, flat 7-day expiry) with no
-- server-side session record anywhere -- nothing to list, revoke, or apply an idle/absolute
-- timeout to. This table is that missing record. Each JWT now carries a "sid" claim
-- referencing one row here; a row with no matching JWT anymore (expired/deleted) is simply
-- inert, so nothing needs to reference the User table with an on-delete cascade concern beyond
-- the standard FK.
create table if not exists "UserSession" (
  id text primary key,
  "tenantId" text references "Tenant"(id),
  "userId" text not null references "User"(id),
  "userAgent" text,
  "ipAddress" text,
  "isImpersonation" boolean not null default false,
  "impersonatedBy" text references "User"(id),
  "createdAt" timestamptz not null default now(),
  "lastActiveAt" timestamptz not null default now(),
  "expiresAt" timestamptz not null,
  "revokedAt" timestamptz,
  "revokedBy" text,
  "revokedReason" text
);

create index if not exists "UserSession_user_active_idx" on "UserSession" ("userId", "revokedAt", "expiresAt");
create index if not exists "UserSession_tenant_idx" on "UserSession" ("tenantId");

-- Note: "SecurityPolicy" is NOT created here -- it already exists in db-bootstrap/base-schema.sql
-- (a pre-existing table with exactly the columns this pass needs: sessionTimeoutMinutes,
-- maxConcurrentSessions, enforceSessionTimeout, maxLoginAttempts, lockoutDurationMinutes,
-- logFailedLoginAttempts, plus several more). Confirmed by direct audit before building: it has
-- had zero backing code anywhere in this app -- no API route, no server function, nothing ever
-- read or wrote it, and its own settings-page UI (src/app/dashboard/admin/security/page.tsx)
-- calls /api/platform-admin/security/policies, a route that does not exist. A real,
-- previously-undocumented dead stub, not a new table to add.
