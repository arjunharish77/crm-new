create table if not exists seo_redirect (
  id uuid primary key default gen_random_uuid(),
  from_path text not null unique,
  to_path text not null,
  status_code integer not null default 301 check (status_code in (301, 302, 307, 308)),
  reason text,
  is_active boolean not null default true,
  starts_at timestamptz,
  ends_at timestamptz,
  hit_count integer not null default 0,
  last_hit_at timestamptz,
  created_by uuid references cms_user(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists seo_redirect_active_idx on seo_redirect(is_active, from_path);
create index if not exists seo_redirect_updated_idx on seo_redirect(updated_at desc);
