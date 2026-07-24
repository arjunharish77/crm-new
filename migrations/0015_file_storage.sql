-- Direct Postgres file storage metadata.
--
-- Run manually in the Supabase SQL Editor for parity, and on local/VPS Postgres
-- through the migration scripts. Binary objects live in the configured storage
-- provider; this table keeps tenant-scoped metadata and entity attachment links.

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

create policy "tenant_isolation_file_object" on "FileObject"
  for all
  using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));
