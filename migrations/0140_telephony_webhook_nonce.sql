-- Plivo connector review (2026-10-26): Plivo's V3 signature covers the URL, the form fields and a
-- one-time nonce, but no timestamp, so a captured callback could be sent again later and still
-- verify. Each nonce is kept once processed; a callback that reuses one is answered without
-- changing anything. Kept for 2 days (housekeeping.ts), far longer than Plivo takes to deliver.
create table if not exists "TelephonyWebhookNonce" (
  "id" text primary key,
  "tenantId" text not null references "Tenant"("id") on delete cascade,
  "provider" text not null,
  "nonce" text not null,
  "createdAt" timestamptz not null default now()
);

create unique index if not exists "TelephonyWebhookNonce_provider_nonce_key"
  on "TelephonyWebhookNonce" ("provider", "nonce");
create index if not exists "TelephonyWebhookNonce_createdAt_idx" on "TelephonyWebhookNonce" ("createdAt");

alter table "TelephonyWebhookNonce" enable row level security;
drop policy if exists tenant_scope on "TelephonyWebhookNonce";
create policy tenant_scope on "TelephonyWebhookNonce"
  using ("tenantId" = nullif(current_setting('app.tenant_id', true), ''))
  with check ("tenantId" = nullif(current_setting('app.tenant_id', true), ''));
