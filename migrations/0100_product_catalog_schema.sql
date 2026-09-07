-- Priority Module 12 -- Product Catalog and Enrollment/Application Management. Item 1 of 20:
-- "Add catalog schema with tenant isolation." Confirmed genuinely greenfield (no University/
-- Program/ProductCatalog table existed anywhere before this). This migration builds ONLY the
-- catalog half (ProductCatalog, University, Campus, Program, Course, Specialization, Intake,
-- FeePlan, ScholarshipRule, EligibilityRule, CatalogVersion) -- the application/enrollment
-- schema (Application, ApplicationStage, etc.) is this same module's own separate, later item,
-- deliberately not built here. No UI, no repository/API layer, and no wiring into
-- Opportunity/OpportunityType exists yet either -- those are later items in this same module,
-- each depending on this schema existing first.
--
-- Hierarchy: ProductCatalog -> University -> {Campus, Program} -> Program -> {Course, Intake,
-- FeePlan, ScholarshipRule, EligibilityRule} -> Course -> Specialization. CatalogVersion is a
-- point-in-time JSONB snapshot of a whole catalog (mirroring this app's other versioned
-- entities, e.g. CustomReport/DashboardTab publish-version history), not yet wired to any real
-- publish/rollback action -- that logic is a later item too.
--
-- Run manually against the database, then re-export SCHEMA.md.

create table if not exists "ProductCatalog" (
  "id" text primary key,
  "tenantId" text not null references "Tenant"("id"),
  "name" text not null,
  "description" text,
  "isActive" boolean not null default true,
  "createdAt" timestamp with time zone not null default now(),
  "updatedAt" timestamp with time zone not null default now(),
  unique ("tenantId", "name")
);

create table if not exists "University" (
  "id" text primary key,
  "tenantId" text not null references "Tenant"("id"),
  "catalogId" text not null references "ProductCatalog"("id") on delete cascade,
  "name" text not null,
  "code" text,
  "country" text,
  "city" text,
  "website" text,
  "logoUrl" text,
  "order" integer not null default 0,
  "isActive" boolean not null default true,
  "createdAt" timestamp with time zone not null default now(),
  "updatedAt" timestamp with time zone not null default now(),
  unique ("tenantId", "catalogId", "name")
);

create table if not exists "Campus" (
  "id" text primary key,
  "tenantId" text not null references "Tenant"("id"),
  "universityId" text not null references "University"("id") on delete cascade,
  "name" text not null,
  "addressLine" text,
  "city" text,
  "state" text,
  "country" text,
  "isActive" boolean not null default true,
  "createdAt" timestamp with time zone not null default now(),
  "updatedAt" timestamp with time zone not null default now(),
  unique ("tenantId", "universityId", "name")
);

-- The top-level qualification/degree offered by a university (e.g. "Bachelor of Science",
-- "MBA") -- item 3's "University 1/2/3 style opportunity types can each have their own stages,
-- course values, fee plans, and required documents" hangs off THIS entity, not Course.
create table if not exists "Program" (
  "id" text primary key,
  "tenantId" text not null references "Tenant"("id"),
  "universityId" text not null references "University"("id") on delete cascade,
  "name" text not null,
  "level" text not null default 'UNDERGRADUATE' check ("level" in ('CERTIFICATE', 'DIPLOMA', 'UNDERGRADUATE', 'POSTGRADUATE', 'DOCTORATE')),
  "durationMonths" integer,
  "description" text,
  "order" integer not null default 0,
  "isActive" boolean not null default true,
  "createdAt" timestamp with time zone not null default now(),
  "updatedAt" timestamp with time zone not null default now(),
  unique ("tenantId", "universityId", "name")
);

-- A specific course/major within a Program (e.g. "Computer Science" under "Bachelor of
-- Science"). Specialization (below) narrows this further (e.g. "AI/ML").
create table if not exists "Course" (
  "id" text primary key,
  "tenantId" text not null references "Tenant"("id"),
  "programId" text not null references "Program"("id") on delete cascade,
  "name" text not null,
  "code" text,
  "description" text,
  "order" integer not null default 0,
  "isActive" boolean not null default true,
  "createdAt" timestamp with time zone not null default now(),
  "updatedAt" timestamp with time zone not null default now(),
  unique ("tenantId", "programId", "name")
);

create table if not exists "Specialization" (
  "id" text primary key,
  "tenantId" text not null references "Tenant"("id"),
  "courseId" text not null references "Course"("id") on delete cascade,
  "name" text not null,
  "description" text,
  "order" integer not null default 0,
  "isActive" boolean not null default true,
  "createdAt" timestamp with time zone not null default now(),
  "updatedAt" timestamp with time zone not null default now(),
  unique ("tenantId", "courseId", "name")
);

-- An admission cycle/term (e.g. "Fall 2026") for a Program, optionally narrowed to one Campus
-- (null campusId means the intake applies across every campus that program is offered at).
create table if not exists "Intake" (
  "id" text primary key,
  "tenantId" text not null references "Tenant"("id"),
  "programId" text not null references "Program"("id") on delete cascade,
  "campusId" text references "Campus"("id") on delete set null,
  "name" text not null,
  "startDate" date,
  "endDate" date,
  "applicationDeadline" date,
  "capacity" integer,
  "isActive" boolean not null default true,
  "createdAt" timestamp with time zone not null default now(),
  "updatedAt" timestamp with time zone not null default now(),
  unique ("tenantId", "programId", "campusId", "name")
);

-- Fee structure for a Program, optionally narrowed to one Intake (null intakeId means this fee
-- plan is the program's own default, used when no intake-specific plan exists).
-- `otherFees` holds any additional named line items (e.g. lab fee, hostel fee) this schema
-- doesn't need a dedicated column for -- an array of {label, amount} objects.
create table if not exists "FeePlan" (
  "id" text primary key,
  "tenantId" text not null references "Tenant"("id"),
  "programId" text not null references "Program"("id") on delete cascade,
  "intakeId" text references "Intake"("id") on delete cascade,
  "name" text not null,
  "currency" text not null default 'INR',
  "applicationFee" numeric not null default 0,
  "admissionFee" numeric not null default 0,
  "tuitionFeeTotal" numeric not null default 0,
  "otherFees" jsonb not null default '[]'::jsonb,
  "isActive" boolean not null default true,
  "createdAt" timestamp with time zone not null default now(),
  "updatedAt" timestamp with time zone not null default now()
);

create table if not exists "ScholarshipRule" (
  "id" text primary key,
  "tenantId" text not null references "Tenant"("id"),
  "programId" text not null references "Program"("id") on delete cascade,
  "name" text not null,
  "description" text,
  "discountType" text not null default 'PERCENTAGE' check ("discountType" in ('PERCENTAGE', 'FIXED_AMOUNT')),
  "discountValue" numeric not null default 0,
  -- Structured eligibility conditions for this scholarship (e.g. minPercentage, category,
  -- entranceExamScore) -- deliberately flexible jsonb rather than a fixed column set, same
  -- convention as EligibilityRule.criteria below; the real rule-builder UI/evaluation logic is
  -- a separate, later item in this same module.
  "criteria" jsonb not null default '{}'::jsonb,
  "isActive" boolean not null default true,
  "createdAt" timestamp with time zone not null default now(),
  "updatedAt" timestamp with time zone not null default now()
);

-- A small set of first-class, commonly-filtered columns plus a flexible `criteria` jsonb blob
-- for everything else this checklist's own "eligibility rule builder" item names (location,
-- nationality, work experience, documents, course prerequisites, custom field conditions) --
-- same "a few first-class columns + flexible jsonb" convention already established elsewhere
-- in this schema (TenantConfig.featureFlags, User.preferences). The real rule-builder UI and
-- evaluation logic against an actual application is a separate, later item in this module.
create table if not exists "EligibilityRule" (
  "id" text primary key,
  "tenantId" text not null references "Tenant"("id"),
  "programId" text not null references "Program"("id") on delete cascade,
  "courseId" text references "Course"("id") on delete cascade,
  "name" text not null,
  "description" text,
  "minEducationLevel" text,
  "minPercentage" numeric,
  "requiredEntranceExam" text,
  "criteria" jsonb not null default '{}'::jsonb,
  "isActive" boolean not null default true,
  "createdAt" timestamp with time zone not null default now(),
  "updatedAt" timestamp with time zone not null default now()
);

-- A point-in-time JSONB snapshot of an entire catalog (mirroring this app's other versioned
-- entities' own publish-history pattern, e.g. CustomReport/DashboardTab). Not yet wired to any
-- real publish/rollback action -- purely the storage shape for now.
create table if not exists "CatalogVersion" (
  "id" text primary key,
  "tenantId" text not null references "Tenant"("id"),
  "catalogId" text not null references "ProductCatalog"("id") on delete cascade,
  "versionNumber" integer not null,
  "snapshot" jsonb not null,
  "notes" text,
  "publishedAt" timestamp with time zone not null default now(),
  "publishedBy" text references "User"("id") on delete set null,
  "createdAt" timestamp with time zone not null default now(),
  unique ("tenantId", "catalogId", "versionNumber")
);

create index if not exists "University_catalog_idx" on "University" ("tenantId", "catalogId");
create index if not exists "Campus_university_idx" on "Campus" ("tenantId", "universityId");
create index if not exists "Program_university_idx" on "Program" ("tenantId", "universityId");
create index if not exists "Course_program_idx" on "Course" ("tenantId", "programId");
create index if not exists "Specialization_course_idx" on "Specialization" ("tenantId", "courseId");
create index if not exists "Intake_program_idx" on "Intake" ("tenantId", "programId");
create index if not exists "Intake_campus_idx" on "Intake" ("tenantId", "campusId");
create index if not exists "FeePlan_program_idx" on "FeePlan" ("tenantId", "programId");
create index if not exists "FeePlan_intake_idx" on "FeePlan" ("tenantId", "intakeId");
create index if not exists "ScholarshipRule_program_idx" on "ScholarshipRule" ("tenantId", "programId");
create index if not exists "EligibilityRule_program_idx" on "EligibilityRule" ("tenantId", "programId");
create index if not exists "CatalogVersion_catalog_idx" on "CatalogVersion" ("tenantId", "catalogId", "versionNumber" desc);

alter table "ProductCatalog" enable row level security;
create policy "tenant_isolation_product_catalog" on "ProductCatalog"
  for all using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));

alter table "University" enable row level security;
create policy "tenant_isolation_university" on "University"
  for all using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));

alter table "Campus" enable row level security;
create policy "tenant_isolation_campus" on "Campus"
  for all using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));

alter table "Program" enable row level security;
create policy "tenant_isolation_program" on "Program"
  for all using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));

alter table "Course" enable row level security;
create policy "tenant_isolation_course" on "Course"
  for all using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));

alter table "Specialization" enable row level security;
create policy "tenant_isolation_specialization" on "Specialization"
  for all using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));

alter table "Intake" enable row level security;
create policy "tenant_isolation_intake" on "Intake"
  for all using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));

alter table "FeePlan" enable row level security;
create policy "tenant_isolation_fee_plan" on "FeePlan"
  for all using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));

alter table "ScholarshipRule" enable row level security;
create policy "tenant_isolation_scholarship_rule" on "ScholarshipRule"
  for all using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));

alter table "EligibilityRule" enable row level security;
create policy "tenant_isolation_eligibility_rule" on "EligibilityRule"
  for all using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));

alter table "CatalogVersion" enable row level security;
create policy "tenant_isolation_catalog_version" on "CatalogVersion"
  for all using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));
