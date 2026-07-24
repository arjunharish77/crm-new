# How to export your real Supabase schema into the repo

This has to happen before Phase 0 work in Claude Code, otherwise it will guess at
table names/columns/RLS policies and can get them wrong.

## Steps

1. Go to your Supabase project → SQL Editor.
2. Run this query and save the full output:

```sql
select
  table_name,
  column_name,
  data_type,
  is_nullable,
  column_default
from information_schema.columns
where table_schema = 'public'
order by table_name, ordinal_position;
```

3. Also export RLS policies:

```sql
select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public';
```

4. Also export foreign keys / relationships:

```sql
select
  tc.table_name, kcu.column_name,
  ccu.table_name as foreign_table_name,
  ccu.column_name as foreign_column_name
from information_schema.table_constraints tc
join information_schema.key_column_usage kcu
  on tc.constraint_name = kcu.constraint_name
join information_schema.constraint_column_usage ccu
  on tc.constraint_name = ccu.constraint_name
where tc.constraint_type = 'FOREIGN KEY';
```

5. Alternative (faster, if you have the Supabase CLI installed locally):

```bash
supabase db dump --schema public -f SCHEMA.sql
```

6. Save whichever output you get as `SCHEMA.md` (or `SCHEMA.sql`) in the repo root.
   Paste the table/column list, RLS policies, and foreign keys — Claude Code will
   read this before touching any new module so it doesn't duplicate tables or
   violate existing constraints.

7. Going forward, treat this file as something you regenerate and commit any time
   the schema changes in Supabase directly (outside of a migration file) — it's
   your single source of truth until you introduce a proper migration tool.
