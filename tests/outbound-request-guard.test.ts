import { beforeEach, describe, expect, it, vi } from "vitest";

// F07 fix (WP06): tenant-configurable outbound destinations (webhook subscriptions, marketplace
// app webhooks, AI provider endpoints, HTTP communication connectors) previously had no
// validation beyond "non-empty URL" -- confirmed by the audit as exploitable SSRF, most severely
// via the webhook test-delivery console, which echoes the raw response body back to the caller.
const dnsMocks = vi.hoisted(() => ({ lookup: vi.fn() }));
vi.mock("node:dns/promises", () => ({ default: { lookup: dnsMocks.lookup } }));

beforeEach(() => {
  dnsMocks.lookup.mockReset();
});

describe("assertSafeOutboundUrl", () => {
  it("rejects a non-http(s) scheme", async () => {
    const { assertSafeOutboundUrl, UnsafeDestinationError } = await import("@/lib/server/outbound-request-guard");
    await expect(assertSafeOutboundUrl("file:///etc/passwd")).rejects.toThrow(UnsafeDestinationError);
    await expect(assertSafeOutboundUrl("ftp://example.com/x")).rejects.toThrow(UnsafeDestinationError);
  });

  it("rejects an unparsable URL", async () => {
    const { assertSafeOutboundUrl } = await import("@/lib/server/outbound-request-guard");
    await expect(assertSafeOutboundUrl("not a url")).rejects.toThrow("not a valid URL");
  });

  it("rejects the literal hostname localhost without needing DNS", async () => {
    const { assertSafeOutboundUrl } = await import("@/lib/server/outbound-request-guard");
    await expect(assertSafeOutboundUrl("http://localhost:8080/webhook")).rejects.toThrow();
    expect(dnsMocks.lookup).not.toHaveBeenCalled();
  });

  it("rejects the cloud-metadata literal IP directly, without a DNS lookup", async () => {
    const { assertSafeOutboundUrl } = await import("@/lib/server/outbound-request-guard");
    await expect(assertSafeOutboundUrl("http://169.254.169.254/latest/meta-data/")).rejects.toThrow();
    expect(dnsMocks.lookup).not.toHaveBeenCalled();
  });

  it.each([
    ["127.0.0.1", "loopback"],
    ["10.1.2.3", "RFC1918 10/8"],
    ["172.16.5.5", "RFC1918 172.16/12"],
    ["192.168.1.1", "RFC1918 192.168/16"],
    ["169.254.169.254", "link-local / cloud metadata"],
    ["0.0.0.0", "this-network"],
  ])("rejects the literal private/loopback IP %s (%s)", async (ip) => {
    const { assertSafeOutboundUrl } = await import("@/lib/server/outbound-request-guard");
    await expect(assertSafeOutboundUrl(`http://${ip}/x`)).rejects.toThrow();
  });

  it("rejects a hostname that currently resolves to a private IP (not just a literal IP in the URL)", async () => {
    dnsMocks.lookup.mockResolvedValue([{ address: "10.0.0.5", family: 4 }]);
    const { assertSafeOutboundUrl } = await import("@/lib/server/outbound-request-guard");
    await expect(assertSafeOutboundUrl("https://internal-service.example.invalid/webhook")).rejects.toThrow(
      "resolves to a disallowed address",
    );
    expect(dnsMocks.lookup).toHaveBeenCalledWith("internal-service.example.invalid", { all: true, verbatim: true });
  });

  it("rejects when even ONE of several resolved addresses is private (multi-A-record DNS rebinding shape)", async () => {
    dnsMocks.lookup.mockResolvedValue([
      { address: "203.0.113.9", family: 4 }, // looks public...
      { address: "127.0.0.1", family: 4 }, // ...but this one doesn't
    ]);
    const { assertSafeOutboundUrl } = await import("@/lib/server/outbound-request-guard");
    await expect(assertSafeOutboundUrl("https://mixed.example.invalid/webhook")).rejects.toThrow();
  });

  it("rejects an IPv6 loopback/link-local/unique-local destination", async () => {
    const { assertSafeOutboundUrl } = await import("@/lib/server/outbound-request-guard");
    await expect(assertSafeOutboundUrl("http://[::1]/x")).rejects.toThrow();
    await expect(assertSafeOutboundUrl("http://[fe80::1]/x")).rejects.toThrow();
    await expect(assertSafeOutboundUrl("http://[fd00::1]/x")).rejects.toThrow();
  });

  it("rejects an IPv4-mapped IPv6 address pointing at a private range", async () => {
    const { assertSafeOutboundUrl } = await import("@/lib/server/outbound-request-guard");
    await expect(assertSafeOutboundUrl("http://[::ffff:127.0.0.1]/x")).rejects.toThrow();
  });

  it("rejects when the hostname cannot be resolved at all", async () => {
    dnsMocks.lookup.mockRejectedValue(new Error("ENOTFOUND"));
    const { assertSafeOutboundUrl } = await import("@/lib/server/outbound-request-guard");
    await expect(assertSafeOutboundUrl("https://nonexistent.example.invalid/webhook")).rejects.toThrow(
      "could not be resolved",
    );
  });

  it("allows a normal public destination", async () => {
    dnsMocks.lookup.mockResolvedValue([{ address: "8.8.8.8", family: 4 }]);
    const { assertSafeOutboundUrl } = await import("@/lib/server/outbound-request-guard");
    await expect(assertSafeOutboundUrl("https://api.partner.example/webhook")).resolves.toBeUndefined();
  });
});
