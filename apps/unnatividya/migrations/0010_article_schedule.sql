-- Scheduled publishing (Wave 5 C2, decision V7): an administrator can approve a submitted article
-- revision to go live at a set time. It stays NEEDS_REVIEW until then, so it can still be applied
-- now, rejected or unscheduled. scripts/publish-scheduled.js applies due revisions every 5 minutes
-- through the same validated path as a manual apply; a refusal is recorded, never forced.
alter table article_revision add column if not exists scheduled_for timestamptz;
alter table article_revision add column if not exists scheduled_by uuid references cms_user(id) on delete set null;
alter table article_revision add column if not exists schedule_note text;
alter table article_revision add column if not exists schedule_error text;
create index if not exists article_revision_scheduled_idx on article_revision(scheduled_for) where status = 'NEEDS_REVIEW' and scheduled_for is not null;
