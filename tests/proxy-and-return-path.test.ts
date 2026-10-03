import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { proxy, config } from "@/proxy";
import { safeReturnPath } from "@/lib/safe-return-path";

const ORIGIN = "https://crm.example.com";

function request(path: string, init: { method?: string; cookie?: string; fetchSite?: string } = {}) {
  const headers = new Headers();
  if (init.cookie) headers.set("cookie", init.cookie);
  if (init.fetchSite) headers.set("sec-fetch-site", init.fetchSite);
  return new NextRequest(new URL(path, ORIGIN), { method: init.method ?? "GET", headers });
}

// UI/UX plan B16: one proxy (src/proxy.ts) now does both jobs; the root proxy.ts never ran.
describe("proxy", () => {
  it("sends a signed-out visitor to /login with a link back to the page", () => {
    const response = proxy(request("/dashboard/reports?report=rep_performance"));
    expect(response.status).toBe(307);
    const location = new URL(response.headers.get("location")!);
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("from")).toBe("/dashboard/reports?report=rep_performance");
  });

  it("covers platform admin pages and lets signed-in requests through", () => {
    expect(proxy(request("/platform-admin/tenants")).status).toBe(307);
    expect(proxy(request("/dashboard", { cookie: "token=abc" })).headers.get("location")).toBeNull();
  });

  it("redirects /register to /login", () => {
    expect(new URL(proxy(request("/register")).headers.get("location")!).pathname).toBe("/login");
  });

  it("still blocks cross-site writes to the API and allows same-site ones", async () => {
    const blocked = proxy(request("/api/leads", { method: "POST", fetchSite: "cross-site", cookie: "token=abc" }));
    expect(blocked.status).toBe(403);
    expect(proxy(request("/api/leads", { method: "POST", fetchSite: "same-origin" })).status).toBe(200);
    expect(proxy(request("/api/public/forms/x/submit", { method: "POST", fetchSite: "cross-site" })).status).toBe(200);
  });

  it("never redirects API calls to the login page", () => {
    expect(proxy(request("/api/leads")).headers.get("location")).toBeNull();
  });

  it("runs for the API and the signed-in areas", () => {
    expect(config.matcher).toEqual(expect.arrayContaining(["/api/:path*", "/dashboard/:path*", "/platform-admin/:path*"]));
  });
});

describe("safeReturnPath", () => {
  it("keeps same-origin app paths with their query and hash", () => {
    expect(safeReturnPath("/dashboard/tasks?id=1#notes", ORIGIN)).toBe("/dashboard/tasks?id=1#notes");
  });

  it.each([
    ["https://evil.example/phish"],
    ["//evil.example/phish"],
    ["/\\evil.example"],
    ["javascript:alert(1)"],
    ["dashboard"],
    ["/login?from=/dashboard"],
    ["/api/leads"],
    [""],
    [null],
  ])("refuses %s", (value) => {
    expect(safeReturnPath(value as string | null, ORIGIN)).toBeNull();
  });
});
