import { randomUUID } from "crypto";
import { execute, query, queryOne } from "@/lib/db/query";
import { withTransaction, type TransactionClient } from "@/lib/db/transaction";

// Pipeline stage editor (UI/UX plan decision 34, §12.4 G6). Stages used to come only from seed
// data. The rules:
//   - a stage with opportunities is removed by moving them to another stage of the same type
//     first (each move recorded in the stage history), then archiving it (migration 0125);
//   - a Won or Lost stage that opportunities are in can't be removed;
//   - every type keeps at least one open, one Won and one Lost stage;
//   - a stage's kind (open, Won, Lost) can't change while opportunities are in it, because that
//     would silently mark them won or lost.

type TenantUser = { id: string; tenantId: string | null };

export type StageKind = "OPEN" | "WON" | "LOST";
export type StageRow = {
    id: string;
    opportunityTypeId: string;
    name: string;
    order: number;
    probability: number;
    color: string | null;
    isClosed: boolean;
    isWon: boolean;
    kind: StageKind;
    opportunityCount: number;
};

const COLUMNS = `s.id, s."opportunityTypeId", s.name, s."order", s.probability, s.color, s."isClosed", s."isWon"`;

export function stageKind(stage: { isClosed: boolean; isWon: boolean }): StageKind {
    return stage.isClosed ? (stage.isWon ? "WON" : "LOST") : "OPEN";
}

function kindFlags(kind: StageKind) {
    return { isClosed: kind !== "OPEN", isWon: kind === "WON" };
}

function tenantOf(user: TenantUser) {
    if (!user.tenantId) throw new Error("TENANT_CONTEXT_REQUIRED");
    return user.tenantId;
}

async function assertTypeInTenant(tenantId: string, typeId: string, client?: TransactionClient) {
    const type = await queryOne<{ id: string }>(`select id from "OpportunityType" where id = $1 and "tenantId" = $2`, [typeId, tenantId], client);
    if (!type) throw new Error("OPPORTUNITY_TYPE_NOT_FOUND");
}

async function activeStages(tenantId: string, typeId: string, client?: TransactionClient): Promise<StageRow[]> {
    const rows = await query<any>(
        `select ${COLUMNS}, (select count(*)::int from "Opportunity" o where o."stageId" = s.id and o."tenantId" = s."tenantId") as "opportunityCount"
         from "StageDefinition" s
         where s."tenantId" = $1 and s."opportunityTypeId" = $2 and s."archivedAt" is null
         order by s."order" asc, s.name asc`,
        [tenantId, typeId],
        client,
    );
    return (rows ?? []).map((row) => ({ ...row, kind: stageKind(row), opportunityCount: Number(row.opportunityCount ?? 0) }));
}

// After a change, each kind must still be present (decision 34).
function assertKindsRemain(stages: Array<{ isClosed: boolean; isWon: boolean }>) {
    const kinds = new Set(stages.map(stageKind));
    if (!kinds.has("OPEN")) throw new Error("STAGE_LAST_OPEN");
    if (!kinds.has("WON")) throw new Error("STAGE_LAST_WON");
    if (!kinds.has("LOST")) throw new Error("STAGE_LAST_LOST");
}

function cleanName(name: unknown) {
    const value = String(name ?? "").trim().replace(/\s+/g, " ");
    if (!value) throw new Error("STAGE_NAME_REQUIRED");
    if (value.length > 60) throw new Error("STAGE_NAME_TOO_LONG");
    return value;
}

function cleanProbability(value: unknown, kind: StageKind) {
    if (kind === "WON") return 100;
    if (kind === "LOST") return 0;
    const number = Math.round(Number(value ?? 0));
    if (!Number.isFinite(number) || number < 0 || number > 100) throw new Error("STAGE_PROBABILITY_INVALID");
    return number;
}

function cleanColor(value: unknown) {
    if (value === null || value === undefined || value === "") return null;
    const color = String(value).trim();
    if (!/^#[0-9a-fA-F]{6}$/.test(color)) throw new Error("STAGE_COLOR_INVALID");
    return color;
}

async function audit(user: TenantUser, action: string, stageId: string, before: unknown, after: unknown, client?: TransactionClient) {
    await execute(
        `insert into "AuditLog" (id, "tenantId", "userId", action, "entityType", "entityId", before, after, diff, metadata, "createdAt")
         values ($1, $2, $3, $4, 'STAGE', $5, $6, $7, null, null, $8)`,
        [randomUUID(), user.tenantId, user.id, action, stageId, before ?? null, after ?? null, new Date().toISOString()],
        client,
    );
}

export async function listStagesForType(user: TenantUser, typeId: string) {
    const tenantId = tenantOf(user);
    await assertTypeInTenant(tenantId, typeId);
    return activeStages(tenantId, typeId);
}

// The open, Won and Lost stages a new type starts with, so opportunities can be created in it.
export async function seedDefaultStages(tenantId: string, typeId: string, client?: TransactionClient) {
    const now = new Date().toISOString();
    const defaults: Array<[string, StageKind, number]> = [["New", "OPEN", 10], ["Won", "WON", 100], ["Lost", "LOST", 0]];
    for (const [index, [name, kind, probability]] of defaults.entries()) {
        const flags = kindFlags(kind);
        await execute(
            `insert into "StageDefinition" (id, "tenantId", "opportunityTypeId", name, "order", probability, color, "slaDays", "isClosed", "isWon", "createdAt", "updatedAt")
             values ($1, $2, $3, $4, $5, $6, null, 0, $7, $8, $9, $9)`,
            [randomUUID(), tenantId, typeId, name, index + 1, probability, flags.isClosed, flags.isWon, now],
            client,
        );
    }
}

export async function createStageForType(user: TenantUser, typeId: string, input: { name?: unknown; kind?: unknown; probability?: unknown; color?: unknown }) {
    const tenantId = tenantOf(user);
    await assertTypeInTenant(tenantId, typeId);
    const kind = (["OPEN", "WON", "LOST"].includes(String(input.kind)) ? String(input.kind) : "OPEN") as StageKind;
    const name = cleanName(input.name);
    const stages = await activeStages(tenantId, typeId);
    if (stages.some((stage) => stage.name.toLowerCase() === name.toLowerCase())) throw new Error("STAGE_NAME_TAKEN");
    // Open stages go before the closed ones; closed stages go at the end.
    const lastOpen = Math.max(0, ...stages.filter((stage) => !stage.isClosed).map((stage) => stage.order));
    const order = kind === "OPEN" ? lastOpen + 1 : Math.max(0, ...stages.map((stage) => stage.order)) + 1;
    const flags = kindFlags(kind);
    const now = new Date().toISOString();
    return withTransaction(user as any, async (client) => {
        if (kind === "OPEN") {
            await execute(
                `update "StageDefinition" set "order" = "order" + 1, "updatedAt" = $1 where "tenantId" = $2 and "opportunityTypeId" = $3 and "archivedAt" is null and "order" >= $4`,
                [now, tenantId, typeId, order],
                client,
            );
        }
        const created = await queryOne<any>(
            `insert into "StageDefinition" (id, "tenantId", "opportunityTypeId", name, "order", probability, color, "slaDays", "isClosed", "isWon", "createdAt", "updatedAt")
             values ($1, $2, $3, $4, $5, $6, $7, 0, $8, $9, $10, $10)
             returning id, "opportunityTypeId", name, "order", probability, color, "isClosed", "isWon"`,
            [randomUUID(), tenantId, typeId, name, order, cleanProbability(input.probability, kind), cleanColor(input.color), flags.isClosed, flags.isWon, now],
            client,
        );
        await audit(user, "CREATE", created.id, null, created, client);
        return { ...created, kind, opportunityCount: 0 };
    });
}

export async function updateStage(user: TenantUser, typeId: string, stageId: string, input: { name?: unknown; kind?: unknown; probability?: unknown; color?: unknown }) {
    const tenantId = tenantOf(user);
    await assertTypeInTenant(tenantId, typeId);
    const stages = await activeStages(tenantId, typeId);
    const existing = stages.find((stage) => stage.id === stageId);
    if (!existing) throw new Error("STAGE_NOT_FOUND");
    const kind = input.kind !== undefined && ["OPEN", "WON", "LOST"].includes(String(input.kind)) ? (String(input.kind) as StageKind) : existing.kind;
    if (kind !== existing.kind) {
        if (existing.opportunityCount > 0) throw new Error("STAGE_KIND_IN_USE");
        assertKindsRemain(stages.map((stage) => (stage.id === stageId ? { ...stage, ...kindFlags(kind) } : stage)));
    }
    const name = input.name !== undefined ? cleanName(input.name) : existing.name;
    if (stages.some((stage) => stage.id !== stageId && stage.name.toLowerCase() === name.toLowerCase())) throw new Error("STAGE_NAME_TAKEN");
    const probability = input.probability !== undefined || kind !== existing.kind ? cleanProbability(input.probability ?? existing.probability, kind) : existing.probability;
    const color = input.color !== undefined ? cleanColor(input.color) : existing.color;
    const flags = kindFlags(kind);
    const updated = await queryOne<any>(
        `update "StageDefinition" set name = $1, probability = $2, color = $3, "isClosed" = $4, "isWon" = $5, "updatedAt" = $6
         where id = $7 and "tenantId" = $8 and "archivedAt" is null
         returning id, "opportunityTypeId", name, "order", probability, color, "isClosed", "isWon"`,
        [name, probability, color, flags.isClosed, flags.isWon, new Date().toISOString(), stageId, tenantId],
    );
    if (!updated) throw new Error("STAGE_NOT_FOUND");
    await audit(user, "UPDATE", stageId, existing, updated);
    return { ...updated, kind, opportunityCount: existing.opportunityCount };
}

export async function reorderStages(user: TenantUser, typeId: string, ids: string[]) {
    const tenantId = tenantOf(user);
    await assertTypeInTenant(tenantId, typeId);
    const stages = await activeStages(tenantId, typeId);
    if (ids.length !== stages.length || new Set(ids).size !== ids.length || !ids.every((id) => stages.some((stage) => stage.id === id))) {
        throw new Error("STAGE_ORDER_INVALID");
    }
    const now = new Date().toISOString();
    await withTransaction(user as any, async (client) => {
        for (const [index, id] of ids.entries()) {
            await execute(`update "StageDefinition" set "order" = $1, "updatedAt" = $2 where id = $3 and "tenantId" = $4`, [index + 1, now, id, tenantId], client);
        }
    });
    return activeStages(tenantId, typeId);
}

// Removes a stage: moves its opportunities to `moveToStageId` (required when there are any),
// recording each move in the stage history, then archives the stage. Returns how many moved.
export async function removeStage(user: TenantUser, typeId: string, stageId: string, moveToStageId?: string | null) {
    const tenantId = tenantOf(user);
    await assertTypeInTenant(tenantId, typeId);
    return withTransaction(user as any, async (client) => {
        // Lock the type's stages so two removals can't both pass the "one of each kind" check.
        await query(`select id from "StageDefinition" where "tenantId" = $1 and "opportunityTypeId" = $2 and "archivedAt" is null for update`, [tenantId, typeId], client);
        const stages = await activeStages(tenantId, typeId, client);
        const stage = stages.find((item) => item.id === stageId);
        if (!stage) throw new Error("STAGE_NOT_FOUND");
        assertKindsRemain(stages.filter((item) => item.id !== stageId));
        let moved = 0;
        if (stage.opportunityCount > 0) {
            if (stage.isClosed) throw new Error("STAGE_CLOSED_IN_USE");
            const target = stages.find((item) => item.id === moveToStageId && item.id !== stageId);
            if (!moveToStageId) throw new Error("STAGE_MOVE_TARGET_REQUIRED");
            if (!target) throw new Error("STAGE_MOVE_TARGET_INVALID");
            const movedRows = await query<{ id: string }>(
                `update "Opportunity" set "stageId" = $1, "updatedAt" = $2 where "tenantId" = $3 and "stageId" = $4 returning id`,
                [target.id, new Date().toISOString(), tenantId, stageId],
                client,
            );
            moved = (movedRows ?? []).length;
            if (moved) {
                await execute(
                    `insert into "OpportunityStageHistory" (id, "tenantId", "opportunityId", "fromStageId", "toStageId", "changedById", notes)
                     select gen_random_uuid()::text, $1, o.id, $2, $3, $4, $5 from unnest($6::text[]) as o(id)`,
                    [tenantId, stageId, target.id, user.id, `Moved because the stage "${stage.name}" was removed`, movedRows.map((row) => row.id)],
                    client,
                );
            }
        }
        await execute(`update "StageDefinition" set "archivedAt" = $1, "updatedAt" = $1 where id = $2 and "tenantId" = $3`, [new Date().toISOString(), stageId, tenantId], client);
        await audit(user, "DELETE", stageId, { ...stage, moved, movedTo: moveToStageId ?? null }, null, client);
        return { moved };
    });
}
