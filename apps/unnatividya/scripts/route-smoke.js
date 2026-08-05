const fs = require("fs");
const path = require("path");

const appDir = path.join(__dirname, "..", "src", "app");

const expectedPublicPages = [
  "page.tsx",
  "courses/page.tsx",
  "courses/[slug]/page.tsx",
  "universities/page.tsx",
  "universities/[slug]/page.tsx",
  "compare/page.tsx",
  "recommender/page.tsx",
  "blog/page.tsx",
  "blog/[slug]/page.tsx",
  "online-degree-guides/page.tsx",
  "online-degree-guides/[slug]/page.tsx",
  "privacy/page.tsx",
  "terms/page.tsx",
  "refund-policy/page.tsx",
];

const expectedAdminPages = [
  "admin/page.tsx",
  "admin/login/page.tsx",
  "admin/setup/page.tsx",
  "admin/leads/page.tsx",
  "admin/leads/[id]/page.tsx",
  "admin/courses/page.tsx",
  "admin/courses/[id]/page.tsx",
  "admin/courses/new/page.tsx",
  "admin/content-quality/page.tsx",
  "admin/programmatic-seo/page.tsx",
  "admin/redirects/page.tsx",
  "admin/universities/page.tsx",
  "admin/universities/[id]/page.tsx",
  "admin/universities/new/page.tsx",
  "admin/source-imports/page.tsx",
  "admin/source-imports/[id]/page.tsx",
  "admin/crm-sync/page.tsx",
  "admin/crm-sync/mappings/page.tsx",
  "admin/crm-sync/history/page.tsx",
];

const expectedApiRoutes = [
  "api/health/route.ts",
  "api/leads/route.ts",
  "api/otp/send/route.ts",
  "api/otp/verify/route.ts",
  "api/admin/login/request/route.ts",
  "api/admin/login/verify/route.ts",
  "api/admin/logout/route.ts",
  "api/admin/seo/indexnow/route.ts",
  "api/admin/seo/redirects/route.ts",
  "api/admin/seo/redirects/[id]/route.ts",
  "api/admin/setup/route.ts",
  "api/admin/crm-sync/config/route.ts",
  "api/admin/crm-sync/mapping/route.ts",
  "api/admin/crm-sync/preview/route.ts",
  "api/admin/crm-sync/queue/route.ts",
  "api/admin/catalog/courses/route.ts",
  "api/admin/catalog/courses/[id]/route.ts",
  "api/admin/catalog/universities/route.ts",
  "api/admin/catalog/universities/[id]/route.ts",
  "api/admin/source-import-items/[id]/route.ts",
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

for (const route of [...expectedPublicPages, ...expectedAdminPages, ...expectedApiRoutes]) {
  assert(fs.existsSync(path.join(appDir, route)), `Missing route file: ${route}`);
}
assert(fs.existsSync(path.join(appDir, "indexnow-key", "route.ts")), "IndexNow key verification route is missing");

const robots = fs.readFileSync(path.join(appDir, "robots.ts"), "utf8");
assert(robots.includes('disallow: ["/admin", "/api", "/lead"]'), "robots.ts must disallow admin/api/lead");
assert(robots.includes("/sitemap-index.xml"), "robots.ts must include sitemap index");

const nextConfig = fs.readFileSync(path.join(__dirname, "..", "next.config.ts"), "utf8");
assert(nextConfig.includes("X-Robots-Tag"), "Admin/API noindex headers are missing");
assert(nextConfig.includes("s-maxage=600"), "Public page cache headers are missing");
assert(fs.existsSync(path.join(__dirname, "..", "src", "proxy.ts")), "Admin auth proxy is missing");

console.log(`Route smoke passed: ${expectedPublicPages.length} public pages, ${expectedAdminPages.length} admin pages, ${expectedApiRoutes.length} API routes.`);
