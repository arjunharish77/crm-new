/* eslint-disable @typescript-eslint/no-require-imports */
// Browser check for per-tenant usage limits (Module 21) against the running dev server with
// fixture API responses: platform-admin usage card + limit editor, Create Tenant limit fields,
// and the tenant admin's read-only usage on Settings -> Modules; 320px / 200% text layout.
const { chromium } = require(process.env.CRM_PLAYWRIGHT_MODULE || "playwright");
const fs = require("fs");
const assert = require("node:assert/strict");

const sql = fs.readFileSync("migrations/0037_module_entitlements.sql", "utf8");
const catalog = [...sql.matchAll(/\('([A-Z_]+)', '([^']+)', '([^']+)', '([^']+)', (true|false)\)/g)].map(([, key, name, description, category, core]) => ({ key, name, description, category, isCore: core === "true" }));
const flags = { opportunityEnabled: true, automationEnabled: true, salesGroupsEnabled: true, formBuilderEnabled: true, advancedReporting: true, apiAccessEnabled: false, payoutsEnabled: true, gamificationEnabled: true };
const BASE = process.env.CRM_BASE_URL || "http://localhost:3000";
const checks = [];
const overflowing = require("./ui-overflow.cjs");

async function main() {
  const browser = await chromium.launch({ executablePath: process.env.CRM_CHROMIUM_PATH, headless: true });
  const out = "ui-audit-2026-09/usage-limits";
  fs.mkdirSync(out, { recursive: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const writes = [];
    let usage = { limits: { maxActiveUsers: 10, maxPartnerLogins: null, maxStorageMb: 100, maxMonthlyMessages: 1000 }, period: "2026-09", used: { ACTIVE_USERS: 9, PARTNER_LOGINS: 4, STORAGE: 104857600, MONTHLY_MESSAGES: 120 } };
    let me = { id: "platform-fixture", name: "Platform fixture", isPlatformAdmin: true, role: { name: "Platform Admin", permissions: { modules: { admin: "full" } } } };
    await page.route("**/api/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      const method = route.request().method();
      const json = (data, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(data) });
      if (method !== "GET") writes.push({ method, path, body: route.request().postData() ? JSON.parse(route.request().postData()) : null });
      if (path === "/api/auth/me") return json(me);
      if (path.endsWith("/fixture/config")) return json({ tenant: { id: "fixture", name: "Existing tenant", status: "ACTIVE", plan: "PRO", environment: "PRODUCTION" } });
      if (path.endsWith("/fixture/feature-flags")) return json(flags);
      if (path.endsWith("/fixture/modules")) return json(catalog.map((m) => ({ ...m, status: "ENABLED", trialEndsAt: null, pausedCount: 0 })));
      if (path.endsWith("/fixture/users")) return json([{ id: "u1", name: "A", email: "a@example.invalid" }]);
      if (path.endsWith("/fixture/usage") && method === "PUT") {
        const body = JSON.parse(route.request().postData());
        usage = { ...usage, limits: body };
        return json(usage);
      }
      if (path.endsWith("/fixture/usage") || path === "/api/settings/usage") return json(usage);
      if (path === "/api/platform-admin/modules") return json(catalog);
      if (path === "/api/platform-admin/module-bundles") return json([]);
      if (path === "/api/settings/modules") return json(catalog.map((m) => ({ key: m.key, name: m.name, description: m.description, category: m.category, isCore: m.isCore, status: "ENABLED", trialEndsAt: null, pendingRequest: null })));
      return json(method === "GET" ? [] : { ok: true });
    });

    // --- Platform admin: usage card and limit editor.
    await page.goto(`${BASE}/platform-admin/tenants/fixture`);
    const section = page.getByRole("combobox", { name: "Tenant section", exact: true });
    if (await section.isVisible().catch(() => false)) await section.selectOption("users");
    else await page.getByRole("group", { name: "Tenant section" }).getByRole("button", { name: "Users & usage", exact: true }).click();
    await page.getByText("Usage & limits", { exact: true }).waitFor();
    await page.getByText("Limit reached: new uploads are refused.", { exact: true }).waitFor({ timeout: 10000 });
    assert.equal(await page.getByRole("progressbar", { name: "Active users used" }).getAttribute("aria-valuenow"), "90");
    assert.equal(await page.getByText("Quota: 1 GB").count(), 0);
    checks.push("Usage card shows real usage vs limits (90% users, storage at limit); the old '1 GB' placeholder is gone");
    await page.getByLabel("Partner logins (logins)").fill("25");
    await page.getByLabel("Active users (users)").fill("");
    await page.getByRole("button", { name: "Save limits", exact: true }).click();
    await page.getByText("Limits saved").first().waitFor();
    assert.deepEqual(writes.at(-1).body, { maxActiveUsers: null, maxPartnerLogins: 25, maxStorageMb: 100, maxMonthlyMessages: 1000 });
    checks.push("Limit editor saves numbers and empty (= unlimited)");
    await page.setViewportSize({ width: 320, height: 900 });
    await page.evaluate(() => { document.documentElement.style.fontSize = "32px"; });
    await page.waitForTimeout(300);
    assert.deepEqual(await overflowing(page), [], "usage card overflows at 320px / 200%");
    await page.screenshot({ path: `${out}/tenant-usage-320.png`, fullPage: true });
    await page.evaluate(() => { document.documentElement.style.fontSize = ""; });
    await page.setViewportSize({ width: 1280, height: 900 });
    checks.push("Usage card fits 320px at 200% text");

    // --- Create Tenant: optional limit fields.
    await page.goto(`${BASE}/platform-admin/tenants`);
    await page.getByRole("button", { name: "Create Tenant", exact: true }).click();
    await page.getByText("Usage limits (optional — unlimited unless set)", { exact: true }).click();
    await page.getByLabel("Active users", { exact: true }).fill("50");
    await page.getByLabel("Messages per month", { exact: true }).fill("20000");
    await page.getByLabel("Tenant Name", { exact: true }).fill("Tenant fixture");
    await page.getByLabel("Admin Name", { exact: true }).fill("Admin fixture");
    await page.getByLabel("Admin Email", { exact: true }).fill("admin@example.invalid");
    await page.getByLabel("Password", { exact: true }).fill("Fixture-Passw0rd!");
    await page.getByRole("button", { name: "Provision Tenant", exact: true }).click();
    await page.waitForTimeout(500);
    const created = writes.filter((w) => w.path === "/api/platform-admin/tenants").at(-1);
    assert.deepEqual(created.body.limits, { maxActiveUsers: 50, maxPartnerLogins: null, maxStorageMb: null, maxMonthlyMessages: 20000 });
    checks.push("Create Tenant sends only the limits that were set (others unlimited)");

    // --- Tenant admin: read-only usage.
    me = { id: "tenant-admin", tenantId: "t1", name: "Tenant Admin", isTenantAdmin: true, role: { name: "Admin", permissions: { modules: { admin: "full" }, recordAccess: "ALL" } }, features: flags, moduleEntitlements: {} };
    await page.goto(`${BASE}/dashboard/settings/modules`);
    await page.getByRole("heading", { name: "Usage and limits", exact: true }).waitFor();
    assert.equal(await page.getByRole("button", { name: "Save limits" }).count(), 0);
    assert.ok(await page.getByText("Password resets and other system messages never count.", { exact: false }).isVisible());
    checks.push("Tenant admins see usage read-only (no limit editor)");

    assert.deepEqual(errors, []);
    checks.push("No browser exceptions");
    fs.writeFileSync(`${out}/results.json`, JSON.stringify({ checks: checks.length, results: checks }, null, 2));
    console.log(JSON.stringify({ status: "passed", checks: checks.length }));
  } finally {
    await browser.close();
  }
}

main().catch((error) => { console.error(error); console.error("Completed checks:", checks); process.exitCode = 1; });
