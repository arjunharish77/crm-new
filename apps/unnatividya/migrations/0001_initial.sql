create extension if not exists "pgcrypto";

create table if not exists cms_user (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  name text not null,
  password_hash text not null,
  role text not null default 'ADMIN' check (role in ('ADMIN', 'EDITOR', 'VIEWER')),
  two_factor_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists cms_audit_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references cms_user(id),
  action text not null,
  entity_type text,
  entity_id text,
  metadata jsonb not null default '{}'::jsonb,
  ip_address text,
  created_at timestamptz not null default now()
);

create table if not exists university (
  id text primary key,
  slug text not null unique,
  name text not null,
  short_name text not null,
  city text,
  status text not null default 'DRAFT' check (status in ('DRAFT', 'NEEDS_REVIEW', 'PUBLISHED', 'ARCHIVED')),
  data jsonb not null default '{}'::jsonb,
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists course (
  id text primary key,
  slug text not null unique,
  university_id text not null references university(id),
  name text not null,
  short_name text not null,
  level text not null check (level in ('UG', 'PG')),
  program_type text not null default 'DEGREE',
  ugc_approved boolean not null default true,
  stream text not null,
  fee_inr integer,
  duration text,
  status text not null default 'DRAFT' check (status in ('DRAFT', 'NEEDS_REVIEW', 'PUBLISHED', 'ARCHIVED')),
  data jsonb not null default '{}'::jsonb,
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists lead_capture (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  phone text not null,
  city text,
  course_id text,
  university_id text,
  source_path text,
  source_page_type text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_term text,
  utm_content text,
  compare_course_ids text[] not null default '{}',
  recommender_answers jsonb not null default '{}'::jsonb,
  consent_accepted boolean not null default true,
  email_otp_verified boolean not null default false,
  phone_otp_verified boolean not null default false,
  email_verified_at timestamptz,
  phone_verified_at timestamptz,
  crm_sync_status text not null default 'DISABLED',
  crm_record_id text,
  last_crm_sync_attempt_at timestamptz,
  last_crm_sync_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists lead_capture_created_idx on lead_capture(created_at desc);
create index if not exists lead_capture_email_idx on lead_capture(email);
create index if not exists lead_capture_phone_idx on lead_capture(phone);
create index if not exists lead_capture_crm_status_idx on lead_capture(crm_sync_status);

create table if not exists lead_event (
  id uuid primary key default gen_random_uuid(),
  lead_capture_id uuid not null references lead_capture(id) on delete cascade,
  event_type text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists otp_request (
  id uuid primary key default gen_random_uuid(),
  lead_capture_id uuid references lead_capture(id) on delete cascade,
  cms_user_id uuid references cms_user(id) on delete cascade,
  channel text not null check (channel in ('EMAIL', 'PHONE')),
  purpose text not null check (purpose in ('LEAD_VERIFY', 'ADMIN_2FA')),
  target text not null,
  otp_hash text not null,
  expires_at timestamptz not null,
  verified_at timestamptz,
  attempts integer not null default 0,
  provider text not null,
  provider_status text,
  created_at timestamptz not null default now()
);

create index if not exists otp_request_lead_idx on otp_request(lead_capture_id, created_at desc);
create index if not exists otp_request_user_idx on otp_request(cms_user_id, created_at desc);

create table if not exists crm_sync_config (
  id uuid primary key default gen_random_uuid(),
  is_enabled boolean not null default false,
  auto_push_enabled boolean not null default false,
  manual_push_enabled boolean not null default false,
  api_base_url text,
  endpoint_path text,
  http_method text not null default 'POST',
  auth_type text not null default 'NONE',
  encrypted_secret_config jsonb not null default '{}'::jsonb,
  headers_template jsonb not null default '{}'::jsonb,
  success_status_codes integer[] not null default '{200,201}',
  response_lead_id_path text,
  duplicate_detection_config jsonb not null default '{}'::jsonb,
  retry_config jsonb not null default '{"maxAttempts":3,"backoffMs":30000}'::jsonb,
  timeout_ms integer not null default 15000,
  push_only_after_email_otp boolean not null default true,
  push_only_after_consent boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists crm_sync_mapping (
  id uuid primary key default gen_random_uuid(),
  version integer not null,
  name text not null,
  request_body_template jsonb not null,
  available_field_snapshot jsonb not null default '{}'::jsonb,
  helper_config jsonb not null default '{}'::jsonb,
  is_active boolean not null default false,
  created_by uuid references cms_user(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(version)
);

create table if not exists crm_sync_attempt (
  id uuid primary key default gen_random_uuid(),
  lead_capture_id uuid not null references lead_capture(id) on delete cascade,
  trigger_type text not null check (trigger_type in ('MANUAL', 'BULK_MANUAL', 'AUTO', 'RETRY')),
  status text not null default 'QUEUED' check (status in ('QUEUED', 'PROCESSING', 'SUCCESS', 'FAILED', 'SKIPPED', 'DUPLICATE')),
  mapping_version integer,
  redacted_request_payload jsonb not null default '{}'::jsonb,
  response_status integer,
  redacted_response_body jsonb not null default '{}'::jsonb,
  crm_record_id text,
  error_message text,
  attempt_count integer not null default 0,
  created_by uuid references cms_user(id),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists source_import (
  id uuid primary key default gen_random_uuid(),
  source_name text not null,
  source_url text not null,
  status text not null default 'DRAFT',
  fetched_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists source_import_item (
  id uuid primary key default gen_random_uuid(),
  source_import_id uuid not null references source_import(id) on delete cascade,
  entity_type text not null,
  entity_key text not null,
  source_url text not null,
  source_hash text,
  raw_data jsonb not null default '{}'::jsonb,
  review_status text not null default 'DRAFT',
  created_at timestamptz not null default now()
);

create table if not exists site_setting (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

insert into crm_sync_config (is_enabled, auto_push_enabled, manual_push_enabled)
select false, false, false
where not exists (select 1 from crm_sync_config);

insert into site_setting (key, value)
values
  ('cms.admin2fa.enabled', 'true'::jsonb),
  ('lead.city.required', 'false'::jsonb)
on conflict (key) do nothing;
