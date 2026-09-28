-- WP08 (F13): tenant/source-scoped idempotency keys with a request-body hash, so a client that
-- retries an identical create request (e.g. after a timeout with an ambiguous outcome) gets the
-- original result back instead of a duplicate record, and a retry with a genuinely different
-- payload under the same key is rejected rather than silently applied.
create table if not exists "RequestIdempotencyKey" (
  "id" text primary key,
  "tenantId" text not null references "Tenant"("id"),
  "source" text not null,
  "idempotencyKey" text not null,
  "requestHash" text not null,
  "entityType" text not null,
  "entityId" text not null,
  "responseSnapshot" jsonb not null,
  "createdAt" timestamp without time zone not null default current_timestamp
);

create unique index if not exists "RequestIdempotencyKey_tenant_source_key_key"
  on "RequestIdempotencyKey" ("tenantId", "source", "idempotencyKey");

alter table "RequestIdempotencyKey" enable row level security;

create policy "tenant_isolation_request_idempotency_key" on "RequestIdempotencyKey"
  for all
  using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));
