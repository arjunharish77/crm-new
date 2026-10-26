-- Guides editable in the CMS (Wave 5 C3, decision V6). The set of guides (key, URL, label) stays in
-- code; the CMS holds each eligibility and career-scope guide's editable text, with the same
-- draft → review → publish workflow, history and rollback as articles. scripts/sync-guides-to-db.js
-- copies today's text in once, never overwriting a row that exists.
create table if not exists guide (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('eligibility', 'career-scope')),
  guide_key text not null check (guide_key ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  content jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (kind, guide_key)
);

create table if not exists guide_revision (
  id uuid primary key default gen_random_uuid(),
  guide_id uuid not null references guide(id) on delete cascade,
  status text not null default 'DRAFT' check (status in ('DRAFT', 'NEEDS_REVIEW', 'APPLIED', 'REJECTED')),
  content jsonb not null,
  -- What the guide showed when this draft was started; publishing is refused if it changed since.
  base_content jsonb,
  reason text not null default '',
  restored_from uuid references guide_revision(id) on delete set null,
  created_by uuid references cms_user(id) on delete set null,
  reviewed_by uuid references cms_user(id) on delete set null,
  review_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  submitted_at timestamptz,
  reviewed_at timestamptz
);
create index if not exists guide_revision_guide_idx on guide_revision(guide_id, created_at desc);
create index if not exists guide_revision_status_idx on guide_revision(status, created_at desc);
-- One open draft per author per guide; saving updates it in place.
create unique index if not exists guide_revision_open_draft_idx on guide_revision(guide_id, created_by) where status = 'DRAFT';
