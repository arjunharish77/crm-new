/* eslint-disable @typescript-eslint/no-require-imports */
// Browser check for Module 21 lifecycle screens against the running dev server (localhost:3000)
// with fixture API responses: trial end date in the module dialog, approving an access request
// as a trial, Create Tenant bundles, the bundle editor's dependency guard, and the tenant admin
// Settings -> Modules page (request + withdraw), plus 320px / 200% text layout.
const { chromium } = require(process.env.CRM_PLAYWRIGHT_MODULE || "playwright");
const fs = require("fs");
const assert = require("node:assert/strict");

const sql = fs.readFileSync("migrations/0037_module_entitlements.sql", "utf8");
const catalog = [...sql.matchAll(/\('([A-Z_]+)', '([^']+)', '([^']+)', '([^']+)', (true|false)\)/g)].map(([, key, name, description, category, core]) => ({ key, name, description, category, isCore: core === "true" }));
const core = catalog.filter((m) => m.isCore).map((m) => m.key);
const bundles = [
  { key: "STARTER", name: "Starter", description: "Core CRM only.", modules: core, sortOrder: 1 },
  { key: "ADMISSIONS", name: "Admissions", description: "Starter plus admissions tools.", modules: [...core, "OPPORTUNITIES", "FORMS", "AUTOMATIONS", "REPORTS", "MARKETING", "PRODUCT_CATALOG", "TELEPHONY"], sortOrder: 2 },
  { key: "FULL", name: "Full", description: "Every module.", modules: catalog.map((m) => m.key), sortOrder: 3 },
];
const flags = { opportunityEnabled: true, automationEnabled: true, salesGroupsEnabled: true, formBuilderEnabled: true, advancedReporting: true, apiAccessEnabled: false, payoutsEnabled: true, gamificationEnabled: true };
const BASE = process.env.CRM_BASE_URL || "http://localhost:3000";
const checks = [];

const overflowing = require("./ui-overflow.cjs");

async function main() {
  const browser = await chromium.launch({ executablePath: process.env.CRM_CHROMIUM_PATH, headless: true });
  const out = "ui-audit-2026-09/module-lifecycle";
  fs.mkdirSync(out, { recursive: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const writes = [];
    let pendingForTenantUser = null;
    let me = { id: "platform-fixture", name: "Platform fixture", isPlatformAdmin: true, role: { name: "Platform Admin", permissions: { modules: { admin: "full" } } } };
    await page.route("**/api/**", async (route) => {
      const url = new URL(route.request().url());
      const path = url.pathname;
      const method = route.request().method();
      const json = (data, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(data) });
      if (method !== "GET") writes.push({ method, path, body: route.request().postData() ? JSON.parse(route.request().postData()) : null });
      if (path === "/api/auth/me") return json(me);
      if (path.endsWith("/fixture/config")) return json({ tenant: { id: "fixture", name: "Existing tenant", status: "ACTIVE", plan: "PRO", environment: "PRODUCTION" } });
      if (path.endsWith("/fixture/feature-flags")) return json(flags);
      if (path.endsWith("/fixture/modules")) return json(catalog.map((m) => ({ ...m, status: m.key === "NEXT_BEST_ACTION" ? "TRIAL" : "ENABLED", trialEndsAt: m.key === "NEXT_BEST_ACTION" ? "2026-10-10T18:29:59.000Z" : null, pausedCount: 0 })));
      if (path.endsWith("/fixture/demo-data")) return json({ leadCount: 0, opportunityCount: 0 });
      if (path.includes("/fixture/modules/") && path.endsWith("/impact")) return json({ moduleKey: "X", items: [], blockedReason: null });
      if (path === "/api/platform-admin/module-requests" && method === "GET") return json([{ id: "req-1", moduleKey: "MARKETPLACE", moduleName: "Marketplace", message: "We use a partner app", createdAt: "2026-09-28T10:00:00.000Z", requestedByName: "Tenant Admin", requestedByEmail: "admin@example.invalid" }]);
      if (path === "/api/platform-admin/modules") return json(catalog);
      if (path === "/api/platform-admin/module-bundles") return json(bundles);
      if (path === "/api/settings/modules" && method === "GET") return json(catalog.map((m) => ({ key: m.key, name: m.name, description: m.description, category: m.category, isCore: m.isCore, status: m.key === "MARKETPLACE" ? "DISABLED" : m.key === "TELEPHONY" ? "TRIAL" : "ENABLED", trialEndsAt: m.key === "TELEPHONY" ? "2026-10-12T18:29:59.000Z" : null, pendingRequest: m.key === "MARKETPLACE" ? pendingForTenantUser : null })));
      if (path === "/api/settings/modules/requests" && method === "POST") { pendingForTenantUser = { id: "req-9", createdAt: "2026-09-29T09:00:00.000Z" }; return json({ id: "req-9", status: "PENDING" }, 201); }
      if (path === "/api/settings/modules/requests/req-9" && method === "DELETE") { pendingForTenantUser = null; return json({ id: "req-9", status: "WITHDRAWN" }); }
      return json(method === "GET" ? [] : { ok: true });
    });
    const lastWrite = (pathPart) => [...writes].reverse().find((w) => w.path.includes(pathPart));

    // --- Tenant page: access request approved as a trial; trial date on a status change.
    await page.goto(`${BASE}/platform-admin/tenants/fixture`);
    const section = page.getByRole("combobox", { name: "Tenant section", exact: true });
    if (await section.isVisible().catch(() => false)) await section.selectOption("modules");
    else await page.getByRole("group", { name: "Tenant section" }).getByRole("button", { name: "Modules", exact: true }).click();
    await page.getByText("Pending requests from this tenant", { exact: true }).waitFor();
    assert.ok(await page.getByText("“We use a partner app”", { exact: true }).isVisible());
    assert.ok(await page.getByText(/Trial ends .* then suspended \(data kept\)\./).isVisible());
    checks.push("Tenant Modules shows the pending request and the trial end");
    await page.getByRole("button", { name: "Approve…", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Grant as").selectOption("TRIAL");
    await dialog.getByLabel("Trial ends on").fill("2026-11-15");
    await dialog.getByLabel("Note to the requester (optional)").fill("Try it for 6 weeks");
    await dialog.getByRole("button", { name: "Approve", exact: true }).click();
    await dialog.waitFor({ state: "hidden" });
    const approval = lastWrite("/module-requests/req-1");
    assert.equal(approval.body.decision, "APPROVED");
    assert.equal(approval.body.status, "TRIAL");
    assert.ok(approval.body.trialEndsAt.startsWith("2026-11-15") || approval.body.trialEndsAt.startsWith("2026-11-16"));
    assert.equal(approval.body.note, "Try it for 6 weeks");
    checks.push("Approving a request as a trial sends decision, status, end date and note");

    await page.getByLabel("Forms status", { exact: true }).click();
    await page.getByRole("option", { name: "Trial", exact: true }).click();
    await dialog.getByLabel("Trial ends on").waitFor();
    await dialog.getByLabel("Trial ends on").fill("");
    assert.ok(await dialog.getByRole("button", { name: "Save change", exact: true }).isDisabled());
    await dialog.getByLabel("Trial ends on").fill("2026-12-01");
    await dialog.getByRole("button", { name: "Save change", exact: true }).click();
    await dialog.waitFor({ state: "hidden" });
    const trialWrite = lastWrite("/fixture/modules/FORMS");
    assert.equal(trialWrite.body.status, "TRIAL");
    assert.ok(trialWrite.body.trialEndsAt.startsWith("2026-12-01") || trialWrite.body.trialEndsAt.startsWith("2026-12-02"));
    checks.push("A trial cannot be saved without an end date; the chosen date is sent");

    // --- Create Tenant: bundles fill the switches.
    await page.goto(`${BASE}/platform-admin/tenants`);
    await page.getByRole("button", { name: "Create Tenant", exact: true }).click();
    await page.getByLabel("Start from a bundle").selectOption("STARTER");
    await page.getByText(`${core.length} of ${catalog.length} modules enabled — review selection`, { exact: true }).waitFor();
    await page.getByLabel("Start from a bundle").selectOption("ADMISSIONS");
    await page.getByText(`14 of ${catalog.length} modules enabled — review selection`, { exact: true }).waitFor();
    await page.getByText(`14 of ${catalog.length} modules enabled — review selection`, { exact: true }).click();
    await page.getByRole("switch", { name: "AI Copilot", exact: true }).check();
    assert.equal(await page.getByLabel("Start from a bundle").inputValue(), "");
    checks.push("Bundles fill the module switches; an edit shows 'Custom selection'");
    await page.keyboard.press("Escape");

    // --- Bundle editor: dependency guard.
    await page.goto(`${BASE}/platform-admin/module-bundles`);
    await page.getByRole("button", { name: "Edit Admissions", exact: true }).click();
    await page.getByRole("switch", { name: "Payouts", exact: true }).check();
    await page.getByText("Payouts won't work: Partners is disabled.", { exact: true }).waitFor();
    assert.ok(await page.getByRole("button", { name: "Save bundle", exact: true }).isDisabled());
    await page.getByRole("switch", { name: "Partners", exact: true }).check();
    await page.getByRole("button", { name: "Save bundle", exact: true }).click();
    await page.getByRole("button", { name: "Edit Admissions", exact: true }).waitFor();
    const bundleWrite = lastWrite("/module-bundles/ADMISSIONS");
    assert.ok(bundleWrite.body.modules.includes("PAYOUTS") && bundleWrite.body.modules.includes("PARTNERS") && core.every((k) => bundleWrite.body.modules.includes(k)));
    checks.push("Bundle editor blocks a broken dependency and saves a valid bundle with core modules");
    await page.setViewportSize({ width: 320, height: 900 });
    await page.evaluate(() => { document.documentElement.style.fontSize = "32px"; });
    await page.getByRole("button", { name: "Edit Admissions", exact: true }).click();
    await page.waitForTimeout(300);
    assert.deepEqual(await overflowing(page), [], "bundle editor overflows at 320px / 200%");
    await page.screenshot({ path: `${out}/bundle-editor-320.png`, fullPage: true });
    await page.evaluate(() => { document.documentElement.style.fontSize = ""; });
    await page.setViewportSize({ width: 1280, height: 900 });
    checks.push("Bundle editor fits 320px at 200% text");

    // --- Tenant admin: Settings -> Modules.
    me = { id: "tenant-admin", tenantId: "t1", name: "Tenant Admin", isTenantAdmin: true, role: { name: "Admin", permissions: { modules: { admin: "full" }, recordAccess: "ALL" } }, features: flags, moduleEntitlements: { MARKETPLACE: "DISABLED", TELEPHONY: "TRIAL" } };
    await page.goto(`${BASE}/dashboard/settings/modules`);
    await page.getByRole("heading", { name: "Modules", exact: true }).waitFor();
    assert.ok(await page.getByText(/Trial ends .*After that it is suspended/).isVisible());
    await page.getByRole("button", { name: "Request Marketplace", exact: true }).click();
    await page.getByLabel("Message (optional)").fill("Need our partner app");
    await page.getByRole("button", { name: "Send request", exact: true }).click();
    await page.getByRole("button", { name: "Withdraw request", exact: true }).waitFor();
    assert.deepEqual(lastWrite("/settings/modules/requests").body, { moduleKey: "MARKETPLACE", message: "Need our partner app" });
    checks.push("Tenant admin sees statuses/trial end and can request a module");
    await page.setViewportSize({ width: 320, height: 900 });
    await page.evaluate(() => { document.documentElement.style.fontSize = "32px"; });
    await page.waitForTimeout(300);
    assert.deepEqual(await overflowing(page), [], "tenant modules page overflows at 320px / 200%");
    await page.screenshot({ path: `${out}/tenant-modules-320.png`, fullPage: true });
    await page.evaluate(() => { document.documentElement.style.fontSize = ""; });
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.getByRole("button", { name: "Withdraw request", exact: true }).click();
    await page.getByRole("button", { name: "Request Marketplace", exact: true }).waitFor();
    checks.push("Pending request can be withdrawn; page fits 320px at 200% text");

    assert.deepEqual(errors, []);
    checks.push("No browser exceptions");
    fs.writeFileSync(`${out}/results.json`, JSON.stringify({ checks: checks.length, results: checks }, null, 2));
    console.log(JSON.stringify({ status: "passed", checks: checks.length }));
  } finally {
    await browser.close();
  }
}

main().catch((error) => { console.error(error); console.error("Completed checks:", checks); process.exitCode = 1; });
