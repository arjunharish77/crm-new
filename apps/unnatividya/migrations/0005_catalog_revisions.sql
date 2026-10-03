create table if not exists catalog_revision (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in ('course', 'university')),
  entity_id text not null,
  base_snapshot jsonb not null,
  proposed_content jsonb not null,
  reason text not null,
  status text not null default 'NEEDS_REVIEW' check (status in ('NEEDS_REVIEW', 'APPLIED', 'REJECTED')),
  created_by uuid references cms_user(id) on delete set null,
  reviewed_by uuid references cms_user(id) on delete set null,
  review_note text,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);
create index if not exists catalog_revision_entity_idx on catalog_revision(entity_type, entity_id, created_at desc);
create index if not exists catalog_revision_review_idx on catalog_revision(status, created_at desc);
