# Unnati Vidya Full Website and CMS Audit Report

Date: 04/08/2026

Status: implementation audit pass completed for code-level, build-level, smoke-test, and representative runtime checks. Full manual browser/device/provider verification is still required before final launch sign-off.

Update on 04/08/2026: attempted to use the requested remote `claude_design` MCP import, but no callable `claude_design` tool was available in this session. The selected files were implemented from the local handoff folders instead: `static_site/` and `design_handoff_unnatividya/`.

Hard-fidelity correction on 04/08/2026: after visual drift was identified, `static_site/*.html` was promoted as the public UI source of truth where it conflicts with `.dc.html` drafts. Header, footer, sticky CTAs, homepage, courses shell/explorer, course detail, university detail, compare, recommender, blog, article, and legal/policy pages were reworked to mirror the rendered static HTML more directly.

Live catalog update on 04/08/2026: Online Manipal, Amity Online, and College Vidya reference sources were fetched into the CMS source-import trail. The public/static catalog and local website database were expanded to 23 courses across MUJ, SMU, and Amity Online, with MAHE still excluded. A follow-up enrichment pass now fills course and university page detail blocks rather than only standard fee/duration fields.

## Scope Reviewed

- Public website routes: home, courses, course detail, universities, university detail, compare, recommender, blog, article, about, lead, legal pages, robots, sitemap, split sitemaps, health endpoint.
- CMS/admin routes: admin login, setup, dashboard, leads, lead detail, courses, course create/edit, universities, university create/edit, CRM sync, mappings, sync history, source imports, content quality, redirects, programmatic SEO.
- Shared components: header, footer, sticky CTAs, lead wizard/modal, compare gate, course cards/explorer, section pill navigation, admin forms/actions, CRM sync controls.
- Supporting scripts: route smoke, sitemap smoke, mobile/static smoke, lead/OTP DB smoke, source import, CRM sync worker.

## Issues Fixed

### Critical

- No new critical runtime failure was found in this pass. Representative runtime crawl returned HTTP 200 for public pages, admin login, health, robots, and sitemap.

### High

- Public course detail pages showed unfinished source-review copy and were missing several rendered static handoff blocks.
  - Location: `apps/unnatividya/src/app/courses/[slug]/page.tsx`
  - Fix: replaced public source-review copy and reworked the page toward the rendered static detail structure: curriculum accordion, fee table, career salary tiles, dashed sample certificate block, brochure form rail, compare link, reviews, similar-program cards, and placement support card.
- Public university detail pages exposed internal CMS/source-review wording.
  - Location: `apps/unnatividya/src/app/universities/[slug]/page.tsx`
  - Fix: replaced admin-facing review copy with learner-facing verification language.
- Recommender page did not match the selected `Recommender.dc.html` behavior; it only showed a static first-question style card.
  - Location: `apps/unnatividya/src/app/recommender/page.tsx`
  - Fix: added `apps/unnatividya/src/components/recommender-quiz.tsx` with the full 5-question quiz, match scoring, thinking state, ranked results, retake action, and scripted refinement chat.

### Medium

- Public pages used raw `<img>` tags, leaving avoidable image lint/performance warnings.
  - Locations: public home, course detail, university listing/detail, blog listing/detail, header, footer.
  - Fix: replaced public raw image tags with `next/image`, dimensions, and responsive `sizes`.
- Mobile smoke test was stale after the floating CTA redesign.
  - Location: `apps/unnatividya/scripts/mobile-smoke.js`
  - Fix: updated assertions to validate the current right-bottom floating callback/WhatsApp design.
- Home page contained a section from `Home.dc.html` that is not present in the rendered `static_site/index.html`.
  - Location: `apps/unnatividya/src/app/page.tsx`
  - Fix: removed the extra stream section and hard-ported the homepage section order, card shapes, spacing, buttons, trust bands, testimonials, and FAQ from `static_site/index.html`.
- Courses listing did not match the static list-card/filter layout closely enough.
  - Locations: `apps/unnatividya/src/app/courses/page.tsx`, `apps/unnatividya/src/components/course-explorer.tsx`
  - Fix: replaced class-driven cards with the static HTML shell: grey page background, trending comparison strip, sticky 250px filter rail, exact logo slot, list-card grid, button stack, chips, fee slider, and empty state copy.

### Low

- Recommender page labelled live recommendations as sample content.
  - Location: `apps/unnatividya/src/app/recommender/page.tsx`
  - Fix: renamed the eyebrow to "Recommended starting points".
- Documentation still claimed raw image lint warnings were expected.
  - Locations: `12_UNNATIVIDYA_WEBSITE_IMPLEMENTATION_PLAN.md`, `14_UNNATIVIDYA_ASSET_CHECKLIST.md`
  - Fix: updated both documents with current clean-lint status and audit verification notes.
- Header navigation did not mark the current public section active.
  - Location: `apps/unnatividya/src/components/site-header.tsx`
  - Fix: wired `usePathname()` active state while preserving the approved sticky header design.
- Course detail hero and sticky section pills diverged from `static_site/course-*.html`.
  - Location: `apps/unnatividya/src/app/courses/[slug]/page.tsx`
  - Fix: removed the extra hero media, restored the static logo slot treatment, simplified the metric band, aligned the pill nav labels/order to the static page, and removed non-handoff eligibility/admission sections from the visible course detail flow.
- University detail pages still mixed reusable app cards with the rendered static university handoff.
  - Location: `apps/unnatividya/src/app/universities/[slug]/page.tsx`
  - Fix: replaced the section/card shell with the static body layout: plain about copy, fact tiles, rankings grid, program table, hiring-partner logo placeholders, campus/learner moments row, admission cards, scholarship table, and the exact brochure/compare/"Why learners pick" rail.
- Policy pages used the older legal-card UI instead of the rendered `static_site/legal.html` policy shell.
  - Locations: `apps/unnatividya/src/app/privacy/page.tsx`, `apps/unnatividya/src/app/terms/page.tsx`, `apps/unnatividya/src/app/refund-policy/page.tsx`
  - Fix: converted each to the narrow legal layout with breadcrumb, 30px title, simple section headings, readable body copy, and the static question callout.
- Floating CTA controls still used a text callback pill after the design request asked for a phone icon treatment.
  - Location: `apps/unnatividya/src/components/sticky-ctas.tsx`
  - Fix: changed the callback control to an icon-only phone button and replaced the rough WhatsApp placeholder with a proper WhatsApp-style mark.
- Catalog fees and course coverage were stale after the latest source-data request.
  - Locations: `apps/unnatividya/src/data/catalog.ts`, `apps/unnatividya/scripts/seed.js`, `apps/unnatividya/scripts/source-import.js`, local `unnatividya` database.
  - Fix: expanded the approved catalog from 14 to 23 courses, refreshed current fees/durations/EMI values from official provider sources where available, expanded source fetching to 13 current source/reference URLs, and marked official-provider imported facts as `NEEDS_REVIEW` in CMS.
- Course and university pages still depended on generated generic content for rich sections.
  - Locations: `apps/unnatividya/src/data/catalog.ts`, `apps/unnatividya/src/app/courses/[slug]/page.tsx`, `apps/unnatividya/src/app/universities/[slug]/page.tsx`, `apps/unnatividya/scripts/source-import.js`, local `unnatividya` database.
  - Fix: added structured enrichment for overview, highlights, fee plans, curriculum, benefits, admission steps, scholarship notes, FAQs, recognitions, placement support, and source URLs; public pages now render these enriched blocks, and the source importer writes matching CMS `data` fields for all 23 courses and 3 universities.

## Content Removed or Replaced

- Kept the visible "Sample certificate scan" dashed block on course detail pages because it is part of the rendered static handoff.
- Removed "Subjects will be imported..." wording from public curriculum cards.
- Removed "Role details and salary bands will be source-reviewed" wording from public career cards.
- Removed public-facing CMS/source-review language from course and university detail pages.
- Removed "Sample matches" wording from the recommender page.
- Replaced the static recommender placeholder flow with the selected handoff quiz/results/chat flow.
- Removed extra public course-detail sections that were not present in `static_site/course-*.html`.
- Replaced university-detail reusable program cards with the handoff table layout.
- Removed remaining public source-review wording from the article tip and course right rail.
- Replaced the broken WhatsApp floating CTA mark with a stable SVG WhatsApp glyph.

## Handoff Differences

- Temporary `static_site/assets/logo-*.svg` files remain in use to match the approved static handoff quickly. They should be replaced with production brand assets before go-live.
- Remote Wikimedia reference imagery remains in use where final owned university/blog/hero assets are not yet supplied. The implementation now uses `next/image`, but final asset replacement and Lighthouse/PageSpeed verification remain pending.
- `LeadWizard.dc.html` includes a City field, but the live implementation intentionally omits City because the later product requirement explicitly removed City from public lead capture.
- Full CMS media upload lifecycle is not verified in this pass because production media storage/provider behavior still needs deployment configuration and manual validation.
- Full cross-browser verification in Safari, Firefox, and Edge is still pending; this pass used build/static/runtime checks rather than real browser automation screenshots.

## Testing Completed

- `npm --prefix apps/unnatividya run lint` — passed with zero warnings.
- `npx tsc --noEmit --project crm/apps/unnatividya/tsconfig.json` — passed after Next generated `.next/types` via build.
- `npm --prefix crm/apps/unnatividya run lint` — passed with zero warnings after the final static-fidelity sweep.
- `npx tsc --noEmit --project crm/apps/unnatividya/tsconfig.json` — passed after the final static-fidelity sweep.
- `npm run unnatividya:routes:smoke` — passed: 12 public pages, 19 admin pages, 20 API routes.
- `npm run unnatividya:sitemap:smoke` — passed: 36 URLs, 23 courses, 3 universities.
- `npm run unnatividya:sitemap:smoke` — passed after live catalog import: 36 URLs, 23 courses, 3 universities.
- `npm run unnatividya:mobile:smoke` — passed.
- `npm run unnatividya:lead-otp:smoke` — passed against local Postgres.
- `npm run unnatividya:build` — passed.
- `npm --prefix crm/apps/unnatividya run build` — passed after the final static-fidelity sweep.
- Local runtime crawl on temporary port 3102 — passed for `/`, `/courses`, `/courses/online-mba-manipal-university-jaipur`, `/universities/manipal-university-jaipur`, `/compare`, `/recommender`, `/blog`, `/privacy`, `/admin/login`, `/api/health`, `/robots.txt`, and `/sitemap.xml`.
- Additional Claude Design/local handoff pass verification: lint, TypeScript, route smoke, sitemap smoke, mobile smoke, and production build all passed after active navigation, stream explorer, and recommender implementation.
- Hard-fidelity correction verification: `npm --prefix crm/apps/unnatividya run lint`, `npx tsc --noEmit --project crm/apps/unnatividya/tsconfig.json`, and `npm --prefix crm/apps/unnatividya run build` passed after the static HTML alignment pass.
- Final recheck verification: lint, TypeScript, production build, route smoke, sitemap smoke, mobile/static smoke, and lead/OTP DB smoke all passed after the course, university, and policy page corrections.
- Live catalog import verification: `npm -C crm run unnatividya:seed`, `npm -C crm run unnatividya:source-import`, DB count check, `npm --prefix crm/apps/unnatividya run lint`, `npx tsc --noEmit --project crm/apps/unnatividya/tsconfig.json`, `node --check crm/apps/unnatividya/scripts/source-import.js`, `npm --prefix crm/apps/unnatividya run build`, `npm -C crm run unnatividya:routes:smoke`, `npm -C crm run unnatividya:sitemap:smoke`, and `npm -C crm run unnatividya:mobile:smoke` all passed.
- Enriched source-data DB check passed: 23/23 courses have `curriculum`, `faqs`, and `feePlans`; 3/3 universities have `overview`, `faqs`, and `rankings`; 13 rich source snapshots were stored in the latest source pass.

## Remaining Risks

- Manual browser UI click-through is still required at 1440, 1280, 1024, 768, 390, and 360 widths.
- Safari/Firefox/Edge compatibility is not fully verified.
- ZeptoMail live delivery and production domain DNS/email authentication still need provider-side verification.
- Final favicons, Open Graph image, university logos, campus images, certificate samples, blog images, and approval icons are still pending from the asset checklist.
- CMS create/edit/publish/delete flows are represented in route/build checks, but full manual content lifecycle testing should be repeated after the production DB is populated.
- `majmc-amity` remains draft/review pending exact current official INR fee confirmation; the latest official source pass confirmed broad Amity catalog presence and refreshed the courses with available INR facts.

## Files Changed In This Audit Pass

- `apps/unnatividya/src/components/site-header.tsx`
- `apps/unnatividya/src/components/recommender-quiz.tsx`
- `apps/unnatividya/src/components/site-footer.tsx`
- `apps/unnatividya/src/app/page.tsx`
- `apps/unnatividya/src/app/courses/[slug]/page.tsx`
- `apps/unnatividya/src/app/universities/page.tsx`
- `apps/unnatividya/src/app/universities/[slug]/page.tsx`
- `apps/unnatividya/src/app/blog/page.tsx`
- `apps/unnatividya/src/app/blog/[slug]/page.tsx`
- `apps/unnatividya/src/app/privacy/page.tsx`
- `apps/unnatividya/src/app/terms/page.tsx`
- `apps/unnatividya/src/app/refund-policy/page.tsx`
- `apps/unnatividya/src/app/recommender/page.tsx`
- `apps/unnatividya/src/styles/globals.css`
- `apps/unnatividya/scripts/mobile-smoke.js`
- `apps/unnatividya/scripts/seed.js`
- `apps/unnatividya/scripts/source-import.js`
- `apps/unnatividya/src/data/catalog.ts`
- `12_UNNATIVIDYA_WEBSITE_IMPLEMENTATION_PLAN.md`
- `14_UNNATIVIDYA_ASSET_CHECKLIST.md`
- `15_UNNATIVIDYA_FULL_AUDIT_REPORT.md`
