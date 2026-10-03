/**
 * Local-only real-database check for the pipeline stage editor (UI/UX plan decision 34, G6):
 *   - a new opportunity type starts with an open, a Won and a Lost stage;
 *   - add, rename and reorder stages; names are unique per type (case-insensitive) among
 *     active stages, and a removed stage's name can be used again;
 *   - a stage with opportunities is removed only by moving them to another stage, each move
 *     recorded in the stage history, and the stage is archived (kept for history, gone from
 *     the type's stages);
 *   - a Won or Lost stage in use can't be removed; a type keeps one stage of each kind, also
 *     when two removals race; a stage's kind can't change while opportunities are in it.
 * Temporary tenant, removed afterwards.
 * Run: tsx scripts/stages-smoke.ts
 */
import { createRequire } from "module";
import { randomUUID } from "crypto";
import assert from "node:assert/strict";
import { getPool } from "../src/lib/db/pool";
import { createStageForType, listStagesForType, removeStage, reorderStages, updateStage } from "../src/lib/repositories/stages-postgres";
import { createOpportunityTypeConfigForTenant } from "../src/lib/server/admin-modules";
import { getOpportunityHistoryForTenant, listOpportunityTypesForTenant } from "../src/lib/repositories/opportunities-postgres";

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
  try {
    await q(`insert into "Tenant" (id, name, "updatedAt") values ($1, 'Stage editor smoke', now())`, [tenantId]);
    const roleId = randomUUID();
    await q(`insert into "Role" (id, "tenantId", name, permissions, "updatedAt") values ($1, $2, 'Smoke admin', '{"recordAccess":"ALL"}', now())`, [roleId, tenantId]);
    const userId = randomUUID();
    await q(`insert into "User" (id, "tenantId", email, name, password, "roleId", "updatedAt") values ($1, $2, $3, 'Smoke', 'x', $4, now())`, [userId, tenantId, `stages.${userId.slice(0, 6)}@smoke.invalid`, roleId]);
    for (const [name, label] of [["lead", "Lead"], ["opportunity", "Opportunity"]]) {
      await q(`insert into "ObjectDefinition" (id, "tenantId", name, label, "updatedAt") values ($1, $2, $3, $4, now())`, [randomUUID(), tenantId, name, label]);
    }
    const user = { id: userId, tenantId, isTenantAdmin: true, role: { permissions: { recordAccess: "ALL" } } } as any;

    const type = await createOpportunityTypeConfigForTenant(user, { name: "Smoke type" });
    let stages = await listStagesForType(user, type.id);
    check(stages.map((stage) => `${stage.name}:${stage.kind}`).join(",") === "New:OPEN,Won:WON,Lost:LOST", "a new type starts with New, Won and Lost");

    const qualified = await createStageForType(user, type.id, { name: "Qualified", kind: "OPEN", probability: 40 });
    stages = await listStagesForType(user, type.id);
    check(stages.map((stage) => stage.name).join(",") === "New,Qualified,Won,Lost", "a new open stage goes before the closed ones");
    await rejects(() => createStageForType(user, type.id, { name: "qualified", kind: "OPEN" }), "STAGE_NAME_TAKEN", "names are unique per type, ignoring case");
    await updateStage(user, type.id, qualified.id, { name: "Qualified lead", probability: 45 });
    check((await listStagesForType(user, type.id)).some((stage) => stage.name === "Qualified lead" && stage.probability === 45), "a stage can be renamed");
    const reversedOpen = [qualified.id, stages[0].id, stages[2].id, stages[3].id];
    check((await reorderStages(user, type.id, reversedOpen)).map((stage) => stage.id).join() === reversedOpen.join(), "stages can be reordered");
    await rejects(() => reorderStages(user, type.id, reversedOpen.slice(1)), "STAGE_ORDER_INVALID", "a reorder must list every stage");

    // An opportunity in "Qualified lead".
    const objectId = (await q(`select id from "ObjectDefinition" where "tenantId" = $1 and name = 'opportunity' limit 1`, [tenantId])).rows[0]?.id;
    const leadObjectId = (await q(`select id from "ObjectDefinition" where "tenantId" = $1 and name = 'lead' limit 1`, [tenantId])).rows[0]?.id;
    const leadId = randomUUID();
    await q(`insert into "Lead" (id, "tenantId", "objectId", name, "createdBy", "updatedAt", tags) values ($1, $2, $3, 'Stage smoke lead', $4, now(), '{}')`, [leadId, tenantId, leadObjectId, userId]);
    const opportunityId = randomUUID();
    await q(`insert into "Opportunity" (id, "tenantId", "objectId", "leadId", "opportunityTypeId", "stageId", title, "createdBy", "updatedAt", tags) values ($1, $2, $3, $4, $5, $6, 'Stage smoke deal', $7, now(), '{}')`, [opportunityId, tenantId, objectId, leadId, type.id, qualified.id, userId]);

    await rejects(() => updateStage(user, type.id, qualified.id, { kind: "WON" }), "STAGE_KIND_IN_USE", "a stage in use can't change kind");
    await rejects(() => removeStage(user, type.id, qualified.id), "STAGE_MOVE_TARGET_REQUIRED", "removing a stage in use needs a stage to move to");
    await rejects(() => removeStage(user, type.id, qualified.id, qualified.id), "STAGE_MOVE_TARGET_INVALID", "it can't move to itself");
    const newStage = (await listStagesForType(user, type.id)).find((stage) => stage.name === "New")!;
    const result = await removeStage(user, type.id, qualified.id, newStage.id);
    check(result.moved === 1, "its opportunities are moved");
    check((await q(`select "stageId" from "Opportunity" where id = $1`, [opportunityId])).rows[0].stageId === newStage.id, "the opportunity is in the new stage");
    const history = await getOpportunityHistoryForTenant(user, opportunityId);
    check(history[0]?.fromStage?.name === "Qualified lead" && history[0]?.toStage?.name === "New" && /removed/.test(history[0]?.notes ?? ""), "the move is in the stage history, with the removed stage's name");
    check((await q(`select "archivedAt" from "StageDefinition" where id = $1`, [qualified.id])).rows[0].archivedAt !== null, "the stage is archived, not deleted");
    const listed = (await listOpportunityTypesForTenant(user)).find((item: any) => item.id === type.id);
    check(!listed.stages.some((stage: any) => stage.id === qualified.id) && listed.archivedStages.some((stage: any) => stage.id === qualified.id), "an archived stage is gone from the type's stages and kept for history");
    check(!!(await createStageForType(user, type.id, { name: "Qualified lead", kind: "OPEN" })), "a removed stage's name can be used again");

    // Closed stages.
    const won = (await listStagesForType(user, type.id)).find((stage) => stage.kind === "WON")!;
    await rejects(() => removeStage(user, type.id, won.id), "STAGE_LAST_WON", "the only Won stage can't be removed");
    const won2 = await createStageForType(user, type.id, { name: "Won (paid)", kind: "WON" });
    check(won2.probability === 100, "a Won stage's probability is 100");
    await q(`update "Opportunity" set "stageId" = $1 where id = $2`, [won2.id, opportunityId]);
    await rejects(() => removeStage(user, type.id, won2.id, newStage.id), "STAGE_CLOSED_IN_USE", "a Won stage with opportunities can't be removed");
    await q(`update "Opportunity" set "stageId" = $1 where id = $2`, [newStage.id, opportunityId]);
    check((await removeStage(user, type.id, won2.id)).moved === 0, "an unused extra Won stage can be removed");
    await rejects(() => updateStage(user, type.id, won.id, { kind: "OPEN" }), "STAGE_LAST_WON", "the only Won stage can't become open");

    // Two removals racing for the last open stages: one must lose.
    const open = (await listStagesForType(user, type.id)).filter((stage) => stage.kind === "OPEN" && stage.opportunityCount === 0);
    while (open.length < 2) open.push(await createStageForType(user, type.id, { name: `Extra ${open.length}`, kind: "OPEN" }) as any);
    const keep = (await listStagesForType(user, type.id)).filter((stage) => stage.kind === "OPEN" && !open.slice(0, 2).some((item) => item.id === stage.id));
    for (const stage of keep) await q(`update "Opportunity" set "stageId" = $1 where "stageId" = $2`, [open[0].id, stage.id]).then(() => removeStage(user, type.id, stage.id, open[0].id));
    await q(`update "Opportunity" set "stageId" = $1 where id = $2`, [won.id, opportunityId]);
    const race = await Promise.allSettled([removeStage(user, type.id, open[0].id), removeStage(user, type.id, open[1].id)]);
    check(race.filter((outcome) => outcome.status === "fulfilled").length === 1, "of two racing removals of the last two open stages, exactly one succeeds");
    check((await listStagesForType(user, type.id)).some((stage) => stage.kind === "OPEN"), "an open stage remains");

    console.log(`stages-smoke: ${checks} checks passed`);
  } finally {
    const tables = (await q(`select table_name from information_schema.columns where table_schema = 'public' and column_name = 'tenantId'`)).rows.map((row) => row.table_name as string);
    for (let pass = 0; pass < 6; pass++) for (const table of tables) await q(`delete from "${table.replaceAll('"', '""')}" where "tenantId" = $1`, [tenantId]).catch(() => undefined);
    await q(`delete from "Tenant" where id = $1`, [tenantId]);
  }
}

main()
  .catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(() => process.exit(process.exitCode ?? 0));
