import { randomUUID } from "crypto";
import { execute, query, queryOne } from "@/lib/db/query";
import { DEFAULT_VOICE_BOT_CONFIG, STANDARD_CALLER_DETAILS, STANDARD_MAPPING_TARGETS, VOICE_BOT_AI_OPTIONS, voiceBotConfigSchema, type VoiceBotConfig, type VoiceBotStatus } from "@/lib/voice-bot-config";
import { findMalformedPlaceholders, placeholdersOutsideDetails, renderPlaceholders } from "@/lib/voice-bot-placeholders";
import { createCustomFieldForTenant, deleteCustomFieldForTenant, updateCustomFieldForTenant } from "@/lib/server/admin-modules";
import { createAuditLog } from "@/lib/server/crm";
import { getLeadForTenant } from "@/lib/repositories/leads-postgres";
import { getOpportunityForTenant, listOpportunitiesForTenantByType } from "@/lib/repositories/opportunities-postgres";
import { callClaude, providerKey, azureRegion } from "@/lib/server/voice-providers";
import { decryptSecretAtRest } from "@/lib/server/secret-encryption";
import { requireTenantId } from "@/lib/server/tenant-guard";
import { voiceBotServiceConfig, voiceBotServiceHealthy } from "@/lib/server/voice-bot-service";

// Voice bots (voice bot plan §4, wave B): bots, their fields (custom fields on the bot's own
// system activity type), caller details and placeholders, the numbers bots answer, holidays and
// the Claude bot-builder helper. Calls themselves come in later waves.

type TenantUser = { id: string; tenantId: string | null; role?: any; permissionTemplates?: any; isTenantAdmin?: boolean; isPlatformAdmin?: boolean };

export type VoiceBotRow = {
    id: string; name: string; status: VoiceBotStatus; activityTypeId: string | null; config: VoiceBotConfig;
    createdAt: string; updatedAt: string; archivedAt: string | null; updatedBy: string | null;
};

const BOT_COLUMNS = `id, name, status, "activityTypeId", config, "createdAt", "updatedAt", "archivedAt", "updatedBy"`;

function normalizeConfig(raw: unknown): VoiceBotConfig {
    const parsed = voiceBotConfigSchema.safeParse(raw ?? {});
    return parsed.success ? parsed.data : DEFAULT_VOICE_BOT_CONFIG;
}

function formatBot(row: any): VoiceBotRow {
    return { ...row, config: normalizeConfig(row.config) };
}

export async function listVoiceBots(user: TenantUser, options: { archived?: boolean } = {}) {
    const tenantId = requireTenantId(user);
    const rows = await query<any>(
        `select ${BOT_COLUMNS}, (select count(*)::int from "VoiceBotNumber" n where n."tenantId" = b."tenantId" and n."botId" = b.id and n.mode <> 'OWNER') as "numberCount"
         from "VoiceBot" b where "tenantId" = $1 and ${options.archived ? '"archivedAt" is not null' : '"archivedAt" is null'}
         order by lower(name)`,
        [tenantId],
    );
    return rows.map((row) => ({ ...formatBot(row), numberCount: Number(row.numberCount ?? 0) }));
}

async function fetchBot(tenantId: string, id: string) {
    const row = await queryOne<any>(`select ${BOT_COLUMNS} from "VoiceBot" where "tenantId" = $1 and id = $2`, [tenantId, id]);
    return row ? formatBot(row) : null;
}

// The bot's fields: custom fields on its own activity type, with the bot's question for each.
async function botFields(tenantId: string, bot: VoiceBotRow) {
    if (!bot.activityTypeId) return [];
    const rows = await query<any>(
        `select fd.id, fd.key, fd.label, fd.type, fd.options, fd."isRequired", fd."order"
         from "FieldDefinition" fd join "ObjectDefinition" od on od.id = fd."objectId" and od."tenantId" = fd."tenantId"
         where fd."tenantId" = $1 and od.name = 'activity' and fd."entityTypeId" = $2 and fd."deletedAt" is null and fd."isActive" = true
         order by fd."order" asc, fd."createdAt" asc`,
        [tenantId, bot.activityTypeId],
    );
    return rows.map((row) => ({
        id: row.id, key: row.key, label: row.label, type: row.type,
        options: Array.isArray(row.options) ? row.options.map(String) : [],
        ...(bot.config.fieldQuestions[row.key] ?? { question: "", mustAsk: false, confirm: false }),
    }));
}

// A bot and its fields, for starting a conversation (voice-bot-sessions.ts).
export async function loadVoiceBotForSession(tenantId: string, id: string) {
    const bot = await fetchBot(tenantId, id);
    if (!bot || bot.archivedAt) return null;
    return { bot, fields: await botFields(tenantId, bot) };
}

export async function getVoiceBot(user: TenantUser, id: string) {
    const tenantId = requireTenantId(user);
    const bot = await fetchBot(tenantId, id);
    if (!bot) return null;
    const fields = await botFields(tenantId, bot);
    return { ...bot, fields, readiness: await goLiveIssues(tenantId, bot, fields.length) };
}

// Things that must be in place before a bot can go live. Shown in the builder; going live is refused until it's empty.
async function goLiveIssues(tenantId: string, bot: VoiceBotRow, _fieldCount: number) {
    const issues: Array<{ tab: string; message: string }> = [];
    const config = bot.config;
    if (!config.openingLine.trim()) issues.push({ tab: "conversation", message: "Write the opening line." });
    if (!config.goal.trim()) issues.push({ tab: "conversation", message: "Describe the bot's goal." });
    for (const language of config.languages) {
        if (!config.voices[language]?.voice) issues.push({ tab: "basics", message: `Choose the ${language === "hi" ? "Hindi" : "English"} voice.` });
    }
    const ai = VOICE_BOT_AI_OPTIONS.find((option) => option.value === config.ai);
    const [groq, claude, google, azure] = await Promise.all([providerKey(tenantId, "groq"), providerKey(tenantId, "claude"), providerKey(tenantId, "google"), providerKey(tenantId, "azure")]);
    if (!groq) issues.push({ tab: "providers", message: "Add a Groq key (speech-to-text) in Providers." });
    if (ai?.provider === "claude" && !claude) issues.push({ tab: "providers", message: "Add a Claude key in Providers, or choose a Groq model." });
    const voiceProviders = new Set(config.languages.map((language) => config.voices[language]?.provider ?? "google"));
    if (voiceProviders.has("google") && !google) issues.push({ tab: "providers", message: "Add a Google Text-to-Speech key in Providers." });
    if (voiceProviders.has("azure") && (!azure || !(await azureRegion(tenantId)))) issues.push({ tab: "providers", message: "Add an Azure Speech key and region in Providers." });
    const telephony = await queryOne<{ isActive: boolean; provider: string | null }>(`select "isActive", config->>'provider' as provider from "IntegrationSetting" where "tenantId" = $1 and type = 'TELEPHONY'`, [tenantId]);
    if (!telephony?.isActive || String(telephony.provider ?? "").toLowerCase() !== "plivo") issues.push({ tab: "phone-system", message: "Turn on the Plivo connector in Settings › Phone system." });
    if (!voiceBotServiceConfig().configured) issues.push({ tab: "service", message: "The voice bot service isn't set up on the server yet (VOICE_BOT_SETUP.md, section 7)." });
    else if (!(await voiceBotServiceHealthy())) issues.push({ tab: "service", message: "The voice bot service isn't answering. Check that it's running on the server." });
    for (const text of [config.openingLine, config.closingLine, config.persona, config.goal, config.rules, ...config.fixedSteps.before.map((step) => step.text), ...config.fixedSteps.after.map((step) => step.text)]) {
        for (const token of findMalformedPlaceholders(text)) issues.push({ tab: "conversation", message: `"${token}" isn't a valid placeholder.` });
    }
    return issues;
}

// Placeholders used in the bot's text whose field isn't in its caller details (always empty).
export function placeholderWarnings(config: VoiceBotConfig) {
    const texts = [config.openingLine, config.closingLine, config.persona, config.goal, config.rules, ...config.fixedSteps.before.map((step) => step.text), ...config.fixedSteps.after.map((step) => step.text)];
    return [...new Set(texts.flatMap((text) => placeholdersOutsideDetails(text, config.callerDetails)))];
}

async function uniqueActivityTypeName(tenantId: string, base: string, exceptId?: string | null) {
    for (let attempt = 0; attempt < 50; attempt++) {
        const name = attempt === 0 ? base : `${base} (${attempt + 1})`;
        const taken = await queryOne(`select 1 from "ActivityType" where "tenantId" = $1 and name = $2 and ($3::text is null or id <> $3)`, [tenantId, name, exceptId ?? null]);
        if (!taken) return name;
    }
    return `${base} ${randomUUID().slice(0, 6)}`;
}

function cleanName(value: unknown) {
    const name = String(value ?? "").trim().replace(/\s+/g, " ");
    if (name.length < 2 || name.length > 80) throw new Error("VOICE_BOT_NAME_INVALID");
    return name;
}

export async function createVoiceBot(user: TenantUser, input: { name: unknown; config?: unknown }) {
    const tenantId = requireTenantId(user);
    const name = cleanName(input.name);
    if (await queryOne(`select 1 from "VoiceBot" where "tenantId" = $1 and lower(name) = lower($2) and "archivedAt" is null`, [tenantId, name])) throw new Error("VOICE_BOT_NAME_TAKEN");
    const parsed = voiceBotConfigSchema.safeParse({ ...(input.config && typeof input.config === "object" ? input.config : {}) });
    if (!parsed.success) throw new Error("VOICE_BOT_CONFIG_INVALID");
    const objectId = (await queryOne<{ id: string }>(`select id from "ObjectDefinition" where "tenantId" = $1 and name = 'activity' limit 1`, [tenantId]))?.id;
    if (!objectId) throw new Error("VOICE_BOT_ACTIVITY_OBJECT_MISSING");
    const activityTypeId = randomUUID();
    await execute(
        `insert into "ActivityType" (id, "tenantId", "objectId", name, icon, color, "defaultOutcome", "defaultSLA", "order", "isActive", "systemKey", "isSystem", "createdAt", "updatedAt")
         values ($1, $2, $3, $4, 'Bot', '#0e7490', 'SUCCESS', null, 200, true, 'VOICE_BOT', true, now(), now())`,
        [activityTypeId, tenantId, objectId, await uniqueActivityTypeName(tenantId, `Voice bot: ${name}`)],
    );
    const id = randomUUID();
    const row = await queryOne<any>(
        `insert into "VoiceBot" (id, "tenantId", name, status, "activityTypeId", config, "createdBy", "updatedBy") values ($1, $2, $3, 'DRAFT', $4, $5, $6, $6) returning ${BOT_COLUMNS}`,
        [id, tenantId, name, activityTypeId, parsed.data, user.id],
    );
    await createAuditLog(user as any, "CREATE", "VOICE_BOT", id, null, { name }, null).catch(() => undefined);
    return formatBot(row);
}

export async function updateVoiceBot(user: TenantUser, id: string, input: { name?: unknown; config?: unknown; status?: unknown }) {
    const tenantId = requireTenantId(user);
    const bot = await fetchBot(tenantId, id);
    if (!bot || bot.archivedAt) throw new Error("VOICE_BOT_NOT_FOUND");
    let name = bot.name;
    if (input.name !== undefined) {
        name = cleanName(input.name);
        if (name.toLowerCase() !== bot.name.toLowerCase() && await queryOne(`select 1 from "VoiceBot" where "tenantId" = $1 and lower(name) = lower($2) and "archivedAt" is null and id <> $3`, [tenantId, name, id])) throw new Error("VOICE_BOT_NAME_TAKEN");
    }
    let config = bot.config;
    if (input.config !== undefined) {
        const parsed = voiceBotConfigSchema.safeParse({ ...bot.config, ...(input.config && typeof input.config === "object" ? input.config : {}) });
        if (!parsed.success) {
            const error = new Error("VOICE_BOT_CONFIG_INVALID") as Error & { issues?: unknown };
            error.issues = parsed.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message }));
            throw error;
        }
        config = parsed.data;
    }
    let status = bot.status;
    if (input.status !== undefined) {
        if (input.status !== "DRAFT" && input.status !== "LIVE" && input.status !== "PAUSED") throw new Error("VOICE_BOT_STATUS_INVALID");
        status = input.status;
        if (status === "LIVE") {
            const issues = await goLiveIssues(tenantId, { ...bot, config }, 0);
            if (issues.length) throw new Error("VOICE_BOT_NOT_READY");
        }
    }
    const row = await queryOne<any>(
        `update "VoiceBot" set name = $3, config = $4, status = $5, "updatedBy" = $6, "updatedAt" = now() where "tenantId" = $1 and id = $2 returning ${BOT_COLUMNS}`,
        [tenantId, id, name, config, status, user.id],
    );
    if (name !== bot.name && bot.activityTypeId) {
        await execute(`update "ActivityType" set name = $3, "updatedAt" = now() where "tenantId" = $1 and id = $2`, [tenantId, bot.activityTypeId, await uniqueActivityTypeName(tenantId, `Voice bot: ${name}`, bot.activityTypeId)]);
    }
    await createAuditLog(user as any, "UPDATE", "VOICE_BOT", id, { name: bot.name, status: bot.status }, { name, status }, null).catch(() => undefined);
    return getVoiceBot(user, row.id);
}

// Archived bots stop taking calls; their activities stay. Restorable (UI/UX plan pattern D).
export async function archiveVoiceBot(user: TenantUser, id: string) {
    const tenantId = requireTenantId(user);
    const row = await queryOne<{ id: string }>(`update "VoiceBot" set "archivedAt" = now(), status = 'PAUSED', "updatedBy" = $3, "updatedAt" = now() where "tenantId" = $1 and id = $2 and "archivedAt" is null returning id`, [tenantId, id, user.id]);
    if (!row) throw new Error("VOICE_BOT_NOT_FOUND");
    // Numbers it answered go back to people.
    await execute(`update "VoiceBotNumber" set mode = 'OWNER', "botId" = null, "updatedAt" = now() where "tenantId" = $1 and "botId" = $2`, [tenantId, id]);
    await createAuditLog(user as any, "ARCHIVE", "VOICE_BOT", id, null, null, null).catch(() => undefined);
}

export async function restoreVoiceBot(user: TenantUser, id: string) {
    const tenantId = requireTenantId(user);
    const bot = await fetchBot(tenantId, id);
    if (!bot?.archivedAt) throw new Error("VOICE_BOT_NOT_FOUND");
    if (await queryOne(`select 1 from "VoiceBot" where "tenantId" = $1 and lower(name) = lower($2) and "archivedAt" is null`, [tenantId, bot.name])) throw new Error("VOICE_BOT_NAME_TAKEN");
    await execute(`update "VoiceBot" set "archivedAt" = null, status = 'DRAFT', "updatedBy" = $3, "updatedAt" = now() where "tenantId" = $1 and id = $2`, [tenantId, id, user.id]);
    await createAuditLog(user as any, "RESTORE", "VOICE_BOT", id, null, null, null).catch(() => undefined);
}

// ---- Bot fields ----------------------------------------------------------------------------------
const FIELD_TYPES = new Set(["TEXT", "TEXTAREA", "NUMBER", "DROPDOWN", "MULTI_SELECT", "BOOLEAN", "DATE"]);

function slugKey(label: string) {
    const base = label.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40);
    return /^[a-z]/.test(base) ? base : `field_${base || "1"}`;
}

export type BotFieldInput = { label?: unknown; type?: unknown; options?: unknown; question?: unknown; mustAsk?: unknown; confirm?: unknown };

function fieldDefinitionInput(input: BotFieldInput) {
    const label = String(input.label ?? "").trim();
    if (label.length < 1 || label.length > 80) throw new Error("VOICE_BOT_FIELD_LABEL_INVALID");
    const type = String(input.type ?? "TEXT").toUpperCase();
    if (!FIELD_TYPES.has(type)) throw new Error("VOICE_BOT_FIELD_TYPE_INVALID");
    const options = Array.isArray(input.options) ? [...new Set(input.options.map((option) => String(option).trim()).filter(Boolean))].slice(0, 50) : [];
    if ((type === "DROPDOWN" || type === "MULTI_SELECT") && options.length < 2) throw new Error("VOICE_BOT_FIELD_OPTIONS_REQUIRED");
    return { label, type, options };
}

function questionInput(input: BotFieldInput, current?: { question: string; mustAsk: boolean; confirm: boolean }) {
    return {
        question: input.question !== undefined ? String(input.question ?? "").slice(0, 500) : current?.question ?? "",
        mustAsk: input.mustAsk !== undefined ? input.mustAsk === true : current?.mustAsk ?? false,
        confirm: input.confirm !== undefined ? input.confirm === true : current?.confirm ?? false,
    };
}

export async function addVoiceBotField(user: TenantUser, botId: string, input: BotFieldInput) {
    const tenantId = requireTenantId(user);
    const bot = await fetchBot(tenantId, botId);
    if (!bot || bot.archivedAt || !bot.activityTypeId) throw new Error("VOICE_BOT_NOT_FOUND");
    const definition = fieldDefinitionInput(input);
    const existing = await botFields(tenantId, bot);
    if (existing.length >= 40) throw new Error("VOICE_BOT_FIELD_LIMIT");
    let key = slugKey(definition.label);
    for (let suffix = 2; existing.some((field) => field.key === key); suffix++) key = `${slugKey(definition.label)}_${suffix}`;
    const created = await createCustomFieldForTenant(user as any, {
        objectType: "ACTIVITY", key, label: definition.label, type: definition.type, options: definition.options,
        entityType: "ACTIVITY_TYPE", entityTypeId: bot.activityTypeId, order: existing.length + 1,
    });
    const config = { ...bot.config, fieldQuestions: { ...bot.config.fieldQuestions, [key]: questionInput(input) } };
    await execute(`update "VoiceBot" set config = $3, "updatedBy" = $4, "updatedAt" = now() where "tenantId" = $1 and id = $2`, [tenantId, botId, config, user.id]);
    return created;
}

export async function updateVoiceBotField(user: TenantUser, botId: string, fieldId: string, input: BotFieldInput) {
    const tenantId = requireTenantId(user);
    const bot = await fetchBot(tenantId, botId);
    if (!bot || bot.archivedAt) throw new Error("VOICE_BOT_NOT_FOUND");
    const field = (await botFields(tenantId, bot)).find((item) => item.id === fieldId);
    if (!field) throw new Error("VOICE_BOT_FIELD_NOT_FOUND");
    if (input.label !== undefined || input.type !== undefined || input.options !== undefined) {
        const definition = fieldDefinitionInput({ label: input.label ?? field.label, type: input.type ?? field.type, options: input.options ?? field.options });
        await updateCustomFieldForTenant(user as any, fieldId, { label: definition.label, type: definition.type, options: definition.options });
    }
    const config = { ...bot.config, fieldQuestions: { ...bot.config.fieldQuestions, [field.key]: questionInput(input, bot.config.fieldQuestions[field.key]) } };
    await execute(`update "VoiceBot" set config = $3, "updatedBy" = $4, "updatedAt" = now() where "tenantId" = $1 and id = $2`, [tenantId, botId, config, user.id]);
}

export async function deleteVoiceBotField(user: TenantUser, botId: string, fieldId: string) {
    const tenantId = requireTenantId(user);
    const bot = await fetchBot(tenantId, botId);
    if (!bot || bot.archivedAt) throw new Error("VOICE_BOT_NOT_FOUND");
    const field = (await botFields(tenantId, bot)).find((item) => item.id === fieldId);
    if (!field) throw new Error("VOICE_BOT_FIELD_NOT_FOUND");
    await deleteCustomFieldForTenant(user as any, fieldId);
    // The field's question, mappings and fixed-step links go with it.
    const { [field.key]: _removed, ...fieldQuestions } = bot.config.fieldQuestions;
    void _removed;
    const unlink = (steps: VoiceBotConfig["fixedSteps"]["before"]) => steps.map((step) => (step.fieldKey === field.key ? { ...step, fieldKey: null } : step));
    const config = {
        ...bot.config, fieldQuestions,
        mappings: bot.config.mappings.filter((mapping) => mapping.fieldKey !== field.key),
        fixedSteps: { before: unlink(bot.config.fixedSteps.before), after: unlink(bot.config.fixedSteps.after) },
    };
    await execute(`update "VoiceBot" set config = $3, "updatedBy" = $4, "updatedAt" = now() where "tenantId" = $1 and id = $2`, [tenantId, botId, config, user.id]);
}

// ---- Caller details, mapping targets, placeholder preview --------------------------------------
async function customFieldsOf(tenantId: string, objectName: "lead" | "opportunity") {
    return query<{ key: string; label: string; entityTypeId: string | null }>(
        `select fd.key, fd.label, fd."entityTypeId" from "FieldDefinition" fd join "ObjectDefinition" od on od.id = fd."objectId" and od."tenantId" = fd."tenantId"
         where fd."tenantId" = $1 and od.name = $2 and fd."isCustom" = true and fd."isActive" = true and fd."deletedAt" is null
         order by fd."order" asc, fd."createdAt" asc`,
        [tenantId, objectName],
    );
}

const STANDARD_KEYS = new Set<string>([...STANDARD_CALLER_DETAILS.map((item) => item.key), ...STANDARD_MAPPING_TARGETS.map((item) => item.key)]);

// Every field a bot can be given (caller details) and every field an answer can be copied to.
export async function voiceBotFieldCatalog(user: TenantUser) {
    const tenantId = requireTenantId(user);
    const [leadFields, opportunityFields] = await Promise.all([customFieldsOf(tenantId, "lead"), customFieldsOf(tenantId, "opportunity")]);
    const custom = [
        ...leadFields.map((field) => ({ key: `lead.${field.key}`, label: field.label, group: "Lead · custom" })),
        ...opportunityFields.map((field) => ({ key: `opportunity.${field.key}`, label: field.label, group: field.entityTypeId ? "Opportunity type · custom" : "Opportunity · custom" })),
    ].filter((field) => !STANDARD_KEYS.has(field.key));
    return {
        callerDetails: [...STANDARD_CALLER_DETAILS.map((item) => ({ ...item })), ...custom],
        mappingTargets: [...STANDARD_MAPPING_TARGETS.map((item) => ({ ...item, group: item.key.startsWith("lead.") ? "Lead" : "Opportunity" })), ...custom],
    };
}

const firstName = (name: unknown) => String(name ?? "").trim().split(/\s+/)[0] ?? "";

// The caller details of a lead (and its opportunity, per the bot's setting) or an opportunity, as
// the record's own values, limited to what the bot was given and what the user may see.
export async function resolveCallerDetails(user: TenantUser, config: VoiceBotConfig, target: { leadId?: string | null; opportunityId?: string | null }) {
    let lead: any = null;
    let opportunity: any = null;
    if (target.opportunityId) {
        opportunity = await getOpportunityForTenant(user as any, target.opportunityId);
        if (!opportunity) throw new Error("VOICE_BOT_RECORD_NOT_FOUND");
        lead = opportunity.leadId ? await getLeadForTenant(user as any, opportunity.leadId) : null;
    } else if (target.leadId) {
        lead = await getLeadForTenant(user as any, target.leadId);
        if (!lead) throw new Error("VOICE_BOT_RECORD_NOT_FOUND");
        if (config.opportunityChoice.mode !== "NONE") {
            const typeId = config.opportunityChoice.mode === "LATEST_OF_TYPE" ? config.opportunityChoice.typeId : null;
            const page = await listOpportunitiesForTenantByType(user as any, 20, typeId, [{ logic: "AND", conditions: [{ field: "leadId", operator: "equals", value: lead.id }] }] as any, 1, { sort: { id: "updatedAt", desc: true } } as any);
            const open = (page.data ?? []).filter((item: any) => !item.stage?.isClosed && !item.stage?.isWon);
            opportunity = (config.opportunityChoice.mode === "LATEST_OPEN" ? open : page.data ?? [])[0] ?? null;
        }
    }
    const owner = (lead?.ownerName || opportunity?.ownerName) ?? null;
    const all: Record<string, unknown> = {
        "lead.name": lead?.name, "lead.firstName": firstName(lead?.name), "lead.phone": lead?.phone, "lead.email": lead?.email,
        "lead.company": lead?.company, "lead.source": lead?.source, "lead.status": lead?.status,
        "opportunity.title": opportunity?.title, "opportunity.type": opportunity?.opportunityType?.name, "opportunity.stage": opportunity?.stage?.name,
        "opportunity.amount": opportunity?.amount, "opportunity.expectedCloseDate": opportunity?.expectedCloseDate,
        "owner.name": owner, "owner.firstName": firstName(owner),
    };
    for (const [key, value] of Object.entries(lead?.customFields ?? {})) if (!(`lead.${key}` in all)) all[`lead.${key}`] = value;
    for (const [key, value] of Object.entries(opportunity?.customFields ?? {})) if (!(`opportunity.${key}` in all)) all[`opportunity.${key}`] = value;
    const allowed = new Set(config.callerDetails);
    return {
        values: Object.fromEntries(Object.entries(all).filter(([key, value]) => allowed.has(key) && value !== null && value !== undefined && value !== "")),
        record: { leadId: lead?.id ?? null, leadName: lead?.name ?? null, opportunityId: opportunity?.id ?? null, opportunityTitle: opportunity?.title ?? null },
    };
}

// The bot's lines as a caller would hear them, filled from a real record.
export async function previewVoiceBot(user: TenantUser, configInput: unknown, target: { leadId?: string | null; opportunityId?: string | null }) {
    const parsed = voiceBotConfigSchema.safeParse(configInput ?? {});
    if (!parsed.success) throw new Error("VOICE_BOT_CONFIG_INVALID");
    const config = parsed.data;
    const { values, record } = await resolveCallerDetails(user, config, target);
    return {
        record,
        details: values,
        openingLine: renderPlaceholders(config.openingLine, values),
        closingLine: renderPlaceholders(config.closingLine, values),
        steps: [...config.fixedSteps.before, ...config.fixedSteps.after].map((step) => ({ id: step.id, text: renderPlaceholders(step.text, values) })),
    };
}

// ---- Numbers -------------------------------------------------------------------------------------
type PlivoConfigLike = { provider?: string; plivoAuthId?: string; plivoAuthTokenEncrypted?: string; inboundNumber?: string; outboundCallerId?: string };

// The Plivo account's numbers, each with who answers it (people, a bot, or people then a bot).
export async function listVoiceBotNumbers(user: TenantUser) {
    const tenantId = requireTenantId(user);
    const setting = await queryOne<{ config: PlivoConfigLike; isActive: boolean }>(`select config, "isActive" from "IntegrationSetting" where "tenantId" = $1 and type = 'TELEPHONY'`, [tenantId]);
    const saved = await query<{ number: string; mode: string; botId: string | null }>(`select number, mode, "botId" from "VoiceBotNumber" where "tenantId" = $1`, [tenantId]);
    const savedByNumber = new Map(saved.map((row) => [row.number, row]));
    let numbers: Array<{ number: string; alias: string | null; voiceEnabled: boolean }> = [];
    let source: "plivo" | "saved" | "none" = "none";
    let error: string | null = null;
    const config = setting?.config;
    if (String(config?.provider ?? "").toLowerCase() === "plivo" && config?.plivoAuthId && config.plivoAuthTokenEncrypted) {
        try {
            const authId = config.plivoAuthId;
            const response = await fetch(`https://api.plivo.com/v1/Account/${encodeURIComponent(authId)}/Number/?limit=100`, {
                headers: { Authorization: `Basic ${Buffer.from(`${authId}:${decryptSecretAtRest(config.plivoAuthTokenEncrypted)}`).toString("base64")}` },
                signal: AbortSignal.timeout(10000),
            });
            if (!response.ok) throw new Error(String(response.status));
            const body = await response.json();
            numbers = (body?.objects ?? []).map((item: any) => ({ number: `+${String(item.number).replace(/\D/g, "")}`, alias: item.alias ? String(item.alias) : null, voiceEnabled: item.voice_enabled !== false }));
            source = "plivo";
        } catch {
            error = "Plivo's number list couldn't be loaded; showing the numbers saved here.";
        }
    }
    if (source !== "plivo") {
        const known = new Set<string>([...saved.map((row) => row.number), config?.inboundNumber, config?.outboundCallerId].filter(Boolean) as string[]);
        numbers = [...known].map((number) => ({ number, alias: null, voiceEnabled: true }));
        source = numbers.length ? "saved" : "none";
    }
    return {
        source,
        error,
        numbers: numbers.map((item) => ({ ...item, mode: (savedByNumber.get(item.number)?.mode ?? "OWNER") as "BOT" | "OWNER" | "OWNER_THEN_BOT", botId: savedByNumber.get(item.number)?.botId ?? null })),
    };
}

export async function setVoiceBotNumber(user: TenantUser, number: string, input: { mode: unknown; botId?: unknown }) {
    const tenantId = requireTenantId(user);
    if (!/^\+\d{8,15}$/.test(number)) throw new Error("VOICE_BOT_NUMBER_INVALID");
    const mode = String(input.mode ?? "");
    if (mode !== "BOT" && mode !== "OWNER" && mode !== "OWNER_THEN_BOT") throw new Error("VOICE_BOT_NUMBER_MODE_INVALID");
    const botId = mode === "OWNER" ? null : String(input.botId ?? "");
    if (mode !== "OWNER") {
        const bot = await queryOne(`select 1 from "VoiceBot" where "tenantId" = $1 and id = $2 and "archivedAt" is null`, [tenantId, botId]);
        if (!bot) throw new Error("VOICE_BOT_NUMBER_BOT_REQUIRED");
    }
    await execute(
        `insert into "VoiceBotNumber" (id, "tenantId", number, mode, "botId", "updatedBy", "updatedAt") values ($1, $2, $3, $4, $5, $6, now())
         on conflict ("tenantId", number) do update set mode = excluded.mode, "botId" = excluded."botId", "updatedBy" = excluded."updatedBy", "updatedAt" = now()`,
        [randomUUID(), tenantId, number, mode, botId, user.id],
    );
    await createAuditLog(user as any, "UPDATE", "VOICE_BOT_NUMBER", number, null, { mode, botId }, null).catch(() => undefined);
}

// ---- Holidays ------------------------------------------------------------------------------------
export async function listVoiceBotHolidays(user: TenantUser) {
    const tenantId = requireTenantId(user);
    return query<{ id: string; date: string; label: string | null }>(`select id, to_char("date", 'YYYY-MM-DD') as date, label from "VoiceBotHoliday" where "tenantId" = $1 order by "date"`, [tenantId]);
}

export async function addVoiceBotHoliday(user: TenantUser, input: { date: unknown; label?: unknown }) {
    const tenantId = requireTenantId(user);
    const date = String(input.date ?? "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(new Date(`${date}T00:00:00Z`).getTime())) throw new Error("VOICE_BOT_HOLIDAY_INVALID");
    const label = String(input.label ?? "").trim().slice(0, 80) || null;
    const row = await queryOne<{ id: string }>(
        `insert into "VoiceBotHoliday" (id, "tenantId", "date", label) values ($1, $2, $3, $4) on conflict ("tenantId", "date") do update set label = excluded.label returning id`,
        [randomUUID(), tenantId, date, label],
    );
    return row;
}

export async function deleteVoiceBotHoliday(user: TenantUser, id: string) {
    const tenantId = requireTenantId(user);
    await execute(`delete from "VoiceBotHoliday" where "tenantId" = $1 and id = $2`, [tenantId, id]);
}

// ---- Claude bot-builder helper (decision 30) ----------------------------------------------------
const DRAFT_TOOL = {
    name: "draft_voice_bot",
    description: "Return a complete first draft of a phone voice bot for an Indian education CRM.",
    input_schema: {
        type: "object",
        properties: {
            persona: { type: "string", description: "Who the bot is and how it speaks (warm, brief, Indian context). 2-4 sentences." },
            goal: { type: "string", description: "What a successful call achieves. 1-3 sentences." },
            rules: { type: "string", description: "Numbered rules the bot must follow on every call." },
            openingLine: { type: "string", description: "First thing the bot says. May use placeholders such as {{lead.firstName|there}}." },
            closingLine: { type: "string", description: "How the bot ends a call politely." },
            endRule: { type: "string", description: "When to end the call." },
            transferRule: { type: "string", description: "When to transfer the caller to a person." },
            fields: {
                type: "array",
                maxItems: 12,
                items: {
                    type: "object",
                    properties: {
                        label: { type: "string" },
                        type: { type: "string", enum: ["TEXT", "NUMBER", "DROPDOWN", "BOOLEAN", "DATE"] },
                        options: { type: "array", items: { type: "string" } },
                        question: { type: "string", description: "How the bot asks for it, naturally." },
                        mustAsk: { type: "boolean" },
                        confirm: { type: "boolean", description: "True for names, numbers and dates the bot should repeat back." },
                    },
                    required: ["label", "type", "question", "mustAsk", "confirm"],
                },
            },
        },
        required: ["persona", "goal", "rules", "openingLine", "closingLine", "endRule", "transferRule", "fields"],
    },
};

export async function draftVoiceBotWithClaude(user: TenantUser, input: { description: unknown; callerDetails?: string[] }) {
    const tenantId = requireTenantId(user);
    const description = String(input.description ?? "").trim();
    if (description.length < 10 || description.length > 2000) throw new Error("VOICE_BOT_DRAFT_DESCRIPTION_INVALID");
    const details = (input.callerDetails ?? DEFAULT_VOICE_BOT_CONFIG.callerDetails).join(", ");
    const response = await callClaude(tenantId, {
        model: "claude-sonnet-5-5",
        maxTokens: 3000,
        system: [
            "You design phone voice bots for an Indian education and admissions CRM. Callers speak Hindi, English or Hinglish.",
            "Write for speech, not text: short sentences, no lists or symbols in what the bot says, no promises the bot can't keep.",
            "The bot only states facts from its knowledge base or the caller's details; otherwise it offers to have a counsellor confirm.",
            `Placeholders available for this bot: ${details}. Use them as {{lead.name}}, with a fallback like {{lead.firstName|there}}.`,
        ].join("\n"),
        messages: [{ role: "user", content: `Draft a voice bot for this purpose:\n\n${description}` }],
        tools: [DRAFT_TOOL],
        toolChoice: { type: "tool", name: DRAFT_TOOL.name },
    });
    const draft = response.content.find((part) => part.type === "tool_use")?.input;
    if (!draft || typeof draft !== "object") throw new Error("CLAUDE_FAILED");
    const fields = (Array.isArray(draft.fields) ? draft.fields : []).slice(0, 12).map((field: any) => ({
        label: String(field.label ?? "").slice(0, 80),
        type: FIELD_TYPES.has(String(field.type)) ? String(field.type) : "TEXT",
        options: Array.isArray(field.options) ? field.options.map(String).slice(0, 50) : [],
        question: String(field.question ?? "").slice(0, 500),
        mustAsk: field.mustAsk === true,
        confirm: field.confirm === true,
    })).filter((field: any) => field.label && (!["DROPDOWN"].includes(field.type) || field.options.length >= 2));
    const clip = (value: unknown, max: number) => String(value ?? "").slice(0, max);
    return {
        persona: clip(draft.persona, 4000), goal: clip(draft.goal, 2000), rules: clip(draft.rules, 6000),
        openingLine: clip(draft.openingLine, 600), closingLine: clip(draft.closingLine, 600), endRule: clip(draft.endRule, 1000),
        transferRule: clip(draft.transferRule, 1000), fields,
    };
}

// Live bots someone with "use" can start calls with (detail pages, selection bars, automations).
export async function listCallableVoiceBots(user: TenantUser) {
    const tenantId = requireTenantId(user);
    const rows = await query<{ id: string; name: string; config: any }>(
        `select id, name, config from "VoiceBot" where "tenantId" = $1 and status = 'LIVE' and "archivedAt" is null order by lower(name)`, [tenantId],
    );
    return rows.map((row) => {
        const config = normalizeConfig(row.config);
        return { id: row.id, name: row.name, description: config.description, calling: config.calling, dailyLimit: config.dailyLimit, retries: config.retries.attempts };
    });
}

// Lead sources in use, most common first, for choosing which new enquiries a bot calls.
export async function voiceBotLeadSources(user: TenantUser) {
    const tenantId = requireTenantId(user);
    const rows = await query<{ source: string; count: number }>(
        `select trim(source) as source, count(*)::int as count from "Lead"
         where "tenantId" = $1 and "deletedAt" is null and nullif(trim(source), '') is not null and lower(trim(source)) <> 'voice bot (inbound)'
         group by trim(source) order by count(*) desc, trim(source) limit 60`,
        [tenantId],
    );
    return rows;
}
