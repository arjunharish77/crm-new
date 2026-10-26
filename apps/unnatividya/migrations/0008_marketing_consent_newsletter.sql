-- Separate, optional marketing consent and an opt-in newsletter (next-phase plan, decision 9).
-- Contact consent for the enquiry stays as it is; marketing consent is recorded on its own, with
-- its exact wording version and time, and can be withdrawn at any time.
alter table lead_capture add column if not exists marketing_consent boolean not null default false;
alter table lead_capture add column if not exists marketing_consent_version text;
alter table lead_capture add column if not exists marketing_consent_at timestamptz;

create table if not exists newsletter_subscriber (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  status text not null default 'PENDING' check (status in ('PENDING', 'CONFIRMED', 'UNSUBSCRIBED')),
  source text not null check (source in ('SIGNUP_FORM', 'LEAD_FORM')),
  source_path text,
  lead_capture_id uuid references lead_capture(id) on delete set null,
  consent_version text not null,
  confirm_token_hash text,
  confirm_expires_at timestamptz,
  created_at timestamptz not null default now(),
  confirmed_at timestamptz,
  unsubscribed_at timestamptz,
  updated_at timestamptz not null default now()
);
create unique index if not exists newsletter_subscriber_email_idx on newsletter_subscriber (lower(email));
create index if not exists newsletter_subscriber_status_idx on newsletter_subscriber (status, created_at desc);
