-- Gap checklist: "Add MFA policy controls." TOTP-based (RFC 6238), no external service --
-- see src/lib/server/totp.ts for the hand-rolled HMAC-SHA1 implementation, verified against
-- RFC 4226's canonical test vectors.
alter table "User" add column if not exists "mfaEnabled" boolean not null default false;
alter table "User" add column if not exists "mfaSecret" text;
alter table "User" add column if not exists "mfaEnrolledAt" timestamptz;
-- Per-user override: true forces MFA regardless of role/tenant policy, false explicitly exempts
-- this one user, null (the default) means "inherit from role/tenant policy" -- a real tri-state,
-- not a boolean default-false that couldn't express "explicitly exempt."
alter table "User" add column if not exists "mfaRequired" boolean;

-- Required MFA by role (one of the 3 named axes -- role/user/team; team is NOT built, see the
-- checklist note this migration's own PR/commit corresponds to for why).
alter table "Role" add column if not exists "mfaRequired" boolean not null default false;

create table if not exists "MfaBackupCode" (
  id text primary key,
  "userId" text not null references "User"(id),
  "tenantId" text references "Tenant"(id),
  "codeHash" text not null,
  used boolean not null default false,
  "usedAt" timestamptz,
  "createdAt" timestamptz not null default now()
);

-- "Remembered devices": an opaque, hashed token in an httpOnly cookie lets a login skip the
-- MFA prompt for a device the user already verified recently -- hashed the same way backup
-- codes are (never store the raw token), so a database read alone can't be replayed as a
-- working trusted-device cookie.
create table if not exists "TrustedDevice" (
  id text primary key,
  "userId" text not null references "User"(id),
  "tenantId" text references "Tenant"(id),
  "tokenHash" text not null,
  "userAgent" text,
  "ipAddress" text,
  "createdAt" timestamptz not null default now(),
  "lastUsedAt" timestamptz not null default now(),
  "expiresAt" timestamptz not null
);

-- "Enforcement rollout mode": DISABLED (feature off) / OPTIONAL (opt-in) / REQUIRED_NEW_USERS
-- (only accounts created after mfaEnforcedSince must enroll -- the actual "rollout" pattern,
-- letting a tenant require MFA going forward without disrupting every existing user at once) /
-- REQUIRED_ALL (everyone, existing users included, within the grace period below).
alter table "SecurityPolicy" add column if not exists "mfaEnforcementMode" text not null default 'OPTIONAL'
  check ("mfaEnforcementMode" in ('DISABLED', 'OPTIONAL', 'REQUIRED_NEW_USERS', 'REQUIRED_ALL'));
alter table "SecurityPolicy" add column if not exists "mfaEnforcedSince" timestamptz;
alter table "SecurityPolicy" add column if not exists "mfaGracePeriodDays" integer not null default 14;

create index if not exists "MfaBackupCode_user_idx" on "MfaBackupCode" ("userId", used);
create index if not exists "TrustedDevice_user_idx" on "TrustedDevice" ("userId", "expiresAt");
create unique index if not exists "TrustedDevice_token_key" on "TrustedDevice" ("tokenHash");
