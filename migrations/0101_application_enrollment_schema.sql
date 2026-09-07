-- Priority Module 12 -- Product Catalog and Enrollment/Application Management. Item 2 of 20:
-- "Add application/enrollment schema." Depends on migration 0100 (ProductCatalog/University/
-- Program/Course/Specialization/Campus/Intake/FeePlan) already existing. Schema only, same as
-- 0100 -- no repository/API/UI layer, no application-number generation logic (a separate, later
-- item), no eligibility/document-checklist evaluation logic, and no wiring into
-- Lead/Opportunity conversion yet (also later items). `applicationNumber` is stored as `text`
-- (not an integer sequence) specifically so the later "prefix/suffix templates, financial-year
-- support" item can populate it without a schema change.
--
-- Shape: Application is the core record (parallel to Opportunity, explicitly linkable to a
-- Lead/Opportunity for the later conversion item) with a currently-open ApplicationStage
-- (scoped per-Program, mirroring StageDefinition/OpportunityType). ApplicationStageHistory,
-- ApplicationDocument (+ its per-program ApplicationChecklist definition),
-- ApplicationPaymentMilestone, ApplicationOffer, and ApplicationDecision are all child
-- event/state tables off one Application. Enrollment is the terminal record created once an
-- offer is accepted.
--
-- Run manually against the database, then re-export SCHEMA.md.

-- Scoped per-Program (not per-university/tenant-wide), mirroring StageDefinition's own
-- per-OpportunityType scoping -- this is what item 3's "University 1/2/3 style opportunity
-- types can each have their own stages" actually hangs off.
create table if not exists "ApplicationStage" (
  "id" text primary key,
  "tenantId" text not null references "Tenant"("id"),
  "programId" text not null references "Program"("id") on delete cascade,
  "name" text not null,
  "order" integer not null default 0,
  "slaDays" integer not null default 0,
  "isClosed" boolean not null default false,
  "isWon" boolean not null default false,
  "color" text,
  "createdAt" timestamp with time zone not null default now(),
  "updatedAt" timestamp with time zone not null default now(),
  unique ("tenantId", "programId", "name")
);

-- Per-program checklist DEFINITION (e.g. "Passport Copy", "Transcript") -- the actual
-- per-application upload/verification instance is ApplicationDocument below, which optionally
-- references one of these.
create table if not exists "ApplicationChecklist" (
  "id" text primary key,
  "tenantId" text not null references "Tenant"("id"),
  "programId" text not null references "Program"("id") on delete cascade,
  "name" text not null,
  "description" text,
  "isRequired" boolean not null default true,
  "order" integer not null default 0,
  "isActive" boolean not null default true,
  "createdAt" timestamp with time zone not null default now(),
  "updatedAt" timestamp with time zone not null default now(),
  unique ("tenantId", "programId", "name")
);

create table if not exists "Application" (
  "id" text primary key,
  "tenantId" text not null references "Tenant"("id"),
  -- Text, not integer -- the later "application number generation rules" item needs room for
  -- prefix/suffix templates and financial-year components, not just a raw sequence value.
  "applicationNumber" text not null,
  "leadId" text references "Lead"("id") on delete set null,
  "opportunityId" text references "Opportunity"("id") on delete set null,
  "programId" text not null references "Program"("id"),
  "courseId" text references "Course"("id") on delete set null,
  "specializationId" text references "Specialization"("id") on delete set null,
  "campusId" text references "Campus"("id") on delete set null,
  "intakeId" text references "Intake"("id") on delete set null,
  "stageId" text not null references "ApplicationStage"("id"),
  "ownerId" text references "User"("id") on delete set null,
  "partnerId" text references "PartnerProfile"("id") on delete set null,
  "submittedAt" timestamp with time zone,
  "createdBy" text references "User"("id") on delete set null,
  "createdAt" timestamp with time zone not null default now(),
  "updatedAt" timestamp with time zone not null default now(),
  unique ("tenantId", "applicationNumber")
);

create table if not exists "ApplicationStageHistory" (
  "id" text primary key,
  "tenantId" text not null references "Tenant"("id"),
  "applicationId" text not null references "Application"("id") on delete cascade,
  "fromStageId" text references "ApplicationStage"("id") on delete set null,
  "toStageId" text not null references "ApplicationStage"("id"),
  "changedById" text references "User"("id") on delete set null,
  "notes" text,
  "changedAt" timestamp with time zone not null default now()
);

create table if not exists "ApplicationDocument" (
  "id" text primary key,
  "tenantId" text not null references "Tenant"("id"),
  "applicationId" text not null references "Application"("id") on delete cascade,
  -- Nullable -- an ad-hoc document a reviewer requests that isn't one of the program's own
  -- predefined checklist items still needs somewhere to live.
  "checklistItemId" text references "ApplicationChecklist"("id") on delete set null,
  "name" text not null,
  "fileStoragePath" text,
  "uploadStatus" text not null default 'PENDING' check ("uploadStatus" in ('PENDING', 'UPLOADED')),
  "verificationStatus" text not null default 'PENDING' check ("verificationStatus" in ('PENDING', 'VERIFIED', 'REJECTED')),
  "rejectionReason" text,
  "expiryDate" date,
  "reviewerId" text references "User"("id") on delete set null,
  "comments" text,
  "uploadedAt" timestamp with time zone,
  "verifiedAt" timestamp with time zone,
  "createdAt" timestamp with time zone not null default now(),
  "updatedAt" timestamp with time zone not null default now()
);

create table if not exists "ApplicationOffer" (
  "id" text primary key,
  "tenantId" text not null references "Tenant"("id"),
  "applicationId" text not null references "Application"("id") on delete cascade,
  "offerType" text not null default 'UNCONDITIONAL' check ("offerType" in ('UNCONDITIONAL', 'CONDITIONAL')),
  "conditions" text,
  "status" text not null default 'DRAFT' check ("status" in ('DRAFT', 'ISSUED', 'ACCEPTED', 'REJECTED', 'DEFERRED', 'WITHDRAWN', 'CANCELLED', 'EXPIRED')),
  "offerLetterStoragePath" text,
  "issuedAt" timestamp with time zone,
  "respondedAt" timestamp with time zone,
  "expiresAt" timestamp with time zone,
  "deferredToIntakeId" text references "Intake"("id") on delete set null,
  "cancellationReason" text,
  "refundStatus" text check ("refundStatus" in ('NOT_APPLICABLE', 'PENDING', 'PARTIAL', 'COMPLETED')),
  "createdBy" text references "User"("id") on delete set null,
  "createdAt" timestamp with time zone not null default now(),
  "updatedAt" timestamp with time zone not null default now()
);

create table if not exists "ApplicationPaymentMilestone" (
  "id" text primary key,
  "tenantId" text not null references "Tenant"("id"),
  "applicationId" text not null references "Application"("id") on delete cascade,
  "feePlanId" text references "FeePlan"("id") on delete set null,
  "milestoneType" text not null default 'OTHER' check ("milestoneType" in ('APPLICATION_FEE', 'ADMISSION_FEE', 'SEMESTER_FEE', 'SCHOLARSHIP_ADJUSTMENT', 'OTHER')),
  "label" text not null,
  "amount" numeric not null default 0,
  "currency" text not null default 'INR',
  "dueDate" date,
  "paymentStatus" text not null default 'PENDING' check ("paymentStatus" in ('PENDING', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'WAIVED')),
  "paidAmount" numeric not null default 0,
  "paidAt" timestamp with time zone,
  "receiptNumber" text,
  -- Deliberately a plain text reference, not a FK to any specific payment gateway's own table --
  -- "integration-ready" per this item's own wording, not a real gateway integration (out of
  -- scope for this schema-only pass).
  "paymentReference" text,
  "createdAt" timestamp with time zone not null default now(),
  "updatedAt" timestamp with time zone not null default now()
);

-- The decision AUDIT TRAIL (item 11's "audit trail" + item 10's "approval gates") -- distinct
-- from ApplicationOffer's own status field, since a single application can accumulate multiple
-- decision events (e.g. an initial waitlist, then a later approve) across its lifecycle.
create table if not exists "ApplicationDecision" (
  "id" text primary key,
  "tenantId" text not null references "Tenant"("id"),
  "applicationId" text not null references "Application"("id") on delete cascade,
  "decisionType" text not null check ("decisionType" in ('APPROVE', 'REJECT', 'WAITLIST', 'DEFER', 'ESCALATE')),
  "decidedById" text references "User"("id") on delete set null,
  "notes" text,
  "decidedAt" timestamp with time zone not null default now(),
  "createdAt" timestamp with time zone not null default now()
);

-- The terminal record once an offer is accepted -- one enrollment per application.
-- campusId/programId/intakeId are denormalized off the Application at enrollment time (a
-- deferral/transfer afterward shouldn't rewrite history on the Application itself).
create table if not exists "Enrollment" (
  "id" text primary key,
  "tenantId" text not null references "Tenant"("id"),
  "applicationId" text not null references "Application"("id") on delete cascade,
  "studentIdNumber" text,
  "enrollmentDate" date not null default current_date,
  "status" text not null default 'ACTIVE' check ("status" in ('ACTIVE', 'DEFERRED', 'WITHDRAWN', 'COMPLETED')),
  "campusId" text references "Campus"("id") on delete set null,
  "programId" text references "Program"("id") on delete set null,
  "intakeId" text references "Intake"("id") on delete set null,
  "createdAt" timestamp with time zone not null default now(),
  "updatedAt" timestamp with time zone not null default now(),
  unique ("tenantId", "applicationId")
);

create index if not exists "ApplicationStage_program_idx" on "ApplicationStage" ("tenantId", "programId");
create index if not exists "ApplicationChecklist_program_idx" on "ApplicationChecklist" ("tenantId", "programId");
create index if not exists "Application_program_idx" on "Application" ("tenantId", "programId");
create index if not exists "Application_stage_idx" on "Application" ("tenantId", "stageId");
create index if not exists "Application_owner_idx" on "Application" ("tenantId", "ownerId");
create index if not exists "Application_lead_idx" on "Application" ("tenantId", "leadId");
create index if not exists "Application_opportunity_idx" on "Application" ("tenantId", "opportunityId");
create index if not exists "Application_intake_idx" on "Application" ("tenantId", "intakeId");
create index if not exists "ApplicationStageHistory_application_idx" on "ApplicationStageHistory" ("tenantId", "applicationId", "changedAt" desc);
create index if not exists "ApplicationDocument_application_idx" on "ApplicationDocument" ("tenantId", "applicationId");
create index if not exists "ApplicationOffer_application_idx" on "ApplicationOffer" ("tenantId", "applicationId");
create index if not exists "ApplicationPaymentMilestone_application_idx" on "ApplicationPaymentMilestone" ("tenantId", "applicationId");
create index if not exists "ApplicationPaymentMilestone_status_idx" on "ApplicationPaymentMilestone" ("tenantId", "paymentStatus");
create index if not exists "ApplicationDecision_application_idx" on "ApplicationDecision" ("tenantId", "applicationId", "decidedAt" desc);
create index if not exists "Enrollment_program_idx" on "Enrollment" ("tenantId", "programId");

alter table "ApplicationStage" enable row level security;
create policy "tenant_isolation_application_stage" on "ApplicationStage"
  for all using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));

alter table "ApplicationChecklist" enable row level security;
create policy "tenant_isolation_application_checklist" on "ApplicationChecklist"
  for all using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));

alter table "Application" enable row level security;
create policy "tenant_isolation_application" on "Application"
  for all using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));

alter table "ApplicationStageHistory" enable row level security;
create policy "tenant_isolation_application_stage_history" on "ApplicationStageHistory"
  for all using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));

alter table "ApplicationDocument" enable row level security;
create policy "tenant_isolation_application_document" on "ApplicationDocument"
  for all using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));

alter table "ApplicationOffer" enable row level security;
create policy "tenant_isolation_application_offer" on "ApplicationOffer"
  for all using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));

alter table "ApplicationPaymentMilestone" enable row level security;
create policy "tenant_isolation_application_payment_milestone" on "ApplicationPaymentMilestone"
  for all using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));

alter table "ApplicationDecision" enable row level security;
create policy "tenant_isolation_application_decision" on "ApplicationDecision"
  for all using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));

alter table "Enrollment" enable row level security;
create policy "tenant_isolation_enrollment" on "Enrollment"
  for all using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));
