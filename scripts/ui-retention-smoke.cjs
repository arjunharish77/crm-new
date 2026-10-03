/* eslint-disable @typescript-eslint/no-require-imports */
// Browser check for Platform Admin -> Data Retention against a running dev server with fixture
// API responses: tenant names shown, empty periods shown as Off, edit saves empty as null,
// adding a tenant policy, "Enforce now" previews and asks before changing anything, the old
// /dashboard/admin/retention URL redirects, and 320px / 200% text layout.
const { chromium } = require(process.env.CRM_PLAYWRIGHT_MODULE || "playwright");
const fs = require("fs");
const assert = require("node:assert/strict");
const overflowing = require("./ui-overflow.cjs");

const BASE = process.env.CRM_BASE_URL || "http://localhost:3000";
const checks = [];

async function main() {
  const browser = await chromium.launch({ executablePath: process.env.CRM_CHROMIUM_PATH, headless: true });
  const out = "ui-audit-2026-09/retention";
  fs.mkdirSync(out, { recursive: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const writes = [];
    let policies = [{ id: "p1", tenantId: "t1", tenantName: "Manipal Online Admissions Workspace", lastEnforcedAt: null, leadRetentionDays: null, opportunityRetentionDays: null, activityRetentionDays: null, auditLogRetentionDays: 90, deletedRecordsRetentionDays: 30, marketplaceAppLogRetentionDays: 90 }];
    const me = { id: "platform-fixture", name: "Platform fixture", isPlatformAdmin: true, role: { name: "Platform Admin", permissions: { modules: { admin: "full" } } } };
    await page.route("**/api/**", async (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      const json = (data, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(data) });
      if (request.method() !== "GET") writes.push({ method: request.method(), path, body: request.postData() ? JSON.parse(request.postData()) : null });
      if (path === "/api/auth/me") return json(me);
      if (path === "/api/platform-admin/retention/policies") return json(policies);
      if (path === "/api/platform-admin/tenants") return json([{ id: "t1", name: "Manipal Online Admissions Workspace" }, { id: "t2", name: "Second tenant" }]);
      if (path.startsWith("/api/platform-admin/retention/policy/") && request.method() === "PATCH") {
        const tenantId = path.split("/").pop();
        const body = JSON.parse(request.postData());
        const existing = policies.find((policy) => policy.tenantId === tenantId);
        if (existing) Object.assign(existing, body);
        else policies = [...policies, { id: `p-${tenantId}`, tenantId, tenantName: "Second tenant", lastEnforcedAt: null, leadRetentionDays: null, opportunityRetentionDays: null, activityRetentionDays: null, auditLogRetentionDays: 90, deletedRecordsRetentionDays: 30, marketplaceAppLogRetentionDays: 90 }];
        return json(existing ?? policies.at(-1));
      }
      if (path === "/api/platform-admin/retention/enforce" && request.method() === "GET") {
        return json({ tenants: [{ tenantId: "t1", tenantName: "Manipal Online Admissions Workspace", leadsAnonymized: 12, opportunitiesAnonymized: 0, activitiesAnonymized: 3, auditLogsDeleted: 40, fieldDefinitionsPurged: 0, marketplaceAppLogsPurged: 0 }], totals: { leadsAnonymized: 12, opportunitiesAnonymized: 0, activitiesAnonymized: 3, auditLogsDeleted: 40, fieldDefinitionsPurged: 0, marketplaceAppLogsPurged: 0 } });
      }
      if (path === "/api/platform-admin/retention/enforce") return json({ leadsAnonymized: 12, opportunitiesAnonymized: 0, activitiesAnonymized: 3, auditLogsDeleted: 40, fieldDefinitionsPurged: 0, marketplaceAppLogsPurged: 0, tenantsProcessed: 1, tenantsFailed: 0 });
      return json(request.method() === "GET" ? [] : { ok: true });
    });

    // Old URL redirects to the platform-admin page.
    await page.goto(`${BASE}/dashboard/admin/retention`);
    await page.waitForURL("**/platform-admin/retention");
    await page.getByRole("heading", { name: "Data retention" }).waitFor();
    checks.push("Old /dashboard/admin/retention URL redirects to Platform Admin -> Data Retention");
    assert.ok(await page.getByRole("heading", { name: "Manipal Online Admissions Workspace" }).isVisible());
    assert.equal(await page.getByText("Global Default Policy").count(), 0);
    const list = page.getByRole("list", { name: "Retention policies" });
    assert.equal(await list.getByText("Off", { exact: true }).count(), 3);
    assert.ok(await page.getByRole("link", { name: "Data Retention" }).isVisible());
    checks.push("Policies show the tenant name and Off for unset periods; menu entry present");

    // Edit: a number saves as a number, empty as null.
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    await page.getByLabel("Closed leads (days)").fill("365");
    await page.getByLabel("Audit logs (days)").fill("");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await page.getByText("Retention policy saved").first().waitFor();
    const saved = writes.find((write) => write.path === "/api/platform-admin/retention/policy/t1");
    assert.deepEqual(saved.body, { leadRetentionDays: 365, opportunityRetentionDays: null, activityRetentionDays: null, auditLogRetentionDays: null, deletedRecordsRetentionDays: 30, marketplaceAppLogRetentionDays: 90 });
    checks.push("Edit saves numbers and empty fields as off (null)");

    // Add a tenant policy.
    await page.getByLabel("Add a policy for").click();
    await page.getByRole("option", { name: "Second tenant" }).click();
    await page.getByRole("button", { name: "Add policy", exact: true }).click();
    await page.getByRole("heading", { name: "Second tenant" }).waitFor();
    assert.deepEqual(writes.find((write) => write.path === "/api/platform-admin/retention/policy/t2").body, {});
    checks.push("Adding a tenant policy creates it with the safe defaults");

    // Enforce now: preview first, nothing posted until confirmed.
    await page.getByRole("button", { name: "Enforce now…", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByText("This cannot be undone. It will change:").waitFor();
    assert.ok(await dialog.getByText("12 leads anonymized", { exact: true }).isVisible());
    assert.ok(await dialog.getByText("40 audit entries deleted", { exact: true }).isVisible());
    assert.equal(writes.filter((write) => write.path === "/api/platform-admin/retention/enforce").length, 0);
    checks.push("Enforce now previews the changes and posts nothing before confirmation");
    await page.setViewportSize({ width: 320, height: 900 });
    await page.evaluate(() => { document.documentElement.style.fontSize = "32px"; });
    await page.waitForTimeout(300);
    assert.deepEqual(await overflowing(page), [], "retention dialog overflows at 320px / 200%");
    await page.screenshot({ path: `${out}/enforce-dialog-320.png` });
    await page.evaluate(() => { document.documentElement.style.fontSize = ""; });
    await page.setViewportSize({ width: 1280, height: 900 });
    await dialog.getByRole("button", { name: "Anonymize and delete now", exact: true }).click();
    await page.getByText(/Enforced for 1 tenant: 12 leads anonymized/).first().waitFor();
    assert.equal(writes.filter((write) => write.path === "/api/platform-admin/retention/enforce").length, 1);
    checks.push("Confirming enforces and reports what changed");

    await page.setViewportSize({ width: 320, height: 900 });
    await page.evaluate(() => { document.documentElement.style.fontSize = "32px"; });
    await page.getByRole("button", { name: "Edit", exact: true }).first().click();
    await page.waitForTimeout(300);
    assert.deepEqual(await overflowing(page), [], "retention page overflows at 320px / 200%");
    await page.screenshot({ path: `${out}/retention-320.png`, fullPage: true });
    checks.push("Retention page (with the editor open) fits 320px at 200% text");

    assert.deepEqual(errors, []);
    checks.push("No browser exceptions");
    fs.writeFileSync(`${out}/results.json`, JSON.stringify({ checks: checks.length, results: checks }, null, 2));
    console.log(JSON.stringify({ status: "passed", checks: checks.length }));
  } finally {
    await browser.close();
  }
}

main().catch((error) => { console.error(error); console.error("Completed checks:", checks); process.exitCode = 1; });
