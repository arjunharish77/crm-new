-- Duplicate-rule enforcement performance and deleted-record handling (follows 0116).
--
-- 0116's trigger took a tenant-wide advisory lock and evaluated every rule by computing
-- to_jsonb(t) for every row in the tenant, on every Lead/Opportunity INSERT and UPDATE -- even
-- when the tenant had no rules and even when the update touched no rule field. Measured on a
-- 300k-lead tenant: ~2.5s per insert and ~2.6s per unrelated update (e.g. a score change), all
-- serialized behind that lock. This version:
--   * returns immediately (no lock, no scan) when the tenant has no enabled rule for the table;
--   * on UPDATE, keeps the stored warnings and skips the lock/scan unless a rule's key, the
--     record's merged state or its deleted state actually changed;
--   * compares normalized column expressions directly, backed by matching expression indexes,
--     instead of to_jsonb() over the whole tenant;
--   * ignores soft-deleted records, both as the record being saved and as potential matches
--     (restoring a deleted record re-checks it, exactly like un-merging does).
-- Matching semantics are otherwise unchanged: trimmed, case-insensitive text; phone digits only;
-- every field in a rule must be non-empty and equal; BLOCK only fires on INSERT or when the key
-- (or merged/deleted state) changes, so edits to unrelated fields on existing duplicates remain
-- possible.

-- Normalized form of one rule field of one row. Must stay identical to crm_duplicate_key()'s
-- per-field normalization, and to the expression indexes below.
create or replace function crm_duplicate_field_sql(field text) returns text
language sql immutable as $$
 select case when field = 'phone' then 'regexp_replace(t."phone", ''[^0-9]'', '''', ''g'')'
        else format('lower(btrim(t.%I))', field) end
$$;

create or replace function crm_enforce_duplicate_rules() returns trigger language plpgsql as $$
declare
 r record;
 candidate text[];
 old_key text[];
 conditions text;
 duplicate_found boolean;
 locked boolean := false;
 relevant_change boolean := false;
begin
 if new."tenantId" is null or new."mergedIntoId" is not null or new."deletedAt" is not null then
   new."duplicateWarnings" := '[]'::jsonb;
   return new;
 end if;
 if not exists (select 1 from "DuplicateRule" where "tenantId" = new."tenantId" and entity = TG_TABLE_NAME and enabled) then
   new."duplicateWarnings" := '[]'::jsonb;
   return new;
 end if;

 if TG_OP = 'UPDATE' then
   relevant_change := new."tenantId" is distinct from old."tenantId"
     or old."mergedIntoId" is not null
     or old."deletedAt" is not null;
   if not relevant_change then
     for r in select fields from "DuplicateRule" where "tenantId" = new."tenantId" and entity = TG_TABLE_NAME and enabled loop
       if crm_duplicate_key(to_jsonb(new), r.fields) is distinct from crm_duplicate_key(to_jsonb(old), r.fields) then
         relevant_change := true;
         exit;
       end if;
     end loop;
   end if;
   if not relevant_change then
     new."duplicateWarnings" := old."duplicateWarnings";
     return new;
   end if;
 end if;

 new."duplicateWarnings" := '[]'::jsonb;
 for r in select * from "DuplicateRule" where "tenantId" = new."tenantId" and entity = TG_TABLE_NAME and enabled order by id loop
   candidate := crm_duplicate_key(to_jsonb(new), r.fields);
   if candidate is null then continue; end if;
   if not locked then
     -- Serializes writers and rule edits within this tenant (same key as the rules API). A
     -- fresh SELECT after the lock sees rows committed by the preceding writer at READ
     -- COMMITTED isolation. Only taken when a rule actually has to be evaluated.
     perform pg_advisory_xact_lock(hashtextextended('duplicate-rules:' || new."tenantId", 0));
     locked := true;
   end if;
   select string_agg(format('%s = $3[%s]', crm_duplicate_field_sql(f.field), f.ord), ' and ')
     into conditions from unnest(r.fields) with ordinality as f(field, ord);
   execute format(
     'select exists(select 1 from %I t where t."tenantId" = $1 and t.id <> $2 and t."mergedIntoId" is null and t."deletedAt" is null and %s)',
     TG_TABLE_NAME, conditions)
   into duplicate_found using new."tenantId", new.id, candidate;
   if duplicate_found then
     old_key := null;
     if TG_OP = 'UPDATE' then old_key := crm_duplicate_key(to_jsonb(old), r.fields); end if;
     if r.action = 'BLOCK' and (TG_OP = 'INSERT' or candidate is distinct from old_key
         or old."mergedIntoId" is not null or old."deletedAt" is not null) then
       raise exception using errcode = 'P0001', message = 'DUPLICATE_RULE_BLOCK: ' || r.name;
     end if;
     new."duplicateWarnings" := new."duplicateWarnings" || jsonb_build_array(jsonb_build_object('ruleId', r.id, 'name', r.name, 'action', r.action));
   end if;
 end loop;
 return new;
end $$;

-- Expression indexes matching crm_duplicate_field_sql() exactly, for the fields that can
-- identify a record on their own. (source/status/stageId/priority/opportunityTypeId are
-- low-selectivity and only meaningful combined with one of these.)
create index if not exists "Lead_dup_email_idx" on "Lead" ("tenantId", lower(btrim(email)));
create index if not exists "Lead_dup_phone_idx" on "Lead" ("tenantId", regexp_replace(phone, '[^0-9]', '', 'g'));
create index if not exists "Lead_dup_name_idx" on "Lead" ("tenantId", lower(btrim(name)));
create index if not exists "Lead_dup_company_idx" on "Lead" ("tenantId", lower(btrim(company)));
create index if not exists "Opportunity_dup_title_idx" on "Opportunity" ("tenantId", lower(btrim(title)));
create index if not exists "Opportunity_dup_lead_idx" on "Opportunity" ("tenantId", lower(btrim("leadId")));
