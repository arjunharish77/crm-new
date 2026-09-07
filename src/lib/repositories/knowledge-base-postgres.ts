import { randomUUID } from "crypto";
import { execute, query, queryOne } from "@/lib/db/query";
import { assertModuleEnabled } from "@/lib/server/module-entitlements";

type TenantUser = {
  id: string;
  tenantId: string | null;
  isPlatformAdmin?: boolean;
};

function requireTenantId(user: TenantUser) {
  if (!user.tenantId) throw new Error("TENANT_CONTEXT_REQUIRED");
  return user.tenantId;
}

async function assertServiceDeskEnabled(user: TenantUser) {
  const tenantId = requireTenantId(user);
  await assertModuleEnabled(tenantId, "SERVICE_DESK", { isPlatformAdmin: user.isPlatformAdmin });
  return tenantId;
}

function slugify(title: string) {
  return title.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "article";
}

// ─── Categories ────────────────────────────────────────────────────────────────────────────

export async function listKnowledgeBaseCategoriesForTenant(user: TenantUser) {
  const tenantId = requireTenantId(user);
  return query<any>(
    'select id, "tenantId", name, description, "parentId", "order", "isActive", "createdAt", "updatedAt" from "KnowledgeBaseCategory" where "tenantId" = $1 order by "order" asc, name asc',
    [tenantId],
  );
}

export async function createKnowledgeBaseCategoryForTenant(user: TenantUser, input: { name: string; description?: string | null; parentId?: string | null; order?: number }) {
  const tenantId = await assertServiceDeskEnabled(user);
  if (!input.name?.trim()) throw new Error("KB_CATEGORY_NAME_REQUIRED");
  const now = new Date().toISOString();
  return queryOne<any>(
    `insert into "KnowledgeBaseCategory" (id, "tenantId", name, description, "parentId", "order", "isActive", "createdAt", "updatedAt")
     values ($1,$2,$3,$4,$5,$6,true,$7,$7) returning id, "tenantId", name, description, "parentId", "order", "isActive", "createdAt", "updatedAt"`,
    [randomUUID(), tenantId, input.name.trim(), input.description || null, input.parentId || null, input.order ?? 0, now],
  );
}

export async function updateKnowledgeBaseCategoryForTenant(user: TenantUser, id: string, input: Partial<{ name: string; description: string | null; parentId: string | null; order: number; isActive: boolean }>) {
  const tenantId = await assertServiceDeskEnabled(user);
  const patch: Record<string, unknown> = { updatedAt: new Date().toISOString() };
  for (const key of ["name", "description", "parentId", "order", "isActive"] as const) {
    if (input[key] !== undefined) patch[key] = input[key];
  }
  const columns = Object.keys(patch);
  const assignments = columns.map((column, index) => `"${column}" = $${index + 1}`).join(", ");
  return queryOne<any>(
    `update "KnowledgeBaseCategory" set ${assignments} where "tenantId" = $${columns.length + 1} and id = $${columns.length + 2} returning id, "tenantId", name, description, "parentId", "order", "isActive", "createdAt", "updatedAt"`,
    [...columns.map((column) => patch[column]), tenantId, id],
  );
}

export async function deleteKnowledgeBaseCategoryForTenant(user: TenantUser, id: string) {
  const tenantId = await assertServiceDeskEnabled(user);
  await execute('delete from "KnowledgeBaseCategory" where "tenantId" = $1 and id = $2', [tenantId, id]);
}

// ─── Articles (versioned -- editing inserts version+1, "current" = highest active version,
// same convention as AiPromptTemplate from Module 7) ──────────────────────────────────────

const ARTICLE_COLUMNS = 'id, "tenantId", "categoryId", title, slug, body, version, visibility, "isActive", "createdBy", "updatedBy", "createdAt", "updatedAt"';

export async function listKnowledgeBaseArticlesForTenant(user: TenantUser, categoryId?: string | null) {
  const tenantId = requireTenantId(user);
  const clauses = ['"tenantId" = $1'];
  const values: unknown[] = [tenantId];
  if (categoryId) {
    values.push(categoryId);
    clauses.push(`"categoryId" = $${values.length}`);
  }
  return query<any>(`select ${ARTICLE_COLUMNS} from "KnowledgeBaseArticle" where ${clauses.join(" and ")} order by title asc, version desc`, values);
}

async function getActiveArticleBySlug(tenantId: string, slug: string) {
  return queryOne<any>(
    `select ${ARTICLE_COLUMNS} from "KnowledgeBaseArticle" where "tenantId" = $1 and slug = $2 and "isActive" = true order by version desc limit 1`,
    [tenantId, slug],
  );
}

export async function getKnowledgeBaseArticleForTenant(user: TenantUser, id: string) {
  const tenantId = requireTenantId(user);
  return queryOne<any>(`select ${ARTICLE_COLUMNS} from "KnowledgeBaseArticle" where "tenantId" = $1 and id = $2`, [tenantId, id]);
}

export async function createKnowledgeBaseArticleVersion(user: TenantUser, input: { slug?: string; title: string; body: string; categoryId?: string | null; visibility?: "INTERNAL" | "EXTERNAL" }) {
  const tenantId = await assertServiceDeskEnabled(user);
  if (!input.title?.trim() || !input.body?.trim()) throw new Error("KB_ARTICLE_TITLE_AND_BODY_REQUIRED");
  const slug = input.slug?.trim() || slugify(input.title);

  const existing = await queryOne<{ version: number }>('select max(version) as version from "KnowledgeBaseArticle" where "tenantId" = $1 and slug = $2', [tenantId, slug]);
  const nextVersion = (existing?.version ?? 0) + 1;
  const now = new Date().toISOString();
  const id = randomUUID();

  await execute(
    `insert into "KnowledgeBaseArticle" (id, "tenantId", "categoryId", title, slug, body, version, visibility, "isActive", "createdBy", "updatedBy", "createdAt", "updatedAt")
     values ($1,$2,$3,$4,$5,$6,$7,$8,true,$9,$9,$10,$10)`,
    [id, tenantId, input.categoryId || null, input.title.trim(), slug, input.body, nextVersion, input.visibility ?? "INTERNAL", user.id, now],
  );
  return getKnowledgeBaseArticleForTenant(user, id);
}

export async function setKnowledgeBaseArticleActive(user: TenantUser, id: string, isActive: boolean) {
  const tenantId = await assertServiceDeskEnabled(user);
  await execute('update "KnowledgeBaseArticle" set "isActive" = $1, "updatedBy" = $2, "updatedAt" = $3 where "tenantId" = $4 and id = $5', [
    isActive, user.id, new Date().toISOString(), tenantId, id,
  ]);
}

// Suggested articles on case detail (checklist item 9) -- a plain, dependency-free keyword
// overlap match against the case's subject/description (no vector search / embedding
// infrastructure exists in this Node service -- the ml-service's own embeddings are wired for
// predictive-scoring feature vectors, not a queryable article-similarity index), scored by how
// many of the case's significant words (>=4 chars, deduped) appear in the article's title/body.
export async function suggestKnowledgeBaseArticlesForCase(user: TenantUser, caseId: string, limit = 5) {
  const tenantId = requireTenantId(user);
  const caseRow = await queryOne<{ subject: string; description: string | null }>('select subject, description from "Case" where "tenantId" = $1 and id = $2', [tenantId, caseId]);
  if (!caseRow) return [];

  const words = [...new Set(`${caseRow.subject} ${caseRow.description ?? ""}`.toLowerCase().match(/[a-z0-9]{4,}/g) ?? [])].slice(0, 20);
  if (words.length === 0) return [];

  const articles = await query<any>(
    `select ${ARTICLE_COLUMNS} from "KnowledgeBaseArticle" a
     where a."tenantId" = $1 and a."isActive" = true and a.version = (
       select max(version) from "KnowledgeBaseArticle" where "tenantId" = a."tenantId" and slug = a.slug and "isActive" = true
     )`,
    [tenantId],
  );

  const scored = articles
    .map((article) => {
      const haystack = `${article.title} ${article.body}`.toLowerCase();
      const score = words.reduce((sum, word) => sum + (haystack.includes(word) ? 1 : 0), 0);
      return { article, score };
    })
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return scored.map((row) => ({ ...row.article, matchScore: row.score }));
}

export async function submitKnowledgeBaseArticleFeedback(user: TenantUser, input: { articleId: string; caseId?: string | null; isHelpful: boolean; comment?: string | null }) {
  const tenantId = requireTenantId(user);
  await execute(
    `insert into "KnowledgeBaseArticleFeedback" (id, "tenantId", "articleId", "caseId", "userId", "isHelpful", comment, "createdAt")
     values ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [randomUUID(), tenantId, input.articleId, input.caseId || null, user.id, input.isHelpful, input.comment || null, new Date().toISOString()],
  );
}

export async function getKnowledgeBaseArticleFeedbackSummary(user: TenantUser, articleId: string) {
  const tenantId = requireTenantId(user);
  const row = await queryOne<{ helpful: string; unhelpful: string }>(
    `select count(*) filter (where "isHelpful") as helpful, count(*) filter (where not "isHelpful") as unhelpful
     from "KnowledgeBaseArticleFeedback" where "tenantId" = $1 and "articleId" = $2`,
    [tenantId, articleId],
  );
  return { helpful: Number(row?.helpful ?? 0), unhelpful: Number(row?.unhelpful ?? 0) };
}
