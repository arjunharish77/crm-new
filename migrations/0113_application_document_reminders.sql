create table "ApplicationDocumentReminder" (
 "applicationId" text primary key references "Application"(id) on delete cascade,
 "tenantId" text not null references "Tenant"(id),
 "userId" text not null references "User"(id),
 enabled boolean not null default false,
 "nextRunAt" timestamptz not null,
 "lastSentAt" timestamptz,
 "updatedAt" timestamptz not null default now()
);
create index "ApplicationDocumentReminder_due_idx" on "ApplicationDocumentReminder" ("nextRunAt") where enabled;
alter table "ApplicationDocumentReminder" enable row level security;
create policy application_document_reminder_tenant on "ApplicationDocumentReminder" for all using ("tenantId"=current_setting('app.tenant_id',true)) with check ("tenantId"=current_setting('app.tenant_id',true));
