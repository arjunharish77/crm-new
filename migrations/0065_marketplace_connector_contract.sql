-- Priority Module 16 -- Marketplace and App Ecosystem: connector SDK contract.
-- "Rate-limit handling" was a genuine, previously-live gap: the inbound app-authenticated API
-- (/api/v1/apps/leads, /api/v1/apps/opportunities, built in the scoped-app-permissions
-- enforcement pass) had no rate limiting at all, unlike the ApiKey system's own
-- rateLimitPerMinute column + checkRateLimit call this mirrors exactly.

alter table "MarketplaceApp" add column if not exists "rateLimitPerMinute" integer not null default 60;
