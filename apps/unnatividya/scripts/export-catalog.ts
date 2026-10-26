import ts from "typescript";
import fs from "fs";
import path from "path";
import { universities, courses, universityEnrichmentById, courseEnrichmentById } from "../src/data/catalog";
import { blogPosts } from "../src/data/blog";
import { fromBlogPost } from "../src/lib/article-content";
import { careerScopeGuides, eligibilityGuides } from "../src/data/guide-content";
import { codeContent, parseGuideContent, type GuideKind } from "../src/lib/guide-cms";

// Build-time step only -- run via `npm run export-catalog` (tsx) during `next build`, not at
// runtime. The production container never has src/ available, only compiled Next.js output and
// the scripts/ + migrations/ directories, so scripts/sync-catalog-to-db.js (a plain
// require()-based script, like every other script here) reads this pre-baked JSON instead of
// importing catalog.ts directly. See 22_UNNATIVIDYA_PLATFORM_ENHANCEMENTS_PLAN.md §4.
const output = {
  universities: universities.map((university) => ({
    id: university.id,
    slug: university.slug,
    name: university.name,
    shortName: university.shortName,
    city: university.city,
    data: {
      established: university.established,
      rating: university.rating,
      reviews: university.reviews,
      learners: university.learners,
      approvals: university.approvals,
      placement: university.placement,
      avgPackage: university.avgPackage,
      highestPackage: university.highestPackage,
      partners: university.partners,
      feeFrom: university.feeFrom,
      about: university.about,
      ...(universityEnrichmentById[university.id] || {}),
    },
  })),
  courses: courses.map((course) => ({
    id: course.id,
    slug: course.slug,
    universityId: course.universityId,
    name: course.name,
    shortName: course.shortName,
    level: course.level,
    programType: course.programType,
    ugcApproved: course.ugcApproved,
    stream: course.stream,
    fee: course.fee,
    duration: course.duration,
    data: {
      emi: course.emi,
      rating: course.rating,
      reviews: course.reviews,
      specializations: course.specializations,
      eligibility: course.eligibility,
      careerRoles: course.careerRoles,
      dataQuality: course.dataQuality || {},
      ...(courseEnrichmentById[course.id] || {}),
    },
  })),
};

const outPath = path.join(__dirname, "catalog-export.json");
fs.writeFileSync(outPath, JSON.stringify(output, null, 2));
console.log(`export-catalog: wrote ${output.universities.length} universities and ${output.courses.length} courses to ${outPath}`);

// The 26 code posts, validated against the CMS article schema, for the one-time migration into
// the article table (scripts/sync-articles-to-db.js, decision 8). parse() fails the build if any
// post doesn't fit the schema.
const articles = blogPosts.map((post) => ({ slug: post.slug, content: fromBlogPost(post) }));
const articlesPath = path.join(__dirname, "articles-export.json");
fs.writeFileSync(articlesPath, JSON.stringify({ articles }, null, 2));
console.log(`export-catalog: wrote ${articles.length} articles to ${articlesPath}`);

// Wave 5 C3: the guides' editable text, for the one-time import (scripts/sync-guides-to-db.js).
// Every entry must pass the same validation the CMS uses, or the export fails here, not on the VPS.
const guides = ([["eligibility", eligibilityGuides], ["career-scope", careerScopeGuides]] as const).flatMap(([kind, records]) =>
  Object.keys(records).map(key => ({ kind: kind as GuideKind, key, content: parseGuideContent(kind, key, codeContent(kind, key)) })));
const guidesPath = path.join(__dirname, "guides-export.json");
fs.writeFileSync(guidesPath, JSON.stringify({ guides }, null, 2));
console.log(`export-catalog: wrote ${guides.length} guides to ${guidesPath}`);

// Ship the same validator used by the app as plain CommonJS for pre-deploy readiness checks.
// The runner image has production dependencies but no TypeScript source/runtime toolchain.
const generatedPath = path.join(__dirname, "generated");
fs.mkdirSync(generatedPath, { recursive: true });
// Every `@/lib/<name>` runtime import of these modules must be in this list too; the `@/` alias is
// rewritten to a sibling require, and any alias left over fails the export rather than the deploy.
// article-revisions and article-content back scripts/publish-scheduled.js (Wave 5 C2).
const generatedModules = ["catalog-snapshot", "catalog-reader", "eligibility-rules", "article-revisions", "article-content"];
for (const name of generatedModules) {
  const source = fs.readFileSync(path.join(__dirname, "../src/lib", `${name}.ts`), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } });
  const output = compiled.outputText.replace(/require\("@\/lib\/([a-z0-9-]+)"\)/g, (match, dependency: string) => {
    if (!generatedModules.includes(dependency)) throw new Error(`export-catalog: ${name}.ts imports @/lib/${dependency}, which is not generated; add it to generatedModules.`);
    return `require("./${dependency}")`;
  });
  if (/require\("@\//.test(output)) throw new Error(`export-catalog: ${name}.ts still has an unresolved @/ import.`);
  fs.writeFileSync(path.join(generatedPath, `${name}.js`), output);
}
console.log("export-catalog: generated the production catalog validator.");
