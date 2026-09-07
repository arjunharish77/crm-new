-- Gap checklist Module 17's semantic metric layer bullet -- the "grain" sub-item, previously
-- honestly documented as not built ("a metric computes live over the full dataset every time").
-- Per explicit user direction: daily + weekly + monthly, configurable per metric.
--
-- Reuses the pre-existing, previously-completely-unreferenced "DailyMetric" table
-- (tenantId, date, metric, value, dimensions jsonb) as the storage for period snapshots --
-- confirmed unused anywhere in src/lib before this pass, exactly as earlier writeups already
-- noted "the natural future home for a precomputed daily-grain layer." A metric with grain =
-- null keeps computing live, completely unchanged (the default for every pre-existing metric).

alter table "Metric" add column if not exists grain text check (grain in ('DAILY', 'WEEKLY', 'MONTHLY'));
