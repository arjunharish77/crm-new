-- Convert every naive `timestamp without time zone` column to `timestamptz`.
--
-- Context: the database session timezone is Asia/Kolkata, so every naive column in
-- this schema has always stored raw IST wall-clock digits (not UTC) -- e.g. a lead
-- created at 2:00 PM IST is stored as the literal naive value "2026-07-08 14:00:00".
-- The `USING col AT TIME ZONE 'Asia/Kolkata'` clause below reinterprets those existing
-- naive digits as Asia/Kolkata wall-clock time and converts them to the correct absolute
-- timestamptz instant, so no historical data changes meaning -- only the column type and
-- on-disk representation change, from here on stored as an unambiguous UTC instant that
-- renders correctly regardless of session timezone.
--
-- No application code changes are required: no raw SQL in this codebase uses
-- `AT TIME ZONE` or relies on naive-timestamp semantics, and the `pg` driver already
-- returns unambiguous absolute instants for `timestamptz` columns regardless of session
-- timezone, which every display-formatting function in the app already expects.

alter table "Activity"
  alter column "completedAt" type timestamptz using "completedAt" at time zone 'Asia/Kolkata',
  alter column "createdAt" type timestamptz using "createdAt" at time zone 'Asia/Kolkata',
  alter column "deletedAt" type timestamptz using "deletedAt" at time zone 'Asia/Kolkata',
  alter column "dueAt" type timestamptz using "dueAt" at time zone 'Asia/Kolkata',
  alter column "slaTarget" type timestamptz using "slaTarget" at time zone 'Asia/Kolkata',
  alter column "updatedAt" type timestamptz using "updatedAt" at time zone 'Asia/Kolkata';

alter table "ActivityReminder"
  alter column "createdAt" type timestamptz using "createdAt" at time zone 'Asia/Kolkata',
  alter column "remindAt" type timestamptz using "remindAt" at time zone 'Asia/Kolkata',
  alter column "sentAt" type timestamptz using "sentAt" at time zone 'Asia/Kolkata';

alter table "ActivityType"
  alter column "createdAt" type timestamptz using "createdAt" at time zone 'Asia/Kolkata',
  alter column "updatedAt" type timestamptz using "updatedAt" at time zone 'Asia/Kolkata';

alter table "AssignmentLog"
  alter column "assignedAt" type timestamptz using "assignedAt" at time zone 'Asia/Kolkata';

alter table "AssignmentRule"
  alter column "createdAt" type timestamptz using "createdAt" at time zone 'Asia/Kolkata',
  alter column "updatedAt" type timestamptz using "updatedAt" at time zone 'Asia/Kolkata';

alter table "AuditLog"
  alter column "createdAt" type timestamptz using "createdAt" at time zone 'Asia/Kolkata';

alter table "AutomationExecution"
  alter column "completedAt" type timestamptz using "completedAt" at time zone 'Asia/Kolkata',
  alter column "startedAt" type timestamptz using "startedAt" at time zone 'Asia/Kolkata';

alter table "AutomationOutbox"
  alter column "createdAt" type timestamptz using "createdAt" at time zone 'Asia/Kolkata',
  alter column "nextRetryAt" type timestamptz using "nextRetryAt" at time zone 'Asia/Kolkata',
  alter column "processedAt" type timestamptz using "processedAt" at time zone 'Asia/Kolkata',
  alter column "updatedAt" type timestamptz using "updatedAt" at time zone 'Asia/Kolkata';

alter table "AutomationV2"
  alter column "createdAt" type timestamptz using "createdAt" at time zone 'Asia/Kolkata',
  alter column "deletedAt" type timestamptz using "deletedAt" at time zone 'Asia/Kolkata',
  alter column "updatedAt" type timestamptz using "updatedAt" at time zone 'Asia/Kolkata';

alter table "Badge"
  alter column "createdAt" type timestamptz using "createdAt" at time zone 'Asia/Kolkata',
  alter column "updatedAt" type timestamptz using "updatedAt" at time zone 'Asia/Kolkata';

alter table "CommissionLedger"
  alter column "createdAt" type timestamptz using "createdAt" at time zone 'Asia/Kolkata';

alter table "CommissionRule"
  alter column "createdAt" type timestamptz using "createdAt" at time zone 'Asia/Kolkata',
  alter column "effectiveFrom" type timestamptz using "effectiveFrom" at time zone 'Asia/Kolkata',
  alter column "effectiveTo" type timestamptz using "effectiveTo" at time zone 'Asia/Kolkata',
  alter column "updatedAt" type timestamptz using "updatedAt" at time zone 'Asia/Kolkata';

alter table "CommunicationDeliveryEvent"
  alter column "createdAt" type timestamptz using "createdAt" at time zone 'Asia/Kolkata',
  alter column "occurredAt" type timestamptz using "occurredAt" at time zone 'Asia/Kolkata';

alter table "CommunicationOutbox"
  alter column "createdAt" type timestamptz using "createdAt" at time zone 'Asia/Kolkata',
  alter column "lastAttemptAt" type timestamptz using "lastAttemptAt" at time zone 'Asia/Kolkata',
  alter column "nextAttemptAt" type timestamptz using "nextAttemptAt" at time zone 'Asia/Kolkata',
  alter column "sentAt" type timestamptz using "sentAt" at time zone 'Asia/Kolkata',
  alter column "updatedAt" type timestamptz using "updatedAt" at time zone 'Asia/Kolkata';

alter table "CommunicationProviderConfig"
  alter column "createdAt" type timestamptz using "createdAt" at time zone 'Asia/Kolkata',
  alter column "updatedAt" type timestamptz using "updatedAt" at time zone 'Asia/Kolkata';

alter table "CommunicationTemplate"
  alter column "createdAt" type timestamptz using "createdAt" at time zone 'Asia/Kolkata',
  alter column "updatedAt" type timestamptz using "updatedAt" at time zone 'Asia/Kolkata';

alter table "CustomFieldValue"
  alter column "createdAt" type timestamptz using "createdAt" at time zone 'Asia/Kolkata',
  alter column "updatedAt" type timestamptz using "updatedAt" at time zone 'Asia/Kolkata',
  alter column "valueDate" type timestamptz using "valueDate" at time zone 'Asia/Kolkata';

alter table "CustomReport"
  alter column "createdAt" type timestamptz using "createdAt" at time zone 'Asia/Kolkata',
  alter column "lastRunAt" type timestamptz using "lastRunAt" at time zone 'Asia/Kolkata',
  alter column "updatedAt" type timestamptz using "updatedAt" at time zone 'Asia/Kolkata';

alter table "DailyMetric"
  alter column "createdAt" type timestamptz using "createdAt" at time zone 'Asia/Kolkata',
  alter column "updatedAt" type timestamptz using "updatedAt" at time zone 'Asia/Kolkata';

alter table "DashboardWidget"
  alter column "createdAt" type timestamptz using "createdAt" at time zone 'Asia/Kolkata',
  alter column "updatedAt" type timestamptz using "updatedAt" at time zone 'Asia/Kolkata';

alter table "DataRetentionPolicy"
  alter column "createdAt" type timestamptz using "createdAt" at time zone 'Asia/Kolkata',
  alter column "lastEnforcedAt" type timestamptz using "lastEnforcedAt" at time zone 'Asia/Kolkata',
  alter column "updatedAt" type timestamptz using "updatedAt" at time zone 'Asia/Kolkata';

alter table "DomainEventOutbox"
  alter column "createdAt" type timestamptz using "createdAt" at time zone 'Asia/Kolkata',
  alter column "nextRetryAt" type timestamptz using "nextRetryAt" at time zone 'Asia/Kolkata',
  alter column "processedAt" type timestamptz using "processedAt" at time zone 'Asia/Kolkata',
  alter column "updatedAt" type timestamptz using "updatedAt" at time zone 'Asia/Kolkata';

alter table "EmailLog"
  alter column "clickedAt" type timestamptz using "clickedAt" at time zone 'Asia/Kolkata',
  alter column "createdAt" type timestamptz using "createdAt" at time zone 'Asia/Kolkata',
  alter column "openedAt" type timestamptz using "openedAt" at time zone 'Asia/Kolkata';

alter table "ExportRequest"
  alter column "completedAt" type timestamptz using "completedAt" at time zone 'Asia/Kolkata',
  alter column "queuedAt" type timestamptz using "queuedAt" at time zone 'Asia/Kolkata',
  alter column "startedAt" type timestamptz using "startedAt" at time zone 'Asia/Kolkata',
  alter column "updatedAt" type timestamptz using "updatedAt" at time zone 'Asia/Kolkata';

alter table "FieldDefinition"
  alter column "createdAt" type timestamptz using "createdAt" at time zone 'Asia/Kolkata',
  alter column "deletedAt" type timestamptz using "deletedAt" at time zone 'Asia/Kolkata',
  alter column "updatedAt" type timestamptz using "updatedAt" at time zone 'Asia/Kolkata';

alter table "FieldDefinitionVersion"
  alter column "createdAt" type timestamptz using "createdAt" at time zone 'Asia/Kolkata';

alter table "FileObject"
  alter column "createdAt" type timestamptz using "createdAt" at time zone 'Asia/Kolkata',
  alter column "updatedAt" type timestamptz using "updatedAt" at time zone 'Asia/Kolkata';

alter table "Form"
  alter column "createdAt" type timestamptz using "createdAt" at time zone 'Asia/Kolkata',
  alter column "deletedAt" type timestamptz using "deletedAt" at time zone 'Asia/Kolkata',
  alter column "updatedAt" type timestamptz using "updatedAt" at time zone 'Asia/Kolkata';

alter table "FormSubmission"
  alter column "createdAt" type timestamptz using "createdAt" at time zone 'Asia/Kolkata';

alter table "GDPRRequest"
  alter column "completedAt" type timestamptz using "completedAt" at time zone 'Asia/Kolkata',
  alter column "requestedAt" type timestamptz using "requestedAt" at time zone 'Asia/Kolkata';

alter table "GamificationPointsLedger"
  alter column "createdAt" type timestamptz using "createdAt" at time zone 'Asia/Kolkata';

alter table "GamificationRedemption"
  alter column "createdAt" type timestamptz using "createdAt" at time zone 'Asia/Kolkata',
  alter column "reviewedAt" type timestamptz using "reviewedAt" at time zone 'Asia/Kolkata',
  alter column "updatedAt" type timestamptz using "updatedAt" at time zone 'Asia/Kolkata';

alter table "GamificationRule"
  alter column "createdAt" type timestamptz using "createdAt" at time zone 'Asia/Kolkata',
  alter column "updatedAt" type timestamptz using "updatedAt" at time zone 'Asia/Kolkata';

alter table "GamificationSettings"
  alter column "createdAt" type timestamptz using "createdAt" at time zone 'Asia/Kolkata',
  alter column "updatedAt" type timestamptz using "updatedAt" at time zone 'Asia/Kolkata';

alter table "ImportJob"
  alter column "createdAt" type timestamptz using "createdAt" at time zone 'Asia/Kolkata',
  alter column "updatedAt" type timestamptz using "updatedAt" at time zone 'Asia/Kolkata';

alter table "Lead"
  alter column "createdAt" type timestamptz using "createdAt" at time zone 'Asia/Kolkata',
  alter column "deletedAt" type timestamptz using "deletedAt" at time zone 'Asia/Kolkata',
  alter column "updatedAt" type timestamptz using "updatedAt" at time zone 'Asia/Kolkata';

alter table "LeadScoringRule"
  alter column "createdAt" type timestamptz using "createdAt" at time zone 'Asia/Kolkata',
  alter column "updatedAt" type timestamptz using "updatedAt" at time zone 'Asia/Kolkata';

alter table "Note"
  alter column "createdAt" type timestamptz using "createdAt" at time zone 'Asia/Kolkata',
  alter column "deletedAt" type timestamptz using "deletedAt" at time zone 'Asia/Kolkata',
  alter column "updatedAt" type timestamptz using "updatedAt" at time zone 'Asia/Kolkata';

alter table "ObjectDefinition"
  alter column "createdAt" type timestamptz using "createdAt" at time zone 'Asia/Kolkata',
  alter column "updatedAt" type timestamptz using "updatedAt" at time zone 'Asia/Kolkata';

alter table "Opportunity"
  alter column "createdAt" type timestamptz using "createdAt" at time zone 'Asia/Kolkata',
  alter column "deletedAt" type timestamptz using "deletedAt" at time zone 'Asia/Kolkata',
  alter column "expectedCloseDate" type timestamptz using "expectedCloseDate" at time zone 'Asia/Kolkata',
  alter column "updatedAt" type timestamptz using "updatedAt" at time zone 'Asia/Kolkata';

alter table "OpportunityStageHistory"
  alter column "changedAt" type timestamptz using "changedAt" at time zone 'Asia/Kolkata';

alter table "OpportunityType"
  alter column "createdAt" type timestamptz using "createdAt" at time zone 'Asia/Kolkata',
  alter column "updatedAt" type timestamptz using "updatedAt" at time zone 'Asia/Kolkata';

alter table "PartnerInvoice"
  alter column "createdAt" type timestamptz using "createdAt" at time zone 'Asia/Kolkata',
  alter column "generatedAt" type timestamptz using "generatedAt" at time zone 'Asia/Kolkata',
  alter column "invoiceDate" type timestamptz using "invoiceDate" at time zone 'Asia/Kolkata';

alter table "PartnerInvoiceTemplate"
  alter column "createdAt" type timestamptz using "createdAt" at time zone 'Asia/Kolkata',
  alter column "updatedAt" type timestamptz using "updatedAt" at time zone 'Asia/Kolkata';

alter table "PartnerOrganization"
  alter column "createdAt" type timestamptz using "createdAt" at time zone 'Asia/Kolkata',
  alter column "updatedAt" type timestamptz using "updatedAt" at time zone 'Asia/Kolkata';

alter table "PartnerPayoutSettings"
  alter column "createdAt" type timestamptz using "createdAt" at time zone 'Asia/Kolkata',
  alter column "updatedAt" type timestamptz using "updatedAt" at time zone 'Asia/Kolkata';

alter table "PartnerProfile"
  alter column "createdAt" type timestamptz using "createdAt" at time zone 'Asia/Kolkata',
  alter column "updatedAt" type timestamptz using "updatedAt" at time zone 'Asia/Kolkata';

alter table "Payout"
  alter column "approvedAt" type timestamptz using "approvedAt" at time zone 'Asia/Kolkata',
  alter column "createdAt" type timestamptz using "createdAt" at time zone 'Asia/Kolkata',
  alter column "heldAt" type timestamptz using "heldAt" at time zone 'Asia/Kolkata',
  alter column "paidAt" type timestamptz using "paidAt" at time zone 'Asia/Kolkata',
  alter column "releasedAt" type timestamptz using "releasedAt" at time zone 'Asia/Kolkata',
  alter column "updatedAt" type timestamptz using "updatedAt" at time zone 'Asia/Kolkata';

alter table "PayoutCycle"
  alter column "createdAt" type timestamptz using "createdAt" at time zone 'Asia/Kolkata',
  alter column "endDate" type timestamptz using "endDate" at time zone 'Asia/Kolkata',
  alter column "generatedAt" type timestamptz using "generatedAt" at time zone 'Asia/Kolkata',
  alter column "startDate" type timestamptz using "startDate" at time zone 'Asia/Kolkata';

alter table "PlanUpgradeHistory"
  alter column "createdAt" type timestamptz using "createdAt" at time zone 'Asia/Kolkata';

alter table "PlatformAdmin"
  alter column "createdAt" type timestamptz using "createdAt" at time zone 'Asia/Kolkata',
  alter column "updatedAt" type timestamptz using "updatedAt" at time zone 'Asia/Kolkata';

alter table "RecordScore"
  alter column "calculatedAt" type timestamptz using "calculatedAt" at time zone 'Asia/Kolkata',
  alter column "createdAt" type timestamptz using "createdAt" at time zone 'Asia/Kolkata',
  alter column "updatedAt" type timestamptz using "updatedAt" at time zone 'Asia/Kolkata';

alter table "RecordScoreHistory"
  alter column "createdAt" type timestamptz using "createdAt" at time zone 'Asia/Kolkata';

alter table "ReportDefinition"
  alter column "createdAt" type timestamptz using "createdAt" at time zone 'Asia/Kolkata',
  alter column "updatedAt" type timestamptz using "updatedAt" at time zone 'Asia/Kolkata';

alter table "ReportEmailDelivery"
  alter column "createdAt" type timestamptz using "createdAt" at time zone 'Asia/Kolkata',
  alter column "sentAt" type timestamptz using "sentAt" at time zone 'Asia/Kolkata';

alter table "ReportRefreshJob"
  alter column "completedAt" type timestamptz using "completedAt" at time zone 'Asia/Kolkata',
  alter column "createdAt" type timestamptz using "createdAt" at time zone 'Asia/Kolkata',
  alter column "periodEnd" type timestamptz using "periodEnd" at time zone 'Asia/Kolkata',
  alter column "periodStart" type timestamptz using "periodStart" at time zone 'Asia/Kolkata',
  alter column "startedAt" type timestamptz using "startedAt" at time zone 'Asia/Kolkata';

alter table "ReportRefreshState"
  alter column "createdAt" type timestamptz using "createdAt" at time zone 'Asia/Kolkata',
  alter column "lastCompletedAt" type timestamptz using "lastCompletedAt" at time zone 'Asia/Kolkata',
  alter column "lastSourceWatermark" type timestamptz using "lastSourceWatermark" at time zone 'Asia/Kolkata',
  alter column "lastStartedAt" type timestamptz using "lastStartedAt" at time zone 'Asia/Kolkata',
  alter column "lastSuccessfulAt" type timestamptz using "lastSuccessfulAt" at time zone 'Asia/Kolkata',
  alter column "manualRefreshRequestedAt" type timestamptz using "manualRefreshRequestedAt" at time zone 'Asia/Kolkata',
  alter column "updatedAt" type timestamptz using "updatedAt" at time zone 'Asia/Kolkata';

alter table "ReportRollup"
  alter column "createdAt" type timestamptz using "createdAt" at time zone 'Asia/Kolkata',
  alter column "lastComputedAt" type timestamptz using "lastComputedAt" at time zone 'Asia/Kolkata',
  alter column "periodEnd" type timestamptz using "periodEnd" at time zone 'Asia/Kolkata',
  alter column "periodStart" type timestamptz using "periodStart" at time zone 'Asia/Kolkata',
  alter column "sourceWatermark" type timestamptz using "sourceWatermark" at time zone 'Asia/Kolkata',
  alter column "updatedAt" type timestamptz using "updatedAt" at time zone 'Asia/Kolkata';

alter table "ReportSchedule"
  alter column "createdAt" type timestamptz using "createdAt" at time zone 'Asia/Kolkata',
  alter column "lastRunAt" type timestamptz using "lastRunAt" at time zone 'Asia/Kolkata',
  alter column "nextRunAt" type timestamptz using "nextRunAt" at time zone 'Asia/Kolkata',
  alter column "updatedAt" type timestamptz using "updatedAt" at time zone 'Asia/Kolkata';

alter table "ReportingOutbox"
  alter column "createdAt" type timestamptz using "createdAt" at time zone 'Asia/Kolkata',
  alter column "nextRetryAt" type timestamptz using "nextRetryAt" at time zone 'Asia/Kolkata',
  alter column "processedAt" type timestamptz using "processedAt" at time zone 'Asia/Kolkata',
  alter column "updatedAt" type timestamptz using "updatedAt" at time zone 'Asia/Kolkata';

alter table "Role"
  alter column "createdAt" type timestamptz using "createdAt" at time zone 'Asia/Kolkata',
  alter column "updatedAt" type timestamptz using "updatedAt" at time zone 'Asia/Kolkata';

alter table "SalesGroup"
  alter column "createdAt" type timestamptz using "createdAt" at time zone 'Asia/Kolkata',
  alter column "updatedAt" type timestamptz using "updatedAt" at time zone 'Asia/Kolkata';

alter table "SalesGroupMember"
  alter column "joinedAt" type timestamptz using "joinedAt" at time zone 'Asia/Kolkata';

alter table "SchemaMigration"
  alter column "appliedAt" type timestamptz using "appliedAt" at time zone 'Asia/Kolkata';

alter table "ScoringFeatureSnapshot"
  alter column "createdAt" type timestamptz using "createdAt" at time zone 'Asia/Kolkata',
  alter column "sourceDataUpdatedAt" type timestamptz using "sourceDataUpdatedAt" at time zone 'Asia/Kolkata';

alter table "ScoringModel"
  alter column "createdAt" type timestamptz using "createdAt" at time zone 'Asia/Kolkata',
  alter column "updatedAt" type timestamptz using "updatedAt" at time zone 'Asia/Kolkata';

alter table "ScoringModelVersion"
  alter column "createdAt" type timestamptz using "createdAt" at time zone 'Asia/Kolkata',
  alter column "promotedAt" type timestamptz using "promotedAt" at time zone 'Asia/Kolkata';

alter table "ScoringSettings"
  alter column "createdAt" type timestamptz using "createdAt" at time zone 'Asia/Kolkata',
  alter column "lastRecomputedAt" type timestamptz using "lastRecomputedAt" at time zone 'Asia/Kolkata',
  alter column "updatedAt" type timestamptz using "updatedAt" at time zone 'Asia/Kolkata';

alter table "ScoringTrainingRun"
  alter column "completedAt" type timestamptz using "completedAt" at time zone 'Asia/Kolkata',
  alter column "createdAt" type timestamptz using "createdAt" at time zone 'Asia/Kolkata',
  alter column "startedAt" type timestamptz using "startedAt" at time zone 'Asia/Kolkata';

alter table "SearchOutbox"
  alter column "createdAt" type timestamptz using "createdAt" at time zone 'Asia/Kolkata',
  alter column "nextRetryAt" type timestamptz using "nextRetryAt" at time zone 'Asia/Kolkata',
  alter column "processedAt" type timestamptz using "processedAt" at time zone 'Asia/Kolkata',
  alter column "updatedAt" type timestamptz using "updatedAt" at time zone 'Asia/Kolkata';

alter table "SecurityPolicy"
  alter column "createdAt" type timestamptz using "createdAt" at time zone 'Asia/Kolkata',
  alter column "updatedAt" type timestamptz using "updatedAt" at time zone 'Asia/Kolkata';

alter table "SenderIdentity"
  alter column "createdAt" type timestamptz using "createdAt" at time zone 'Asia/Kolkata',
  alter column "updatedAt" type timestamptz using "updatedAt" at time zone 'Asia/Kolkata';

alter table "StageDefinition"
  alter column "createdAt" type timestamptz using "createdAt" at time zone 'Asia/Kolkata',
  alter column "updatedAt" type timestamptz using "updatedAt" at time zone 'Asia/Kolkata';

alter table "Task"
  alter column "completedAt" type timestamptz using "completedAt" at time zone 'Asia/Kolkata',
  alter column "createdAt" type timestamptz using "createdAt" at time zone 'Asia/Kolkata',
  alter column "dueAt" type timestamptz using "dueAt" at time zone 'Asia/Kolkata',
  alter column "reminderAt" type timestamptz using "reminderAt" at time zone 'Asia/Kolkata',
  alter column "updatedAt" type timestamptz using "updatedAt" at time zone 'Asia/Kolkata';

alter table "Tenant"
  alter column "createdAt" type timestamptz using "createdAt" at time zone 'Asia/Kolkata',
  alter column "updatedAt" type timestamptz using "updatedAt" at time zone 'Asia/Kolkata';

alter table "TenantConfig"
  alter column "suspendedAt" type timestamptz using "suspendedAt" at time zone 'Asia/Kolkata';

alter table "TenantFeature"
  alter column "createdAt" type timestamptz using "createdAt" at time zone 'Asia/Kolkata',
  alter column "updatedAt" type timestamptz using "updatedAt" at time zone 'Asia/Kolkata';

alter table "User"
  alter column "createdAt" type timestamptz using "createdAt" at time zone 'Asia/Kolkata',
  alter column "deletedAt" type timestamptz using "deletedAt" at time zone 'Asia/Kolkata',
  alter column "lastAssignedAt" type timestamptz using "lastAssignedAt" at time zone 'Asia/Kolkata',
  alter column "updatedAt" type timestamptz using "updatedAt" at time zone 'Asia/Kolkata';

alter table "UserBadge"
  alter column "earnedAt" type timestamptz using "earnedAt" at time zone 'Asia/Kolkata',
  alter column "sourcePeriodEnd" type timestamptz using "sourcePeriodEnd" at time zone 'Asia/Kolkata',
  alter column "sourcePeriodStart" type timestamptz using "sourcePeriodStart" at time zone 'Asia/Kolkata';

alter table "WebhookOutbox"
  alter column "createdAt" type timestamptz using "createdAt" at time zone 'Asia/Kolkata',
  alter column "nextRetryAt" type timestamptz using "nextRetryAt" at time zone 'Asia/Kolkata',
  alter column "processedAt" type timestamptz using "processedAt" at time zone 'Asia/Kolkata',
  alter column "updatedAt" type timestamptz using "updatedAt" at time zone 'Asia/Kolkata';

alter table "WebhookSubscription"
  alter column "createdAt" type timestamptz using "createdAt" at time zone 'Asia/Kolkata',
  alter column "updatedAt" type timestamptz using "updatedAt" at time zone 'Asia/Kolkata';

-- 214 columns across 81 tables converted.
