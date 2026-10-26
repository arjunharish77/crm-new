import { z } from "zod";
import type { BlogBlock, BlogPost } from "@/data/blog";

// The article schema shared by the CMS editor (strict, on save) and the public reader (decision 8).
const text = z.string().trim().min(1);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a YYYY-MM-DD date");
const localAsset = z.string().regex(/^\/[A-Za-z0-9/_.-]+\.(webp|png|jpe?g|avif|svg)$/, "Use a site image path such as /blog/name.webp");
// Internal links stay relative; external ones must be https.
const href = z.string().refine(value => /^\/(?!\/)[^\s]*$/.test(value) || /^https:\/\/[^\s]+$/.test(value), "Use a site path (/courses/…) or an https:// link");

export const articleBlockSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("p"), text }).strict(),
  z.object({ type: z.literal("h2"), text: text.max(120) }).strict(),
  z.object({ type: z.literal("note"), text }).strict(),
  z.object({ type: z.literal("image"), src: localAsset, alt: text.max(200) }).strict(),
  z.object({ type: z.literal("links"), heading: text.max(120), items: z.array(z.object({ href, label: text.max(160) }).strict()).min(1) }).strict(),
]);

export const ARTICLE_CATEGORIES = ["Validity", "Fees & EMI", "Careers", "Admissions"] as const;

export const articleContentSchema = z.object({
  title: text.max(120),
  category: z.enum(ARTICLE_CATEGORIES),
  excerpt: text.max(300),
  cover: localAsset,
  publishedDate: isoDate,
  updatedDate: isoDate.optional(),
  body: z.array(articleBlockSchema).min(1, "Add at least one paragraph"),
  faqs: z.array(z.tuple([text.max(200), text])).default([]),
  sources: z.array(z.object({ label: text.max(200), url: z.string().regex(/^https:\/\/[^\s]+$/, "Use an https:// link"), checkedAt: isoDate }).strict()).optional(),
}).strict();

export type ArticleContent = z.infer<typeof articleContentSchema>;

// "6 min read" from the words actually on the page (about 200 words a minute).
export function readingTime(content: Pick<ArticleContent, "body" | "faqs">) {
  const words = [...content.body.flatMap((block: BlogBlock) => block.type === "links" ? [block.heading, ...block.items.map(item => item.label)] : block.type === "image" ? [] : [block.text]),
    ...content.faqs.flat()].join(" ").split(/\s+/).filter(Boolean).length;
  return `${Math.max(1, Math.round(words / 200))} min read`;
}

export function toBlogPost(slug: string, content: ArticleContent): BlogPost {
  return { slug, ...content, read: readingTime(content) };
}

// Code posts (src/data/blog.ts) into CMS content: the one-time migration of the 26 posts.
export function fromBlogPost(post: BlogPost): ArticleContent {
  const { slug: _slug, read: _read, ...content } = post;
  void _slug; void _read;
  return articleContentSchema.parse(content);
}
