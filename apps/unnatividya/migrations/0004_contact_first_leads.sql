-- Additive migration: keep existing enquiries intact. New contact-first enquiries
-- carry a private edit capability and a separate degree preference (university optional).
alter table lead_capture add column if not exists submission_key uuid;
alter table lead_capture add column if not exists edit_token_hash text;
alter table lead_capture add column if not exists edit_expires_at timestamptz;
alter table lead_capture add column if not exists course_preference text;
alter table lead_capture add column if not exists preferences_completed_at timestamptz;
alter table lead_capture add column if not exists consent_version text;
alter table lead_capture add column if not exists consent_recorded_at timestamptz;
create unique index if not exists lead_capture_submission_key_idx on lead_capture(submission_key);
