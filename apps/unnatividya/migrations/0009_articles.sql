-- Articles move into the CMS (next-phase plan, decision 8): draft → review → publish, with
-- revisions and rollback, following the catalog workflow. `article.content` is what the public
-- site shows; every change arrives as an `article_revision` that an administrator applies.
create table if not exists article (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  status text not null default 'DRAFT' check (status in ('DRAFT', 'PUBLISHED', 'ARCHIVED')),
  content jsonb,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists article_status_idx on article(status, updated_at desc);

create table if not exists article_revision (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null references article(id) on delete cascade,
  status text not null default 'DRAFT' check (status in ('DRAFT', 'NEEDS_REVIEW', 'APPLIED', 'REJECTED')),
  content jsonb not null,
  -- What the article showed when this draft was started; publishing is refused if it changed since.
  base_content jsonb,
  reason text not null default '',
  restored_from uuid references article_revision(id) on delete set null,
  created_by uuid references cms_user(id) on delete set null,
  reviewed_by uuid references cms_user(id) on delete set null,
  review_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  submitted_at timestamptz,
  reviewed_at timestamptz
);
create index if not exists article_revision_article_idx on article_revision(article_id, created_at desc);
create index if not exists article_revision_status_idx on article_revision(status, created_at desc);
-- One open draft per author per article; saving updates it in place.
create unique index if not exists article_revision_open_draft_idx on article_revision(article_id, created_by) where status = 'DRAFT';
