-- Gap checklist Module 10's "user-level audit of productivity actions" item -- a new "what did
-- I do today" rollup queries AuditLog by (tenantId, userId, createdAt), a real query shape this
-- table had no supporting index for (only tenantId+action, tenantId+createdAt, and
-- tenantId+entityType+entityId existed).
create index if not exists "AuditLog_tenantId_userId_createdAt_idx" on "AuditLog" ("tenantId", "userId", "createdAt" desc);
