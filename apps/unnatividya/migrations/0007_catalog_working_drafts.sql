create table if not exists catalog_working_draft (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in ('course', 'university')),
  entity_id text not null,
  created_by uuid not null references cms_user(id) on delete cascade,
  base_snapshot jsonb not null,
  proposed_content jsonb not null,
  reason text not null default '',
  version integer not null default 1 check (version > 0),
  updated_at timestamptz not null default now(),
  unique (created_by, entity_type, entity_id)
);
