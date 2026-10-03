/* eslint-disable @typescript-eslint/no-require-imports */
// Browser check for Module 21 switches against the running dev server (localhost:3000) with
// fixture API responses: dependency banner/hints, the pre-disable impact dialog (save with
// reason, cancel, client-side and server-side refusals), create-tenant dependency blocking, and
// the Telephony / Data Platform disabled states a tenant user sees.
const { chromium } = require(process.env.CRM_PLAYWRIGHT_MODULE || "playwright");
const fs = require("fs");
const assert = require("node:assert/strict");

const sql = fs.readFileSync("migrations/0037_module_entitlements.sql", "utf8");
const catalog = [...sql.matchAll(/\('([A-Z_]+)', '([^']+)', '([^']+)', '([^']+)', (true|false)\)/g)].map(([, key, name, description, category, core]) => ({ key, name, description, category, isCore: core === "true" }));
const statusOverrides = { PARTNERS: "DISABLED", JOURNEY_ORCHESTRATION: "DISABLED", MARKETING: "DISABLED" };
const flags = { opportunityEnabled: true, automationEnabled: true, salesGroupsEnabled: true, formBuilderEnabled: true, advancedReporting: true, apiAccessEnabled: false, payoutsEnabled: true, gamificationEnabled: true };

const BASE = process.env.CRM_BASE_URL || "http://localhost:3000";
const checks = [];

async function main() {
  const browser = await chromium.launch({ executablePath: process.env.CRM_CHROMIUM_PATH, headless: true });
  const out = "ui-audit-2026-09/module-switches";
  fs.mkdirSync(out, { recursive: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const patches = [];
    let me = { id: "platform-fixture", name: "Platform fixture", isPlatformAdmin: true, role: { name: "Platform Admin", permissions: { modules: { admin: "full" } } } };
    await page.route("**/api/**", async (route) => {
      const url = new URL(route.request().url());
      const path = url.pathname;
      const method = route.request().method();
      const json = (data, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(data) });
      if (path === "/api/auth/me") return json(me);
      if (path.endsWith("/fixture/config")) return json({ tenant: { id: "fixture", name: "Existing tenant", status: "ACTIVE", plan: "PRO", environment: "PRODUCTION" } });
      if (path.endsWith("/fixture/feature-flags")) return json(flags);
      if (path.endsWith("/fixture/modules")) return json(catalog.map((entry) => ({ ...entry, status: statusOverrides[entry.key] ?? "ENABLED" })));
      if (path.endsWith("/fixture/demo-data")) return json({ leadCount: 0, opportunityCount: 0 });
      if (path.endsWith("/fixture/modules/OPPORTUNITIES/impact")) return json({ moduleKey: "OPPORTUNITIES", items: [{ label: "Opportunities (kept, but inaccessible)", count: 42 }], blockedReason: null });
      if (path.endsWith("/fixture/modules/AUTOMATIONS/impact")) return json({ moduleKey: "AUTOMATIONS", items: [{ label: "Active automations", count: 3 }], blockedReason: "Journey Orchestration depends on Automations. Disable Journey Orchestration first." });
      if (path.endsWith("/fixture/modules/MARKETPLACE/impact")) return json({ moduleKey: "MARKETPLACE", items: [{ label: "Installed apps", count: 1 }], blockedReason: null });
      if (path.includes("/fixture/modules/") && method === "PATCH") {
        patches.push({ path, body: JSON.parse(route.request().postData()) });
        if (path.endsWith("/MARKETPLACE")) return json({ code: "MODULE_DEPENDENCY", message: "Refused by server for test." }, 409);
        return json({ ok: true });
      }
      if (path === "/api/platform-admin/modules") return json(catalog);
      return json([]);
    });

    // --- Existing tenant: warnings, hints, dialog ---
    await page.goto(`${BASE}/platform-admin/tenants/fixture`);
    const section = page.getByRole("combobox", { name: "Tenant section", exact: true });
    if (await section.isVisible().catch(() => false)) await section.selectOption("modules");
    else await page.getByRole("group", { name: "Tenant section" }).getByRole("button", { name: "Modules", exact: true }).click();
    await page.getByText("Payouts won't work: Partners is disabled.", { exact: true }).waitFor();
    checks.push("Existing dependency violation shown as a banner");
    assert.ok(await page.getByText("Requires Partners.", { exact: true }).isVisible());
    assert.ok(await page.getByText("Requires Automations and Marketing Communications.", { exact: true }).isVisible());
    checks.push("Dependent modules show what they require");

    const choose = async (moduleName, status) => {
      await page.getByLabel(`${moduleName} status`, { exact: true }).click();
      await page.getByRole("option", { name: status, exact: true }).click();
    };
    const dialog = page.getByRole("dialog");

    await choose("Opportunities", "Disabled");
    await dialog.getByText("Opportunities (kept, but inaccessible):", { exact: false }).waitFor();
    assert.ok(await dialog.getByText("42", { exact: true }).isVisible());
    await dialog.getByLabel("Reason (optional, recorded in the audit log)").fill("Plan downgrade");
    await page.setViewportSize({ width: 320, height: 900 });
    await page.evaluate(() => { document.documentElement.style.fontSize = "32px"; });
    await page.waitForTimeout(300);
    const overflow = await require("./ui-overflow.cjs")(page);
    assert.deepEqual(overflow, [], "impact dialog overflows at 320px / 200% text");
    await page.screenshot({ path: `${out}/impact-dialog-320.png` });
    await page.evaluate(() => { document.documentElement.style.fontSize = ""; });
    await page.setViewportSize({ width: 1280, height: 900 });
    await dialog.getByRole("button", { name: "Save change", exact: true }).click();
    await dialog.waitFor({ state: "hidden" });
    assert.deepEqual(patches.at(-1), { path: "/api/platform-admin/tenants/fixture/modules/OPPORTUNITIES", body: { status: "DISABLED", reason: "Plan downgrade", trialEndsAt: null } });
    checks.push("Impact dialog lists what stops, saves with the typed reason, fits 320px at 200% text");

    const before = patches.length;
    await choose("Automations", "Suspended");
    await dialog.getByText("Journey Orchestration depends on Automations. Disable Journey Orchestration first.", { exact: true }).waitFor();
    assert.ok(await dialog.getByRole("button", { name: "Save change", exact: true }).isDisabled());
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    await dialog.waitFor({ state: "hidden" });
    checks.push("Server-reported dependency blocks disabling, Save disabled");

    await choose("Journey Orchestration", "Enabled");
    await dialog.getByText("Journey Orchestration requires Marketing Communications. Enable Marketing Communications first.", { exact: true }).waitFor();
    assert.ok(await dialog.getByRole("button", { name: "Save change", exact: true }).isDisabled());
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    assert.equal(patches.length, before, "a refused or cancelled change must not be sent");
    checks.push("Enabling without requirements explained client-side; cancel sends nothing");

    await choose("Marketplace", "Disabled");
    await dialog.getByText("Installed apps:", { exact: false }).waitFor();
    await dialog.getByRole("button", { name: "Save change", exact: true }).click();
    await dialog.getByText("Refused by server for test.", { exact: true }).waitFor();
    assert.ok(await dialog.isVisible());
    checks.push("A server refusal is shown inside the dialog, which stays open");
    await page.screenshot({ path: `${out}/existing-tenant-dialog-error.png`, fullPage: true });
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();

    // --- Create tenant: dependency blocking before submit ---
    await page.goto(`${BASE}/platform-admin/tenants`);
    await page.getByRole("button", { name: "Create Tenant", exact: true }).click();
    await page.getByText("28 of 28 modules enabled — review selection", { exact: true }).click();
    await page.getByRole("switch", { name: "Partners", exact: true }).uncheck();
    await page.getByText("Payouts won't work: Partners is disabled. Turn it off or enable what it requires.", { exact: true }).waitFor();
    assert.ok(await page.getByRole("button", { name: "Provision Tenant", exact: true }).isDisabled());
    await page.getByRole("switch", { name: "Payouts", exact: true }).uncheck();
    assert.equal(await page.getByText("Payouts won't work", { exact: false }).count(), 0);
    assert.ok(!(await page.getByRole("button", { name: "Provision Tenant", exact: true }).isDisabled()));
    checks.push("Create tenant blocks a broken module selection with an explanation until fixed");

    // --- Tenant user with Telephony + Data Platform disabled ---
    me = { id: "tenant-user", tenantId: "t1", name: "Tenant user", isTenantAdmin: true, role: { name: "Admin", permissions: { modules: { admin: "full" } } }, features: flags, moduleEntitlements: { TELEPHONY: "DISABLED", DATA_PLATFORM: "SUSPENDED" } };
    await page.goto(`${BASE}/dashboard/call-center`);
    await page.getByText("Telephony is not enabled", { exact: true }).waitFor();
    assert.equal(await page.getByRole("link", { name: "Call Center", exact: true }).count(), 0);
    checks.push("Telephony-disabled tenant: Call Center page explains, nav link hidden");
    await page.goto(`${BASE}/dashboard/settings/dedupe`);
    await page.getByText("Data Platform is not enabled", { exact: true }).waitFor();
    assert.equal(await page.getByRole("link", { name: /Call Scripts|Call Campaigns|Dedupe/ }).count(), 0);
    checks.push("Data-Platform-suspended tenant: Dedupe page explains; telephony/dedupe settings links hidden");
    await page.screenshot({ path: `${out}/tenant-module-disabled.png`, fullPage: true });

    assert.deepEqual(errors, []);
    checks.push("No browser exceptions");
    fs.writeFileSync(`${out}/results.json`, JSON.stringify({ checks: checks.length, results: checks }, null, 2));
    console.log(JSON.stringify({ status: "passed", checks: checks.length }));
  } finally {
    await browser.close();
  }
}

main().catch((error) => { console.error(error); console.error("Completed checks:", checks); process.exitCode = 1; });
