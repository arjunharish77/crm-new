alter table "Application" add column "eligibilityFacts" jsonb not null default '{}'::jsonb,
 add column "eligibilityVersion" integer not null default 0;
