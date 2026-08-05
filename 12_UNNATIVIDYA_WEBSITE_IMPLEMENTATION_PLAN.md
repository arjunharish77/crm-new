# Unnati Vidya Website Implementation, CMS, SEO, and VPS Plan

Status: active implementation and verification register. The original plan is approved and implementation is underway inside `crm/apps/unnatividya`.

Implementation status:

- Started.
- Local app scaffold created at `crm/apps/unnatividya`.
- Local website database created: `unnatividya`.
- Local website database user created: `unnatividya_app`.
- Initial website migration applied.
- Initial seed loaded and later expanded: 3 approved universities and 23 UGC-approved degree courses as drafts.
- Public app build verified with `npm run unnatividya:build`.
- Design correction batch applied after review: visible public pages now follow the provided `.dc.html` handoff more closely for admissions strip, sticky header, hero, search, AI shortlist card, approvals strip, compact cards, courses filter/list layout, and lead wizard styling.
- Second design correction batch applied after review: course detail, universities listing, university detail, compare, and recommender were reworked toward the provided handoff structures with dark detail heroes, stats bands, sticky section navigation, horizontal university rows, comparison workspace, and guided recommender card.
- Third design correction batch applied after review: blog listing and article pages now follow the provided handoff structures with category chips, article cards, newsletter band, two-column article layout, author row, CTA band, and related-content rail.
- CMS polish batch applied: admin landing, course review queue, lead inbox, CRM sync overview, and sync history now use focused admin headers, status pills, tables, and operational cards instead of generic page stacks.
- Foundation/SEO/admin detail batch applied: `/api/health` route added, Organization/WebSite/Course/University/Article JSON-LD added, and CMS lead detail page added. Build passes; live health curl still needs retry after restarting local dev server.
- CRM sync configuration batch applied: external API settings persist through `/api/admin/crm-sync/config`, mapping templates persist as versioned active mappings, lead detail can preview and queue manual CRM push attempts, and a disabled-by-default CRM sync worker script was added. Build passes; worker smoke verified it exits without processing when disabled.
- Catalog CMS batch applied: university list/edit and course edit pages added, catalog PATCH APIs added with validation and audit logs, course/university publish visibility can now be managed in CMS. Build passes.
- Catalog lifecycle batch applied: university/course create pages and POST APIs added, list pages now expose New actions, and archive/unarchive is handled through the review status plus public visibility controls. Build passes. Hard delete remains intentionally pending to avoid breaking URLs or lead references.
- SEO/performance batch applied: split sitemap index and static/course/university sitemap routes added, robots now advertises sitemap index, cache headers added for sitemap/static/course/university routes, and a Node sitemap smoke script verifies URL counts and private route exclusion. Build and sitemap smoke pass.
- QA smoke batch applied: route inventory smoke added, lead/OTP DB smoke added without real email delivery, sitemap smoke retained, and build passes. Lead/OTP smoke verifies local lead persistence, default no-CRM-push state, OTP hash invalid attempt increment, successful verification, timestamp update, event write, and cleanup.
- Source import foundation batch applied: source import script added for Online Manipal, Amity Online, and College Vidya reference taxonomy rows; MAHE is explicitly skipped; imports write only to `source_import` and `source_import_item`; CMS source import list/detail review pages added. Build, route smoke, and sitemap smoke pass.
- Source import review/apply batch applied: import items now have Reviewed, Apply facts, and Skip actions; official provider course/university rows can apply parsed facts into catalog `data.sourceReview`; reference-only taxonomy rows are blocked from auto-apply; all actions write audit logs. Build and route smoke pass.
- Live source importer run completed: 7 source imports fetched and stored for review, including 3 Online Manipal, 2 Amity Online, and 2 College Vidya reference rows; import items are all `NEEDS_REVIEW`. Build, route smoke, and sitemap smoke pass after the run.
- Performance/mobile smoke batch applied: lead wizard is dynamically loaded through a client loader, skeleton fallback added, static mobile smoke script added to check responsive breakpoints, stacking rules, sticky CTA mobile positioning, and absence of viewport-scaled fonts. Build, route smoke, and mobile smoke pass.
- CMS login/auth batch applied: `/admin/login` now supports password login plus ZeptoMail email OTP when CMS/admin 2FA is enabled, admin sessions use signed HttpOnly cookies, `/admin/*` and `/api/admin/*` are protected through the Next proxy, logout is available from the CMS landing page, and auth events write CMS audit logs. Verified with `npx tsc --noEmit`, `npm run unnatividya:routes:smoke`, and `npm run unnatividya:build`.
- Legal placeholder batch applied: privacy, terms, and refund/cancellation pages now contain structured launch-review draft copy and site-matched legal card styling instead of placeholder text. Verified with `npx tsc --noEmit`, `npm run unnatividya:routes:smoke`, `npm run unnatividya:sitemap:smoke`, and `npm run unnatividya:build`.
- VPS deployment scaffold batch applied: website standalone output enabled, `apps/unnatividya/Dockerfile` added, VPS compose now includes `unnatividya-web` plus optional profiled CRM sync worker, Caddy now routes `unnatividya.com`/`www.unnatividya.com`, VPS env template includes website DB/session/ZeptoMail settings, and `deploy/vps/scripts/setup-unnatividya-db.sh` creates/migrates the separate website database. Verified with `npx tsc --noEmit`, `npm run unnatividya:routes:smoke`, and `npm run unnatividya:build`; Docker compose config validation is pending because Docker is not installed locally.
- VPS backup batch applied: Postgres backup script now also dumps the Unnati Vidya website database when configured, restore script accepts an optional target database for website restore rehearsals, and the VPS README documents website restore usage. Verified with `sh -n` on deployment scripts and `npm run unnatividya:build`.
- SEO config/worker cleanup batch applied: Google/Bing verification metadata is wired through env, IndexNow key and admin submit endpoints are added behind admin auth, `ZEPTOMAIL_*` env names are consistent, and the Unnati Vidya CRM sync worker now respects interval/batch env settings with graceful shutdown. Verified with `node --check apps/unnatividya/scripts/crm-sync-worker.js`; full build verification follows this doc update.
- Content quality controls batch applied: CMS now has `/admin/content-quality`, linked from the CMS landing page, with read-only checks for missing course fees, duration, source review, eligibility, curriculum, careers, FAQs, university approvals/overview/FAQs, and publish/status conflicts. Route smoke coverage added.
- Redirect manager batch applied: `seo_redirect` migration added and applied locally, CMS `/admin/redirects` page added, admin redirect create/update/toggle/delete APIs added with audit logs and private-route safeguards, and a DB-backed catch-all redirect handler now resolves old SEO URLs before returning 404. Verified with `npx tsc --noEmit`, route/sitemap/mobile smoke, and `npm run unnatividya:build`.
- Programmatic SEO generator batch applied: CMS `/admin/programmatic-seo` now generates live and future route candidates for course, university, fee, eligibility, career, UGC, and same-course comparison intent, with indexability/readiness reasons so thin candidates stay out of sitemap until content quality checks pass. Verified with `npx tsc --noEmit`, route/mobile smoke, and `npm run unnatividya:build`.
- Latest `static_site/` handoff port batch applied: temporary `static_site` logo SVGs copied into `apps/unnatividya/public/brand/`; shared header/footer/sticky CTAs now match the approved static HTML order and identity; homepage now includes the handoff hero, AI card, approval strip, university media cards, popular degrees, how-it-works, comparison factors, trust band, dark compare CTA, testimonials, FAQ, shimmer skeleton treatment, and subtle fade animation; universities listing/detail, course detail, compare, recommender, and blog listing were tightened to the `static_site` layouts with real handoff media references and no grey placeholder cover blocks where source imagery exists. Public counselling CTAs now open a global modal styled like the static lead wizard while keeping `/lead` fallback links and the real email OTP form. Verified with `npx tsc --noEmit`, `npm run unnatividya:routes:smoke`, `npm run unnatividya:sitemap:smoke`, `npm run unnatividya:mobile:smoke`, and `npm run unnatividya:build`.
- Handoff behavior parity batch applied: public lead capture is now a multi-step wizard with interest selection, name/email/mobile capture, and email OTP verification; public city capture has been removed; intercepted CTAs preserve course/university/intent/goal context; verified leads unlock comparison tables; `/compare` hides the table behind lead capture once courses are selected; course and university section pills now auto-select while scrolling; `/courses` now has live search, multi-select filters, fee range, sort, and clear behavior instead of read-only controls. Verified with `npx tsc --noEmit`, `npm run unnatividya:routes:smoke`, `npm run unnatividya:sitemap:smoke`, `npm run unnatividya:mobile:smoke`, `npm run unnatividya:lead-otp:smoke`, rendered-page audit against local production start, and `npm run unnatividya:build`.
- Full check on 04/08/2026: route inventory, sitemap, mobile/static UI, lead/OTP DB smoke, TypeScript, and production build pass. Lint tooling was corrected from stale `next lint` to `eslint .`; generated nested app build output and script files are now handled by ESLint config.
- Production-readiness audit pass on 04/08/2026: all public raw `<img>` usage was replaced with `next/image`; public course/university placeholder wording was removed; the certificate section now renders as a real degree-summary block instead of a fake sample scan; recommender copy no longer labels live results as sample content; the mobile smoke check was updated for the current handoff-style floating CTA behavior. Verified with lint, TypeScript, route smoke, sitemap smoke, mobile smoke, lead/OTP DB smoke, production build, and a local runtime crawl of representative public/admin routes.
- Hard-fidelity static handoff correction on 04/08/2026: the rendered `static_site/*.html` files are now treated as the visual contract for public UI, ahead of conflicting `.dc.html` additions. Shared header, footer, sticky CTAs, homepage, courses shell, courses explorer/list cards, and the course detail hero/navigation frame were ported more literally from the static HTML. The previous "Explore by stream" homepage section was removed because it is not present in `static_site/index.html`. Verified with lint, TypeScript, and production build.
- Claude Design handoff implementation pass on 04/08/2026: the remote `claude_design` MCP was not available as a callable tool in this Codex session, so implementation used the local selected handoff files under `static_site/` and `design_handoff_unnatividya/`. Added active header nav states and replaced the placeholder recommender page with the full 5-question quiz, thinking spinner, ranked top-3 results, match explanations, retake control, and scripted refinement chat from `Recommender.dc.html`. The lead wizard intentionally still omits City because the later product requirement overrides the older `LeadWizard.dc.html` design. Verified with lint, TypeScript, route smoke, sitemap smoke, mobile smoke, and production build.
- Final public-page static fidelity sweep on 04/08/2026: privacy, terms, and refund pages were converted to the narrow `static_site/legal.html` policy shell; course detail pages had non-handoff eligibility/admission blocks removed from the visible section stack; university detail pages now use the handoff-style program table, rankings grid, hiring-partner logo placeholders, scholarships table note, and learner-facing "Why learners pick" rail instead of CMS/source-review copy or reusable course cards. Public article/course copy no longer exposes source-review metadata, and the floating CTA stack now uses an icon-only phone callback button plus a proper WhatsApp mark. Verified with lint, TypeScript, production build, route smoke, sitemap smoke, mobile/static smoke, and lead/OTP DB smoke.
- Detail-page correction after visual review on 04/08/2026: individual course pages now match the rendered `static_site/course-*.html` structure more closely with the handoff fee table, curriculum accordion rows, career salary tiles, dashed sample certificate block, brochure form rail, compare link, reviews, similar-program cards, and placement support rail. Individual university pages now match the rendered `static_site/university-*.html` body layout more closely with plain about copy, fact tiles, rankings grid, program table, hiring-partner logo row, campus/learner moments row, admission cards, scholarship table, and exact right rail. The WhatsApp floating CTA icon was replaced with a stable SVG glyph. Verified with lint, TypeScript, production build, route smoke, sitemap smoke, and mobile/static smoke.
- Live catalog scrape/import pass on 04/08/2026: source fetching was expanded to current Online Manipal, Amity Online, and College Vidya reference pages. The local CMS database now has source-import rows for the fetched pages, and the approved catalog was refreshed to 23 courses across MUJ, SMU, and Amity Online while continuing to exclude MAHE. Public static catalog data was updated in parallel so generated course pages, sitemap counts, cards, fees, and EMI values reflect the imported data. Imported official-provider facts are marked `NEEDS_REVIEW` in CMS for editorial approval rather than auto-publishing silently. Verified with seed, live source import, DB count check, lint, TypeScript, production build, route smoke, sitemap smoke, and mobile/static smoke.
- Rich content scrape/enrichment pass on 04/08/2026: the source importer now captures headings, lists, section-like text, JSON-LD, fee/duration/approval facts, and Amity catalog headings from fetched source pages, then normalizes CMS-ready blocks for every course and university: overview, highlights, eligibility, curriculum, career outcomes, benefits, fee plans, admission steps, scholarships, FAQs, rankings, placement support, and source URLs. Local DB verification confirms 23/23 courses have `curriculum`, `faqs`, and `feePlans`, and 3/3 universities have `overview`, `faqs`, and `rankings`. Public course and university pages now render these enriched blocks while preserving the static handoff UI.

This document supersedes the earlier root-level planning note. The repository that is pushed to Git is the child `crm/` folder, so all implementation and deployment files for `unnatividya.com` must live inside `crm/`.

## 1. Non-Negotiable Context

- The public website domain is `unnatividya.com`.
- User-facing brand name: `Unnati Vidya`.
- Technical folder/package/slugs may use compact lowercase forms like `unnatividya`.
- The CRM app domain is `app.unnatify.com`.
- The CRM API/public API domain is `api.unnatify.com`.
- Do not confuse `unnatividya.com` with the CRM app/API domains.
- The public website must be a separate app inside the `crm/` repo folder.
- Do not build the public website in the parent/root folder.
- Do not directly push website leads into the CRM for now.
- Keep CRM lead handoff code ready behind configuration, but disabled by default.
- Use a separate website database if feasible.
- The CRM already has Postgres available on the VPS; the website can use the same Postgres server but should use a separate database and separate DB user.
- Email OTP is active for now through ZeptoMail.
- Phone OTP must be designed as an option but disabled until provider credentials are approved.
- A CMS is required.
- All course pages for the approved universities must be SEO-ready.
- Use `static_site/` as the current design source of truth. Match its public-page structure, spacing, colors, typography, sections, skeleton/loading treatment, and subtle animations as closely as possible while keeping the Next.js/CMS/OTP/SEO implementation.
- The logo SVGs from `static_site/assets/` may be copied into `apps/unnatividya/public/brand/` as temporary handoff logos so the UI matches the approved static HTML. Replace them with optimized production brand assets before go-live.
- Do not use assets from the older `design_handoff_unnatividya/assets/`; request fresh production assets with the filenames listed in this document.

## 2. Recommended Folder Layout

Because only `crm/` is pushed to Git, create the website here:

```text
crm/
  apps/
    unnatividya/
      src/
        app/
        components/
        content/
        data/
        lib/
        styles/
      public/
      scripts/
      tests/
      package.json
      next.config.ts
      Dockerfile
      README.md
```

Do not use:

```text
apps/unnatividya/
```

at the parent/root level, because that folder is outside the actual Git push boundary.

## 3. Deployment Relationship With CRM

Existing CRM VPS deployment from `10_DIRECT_POSTGRES_VPS_RUNBOOK.md` currently runs:

- `web` service for CRM Next.js app.
- `worker` service for CRM jobs.
- `ml-service` for predictive scoring.
- `postgres` service.
- `redis` service.
- `caddy` reverse proxy.

The current CRM Caddy config routes:

```text
app.unnatify.com -> web:3000
api.unnatify.com -> web:3000
```

The website should add separate services:

```text
unnatividya-web        -> Next.js website on internal port 3100
unnatividya-worker     -> required background jobs for CRM/API push, sitemap refresh, source import, lead enrichment, email retry
unnatividya-db         -> separate database inside the same Postgres service, or a separate Postgres container if we decide strict isolation is worth the extra ops cost
```

Recommended first version:

- Use the same Postgres container/server.
- Create separate DB: `unnatividya`.
- Create separate DB user: `unnatividya_app`.
- Keep website tables physically separate from CRM tables.
- Backup both databases from the same VPS backup flow.

Decision confirmed:

- Use the same VPS Postgres server as the CRM.
- Use a separate website database named `unnatividya`.
- Use a separate website database user named `unnatividya_app`.
- Do not create a separate Postgres container for the website in the first version.

Why not a completely separate Postgres container immediately:

- It increases memory, backup, restore, monitoring, and upgrade work.
- A separate database and user inside the same Postgres instance gives clean application isolation while keeping operations simpler.

When to move to a separate Postgres container/server later:

- Website traffic becomes very high.
- CMS/editing load becomes heavy.
- SEO crawler/import jobs become expensive.
- You want separate backup/restore lifecycle from CRM.

## 4. Proposed Caddy Routing

Add website domains without changing CRM domains:

```text
unnatividya.com       -> unnatividya-web:3100
www.unnatividya.com   -> unnatividya-web:3100
app.unnatify.com      -> CRM web:3000
api.unnatify.com      -> CRM web:3000
```

Important:

- `api.unnatify.com` remains CRM API.
- Website internal API routes live under `unnatividya.com/api/...`.
- Website lead handoff to CRM, when enabled later, should call `https://api.unnatify.com/api/...`.

## 5. Design Handoff References

Use these files as visual/product references:

```text
static_site/README.md
static_site/index.html
static_site/courses.html
static_site/course-*.html
static_site/universities.html
static_site/university-*.html
static_site/compare.html
static_site/recommender.html
static_site/blog.html
static_site/article.html
static_site/legal.html
static_site/site.js
static_site/recommender.js
```

Do not copy or use older handoff assets:

```text
design_handoff_unnatividya/assets/logo-violet.svg
design_handoff_unnatividya/assets/logo-gradient.svg
design_handoff_unnatividya/assets/logo-white.svg
```

Current implementation exception: the active `static_site/assets/logo-*.svg` files are copied as temporary brand assets to match the latest approved static HTML. All non-logo visual assets remain production-asset requirements.

## 6. Technology Plan

Recommended stack:

- Next.js App Router.
- TypeScript.
- Server Components for content pages.
- Static generation for course, university, comparison, blog, and SEO landing pages.
- Incremental regeneration or scheduled rebuild/revalidation for CMS updates.
- CSS modules plus global CSS variables for the fastest low-runtime styling.
- Minimal client JavaScript.
- CSS-only subtle animations where possible.
- IntersectionObserver for scroll reveals only where useful.
- No heavy animation dependency in the first version.
- PostgreSQL for CMS, catalog, OTP, leads, and SEO metadata.
- Redis only if needed for rate limiting, OTP throttling, and background jobs; if Redis is already on VPS, the website can use the existing Redis instance with separate key prefixes.

Redis decision:

- Use the existing VPS Redis instance.
- Use a separate key prefix for Unnati Vidya website jobs and rate limits.
- Do not share CRM queue names or key prefixes.
- Recommended prefix: `unnatividya:`.

## 7. Website Database Plan

Recommended database:

```text
Database: unnatividya
User: unnatividya_app
Schema: public
```

Decision confirmed: the website database will run on the same VPS Postgres server as CRM, with a separate database and separate database user.

Connection examples:

Local:

```env
UNNATIVIDYA_DATABASE_URL=postgresql://unnatividya_app:password@localhost:5432/unnatividya
```

VPS Docker network:

```env
UNNATIVIDYA_DATABASE_URL=postgresql://unnatividya_app:password@postgres:5432/unnatividya
```

Tables should not be created in the CRM `crm` database unless we explicitly choose a single-database strategy later.

## 8. CMS Scope

Build a CMS inside the website app, not inside CRM initially.

Decision confirmed:

- CMS authentication is independent from CRM authentication.
- CMS users are stored in the website database.
- CRM platform/admin users are not reused for CMS login in the first version.
- The CMS must not depend on CRM tenant, role, or session tables.

CMS route:

```text
/admin
/admin/login
/admin/setup
/admin/courses
/admin/universities
/admin/specializations
/admin/seo-pages
/admin/blog
/admin/leads
/admin/leads/[leadId]
/admin/crm-sync
/admin/crm-sync/mappings
/admin/crm-sync/history
/admin/otp-logs
/admin/source-imports
/admin/settings
```

Admin route decision:

- Use `https://unnatividya.com/admin` for the first version.
- Do not create `admin.unnatividya.com` initially.
- Exclude all `/admin` URLs from every sitemap.
- Add `noindex,nofollow,noarchive` metadata on all CMS/admin pages.
- Do not link CMS/admin routes from public website navigation or footer.
- Protect every `/admin` route with CMS authentication.
- Add strong session cookies with `HttpOnly`, `Secure`, and `SameSite=Lax`.
- Rate-limit admin login attempts.
- Add audit logging for login success/failure and sensitive settings changes.
- Add security headers through the website app and Caddy.

Initial admin setup decision:

- Use a one-time setup page at `/admin/setup`.
- The setup page is available only when no CMS admin user exists.
- After the first `ADMIN` user is created, `/admin/setup` must return 404 or redirect to `/admin/login`.
- Setup must require a strong password.
- Setup must create the first admin in the website database only.
- Setup must not create or touch CRM users.
- Setup must be excluded from sitemaps and marked `noindex,nofollow,noarchive`.

CMS admin 2FA decision:

- CMS admin login must use 2FA from the first launch.
- First factor: email and password.
- Second factor: email OTP using the same ZeptoMail API pattern provided for website OTP.
- Use the same ZeptoMail sender as public lead OTP: `info@unnatividya.com`.
- Keep a CMS admin setting to enable/disable admin 2FA.
- Default admin 2FA state: enabled.
- Disabling CMS admin 2FA only requires an admin settings toggle.
- 2FA enable/disable changes must be audit logged.
- Do not allow CMS access until email OTP is verified.
- Store admin OTP separately from lead OTP.
- Hash admin OTP values.
- Expire admin OTP after 10 minutes.
- Rate-limit admin OTP resend and verification attempts.
- Audit log admin login success, password failure, OTP sent, OTP failure, and OTP success.
- Phone OTP is not required for CMS admin login in the first version.

CMS features required in phase one:

- Admin login.
- Course CRUD.
- University CRUD.
- Specialization CRUD.
- Fee blocks.
- Eligibility blocks.
- Curriculum blocks.
- Career outcome blocks.
- FAQ editor.
- SEO metadata editor.
- Canonical/noindex controls.
- Blog/article editor.
- Lead viewer.
- Lead detail page with full source, OTP, consent, recommender, compare, and UTM context.
- Manual push to CRM from one lead, selected leads, or filtered leads.
- Auto-push to CRM enable/disable control.
- CRM API configuration UI.
- CRM field mapping builder with mail-merge tokens and helper functions.
- CRM push preview, test, retry, and audit history.
- OTP log viewer.
- Source import review.
- Publish/unpublish controls.
- Draft/published status.
- Last edited by/at.
- Basic audit log.

CMS roles for first version:

- `ADMIN`: full access.
- `EDITOR`: edit content but cannot edit settings or secrets.
- `VIEWER`: read-only.

CMS must not expose CRM tenant/user/session tables.

### Lead Inbox and CRM Push Admin

The CMS must include a proper lead operations module, not just a raw table.

Lead inbox route:

```text
/admin/leads
```

Lead detail route:

```text
/admin/leads/[leadId]
```

CRM sync routes:

```text
/admin/crm-sync
/admin/crm-sync/mappings
/admin/crm-sync/history
```

Lead inbox requirements:

- Search by name, email, phone, course, university, UTM, source page, CRM sync status, and legacy/imported city where present.
- Filters for OTP verified, consent accepted, course, university, lead source, date range, and sync status.
- Sort by created date, last activity, course, university, source, and sync status.
- Paginated lead table.
- Bulk select.
- Export selected leads.
- Export filtered leads.
- Export format for first launch: CSV only.
- Excel export can be added later if needed.
- Bulk mark status.
- Bulk push to CRM when CRM sync is configured.
- Clear labels for leads that are not eligible for CRM push.

Lead detail requirements:

- Contact details.
- Email OTP verification status.
- Future phone OTP verification status.
- Consent status.
- Course/university intent.
- Compare selections.
- Recommender answers.
- Source page and source component.
- UTM details.
- Device/browser/IP metadata where lawful and useful.
- Lead timeline.
- CRM sync attempts.
- Manual notes.
- Manual push to CRM.
- Re-push to CRM after mapping/API changes.

CRM sync settings requirements:

- Global CRM sync enabled/disabled.
- Auto-push enabled/disabled.
- Manual push enabled/disabled.
- Push only after email OTP verified toggle.
- Push only after consent accepted toggle.
- Push only for selected courses/universities toggle.
- Duplicate strategy.
- Retry strategy.
- Webhook/API timeout.
- API secret/header configuration.
- Test API connection button.
- Test payload button using a sample lead.

Default state:

```text
CRM sync: disabled
Auto-push: disabled
Manual push: disabled until API config is valid
```

CRM push decision:

- Launch default is manual push only.
- Auto-push must remain off until explicitly enabled by an admin in the CMS.
- Even after CRM sync is configured, leads should not auto-push unless the CMS auto-push toggle is enabled.
- Manual push can be enabled once the CRM API configuration and mapping validate successfully.

CRM API configuration fields:

- API base URL.
- Endpoint path.
- HTTP method, likely `POST`.
- Auth type: none, bearer token, API key header, shared secret header, or custom headers.
- Headers as key/value rows.
- Request body template.
- Request body format for first launch: JSON only.
- Success status codes.
- Response lead ID JSON path.
- Duplicate response detection.
- Timeout.
- Retry count.
- Retry backoff.

External API decision:

- CMS CRM/API sync must support any external API URL, not only `https://api.unnatify.com`.
- `https://api.unnatify.com` is only the expected CRM target when you configure it that way.
- Admin can configure other CRMs, lead vendors, middleware, webhook URLs, or automation tools later.
- Add validation for URL format, HTTPS preference, timeout, and redacted secrets.
- Show a warning when the configured endpoint is not HTTPS.
- Do not allow browser-side direct calls to external APIs; calls must go through the website server/worker.
- `multipart/form-data` and `application/x-www-form-urlencoded` are out of first-launch scope and can be added later.

Initial CRM target when enabled later:

```text
Base URL: https://api.unnatify.com
Endpoint: to be confirmed after CRM lead capture endpoint is finalized
```

### CRM Field Mapping and Mail Merge Builder

The admin should be able to configure the outbound CRM payload from the CMS UI without code changes.

Builder layout:

- Left panel: available website fields grouped by entity.
- Center panel: CRM payload JSON/tree builder.
- Right panel: live preview using a selected sample lead.
- Insert-field buttons for every available website DB field.
- Helper function menu.
- Validation before save.
- Test push with selected lead.
- Mapping version history.
- Rollback to previous mapping.

Available field groups:

- Lead contact fields.
- OTP fields.
- Consent fields.
- Course fields.
- University fields.
- Specialization fields.
- Fee fields.
- Source page fields.
- UTM fields.
- Compare fields.
- Recommender fields.
- Device/session fields.
- Custom CMS fields.

Merge token examples:

```text
{{lead.name}}
{{lead.email}}
{{lead.phone}}
{{lead.createdAt}}
{{lead.emailOtpVerified}}
{{course.name}}
{{course.slug}}
{{course.totalFeeInr}}
{{course.durationMonths}}
{{university.name}}
{{university.shortName}}
{{source.path}}
{{source.pageType}}
{{utm.source}}
{{utm.medium}}
{{utm.campaign}}
{{compare.courseNames}}
{{recommender.goal}}
{{recommender.budget}}
```

Helper examples:

```text
{{formatDate lead.createdAt "dd/MM/yyyy, hh:mm a"}}
{{join compare.courseNames ", "}}
{{toNumber course.totalFeeInr}}
{{uppercase university.shortName}}
{{lowercase utm.source}}
{{coalesce lead.phone lead.email}}
```

Mapping output example:

```json
{
  "firstName": "{{lead.name}}",
  "email": "{{lead.email}}",
  "phone": "{{lead.phone}}",
  "source": "Unnati Vidya Website",
  "courseInterested": "{{course.name}}",
  "universityInterested": "{{university.name}}",
  "utmCampaign": "{{utm.campaign}}",
  "sourcePage": "{{source.path}}",
  "notes": "Compare: {{join compare.courseNames \", \"}} | Goal: {{recommender.goal}}"
}
```

CRM sync history must track:

- Lead ID.
- Trigger type: manual, bulk manual, auto, retry.
- Status: queued, processing, success, failed, skipped, duplicate.
- Mapping version.
- Redacted request payload.
- Response status.
- Redacted response body.
- CRM record ID if returned.
- Error message.
- Attempt count.
- Created by.
- Created at.
- Completed at.

Security requirements:

- Never expose API secrets to the browser.
- API secrets must be encrypted at rest or stored as environment-level secrets where feasible.
- Mapping previews must mask secrets.
- Manual and auto pushes must be audit logged.
- Failed push responses must redact secrets.
- Only `ADMIN` can edit CRM sync settings.
- `EDITOR` can view lead data only if explicitly allowed.

Recommended auto-push rule:

```text
Only auto-push leads after email OTP is verified and consent is accepted.
```

CRM push execution decision:

- All external API pushes must run through a worker queue.
- Manual push creates queued jobs.
- Bulk manual push creates queued jobs.
- Auto-push creates queued jobs.
- The CMS web request must not directly call external lead APIs.
- Retries happen in the worker.
- Worker updates `crm_sync_attempt` and `lead_capture.crmSyncStatus`.
- CMS should show queued, processing, success, failed, skipped, and duplicate statuses.
- Admins can manually requeue failed pushes.

## 9. Content and Catalog Source Plan

The site should use only the approved universities:

- Manipal University Jaipur.
- Sikkim Manipal University.
- Amity Online.

Program scope decision:

- Publish only UGC-approved degree programs for the first launch.
- Keep data model provisions for certificates, PGCP, diploma, dual/combined, and other short programs.
- Do not publish non-degree programs until explicitly enabled in CMS.
- Scraper may detect non-degree programs, but they should be imported as draft/non-publishable records unless the program type is enabled.

Assumption to confirm before build:

- MAHE appears on Online Manipal, but it is excluded for launch.
- Only these 3 universities should be published for the first launch: Manipal University Jaipur, Sikkim Manipal University, and Amity Online.
- If MAHE is detected by source imports, keep it unpublished/non-publishable unless explicitly enabled later.

Reference websites to research and import from:

- `https://www.onlinemanipal.com`
- `https://collegevidya.com/`
- `https://amityonline.com/`

Use them for:

- Course names.
- University-program mapping.
- Specializations.
- Duration.
- Fees.
- EMI/payment structures.
- Eligibility.
- Approvals and recognitions.
- Admission process.
- Career outcomes.
- FAQ ideas.
- Comparison attributes.

Important compliance rule:

- Do not blindly copy long copyrighted copy from source websites.
- Store factual course data, then write original Unnati Vidya descriptions, summaries, FAQs, comparisons, and advice.
- Keep source URLs and scrape timestamps for audit.
- Respect robots.txt and terms where applicable.
- Add manual review before publishing imported data.

## 10. Course Import Tasks

Build an importer pipeline, not a one-time manual paste.

Tasks:

- Create source definition table.
- Create crawler/import script per source domain.
- Fetch approved course pages.
- Extract structured fields.
- Store raw source snapshot for audit.
- Normalize course names and university names.
- Map source programs to internal course records.
- Detect duplicates.
- Flag conflicts in fees/duration/eligibility.
- Require manual CMS approval before publishing.
- Keep all imported records as draft by default.
- Do not publish imported course/university/SEO pages automatically.
- Keep `sourceUrl`, `sourceName`, `sourceFetchedAt`, and `sourceHash`.
- Re-run import safely without duplicating records.

Import publishing decision:

- Scrape/import all required details for each approved course from the source websites.
- Imported records must be draft by default.
- Admin must manually review and publish each course/page from CMS.
- If a later scrape changes fees, duration, eligibility, specialization, or approvals, mark the course as `NEEDS_REVIEW` instead of silently publishing the change.
- Keep previous published values until an admin approves the update.

Required details to scrape or derive for every approved course:

- Source URL.
- Source website.
- Source fetched timestamp.
- University name.
- University short name.
- Course full name.
- Course short name.
- Slug suggestion.
- Degree level.
- Program type: degree, certificate, PGCP, diploma, dual/combined, or other.
- UGC-approved degree flag.
- Stream/domain.
- Duration.
- Weekly effort if available.
- Total fee.
- Semester fee.
- Annual fee.
- EMI starting amount.
- Application fee.
- Scholarship notes.
- Specializations.
- Eligibility criteria.
- Admission process.
- Curriculum/semester subjects where available.
- Learning mode.
- Exam mode where available.
- Approvals/accreditations.
- Ranking/recognition snippets where available.
- Career roles.
- Placement/career support notes.
- Recruiter/employer names where available.
- Certificate/degree notes.
- FAQ questions and factual answer points.
- Last reviewed date.
- Data confidence score.
- Conflict notes.
- Admin review status.

Fee display decision:

- Public course pages should show exact fees as per source pages.
- Each fee value must retain its source URL and fetched timestamp.
- Fee fields must be manually reviewed before publishing.
- If source fee data changes in a later import, mark the course as `NEEDS_REVIEW`.
- Keep a small “last reviewed” date on fee sections for trust and maintenance.
- Do not invent or estimate fees when source data is missing; show “Contact counsellor” or leave the field unpublished until reviewed.

Rankings and approvals decision:

- Show rankings, approvals, and accreditations when found on source pages.
- CMS admins can add or edit rankings, approvals, and accreditations manually.
- Manual edits must keep an audit trail.
- Manual entries should include optional source URL, source label, and last verified date.
- Public pages should prefer reviewed CMS values over raw imported values.

Expected source signals from current research:

- Online Manipal lists top courses across MUJ, SMU, and MAHE, including MBA, BBA, MCA, BCA, MCom, BCom, MA Economics, MA JMC, BA, MA English, MSc Data Science, PGCP programs, and more.
- MUJ-specific Online Manipal pages list MUJ programs such as MBA, BBA, MCA, BCA, MCom, BCom, MA Economics, MA JMC, and MSc Mathematics.
- Amity Online program pages currently show broad UG, PG, and certification catalogs, including BBA, BCA, BCom, BA, BAJMC, MBA, MCA, MCom, MSc Data Science, MA programs, dual/combined degree programs, and specialized programs.
- College Vidya can be used for market-wide comparison factors, keyword ideas, specialization taxonomy, and competitor page structures, but only programs for the approved 3 universities should be published.

## 11. Initial Data Model

Recommended core tables:

```text
cms_user
cms_session
cms_audit_log
university
university_accreditation
course
course_specialization
course_fee_plan
course_eligibility
course_curriculum_section
course_career_outcome
course_faq
course_review_summary
comparison_metric
seo_page
seo_page_entity_map
blog_article
lead_capture
lead_event
otp_request
crm_sync_config
crm_sync_mapping
crm_sync_attempt
source_import
source_import_item
site_setting
redirect_rule
```

Key fields for `university`:

- `id`
- `slug`
- `name`
- `shortName`
- `status`
- `description`
- `city`
- `state`
- `logoAssetKey`
- `heroAssetKey`
- `approvalSummary`
- `rankingSummary`
- `isPublished`
- `createdAt`
- `updatedAt`

Key fields for `course`:

- `id`
- `slug`
- `universityId`
- `name`
- `shortName`
- `degreeLevel`
- `stream`
- `durationMonths`
- `learningMode`
- `totalFeeInr`
- `semesterFeeInr`
- `emiStartingInr`
- `applicationFeeInr`
- `approvalSummary`
- `eligibilitySummary`
- `admissionProcess`
- `careerSummary`
- `metaTitle`
- `metaDescription`
- `canonicalPath`
- `robotsDirective`
- `isPublished`
- `createdAt`
- `updatedAt`

Key fields for `lead_capture`:

- `id`
- `name`
- `email`
- `phone`
- `city` nullable legacy/import field; public lead capture does not currently collect it.
- `courseId`
- `universityId`
- `sourcePath`
- `sourcePageType`
- `utmSource`
- `utmMedium`
- `utmCampaign`
- `utmTerm`
- `utmContent`
- `compareCourseIds`
- `recommenderAnswers`
- `consentAccepted`
- `emailOtpVerified`
- `phoneOtpVerified`
- `emailVerifiedAt`
- `phoneVerifiedAt`
- `crmSyncStatus`
- `crmSyncPayload`
- `crmRecordId`
- `lastCrmSyncAttemptAt`
- `lastCrmSyncError`
- `createdAt`
- `updatedAt`

For now:

- `crmSyncStatus` should remain `DISABLED` or `PENDING_DISABLED`.
- No lead should be posted to CRM until explicitly enabled.

Key fields for `crm_sync_config`:

- `id`
- `isEnabled`
- `autoPushEnabled`
- `manualPushEnabled`
- `apiBaseUrl`
- `endpointPath`
- `httpMethod`
- `authType`
- `encryptedSecretConfig`
- `headersTemplate`
- `successStatusCodes`
- `responseLeadIdPath`
- `duplicateDetectionConfig`
- `retryConfig`
- `timeoutMs`
- `pushOnlyAfterEmailOtp`
- `pushOnlyAfterConsent`
- `allowedCourseIds`
- `allowedUniversityIds`
- `createdAt`
- `updatedAt`

Key fields for `crm_sync_mapping`:

- `id`
- `version`
- `name`
- `requestBodyTemplate`
- `availableFieldSnapshot`
- `helperConfig`
- `isActive`
- `createdBy`
- `createdAt`
- `updatedAt`

Key fields for `crm_sync_attempt`:

- `id`
- `leadCaptureId`
- `triggerType`
- `status`
- `mappingVersion`
- `redactedRequestPayload`
- `responseStatus`
- `redactedResponseBody`
- `crmRecordId`
- `errorMessage`
- `attemptCount`
- `createdBy`
- `createdAt`
- `completedAt`

## 12. OTP Plan

Support both:

- Email OTP.
- Phone OTP.

Activate only:

- Email OTP via ZeptoMail.

Keep disabled:

- Phone OTP.

### Email OTP Provider

Provider:

```text
ZeptoMail
Endpoint: https://api.zeptomail.in/v1.1/email
From: info@unnatividya.com
```

Required env:

```env
UNNATIVIDYA_OTP_CHANNEL=email
UNNATIVIDYA_EMAIL_OTP_PROVIDER=zeptomail
ZEPTOMAIL_API_URL=https://api.zeptomail.in/v1.1/email
ZEPTOMAIL_API_KEY=replace-with-real-zoho-enczapikey
ZEPTOMAIL_FROM_EMAIL=info@unnatividya.com
ZEPTOMAIL_FROM_NAME=Unnati Vidya
```

Request shape based on provided curl:

```json
{
  "from": {
    "address": "info@unnatividya.com"
  },
  "to": [
    {
      "email_address": {
        "address": "{{leadEmail}}",
        "name": "{{leadName}}"
      }
    }
  ],
  "subject": "Your Unnati Vidya verification code",
  "htmlbody": "<div>Your OTP is <b>{{otp}}</b>. It is valid for 10 minutes.</div>"
}
```

Implementation requirements:

- Do not store OTP in plain text.
- Store hashed OTP.
- Expire OTP after 10 minutes.
- Limit resend attempts.
- Limit verify attempts.
- Rate-limit by email, IP, and device/session.
- Log provider response status.
- Never log the API key or raw OTP.
- Add generic error message to UI.

OTP capture decision:

- Save the lead first, before OTP verification.
- Mark `emailOtpVerified` only after successful email OTP verification.
- Mark `phoneOtpVerified` separately only after future phone OTP verification.
- Store `emailVerifiedAt` and `phoneVerifiedAt` separately.
- Do not block initial lead creation on OTP success.
- Store lead timeline events for lead created, email OTP sent, email OTP verified, phone OTP sent, and phone OTP verified.
- CRM auto-push eligibility should be configurable, but the recommended default is email verified plus consent accepted.
- Phone number is mandatory on lead forms from the first launch.
- Phone verification is not mandatory until phone OTP is enabled.
- Lead wizard should collect mobile number, then show the OTP step immediately after the mobile step.
- For now, that OTP step sends and verifies email OTP.
- The OTP step copy should be generic enough to later switch to phone OTP without redesigning the flow.
- Later target state: phone OTP only, with email OTP removed or kept as fallback based on future decision.

### Phone OTP Provider

Keep a disabled provider abstraction:

```env
UNNATIVIDYA_PHONE_OTP_ENABLED=false
UNNATIVIDYA_PHONE_OTP_PROVIDER=disabled
```

Future options:

- MSG91.
- Twilio.
- Gupshup.
- Karix.
- Interakt/WhatsApp OTP.

## 13. Lead Capture Plan

Lead capture should store website leads locally first.

Lead form decision:

- Name is mandatory.
- Email is mandatory.
- Phone is mandatory.
- City is not collected in the public lead wizard.
- Keep the nullable lead `city` database column only for backward compatibility, imported leads, and possible future CMS-controlled reactivation.
- Course/university interest should be captured wherever available from page context.
- Program/course interest should be captured from the wizard interest step.
- CTAs should preserve course, university, intent, and recommender goal context even when the modal intercepts the `/lead` fallback link.

For now:

- Store in `lead_capture`.
- Do not post to CRM.
- Show leads in CMS.
- Allow CSV export from CMS.
- Keep CRM sync code behind config.
- Let admins configure CRM API/mapping in CMS even while sync is disabled.
- Let admins preview the outbound CRM payload before enabling sync.
- Do not allow manual or auto push until CRM sync config validates.

Lead ownership decision:

- Before CRM push, leads are visible only inside the Unnati Vidya CMS.
- After manual or future auto push, the corresponding lead should be visible in CRM.
- CRM visibility happens through CRM API push only.
- The website must not write directly into the CRM database.
- The website stores the returned CRM lead/record ID for cross-reference.

Future CRM handoff:

```env
UNNATIVIDYA_CRM_SYNC_ENABLED=false
UNNATIVIDYA_CRM_AUTO_PUSH_ENABLED=false
UNNATIVIDYA_CRM_API_BASE=https://api.unnatify.com
UNNATIVIDYA_CRM_LEAD_CAPTURE_SECRET=
UNNATIVIDYA_CRM_SYNC_SECRETS_MODE=database-encrypted
UNNATIVIDYA_CRM_SYNC_ENCRYPTION_KEY=replace-with-long-random-secret
```

When enabled later, CRM handoff should:

- Post only after OTP verification and consent.
- Include full source context.
- Include course/university IDs and human-readable names.
- Include UTM fields.
- Include recommender answers.
- Include compare selections.
- Use the active CMS-managed field mapping.
- Support manual push, bulk push, and auto-push.
- Show a payload preview before manual push.
- Retry safely without duplicates.
- Store CRM lead ID after successful sync.
- Store every sync attempt with redacted request and response.

## 14. Performance Plan

Targets:

- Lighthouse Performance 90+ on mobile.
- Lighthouse SEO 95+.
- Lighthouse Accessibility 90+.
- LCP under 2.5 seconds on mobile.
- CLS under 0.1.
- INP under 200ms.

Implementation:

- Static render all course, university, blog, and SEO pages.
- Keep above-the-fold CSS small.
- Use `next/image` for all raster images.
- Use WebP or AVIF assets.
- Lazy-load below-fold images.
- Lazy-load compare widgets, recommender, and lead wizard client logic.
- Use route-level code splitting.
- Use CDN/browser caching headers for immutable assets.
- Use server-side cache for catalog queries.
- Use stale-while-revalidate where appropriate.
- Avoid client-side rendering of SEO text.
- Avoid large global JS bundles.
- Avoid heavy carousels.
- Use CSS scroll animations and small transitions.

Caching:

- Static assets: long cache, immutable.
- Course/university pages: static generation with revalidation.
- CMS edits: trigger revalidation for affected pages.
- Sitemap: cached and regenerated after publish changes.
- Lead/OTP APIs: no-store.

## 15. SEO Strategy

The site needs organic reach without paid marketing. The SEO strategy should be deep, but not spammy.

Index these page types:

- Home page.
- Course listing.
- University listing.
- Every published course page for the approved universities.
- Every published university page.
- Every approved specialization page.
- Every approved course + specialization page.
- Fee pages.
- Eligibility pages.
- Career scope pages.
- Online degree guide pages.
- Comparison pages with actual useful comparison content.
- Blog guides.
- FAQ pages where useful.

Do not index:

- Empty filter pages.
- Search result pages.
- Thin generated combinations.
- Duplicate pages with only word-order changes.
- Pages for universities not approved for Unnati Vidya.
- Internal CMS routes.
- OTP/lead capture routes.

Programmatic SEO must be controlled by CMS fields:

- `indexable`
- `canonicalPath`
- `robotsDirective`
- `contentQualityStatus`
- `lastReviewedAt`
- `reviewedBy`

Programmatic generation decision:

- Generate the full approved programmatic page universe for online degree keyword combinations.
- Use CMS-controlled indexability so low-quality, duplicate, missing-data, or thin generated pages can be `noindex` or canonicalized.
- Do not include noindex pages in XML sitemaps.
- Full generation should not bypass content quality checks.
- Publish/index status must remain adjustable from CMS.

## 16. Programmatic SEO Page Matrix

Generate only when content is useful and unique:

```text
/online-degrees
/online-mba
/online-mba/finance
/online-mba/digital-marketing
/online-mba/business-analytics
/online-mba/fees
/online-mba/eligibility
/online-mba/career-scope
/online-mba/for-working-professionals
/online-mba-after-bcom
/online-mba-after-btech
/online-mba/manipal-university-jaipur
/online-mba/sikkim-manipal-university
/online-mba/amity-online
/best-online-mba-universities
/best-online-mba-universities-in-india
/compare/online-mba-vs-online-pgdm
/compare/manipal-university-jaipur-vs-amity-online
```

Examples across degrees:

```text
/online-bba
/online-bca
/online-bcom
/online-ba
/online-mca
/online-mcom
/online-ma
/online-msc-data-science
```

The CMS should be able to generate many combinations, but the publishing workflow must decide which are indexable.

## 17. Technical SEO Requirements

Every indexable page needs:

- Unique title.
- Unique meta description.
- One H1.
- Breadcrumbs.
- Canonical URL.
- Open Graph tags.
- Twitter card tags.
- Structured data where valid.
- Internal links to related courses/universities.
- FAQ section when useful.
- Last reviewed date for factual pages.

Structured data:

- `Organization`
- `WebSite`
- `BreadcrumbList`
- `Course`
- `FAQPage`
- `Article`

Sitemaps:

```text
/sitemap.xml
/sitemaps/static.xml
/sitemaps/courses.xml
/sitemaps/universities.xml
/sitemaps/specializations.xml
/sitemaps/comparisons.xml
/sitemaps/blog.xml
```

Large sitemap rule:

- Keep each sitemap under 50,000 URLs and under 50MB uncompressed.
- Use a sitemap index when page count grows.

Robots:

```text
/robots.txt
```

Must disallow:

```text
/admin
/api
/otp
/lead
```

unless a route is intentionally public and safe.

## 18. Content Quality Rules

To avoid low-quality scaled content:

- Every indexed programmatic page must answer a real query.
- Every indexed page must contain verified data.
- Every indexed page must have original written content.
- Every indexed comparison must include meaningful differences.
- Every fee page must clearly show fee source and last reviewed date.
- Do not create doorway pages for cities if the content does not actually differ.
- Use canonical or noindex for near-duplicates.

## 19. Asset Requirements

Create or provide these production assets. The current `static_site` logo SVGs are temporary handoff assets and should be replaced with optimized production files before go-live.

Brand:

```text
apps/unnatividya/public/brand/unnatividya-logo-gradient.svg
apps/unnatividya/public/brand/unnatividya-logo-white.svg
apps/unnatividya/public/brand/unnatividya-logo-violet.svg
apps/unnatividya/public/brand/favicon.ico
apps/unnatividya/public/brand/favicon-32x32.png
apps/unnatividya/public/brand/apple-touch-icon.png
apps/unnatividya/public/brand/og-default.jpg
```

Universities:

```text
apps/unnatividya/public/universities/manipal-university-jaipur-logo.svg
apps/unnatividya/public/universities/manipal-university-jaipur-campus.webp
apps/unnatividya/public/universities/manipal-university-jaipur-certificate-sample.webp
apps/unnatividya/public/universities/sikkim-manipal-university-logo.svg
apps/unnatividya/public/universities/sikkim-manipal-university-campus.webp
apps/unnatividya/public/universities/sikkim-manipal-university-certificate-sample.webp
apps/unnatividya/public/universities/amity-online-logo.svg
apps/unnatividya/public/universities/amity-online-campus.webp
apps/unnatividya/public/universities/amity-online-certificate-sample.webp
```

Streams:

```text
apps/unnatividya/public/streams/management.webp
apps/unnatividya/public/streams/it-computers.webp
apps/unnatividya/public/streams/commerce.webp
apps/unnatividya/public/streams/arts-humanities.webp
apps/unnatividya/public/streams/data-science.webp
apps/unnatividya/public/streams/healthcare.webp
```

Approvals:

```text
apps/unnatividya/public/approvals/ugc.svg
apps/unnatividya/public/approvals/naac.svg
apps/unnatividya/public/approvals/aicte.svg
apps/unnatividya/public/approvals/wes.svg
apps/unnatividya/public/approvals/aiu.svg
```

Hero and product visuals:

```text
apps/unnatividya/public/hero/student-online-degree.webp
apps/unnatividya/public/hero/counselor-guidance.webp
apps/unnatividya/public/hero/recommender-preview.webp
apps/unnatividya/public/illustrations/compare-programs.webp
apps/unnatividya/public/illustrations/lead-wizard-success.webp
```

Blog images:

```text
apps/unnatividya/public/blog/online-mba-guide.webp
apps/unnatividya/public/blog/online-mca-guide.webp
apps/unnatividya/public/blog/online-degree-fees.webp
apps/unnatividya/public/blog/ugc-online-degree-guide.webp
apps/unnatividya/public/blog/online-degree-careers.webp
```

## 20. Page Experience Requirements

Home:

- Hero search for courses/universities.
- Popular course chips.
- Trust badges.
- Top universities.
- Top courses.
- Recommender CTA.
- Compare CTA.
- How it works.
- FAQ.
- Sticky mobile CTA.

Courses listing:

- Fast server-rendered first page.
- Filters by university, level, stream, fee, duration, approvals.
- Compare checkbox.
- Enquire CTA.
- SEO-safe filter behavior.

Course detail:

- Above-fold course summary.
- Fee, duration, eligibility, university, approvals.
- Sticky enquire/compare actions.
- Specializations.
- Curriculum.
- Fees and EMI.
- Careers.
- Similar courses.
- FAQ.

Universities:

- University cards.
- Approval/ranking highlights.
- Course count.
- Enquire CTA.

Compare:

- Compare selected courses.
- Show the lead wizard directly in the compare page gate before revealing the deep comparison.
- Reveal the deep comparison after email OTP verification.
- Store compare intent even before OTP.
- Do not force CRM lead creation.

Recommender:

- Multi-step quiz.
- Suggest matching courses.
- Email OTP to unlock full shortlist.
- Store answers.

Blog:

- SEO guides.
- Internal links to course/university pages.
- Last reviewed date.

## 21. Environment Variables

Website app:

```env
NEXT_PUBLIC_UNNATIVIDYA_SITE_URL=https://unnatividya.com
UNNATIVIDYA_DATABASE_URL=postgresql://unnatividya_app:password@postgres:5432/unnatividya
UNNATIVIDYA_REDIS_URL=redis://:password@redis:6379
UNNATIVIDYA_SESSION_SECRET=replace-with-long-random-secret
UNNATIVIDYA_CMS_SETUP_ENABLED=true

UNNATIVIDYA_OTP_CHANNEL=email
UNNATIVIDYA_EMAIL_OTP_PROVIDER=zeptomail
ZEPTOMAIL_API_URL=https://api.zeptomail.in/v1.1/email
ZEPTOMAIL_API_KEY=replace-with-real-zoho-enczapikey
ZEPTOMAIL_FROM_EMAIL=info@unnatividya.com
ZEPTOMAIL_FROM_NAME=Unnati Vidya

UNNATIVIDYA_PHONE_OTP_ENABLED=false
UNNATIVIDYA_PHONE_OTP_PROVIDER=disabled

UNNATIVIDYA_CRM_SYNC_ENABLED=false
UNNATIVIDYA_CRM_API_BASE=https://api.unnatify.com
UNNATIVIDYA_CRM_LEAD_CAPTURE_SECRET=

GOOGLE_SITE_VERIFICATION=
BING_SITE_VERIFICATION=
NEXT_PUBLIC_GA_ID=
NEXT_PUBLIC_GTM_ID=
NEXT_PUBLIC_META_PIXEL_ID=
NEXT_PUBLIC_LINKEDIN_PARTNER_ID=
INDEXNOW_KEY=
INDEXNOW_KEY_LOCATION=
INDEXNOW_ENABLED=false
```

CRM env remains separate and should not be mixed with website env except shared infrastructure details such as Redis/Postgres host names on Docker network.

Analytics and marketing instrumentation decision:

- Add Google Analytics 4 support from first launch.
- Add Google Tag Manager support from first launch.
- [x] Add Google Search Console verification support.
- [x] Add Bing Webmaster Tools verification support.
- [x] Add IndexNow support for Bing/participating search engines.
- Add optional Meta Pixel and LinkedIn Insight Tag support, disabled unless IDs are configured.
- Add event tracking for lead form starts, lead submit, OTP sent, OTP verified, course enquiry, compare add, compare unlock, recommender start, recommender complete, and outbound university apply clicks.
- Tracking scripts must be configurable and should not block rendering.
- Respect consent requirements; marketing pixels should be gated by consent if cookie/consent banner is enabled.
- Do not add tracking IDs directly in code; use env/CMS settings.
- Google Search Console, GA4, GTM, and Bing IDs are not blockers for development.
- Build the fields and wiring now; add the actual IDs later when available.

## 22. VPS Compose Tasks

After approval, update CRM VPS deployment with:

- `unnatividya-web` service.
- Optional `unnatividya-worker` service.
- Website DB creation/migration script.
- Website env example.
- Caddy routes for `unnatividya.com` and `www.unnatividya.com`.
- Healthcheck for website.
- Backup script updates to include `unnatividya` DB.

Do not change CRM domains:

- Keep `APP_DOMAIN=app.unnatify.com`.
- Keep `API_DOMAIN=api.unnatify.com`.

Add website domains:

```env
UNNATIVIDYA_DOMAIN=unnatividya.com
UNNATIVIDYA_WWW_DOMAIN=www.unnatividya.com
```

## 23. Local Development Tasks

Local workflow should run without Docker:

```bash
cd crm
npm install
npm run unnatividya:db:setup:local
npm run unnatividya:db:migrate:local
npm run unnatividya:seed
npm run unnatividya:dev
```

Suggested local ports:

```text
CRM local: http://localhost:3000
Website local: http://localhost:3100
Website CMS local: http://localhost:3100/admin
```

## 24. Implementation Phases

### Phase 1 — Foundation

- [x] Create `crm/apps/unnatividya`.
- [x] Add Next.js app.
- [x] Add shared site tokens from handoff.
- [x] Add layout, header, footer, sticky CTAs using the `.dc.html` visual language.
- [x] Add basic CMS setup/auth foundation.
- [x] Add password + email OTP CMS login.
- [x] Add signed admin sessions and admin/API route protection.
- [x] Add CMS logout.
- [x] Add DB connection.
- [x] Add migrations.
- [x] Add health route.

### Phase 2 — CMS and Catalog

- [x] Add first-pass university/course database tables.
- [x] Add read-only CMS course review queue.
- [x] Add university CMS edit/publish workflow.
- [x] Add course CMS edit/publish workflow.
- [x] Add university CMS create/archive flow.
- [x] Add course CMS create/archive flow.
- [ ] Add guarded hard-delete/dependency check flow, if actually needed.
- Add specializations.
- Add fee plans.
- Add eligibility/curriculum/career/FAQ blocks.
- Add SEO metadata editor.
- Add publish workflow.
- Add audit log.

### Phase 3 — Source Import

- [x] Add source import tables.
- [x] Add Online Manipal importer foundation.
- [x] Add Amity Online importer foundation.
- [x] Add College Vidya reference importer foundation for taxonomy/keywords only.
- [x] Add source import CMS review screen.
- [x] Add field-level conflict review and approve/apply flow.
- [x] Run live importer and store captured source snapshots.
- [ ] Manually review captured source snapshots in CMS.
- [x] Seed only the approved 3 universities.

### Phase 4 — Public Pages

- [x] Home.
- [x] Home design corrected toward `Home.dc.html`.
- [x] Courses listing.
- [x] Courses listing design corrected toward `Courses.dc.html`.
- [x] Courses listing live search, multi-select filters, fee range, sort, clear-all, and empty-state behavior.
- [x] Course detail.
- [x] Course detail design corrected toward `Course.dc.html`.
- [x] Course detail sticky section pills auto-select while scrolling.
- [x] Universities listing.
- [x] Universities listing design corrected toward `Universities.dc.html`.
- [x] University detail.
- [x] University detail design corrected toward `University.dc.html`.
- [x] University detail sticky section pills auto-select while scrolling.
- [x] Compare.
- [x] Compare design corrected toward `Compare.dc.html`.
- [x] Compare table gated behind an inline lead wizard after course selection; table reveals after OTP verification.
- [x] Recommender.
- [x] Recommender design corrected toward `Recommender.dc.html`.
- [x] Blog listing.
- [x] Blog listing design corrected toward `Blog.dc.html`.
- [x] Article page.
- [x] Article page design corrected toward `Article.dc.html`.
- [x] Legal pages.
- [x] Replace legal placeholders with structured launch-review draft copy.

### Phase 5 — OTP and Leads

- [x] Add email OTP via ZeptoMail.
- [x] Add disabled phone OTP abstraction in config.
- [x] Add first-pass lead form.
- [x] Lead form styling corrected toward `LeadWizard.dc.html`.
- [x] Replace first-pass public lead form with multi-step lead wizard: interest, contact details, email OTP.
- [x] Remove public city capture from lead wizard.
- [x] Preserve course/university/intent/goal context from all intercepted public CTAs.
- [x] Store leads locally.
- [x] Add CMS lead viewer.
- [x] Add CMS lead detail page.
- [x] Add CRM sync settings page shell.
- [x] Add CRM API configuration UI persistence.
- [x] Add CRM field mapping and mail-merge builder shell.
- [x] Add manual push preview and worker queue.
- [x] Add CRM sync history shell.
- [x] Add auto-push toggle config default, disabled by default.
- [x] Add CRM handoff worker code behind disabled flag.

### Phase 6 — SEO

- [x] Add metadata generation.
- [x] Add canonical/noindex logic for current pages.
- [x] Add JSON-LD.
- [x] Add initial sitemap.
- [x] Add sitemap index/split sitemaps for large programmatic expansion.
- [x] Add robots.txt.
- [x] Add Google/Bing verification metadata support.
- [x] Add IndexNow key verification and submit endpoint.
- [x] Add redirect manager.
- [x] Add programmatic SEO route generator.
- [x] Add content quality controls.

### Phase 7 — Performance and QA

- [x] Avoid runtime font fetching and heavy animation dependencies.
- [x] Build verified with `npm run unnatividya:build`.
- [x] Lazy-load heavy UI.
- [ ] Optimize images after production assets are provided.
- [x] Add cache headers.
- [ ] Add Lighthouse checks.
- [x] Add static mobile UI smoke checks.
- [ ] Add browser-based mobile UI screenshot checks.
- [x] Add lead/OTP tests.
- [x] Add sitemap tests.
- [x] Add route smoke test.
- [x] Add rendered-page structural audit for course explorer, compare gate, scroll pill nav, and public city-field removal.
- [ ] Add browser smoke test.
- [x] Fix nested-app lint tooling so generated `.next` output is ignored and `npm --prefix apps/unnatividya run lint` uses ESLint directly.

### Phase 8 — VPS Deployment

- [x] Add Dockerfile.
- [x] Add Compose services.
- [x] Add Caddy routes.
- [x] Add website DB setup script.
- [ ] Validate Docker Compose config on VPS or any Docker-enabled machine.
- [x] Add backup updates.
- [x] Add healthcheck.
- Deploy to VPS.
- Add SSL.
- Submit sitemap to Search Console and Bing.

## 25. Current Open Items After Full Check

Last checked: 04/08/2026.

Verified as working locally:

- TypeScript compile for `apps/unnatividya`.
- Production build for `apps/unnatividya`.
- Route inventory smoke: public, admin, and API routes are present.
- Sitemap smoke: static, course, and university sitemap counts are correct and private routes are excluded.
- Mobile/static UI smoke: responsive breakpoints and sticky CTA checks pass.
- Lead/OTP DB smoke: lead persistence, OTP attempt handling, verification, timeline writes, and cleanup pass.
- Rendered production-page audit: `/courses` has the live explorer, `/compare` has lead gating, course/university detail pages have scroll-aware pill nav, and public lead forms do not render a city input.

Still open before production launch:

- Replace temporary `static_site` logo files and Wikimedia/reference imagery with production-approved optimized assets listed in `14_UNNATIVIDYA_ASSET_CHECKLIST.md`.
- Convert remaining temporary `<img>` media usage to `next/image` once production assets are available; current ESLint warnings track this performance work.
- Run Lighthouse/PageSpeed checks after final assets are added.
- Run browser-based mobile/desktop screenshot checks after a browser automation stack is available.
- Validate Docker Compose config on the VPS or any Docker-enabled machine.
- Deploy to VPS, verify SSL, and submit sitemap to Google Search Console and Bing.
- Manually review captured source-import snapshots in CMS and publish only reviewed facts.
- Get final business/legal approval for privacy, terms, refund, and consent copy.
- Add actual Google Search Console, Bing, GA4, GTM, and optional analytics IDs in environment.
- Confirm first production CMS admin email and complete `/admin/setup`.
- Guarded hard-delete/dependency check remains intentionally optional; archive/unpublish already protects public URLs and lead references.

## 26. Go-Live Checklist

You need to provide:

- Final logo files with exact filenames listed above.
- University logos/campus/certificate images with exact filenames listed above.
- ZeptoMail API key.
- DNS access for `unnatividya.com`.
- Google Search Console account.
- Bing Webmaster Tools account.
- Google Analytics or GTM ID if tracking is required.
- Privacy policy approval.
- Terms approval.
- Consent text approval.
- Confirmation whether MAHE is excluded or included.
- Confirmation of the first CMS admin email.

DNS:

```text
unnatividya.com      A     <VPS_PUBLIC_IP>
www.unnatividya.com  A     <VPS_PUBLIC_IP>
```

Search Console:

- Verify domain property.
- Submit `/sitemap.xml`.
- Monitor indexing.
- Monitor duplicate/canonical reports.
- Monitor page experience.

## 27. Acceptance Criteria

- Website code lives inside `crm/apps/unnatividya`.
- No dependency on the parent/root folder.
- Public UI follows the latest `static_site/` handoff exactly enough for section order, layout, visual hierarchy, skeleton loaders, and subtle animation behavior to match the approved static HTML.
- No production assets copied from the older `design_handoff_unnatividya/assets`; temporary `static_site` logo SVGs are allowed until final brand assets are supplied.
- Uses separate website DB from CRM.
- Email OTP works with ZeptoMail.
- Phone OTP option exists but is disabled.
- Leads are stored locally only.
- CMS shows captured leads with full source context.
- CMS can configure CRM API and field mapping.
- CMS supports manual CRM push when explicitly enabled.
- CMS supports auto-push toggle, disabled by default.
- CRM sync code exists but is disabled by default.
- CRM push attempts are audited with redacted payloads/responses.
- CMS can manage courses, universities, SEO, blog, and leads.
- All approved courses for the approved universities have SEO pages.
- Sitemap and robots are correct.
- Pages are fast on mobile.
- `app.unnatify.com` and `api.unnatify.com` remain CRM-only.
- `unnatividya.com` serves only the public website.

## 28. Source Notes

Current source research used for planning:

- Online Manipal home and FAQ show MUJ, SMU, MAHE course catalogs and online degree positioning: https://www.onlinemanipal.com/
- Online Manipal all-courses and current public catalog data are used for official MUJ/SMU course names, durations, and fee facts, with MAHE excluded by product decision: https://www.onlinemanipal.com/all-courses
- Online Manipal FAQ describes Online Manipal as the digital home for Manipal universities and lists available programs: https://www.onlinemanipal.com/faq
- MUJ Online pages list MUJ programs and accreditation/ranking sections: https://muj.onlinemanipal.com/
- Amity Online programs page currently lists broad UG, PG, certification programs and program filters: https://amityonline.com/programs
- Amity Online program API/page data is used for official Amity Online UG/PG course names, durations, and fee facts where current INR values are available: https://api-otp.amityonline.com/programs
- College Vidya provides competitor reference for online course categories, comparison positioning, and program taxonomy: https://collegevidya.com/

Live catalog import status on 04/08/2026:

- Imported/updated catalog coverage: 23 UGC-approved courses across Manipal University Jaipur, Sikkim Manipal University, and Amity Online.
- Imported source pages: Online Manipal all-courses/home plus selected MUJ/SMU program pages, Amity Online programs plus selected program pages, and College Vidya Amity/Online Manipal reference pages.
- Latest enriched source pass fetched 13 current official/reference URLs and stores raw snapshots plus parsed headings/lists/sections/facts for CMS audit.
- CMS review state: official-provider fact updates are marked `NEEDS_REVIEW`; College Vidya rows remain reference-only and are blocked from auto-apply.
- Editorial risk: `majmc-amity` remains in the catalog as a draft/static page from the earlier approved set, but exact current INR fee confirmation was not found in the latest source pass. Keep it draft/review until official fee confirmation is added.
- Google SEO starter guidance: https://developers.google.com/search/docs/fundamentals/seo-starter-guide
- Google canonical guidance: https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls
- Google sitemap guidance and limits: https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap
- Google spam policies for scaled content abuse: https://developers.google.com/search/docs/essentials/spam-policies
- Google helpful content guidance: https://developers.google.com/search/docs/fundamentals/creating-helpful-content
