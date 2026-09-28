create table "DuplicateRule" (
 id text primary key,
 "tenantId" text not null references "Tenant"(id) on delete cascade,
 entity text not null check (entity in ('Lead','Opportunity')),
 name text not null check (length(name) between 1 and 100),
 fields text[] not null check (cardinality(fields) between 1 and 5),
 action text not null check (action in ('BLOCK','WARN')),
 enabled boolean not null default true,
 version integer not null default 1,
 "updatedAt" timestamptz not null default now(),
 check ((entity = 'Lead' and fields <@ array['name','email','phone','company','source','status']) or
        (entity = 'Opportunity' and fields <@ array['title','leadId','opportunityTypeId','stageId','priority']))
);
create index on "DuplicateRule" ("tenantId", entity);
alter table "DuplicateRule" enable row level security;
create policy tenant_scope on "DuplicateRule" using ("tenantId" = nullif(current_setting('app.tenant_id',true),'')) with check ("tenantId" = nullif(current_setting('app.tenant_id',true),''));
alter table "Lead" add column "duplicateWarnings" jsonb not null default '[]';
alter table "Opportunity" add column "duplicateWarnings" jsonb not null default '[]';

-- Exact, case-insensitive trimmed matching. Phone punctuation is ignored, but country
-- codes are never guessed. All selected fields must be present and match.
create function crm_duplicate_key(record jsonb, fields text[]) returns text[]
language sql immutable as $$
 select case when bool_and(value is not null and value <> '') then array_agg(value order by ord) end
 from (select ord, case when field = 'phone' then regexp_replace(record->>field, '[^0-9]', '', 'g')
 else lower(btrim(record->>field)) end as value from unnest(fields) with ordinality as f(field,ord)) v
$$;
create function crm_enforce_duplicate_rules() returns trigger language plpgsql as $$
declare r record; candidate text[]; duplicate_found boolean; old_key text[];
begin
 new."duplicateWarnings" := '[]'::jsonb;
 if new."tenantId" is null or new."mergedIntoId" is not null then return new; end if;
 -- Serializes writers and rule edits within this tenant. A fresh SELECT after the
 -- lock sees committed rows from the preceding writer at READ COMMITTED isolation.
 perform pg_advisory_xact_lock(hashtextextended('duplicate-rules:' || new."tenantId", 0));
 for r in select * from "DuplicateRule" where "tenantId" = new."tenantId" and entity = TG_TABLE_NAME and enabled order by id loop
   candidate := crm_duplicate_key(to_jsonb(new), r.fields);
   if candidate is null then continue; end if;
   execute format('select exists(select 1 from %I t where t."tenantId" = $1 and t.id <> $2 and t."mergedIntoId" is null and crm_duplicate_key(to_jsonb(t), $3) = $4)',TG_TABLE_NAME)
   into duplicate_found using new."tenantId",new.id,r.fields,candidate;
   if duplicate_found then
     old_key := null;
     if TG_OP = 'UPDATE' then old_key := crm_duplicate_key(to_jsonb(old), r.fields); end if;
     if r.action = 'BLOCK' and (TG_OP = 'INSERT' or candidate is distinct from old_key or old."mergedIntoId" is not null) then
       raise exception using errcode = 'P0001', message = 'DUPLICATE_RULE_BLOCK: ' || r.name;
     end if;
     new."duplicateWarnings" := new."duplicateWarnings" || jsonb_build_array(jsonb_build_object('ruleId',r.id,'name',r.name,'action',r.action));
   end if;
 end loop;
 return new;
end $$;
create trigger lead_duplicate_rules before insert or update on "Lead" for each row execute function crm_enforce_duplicate_rules();
create trigger opportunity_duplicate_rules before insert or update on "Opportunity" for each row execute function crm_enforce_duplicate_rules();
