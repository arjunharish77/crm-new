--
-- PostgreSQL database dump
--


-- Dumped from database version 17.10 (Homebrew)
-- Dumped by pg_dump version 17.10 (Homebrew)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA public;


--
-- Name: ack_automation_event(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.ack_automation_event(p_id text) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    AS $$
  UPDATE "AutomationOutbox"
  SET status = 'PROCESSED', "processedAt" = NOW()
  WHERE id = p_id;
$$;


--
-- Name: ack_domain_event(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.ack_domain_event(p_id text) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    AS $$
  UPDATE "DomainEventOutbox"
  SET status = 'PROCESSED', "processedAt" = NOW()
  WHERE id = p_id;
$$;


--
-- Name: ack_search_event(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.ack_search_event(p_id text) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    AS $$
  UPDATE "SearchOutbox"
  SET status = 'PROCESSED', "processedAt" = NOW()
  WHERE id = p_id;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: AutomationOutbox; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."AutomationOutbox" (
    id text NOT NULL,
    "tenantId" text NOT NULL,
    "eventType" text NOT NULL,
    "eventVersion" integer DEFAULT 1 NOT NULL,
    payload jsonb NOT NULL,
    "idempotencyKey" text,
    status text DEFAULT 'PENDING'::text NOT NULL,
    "retryCount" integer DEFAULT 0 NOT NULL,
    "nextRetryAt" timestamp with time zone,
    "createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "processedAt" timestamp with time zone,
    error text
);


--
-- Name: fetch_pending_automation_events(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fetch_pending_automation_events(p_limit integer) RETURNS SETOF public."AutomationOutbox"
    LANGUAGE sql SECURITY DEFINER
    AS $$
  UPDATE "AutomationOutbox"
  SET status = 'PROCESSING', "updatedAt" = NOW()
  WHERE id IN (
      SELECT id FROM "AutomationOutbox"
      WHERE status = 'PENDING'
      ORDER BY "createdAt" ASC
      LIMIT p_limit
      FOR UPDATE SKIP LOCKED
  )
  RETURNING *;
$$;


--
-- Name: DomainEventOutbox; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."DomainEventOutbox" (
    id text NOT NULL,
    "tenantId" text NOT NULL,
    "eventType" text NOT NULL,
    "eventVersion" integer DEFAULT 1 NOT NULL,
    payload jsonb NOT NULL,
    "idempotencyKey" text,
    status text DEFAULT 'PENDING'::text NOT NULL,
    "retryCount" integer DEFAULT 0 NOT NULL,
    "nextRetryAt" timestamp with time zone,
    "createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "processedAt" timestamp with time zone,
    error text
);


--
-- Name: fetch_pending_domain_events(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fetch_pending_domain_events(p_limit integer) RETURNS SETOF public."DomainEventOutbox"
    LANGUAGE sql SECURITY DEFINER
    AS $$
  UPDATE "DomainEventOutbox"
  SET status = 'PROCESSING', "updatedAt" = NOW()
  WHERE id IN (
      SELECT id FROM "DomainEventOutbox"
      WHERE status = 'PENDING'
      ORDER BY "createdAt" ASC
      LIMIT p_limit
      FOR UPDATE SKIP LOCKED
  )
  RETURNING *;
$$;


--
-- Name: SearchOutbox; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."SearchOutbox" (
    id text NOT NULL,
    "tenantId" text NOT NULL,
    "eventType" text NOT NULL,
    "eventVersion" integer DEFAULT 1 NOT NULL,
    payload jsonb NOT NULL,
    "idempotencyKey" text,
    status text DEFAULT 'PENDING'::text NOT NULL,
    "retryCount" integer DEFAULT 0 NOT NULL,
    "nextRetryAt" timestamp with time zone,
    "createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "processedAt" timestamp with time zone,
    error text
);


--
-- Name: fetch_pending_search_events(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fetch_pending_search_events(p_limit integer) RETURNS SETOF public."SearchOutbox"
    LANGUAGE sql SECURITY DEFINER
    AS $$
  UPDATE "SearchOutbox"
  SET status = 'PROCESSING', "updatedAt" = NOW()
  WHERE id IN (
      SELECT id FROM "SearchOutbox"
      WHERE status = 'PENDING'
      ORDER BY "createdAt" ASC
      LIMIT p_limit
      FOR UPDATE SKIP LOCKED
  )
  RETURNING *;
$$;


--
-- Name: User; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."User" (
    id text NOT NULL,
    "tenantId" text,
    email text NOT NULL,
    name text NOT NULL,
    phone text,
    password text NOT NULL,
    status text DEFAULT 'ACTIVE'::text NOT NULL,
    "roleId" text NOT NULL,
    "managerId" text,
    skills jsonb,
    "lastAssignedAt" timestamp with time zone,
    "createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL,
    "deletedAt" timestamp with time zone,
    "deletedBy" text,
    "teamId" uuid,
    "permissionTemplateId" uuid
);


--
-- Name: get_user_by_email(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_user_by_email(p_email text) RETURNS SETOF public."User"
    LANGUAGE sql SECURITY DEFINER
    AS $$
  SELECT * FROM "User" WHERE email = p_email;
$$;


--
-- Name: get_user_by_id(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_user_by_id(p_id text) RETURNS SETOF public."User"
    LANGUAGE sql SECURITY DEFINER
    AS $$
  SELECT * FROM "User" WHERE id = p_id;
$$;


--
-- Name: notify_crm_notification_insert(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notify_crm_notification_insert() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  perform pg_notify(
    'crm_notifications',
    json_build_object(
      'id', new.id,
      'tenantId', new."tenantId",
      'userId', new."userId",
      'title', new.title,
      'message', new.message,
      'data', new.data,
      'createdAt', new."createdAt"
    )::text
  );
  return new;
end;
$$;


--
-- Name: prevent_commission_ledger_mutation(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.prevent_commission_ledger_mutation() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  raise exception 'CommissionLedger rows are append-only — insert a CORRECTION_CREDIT/CORRECTION_DEBIT row instead of updating or deleting % on %', TG_OP, OLD.id;
end;
$$;


--
-- Name: prevent_gamification_ledger_mutation(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.prevent_gamification_ledger_mutation() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  raise exception 'GamificationPointsLedger rows are append-only — insert a MANUAL_ADJUSTMENT row instead of updating or deleting % on %', TG_OP, OLD.id;
end;
$$;


--
-- Name: Activity; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Activity" (
    id text NOT NULL,
    "tenantId" text NOT NULL,
    "objectId" text NOT NULL,
    "typeId" text NOT NULL,
    "leadId" text,
    "opportunityId" text,
    outcome text,
    notes text,
    "dueAt" timestamp with time zone,
    "completedAt" timestamp with time zone,
    "slaStatus" text DEFAULT 'PENDING'::text,
    "slaTarget" timestamp with time zone,
    "isRecurring" boolean DEFAULT false NOT NULL,
    "recurrenceRule" text,
    "seriesId" text,
    "createdBy" text NOT NULL,
    "createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL,
    "deletedAt" timestamp with time zone,
    "deletedBy" text
);


--
-- Name: ActivityReminder; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ActivityReminder" (
    id text NOT NULL,
    "tenantId" text NOT NULL,
    "activityId" text NOT NULL,
    "userId" text NOT NULL,
    "remindAt" timestamp with time zone NOT NULL,
    channel text DEFAULT 'IN_APP'::text NOT NULL,
    message text,
    status text DEFAULT 'PENDING'::text NOT NULL,
    "bullJobId" text,
    "createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "sentAt" timestamp with time zone
);


--
-- Name: ActivityType; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ActivityType" (
    id text NOT NULL,
    "tenantId" text NOT NULL,
    "objectId" text NOT NULL,
    name text NOT NULL,
    icon text,
    color text,
    "defaultOutcome" text,
    "defaultSLA" integer,
    "order" integer DEFAULT 0 NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL
);


--
-- Name: AssignmentLog; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."AssignmentLog" (
    id text NOT NULL,
    "tenantId" text NOT NULL,
    "entityType" text NOT NULL,
    "entityId" text NOT NULL,
    "assignedToId" text NOT NULL,
    "assignedById" text,
    "ruleId" text,
    reason text,
    "assignedAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: AssignmentRule; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."AssignmentRule" (
    id text NOT NULL,
    "tenantId" text NOT NULL,
    name text NOT NULL,
    description text,
    "entityType" text NOT NULL,
    priority integer DEFAULT 0 NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    conditions jsonb NOT NULL,
    strategy text NOT NULL,
    "targetGroupId" text,
    "targetUserIds" text[],
    "createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL
);


--
-- Name: AuditLog; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."AuditLog" (
    id text NOT NULL,
    "tenantId" text NOT NULL,
    "userId" text NOT NULL,
    action text NOT NULL,
    "entityType" text NOT NULL,
    "entityId" text NOT NULL,
    before jsonb,
    after jsonb,
    diff jsonb,
    metadata jsonb,
    hash text,
    "createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: AutomationExecution; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."AutomationExecution" (
    id text NOT NULL,
    "tenantId" text NOT NULL,
    "automationId" text NOT NULL,
    status text NOT NULL,
    "entityType" text NOT NULL,
    "entityId" text NOT NULL,
    context jsonb,
    "executionLog" jsonb,
    "workflowSnapshot" jsonb,
    "startedAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "completedAt" timestamp with time zone,
    error text
);


--
-- Name: AutomationQueue; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."AutomationQueue" (
    id text NOT NULL,
    "tenantId" text NOT NULL,
    "automationId" text NOT NULL,
    "entityType" text NOT NULL,
    "entityId" text NOT NULL,
    record jsonb DEFAULT '{}'::jsonb NOT NULL,
    "resumeNodeIds" jsonb DEFAULT '[]'::jsonb NOT NULL,
    "waitingNodeId" text,
    status text DEFAULT 'PENDING'::text NOT NULL,
    "runAt" timestamp with time zone NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    "lastError" text,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
    "userId" text
);


--
-- Name: AutomationV2; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."AutomationV2" (
    id text NOT NULL,
    "tenantId" text NOT NULL,
    name text NOT NULL,
    description text,
    trigger jsonb NOT NULL,
    steps jsonb,
    workflow jsonb,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL,
    "deletedAt" timestamp with time zone,
    "deletedBy" text
);


--
-- Name: Badge; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Badge" (
    id text NOT NULL,
    "tenantId" text NOT NULL,
    name text NOT NULL,
    description text,
    "iconEmoji" text DEFAULT '🏆'::text NOT NULL,
    "audienceScope" text DEFAULT 'ALL'::text NOT NULL,
    "criteriaRules" jsonb NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdBy" text,
    "createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "Badge_audienceScope_check" CHECK (("audienceScope" = ANY (ARRAY['INTERNAL'::text, 'PARTNER'::text, 'ALL'::text])))
);


--
-- Name: CalculatedFieldDefinition; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."CalculatedFieldDefinition" (
    id text NOT NULL,
    "tenantId" text NOT NULL,
    "fieldDefinitionId" text NOT NULL,
    formula text NOT NULL,
    dependencies text[]
);


--
-- Name: CommissionLedger; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."CommissionLedger" (
    id text NOT NULL,
    "tenantId" text NOT NULL,
    "partnerId" text NOT NULL,
    "opportunityId" text,
    "commissionRuleId" text,
    "entryType" text NOT NULL,
    "baseAmount" numeric,
    "commissionAmount" numeric NOT NULL,
    "calculationSnapshot" jsonb,
    "triggerEvent" text,
    "correctsEntryId" text,
    "createdBy" text,
    "createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "CommissionLedger_entryType_check" CHECK (("entryType" = ANY (ARRAY['EARNED'::text, 'CORRECTION_CREDIT'::text, 'CORRECTION_DEBIT'::text])))
);


--
-- Name: CommissionRule; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."CommissionRule" (
    id text NOT NULL,
    "tenantId" text NOT NULL,
    name text NOT NULL,
    "partnerId" text,
    "opportunityTypeId" text,
    conditions jsonb DEFAULT '{}'::jsonb NOT NULL,
    "ruleType" text NOT NULL,
    value numeric NOT NULL,
    priority integer DEFAULT 0 NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "effectiveFrom" timestamp with time zone,
    "effectiveTo" timestamp with time zone,
    "createdBy" text,
    "createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "CommissionRule_ruleType_check" CHECK (("ruleType" = ANY (ARRAY['FLAT'::text, 'PERCENTAGE'::text])))
);


--
-- Name: CommunicationDeliveryEvent; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."CommunicationDeliveryEvent" (
    id text NOT NULL,
    "tenantId" text NOT NULL,
    "outboxId" text,
    channel text NOT NULL,
    "eventType" text NOT NULL,
    "providerMessageId" text,
    "providerPayload" jsonb DEFAULT '{}'::jsonb NOT NULL,
    "entityType" text,
    "entityId" text,
    "occurredAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "CommunicationDeliveryEvent_channel_check" CHECK ((channel = ANY (ARRAY['EMAIL'::text, 'WHATSAPP'::text, 'SMS'::text])))
);


--
-- Name: CommunicationOutbox; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."CommunicationOutbox" (
    id text NOT NULL,
    "tenantId" text NOT NULL,
    channel text NOT NULL,
    "providerConfigId" text,
    "senderIdentityId" text,
    "templateId" text,
    recipient text NOT NULL,
    subject text,
    body text NOT NULL,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    status text DEFAULT 'QUEUED'::text NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    "nextAttemptAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "lastAttemptAt" timestamp with time zone,
    "sentAt" timestamp with time zone,
    error text,
    "sourceType" text,
    "sourceId" text,
    "entityType" text,
    "entityId" text,
    "createdBy" text,
    "createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "CommunicationOutbox_channel_check" CHECK ((channel = ANY (ARRAY['EMAIL'::text, 'WHATSAPP'::text, 'SMS'::text]))),
    CONSTRAINT "CommunicationOutbox_status_check" CHECK ((status = ANY (ARRAY['QUEUED'::text, 'SENDING'::text, 'SENT'::text, 'FAILED'::text, 'SUPPRESSED'::text])))
);


--
-- Name: CommunicationProviderConfig; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."CommunicationProviderConfig" (
    id text NOT NULL,
    "tenantId" text NOT NULL,
    channel text NOT NULL,
    "providerType" text NOT NULL,
    name text NOT NULL,
    config jsonb DEFAULT '{}'::jsonb NOT NULL,
    "secretConfig" jsonb DEFAULT '{}'::jsonb NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdBy" text,
    "updatedBy" text,
    "createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "CommunicationProviderConfig_channel_check" CHECK ((channel = ANY (ARRAY['EMAIL'::text, 'WHATSAPP'::text, 'SMS'::text]))),
    CONSTRAINT "CommunicationProviderConfig_providerType_check" CHECK (("providerType" = ANY (ARRAY['SMTP'::text, 'GENERIC_HTTP'::text])))
);


--
-- Name: CommunicationTemplate; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."CommunicationTemplate" (
    id text NOT NULL,
    "tenantId" text NOT NULL,
    channel text NOT NULL,
    name text NOT NULL,
    subject text,
    body text NOT NULL,
    tokens text[] DEFAULT '{}'::text[] NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdBy" text,
    "createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "CommunicationTemplate_channel_check" CHECK ((channel = ANY (ARRAY['EMAIL'::text, 'WHATSAPP'::text, 'SMS'::text])))
);


--
-- Name: CustomFieldValue; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."CustomFieldValue" (
    id text NOT NULL,
    "tenantId" text NOT NULL,
    "objectType" text,
    "fieldDefinitionId" text NOT NULL,
    "recordId" text NOT NULL,
    "valueString" text,
    "valueNumber" double precision,
    "valueBoolean" boolean,
    "valueDate" timestamp with time zone,
    "valueJson" jsonb,
    "createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL
);


--
-- Name: CustomReport; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."CustomReport" (
    id text NOT NULL,
    "tenantId" text NOT NULL,
    name text NOT NULL,
    description text,
    module text NOT NULL,
    config jsonb NOT NULL,
    schedule jsonb,
    "chartType" text,
    "isPublic" boolean DEFAULT false NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "lastRunAt" timestamp with time zone,
    "createdBy" text NOT NULL,
    "createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL
);


--
-- Name: DailyMetric; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."DailyMetric" (
    id text NOT NULL,
    "tenantId" text NOT NULL,
    date date NOT NULL,
    metric text NOT NULL,
    value double precision NOT NULL,
    dimensions jsonb,
    "createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL
);


--
-- Name: DashboardWidget; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."DashboardWidget" (
    id text NOT NULL,
    "tenantId" text NOT NULL,
    "userId" text,
    title text NOT NULL,
    type text NOT NULL,
    config jsonb NOT NULL,
    w integer DEFAULT 1 NOT NULL,
    h integer DEFAULT 1 NOT NULL,
    x integer DEFAULT 0 NOT NULL,
    y integer DEFAULT 0 NOT NULL,
    "createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL
);


--
-- Name: DataRetentionPolicy; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."DataRetentionPolicy" (
    id text NOT NULL,
    "tenantId" text,
    "leadRetentionDays" integer DEFAULT 365 NOT NULL,
    "opportunityRetentionDays" integer DEFAULT 730 NOT NULL,
    "activityRetentionDays" integer DEFAULT 180 NOT NULL,
    "auditLogRetentionDays" integer DEFAULT 90 NOT NULL,
    "deletedRecordsRetentionDays" integer DEFAULT 30 NOT NULL,
    "createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL,
    "lastEnforcedAt" timestamp with time zone
);


--
-- Name: EmailLog; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."EmailLog" (
    id text NOT NULL,
    "tenantId" text NOT NULL,
    "entityType" text NOT NULL,
    "entityId" text NOT NULL,
    direction text NOT NULL,
    subject text,
    body text,
    "fromEmail" text NOT NULL,
    "toEmails" text[],
    "ccEmails" text[],
    status text DEFAULT 'RECEIVED'::text NOT NULL,
    "messageId" text,
    "threadId" text,
    "openedAt" timestamp with time zone,
    "clickedAt" timestamp with time zone,
    "sentBy" text,
    "createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: ExportRequest; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ExportRequest" (
    id text NOT NULL,
    "tenantId" text NOT NULL,
    "userId" text NOT NULL,
    "moduleName" text NOT NULL,
    "exportType" text DEFAULT 'CSV'::text NOT NULL,
    status text DEFAULT 'QUEUED'::text NOT NULL,
    filters jsonb DEFAULT '{}'::jsonb NOT NULL,
    columns jsonb DEFAULT '[]'::jsonb NOT NULL,
    "recordCount" integer DEFAULT 0 NOT NULL,
    "fileObjectId" text,
    error text,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    "queuedAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "startedAt" timestamp with time zone,
    "completedAt" timestamp with time zone,
    "updatedAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "ExportRequest_exportType_check" CHECK (("exportType" = ANY (ARRAY['CSV'::text, 'PDF'::text, 'XLSX'::text]))),
    CONSTRAINT "ExportRequest_moduleName_check" CHECK (("moduleName" = ANY (ARRAY['LEADS'::text, 'OPPORTUNITIES'::text, 'ACTIVITIES'::text, 'TASKS'::text, 'PARTNERS'::text, 'PAYOUTS'::text, 'REPORTS'::text, 'FORMS'::text]))),
    CONSTRAINT "ExportRequest_status_check" CHECK ((status = ANY (ARRAY['QUEUED'::text, 'RUNNING'::text, 'COMPLETED'::text, 'FAILED'::text, 'CANCELLED'::text])))
);


--
-- Name: FieldDefinition; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."FieldDefinition" (
    id text NOT NULL,
    "tenantId" text NOT NULL,
    "objectId" text NOT NULL,
    key text NOT NULL,
    label text NOT NULL,
    type text NOT NULL,
    "storageStrategy" text DEFAULT 'HYBRID'::text NOT NULL,
    "isCustom" boolean DEFAULT false NOT NULL,
    "isRequired" boolean DEFAULT false NOT NULL,
    "isUnique" boolean DEFAULT false NOT NULL,
    "isImmutable" boolean DEFAULT false NOT NULL,
    "defaultValue" text,
    options jsonb,
    "groupId" text,
    "order" integer DEFAULT 0 NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "deletedAt" timestamp with time zone,
    "createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL,
    "entityType" text,
    "entityTypeId" text
);


--
-- Name: FieldDefinitionVersion; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."FieldDefinitionVersion" (
    id text NOT NULL,
    "tenantId" text NOT NULL,
    "fieldDefinitionId" text NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    snapshot jsonb NOT NULL,
    "changedBy" text NOT NULL,
    "changeNote" text,
    "createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: FieldDependencyRule; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."FieldDependencyRule" (
    id text NOT NULL,
    "tenantId" text NOT NULL,
    "sourceFieldId" text NOT NULL,
    "targetFieldId" text NOT NULL,
    condition jsonb NOT NULL,
    action text NOT NULL
);


--
-- Name: FieldGroup; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."FieldGroup" (
    id text NOT NULL,
    "tenantId" text NOT NULL,
    "objectId" text NOT NULL,
    name text NOT NULL,
    "order" integer DEFAULT 0 NOT NULL
);


--
-- Name: FieldPermissionV2; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."FieldPermissionV2" (
    id text NOT NULL,
    "roleId" text NOT NULL,
    "fieldId" text NOT NULL,
    access text DEFAULT 'READ'::text NOT NULL
);


--
-- Name: FieldValidationRule; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."FieldValidationRule" (
    id text NOT NULL,
    "tenantId" text NOT NULL,
    "fieldDefinitionId" text NOT NULL,
    type text NOT NULL,
    config jsonb NOT NULL
);


--
-- Name: FileObject; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."FileObject" (
    id text NOT NULL,
    "tenantId" text NOT NULL,
    "storageDriver" text DEFAULT 'local'::text NOT NULL,
    bucket text NOT NULL,
    "storageKey" text NOT NULL,
    "originalFilename" text,
    "contentType" text,
    "byteSize" integer DEFAULT 0 NOT NULL,
    checksum text,
    "entityType" text,
    "entityId" text,
    visibility text DEFAULT 'PRIVATE'::text NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    "createdBy" text,
    "createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "FileObject_storageDriver_check" CHECK (("storageDriver" = ANY (ARRAY['local'::text, 's3'::text]))),
    CONSTRAINT "FileObject_visibility_check" CHECK ((visibility = ANY (ARRAY['PRIVATE'::text, 'TENANT'::text])))
);


--
-- Name: Form; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Form" (
    id text NOT NULL,
    "tenantId" text NOT NULL,
    "objectId" text NOT NULL,
    name text NOT NULL,
    description text,
    fields jsonb DEFAULT '[]'::jsonb NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "submitButtonText" text DEFAULT 'Submit'::text NOT NULL,
    "successMessage" text,
    "redirectUrl" text,
    "spamProtection" boolean DEFAULT true NOT NULL,
    "captchaEnabled" boolean DEFAULT false NOT NULL,
    "rateLimit" integer DEFAULT 10 NOT NULL,
    "duplicateAction" text DEFAULT 'CREATE'::text NOT NULL,
    "defaultOwnerId" text,
    "automationId" text,
    theme text DEFAULT 'default'::text NOT NULL,
    "createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL,
    "deletedAt" timestamp with time zone,
    "deletedBy" text,
    config jsonb DEFAULT '{}'::jsonb NOT NULL
);


--
-- Name: FormSubmission; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."FormSubmission" (
    id text NOT NULL,
    "tenantId" text NOT NULL,
    "formId" text NOT NULL,
    "leadId" text,
    data jsonb NOT NULL,
    "utmParams" jsonb,
    "ipAddress" text,
    "userAgent" text,
    referrer text,
    status text DEFAULT 'PROCESSED'::text NOT NULL,
    "spamScore" double precision,
    "isDuplicate" boolean DEFAULT false NOT NULL,
    "duplicateLeadId" text,
    "errorMessage" text,
    "createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: GDPRRequest; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."GDPRRequest" (
    id text NOT NULL,
    "tenantId" text NOT NULL,
    type text NOT NULL,
    "subjectEmail" text NOT NULL,
    status text NOT NULL,
    evidence text,
    "requestedAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "completedAt" timestamp with time zone
);


--
-- Name: GamificationPointsLedger; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."GamificationPointsLedger" (
    id text NOT NULL,
    "tenantId" text NOT NULL,
    "userId" text NOT NULL,
    "gamificationRuleId" text,
    points integer NOT NULL,
    "entryType" text NOT NULL,
    "sourceEntityType" text,
    "sourceEntityId" text,
    "triggerEvent" text,
    "redemptionId" text,
    "createdBy" text,
    "createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "GamificationPointsLedger_entryType_check" CHECK (("entryType" = ANY (ARRAY['EARNED'::text, 'MANUAL_ADJUSTMENT'::text, 'REDEEMED'::text])))
);


--
-- Name: GamificationRedemption; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."GamificationRedemption" (
    id text NOT NULL,
    "tenantId" text NOT NULL,
    "userId" text NOT NULL,
    "redemptionType" text NOT NULL,
    "pointsRedeemed" integer NOT NULL,
    "monetaryAmount" numeric,
    "thirdPartyProvider" text,
    "thirdPartyReference" text,
    status text DEFAULT 'REQUESTED'::text NOT NULL,
    "createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "catalogItemKey" text,
    "rewardName" text,
    notes text,
    "failureReason" text,
    "reviewedBy" text,
    "reviewedAt" timestamp with time zone,
    "updatedAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "GamificationRedemption_redemptionType_check" CHECK (("redemptionType" = ANY (ARRAY['MONETARY'::text, 'THIRD_PARTY_REWARD'::text, 'INTERNAL_PERK'::text]))),
    CONSTRAINT "GamificationRedemption_status_check" CHECK ((status = ANY (ARRAY['REQUESTED'::text, 'FULFILLED'::text, 'FAILED'::text])))
);


--
-- Name: GamificationRule; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."GamificationRule" (
    id text NOT NULL,
    "tenantId" text NOT NULL,
    name text NOT NULL,
    "triggerEventType" text NOT NULL,
    "audienceScope" text DEFAULT 'ALL'::text NOT NULL,
    conditions jsonb DEFAULT '{}'::jsonb NOT NULL,
    "pointsAwarded" integer NOT NULL,
    priority integer DEFAULT 0 NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdBy" text,
    "createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "GamificationRule_audienceScope_check" CHECK (("audienceScope" = ANY (ARRAY['INTERNAL'::text, 'PARTNER'::text, 'ALL'::text])))
);


--
-- Name: GamificationSettings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."GamificationSettings" (
    id text NOT NULL,
    "tenantId" text NOT NULL,
    levels jsonb DEFAULT '[]'::jsonb NOT NULL,
    "leaderboardConfig" jsonb DEFAULT '{}'::jsonb NOT NULL,
    "redemptionCatalog" jsonb DEFAULT '[]'::jsonb NOT NULL,
    "antiGamingRules" jsonb DEFAULT '{}'::jsonb NOT NULL,
    "updatedBy" text,
    "createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "participantConfig" jsonb DEFAULT '{"mode": "ALL", "teamIds": [], "userIds": [], "salesGroupIds": [], "partnerOrganizationIds": []}'::jsonb NOT NULL
);


--
-- Name: ImportJob; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ImportJob" (
    id text NOT NULL,
    "tenantId" text NOT NULL,
    "userId" text NOT NULL,
    module text NOT NULL,
    "filePath" text NOT NULL,
    mapping jsonb NOT NULL,
    status text NOT NULL,
    stats jsonb,
    errors jsonb,
    "createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL
);


--
-- Name: IntegrationSetting; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."IntegrationSetting" (
    id uuid NOT NULL,
    "tenantId" text,
    type text NOT NULL,
    config jsonb DEFAULT '{}'::jsonb NOT NULL,
    "isActive" boolean DEFAULT false NOT NULL,
    "updatedBy" uuid,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: LayoutDefinition; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."LayoutDefinition" (
    id text NOT NULL,
    "tenantId" text NOT NULL,
    "objectId" text NOT NULL,
    name text NOT NULL,
    config jsonb NOT NULL,
    "isDefault" boolean DEFAULT true NOT NULL
);


--
-- Name: Lead; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Lead" (
    id text NOT NULL,
    "tenantId" text NOT NULL,
    "objectId" text NOT NULL,
    name text NOT NULL,
    email text,
    phone text,
    source text,
    company text,
    status text DEFAULT 'NEW'::text NOT NULL,
    tags text[],
    "ownerId" text,
    score integer DEFAULT 0 NOT NULL,
    "createdBy" text,
    "createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL,
    "deletedAt" timestamp with time zone,
    "deletedBy" text
);


--
-- Name: LeadList; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."LeadList" (
    id uuid NOT NULL,
    "tenantId" text,
    name text NOT NULL,
    description text,
    type text NOT NULL,
    filters jsonb,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdBy" text,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "LeadList_type_check" CHECK ((type = ANY (ARRAY['STATIC'::text, 'SMART'::text])))
);


--
-- Name: LeadListMember; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."LeadListMember" (
    id uuid NOT NULL,
    "tenantId" text,
    "listId" uuid NOT NULL,
    "leadId" text NOT NULL,
    "addedBy" text,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: LeadScoringRule; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."LeadScoringRule" (
    id text NOT NULL,
    "tenantId" text NOT NULL,
    name text NOT NULL,
    description text,
    "fieldKey" text NOT NULL,
    operator text NOT NULL,
    value text,
    "scoreChange" integer DEFAULT 0 NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "order" integer DEFAULT 0 NOT NULL,
    "createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL
);


--
-- Name: Note; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Note" (
    id text NOT NULL,
    "tenantId" text NOT NULL,
    "entityType" text NOT NULL,
    "entityId" text NOT NULL,
    content text NOT NULL,
    "authorId" text NOT NULL,
    mentions text[],
    "isPinned" boolean DEFAULT false NOT NULL,
    "createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL,
    "deletedAt" timestamp with time zone,
    "deletedBy" text
);


--
-- Name: Notification; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Notification" (
    id text NOT NULL,
    "tenantId" text,
    "userId" text NOT NULL,
    title text NOT NULL,
    message text NOT NULL,
    data jsonb DEFAULT '{}'::jsonb NOT NULL,
    "isRead" boolean DEFAULT false NOT NULL,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "readAt" timestamp with time zone
);


--
-- Name: ObjectDefinition; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ObjectDefinition" (
    id text NOT NULL,
    "tenantId" text NOT NULL,
    name text NOT NULL,
    label text NOT NULL,
    description text,
    "isCustom" boolean DEFAULT false NOT NULL,
    "createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL
);


--
-- Name: ObjectPermission; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ObjectPermission" (
    id text NOT NULL,
    "tenantId" text NOT NULL,
    "roleId" text NOT NULL,
    "objectId" text NOT NULL,
    "canCreate" boolean DEFAULT false NOT NULL,
    "canRead" boolean DEFAULT false NOT NULL,
    "canUpdate" boolean DEFAULT false NOT NULL,
    "canDelete" boolean DEFAULT false NOT NULL,
    "recordVisibility" text DEFAULT 'OWN'::text NOT NULL
);


--
-- Name: ObjectRelationship; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ObjectRelationship" (
    id text NOT NULL,
    "tenantId" text NOT NULL,
    "sourceObjectId" text NOT NULL,
    "targetObjectId" text NOT NULL,
    type text NOT NULL,
    label text NOT NULL
);


--
-- Name: Opportunity; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Opportunity" (
    id text NOT NULL,
    "tenantId" text NOT NULL,
    "objectId" text NOT NULL,
    "leadId" text NOT NULL,
    "opportunityTypeId" text NOT NULL,
    "stageId" text NOT NULL,
    title text NOT NULL,
    amount numeric(15,2),
    "expectedCloseDate" timestamp with time zone,
    priority text DEFAULT 'MEDIUM'::text,
    tags text[],
    "ownerId" text,
    "createdBy" text,
    "createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL,
    "deletedAt" timestamp with time zone,
    "deletedBy" text
);


--
-- Name: OpportunityStageHistory; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."OpportunityStageHistory" (
    id text NOT NULL,
    "tenantId" text NOT NULL,
    "opportunityId" text NOT NULL,
    "fromStageId" text,
    "toStageId" text NOT NULL,
    "changedById" text NOT NULL,
    "changedAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    notes text
);


--
-- Name: OpportunityType; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."OpportunityType" (
    id text NOT NULL,
    "tenantId" text NOT NULL,
    "objectId" text NOT NULL,
    name text NOT NULL,
    description text,
    icon text,
    color text,
    "order" integer DEFAULT 0 NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL
);


--
-- Name: PartnerInvoice; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."PartnerInvoice" (
    id text NOT NULL,
    "tenantId" text NOT NULL,
    "partnerId" text NOT NULL,
    "payoutId" text NOT NULL,
    "invoiceNumber" text NOT NULL,
    "invoiceDate" timestamp with time zone NOT NULL,
    "supplierSnapshot" jsonb NOT NULL,
    "recipientSnapshot" jsonb NOT NULL,
    "lineItems" jsonb NOT NULL,
    "taxableValue" numeric NOT NULL,
    "cgstAmount" numeric DEFAULT 0 NOT NULL,
    "sgstAmount" numeric DEFAULT 0 NOT NULL,
    "igstAmount" numeric DEFAULT 0 NOT NULL,
    "totalAmount" numeric NOT NULL,
    "isGstInvoice" boolean DEFAULT true NOT NULL,
    "pdfStoragePath" text,
    "generatedAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "generatedBy" text,
    "createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: PartnerInvoiceTemplate; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."PartnerInvoiceTemplate" (
    id text NOT NULL,
    "tenantId" text NOT NULL,
    "partnerId" text NOT NULL,
    "logoUrl" text,
    "footerNotes" text,
    "signatoryName" text,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: PartnerOrganization; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."PartnerOrganization" (
    id text NOT NULL,
    "tenantId" text NOT NULL,
    name text NOT NULL,
    status text DEFAULT 'ACTIVE'::text NOT NULL,
    "parentOrganizationId" text,
    "primaryUserId" text,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    "createdBy" text,
    "createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "PartnerOrganization_status_check" CHECK ((status = ANY (ARRAY['ACTIVE'::text, 'SUSPENDED'::text])))
);


--
-- Name: PartnerPayoutSettings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."PartnerPayoutSettings" (
    id text NOT NULL,
    "tenantId" text NOT NULL,
    "cycleFrequency" text DEFAULT 'MONTHLY'::text NOT NULL,
    "customIntervalDays" integer,
    "cycleAnchorDay" integer DEFAULT 1 NOT NULL,
    "defaultHsnSacCode" text,
    "companyLegalName" text,
    "companyGstin" text,
    "companyAddress" jsonb,
    "companyState" text,
    "updatedBy" text,
    "createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "gstRatePercent" numeric DEFAULT 18 NOT NULL,
    "invoiceNumberPattern" text DEFAULT '{prefix}-{counter}'::text NOT NULL,
    "minimumPayoutAmount" numeric DEFAULT 0 NOT NULL,
    "approvalMode" text DEFAULT 'MANUAL'::text NOT NULL,
    "autoApproveBelowAmount" numeric,
    "requireInvoiceBeforePayment" boolean DEFAULT true NOT NULL,
    "allowPartnerSelfInvoice" boolean DEFAULT true NOT NULL,
    "adjustmentReasons" jsonb DEFAULT '[]'::jsonb NOT NULL,
    "holdReasons" jsonb DEFAULT '[]'::jsonb NOT NULL,
    "payoutVisibilityConfig" jsonb DEFAULT '{"mode": "ALL_PARTNERS", "teamIds": [], "userIds": [], "salesGroupIds": [], "partnerOrganizationIds": []}'::jsonb NOT NULL,
    CONSTRAINT "PartnerPayoutSettings_approvalMode_check" CHECK (("approvalMode" = ANY (ARRAY['MANUAL'::text, 'AUTO_BELOW_THRESHOLD'::text]))),
    CONSTRAINT "PartnerPayoutSettings_cycleFrequency_check" CHECK (("cycleFrequency" = ANY (ARRAY['MONTHLY'::text, 'BIWEEKLY'::text, 'CUSTOM_DAYS'::text])))
);


--
-- Name: PartnerProfile; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."PartnerProfile" (
    id text NOT NULL,
    "tenantId" text NOT NULL,
    "userId" text NOT NULL,
    "legalBusinessName" text NOT NULL,
    gstin text,
    "panNumber" text,
    "registeredAddress" jsonb,
    "registeredState" text,
    status text DEFAULT 'ACTIVE'::text NOT NULL,
    "invoiceNumberPrefix" text DEFAULT 'INV'::text NOT NULL,
    "invoiceNumberCounter" integer DEFAULT 0 NOT NULL,
    "createdBy" text,
    "createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "invoiceNumberPattern" text,
    "invoiceNumberCountersByFy" jsonb DEFAULT '{}'::jsonb NOT NULL,
    "partnerOrganizationId" text,
    "parentPartnerProfileId" text,
    "canAccessPayouts" boolean DEFAULT true NOT NULL,
    "partnerLoginRole" text DEFAULT 'PRIMARY'::text NOT NULL,
    CONSTRAINT "PartnerProfile_partnerLoginRole_check" CHECK (("partnerLoginRole" = ANY (ARRAY['PRIMARY'::text, 'MANAGER'::text, 'MEMBER'::text, 'FINANCE'::text])))
);


--
-- Name: Payout; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Payout" (
    id text NOT NULL,
    "tenantId" text NOT NULL,
    "payoutCycleId" text NOT NULL,
    "partnerId" text NOT NULL,
    "totalCommissionAmount" numeric DEFAULT 0 NOT NULL,
    status text DEFAULT 'DRAFT'::text NOT NULL,
    "invoiceId" text,
    "approvedAt" timestamp with time zone,
    "approvedBy" text,
    "paidAt" timestamp with time zone,
    "paidBy" text,
    "paymentReference" text,
    "createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "isHeld" boolean DEFAULT false NOT NULL,
    "holdReason" text,
    "heldAt" timestamp with time zone,
    "heldBy" text,
    "releasedAt" timestamp with time zone,
    "releasedBy" text,
    "partnerOrganizationId" text,
    CONSTRAINT "Payout_status_check" CHECK ((status = ANY (ARRAY['DRAFT'::text, 'APPROVED'::text, 'INVOICED'::text, 'PAID'::text])))
);


--
-- Name: PayoutCycle; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."PayoutCycle" (
    id text NOT NULL,
    "tenantId" text NOT NULL,
    "cycleLabel" text NOT NULL,
    "startDate" timestamp with time zone NOT NULL,
    "endDate" timestamp with time zone NOT NULL,
    status text DEFAULT 'OPEN'::text NOT NULL,
    "generatedAt" timestamp with time zone,
    "createdBy" text,
    "createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "PayoutCycle_status_check" CHECK ((status = ANY (ARRAY['OPEN'::text, 'CLOSED'::text])))
);


--
-- Name: PermissionTemplate; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."PermissionTemplate" (
    id uuid NOT NULL,
    "tenantId" text,
    name text NOT NULL,
    description text,
    permissions jsonb DEFAULT '{}'::jsonb NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: PlanUpgradeHistory; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."PlanUpgradeHistory" (
    id text NOT NULL,
    "tenantId" text NOT NULL,
    "previousPlan" text NOT NULL,
    "newPlan" text NOT NULL,
    "upgradedBy" text NOT NULL,
    reason text,
    "previousFeatures" jsonb,
    "newFeatures" jsonb,
    "createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: PlatformAdmin; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."PlatformAdmin" (
    id text NOT NULL,
    "userId" text NOT NULL,
    permissions jsonb NOT NULL,
    "canImpersonate" boolean DEFAULT false NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL
);


--
-- Name: RecordScore; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."RecordScore" (
    id text NOT NULL,
    "tenantId" text NOT NULL,
    "modelVersionId" text,
    "recordType" text NOT NULL,
    "recordId" text NOT NULL,
    "fitScore" integer,
    "engagementScore" integer,
    "conversionProbability" integer,
    "winProbability" integer,
    "stallRisk" integer,
    "scoreBand" text NOT NULL,
    confidence integer DEFAULT 0 NOT NULL,
    reasons jsonb DEFAULT '[]'::jsonb NOT NULL,
    source text DEFAULT 'SELF_LEARNING_MVP'::text NOT NULL,
    "featureSnapshotId" text,
    "calculatedAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "RecordScore_recordType_check" CHECK (("recordType" = ANY (ARRAY['LEAD'::text, 'OPPORTUNITY'::text]))),
    CONSTRAINT "RecordScore_scoreBand_check" CHECK (("scoreBand" = ANY (ARRAY['HOT'::text, 'WARM'::text, 'COLD'::text, 'RISK'::text]))),
    CONSTRAINT "RecordScore_source_check" CHECK ((source = ANY (ARRAY['PREDICTIVE_SCORING'::text, 'SELF_LEARNING'::text, 'RULE_FALLBACK'::text, 'MANUAL_OVERRIDE'::text])))
);


--
-- Name: RecordScoreHistory; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."RecordScoreHistory" (
    id text NOT NULL,
    "tenantId" text NOT NULL,
    "recordScoreId" text,
    "recordType" text NOT NULL,
    "recordId" text NOT NULL,
    "previousScore" jsonb,
    "nextScore" jsonb NOT NULL,
    "changeReason" text DEFAULT 'RECOMPUTE'::text NOT NULL,
    "createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "RecordScoreHistory_recordType_check" CHECK (("recordType" = ANY (ARRAY['LEAD'::text, 'OPPORTUNITY'::text])))
);


--
-- Name: RecordVisibilityRule; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."RecordVisibilityRule" (
    id text NOT NULL,
    "tenantId" text NOT NULL,
    "roleId" text NOT NULL,
    "entityType" text NOT NULL,
    conditions jsonb NOT NULL,
    visibility text NOT NULL
);


--
-- Name: ReportDefinition; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ReportDefinition" (
    id text NOT NULL,
    "tenantId" text,
    "reportKey" text NOT NULL,
    name text NOT NULL,
    description text,
    category text DEFAULT 'CUSTOM'::text NOT NULL,
    "queryDefinition" jsonb DEFAULT '{}'::jsonb NOT NULL,
    visualization jsonb DEFAULT '{}'::jsonb NOT NULL,
    "isSystem" boolean DEFAULT false NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdBy" text,
    "createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "ReportDefinition_category_check" CHECK ((category = ANY (ARRAY['FUNNEL'::text, 'PERFORMANCE'::text, 'SLA'::text, 'ROI'::text, 'REASSIGNMENT'::text, 'ACTIVITY'::text, 'PAYOUT'::text, 'COHORT'::text, 'DATA_QUALITY'::text, 'CUSTOM'::text])))
);


--
-- Name: ReportEmailDelivery; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ReportEmailDelivery" (
    id text NOT NULL,
    "tenantId" text NOT NULL,
    "scheduleId" text,
    "reportKey" text NOT NULL,
    recipients text[] DEFAULT '{}'::text[] NOT NULL,
    subject text NOT NULL,
    body jsonb NOT NULL,
    format text DEFAULT 'LINK'::text NOT NULL,
    status text DEFAULT 'PENDING'::text NOT NULL,
    error text,
    "sentAt" timestamp with time zone,
    "createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "ReportEmailDelivery_format_check" CHECK ((format = ANY (ARRAY['LINK'::text, 'CSV'::text, 'PDF'::text]))),
    CONSTRAINT "ReportEmailDelivery_status_check" CHECK ((status = ANY (ARRAY['PENDING'::text, 'SENT'::text, 'FAILED'::text])))
);


--
-- Name: ReportRefreshJob; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ReportRefreshJob" (
    id text NOT NULL,
    "tenantId" text NOT NULL,
    "reportKey" text NOT NULL,
    "scopeType" text DEFAULT 'ORG'::text NOT NULL,
    "scopeId" text,
    "periodStart" timestamp with time zone,
    "periodEnd" timestamp with time zone,
    "requestedBy" text,
    reason text DEFAULT 'SCHEDULED'::text NOT NULL,
    status text DEFAULT 'PENDING'::text NOT NULL,
    "startedAt" timestamp with time zone,
    "completedAt" timestamp with time zone,
    error text,
    "createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "ReportRefreshJob_reason_check" CHECK ((reason = ANY (ARRAY['SCHEDULED'::text, 'MANUAL'::text, 'BACKFILL'::text]))),
    CONSTRAINT "ReportRefreshJob_scopeType_check" CHECK (("scopeType" = ANY (ARRAY['ORG'::text, 'TEAM'::text, 'USER'::text, 'PARTNER'::text]))),
    CONSTRAINT "ReportRefreshJob_status_check" CHECK ((status = ANY (ARRAY['PENDING'::text, 'RUNNING'::text, 'SUCCEEDED'::text, 'FAILED'::text, 'SKIPPED'::text])))
);


--
-- Name: ReportRefreshState; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ReportRefreshState" (
    id text NOT NULL,
    "tenantId" text NOT NULL,
    "reportKey" text NOT NULL,
    "scopeType" text DEFAULT 'ORG'::text NOT NULL,
    "scopeId" text,
    "lastStartedAt" timestamp with time zone,
    "lastCompletedAt" timestamp with time zone,
    "lastSuccessfulAt" timestamp with time zone,
    "lastSourceWatermark" timestamp with time zone,
    status text DEFAULT 'STALE'::text NOT NULL,
    error text,
    "refreshIntervalMinutes" integer DEFAULT 15 NOT NULL,
    "manualRefreshRequestedAt" timestamp with time zone,
    "manualRefreshRequestedBy" text,
    "createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "ReportRefreshState_scopeType_check" CHECK (("scopeType" = ANY (ARRAY['ORG'::text, 'TEAM'::text, 'USER'::text, 'PARTNER'::text]))),
    CONSTRAINT "ReportRefreshState_status_check" CHECK ((status = ANY (ARRAY['FRESH'::text, 'STALE'::text, 'REFRESHING'::text, 'ERROR'::text])))
);


--
-- Name: ReportRollup; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ReportRollup" (
    id text NOT NULL,
    "tenantId" text NOT NULL,
    "reportKey" text NOT NULL,
    "scopeType" text DEFAULT 'ORG'::text NOT NULL,
    "scopeId" text,
    "periodStart" timestamp with time zone,
    "periodEnd" timestamp with time zone,
    grain text DEFAULT 'CURRENT'::text NOT NULL,
    dimensions jsonb DEFAULT '{}'::jsonb NOT NULL,
    metrics jsonb DEFAULT '{}'::jsonb NOT NULL,
    "sourceWatermark" timestamp with time zone,
    "lastComputedAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "ReportRollup_grain_check" CHECK ((grain = ANY (ARRAY['CURRENT'::text, 'DAILY'::text, 'WEEKLY'::text, 'MONTHLY'::text, 'QUARTERLY'::text, 'YEARLY'::text, 'CUSTOM'::text]))),
    CONSTRAINT "ReportRollup_scopeType_check" CHECK (("scopeType" = ANY (ARRAY['ORG'::text, 'TEAM'::text, 'USER'::text, 'PARTNER'::text])))
);


--
-- Name: ReportSchedule; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ReportSchedule" (
    id text NOT NULL,
    "tenantId" text NOT NULL,
    "userId" text NOT NULL,
    "reportKey" text NOT NULL,
    "queryDefinition" jsonb,
    recipients text[] DEFAULT '{}'::text[] NOT NULL,
    format text DEFAULT 'LINK'::text NOT NULL,
    frequency text NOT NULL,
    "dayOfWeek" integer,
    "dayOfMonth" integer,
    "nextRunAt" timestamp with time zone NOT NULL,
    "lastRunAt" timestamp with time zone,
    "lastStatus" text,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "ReportSchedule_format_check" CHECK ((format = ANY (ARRAY['LINK'::text, 'CSV'::text, 'PDF'::text]))),
    CONSTRAINT "ReportSchedule_frequency_check" CHECK ((frequency = ANY (ARRAY['DAILY'::text, 'WEEKLY'::text, 'MONTHLY'::text])))
);


--
-- Name: ReportingOutbox; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ReportingOutbox" (
    id text NOT NULL,
    "tenantId" text NOT NULL,
    "eventType" text NOT NULL,
    "eventVersion" integer DEFAULT 1 NOT NULL,
    payload jsonb NOT NULL,
    "idempotencyKey" text,
    status text DEFAULT 'PENDING'::text NOT NULL,
    "retryCount" integer DEFAULT 0 NOT NULL,
    "nextRetryAt" timestamp with time zone,
    "createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "processedAt" timestamp with time zone,
    error text
);


--
-- Name: Role; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Role" (
    id text NOT NULL,
    "tenantId" text,
    name text NOT NULL,
    description text,
    permissions jsonb NOT NULL,
    "createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL,
    "permissionTemplateId" uuid
);


--
-- Name: SalesGroup; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."SalesGroup" (
    id text NOT NULL,
    "tenantId" text NOT NULL,
    name text NOT NULL,
    description text,
    "managerId" text,
    territories jsonb,
    "zipCodes" jsonb,
    states jsonb,
    countries jsonb,
    skills jsonb,
    languages jsonb,
    "productLines" jsonb,
    "maxLeadsPerMember" integer DEFAULT 50 NOT NULL,
    "workingHours" jsonb,
    timezone text DEFAULT 'UTC'::text NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL,
    "permissionTemplateId" uuid
);


--
-- Name: SalesGroupMember; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."SalesGroupMember" (
    id text NOT NULL,
    "groupId" text NOT NULL,
    "userId" text NOT NULL,
    "tenantId" text NOT NULL,
    role text DEFAULT 'MEMBER'::text NOT NULL,
    "joinedAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: ScoringFeatureSnapshot; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ScoringFeatureSnapshot" (
    id text NOT NULL,
    "tenantId" text NOT NULL,
    "modelVersionId" text,
    "recordType" text NOT NULL,
    "recordId" text NOT NULL,
    features jsonb NOT NULL,
    "sourceDataUpdatedAt" timestamp with time zone,
    "createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "ScoringFeatureSnapshot_recordType_check" CHECK (("recordType" = ANY (ARRAY['LEAD'::text, 'OPPORTUNITY'::text])))
);


--
-- Name: ScoringModel; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ScoringModel" (
    id text NOT NULL,
    "tenantId" text NOT NULL,
    name text NOT NULL,
    "targetModule" text NOT NULL,
    objective text NOT NULL,
    status text DEFAULT 'DRAFT'::text NOT NULL,
    "createdBy" text,
    "createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "ScoringModel_objective_check" CHECK ((objective = ANY (ARRAY['CONVERSION'::text, 'OPPORTUNITY_CREATED'::text, 'WIN_PROBABILITY'::text, 'STALL_RISK'::text]))),
    CONSTRAINT "ScoringModel_status_check" CHECK ((status = ANY (ARRAY['DRAFT'::text, 'ACTIVE'::text, 'ARCHIVED'::text]))),
    CONSTRAINT "ScoringModel_targetModule_check" CHECK (("targetModule" = ANY (ARRAY['LEAD'::text, 'OPPORTUNITY'::text])))
);


--
-- Name: ScoringModelVersion; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ScoringModelVersion" (
    id text NOT NULL,
    "tenantId" text NOT NULL,
    "modelId" text NOT NULL,
    "versionNumber" integer NOT NULL,
    algorithm text DEFAULT 'MVP_WEIGHTED_BUCKET_CALIBRATION'::text NOT NULL,
    status text DEFAULT 'DRAFT'::text NOT NULL,
    "featureConfig" jsonb DEFAULT '{}'::jsonb NOT NULL,
    metrics jsonb DEFAULT '{}'::jsonb NOT NULL,
    "promotedBy" text,
    "promotedAt" timestamp with time zone,
    "createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "ScoringModelVersion_status_check" CHECK ((status = ANY (ARRAY['DRAFT'::text, 'PROMOTED'::text, 'RETIRED'::text])))
);


--
-- Name: ScoringSettings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ScoringSettings" (
    id text NOT NULL,
    "tenantId" text NOT NULL,
    "isEnabled" boolean DEFAULT false NOT NULL,
    "targetModules" text[] DEFAULT ARRAY['LEAD'::text, 'OPPORTUNITY'::text] NOT NULL,
    objective text DEFAULT 'CONVERSION'::text NOT NULL,
    "minimumHistoricalRecords" integer DEFAULT 25 NOT NULL,
    "lookbackDays" integer DEFAULT 365 NOT NULL,
    "retrainCadence" text DEFAULT 'MANUAL'::text NOT NULL,
    "fallbackMode" text DEFAULT 'RULE_SCORE'::text NOT NULL,
    "promotedLeadModelVersionId" text,
    "promotedOpportunityModelVersionId" text,
    "lastRecomputedAt" timestamp with time zone,
    "updatedBy" text,
    "createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "ScoringSettings_fallbackMode_check" CHECK (("fallbackMode" = ANY (ARRAY['RULE_SCORE'::text, 'ZERO'::text, 'KEEP_EXISTING'::text]))),
    CONSTRAINT "ScoringSettings_objective_check" CHECK ((objective = ANY (ARRAY['CONVERSION'::text, 'OPPORTUNITY_CREATED'::text, 'WIN_PROBABILITY'::text, 'STALL_RISK'::text]))),
    CONSTRAINT "ScoringSettings_retrainCadence_check" CHECK (("retrainCadence" = ANY (ARRAY['MANUAL'::text, 'WEEKLY'::text, 'MONTHLY'::text])))
);


--
-- Name: ScoringTrainingRun; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ScoringTrainingRun" (
    id text NOT NULL,
    "tenantId" text NOT NULL,
    "modelId" text,
    "modelVersionId" text,
    "targetModule" text NOT NULL,
    status text DEFAULT 'PENDING'::text NOT NULL,
    "startedAt" timestamp with time zone,
    "completedAt" timestamp with time zone,
    "recordsProcessed" integer DEFAULT 0 NOT NULL,
    "recordsSkipped" integer DEFAULT 0 NOT NULL,
    metrics jsonb DEFAULT '{}'::jsonb NOT NULL,
    error text,
    "createdBy" text,
    "createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "ScoringTrainingRun_status_check" CHECK ((status = ANY (ARRAY['PENDING'::text, 'RUNNING'::text, 'COMPLETED'::text, 'FAILED'::text]))),
    CONSTRAINT "ScoringTrainingRun_targetModule_check" CHECK (("targetModule" = ANY (ARRAY['LEAD'::text, 'OPPORTUNITY'::text, 'BOTH'::text])))
);


--
-- Name: SecurityPolicy; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."SecurityPolicy" (
    id text NOT NULL,
    "tenantId" text,
    "minPasswordLength" integer DEFAULT 8 NOT NULL,
    "requireUppercase" boolean DEFAULT true NOT NULL,
    "requireLowercase" boolean DEFAULT true NOT NULL,
    "requireNumbers" boolean DEFAULT true NOT NULL,
    "requireSpecialChars" boolean DEFAULT false NOT NULL,
    "passwordExpiryDays" integer DEFAULT 90 NOT NULL,
    "preventPasswordReuse" integer DEFAULT 5 NOT NULL,
    "sessionTimeoutMinutes" integer DEFAULT 60 NOT NULL,
    "maxConcurrentSessions" integer DEFAULT 3 NOT NULL,
    "enforceSessionTimeout" boolean DEFAULT true NOT NULL,
    "maxLoginAttempts" integer DEFAULT 5 NOT NULL,
    "lockoutDurationMinutes" integer DEFAULT 30 NOT NULL,
    "enableTwoFactor" boolean DEFAULT false NOT NULL,
    "allowedIpRanges" jsonb,
    "blockedIpRanges" jsonb,
    "enforceIpRestrictions" boolean DEFAULT false NOT NULL,
    "enforceAuditLogging" boolean DEFAULT true NOT NULL,
    "logFailedLoginAttempts" boolean DEFAULT true NOT NULL,
    "requireLoginNotifications" boolean DEFAULT false NOT NULL,
    "createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL
);


--
-- Name: SenderIdentity; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."SenderIdentity" (
    id text NOT NULL,
    "tenantId" text NOT NULL,
    channel text NOT NULL,
    name text NOT NULL,
    address text NOT NULL,
    "providerConfigId" text,
    "isDefault" boolean DEFAULT false NOT NULL,
    "isVerified" boolean DEFAULT false NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    "createdBy" text,
    "createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "SenderIdentity_channel_check" CHECK ((channel = ANY (ARRAY['EMAIL'::text, 'WHATSAPP'::text, 'SMS'::text])))
);


--
-- Name: StageDefinition; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."StageDefinition" (
    id text NOT NULL,
    "tenantId" text NOT NULL,
    "opportunityTypeId" text NOT NULL,
    name text NOT NULL,
    "order" integer NOT NULL,
    probability integer DEFAULT 0 NOT NULL,
    color text,
    "slaDays" integer DEFAULT 0 NOT NULL,
    "isClosed" boolean DEFAULT false NOT NULL,
    "isWon" boolean DEFAULT false NOT NULL,
    "createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL
);


--
-- Name: Task; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Task" (
    id text NOT NULL,
    "tenantId" text NOT NULL,
    title text NOT NULL,
    description text,
    status text DEFAULT 'OPEN'::text NOT NULL,
    priority text DEFAULT 'MEDIUM'::text NOT NULL,
    "ownerId" text NOT NULL,
    "createdBy" text,
    "leadId" text,
    "opportunityId" text,
    "activityId" text,
    "dueAt" timestamp with time zone,
    "reminderAt" timestamp with time zone,
    "completedAt" timestamp with time zone,
    "completedBy" text,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    "createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "Task_priority_check" CHECK ((priority = ANY (ARRAY['LOW'::text, 'MEDIUM'::text, 'HIGH'::text, 'URGENT'::text]))),
    CONSTRAINT "Task_status_check" CHECK ((status = ANY (ARRAY['OPEN'::text, 'IN_PROGRESS'::text, 'COMPLETED'::text, 'CANCELLED'::text])))
);


--
-- Name: Team; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Team" (
    id uuid NOT NULL,
    "tenantId" text,
    name text NOT NULL,
    description text,
    "leadId" uuid,
    department text,
    "workingHours" jsonb,
    timezone text DEFAULT 'UTC'::text NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TeamMember; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."TeamMember" (
    id uuid NOT NULL,
    "tenantId" text,
    "teamId" uuid NOT NULL,
    "userId" text NOT NULL,
    role text DEFAULT 'MEMBER'::text NOT NULL,
    "joinedAt" timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TelephonyCallLog; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."TelephonyCallLog" (
    id uuid NOT NULL,
    "tenantId" text,
    provider text DEFAULT 'manual'::text NOT NULL,
    "callId" text NOT NULL,
    direction text DEFAULT 'OUTBOUND'::text NOT NULL,
    "fromNumber" text,
    "toNumber" text,
    status text DEFAULT 'completed'::text NOT NULL,
    duration integer,
    "recordingUrl" text,
    "agentId" text,
    "leadId" uuid,
    "opportunityId" uuid,
    "activityId" uuid,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    "startedAt" timestamp with time zone DEFAULT now() NOT NULL,
    "endedAt" timestamp with time zone,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: Tenant; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Tenant" (
    id text NOT NULL,
    name text NOT NULL,
    status text DEFAULT 'ACTIVE'::text NOT NULL,
    plan text DEFAULT 'BASIC'::text,
    "createdBy" text,
    "createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL
);


--
-- Name: TenantConfig; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."TenantConfig" (
    id text NOT NULL,
    "tenantId" text NOT NULL,
    "featureFlags" jsonb NOT NULL,
    "storageQuota" integer,
    "userLimit" integer,
    "suspendedAt" timestamp with time zone,
    "suspendedBy" text
);


--
-- Name: TenantFeature; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."TenantFeature" (
    id text NOT NULL,
    "tenantId" text NOT NULL,
    plan text DEFAULT 'FREE'::text NOT NULL,
    "opportunityEnabled" boolean DEFAULT true NOT NULL,
    "automationEnabled" boolean DEFAULT true NOT NULL,
    "advancedReporting" boolean DEFAULT false NOT NULL,
    "apiAccessEnabled" boolean DEFAULT false NOT NULL,
    "salesGroupsEnabled" boolean DEFAULT true NOT NULL,
    "formBuilderEnabled" boolean DEFAULT true NOT NULL,
    "maxUsers" integer DEFAULT 10 NOT NULL,
    "maxStorage" integer DEFAULT 5000 NOT NULL,
    "monthlyFee" double precision DEFAULT 0 NOT NULL,
    "billingCycle" text DEFAULT 'MONTHLY'::text NOT NULL,
    "createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL
);


--
-- Name: UserBadge; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."UserBadge" (
    id text NOT NULL,
    "tenantId" text NOT NULL,
    "userId" text NOT NULL,
    "badgeId" text NOT NULL,
    "earnedAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "sourcePeriodStart" timestamp with time zone NOT NULL,
    "sourcePeriodEnd" timestamp with time zone
);


--
-- Name: WebhookOutbox; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."WebhookOutbox" (
    id text NOT NULL,
    "tenantId" text NOT NULL,
    "eventType" text NOT NULL,
    "eventVersion" integer DEFAULT 1 NOT NULL,
    payload jsonb NOT NULL,
    "idempotencyKey" text,
    status text DEFAULT 'PENDING'::text NOT NULL,
    "retryCount" integer DEFAULT 0 NOT NULL,
    "nextRetryAt" timestamp with time zone,
    "createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "processedAt" timestamp with time zone,
    error text
);


--
-- Name: WebhookSubscription; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."WebhookSubscription" (
    id text NOT NULL,
    "tenantId" text NOT NULL,
    url text NOT NULL,
    events jsonb NOT NULL,
    secret text,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL
);


--
-- Name: ActivityReminder ActivityReminder_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ActivityReminder"
    ADD CONSTRAINT "ActivityReminder_pkey" PRIMARY KEY (id);


--
-- Name: ActivityType ActivityType_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ActivityType"
    ADD CONSTRAINT "ActivityType_pkey" PRIMARY KEY (id);


--
-- Name: Activity Activity_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Activity"
    ADD CONSTRAINT "Activity_pkey" PRIMARY KEY (id);


--
-- Name: AssignmentLog AssignmentLog_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AssignmentLog"
    ADD CONSTRAINT "AssignmentLog_pkey" PRIMARY KEY (id);


--
-- Name: AssignmentRule AssignmentRule_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AssignmentRule"
    ADD CONSTRAINT "AssignmentRule_pkey" PRIMARY KEY (id);


--
-- Name: AuditLog AuditLog_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AuditLog"
    ADD CONSTRAINT "AuditLog_pkey" PRIMARY KEY (id);


--
-- Name: AutomationExecution AutomationExecution_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AutomationExecution"
    ADD CONSTRAINT "AutomationExecution_pkey" PRIMARY KEY (id);


--
-- Name: AutomationOutbox AutomationOutbox_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AutomationOutbox"
    ADD CONSTRAINT "AutomationOutbox_pkey" PRIMARY KEY (id);


--
-- Name: AutomationQueue AutomationQueue_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AutomationQueue"
    ADD CONSTRAINT "AutomationQueue_pkey" PRIMARY KEY (id);


--
-- Name: AutomationV2 AutomationV2_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AutomationV2"
    ADD CONSTRAINT "AutomationV2_pkey" PRIMARY KEY (id);


--
-- Name: Badge Badge_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Badge"
    ADD CONSTRAINT "Badge_pkey" PRIMARY KEY (id);


--
-- Name: CalculatedFieldDefinition CalculatedFieldDefinition_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CalculatedFieldDefinition"
    ADD CONSTRAINT "CalculatedFieldDefinition_pkey" PRIMARY KEY (id);


--
-- Name: CommissionLedger CommissionLedger_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CommissionLedger"
    ADD CONSTRAINT "CommissionLedger_pkey" PRIMARY KEY (id);


--
-- Name: CommissionRule CommissionRule_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CommissionRule"
    ADD CONSTRAINT "CommissionRule_pkey" PRIMARY KEY (id);


--
-- Name: CommunicationDeliveryEvent CommunicationDeliveryEvent_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CommunicationDeliveryEvent"
    ADD CONSTRAINT "CommunicationDeliveryEvent_pkey" PRIMARY KEY (id);


--
-- Name: CommunicationOutbox CommunicationOutbox_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CommunicationOutbox"
    ADD CONSTRAINT "CommunicationOutbox_pkey" PRIMARY KEY (id);


--
-- Name: CommunicationProviderConfig CommunicationProviderConfig_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CommunicationProviderConfig"
    ADD CONSTRAINT "CommunicationProviderConfig_pkey" PRIMARY KEY (id);


--
-- Name: CommunicationProviderConfig CommunicationProviderConfig_tenantId_channel_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CommunicationProviderConfig"
    ADD CONSTRAINT "CommunicationProviderConfig_tenantId_channel_name_key" UNIQUE ("tenantId", channel, name);


--
-- Name: CommunicationTemplate CommunicationTemplate_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CommunicationTemplate"
    ADD CONSTRAINT "CommunicationTemplate_pkey" PRIMARY KEY (id);


--
-- Name: CommunicationTemplate CommunicationTemplate_tenantId_channel_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CommunicationTemplate"
    ADD CONSTRAINT "CommunicationTemplate_tenantId_channel_name_key" UNIQUE ("tenantId", channel, name);


--
-- Name: CustomFieldValue CustomFieldValue_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CustomFieldValue"
    ADD CONSTRAINT "CustomFieldValue_pkey" PRIMARY KEY ("tenantId", id);


--
-- Name: CustomReport CustomReport_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CustomReport"
    ADD CONSTRAINT "CustomReport_pkey" PRIMARY KEY (id);


--
-- Name: DailyMetric DailyMetric_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."DailyMetric"
    ADD CONSTRAINT "DailyMetric_pkey" PRIMARY KEY (id);


--
-- Name: DashboardWidget DashboardWidget_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."DashboardWidget"
    ADD CONSTRAINT "DashboardWidget_pkey" PRIMARY KEY (id);


--
-- Name: DataRetentionPolicy DataRetentionPolicy_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."DataRetentionPolicy"
    ADD CONSTRAINT "DataRetentionPolicy_pkey" PRIMARY KEY (id);


--
-- Name: DomainEventOutbox DomainEventOutbox_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."DomainEventOutbox"
    ADD CONSTRAINT "DomainEventOutbox_pkey" PRIMARY KEY (id);


--
-- Name: EmailLog EmailLog_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EmailLog"
    ADD CONSTRAINT "EmailLog_pkey" PRIMARY KEY (id);


--
-- Name: ExportRequest ExportRequest_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ExportRequest"
    ADD CONSTRAINT "ExportRequest_pkey" PRIMARY KEY (id);


--
-- Name: FieldDefinitionVersion FieldDefinitionVersion_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."FieldDefinitionVersion"
    ADD CONSTRAINT "FieldDefinitionVersion_pkey" PRIMARY KEY (id);


--
-- Name: FieldDefinition FieldDefinition_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."FieldDefinition"
    ADD CONSTRAINT "FieldDefinition_pkey" PRIMARY KEY (id);


--
-- Name: FieldDependencyRule FieldDependencyRule_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."FieldDependencyRule"
    ADD CONSTRAINT "FieldDependencyRule_pkey" PRIMARY KEY (id);


--
-- Name: FieldGroup FieldGroup_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."FieldGroup"
    ADD CONSTRAINT "FieldGroup_pkey" PRIMARY KEY (id);


--
-- Name: FieldPermissionV2 FieldPermissionV2_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."FieldPermissionV2"
    ADD CONSTRAINT "FieldPermissionV2_pkey" PRIMARY KEY (id);


--
-- Name: FieldValidationRule FieldValidationRule_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."FieldValidationRule"
    ADD CONSTRAINT "FieldValidationRule_pkey" PRIMARY KEY (id);


--
-- Name: FileObject FileObject_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."FileObject"
    ADD CONSTRAINT "FileObject_pkey" PRIMARY KEY (id);


--
-- Name: FileObject FileObject_tenantId_bucket_storageKey_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."FileObject"
    ADD CONSTRAINT "FileObject_tenantId_bucket_storageKey_key" UNIQUE ("tenantId", bucket, "storageKey");


--
-- Name: FormSubmission FormSubmission_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."FormSubmission"
    ADD CONSTRAINT "FormSubmission_pkey" PRIMARY KEY (id);


--
-- Name: Form Form_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Form"
    ADD CONSTRAINT "Form_pkey" PRIMARY KEY (id);


--
-- Name: GDPRRequest GDPRRequest_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."GDPRRequest"
    ADD CONSTRAINT "GDPRRequest_pkey" PRIMARY KEY (id);


--
-- Name: GamificationPointsLedger GamificationPointsLedger_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."GamificationPointsLedger"
    ADD CONSTRAINT "GamificationPointsLedger_pkey" PRIMARY KEY (id);


--
-- Name: GamificationRedemption GamificationRedemption_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."GamificationRedemption"
    ADD CONSTRAINT "GamificationRedemption_pkey" PRIMARY KEY (id);


--
-- Name: GamificationRule GamificationRule_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."GamificationRule"
    ADD CONSTRAINT "GamificationRule_pkey" PRIMARY KEY (id);


--
-- Name: GamificationSettings GamificationSettings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."GamificationSettings"
    ADD CONSTRAINT "GamificationSettings_pkey" PRIMARY KEY (id);


--
-- Name: GamificationSettings GamificationSettings_tenantId_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."GamificationSettings"
    ADD CONSTRAINT "GamificationSettings_tenantId_key" UNIQUE ("tenantId");


--
-- Name: ImportJob ImportJob_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ImportJob"
    ADD CONSTRAINT "ImportJob_pkey" PRIMARY KEY (id);


--
-- Name: IntegrationSetting IntegrationSetting_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."IntegrationSetting"
    ADD CONSTRAINT "IntegrationSetting_pkey" PRIMARY KEY (id);


--
-- Name: IntegrationSetting IntegrationSetting_tenantId_type_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."IntegrationSetting"
    ADD CONSTRAINT "IntegrationSetting_tenantId_type_key" UNIQUE ("tenantId", type);


--
-- Name: LayoutDefinition LayoutDefinition_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."LayoutDefinition"
    ADD CONSTRAINT "LayoutDefinition_pkey" PRIMARY KEY (id);


--
-- Name: LeadListMember LeadListMember_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."LeadListMember"
    ADD CONSTRAINT "LeadListMember_pkey" PRIMARY KEY (id);


--
-- Name: LeadListMember LeadListMember_tenantId_listId_leadId_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."LeadListMember"
    ADD CONSTRAINT "LeadListMember_tenantId_listId_leadId_key" UNIQUE ("tenantId", "listId", "leadId");


--
-- Name: LeadList LeadList_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."LeadList"
    ADD CONSTRAINT "LeadList_pkey" PRIMARY KEY (id);


--
-- Name: LeadScoringRule LeadScoringRule_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."LeadScoringRule"
    ADD CONSTRAINT "LeadScoringRule_pkey" PRIMARY KEY (id);


--
-- Name: Lead Lead_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Lead"
    ADD CONSTRAINT "Lead_pkey" PRIMARY KEY (id);


--
-- Name: Note Note_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Note"
    ADD CONSTRAINT "Note_pkey" PRIMARY KEY (id);


--
-- Name: Notification Notification_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Notification"
    ADD CONSTRAINT "Notification_pkey" PRIMARY KEY (id);


--
-- Name: ObjectDefinition ObjectDefinition_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ObjectDefinition"
    ADD CONSTRAINT "ObjectDefinition_pkey" PRIMARY KEY (id);


--
-- Name: ObjectPermission ObjectPermission_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ObjectPermission"
    ADD CONSTRAINT "ObjectPermission_pkey" PRIMARY KEY (id);


--
-- Name: ObjectRelationship ObjectRelationship_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ObjectRelationship"
    ADD CONSTRAINT "ObjectRelationship_pkey" PRIMARY KEY (id);


--
-- Name: OpportunityStageHistory OpportunityStageHistory_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."OpportunityStageHistory"
    ADD CONSTRAINT "OpportunityStageHistory_pkey" PRIMARY KEY (id);


--
-- Name: OpportunityType OpportunityType_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."OpportunityType"
    ADD CONSTRAINT "OpportunityType_pkey" PRIMARY KEY (id);


--
-- Name: Opportunity Opportunity_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Opportunity"
    ADD CONSTRAINT "Opportunity_pkey" PRIMARY KEY (id);


--
-- Name: PartnerInvoiceTemplate PartnerInvoiceTemplate_partnerId_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PartnerInvoiceTemplate"
    ADD CONSTRAINT "PartnerInvoiceTemplate_partnerId_key" UNIQUE ("partnerId");


--
-- Name: PartnerInvoiceTemplate PartnerInvoiceTemplate_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PartnerInvoiceTemplate"
    ADD CONSTRAINT "PartnerInvoiceTemplate_pkey" PRIMARY KEY (id);


--
-- Name: PartnerInvoice PartnerInvoice_payoutId_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PartnerInvoice"
    ADD CONSTRAINT "PartnerInvoice_payoutId_key" UNIQUE ("payoutId");


--
-- Name: PartnerInvoice PartnerInvoice_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PartnerInvoice"
    ADD CONSTRAINT "PartnerInvoice_pkey" PRIMARY KEY (id);


--
-- Name: PartnerInvoice PartnerInvoice_tenantId_partnerId_invoiceNumber_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PartnerInvoice"
    ADD CONSTRAINT "PartnerInvoice_tenantId_partnerId_invoiceNumber_key" UNIQUE ("tenantId", "partnerId", "invoiceNumber");


--
-- Name: PartnerOrganization PartnerOrganization_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PartnerOrganization"
    ADD CONSTRAINT "PartnerOrganization_pkey" PRIMARY KEY (id);


--
-- Name: PartnerPayoutSettings PartnerPayoutSettings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PartnerPayoutSettings"
    ADD CONSTRAINT "PartnerPayoutSettings_pkey" PRIMARY KEY (id);


--
-- Name: PartnerPayoutSettings PartnerPayoutSettings_tenantId_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PartnerPayoutSettings"
    ADD CONSTRAINT "PartnerPayoutSettings_tenantId_key" UNIQUE ("tenantId");


--
-- Name: PartnerProfile PartnerProfile_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PartnerProfile"
    ADD CONSTRAINT "PartnerProfile_pkey" PRIMARY KEY (id);


--
-- Name: PartnerProfile PartnerProfile_userId_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PartnerProfile"
    ADD CONSTRAINT "PartnerProfile_userId_key" UNIQUE ("userId");


--
-- Name: PayoutCycle PayoutCycle_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PayoutCycle"
    ADD CONSTRAINT "PayoutCycle_pkey" PRIMARY KEY (id);


--
-- Name: Payout Payout_payoutCycleId_partnerId_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Payout"
    ADD CONSTRAINT "Payout_payoutCycleId_partnerId_key" UNIQUE ("payoutCycleId", "partnerId");


--
-- Name: Payout Payout_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Payout"
    ADD CONSTRAINT "Payout_pkey" PRIMARY KEY (id);


--
-- Name: PermissionTemplate PermissionTemplate_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PermissionTemplate"
    ADD CONSTRAINT "PermissionTemplate_pkey" PRIMARY KEY (id);


--
-- Name: PlanUpgradeHistory PlanUpgradeHistory_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PlanUpgradeHistory"
    ADD CONSTRAINT "PlanUpgradeHistory_pkey" PRIMARY KEY (id);


--
-- Name: PlatformAdmin PlatformAdmin_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PlatformAdmin"
    ADD CONSTRAINT "PlatformAdmin_pkey" PRIMARY KEY (id);


--
-- Name: RecordScoreHistory RecordScoreHistory_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."RecordScoreHistory"
    ADD CONSTRAINT "RecordScoreHistory_pkey" PRIMARY KEY (id);


--
-- Name: RecordScore RecordScore_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."RecordScore"
    ADD CONSTRAINT "RecordScore_pkey" PRIMARY KEY (id);


--
-- Name: RecordScore RecordScore_tenantId_recordType_recordId_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."RecordScore"
    ADD CONSTRAINT "RecordScore_tenantId_recordType_recordId_key" UNIQUE ("tenantId", "recordType", "recordId");


--
-- Name: RecordVisibilityRule RecordVisibilityRule_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."RecordVisibilityRule"
    ADD CONSTRAINT "RecordVisibilityRule_pkey" PRIMARY KEY (id);


--
-- Name: ReportDefinition ReportDefinition_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ReportDefinition"
    ADD CONSTRAINT "ReportDefinition_pkey" PRIMARY KEY (id);


--
-- Name: ReportDefinition ReportDefinition_tenantId_reportKey_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ReportDefinition"
    ADD CONSTRAINT "ReportDefinition_tenantId_reportKey_key" UNIQUE ("tenantId", "reportKey");


--
-- Name: ReportEmailDelivery ReportEmailDelivery_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ReportEmailDelivery"
    ADD CONSTRAINT "ReportEmailDelivery_pkey" PRIMARY KEY (id);


--
-- Name: ReportRefreshJob ReportRefreshJob_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ReportRefreshJob"
    ADD CONSTRAINT "ReportRefreshJob_pkey" PRIMARY KEY (id);


--
-- Name: ReportRefreshState ReportRefreshState_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ReportRefreshState"
    ADD CONSTRAINT "ReportRefreshState_pkey" PRIMARY KEY (id);


--
-- Name: ReportRefreshState ReportRefreshState_tenantId_reportKey_scopeType_scopeId_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ReportRefreshState"
    ADD CONSTRAINT "ReportRefreshState_tenantId_reportKey_scopeType_scopeId_key" UNIQUE ("tenantId", "reportKey", "scopeType", "scopeId");


--
-- Name: ReportRollup ReportRollup_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ReportRollup"
    ADD CONSTRAINT "ReportRollup_pkey" PRIMARY KEY (id);


--
-- Name: ReportSchedule ReportSchedule_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ReportSchedule"
    ADD CONSTRAINT "ReportSchedule_pkey" PRIMARY KEY (id);


--
-- Name: ReportingOutbox ReportingOutbox_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ReportingOutbox"
    ADD CONSTRAINT "ReportingOutbox_pkey" PRIMARY KEY (id);


--
-- Name: Role Role_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Role"
    ADD CONSTRAINT "Role_pkey" PRIMARY KEY (id);


--
-- Name: SalesGroupMember SalesGroupMember_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SalesGroupMember"
    ADD CONSTRAINT "SalesGroupMember_pkey" PRIMARY KEY (id);


--
-- Name: SalesGroup SalesGroup_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SalesGroup"
    ADD CONSTRAINT "SalesGroup_pkey" PRIMARY KEY (id);


--
-- Name: ScoringFeatureSnapshot ScoringFeatureSnapshot_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ScoringFeatureSnapshot"
    ADD CONSTRAINT "ScoringFeatureSnapshot_pkey" PRIMARY KEY (id);


--
-- Name: ScoringModelVersion ScoringModelVersion_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ScoringModelVersion"
    ADD CONSTRAINT "ScoringModelVersion_pkey" PRIMARY KEY (id);


--
-- Name: ScoringModelVersion ScoringModelVersion_tenantId_modelId_versionNumber_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ScoringModelVersion"
    ADD CONSTRAINT "ScoringModelVersion_tenantId_modelId_versionNumber_key" UNIQUE ("tenantId", "modelId", "versionNumber");


--
-- Name: ScoringModel ScoringModel_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ScoringModel"
    ADD CONSTRAINT "ScoringModel_pkey" PRIMARY KEY (id);


--
-- Name: ScoringSettings ScoringSettings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ScoringSettings"
    ADD CONSTRAINT "ScoringSettings_pkey" PRIMARY KEY (id);


--
-- Name: ScoringSettings ScoringSettings_tenantId_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ScoringSettings"
    ADD CONSTRAINT "ScoringSettings_tenantId_key" UNIQUE ("tenantId");


--
-- Name: ScoringTrainingRun ScoringTrainingRun_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ScoringTrainingRun"
    ADD CONSTRAINT "ScoringTrainingRun_pkey" PRIMARY KEY (id);


--
-- Name: SearchOutbox SearchOutbox_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SearchOutbox"
    ADD CONSTRAINT "SearchOutbox_pkey" PRIMARY KEY (id);


--
-- Name: SecurityPolicy SecurityPolicy_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SecurityPolicy"
    ADD CONSTRAINT "SecurityPolicy_pkey" PRIMARY KEY (id);


--
-- Name: SenderIdentity SenderIdentity_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SenderIdentity"
    ADD CONSTRAINT "SenderIdentity_pkey" PRIMARY KEY (id);


--
-- Name: StageDefinition StageDefinition_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."StageDefinition"
    ADD CONSTRAINT "StageDefinition_pkey" PRIMARY KEY (id);


--
-- Name: Task Task_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Task"
    ADD CONSTRAINT "Task_pkey" PRIMARY KEY (id);


--
-- Name: TeamMember TeamMember_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."TeamMember"
    ADD CONSTRAINT "TeamMember_pkey" PRIMARY KEY (id);


--
-- Name: TeamMember TeamMember_tenantId_teamId_userId_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."TeamMember"
    ADD CONSTRAINT "TeamMember_tenantId_teamId_userId_key" UNIQUE ("tenantId", "teamId", "userId");


--
-- Name: Team Team_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Team"
    ADD CONSTRAINT "Team_pkey" PRIMARY KEY (id);


--
-- Name: TelephonyCallLog TelephonyCallLog_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."TelephonyCallLog"
    ADD CONSTRAINT "TelephonyCallLog_pkey" PRIMARY KEY (id);


--
-- Name: TenantConfig TenantConfig_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."TenantConfig"
    ADD CONSTRAINT "TenantConfig_pkey" PRIMARY KEY (id);


--
-- Name: TenantFeature TenantFeature_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."TenantFeature"
    ADD CONSTRAINT "TenantFeature_pkey" PRIMARY KEY (id);


--
-- Name: Tenant Tenant_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Tenant"
    ADD CONSTRAINT "Tenant_pkey" PRIMARY KEY (id);


--
-- Name: UserBadge UserBadge_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."UserBadge"
    ADD CONSTRAINT "UserBadge_pkey" PRIMARY KEY (id);


--
-- Name: UserBadge UserBadge_tenantId_userId_badgeId_sourcePeriodStart_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."UserBadge"
    ADD CONSTRAINT "UserBadge_tenantId_userId_badgeId_sourcePeriodStart_key" UNIQUE ("tenantId", "userId", "badgeId", "sourcePeriodStart");


--
-- Name: User User_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."User"
    ADD CONSTRAINT "User_pkey" PRIMARY KEY (id);


--
-- Name: WebhookOutbox WebhookOutbox_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."WebhookOutbox"
    ADD CONSTRAINT "WebhookOutbox_pkey" PRIMARY KEY (id);


--
-- Name: WebhookSubscription WebhookSubscription_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."WebhookSubscription"
    ADD CONSTRAINT "WebhookSubscription_pkey" PRIMARY KEY (id);


--
-- Name: ActivityReminder_activityId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ActivityReminder_activityId_idx" ON public."ActivityReminder" USING btree ("activityId");


--
-- Name: ActivityReminder_tenantId_status_remindAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ActivityReminder_tenantId_status_remindAt_idx" ON public."ActivityReminder" USING btree ("tenantId", status, "remindAt");


--
-- Name: ActivityType_tenantId_name_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "ActivityType_tenantId_name_key" ON public."ActivityType" USING btree ("tenantId", name);


--
-- Name: Activity_deletedAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Activity_deletedAt_idx" ON public."Activity" USING btree ("deletedAt");


--
-- Name: Activity_tenantId_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Activity_tenantId_createdAt_idx" ON public."Activity" USING btree ("tenantId", "createdAt");


--
-- Name: Activity_tenantId_createdBy_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Activity_tenantId_createdBy_idx" ON public."Activity" USING btree ("tenantId", "createdBy");


--
-- Name: Activity_tenantId_leadId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Activity_tenantId_leadId_idx" ON public."Activity" USING btree ("tenantId", "leadId");


--
-- Name: Activity_tenantId_opportunityId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Activity_tenantId_opportunityId_idx" ON public."Activity" USING btree ("tenantId", "opportunityId");


--
-- Name: Activity_tenantId_typeId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Activity_tenantId_typeId_idx" ON public."Activity" USING btree ("tenantId", "typeId");


--
-- Name: AssignmentLog_tenantId_assignedToId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "AssignmentLog_tenantId_assignedToId_idx" ON public."AssignmentLog" USING btree ("tenantId", "assignedToId");


--
-- Name: AssignmentLog_tenantId_entityId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "AssignmentLog_tenantId_entityId_idx" ON public."AssignmentLog" USING btree ("tenantId", "entityId");


--
-- Name: AssignmentRule_tenantId_isActive_priority_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "AssignmentRule_tenantId_isActive_priority_idx" ON public."AssignmentRule" USING btree ("tenantId", "isActive", priority);


--
-- Name: AuditLog_tenantId_action_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "AuditLog_tenantId_action_idx" ON public."AuditLog" USING btree ("tenantId", action);


--
-- Name: AuditLog_tenantId_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "AuditLog_tenantId_createdAt_idx" ON public."AuditLog" USING btree ("tenantId", "createdAt" DESC);


--
-- Name: AuditLog_tenantId_entityType_entityId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "AuditLog_tenantId_entityType_entityId_idx" ON public."AuditLog" USING btree ("tenantId", "entityType", "entityId");


--
-- Name: AutomationExecution_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "AutomationExecution_status_idx" ON public."AutomationExecution" USING btree (status);


--
-- Name: AutomationExecution_tenantId_automationId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "AutomationExecution_tenantId_automationId_idx" ON public."AutomationExecution" USING btree ("tenantId", "automationId");


--
-- Name: AutomationOutbox_tenantId_idempotencyKey_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "AutomationOutbox_tenantId_idempotencyKey_key" ON public."AutomationOutbox" USING btree ("tenantId", "idempotencyKey");


--
-- Name: AutomationOutbox_tenantId_status_nextRetryAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "AutomationOutbox_tenantId_status_nextRetryAt_idx" ON public."AutomationOutbox" USING btree ("tenantId", status, "nextRetryAt");


--
-- Name: AutomationQueue_tenant_status_runAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "AutomationQueue_tenant_status_runAt_idx" ON public."AutomationQueue" USING btree ("tenantId", status, "runAt");


--
-- Name: AutomationV2_tenantId_isActive_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "AutomationV2_tenantId_isActive_idx" ON public."AutomationV2" USING btree ("tenantId", "isActive");


--
-- Name: Badge_tenantId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Badge_tenantId_idx" ON public."Badge" USING btree ("tenantId");


--
-- Name: CalculatedFieldDefinition_fieldDefinitionId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "CalculatedFieldDefinition_fieldDefinitionId_key" ON public."CalculatedFieldDefinition" USING btree ("fieldDefinitionId");


--
-- Name: CommissionLedger_opportunityId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "CommissionLedger_opportunityId_idx" ON public."CommissionLedger" USING btree ("opportunityId");


--
-- Name: CommissionLedger_partnerId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "CommissionLedger_partnerId_idx" ON public."CommissionLedger" USING btree ("tenantId", "partnerId");


--
-- Name: CommissionLedger_partner_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "CommissionLedger_partner_createdAt_idx" ON public."CommissionLedger" USING btree ("tenantId", "partnerId", "createdAt");


--
-- Name: CommissionLedger_tenantId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "CommissionLedger_tenantId_idx" ON public."CommissionLedger" USING btree ("tenantId");


--
-- Name: CommissionRule_tenantId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "CommissionRule_tenantId_idx" ON public."CommissionRule" USING btree ("tenantId");


--
-- Name: CommissionRule_tenantId_priority_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "CommissionRule_tenantId_priority_idx" ON public."CommissionRule" USING btree ("tenantId", priority DESC);


--
-- Name: CommunicationDeliveryEvent_entity_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "CommunicationDeliveryEvent_entity_idx" ON public."CommunicationDeliveryEvent" USING btree ("tenantId", "entityType", "entityId", "occurredAt" DESC);


--
-- Name: CommunicationOutbox_due_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "CommunicationOutbox_due_idx" ON public."CommunicationOutbox" USING btree ("tenantId", status, "nextAttemptAt");


--
-- Name: CommunicationOutbox_entity_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "CommunicationOutbox_entity_idx" ON public."CommunicationOutbox" USING btree ("tenantId", "entityType", "entityId", "createdAt" DESC);


--
-- Name: CommunicationProvider_tenant_channel_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "CommunicationProvider_tenant_channel_idx" ON public."CommunicationProviderConfig" USING btree ("tenantId", channel, "isActive");


--
-- Name: CustomFieldValue_tenantId_objectType_fieldDefinitionId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "CustomFieldValue_tenantId_objectType_fieldDefinitionId_idx" ON public."CustomFieldValue" USING btree ("tenantId", "objectType", "fieldDefinitionId");


--
-- Name: CustomFieldValue_tenantId_recordId_fieldDefinitionId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "CustomFieldValue_tenantId_recordId_fieldDefinitionId_key" ON public."CustomFieldValue" USING btree ("tenantId", "recordId", "fieldDefinitionId");


--
-- Name: CustomFieldValue_tenantId_recordId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "CustomFieldValue_tenantId_recordId_idx" ON public."CustomFieldValue" USING btree ("tenantId", "recordId");


--
-- Name: CustomFieldValue_tenantId_valueBoolean_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "CustomFieldValue_tenantId_valueBoolean_idx" ON public."CustomFieldValue" USING btree ("tenantId", "valueBoolean");


--
-- Name: CustomFieldValue_tenantId_valueDate_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "CustomFieldValue_tenantId_valueDate_idx" ON public."CustomFieldValue" USING btree ("tenantId", "valueDate");


--
-- Name: CustomFieldValue_tenantId_valueNumber_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "CustomFieldValue_tenantId_valueNumber_idx" ON public."CustomFieldValue" USING btree ("tenantId", "valueNumber");


--
-- Name: CustomFieldValue_tenantId_valueString_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "CustomFieldValue_tenantId_valueString_idx" ON public."CustomFieldValue" USING btree ("tenantId", "valueString");


--
-- Name: CustomReport_tenantId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "CustomReport_tenantId_idx" ON public."CustomReport" USING btree ("tenantId");


--
-- Name: DailyMetric_tenantId_date_metric_dimensions_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "DailyMetric_tenantId_date_metric_dimensions_key" ON public."DailyMetric" USING btree ("tenantId", date, metric, dimensions);


--
-- Name: DailyMetric_tenantId_metric_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "DailyMetric_tenantId_metric_date_idx" ON public."DailyMetric" USING btree ("tenantId", metric, date);


--
-- Name: DashboardWidget_tenantId_userId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "DashboardWidget_tenantId_userId_idx" ON public."DashboardWidget" USING btree ("tenantId", "userId");


--
-- Name: DataRetentionPolicy_tenantId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "DataRetentionPolicy_tenantId_key" ON public."DataRetentionPolicy" USING btree ("tenantId");


--
-- Name: DomainEventOutbox_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "DomainEventOutbox_createdAt_idx" ON public."DomainEventOutbox" USING btree ("createdAt");


--
-- Name: DomainEventOutbox_tenantId_idempotencyKey_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "DomainEventOutbox_tenantId_idempotencyKey_key" ON public."DomainEventOutbox" USING btree ("tenantId", "idempotencyKey");


--
-- Name: DomainEventOutbox_tenantId_status_nextRetryAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "DomainEventOutbox_tenantId_status_nextRetryAt_idx" ON public."DomainEventOutbox" USING btree ("tenantId", status, "nextRetryAt");


--
-- Name: EmailLog_tenantId_entityType_entityId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "EmailLog_tenantId_entityType_entityId_idx" ON public."EmailLog" USING btree ("tenantId", "entityType", "entityId");


--
-- Name: EmailLog_tenantId_fromEmail_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "EmailLog_tenantId_fromEmail_idx" ON public."EmailLog" USING btree ("tenantId", "fromEmail");


--
-- Name: EmailLog_tenantId_threadId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "EmailLog_tenantId_threadId_idx" ON public."EmailLog" USING btree ("tenantId", "threadId");


--
-- Name: ExportRequest_tenant_module_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ExportRequest_tenant_module_idx" ON public."ExportRequest" USING btree ("tenantId", "moduleName", "queuedAt" DESC);


--
-- Name: ExportRequest_user_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ExportRequest_user_status_idx" ON public."ExportRequest" USING btree ("tenantId", "userId", status, "queuedAt" DESC);


--
-- Name: FieldDefinitionVersion_fieldDefinitionId_version_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "FieldDefinitionVersion_fieldDefinitionId_version_idx" ON public."FieldDefinitionVersion" USING btree ("fieldDefinitionId", version);


--
-- Name: FieldDefinitionVersion_tenantId_fieldDefinitionId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "FieldDefinitionVersion_tenantId_fieldDefinitionId_idx" ON public."FieldDefinitionVersion" USING btree ("tenantId", "fieldDefinitionId");


--
-- Name: FieldDefinition_tenantId_entityType_entityTypeId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "FieldDefinition_tenantId_entityType_entityTypeId_idx" ON public."FieldDefinition" USING btree ("tenantId", "entityType", "entityTypeId");


--
-- Name: FieldDefinition_tenantId_objectId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "FieldDefinition_tenantId_objectId_idx" ON public."FieldDefinition" USING btree ("tenantId", "objectId");


--
-- Name: FieldDefinition_tenantId_objectId_key_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "FieldDefinition_tenantId_objectId_key_key" ON public."FieldDefinition" USING btree ("tenantId", "objectId", key);


--
-- Name: FieldGroup_tenantId_objectId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "FieldGroup_tenantId_objectId_idx" ON public."FieldGroup" USING btree ("tenantId", "objectId");


--
-- Name: FieldPermissionV2_roleId_fieldId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "FieldPermissionV2_roleId_fieldId_key" ON public."FieldPermissionV2" USING btree ("roleId", "fieldId");


--
-- Name: FileObject_tenant_bucket_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "FileObject_tenant_bucket_idx" ON public."FileObject" USING btree ("tenantId", bucket, "createdAt" DESC);


--
-- Name: FileObject_tenant_entity_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "FileObject_tenant_entity_idx" ON public."FileObject" USING btree ("tenantId", "entityType", "entityId", "createdAt" DESC);


--
-- Name: FormSubmission_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "FormSubmission_createdAt_idx" ON public."FormSubmission" USING btree ("createdAt");


--
-- Name: FormSubmission_formId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "FormSubmission_formId_idx" ON public."FormSubmission" USING btree ("formId");


--
-- Name: FormSubmission_leadId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "FormSubmission_leadId_idx" ON public."FormSubmission" USING btree ("leadId");


--
-- Name: FormSubmission_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "FormSubmission_status_idx" ON public."FormSubmission" USING btree (status);


--
-- Name: FormSubmission_tenantId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "FormSubmission_tenantId_idx" ON public."FormSubmission" USING btree ("tenantId");


--
-- Name: Form_deletedAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Form_deletedAt_idx" ON public."Form" USING btree ("deletedAt");


--
-- Name: Form_tenantId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Form_tenantId_idx" ON public."Form" USING btree ("tenantId");


--
-- Name: GamificationPointsLedger_tenantId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "GamificationPointsLedger_tenantId_idx" ON public."GamificationPointsLedger" USING btree ("tenantId");


--
-- Name: GamificationPointsLedger_userId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "GamificationPointsLedger_userId_idx" ON public."GamificationPointsLedger" USING btree ("tenantId", "userId");


--
-- Name: GamificationRedemption_tenant_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "GamificationRedemption_tenant_status_idx" ON public."GamificationRedemption" USING btree ("tenantId", status, "createdAt" DESC);


--
-- Name: GamificationRedemption_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "GamificationRedemption_user_idx" ON public."GamificationRedemption" USING btree ("tenantId", "userId", "createdAt" DESC);


--
-- Name: GamificationRule_tenantId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "GamificationRule_tenantId_idx" ON public."GamificationRule" USING btree ("tenantId", "triggerEventType");


--
-- Name: ImportJob_tenant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ImportJob_tenant_idx" ON public."ImportJob" USING btree ("tenantId");


--
-- Name: IntegrationSetting_tenant_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IntegrationSetting_tenant_type_idx" ON public."IntegrationSetting" USING btree ("tenantId", type);


--
-- Name: LeadListMember_lead_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "LeadListMember_lead_idx" ON public."LeadListMember" USING btree ("leadId");


--
-- Name: LeadListMember_list_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "LeadListMember_list_idx" ON public."LeadListMember" USING btree ("listId");


--
-- Name: LeadList_tenant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "LeadList_tenant_idx" ON public."LeadList" USING btree ("tenantId");


--
-- Name: LeadScoringRule_tenantId_isActive_order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "LeadScoringRule_tenantId_isActive_order_idx" ON public."LeadScoringRule" USING btree ("tenantId", "isActive", "order");


--
-- Name: Lead_deletedAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Lead_deletedAt_idx" ON public."Lead" USING btree ("deletedAt");


--
-- Name: Lead_tenantId_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Lead_tenantId_createdAt_idx" ON public."Lead" USING btree ("tenantId", "createdAt");


--
-- Name: Lead_tenantId_email_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Lead_tenantId_email_idx" ON public."Lead" USING btree ("tenantId", email);


--
-- Name: Lead_tenantId_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Lead_tenantId_id_idx" ON public."Lead" USING btree ("tenantId", id);


--
-- Name: Lead_tenantId_phone_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Lead_tenantId_phone_idx" ON public."Lead" USING btree ("tenantId", phone);


--
-- Name: Lead_tenantId_score_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Lead_tenantId_score_idx" ON public."Lead" USING btree ("tenantId", score DESC);


--
-- Name: Lead_tenantId_status_ownerId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Lead_tenantId_status_ownerId_idx" ON public."Lead" USING btree ("tenantId", status, "ownerId");


--
-- Name: Note_entityType_entityId_isPinned_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Note_entityType_entityId_isPinned_idx" ON public."Note" USING btree ("entityType", "entityId", "isPinned");


--
-- Name: Note_tenantId_authorId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Note_tenantId_authorId_idx" ON public."Note" USING btree ("tenantId", "authorId");


--
-- Name: Note_tenantId_entityType_entityId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Note_tenantId_entityType_entityId_idx" ON public."Note" USING btree ("tenantId", "entityType", "entityId");


--
-- Name: Notification_user_unread_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Notification_user_unread_createdAt_idx" ON public."Notification" USING btree ("userId", "isRead", "createdAt" DESC);


--
-- Name: ObjectDefinition_tenantId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ObjectDefinition_tenantId_idx" ON public."ObjectDefinition" USING btree ("tenantId");


--
-- Name: ObjectDefinition_tenantId_name_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "ObjectDefinition_tenantId_name_key" ON public."ObjectDefinition" USING btree ("tenantId", name);


--
-- Name: ObjectPermission_roleId_objectId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "ObjectPermission_roleId_objectId_key" ON public."ObjectPermission" USING btree ("roleId", "objectId");


--
-- Name: OpportunityStageHistory_tenantId_opportunityId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "OpportunityStageHistory_tenantId_opportunityId_idx" ON public."OpportunityStageHistory" USING btree ("tenantId", "opportunityId");


--
-- Name: OpportunityType_tenantId_isActive_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "OpportunityType_tenantId_isActive_idx" ON public."OpportunityType" USING btree ("tenantId", "isActive");


--
-- Name: OpportunityType_tenantId_name_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "OpportunityType_tenantId_name_key" ON public."OpportunityType" USING btree ("tenantId", name);


--
-- Name: Opportunity_deletedAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Opportunity_deletedAt_idx" ON public."Opportunity" USING btree ("deletedAt");


--
-- Name: Opportunity_tenantId_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Opportunity_tenantId_id_idx" ON public."Opportunity" USING btree ("tenantId", id);


--
-- Name: Opportunity_tenantId_opportunityTypeId_stageId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Opportunity_tenantId_opportunityTypeId_stageId_idx" ON public."Opportunity" USING btree ("tenantId", "opportunityTypeId", "stageId");


--
-- Name: Opportunity_tenantId_ownerId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Opportunity_tenantId_ownerId_idx" ON public."Opportunity" USING btree ("tenantId", "ownerId");


--
-- Name: PartnerInvoice_partnerId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "PartnerInvoice_partnerId_idx" ON public."PartnerInvoice" USING btree ("tenantId", "partnerId");


--
-- Name: PartnerInvoice_tenantId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "PartnerInvoice_tenantId_idx" ON public."PartnerInvoice" USING btree ("tenantId");


--
-- Name: PartnerOrganization_parent_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "PartnerOrganization_parent_idx" ON public."PartnerOrganization" USING btree ("tenantId", "parentOrganizationId");


--
-- Name: PartnerOrganization_tenant_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "PartnerOrganization_tenant_status_idx" ON public."PartnerOrganization" USING btree ("tenantId", status);


--
-- Name: PartnerProfile_org_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "PartnerProfile_org_idx" ON public."PartnerProfile" USING btree ("tenantId", "partnerOrganizationId");


--
-- Name: PartnerProfile_parent_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "PartnerProfile_parent_idx" ON public."PartnerProfile" USING btree ("tenantId", "parentPartnerProfileId");


--
-- Name: PartnerProfile_tenantId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "PartnerProfile_tenantId_idx" ON public."PartnerProfile" USING btree ("tenantId");


--
-- Name: PayoutCycle_tenantId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "PayoutCycle_tenantId_idx" ON public."PayoutCycle" USING btree ("tenantId", "startDate" DESC);


--
-- Name: Payout_hold_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Payout_hold_idx" ON public."Payout" USING btree ("tenantId", "isHeld", status);


--
-- Name: Payout_partnerId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Payout_partnerId_idx" ON public."Payout" USING btree ("tenantId", "partnerId");


--
-- Name: Payout_partner_org_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Payout_partner_org_idx" ON public."Payout" USING btree ("tenantId", "partnerOrganizationId", "payoutCycleId");


--
-- Name: Payout_tenantId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Payout_tenantId_idx" ON public."Payout" USING btree ("tenantId");


--
-- Name: PermissionTemplate_tenant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "PermissionTemplate_tenant_idx" ON public."PermissionTemplate" USING btree ("tenantId");


--
-- Name: PlanUpgradeHistory_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "PlanUpgradeHistory_createdAt_idx" ON public."PlanUpgradeHistory" USING btree ("createdAt");


--
-- Name: PlanUpgradeHistory_tenantId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "PlanUpgradeHistory_tenantId_idx" ON public."PlanUpgradeHistory" USING btree ("tenantId");


--
-- Name: PlatformAdmin_isActive_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "PlatformAdmin_isActive_idx" ON public."PlatformAdmin" USING btree ("isActive");


--
-- Name: PlatformAdmin_userId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "PlatformAdmin_userId_key" ON public."PlatformAdmin" USING btree ("userId");


--
-- Name: RecordScoreHistory_record_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "RecordScoreHistory_record_idx" ON public."RecordScoreHistory" USING btree ("tenantId", "recordType", "recordId", "createdAt" DESC);


--
-- Name: RecordScore_tenant_band_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "RecordScore_tenant_band_idx" ON public."RecordScore" USING btree ("tenantId", "recordType", "scoreBand", confidence);


--
-- Name: ReportDefinition_global_reportKey_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "ReportDefinition_global_reportKey_idx" ON public."ReportDefinition" USING btree ("reportKey") WHERE ("tenantId" IS NULL);


--
-- Name: ReportDefinition_tenantId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ReportDefinition_tenantId_idx" ON public."ReportDefinition" USING btree ("tenantId", category, "isActive");


--
-- Name: ReportEmailDelivery_pending_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ReportEmailDelivery_pending_idx" ON public."ReportEmailDelivery" USING btree ("tenantId", status, "createdAt");


--
-- Name: ReportEmailDelivery_schedule_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ReportEmailDelivery_schedule_idx" ON public."ReportEmailDelivery" USING btree ("tenantId", "scheduleId", "createdAt" DESC);


--
-- Name: ReportRefreshJob_queue_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ReportRefreshJob_queue_idx" ON public."ReportRefreshJob" USING btree ("tenantId", status, "createdAt");


--
-- Name: ReportRefreshJob_report_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ReportRefreshJob_report_idx" ON public."ReportRefreshJob" USING btree ("tenantId", "reportKey", "scopeType", "scopeId", "createdAt" DESC);


--
-- Name: ReportRefreshState_due_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ReportRefreshState_due_idx" ON public."ReportRefreshState" USING btree ("tenantId", status, "lastSuccessfulAt");


--
-- Name: ReportRefreshState_null_scope_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "ReportRefreshState_null_scope_idx" ON public."ReportRefreshState" USING btree ("tenantId", "reportKey", "scopeType") WHERE ("scopeId" IS NULL);


--
-- Name: ReportRollup_dimensions_gin_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ReportRollup_dimensions_gin_idx" ON public."ReportRollup" USING gin (dimensions);


--
-- Name: ReportRollup_freshness_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ReportRollup_freshness_idx" ON public."ReportRollup" USING btree ("tenantId", "reportKey", "lastComputedAt" DESC);


--
-- Name: ReportRollup_lookup_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ReportRollup_lookup_idx" ON public."ReportRollup" USING btree ("tenantId", "reportKey", "scopeType", "scopeId", "periodStart", "periodEnd");


--
-- Name: ReportSchedule_due_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ReportSchedule_due_idx" ON public."ReportSchedule" USING btree ("tenantId", "isActive", "nextRunAt");


--
-- Name: ReportSchedule_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ReportSchedule_user_idx" ON public."ReportSchedule" USING btree ("tenantId", "userId");


--
-- Name: ReportingOutbox_tenantId_idempotencyKey_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "ReportingOutbox_tenantId_idempotencyKey_key" ON public."ReportingOutbox" USING btree ("tenantId", "idempotencyKey");


--
-- Name: ReportingOutbox_tenantId_status_nextRetryAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ReportingOutbox_tenantId_status_nextRetryAt_idx" ON public."ReportingOutbox" USING btree ("tenantId", status, "nextRetryAt");


--
-- Name: Role_permission_template_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Role_permission_template_idx" ON public."Role" USING btree ("permissionTemplateId");


--
-- Name: Role_tenantId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Role_tenantId_idx" ON public."Role" USING btree ("tenantId");


--
-- Name: Role_tenantId_name_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Role_tenantId_name_key" ON public."Role" USING btree ("tenantId", name);


--
-- Name: SalesGroupMember_groupId_userId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "SalesGroupMember_groupId_userId_key" ON public."SalesGroupMember" USING btree ("groupId", "userId");


--
-- Name: SalesGroup_isActive_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "SalesGroup_isActive_idx" ON public."SalesGroup" USING btree ("isActive");


--
-- Name: SalesGroup_managerId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "SalesGroup_managerId_idx" ON public."SalesGroup" USING btree ("managerId");


--
-- Name: SalesGroup_permission_template_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "SalesGroup_permission_template_idx" ON public."SalesGroup" USING btree ("permissionTemplateId");


--
-- Name: SalesGroup_tenantId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "SalesGroup_tenantId_idx" ON public."SalesGroup" USING btree ("tenantId");


--
-- Name: ScoringFeatureSnapshot_record_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ScoringFeatureSnapshot_record_idx" ON public."ScoringFeatureSnapshot" USING btree ("tenantId", "recordType", "recordId", "createdAt" DESC);


--
-- Name: ScoringModelVersion_model_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ScoringModelVersion_model_idx" ON public."ScoringModelVersion" USING btree ("tenantId", "modelId", status);


--
-- Name: ScoringModel_tenant_target_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ScoringModel_tenant_target_idx" ON public."ScoringModel" USING btree ("tenantId", "targetModule", status);


--
-- Name: ScoringTrainingRun_tenant_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ScoringTrainingRun_tenant_created_idx" ON public."ScoringTrainingRun" USING btree ("tenantId", "createdAt" DESC);


--
-- Name: SearchOutbox_tenantId_idempotencyKey_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "SearchOutbox_tenantId_idempotencyKey_key" ON public."SearchOutbox" USING btree ("tenantId", "idempotencyKey");


--
-- Name: SearchOutbox_tenantId_status_nextRetryAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "SearchOutbox_tenantId_status_nextRetryAt_idx" ON public."SearchOutbox" USING btree ("tenantId", status, "nextRetryAt");


--
-- Name: SecurityPolicy_tenantId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "SecurityPolicy_tenantId_key" ON public."SecurityPolicy" USING btree ("tenantId");


--
-- Name: SenderIdentity_tenant_channel_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "SenderIdentity_tenant_channel_idx" ON public."SenderIdentity" USING btree ("tenantId", channel, "isDefault");


--
-- Name: StageDefinition_opportunityTypeId_name_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "StageDefinition_opportunityTypeId_name_key" ON public."StageDefinition" USING btree ("opportunityTypeId", name);


--
-- Name: StageDefinition_opportunityTypeId_order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "StageDefinition_opportunityTypeId_order_idx" ON public."StageDefinition" USING btree ("opportunityTypeId", "order");


--
-- Name: Task_activity_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Task_activity_idx" ON public."Task" USING btree ("tenantId", "activityId", "createdAt" DESC);


--
-- Name: Task_lead_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Task_lead_idx" ON public."Task" USING btree ("tenantId", "leadId", "createdAt" DESC);


--
-- Name: Task_opportunity_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Task_opportunity_idx" ON public."Task" USING btree ("tenantId", "opportunityId", "createdAt" DESC);


--
-- Name: Task_owner_due_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Task_owner_due_idx" ON public."Task" USING btree ("tenantId", "ownerId", "dueAt");


--
-- Name: Task_reminder_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Task_reminder_idx" ON public."Task" USING btree ("tenantId", status, "reminderAt");


--
-- Name: Task_tenant_status_due_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Task_tenant_status_due_idx" ON public."Task" USING btree ("tenantId", status, "dueAt");


--
-- Name: TeamMember_team_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "TeamMember_team_idx" ON public."TeamMember" USING btree ("teamId");


--
-- Name: TeamMember_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "TeamMember_user_idx" ON public."TeamMember" USING btree ("userId");


--
-- Name: Team_tenant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Team_tenant_idx" ON public."Team" USING btree ("tenantId");


--
-- Name: TelephonyCallLog_call_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "TelephonyCallLog_call_idx" ON public."TelephonyCallLog" USING btree ("callId");


--
-- Name: TelephonyCallLog_lead_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "TelephonyCallLog_lead_idx" ON public."TelephonyCallLog" USING btree ("leadId");


--
-- Name: TelephonyCallLog_opportunity_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "TelephonyCallLog_opportunity_idx" ON public."TelephonyCallLog" USING btree ("opportunityId");


--
-- Name: TelephonyCallLog_tenant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "TelephonyCallLog_tenant_idx" ON public."TelephonyCallLog" USING btree ("tenantId");


--
-- Name: TenantConfig_tenantId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "TenantConfig_tenantId_idx" ON public."TenantConfig" USING btree ("tenantId");


--
-- Name: TenantConfig_tenantId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "TenantConfig_tenantId_key" ON public."TenantConfig" USING btree ("tenantId");


--
-- Name: TenantFeature_tenantId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "TenantFeature_tenantId_key" ON public."TenantFeature" USING btree ("tenantId");


--
-- Name: UserBadge_userId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "UserBadge_userId_idx" ON public."UserBadge" USING btree ("tenantId", "userId");


--
-- Name: User_deletedAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "User_deletedAt_idx" ON public."User" USING btree ("deletedAt");


--
-- Name: User_email_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "User_email_idx" ON public."User" USING btree (email);


--
-- Name: User_email_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "User_email_key" ON public."User" USING btree (email);


--
-- Name: User_permission_template_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "User_permission_template_idx" ON public."User" USING btree ("permissionTemplateId");


--
-- Name: User_team_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "User_team_idx" ON public."User" USING btree ("teamId");


--
-- Name: User_tenantId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "User_tenantId_idx" ON public."User" USING btree ("tenantId");


--
-- Name: User_tenantId_roleId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "User_tenantId_roleId_idx" ON public."User" USING btree ("tenantId", "roleId");


--
-- Name: User_tenantId_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "User_tenantId_status_idx" ON public."User" USING btree ("tenantId", status);


--
-- Name: WebhookOutbox_tenantId_idempotencyKey_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "WebhookOutbox_tenantId_idempotencyKey_key" ON public."WebhookOutbox" USING btree ("tenantId", "idempotencyKey");


--
-- Name: WebhookOutbox_tenantId_status_nextRetryAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "WebhookOutbox_tenantId_status_nextRetryAt_idx" ON public."WebhookOutbox" USING btree ("tenantId", status, "nextRetryAt");


--
-- Name: WebhookSubscription_tenant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "WebhookSubscription_tenant_idx" ON public."WebhookSubscription" USING btree ("tenantId");


--
-- Name: Notification Notification_insert_notify; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "Notification_insert_notify" AFTER INSERT ON public."Notification" FOR EACH ROW EXECUTE FUNCTION public.notify_crm_notification_insert();


--
-- Name: CommissionLedger commission_ledger_no_update; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER commission_ledger_no_update BEFORE DELETE OR UPDATE ON public."CommissionLedger" FOR EACH ROW EXECUTE FUNCTION public.prevent_commission_ledger_mutation();


--
-- Name: GamificationPointsLedger gamification_points_ledger_no_update; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER gamification_points_ledger_no_update BEFORE DELETE OR UPDATE ON public."GamificationPointsLedger" FOR EACH ROW EXECUTE FUNCTION public.prevent_gamification_ledger_mutation();


--
-- Name: ActivityReminder ActivityReminder_activityId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ActivityReminder"
    ADD CONSTRAINT "ActivityReminder_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES public."Activity"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: ActivityType ActivityType_objectId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ActivityType"
    ADD CONSTRAINT "ActivityType_objectId_fkey" FOREIGN KEY ("objectId") REFERENCES public."ObjectDefinition"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: ActivityType ActivityType_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ActivityType"
    ADD CONSTRAINT "ActivityType_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: Activity Activity_createdBy_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Activity"
    ADD CONSTRAINT "Activity_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: Activity Activity_leadId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Activity"
    ADD CONSTRAINT "Activity_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES public."Lead"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: Activity Activity_objectId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Activity"
    ADD CONSTRAINT "Activity_objectId_fkey" FOREIGN KEY ("objectId") REFERENCES public."ObjectDefinition"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: Activity Activity_opportunityId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Activity"
    ADD CONSTRAINT "Activity_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES public."Opportunity"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: Activity Activity_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Activity"
    ADD CONSTRAINT "Activity_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: Activity Activity_typeId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Activity"
    ADD CONSTRAINT "Activity_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES public."ActivityType"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: AssignmentLog AssignmentLog_assignedToId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AssignmentLog"
    ADD CONSTRAINT "AssignmentLog_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: AssignmentLog AssignmentLog_ruleId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AssignmentLog"
    ADD CONSTRAINT "AssignmentLog_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES public."AssignmentRule"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: AssignmentLog AssignmentLog_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AssignmentLog"
    ADD CONSTRAINT "AssignmentLog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: AssignmentRule AssignmentRule_targetGroupId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AssignmentRule"
    ADD CONSTRAINT "AssignmentRule_targetGroupId_fkey" FOREIGN KEY ("targetGroupId") REFERENCES public."SalesGroup"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: AssignmentRule AssignmentRule_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AssignmentRule"
    ADD CONSTRAINT "AssignmentRule_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: AuditLog AuditLog_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AuditLog"
    ADD CONSTRAINT "AuditLog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: AuditLog AuditLog_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AuditLog"
    ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: AutomationExecution AutomationExecution_automationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AutomationExecution"
    ADD CONSTRAINT "AutomationExecution_automationId_fkey" FOREIGN KEY ("automationId") REFERENCES public."AutomationV2"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: AutomationExecution AutomationExecution_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AutomationExecution"
    ADD CONSTRAINT "AutomationExecution_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: AutomationV2 AutomationV2_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AutomationV2"
    ADD CONSTRAINT "AutomationV2_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: Badge Badge_createdBy_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Badge"
    ADD CONSTRAINT "Badge_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES public."User"(id);


--
-- Name: Badge Badge_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Badge"
    ADD CONSTRAINT "Badge_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id);


--
-- Name: CalculatedFieldDefinition CalculatedFieldDefinition_fieldDefinitionId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CalculatedFieldDefinition"
    ADD CONSTRAINT "CalculatedFieldDefinition_fieldDefinitionId_fkey" FOREIGN KEY ("fieldDefinitionId") REFERENCES public."FieldDefinition"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: CalculatedFieldDefinition CalculatedFieldDefinition_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CalculatedFieldDefinition"
    ADD CONSTRAINT "CalculatedFieldDefinition_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: CommissionLedger CommissionLedger_commissionRuleId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CommissionLedger"
    ADD CONSTRAINT "CommissionLedger_commissionRuleId_fkey" FOREIGN KEY ("commissionRuleId") REFERENCES public."CommissionRule"(id);


--
-- Name: CommissionLedger CommissionLedger_correctsEntryId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CommissionLedger"
    ADD CONSTRAINT "CommissionLedger_correctsEntryId_fkey" FOREIGN KEY ("correctsEntryId") REFERENCES public."CommissionLedger"(id);


--
-- Name: CommissionLedger CommissionLedger_createdBy_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CommissionLedger"
    ADD CONSTRAINT "CommissionLedger_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES public."User"(id);


--
-- Name: CommissionLedger CommissionLedger_opportunityId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CommissionLedger"
    ADD CONSTRAINT "CommissionLedger_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES public."Opportunity"(id);


--
-- Name: CommissionLedger CommissionLedger_partnerId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CommissionLedger"
    ADD CONSTRAINT "CommissionLedger_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES public."User"(id);


--
-- Name: CommissionLedger CommissionLedger_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CommissionLedger"
    ADD CONSTRAINT "CommissionLedger_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id);


--
-- Name: CommissionRule CommissionRule_createdBy_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CommissionRule"
    ADD CONSTRAINT "CommissionRule_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES public."User"(id);


--
-- Name: CommissionRule CommissionRule_opportunityTypeId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CommissionRule"
    ADD CONSTRAINT "CommissionRule_opportunityTypeId_fkey" FOREIGN KEY ("opportunityTypeId") REFERENCES public."OpportunityType"(id);


--
-- Name: CommissionRule CommissionRule_partnerId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CommissionRule"
    ADD CONSTRAINT "CommissionRule_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES public."User"(id);


--
-- Name: CommissionRule CommissionRule_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CommissionRule"
    ADD CONSTRAINT "CommissionRule_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id);


--
-- Name: CommunicationDeliveryEvent CommunicationDeliveryEvent_outboxId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CommunicationDeliveryEvent"
    ADD CONSTRAINT "CommunicationDeliveryEvent_outboxId_fkey" FOREIGN KEY ("outboxId") REFERENCES public."CommunicationOutbox"(id);


--
-- Name: CommunicationDeliveryEvent CommunicationDeliveryEvent_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CommunicationDeliveryEvent"
    ADD CONSTRAINT "CommunicationDeliveryEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id);


--
-- Name: CommunicationOutbox CommunicationOutbox_createdBy_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CommunicationOutbox"
    ADD CONSTRAINT "CommunicationOutbox_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES public."User"(id);


--
-- Name: CommunicationOutbox CommunicationOutbox_providerConfigId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CommunicationOutbox"
    ADD CONSTRAINT "CommunicationOutbox_providerConfigId_fkey" FOREIGN KEY ("providerConfigId") REFERENCES public."CommunicationProviderConfig"(id);


--
-- Name: CommunicationOutbox CommunicationOutbox_senderIdentityId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CommunicationOutbox"
    ADD CONSTRAINT "CommunicationOutbox_senderIdentityId_fkey" FOREIGN KEY ("senderIdentityId") REFERENCES public."SenderIdentity"(id);


--
-- Name: CommunicationOutbox CommunicationOutbox_templateId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CommunicationOutbox"
    ADD CONSTRAINT "CommunicationOutbox_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES public."CommunicationTemplate"(id);


--
-- Name: CommunicationOutbox CommunicationOutbox_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CommunicationOutbox"
    ADD CONSTRAINT "CommunicationOutbox_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id);


--
-- Name: CommunicationProviderConfig CommunicationProviderConfig_createdBy_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CommunicationProviderConfig"
    ADD CONSTRAINT "CommunicationProviderConfig_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES public."User"(id);


--
-- Name: CommunicationProviderConfig CommunicationProviderConfig_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CommunicationProviderConfig"
    ADD CONSTRAINT "CommunicationProviderConfig_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id);


--
-- Name: CommunicationProviderConfig CommunicationProviderConfig_updatedBy_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CommunicationProviderConfig"
    ADD CONSTRAINT "CommunicationProviderConfig_updatedBy_fkey" FOREIGN KEY ("updatedBy") REFERENCES public."User"(id);


--
-- Name: CommunicationTemplate CommunicationTemplate_createdBy_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CommunicationTemplate"
    ADD CONSTRAINT "CommunicationTemplate_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES public."User"(id);


--
-- Name: CommunicationTemplate CommunicationTemplate_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CommunicationTemplate"
    ADD CONSTRAINT "CommunicationTemplate_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id);


--
-- Name: CustomFieldValue CustomFieldValue_fieldDefinitionId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CustomFieldValue"
    ADD CONSTRAINT "CustomFieldValue_fieldDefinitionId_fkey" FOREIGN KEY ("fieldDefinitionId") REFERENCES public."FieldDefinition"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: CustomFieldValue CustomFieldValue_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CustomFieldValue"
    ADD CONSTRAINT "CustomFieldValue_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: CustomReport CustomReport_createdBy_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CustomReport"
    ADD CONSTRAINT "CustomReport_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: CustomReport CustomReport_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CustomReport"
    ADD CONSTRAINT "CustomReport_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: DailyMetric DailyMetric_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."DailyMetric"
    ADD CONSTRAINT "DailyMetric_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: DashboardWidget DashboardWidget_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."DashboardWidget"
    ADD CONSTRAINT "DashboardWidget_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: DashboardWidget DashboardWidget_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."DashboardWidget"
    ADD CONSTRAINT "DashboardWidget_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: DataRetentionPolicy DataRetentionPolicy_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."DataRetentionPolicy"
    ADD CONSTRAINT "DataRetentionPolicy_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: ExportRequest ExportRequest_fileObjectId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ExportRequest"
    ADD CONSTRAINT "ExportRequest_fileObjectId_fkey" FOREIGN KEY ("fileObjectId") REFERENCES public."FileObject"(id);


--
-- Name: ExportRequest ExportRequest_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ExportRequest"
    ADD CONSTRAINT "ExportRequest_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id);


--
-- Name: ExportRequest ExportRequest_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ExportRequest"
    ADD CONSTRAINT "ExportRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id);


--
-- Name: FieldDefinition FieldDefinition_groupId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."FieldDefinition"
    ADD CONSTRAINT "FieldDefinition_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES public."FieldGroup"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: FieldDefinition FieldDefinition_objectId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."FieldDefinition"
    ADD CONSTRAINT "FieldDefinition_objectId_fkey" FOREIGN KEY ("objectId") REFERENCES public."ObjectDefinition"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: FieldDefinition FieldDefinition_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."FieldDefinition"
    ADD CONSTRAINT "FieldDefinition_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: FieldDependencyRule FieldDependencyRule_sourceFieldId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."FieldDependencyRule"
    ADD CONSTRAINT "FieldDependencyRule_sourceFieldId_fkey" FOREIGN KEY ("sourceFieldId") REFERENCES public."FieldDefinition"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: FieldDependencyRule FieldDependencyRule_targetFieldId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."FieldDependencyRule"
    ADD CONSTRAINT "FieldDependencyRule_targetFieldId_fkey" FOREIGN KEY ("targetFieldId") REFERENCES public."FieldDefinition"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: FieldDependencyRule FieldDependencyRule_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."FieldDependencyRule"
    ADD CONSTRAINT "FieldDependencyRule_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: FieldGroup FieldGroup_objectId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."FieldGroup"
    ADD CONSTRAINT "FieldGroup_objectId_fkey" FOREIGN KEY ("objectId") REFERENCES public."ObjectDefinition"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: FieldGroup FieldGroup_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."FieldGroup"
    ADD CONSTRAINT "FieldGroup_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: FieldPermissionV2 FieldPermissionV2_fieldId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."FieldPermissionV2"
    ADD CONSTRAINT "FieldPermissionV2_fieldId_fkey" FOREIGN KEY ("fieldId") REFERENCES public."FieldDefinition"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: FieldPermissionV2 FieldPermissionV2_roleId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."FieldPermissionV2"
    ADD CONSTRAINT "FieldPermissionV2_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES public."Role"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: FieldValidationRule FieldValidationRule_fieldDefinitionId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."FieldValidationRule"
    ADD CONSTRAINT "FieldValidationRule_fieldDefinitionId_fkey" FOREIGN KEY ("fieldDefinitionId") REFERENCES public."FieldDefinition"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: FieldValidationRule FieldValidationRule_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."FieldValidationRule"
    ADD CONSTRAINT "FieldValidationRule_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: FileObject FileObject_createdBy_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."FileObject"
    ADD CONSTRAINT "FileObject_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES public."User"(id);


--
-- Name: FileObject FileObject_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."FileObject"
    ADD CONSTRAINT "FileObject_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id);


--
-- Name: FormSubmission FormSubmission_formId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."FormSubmission"
    ADD CONSTRAINT "FormSubmission_formId_fkey" FOREIGN KEY ("formId") REFERENCES public."Form"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: FormSubmission FormSubmission_leadId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."FormSubmission"
    ADD CONSTRAINT "FormSubmission_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES public."Lead"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: FormSubmission FormSubmission_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."FormSubmission"
    ADD CONSTRAINT "FormSubmission_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: Form Form_automationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Form"
    ADD CONSTRAINT "Form_automationId_fkey" FOREIGN KEY ("automationId") REFERENCES public."AutomationV2"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: Form Form_defaultOwnerId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Form"
    ADD CONSTRAINT "Form_defaultOwnerId_fkey" FOREIGN KEY ("defaultOwnerId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: Form Form_objectId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Form"
    ADD CONSTRAINT "Form_objectId_fkey" FOREIGN KEY ("objectId") REFERENCES public."ObjectDefinition"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: Form Form_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Form"
    ADD CONSTRAINT "Form_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: GDPRRequest GDPRRequest_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."GDPRRequest"
    ADD CONSTRAINT "GDPRRequest_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: GamificationPointsLedger GamificationPointsLedger_createdBy_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."GamificationPointsLedger"
    ADD CONSTRAINT "GamificationPointsLedger_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES public."User"(id);


--
-- Name: GamificationPointsLedger GamificationPointsLedger_gamificationRuleId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."GamificationPointsLedger"
    ADD CONSTRAINT "GamificationPointsLedger_gamificationRuleId_fkey" FOREIGN KEY ("gamificationRuleId") REFERENCES public."GamificationRule"(id);


--
-- Name: GamificationPointsLedger GamificationPointsLedger_redemptionId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."GamificationPointsLedger"
    ADD CONSTRAINT "GamificationPointsLedger_redemptionId_fkey" FOREIGN KEY ("redemptionId") REFERENCES public."GamificationRedemption"(id);


--
-- Name: GamificationPointsLedger GamificationPointsLedger_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."GamificationPointsLedger"
    ADD CONSTRAINT "GamificationPointsLedger_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id);


--
-- Name: GamificationPointsLedger GamificationPointsLedger_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."GamificationPointsLedger"
    ADD CONSTRAINT "GamificationPointsLedger_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id);


--
-- Name: GamificationRedemption GamificationRedemption_reviewedBy_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."GamificationRedemption"
    ADD CONSTRAINT "GamificationRedemption_reviewedBy_fkey" FOREIGN KEY ("reviewedBy") REFERENCES public."User"(id);


--
-- Name: GamificationRedemption GamificationRedemption_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."GamificationRedemption"
    ADD CONSTRAINT "GamificationRedemption_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id);


--
-- Name: GamificationRedemption GamificationRedemption_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."GamificationRedemption"
    ADD CONSTRAINT "GamificationRedemption_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id);


--
-- Name: GamificationRule GamificationRule_createdBy_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."GamificationRule"
    ADD CONSTRAINT "GamificationRule_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES public."User"(id);


--
-- Name: GamificationRule GamificationRule_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."GamificationRule"
    ADD CONSTRAINT "GamificationRule_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id);


--
-- Name: GamificationSettings GamificationSettings_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."GamificationSettings"
    ADD CONSTRAINT "GamificationSettings_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id);


--
-- Name: GamificationSettings GamificationSettings_updatedBy_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."GamificationSettings"
    ADD CONSTRAINT "GamificationSettings_updatedBy_fkey" FOREIGN KEY ("updatedBy") REFERENCES public."User"(id);


--
-- Name: ImportJob ImportJob_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ImportJob"
    ADD CONSTRAINT "ImportJob_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: ImportJob ImportJob_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ImportJob"
    ADD CONSTRAINT "ImportJob_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: LayoutDefinition LayoutDefinition_objectId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."LayoutDefinition"
    ADD CONSTRAINT "LayoutDefinition_objectId_fkey" FOREIGN KEY ("objectId") REFERENCES public."ObjectDefinition"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: LayoutDefinition LayoutDefinition_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."LayoutDefinition"
    ADD CONSTRAINT "LayoutDefinition_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: LeadListMember LeadListMember_leadId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."LeadListMember"
    ADD CONSTRAINT "LeadListMember_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES public."Lead"(id) ON DELETE CASCADE;


--
-- Name: LeadListMember LeadListMember_listId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."LeadListMember"
    ADD CONSTRAINT "LeadListMember_listId_fkey" FOREIGN KEY ("listId") REFERENCES public."LeadList"(id) ON DELETE CASCADE;


--
-- Name: LeadScoringRule LeadScoringRule_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."LeadScoringRule"
    ADD CONSTRAINT "LeadScoringRule_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: Lead Lead_objectId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Lead"
    ADD CONSTRAINT "Lead_objectId_fkey" FOREIGN KEY ("objectId") REFERENCES public."ObjectDefinition"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: Lead Lead_ownerId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Lead"
    ADD CONSTRAINT "Lead_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: Lead Lead_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Lead"
    ADD CONSTRAINT "Lead_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: Note Note_authorId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Note"
    ADD CONSTRAINT "Note_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: Note Note_lead_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Note"
    ADD CONSTRAINT "Note_lead_fk" FOREIGN KEY ("entityId") REFERENCES public."Lead"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: Note Note_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Note"
    ADD CONSTRAINT "Note_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: ObjectDefinition ObjectDefinition_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ObjectDefinition"
    ADD CONSTRAINT "ObjectDefinition_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: ObjectPermission ObjectPermission_objectId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ObjectPermission"
    ADD CONSTRAINT "ObjectPermission_objectId_fkey" FOREIGN KEY ("objectId") REFERENCES public."ObjectDefinition"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: ObjectPermission ObjectPermission_roleId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ObjectPermission"
    ADD CONSTRAINT "ObjectPermission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES public."Role"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: ObjectPermission ObjectPermission_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ObjectPermission"
    ADD CONSTRAINT "ObjectPermission_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: ObjectRelationship ObjectRelationship_sourceObjectId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ObjectRelationship"
    ADD CONSTRAINT "ObjectRelationship_sourceObjectId_fkey" FOREIGN KEY ("sourceObjectId") REFERENCES public."ObjectDefinition"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: ObjectRelationship ObjectRelationship_targetObjectId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ObjectRelationship"
    ADD CONSTRAINT "ObjectRelationship_targetObjectId_fkey" FOREIGN KEY ("targetObjectId") REFERENCES public."ObjectDefinition"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: ObjectRelationship ObjectRelationship_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ObjectRelationship"
    ADD CONSTRAINT "ObjectRelationship_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: OpportunityStageHistory OpportunityStageHistory_changedById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."OpportunityStageHistory"
    ADD CONSTRAINT "OpportunityStageHistory_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: OpportunityStageHistory OpportunityStageHistory_fromStageId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."OpportunityStageHistory"
    ADD CONSTRAINT "OpportunityStageHistory_fromStageId_fkey" FOREIGN KEY ("fromStageId") REFERENCES public."StageDefinition"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: OpportunityStageHistory OpportunityStageHistory_opportunityId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."OpportunityStageHistory"
    ADD CONSTRAINT "OpportunityStageHistory_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES public."Opportunity"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: OpportunityStageHistory OpportunityStageHistory_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."OpportunityStageHistory"
    ADD CONSTRAINT "OpportunityStageHistory_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: OpportunityStageHistory OpportunityStageHistory_toStageId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."OpportunityStageHistory"
    ADD CONSTRAINT "OpportunityStageHistory_toStageId_fkey" FOREIGN KEY ("toStageId") REFERENCES public."StageDefinition"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: OpportunityType OpportunityType_objectId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."OpportunityType"
    ADD CONSTRAINT "OpportunityType_objectId_fkey" FOREIGN KEY ("objectId") REFERENCES public."ObjectDefinition"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: OpportunityType OpportunityType_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."OpportunityType"
    ADD CONSTRAINT "OpportunityType_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: Opportunity Opportunity_leadId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Opportunity"
    ADD CONSTRAINT "Opportunity_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES public."Lead"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: Opportunity Opportunity_objectId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Opportunity"
    ADD CONSTRAINT "Opportunity_objectId_fkey" FOREIGN KEY ("objectId") REFERENCES public."ObjectDefinition"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: Opportunity Opportunity_opportunityTypeId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Opportunity"
    ADD CONSTRAINT "Opportunity_opportunityTypeId_fkey" FOREIGN KEY ("opportunityTypeId") REFERENCES public."OpportunityType"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: Opportunity Opportunity_ownerId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Opportunity"
    ADD CONSTRAINT "Opportunity_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: Opportunity Opportunity_stageId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Opportunity"
    ADD CONSTRAINT "Opportunity_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES public."StageDefinition"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: Opportunity Opportunity_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Opportunity"
    ADD CONSTRAINT "Opportunity_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: PartnerInvoiceTemplate PartnerInvoiceTemplate_partnerId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PartnerInvoiceTemplate"
    ADD CONSTRAINT "PartnerInvoiceTemplate_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES public."User"(id);


--
-- Name: PartnerInvoiceTemplate PartnerInvoiceTemplate_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PartnerInvoiceTemplate"
    ADD CONSTRAINT "PartnerInvoiceTemplate_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id);


--
-- Name: PartnerInvoice PartnerInvoice_generatedBy_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PartnerInvoice"
    ADD CONSTRAINT "PartnerInvoice_generatedBy_fkey" FOREIGN KEY ("generatedBy") REFERENCES public."User"(id);


--
-- Name: PartnerInvoice PartnerInvoice_partnerId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PartnerInvoice"
    ADD CONSTRAINT "PartnerInvoice_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES public."User"(id);


--
-- Name: PartnerInvoice PartnerInvoice_payoutId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PartnerInvoice"
    ADD CONSTRAINT "PartnerInvoice_payoutId_fkey" FOREIGN KEY ("payoutId") REFERENCES public."Payout"(id);


--
-- Name: PartnerInvoice PartnerInvoice_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PartnerInvoice"
    ADD CONSTRAINT "PartnerInvoice_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id);


--
-- Name: PartnerOrganization PartnerOrganization_createdBy_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PartnerOrganization"
    ADD CONSTRAINT "PartnerOrganization_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES public."User"(id);


--
-- Name: PartnerOrganization PartnerOrganization_parentOrganizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PartnerOrganization"
    ADD CONSTRAINT "PartnerOrganization_parentOrganizationId_fkey" FOREIGN KEY ("parentOrganizationId") REFERENCES public."PartnerOrganization"(id);


--
-- Name: PartnerOrganization PartnerOrganization_primaryUserId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PartnerOrganization"
    ADD CONSTRAINT "PartnerOrganization_primaryUserId_fkey" FOREIGN KEY ("primaryUserId") REFERENCES public."User"(id);


--
-- Name: PartnerOrganization PartnerOrganization_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PartnerOrganization"
    ADD CONSTRAINT "PartnerOrganization_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id);


--
-- Name: PartnerPayoutSettings PartnerPayoutSettings_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PartnerPayoutSettings"
    ADD CONSTRAINT "PartnerPayoutSettings_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id);


--
-- Name: PartnerPayoutSettings PartnerPayoutSettings_updatedBy_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PartnerPayoutSettings"
    ADD CONSTRAINT "PartnerPayoutSettings_updatedBy_fkey" FOREIGN KEY ("updatedBy") REFERENCES public."User"(id);


--
-- Name: PartnerProfile PartnerProfile_createdBy_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PartnerProfile"
    ADD CONSTRAINT "PartnerProfile_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES public."User"(id);


--
-- Name: PartnerProfile PartnerProfile_parentPartnerProfileId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PartnerProfile"
    ADD CONSTRAINT "PartnerProfile_parentPartnerProfileId_fkey" FOREIGN KEY ("parentPartnerProfileId") REFERENCES public."PartnerProfile"(id);


--
-- Name: PartnerProfile PartnerProfile_partnerOrganizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PartnerProfile"
    ADD CONSTRAINT "PartnerProfile_partnerOrganizationId_fkey" FOREIGN KEY ("partnerOrganizationId") REFERENCES public."PartnerOrganization"(id);


--
-- Name: PartnerProfile PartnerProfile_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PartnerProfile"
    ADD CONSTRAINT "PartnerProfile_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id);


--
-- Name: PartnerProfile PartnerProfile_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PartnerProfile"
    ADD CONSTRAINT "PartnerProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id);


--
-- Name: PayoutCycle PayoutCycle_createdBy_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PayoutCycle"
    ADD CONSTRAINT "PayoutCycle_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES public."User"(id);


--
-- Name: PayoutCycle PayoutCycle_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PayoutCycle"
    ADD CONSTRAINT "PayoutCycle_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id);


--
-- Name: Payout Payout_approvedBy_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Payout"
    ADD CONSTRAINT "Payout_approvedBy_fkey" FOREIGN KEY ("approvedBy") REFERENCES public."User"(id);


--
-- Name: Payout Payout_heldBy_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Payout"
    ADD CONSTRAINT "Payout_heldBy_fkey" FOREIGN KEY ("heldBy") REFERENCES public."User"(id);


--
-- Name: Payout Payout_invoiceId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Payout"
    ADD CONSTRAINT "Payout_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES public."PartnerInvoice"(id);


--
-- Name: Payout Payout_paidBy_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Payout"
    ADD CONSTRAINT "Payout_paidBy_fkey" FOREIGN KEY ("paidBy") REFERENCES public."User"(id);


--
-- Name: Payout Payout_partnerId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Payout"
    ADD CONSTRAINT "Payout_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES public."User"(id);


--
-- Name: Payout Payout_partnerOrganizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Payout"
    ADD CONSTRAINT "Payout_partnerOrganizationId_fkey" FOREIGN KEY ("partnerOrganizationId") REFERENCES public."PartnerOrganization"(id);


--
-- Name: Payout Payout_payoutCycleId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Payout"
    ADD CONSTRAINT "Payout_payoutCycleId_fkey" FOREIGN KEY ("payoutCycleId") REFERENCES public."PayoutCycle"(id);


--
-- Name: Payout Payout_releasedBy_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Payout"
    ADD CONSTRAINT "Payout_releasedBy_fkey" FOREIGN KEY ("releasedBy") REFERENCES public."User"(id);


--
-- Name: Payout Payout_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Payout"
    ADD CONSTRAINT "Payout_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id);


--
-- Name: PlanUpgradeHistory PlanUpgradeHistory_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PlanUpgradeHistory"
    ADD CONSTRAINT "PlanUpgradeHistory_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: PlatformAdmin PlatformAdmin_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PlatformAdmin"
    ADD CONSTRAINT "PlatformAdmin_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: RecordScoreHistory RecordScoreHistory_recordScoreId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."RecordScoreHistory"
    ADD CONSTRAINT "RecordScoreHistory_recordScoreId_fkey" FOREIGN KEY ("recordScoreId") REFERENCES public."RecordScore"(id);


--
-- Name: RecordScoreHistory RecordScoreHistory_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."RecordScoreHistory"
    ADD CONSTRAINT "RecordScoreHistory_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id);


--
-- Name: RecordScore RecordScore_featureSnapshotId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."RecordScore"
    ADD CONSTRAINT "RecordScore_featureSnapshotId_fkey" FOREIGN KEY ("featureSnapshotId") REFERENCES public."ScoringFeatureSnapshot"(id);


--
-- Name: RecordScore RecordScore_modelVersionId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."RecordScore"
    ADD CONSTRAINT "RecordScore_modelVersionId_fkey" FOREIGN KEY ("modelVersionId") REFERENCES public."ScoringModelVersion"(id);


--
-- Name: RecordScore RecordScore_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."RecordScore"
    ADD CONSTRAINT "RecordScore_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id);


--
-- Name: RecordVisibilityRule RecordVisibilityRule_roleId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."RecordVisibilityRule"
    ADD CONSTRAINT "RecordVisibilityRule_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES public."Role"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: RecordVisibilityRule RecordVisibilityRule_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."RecordVisibilityRule"
    ADD CONSTRAINT "RecordVisibilityRule_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: ReportDefinition ReportDefinition_createdBy_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ReportDefinition"
    ADD CONSTRAINT "ReportDefinition_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES public."User"(id);


--
-- Name: ReportDefinition ReportDefinition_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ReportDefinition"
    ADD CONSTRAINT "ReportDefinition_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id);


--
-- Name: ReportEmailDelivery ReportEmailDelivery_scheduleId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ReportEmailDelivery"
    ADD CONSTRAINT "ReportEmailDelivery_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES public."ReportSchedule"(id);


--
-- Name: ReportEmailDelivery ReportEmailDelivery_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ReportEmailDelivery"
    ADD CONSTRAINT "ReportEmailDelivery_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id);


--
-- Name: ReportRefreshJob ReportRefreshJob_requestedBy_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ReportRefreshJob"
    ADD CONSTRAINT "ReportRefreshJob_requestedBy_fkey" FOREIGN KEY ("requestedBy") REFERENCES public."User"(id);


--
-- Name: ReportRefreshJob ReportRefreshJob_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ReportRefreshJob"
    ADD CONSTRAINT "ReportRefreshJob_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id);


--
-- Name: ReportRefreshState ReportRefreshState_manualRefreshRequestedBy_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ReportRefreshState"
    ADD CONSTRAINT "ReportRefreshState_manualRefreshRequestedBy_fkey" FOREIGN KEY ("manualRefreshRequestedBy") REFERENCES public."User"(id);


--
-- Name: ReportRefreshState ReportRefreshState_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ReportRefreshState"
    ADD CONSTRAINT "ReportRefreshState_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id);


--
-- Name: ReportRollup ReportRollup_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ReportRollup"
    ADD CONSTRAINT "ReportRollup_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id);


--
-- Name: ReportSchedule ReportSchedule_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ReportSchedule"
    ADD CONSTRAINT "ReportSchedule_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id);


--
-- Name: ReportSchedule ReportSchedule_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ReportSchedule"
    ADD CONSTRAINT "ReportSchedule_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id);


--
-- Name: Role Role_permissionTemplateId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Role"
    ADD CONSTRAINT "Role_permissionTemplateId_fkey" FOREIGN KEY ("permissionTemplateId") REFERENCES public."PermissionTemplate"(id) ON DELETE SET NULL;


--
-- Name: Role Role_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Role"
    ADD CONSTRAINT "Role_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: SalesGroupMember SalesGroupMember_groupId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SalesGroupMember"
    ADD CONSTRAINT "SalesGroupMember_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES public."SalesGroup"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: SalesGroupMember SalesGroupMember_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SalesGroupMember"
    ADD CONSTRAINT "SalesGroupMember_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: SalesGroupMember SalesGroupMember_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SalesGroupMember"
    ADD CONSTRAINT "SalesGroupMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: SalesGroup SalesGroup_managerId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SalesGroup"
    ADD CONSTRAINT "SalesGroup_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: SalesGroup SalesGroup_permissionTemplateId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SalesGroup"
    ADD CONSTRAINT "SalesGroup_permissionTemplateId_fkey" FOREIGN KEY ("permissionTemplateId") REFERENCES public."PermissionTemplate"(id) ON DELETE SET NULL;


--
-- Name: SalesGroup SalesGroup_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SalesGroup"
    ADD CONSTRAINT "SalesGroup_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: ScoringFeatureSnapshot ScoringFeatureSnapshot_modelVersionId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ScoringFeatureSnapshot"
    ADD CONSTRAINT "ScoringFeatureSnapshot_modelVersionId_fkey" FOREIGN KEY ("modelVersionId") REFERENCES public."ScoringModelVersion"(id);


--
-- Name: ScoringFeatureSnapshot ScoringFeatureSnapshot_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ScoringFeatureSnapshot"
    ADD CONSTRAINT "ScoringFeatureSnapshot_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id);


--
-- Name: ScoringModelVersion ScoringModelVersion_modelId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ScoringModelVersion"
    ADD CONSTRAINT "ScoringModelVersion_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES public."ScoringModel"(id);


--
-- Name: ScoringModelVersion ScoringModelVersion_promotedBy_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ScoringModelVersion"
    ADD CONSTRAINT "ScoringModelVersion_promotedBy_fkey" FOREIGN KEY ("promotedBy") REFERENCES public."User"(id);


--
-- Name: ScoringModelVersion ScoringModelVersion_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ScoringModelVersion"
    ADD CONSTRAINT "ScoringModelVersion_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id);


--
-- Name: ScoringModel ScoringModel_createdBy_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ScoringModel"
    ADD CONSTRAINT "ScoringModel_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES public."User"(id);


--
-- Name: ScoringModel ScoringModel_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ScoringModel"
    ADD CONSTRAINT "ScoringModel_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id);


--
-- Name: ScoringSettings ScoringSettings_promotedLeadModelVersionId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ScoringSettings"
    ADD CONSTRAINT "ScoringSettings_promotedLeadModelVersionId_fkey" FOREIGN KEY ("promotedLeadModelVersionId") REFERENCES public."ScoringModelVersion"(id);


--
-- Name: ScoringSettings ScoringSettings_promotedOpportunityModelVersionId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ScoringSettings"
    ADD CONSTRAINT "ScoringSettings_promotedOpportunityModelVersionId_fkey" FOREIGN KEY ("promotedOpportunityModelVersionId") REFERENCES public."ScoringModelVersion"(id);


--
-- Name: ScoringSettings ScoringSettings_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ScoringSettings"
    ADD CONSTRAINT "ScoringSettings_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id);


--
-- Name: ScoringSettings ScoringSettings_updatedBy_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ScoringSettings"
    ADD CONSTRAINT "ScoringSettings_updatedBy_fkey" FOREIGN KEY ("updatedBy") REFERENCES public."User"(id);


--
-- Name: ScoringTrainingRun ScoringTrainingRun_createdBy_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ScoringTrainingRun"
    ADD CONSTRAINT "ScoringTrainingRun_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES public."User"(id);


--
-- Name: ScoringTrainingRun ScoringTrainingRun_modelId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ScoringTrainingRun"
    ADD CONSTRAINT "ScoringTrainingRun_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES public."ScoringModel"(id);


--
-- Name: ScoringTrainingRun ScoringTrainingRun_modelVersionId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ScoringTrainingRun"
    ADD CONSTRAINT "ScoringTrainingRun_modelVersionId_fkey" FOREIGN KEY ("modelVersionId") REFERENCES public."ScoringModelVersion"(id);


--
-- Name: ScoringTrainingRun ScoringTrainingRun_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ScoringTrainingRun"
    ADD CONSTRAINT "ScoringTrainingRun_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id);


--
-- Name: SecurityPolicy SecurityPolicy_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SecurityPolicy"
    ADD CONSTRAINT "SecurityPolicy_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: SenderIdentity SenderIdentity_createdBy_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SenderIdentity"
    ADD CONSTRAINT "SenderIdentity_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES public."User"(id);


--
-- Name: SenderIdentity SenderIdentity_providerConfigId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SenderIdentity"
    ADD CONSTRAINT "SenderIdentity_providerConfigId_fkey" FOREIGN KEY ("providerConfigId") REFERENCES public."CommunicationProviderConfig"(id);


--
-- Name: SenderIdentity SenderIdentity_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SenderIdentity"
    ADD CONSTRAINT "SenderIdentity_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id);


--
-- Name: StageDefinition StageDefinition_opportunityTypeId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."StageDefinition"
    ADD CONSTRAINT "StageDefinition_opportunityTypeId_fkey" FOREIGN KEY ("opportunityTypeId") REFERENCES public."OpportunityType"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: StageDefinition StageDefinition_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."StageDefinition"
    ADD CONSTRAINT "StageDefinition_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: Task Task_activityId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Task"
    ADD CONSTRAINT "Task_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES public."Activity"(id);


--
-- Name: Task Task_completedBy_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Task"
    ADD CONSTRAINT "Task_completedBy_fkey" FOREIGN KEY ("completedBy") REFERENCES public."User"(id);


--
-- Name: Task Task_createdBy_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Task"
    ADD CONSTRAINT "Task_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES public."User"(id);


--
-- Name: Task Task_leadId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Task"
    ADD CONSTRAINT "Task_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES public."Lead"(id);


--
-- Name: Task Task_opportunityId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Task"
    ADD CONSTRAINT "Task_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES public."Opportunity"(id);


--
-- Name: Task Task_ownerId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Task"
    ADD CONSTRAINT "Task_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES public."User"(id);


--
-- Name: Task Task_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Task"
    ADD CONSTRAINT "Task_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id);


--
-- Name: TeamMember TeamMember_teamId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."TeamMember"
    ADD CONSTRAINT "TeamMember_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES public."Team"(id) ON DELETE CASCADE;


--
-- Name: TeamMember TeamMember_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."TeamMember"
    ADD CONSTRAINT "TeamMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON DELETE CASCADE;


--
-- Name: TenantConfig TenantConfig_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."TenantConfig"
    ADD CONSTRAINT "TenantConfig_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: TenantFeature TenantFeature_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."TenantFeature"
    ADD CONSTRAINT "TenantFeature_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: UserBadge UserBadge_badgeId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."UserBadge"
    ADD CONSTRAINT "UserBadge_badgeId_fkey" FOREIGN KEY ("badgeId") REFERENCES public."Badge"(id);


--
-- Name: UserBadge UserBadge_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."UserBadge"
    ADD CONSTRAINT "UserBadge_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id);


--
-- Name: UserBadge UserBadge_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."UserBadge"
    ADD CONSTRAINT "UserBadge_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id);


--
-- Name: User User_managerId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."User"
    ADD CONSTRAINT "User_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: User User_permissionTemplateId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."User"
    ADD CONSTRAINT "User_permissionTemplateId_fkey" FOREIGN KEY ("permissionTemplateId") REFERENCES public."PermissionTemplate"(id) ON DELETE SET NULL;


--
-- Name: User User_roleId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."User"
    ADD CONSTRAINT "User_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES public."Role"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: User User_teamId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."User"
    ADD CONSTRAINT "User_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES public."Team"(id) ON DELETE SET NULL;


--
-- Name: User User_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."User"
    ADD CONSTRAINT "User_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: WebhookSubscription WebhookSubscription_tenantId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."WebhookSubscription"
    ADD CONSTRAINT "WebhookSubscription_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES public."Tenant"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: Activity; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."Activity" ENABLE ROW LEVEL SECURITY;

--
-- Name: ActivityType; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."ActivityType" ENABLE ROW LEVEL SECURITY;

--
-- Name: AssignmentLog; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."AssignmentLog" ENABLE ROW LEVEL SECURITY;

--
-- Name: AssignmentRule; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."AssignmentRule" ENABLE ROW LEVEL SECURITY;

--
-- Name: AuditLog; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."AuditLog" ENABLE ROW LEVEL SECURITY;

--
-- Name: AutomationExecution; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."AutomationExecution" ENABLE ROW LEVEL SECURITY;

--
-- Name: AutomationOutbox; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."AutomationOutbox" ENABLE ROW LEVEL SECURITY;

--
-- Name: AutomationV2; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."AutomationV2" ENABLE ROW LEVEL SECURITY;

--
-- Name: Badge; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."Badge" ENABLE ROW LEVEL SECURITY;

--
-- Name: CalculatedFieldDefinition; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."CalculatedFieldDefinition" ENABLE ROW LEVEL SECURITY;

--
-- Name: CommissionLedger; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."CommissionLedger" ENABLE ROW LEVEL SECURITY;

--
-- Name: CommissionRule; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."CommissionRule" ENABLE ROW LEVEL SECURITY;

--
-- Name: CommunicationDeliveryEvent; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."CommunicationDeliveryEvent" ENABLE ROW LEVEL SECURITY;

--
-- Name: CommunicationOutbox; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."CommunicationOutbox" ENABLE ROW LEVEL SECURITY;

--
-- Name: CommunicationProviderConfig; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."CommunicationProviderConfig" ENABLE ROW LEVEL SECURITY;

--
-- Name: CommunicationTemplate; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."CommunicationTemplate" ENABLE ROW LEVEL SECURITY;

--
-- Name: CustomFieldValue; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."CustomFieldValue" ENABLE ROW LEVEL SECURITY;

--
-- Name: CustomReport; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."CustomReport" ENABLE ROW LEVEL SECURITY;

--
-- Name: DailyMetric; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."DailyMetric" ENABLE ROW LEVEL SECURITY;

--
-- Name: DashboardWidget; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."DashboardWidget" ENABLE ROW LEVEL SECURITY;

--
-- Name: DataRetentionPolicy; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."DataRetentionPolicy" ENABLE ROW LEVEL SECURITY;

--
-- Name: DomainEventOutbox; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."DomainEventOutbox" ENABLE ROW LEVEL SECURITY;

--
-- Name: ExportRequest; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."ExportRequest" ENABLE ROW LEVEL SECURITY;

--
-- Name: FieldDefinition; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."FieldDefinition" ENABLE ROW LEVEL SECURITY;

--
-- Name: FieldDependencyRule; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."FieldDependencyRule" ENABLE ROW LEVEL SECURITY;

--
-- Name: FieldGroup; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."FieldGroup" ENABLE ROW LEVEL SECURITY;

--
-- Name: FieldPermissionV2; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."FieldPermissionV2" ENABLE ROW LEVEL SECURITY;

--
-- Name: FieldValidationRule; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."FieldValidationRule" ENABLE ROW LEVEL SECURITY;

--
-- Name: FileObject; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."FileObject" ENABLE ROW LEVEL SECURITY;

--
-- Name: Form; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."Form" ENABLE ROW LEVEL SECURITY;

--
-- Name: FormSubmission; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."FormSubmission" ENABLE ROW LEVEL SECURITY;

--
-- Name: GDPRRequest; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."GDPRRequest" ENABLE ROW LEVEL SECURITY;

--
-- Name: GamificationPointsLedger; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."GamificationPointsLedger" ENABLE ROW LEVEL SECURITY;

--
-- Name: GamificationRedemption; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."GamificationRedemption" ENABLE ROW LEVEL SECURITY;

--
-- Name: GamificationRule; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."GamificationRule" ENABLE ROW LEVEL SECURITY;

--
-- Name: GamificationSettings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."GamificationSettings" ENABLE ROW LEVEL SECURITY;

--
-- Name: ImportJob; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."ImportJob" ENABLE ROW LEVEL SECURITY;

--
-- Name: IntegrationSetting; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."IntegrationSetting" ENABLE ROW LEVEL SECURITY;

--
-- Name: LayoutDefinition; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."LayoutDefinition" ENABLE ROW LEVEL SECURITY;

--
-- Name: Lead; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."Lead" ENABLE ROW LEVEL SECURITY;

--
-- Name: LeadList; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."LeadList" ENABLE ROW LEVEL SECURITY;

--
-- Name: LeadListMember; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."LeadListMember" ENABLE ROW LEVEL SECURITY;

--
-- Name: ObjectDefinition; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."ObjectDefinition" ENABLE ROW LEVEL SECURITY;

--
-- Name: ObjectPermission; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."ObjectPermission" ENABLE ROW LEVEL SECURITY;

--
-- Name: ObjectRelationship; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."ObjectRelationship" ENABLE ROW LEVEL SECURITY;

--
-- Name: Opportunity; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."Opportunity" ENABLE ROW LEVEL SECURITY;

--
-- Name: OpportunityStageHistory; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."OpportunityStageHistory" ENABLE ROW LEVEL SECURITY;

--
-- Name: OpportunityType; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."OpportunityType" ENABLE ROW LEVEL SECURITY;

--
-- Name: PartnerInvoice; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."PartnerInvoice" ENABLE ROW LEVEL SECURITY;

--
-- Name: PartnerInvoiceTemplate; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."PartnerInvoiceTemplate" ENABLE ROW LEVEL SECURITY;

--
-- Name: PartnerOrganization; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."PartnerOrganization" ENABLE ROW LEVEL SECURITY;

--
-- Name: PartnerPayoutSettings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."PartnerPayoutSettings" ENABLE ROW LEVEL SECURITY;

--
-- Name: PartnerProfile; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."PartnerProfile" ENABLE ROW LEVEL SECURITY;

--
-- Name: Payout; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."Payout" ENABLE ROW LEVEL SECURITY;

--
-- Name: PayoutCycle; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."PayoutCycle" ENABLE ROW LEVEL SECURITY;

--
-- Name: PermissionTemplate; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."PermissionTemplate" ENABLE ROW LEVEL SECURITY;

--
-- Name: PlanUpgradeHistory; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."PlanUpgradeHistory" ENABLE ROW LEVEL SECURITY;

--
-- Name: RecordScore; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."RecordScore" ENABLE ROW LEVEL SECURITY;

--
-- Name: RecordScoreHistory; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."RecordScoreHistory" ENABLE ROW LEVEL SECURITY;

--
-- Name: RecordVisibilityRule; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."RecordVisibilityRule" ENABLE ROW LEVEL SECURITY;

--
-- Name: ReportDefinition; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."ReportDefinition" ENABLE ROW LEVEL SECURITY;

--
-- Name: ReportEmailDelivery; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."ReportEmailDelivery" ENABLE ROW LEVEL SECURITY;

--
-- Name: ReportRefreshJob; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."ReportRefreshJob" ENABLE ROW LEVEL SECURITY;

--
-- Name: ReportRefreshState; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."ReportRefreshState" ENABLE ROW LEVEL SECURITY;

--
-- Name: ReportRollup; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."ReportRollup" ENABLE ROW LEVEL SECURITY;

--
-- Name: ReportSchedule; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."ReportSchedule" ENABLE ROW LEVEL SECURITY;

--
-- Name: ReportingOutbox; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."ReportingOutbox" ENABLE ROW LEVEL SECURITY;

--
-- Name: Role; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."Role" ENABLE ROW LEVEL SECURITY;

--
-- Name: SalesGroup; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."SalesGroup" ENABLE ROW LEVEL SECURITY;

--
-- Name: SalesGroupMember; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."SalesGroupMember" ENABLE ROW LEVEL SECURITY;

--
-- Name: ScoringFeatureSnapshot; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."ScoringFeatureSnapshot" ENABLE ROW LEVEL SECURITY;

--
-- Name: ScoringModel; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."ScoringModel" ENABLE ROW LEVEL SECURITY;

--
-- Name: ScoringModelVersion; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."ScoringModelVersion" ENABLE ROW LEVEL SECURITY;

--
-- Name: ScoringSettings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."ScoringSettings" ENABLE ROW LEVEL SECURITY;

--
-- Name: ScoringTrainingRun; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."ScoringTrainingRun" ENABLE ROW LEVEL SECURITY;

--
-- Name: SearchOutbox; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."SearchOutbox" ENABLE ROW LEVEL SECURITY;

--
-- Name: SecurityPolicy; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."SecurityPolicy" ENABLE ROW LEVEL SECURITY;

--
-- Name: SenderIdentity; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."SenderIdentity" ENABLE ROW LEVEL SECURITY;

--
-- Name: StageDefinition; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."StageDefinition" ENABLE ROW LEVEL SECURITY;

--
-- Name: Task; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."Task" ENABLE ROW LEVEL SECURITY;

--
-- Name: Team; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."Team" ENABLE ROW LEVEL SECURITY;

--
-- Name: TeamMember; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."TeamMember" ENABLE ROW LEVEL SECURITY;

--
-- Name: TelephonyCallLog; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."TelephonyCallLog" ENABLE ROW LEVEL SECURITY;

--
-- Name: Tenant; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."Tenant" ENABLE ROW LEVEL SECURITY;

--
-- Name: TenantConfig; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."TenantConfig" ENABLE ROW LEVEL SECURITY;

--
-- Name: TenantFeature; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."TenantFeature" ENABLE ROW LEVEL SECURITY;

--
-- Name: User; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."User" ENABLE ROW LEVEL SECURITY;

--
-- Name: UserBadge; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."UserBadge" ENABLE ROW LEVEL SECURITY;

--
-- Name: WebhookOutbox; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."WebhookOutbox" ENABLE ROW LEVEL SECURITY;

--
-- Name: WebhookSubscription; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."WebhookSubscription" ENABLE ROW LEVEL SECURITY;

--
-- Name: Activity tenant_isolation_activity; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_activity ON public."Activity" USING (("tenantId" = current_setting('app.tenant_id'::text, true)));


--
-- Name: ActivityType tenant_isolation_activity_type; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_activity_type ON public."ActivityType" USING (("tenantId" = current_setting('app.tenant_id'::text, true))) WITH CHECK (("tenantId" = current_setting('app.tenant_id'::text, true)));


--
-- Name: AssignmentLog tenant_isolation_assignment_log; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_assignment_log ON public."AssignmentLog" USING (("tenantId" = current_setting('app.tenant_id'::text, true))) WITH CHECK (("tenantId" = current_setting('app.tenant_id'::text, true)));


--
-- Name: AssignmentRule tenant_isolation_assignment_rule; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_assignment_rule ON public."AssignmentRule" USING (("tenantId" = current_setting('app.tenant_id'::text, true))) WITH CHECK (("tenantId" = current_setting('app.tenant_id'::text, true)));


--
-- Name: AuditLog tenant_isolation_audit_log; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_audit_log ON public."AuditLog" USING (("tenantId" = current_setting('app.tenant_id'::text, true)));


--
-- Name: AutomationExecution tenant_isolation_automation_execution; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_automation_execution ON public."AutomationExecution" USING (("tenantId" = current_setting('app.tenant_id'::text, true)));


--
-- Name: AutomationOutbox tenant_isolation_automation_outbox; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_automation_outbox ON public."AutomationOutbox" USING (("tenantId" = current_setting('app.tenant_id'::text, true)));


--
-- Name: AutomationV2 tenant_isolation_automation_v2; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_automation_v2 ON public."AutomationV2" USING (("tenantId" = current_setting('app.tenant_id'::text, true)));


--
-- Name: Badge tenant_isolation_badge; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_badge ON public."Badge" USING (("tenantId" = current_setting('app.tenant_id'::text, true))) WITH CHECK (("tenantId" = current_setting('app.tenant_id'::text, true)));


--
-- Name: CalculatedFieldDefinition tenant_isolation_calculated_field_definition; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_calculated_field_definition ON public."CalculatedFieldDefinition" USING (("tenantId" = current_setting('app.tenant_id'::text, true))) WITH CHECK (("tenantId" = current_setting('app.tenant_id'::text, true)));


--
-- Name: CommissionLedger tenant_isolation_commission_ledger; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_commission_ledger ON public."CommissionLedger" USING (("tenantId" = current_setting('app.tenant_id'::text, true))) WITH CHECK (("tenantId" = current_setting('app.tenant_id'::text, true)));


--
-- Name: CommissionRule tenant_isolation_commission_rule; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_commission_rule ON public."CommissionRule" USING (("tenantId" = current_setting('app.tenant_id'::text, true))) WITH CHECK (("tenantId" = current_setting('app.tenant_id'::text, true)));


--
-- Name: CommunicationDeliveryEvent tenant_isolation_communication_delivery_event; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_communication_delivery_event ON public."CommunicationDeliveryEvent" USING (("tenantId" = current_setting('app.tenant_id'::text, true))) WITH CHECK (("tenantId" = current_setting('app.tenant_id'::text, true)));


--
-- Name: CommunicationOutbox tenant_isolation_communication_outbox; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_communication_outbox ON public."CommunicationOutbox" USING (("tenantId" = current_setting('app.tenant_id'::text, true))) WITH CHECK (("tenantId" = current_setting('app.tenant_id'::text, true)));


--
-- Name: CommunicationProviderConfig tenant_isolation_communication_provider; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_communication_provider ON public."CommunicationProviderConfig" USING (("tenantId" = current_setting('app.tenant_id'::text, true))) WITH CHECK (("tenantId" = current_setting('app.tenant_id'::text, true)));


--
-- Name: CommunicationTemplate tenant_isolation_communication_template; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_communication_template ON public."CommunicationTemplate" USING (("tenantId" = current_setting('app.tenant_id'::text, true))) WITH CHECK (("tenantId" = current_setting('app.tenant_id'::text, true)));


--
-- Name: CustomFieldValue tenant_isolation_custom_field_value; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_custom_field_value ON public."CustomFieldValue" USING (("tenantId" = current_setting('app.tenant_id'::text, true)));


--
-- Name: CustomReport tenant_isolation_custom_report; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_custom_report ON public."CustomReport" USING (("tenantId" = current_setting('app.tenant_id'::text, true))) WITH CHECK (("tenantId" = current_setting('app.tenant_id'::text, true)));


--
-- Name: DailyMetric tenant_isolation_daily_metric; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_daily_metric ON public."DailyMetric" USING (("tenantId" = current_setting('app.tenant_id'::text, true)));


--
-- Name: DashboardWidget tenant_isolation_dashboard_widget; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_dashboard_widget ON public."DashboardWidget" USING (("tenantId" = current_setting('app.tenant_id'::text, true))) WITH CHECK (("tenantId" = current_setting('app.tenant_id'::text, true)));


--
-- Name: DataRetentionPolicy tenant_isolation_data_retention_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_data_retention_policy ON public."DataRetentionPolicy" USING (("tenantId" = current_setting('app.tenant_id'::text, true))) WITH CHECK (("tenantId" = current_setting('app.tenant_id'::text, true)));


--
-- Name: DomainEventOutbox tenant_isolation_domain_event_outbox; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_domain_event_outbox ON public."DomainEventOutbox" USING (("tenantId" = current_setting('app.tenant_id'::text, true)));


--
-- Name: ExportRequest tenant_isolation_export_request; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_export_request ON public."ExportRequest" USING (("tenantId" = current_setting('app.tenant_id'::text, true))) WITH CHECK (("tenantId" = current_setting('app.tenant_id'::text, true)));


--
-- Name: FieldDefinition tenant_isolation_field_definition; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_field_definition ON public."FieldDefinition" USING (("tenantId" = current_setting('app.tenant_id'::text, true)));


--
-- Name: FieldDependencyRule tenant_isolation_field_dependency_rule; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_field_dependency_rule ON public."FieldDependencyRule" USING (("tenantId" = current_setting('app.tenant_id'::text, true))) WITH CHECK (("tenantId" = current_setting('app.tenant_id'::text, true)));


--
-- Name: FieldGroup tenant_isolation_field_group; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_field_group ON public."FieldGroup" USING (("tenantId" = current_setting('app.tenant_id'::text, true))) WITH CHECK (("tenantId" = current_setting('app.tenant_id'::text, true)));


--
-- Name: FieldPermissionV2 tenant_isolation_field_permission_v2; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_field_permission_v2 ON public."FieldPermissionV2" USING ((EXISTS ( SELECT 1
   FROM (public."Role" r
     JOIN public."FieldDefinition" f ON ((f.id = "FieldPermissionV2"."fieldId")))
  WHERE ((r.id = "FieldPermissionV2"."roleId") AND (r."tenantId" = current_setting('app.tenant_id'::text, true)) AND (f."tenantId" = current_setting('app.tenant_id'::text, true)))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM (public."Role" r
     JOIN public."FieldDefinition" f ON ((f.id = "FieldPermissionV2"."fieldId")))
  WHERE ((r.id = "FieldPermissionV2"."roleId") AND (r."tenantId" = current_setting('app.tenant_id'::text, true)) AND (f."tenantId" = current_setting('app.tenant_id'::text, true))))));


--
-- Name: FieldValidationRule tenant_isolation_field_validation_rule; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_field_validation_rule ON public."FieldValidationRule" USING (("tenantId" = current_setting('app.tenant_id'::text, true))) WITH CHECK (("tenantId" = current_setting('app.tenant_id'::text, true)));


--
-- Name: FileObject tenant_isolation_file_object; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_file_object ON public."FileObject" USING (("tenantId" = current_setting('app.tenant_id'::text, true))) WITH CHECK (("tenantId" = current_setting('app.tenant_id'::text, true)));


--
-- Name: Form tenant_isolation_form; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_form ON public."Form" USING (("tenantId" = current_setting('app.tenant_id'::text, true)));


--
-- Name: FormSubmission tenant_isolation_form_submission; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_form_submission ON public."FormSubmission" USING (("tenantId" = current_setting('app.tenant_id'::text, true)));


--
-- Name: GamificationPointsLedger tenant_isolation_gamification_points_ledger; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_gamification_points_ledger ON public."GamificationPointsLedger" USING (("tenantId" = current_setting('app.tenant_id'::text, true))) WITH CHECK (("tenantId" = current_setting('app.tenant_id'::text, true)));


--
-- Name: GamificationRedemption tenant_isolation_gamification_redemption; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_gamification_redemption ON public."GamificationRedemption" USING (("tenantId" = current_setting('app.tenant_id'::text, true))) WITH CHECK (("tenantId" = current_setting('app.tenant_id'::text, true)));


--
-- Name: GamificationRule tenant_isolation_gamification_rule; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_gamification_rule ON public."GamificationRule" USING (("tenantId" = current_setting('app.tenant_id'::text, true))) WITH CHECK (("tenantId" = current_setting('app.tenant_id'::text, true)));


--
-- Name: GamificationSettings tenant_isolation_gamification_settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_gamification_settings ON public."GamificationSettings" USING (("tenantId" = current_setting('app.tenant_id'::text, true))) WITH CHECK (("tenantId" = current_setting('app.tenant_id'::text, true)));


--
-- Name: GDPRRequest tenant_isolation_gdpr_request; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_gdpr_request ON public."GDPRRequest" USING (("tenantId" = current_setting('app.tenant_id'::text, true))) WITH CHECK (("tenantId" = current_setting('app.tenant_id'::text, true)));


--
-- Name: ImportJob tenant_isolation_import_job; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_import_job ON public."ImportJob" USING (("tenantId" = (auth.jwt() ->> 'tenantId'::text))) WITH CHECK (("tenantId" = (auth.jwt() ->> 'tenantId'::text)));


--
-- Name: IntegrationSetting tenant_isolation_integration_setting; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_integration_setting ON public."IntegrationSetting" USING (("tenantId" = (auth.jwt() ->> 'tenantId'::text))) WITH CHECK (("tenantId" = (auth.jwt() ->> 'tenantId'::text)));


--
-- Name: LayoutDefinition tenant_isolation_layout_definition; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_layout_definition ON public."LayoutDefinition" USING (("tenantId" = current_setting('app.tenant_id'::text, true))) WITH CHECK (("tenantId" = current_setting('app.tenant_id'::text, true)));


--
-- Name: Lead tenant_isolation_lead; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_lead ON public."Lead" USING (("tenantId" = current_setting('app.tenant_id'::text, true)));


--
-- Name: LeadList tenant_isolation_lead_list; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_lead_list ON public."LeadList" USING (("tenantId" = (auth.jwt() ->> 'tenantId'::text))) WITH CHECK (("tenantId" = (auth.jwt() ->> 'tenantId'::text)));


--
-- Name: LeadListMember tenant_isolation_lead_list_member; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_lead_list_member ON public."LeadListMember" USING (("tenantId" = (auth.jwt() ->> 'tenantId'::text))) WITH CHECK (("tenantId" = (auth.jwt() ->> 'tenantId'::text)));


--
-- Name: ObjectDefinition tenant_isolation_object_definition; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_object_definition ON public."ObjectDefinition" USING (("tenantId" = current_setting('app.tenant_id'::text, true)));


--
-- Name: ObjectPermission tenant_isolation_object_permission; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_object_permission ON public."ObjectPermission" USING (("tenantId" = current_setting('app.tenant_id'::text, true))) WITH CHECK (("tenantId" = current_setting('app.tenant_id'::text, true)));


--
-- Name: ObjectRelationship tenant_isolation_object_relationship; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_object_relationship ON public."ObjectRelationship" USING (("tenantId" = current_setting('app.tenant_id'::text, true))) WITH CHECK (("tenantId" = current_setting('app.tenant_id'::text, true)));


--
-- Name: Opportunity tenant_isolation_opportunity; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_opportunity ON public."Opportunity" USING (("tenantId" = current_setting('app.tenant_id'::text, true)));


--
-- Name: OpportunityType tenant_isolation_opportunity_type; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_opportunity_type ON public."OpportunityType" USING (("tenantId" = current_setting('app.tenant_id'::text, true))) WITH CHECK (("tenantId" = current_setting('app.tenant_id'::text, true)));


--
-- Name: PartnerInvoice tenant_isolation_partner_invoice; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_partner_invoice ON public."PartnerInvoice" USING (("tenantId" = current_setting('app.tenant_id'::text, true))) WITH CHECK (("tenantId" = current_setting('app.tenant_id'::text, true)));


--
-- Name: PartnerInvoiceTemplate tenant_isolation_partner_invoice_template; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_partner_invoice_template ON public."PartnerInvoiceTemplate" USING (("tenantId" = current_setting('app.tenant_id'::text, true))) WITH CHECK (("tenantId" = current_setting('app.tenant_id'::text, true)));


--
-- Name: PartnerOrganization tenant_isolation_partner_organization; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_partner_organization ON public."PartnerOrganization" USING (("tenantId" = current_setting('app.tenant_id'::text, true))) WITH CHECK (("tenantId" = current_setting('app.tenant_id'::text, true)));


--
-- Name: PartnerPayoutSettings tenant_isolation_partner_payout_settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_partner_payout_settings ON public."PartnerPayoutSettings" USING (("tenantId" = current_setting('app.tenant_id'::text, true))) WITH CHECK (("tenantId" = current_setting('app.tenant_id'::text, true)));


--
-- Name: PartnerProfile tenant_isolation_partner_profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_partner_profile ON public."PartnerProfile" USING (("tenantId" = current_setting('app.tenant_id'::text, true))) WITH CHECK (("tenantId" = current_setting('app.tenant_id'::text, true)));


--
-- Name: Payout tenant_isolation_payout; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_payout ON public."Payout" USING (("tenantId" = current_setting('app.tenant_id'::text, true))) WITH CHECK (("tenantId" = current_setting('app.tenant_id'::text, true)));


--
-- Name: PayoutCycle tenant_isolation_payout_cycle; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_payout_cycle ON public."PayoutCycle" USING (("tenantId" = current_setting('app.tenant_id'::text, true))) WITH CHECK (("tenantId" = current_setting('app.tenant_id'::text, true)));


--
-- Name: PermissionTemplate tenant_isolation_permission_template; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_permission_template ON public."PermissionTemplate" USING (("tenantId" = (auth.jwt() ->> 'tenantId'::text))) WITH CHECK (("tenantId" = (auth.jwt() ->> 'tenantId'::text)));


--
-- Name: PlanUpgradeHistory tenant_isolation_plan_upgrade_history; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_plan_upgrade_history ON public."PlanUpgradeHistory" USING (("tenantId" = current_setting('app.tenant_id'::text, true))) WITH CHECK (("tenantId" = current_setting('app.tenant_id'::text, true)));


--
-- Name: RecordScore tenant_isolation_record_score; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_record_score ON public."RecordScore" USING (("tenantId" = current_setting('app.tenant_id'::text, true))) WITH CHECK (("tenantId" = current_setting('app.tenant_id'::text, true)));


--
-- Name: RecordScoreHistory tenant_isolation_record_score_history; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_record_score_history ON public."RecordScoreHistory" USING (("tenantId" = current_setting('app.tenant_id'::text, true))) WITH CHECK (("tenantId" = current_setting('app.tenant_id'::text, true)));


--
-- Name: RecordVisibilityRule tenant_isolation_record_visibility_rule; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_record_visibility_rule ON public."RecordVisibilityRule" USING (("tenantId" = current_setting('app.tenant_id'::text, true))) WITH CHECK (("tenantId" = current_setting('app.tenant_id'::text, true)));


--
-- Name: ReportDefinition tenant_isolation_report_definition; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_report_definition ON public."ReportDefinition" USING ((("tenantId" = current_setting('app.tenant_id'::text, true)) OR ("tenantId" IS NULL))) WITH CHECK ((("tenantId" = current_setting('app.tenant_id'::text, true)) OR ("tenantId" IS NULL)));


--
-- Name: ReportEmailDelivery tenant_isolation_report_email_delivery; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_report_email_delivery ON public."ReportEmailDelivery" USING (("tenantId" = current_setting('app.tenant_id'::text, true))) WITH CHECK (("tenantId" = current_setting('app.tenant_id'::text, true)));


--
-- Name: ReportRefreshJob tenant_isolation_report_refresh_job; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_report_refresh_job ON public."ReportRefreshJob" USING (("tenantId" = current_setting('app.tenant_id'::text, true))) WITH CHECK (("tenantId" = current_setting('app.tenant_id'::text, true)));


--
-- Name: ReportRefreshState tenant_isolation_report_refresh_state; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_report_refresh_state ON public."ReportRefreshState" USING (("tenantId" = current_setting('app.tenant_id'::text, true))) WITH CHECK (("tenantId" = current_setting('app.tenant_id'::text, true)));


--
-- Name: ReportRollup tenant_isolation_report_rollup; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_report_rollup ON public."ReportRollup" USING (("tenantId" = current_setting('app.tenant_id'::text, true))) WITH CHECK (("tenantId" = current_setting('app.tenant_id'::text, true)));


--
-- Name: ReportSchedule tenant_isolation_report_schedule; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_report_schedule ON public."ReportSchedule" USING (("tenantId" = current_setting('app.tenant_id'::text, true))) WITH CHECK (("tenantId" = current_setting('app.tenant_id'::text, true)));


--
-- Name: ReportingOutbox tenant_isolation_reporting_outbox; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_reporting_outbox ON public."ReportingOutbox" USING (("tenantId" = current_setting('app.tenant_id'::text, true)));


--
-- Name: Role tenant_isolation_role; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_role ON public."Role" USING ((("tenantId" = current_setting('app.tenant_id'::text, true)) OR ("tenantId" IS NULL)));


--
-- Name: SalesGroupMember tenant_isolation_sales_group_member; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_sales_group_member ON public."SalesGroupMember" USING (("tenantId" = current_setting('app.tenant_id'::text, true))) WITH CHECK (("tenantId" = current_setting('app.tenant_id'::text, true)));


--
-- Name: ScoringFeatureSnapshot tenant_isolation_scoring_feature_snapshot; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_scoring_feature_snapshot ON public."ScoringFeatureSnapshot" USING (("tenantId" = current_setting('app.tenant_id'::text, true))) WITH CHECK (("tenantId" = current_setting('app.tenant_id'::text, true)));


--
-- Name: ScoringModel tenant_isolation_scoring_model; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_scoring_model ON public."ScoringModel" USING (("tenantId" = current_setting('app.tenant_id'::text, true))) WITH CHECK (("tenantId" = current_setting('app.tenant_id'::text, true)));


--
-- Name: ScoringModelVersion tenant_isolation_scoring_model_version; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_scoring_model_version ON public."ScoringModelVersion" USING (("tenantId" = current_setting('app.tenant_id'::text, true))) WITH CHECK (("tenantId" = current_setting('app.tenant_id'::text, true)));


--
-- Name: ScoringSettings tenant_isolation_scoring_settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_scoring_settings ON public."ScoringSettings" USING (("tenantId" = current_setting('app.tenant_id'::text, true))) WITH CHECK (("tenantId" = current_setting('app.tenant_id'::text, true)));


--
-- Name: ScoringTrainingRun tenant_isolation_scoring_training_run; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_scoring_training_run ON public."ScoringTrainingRun" USING (("tenantId" = current_setting('app.tenant_id'::text, true))) WITH CHECK (("tenantId" = current_setting('app.tenant_id'::text, true)));


--
-- Name: SalesGroup tenant_isolation_search_group; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_search_group ON public."SalesGroup" USING (("tenantId" = current_setting('app.tenant_id'::text, true)));


--
-- Name: SearchOutbox tenant_isolation_search_outbox; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_search_outbox ON public."SearchOutbox" USING (("tenantId" = current_setting('app.tenant_id'::text, true)));


--
-- Name: SecurityPolicy tenant_isolation_security_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_security_policy ON public."SecurityPolicy" USING (("tenantId" = current_setting('app.tenant_id'::text, true))) WITH CHECK (("tenantId" = current_setting('app.tenant_id'::text, true)));


--
-- Name: SenderIdentity tenant_isolation_sender_identity; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_sender_identity ON public."SenderIdentity" USING (("tenantId" = current_setting('app.tenant_id'::text, true))) WITH CHECK (("tenantId" = current_setting('app.tenant_id'::text, true)));


--
-- Name: StageDefinition tenant_isolation_stage_definition; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_stage_definition ON public."StageDefinition" USING (("tenantId" = current_setting('app.tenant_id'::text, true))) WITH CHECK (("tenantId" = current_setting('app.tenant_id'::text, true)));


--
-- Name: Task tenant_isolation_task; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_task ON public."Task" USING (("tenantId" = current_setting('app.tenant_id'::text, true))) WITH CHECK (("tenantId" = current_setting('app.tenant_id'::text, true)));


--
-- Name: Team tenant_isolation_team; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_team ON public."Team" USING (("tenantId" = (auth.jwt() ->> 'tenantId'::text))) WITH CHECK (("tenantId" = (auth.jwt() ->> 'tenantId'::text)));


--
-- Name: TeamMember tenant_isolation_team_member; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_team_member ON public."TeamMember" USING (("tenantId" = (auth.jwt() ->> 'tenantId'::text))) WITH CHECK (("tenantId" = (auth.jwt() ->> 'tenantId'::text)));


--
-- Name: TelephonyCallLog tenant_isolation_telephony_call_log; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_telephony_call_log ON public."TelephonyCallLog" USING (("tenantId" = (auth.jwt() ->> 'tenantId'::text))) WITH CHECK (("tenantId" = (auth.jwt() ->> 'tenantId'::text)));


--
-- Name: Tenant tenant_isolation_tenant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_tenant ON public."Tenant" USING ((id = current_setting('app.tenant_id'::text, true)));


--
-- Name: TenantConfig tenant_isolation_tenant_config; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_tenant_config ON public."TenantConfig" USING (("tenantId" = current_setting('app.tenant_id'::text, true)));


--
-- Name: TenantFeature tenant_isolation_tenant_feature; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_tenant_feature ON public."TenantFeature" USING (("tenantId" = current_setting('app.tenant_id'::text, true))) WITH CHECK (("tenantId" = current_setting('app.tenant_id'::text, true)));


--
-- Name: User tenant_isolation_user; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_user ON public."User" USING (("tenantId" = current_setting('app.tenant_id'::text, true)));


--
-- Name: UserBadge tenant_isolation_user_badge; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_user_badge ON public."UserBadge" USING (("tenantId" = current_setting('app.tenant_id'::text, true))) WITH CHECK (("tenantId" = current_setting('app.tenant_id'::text, true)));


--
-- Name: WebhookOutbox tenant_isolation_webhook_outbox; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_webhook_outbox ON public."WebhookOutbox" USING (("tenantId" = current_setting('app.tenant_id'::text, true)));


--
-- Name: WebhookSubscription tenant_isolation_webhook_subscription; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_webhook_subscription ON public."WebhookSubscription" USING (("tenantId" = (auth.jwt() ->> 'tenantId'::text))) WITH CHECK (("tenantId" = (auth.jwt() ->> 'tenantId'::text)));


--
-- PostgreSQL database dump complete
--


