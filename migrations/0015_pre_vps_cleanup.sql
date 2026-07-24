-- Pre-VPS cleanup for legacy opportunity pipeline wording.
--
-- Run manually in the Supabase/Postgres SQL editor or through db:migrate:local,
-- then re-export SCHEMA.md if the schema changed in the same migration batch.

update "OpportunityType"
set name = 'Standard Opportunity',
    "updatedAt" = current_timestamp
where name = 'Sales Pipeline';

update "CustomReport"
set config = jsonb_set(
      config,
      '{tabs}',
      (
        select jsonb_agg(
          case
            when tab->>'id' = 'fee-pipeline' or tab->>'name' = 'Fee Pipeline'
              then tab || '{"id":"high-value-opportunities","name":"High Value Opportunities"}'::jsonb
            else tab
          end
        )
        from jsonb_array_elements(coalesce(config->'tabs', '[]'::jsonb)) as tab
      ),
      true
    ),
    "updatedAt" = current_timestamp
where jsonb_typeof(config->'tabs') = 'array'
  and "chartType" = 'SAVED_VIEW'
  and config->'tabs' @> '[{"name":"Fee Pipeline"}]'::jsonb;
