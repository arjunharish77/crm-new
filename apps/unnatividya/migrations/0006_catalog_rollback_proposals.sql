alter table catalog_revision add column if not exists rollback_of uuid references catalog_revision(id) on delete set null;
create unique index if not exists catalog_revision_pending_rollback_idx
  on catalog_revision(rollback_of) where rollback_of is not null and status='NEEDS_REVIEW';
