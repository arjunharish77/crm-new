import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "@/proxy";

function request(path: string, opts: { method?: string; fetchSite?: string } = {}) {
  const headers: Record<string, string> = {};
  if (opts.fetchSite) headers["sec-fetch-site"] = opts.fetchSite;
  return new NextRequest(new URL(path, "https://app.example.com"), { method: opts.method ?? "GET", headers });
}

describe("proxy (CSRF defense-in-depth)", () => {
  it("passes through GET requests regardless of Sec-Fetch-Site", async () => {
    const res = proxy(request("/api/leads", { method: "GET", fetchSite: "cross-site" }));
    expect(res.status).toBe(200);
  });

  it("passes through non-API paths untouched", async () => {
    const res = proxy(request("/dashboard/leads", { method: "POST", fetchSite: "cross-site" }));
    expect(res.status).toBe(200);
  });

  it("blocks a cross-site mutating request to a normal API route", async () => {
    const res = proxy(request("/api/leads", { method: "POST", fetchSite: "cross-site" }));
    expect(res.status).toBe(403);
  });

  it("allows a mutating request with no Sec-Fetch-Site header (non-browser clients)", async () => {
    const res = proxy(request("/api/leads", { method: "POST" }));
    expect(res.status).toBe(200);
  });

  it("allows a same-origin mutating request", async () => {
    const res = proxy(request("/api/leads", { method: "POST", fetchSite: "same-origin" }));
    expect(res.status).toBe(200);
  });

  it.each([
    "/api/communications/webhooks/email",
    "/api/scim/v2/Users",
    "/api/public/forms/abc/submit",
    "/api/v1/leads",
    "/api/integrations/telephony/webhook",
  ])("exempts %s from the cross-site block (genuinely cross-site by design)", async (path) => {
    const res = proxy(request(path, { method: "POST", fetchSite: "cross-site" }));
    expect(res.status).toBe(200);
  });

  it("does NOT exempt telephony webhook-secret management (distinct from the webhook receiver)", async () => {
    const res = proxy(request("/api/integrations/telephony/webhook-secret", { method: "POST", fetchSite: "cross-site" }));
    expect(res.status).toBe(403);
  });
});
