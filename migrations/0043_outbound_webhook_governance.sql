-- Priority Module 9 -- Data Platform, Governance: outbound webhook governance.
-- WebhookOutbox has existed in the schema with zero references anywhere in src/ -- nothing
-- ever inserted into it, no worker drained it, no HTTP dispatch or signing existed. This
-- migration adds the one column it was missing to actually work as a real delivery queue
-- (subscriptionId, since the table otherwise has no link to which endpoint a delivery is
-- for) plus per-attempt response detail for a real delivery-log view.

alter table "WebhookOutbox"
  add column if not exists "subscriptionId" text references "WebhookSubscription"(id) on delete cascade,
  add column if not exists "httpStatus" integer,
  add column if not exists "responseBody" text;

create index if not exists "WebhookOutbox_subscriptionId_createdAt_idx"
  on "WebhookOutbox" ("subscriptionId", "createdAt" desc);

create index if not exists "WebhookOutbox_status_nextRetryAt_idx"
  on "WebhookOutbox" (status, "nextRetryAt");
