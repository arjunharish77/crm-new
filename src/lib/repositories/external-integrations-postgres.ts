import { randomUUID } from "crypto";
import { execute, query, queryOne, type Queryable } from "@/lib/db/query";
import { DatabaseError } from "@/lib/db/errors";

type TenantUser = {
  id: string;
  tenantId: string | null;
};

const REDACTED = "[REDACTED]";
const PUSH_TIMEOUT_MS = 15_000;

export type IntegrationConfig = {
  payloadTemplate: string;
  headers?: Record<string, string>;
  queryParams?: Record<string, string>;
  apiKeyHeaderName?: string;
  apiKeyQueryParamName?: string;
};

export type IntegrationSecretConfig = {
  apiKey?: string;
  bearerToken?: string;
  basicUsername?: string;
  basicPassword?: string;
};

function tenantWhere(user: TenantUser, startIndex = 1) {
  if (!user.tenantId) throw new Error("TENANT_REQUIRED");
  return { sql: `"tenantId" = $${startIndex}`, values: [user.tenantId] };
}

export async function listExternalIntegrationsForTenant(user: TenantUser) {
  const tenant = tenantWhere(user);
  return query<any>(
    `select id, "tenantId", name, "targetSystem", "endpointUrl", "httpMethod", "authType", config, "isActive", "createdAt", "updatedAt"
     from "ExternalIntegration" where ${tenant.sql} order by "createdAt" desc`,
    tenant.values,
  );
}

export async function getExternalIntegrationForTenant(user: TenantUser, id: string) {
  const tenant = tenantWhere(user, 2);
  return queryOne<any>(
    `select id, "tenantId", name, "targetSystem", "endpointUrl", "httpMethod", "authType", config, "isActive", "createdAt", "updatedAt"
     from "ExternalIntegration" where id = $1 and ${tenant.sql} limit 1`,
    [id, ...tenant.values],
  );
}

export async function createExternalIntegrationForTenant(user: TenantUser, payload: Record<string, unknown>) {
  if (!user.tenantId) throw new Error("TENANT_REQUIRED");
  const now = new Date().toISOString();
  try {
    const created = await queryOne<any>(
      `insert into "ExternalIntegration"
        (id, "tenantId", name, "targetSystem", "endpointUrl", "httpMethod", "authType", config, "secretConfig", "isActive", "createdBy", "updatedBy", "createdAt", "updatedAt")
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$11,$12,$12)
       returning id, "tenantId", name, "targetSystem", "endpointUrl", "httpMethod", "authType", config, "isActive", "createdAt", "updatedAt"`,
      [
        randomUUID(),
        user.tenantId,
        String(payload.name ?? "").trim(),
        payload.targetSystem ? String(payload.targetSystem) : null,
        String(payload.endpointUrl ?? "").trim(),
        String(payload.httpMethod ?? "POST").toUpperCase(),
        String(payload.authType ?? "NONE"),
        normalizeConfig(payload.config),
        normalizeSecretConfig(payload.secretConfig),
        payload.isActive !== false,
        user.id,
        now,
      ],
    );
    return created;
  } catch (error) {
    if (error instanceof DatabaseError && error.code === "23505") {
      throw new Error("DUPLICATE_INTEGRATION_NAME");
    }
    throw error;
  }
}

export async function updateExternalIntegrationForTenant(user: TenantUser, id: string, payload: Record<string, unknown>) {
  const tenant = tenantWhere(user, 2);
  const columns: string[] = [];
  const values: unknown[] = [];
  let index = 3;

  const setColumn = (column: string, value: unknown) => {
    columns.push(`"${column}" = $${index}`);
    values.push(value);
    index += 1;
  };

  if (payload.name !== undefined) setColumn("name", String(payload.name).trim());
  if (payload.targetSystem !== undefined) setColumn("targetSystem", payload.targetSystem ? String(payload.targetSystem) : null);
  if (payload.endpointUrl !== undefined) setColumn("endpointUrl", String(payload.endpointUrl).trim());
  if (payload.httpMethod !== undefined) setColumn("httpMethod", String(payload.httpMethod).toUpperCase());
  if (payload.authType !== undefined) setColumn("authType", String(payload.authType));
  if (payload.config !== undefined) setColumn("config", normalizeConfig(payload.config));
  if (payload.secretConfig !== undefined) setColumn("secretConfig", normalizeSecretConfig(payload.secretConfig));
  if (payload.isActive !== undefined) setColumn("isActive", Boolean(payload.isActive));
  setColumn("updatedBy", user.id);
  columns.push(`"updatedAt" = $${index}`);
  values.push(new Date().toISOString());

  try {
    const updated = await queryOne<any>(
      `update "ExternalIntegration" set ${columns.join(", ")}
       where id = $1 and ${tenant.sql}
       returning id, "tenantId", name, "targetSystem", "endpointUrl", "httpMethod", "authType", config, "isActive", "createdAt", "updatedAt"`,
      [id, ...tenant.values, ...values],
    );
    return updated;
  } catch (error) {
    if (error instanceof DatabaseError && error.code === "23505") {
      throw new Error("DUPLICATE_INTEGRATION_NAME");
    }
    throw error;
  }
}

export async function deleteExternalIntegrationForTenant(user: TenantUser, id: string) {
  const tenant = tenantWhere(user, 2);
  const count = await execute(`delete from "ExternalIntegration" where id = $1 and ${tenant.sql}`, [id, ...tenant.values]);
  return count > 0;
}

function normalizeConfig(input: unknown): IntegrationConfig {
  const source = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  return {
    payloadTemplate: typeof source.payloadTemplate === "string" ? source.payloadTemplate : "{}",
    headers: isStringRecord(source.headers) ? source.headers : undefined,
    queryParams: isStringRecord(source.queryParams) ? source.queryParams : undefined,
    apiKeyHeaderName: typeof source.apiKeyHeaderName === "string" ? source.apiKeyHeaderName : undefined,
    apiKeyQueryParamName: typeof source.apiKeyQueryParamName === "string" ? source.apiKeyQueryParamName : undefined,
  };
}

function normalizeSecretConfig(input: unknown): IntegrationSecretConfig {
  const source = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  return {
    apiKey: typeof source.apiKey === "string" ? source.apiKey : undefined,
    bearerToken: typeof source.bearerToken === "string" ? source.bearerToken : undefined,
    basicUsername: typeof source.basicUsername === "string" ? source.basicUsername : undefined,
    basicPassword: typeof source.basicPassword === "string" ? source.basicPassword : undefined,
  };
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

// Templates use the same {{key}} token pattern as the rest of the app (see renderTemplate in
// communications.ts) but MUST parse the template as JSON first and substitute typed values into
// the resulting object, rather than doing a raw string .replace() -- renderTemplate has zero
// JSON-escaping, so a Lead name containing a `"` would corrupt the JSON before it's even parsed.
function substituteTemplateValue(value: unknown, tokens: Record<string, unknown>, unresolved: Set<string>): unknown {
  if (typeof value === "string") {
    const exactMatch = value.match(/^\{\{\s*([\w.]+)\s*\}\}$/);
    if (exactMatch) {
      const key = exactMatch[1];
      if (!(key in tokens)) {
        unresolved.add(key);
        return "";
      }
      return tokens[key] ?? "";
    }
    return value.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_match, key) => {
      if (!(key in tokens)) {
        unresolved.add(key);
        return "";
      }
      return String(tokens[key] ?? "");
    });
  }
  if (Array.isArray(value)) return value.map((item) => substituteTemplateValue(item, tokens, unresolved));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, substituteTemplateValue(item, tokens, unresolved)]));
  }
  return value;
}

function buildPushBody(payloadTemplate: string, tokens: Record<string, unknown>) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(payloadTemplate && payloadTemplate.trim() ? payloadTemplate : "{}");
  } catch {
    throw new Error("INVALID_PAYLOAD_TEMPLATE");
  }
  const unresolved = new Set<string>();
  const body = substituteTemplateValue(parsed, tokens, unresolved);
  return { body, unresolvedTokens: Array.from(unresolved) };
}

async function resolvePushTokens(tenantId: string, leadId: string | null, opportunityId: string | null, client?: Queryable) {
  const tokens: Record<string, unknown> = {};
  if (leadId) {
    const lead = await queryOne<Record<string, unknown>>('select * from "Lead" where "tenantId" = $1 and id = $2 limit 1', [tenantId, leadId], client);
    if (!lead) throw new Error("LEAD_NOT_FOUND");
    for (const [key, value] of Object.entries(lead)) tokens[`lead.${key}`] = value;
  }
  if (opportunityId) {
    const opportunity = await queryOne<Record<string, unknown>>('select * from "Opportunity" where "tenantId" = $1 and id = $2 limit 1', [tenantId, opportunityId], client);
    if (!opportunity) throw new Error("OPPORTUNITY_NOT_FOUND");
    for (const [key, value] of Object.entries(opportunity)) tokens[`opportunity.${key}`] = value;
  }
  return tokens;
}

function redactedSecretConfig(): IntegrationSecretConfig {
  return { apiKey: REDACTED, bearerToken: REDACTED, basicUsername: REDACTED, basicPassword: REDACTED };
}

function buildRequestUrl(integration: { endpointUrl: string; authType: string; config: IntegrationConfig; secretConfig: IntegrationSecretConfig }) {
  const url = new URL(integration.endpointUrl);
  for (const [key, value] of Object.entries(integration.config?.queryParams ?? {})) url.searchParams.set(key, value);
  if (integration.authType === "API_KEY_QUERY") {
    const paramName = integration.config?.apiKeyQueryParamName || "api_key";
    url.searchParams.set(paramName, integration.secretConfig?.apiKey || "");
  }
  return url;
}

function buildRequestHeaders(integration: { authType: string; config: IntegrationConfig; secretConfig: IntegrationSecretConfig }) {
  const headers: Record<string, string> = { "Content-Type": "application/json", ...(integration.config?.headers ?? {}) };
  if (integration.authType === "API_KEY_HEADER") {
    headers[integration.config?.apiKeyHeaderName || "X-API-Key"] = integration.secretConfig?.apiKey || "";
  } else if (integration.authType === "BEARER") {
    headers.Authorization = `Bearer ${integration.secretConfig?.bearerToken || ""}`;
  } else if (integration.authType === "BASIC") {
    const encoded = Buffer.from(`${integration.secretConfig?.basicUsername || ""}:${integration.secretConfig?.basicPassword || ""}`).toString("base64");
    headers.Authorization = `Basic ${encoded}`;
  }
  return headers;
}

function extractExternalRecordId(responseBody: unknown): string | null {
  if (!responseBody || typeof responseBody !== "object" || Array.isArray(responseBody)) return null;
  const record = responseBody as Record<string, unknown>;
  for (const key of ["id", "Id", "ID", "recordId", "leadId", "Message"]) {
    if (typeof record[key] === "string" || typeof record[key] === "number") return String(record[key]);
  }
  return null;
}

function tryParseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function resolveExternalPushRequest(
  tenantId: string,
  integration: any,
  leadId: string | null,
  opportunityId: string | null,
) {
  const tokens = await resolvePushTokens(tenantId, leadId, opportunityId);
  const { body, unresolvedTokens } = buildPushBody(integration.config?.payloadTemplate ?? "{}", tokens);
  const method = String(integration.httpMethod || "POST").toUpperCase();
  const url = buildRequestUrl(integration);
  const headers = buildRequestHeaders(integration);
  const redactedIntegration = { ...integration, secretConfig: redactedSecretConfig() };
  const redactedUrl = buildRequestUrl(redactedIntegration);
  const redactedHeaders = buildRequestHeaders(redactedIntegration);
  return { method, url, headers, redactedUrl, redactedHeaders, body, unresolvedTokens };
}

// Loads a real, active ExternalIntegration scoped to this tenant -- the tenantId filter here IS
// the tenant-isolation check: a leadId/opportunityId from another tenant simply won't resolve in
// resolvePushTokens (also tenant-scoped), so cross-tenant data can never leak into a push.
async function loadActiveIntegration(user: TenantUser, integrationId: string) {
  if (!user.tenantId) throw new Error("TENANT_REQUIRED");
  const integration = await queryOne<any>(
    'select * from "ExternalIntegration" where "tenantId" = $1 and id = $2 and "isActive" = true limit 1',
    [user.tenantId, integrationId],
  );
  if (!integration) throw new Error("INTEGRATION_NOT_FOUND");
  return integration;
}

export async function previewExternalIntegrationPush(
  user: TenantUser,
  integrationId: string,
  input: { leadId?: string | null; opportunityId?: string | null },
) {
  const integration = await loadActiveIntegration(user, integrationId);
  const resolved = await resolveExternalPushRequest(user.tenantId as string, integration, input.leadId ?? null, input.opportunityId ?? null);
  return {
    method: resolved.method,
    url: resolved.redactedUrl.toString(),
    headers: resolved.redactedHeaders,
    body: resolved.body,
    unresolvedTokens: resolved.unresolvedTokens,
    authType: integration.authType,
  };
}

export async function pushExternalIntegration(
  user: TenantUser,
  integrationId: string,
  input: { leadId?: string | null; opportunityId?: string | null },
) {
  const integration = await loadActiveIntegration(user, integrationId);
  const leadId = input.leadId ?? null;
  const opportunityId = input.opportunityId ?? null;
  const resolved = await resolveExternalPushRequest(user.tenantId as string, integration, leadId, opportunityId);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PUSH_TIMEOUT_MS);

  let status: "SUCCESS" | "FAILED" = "FAILED";
  let responseStatusCode: number | null = null;
  let responseBody: unknown = null;
  let externalRecordId: string | null = null;
  let errorMessage: string | null = null;

  try {
    const response = await fetch(resolved.url.toString(), {
      method: resolved.method,
      headers: resolved.headers,
      body: resolved.method === "GET" || resolved.method === "HEAD" ? undefined : JSON.stringify(resolved.body),
      signal: controller.signal,
    });
    responseStatusCode = response.status;
    const rawText = await response.text().catch(() => "");
    responseBody = rawText ? tryParseJson(rawText) : null;
    if (response.ok) {
      status = "SUCCESS";
      externalRecordId = extractExternalRecordId(responseBody);
    } else {
      errorMessage = `Request failed with status ${response.status}`;
    }
  } catch (error) {
    // Network failure (DNS, connection refused, timeout abort) has no status/body at all --
    // distinct from an HTTP error status, which is handled in the branch above.
    errorMessage = error instanceof Error ? (error.name === "AbortError" ? "Request timed out" : error.message) : "Network error";
  } finally {
    clearTimeout(timeout);
  }

  const requestPayloadSnapshot = {
    method: resolved.method,
    url: resolved.redactedUrl.toString(),
    headers: resolved.redactedHeaders,
    body: resolved.body,
    unresolvedTokens: resolved.unresolvedTokens,
  };

  const attempt = await queryOne<any>(
    `insert into "ExternalPushAttempt"
      (id, "tenantId", "integrationId", "leadId", "opportunityId", "requestPayload", "responseStatusCode", "responseBody", "externalRecordId", status, "errorMessage", "createdBy", "createdAt")
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     returning *`,
    [
      randomUUID(),
      user.tenantId,
      integration.id,
      leadId,
      opportunityId,
      requestPayloadSnapshot,
      responseStatusCode,
      responseBody,
      externalRecordId,
      status,
      errorMessage,
      user.id,
      new Date().toISOString(),
    ],
  );

  return attempt;
}

export async function listExternalPushAttemptsForRecord(
  user: TenantUser,
  input: { leadId?: string | null; opportunityId?: string | null },
) {
  if (!user.tenantId) throw new Error("TENANT_REQUIRED");
  const leadId = input.leadId ?? null;
  const opportunityId = input.opportunityId ?? null;
  if (!leadId && !opportunityId) return [];

  const values: unknown[] = [user.tenantId];
  const orClauses: string[] = [];
  if (leadId) {
    values.push(leadId);
    orClauses.push(`ep."leadId" = $${values.length}`);
  }
  if (opportunityId) {
    values.push(opportunityId);
    orClauses.push(`ep."opportunityId" = $${values.length}`);
  }
  return query<any>(
    `select ep.*, ei.name as "integrationName"
     from "ExternalPushAttempt" ep
     left join "ExternalIntegration" ei on ei.id = ep."integrationId"
     where ep."tenantId" = $1 and (${orClauses.join(" or ")})
     order by ep."createdAt" desc
     limit 50`,
    values,
  );
}
