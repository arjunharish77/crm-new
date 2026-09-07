-- Priority Module 16 -- Marketplace and App Ecosystem, Phase 4: app dependency and
-- compatibility checks. An app can now declare (a) the connector-contract version it was
-- built against, checked against this platform's own current contract version
-- (getConnectorContractForApp's "1.0" -- see PLATFORM_CONNECTOR_CONTRACT_VERSION in
-- marketplace-postgres.ts, kept as the single source of truth for both), and (b) other
-- MarketplaceApp ids it depends on, checked against what's actually INSTALLED for the
-- installing tenant. Both default to "no constraint" (current contract version, empty
-- dependency list) so every existing app row stays compatible/unblocked after this migration.
alter table "MarketplaceApp" add column if not exists "requiredContractVersion" text not null default '1.0';
alter table "MarketplaceApp" add column if not exists "dependsOnAppIds" text[] not null default '{}';
