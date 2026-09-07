-- Saved View (Smart View) governance: usage tracking, stale detection, and archive/deprecate.
-- Views are stored as "CustomReport" rows with chartType = 'SAVED_VIEW' (established
-- convention) -- CustomReport.isActive already exists but is unused by views today and its
-- semantics elsewhere (report scheduling) don't match "archived", so this adds dedicated
-- columns rather than overloading it.
--
-- Run manually against the database, then re-export SCHEMA.md.

alter table "CustomReport" add column if not exists "viewCount" integer not null default 0;
alter table "CustomReport" add column if not exists "lastOpenedAt" timestamp with time zone;
alter table "CustomReport" add column if not exists "isArchived" boolean not null default false;
alter table "CustomReport" add column if not exists "archivedAt" timestamp with time zone;
