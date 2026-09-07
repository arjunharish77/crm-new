import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  settings: null as any,
  templates: [] as any[],
  usageLogs: [] as any[],
  leads: [] as any[],
  users: [] as any[],
  scores: [] as any[],
  moduleEnabled: true,
}));

function resetState() {
  state.settings = null;
  state.templates = [];
  state.usageLogs = [];
  state.leads = [];
  state.users = [];
  state.scores = [];
  state.moduleEnabled = true;
}
resetState();

vi.mock("@/lib/db/query", () => ({
  query: vi.fn(async (sql: string, params: any[] = []) => {
    if (sql.includes('from "AiPromptTemplate"')) {
      return state.templates.filter((t) => t.tenantId === params[0]);
    }
    if (sql.includes('select "userId", count(*)') || sql.includes('select module, count(*)')) {
      return [];
    }
    if (sql.includes('from "Activity"') || sql.includes('from "Task"') || sql.includes('from "Note"') || sql.includes('from "EmailLog"') || sql.includes('from "CommunicationOutbox"')) {
      return [];
    }
    if (sql.includes('from "RecordScore"')) {
      return state.scores.filter((s) => s.recordId === params[2]);
    }
    if (sql.includes('from "AiUsageLog"') && sql.includes("select id,")) {
      return state.usageLogs;
    }
    return [];
  }),
  queryOne: vi.fn(async (sql: string, params: any[] = []) => {
    if (sql.includes('from "AiProviderSettings"')) {
      return state.settings && state.settings.tenantId === params[0] ? state.settings : null;
    }
    if (sql.includes('from "AiPromptTemplate"') && sql.includes('"isActive" = true')) {
      const rows = state.templates.filter((t) => t.tenantId === params[0] && t.key === params[1] && t.isActive);
      return rows.sort((a, b) => b.version - a.version)[0] ?? null;
    }
    if (sql.includes('max(version) as version from "AiPromptTemplate"')) {
      const rows = state.templates.filter((t) => t.tenantId === params[0] && t.key === params[1]);
      return { version: rows.length ? Math.max(...rows.map((r) => r.version)) : null };
    }
    if (sql.includes('from "AiPromptTemplate" where id = $1')) {
      return state.templates.find((t) => t.id === params[0]) ?? null;
    }
    if (sql.includes('select * from "Lead"') || sql.includes('select * from "Opportunity"')) {
      return state.leads.find((l) => l.tenantId === params[0] && l.id === params[1]) ?? null;
    }
    if (sql.includes('select name, email from "User"')) {
      return state.users.find((u) => u.id === params[0]) ?? null;
    }
    if (sql.includes('coalesce(sum("estimatedCostUsd"), 0) as total')) {
      const [tenantId, since] = params;
      const total = state.usageLogs
        .filter((log) => log.tenantId === tenantId && log.status === "SUCCESS" && log.createdAt >= since)
        .reduce((sum, log) => sum + (Number(log.estimatedCostUsd) || 0), 0);
      return { total: String(total) };
    }
    if (sql.includes('count(*) as requests, coalesce(sum')) {
      return { requests: state.usageLogs.length, tokensIn: 0, tokensOut: 0, cost: 0, avgLatencyMs: 0, failures: 0 };
    }
    return null;
  }),
  execute: vi.fn(async (sql: string, params: any[] = []) => {
    if (sql.includes('insert into "AiProviderSettings"')) {
      const existingSecret = state.settings?.secretConfig ?? {};
      const submittedSecret = params[5] && typeof params[5] === "object" ? params[5] : {};
      const preservedSecret = Object.keys(submittedSecret).length === 0 ? existingSecret : submittedSecret;
      state.settings = {
        tenantId: params[0], enabled: params[1], providerMode: params[2], endpointUrl: params[3], model: params[4],
        secretConfig: preservedSecret, maxTokensPerRequest: params[6], timeoutMs: params[7],
        dailySpendLimitUsd: params[8], monthlySpendLimitUsd: params[9], allowedModules: params[10],
        approvalRequiredForExternalSends: params[11],
      };
    }
    if (sql.includes('insert into "AiPromptTemplate"') && sql.includes("values ($1,$2,$3,$4,$5,$6,$7,$8,$9,true")) {
      state.templates.push({
        id: params[0], tenantId: params[1], key: params[2], name: params[3], version: params[4], template: params[5],
        variables: params[6], allowedContextFields: params[7], blockedFields: params[8], isActive: true,
      });
    }
    if (sql.includes('insert into "AiPromptTemplate"') && sql.includes("'[]','[]','[]',true")) {
      // Built-in template lazy-provisioning insert
      if (!state.templates.some((t) => t.tenantId === params[1] && t.key === params[2] && t.version === 1)) {
        state.templates.push({ id: params[0], tenantId: params[1], key: params[2], name: params[3], version: 1, template: params[4], variables: [], allowedContextFields: [], blockedFields: [], isActive: true });
      }
    }
    if (sql.includes('update "AiPromptTemplate" set "isActive"')) {
      const template = state.templates.find((t) => t.id === params[4]);
      if (template) template.isActive = params[0];
    }
    if (sql.includes('insert into "AiUsageLog"')) {
      state.usageLogs.push({
        id: params[0], tenantId: params[1], userId: params[2], module: params[3], promptTemplateKey: params[4],
        entityType: params[5], entityId: params[6], tokensIn: params[7], tokensOut: params[8],
        estimatedCostUsd: params[9], latencyMs: params[10], status: params[11], errorMessage: params[12], createdAt: params[13],
      });
    }
    return 1;
  }),
}));

const createAuditLogMock = vi.fn(async () => undefined);
vi.mock("@/lib/server/crm", () => ({ createAuditLog: createAuditLogMock }));

vi.mock("@/lib/server/module-entitlements", () => ({
  assertModuleEnabled: vi.fn(async (tenantId: string, moduleKey: string) => {
    if (!state.moduleEnabled) throw new Error(`MODULE_DISABLED:${moduleKey}`);
  }),
}));

const queueCommunicationForTenantMock = vi.fn(async () => ({ id: "outbox-1", status: "QUEUED" }));
vi.mock("@/lib/server/communications", () => ({
  queueCommunicationForTenant: queueCommunicationForTenantMock,
  renderTemplate: (text: string, tokens: Record<string, unknown> = {}) => text.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_m, key) => String(tokens[key] ?? "")),
}));

const createPrivilegedActionRequestMock = vi.fn(async () => ({ id: "request-1" }));
vi.mock("@/lib/server/privileged-actions", () => ({
  createPrivilegedActionRequest: createPrivilegedActionRequestMock,
}));

const executeReportQueryForTenantMock = vi.fn(async () => ({ rows: [{ name: "Alice" }] }));
vi.mock("@/lib/server/reporting-query", () => ({
  getReportQueryCatalog: () => ({ lead: ["name", "source"] }),
  executeReportQueryForTenant: executeReportQueryForTenantMock,
}));

const TENANT_USER = { id: "user-1", tenantId: "tenant-1" };

function enableProvider(overrides: Record<string, unknown> = {}) {
  state.settings = {
    tenantId: "tenant-1",
    enabled: true,
    providerMode: "EXTERNAL_API",
    endpointUrl: "https://ai.example.com/v1",
    model: "gpt-4o-mini",
    secretConfig: { apiKey: "sk-real-secret" },
    maxTokensPerRequest: 1024,
    timeoutMs: 30000,
    dailySpendLimitUsd: null,
    monthlySpendLimitUsd: null,
    allowedModules: ["LEAD", "OPPORTUNITY", "REPORTS"],
    approvalRequiredForExternalSends: false,
    ...overrides,
  };
}

function mockFetchOnce(response: { ok: boolean; status?: number; json?: any; text?: string }) {
  global.fetch = vi.fn().mockResolvedValueOnce({
    ok: response.ok,
    status: response.status ?? (response.ok ? 200 : 500),
    json: async () => response.json,
    text: async () => response.text ?? "",
  }) as any;
}

describe("AI Assistant module", () => {
  beforeEach(() => {
    resetState();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("provider settings", () => {
    it("redacts stored secrets on read", async () => {
      enableProvider();
      const { getAiProviderSettingsForTenant } = await import("@/lib/server/ai-assistant");
      const settings = await getAiProviderSettingsForTenant(TENANT_USER);
      expect(settings.secretConfig.apiKey).toBe("********");
    });

    it("an empty secretConfig submission preserves the previously stored secret instead of wiping it", async () => {
      enableProvider();
      const { upsertAiProviderSettingsForTenant } = await import("@/lib/server/ai-assistant");
      await upsertAiProviderSettingsForTenant(TENANT_USER, { enabled: true, providerMode: "EXTERNAL_API", endpointUrl: "https://ai.example.com/v1", secretConfig: {} });
      expect(state.settings.secretConfig).toEqual({ apiKey: "sk-real-secret" });
      expect(createAuditLogMock).toHaveBeenCalled();
    });

    it("a real secretConfig submission replaces the stored secret", async () => {
      enableProvider();
      const { upsertAiProviderSettingsForTenant } = await import("@/lib/server/ai-assistant");
      await upsertAiProviderSettingsForTenant(TENANT_USER, { enabled: true, providerMode: "EXTERNAL_API", endpointUrl: "https://ai.example.com/v1", secretConfig: { apiKey: "sk-new" } });
      expect(state.settings.secretConfig).toEqual({ apiKey: "sk-new" });
    });
  });

  describe("provider connector", () => {
    it("calls the configured endpoint and logs a SUCCESS usage row with token counts", async () => {
      enableProvider();
      state.leads.push({ tenantId: "tenant-1", id: "lead-1", ownerId: null, name: "Alice", email: "alice@example.com", source: "Website" });
      mockFetchOnce({ ok: true, json: { choices: [{ message: { content: "Alice is a promising lead." } }], usage: { prompt_tokens: 120, completion_tokens: 20 } } });

      const { summarizeRecord } = await import("@/lib/server/ai-assistant");
      const result = await summarizeRecord(TENANT_USER, "LEAD", "lead-1");

      expect(result.text).toBe("Alice is a promising lead.");
      expect(state.usageLogs).toHaveLength(1);
      expect(state.usageLogs[0]).toMatchObject({ status: "SUCCESS", tokensIn: 120, tokensOut: 20 });
    });

    it("throws AI_NOT_CONFIGURED and never calls fetch when the provider is disabled", async () => {
      enableProvider({ enabled: false, providerMode: "DISABLED" });
      state.leads.push({ tenantId: "tenant-1", id: "lead-1", ownerId: null, name: "Alice" });
      global.fetch = vi.fn();

      const { summarizeRecord, AiProviderError } = await import("@/lib/server/ai-assistant");
      await expect(summarizeRecord(TENANT_USER, "LEAD", "lead-1")).rejects.toThrow(AiProviderError);
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it("logs a FAILED usage row and surfaces a clear error when the provider returns a non-2xx response", async () => {
      enableProvider();
      state.leads.push({ tenantId: "tenant-1", id: "lead-1", ownerId: null, name: "Alice" });
      mockFetchOnce({ ok: false, status: 500, text: "internal error" });

      const { summarizeRecord, AiProviderError } = await import("@/lib/server/ai-assistant");
      await expect(summarizeRecord(TENANT_USER, "LEAD", "lead-1")).rejects.toThrow(AiProviderError);
      expect(state.usageLogs[0]).toMatchObject({ status: "FAILED" });
    });

    it("testAiProviderConnection reports ok:false with a message when unreachable", async () => {
      enableProvider();
      global.fetch = vi.fn().mockRejectedValueOnce(new Error("network down"));

      const { testAiProviderConnection } = await import("@/lib/server/ai-assistant");
      const result = await testAiProviderConnection(TENANT_USER);
      expect(result.ok).toBe(false);
    });

    it("testAiProviderConnection reports ok:true on a successful round trip", async () => {
      enableProvider();
      mockFetchOnce({ ok: true, json: { choices: [{ message: { content: "OK" } }], usage: {} } });

      const { testAiProviderConnection } = await import("@/lib/server/ai-assistant");
      const result = await testAiProviderConnection(TENANT_USER);
      expect(result.ok).toBe(true);
    });
  });

  describe("guardrails", () => {
    it("blocks and logs BLOCKED_MODULE when the entity type is not in allowedModules, without calling fetch", async () => {
      enableProvider({ allowedModules: ["OPPORTUNITY"] });
      state.leads.push({ tenantId: "tenant-1", id: "lead-1", ownerId: null, name: "Alice" });
      global.fetch = vi.fn();

      const { summarizeRecord, AiProviderError } = await import("@/lib/server/ai-assistant");
      await expect(summarizeRecord(TENANT_USER, "LEAD", "lead-1")).rejects.toThrow(AiProviderError);
      expect(global.fetch).not.toHaveBeenCalled();
      expect(state.usageLogs[0]).toMatchObject({ status: "BLOCKED_MODULE" });
    });

    it("blocks and logs BLOCKED_BUDGET once the daily spend limit is already reached", async () => {
      enableProvider({ dailySpendLimitUsd: 1 });
      state.leads.push({ tenantId: "tenant-1", id: "lead-1", ownerId: null, name: "Alice" });
      state.usageLogs.push({ tenantId: "tenant-1", status: "SUCCESS", estimatedCostUsd: "1.5", createdAt: new Date().toISOString() });
      global.fetch = vi.fn();

      const { summarizeRecord, AiProviderError } = await import("@/lib/server/ai-assistant");
      await expect(summarizeRecord(TENANT_USER, "LEAD", "lead-1")).rejects.toThrow(AiProviderError);
      expect(global.fetch).not.toHaveBeenCalled();
      expect(state.usageLogs.some((log) => log.status === "BLOCKED_BUDGET")).toBe(true);
    });

    it("MODULE_DISABLED (AI_COPILOT off) rejects before touching provider settings at all", async () => {
      state.moduleEnabled = false;
      const { summarizeRecord } = await import("@/lib/server/ai-assistant");
      await expect(summarizeRecord(TENANT_USER, "LEAD", "lead-1")).rejects.toThrow("MODULE_DISABLED:AI_COPILOT");
    });
  });

  describe("record context pack masking", () => {
    it("strips a blocked dotted-path field from the assembled context", async () => {
      state.leads.push({ tenantId: "tenant-1", id: "lead-1", ownerId: "owner-1", name: "Alice", email: "alice@example.com", source: "Website", company: "Acme", status: "NEW", score: 80 });
      state.users.push({ id: "owner-1", name: "Rep One", email: "rep@example.com" });

      const { buildRecordContextPack } = await import("@/lib/server/ai-assistant");
      const withoutMask = await buildRecordContextPack(TENANT_USER, "LEAD", "lead-1", []);
      expect(withoutMask.email).toBe("alice@example.com");

      const masked = await buildRecordContextPack(TENANT_USER, "LEAD", "lead-1", ["email"]);
      expect(masked.email).toBeUndefined();
      expect(masked.name).toBe("Alice");
    });
  });

  describe("prompt template governance", () => {
    it("creating a template twice for the same key produces incrementing versions, and the highest active version is used", async () => {
      enableProvider();
      state.leads.push({ tenantId: "tenant-1", id: "lead-1", ownerId: null, name: "Alice" });

      const { createAiPromptTemplateVersion, listAiPromptTemplatesForTenant } = await import("@/lib/server/ai-assistant");
      const v1 = await createAiPromptTemplateVersion(TENANT_USER, { key: "summarize_record", name: "V1", template: "Summarize v1: {{context}}" });
      const v2 = await createAiPromptTemplateVersion(TENANT_USER, { key: "summarize_record", name: "V2", template: "Summarize v2: {{context}}" });
      expect(v1?.version).toBe(1);
      expect(v2?.version).toBe(2);

      const all = await listAiPromptTemplatesForTenant(TENANT_USER);
      expect(all).toHaveLength(2);

      mockFetchOnce({ ok: true, json: { choices: [{ message: { content: "used-v2" } }], usage: {} } });
      const { summarizeRecord } = await import("@/lib/server/ai-assistant");
      await summarizeRecord(TENANT_USER, "LEAD", "lead-1");
      const sentBody = JSON.parse((global.fetch as any).mock.calls[0][1].body);
      expect(sentBody.messages[0].content).toContain("Summarize v2");
    });

    it("setAiPromptTemplateActive(false) removes a version from being selected, falling back to the next highest active version", async () => {
      enableProvider();
      state.leads.push({ tenantId: "tenant-1", id: "lead-1", ownerId: null, name: "Alice" });

      const { createAiPromptTemplateVersion, setAiPromptTemplateActive, summarizeRecord } = await import("@/lib/server/ai-assistant");
      await createAiPromptTemplateVersion(TENANT_USER, { key: "summarize_record", name: "V1", template: "Summarize v1: {{context}}" });
      const v2 = await createAiPromptTemplateVersion(TENANT_USER, { key: "summarize_record", name: "V2", template: "Summarize v2: {{context}}" });
      await setAiPromptTemplateActive(TENANT_USER, v2!.id, false);

      mockFetchOnce({ ok: true, json: { choices: [{ message: { content: "used-v1" } }], usage: {} } });
      await summarizeRecord(TENANT_USER, "LEAD", "lead-1");
      const sentBody = JSON.parse((global.fetch as any).mock.calls[0][1].body);
      expect(sentBody.messages[0].content).toContain("Summarize v1");
    });

    it("falls back to the built-in default template, lazily provisioned, when a tenant has never customized a key", async () => {
      enableProvider();
      state.leads.push({ tenantId: "tenant-1", id: "lead-1", ownerId: null, name: "Alice" });
      mockFetchOnce({ ok: true, json: { choices: [{ message: { content: "built-in summary" } }], usage: {} } });

      const { summarizeRecord, listAiPromptTemplatesForTenant } = await import("@/lib/server/ai-assistant");
      const result = await summarizeRecord(TENANT_USER, "LEAD", "lead-1");
      expect(result.text).toBe("built-in summary");
      const templates = await listAiPromptTemplatesForTenant(TENANT_USER);
      expect(templates.some((t) => t.key === "summarize_record")).toBe(true);
    });
  });

  describe("generative draft workflow and approval-gated sends", () => {
    it("confirmAndSendAiDraft sends immediately through the real CommunicationOutbox pipeline when no approval is required", async () => {
      enableProvider({ approvalRequiredForExternalSends: false });
      const { confirmAndSendAiDraft } = await import("@/lib/server/ai-assistant");
      const outcome: any = await confirmAndSendAiDraft(TENANT_USER, { entityType: "LEAD", entityId: "lead-1", channel: "EMAIL", recipient: "alice@example.com", subject: "Hi", body: "Following up." });

      expect(queueCommunicationForTenantMock).toHaveBeenCalledWith(
        TENANT_USER,
        expect.objectContaining({ channel: "EMAIL", recipient: "alice@example.com", sourceType: "AI_ASSISTANT" }),
      );
      expect(outcome).toEqual({ id: "outbox-1", status: "QUEUED" });
      expect(createPrivilegedActionRequestMock).not.toHaveBeenCalled();
    });

    it("confirmAndSendAiDraft creates a PrivilegedActionRequest instead of sending when the tenant requires approval", async () => {
      enableProvider({ approvalRequiredForExternalSends: true });
      const { confirmAndSendAiDraft } = await import("@/lib/server/ai-assistant");
      const outcome: any = await confirmAndSendAiDraft(TENANT_USER, { entityType: "LEAD", entityId: "lead-1", channel: "EMAIL", recipient: "alice@example.com", subject: "Hi", body: "Following up." });

      expect(outcome).toMatchObject({ pendingApproval: true, requestId: "request-1" });
      expect(createPrivilegedActionRequestMock).toHaveBeenCalledWith(
        TENANT_USER,
        expect.objectContaining({ actionType: "AI_EXTERNAL_SEND" }),
      );
      expect(queueCommunicationForTenantMock).not.toHaveBeenCalled();
    });
  });

  describe("natural-language report helper", () => {
    it("parses a valid JSON response and runs it through the real report-query validator/executor", async () => {
      enableProvider();
      mockFetchOnce({ ok: true, json: { choices: [{ message: { content: '{"root":"lead","fields":[{"object":"lead","field":"name"}]}' } }], usage: { prompt_tokens: 10, completion_tokens: 5 } } });

      const { generateNlReportDefinition } = await import("@/lib/server/ai-assistant");
      const result = await generateNlReportDefinition(TENANT_USER, "Show me all leads by name");

      expect(result.definition).toEqual({ root: "lead", fields: [{ object: "lead", field: "name" }] });
      expect(executeReportQueryForTenantMock).toHaveBeenCalled();
      expect(result.preview).toEqual({ rows: [{ name: "Alice" }] });
    });

    it("throws AI_INVALID_REPORT_JSON when the provider does not return parseable JSON", async () => {
      enableProvider();
      mockFetchOnce({ ok: true, json: { choices: [{ message: { content: "not json at all" } }], usage: {} } });

      const { generateNlReportDefinition, AiProviderError } = await import("@/lib/server/ai-assistant");
      await expect(generateNlReportDefinition(TENANT_USER, "Show me leads")).rejects.toThrow(AiProviderError);
    });
  });
});
