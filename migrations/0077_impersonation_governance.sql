-- Gap checklist: "Add impersonation governance." "reason" is required at the application layer
-- for an impersonation session specifically (enforced in impersonateTenantUser), left nullable
-- here since a normal login session has no equivalent concept -- one column serves both row
-- shapes rather than a separate table for a single extra field.
alter table "UserSession" add column if not exists "reason" text;

-- Platform-admin review workflow: lets a (different) platform admin mark a completed
-- impersonation session as reviewed, with an optional note -- the "platform-admin review"
-- sub-item this checklist item names, previously "no separate platform-admin review step for a
-- completed impersonation session beyond it appearing in the general audit log."
alter table "UserSession" add column if not exists "reviewedAt" timestamptz;
alter table "UserSession" add column if not exists "reviewedBy" text references "User"(id);
alter table "UserSession" add column if not exists "reviewNote" text;
