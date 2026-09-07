-- Priority Module 16 -- Marketplace and App Ecosystem: app uninstall safeguards.
-- Confirmed by direct read before building: uninstallApp (marketplace-postgres.ts) revoked the
-- live TenantAppPermissionGrant rows and flagged the install UNINSTALLED, but left the app's
-- TenantAppSecret intact (a credential for an app that's no longer installed), left its
-- TenantAppEventSubscription rows active, and -- a genuine, previously-invisible bug, not just
-- a missing nice-to-have -- left any already-PENDING TenantAppDelivery rows queued before the
-- uninstall untouched, so processAppEventDeliveries would still claim and deliver them to the
-- app's webhookUrl after uninstall (enqueueAppEvent's own install-status join only blocks NEW
-- events from being queued, not ones already sitting PENDING). This adds the "retained logs
-- policy" half of the same checklist bullet: reusing DataRetentionPolicy (the existing
-- tenant-configurable retention mechanism, not a new one) rather than a marketplace-specific
-- purge schedule.

alter table "DataRetentionPolicy" add column if not exists "marketplaceAppLogRetentionDays" integer not null default 90;
