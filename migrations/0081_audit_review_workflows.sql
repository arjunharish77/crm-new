-- Gap checklist: "Add audit review workflows" -- saved audit filters, anomaly flags, reviewer
-- assignment, comments, status, evidence export, and retention/legal-hold support.
-- Saved filters reuse the existing generic saved-views mechanism (CustomReport/SavedView --
-- `module` is a free-form string, "AUDIT_LOGS" needs no schema change there at all). Evidence
-- export reuses the existing ExportRequest pipeline (a new "AUDIT_LOGS" ExportModuleName, no
-- new export schema needed either). This migration covers the 3 sub-items that DO need new
-- columns/tables: status, reviewer assignment, anomaly flags, comments, and legal hold.

alter table "AuditLog" add column if not exists "reviewStatus" text not null default 'UNREVIEWED'
  check ("reviewStatus" in ('UNREVIEWED', 'IN_REVIEW', 'RESOLVED'));
alter table "AuditLog" add column if not exists "reviewerId" text references "User"(id);
alter table "AuditLog" add column if not exists "reviewedBy" text references "User"(id);
alter table "AuditLog" add column if not exists "reviewedAt" timestamptz;
alter table "AuditLog" add column if not exists "reviewNote" text;

-- Anomaly flag -- real but deliberately narrow: a rate-based check (more than N of the same
-- action by one user within a window), reusing the existing Redis-backed rate limiter rather
-- than a new detection mechanism or any ML/statistical modeling. See leads-postgres.ts's
-- createAuditLog, the one choke point ~90 call sites already go through.
alter table "AuditLog" add column if not exists "flagged" boolean not null default false;
alter table "AuditLog" add column if not exists "flagReason" text;

-- Retention exception / legal hold -- checked by the retention-enforcement purge query
-- (retention-postgres.ts) before a row is hard-deleted.
alter table "AuditLog" add column if not exists "legalHold" boolean not null default false;

create index if not exists "AuditLog_review_idx" on "AuditLog" ("tenantId", "reviewStatus", "createdAt" desc);
create index if not exists "AuditLog_flagged_idx" on "AuditLog" ("tenantId", "createdAt" desc) where flagged = true;

create table if not exists "AuditLogComment" (
  id text primary key,
  "tenantId" text not null references "Tenant"(id),
  "auditLogId" text not null references "AuditLog"(id) on delete cascade,
  "authorId" text references "User"(id) on delete set null,
  body text not null,
  "createdAt" timestamptz not null default now()
);
create index if not exists "AuditLogComment_log_idx" on "AuditLogComment" ("auditLogId", "createdAt" asc);
