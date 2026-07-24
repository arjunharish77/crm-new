import { beforeEach, describe, expect, it, vi } from "vitest";

const queryMock = vi.fn();
const queryOneMock = vi.fn();

vi.mock("@/lib/db/query", () => ({
  query: queryMock,
  queryOne: queryOneMock,
}));

vi.mock("@/lib/server/crm", () => ({
  createAuditLog: vi.fn(async () => null),
}));

describe("communications connectors", () => {
  beforeEach(() => {
    queryMock.mockReset();
    queryOneMock.mockReset();
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
});
