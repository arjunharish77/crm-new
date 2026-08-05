import { QueryResultRow } from "pg";
import { query } from "@/lib/db";

export const crmSyncTokens = [
  "{{lead.id}}",
  "{{lead.name}}",
  "{{lead.email}}",
  "{{lead.phone}}",
  "{{lead.city}}",
  "{{lead.sourcePath}}",
  "{{lead.sourcePageType}}",
  "{{lead.utmSource}}",
  "{{lead.utmMedium}}",
  "{{lead.utmCampaign}}",
  "{{lead.utmTerm}}",
  "{{lead.utmContent}}",
  "{{lead.emailVerified}}",
  "{{lead.phoneVerified}}",
  "{{course.id}}",
  "{{course.name}}",
  "{{course.shortName}}",
  "{{course.level}}",
  "{{course.stream}}",
  "{{course.feeInr}}",
  "{{university.id}}",
  "{{university.name}}",
  "{{university.shortName}}",
] as const;

type LeadContextRow = QueryResultRow & {
  id: string;
  name: string;
  email: string;
  phone: string;
  city: string | null;
  source_path: string | null;
  source_page_type: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_term: string | null;
  utm_content: string | null;
  email_otp_verified: boolean;
  phone_otp_verified: boolean;
  course_id: string | null;
  course_name: string | null;
  course_short_name: string | null;
  course_level: string | null;
  course_stream: string | null;
  course_fee_inr: number | null;
  university_id: string | null;
  university_name: string | null;
  university_short_name: string | null;
};

export type CrmSyncConfig = {
  id: string;
  isEnabled: boolean;
  autoPushEnabled: boolean;
  manualPushEnabled: boolean;
  apiBaseUrl: string;
  endpointPath: string;
  httpMethod: "POST" | "PUT" | "PATCH";
  authType: "NONE" | "API_KEY" | "BEARER";
  headersTemplate: Record<string, string>;
  successStatusCodes: number[];
  timeoutMs: number;
  pushOnlyAfterEmailOtp: boolean;
  pushOnlyAfterConsent: boolean;
};

export async function getCrmSyncConfig(): Promise<CrmSyncConfig> {
  const result = await query(
    `select id, is_enabled, auto_push_enabled, manual_push_enabled, api_base_url, endpoint_path,
            http_method, auth_type, headers_template, success_status_codes, timeout_ms,
            push_only_after_email_otp, push_only_after_consent
     from crm_sync_config
     order by created_at
     limit 1`,
  );
  const row = result.rows[0];
  return {
    id: row.id,
    isEnabled: row.is_enabled,
    autoPushEnabled: row.auto_push_enabled,
    manualPushEnabled: row.manual_push_enabled,
    apiBaseUrl: row.api_base_url || "",
    endpointPath: row.endpoint_path || "",
    httpMethod: row.http_method,
    authType: row.auth_type,
    headersTemplate: row.headers_template || {},
    successStatusCodes: row.success_status_codes || [200, 201],
    timeoutMs: row.timeout_ms || 15000,
    pushOnlyAfterEmailOtp: row.push_only_after_email_otp,
    pushOnlyAfterConsent: row.push_only_after_consent,
  };
}

export async function getActiveMapping() {
  const result = await query(
    `select version, name, request_body_template, available_field_snapshot, helper_config
     from crm_sync_mapping
     where is_active = true
     order by version desc
     limit 1`,
  );
  return result.rows[0] || null;
}

export async function getLeadContext(leadId: string) {
  const result = await query<LeadContextRow>(
    `select l.id, l.name, l.email, l.phone, l.city, l.source_path, l.source_page_type,
            l.utm_source, l.utm_medium, l.utm_campaign, l.utm_term, l.utm_content,
            l.email_otp_verified, l.phone_otp_verified,
            c.id as course_id, c.name as course_name, c.short_name as course_short_name,
            c.level as course_level, c.stream as course_stream, c.fee_inr as course_fee_inr,
            u.id as university_id, u.name as university_name, u.short_name as university_short_name
     from lead_capture l
     left join course c on c.id = l.course_id
     left join university u on u.id = coalesce(l.university_id, c.university_id)
     where l.id = $1
     limit 1`,
    [leadId],
  );
  return result.rows[0] || null;
}

function tokenValues(row: LeadContextRow) {
  return {
    "{{lead.id}}": row.id,
    "{{lead.name}}": row.name,
    "{{lead.email}}": row.email,
    "{{lead.phone}}": row.phone,
    "{{lead.city}}": row.city || "",
    "{{lead.sourcePath}}": row.source_path || "",
    "{{lead.sourcePageType}}": row.source_page_type || "",
    "{{lead.utmSource}}": row.utm_source || "",
    "{{lead.utmMedium}}": row.utm_medium || "",
    "{{lead.utmCampaign}}": row.utm_campaign || "",
    "{{lead.utmTerm}}": row.utm_term || "",
    "{{lead.utmContent}}": row.utm_content || "",
    "{{lead.emailVerified}}": String(row.email_otp_verified),
    "{{lead.phoneVerified}}": String(row.phone_otp_verified),
    "{{course.id}}": row.course_id || "",
    "{{course.name}}": row.course_name || "",
    "{{course.shortName}}": row.course_short_name || "",
    "{{course.level}}": row.course_level || "",
    "{{course.stream}}": row.course_stream || "",
    "{{course.feeInr}}": row.course_fee_inr == null ? "" : String(row.course_fee_inr),
    "{{university.id}}": row.university_id || "",
    "{{university.name}}": row.university_name || "",
    "{{university.shortName}}": row.university_short_name || "",
  } satisfies Record<string, string>;
}

export function renderTemplate(value: unknown, row: LeadContextRow): unknown {
  if (typeof value === "string") {
    const values = tokenValues(row);
    return Object.entries(values).reduce((output, [token, replacement]) => output.split(token).join(replacement), value);
  }
  if (Array.isArray(value)) return value.map((item) => renderTemplate(item, row));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, renderTemplate(item, row)]));
  }
  return value;
}

export async function buildCrmPayloadPreview(leadId: string) {
  const lead = await getLeadContext(leadId);
  if (!lead) throw new Error("Lead not found");
  const mapping = await getActiveMapping();
  const template = mapping?.request_body_template || {
    name: "{{lead.name}}",
    email: "{{lead.email}}",
    phone: "{{lead.phone}}",
    courseInterested: "{{course.name}}",
    universityInterested: "{{university.name}}",
    source: "{{lead.sourcePath}}",
  };
  return {
    mappingVersion: mapping?.version || null,
    payload: renderTemplate(template, lead),
  };
}

export async function queueManualCrmPush(leadId: string) {
  const config = await getCrmSyncConfig();
  if (!config.isEnabled || !config.manualPushEnabled) {
    throw new Error("Manual CRM push is disabled in CRM sync settings");
  }

  const preview = await buildCrmPayloadPreview(leadId);
  const created = await query<{ id: string }>(
    `insert into crm_sync_attempt (
       lead_capture_id, trigger_type, status, mapping_version, redacted_request_payload
     )
     values ($1, 'MANUAL', 'QUEUED', $2, $3)
     returning id`,
    [leadId, preview.mappingVersion, preview.payload],
  );
  await query(
    `update lead_capture
     set crm_sync_status = 'QUEUED', last_crm_sync_attempt_at = now(), updated_at = now()
     where id = $1`,
    [leadId],
  );
  return { attemptId: created.rows[0].id, ...preview };
}
