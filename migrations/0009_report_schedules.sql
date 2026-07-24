-- Reporting & Dashboards, Step 5: scheduled report subscriptions.
--
-- Run manually in the Supabase SQL Editor, then re-export SCHEMA.md.
-- The app has no SMTP/mail provider yet, so due processing records durable
-- ReportEmailDelivery rows. A future mail adapter can consume PENDING rows.

create table if not exists "ReportSchedule" (
  "id" text primary key,
  "tenantId" text not null references "Tenant"("id"),
  "userId" text not null references "User"("id"),
  "reportKey" text not null,
  "queryDefinition" jsonb,
  "recipients" text[] not null default '{}',
  "format" text not null default 'LINK' check ("format" in ('LINK', 'CSV', 'PDF')),
  "frequency" text not null check ("frequency" in ('DAILY', 'WEEKLY', 'MONTHLY')),
  "dayOfWeek" integer,
  "dayOfMonth" integer,
  "nextRunAt" timestamp without time zone not null,
  "lastRunAt" timestamp without time zone,
  "lastStatus" text,
  "isActive" boolean not null default true,
  "createdAt" timestamp without time zone not null default current_timestamp,
  "updatedAt" timestamp without time zone not null default current_timestamp
);

create table if not exists "ReportEmailDelivery" (
  "id" text primary key,
  "tenantId" text not null references "Tenant"("id"),
  "scheduleId" text references "ReportSchedule"("id"),
  "reportKey" text not null,
  "recipients" text[] not null default '{}',
  "subject" text not null,
  "body" jsonb not null,
  "format" text not null default 'LINK' check ("format" in ('LINK', 'CSV', 'PDF')),
  "status" text not null default 'PENDING' check ("status" in ('PENDING', 'SENT', 'FAILED')),
  "error" text,
  "sentAt" timestamp without time zone,
  "createdAt" timestamp without time zone not null default current_timestamp
);

create index if not exists "ReportSchedule_due_idx" on "ReportSchedule" ("tenantId", "isActive", "nextRunAt");
create index if not exists "ReportSchedule_user_idx" on "ReportSchedule" ("tenantId", "userId");
create index if not exists "ReportEmailDelivery_schedule_idx" on "ReportEmailDelivery" ("tenantId", "scheduleId", "createdAt" desc);
create index if not exists "ReportEmailDelivery_pending_idx" on "ReportEmailDelivery" ("tenantId", "status", "createdAt");

alter table "ReportSchedule" enable row level security;
alter table "ReportEmailDelivery" enable row level security;

create policy "tenant_isolation_report_schedule" on "ReportSchedule"
  for all
  using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));

create policy "tenant_isolation_report_email_delivery" on "ReportEmailDelivery"
  for all
  using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));
