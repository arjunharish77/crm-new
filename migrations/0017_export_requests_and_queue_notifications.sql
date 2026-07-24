-- Queue-backed export requests and realtime notification fan-out.
--
-- Run on local/VPS Postgres through the migration scripts. This table stores
-- durable export history for users; binary files live in FileObject storage.

create table if not exists "FileObject" (
  "id" text primary key,
  "tenantId" text not null references "Tenant"("id"),
  "storageDriver" text not null default 'local' check ("storageDriver" in ('local', 's3')),
  "bucket" text not null,
  "storageKey" text not null,
  "originalFilename" text,
  "contentType" text,
  "byteSize" integer not null default 0,
  "checksum" text,
  "entityType" text,
  "entityId" text,
  "visibility" text not null default 'PRIVATE' check ("visibility" in ('PRIVATE', 'TENANT')),
  "metadata" jsonb not null default '{}'::jsonb,
  "createdBy" text references "User"("id"),
  "createdAt" timestamp without time zone not null default current_timestamp,
  "updatedAt" timestamp without time zone not null default current_timestamp,
  unique ("tenantId", "bucket", "storageKey")
);

create index if not exists "FileObject_tenant_entity_idx"
  on "FileObject" ("tenantId", "entityType", "entityId", "createdAt" desc);

create index if not exists "FileObject_tenant_bucket_idx"
  on "FileObject" ("tenantId", "bucket", "createdAt" desc);

alter table "FileObject" enable row level security;

drop policy if exists "tenant_isolation_file_object" on "FileObject";

create policy "tenant_isolation_file_object" on "FileObject"
  for all
  using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));

create table if not exists "ExportRequest" (
  "id" text primary key,
  "tenantId" text not null references "Tenant"("id"),
  "userId" text not null references "User"("id"),
  "moduleName" text not null check ("moduleName" in ('LEADS', 'OPPORTUNITIES', 'ACTIVITIES', 'TASKS', 'PARTNERS', 'PAYOUTS', 'REPORTS', 'FORMS')),
  "exportType" text not null default 'CSV' check ("exportType" in ('CSV', 'PDF', 'XLSX')),
  "status" text not null default 'QUEUED' check ("status" in ('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED')),
  "filters" jsonb not null default '{}'::jsonb,
  "columns" jsonb not null default '[]'::jsonb,
  "recordCount" integer not null default 0,
  "fileObjectId" text references "FileObject"("id"),
  "error" text,
  "metadata" jsonb not null default '{}'::jsonb,
  "queuedAt" timestamp without time zone not null default current_timestamp,
  "startedAt" timestamp without time zone,
  "completedAt" timestamp without time zone,
  "updatedAt" timestamp without time zone not null default current_timestamp
);

create index if not exists "ExportRequest_user_status_idx"
  on "ExportRequest" ("tenantId", "userId", "status", "queuedAt" desc);

create index if not exists "ExportRequest_tenant_module_idx"
  on "ExportRequest" ("tenantId", "moduleName", "queuedAt" desc);

alter table "ExportRequest" enable row level security;

create policy "tenant_isolation_export_request" on "ExportRequest"
  for all
  using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));

create or replace function notify_crm_notification_insert()
returns trigger
language plpgsql
as $$
begin
  perform pg_notify(
    'crm_notifications',
    json_build_object(
      'id', new.id,
      'tenantId', new."tenantId",
      'userId', new."userId",
      'title', new.title,
      'message', new.message,
      'data', new.data,
      'createdAt', new."createdAt"
    )::text
  );
  return new;
end;
$$;

do $$
begin
  if to_regclass('"Notification"') is not null then
    drop trigger if exists "Notification_insert_notify" on "Notification";

    create trigger "Notification_insert_notify"
      after insert on "Notification"
      for each row
      execute function notify_crm_notification_insert();
  end if;
end $$;
