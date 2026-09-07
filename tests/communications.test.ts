import { beforeEach, describe, expect, it, vi } from "vitest";

const queryMock = vi.fn();
const queryOneMock = vi.fn();
const executeMock = vi.fn();

vi.mock("@/lib/db/query", () => ({
  query: queryMock,
  queryOne: queryOneMock,
  execute: executeMock,
}));

vi.mock("@/lib/server/crm", () => ({
  createAuditLog: vi.fn(async () => null),
}));

vi.mock("@/lib/repositories/automations-postgres", () => ({
  runAutomationsForEvent: vi.fn(async () => []),
}));

vi.mock("@/lib/server/next-best-action", () => ({
  refreshNextBestActionsForRecord: vi.fn(async () => null),
}));

describe("communications connectors", () => {
  beforeEach(() => {
    queryMock.mockReset();
    queryOneMock.mockReset();
    executeMock.mockReset();
    vi.restoreAllMocks();
  });

  it("redacts provider secretConfig on list", async () => {
    queryMock.mockResolvedValueOnce([
      {
        id: "provider-1",
        channel: "EMAIL",
        providerType: "SMTP",
        name: "Primary SMTP",
        config: { host: "smtp.example.com" },
        secretConfig: { username: "u", password: "p" },
      },
    ]);

    const { listCommunicationProvidersForTenant } = await import("@/lib/server/communications");
    const rows = await listCommunicationProvidersForTenant({ id: "admin-1", tenantId: "tenant-1" });

    expect(rows[0].secretConfig).toEqual({ username: "********", password: "********" });
  });

  it("renders personalization tokens", async () => {
    const { renderTemplate } = await import("@/lib/server/communications");
    expect(renderTemplate("Hi {{ lead.name }}, call {{owner}}", { "lead.name": "Anika", owner: "Riya" })).toBe("Hi Anika, call Riya");
  });

  it("queues suppressed messages without sending", async () => {
    queryOneMock
      .mockResolvedValueOnce({ id: "suppression-1" })
      .mockResolvedValueOnce({
        id: "outbox-1",
        tenantId: "tenant-1",
        channel: "SMS",
        recipient: "+919999999999",
        status: "SUPPRESSED",
      })
      .mockResolvedValueOnce({ id: "event-1" });

    const { queueCommunicationForTenant } = await import("@/lib/server/communications");
    const row = await queueCommunicationForTenant(
      { id: "admin-1", tenantId: "tenant-1" },
      { channel: "SMS", recipient: "+91 99999 99999", body: "Hello" },
    );

    expect(row.status).toBe("SUPPRESSED");
    expect(queryOneMock.mock.calls[1][0]).toContain('insert into "CommunicationOutbox"');
    expect(queryOneMock.mock.calls[2][0]).toContain('insert into "CommunicationDeliveryEvent"');
  });

  it("processes queued HTTP connector messages and records sent events", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ providerMessageId: "msg-1" }), { status: 200 }),
    );
    queryMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: "outbox-1",
          tenantId: "tenant-1",
          channel: "WHATSAPP",
          recipient: "+919999999999",
          subject: null,
          body: "Hello",
          payload: {},
          attempts: 0,
        },
      ])
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(1);
    queryOneMock
      .mockResolvedValueOnce({
        id: "provider-1",
        tenantId: "tenant-1",
        channel: "WHATSAPP",
        providerType: "GENERIC_HTTP",
        config: { endpointUrl: "https://provider.example/send", bodyTemplate: { to: "{{recipient}}", text: "{{body}}" } },
        secretConfig: { headers: { Authorization: "Bearer token" } },
      })
      .mockResolvedValueOnce({ id: "sender-1", address: "+911111111111" })
      .mockResolvedValueOnce({ id: "event-1" });

    const { processCommunicationOutbox } = await import("@/lib/server/communications");
    const result = await processCommunicationOutbox(10, new Date("2026-07-18T00:00:00.000Z"));

    expect(result.processed).toEqual([{ id: "outbox-1", status: "SENT" }]);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://provider.example/send",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer token" }),
        body: JSON.stringify({ to: "+919999999999", text: "Hello" }),
      }),
    );
  });

  it("turns pending report email deliveries into email outbox rows", async () => {
    queryMock
      .mockResolvedValueOnce([
        {
          id: "delivery-1",
          tenantId: "tenant-1",
          reportKey: "funnel_conversion_by_stage",
          recipients: ["admin@example.com"],
          subject: "Scheduled report",
          body: { report: { rows: [] } },
          format: "LINK",
        },
      ])
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce([]);

    const { processCommunicationOutbox } = await import("@/lib/server/communications");
    const result = await processCommunicationOutbox(10, new Date("2026-07-18T00:00:00.000Z"));

    expect(result.processed).toEqual([]);
    expect(queryMock.mock.calls[1][0]).toContain('insert into "CommunicationOutbox"');
    expect(queryMock.mock.calls[2][0]).toContain('update "ReportEmailDelivery" set status');
  });

  it("defers marketing campaign messages during quiet hours", async () => {
    queryMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: "outbox-quiet",
          tenantId: "tenant-1",
          channel: "EMAIL",
          recipient: "lead@example.com",
          subject: "Admissions update",
          body: "Hello",
          payload: {},
          attempts: 0,
          sourceType: "MARKETING_CAMPAIGN",
          sourceId: "campaign-1",
        },
      ])
      .mockResolvedValueOnce(1);
    queryOneMock.mockResolvedValueOnce({
      throttlePerMinute: 60,
      quietHours: { enabled: true, start: "21:00", end: "09:00" },
    });

    const { processCommunicationOutbox } = await import("@/lib/server/communications");
    const result = await processCommunicationOutbox(10, new Date("2026-07-18T22:15:00.000Z"));

    expect(result.processed[0]).toMatchObject({ id: "outbox-quiet", status: "DEFERRED", reason: "QUIET_HOURS" });
    expect(queryMock.mock.calls[2][0]).toContain('update "CommunicationOutbox"');
    expect(queryMock.mock.calls[2][1][0]).toBe("2026-07-19T03:30:00.000Z");
  });

  it("defers marketing campaign messages when throttle is exhausted", async () => {
    queryMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: "outbox-throttle",
          tenantId: "tenant-1",
          channel: "SMS",
          recipient: "+919999999999",
          subject: null,
          body: "Hello",
          payload: {},
          attempts: 0,
          sourceType: "MARKETING_CAMPAIGN",
          sourceId: "campaign-1",
        },
      ])
      .mockResolvedValueOnce(1);
    queryOneMock
      .mockResolvedValueOnce({
        throttlePerMinute: 1,
        quietHours: { enabled: false, start: "21:00", end: "09:00" },
      })
      .mockResolvedValueOnce({ count: 1 });

    const { processCommunicationOutbox } = await import("@/lib/server/communications");
    const result = await processCommunicationOutbox(10, new Date("2026-07-18T10:00:00.000Z"));

    expect(result.processed[0]).toMatchObject({ id: "outbox-throttle", status: "DEFERRED", reason: "THROTTLE" });
    expect(queryMock.mock.calls[2][1][0]).toBe("2026-07-18T10:01:00.000Z");
  });

  describe("channel fallback (gap checklist Module 8, item 8)", () => {
    it("fires an immediate fallback send when the primary channel is suppressed", async () => {
      queryOneMock
        .mockResolvedValueOnce({ id: "suppression-1" }) // isSuppressed(primary)
        .mockResolvedValueOnce({ id: "outbox-primary", tenantId: "tenant-1", channel: "EMAIL", recipient: "lead@example.com", status: "SUPPRESSED" }) // insert outbox(primary)
        .mockResolvedValueOnce({ id: "event-1" }) // recordDeliveryEvent(primary)
        .mockResolvedValueOnce(null) // isSuppressed(fallback)
        .mockResolvedValueOnce({ id: "outbox-fallback", tenantId: "tenant-1", channel: "SMS", recipient: "+919999999999", status: "QUEUED" }); // insert outbox(fallback)

      const { queueCommunicationForTenant } = await import("@/lib/server/communications");
      const row = await queueCommunicationForTenant(
        { id: "admin-1", tenantId: "tenant-1" },
        {
          channel: "EMAIL",
          recipient: "lead@example.com",
          body: "Hello",
          fallback: { channel: "SMS", recipient: "+919999999999", body: "Fallback SMS" },
        },
      );

      expect(row.status).toBe("SUPPRESSED");
      expect(queryOneMock).toHaveBeenCalledTimes(5);
      // Call 4: the fallback's own suppression check, on the fallback channel/recipient.
      expect(queryOneMock.mock.calls[3][1]).toEqual(["tenant-1", "SMS", "+919999999999"]);
      // Call 5: the fallback's own outbox insert -- never carries its own `fallback` (payload
      // only records where it came from), so it can't chain further than one hop.
      const fallbackInsert = queryOneMock.mock.calls[4];
      expect(String(fallbackInsert[0])).toContain('insert into "CommunicationOutbox"');
      expect(fallbackInsert[1][6]).toBe("+919999999999"); // recipient
      expect(fallbackInsert[1][9].fallbackReason).toBe("SUPPRESSED");
    });

    it("does not fire an immediate fallback when immediate=false, but still persists it on payload for the delayed path", async () => {
      queryOneMock
        .mockResolvedValueOnce({ id: "suppression-1" }) // isSuppressed(primary)
        .mockResolvedValueOnce({ id: "outbox-primary", tenantId: "tenant-1", channel: "EMAIL", recipient: "lead@example.com", status: "SUPPRESSED" }) // insert outbox(primary)
        .mockResolvedValueOnce({ id: "event-1" }); // recordDeliveryEvent(primary)

      const { queueCommunicationForTenant } = await import("@/lib/server/communications");
      await queueCommunicationForTenant(
        { id: "admin-1", tenantId: "tenant-1" },
        {
          channel: "EMAIL",
          recipient: "lead@example.com",
          body: "Hello",
          fallback: { channel: "SMS", recipient: "+919999999999", body: "Fallback SMS", immediate: false },
        },
      );

      // Only the 3 primary-path calls -- no recursive fallback insert.
      expect(queryOneMock).toHaveBeenCalledTimes(3);
      const primaryInsert = queryOneMock.mock.calls[1];
      expect(primaryInsert[1][9].fallback).toMatchObject({ channel: "SMS", immediate: false });
    });

    it("fires a delayed fallback send once processCommunicationOutbox exhausts retries (FAILED)", async () => {
      queryMock
        .mockResolvedValueOnce([]) // queuePendingReportEmailDeliveries
        .mockResolvedValueOnce([
          {
            id: "outbox-1",
            tenantId: "tenant-1",
            channel: "EMAIL",
            recipient: "lead@example.com",
            subject: null,
            body: "Hello",
            payload: { fallback: { channel: "SMS", recipient: "+919999999999", body: "Sorry we missed you", delayMinutes: 30 } },
            attempts: 4,
          },
        ])
        .mockResolvedValueOnce(1) // SENDING update
        .mockResolvedValueOnce(1); // FAILED update
      queryOneMock
        .mockResolvedValueOnce(null) // getProviderForMessage -> not configured -> sendMessage throws
        .mockResolvedValueOnce({ id: "event-1", entityType: null, entityId: null }) // recordDeliveryEvent(FAILED)
        .mockResolvedValueOnce(null) // isSuppressed(fallback)
        .mockResolvedValueOnce({ id: "outbox-fallback", tenantId: "tenant-1", channel: "SMS", recipient: "+919999999999", status: "QUEUED" }); // insert outbox(fallback)

      const { processCommunicationOutbox } = await import("@/lib/server/communications");
      const result = await processCommunicationOutbox(10, new Date("2026-07-18T10:00:00.000Z"));

      expect(result.processed[0]).toMatchObject({ id: "outbox-1", status: "FAILED" });
      const fallbackInsert = queryOneMock.mock.calls[3];
      expect(String(fallbackInsert[0])).toContain('insert into "CommunicationOutbox"');
      expect(fallbackInsert[1][6]).toBe("+919999999999");
      // nextAttemptAt honors the configured 30-minute delay.
      expect(fallbackInsert[1][11]).toBe("2026-07-18T10:30:00.000Z");
    });
  });

  describe("contact fatigue governance (gap checklist Module 8, item 10)", () => {
    it("blocks a marketing send once the daily per-contact cap is hit", async () => {
      queryOneMock
        .mockResolvedValueOnce(null) // isSuppressed
        .mockResolvedValueOnce(null) // isOptedOut
        .mockResolvedValueOnce({ exclusionWindows: [] }) // checkExclusionWindow
        .mockResolvedValueOnce({ dailyCapPerContact: 1, weeklyCapPerContact: null, monthlyCapPerContact: null, channelCaps: {} }) // checkFatigueCap settings
        .mockResolvedValueOnce({ count: 1 }) // DAILY_CAP count -- already at the cap
        .mockResolvedValueOnce({ id: "outbox-1", tenantId: "tenant-1", channel: "EMAIL", recipient: "lead@example.com", status: "SUPPRESSED" }) // insert outbox
        .mockResolvedValueOnce({ id: "event-1", entityType: "LEAD", entityId: "lead-1" }); // recordDeliveryEvent

      const { queueCommunicationForTenant } = await import("@/lib/server/communications");
      const row = await queueCommunicationForTenant(
        { id: "admin-1", tenantId: "tenant-1" },
        { channel: "EMAIL", recipient: "lead@example.com", body: "Hello", sourceType: "MARKETING_CAMPAIGN", entityType: "LEAD", entityId: "lead-1" },
      );

      expect(row.status).toBe("SUPPRESSED");
      const eventInsert = queryOneMock.mock.calls[6];
      expect(eventInsert[1][6]).toMatchObject({ reason: "DAILY_CAP" });
    });

    it("blocks a marketing send during a tenant-wide exclusion window", async () => {
      const today = new Date().toISOString().slice(0, 10);
      queryOneMock
        .mockResolvedValueOnce(null) // isSuppressed
        // isOptedOut makes no query here: entityType/entityId aren't passed, so it short-circuits.
        .mockResolvedValueOnce({ exclusionWindows: [{ startDate: today, endDate: today, reason: "Admissions blackout" }] }) // checkExclusionWindow
        .mockResolvedValueOnce({ id: "outbox-1", tenantId: "tenant-1", channel: "EMAIL", recipient: "lead@example.com", status: "SUPPRESSED" }) // insert outbox
        .mockResolvedValueOnce({ id: "event-1", entityType: null, entityId: null }); // recordDeliveryEvent

      const { queueCommunicationForTenant } = await import("@/lib/server/communications");
      const row = await queueCommunicationForTenant(
        { id: "admin-1", tenantId: "tenant-1" },
        { channel: "EMAIL", recipient: "lead@example.com", body: "Hello", sourceType: "AUTOMATION" },
      );

      expect(row.status).toBe("SUPPRESSED");
      // checkFatigueCap must never even be queried once the exclusion window has already blocked the send.
      expect(queryOneMock).toHaveBeenCalledTimes(4);
    });

    it("never applies fatigue/exclusion checks to a non-marketing (transactional) send", async () => {
      queryOneMock
        .mockResolvedValueOnce(null) // isSuppressed
        .mockResolvedValueOnce(null) // isOptedOut
        .mockResolvedValueOnce({ id: "outbox-1", tenantId: "tenant-1", channel: "EMAIL", recipient: "lead@example.com", status: "QUEUED" }); // insert outbox

      const { queueCommunicationForTenant } = await import("@/lib/server/communications");
      const row = await queueCommunicationForTenant(
        { id: "admin-1", tenantId: "tenant-1" },
        { channel: "EMAIL", recipient: "lead@example.com", body: "Password reset", sourceType: "CASE_REPLY", entityType: "LEAD", entityId: "lead-1" },
      );

      expect(row.status).toBe("QUEUED");
      expect(queryOneMock).toHaveBeenCalledTimes(3);
    });
  });

  describe("template governance (gap checklist Module 8, item 12)", () => {
    it("upsertCommunicationTemplateForTenant always inserts the next version rather than overwriting, and resets to DRAFT", async () => {
      queryOneMock
        .mockResolvedValueOnce({ version: 2 }) // max(version) lookup
        .mockResolvedValueOnce({
          id: "template-3",
          tenantId: "tenant-1",
          channel: "EMAIL",
          name: "Welcome",
          subject: "Hi {{firstName}}",
          body: "Welcome {{firstName}}",
          version: 3,
          locale: "en",
          approvalStatus: "DRAFT",
          declaredTokens: ["firstName"],
        });

      const { upsertCommunicationTemplateForTenant } = await import("@/lib/server/communications");
      const row = await upsertCommunicationTemplateForTenant(
        { id: "admin-1", tenantId: "tenant-1" },
        { channel: "EMAIL", name: "Welcome", subject: "Hi {{firstName}}", body: "Welcome {{firstName}}" },
      );

      expect(row.version).toBe(3);
      expect(row.approvalStatus).toBe("DRAFT");
      const insertCall = queryOneMock.mock.calls[1];
      expect(insertCall[1][8]).toBe(3); // version param
    });

    it("flags tokens used in the body that were not declared", async () => {
      queryOneMock.mockResolvedValueOnce({ version: 0 }).mockResolvedValueOnce({
        id: "template-1",
        subject: null,
        body: "Hi {{firstName}}, your code is {{otp}}",
      });

      const { upsertCommunicationTemplateForTenant } = await import("@/lib/server/communications");
      const row = await upsertCommunicationTemplateForTenant(
        { id: "admin-1", tenantId: "tenant-1" },
        { channel: "SMS", name: "OTP", body: "Hi {{firstName}}, your code is {{otp}}", declaredTokens: ["firstName"] },
      );

      expect(row.tokenWarnings).toEqual(["otp"]);
    });

    it("setTemplateApprovalStatusForTenant flips approvalStatus and stamps approvedBy/approvedAt only on APPROVED", async () => {
      queryOneMock.mockResolvedValueOnce({ id: "template-1", approvalStatus: "APPROVED", approvedBy: "admin-1" });

      const { setTemplateApprovalStatusForTenant } = await import("@/lib/server/communications");
      const row = await setTemplateApprovalStatusForTenant({ id: "admin-1", tenantId: "tenant-1" }, "template-1", "APPROVED");

      expect(row.approvalStatus).toBe("APPROVED");
      expect(queryOneMock.mock.calls[0][1]).toEqual(["APPROVED", "admin-1", expect.any(String), "tenant-1", "template-1"]);
    });

    it("renders a locked header/footer around the body and substitutes snippets at send time", async () => {
      queryOneMock
        .mockResolvedValueOnce(null) // isSuppressed
        // isOptedOut makes no query here: entityType/entityId aren't passed.
        .mockResolvedValueOnce({
          id: "template-1",
          channel: "EMAIL",
          subject: "Hi",
          body: "Body {{snippet:legal}}",
          tokenDefaults: {},
          lockedHeader: "-- header --",
          lockedFooter: "-- footer --",
        }) // getTemplate
        .mockResolvedValueOnce({ id: "outbox-1", tenantId: "tenant-1", channel: "EMAIL", recipient: "lead@example.com", status: "QUEUED", body: "" });
      queryMock.mockResolvedValueOnce([{ key: "legal", body: "Terms apply." }]); // substituteSnippets lookup

      const { queueCommunicationForTenant } = await import("@/lib/server/communications");
      await queueCommunicationForTenant(
        { id: "admin-1", tenantId: "tenant-1" },
        { channel: "EMAIL", recipient: "lead@example.com", templateId: "template-1" },
      );

      const insertCall = queryOneMock.mock.calls[2];
      const insertedBody = insertCall[1][8];
      expect(insertedBody).toBe("-- header --\nBody Terms apply.\n-- footer --");
    });
  });

  describe("phone suppression and consent", () => {
    it("isPhoneSuppressed returns true when a matching PHONE suppression row exists", async () => {
      queryOneMock.mockResolvedValueOnce({ id: "suppression-1" });
      const { isPhoneSuppressed } = await import("@/lib/server/communications");
      const result = await isPhoneSuppressed("tenant-1", "+919999999999");
      expect(result).toBe(true);
      expect(queryOneMock.mock.calls[0][1]).toEqual(["tenant-1", "+919999999999"]);
    });

    it("isPhoneSuppressed returns false when no row matches", async () => {
      queryOneMock.mockResolvedValueOnce(null);
      const { isPhoneSuppressed } = await import("@/lib/server/communications");
      expect(await isPhoneSuppressed("tenant-1", "+919999999999")).toBe(false);
    });

    it("isPhoneOptedOut returns false without an entity to check", async () => {
      const { isPhoneOptedOut } = await import("@/lib/server/communications");
      expect(await isPhoneOptedOut("tenant-1")).toBe(false);
      expect(queryOneMock).not.toHaveBeenCalled();
    });

    it("isPhoneOptedOut returns true when the entity's PHONE consent status is OPTED_OUT", async () => {
      queryOneMock.mockResolvedValueOnce({ status: "OPTED_OUT" });
      const { isPhoneOptedOut } = await import("@/lib/server/communications");
      expect(await isPhoneOptedOut("tenant-1", "LEAD", "lead-1")).toBe(true);
    });

    it("isPhoneOptedOut returns false when consent status is not OPTED_OUT", async () => {
      queryOneMock.mockResolvedValueOnce({ status: "OPTED_IN" });
      const { isPhoneOptedOut } = await import("@/lib/server/communications");
      expect(await isPhoneOptedOut("tenant-1", "LEAD", "lead-1")).toBe(false);
    });

    it("suppressPhoneNumberForTenant normalizes whitespace and defaults reason to MANUAL", async () => {
      queryOneMock.mockResolvedValueOnce({ id: "suppression-1", tenantId: "tenant-1", channel: "PHONE", address: "+919999999999", reason: "MANUAL" });
      const { suppressPhoneNumberForTenant } = await import("@/lib/server/communications");
      const row = await suppressPhoneNumberForTenant({ id: "admin-1", tenantId: "tenant-1" }, "+91 99999 99999");
      expect(row.address).toBe("+919999999999");
      expect(queryOneMock.mock.calls[0][1][2]).toBe("+919999999999");
      expect(queryOneMock.mock.calls[0][1][3]).toBe("MANUAL");
    });

    it("suppressPhoneNumberForTenant throws when the number is blank", async () => {
      const { suppressPhoneNumberForTenant } = await import("@/lib/server/communications");
      await expect(suppressPhoneNumberForTenant({ id: "admin-1", tenantId: "tenant-1" }, "   ")).rejects.toThrow("RECIPIENT_REQUIRED");
    });

    it("listPhoneSuppressionsForTenant scopes the query to the tenant", async () => {
      queryMock.mockResolvedValueOnce([{ id: "suppression-1" }]);
      const { listPhoneSuppressionsForTenant } = await import("@/lib/server/communications");
      const rows = await listPhoneSuppressionsForTenant({ id: "admin-1", tenantId: "tenant-1" });
      expect(rows).toHaveLength(1);
      expect(queryMock.mock.calls[0][1]).toEqual(["tenant-1"]);
    });

    it("removePhoneSuppressionForTenant scopes the delete to the tenant and PHONE channel", async () => {
      executeMock.mockResolvedValueOnce(1);
      const { removePhoneSuppressionForTenant } = await import("@/lib/server/communications");
      await removePhoneSuppressionForTenant({ id: "admin-1", tenantId: "tenant-1" }, "suppression-1");
      expect(executeMock.mock.calls[0][1]).toEqual(["suppression-1", "tenant-1"]);
    });
  });

  describe("consent lawful basis and history", () => {
    it("upsertCommunicationConsentForTenant writes lawfulBasis on the consent row and an append-only history row", async () => {
      queryOneMock.mockResolvedValueOnce({
        id: "consent-1",
        tenantId: "tenant-1",
        entityType: "LEAD",
        entityId: "lead-1",
        channel: "EMAIL",
        status: "OPTED_IN",
        source: "MANUAL",
        lawfulBasis: "CONSENT",
      });
      const { upsertCommunicationConsentForTenant } = await import("@/lib/server/communications");

      const row = await upsertCommunicationConsentForTenant(
        { id: "admin-1", tenantId: "tenant-1" },
        { entityType: "LEAD", entityId: "lead-1", channel: "EMAIL", status: "OPTED_IN", lawfulBasis: "CONSENT" },
      );

      expect(row.lawfulBasis).toBe("CONSENT");
      const upsertParams = queryOneMock.mock.calls[0][1];
      expect(upsertParams).toContain("CONSENT");
      const historyInsertCall = executeMock.mock.calls.find((c: any[]) => String(c[0]).includes('insert into "CommunicationConsentHistory"'));
      expect(historyInsertCall).toBeTruthy();
      expect(historyInsertCall![1]).toEqual(
        expect.arrayContaining(["tenant-1", "LEAD", "lead-1", "EMAIL", "OPTED_IN", "CONSENT", "MANUAL", "admin-1"]),
      );
    });

    it("listConsentHistoryForTenant scopes to tenant+entity and orders newest first", async () => {
      queryMock.mockResolvedValueOnce([{ id: "h1", status: "OPTED_OUT" }]);
      const { listConsentHistoryForTenant } = await import("@/lib/server/communications");
      const rows = await listConsentHistoryForTenant({ id: "admin-1", tenantId: "tenant-1" }, "LEAD", "lead-1");
      expect(rows).toHaveLength(1);
      expect(queryMock.mock.calls[0][1]).toEqual(["tenant-1", "LEAD", "lead-1"]);
    });
  });

  describe("suppression retention", () => {
    it("suppressCommunicationAddressForTenant accepts an optional expiresAt", async () => {
      queryOneMock.mockResolvedValueOnce({ id: "supp-1", tenantId: "tenant-1", channel: "EMAIL", address: "a@x.com", expiresAt: "2026-03-01T00:00:00.000Z" });
      const { suppressCommunicationAddressForTenant } = await import("@/lib/server/communications");
      const row = await suppressCommunicationAddressForTenant(
        { id: "admin-1", tenantId: "tenant-1" },
        { channel: "EMAIL", address: "a@x.com", expiresAt: "2026-03-01T00:00:00.000Z" },
      );
      expect(row.expiresAt).toBe("2026-03-01T00:00:00.000Z");
      expect(queryOneMock.mock.calls[0][1]).toContain("2026-03-01T00:00:00.000Z");
    });

    it("suppressCommunicationAddressForTenant defaults expiresAt to null (permanent)", async () => {
      queryOneMock.mockResolvedValueOnce({ id: "supp-1" });
      const { suppressCommunicationAddressForTenant } = await import("@/lib/server/communications");
      await suppressCommunicationAddressForTenant({ id: "admin-1", tenantId: "tenant-1" }, { channel: "EMAIL", address: "a@x.com" });
      expect(queryOneMock.mock.calls[0][1]).toContain(null);
    });

    it("processDueSuppressionExpiry deletes only rows past their expiresAt, bounded by limit", async () => {
      executeMock.mockResolvedValueOnce(3);
      const { processDueSuppressionExpiry } = await import("@/lib/server/communications");
      const result = await processDueSuppressionExpiry(50);
      expect(result.processed).toBe(3);
      expect(executeMock.mock.calls[0][1][1]).toBe(50);
    });
  });
});
