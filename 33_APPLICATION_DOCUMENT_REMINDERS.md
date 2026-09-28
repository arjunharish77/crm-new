# Module 12 — Opt-in document reminders

Implemented 15 September 2026 for `crm` on port 3000.

## Behavior

The application owner can enable **Daily document reminders** in the application checklist. Reminders are off by default. Only the current owner can subscribe, and the recipient is always that owner; neither administrators nor API callers can subscribe another person.

The first check is scheduled 24 hours after enabling. Each due check schedules the next check 24 hours later. The notification bell receives one summary when active required checklist items are missing, pending verification, rejected or expired. Fully verified requirements and optional-only gaps do not trigger a reminder. The notification links to the application.

Closed/won applications, inactive users, suspended tenants, disabled Product Catalog modules and muted Application notification preferences suppress reminders. Reassignment or loss of Applications read access disables the subscription; the new owner must opt in separately. A suppressed or fully-ready application is checked again on its next daily interval. These are rolling 24-hour intervals, not a fixed local-time delivery schedule.

Settings → Notifications includes **Application document reminders**. This category mute is honored by the processor. Disabling reminders on an application stops its subscription; muting the category suppresses notifications while keeping subscriptions.

No applicant email, SMS or WhatsApp delivery is part of this feature.

## Processing and persistence

Migration `0113_application_document_reminders.sql` creates tenant-scoped subscription state and a due-time index. It was applied locally only. Existing applications have no subscription and receive nothing until an owner opts in.

`applications.documentReminders` is registered as a recurring operational job in the existing BullMQ worker. Each invocation scans up to 100 due subscriptions. Application-row locking is shared with stage/document/settings writes, followed by a subscription-row lock. A second worker rechecks the schedule after waiting, so it cannot duplicate the same due notification. Notification insertion, last-sent time and next schedule commit together. A failed transaction leaves the reminder due for retry.

The current user's role/module permissions and account/preferences are checked during processing. Notifications contain the application number and outstanding count, not filenames or document contents. Existing notification infrastructure delivers the bell update.

The existing local worker was gracefully restarted after test cleanup to load the job. Normal operation requires the worker and Redis to remain running. Deployment requires the migration and worker restart alongside the app code.

## Verification

- 65 unit tests passed: queue registry (including the additional operational job), notification routing/preferences and existing application schemas/permissions.
- 58 database/HTTP checks passed: prior application workflow regressions plus default-off state, owner-only opt-in, 24-hour delay, concurrent deduplication, verified-document suppression, expired-document reminders, category mute, closed stage, opt-out, inactive recipient and ownership-change cancellation. Real admin HTTP calls verified workflow state and enable/disable persistence.
- 13 fixture-browser checks passed: enable/disable, failed-save retry, pending controls, non-owner control visibility and 320px/1280px light/dark layouts with enlarged text.
- Evidence: `ui-audit-2026-09/module-12-phase-four`. The reminder recipient was a temporary test user; its notifications and all temporary application/catalog data were removed. Live HTTP opt-in was disabled before any due time.
- Final build and worker-tick verification are recorded in `28_UI_IMPLEMENTATION_PROGRESS.md`.

The processor itself was run against the local database with controlled due times; tests did not wait a full day. Disabled-module and suspended-tenant checks are implemented but were not tested by changing a real workspace's entitlement or status. Broad live-role browser acceptance remains separate.

## Checklist and next work

The required/optional document workflow now has upload/replacement, verification/rejection, expiry, reviewer/comments and automated owner reminders, bringing Module 12 to **6/20 fully completed checklist items**. Reminder delivery is internal and opt-in as described above.

Next module work: eligibility rules or the remaining stage activity/task/payment/approval gates and operational SLA processing. Real malware scanning, external storage, document version-history UI and retention/orphan reconciliation remain documented follow-ups from the upload phase.
