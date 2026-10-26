import { cache } from "react";
import type { BlogPost } from "@/data/blog";
import { articleContentSchema, toBlogPost } from "@/lib/article-content";
import { query } from "@/lib/db";

// Published articles from the CMS (decision 8), newest first. A record that fails validation is
// skipped and logged rather than breaking the blog. As with the catalog, a database failure
// falls back to this process's last good list for up to a day, never to code content.
const LAST_GOOD_MAX_AGE_MS = 24 * 60 * 60 * 1000;
declare global {
  // eslint-disable-next-line no-var
  var unnatiVidyaLastGoodArticles: { posts: BlogPost[]; at: number } | undefined;
}

export const getPublishedArticles = cache(async (): Promise<BlogPost[]> => {
  let rows: Array<{ slug: string; content: unknown }>;
  try {
    rows = (await query<{ slug: string; content: unknown }>("select slug, content from article where status='PUBLISHED' and content is not null")).rows;
  } catch (error) {
    const lastGood = globalThis.unnatiVidyaLastGoodArticles;
    if (lastGood && Date.now() - lastGood.at < LAST_GOOD_MAX_AGE_MS) {
      console.error(`[articles] Serving the last good article list: ${error instanceof Error ? error.message : "database error"}`);
      return lastGood.posts;
    }
    throw error;
  }
  const posts: BlogPost[] = [];
  for (const row of rows) {
    const parsed = articleContentSchema.safeParse(row.content);
    if (parsed.success) posts.push(toBlogPost(row.slug, parsed.data));
    else console.error(`[articles] Skipping invalid published article ${row.slug}: ${parsed.error.issues[0]?.message}`);
  }
  posts.sort((a, b) => b.publishedDate.localeCompare(a.publishedDate) || a.title.localeCompare(b.title));
  globalThis.unnatiVidyaLastGoodArticles = { posts, at: Date.now() };
  return posts;
});

export async function getPublishedArticle(slug: string) {
  return (await getPublishedArticles()).find((post) => post.slug === slug) || null;
}
