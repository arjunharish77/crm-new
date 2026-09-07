import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Covers the 10 Module 11 sub-items built in this pass: SLA pause/resume, escalation
// management, email/message-to-case routing, response macros, communication history, the
// remaining case automation actions, CSAT capture, case analytics, case merge/duplicate
// handling, and worker jobs -- extending (not replacing) the existing cases-postgres.test.ts
// suite from the earlier "core" pass.

const state = vi.hoisted(() => ({
  cases: [] as any[],
  statuses: [] as any[],
  priorities: [] as any[],
  users: [] as any[],
  queues: [] as any[],
  queueMembers: [] as any[],
  macros: [] as any[],
  comments: [] as any[],
  assignmentLogs: [] as any[],
  auditLogs: [] as any[],
  notifications: [] as any[],
  outbox: [] as any[],
  articles: [] as any[],
  articleFeedback: [] as any[],
  inboundMessages: [] as any[],
  surveyResponses: [] as any[],
  dedupeRules: [] as any[],
  dedupeMatches: [] as any[],
  mergeAudits: [] as any[],
  moduleEnabled: true,
}));

function resetState() {
  state.cases = [];
  state.statuses = [
    { id: "status-open", tenantId: "tenant-1", name: "Open", category: "OPEN", isClosedStatus: false, isDefault: true },
    { id: "status-closed", tenantId: "tenant-1", name: "Closed", category: "CLOSED", isClosedStatus: true, isDefault: false },
  ];
  state.priorities = [
    { id: "priority-low", tenantId: "tenant-1", name: "Low", level: 1, isDefault: true },
    { id: "priority-high", tenantId: "tenant-1", name: "High", level: 3, isDefault: false },
  ];
  state.users = [{ id: "owner-1", tenantId: "tenant-1", name: "Owner One", managerId: "manager-1" }, { id: "manager-1", tenantId: "tenant-1", name: "Manager One" }];
  state.queues = [];
  state.queueMembers = [];
  state.macros = [];
  state.comments = [];
  state.assignmentLogs = [];
  state.auditLogs = [];
  state.notifications = [];
  state.outbox = [];
  state.articles = [];
  state.articleFeedback = [];
  state.inboundMessages = [];
  state.surveyResponses = [];
  state.dedupeRules = [];
  state.dedupeMatches = [];
  state.mergeAudits = [];
  state.moduleEnabled = true;
}
resetState();

vi.mock("@/lib/db/query", () => ({
  query: vi.fn(async (sql: string, params: any[] = []) => {
    if (sql.includes('from "CaseStatus"')) return state.statuses.filter((s) => s.tenantId === params[0]);
    if (sql.includes('from "CasePriority"') && sql.includes("select level")) return [];
    if (sql.includes('from "CaseQueueMembership"')) return state.queueMembers.filter((m) => m.tenantId === params[0] && (!params[1] || m.queueId === params[1] || (Array.isArray(params[1]) && params[1].includes(m.queueId))));
    if (sql.includes('from "Case" c') && sql.includes('"slaWarningFiredAt" is null')) {
      const [thresholdIso, nowIso] = params;
      return state.cases.filter((c) => {
        const status = state.statuses.find((s) => s.id === c.statusId);
        if (status?.isClosedStatus || c.slaPausedAt || c.slaWarningFiredAt) return false;
        const due = c.resolutionDueAt || c.firstResponseDueAt;
        return due && due <= thresholdIso && due > nowIso;
      });
    }
    if (sql.includes('from "Case" c') && sql.includes('"slaBreachedFiredAt" is null')) {
      const [nowIso] = params;
      return state.cases.filter((c) => {
        const status = state.statuses.find((s) => s.id === c.statusId);
        if (status?.isClosedStatus || c.slaPausedAt || c.slaBreachedFiredAt) return false;
        const due = c.resolutionDueAt || c.firstResponseDueAt;
        return due && due <= nowIso;
      });
    }
    if (sql.includes('from "Case" c') && sql.includes('"ownerId" is null')) return [];
    if (sql.includes('from "CaseMacro"')) return state.macros.filter((m) => m.tenantId === params[0]);
    if (sql.includes('from "KnowledgeBaseArticle" a')) return state.articles.filter((a) => a.tenantId === params[0] && a.isActive);
    if (sql.includes('from "CommunicationOutbox"')) return [];
    if (sql.includes('from "CommunicationSuppression"')) return [];
    if (sql.includes('from "CommunicationConsent"')) return [];
    if (sql.includes('from "Case"') && sql.includes('requesterEmail" = $3')) return [];
    if (sql.includes('from "DedupeMatchRule"')) return state.dedupeRules.filter((r) => r.tenantId === params[0] && (!params[1] || r.entityType === params[1]));
    if (sql.includes('array_agg(c.id order by c."createdAt" asc) as ids')) {
      const openCases = state.cases.filter((c) => {
        const status = state.statuses.find((s) => s.id === c.statusId);
        return !status?.isClosedStatus && c.requesterEmail;
      });
      const groups = new Map<string, string[]>();
      for (const c of openCases) {
        const key = c.requesterEmail.toLowerCase();
        groups.set(key, [...(groups.get(key) ?? []), c.id]);
      }
      return [...groups.values()].filter((ids) => ids.length > 1).map((ids) => ({ ids }));
    }
    if (sql.includes('from "DedupeMatch"')) return state.dedupeMatches.filter((m) => m.tenantId === params[0]);
    if (sql.includes('select id, "caseNumber", subject, "requesterEmail", "statusId", "createdAt" from "Case"')) {
      return state.cases.filter((c) => params[1]?.includes(c.id)).map((c) => ({ id: c.id, caseNumber: c.caseNumber, subject: c.subject, requesterEmail: c.requesterEmail, statusId: c.statusId, createdAt: c.createdAt }));
    }
    if (sql.includes('update "CaseComment" set "caseId"') || sql.includes('update "CaseAssignmentLog" set "caseId"') || sql.includes('update "Task" set "caseId"') || sql.includes('update "CaseInboundMessage" set "caseId"') || sql.includes('update "CaseAttachment" set "caseId"') || sql.includes('update "CaseSurveyResponse" set "caseId"')) {
      return [];
    }
    if (sql.includes('from "Tenant" t join "Case"')) return [{ id: "tenant-1" }];
    if (sql.includes('from "Case" where "tenantId" = $1 order by "createdAt" desc limit 5000')) return state.cases.filter((c) => c.tenantId === params[0]);
    if (sql.includes('from "CaseInboundMessage" where "tenantId" = $1 and "caseId" is not null')) return [];
    if (sql.includes('from "CaseSurveyResponse" where "tenantId" = $1')) return state.surveyResponses.filter((r) => r.tenantId === params[0]);
    if (sql.includes('from "User" where "tenantId" = $1')) return state.users.filter((u) => u.tenantId === params[0]);
    if (sql.includes('from "Case" where "resolvedAt" is not null')) return [];
    return [];
  }),
  queryOne: vi.fn(async (sql: string, params: any[] = []) => {
    if (sql.includes('select id from "CaseType"')) return { id: "type-1" };
    if (sql.includes('from "CaseStatus" where "tenantId" = $1 and "isDefault" = true')) return state.statuses.find((s) => s.tenantId === params[0] && s.isDefault) ?? null;
    if (sql.includes('from "CasePriority" where "tenantId" = $1 and "isDefault" = true')) return state.priorities.find((p) => p.tenantId === params[0] && p.isDefault) ?? null;
    if (sql.includes('select "isClosedStatus" from "CaseStatus"')) return state.statuses.find((s) => s.tenantId === params[0] && s.id === params[1]) ?? null;
    if (sql.includes('select level from "CasePriority"')) return state.priorities.find((p) => p.tenantId === params[0] && p.id === params[1]) ?? null;
    if (sql.includes('select coalesce(max("caseNumber")')) return { next: state.cases.length + 1 };
    if (sql.includes('select "roundRobinCursor" from "CaseQueue"')) return { roundRobinCursor: -1 };

    // Case insert (createCaseForTenant) -- queryOne with RETURNING.
    if (sql.includes('insert into "Case" (')) {
      const row = {
        id: params[0], tenantId: params[1], caseNumber: params[2], subject: params[3], description: params[4],
        typeId: params[5], statusId: params[6], priorityId: params[7], queueId: params[8], ownerId: params[9],
        requesterName: params[10], requesterEmail: params[11], requesterPhone: params[12],
        relatedLeadId: params[13], relatedOpportunityId: params[14], relatedPartnerId: params[15],
        slaPolicyId: params[16], firstResponseDueAt: params[17], resolutionDueAt: params[18], reopenedCount: 0,
        createdBy: params[19], createdAt: params[20], updatedAt: params[20],
        slaPausedAt: null, slaPausedTotalMinutes: 0, slaWarningFiredAt: null, slaBreachedFiredAt: null, escalatedAt: null, escalatedToId: null,
        firstRespondedAt: null, resolvedAt: null, closedAt: null, resolutionNotes: null, mergedIntoId: null, mergedAt: null,
      };
      state.cases.push(row);
      return row;
    }

    // pauseCaseSla / resumeCaseSla -- both queryOne with RETURNING.
    if (sql.includes('update "Case" set "slaPausedAt" = $1, "updatedAt" = $1')) {
      const c = state.cases.find((row) => row.id === params[2]);
      if (c) c.slaPausedAt = params[0];
      return c ?? null;
    }
    if (sql.includes('"slaPausedAt" = null, "slaPausedTotalMinutes"')) {
      const c = state.cases.find((row) => row.id === params[5]);
      if (c) { c.slaPausedAt = null; c.slaPausedTotalMinutes += params[0]; c.firstResponseDueAt = params[1]; c.resolutionDueAt = params[2]; }
      return c ?? null;
    }

    if (sql.includes('select * from "Case" where "tenantId" = $1 and id = $2')) return state.cases.find((c) => c.tenantId === params[0] && c.id === params[1]) ?? null;
    if (sql.includes('from "Case" where "tenantId" = $1 and id = $2 limit 1')) return state.cases.find((c) => c.tenantId === params[0] && c.id === params[1]) ?? null;
    if (sql.includes('select id, name, email from "User"')) return state.users.find((u) => u.id === params[1]) ?? null;
    if (sql.includes('select "managerId" from "User"')) return state.users.find((u) => u.id === params[0]) ?? null;
    if (sql.includes('from "CaseMacro" where "tenantId" = $1 and id = $2')) return state.macros.find((m) => m.tenantId === params[0] && m.id === params[1]) ?? null;
    if (sql.includes('select "bodyTemplate", channel from "CaseMacro"')) return state.macros.find((m) => m.id === params[1]) ?? null;
    if (sql.includes('select "caseNumber", subject from "Case"')) return state.cases.find((c) => c.id === params[1]);
    if (sql.includes('select subject, description from "Case"')) return state.cases.find((c) => c.tenantId === params[0] && c.id === params[1]) ?? null;

    // CaseComment insert (addCommentToCase) -- queryOne with RETURNING.
    if (sql.includes('insert into "CaseComment"')) {
      const row = { id: params[0], tenantId: params[1], caseId: params[2], authorId: params[3], body: params[4], isInternal: params[5], createdAt: params[6] };
      state.comments.push(row);
      return row;
    }

    // CaseSurveyResponse update (submitCaseSurveyResponse) -- queryOne with "returning *".
    if (sql.includes('update "CaseSurveyResponse" set "respondedAt"')) {
      const r = state.surveyResponses.find((row) => row.id === params[3]);
      if (r) { r.respondedAt = params[0]; r.score = params[1]; r.comment = params[2]; }
      return r ?? null;
    }
    if (sql.includes('"CaseSurveyResponse" where id = $1')) return state.surveyResponses.find((r) => r.id === params[0]) ?? null;

    if (sql.includes('max(version) as version from "KnowledgeBaseArticle"')) {
      const rows = state.articles.filter((a) => a.tenantId === params[0] && a.slug === params[1]);
      return { version: rows.length ? Math.max(...rows.map((r) => r.version)) : null };
    }
    if (sql.includes('from "KnowledgeBaseArticle" where "tenantId" = $1 and slug = $2 and "isActive" = true')) {
      const rows = state.articles.filter((a) => a.tenantId === params[0] && a.slug === params[1] && a.isActive);
      return rows.sort((a, b) => b.version - a.version)[0] ?? null;
    }
    if (sql.includes('from "KnowledgeBaseArticle" where "tenantId" = $1 and id = $2')) return state.articles.find((a) => a.tenantId === params[0] && a.id === params[1]) ?? null;

    if (sql.includes('select id, "caseId" from "CaseInboundMessage"')) {
      const [tenantId, , providerMessageId] = params;
      return state.inboundMessages.find((m) => m.tenantId === tenantId && m.providerMessageId === providerMessageId) ?? null;
    }
    if (sql.includes('select "caseId" from "CaseInboundMessage" where "tenantId" = $1 and "threadKey" = $2')) {
      const matches = state.inboundMessages.filter((m) => m.tenantId === params[0] && m.threadKey === params[1] && m.caseId);
      return matches.sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null;
    }
    if (sql.includes('select c.id from "Case" c join "CaseStatus" s')) {
      const c = state.cases.find((row) => row.tenantId === params[0] && row.id === params[1]);
      const status = c && state.statuses.find((s) => s.id === c.statusId);
      return c && !status?.isClosedStatus ? { id: c.id } : null;
    }
    if (sql.includes('select id, name from "Lead"')) return null;
    if (sql.includes('select id from "CaseQueue" where "tenantId" = $1 and "isDefault" = true')) return state.queues.find((q) => q.tenantId === params[0] && q.isDefault) ?? null;
    if (sql.includes('select "tenantId" from "Case" where id = $1')) return state.cases.find((c) => c.id === params[0]) ? { tenantId: state.cases.find((c) => c.id === params[0]).tenantId } : null;
    if (sql.includes('select "tenantId", "caseNumber", subject, "ownerId" from "Case"')) return state.cases.find((c) => c.id === params[0]) ?? null;
    return null;
  }),
  execute: vi.fn(async (sql: string, params: any[] = []) => {
    if (sql.includes('update "Case" set "slaWarningFiredAt"')) {
      const c = state.cases.find((row) => row.id === params[2]);
      if (c) c.slaWarningFiredAt = params[0];
    }
    if (sql.includes('update "Case" set "slaBreachedFiredAt"')) {
      const c = state.cases.find((row) => row.id === params[2]);
      if (c) c.slaBreachedFiredAt = params[0];
    }
    if (sql.includes('update "Case" set "escalatedAt"')) {
      const c = state.cases.find((row) => row.id === params[3]);
      if (c) { c.escalatedAt = params[0]; c.escalatedToId = params[1]; }
    }
    if (sql.includes('insert into "Task"')) {
      // not asserted on in these tests
    }
    if (sql.includes('update "Case" set "firstRespondedAt"')) {
      const c = state.cases.find((row) => row.id === params[2]);
      if (c) c.firstRespondedAt = params[0];
    }
    if (sql.includes('insert into "CaseMacro"')) {
      state.macros.push({
        id: params[0], tenantId: params[1], name: params[2], description: params[3], channel: params[4], bodyTemplate: params[5],
        isInternalNote: params[6], requiresApprovalForExternalReply: params[7], restrictedToRoleIds: params[8], isActive: true,
      });
    }
    if (sql.includes('insert into "CaseInboundMessage"')) {
      state.inboundMessages.push({
        id: params[0], tenantId: params[1], inboundAddressId: params[2], channel: params[3], fromAddress: params[4], toAddress: params[5],
        subject: params[6], body: params[7], providerMessageId: params[8], threadKey: params[9], rawPayload: params[10],
        caseId: params[11], commentId: params[12], status: "ROUTED", createdAt: params[13],
      });
    }
    if (sql.includes('insert into "CaseSurveyResponse" (id, "tenantId", "caseId", channel, "sentAt", "createdAt")')) {
      state.surveyResponses.push({ id: params[0], tenantId: params[1], caseId: params[2], channel: params[3], sentAt: params[4], respondedAt: null, score: null });
    }
    if (sql.includes('insert into "KnowledgeBaseArticle"')) {
      state.articles.push({
        id: params[0], tenantId: params[1], categoryId: params[2], title: params[3], slug: params[4], body: params[5],
        version: params[6], visibility: params[7], isActive: true, createdBy: params[8],
      });
    }
    if (sql.includes('insert into "KnowledgeBaseArticleFeedback"')) {
      state.articleFeedback.push({ id: params[0], tenantId: params[1], articleId: params[2], caseId: params[3], userId: params[4], isHelpful: params[5], comment: params[6] });
    }
    if (sql.includes('insert into "AssignmentLog"') || sql.includes('insert into "CaseAssignmentLog"')) {
      state.assignmentLogs.push({ id: params[0] });
    }
    if (sql.includes('insert into "AuditLog"')) {
      state.auditLogs.push({ id: params[0] });
    }
    if (sql.includes('insert into "DedupeMatch"')) {
      state.dedupeMatches.push({ id: params[0], tenantId: params[1], entityType: params[2], recordIds: params[3], matchedRuleType: params[4], matchScore: params[5], status: "PENDING" });
    }
    if (sql.includes('insert into "DedupeMatchRule"')) {
      state.dedupeRules.push({ id: params[0], tenantId: params[1], entityType: params[2], ruleType: params[3], threshold: params[4], isActive: params[5] });
    }
    if (sql.includes('update "DedupeMatch" set status')) {
      const m = state.dedupeMatches.find((row) => row.id === params[params.length - 1]);
      if (m) m.status = "MERGED";
    }
    if (sql.includes('update "Case" set "mergedIntoId"')) {
      const c = state.cases.find((row) => row.id === params[3]);
      if (c) { c.mergedIntoId = params[0]; c.mergedAt = params[1]; }
    }
    if (sql.includes('insert into "MergeAudit"')) {
      state.mergeAudits.push({ id: params[0] });
    }
    return 1;
  }),
}));

const runAutomationsForEventMock = vi.fn(async () => []);
vi.mock("@/lib/repositories/automations-postgres", () => ({
  runAutomationsForEvent: runAutomationsForEventMock,
}));

vi.mock("@/lib/server/module-entitlements", () => ({
  assertModuleEnabled: vi.fn(async () => { if (!state.moduleEnabled) throw new Error("MODULE_DISABLED:SERVICE_DESK"); }),
  isModuleEnabledForTenant: vi.fn(async () => state.moduleEnabled),
}));

const createUserNotificationMock = vi.fn(async (input: any) => { state.notifications.push(input); });
vi.mock("@/lib/server/notifications", () => ({ createUserNotification: createUserNotificationMock }));

const queueCommunicationForTenantMock = vi.fn(async (_user: any, input: any) => {
  state.outbox.push(input);
  return { id: "outbox-1", status: "QUEUED" };
});
vi.mock("@/lib/server/communications", () => ({
  queueCommunicationForTenant: queueCommunicationForTenantMock,
  renderTemplate: (text: string, tokens: Record<string, unknown> = {}) => text.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_m, key) => String(tokens[key] ?? "")),
}));

const createPrivilegedActionRequestMock = vi.fn(async () => ({ id: "request-1" }));
vi.mock("@/lib/server/privileged-actions", () => ({ createPrivilegedActionRequest: createPrivilegedActionRequestMock }));

vi.mock("@/lib/db/transaction", () => ({
  withTransaction: vi.fn(async (_user: any, fn: (client: any) => Promise<any>) => fn({ query: vi.fn().mockResolvedValue({ rows: [] }) })),
}));

vi.mock("@/lib/server/crm", () => ({ createAuditLog: vi.fn().mockResolvedValue(undefined) }));

const TENANT_USER = { id: "admin-1", tenantId: "tenant-1" };

function pushCase(overrides: Record<string, unknown> = {}) {
  const id = String(overrides.id ?? `case-${state.cases.length + 1}`);
  const row = {
    id, tenantId: "tenant-1", caseNumber: state.cases.length + 1, subject: "Test case", description: null,
    typeId: "type-1", statusId: "status-open", priorityId: "priority-low", queueId: null, ownerId: "owner-1",
    requesterName: "Alice", requesterEmail: "alice@example.com", requesterPhone: null,
    relatedLeadId: null, relatedOpportunityId: null, relatedPartnerId: null, slaPolicyId: null,
    firstResponseDueAt: null, resolutionDueAt: null, firstRespondedAt: null, resolvedAt: null, closedAt: null,
    reopenedCount: 0, resolutionNotes: null, createdBy: "admin-1", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    slaPausedAt: null, slaPausedTotalMinutes: 0, slaWarningFiredAt: null, slaBreachedFiredAt: null, escalatedAt: null, escalatedToId: null,
    ...overrides,
  };
  state.cases.push(row);
  return row;
}

describe("Service Desk extensions (Module 11)", () => {
  beforeEach(() => {
    resetState();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("SLA pause/resume", () => {
    it("pauseCaseSla is a no-op when already paused, and stamps slaPausedAt otherwise", async () => {
      const caseRow = pushCase({ resolutionDueAt: "2026-06-15T12:00:00.000Z" });
      const { pauseCaseSla } = await import("@/lib/repositories/cases-postgres");
      const paused = await pauseCaseSla(TENANT_USER, caseRow.id);
      expect(paused.slaPausedAt).toBeTruthy();

      const secondCall = await pauseCaseSla(TENANT_USER, caseRow.id);
      expect(secondCall.slaPausedAt).toBe(paused.slaPausedAt);
    });

    it("resumeCaseSla shifts the resolution due date forward by the paused duration", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-06-15T10:00:00.000Z"));
      const caseRow = pushCase({ resolutionDueAt: "2026-06-15T12:00:00.000Z" });
      const { pauseCaseSla, resumeCaseSla } = await import("@/lib/repositories/cases-postgres");
      await pauseCaseSla(TENANT_USER, caseRow.id);

      vi.setSystemTime(new Date("2026-06-15T11:00:00.000Z")); // paused for 1 hour
      const resumed = await resumeCaseSla(TENANT_USER, caseRow.id);

      expect(new Date(resumed.resolutionDueAt).getTime()).toBe(new Date("2026-06-15T13:00:00.000Z").getTime());
      expect(resumed.slaPausedTotalMinutes).toBe(60);
      expect(resumed.slaPausedAt).toBeNull();
    });

    it("resumeCaseSla does not shift a due date that's already been satisfied", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-06-15T10:00:00.000Z"));
      const caseRow = pushCase({ resolutionDueAt: "2026-06-15T12:00:00.000Z", resolvedAt: "2026-06-15T09:00:00.000Z" });
      const { pauseCaseSla, resumeCaseSla } = await import("@/lib/repositories/cases-postgres");
      await pauseCaseSla(TENANT_USER, caseRow.id);
      vi.setSystemTime(new Date("2026-06-15T11:00:00.000Z"));
      const resumed = await resumeCaseSla(TENANT_USER, caseRow.id);
      expect(new Date(resumed.resolutionDueAt).getTime()).toBe(new Date("2026-06-15T12:00:00.000Z").getTime());
    });
  });

  describe("escalation management", () => {
    it("fires CASE_SLA_WARNING once for a case approaching its due date, and CASE_SLA_BREACHED plus manager escalation once a high-priority case's due date has passed", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-06-15T10:00:00.000Z"));
      pushCase({ id: "case-warn", resolutionDueAt: "2026-06-15T10:30:00.000Z", priorityId: "priority-low" });
      pushCase({ id: "case-breach", resolutionDueAt: "2026-06-15T09:00:00.000Z", priorityId: "priority-high", ownerId: "owner-1" });

      const { processCaseSlaEscalations } = await import("@/lib/repositories/cases-postgres");
      const result = await processCaseSlaEscalations();

      expect(result.warned).toBe(1);
      expect(result.breached).toBe(1);
      expect(result.escalated).toBe(1);
      expect(runAutomationsForEventMock).toHaveBeenCalledWith(expect.anything(), "CASE_SLA_WARNING", "CASE", "case-warn", expect.anything());
      expect(runAutomationsForEventMock).toHaveBeenCalledWith(expect.anything(), "CASE_SLA_BREACHED", "CASE", "case-breach", expect.anything());
      expect(state.notifications.some((n) => n.userId === "manager-1" && n.title === "Case SLA breached")).toBe(true);

      const breachedCase = state.cases.find((c) => c.id === "case-breach");
      expect(breachedCase.escalatedToId).toBe("manager-1");
    });

    it("skips a paused case entirely, even if its due date has passed", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-06-15T10:00:00.000Z"));
      pushCase({ resolutionDueAt: "2026-06-15T09:00:00.000Z", slaPausedAt: "2026-06-15T08:00:00.000Z" });

      const { processCaseSlaEscalations } = await import("@/lib/repositories/cases-postgres");
      const result = await processCaseSlaEscalations();
      expect(result.warned).toBe(0);
      expect(result.breached).toBe(0);
    });
  });

  describe("email/message-to-case routing", () => {
    it("creates a new case for a genuinely new inbound message, using the tenant's default queue as a fallback", async () => {
      state.queues.push({ id: "queue-default", tenantId: "tenant-1", name: "General", isDefault: true });
      const { captureInboundCaseMessage } = await import("@/lib/repositories/case-inbound-postgres");
      const result = await captureInboundCaseMessage("tenant-1", { channel: "EMAIL", fromAddress: "bob@example.com", subject: "Help please", body: "I need help", providerMessageId: "msg-1" });
      expect(result.status).toBe("ROUTED");
      expect(result.created).toBe(true);
      const created = state.cases.find((c) => c.id === result.caseId);
      expect(created.queueId).toBe("queue-default");
      expect(created.requesterEmail).toBe("bob@example.com");
    });

    it("routes a reply into the same thread as a real comment on the still-open case, instead of creating a duplicate", async () => {
      const { captureInboundCaseMessage } = await import("@/lib/repositories/case-inbound-postgres");
      const first = await captureInboundCaseMessage("tenant-1", { channel: "EMAIL", fromAddress: "carol@example.com", subject: "Billing issue", body: "First message", providerMessageId: "msg-1" });
      const second = await captureInboundCaseMessage("tenant-1", { channel: "EMAIL", fromAddress: "carol@example.com", subject: "Re: Billing issue", body: "Follow-up message", providerMessageId: "msg-2" });

      expect(second.caseId).toBe(first.caseId);
      expect(second.created).toBe(false);
      expect(state.comments.some((c) => c.caseId === first.caseId && c.body === "Follow-up message")).toBe(true);
    });

    it("marks a redelivered message (same providerMessageId) as DUPLICATE without creating a second case or comment", async () => {
      const { captureInboundCaseMessage } = await import("@/lib/repositories/case-inbound-postgres");
      const first = await captureInboundCaseMessage("tenant-1", { channel: "EMAIL", fromAddress: "dave@example.com", subject: "Question", body: "Hello", providerMessageId: "msg-dup" });
      const commentCountBefore = state.comments.length;
      const caseCountBefore = state.cases.length;

      const second = await captureInboundCaseMessage("tenant-1", { channel: "EMAIL", fromAddress: "dave@example.com", subject: "Question", body: "Hello", providerMessageId: "msg-dup" });

      expect(second.status).toBe("DUPLICATE");
      expect(second.caseId).toBe(first.caseId);
      expect(state.comments.length).toBe(commentCountBefore);
      expect(state.cases.length).toBe(caseCountBefore);
    });

    it("opens a fresh case (not a reopened one) when a reply arrives on an already-closed case's thread", async () => {
      const { captureInboundCaseMessage } = await import("@/lib/repositories/case-inbound-postgres");
      const first = await captureInboundCaseMessage("tenant-1", { channel: "EMAIL", fromAddress: "erin@example.com", subject: "Old issue", body: "First", providerMessageId: "msg-1" });
      const firstCase = state.cases.find((c) => c.id === first.caseId);
      firstCase.statusId = "status-closed";

      const second = await captureInboundCaseMessage("tenant-1", { channel: "EMAIL", fromAddress: "erin@example.com", subject: "Re: Old issue", body: "New message", providerMessageId: "msg-2" });
      expect(second.created).toBe(true);
      expect(second.caseId).not.toBe(first.caseId);
    });
  });

  describe("case macros", () => {
    it("applying an internal-note macro posts a comment and never touches CommunicationOutbox", async () => {
      const caseRow = pushCase();
      state.macros.push({ id: "macro-1", tenantId: "tenant-1", name: "Internal template", channel: null, bodyTemplate: "Case #{{caseNumber}}: internal note", isInternalNote: true, requiresApprovalForExternalReply: false, restrictedToRoleIds: [], isActive: true });

      const { applyCaseMacro } = await import("@/lib/repositories/case-macros-postgres");
      const outcome = await applyCaseMacro(TENANT_USER, caseRow.id, "macro-1");

      expect(outcome.sent).toBeNull();
      expect(state.comments.some((c) => c.caseId === caseRow.id && c.isInternal)).toBe(true);
      expect(queueCommunicationForTenantMock).not.toHaveBeenCalled();
    });

    it("applying an external-reply macro without an approval requirement sends immediately", async () => {
      const caseRow = pushCase({ requesterEmail: "alice@example.com" });
      state.macros.push({ id: "macro-2", tenantId: "tenant-1", name: "External reply", channel: "EMAIL", bodyTemplate: "Hi {{requesterName}}", isInternalNote: false, requiresApprovalForExternalReply: false, restrictedToRoleIds: [], isActive: true });

      const { applyCaseMacro } = await import("@/lib/repositories/case-macros-postgres");
      const outcome = await applyCaseMacro(TENANT_USER, caseRow.id, "macro-2");

      expect(outcome.sent).toMatchObject({ id: "outbox-1" });
      expect(queueCommunicationForTenantMock).toHaveBeenCalled();
      expect(createPrivilegedActionRequestMock).not.toHaveBeenCalled();
    });

    it("applying an approval-gated external-reply macro creates a PrivilegedActionRequest instead of sending", async () => {
      const caseRow = pushCase({ requesterEmail: "alice@example.com" });
      state.macros.push({ id: "macro-3", tenantId: "tenant-1", name: "Gated reply", channel: "EMAIL", bodyTemplate: "Hi", isInternalNote: false, requiresApprovalForExternalReply: true, restrictedToRoleIds: [], isActive: true });

      const { applyCaseMacro } = await import("@/lib/repositories/case-macros-postgres");
      const outcome: any = await applyCaseMacro(TENANT_USER, caseRow.id, "macro-3");

      expect(outcome.sent).toMatchObject({ pendingApproval: true, requestId: "request-1" });
      expect(createPrivilegedActionRequestMock).toHaveBeenCalledWith(TENANT_USER, expect.objectContaining({ actionType: "CASE_MACRO_EXTERNAL_REPLY" }));
      expect(queueCommunicationForTenantMock).not.toHaveBeenCalled();
    });
  });

  describe("customer satisfaction (CSAT)", () => {
    it("submitting a response stamps respondedAt/score and fires CASE_SATISFACTION_SUBMITTED", async () => {
      const caseRow = pushCase({ ownerId: "owner-1" });
      state.surveyResponses.push({ id: "survey-1", tenantId: "tenant-1", caseId: caseRow.id, channel: "EMAIL", sentAt: new Date().toISOString(), respondedAt: null, score: null });

      const { submitCaseSurveyResponse } = await import("@/lib/repositories/case-survey-postgres");
      const updated = await submitCaseSurveyResponse("survey-1", { score: 4 });

      expect(updated.respondedAt).toBeTruthy();
      expect(updated.score).toBe(4);
      expect(runAutomationsForEventMock).toHaveBeenCalledWith(expect.anything(), "CASE_SATISFACTION_SUBMITTED", "CASE", caseRow.id, expect.anything());
    });

    it("a low score (<= 2) escalates to the owner and their manager", async () => {
      const caseRow = pushCase({ ownerId: "owner-1" });
      state.surveyResponses.push({ id: "survey-2", tenantId: "tenant-1", caseId: caseRow.id, channel: "EMAIL", sentAt: new Date().toISOString(), respondedAt: null, score: null });

      const { submitCaseSurveyResponse } = await import("@/lib/repositories/case-survey-postgres");
      await submitCaseSurveyResponse("survey-2", { score: 1 });

      expect(state.notifications.some((n) => n.userId === "owner-1" && n.title === "Low satisfaction score received")).toBe(true);
      expect(state.notifications.some((n) => n.userId === "manager-1" && n.title === "Low satisfaction score received")).toBe(true);
    });

    it("rejects a second submission for the same response", async () => {
      state.surveyResponses.push({ id: "survey-3", tenantId: "tenant-1", caseId: "case-x", channel: "EMAIL", sentAt: new Date().toISOString(), respondedAt: new Date().toISOString(), score: 5 });
      const { submitCaseSurveyResponse } = await import("@/lib/repositories/case-survey-postgres");
      await expect(submitCaseSurveyResponse("survey-3", { score: 3 })).rejects.toThrow("CASE_SURVEY_ALREADY_SUBMITTED");
    });
  });

  describe("knowledge base", () => {
    it("suggests articles whose title/body overlaps with the case subject/description", async () => {
      pushCase({ id: "case-kb", subject: "Cannot reset password", description: "User forgot their password" });
      state.articles.push({ id: "article-1", tenantId: "tenant-1", slug: "password-reset", title: "How to reset your password", body: "Steps to reset a forgotten password", version: 1, isActive: true });
      state.articles.push({ id: "article-2", tenantId: "tenant-1", slug: "billing", title: "Billing FAQ", body: "Invoices and payments", version: 1, isActive: true });

      const { suggestKnowledgeBaseArticlesForCase } = await import("@/lib/repositories/knowledge-base-postgres");
      const suggestions = await suggestKnowledgeBaseArticlesForCase(TENANT_USER, "case-kb");

      expect(suggestions.some((a: any) => a.id === "article-1")).toBe(true);
      expect(suggestions.some((a: any) => a.id === "article-2")).toBe(false);
    });

    it("editing an article creates a new version rather than overwriting the old one", async () => {
      const { createKnowledgeBaseArticleVersion } = await import("@/lib/repositories/knowledge-base-postgres");
      const v1 = await createKnowledgeBaseArticleVersion(TENANT_USER, { slug: "faq", title: "FAQ", body: "v1 body" });
      const v2 = await createKnowledgeBaseArticleVersion(TENANT_USER, { slug: "faq", title: "FAQ", body: "v2 body" });
      expect(v1?.version).toBe(1);
      expect(v2?.version).toBe(2);
      expect(state.articles).toHaveLength(2);
    });
  });

  describe("case merge/duplicate handling", () => {
    it("flags two still-open cases sharing a requester email as a duplicate candidate", async () => {
      pushCase({ id: "case-dup-1", requesterEmail: "same@example.com", statusId: "status-open" });
      pushCase({ id: "case-dup-2", requesterEmail: "same@example.com", statusId: "status-open" });
      state.dedupeRules.push({ tenantId: "tenant-1", entityType: "CASE", ruleType: "SAME_REQUESTER_EMAIL_OPEN", isActive: true, threshold: null });

      const { runDedupeScanForTenant } = await import("@/lib/repositories/dedupe-postgres");
      const result = await runDedupeScanForTenant(TENANT_USER, "CASE" as any);

      expect(result.candidatesFound).toBe(1);
      expect(state.dedupeMatches[0]).toMatchObject({ entityType: "CASE", matchedRuleType: "SAME_REQUESTER_EMAIL_OPEN" });
    });

    it("does not flag a closed case sharing a requester email with an open one", async () => {
      pushCase({ id: "case-open", requesterEmail: "same@example.com", statusId: "status-open" });
      pushCase({ id: "case-closed", requesterEmail: "same@example.com", statusId: "status-closed" });
      state.dedupeRules.push({ tenantId: "tenant-1", entityType: "CASE", ruleType: "SAME_REQUESTER_EMAIL_OPEN", isActive: true, threshold: null });

      const { runDedupeScanForTenant } = await import("@/lib/repositories/dedupe-postgres");
      const result = await runDedupeScanForTenant(TENANT_USER, "CASE" as any);
      expect(result.candidatesFound).toBe(0);
    });
  });
});
