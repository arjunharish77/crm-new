/**
 * Local-only real-database check for knowledge-base integrity:
 *   - category names are unique in a workspace, ignoring case (a clear error, not a 500);
 *   - a parent category must be the workspace's own; renaming a missing category says so;
 *   - "Was this helpful?" feedback needs an article (and case) from the same workspace.
 * Temporary tenants, removed afterwards.
 * Run: tsx scripts/knowledge-base-integrity-smoke.ts
 */
import { createRequire } from "module";
import { randomUUID } from "crypto";
import assert from "node:assert/strict";
import { getPool } from "../src/lib/db/pool";
import { createKnowledgeBaseCategoryForTenant, submitKnowledgeBaseArticleFeedback, updateKnowledgeBaseCategoryForTenant } from "../src/lib/repositories/knowledge-base-postgres";

const require = createRequire(import.meta.url);
const d = require("./db-utils.js");

async function main() {
  for (const url of [d.directDatabaseUrl(), d.appDatabaseUrl()]) assert.ok(["localhost", "127.0.0.1"].includes(new URL(url).hostname), "Local database required");
  const pool = getPool();
  const q = (sql: string, args: unknown[] = []) => pool.query(sql, args);
  let checks = 0;
  const check = (value: unknown, label: string) => { assert.ok(value, label); checks++; };
  const rejects = async (run: () => Promise<unknown>, code: string, label: string) => {
    await assert.rejects(run, (error: any) => error?.message === code, `${label} (expected ${code})`);
    checks++;
  };
  const tenantId = randomUUID();
  const otherTenantId = randomUUID();
  try {
    const users: Record<string, any> = {};
    for (const id of [tenantId, otherTenantId]) {
      await q(`insert into "Tenant" (id, name, "updatedAt") values ($1, 'KB smoke', now())`, [id]);
      const roleId = randomUUID();
      await q(`insert into "Role" (id, "tenantId", name, permissions, "updatedAt") values ($1, $2, 'Admin', '{"recordAccess":"ALL"}', now())`, [roleId, id]);
      const userId = randomUUID();
      await q(`insert into "User" (id, "tenantId", email, name, password, "roleId", "updatedAt") values ($1, $2, $3, 'Smoke', 'x', $4, now())`, [userId, id, `kb.${userId.slice(0, 8)}@smoke.invalid`, roleId]);
      users[id] = { id: userId, tenantId: id, isTenantAdmin: true } as any;
    }
    const user = users[tenantId];
    const outsider = users[otherTenantId];

    const billing = await createKnowledgeBaseCategoryForTenant(user, { name: "Billing" });
    check(billing?.name === "Billing", "a category can be created");
    await rejects(() => createKnowledgeBaseCategoryForTenant(user, { name: "  billing " }), "KB_CATEGORY_NAME_TAKEN", "a name already used (ignoring case) is refused clearly");
    const other = await createKnowledgeBaseCategoryForTenant(outsider, { name: "Billing" });
    check(other?.id, "another workspace can use the same name");
    await rejects(() => createKnowledgeBaseCategoryForTenant(user, { name: "Refunds", parentId: other!.id }), "KB_CATEGORY_PARENT_INVALID", "another workspace's category can't be a parent");
    const refunds = await createKnowledgeBaseCategoryForTenant(user, { name: "Refunds", parentId: billing!.id });
    check(refunds?.parentId === billing!.id, "the workspace's own category can be a parent");
    await rejects(() => updateKnowledgeBaseCategoryForTenant(user, refunds!.id, { name: "BILLING" }), "KB_CATEGORY_NAME_TAKEN", "renaming to a used name is refused");
    await rejects(() => updateKnowledgeBaseCategoryForTenant(user, randomUUID(), { name: "Nothing" }), "KB_CATEGORY_NOT_FOUND", "renaming a missing category says so");
    await rejects(() => updateKnowledgeBaseCategoryForTenant(user, billing!.id, { parentId: billing!.id }), "KB_CATEGORY_PARENT_INVALID", "a category can't be its own parent");

    const articleId = randomUUID();
    await q(`insert into "KnowledgeBaseArticle" (id, "tenantId", title, slug, body, "updatedAt") values ($1, $2, 'Smoke article', $3, 'Body', now())`, [articleId, otherTenantId, `smoke-${articleId.slice(0, 8)}`]);
    await rejects(() => submitKnowledgeBaseArticleFeedback(user, { articleId, isHelpful: true }), "KB_ARTICLE_NOT_FOUND", "feedback on another workspace's article is refused");
    await submitKnowledgeBaseArticleFeedback(outsider, { articleId, isHelpful: true });
    check(Number((await q(`select count(*)::int n from "KnowledgeBaseArticleFeedback" where "articleId" = $1`, [articleId])).rows[0].n) === 1, "feedback on the workspace's own article is recorded");
    await rejects(() => submitKnowledgeBaseArticleFeedback(outsider, { articleId, isHelpful: false, caseId: randomUUID() }), "KB_CASE_NOT_FOUND", "a case from elsewhere can't be attached");

    console.log(`knowledge-base-integrity-smoke: ${checks} checks passed`);
  } finally {
    const tables = (await q(`select table_name from information_schema.columns where table_schema = 'public' and column_name = 'tenantId'`)).rows.map((row) => row.table_name as string);
    for (const id of [tenantId, otherTenantId]) {
      for (let pass = 0; pass < 6; pass++) for (const table of tables) await q(`delete from "${table.replaceAll('"', '""')}" where "tenantId"::text = $1`, [id]).catch(() => undefined);
      await q(`delete from "Tenant" where id = $1`, [id]);
    }
  }
}

main()
  .catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(() => process.exit(process.exitCode ?? 0));
