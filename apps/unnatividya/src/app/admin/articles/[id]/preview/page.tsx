import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { ArticleView } from "@/components/article-view";
import { PublishedCatalogBoundary } from "@/components/published-catalog-boundary";
import { getAdminSession } from "@/lib/admin-auth";
import { articleContentSchema, toBlogPost } from "@/lib/article-content";
import { getPublishedArticles } from "@/lib/articles-server";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Article preview", robots: { index: false, follow: false, nocache: true } };

// Renders a revision exactly as the public page would (shared ArticleView).
export default async function ArticlePreviewPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");
  const { id } = await params;
  const revisionId = (await searchParams).revision;
  if (!z.string().uuid().safeParse(id).success || typeof revisionId !== "string" || !z.string().uuid().safeParse(revisionId).success) notFound();
  const row = (await query<{ slug: string; content: unknown }>("select a.slug, r.content from article_revision r join article a on a.id=r.article_id where r.id=$1 and a.id=$2", [revisionId, id])).rows[0];
  if (!row) notFound();
  const parsed = articleContentSchema.safeParse(row.content);
  if (!parsed.success) notFound();
  const post = toBlogPost(row.slug, parsed.data);
  const related = (await getPublishedArticles()).filter(item => item.slug !== post.slug).slice(0, 3);
  return <PublishedCatalogBoundary>
    <p className="article-preview-banner" role="status">Preview. This is not live until an administrator publishes it.</p>
    <ArticleView post={post} related={related} />
  </PublishedCatalogBoundary>;
}
