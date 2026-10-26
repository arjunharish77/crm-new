import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { articleContentSchema } from "../src/lib/article-content";
import { blogPosts } from "../src/data/blog";

// Wave 4 hub drafts (decision W4): every prepared draft must pass the CMS article schema, cite sources,
// link only to pages that exist, and (for revisions) still be based on the article's current text.
const root = join(import.meta.dirname, "..");
const prepared = JSON.parse(readFileSync(join(root, "scripts/prepared-article-drafts.json"), "utf8"));
const existing = new Set(blogPosts.map(post => post.slug));
const draftSlugs = new Set(prepared.drafts.map((draft: { slug: string }) => draft.slug));
const catalogExport = JSON.parse(readFileSync(join(root, "scripts/catalog-export.json"), "utf8"));
const courseSlugs = new Set(catalogExport.courses.map((course: { slug: string }) => course.slug));
// /compare/<degree>/<university>-vs-<university>: both universities must offer that degree.
const degreeKey = (name: string) => name.toLowerCase().replace(/^online\s+/, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const universitySlug = new Map(catalogExport.universities.map((university: { id: string; slug: string }) => [university.id, university.slug]));
const offered = new Set(catalogExport.courses.map((course: { name: string; universityId: string }) => `${degreeKey(course.name)}:${universitySlug.get(course.universityId)}`));
const comparisonExists = (path: string) => {
  const match = path.match(/^\/compare\/([a-z0-9-]+)\/([a-z0-9-]+)-vs-([a-z0-9-]+)$/);
  return Boolean(match && offered.has(`${match[1]}:${match[2]}`) && offered.has(`${match[1]}:${match[3]}`));
};
const routeExists = (href: string) => {
  if (/^https:\/\//.test(href)) return true;
  const path = href.split("#")[0].split("?")[0];
  if (path.startsWith("/blog/")) return existing.has(path.slice(6)) || draftSlugs.has(path.slice(6));
  if (path.startsWith("/courses/")) return courseSlugs.has(path.slice(9));
  if (path.startsWith("/compare/")) return comparisonExists(path);
  const appPath = join(root, "src/app", path, "page.tsx");
  if (existsSync(appPath)) return true;
  if (path.startsWith("/online-degree-guides/")) return true; // generated guide routes
  return ["/how-we-verify"].includes(path);
};
let checked = 0;
for (const draft of prepared.drafts) {
  const content = articleContentSchema.parse(draft.content);
  assert.match(draft.slug, /^[a-z0-9]+(-[a-z0-9]+)*$/);
  assert.ok(draft.reason.length > 40, `${draft.slug}: explain the change for reviewers`);
  assert.ok((content.sources || []).length >= 2, `${draft.slug}: cite at least two sources`);
  assert.ok(content.sources!.every(source => /^https:\/\/(www\.)?(ugc\.gov\.in|deb\.ugc\.ac\.in|nirfindia\.org|onlinemanipal\.com|amityonline\.com|aiu\.ac\.in|rbi\.org\.in|wes\.org|canada\.ca)\//.test(source.url)), `${draft.slug}: official sources only`);
  for (const block of content.body) if (block.type === "links") for (const item of block.items) assert.ok(routeExists(item.href), `${draft.slug}: link ${item.href} has no page`);
  if (draft.kind === "new") assert.equal(existing.has(draft.slug), false, `${draft.slug}: a new draft must not reuse an existing slug`);
  else {
    assert.equal(existing.has(draft.slug), true, `${draft.slug}: a revision needs an existing article`);
    assert.ok(draft.basedOn, `${draft.slug}: a revision records the text it was written against`);
  }
  assert.doesNotMatch(JSON.stringify(content), /tel:|1800-|guarantee|best university|#1/i, `${draft.slug}: banned claim`);
  checked++;
}
assert.equal(checked, prepared.drafts.length);
console.log(`PASS ${checked} prepared article drafts (schema, sources, links, revision bases)`);
