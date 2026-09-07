-- Priority Module 16 -- Marketplace and App Ecosystem: connector health monitoring + app
-- usage and limits. TenantAppUsage/TenantAppHealth were created in the schema pass (migration
-- 0060) but deliberately left unpopulated -- this wires them to the real delivery attempts the
-- event bus pass (migration 0061) introduced, and adds the two columns needed for a real
-- per-app quota (the "tenant quotas, throttling visibility" sub-item) and per-delivery latency
-- (the "latency" sub-item) that weren't part of either prior migration.

alter table "MarketplaceApp" add column if not exists "dailyDeliveryLimit" integer;
alter table "TenantAppDelivery" add column if not exists "latencyMs" integer;
