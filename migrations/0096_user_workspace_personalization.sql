-- Gap checklist Module 10's "user workspace personalization" item -- a single flexible JSONB
-- column on User (matching the established pattern for per-entity flexible settings elsewhere
-- in this schema, e.g. Role.permissions), rather than a new table per preference. Defaults to
-- '{}' so every existing user row stays valid with no migration-time backfill needed.
alter table "User" add column if not exists "preferences" jsonb not null default '{}'::jsonb;

-- "Notification preferences" sub-item -- a real category per notification so a user's own mute
-- list (User.preferences.notifications.mutedCategories) can be checked at creation time. Nullable
-- so every pre-existing row (and any call site not yet updated to pass one) stays valid; treated
-- as an always-delivered "general" bucket when null.
alter table "Notification" add column if not exists "category" text;
