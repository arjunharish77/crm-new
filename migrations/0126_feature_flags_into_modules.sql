-- Feature flags merged into modules (UI/UX plan decision 15). Six flags overlapped a module:
-- opportunityEnabled/OPPORTUNITIES, automationEnabled/AUTOMATIONS, formBuilderEnabled/FORMS,
-- advancedReporting/REPORTS, payoutsEnabled/PAYOUTS and gamificationEnabled/GAMIFICATION, and a
-- feature was on only when both were. From now on the module entitlement alone decides. So that
-- nothing changes for any workspace, a flag that is off becomes a DISABLED module here (TRIAL
-- and ENABLED rows included, since the flag already kept those off). The flag columns are left
-- as they are; the app no longer reads these six.
do $$
declare
  mapping record;
begin
  for mapping in
    select * from (values
      ('OPPORTUNITIES', 'opportunityEnabled', 'Opportunities'),
      ('AUTOMATIONS', 'automationEnabled', 'Automations'),
      ('FORMS', 'formBuilderEnabled', 'Form builder'),
      ('REPORTS', 'advancedReporting', 'Advanced reporting'),
      ('PAYOUTS', 'payoutsEnabled', 'Payouts'),
      ('GAMIFICATION', 'gamificationEnabled', 'Gamification')
    ) as m(module_key, flag, label)
  loop
    if not exists (select 1 from "PlatformModule" where key = mapping.module_key) then
      continue;
    end if;

    execute format($sql$
      with off as (select tf."tenantId" from "TenantFeature" tf where tf.%1$I = false),
      changed as (
        update "TenantModuleEntitlement" e
           set status = 'DISABLED', reason = %3$L, "effectiveAt" = now(), "updatedAt" = now(), "trialEndsAt" = null
          from off
         where e."tenantId" = off."tenantId" and e."moduleKey" = %2$L and e.status in ('ENABLED', 'TRIAL')
        returning e."tenantId"
      ),
      added as (
        insert into "TenantModuleEntitlement" (id, "tenantId", "moduleKey", status, reason)
        select gen_random_uuid()::text, off."tenantId", %2$L, 'DISABLED', %3$L from off
         where not exists (select 1 from "TenantModuleEntitlement" e where e."tenantId" = off."tenantId" and e."moduleKey" = %2$L)
        returning "tenantId"
      )
      insert into "TenantModuleAuditLog" (id, "tenantId", "moduleKey", action, reason)
      select gen_random_uuid()::text, "tenantId", %2$L, 'DISABLED', %3$L from (select "tenantId" from changed union select "tenantId" from added) moved
    $sql$, mapping.flag, mapping.module_key, 'Moved from the ' || mapping.label || ' feature flag (decision 15)');
  end loop;
end $$;
