import { NextResponse } from "next/server";
import { z } from "zod";
import { articleWrite } from "@/lib/article-api";
import { createArticle, parseContent, reasonSchema, slugSchema } from "@/lib/article-revisions";

const schema = z.object({ slug: slugSchema, content: z.unknown(), reason: reasonSchema }).strict();

// A new article starts as an unpublished draft owned by its author.
export async function POST(request: Request) {
  return articleWrite(["ADMIN", "EDITOR"], async (db, session) => {
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: `${parsed.error.issues[0].path.join(".")}: ${parsed.error.issues[0].message}` }, { status: 400 });
    const { article, revision } = await createArticle(db, session.userId, parsed.data.slug, parseContent(parsed.data.content), parsed.data.reason);
    return NextResponse.json({ articleId: article.id, revisionId: revision.id }, { status: 201 });
  });
}
