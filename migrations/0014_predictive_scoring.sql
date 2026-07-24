-- Predictive scoring foundation.
--
-- Run manually in the Supabase SQL Editor, then re-export SCHEMA.md.
-- This stores explainable feature snapshots and latest/history scores while
-- keeping the existing rule-based Lead.score as a fallback.

create table if not exists "ScoringModel" (
  "id" text primary key,
  "tenantId" text not null references "Tenant"("id"),
  "name" text not null,
  "targetModule" text not null check ("targetModule" in ('LEAD', 'OPPORTUNITY')),
  "objective" text not null check ("objective" in ('CONVERSION', 'OPPORTUNITY_CREATED', 'WIN_PROBABILITY', 'STALL_RISK')),
  "status" text not null default 'DRAFT' check ("status" in ('DRAFT', 'ACTIVE', 'ARCHIVED')),
  "createdBy" text references "User"("id"),
  "createdAt" timestamp without time zone not null default current_timestamp,
  "updatedAt" timestamp without time zone not null default current_timestamp
);

create table if not exists "ScoringModelVersion" (
  "id" text primary key,
  "tenantId" text not null references "Tenant"("id"),
  "modelId" text not null references "ScoringModel"("id"),
  "versionNumber" integer not null,
  "algorithm" text not null default 'PREDICTIVE_WEIGHTED_BUCKET_CALIBRATION',
  "status" text not null default 'DRAFT' check ("status" in ('DRAFT', 'PROMOTED', 'RETIRED')),
  "featureConfig" jsonb not null default '{}'::jsonb,
  "metrics" jsonb not null default '{}'::jsonb,
  "promotedBy" text references "User"("id"),
  "promotedAt" timestamp without time zone,
  "createdAt" timestamp without time zone not null default current_timestamp,
  unique ("tenantId", "modelId", "versionNumber")
);

create table if not exists "ScoringTrainingRun" (
  "id" text primary key,
  "tenantId" text not null references "Tenant"("id"),
  "modelId" text references "ScoringModel"("id"),
  "modelVersionId" text references "ScoringModelVersion"("id"),
  "targetModule" text not null check ("targetModule" in ('LEAD', 'OPPORTUNITY', 'BOTH')),
  "status" text not null default 'PENDING' check ("status" in ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED')),
  "startedAt" timestamp without time zone,
  "completedAt" timestamp without time zone,
  "recordsProcessed" integer not null default 0,
  "recordsSkipped" integer not null default 0,
  "metrics" jsonb not null default '{}'::jsonb,
  "error" text,
  "createdBy" text references "User"("id"),
  "createdAt" timestamp without time zone not null default current_timestamp
);

create table if not exists "ScoringSettings" (
  "id" text primary key,
  "tenantId" text not null unique references "Tenant"("id"),
  "isEnabled" boolean not null default false,
  "targetModules" text[] not null default array['LEAD','OPPORTUNITY']::text[],
  "objective" text not null default 'CONVERSION'
    check ("objective" in ('CONVERSION', 'OPPORTUNITY_CREATED', 'WIN_PROBABILITY', 'STALL_RISK')),
  "minimumHistoricalRecords" integer not null default 25,
  "lookbackDays" integer not null default 365,
  "retrainCadence" text not null default 'MANUAL' check ("retrainCadence" in ('MANUAL', 'WEEKLY', 'MONTHLY')),
  "fallbackMode" text not null default 'RULE_SCORE' check ("fallbackMode" in ('RULE_SCORE', 'ZERO', 'KEEP_EXISTING')),
  "promotedLeadModelVersionId" text references "ScoringModelVersion"("id"),
  "promotedOpportunityModelVersionId" text references "ScoringModelVersion"("id"),
  "lastRecomputedAt" timestamp without time zone,
  "updatedBy" text references "User"("id"),
  "createdAt" timestamp without time zone not null default current_timestamp,
  "updatedAt" timestamp without time zone not null default current_timestamp
);

create table if not exists "ScoringFeatureSnapshot" (
  "id" text primary key,
  "tenantId" text not null references "Tenant"("id"),
  "modelVersionId" text references "ScoringModelVersion"("id"),
  "recordType" text not null check ("recordType" in ('LEAD', 'OPPORTUNITY')),
  "recordId" text not null,
  "features" jsonb not null,
  "sourceDataUpdatedAt" timestamp without time zone,
  "createdAt" timestamp without time zone not null default current_timestamp
);

create table if not exists "RecordScore" (
  "id" text primary key,
  "tenantId" text not null references "Tenant"("id"),
  "modelVersionId" text references "ScoringModelVersion"("id"),
  "recordType" text not null check ("recordType" in ('LEAD', 'OPPORTUNITY')),
  "recordId" text not null,
  "fitScore" integer,
  "engagementScore" integer,
  "conversionProbability" integer,
  "winProbability" integer,
  "stallRisk" integer,
  "scoreBand" text not null check ("scoreBand" in ('HOT', 'WARM', 'COLD', 'RISK')),
  "confidence" integer not null default 0,
  "reasons" jsonb not null default '[]'::jsonb,
  "source" text not null default 'PREDICTIVE_SCORING'
    check ("source" in ('PREDICTIVE_SCORING', 'RULE_FALLBACK', 'MANUAL_OVERRIDE')),
  "featureSnapshotId" text references "ScoringFeatureSnapshot"("id"),
  "calculatedAt" timestamp without time zone not null default current_timestamp,
  "createdAt" timestamp without time zone not null default current_timestamp,
  "updatedAt" timestamp without time zone not null default current_timestamp,
  unique ("tenantId", "recordType", "recordId")
);

alter table "RecordScore"
  drop constraint if exists "RecordScore_source_check";

alter table "RecordScore"
  add constraint "RecordScore_source_check"
  check ("source" in ('PREDICTIVE_SCORING', 'SELF_LEARNING', 'RULE_FALLBACK', 'MANUAL_OVERRIDE'));

create table if not exists "RecordScoreHistory" (
  "id" text primary key,
  "tenantId" text not null references "Tenant"("id"),
  "recordScoreId" text references "RecordScore"("id"),
  "recordType" text not null check ("recordType" in ('LEAD', 'OPPORTUNITY')),
  "recordId" text not null,
  "previousScore" jsonb,
  "nextScore" jsonb not null,
  "changeReason" text not null default 'RECOMPUTE',
  "createdAt" timestamp without time zone not null default current_timestamp
);

create index if not exists "ScoringModel_tenant_target_idx" on "ScoringModel" ("tenantId", "targetModule", "status");
create index if not exists "ScoringModelVersion_model_idx" on "ScoringModelVersion" ("tenantId", "modelId", "status");
create index if not exists "ScoringTrainingRun_tenant_created_idx" on "ScoringTrainingRun" ("tenantId", "createdAt" desc);
create index if not exists "ScoringFeatureSnapshot_record_idx" on "ScoringFeatureSnapshot" ("tenantId", "recordType", "recordId", "createdAt" desc);
create index if not exists "RecordScore_tenant_band_idx" on "RecordScore" ("tenantId", "recordType", "scoreBand", "confidence");
create index if not exists "RecordScoreHistory_record_idx" on "RecordScoreHistory" ("tenantId", "recordType", "recordId", "createdAt" desc);

alter table "ScoringModel" enable row level security;
alter table "ScoringModelVersion" enable row level security;
alter table "ScoringTrainingRun" enable row level security;
alter table "ScoringSettings" enable row level security;
alter table "ScoringFeatureSnapshot" enable row level security;
alter table "RecordScore" enable row level security;
alter table "RecordScoreHistory" enable row level security;

create policy "tenant_isolation_scoring_model" on "ScoringModel"
  for all using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));

create policy "tenant_isolation_scoring_model_version" on "ScoringModelVersion"
  for all using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));

create policy "tenant_isolation_scoring_training_run" on "ScoringTrainingRun"
  for all using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));

create policy "tenant_isolation_scoring_settings" on "ScoringSettings"
  for all using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));

create policy "tenant_isolation_scoring_feature_snapshot" on "ScoringFeatureSnapshot"
  for all using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));

create policy "tenant_isolation_record_score" on "RecordScore"
  for all using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));

create policy "tenant_isolation_record_score_history" on "RecordScoreHistory"
  for all using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));
