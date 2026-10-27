import { createHash, randomUUID } from "crypto";
import { execute, executeAsSystem, query, queryAsSystem, queryOne, queryOneAsSystem } from "@/lib/db/query";
import { withTransaction } from "@/lib/db/transaction";
import { getEffectiveModuleStates } from "@/lib/server/module-entitlements";
import { assertSafeOutboundUrl } from "@/lib/server/outbound-request-guard";
import { callVoiceBotService } from "@/lib/server/voice-bot-service";
import { callClaude, providerKey } from "@/lib/server/voice-providers";
import { deletePrivateFile, readPrivateFile, writePrivateFile } from "@/lib/storage/file-storage";
import { requireTenantId } from "@/lib/server/tenant-guard";

// A voice bot's knowledge (voice bot plan wave D, decisions 5 and 30). Sources are written Q&A,
// uploaded documents (PDF, Word, text), web pages (fetched again daily) and catalogue programs
// (kept in step with the catalogue). The bot service reads documents and pages, splits the text
// into passages and gives each a vector; the passages are handed to the service with each call,
// and searched there. Website and document text can first be tidied into plain facts by Claude.

type TenantUser = { id: string; tenantId: string | null };
export type KnowledgeKind = "QA" | "DOCUMENT" | "WEBSITE" | "CATALOG";

export const KNOWLEDGE_LIMITS = {
    sourcesPerBot: 200,
    passagesPerBot: 3000,
    documentBytes: 10 * 1024 * 1024,
    pageBytes: 3 * 1024 * 1024,
    questionChars: 500,
    answerChars: 4000,
    tidyInputChars: 60_000,
};
export const DOCUMENT_TYPES: Record<string, "pdf" | "docx" | "text"> = {
    "application/pdf": "pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
    "text/plain": "text",
    "text/markdown": "text",
};

const SOURCE_COLUMNS = `id, kind, title, status, error, question, answer, url, "fileName", "fileType", "fileSize", "programIds", "tidyWithClaude", "chunkCount", "refreshedAt", "createdAt", "updatedAt"`;

function formatSource(row: any) {
    return { ...row, programIds: Array.isArray(row.programIds) ? row.programIds : [] };
}

async function botExists(tenantId: string, botId: string) {
    const bot = await queryOne<{ id: string }>(`select id from "VoiceBot" where "tenantId" = $1 and id = $2 and "archivedAt" is null`, [tenantId, botId]);
    if (!bot) throw new Error("VOICE_BOT_NOT_FOUND");
}

async function sourceCount(tenantId: string, botId: string) {
    const row = await queryOne<{ count: number }>(`select count(*)::int as count from "VoiceBotKnowledgeSource" where "tenantId" = $1 and "botId" = $2`, [tenantId, botId]);
    if ((row?.count ?? 0) >= KNOWLEDGE_LIMITS.sourcesPerBot) throw new Error("VOICE_BOT_KNOWLEDGE_LIMIT");
}

export async function listKnowledge(user: TenantUser, botId: string) {
    const tenantId = requireTenantId(user);
    await botExists(tenantId, botId);
    const sources = await query<any>(`select ${SOURCE_COLUMNS} from "VoiceBotKnowledgeSource" where "tenantId" = $1 and "botId" = $2 order by "createdAt" asc`, [tenantId, botId]);
    const catalogOn = (await getEffectiveModuleStates(tenantId)).states.PRODUCT_CATALOG === true;
    const claudeReady = !!(await providerKey(tenantId, "claude"));
    return {
        sources: sources.map(formatSource),
        passages: sources.reduce((total, source) => total + Number(source.chunkCount ?? 0), 0),
        limits: { sources: KNOWLEDGE_LIMITS.sourcesPerBot, passages: KNOWLEDGE_LIMITS.passagesPerBot, documentMb: KNOWLEDGE_LIMITS.documentBytes / 1024 / 1024 },
        catalogAvailable: catalogOn,
        claudeAvailable: claudeReady,
    };
}

export async function getKnowledgeSource(user: TenantUser, botId: string, sourceId: string) {
    const tenantId = requireTenantId(user);
    const row = await queryOne<any>(`select ${SOURCE_COLUMNS}, content from "VoiceBotKnowledgeSource" where "tenantId" = $1 and "botId" = $2 and id = $3`, [tenantId, botId, sourceId]);
    if (!row) throw new Error("VOICE_BOT_KNOWLEDGE_NOT_FOUND");
    const passages = await query<{ position: number; text: string; language: string | null }>(
        `select position, text, language from "VoiceBotKnowledgeChunk" where "tenantId" = $1 and "sourceId" = $2 order by position limit 200`,
        [tenantId, sourceId],
    );
    return { ...formatSource(row), passages };
}

// ---- Adding sources ---------------------------------------------------------------------------------
function cleanText(value: unknown, max: number) {
    return typeof value === "string" ? value.replace(/\r/g, "").trim().slice(0, max) : "";
}

export async function addQa(user: TenantUser, botId: string, input: { question?: unknown; answer?: unknown }) {
    const tenantId = requireTenantId(user);
    await botExists(tenantId, botId);
    await sourceCount(tenantId, botId);
    const question = cleanText(input.question, KNOWLEDGE_LIMITS.questionChars);
    const answer = cleanText(input.answer, KNOWLEDGE_LIMITS.answerChars);
    if (question.length < 3 || answer.length < 1) throw new Error("VOICE_BOT_KNOWLEDGE_QA_INVALID");
    const id = randomUUID();
    await execute(
        `insert into "VoiceBotKnowledgeSource" (id, "tenantId", "botId", kind, title, status, question, answer, "createdBy") values ($1, $2, $3, 'QA', $4, 'PROCESSING', $5, $6, $7)`,
        [id, tenantId, botId, question.slice(0, 200), question, answer, user.id],
    );
    await processKnowledgeSource(tenantId, id);
    return id;
}

export async function updateQa(user: TenantUser, botId: string, sourceId: string, input: { question?: unknown; answer?: unknown }) {
    const tenantId = requireTenantId(user);
    const question = cleanText(input.question, KNOWLEDGE_LIMITS.questionChars);
    const answer = cleanText(input.answer, KNOWLEDGE_LIMITS.answerChars);
    if (question.length < 3 || answer.length < 1) throw new Error("VOICE_BOT_KNOWLEDGE_QA_INVALID");
    const updated = await queryOne<{ id: string }>(
        `update "VoiceBotKnowledgeSource" set question = $4, answer = $5, title = $6, status = 'PROCESSING', error = null, "updatedAt" = now()
         where "tenantId" = $1 and "botId" = $2 and id = $3 and kind = 'QA' returning id`,
        [tenantId, botId, sourceId, question, answer, question.slice(0, 200)],
    );
    if (!updated) throw new Error("VOICE_BOT_KNOWLEDGE_NOT_FOUND");
    await processKnowledgeSource(tenantId, sourceId);
}

export function normalizeWebsiteUrl(value: unknown) {
    const raw = typeof value === "string" ? value.trim() : "";
    try {
        const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
        if (!["http:", "https:"].includes(url.protocol) || !url.hostname.includes(".") || url.username || url.password) throw new Error();
        url.hash = "";
        return url.toString();
    } catch {
        throw new Error("VOICE_BOT_KNOWLEDGE_URL_INVALID");
    }
}

// Returns the new source's id; the route processes it after answering (it can take a while).
export async function addWebsite(user: TenantUser, botId: string, input: { url?: unknown; tidyWithClaude?: unknown }) {
    const tenantId = requireTenantId(user);
    await botExists(tenantId, botId);
    await sourceCount(tenantId, botId);
    const url = normalizeWebsiteUrl(input.url);
    await assertSafeOutboundUrl(url).catch((error: Error) => { throw new Error(error.message.includes("resolved") ? "VOICE_BOT_KNOWLEDGE_URL_NOT_FOUND" : "VOICE_BOT_KNOWLEDGE_URL_UNSAFE"); });
    const id = randomUUID();
    await execute(
        `insert into "VoiceBotKnowledgeSource" (id, "tenantId", "botId", kind, title, status, url, "tidyWithClaude", "createdBy") values ($1, $2, $3, 'WEBSITE', $4, 'PROCESSING', $5, $6, $7)`,
        [id, tenantId, botId, new URL(url).hostname + new URL(url).pathname.replace(/\/$/, ""), url, input.tidyWithClaude === true, user.id],
    );
    return id;
}

export async function addDocument(user: TenantUser, botId: string, file: { name: string; type: string; bytes: Buffer }, tidyWithClaude: boolean) {
    const tenantId = requireTenantId(user);
    await botExists(tenantId, botId);
    await sourceCount(tenantId, botId);
    const lowerName = file.name.toLowerCase();
    const fileType = DOCUMENT_TYPES[file.type] ?? (lowerName.endsWith(".pdf") ? "pdf" : lowerName.endsWith(".docx") ? "docx" : lowerName.endsWith(".txt") || lowerName.endsWith(".md") ? "text" : null);
    if (!fileType) throw new Error("VOICE_BOT_KNOWLEDGE_FILE_TYPE");
    if (!file.bytes.length || file.bytes.length > KNOWLEDGE_LIMITS.documentBytes) throw new Error("VOICE_BOT_KNOWLEDGE_FILE_SIZE");
    const id = randomUUID();
    const safeName = file.name.replace(/[^\w.\- ]+/g, "_").slice(-120) || `document.${fileType}`;
    const stored = await writePrivateFile(`voice-bot-knowledge/${tenantId}/${id}/${safeName}`, file.bytes, { contentType: file.type || null });
    await execute(
        `insert into "VoiceBotKnowledgeSource" (id, "tenantId", "botId", kind, title, status, "fileKey", "fileName", "fileType", "fileSize", "tidyWithClaude", "createdBy")
         values ($1, $2, $3, 'DOCUMENT', $4, 'PROCESSING', $5, $6, $7, $8, $9, $10)`,
        [id, tenantId, botId, file.name.slice(0, 200), stored.storageKey, file.name.slice(0, 200), fileType, file.bytes.length, tidyWithClaude, user.id],
    );
    return id;
}

// One catalogue source per bot: the ticked programs, kept in step with the catalogue.
export async function setCatalogPrograms(user: TenantUser, botId: string, programIds: unknown) {
    const tenantId = requireTenantId(user);
    await botExists(tenantId, botId);
    if (!(await getEffectiveModuleStates(tenantId)).states.PRODUCT_CATALOG) throw new Error("VOICE_BOT_KNOWLEDGE_CATALOG_OFF");
    const ids = [...new Set((Array.isArray(programIds) ? programIds : []).filter((id): id is string => typeof id === "string"))].slice(0, 200);
    const known = ids.length ? (await query<{ id: string }>(`select id from "Program" where "tenantId" = $1 and id = any($2)`, [tenantId, ids])).map((row) => row.id) : [];
    const existing = await queryOne<{ id: string }>(`select id from "VoiceBotKnowledgeSource" where "tenantId" = $1 and "botId" = $2 and kind = 'CATALOG'`, [tenantId, botId]);
    if (!known.length) {
        if (existing) await deleteKnowledgeSource(user, botId, existing.id);
        return null;
    }
    if (existing) {
        await execute(`update "VoiceBotKnowledgeSource" set "programIds" = $3, status = 'PROCESSING', error = null, "contentHash" = null, "updatedAt" = now() where "tenantId" = $1 and id = $2`, [tenantId, existing.id, JSON.stringify(known)]);
        return existing.id;
    }
    await sourceCount(tenantId, botId);
    const id = randomUUID();
    await execute(
        `insert into "VoiceBotKnowledgeSource" (id, "tenantId", "botId", kind, title, status, "programIds", "createdBy") values ($1, $2, $3, 'CATALOG', 'Catalogue programs', 'PROCESSING', $4, $5)`,
        [id, tenantId, botId, JSON.stringify(known), user.id],
    );
    return id;
}

export async function catalogProgramsForPicker(user: TenantUser) {
    const tenantId = requireTenantId(user);
    return query<{ id: string; name: string; university: string; level: string }>(
        `select p.id, p.name, u.name as university, p.level from "Program" p join "University" u on u.id = p."universityId"
         where p."tenantId" = $1 and p."isActive" and u."isActive" order by u.name, p."order", p.name limit 500`,
        [tenantId],
    );
}

// Marks a source for processing again (web pages and the catalogue are also refreshed daily).
export async function markForRefresh(user: TenantUser, botId: string, sourceId: string) {
    const tenantId = requireTenantId(user);
    const row = await queryOne<{ id: string }>(
        `update "VoiceBotKnowledgeSource" set status = 'PROCESSING', error = null, "contentHash" = null, "updatedAt" = now()
         where "tenantId" = $1 and "botId" = $2 and id = $3 returning id`,
        [tenantId, botId, sourceId],
    );
    if (!row) throw new Error("VOICE_BOT_KNOWLEDGE_NOT_FOUND");
}

export async function deleteKnowledgeSource(user: TenantUser, botId: string, sourceId: string) {
    const tenantId = requireTenantId(user);
    const row = await queryOne<{ fileKey: string | null }>(`delete from "VoiceBotKnowledgeSource" where "tenantId" = $1 and "botId" = $2 and id = $3 returning "fileKey"`, [tenantId, botId, sourceId]);
    if (!row) throw new Error("VOICE_BOT_KNOWLEDGE_NOT_FOUND");
    if (row.fileKey) await deletePrivateFile(row.fileKey).catch(() => undefined);
}

// ---- Turning a source into passages -------------------------------------------------------------------
// Fetches a public web page, checking every redirect against the outbound guard.
export async function fetchPublicPage(startUrl: string) {
    let url = startUrl;
    for (let hop = 0; hop < 5; hop++) {
        await assertSafeOutboundUrl(url);
        const response = await fetch(url, {
            redirect: "manual",
            headers: { "user-agent": "UnnatifyCRM-VoiceBot/1.0 (knowledge refresh)", accept: "text/html,text/plain;q=0.9" },
            signal: AbortSignal.timeout(15_000),
        });
        if (response.status >= 300 && response.status < 400 && response.headers.get("location")) {
            url = new URL(response.headers.get("location")!, url).toString();
            continue;
        }
        if (!response.ok) throw Object.assign(new Error("VOICE_BOT_KNOWLEDGE_PAGE_FAILED"), { detail: `The page answered ${response.status}.` });
        const type = (response.headers.get("content-type") ?? "").toLowerCase();
        if (!type.includes("text/html") && !type.includes("text/plain")) throw Object.assign(new Error("VOICE_BOT_KNOWLEDGE_PAGE_FAILED"), { detail: "The address isn't a web page or text." });
        const reader = response.body?.getReader();
        const chunks: Buffer[] = [];
        let size = 0;
        while (reader) {
            const { done, value } = await reader.read();
            if (done) break;
            size += value.length;
            if (size > KNOWLEDGE_LIMITS.pageBytes) {
                await reader.cancel();
                break;
            }
            chunks.push(Buffer.from(value));
        }
        return { body: Buffer.concat(chunks).toString("utf8"), html: type.includes("text/html"), finalUrl: url };
    }
    throw Object.assign(new Error("VOICE_BOT_KNOWLEDGE_PAGE_FAILED"), { detail: "The page redirects too many times." });
}

const money = (value: unknown, currency = "INR") => {
    const amount = Number(value ?? 0);
    if (!amount) return null;
    return currency === "INR" ? `₹${amount.toLocaleString("en-IN")}` : `${currency} ${amount.toLocaleString("en-US")}`;
};

// Plain sentences about each ticked program, one paragraph per topic, each naming the program so
// a passage found on its own still says what it's about.
export async function catalogText(tenantId: string, programIds: string[]) {
    if (!programIds.length) return "";
    const programs = await queryAsSystem<any>(
        `select p.id, p.name, p.level, p."durationMonths", p.description, u.name as university, u.city as "universityCity"
         from "Program" p join "University" u on u.id = p."universityId" where p."tenantId" = $1 and p.id = any($2) and p."isActive" order by u.name, p.name`,
        [tenantId, programIds],
    );
    const paragraphs: string[] = [];
    for (const program of programs) {
        const label = `${program.name} (${program.university})`;
        const level = String(program.level ?? "").toLowerCase();
        paragraphs.push(`${label}: a ${level} program${program.durationMonths ? ` of ${program.durationMonths} months` : ""} at ${program.university}${program.universityCity ? `, ${program.universityCity}` : ""}.${program.description ? ` ${String(program.description).trim()}` : ""}`);
        const courses = await queryAsSystem<any>(
            `select c.name, c.description, coalesce(string_agg(s.name, ', ' order by s."order", s.name) filter (where s.id is not null), '') as specializations
             from "Course" c left join "Specialization" s on s."courseId" = c.id and s."isActive" where c."tenantId" = $1 and c."programId" = $2 and c."isActive" group by c.id order by c."order", c.name`,
            [tenantId, program.id],
        );
        if (courses.length) paragraphs.push(`${label} courses: ${courses.map((course) => `${course.name}${course.specializations ? ` (specialisations: ${course.specializations})` : ""}${course.description ? ` – ${course.description}` : ""}`).join("; ")}.`);
        const intakes = await queryAsSystem<any>(
            // Dates as text: a date read as a JavaScript Date lands at local midnight, and would
            // print as the day before in other time zones.
            `select i.name, i."startDate"::text as "startDate", i."applicationDeadline"::text as "applicationDeadline", c.name as campus from "Intake" i left join "Campus" c on c.id = i."campusId"
             where i."tenantId" = $1 and i."programId" = $2 and i."isActive" order by i."startDate" nulls last`,
            [tenantId, program.id],
        );
        const day = (value: unknown) => (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
            ? new Date(`${value}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })
            : null);
        if (intakes.length) paragraphs.push(`${label} intakes: ${intakes.map((intake) => [intake.name, intake.campus ? `at ${intake.campus}` : null, day(intake.startDate) ? `starts ${day(intake.startDate)}` : null, day(intake.applicationDeadline) ? `apply by ${day(intake.applicationDeadline)}` : null].filter(Boolean).join(", ")).join("; ")}.`);
        const fees = await queryAsSystem<any>(
            `select f.name, f.currency, f."applicationFee", f."admissionFee", f."tuitionFeeTotal", f."otherFees", i.name as intake
             from "FeePlan" f left join "Intake" i on i.id = f."intakeId" where f."tenantId" = $1 and f."programId" = $2 and f."isActive" order by f.name`,
            [tenantId, program.id],
        );
        for (const fee of fees) {
            const parts = [
                money(fee.tuitionFeeTotal, fee.currency) ? `total tuition ${money(fee.tuitionFeeTotal, fee.currency)}` : null,
                money(fee.applicationFee, fee.currency) ? `application fee ${money(fee.applicationFee, fee.currency)}` : null,
                money(fee.admissionFee, fee.currency) ? `admission fee ${money(fee.admissionFee, fee.currency)}` : null,
                ...(Array.isArray(fee.otherFees) ? fee.otherFees : []).map((item: any) => (money(item?.amount, fee.currency) ? `${String(item.label ?? "other fee").toLowerCase()} ${money(item.amount, fee.currency)}` : null)),
            ].filter(Boolean);
            if (parts.length) paragraphs.push(`${label} fees${fee.intake ? ` for the ${fee.intake} intake` : ""} (${fee.name}): ${parts.join(", ")}.`);
        }
        const scholarships = await queryAsSystem<any>(`select name, description, "discountType", "discountValue" from "ScholarshipRule" where "tenantId" = $1 and "programId" = $2 and "isActive" order by name`, [tenantId, program.id]);
        if (scholarships.length) paragraphs.push(`${label} scholarships: ${scholarships.map((rule) => `${rule.name}${Number(rule.discountValue) ? ` (${rule.discountType === "PERCENTAGE" ? `${Number(rule.discountValue)}% off` : `${money(rule.discountValue)} off`})` : ""}${rule.description ? ` – ${rule.description}` : ""}`).join("; ")}.`);
        const eligibility = await queryAsSystem<any>(`select name, description, "minEducationLevel", "minPercentage", "requiredEntranceExam" from "EligibilityRule" where "tenantId" = $1 and "programId" = $2 and "isActive" order by name`, [tenantId, program.id]);
        if (eligibility.length) paragraphs.push(`${label} eligibility: ${eligibility.map((rule) => [rule.description || rule.name, rule.minEducationLevel ? `minimum education ${String(rule.minEducationLevel).toLowerCase()}` : null, rule.minPercentage ? `at least ${Number(rule.minPercentage)}% marks` : null, rule.requiredEntranceExam ? `entrance exam ${rule.requiredEntranceExam}` : null].filter(Boolean).join(", ")).join("; ")}.`);
    }
    return paragraphs.join("\n\n");
}

// Claude rewrites a page or document as short facts in English (decision 30).
async function tidyWithClaude(tenantId: string, botId: string, title: string, text: string) {
    const result = await callClaude(tenantId, {
        model: "claude-sonnet-5-5",
        botId,
        maxTokens: 4000,
        timeoutMs: 120_000,
        system: "You turn a web page or document into knowledge for a phone assistant at an education institution. Write short, self-contained facts in English, each under a topic, translating anything in Hindi. Keep every number, date, fee, name and condition exactly as written. Leave out navigation, marketing slogans, cookie notices, forms and contact boilerplate. Don't add anything that isn't in the text. If the text has no useful facts, return an empty list.",
        messages: [{ role: "user", content: `Source: ${title}\n\n${text.slice(0, KNOWLEDGE_LIMITS.tidyInputChars)}` }],
        tools: [{
            name: "knowledge_facts",
            description: "The facts from the text.",
            input_schema: {
                type: "object",
                properties: { facts: { type: "array", items: { type: "object", properties: { topic: { type: "string" }, fact: { type: "string" } }, required: ["topic", "fact"] } } },
                required: ["facts"],
            },
        }],
        toolChoice: { type: "tool", name: "knowledge_facts" },
    });
    const facts = (result.content.find((block) => block.type === "tool_use")?.input?.facts ?? []) as Array<{ topic?: string; fact?: string }>;
    return facts
        .filter((item) => typeof item?.fact === "string" && item.fact.trim())
        .map((item) => `${String(item.topic ?? "").trim() ? `${String(item.topic).trim()}: ` : ""}${String(item.fact).trim()}`)
        .join("\n\n");
}

// Reads, tidies and splits a source, then replaces its passages. Runs without a signed-in user
// (after a request, or from the daily refresh); every failure is kept on the source in plain words.
export async function processKnowledgeSource(tenantId: string, sourceId: string) {
    const source = await queryOneAsSystem<any>(`select * from "VoiceBotKnowledgeSource" where "tenantId" = $1 and id = $2`, [tenantId, sourceId]);
    if (!source) return;
    try {
        let text = "";
        let title: string = source.title;
        let whole = false;
        if (source.kind === "QA") {
            text = `Q: ${source.question}\nA: ${source.answer}`;
            whole = true;
        } else if (source.kind === "DOCUMENT") {
            const data = await readPrivateFile(source.fileKey);
            text = (await callVoiceBotService<{ text: string }>("/internal/knowledge/document", { fileType: source.fileType, data: data.toString("base64") }, 120_000)).text;
        } else if (source.kind === "WEBSITE") {
            const page = await fetchPublicPage(source.url);
            if (page.html) {
                const read = await callVoiceBotService<{ title: string; text: string }>("/internal/knowledge/page", { html: page.body });
                text = read.text;
                if (read.title) title = read.title.slice(0, 200);
            } else {
                text = page.body;
            }
        } else if (source.kind === "CATALOG") {
            text = await catalogText(tenantId, Array.isArray(source.programIds) ? source.programIds : []);
        }
        if (!text.trim()) throw Object.assign(new Error("VOICE_BOT_KNOWLEDGE_EMPTY"), { detail: "No readable text was found." });
        if (source.tidyWithClaude && (source.kind === "WEBSITE" || source.kind === "DOCUMENT")) {
            const facts = await tidyWithClaude(tenantId, source.botId, title, text);
            if (facts.trim()) text = facts;
        }
        const hash = createHash("sha256").update(`${whole}|${text}`).digest("hex");
        if (hash === source.contentHash && source.status !== "FAILED") {
            await executeAsSystem(`update "VoiceBotKnowledgeSource" set status = 'READY', error = null, title = $3, "refreshedAt" = now(), "updatedAt" = now() where "tenantId" = $1 and id = $2`, [tenantId, sourceId, title]);
            return;
        }
        const { passages } = await callVoiceBotService<{ passages: Array<{ text: string; language: string; embedding: string }> }>("/internal/knowledge/prepare", { text, whole }, 300_000);
        const others = await queryOneAsSystem<{ count: number }>(`select count(*)::int as count from "VoiceBotKnowledgeChunk" where "tenantId" = $1 and "botId" = $2 and "sourceId" <> $3`, [tenantId, source.botId, sourceId]);
        if ((others?.count ?? 0) + passages.length > KNOWLEDGE_LIMITS.passagesPerBot) {
            throw Object.assign(new Error("VOICE_BOT_KNOWLEDGE_FULL"), { detail: `This would take the bot past ${KNOWLEDGE_LIMITS.passagesPerBot} passages. Remove some sources first.` });
        }
        await withTransaction(null, async (tx) => {
            await tx.query(`delete from "VoiceBotKnowledgeChunk" where "tenantId" = $1 and "sourceId" = $2`, [tenantId, sourceId]);
            for (const [position, passage] of passages.entries()) {
                const vector = Array.from(new Float32Array(new Uint8Array(Buffer.from(passage.embedding, "base64")).buffer));
                await tx.query(
                    `insert into "VoiceBotKnowledgeChunk" (id, "tenantId", "botId", "sourceId", position, text, language, embedding) values ($1, $2, $3, $4, $5, $6, $7, $8::real[])`,
                    [randomUUID(), tenantId, source.botId, sourceId, position, passage.text, passage.language ?? null, vector],
                );
            }
            await tx.query(
                `update "VoiceBotKnowledgeSource" set status = 'READY', error = null, title = $3, content = $4, "contentHash" = $5, "chunkCount" = $6, "refreshedAt" = now(), "updatedAt" = now() where "tenantId" = $1 and id = $2`,
                [tenantId, sourceId, title, text, hash, passages.length],
            );
        });
    } catch (error) {
        await executeAsSystem(`update "VoiceBotKnowledgeSource" set status = 'FAILED', error = $3, "updatedAt" = now() where "tenantId" = $1 and id = $2`, [tenantId, sourceId, knowledgeErrorMessage(error)]);
    }
}

export function knowledgeErrorMessage(error: unknown) {
    const code = error instanceof Error ? error.message : "";
    const detail = (error as any)?.detail;
    const messages: Record<string, string> = {
        VOICE_BOT_SERVICE_NOT_SET_UP: "The voice bot service isn't set up on the server yet.",
        VOICE_BOT_SERVICE_DOWN: "The voice bot service isn't answering. Try again once it's running.",
        VOICE_BOT_SERVICE_REFUSED: "The voice bot service refused the request. Check VOICE_BOT_SERVICE_SECRET on the server.",
        VOICE_BOT_SERVICE_FAILED: detail || "The voice bot service couldn't read this source.",
        VOICE_BOT_KNOWLEDGE_PAGE_FAILED: detail || "The page couldn't be fetched.",
        VOICE_BOT_KNOWLEDGE_EMPTY: detail || "No readable text was found.",
        VOICE_BOT_KNOWLEDGE_FULL: detail || "The bot has too many passages.",
        CLAUDE_CAP_REACHED: "This month's Claude budget is used up, so the text couldn't be tidied. Turn tidying off or wait for next month.",
        CLAUDE_ACCOUNT_LIMIT: "Claude's spend limit in the Anthropic Console has been reached, so the text couldn't be tidied.",
        CLAUDE_NOT_CONFIGURED: "Tidying needs a Claude key in Providers.",
        CLAUDE_KEY_REFUSED: "Anthropic refused the Claude key, so the text couldn't be tidied.",
        CLAUDE_NO_CREDIT: "The Anthropic account has no credit, so the text couldn't be tidied. Add credit in the Anthropic Console.",
        CLAUDE_BUSY: "Claude was busy. Refresh to try again.",
        CLAUDE_FAILED: "Claude couldn't tidy the text. Refresh to try again, or turn tidying off.",
    };
    if (messages[code]) return messages[code];
    if (error instanceof Error && (error.name === "UnsafeDestinationError" || error.constructor?.name === "UnsafeDestinationError")) {
        return error.message.includes("resolved") ? "That website couldn't be found. Check the address." : "That address can't be fetched: it isn't a public website.";
    }
    if (error instanceof Error && error.name === "TimeoutError") return "The page took too long to answer.";
    return "This source couldn't be read.";
}

// ---- Using the knowledge ---------------------------------------------------------------------------------
const TOP_K = 3;
const SCORE_FLOOR = 0.75;
const SCORE_SPREAD = 0.06;

function toBase64(vector: number[]) {
    return Buffer.from(new Float32Array(vector).buffer).toString("base64");
}

// What the bot service gets with a call: every ready passage and its vector.
export async function knowledgeForCall(tenantId: string, botId: string) {
    const rows = await queryAsSystem<{ text: string; source: string; embedding: number[] }>(
        `select c.text, s.title as source, c.embedding from "VoiceBotKnowledgeChunk" c join "VoiceBotKnowledgeSource" s on s.id = c."sourceId"
         where c."tenantId" = $1 and c."botId" = $2 and s.status = 'READY' order by s."createdAt", c.position limit $3`,
        [tenantId, botId, KNOWLEDGE_LIMITS.passagesPerBot],
    );
    return rows.map((row) => ({ text: row.text, source: row.source, embedding: toBase64(row.embedding) }));
}

// "Test a question" in the builder: the same search the bot runs on a call.
export async function testKnowledgeQuestion(user: TenantUser, botId: string, questionInput: unknown) {
    const tenantId = requireTenantId(user);
    await botExists(tenantId, botId);
    const question = cleanText(questionInput, 500);
    if (question.length < 2) throw new Error("VOICE_BOT_KNOWLEDGE_QUESTION_INVALID");
    const { embedding } = await callVoiceBotService<{ embedding: string }>("/internal/knowledge/query", { question }, 15_000);
    const asked = new Float32Array(new Uint8Array(Buffer.from(embedding, "base64")).buffer);
    const rows = await readyPassages(tenantId, botId);
    const scored = rows.map((row) => {
        let score = 0;
        for (let index = 0; index < asked.length; index++) score += asked[index] * (row.embedding[index] ?? 0);
        return { text: row.text, source: row.source, sourceId: row.sourceId, score };
    }).sort((a, b) => b.score - a.score).slice(0, TOP_K);
    const best = scored[0]?.score ?? 0;
    return {
        passages: scored.filter((item) => item.score >= SCORE_FLOOR && item.score >= best - SCORE_SPREAD).map((item) => ({ ...item, score: Math.round(item.score * 1000) / 1000 })),
        searched: rows.length,
    };
}

async function readyPassages(tenantId: string, botId: string) {
    return query<{ text: string; source: string; sourceId: string; embedding: number[] }>(
        `select c.text, s.title as source, s.id as "sourceId", c.embedding from "VoiceBotKnowledgeChunk" c join "VoiceBotKnowledgeSource" s on s.id = c."sourceId"
         where c."tenantId" = $1 and c."botId" = $2 and s.status = 'READY' limit $3`,
        [tenantId, botId, KNOWLEDGE_LIMITS.passagesPerBot],
    );
}

// Daily refresh (worker job voiceBots.refreshKnowledge): web pages and catalogue sources a day
// old are read again; unchanged text keeps its passages. Sources stuck processing are retried.
export async function refreshDueKnowledge(limit = 50) {
    const due = await queryAsSystem<{ tenantId: string; id: string }>(
        `select s."tenantId", s.id from "VoiceBotKnowledgeSource" s join "VoiceBot" b on b.id = s."botId" and b."archivedAt" is null
         where (s.kind in ('WEBSITE', 'CATALOG') and s.status <> 'PROCESSING' and coalesce(s."refreshedAt", s."createdAt") < now() - interval '1 day')
            or (s.status = 'PROCESSING' and s."updatedAt" < now() - interval '30 minutes')
         order by coalesce(s."refreshedAt", s."createdAt") limit $1`,
        [limit],
    );
    for (const source of due) {
        await executeAsSystem(`update "VoiceBotKnowledgeSource" set status = 'PROCESSING', "updatedAt" = now() where id = $1`, [source.id]);
        await processKnowledgeSource(source.tenantId, source.id);
    }
    return { refreshed: due.length };
}
