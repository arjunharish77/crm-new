-- Priority Module 16 -- Marketplace and App Ecosystem: marketplace security controls.
-- Real, previously-invisible gap found and fixed, not just a checklist item: updateMarketplaceApp
-- (built two passes ago) let an app's OWNER change its "requestedPermissions" freely with zero
-- re-approval, at any time, including after the app was already approved and installed. The
-- live TenantAppPermissionGrant rows were never re-materialized from that change (confirmed by
-- reading the function -- it only touches MarketplaceApp/MarketplaceAppVersion/
-- TenantAppEventSubscription), so an already-approved app requesting MORE access afterward had
-- no live effect... but also silently diverged from what an approver actually saw and approved,
-- with no diff, no re-review, and no record that anything had changed. This closes that gap for
-- real: a permission change that adds anything beyond what's currently granted now requires an
-- explicit second approval before it takes effect, rather than either silently doing nothing or
-- silently escalating.

alter table "TenantAppInstall" add column if not exists "pendingPermissions" jsonb;
