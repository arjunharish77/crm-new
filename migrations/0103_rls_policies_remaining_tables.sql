-- WP07 (F04) step 1 of N: RLS policy parity for the 135 tenant-scoped tables that
-- previously had none (confirmed by cross-referencing every table with a "tenantId" column
-- against every table with an existing "create policy" statement -- see 25_AUDIT_REMEDIATION_PLAN.md
-- WP07 for the full inventory). This includes the highest-traffic core tables: Lead, Opportunity,
-- User, Activity.
--
-- Same caveat as every existing tenant_isolation policy in this schema (see e.g.
-- 0001_partner_profile.sql): the app's runtime role ("crm_app") currently has BOTH bypassrls AND
-- ownership of these tables, so table-owner bypass applies regardless of the bypassrls attribute.
-- These policies are therefore defense-in-depth/documentation only until a separate, non-owner,
-- non-bypassrls runtime role is introduced and adopted -- tracked as the remaining, harder part of
-- WP07 (new role + transaction-local "app.tenant_id" wiring through the query layer + staged
-- rollout, no production credential change in this commit).
--
-- Policy shape matches the existing convention exactly: strict tenant equality on both read and
-- write, except where the application itself already reads a tenantId IS NULL row as a
-- cross-tenant default fallback (confirmed via grep of the real query call sites -- only
-- "SecurityPolicy" does this today, same pattern already used for "ReportDefinition" in
-- 0008_reporting_rollups.sql). Every other nullable-tenantId table in this list (Role,
-- PermissionTemplate, IntegrationSetting, DataRetentionPolicy, User, UserSession, TrustedDevice,
-- MfaBackupCode, PasswordResetToken, PasswordHistory, PrivilegedActionRequest, TelephonyCallLog,
-- Team, TeamMember, Notification, LeadList, LeadListMember) is only ever queried by exact tenantId
-- match in application code, so strict equality is both correct and safe: a NULL tenantId row
-- never satisfies "= current_setting(...)" and is therefore never exposed cross-tenant.

-- Idempotency (release rehearsal, 2026-09-28): db-bootstrap/base-schema.sql already defines 49
-- of these policy names (USING-only, no WITH CHECK). Every "create policy" below is therefore
-- preceded by "drop policy if exists" so both a fresh bootstrap install and an existing
-- production database converge on the single definition in this file instead of failing with
-- "policy ... already exists".

alter table "Activity" enable row level security;
drop policy if exists "tenant_isolation_activity" on "Activity";
create policy "tenant_isolation_activity" on "Activity"
  for all using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));

alter table "ActivityReminder" enable row level security;
drop policy if exists "tenant_isolation_activity_reminder" on "ActivityReminder";
create policy "tenant_isolation_activity_reminder" on "ActivityReminder"
  for all using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));

alter table "ActivityType" enable row level security;
drop policy if exists "tenant_isolation_activity_type" on "ActivityType";
create policy "tenant_isolation_activity_type" on "ActivityType"
  for all using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));

alter table "AgentAvailability" enable row level security;
drop policy if exists "tenant_isolation_agent_availability" on "AgentAvailability";
create policy "tenant_isolation_agent_availability" on "AgentAvailability"
  for all using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));

alter table "AiPromptTemplate" enable row level security;
drop policy if exists "tenant_isolation_ai_prompt_template" on "AiPromptTemplate";
create policy "tenant_isolation_ai_prompt_template" on "AiPromptTemplate"
  for all using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));

alter table "AiProviderSettings" enable row level security;
drop policy if exists "tenant_isolation_ai_provider_settings" on "AiProviderSettings";
create policy "tenant_isolation_ai_provider_settings" on "AiProviderSettings"
  for all using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));

alter table "AiUsageLog" enable row level security;
drop policy if exists "tenant_isolation_ai_usage_log" on "AiUsageLog";
create policy "tenant_isolation_ai_usage_log" on "AiUsageLog"
  for all using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));

alter table "ApiKey" enable row level security;
drop policy if exists "tenant_isolation_api_key" on "ApiKey";
create policy "tenant_isolation_api_key" on "ApiKey"
  for all using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));

alter table "AssignmentLog" enable row level security;
drop policy if exists "tenant_isolation_assignment_log" on "AssignmentLog";
create policy "tenant_isolation_assignment_log" on "AssignmentLog"
  for all using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));

alter table "AssignmentRule" enable row level security;
drop policy if exists "tenant_isolation_assignment_rule" on "AssignmentRule";
create policy "tenant_isolation_assignment_rule" on "AssignmentRule"
  for all using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));

alter table "AuditLog" enable row level security;
drop policy if exists "tenant_isolation_audit_log" on "AuditLog";
create policy "tenant_isolation_audit_log" on "AuditLog"
  for all using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));

alter table "AuditLogComment" enable row level security;
drop policy if exists "tenant_isolation_audit_log_comment" on "AuditLogComment";
create policy "tenant_isolation_audit_log_comment" on "AuditLogComment"
  for all using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));

alter table "AutomationEnrollmentJob" enable row level security;
drop policy if exists "tenant_isolation_automation_enrollment_job" on "AutomationEnrollmentJob";
create policy "tenant_isolation_automation_enrollment_job" on "AutomationEnrollmentJob"
  for all using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));

alter table "AutomationExecution" enable row level security;
drop policy if exists "tenant_isolation_automation_execution" on "AutomationExecution";
create policy "tenant_isolation_automation_execution" on "AutomationExecution"
  for all using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));

alter table "AutomationOutbox" enable row level security;
drop policy if exists "tenant_isolation_automation_outbox" on "AutomationOutbox";
create policy "tenant_isolation_automation_outbox" on "AutomationOutbox"
  for all using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));

alter table "AutomationQueue" enable row level security;
drop policy if exists "tenant_isolation_automation_queue" on "AutomationQueue";
create policy "tenant_isolation_automation_queue" on "AutomationQueue"
  for all using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));

alter table "AutomationV2" enable row level security;
drop policy if exists "tenant_isolation_automation_v2" on "AutomationV2";
create policy "tenant_isolation_automation_v2" on "AutomationV2"
  for all using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));

alter table "CalculatedFieldDefinition" enable row level security;
drop policy if exists "tenant_isolation_calculated_field_definition" on "CalculatedFieldDefinition";
create policy "tenant_isolation_calculated_field_definition" on "CalculatedFieldDefinition"
  for all using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));

alter table "CalculatedMetric" enable row level security;
drop policy if exists "tenant_isolation_calculated_metric" on "CalculatedMetric";
create policy "tenant_isolation_calculated_metric" on "CalculatedMetric"
  for all using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));

alter table "CallCampaign" enable row level security;
drop policy if exists "tenant_isolation_call_campaign" on "CallCampaign";
create policy "tenant_isolation_call_campaign" on "CallCampaign"
  for all using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));

alter table "CallCampaignMember" enable row level security;
drop policy if exists "tenant_isolation_call_campaign_member" on "CallCampaignMember";
create policy "tenant_isolation_call_campaign_member" on "CallCampaignMember"
  for all using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));

alter table "CallDisposition" enable row level security;
drop policy if exists "tenant_isolation_call_disposition" on "CallDisposition";
create policy "tenant_isolation_call_disposition" on "CallDisposition"
  for all using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));

alter table "CallScript" enable row level security;
drop policy if exists "tenant_isolation_call_script" on "CallScript";
create policy "tenant_isolation_call_script" on "CallScript"
  for all using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));

alter table "CallScriptVersion" enable row level security;
drop policy if exists "tenant_isolation_call_script_version" on "CallScriptVersion";
create policy "tenant_isolation_call_script_version" on "CallScriptVersion"
  for all using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));

alter table "CaseAnalyticsSnapshot" enable row level security;
drop policy if exists "tenant_isolation_case_analytics_snapshot" on "CaseAnalyticsSnapshot";
create policy "tenant_isolation_case_analytics_snapshot" on "CaseAnalyticsSnapshot"
  for all using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));

alter table "CaseAttachment" enable row level security;
drop policy if exists "tenant_isolation_case_attachment" on "CaseAttachment";
create policy "tenant_isolation_case_attachment" on "CaseAttachment"
  for all using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));

alter table "CaseInboundAddress" enable row level security;
drop policy if exists "tenant_isolation_case_inbound_address" on "CaseInboundAddress";
create policy "tenant_isolation_case_inbound_address" on "CaseInboundAddress"
  for all using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));

alter table "CaseInboundMessage" enable row level security;
drop policy if exists "tenant_isolation_case_inbound_message" on "CaseInboundMessage";
create policy "tenant_isolation_case_inbound_message" on "CaseInboundMessage"
  for all using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));

alter table "CaseMacro" enable row level security;
drop policy if exists "tenant_isolation_case_macro" on "CaseMacro";
create policy "tenant_isolation_case_macro" on "CaseMacro"
  for all using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));

alter table "CaseSurveyResponse" enable row level security;
drop policy if exists "tenant_isolation_case_survey_response" on "CaseSurveyResponse";
create policy "tenant_isolation_case_survey_response" on "CaseSurveyResponse"
  for all using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));

alter table "CommunicationConsentHistory" enable row level security;
drop policy if exists "tenant_isolation_communication_consent_history" on "CommunicationConsentHistory";
create policy "tenant_isolation_communication_consent_history" on "CommunicationConsentHistory"
  for all using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));

alter table "CustomFieldValue" enable row level security;
drop policy if exists "tenant_isolation_custom_field_value" on "CustomFieldValue";
create policy "tenant_isolation_custom_field_value" on "CustomFieldValue"
  for all using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));

alter table "CustomReport" enable row level security;
drop policy if exists "tenant_isolation_custom_report" on "CustomReport";
create policy "tenant_isolation_custom_report" on "CustomReport"
  for all using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));

alter table "CustomReportVersion" enable row level security;
drop policy if exists "tenant_isolation_custom_report_version" on "CustomReportVersion";
create policy "tenant_isolation_custom_report_version" on "CustomReportVersion"
  for all using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));

alter table "DailyMetric" enable row level security;
drop policy if exists "tenant_isolation_daily_metric" on "DailyMetric";
create policy "tenant_isolation_daily_metric" on "DailyMetric"
  for all using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));

alter table "DashboardLayoutSnapshot" enable row level security;
drop policy if exists "tenant_isolation_dashboard_layout_snapshot" on "DashboardLayoutSnapshot";
create policy "tenant_isolation_dashboard_layout_snapshot" on "DashboardLayoutSnapshot"
  for all using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));

alter table "DashboardTab" enable row level security;
drop policy if exists "tenant_isolation_dashboard_tab" on "DashboardTab";
create policy "tenant_isolation_dashboard_tab" on "DashboardTab"
  for all using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));

alter table "DashboardTabVersion" enable row level security;
drop policy if exists "tenant_isolation_dashboard_tab_version" on "DashboardTabVersion";
create policy "tenant_isolation_dashboard_tab_version" on "DashboardTabVersion"
  for all using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));

alter table "DashboardWidget" enable row level security;
drop policy if exists "tenant_isolation_dashboard_widget" on "DashboardWidget";
create policy "tenant_isolation_dashboard_widget" on "DashboardWidget"
  for all using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));

alter table "DataQualityScorecard" enable row level security;
drop policy if exists "tenant_isolation_data_quality_scorecard" on "DataQualityScorecard";
create policy "tenant_isolation_data_quality_scorecard" on "DataQualityScorecard"
  for all using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));

alter table "DataRetentionPolicy" enable row level security;
drop policy if exists "tenant_isolation_data_retention_policy" on "DataRetentionPolicy";
create policy "tenant_isolation_data_retention_policy" on "DataRetentionPolicy"
  for all using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));

alter table "DedupeMatch" enable row level security;
drop policy if exists "tenant_isolation_dedupe_match" on "DedupeMatch";
create policy "tenant_isolation_dedupe_match" on "DedupeMatch"
  for all using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));

alter table "DedupeMatchRule" enable row level security;
drop policy if exists "tenant_isolation_dedupe_match_rule" on "DedupeMatchRule";
create policy "tenant_isolation_dedupe_match_rule" on "DedupeMatchRule"
  for all using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));

alter table "DispositionGroup" enable row level security;
drop policy if exists "tenant_isolation_disposition_group" on "DispositionGroup";
create policy "tenant_isolation_disposition_group" on "DispositionGroup"
  for all using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));

alter table "DispositionOutcome" enable row level security;
drop policy if exists "tenant_isolation_disposition_outcome" on "DispositionOutcome";
create policy "tenant_isolation_disposition_outcome" on "DispositionOutcome"
  for all using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));

alter table "DistributionAvailability" enable row level security;
drop policy if exists "tenant_isolation_distribution_availability" on "DistributionAvailability";
create policy "tenant_isolation_distribution_availability" on "DistributionAvailability"
  for all using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));

alter table "DistributionCondition" enable row level security;
drop policy if exists "tenant_isolation_distribution_condition" on "DistributionCondition";
create policy "tenant_isolation_distribution_condition" on "DistributionCondition"
  for all using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));

alter table "DistributionQuota" enable row level security;
drop policy if exists "tenant_isolation_distribution_quota" on "DistributionQuota";
create policy "tenant_isolation_distribution_quota" on "DistributionQuota"
  for all using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));

alter table "DistributionRuleSet" enable row level security;
drop policy if exists "tenant_isolation_distribution_rule_set" on "DistributionRuleSet";
create policy "tenant_isolation_distribution_rule_set" on "DistributionRuleSet"
  for all using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));

alter table "DistributionSimulation" enable row level security;
drop policy if exists "tenant_isolation_distribution_simulation" on "DistributionSimulation";
create policy "tenant_isolation_distribution_simulation" on "DistributionSimulation"
  for all using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));

alter table "DistributionTarget" enable row level security;
drop policy if exists "tenant_isolation_distribution_target" on "DistributionTarget";
create policy "tenant_isolation_distribution_target" on "DistributionTarget"
  for all using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));

alter table "DomainEventOutbox" enable row level security;
drop policy if exists "tenant_isolation_domain_event_outbox" on "DomainEventOutbox";
create policy "tenant_isolation_domain_event_outbox" on "DomainEventOutbox"
  for all using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));

alter table "EmailLog" enable row level security;
drop policy if exists "tenant_isolation_email_log" on "EmailLog";
create policy "tenant_isolation_email_log" on "EmailLog"
  for all using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));

alter table "ExportSensitiveFieldRule" enable row level security;
drop policy if exists "tenant_isolation_export_sensitive_field_rule" on "ExportSensitiveFieldRule";
create policy "tenant_isolation_export_sensitive_field_rule" on "ExportSensitiveFieldRule"
  for all using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));

alter table "ExportTemplate" enable row level security;
drop policy if exists "tenant_isolation_export_template" on "ExportTemplate";
create policy "tenant_isolation_export_template" on "ExportTemplate"
  for all using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));

alter table "ExternalIntegration" enable row level security;
drop policy if exists "tenant_isolation_external_integration" on "ExternalIntegration";
create policy "tenant_isolation_external_integration" on "ExternalIntegration"
  for all using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));

alter table "ExternalPushAttempt" enable row level security;
drop policy if exists "tenant_isolation_external_push_attempt" on "ExternalPushAttempt";
create policy "tenant_isolation_external_push_attempt" on "ExternalPushAttempt"
  for all using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));

alter table "FieldDefinition" enable row level security;
drop policy if exists "tenant_isolation_field_definition" on "FieldDefinition";
create policy "tenant_isolation_field_definition" on "FieldDefinition"
  for all using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));

alter table "FieldDefinitionVersion" enable row level security;
drop policy if exists "tenant_isolation_field_definition_version" on "FieldDefinitionVersion";
create policy "tenant_isolation_field_definition_version" on "FieldDefinitionVersion"
  for all using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));

alter table "FieldDependencyRule" enable row level security;
drop policy if exists "tenant_isolation_field_dependency_rule" on "FieldDependencyRule";
create policy "tenant_isolation_field_dependency_rule" on "FieldDependencyRule"
  for all using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));

alter table "FieldGroup" enable row level security;
drop policy if exists "tenant_isolation_field_group" on "FieldGroup";
create policy "tenant_isolation_field_group" on "FieldGroup"
  for all using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));

alter table "FieldValidationRule" enable row level security;
drop policy if exists "tenant_isolation_field_validation_rule" on "FieldValidationRule";
create policy "tenant_isolation_field_validation_rule" on "FieldValidationRule"
  for all using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));

alter table "Form" enable row level security;
drop policy if exists "tenant_isolation_form" on "Form";
create policy "tenant_isolation_form" on "Form"
  for all using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));

alter table "FormSubmission" enable row level security;
drop policy if exists "tenant_isolation_form_submission" on "FormSubmission";
create policy "tenant_isolation_form_submission" on "FormSubmission"
  for all using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));

alter table "GDPRRequest" enable row level security;
drop policy if exists "tenant_isolation_gdpr_request" on "GDPRRequest";
create policy "tenant_isolation_gdpr_request" on "GDPRRequest"
  for all using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));

alter table "ImportJob" enable row level security;
drop policy if exists "tenant_isolation_import_job" on "ImportJob";
create policy "tenant_isolation_import_job" on "ImportJob"
  for all using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));

alter table "ImportTemplate" enable row level security;
drop policy if exists "tenant_isolation_import_template" on "ImportTemplate";
create policy "tenant_isolation_import_template" on "ImportTemplate"
  for all using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));

alter table "InboundWebhookEvent" enable row level security;
drop policy if exists "tenant_isolation_inbound_webhook_event" on "InboundWebhookEvent";
create policy "tenant_isolation_inbound_webhook_event" on "InboundWebhookEvent"
  for all using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));

alter table "IntegrationSetting" enable row level security;
drop policy if exists "tenant_isolation_integration_setting" on "IntegrationSetting";
create policy "tenant_isolation_integration_setting" on "IntegrationSetting"
  for all using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));

alter table "KnowledgeBaseArticle" enable row level security;
drop policy if exists "tenant_isolation_knowledge_base_article" on "KnowledgeBaseArticle";
create policy "tenant_isolation_knowledge_base_article" on "KnowledgeBaseArticle"
  for all using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));

alter table "KnowledgeBaseArticleFeedback" enable row level security;
drop policy if exists "tenant_isolation_knowledge_base_article_feedback" on "KnowledgeBaseArticleFeedback";
create policy "tenant_isolation_knowledge_base_article_feedback" on "KnowledgeBaseArticleFeedback"
  for all using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));

alter table "KnowledgeBaseCategory" enable row level security;
drop policy if exists "tenant_isolation_knowledge_base_category" on "KnowledgeBaseCategory";
create policy "tenant_isolation_knowledge_base_category" on "KnowledgeBaseCategory"
  for all using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));

alter table "LayoutDefinition" enable row level security;
drop policy if exists "tenant_isolation_layout_definition" on "LayoutDefinition";
create policy "tenant_isolation_layout_definition" on "LayoutDefinition"
  for all using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));

alter table "Lead" enable row level security;
drop policy if exists "tenant_isolation_lead" on "Lead";
create policy "tenant_isolation_lead" on "Lead"
  for all using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));

alter table "LeadList" enable row level security;
drop policy if exists "tenant_isolation_lead_list" on "LeadList";
create policy "tenant_isolation_lead_list" on "LeadList"
  for all using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));

alter table "LeadListMember" enable row level security;
drop policy if exists "tenant_isolation_lead_list_member" on "LeadListMember";
create policy "tenant_isolation_lead_list_member" on "LeadListMember"
  for all using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));

alter table "LeadScoringRule" enable row level security;
drop policy if exists "tenant_isolation_lead_scoring_rule" on "LeadScoringRule";
create policy "tenant_isolation_lead_scoring_rule" on "LeadScoringRule"
  for all using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));

alter table "MarketingCostEntry" enable row level security;
drop policy if exists "tenant_isolation_marketing_cost_entry" on "MarketingCostEntry";
create policy "tenant_isolation_marketing_cost_entry" on "MarketingCostEntry"
  for all using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));

alter table "MarketingFatigueSettings" enable row level security;
drop policy if exists "tenant_isolation_marketing_fatigue_settings" on "MarketingFatigueSettings";
create policy "tenant_isolation_marketing_fatigue_settings" on "MarketingFatigueSettings"
  for all using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));

alter table "MarketingSnippet" enable row level security;
drop policy if exists "tenant_isolation_marketing_snippet" on "MarketingSnippet";
create policy "tenant_isolation_marketing_snippet" on "MarketingSnippet"
  for all using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));

alter table "MarketplaceApp" enable row level security;
drop policy if exists "tenant_isolation_marketplace_app" on "MarketplaceApp";
create policy "tenant_isolation_marketplace_app" on "MarketplaceApp"
  for all using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));

alter table "MarketplaceAppAction" enable row level security;
drop policy if exists "tenant_isolation_marketplace_app_action" on "MarketplaceAppAction";
create policy "tenant_isolation_marketplace_app_action" on "MarketplaceAppAction"
  for all using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));

alter table "MarketplaceAppActionRun" enable row level security;
drop policy if exists "tenant_isolation_marketplace_app_action_run" on "MarketplaceAppActionRun";
create policy "tenant_isolation_marketplace_app_action_run" on "MarketplaceAppActionRun"
  for all using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));

alter table "MarketplaceAppReport" enable row level security;
drop policy if exists "tenant_isolation_marketplace_app_report" on "MarketplaceAppReport";
create policy "tenant_isolation_marketplace_app_report" on "MarketplaceAppReport"
  for all using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));

alter table "MarketplaceAppReportCache" enable row level security;
drop policy if exists "tenant_isolation_marketplace_app_report_cache" on "MarketplaceAppReportCache";
create policy "tenant_isolation_marketplace_app_report_cache" on "MarketplaceAppReportCache"
  for all using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));

alter table "MarketplaceAppTenantBlock" enable row level security;
drop policy if exists "tenant_isolation_marketplace_app_tenant_block" on "MarketplaceAppTenantBlock";
create policy "tenant_isolation_marketplace_app_tenant_block" on "MarketplaceAppTenantBlock"
  for all using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));

alter table "MarketplaceAppVersion" enable row level security;
drop policy if exists "tenant_isolation_marketplace_app_version" on "MarketplaceAppVersion";
create policy "tenant_isolation_marketplace_app_version" on "MarketplaceAppVersion"
  for all using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));

alter table "MergeAudit" enable row level security;
drop policy if exists "tenant_isolation_merge_audit" on "MergeAudit";
create policy "tenant_isolation_merge_audit" on "MergeAudit"
  for all using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));

alter table "Metric" enable row level security;
drop policy if exists "tenant_isolation_metric" on "Metric";
create policy "tenant_isolation_metric" on "Metric"
  for all using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));

alter table "MfaBackupCode" enable row level security;
drop policy if exists "tenant_isolation_mfa_backup_code" on "MfaBackupCode";
create policy "tenant_isolation_mfa_backup_code" on "MfaBackupCode"
  for all using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));

alter table "Note" enable row level security;
drop policy if exists "tenant_isolation_note" on "Note";
create policy "tenant_isolation_note" on "Note"
  for all using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));

alter table "Notification" enable row level security;
drop policy if exists "tenant_isolation_notification" on "Notification";
create policy "tenant_isolation_notification" on "Notification"
  for all using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));

alter table "ObjectDefinition" enable row level security;
drop policy if exists "tenant_isolation_object_definition" on "ObjectDefinition";
create policy "tenant_isolation_object_definition" on "ObjectDefinition"
  for all using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));

alter table "ObjectPermission" enable row level security;
drop policy if exists "tenant_isolation_object_permission" on "ObjectPermission";
create policy "tenant_isolation_object_permission" on "ObjectPermission"
  for all using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));

alter table "ObjectRelationship" enable row level security;
drop policy if exists "tenant_isolation_object_relationship" on "ObjectRelationship";
create policy "tenant_isolation_object_relationship" on "ObjectRelationship"
  for all using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));

alter table "Opportunity" enable row level security;
drop policy if exists "tenant_isolation_opportunity" on "Opportunity";
create policy "tenant_isolation_opportunity" on "Opportunity"
  for all using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));

alter table "OpportunityStageHistory" enable row level security;
drop policy if exists "tenant_isolation_opportunity_stage_history" on "OpportunityStageHistory";
create policy "tenant_isolation_opportunity_stage_history" on "OpportunityStageHistory"
  for all using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));

alter table "OpportunityType" enable row level security;
drop policy if exists "tenant_isolation_opportunity_type" on "OpportunityType";
create policy "tenant_isolation_opportunity_type" on "OpportunityType"
  for all using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));

alter table "PartnerChangeRequest" enable row level security;
drop policy if exists "tenant_isolation_partner_change_request" on "PartnerChangeRequest";
create policy "tenant_isolation_partner_change_request" on "PartnerChangeRequest"
  for all using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));

alter table "PasswordHistory" enable row level security;
drop policy if exists "tenant_isolation_password_history" on "PasswordHistory";
create policy "tenant_isolation_password_history" on "PasswordHistory"
  for all using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));

alter table "PasswordResetToken" enable row level security;
drop policy if exists "tenant_isolation_password_reset_token" on "PasswordResetToken";
create policy "tenant_isolation_password_reset_token" on "PasswordResetToken"
  for all using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));

alter table "PermissionTemplate" enable row level security;
drop policy if exists "tenant_isolation_permission_template" on "PermissionTemplate";
create policy "tenant_isolation_permission_template" on "PermissionTemplate"
  for all using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));

alter table "PlanUpgradeHistory" enable row level security;
drop policy if exists "tenant_isolation_plan_upgrade_history" on "PlanUpgradeHistory";
create policy "tenant_isolation_plan_upgrade_history" on "PlanUpgradeHistory"
  for all using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));

alter table "PrivacyRequest" enable row level security;
drop policy if exists "tenant_isolation_privacy_request" on "PrivacyRequest";
create policy "tenant_isolation_privacy_request" on "PrivacyRequest"
  for all using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));

alter table "PrivilegedActionRequest" enable row level security;
drop policy if exists "tenant_isolation_privileged_action_request" on "PrivilegedActionRequest";
create policy "tenant_isolation_privileged_action_request" on "PrivilegedActionRequest"
  for all using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));

alter table "RecordVisibilityRule" enable row level security;
drop policy if exists "tenant_isolation_record_visibility_rule" on "RecordVisibilityRule";
create policy "tenant_isolation_record_visibility_rule" on "RecordVisibilityRule"
  for all using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));

alter table "ReportAnnotation" enable row level security;
drop policy if exists "tenant_isolation_report_annotation" on "ReportAnnotation";
create policy "tenant_isolation_report_annotation" on "ReportAnnotation"
  for all using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));

alter table "ReportingOutbox" enable row level security;
drop policy if exists "tenant_isolation_reporting_outbox" on "ReportingOutbox";
create policy "tenant_isolation_reporting_outbox" on "ReportingOutbox"
  for all using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));

alter table "Role" enable row level security;
drop policy if exists "tenant_isolation_role" on "Role";
create policy "tenant_isolation_role" on "Role"
  for all using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));

alter table "SalesGroup" enable row level security;
drop policy if exists "tenant_isolation_sales_group" on "SalesGroup";
create policy "tenant_isolation_sales_group" on "SalesGroup"
  for all using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));

alter table "SalesGroupMember" enable row level security;
drop policy if exists "tenant_isolation_sales_group_member" on "SalesGroupMember";
create policy "tenant_isolation_sales_group_member" on "SalesGroupMember"
  for all using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));

alter table "ScimSyncLog" enable row level security;
drop policy if exists "tenant_isolation_scim_sync_log" on "ScimSyncLog";
create policy "tenant_isolation_scim_sync_log" on "ScimSyncLog"
  for all using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));

alter table "SearchOutbox" enable row level security;
drop policy if exists "tenant_isolation_search_outbox" on "SearchOutbox";
create policy "tenant_isolation_search_outbox" on "SearchOutbox"
  for all using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));

alter table "SecurityPolicy" enable row level security;
drop policy if exists "tenant_isolation_security_policy" on "SecurityPolicy";
create policy "tenant_isolation_security_policy" on "SecurityPolicy"
  for all using (("tenantId" = current_setting('app.tenant_id', true)) or ("tenantId" is null))
  with check (("tenantId" = current_setting('app.tenant_id', true)) or ("tenantId" is null));

alter table "StageDefinition" enable row level security;
drop policy if exists "tenant_isolation_stage_definition" on "StageDefinition";
create policy "tenant_isolation_stage_definition" on "StageDefinition"
  for all using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));

alter table "Team" enable row level security;
drop policy if exists "tenant_isolation_team" on "Team";
create policy "tenant_isolation_team" on "Team"
  for all using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));

alter table "TeamMember" enable row level security;
drop policy if exists "tenant_isolation_team_member" on "TeamMember";
create policy "tenant_isolation_team_member" on "TeamMember"
  for all using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));

alter table "TelephonyCallLog" enable row level security;
drop policy if exists "tenant_isolation_telephony_call_log" on "TelephonyCallLog";
create policy "tenant_isolation_telephony_call_log" on "TelephonyCallLog"
  for all using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));

alter table "TenantAppDelivery" enable row level security;
drop policy if exists "tenant_isolation_tenant_app_delivery" on "TenantAppDelivery";
create policy "tenant_isolation_tenant_app_delivery" on "TenantAppDelivery"
  for all using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));

alter table "TenantAppEventSubscription" enable row level security;
drop policy if exists "tenant_isolation_tenant_app_event_subscription" on "TenantAppEventSubscription";
create policy "tenant_isolation_tenant_app_event_subscription" on "TenantAppEventSubscription"
  for all using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));

alter table "TenantAppFieldMapping" enable row level security;
drop policy if exists "tenant_isolation_tenant_app_field_mapping" on "TenantAppFieldMapping";
create policy "tenant_isolation_tenant_app_field_mapping" on "TenantAppFieldMapping"
  for all using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));

alter table "TenantAppHealth" enable row level security;
drop policy if exists "tenant_isolation_tenant_app_health" on "TenantAppHealth";
create policy "tenant_isolation_tenant_app_health" on "TenantAppHealth"
  for all using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));

alter table "TenantAppInstall" enable row level security;
drop policy if exists "tenant_isolation_tenant_app_install" on "TenantAppInstall";
create policy "tenant_isolation_tenant_app_install" on "TenantAppInstall"
  for all using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));

alter table "TenantAppPermissionGrant" enable row level security;
drop policy if exists "tenant_isolation_tenant_app_permission_grant" on "TenantAppPermissionGrant";
create policy "tenant_isolation_tenant_app_permission_grant" on "TenantAppPermissionGrant"
  for all using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));

alter table "TenantAppSecret" enable row level security;
drop policy if exists "tenant_isolation_tenant_app_secret" on "TenantAppSecret";
create policy "tenant_isolation_tenant_app_secret" on "TenantAppSecret"
  for all using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));

alter table "TenantAppSyncConfig" enable row level security;
drop policy if exists "tenant_isolation_tenant_app_sync_config" on "TenantAppSyncConfig";
create policy "tenant_isolation_tenant_app_sync_config" on "TenantAppSyncConfig"
  for all using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));

alter table "TenantAppSyncRun" enable row level security;
drop policy if exists "tenant_isolation_tenant_app_sync_run" on "TenantAppSyncRun";
create policy "tenant_isolation_tenant_app_sync_run" on "TenantAppSyncRun"
  for all using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));

alter table "TenantAppUsage" enable row level security;
drop policy if exists "tenant_isolation_tenant_app_usage" on "TenantAppUsage";
create policy "tenant_isolation_tenant_app_usage" on "TenantAppUsage"
  for all using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));

alter table "TenantConfig" enable row level security;
drop policy if exists "tenant_isolation_tenant_config" on "TenantConfig";
create policy "tenant_isolation_tenant_config" on "TenantConfig"
  for all using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));

alter table "TenantFeature" enable row level security;
drop policy if exists "tenant_isolation_tenant_feature" on "TenantFeature";
create policy "tenant_isolation_tenant_feature" on "TenantFeature"
  for all using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));

alter table "TrustedDevice" enable row level security;
drop policy if exists "tenant_isolation_trusted_device" on "TrustedDevice";
create policy "tenant_isolation_trusted_device" on "TrustedDevice"
  for all using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));

alter table "User" enable row level security;
drop policy if exists "tenant_isolation_user" on "User";
create policy "tenant_isolation_user" on "User"
  for all using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));

alter table "UserSession" enable row level security;
drop policy if exists "tenant_isolation_user_session" on "UserSession";
create policy "tenant_isolation_user_session" on "UserSession"
  for all using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));

alter table "WebhookOutbox" enable row level security;
drop policy if exists "tenant_isolation_webhook_outbox" on "WebhookOutbox";
create policy "tenant_isolation_webhook_outbox" on "WebhookOutbox"
  for all using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));

alter table "WebhookSubscription" enable row level security;
drop policy if exists "tenant_isolation_webhook_subscription" on "WebhookSubscription";
create policy "tenant_isolation_webhook_subscription" on "WebhookSubscription"
  for all using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));

