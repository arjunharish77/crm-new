-- WP10 (F14): lease-based crash recovery for the two outbox drain loops that claim a row by
-- setting status = 'SENDING' before doing real network I/O. Neither table previously recorded
-- WHEN a SENDING claim was taken, so a worker crash between claim and final status update left
-- the row stuck in SENDING forever -- no expiry, no requeue, no visibility. "leaseExpiresAt" is
-- set to a near-future instant on claim; the next drain tick's own due-row query treats a SENDING
-- row whose lease has passed as claimable again, exactly like a fresh PENDING/QUEUED row.
alter table "WebhookOutbox" add column if not exists "leaseExpiresAt" timestamptz;
alter table "CommunicationOutbox" add column if not exists "leaseExpiresAt" timestamptz;

create index if not exists "WebhookOutbox_status_leaseExpiresAt_idx" on "WebhookOutbox" (status, "leaseExpiresAt");
create index if not exists "CommunicationOutbox_status_leaseExpiresAt_idx" on "CommunicationOutbox" (status, "leaseExpiresAt");
