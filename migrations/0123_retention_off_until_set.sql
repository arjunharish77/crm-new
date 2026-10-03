-- Data retention made safe (decisions confirmed 2026-10-01):
--   1. Lead / opportunity / activity anonymization is OFF until a platform admin sets a number of
--      days for that record type (NULL = never). Before this, merely creating a tenant's policy
--      row (saving any one retention setting) armed 365 / 730 / 180-day anonymization of every
--      record not updated in that time, and 0 ("disable", as the page said) was rejected.
--   2. When a period is set, only closed/inactive records are anonymized (enforced in
--      src/lib/repositories/retention-postgres.ts): leads with status LOST / CONVERTED /
--      DISQUALIFIED or deleted, opportunities in a closed stage or deleted, and activities whose
--      linked records are all such. Open records are never anonymized however old.
-- Audit-log, deleted-field and uninstalled-app-log clean-up keep their defaults (90 / 30 / 90
-- days); they can now also be switched off (NULL).

alter table "DataRetentionPolicy" alter column "leadRetentionDays" drop not null;
alter table "DataRetentionPolicy" alter column "leadRetentionDays" set default null;
alter table "DataRetentionPolicy" alter column "opportunityRetentionDays" drop not null;
alter table "DataRetentionPolicy" alter column "opportunityRetentionDays" set default null;
alter table "DataRetentionPolicy" alter column "activityRetentionDays" drop not null;
alter table "DataRetentionPolicy" alter column "activityRetentionDays" set default null;
alter table "DataRetentionPolicy" alter column "auditLogRetentionDays" drop not null;
alter table "DataRetentionPolicy" alter column "deletedRecordsRetentionDays" drop not null;
alter table "DataRetentionPolicy" alter column "marketplaceAppLogRetentionDays" drop not null;

-- Existing rows: a value equal to the old automatic default cannot be told apart from one an
-- admin chose, so it is switched OFF (the safe direction: data is kept; an admin can set it
-- again). Any other value was set deliberately and is kept.
update "DataRetentionPolicy" set "leadRetentionDays" = null where "leadRetentionDays" = 365;
update "DataRetentionPolicy" set "opportunityRetentionDays" = null where "opportunityRetentionDays" = 730;
update "DataRetentionPolicy" set "activityRetentionDays" = null where "activityRetentionDays" = 180;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'DataRetentionPolicy_positive_days_check') then
    alter table "DataRetentionPolicy" add constraint "DataRetentionPolicy_positive_days_check" check (
      coalesce("leadRetentionDays", 1) > 0 and coalesce("opportunityRetentionDays", 1) > 0 and coalesce("activityRetentionDays", 1) > 0
      and coalesce("auditLogRetentionDays", 1) > 0 and coalesce("deletedRecordsRetentionDays", 1) > 0 and coalesce("marketplaceAppLogRetentionDays", 1) > 0
    );
  end if;
end $$;
