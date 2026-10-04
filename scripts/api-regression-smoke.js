require("dotenv/config");

const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const { Pool } = require("pg");

const baseUrl = process.env.API_BASE_URL || process.env.WORKER_APP_URL || "http://localhost:3000";
const tenantId = process.env.API_SMOKE_TENANT_ID || "tenant_demo";
const preferredUserId = process.env.API_SMOKE_USER_ID || "82c64bde-47de-4d36-8045-45e8488a1a99";
const runId = `api-smoke-${Date.now()}`;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== "false" } : undefined,
});

const state = {
  createdLeadIds: [],
  createdOpportunityIds: [],
  createdActivityIds: [],
  createdTelephonyCallLogIds: [],
  createdActivityTypeIds: [],
  createdLeadListIds: [],
  createdSavedViewIds: [],
  createdWidgetIds: [],
  createdFormIds: [],
  createdExportRequestIds: [],
  createdReportIds: [],
  createdTeamIds: [],
  createdSalesGroupIds: [],
  createdRoleIds: [],
  createdPermissionTemplateIds: [],
  createdCustomFieldIds: [],
  createdWebhookIds: [],
  createdCommunicationDeliveryEventIds: [],
  createdScheduleIds: [],
  createdBadgeIds: [],
  createdGamificationRuleIds: [],
  createdCommissionRuleIds: [],
  createdPayoutCycleIds: [],
  createdPayoutIds: [],
  createdPartnerInvoiceIds: [],
  createdPlatformTenantIds: [],
  createdPlatformTenantUserIds: [],
  payoutSettingsSnapshotCaptured: false,
  payoutSettingsSnapshot: null,
};

const results = [];

function record(name, method, path, status, ok, body) {
  const entry = { name, method, path, status, ok, body: typeof body === "string" ? body.slice(0, 500) : body };
  results.push(entry);
  const marker = ok ? "ok" : "FAIL";
  console.log(`${marker.padEnd(4)} ${String(status).padEnd(3)} ${method.padEnd(6)} ${path} ${name ? `- ${name}` : ""}`);
}

async function discoverContext() {
  const user =
    (
      await pool.query(
        `select u.id, u.email, u.name, u."tenantId", u."roleId"
         from "User" u
         where u.id = $1 and u."tenantId" = $2
         limit 1`,
        [preferredUserId, tenantId],
      )
    ).rows[0] ||
    (
      await pool.query(
        `select u.id, u.email, u.name, u."tenantId", u."roleId"
         from "User" u
         join "Role" r on r.id::text = u."roleId"::text
         where u."tenantId" = $1
           and u.status = 'ACTIVE'
           and (r.permissions->>'recordAccess' = 'ALL' or r.permissions->'modules'->>'admin' = 'full')
         order by u."createdAt" asc
         limit 1`,
        [tenantId],
      )
    ).rows[0];

  if (!user?.id) {
    throw new Error(`No active tenant admin user found for tenant ${tenantId}`);
  }

  const opportunityType = (
    await pool.query(
      `select ot.id, sd.id as "stageId"
       from "OpportunityType" ot
       left join "StageDefinition" sd on sd."tenantId" = ot."tenantId" and sd."opportunityTypeId"::text = ot.id::text
       where ot."tenantId" = $1 and ot."isActive" = true
       order by ot."order" asc, sd."order" asc
       limit 1`,
      [user.tenantId],
    )
  ).rows[0];

  const platformAdmin = (
    await pool.query(
      `select u.id, u.email, u.name, u."tenantId", u."roleId", pa.id as "platformAdminId"
       from "PlatformAdmin" pa
       join "User" u on u.id = pa."userId"
       where pa."isActive" = true and u.status = 'ACTIVE'
       order by pa."createdAt" asc
       limit 1`,
    )
  ).rows[0] || null;

  return { user, opportunityType, platformAdmin };
}

// Sign-in tokens must carry a live session id (round-2 plan S19), so the smoke opens a real
// session row for each user it acts as and removes them afterwards.
const smokeSessions = new Map();

async function openSmokeSession(user) {
  if (!user || smokeSessions.has(user.id)) return;
  const id = `${runId}-session-${smokeSessions.size + 1}`;
  await pool.query(
    `insert into "UserSession" (id, "tenantId", "userId", "isImpersonation", "createdAt", "lastActiveAt", "expiresAt")
     values ($1, $2, $3, false, now(), now(), now() + interval '2 hours')`,
    [id, user.tenantId || null, user.id],
  );
  smokeSessions.set(user.id, id);
}

async function closeSmokeSessions() {
  if (!smokeSessions.size) return;
  await pool.query('delete from "UserSession" where id = any($1::text[])', [[...smokeSessions.values()]]);
}

function authHeaders(user, overrides = {}) {
  const token = jwt.sign(
    {
      sub: user.id,
      sid: smokeSessions.get(user.id),
      email: user.email,
      name: user.name,
      tenantId: user.tenantId,
      roleId: user.roleId,
      isPlatformAdmin: false,
      platformAdminId: null,
      ...overrides,
    },
    process.env.JWT_SECRET || "dev-secret",
    { expiresIn: "2h" },
  );

  return {
    "content-type": "application/json",
    authorization: `Bearer ${token}`,
    cookie: `token=${token}`,
  };
}

async function rawRequest(method, path, body, headers = {}, expected = [200], name = "") {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let data = text;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  const ok = expected.includes(response.status);
  record(name, method, path, response.status, ok, typeof data === "string" ? data : JSON.stringify(data));
  if (!ok) {
    const error = new Error(`${method} ${path} returned ${response.status}: ${typeof data === "string" ? data : JSON.stringify(data)}`);
    error.response = { status: response.status, data };
    throw error;
  }
  return { data, response, text };
}

async function api(user, method, path, body, expected = [200], name = "") {
  const result = await rawRequest(method, path, body, authHeaders(user), expected, name);
  return result.data;
}

async function apiAs(user, tokenOverrides, method, path, body, expected = [200], name = "") {
  const result = await rawRequest(method, path, body, authHeaders(user, tokenOverrides), expected, name);
  return result.data;
}

async function publicApi(method, path, body, headers = {}, expected = [200], name = "") {
  const normalizedHeaders = { "content-type": "application/json", ...headers };
  const result = await rawRequest(method, path, body, normalizedHeaders, expected, name);
  return result.data;
}

async function downloadApi(user, path, expected = [200], name = "") {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "GET",
    headers: authHeaders(user),
  });
  const buffer = Buffer.from(await response.arrayBuffer());
  const ok = expected.includes(response.status);
  record(name, "GET", path, response.status, ok, `bytes=${buffer.length} content-type=${response.headers.get("content-type") || ""}`);
  if (!ok) {
    throw new Error(`GET ${path} returned ${response.status}: ${buffer.toString("utf8", 0, Math.min(buffer.length, 500))}`);
  }
  return { buffer, headers: response.headers };
}

async function safeApi(user, method, path, body, expected, name) {
  try {
    return await api(user, method, path, body, expected, name);
  } catch (error) {
    return null;
  }
}

async function authNegativeSmoke() {
  await publicApi("POST", "/api/auth/login", {}, {}, [400], "login rejects missing credentials");
  await publicApi("POST", "/api/auth/login", {
    email: `${runId}@invalid.example.com`,
    password: "definitely-not-valid",
  }, {}, [401], "login rejects invalid credentials");
  const logout = await rawRequest("POST", "/api/auth/logout", undefined, {}, [200], "logout clears auth cookie");
  const setCookie = logout.response.headers.get("set-cookie") || "";
  if (!setCookie.includes("token=") || !setCookie.toLowerCase().includes("expires=")) {
    throw new Error("Logout did not return a clearing token cookie");
  }

  const bootstrapStatus = await publicApi("GET", "/api/auth/bootstrap/status", undefined, {}, [200], "bootstrap status");
  await publicApi("POST", "/api/auth/bootstrap", {}, {}, [400, 403], "bootstrap rejects missing fields (403 when setup is turned off)");
  if (bootstrapStatus && bootstrapStatus.needsBootstrap === false) {
    await publicApi("POST", "/api/auth/bootstrap", {
      name: `${runId} Platform Admin`,
      email: `${runId}@example.com`,
      password: "TemporaryStrongPass123!",
    }, {}, [400, 403], "bootstrap rejects once completed (403 when setup is turned off)");
  }
}

async function webhookSecretSmoke(user) {
  await publicApi("POST", `/api/integrations/inbound/leads/${user.tenantId}`, {
    name: `${runId} invalid inbound lead`,
  }, { "x-webhook-secret": "wrong-secret" }, [403], "inbound lead webhook rejects bad secret");
  await publicApi("POST", "/api/integrations/telephony/webhook", {
    tenantId: user.tenantId,
    callId: `${runId}-invalid-call`,
  }, { "x-webhook-secret": "wrong-secret" }, [403], "telephony webhook rejects bad secret");
  await publicApi("POST", `/api/communications/webhooks/email?tenantId=${user.tenantId}`, {
    eventType: "DELIVERED",
    providerMessageId: `${runId}-invalid-message`,
  }, { "x-communications-webhook-secret": "wrong-secret" }, [403], "communications webhook rejects bad secret");

  // The old server-wide shared secret is refused (round-2 plan S1); only the workspace's own
  // signed requests (x-webhook-signature over "<timestamp>.<body>") are accepted.
  if (process.env.WEBHOOK_SIGNING_SECRET) {
    await publicApi("POST", `/api/integrations/inbound/leads/${user.tenantId}`, {
      name: `${runId} legacy-secret lead`,
    }, { "x-webhook-secret": process.env.WEBHOOK_SIGNING_SECRET }, [403], "inbound lead webhook refuses the old shared secret");
    await publicApi("POST", "/api/integrations/telephony/webhook", {
      tenantId: user.tenantId,
      callId: `${runId}-legacy-call`,
    }, { "x-webhook-secret": process.env.WEBHOOK_SIGNING_SECRET }, [403], "telephony webhook refuses the old shared secret");
  }
  const signed = (secret, body) => {
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = crypto.createHmac("sha256", secret).update(`${timestamp}.${JSON.stringify(body)}`).digest("hex");
    return { "x-webhook-timestamp": timestamp, "x-webhook-signature": signature };
  };
  const inboundSettings = await api(user, "GET", "/api/integrations/inbound/settings", undefined, [200], "inbound webhook settings (admin)");
  if (inboundSettings?.currentSecret) {
    const leadBody = {
      name: `${runId} Inbound Webhook Lead`,
      email: `${runId}.inbound@example.com`,
      company: "Inbound Smoke",
      status: "NEW",
    };
    const inboundLead = await publicApi("POST", `/api/integrations/inbound/leads/${user.tenantId}`, leadBody, signed(inboundSettings.currentSecret, leadBody), [200], "inbound lead webhook accepts a signed request");
    if (inboundLead?.id) state.createdLeadIds.push(inboundLead.id);
  }
  const telephonySetting = (await pool.query(`select config->>'webhookSecret' as secret from "IntegrationSetting" where "tenantId" = $1 and type = 'TELEPHONY' limit 1`, [user.tenantId])).rows[0];
  if (telephonySetting?.secret) {
    const callBody = {
      tenantId: user.tenantId,
      provider: "SMOKE",
      callId: `${runId}-call`,
      direction: "INBOUND",
      fromNumber: "+15550001000",
      toNumber: "+15550002000",
      status: "COMPLETED",
      duration: 42,
    };
    const telephonyLog = await publicApi("POST", "/api/integrations/telephony/webhook", callBody, signed(telephonySetting.secret, callBody), [200], "telephony webhook accepts a signed request");
    if (telephonyLog?.id) state.createdTelephonyCallLogIds.push(telephonyLog.id);
  } else {
    console.log("skip signed telephony webhook smoke: no telephony webhook secret configured for this workspace");
  }

  if (process.env.COMMUNICATIONS_WEBHOOK_SECRET) {
    const event = await publicApi("POST", `/api/communications/webhooks/email?tenantId=${user.tenantId}`, {
      eventType: "DELIVERED",
      providerMessageId: `${runId}-message`,
      payload: { source: "api-regression-smoke" },
    }, { "x-communications-webhook-secret": process.env.COMMUNICATIONS_WEBHOOK_SECRET }, [200], "communications webhook accepts valid secret");
    if (event?.id) state.createdCommunicationDeliveryEventIds.push(event.id);
  } else {
    console.log("skip valid communications webhook smoke: COMMUNICATIONS_WEBHOOK_SECRET is not set in the smoke process");
  }
}

async function platformAdminSmoke(platformAdmin) {
  if (!platformAdmin?.id) {
    console.log("skip platform-admin smoke: no active platform admin user found");
    return;
  }

  const platformClaims = { isPlatformAdmin: true, platformAdminId: platformAdmin.platformAdminId, tenantId: platformAdmin.tenantId };
  await apiAs(platformAdmin, platformClaims, "GET", "/api/platform-admin/tenants", undefined, [200], "platform admin lists tenants");
  const created = await apiAs(platformAdmin, platformClaims, "POST", "/api/platform-admin/tenants", {
    name: `${runId} Tenant`,
    adminName: `${runId} Tenant Admin`,
    adminEmail: `${runId}.tenant-admin@example.com`,
    adminPassword: "TemporaryStrongPass123!",
  }, [200], "platform admin creates tenant");
  if (!created?.tenantId || !created?.userId) throw new Error("Platform tenant create response did not include tenantId/userId");
  state.createdPlatformTenantIds.push(created.tenantId);
  state.createdPlatformTenantUserIds.push(created.userId);

  await apiAs(platformAdmin, platformClaims, "GET", `/api/platform-admin/tenants/${created.tenantId}/users`, undefined, [200], "platform admin lists tenant users");
  await apiAs(platformAdmin, platformClaims, "POST", `/api/platform-admin/tenants/${created.tenantId}/suspend`, {}, [400], "suspending a tenant needs a reason");
  await apiAs(platformAdmin, platformClaims, "POST", `/api/platform-admin/tenants/${created.tenantId}/suspend`, { reason: "API regression smoke" }, [200], "platform admin suspends tenant");
  await apiAs(platformAdmin, platformClaims, "POST", `/api/platform-admin/tenants/${created.tenantId}/unsuspend`, {}, [200], "platform admin unsuspends tenant");
  // The impersonation session is set as an HttpOnly cookie, never returned in the body.
  const impersonation = await rawRequest("POST", "/api/platform-admin/impersonate", {
    tenantId: created.tenantId,
    userId: created.userId,
    reason: `${runId} regression check`,
  }, authHeaders(platformAdmin, platformClaims), [200], "platform admin impersonates tenant user");
  const sessionCookie = impersonation.response.headers.getSetCookie().find((cookie) => cookie.startsWith("token=")) || "";
  if (!/^token=[^;]+;.*;\s*HttpOnly(;|$)/i.test(sessionCookie)) {
    throw new Error("Impersonation didn't set an HttpOnly session cookie");
  }
  if (impersonation.data?.access_token || impersonation.data?.token) {
    throw new Error("Impersonation returned the session token in the response body");
  }
  // While impersonating, records can be read but sign-in and access settings can't be changed (S11).
  const impersonatedCookie = sessionCookie.split(";")[0];
  const impersonatedHeaders = { "content-type": "application/json", cookie: impersonatedCookie };
  await rawRequest("GET", "/api/auth/me", undefined, impersonatedHeaders, [200], "impersonation session can read");
  await rawRequest("POST", "/api/auth/change-password", { currentPassword: "x", newPassword: "TemporaryStrongPass456!" }, impersonatedHeaders, [403], "impersonation cannot change the password");
  await rawRequest("POST", "/api/roles", { name: `${runId} role` }, impersonatedHeaders, [403], "impersonation cannot create roles");
  // A token without a session id is refused (S19).
  const noSession = jwt.sign({ sub: platformAdmin.id, email: platformAdmin.email, isPlatformAdmin: true }, process.env.JWT_SECRET || "dev-secret", { expiresIn: "5m" });
  await rawRequest("GET", "/api/auth/me", undefined, { authorization: `Bearer ${noSession}` }, [401], "token without a session id is refused");
}

async function createSmokePayout(user, partnerId, suffix, amount = 2500) {
  const cycleId = `${runId}-${suffix}-cycle`;
  const payoutId = `${runId}-${suffix}-payout`;
  const now = new Date();
  const start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const end = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
  await pool.query(
    `insert into "PayoutCycle" (id, "tenantId", "cycleLabel", "startDate", "endDate", status, "generatedAt", "createdBy", "createdAt")
     values ($1, $2, $3, $4, $5, 'OPEN', $6, $7, $6)`,
    [cycleId, user.tenantId, `${runId} ${suffix}`, start, end, now.toISOString(), user.id],
  );
  await pool.query(
    `insert into "Payout" (id, "tenantId", "payoutCycleId", "partnerId", "totalCommissionAmount", status, "createdAt", "updatedAt")
     values ($1, $2, $3, $4, $5, 'DRAFT', $6, $6)`,
    [payoutId, user.tenantId, cycleId, partnerId, amount, now.toISOString()],
  );
  state.createdPayoutCycleIds.push(cycleId);
  state.createdPayoutIds.push(payoutId);
  return { cycleId, payoutId };
}

async function ensureInvoiceSettingsForSmoke(user) {
  if (!state.payoutSettingsSnapshotCaptured) {
    state.payoutSettingsSnapshot = (
      await pool.query('select * from "PartnerPayoutSettings" where "tenantId" = $1 limit 1', [user.tenantId])
    ).rows[0] || null;
    state.payoutSettingsSnapshotCaptured = true;
  }

  const now = new Date().toISOString();
  await pool.query(
    `insert into "PartnerPayoutSettings"
      (id, "tenantId", "cycleFrequency", "customIntervalDays", "cycleAnchorDay", "defaultHsnSacCode",
       "companyLegalName", "companyGstin", "companyAddress", "companyState", "updatedBy", "createdAt", "updatedAt",
       "gstRatePercent", "invoiceNumberPattern", "minimumPayoutAmount", "approvalMode",
       "requireInvoiceBeforePayment", "allowPartnerSelfInvoice", "adjustmentReasons", "holdReasons", "payoutVisibilityConfig")
     values ($1, $2, 'MONTHLY', null, 1, '9983', 'Smoke Test University Pvt Ltd', null,
       $3, 'Karnataka', $4, $5, $5, 18, 'SMK-{fy}-{counter:04d}', 0, 'MANUAL', true, true,
       '[]'::jsonb, '[]'::jsonb, '{"mode":"ALL_PARTNERS","userIds":[],"teamIds":[],"salesGroupIds":[],"partnerOrganizationIds":[]}'::jsonb)
     on conflict ("tenantId") do update
       set "companyLegalName" = excluded."companyLegalName",
           "companyState" = excluded."companyState",
           "defaultHsnSacCode" = excluded."defaultHsnSacCode",
           "minimumPayoutAmount" = 0,
           "requireInvoiceBeforePayment" = true,
           "allowPartnerSelfInvoice" = true,
           "updatedBy" = excluded."updatedBy",
           "updatedAt" = excluded."updatedAt"`,
    [`${runId}-payout-settings`, user.tenantId, { line1: "Smoke address" }, user.id, now],
  );
}

async function payoutTransitionSmoke(user) {
  const partner = (
    await pool.query(
      `select pp."userId" as id
       from "PartnerProfile" pp
       join "User" u on u.id = pp."userId"
       where pp."tenantId" = $1 and pp.status = 'ACTIVE' and u.status = 'ACTIVE'
       order by pp."createdAt" asc
       limit 1`,
      [user.tenantId],
    )
  ).rows[0];
  if (!partner?.id) {
    console.log("skip payout transition smoke: no active partner profile found");
    return;
  }

  await ensureInvoiceSettingsForSmoke(user);

  const held = await createSmokePayout(user, partner.id, "hold");
  const heldPayout = await api(user, "POST", `/api/payouts/${held.payoutId}/hold`, { holdReason: "API smoke hold" }, [200], "hold payout");
  if (!heldPayout?.isHeld) throw new Error("Hold payout did not set isHeld=true");
  const releasedPayout = await api(user, "POST", `/api/payouts/${held.payoutId}/release-hold`, {}, [200], "release payout hold");
  if (releasedPayout?.isHeld) throw new Error("Release payout hold did not clear isHeld");

  const payable = await createSmokePayout(user, partner.id, "payable");
  const approved = await api(user, "POST", `/api/payouts/${payable.payoutId}/approve`, {}, [200], "approve payout");
  if (approved?.status !== "APPROVED") throw new Error("Approve payout did not move to APPROVED");
  const invoice = await api(user, "POST", `/api/payouts/${payable.payoutId}/generate-invoice`, {}, [200], "generate payout invoice");
  if (!invoice?.id || !invoice?.pdfStoragePath) throw new Error("Generated invoice did not include id/pdfStoragePath");
  state.createdPartnerInvoiceIds.push(invoice.id);
  const invoiceDownload = await downloadApi(user, `/api/partner-invoices/${invoice.id}/pdf`, [200], "download generated invoice PDF");
  if (invoiceDownload.buffer.slice(0, 5).toString("utf8") !== "%PDF-") {
    throw new Error("Generated invoice download was not a PDF");
  }
  const paid = await api(user, "POST", `/api/payouts/${payable.payoutId}/mark-paid`, { paymentReference: `${runId}-payment-ref` }, [200], "mark payout paid");
  if (paid?.status !== "PAID" || !paid?.paymentReference) throw new Error("Mark paid did not set PAID/paymentReference");
}

async function exportWorkerSmoke(user) {
  const queued = await api(user, "POST", "/api/exports", { moduleName: "LEADS", exportType: "CSV", filters: {}, columns: [] }, [202], "queue export for worker");
  if (!queued?.id) throw new Error("Export queue response did not include id");
  state.createdExportRequestIds.push(queued.id);

  let exportRow = queued;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const rows = await api(user, "GET", "/api/exports", undefined, [200], "poll export request history");
    exportRow = Array.isArray(rows) ? rows.find((row) => row.id === queued.id) : null;
    if (exportRow?.status === "COMPLETED") break;
    if (exportRow?.status === "FAILED") throw new Error(`Export worker failed request: ${exportRow.error || "unknown"}`);
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  if (exportRow?.status !== "COMPLETED") {
    throw new Error("Export request was not completed by the worker within 30 seconds");
  }

  const download = await downloadApi(user, `/api/exports/${queued.id}/download`, [200], "download completed export CSV");
  const contentType = download.headers.get("content-type") || "";
  const csv = download.buffer.toString("utf8");
  if (!contentType.includes("text/csv") || !csv.includes("Name") || !csv.includes("Email")) {
    throw new Error("Completed export CSV did not contain expected CSV headers");
  }
}

async function readOnlySmoke(user) {
  const endpoints = [
    "/api/auth/me",
    "/api/activities",
    "/api/activities/stats",
    "/api/activity-types",
    "/api/assignment/rules",
    "/api/audit-logs",
    "/api/automation-v2",
    "/api/badges",
    "/api/commission-rules",
    "/api/communications/outbox",
    "/api/communications/providers",
    "/api/communications/templates",
    "/api/custom-fields",
    "/api/dashboard-widgets",
    "/api/exports",
    "/api/forms",
    "/api/forms/available?placement=ACTIVITY_DETAIL",
    "/api/gamification-redemptions",
    "/api/gamification-rules",
    "/api/gamification-settings",
    "/api/gamification/leaderboard",
    "/api/gamification/me/badges",
    "/api/gamification/me/points",
    "/api/gamification/me/redemptions",
    "/api/gamification/rewards",
    "/api/governance/audit-logs",
    "/api/health",
    "/api/integrations/csv/jobs",
    "/api/integrations/telephony",
    "/api/integrations/telephony/call-logs",
    "/api/integrations/webhooks",
    "/api/lead-lists",
    "/api/lead-scoring/rules",
    "/api/lead-scoring/self-learning/scores",
    "/api/lead-scoring/self-learning/settings",
    "/api/leads",
    "/api/metadata/objects",
    "/api/notifications",
    "/api/opportunities",
    "/api/opportunities/stats",
    "/api/opportunity-types",
    "/api/partners",
    "/api/payout-cycles",
    "/api/payout-settings",
    "/api/permission-templates",
    "/api/reports/activities",
    "/api/reports/custom",
    "/api/reports/inbuilt/activity-call-volume-trends",
    "/api/reports/inbuilt/cohort-funnel-progression",
    "/api/reports/inbuilt/commission-payout-summary",
    "/api/reports/inbuilt/data-quality",
    "/api/reports/inbuilt/funnel-by-source-campaign",
    "/api/reports/inbuilt/funnel-by-stage",
    "/api/reports/inbuilt/lead-source-roi",
    "/api/reports/inbuilt/reassignment-impact",
    "/api/reports/inbuilt/rep-performance",
    "/api/reports/inbuilt/sla-response-breaches",
    "/api/reports/leads",
    "/api/reports/opportunities",
    "/api/reports/query",
    "/api/reports/schedules",
    "/api/roles",
    "/api/sales-groups",
    "/api/saved-views",
    "/api/search?q=test",
    "/api/settings/general",
    "/api/tasks",
    "/api/teams",
    "/api/users",
  ];

  for (const endpoint of endpoints) {
    await api(user, "GET", endpoint, undefined, [200], "read-only smoke");
  }
}

async function exerciseCrud(user, opportunityType) {
  const permissions = { modules: { leads: "read", opportunities: "read", activities: "read" }, recordAccess: "OWN" };

  const template = await api(user, "POST", "/api/permission-templates", {
    name: `${runId} template`,
    description: "Temporary API regression template",
    permissions,
    isActive: true,
  }, [200], "create permission template");
  state.createdPermissionTemplateIds.push(template.id);
  await api(user, "PATCH", `/api/permission-templates/${template.id}`, { ...template, name: `${runId} template updated`, permissions }, [200], "update permission template");

  const role = await api(user, "POST", "/api/roles", {
    name: `${runId} role`,
    description: "Temporary API regression role",
    permissionTemplateId: template.id,
    permissions,
  }, [200], "create role");
  state.createdRoleIds.push(role.id);
  await api(user, "PATCH", `/api/roles/${role.id}`, { ...role, name: `${runId} role updated`, permissions }, [200], "update role");

  const team = await api(user, "POST", "/api/teams", { name: `${runId} team`, description: "Temporary team" }, [200], "create team");
  state.createdTeamIds.push(team.id);
  await api(user, "PATCH", `/api/teams/${team.id}`, { name: `${runId} team updated`, description: "Updated temporary team" }, [200], "update team");
  await api(user, "POST", `/api/teams/${team.id}/members`, { userId: user.id, role: "MEMBER" }, [200], "add team member");
  await api(user, "DELETE", `/api/teams/${team.id}/members/${user.id}`, undefined, [200], "remove team member");

  const salesGroup = await api(user, "POST", "/api/sales-groups", { name: `${runId} sales group`, description: "Temporary sales group" }, [200], "create sales group");
  state.createdSalesGroupIds.push(salesGroup.id);
  await api(user, "PATCH", `/api/sales-groups/${salesGroup.id}`, { name: `${runId} sales group updated`, description: "Updated temporary sales group" }, [200], "update sales group");
  await api(user, "POST", `/api/sales-groups/${salesGroup.id}/members`, { userId: user.id, role: "MEMBER" }, [200], "add sales group member");
  await api(user, "DELETE", `/api/sales-groups/${salesGroup.id}/members/${user.id}`, undefined, [200], "remove sales group member");

  const customField = await api(user, "POST", "/api/custom-fields", {
    objectType: "Lead",
    key: `${runId.replace(/-/g, "_")}_lead_field`,
    label: `${runId} Lead Field`,
    fieldType: "TEXT",
    isRequired: false,
    options: [],
  }, [200], "create custom field");
  state.createdCustomFieldIds.push(customField.id);
  await api(user, "PATCH", `/api/custom-fields/${customField.id}`, { label: `${runId} Lead Field Updated`, isRequired: false }, [200], "update custom field");

  const activityType = await api(user, "POST", "/api/activity-types", {
    name: `${runId} Call`,
    icon: "Phone",
    color: "#2563eb",
    defaultOutcome: "CONNECTED",
    defaultSLA: 30,
  }, [200], "create activity type");
  state.createdActivityTypeIds.push(activityType.id);
  await api(user, "PATCH", `/api/activity-types/${activityType.id}`, { name: `${runId} Call Updated`, defaultOutcome: "CONNECTED" }, [200], "update activity type");

  const oppType = await api(user, "POST", "/api/opportunity-types", {
    name: `${runId} Type`,
    description: "Temporary opportunity type",
    stages: [
      { name: "New", order: 1, probability: 10, color: "#94a3b8", isClosed: false, isWon: false },
      { name: "Won", order: 2, probability: 100, color: "#22c55e", isClosed: true, isWon: true },
    ],
  }, [200], "create opportunity type");
  await api(user, "PATCH", `/api/opportunity-types/${oppType.id}`, { ...oppType, name: `${runId} Type Updated` }, [200], "update opportunity type");
  await api(user, "DELETE", `/api/opportunity-types/${oppType.id}`, undefined, [200], "delete opportunity type");

  const lead = await api(user, "POST", "/api/leads", {
    name: `${runId} Lead`,
    email: `${runId}@example.com`,
    company: "API Regression",
    source: "API_SMOKE",
    status: "NEW",
  }, [200], "create lead");
  state.createdLeadIds.push(lead.id);
  await api(user, "GET", `/api/leads/${lead.id}`, undefined, [200], "get lead");
  await api(user, "PATCH", `/api/leads/${lead.id}`, { ...lead, name: `${runId} Lead Updated` }, [200], "update lead");

  const activity = await api(user, "POST", "/api/activities", {
    typeId: activityType.id,
    leadId: lead.id,
    outcome: "OPEN",
    notes: `${runId} activity`,
  }, [200], "create activity");
  state.createdActivityIds.push(activity.id);
  await api(user, "PATCH", `/api/activities/${activity.id}`, { outcome: "COMPLETED", notes: `${runId} activity updated` }, [200], "update activity");

  if (opportunityType?.id) {
    const opportunity = await api(user, "POST", "/api/opportunities", {
      title: `${runId} Opportunity`,
      leadId: lead.id,
      opportunityTypeId: opportunityType.id,
      stageId: opportunityType.stageId || null,
      amount: 12345,
      priority: "MEDIUM",
    }, [200], "create opportunity");
    state.createdOpportunityIds.push(opportunity.id);
    await api(user, "GET", `/api/opportunities/${opportunity.id}`, undefined, [200], "get opportunity");
    await api(user, "PATCH", `/api/opportunities/${opportunity.id}`, { stageId: opportunity.stageId, title: `${runId} Opportunity Updated` }, [200], "update opportunity");
    await api(user, "GET", `/api/opportunities/${opportunity.id}/history`, undefined, [200], "get opportunity history");
  }

  const task = await api(user, "POST", "/api/tasks", {
    title: `${runId} Task`,
    description: "Temporary task",
    priority: "HIGH",
    status: "OPEN",
    ownerId: user.id,
    leadId: lead.id,
  }, [200], "create task");
  await api(user, "GET", `/api/tasks/${task.id}`, undefined, [200], "get task");
  await api(user, "PATCH", `/api/tasks/${task.id}`, { title: `${runId} Task Updated`, status: "IN_PROGRESS" }, [200], "update task");
  await api(user, "DELETE", `/api/tasks/${task.id}`, undefined, [200], "delete task");

  const leadList = await api(user, "POST", "/api/lead-lists", { name: `${runId} List`, type: "STATIC", description: "Temporary list" }, [200], "create lead list");
  state.createdLeadListIds.push(leadList.id);
  await api(user, "POST", `/api/lead-lists/${leadList.id}/members`, { leadIds: [lead.id] }, [200], "add lead list member");
  await api(user, "GET", `/api/lead-lists/${leadList.id}`, undefined, [200], "get lead list");
  await api(user, "DELETE", `/api/lead-lists/${leadList.id}/members/${lead.id}`, undefined, [200], "remove lead list member");

  const savedView = await api(user, "POST", "/api/saved-views", {
    name: `${runId} View`,
    module: "LEADS",
    filters: { conditions: [] },
    tabs: [{ id: "tab-1", name: "Leads", module: "LEADS", filters: { conditions: [] } }],
  }, [200], "create saved view");
  state.createdSavedViewIds.push(savedView.id);
  await api(user, "PATCH", `/api/saved-views/${savedView.id}`, { name: `${runId} View Updated`, module: "LEADS", filters: { conditions: [] } }, [200], "update saved view");
  const clonedView = await api(user, "POST", `/api/saved-views/${savedView.id}?action=clone`, {}, [200], "clone saved view");
  state.createdSavedViewIds.push(clonedView.id);

  const widget = await api(user, "POST", "/api/dashboard-widgets", {
    title: `${runId} Widget`,
    type: "STAT",
    config: { module: "LEADS", metric: "COUNT" },
    layout: { w: 1, h: 1, x: 0, y: 0 },
  }, [200], "create dashboard widget");
  state.createdWidgetIds.push(widget.id);
  await api(user, "PATCH", `/api/dashboard-widgets/${widget.id}`, { title: `${runId} Widget Updated`, type: "STAT", config: { module: "LEADS", metric: "COUNT" } }, [200], "update dashboard widget");
  await api(user, "GET", `/api/dashboard-widgets/${widget.id}/data`, undefined, [200], "get dashboard widget data");

  const form = await api(user, "POST", "/api/forms", { name: `${runId} Form`, description: "Temporary form" }, [200], "create form");
  state.createdFormIds.push(form.id);
  await api(user, "GET", `/api/forms/${form.id}`, undefined, [200], "get form");
  await api(user, "PATCH", `/api/forms/${form.id}`, { name: `${runId} Form Updated`, config: { fields: [] } }, [200], "update form");
  await api(user, "GET", `/api/forms/${form.id}/stats`, undefined, [200], "get form stats");
  await api(user, "GET", `/api/forms/${form.id}/submissions`, undefined, [200], "get form submissions");

  const report = await api(user, "POST", "/api/reports/custom", {
    name: `${runId} Report`,
    module: "LEADS",
    config: { dimensions: ["source"], metrics: ["count"], filters: [] },
    chartType: "TABLE",
    isPublic: false,
  }, [200], "create custom report");
  state.createdReportIds.push(report.id);
  await api(user, "PATCH", `/api/reports/custom/${report.id}`, {
    name: `${runId} Report Updated`,
    module: "LEADS",
    config: { dimensions: ["source"], metrics: ["count"], filters: [] },
    chartType: "TABLE",
    isPublic: false,
  }, [200], "update custom report");

  const schedule = await api(user, "POST", "/api/reports/schedules", {
    reportKey: "funnel-by-stage",
    recipients: [user.email],
    frequency: "WEEKLY",
    dayOfWeek: 1,
    format: "LINK",
  }, [200], "create report schedule");
  state.createdScheduleIds.push(schedule.id);
  await api(user, "PATCH", `/api/reports/schedules/${schedule.id}`, { isActive: false }, [200], "update report schedule");

  const webhook = await api(user, "POST", "/api/integrations/webhooks", {
    name: `${runId} Webhook`,
    url: "https://example.com/webhook",
    events: ["LEAD_CREATED"],
    secret: runId,
    isActive: false,
  }, [200], "create webhook");
  state.createdWebhookIds.push(webhook.id);

  const badge = await api(user, "POST", "/api/badges", {
    name: `${runId} Badge`,
    description: "Temporary badge",
    badgeType: "ACHIEVEMENT",
    icon: "Trophy",
    criteriaRules: { eventType: "LEAD_CREATED", threshold: 999999 },
    pointsBonus: 0,
    isActive: false,
  }, [200], "create badge");
  state.createdBadgeIds.push(badge.id);
  await api(user, "PATCH", `/api/badges/${badge.id}`, { name: `${runId} Badge Updated`, isActive: false }, [200], "update badge");

  const gamificationRule = await api(user, "POST", "/api/gamification-rules", {
    name: `${runId} Gamification Rule`,
    triggerEventType: "LEAD_CREATED",
    pointsAwarded: 1,
    conditions: [],
    dailyLimit: 1,
    isActive: false,
  }, [200], "create gamification rule");
  state.createdGamificationRuleIds.push(gamificationRule.id);
  await api(user, "PATCH", `/api/gamification-rules/${gamificationRule.id}`, { name: `${runId} Gamification Rule Updated`, isActive: false }, [200], "update gamification rule");

  const commissionRule = await api(user, "POST", "/api/commission-rules", {
    name: `${runId} Commission Rule`,
    ruleType: "FLAT",
    value: 1,
    conditions: [],
    isActive: false,
  }, [200], "create commission rule");
  state.createdCommissionRuleIds.push(commissionRule.id);
  await api(user, "PATCH", `/api/commission-rules/${commissionRule.id}`, { name: `${runId} Commission Rule Updated`, isActive: false }, [200], "update commission rule");

  await api(user, "POST", "/api/lead-scoring/self-learning/recompute", { targetModules: ["LEAD", "OPPORTUNITY"], force: true }, [202], "recompute predictive scores (queued)");
  await api(user, "POST", "/api/reports/query", {
    root: "lead",
    fields: [{ object: "lead", field: "id", label: "Lead ID" }, { object: "lead", field: "name", label: "Lead Name" }],
    filters: [],
    limit: 5,
  }, [200], "execute report query");
}

async function apiCleanup(user) {
  for (const id of [...state.createdCommissionRuleIds].reverse()) await safeApi(user, "DELETE", `/api/commission-rules/${id}`, undefined, [200, 404], "cleanup commission rule");
  for (const id of [...state.createdGamificationRuleIds].reverse()) await safeApi(user, "DELETE", `/api/gamification-rules/${id}`, undefined, [200, 404], "cleanup gamification rule");
  for (const id of [...state.createdBadgeIds].reverse()) await safeApi(user, "DELETE", `/api/badges/${id}`, undefined, [200, 404], "cleanup badge");
  for (const id of [...state.createdWebhookIds].reverse()) await safeApi(user, "DELETE", `/api/integrations/webhooks/${id}`, undefined, [200, 404], "cleanup webhook");
  for (const id of [...state.createdScheduleIds].reverse()) await safeApi(user, "DELETE", `/api/reports/schedules/${id}`, undefined, [200, 404], "cleanup report schedule");
  for (const id of [...state.createdReportIds].reverse()) await safeApi(user, "DELETE", `/api/reports/custom/${id}`, undefined, [200, 404], "cleanup custom report");
  for (const id of [...state.createdFormIds].reverse()) await safeApi(user, "DELETE", `/api/forms/${id}`, undefined, [200, 404], "cleanup form");
  for (const id of [...state.createdWidgetIds].reverse()) await safeApi(user, "DELETE", `/api/dashboard-widgets/${id}`, undefined, [200, 404], "cleanup widget");
  for (const id of [...state.createdSavedViewIds].reverse()) await safeApi(user, "DELETE", `/api/saved-views/${id}`, undefined, [200, 404], "cleanup saved view");
  for (const id of [...state.createdOpportunityIds].reverse()) await safeApi(user, "DELETE", `/api/opportunities/${id}`, undefined, [200, 404], "cleanup opportunity");
  for (const id of [...state.createdCustomFieldIds].reverse()) await safeApi(user, "DELETE", `/api/custom-fields/${id}`, undefined, [200, 404], "cleanup custom field");
  await pool.query('delete from "Activity" where "tenantId" = $1 and id::text = any($2::text[])', [user.tenantId, state.createdActivityIds]);
  for (const id of [...state.createdActivityTypeIds].reverse()) await safeApi(user, "DELETE", `/api/activity-types/${id}`, undefined, [200, 404], "cleanup activity type");
  for (const id of [...state.createdSalesGroupIds].reverse()) await safeApi(user, "DELETE", `/api/sales-groups/${id}`, undefined, [200, 404], "cleanup sales group");
  for (const id of [...state.createdTeamIds].reverse()) await safeApi(user, "DELETE", `/api/teams/${id}`, undefined, [200, 404], "cleanup team");
  for (const id of [...state.createdRoleIds].reverse()) await safeApi(user, "DELETE", `/api/roles/${id}`, undefined, [200, 404], "cleanup role");
  for (const id of [...state.createdPermissionTemplateIds].reverse()) await safeApi(user, "DELETE", `/api/permission-templates/${id}`, undefined, [200, 404], "cleanup permission template");
}

async function dbCleanup(user) {
  await pool.query("begin");
  try {
    await pool.query('delete from "CommunicationDeliveryEvent" where "tenantId" = $1 and id::text = any($2::text[])', [
      user.tenantId,
      state.createdCommunicationDeliveryEventIds,
    ]);
    await pool.query('delete from "TelephonyCallLog" where "tenantId" = $1 and id::text = any($2::text[])', [
      user.tenantId,
      state.createdTelephonyCallLogIds,
    ]);
    await pool.query('delete from "Notification" where "tenantId" = $1 and data->>\'exportRequestId\' = any($2::text[])', [
      user.tenantId,
      state.createdExportRequestIds,
    ]);
    await pool.query('update "ExportRequest" set "fileObjectId" = null where "tenantId" = $1 and id::text = any($2::text[])', [
      user.tenantId,
      state.createdExportRequestIds,
    ]);
    await pool.query('delete from "ExportRequest" where "tenantId" = $1 and id::text = any($2::text[])', [
      user.tenantId,
      state.createdExportRequestIds,
    ]);
    await pool.query('delete from "FileObject" where "tenantId" = $1 and "entityType" = $2 and "entityId"::text = any($3::text[])', [
      user.tenantId,
      "EXPORT_REQUEST",
      state.createdExportRequestIds,
    ]);
    await pool.query('delete from "FileObject" where "tenantId" = $1 and "entityType" = $2 and "entityId"::text = any($3::text[])', [
      user.tenantId,
      "PARTNER_INVOICE",
      state.createdPartnerInvoiceIds,
    ]);
    await pool.query('update "Payout" set "invoiceId" = null where "tenantId" = $1 and id::text = any($2::text[])', [
      user.tenantId,
      state.createdPayoutIds,
    ]);
    await pool.query('delete from "PartnerInvoice" where "tenantId" = $1 and (id::text = any($2::text[]) or "payoutId"::text = any($3::text[]))', [
      user.tenantId,
      state.createdPartnerInvoiceIds,
      state.createdPayoutIds,
    ]);
    await pool.query('delete from "Payout" where "tenantId" = $1 and id::text = any($2::text[])', [user.tenantId, state.createdPayoutIds]);
    await pool.query('delete from "PayoutCycle" where "tenantId" = $1 and id::text = any($2::text[])', [
      user.tenantId,
      state.createdPayoutCycleIds,
    ]);

    if (state.payoutSettingsSnapshotCaptured) {
      await pool.query('delete from "PartnerPayoutSettings" where "tenantId" = $1', [user.tenantId]);
      if (state.payoutSettingsSnapshot) {
        const columns = Object.keys(state.payoutSettingsSnapshot);
        const quotedColumns = columns.map((column) => `"${column}"`).join(", ");
        const placeholders = columns.map((_, index) => `$${index + 1}`).join(", ");
        await pool.query(
          `insert into "PartnerPayoutSettings" (${quotedColumns}) values (${placeholders})`,
          // jsonb lists come back as JS arrays; a bare array would go back as a Postgres array literal.
          columns.map((column) => (Array.isArray(state.payoutSettingsSnapshot[column]) ? JSON.stringify(state.payoutSettingsSnapshot[column]) : state.payoutSettingsSnapshot[column])),
        );
      }
    }

    await pool.query('delete from "LeadListMember" where "tenantId" = $1 and ("listId"::text = any($2::text[]) or "leadId"::text = any($3::text[]))', [
      user.tenantId,
      state.createdLeadListIds,
      state.createdLeadIds,
    ]);
    await pool.query('delete from "LeadList" where "tenantId" = $1 and id::text = any($2::text[])', [user.tenantId, state.createdLeadListIds]);
    // Deleting a form or a custom field through the API archives it (it can be restored), so the
    // archived rows this run made are removed here.
    await pool.query('delete from "FormSubmission" where "tenantId" = $1 and "formId"::text = any($2::text[])', [user.tenantId, state.createdFormIds]);
    await pool.query('delete from "Form" where "tenantId" = $1 and id::text = any($2::text[])', [user.tenantId, state.createdFormIds]);
    await pool.query('delete from "FieldDefinition" where "tenantId" = $1 and id::text = any($2::text[])', [user.tenantId, state.createdCustomFieldIds]);
    // Smart Views, reports, and commission and gamification rules archive on delete too (decision
    // 31, extended). Rules a ledger points at can't be removed (the ledgers are append-only), so
    // those deletes run under savepoints and are skipped if refused.
    await pool.query('delete from "CustomReport" where "tenantId" = $1 and id::text = any($2::text[])', [user.tenantId, [...state.createdSavedViewIds, ...state.createdReportIds]]);
    for (const [table, ids] of [["GamificationRule", state.createdGamificationRuleIds], ["CommissionRule", state.createdCommissionRuleIds]]) {
      for (const id of ids) {
        await pool.query("savepoint archived_rule");
        await pool.query(`delete from "${table}" where "tenantId" = $1 and id = $2`, [user.tenantId, id])
          .then(() => pool.query("release savepoint archived_rule"))
          .catch(() => pool.query("rollback to savepoint archived_rule"));
      }
    }
    await pool.query('delete from "Activity" where "tenantId" = $1 and id::text = any($2::text[])', [user.tenantId, state.createdActivityIds]);
    await pool.query('delete from "Opportunity" where "tenantId" = $1 and id::text = any($2::text[])', [user.tenantId, state.createdOpportunityIds]);
    await pool.query('delete from "Lead" where "tenantId" = $1 and id::text = any($2::text[])', [user.tenantId, state.createdLeadIds]);
    await pool.query('delete from "AuditLog" where "tenantId" = $1 and ("entityId"::text = any($2::text[]) or "entityId"::text = any($3::text[]) or "after"::text like $4)', [
      user.tenantId,
      [...state.createdLeadIds, ...state.createdOpportunityIds, ...state.createdActivityIds, ...state.createdPayoutIds, ...state.createdPartnerInvoiceIds],
      [...state.createdLeadListIds, ...state.createdSavedViewIds, ...state.createdWidgetIds, ...state.createdExportRequestIds],
      `%${runId}%`,
    ]);
    await pool.query("commit");
  } catch (error) {
    await pool.query("rollback");
    throw error;
  }
  // Workspaces this run created get every tenant-scoped row removed (provisioning adds more
  // tables over time -- module entitlements broke the old fixed list and, inside the
  // transaction above, rolled back the whole cleanup). Repeated passes clear foreign-key chains.
  if (state.createdPlatformTenantIds.length) {
    const tables = (await pool.query(`select table_name from information_schema.columns where table_schema = 'public' and column_name = 'tenantId'`)).rows.map((row) => row.table_name);
    for (const createdTenantId of state.createdPlatformTenantIds) {
      for (let pass = 0; pass < 6; pass++) {
        for (const table of tables) await pool.query(`delete from "${table.replaceAll('"', '""')}" where "tenantId"::text = $1`, [createdTenantId]).catch(() => undefined);
      }
      await pool.query('delete from "Tenant" where id = $1', [createdTenantId]);
    }
  }
}

async function main() {
  const context = await discoverContext();
  await openSmokeSession(context.user);
  await openSmokeSession(context.platformAdmin);
  console.log(`API regression smoke: ${baseUrl}`);
  console.log(`Tenant: ${context.user.tenantId}`);
  console.log(`User: ${context.user.email} (${context.user.id})`);
  console.log(`Run: ${runId}`);

  let testError = null;
  try {
    await authNegativeSmoke();
    await platformAdminSmoke(context.platformAdmin);
    await webhookSecretSmoke(context.user);
    await readOnlySmoke(context.user);
    await exerciseCrud(context.user, context.opportunityType);
    await payoutTransitionSmoke(context.user);
    await exportWorkerSmoke(context.user);
  } catch (error) {
    testError = error;
    console.error(`\nRegression failed: ${error.message}`);
  } finally {
    try {
      await apiCleanup(context.user);
      await dbCleanup(context.user);
    } catch (cleanupError) {
      console.error(`Cleanup failed: ${cleanupError.message}`);
      if (!testError) testError = cleanupError;
    }
    await closeSmokeSessions().catch((error) => console.error(`Session cleanup failed: ${error.message}`));
    await pool.end();
  }

  const failures = results.filter((result) => !result.ok);
  console.log(`\nChecked ${results.length} API calls. Failures: ${failures.length}.`);
  if (failures.length) {
    console.log(JSON.stringify(failures, null, 2));
  }
  if (testError || failures.length) {
    process.exitCode = 1;
  }
}

main().catch(async (error) => {
  console.error(error);
  await pool.end().catch(() => undefined);
  process.exit(1);
});
