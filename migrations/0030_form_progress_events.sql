-- Form drop-off analytics: today FormSubmission only ever records a completed submission --
-- there was no signal anywhere of how far a real visitor got before abandoning a multi-tab
-- form. This adds a lightweight event log the public renderer beacons to on each tab/step
-- view, so a drop-off-by-tab report becomes possible without touching FormSubmission itself.
--
-- Run manually against the database, then re-export SCHEMA.md.

create table if not exists "FormProgressEvent" (
  "id" text primary key,
  "tenantId" text not null references "Tenant"("id"),
  "formId" text not null references "Form"("id") on delete cascade,
  "sessionId" text not null,
  "tabId" text not null,
  "tabIndex" integer not null,
  "createdAt" timestamp with time zone not null default current_timestamp
);

create index if not exists "FormProgressEvent_form_tab_idx" on "FormProgressEvent" ("tenantId", "formId", "tabId");
create index if not exists "FormProgressEvent_session_idx" on "FormProgressEvent" ("formId", "sessionId");

alter table "FormProgressEvent" enable row level security;
create policy "tenant_isolation_form_progress_event" on "FormProgressEvent"
  for all using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));
