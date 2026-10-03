-- Tenant-configurable lead statuses (UI/UX plan decision 6). Each tenant has its own list of
-- statuses; each one has a label, a status tone, an order and a category (OPEN, CONVERTED or
-- LOST). "Lead.status" keeps storing the status key, so existing rows don't change. Everything
-- that asks "is this lead closed?" now asks for the category (crm_lead_status_category)
-- instead of comparing against hard-coded names.

create table "LeadStatusDefinition" (
  id text primary key,
  "tenantId" text not null references "Tenant"(id) on delete cascade,
  key text not null check (key ~ '^[A-Z0-9][A-Z0-9_]{0,59}$'),
  label text not null check (length(btrim(label)) between 1 and 60),
  tone text not null default 'neutral' check (tone in ('success','warning','danger','info','neutral','accent')),
  category text not null check (category in ('OPEN','CONVERTED','LOST')),
  "order" integer not null default 0,
  "isActive" boolean not null default true,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now(),
  unique ("tenantId", key)
);
create index on "LeadStatusDefinition" ("tenantId", "order");
alter table "LeadStatusDefinition" enable row level security;
create policy tenant_scope on "LeadStatusDefinition"
  using ("tenantId" = nullif(current_setting('app.tenant_id', true), ''))
  with check ("tenantId" = nullif(current_setting('app.tenant_id', true), ''));

-- The defaults every tenant starts with.
insert into "LeadStatusDefinition" (id, "tenantId", key, label, tone, category, "order")
select gen_random_uuid()::text, t.id, d.key, d.label, d.tone, d.category, d.ord
from "Tenant" t
cross join (values
  ('NEW', 'New', 'info', 'OPEN', 10),
  ('CONTACTED', 'Contacted', 'info', 'OPEN', 20),
  ('QUALIFIED', 'Qualified', 'accent', 'OPEN', 30),
  ('CONVERTED', 'Converted', 'success', 'CONVERTED', 40),
  ('LOST', 'Lost', 'danger', 'LOST', 50)
) as d(key, label, tone, category, ord)
on conflict ("tenantId", key) do nothing;

-- Every other status value already on a lead becomes a status of its own, in the Open category
-- until an admin changes it (decision 6), except DISQUALIFIED, which call queues and Next Best
-- Action already treated as closed, so it starts as Lost. Values longer than the key limit or
-- with other characters get a key made of their letters and digits.
with used as (
  select distinct l."tenantId", btrim(l.status) as raw
  from "Lead" l
  where l."tenantId" is not null and l.status is not null and btrim(l.status) <> ''
),
keyed as (
  select "tenantId", raw,
         left(regexp_replace(regexp_replace(upper(raw), '[^A-Z0-9]+', '_', 'g'), '^_+|_+$', '', 'g'), 60) as key
  from used
)
insert into "LeadStatusDefinition" (id, "tenantId", key, label, tone, category, "order")
select gen_random_uuid()::text, k."tenantId", k.key,
       left(case when k.raw = upper(k.raw)
                 then upper(left(replace(k.raw, '_', ' '), 1)) || lower(substr(replace(k.raw, '_', ' '), 2))
                 else k.raw end, 60),
       'neutral',
       case when k.key = 'DISQUALIFIED' then 'LOST' else 'OPEN' end,
       100 + row_number() over (partition by k."tenantId" order by k.key)
from keyed k
where k.key ~ '^[A-Z0-9][A-Z0-9_]{0,59}$'
on conflict ("tenantId", key) do nothing;

-- The status key a stored value maps to: the same normalisation as above.
create function crm_lead_status_key(p_status text) returns text
language sql immutable as $$
  select nullif(left(regexp_replace(regexp_replace(upper(btrim(coalesce(p_status, ''))), '[^A-Z0-9]+', '_', 'g'), '^_+|_+$', '', 'g'), 60), '')
$$;

-- A lead's status category. Falls back to the original fixed names when a tenant has no row for
-- the value, so nothing changes for a value an admin hasn't defined. SECURITY DEFINER so
-- background jobs that run without a tenant context still see the tenant's definitions; it
-- returns only the category word.
create function crm_lead_status_category(p_tenant text, p_status text) returns text
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select d.category from "LeadStatusDefinition" d
      where d."tenantId" = p_tenant and d.key = crm_lead_status_key(p_status) limit 1),
    case crm_lead_status_key(p_status)
      when 'CONVERTED' then 'CONVERTED'
      when 'LOST' then 'LOST'
      when 'DISQUALIFIED' then 'LOST'
      else 'OPEN'
    end)
$$;
