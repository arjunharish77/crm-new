const fs = require("fs");
const path = require("path");

const catalogPath = path.join(__dirname, "..", "src", "data", "catalog.ts");
const catalog = fs.readFileSync(catalogPath, "utf8");
const blogPath = path.join(__dirname, "..", "src", "data", "blog.ts");
const blog = fs.readFileSync(blogPath, "utf8");

function blockAfter(source, marker) {
  const [, afterMarker] = source.split(marker);
  if (!afterMarker) throw new Error(`Could not find ${marker}`);
  return afterMarker.split("\n];")[0];
}

function slugsFrom(block) {
  return [...block.matchAll(/slug: "([^"]+)"/g)].map((match) => match[1]);
}

const universitySlugs = slugsFrom(blockAfter(catalog, "export const universities: University[] = ["));
const courseSlugs = slugsFrom(blockAfter(catalog, "export const courses: Course[] = ["));
const blogSlugs = slugsFrom(blockAfter(blog, "export const blogPosts: BlogPost[] = ["));
const courseNames = [...blockAfter(catalog, "export const courses: Course[] = [").matchAll(/name: "([^"]+)"/g)].map((match) => match[1]);
const feeGuideKeys = [...new Set(courseNames.map((name) => name.toLowerCase().replace(/^online\s+/, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")))];
const staticRoutes = ["", "/courses", "/universities", "/compare", "/recommender", "/blog", "/online-degree-guides", "/about", "/privacy", "/terms", "/refund-policy"];
const host = "https://unnatividya.com";

const urls = [
  ...staticRoutes.map((route) => `${host}${route}`),
  ...courseSlugs.map((slug) => `${host}/courses/${slug}`),
  ...universitySlugs.map((slug) => `${host}/universities/${slug}`),
  ...blogSlugs.map((slug) => `${host}/blog/${slug}`),
  ...feeGuideKeys.map((key) => `${host}/online-degree-guides/${key}-fees`),
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(
  urls.length === 11 + courseSlugs.length + universitySlugs.length + blogSlugs.length + feeGuideKeys.length,
  "Unexpected sitemap URL count",
);
assert(new Set(urls).size === urls.length, "Duplicate sitemap URLs found");
assert(urls.some((url) => url.endsWith("/courses/online-mba-manipal-university-jaipur")), "Missing sample course URL");
assert(urls.some((url) => url.endsWith("/universities/amity-online")), "Missing sample university URL");
assert(urls.some((url) => url.endsWith("/blog/online-mba-guide")), "Missing sample blog URL");
assert(urls.some((url) => url.endsWith("/online-degree-guides/mba-fees")), "Missing sample fee guide URL");
assert(!urls.some((url) => url.includes("/admin") || url.includes("/api") || url.endsWith("/lead")), "Private or lead routes leaked into sitemap");
assert(urls.length < 50_000, "Sitemap part exceeds search-engine URL limit");

console.log(
  `Sitemap smoke passed: ${urls.length} URLs (${courseSlugs.length} courses, ${universitySlugs.length} universities, ${blogSlugs.length} blog posts, ${feeGuideKeys.length} fee guides).`,
);
