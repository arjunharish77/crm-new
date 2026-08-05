-- Advanced predictive scoring controls and outputs.
--
-- Run manually in local/VPS Postgres via npm run db:migrate:local, then re-export SCHEMA.md.

alter table "ScoringSettings"
  add column if not exists "featureCatalog" jsonb not null default '{"fields":[],"derivedFeatures":[]}'::jsonb,
  add column if not exists "prohibitedFieldKeys" text[] not null default '{}'::text[],
  add column if not exists "qualityThresholds" jsonb not null default '{"minimumHoldoutSampleSize":20,"maximumBrierScore":0.35,"minimumLift":1.2}'::jsonb,
  add column if not exists "approvalMode" text not null default 'MANUAL'
    check ("approvalMode" in ('MANUAL', 'AUTO_PROMOTE_IF_BETTER')),
  add column if not exists "nextRetrainAt" timestamp with time zone,
  add column if not exists "lastDriftCheckedAt" timestamp with time zone,
  add column if not exists "retrainLockAt" timestamp with time zone,
  add column if not exists "retrainLockOwner" text,
  add column if not exists "featureRetentionDays" integer not null default 365,
  add column if not exists "lowConfidenceFallbackRules" jsonb not null default '{}'::jsonb;

alter table "ScoringModelVersion"
  add column if not exists "reviewedBy" text references "User"("id"),
  add column if not exists "reviewedAt" timestamp with time zone,
  add column if not exists "reviewNotes" text,
  add column if not exists "rollbackReason" text,
  add column if not exists "retiredBy" text references "User"("id"),
  add column if not exists "retiredAt" timestamp with time zone,
  add column if not exists "driftMetrics" jsonb not null default '{}'::jsonb;

alter table "ScoringTrainingRun"
  add column if not exists "triggeredBy" text not null default 'MANUAL'
    check ("triggeredBy" in ('MANUAL', 'SCHEDULED', 'QUALITY_DRIFT', 'API')),
  add column if not exists "inputConfig" jsonb not null default '{}'::jsonb,
  add column if not exists "qualityStatus" text not null default 'UNKNOWN'
    check ("qualityStatus" in ('PASS', 'WARN', 'FAIL', 'UNKNOWN'));

alter table "RecordScore"
  add column if not exists "expectedResponseLikelihood" integer,
  add column if not exists "duplicateRisk" integer,
  add column if not exists "staleRisk" integer,
  add column if not exists "expectedCloseRisk" integer,
  add column if not exists "suggestedCloseDate" timestamp with time zone,
  add column if not exists "suggestedCloseDateDeltaDays" integer,
  add column if not exists "nextBestAction" text,
  add column if not exists "nextBestActivityType" text,
  add column if not exists "topDrivers" jsonb not null default '[]'::jsonb,
  add column if not exists "missingDataWarnings" jsonb not null default '[]'::jsonb,
  add column if not exists "similarRecordIds" jsonb not null default '[]'::jsonb,
  add column if not exists "suggestedDataImprovements" jsonb not null default '[]'::jsonb,
  add column if not exists "overrideReason" text,
  add column if not exists "overrideUntil" timestamp with time zone,
  add column if not exists "overrideOwnerId" text references "User"("id"),
  add column if not exists "overriddenAt" timestamp with time zone;

create table if not exists "ScoringFeatureCatalog" (
  "id" text primary key,
  "tenantId" text not null references "Tenant"("id"),
  "targetModule" text not null check ("targetModule" in ('LEAD', 'OPPORTUNITY')),
  "fieldKey" text not null,
  "label" text not null,
  "source" text not null default 'SYSTEM'
    check ("source" in ('SYSTEM', 'CUSTOM_FIELD', 'DERIVED', 'EMBEDDING')),
  "dataType" text not null default 'UNKNOWN',
  "isIncluded" boolean not null default true,
  "isSensitive" boolean not null default false,
  "isProhibited" boolean not null default false,
  "coveragePercent" numeric,
  "nonNullCount" integer not null default 0,
  "distinctCount" integer not null default 0,
  "lastProfiledAt" timestamp with time zone,
  "createdAt" timestamp with time zone not null default current_timestamp,
  "updatedAt" timestamp with time zone not null default current_timestamp,
  unique ("tenantId", "targetModule", "fieldKey")
);

create table if not exists "ScoringManualOverride" (
  "id" text primary key,
  "tenantId" text not null references "Tenant"("id"),
  "recordType" text not null check ("recordType" in ('LEAD', 'OPPORTUNITY')),
  "recordId" text not null,
  "scoreBand" text check ("scoreBand" in ('HOT', 'WARM', 'COLD', 'RISK')),
  "conversionProbability" integer,
  "winProbability" integer,
  "stallRisk" integer,
  "reason" text not null,
  "expiresAt" timestamp with time zone,
  "createdBy" text references "User"("id"),
  "clearedBy" text references "User"("id"),
  "clearedAt" timestamp with time zone,
  "clearReason" text,
  "createdAt" timestamp with time zone not null default current_timestamp,
  "updatedAt" timestamp with time zone not null default current_timestamp
);

create index if not exists "RecordScore_probability_idx"
  on "RecordScore" ("tenantId", "recordType", "conversionProbability", "winProbability", "stallRisk");

create index if not exists "RecordScore_override_idx"
  on "RecordScore" ("tenantId", "recordType", "overrideUntil")
  where "source" = 'MANUAL_OVERRIDE';

create index if not exists "ScoringSettings_retrain_due_idx"
  on "ScoringSettings" ("nextRetrainAt", "retrainLockAt")
  where "isEnabled" = true and "retrainCadence" != 'MANUAL';

create index if not exists "ScoringFeatureCatalog_tenant_module_idx"
  on "ScoringFeatureCatalog" ("tenantId", "targetModule", "isIncluded", "isProhibited");

create index if not exists "ScoringManualOverride_record_idx"
  on "ScoringManualOverride" ("tenantId", "recordType", "recordId", "clearedAt", "expiresAt");

alter table "ScoringFeatureCatalog" enable row level security;
alter table "ScoringManualOverride" enable row level security;

create policy "tenant_isolation_scoring_feature_catalog" on "ScoringFeatureCatalog"
  for all using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));

create policy "tenant_isolation_scoring_manual_override" on "ScoringManualOverride"
  for all using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));
