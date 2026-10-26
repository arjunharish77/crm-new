import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminSession } from "@/lib/admin-auth";
import { pool } from "@/lib/db";
import { applyPublishBatch, getPublishPreview, publishCounts } from "@/lib/bulk-publish";
import { catalogWriteFailure } from "@/lib/catalog-write";
import { ArticleError } from "@/lib/article-revisions";
import { GuideError, lockGuides } from "@/lib/guide-revisions";
import { CatalogApplyConflict, CATALOG_LOCK } from "@/lib/catalog-apply";

const schema = z.object({ revisionIds: z.array(z.string().uuid()).min(1).max(250) }).strict();

export async function POST(request: Request) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "CMS login required" }, { status: 401 });
  if (session.role !== "ADMIN") return NextResponse.json({ error: "Only administrators can publish content." }, { status: 403 });
  if (!request.headers.get("content-type")?.startsWith("application/json")) return NextResponse.json({ error: "JSON request required." }, { status: 415 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || new Set(parsed.data.revisionIds).size !== parsed.data.revisionIds.length) return NextResponse.json({ error: "Reload the page and try again." }, { status: 400 });
  const db = await pool.connect();
  try {
    await db.query("begin");
    // The individual catalog, article and guide routes use these locks. Taking all three in this
    // fixed order makes the combined publish atomic and prevents a concurrent review from racing it.
    await db.query("select pg_advisory_xact_lock($1)", [CATALOG_LOCK]);
    await db.query("select pg_advisory_xact_lock(714083292)");
    await lockGuides(db);
    const preview = await getPublishPreview(db, true);
    const expected = [...parsed.data.revisionIds].sort();
    const ready = preview.ready.map(item => item.id).sort();
    if (expected.length !== ready.length || expected.some((id, index) => id !== ready[index])) {
      await db.query("rollback");
      return NextResponse.json({ error: "The ready-to-publish list changed. Reload the page to review the current list; nothing was published." }, { status: 409 });
    }
    await applyPublishBatch(db, preview, session.userId);
    await db.query("commit");
    return NextResponse.json({ published: preview.ready.length, ...publishCounts(preview), skipped: preview.skipped.length });
  } catch (error) {
    await db.query("rollback").catch(() => {});
    const failure = catalogWriteFailure(error);
    if (failure) return failure;
    if (error instanceof ArticleError || error instanceof GuideError) return NextResponse.json({ error: error.message, detail: "Nothing was published." }, { status: error.status });
    if (error instanceof CatalogApplyConflict) return NextResponse.json({ error: error.message, detail: "Nothing was published." }, { status: 409 });
    throw error;
  } finally { db.release(); }
}
