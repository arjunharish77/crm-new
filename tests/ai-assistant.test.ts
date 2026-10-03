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
  // Identity passthrough -- this fake simulates real storage/retrieval round-trips (see
  // `execute` below, which pushes params straight into in-memory state read back later), so it
  // must not stringify jsonb-array params the way the real jsonbParam does; that serialization
  // behavior itself is verified separately (a pure function, tested directly + against real
  // Postgres, not the concern of this file's fake DB).
  jsonbParam: (v: unknown) => v,
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
      // F03 fix (WP04): this lookup can now include an OWN/TEAM record-scope clause (see
      // record-scope.ts), which pushes extra bound values BEFORE the entity id -- always the
      // LAST parameter regardless of how many scope values preceded it.
      return state.leads.find((l) => l.tenantId === params[0] && l.id === params[params.length - 1]) ?? null;
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
  assertTenantModule: vi.fn(async (user: { isPlatformAdmin?: boolean }, moduleKey: string) => {
    if (!state.moduleEnabled && !user.isPlatformAdmin) throw new Error(`MODULE_DISABLED:${moduleKey}`);
  }),
}));

const queueCommunicationForTenantMock = vi.fn(async () => ({ id: "outbox-1", status: "QUEUED" }));
vi.mock("@/lib/server/communications", () => ({
  queueCommunicationForTenant: queueCommunicationForTenantMock,
  renderTemplate: (text: string, tokens: Record<string, unknown> = {}) => text.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_m, key) => String(tokens[key] ?? "")),
}));

// F07 fix (WP06): these tests use fetch mocks against fake hostnames (ai.example.com) that
// don't resolve via real DNS -- the SSRF guard's own correctness is covered by
// outbound-request-guard.test.ts; here it's mocked out so these unit tests stay isolated from
// real network/DNS behavior, consistent with everything else already mocked in this file.
vi.mock("@/lib/server/outbound-request-guard", () => ({
  assertSafeOutboundUrl: vi.fn(async () => undefined),
  UnsafeDestinationError: class extends Error {},
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
    it("explains exhausted provider credits separately from connectivity errors", async () => {
      enableProvider();
      mockFetchOnce({ ok: false, status: 429, text: JSON.stringify({ error: { code: "credit_balance_exhausted", type: "insufficient_quota" } }) });
      const { testAiProviderConnection } = await import("@/lib/server/ai-assistant");
      const result = await testAiProviderConnection(TENANT_USER);
      expect(result.ok).toBe(false);
      expect(result.message).toContain("no API credits");
    });
    it("generates a communication draft without sending it", async () => {
      enableProvider();
      state.leads.push({ tenantId: "tenant-1", id: "lead-1", ownerId: null, name: "Fixture lead" });
      mockFetchOnce({ ok: true, json: { choices: [{ message: { content: "Draft for review" } }], usage: { prompt_tokens: 10, completion_tokens: 5 } } });
      const { draftCommunicationVariants } = await import("@/lib/server/ai-assistant");
      expect(await draftCommunicationVariants(TENANT_USER, { entityType: "LEAD", entityId: "lead-1", channel: "EMAIL" })).toEqual({ variants: ["Draft for review"] });
      expect(queueCommunicationForTenantMock).not.toHaveBeenCalled();
      expect(state.usageLogs.at(-1)).toMatchObject({ status: "SUCCESS", module: "DRAFT_COMMUNICATION" });
    });

    it.each(["summarizeRecord", "explainTimeline", "prepareCallNotes", "suggestNextTask", "explainPredictiveScore", "prepareManagerReview"] as const)("%s reaches the configured provider and records usage", async (action) => {
      enableProvider();
      state.leads.push({ tenantId: "tenant-1", id: "lead-1", ownerId: null, name: "Fixture lead" });
      mockFetchOnce({ ok: true, json: { choices: [{ message: { content: "Fixture assistant response" } }], usage: { prompt_tokens: 10, completion_tokens: 5 } } });
      const ai = await import("@/lib/server/ai-assistant");
      expect((await ai[action](TENANT_USER, "LEAD", "lead-1")).text).toBe("Fixture assistant response");
      expect(global.fetch).toHaveBeenCalledWith("https://ai.example.com/v1/chat/completions", expect.objectContaining({ redirect: "manual", headers: expect.objectContaining({ authorization: "Bearer sk-real-secret" }) }));
      expect(state.usageLogs.at(-1)).toMatchObject({ status: "SUCCESS", tokensIn: 10, tokensOut: 5 });
    });

    it("does not expose the API key echoed by a rejected provider request", async () => {
      enableProvider();
      mockFetchOnce({ ok: false, status: 401, text: "Rejected sk-real-secret" });
      const { testAiProviderConnection } = await import("@/lib/server/ai-assistant");
      const result = await testAiProviderConnection(TENANT_USER);
      expect(result.ok).toBe(false);
      expect(result.message).toContain("401");
      expect(result.message).not.toContain("sk-real-secret");
    });

    it("reports an empty response as a failed connection", async () => {
      enableProvider();
      mockFetchOnce({ ok: true, json: { choices: [{ message: { content: " " } }] } });
      const { testAiProviderConnection } = await import("@/lib/server/ai-assistant");
      expect(await testAiProviderConnection(TENANT_USER)).toMatchObject({ ok: false, message: "AI provider returned an empty response." });
    });

    it("explains an output budget exhausted before visible text", async () => {
      enableProvider();
      mockFetchOnce({ ok: true, json: { choices: [{ finish_reason: "length", message: { content: "" } }] } });
      const { testAiProviderConnection } = await import("@/lib/server/ai-assistant");
      const result = await testAiProviderConnection(TENANT_USER);
      expect(result.ok).toBe(false);
      expect(result.message).toContain("output token limit");
    });

    it("logs empty-response metadata without exposing private reasoning", async () => {
      enableProvider();
      state.leads.push({ tenantId: "tenant-1", id: "lead-1", ownerId: null, name: "Fixture lead" });
      mockFetchOnce({ ok: true, json: { choices: [{ finish_reason: "stop", message: { content: "", reasoning: "Private model reasoning must not appear" } }], usage: { completion_tokens: 100 } } });
      const { prepareCallNotes } = await import("@/lib/server/ai-assistant");
      await expect(prepareCallNotes(TENANT_USER, "LEAD", "lead-1")).rejects.toThrow("AI provider returned an empty response.");
      const log = state.usageLogs.at(-1);
      expect(log.status).toBe("FAILED");
      expect(log.errorMessage).toContain('"finishReason":"stop"');
      expect(log.errorMessage).toContain('"completionTokens":100');
      expect(log.errorMessage).not.toContain("Private model reasoning");
    });

    it.each([
      ["https://api.groq.com/openai/v1", "openai/gpt-oss-20b", "low"],
      ["https://api.groq.com/openai/v1", "openai/gpt-oss-120b", "low"],
      ["https://ai.example.com/v1", "openai/gpt-oss-20b", undefined],
      ["https://api.groq.com/openai/v1", "llama-3.3-70b-versatile", undefined],
    ])("scopes reasoning budget adaptation to %s %s", async (endpointUrl, model, effort) => {
      enableProvider({ endpointUrl, model, maxTokensPerRequest: 1024 });
      mockFetchOnce({ ok: true, json: { choices: [{ message: { content: "OK" } }] } });
      const { testAiProviderConnection } = await import("@/lib/server/ai-assistant");
      expect((await testAiProviderConnection(TENANT_USER)).ok).toBe(true);
      const body = JSON.parse(vi.mocked(global.fetch).mock.calls[0][1]?.body as string);
      expect(body.reasoning_effort).toBe(effort);
      expect(body.max_tokens).toBe(1024);
    });

    it("reports provider timeouts", async () => {
      enableProvider();
      global.fetch = vi.fn().mockRejectedValue(Object.assign(new Error("Timed out"), { name: "AbortError" }));
      const { testAiProviderConnection } = await import("@/lib/server/ai-assistant");
      expect(await testAiProviderConnection(TENANT_USER)).toMatchObject({ ok: false, message: "AI provider request timed out." });
    });

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
    it.each(["draft", "report"])("%s applies the configured module policy", async (kind) => {
      enableProvider({ allowedModules: [] });
      state.leads.push({ tenantId: "tenant-1", id: "lead-1", ownerId: null, name: "Fixture" });
      global.fetch = vi.fn();
      const ai = await import("@/lib/server/ai-assistant");
      const request = kind === "draft" ? ai.draftCommunicationVariants(TENANT_USER, { entityType: "LEAD", entityId: "lead-1", channel: "EMAIL" }) : ai.generateNlReportDefinition(TENANT_USER, "Count leads");
      await expect(request).rejects.toMatchObject({ code: "AI_MODULE_NOT_ALLOWED" });
      expect(global.fetch).not.toHaveBeenCalled();
    });
    it.each(["draft", "report"])("%s stops at the configured daily limit", async (kind) => {
      enableProvider({ dailySpendLimitUsd: 0 });
      state.leads.push({ tenantId: "tenant-1", id: "lead-1", ownerId: null, name: "Fixture" });
      global.fetch = vi.fn();
      const ai = await import("@/lib/server/ai-assistant");
      const request = kind === "draft" ? ai.draftCommunicationVariants(TENANT_USER, { entityType: "LEAD", entityId: "lead-1", channel: "EMAIL" }) : ai.generateNlReportDefinition(TENANT_USER, "Count leads");
      await expect(request).rejects.toMatchObject({ code: "AI_BUDGET_EXCEEDED" });
      expect(global.fetch).not.toHaveBeenCalled();
    });

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

    // F03 fix (WP04): buildRecordContextPack previously fetched by tenant only (no record-access
    // scope check) via `select *` (no field-permission masking at all) -- any authenticated user
    // could get the AI assistant to summarize/draft-communication-about ANY record in the
    // tenant, hidden fields included, just by supplying its id.
    it("masks a field this user's permission template marks hidden, even with no blockedFields configured", async () => {
      state.leads.push({ tenantId: "tenant-1", id: "lead-1", ownerId: "owner-1", name: "Alice", email: "alice@example.com", phone: "555-1234", source: "Website" });
      state.users.push({ id: "owner-1", name: "Rep One", email: "rep@example.com" });
      const userWithHiddenPhone = { id: "user-1", tenantId: "tenant-1", role: { permissions: { fieldPermissions: { leads: { phone: "hidden" } } } } };

      const { buildRecordContextPack } = await import("@/lib/server/ai-assistant");
      const context = await buildRecordContextPack(userWithHiddenPhone, "LEAD", "lead-1", []);

      expect(context.phone).toBeNull();
      expect(context.email).toBe("alice@example.com"); // unrelated field unaffected
    });

    it("scopes the record lookup to the caller's own records for an OWN-access role", async () => {
      state.leads.push({ tenantId: "tenant-1", id: "lead-1", ownerId: "user-1", name: "Alice" });
      const ownScopedUser = { id: "user-1", tenantId: "tenant-1", role: { permissions: { recordAccess: "OWN" } } };

      const { buildRecordContextPack } = await import("@/lib/server/ai-assistant");
      await buildRecordContextPack(ownScopedUser, "LEAD", "lead-1", []);

      const { queryOne } = await import("@/lib/db/query");
      const lookup = (queryOne as any).mock.calls.find((call: any[]) => String(call[0]).startsWith('select * from "Lead"'));
      expect(lookup).toBeDefined();
      expect(lookup[0]).toContain('"ownerId" = $2');
      expect(lookup[1]).toEqual(["tenant-1", "user-1", "lead-1"]);
    });

    it("throws RECORD_NOT_FOUND when the scoped lookup finds nothing (out-of-scope record)", async () => {
      // No matching lead pushed to state.leads -- simulates a real scope-enforcing Postgres
      // query returning no row for a record outside this OWN-scoped user's access.
      const ownScopedUser = { id: "user-1", tenantId: "tenant-1", role: { permissions: { recordAccess: "OWN" } } };

      const { buildRecordContextPack } = await import("@/lib/server/ai-assistant");
      await expect(buildRecordContextPack(ownScopedUser, "LEAD", "someone-elses-lead", [])).rejects.toThrow("RECORD_NOT_FOUND");
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

  describe("record workflows", () => {
    const workflows = ["review_qualification", "plan_reengagement", "prepare_objection_coaching", "prepare_handoff"] as const;
    for (const entityType of ["LEAD", "OPPORTUNITY"]) {
      it.each(workflows)(`generates %s for ${entityType} with governed usage and no message send`, async (workflow) => {
        enableProvider();
        state.leads.push({ tenantId: "tenant-1", id: "record-1", name: "Fixture", title: "Fixture", ownerId: null });
        mockFetchOnce({ ok: true, json: { choices: [{ message: { content: "Reviewable workflow" } }], usage: { prompt_tokens: 10, completion_tokens: 5 } } });
        const { runRecordWorkflow } = await import("@/lib/server/ai-assistant");
        expect(await runRecordWorkflow(TENANT_USER, workflow, entityType, "record-1")).toEqual({ text: "Reviewable workflow" });
        expect(state.usageLogs.at(-1)).toMatchObject({ module: workflow, promptTemplateKey: workflow, entityType, status: "SUCCESS" });
        expect(queueCommunicationForTenantMock).not.toHaveBeenCalled();
      });
    }
    it.each(workflows)("enforces module restrictions before calling %s", async (workflow) => {
      enableProvider({ allowedModules: [] }); global.fetch = vi.fn();
      const { runRecordWorkflow } = await import("@/lib/server/ai-assistant");
      await expect(runRecordWorkflow(TENANT_USER, workflow, "LEAD", "record-1")).rejects.toMatchObject({ code: "AI_MODULE_NOT_ALLOWED" });
      expect(global.fetch).not.toHaveBeenCalled();
    });
    it("rejects unknown workflows and unsupported record types", async () => {
      global.fetch = vi.fn();
      const { runRecordWorkflow } = await import("@/lib/server/ai-assistant");
      await expect(runRecordWorkflow(TENANT_USER, "unknown" as any, "LEAD", "record-1")).rejects.toMatchObject({ code: "AI_INVALID_WORKFLOW" });
      await expect(runRecordWorkflow(TENANT_USER, "prepare_handoff", "CASE", "record-1")).rejects.toMatchObject({ code: "AI_INVALID_ENTITY" });
      expect(global.fetch).not.toHaveBeenCalled();
    });
  });

  describe("natural-language report helper", () => {
    it("parses a valid JSON response and passes it to the report-query executor", async () => {
      enableProvider();
      mockFetchOnce({ ok: true, json: { choices: [{ message: { content: '{"root":"lead","fields":[{"object":"lead","field":"name"}]}' } }], usage: { prompt_tokens: 10, completion_tokens: 5 } } });

      const { generateNlReportDefinition } = await import("@/lib/server/ai-assistant");
      const result = await generateNlReportDefinition(TENANT_USER, "Show me all leads by name");

      expect(result.definition).toEqual({ root: "lead", fields: [{ object: "lead", field: "name" }] });
      expect(executeReportQueryForTenantMock).toHaveBeenCalled();
      expect(result.preview).toEqual({ rows: [{ name: "Alice" }] });
    });

    it("normalizes a singleton order array without dropping the requested sort", async () => {
      enableProvider();
      const definition = { root: "lead", fields: [{ object: "lead", field: "name" }], orderBy: [{ object: "lead", field: "score", direction: "desc" }] };
      mockFetchOnce({ ok: true, json: { choices: [{ message: { content: JSON.stringify(definition) } }] } });
      const { generateNlReportDefinition } = await import("@/lib/server/ai-assistant");
      const result = await generateNlReportDefinition(TENANT_USER, "Lead names by score");
      expect(result.definition.orderBy).toEqual(definition.orderBy[0]);
    });

    it.each([
      { unsupported: true },
      { root: "lead", fields: [{ object: "lead", field: "id" }], groupBy: "source" },
      { root: "lead", fields: [{ object: "lead", field: "id" }], orderBy: [{ object: "lead", field: "name" }, { object: "lead", field: "score" }] },
    ])("rejects unsupported operations before executing a misleading report: %j", async (definition) => {
      enableProvider();
      mockFetchOnce({ ok: true, json: { choices: [{ message: { content: JSON.stringify(definition) } }] } });
      const { generateNlReportDefinition, AiProviderError } = await import("@/lib/server/ai-assistant");
      await expect(generateNlReportDefinition(TENANT_USER, "Report")).rejects.toThrow(AiProviderError);
      expect(executeReportQueryForTenantMock).not.toHaveBeenCalled();
    });

    it("throws AI_INVALID_REPORT_JSON when the provider does not return parseable JSON", async () => {
      enableProvider();
      mockFetchOnce({ ok: true, json: { choices: [{ message: { content: "not json at all" } }], usage: {} } });

      const { generateNlReportDefinition, AiProviderError } = await import("@/lib/server/ai-assistant");
      await expect(generateNlReportDefinition(TENANT_USER, "Show me leads")).rejects.toThrow(AiProviderError);
    });
  });
});
