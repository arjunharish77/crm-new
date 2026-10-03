-- dataQuality.processScheduledScan used to write a scorecard for the same tenants on every 60s
-- worker tick (about 1,440 near-identical rows per tenant per day) while never reaching tenants
-- beyond its batch limit. The job now writes one scorecard per tenant per tenant-local day
-- (src/lib/server/inbuilt-reports.ts runScheduledDataQualityScan).
--
-- Decision confirmed 2026-09-29: keep each tenant's LATEST scorecard of each tenant-local day and
-- delete the rest, so the day-by-day history stays complete. The day uses the tenant's configured
-- time zone (TenantConfig generalSettings.timezone), falling back to Asia/Kolkata, exactly as the
-- job decides "already scanned today". Irreversible by design; nothing else reads these rows.

with zones as materialized (select name from pg_timezone_names),
tz as (
  select t.id as "tenantId", coalesce(z.name, 'Asia/Kolkata') as tz
  from "Tenant" t
  left join lateral (select tc."featureFlags" -> 'generalSettings' ->> 'timezone' as zone from "TenantConfig" tc where tc."tenantId" = t.id limit 1) cfg on true
  left join zones z on z.name = cfg.zone
),
ranked as (
  select s.id,
         row_number() over (
           partition by s."tenantId", (s."generatedAt" at time zone coalesce(tz.tz, 'Asia/Kolkata'))::date
           order by s."generatedAt" desc, s.id desc
         ) as rn
  from "DataQualityScorecard" s
  left join tz on tz."tenantId" = s."tenantId"
)
delete from "DataQualityScorecard" d
using ranked r
where d.id = r.id and r.rn > 1;
