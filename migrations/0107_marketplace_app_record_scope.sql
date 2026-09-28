-- WP04 fix (F03 follow-up): the marketplace/external-app API surface (/api/v1/apps/*)
-- authenticates requests as a synthetic actor with no internal role at all -- under
-- recordAccessLevel's existing "preserve current behavior when unset" default, that has always
-- resolved to unrestricted tenant-wide "ALL" access with zero field-permission masking,
-- regardless of what TenantAppPermissionGrant's own module-level read/write scope says. That
-- grant model answers "can this app touch leads at all," a different question from "which
-- records/fields can it see," which this migration adds the storage for.
--
-- Per explicit user decision: a tenant admin should be able to additionally constrain a
-- specific app install to OWN/TEAM record-scope and per-field masking, on top of its existing
-- module-level grants. Defaults (recordAccess = 'ALL', ownerUserId/fieldPermissions null)
-- reproduce today's exact behavior for every existing install -- this is opt-in, not a silent
-- access change for anyone who hasn't configured it.
alter table "TenantAppInstall"
  add column if not exists "recordAccess" text not null default 'ALL',
  add column if not exists "ownerUserId" text references "User"(id) on delete set null,
  add column if not exists "fieldPermissions" jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'TenantAppInstall_recordAccess_check'
  ) then
    alter table "TenantAppInstall"
      add constraint "TenantAppInstall_recordAccess_check" check ("recordAccess" in ('OWN', 'TEAM', 'ALL'));
  end if;

  -- OWN/TEAM scope is meaningless without a real internal user to scope against (Lead/Opportunity
  -- ownerId values are User ids, not MarketplaceApp ids) -- enforced at the schema level so a
  -- misconfigured install can't silently end up in an ambiguous state that the application layer
  -- would then have to guess how to interpret.
  if not exists (
    select 1 from pg_constraint where conname = 'TenantAppInstall_ownerUserId_required_check'
  ) then
    alter table "TenantAppInstall"
      add constraint "TenantAppInstall_ownerUserId_required_check"
      check ("recordAccess" = 'ALL' or "ownerUserId" is not null);
  end if;
end $$;
