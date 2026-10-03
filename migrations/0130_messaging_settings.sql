-- Workspace messaging settings (decided 2026-10-03). "requireTemplateApproval": when on, only an
-- Approved template version can be sent and its author can't approve it. Off by default so
-- existing templates (all Draft unless reviewed) keep sending after deploy.
create table if not exists "MessagingSettings" (
  "tenantId" text primary key references "Tenant"(id) on delete cascade,
  "requireTemplateApproval" boolean not null default false,
  "updatedBy" text references "User"(id) on delete set null,
  "updatedAt" timestamptz not null default now()
);
alter table "MessagingSettings" enable row level security;
drop policy if exists tenant_scope on "MessagingSettings";
create policy tenant_scope on "MessagingSettings"
  using ("tenantId" = nullif(current_setting('app.tenant_id', true), ''))
  with check ("tenantId" = nullif(current_setting('app.tenant_id', true), ''));
