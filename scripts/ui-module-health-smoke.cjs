/* eslint-disable @typescript-eslint/no-require-imports */
// Browser check for module health badges (Module 21) against a running dev server with fixture
// API responses: tenant admin Settings -> Modules (badges + fix-it links, no operator detail),
// platform tenant page (badges, job detail, recheck, no links), the cross-tenant Module Health
// page (filter, stale-snapshot warning), a failing health request never hiding modules, and
// 320px / 200% text layout.
const { chromium } = require(process.env.CRM_PLAYWRIGHT_MODULE || "playwright");
const fs = require("fs");
const assert = require("node:assert/strict");
const overflowing = require("./ui-overflow.cjs");

const sql = fs.readFileSync("migrations/0037_module_entitlements.sql", "utf8");
const catalog = [...sql.matchAll(/\('([A-Z_]+)', '([^']+)', '([^']+)', '([^']+)', (true|false)\)/g)].map(([, key, name, description, category, core]) => ({ key, name, description, category, isCore: core === "true" }));
const flags = { opportunityEnabled: true, automationEnabled: true, salesGroupsEnabled: true, formBuilderEnabled: true, advancedReporting: true, apiAccessEnabled: false, payoutsEnabled: true, gamificationEnabled: true };
const BASE = process.env.CRM_BASE_URL || "http://localhost:3000";
const checks = [];
const now = "2026-09-29T10:00:00.000Z";

const health = (withDetail) => catalog.map((m) => {
  const row = { moduleKey: m.key, state: "HEALTHY", issues: [], checked: !m.isCore, checksFailed: 0, checkedAt: now };
  if (m.key === "AUTOMATIONS") Object.assign(row, { state: "WORKER_BACKLOG", issues: [{ kind: "WORKER_BACKLOG", count: 12, message: "12 scheduled automation steps are more than 15 minutes overdue.", ...(withDetail ? { detail: "Processed by automation.processDue" } : {}) }] });
  if (m.key === "MARKETING") Object.assign(row, { state: "CONNECTOR_FAILING", issues: [{ kind: "CONNECTOR_FAILING", count: 30, message: "30 of 40 campaign messages failed in the last 24 hours.", action: { label: "Check messaging providers", href: "/dashboard/settings/integrations" } }] });
  if (m.key === "DISTRIBUTION") Object.assign(row, { state: "SETUP_INCOMPLETE", issues: [{ kind: "SETUP_INCOMPLETE", message: "No active assignment rule yet.", action: { label: "Create an assignment rule", href: "/dashboard/settings/automation/assignment-rules" } }] });
  if (m.key === "QUALITY_MANAGEMENT") Object.assign(row, { state: "NOT_AVAILABLE" });
  return row;
});

async function main() {
  const browser = await chromium.launch({ executablePath: process.env.CRM_CHROMIUM_PATH, headless: true });
  const out = "ui-audit-2026-09/module-health";
  fs.mkdirSync(out, { recursive: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    let me = { id: "tenant-admin", tenantId: "t1", name: "Tenant Admin", isTenantAdmin: true, role: { name: "Admin", permissions: { modules: { admin: "full" }, recordAccess: "ALL" } }, features: flags, moduleEntitlements: {} };
    let tenantHealthFails = false;
    let platformHealthCalls = 0;
    await page.route("**/api/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      const json = (data, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(data) });
      if (path === "/api/auth/me") return json(me);
      if (path === "/api/settings/modules") return json(catalog.map((m) => ({ ...m, status: "ENABLED", trialEndsAt: null, pendingRequest: null })));
      if (path === "/api/settings/modules/health") return tenantHealthFails ? json({ error: "Failed to load module health" }, 500) : json(health(false));
      if (path === "/api/settings/usage") return json({ limits: { maxActiveUsers: null, maxPartnerLogins: null, maxStorageMb: null, maxMonthlyMessages: null }, period: "2026-09", used: { ACTIVE_USERS: 1, PARTNER_LOGINS: 0, STORAGE: 0, MONTHLY_MESSAGES: 0 } });
      if (path.endsWith("/fixture/config")) return json({ tenant: { id: "fixture", name: "Existing tenant", status: "ACTIVE", plan: "PRO", environment: "PRODUCTION" } });
      if (path.endsWith("/fixture/feature-flags")) return json(flags);
      if (path.endsWith("/fixture/modules")) return json(catalog.map((m) => ({ ...m, status: "ENABLED", trialEndsAt: null, pausedCount: 0 })));
      if (path.endsWith("/fixture/module-health")) { platformHealthCalls++; return json(health(true)); }
      if (path.endsWith("/fixture/demo-data")) return json({ leadCount: 0, opportunityCount: 0 });
      if (path.endsWith("/fixture/usage")) return json({ limits: { maxActiveUsers: null, maxPartnerLogins: null, maxStorageMb: null, maxMonthlyMessages: null }, period: "2026-09", used: { ACTIVE_USERS: 1, PARTNER_LOGINS: 0, STORAGE: 0, MONTHLY_MESSAGES: 0 } });
      if (path === "/api/platform-admin/module-health") return json({
        items: [
          { tenantId: "fixture", tenantName: "Existing tenant", moduleKey: "MARKETING", moduleName: "Marketing Communications", state: "CONNECTOR_FAILING", issues: [{ kind: "CONNECTOR_FAILING", message: "30 of 40 campaign messages failed in the last 24 hours." }], checkedAt: now },
          { tenantId: "fixture", tenantName: "Existing tenant", moduleKey: "AUTOMATIONS", moduleName: "Automations", state: "WORKER_BACKLOG", issues: [{ kind: "WORKER_BACKLOG", message: "12 scheduled automation steps are more than 15 minutes overdue.", detail: "Processed by automation.processDue" }], checkedAt: now },
          { tenantId: "t2", tenantName: "Second tenant with a very long organisation name for wrapping", moduleKey: "DISTRIBUTION", moduleName: "Distribution Engine", state: "SETUP_INCOMPLETE", issues: [{ kind: "SETUP_INCOMPLETE", message: "No active assignment rule yet." }], checkedAt: now },
        ],
        activeTenants: 2, neverChecked: 1, oldestCheckedAt: "2026-09-29T07:00:00.000Z", snapshotsStale: true, refreshMinutes: 15,
      });
      if (path === "/api/platform-admin/modules") return json(catalog);
      return json(route.request().method() === "GET" ? [] : { ok: true });
    });

    // --- Tenant admin: badges with fix-it links, no operator detail.
    await page.goto(`${BASE}/dashboard/settings/modules`);
    await page.getByText("Connector failing", { exact: true }).waitFor();
    assert.ok(await page.getByText("Work backed up", { exact: true }).isVisible());
    assert.ok(await page.getByText("Setup incomplete", { exact: true }).isVisible());
    assert.ok(await page.getByText("Not built yet", { exact: true }).isVisible());
    assert.equal(await page.getByRole("link", { name: "Create an assignment rule" }).getAttribute("href"), "/dashboard/settings/automation/assignment-rules");
    assert.equal(await page.getByText("automation.processDue").count(), 0);
    checks.push("Tenant admin sees health badges, the problem and a fix-it link; no worker job names");
    await page.setViewportSize({ width: 320, height: 900 });
    await page.evaluate(() => { document.documentElement.style.fontSize = "32px"; });
    await page.waitForTimeout(300);
    assert.deepEqual(await overflowing(page), [], "tenant modules page overflows at 320px / 200%");
    await page.screenshot({ path: `${out}/tenant-modules-320.png`, fullPage: true });
    await page.evaluate(() => { document.documentElement.style.fontSize = ""; });
    await page.setViewportSize({ width: 1280, height: 900 });
    checks.push("Tenant modules page with health fits 320px at 200% text");

    // A failing health request shows a retry and never hides the modules.
    tenantHealthFails = true;
    await page.reload();
    await page.getByRole("button", { name: "Retry", exact: true }).first().waitFor();
    assert.ok(await page.getByRole("heading", { name: "Marketing Communications" }).isVisible());
    assert.equal(await page.getByText("Connector failing", { exact: true }).count(), 0);
    tenantHealthFails = false;
    await page.getByRole("button", { name: "Retry", exact: true }).first().click();
    await page.getByText("Connector failing", { exact: true }).waitFor();
    checks.push("Health failure shows a retry and keeps the module list; retry recovers");

    // --- Platform admin: tenant page badges with job detail, recheck, no tenant links.
    me = { id: "platform-fixture", name: "Platform fixture", isPlatformAdmin: true, role: { name: "Platform Admin", permissions: { modules: { admin: "full" } } } };
    await page.goto(`${BASE}/platform-admin/tenants/fixture`);
    const section = page.getByRole("combobox", { name: "Tenant section", exact: true });
    if (await section.isVisible().catch(() => false)) await section.selectOption("modules");
    else await page.getByRole("group", { name: "Tenant section" }).getByRole("button", { name: "Modules", exact: true }).click();
    await page.getByText("Work backed up", { exact: true }).waitFor();
    assert.ok(await page.getByText("(Processed by automation.processDue)", { exact: true }).isVisible());
    assert.equal(await page.getByRole("link", { name: "Check messaging providers" }).count(), 0);
    const before = platformHealthCalls;
    await page.getByRole("button", { name: "Recheck health", exact: true }).click();
    await page.getByText("Health checked just now.", { exact: false }).waitFor();
    assert.ok(platformHealthCalls > before);
    checks.push("Tenant page shows health with the worker job, no tenant-only links, and rechecks on demand");
    await page.setViewportSize({ width: 320, height: 900 });
    await page.evaluate(() => { document.documentElement.style.fontSize = "32px"; });
    await page.waitForTimeout(300);
    assert.deepEqual(await overflowing(page), [], "tenant page modules overflow at 320px / 200%");
    await page.screenshot({ path: `${out}/platform-tenant-320.png`, fullPage: true });
    await page.evaluate(() => { document.documentElement.style.fontSize = ""; });
    await page.setViewportSize({ width: 1280, height: 900 });
    checks.push("Tenant page with health fits 320px at 200% text");

    // --- Cross-tenant Module Health page.
    await page.goto(`${BASE}/platform-admin/module-health`);
    await page.getByRole("heading", { name: "Module health" }).waitFor();
    await page.getByText(/the worker may be stopped/).waitFor({ timeout: 10000 });
    assert.ok(await page.getByText("1 tenant has not been checked yet.").isVisible());
    assert.equal(await page.getByRole("list", { name: "Module problems" }).locator(":scope > li").count(), 3);
    assert.equal(await page.getByRole("link", { name: "Existing tenant" }).first().getAttribute("href"), "/platform-admin/tenants/fixture");
    await page.getByLabel("Show").click();
    await page.getByRole("option", { name: "Connector failing (1)" }).click();
    assert.equal(await page.getByRole("list", { name: "Module problems" }).locator(":scope > li").count(), 1);
    checks.push("Module Health lists problems across tenants, filters by state, links to the tenant, warns when checks are not running");
    await page.getByLabel("Show").click();
    await page.getByRole("option", { name: /^All problems/ }).click();
    await page.setViewportSize({ width: 320, height: 900 });
    await page.evaluate(() => { document.documentElement.style.fontSize = "32px"; });
    await page.waitForTimeout(300);
    assert.deepEqual(await overflowing(page), [], "module health page overflows at 320px / 200%");
    await page.screenshot({ path: `${out}/module-health-320.png`, fullPage: true });
    checks.push("Module Health page fits 320px at 200% text");

    assert.deepEqual(errors, []);
    checks.push("No browser exceptions");
    fs.writeFileSync(`${out}/results.json`, JSON.stringify({ checks: checks.length, results: checks }, null, 2));
    console.log(JSON.stringify({ status: "passed", checks: checks.length }));
  } finally {
    await browser.close();
  }
}

main().catch((error) => { console.error(error); console.error("Completed checks:", checks); process.exitCode = 1; });
