-- Round-2 plan wave 3, B4: imports and exports no longer stay "processing" forever when the worker
-- stops mid-job. A running job holds a lease it renews while it works; when the lease runs out,
-- the "transfers.recoverStale" job queues it again (an import resumes from its saved progress) or,
-- after three attempts, marks it failed and tells the person who asked.
alter table "ImportJob" add column if not exists "leaseExpiresAt" timestamp with time zone;
alter table "ImportJob" add column if not exists attempts integer not null default 0;
-- { "next": row index to continue from, "created", "updated", "skipped", "errors": [...] }
alter table "ImportJob" add column if not exists progress jsonb;

alter table "ExportRequest" add column if not exists "leaseExpiresAt" timestamp with time zone;
alter table "ExportRequest" add column if not exists attempts integer not null default 0;

create index if not exists "ImportJob_stale_lease_idx" on "ImportJob" ("leaseExpiresAt") where status = 'PROCESSING';
create index if not exists "ExportRequest_stale_lease_idx" on "ExportRequest" ("leaseExpiresAt") where status = 'RUNNING';

-- Jobs already stuck before this release kept no progress, so re-running one could repeat rows
-- it had already imported. They are marked failed (with the reason) instead; the person can
-- start the import or export again. An hour without an update is far longer than any job takes.
update "ImportJob"
   set status = 'FAILED',
       errors = coalesce(errors, '[]'::jsonb) || jsonb_build_array(jsonb_build_object('row', 0, 'message', 'The import stopped part-way (worker restart) before progress was saved. Please run it again.')),
       "updatedAt" = now()
 where status = 'PROCESSING' and "updatedAt" < now() - interval '1 hour';

update "ExportRequest"
   set status = 'FAILED', error = 'The export stopped part-way (worker restart). Please request it again.', "updatedAt" = now()
 where status = 'RUNNING' and "updatedAt" < now() - interval '1 hour';
