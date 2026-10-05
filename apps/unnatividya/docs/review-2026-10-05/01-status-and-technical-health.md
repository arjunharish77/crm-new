# Unnati Vidya website: status audit (read-only)

Date: 5 October 2026. Scope: `crm/apps/unnatividya` at `main` = `13b392b` (in sync with origin/main), compared with the live site https://unnatividya.com.
Method: read the docs, spot-checked the code, ran `tsc` and `eslint`, ran `npm audit` on temporary copies of the lockfiles, and fetched public pages with curl. No repo files were modified. No forms were submitted. The local database query was **denied by the permission classifier and not run**, so the local CMS/DB state (applied revisions, published flags) is inferred from docs and files only.

---

## 0. Headline findings

1. **None of the 72 increments is live.** All of them are committed and pushed (`git status` is clean for `apps/unnatividya`; the last website commits are `9533137` on 3 Oct and `d4bd0e6` on 5 Oct). Production still serves a build from around **28 Sep 2026**: every sitemap `<lastmod>` is `2026-09-28T12:01Z`, which is the build time of the old code and lines up with commit `80bb5bd`, 28 Sep 16:59 IST.
2. **The live site runs Next.js 16.1.6** (`version:"16.1.6"` appears in live chunk `1968-a440a5c0527d1484.js`). That version carries 30 advisories, including **GHSA-2xp9-vwfh-vxw4, unauthenticated RCE in the Image Optimization API when AVIF is used**. `next.config.ts` enables `formats: ["image/avif","image/webp"]`, and live `/_next/image` returned `content-type: image/avif`. The vulnerable path is reachable. I did not attempt any exploit. **This is the most urgent item.**
3. **Live content is wrong in ways the repo has already fixed:**
   - The header still shows an expired banner: "Admissions open for the July 2026 batch · Last date to apply: 20 August".
   - CTAs still say "Talk to an expert".
   - The compare gate says "Verify your number".
   - The recommender advertises "Five questions" and UnnatiAI.
   - Blog author schema names the person **"Ritika Desai, Senior education counsellor"**, which conflicts with the owner's required byline.
   - `/authors/content-team` returns **404**.
   - Amity MAJMC is shown at **₹1,30,000**, but the official domestic fee is **INR 190,000**.
4. **No catalog facts are published as verified anywhere.** The evidence work is extensive (30/30 courses). All corrections are only *prepared*: 28 eligibility drafts, 30 curriculum outlines and 1 fee correction sit in `src/data/prepared-*.json`, and none has been applied. Recognition is pending for 30/30. International/NRI fees have **no data model or public UI at all**.
5. **Groq recommender, scheduled source checks, the international fee selector, intake/deadline modelling, the claims register and the Node LTS upgrade have not been started.**

---

## 1. Live vs repo (curl, 5 Oct 2026 ~06:37 UTC)

| Check | Live | Repo (`main`) | Deployed? |
|---|---|---|---|
| `/authors/content-team` | **404** | page exists (`src/app/authors/content-team/page.tsx`), in sitemap | No (inc. 1) |
| Header nav "Resources / Tools" | absent (0 matches on 7 pages) | grouped nav (inc. 22) | No |
| "Apply now" CTA | 0 matches; "Talk to an expert" on every page | 34 "Apply now", 0 "Talk to an expert" | No (inc. 1) |
| Expired July/20 Aug banner | present on every page | removed (0 matches in `src`) | No (inc. 1) |
| Recommender | "Five questions…", UnnatiAI | 3 deterministic questions (`recommender-quiz.tsx`: level/stream/budget) | No (inc. 30) |
| Compare gate copy | "Verify your number once…" | email-OTP, server-validated cookie | No (inc. 1/27) |
| Blog byline / schema | `"author":{"@type":"Person","name":"Ritika Desai"...}` | Organization "Content Team, Unnati Vidya" | No (inc. 1) |
| Blog index title | "Online Degree Guides" (duplicate of guides) | "Online learning articles" | No (inc. 22) |
| Course page | no "Jump to section", no "Illustrative study areas" | both present | No (inc. 10/24) |
| Rendering | home prerendered: `x-nextjs-prerender: 1`, `cache-control: s-maxage=31536000` | dynamic DB reads (inc. 6) | No |
| Sitemap lastmod | build time (2026-09-28T12:01Z on all 260 URLs) | CMS modification timestamps (UV13) | No |
| MAJMC fee | ₹1,30,000 | seed still 130000; correction prepared, not applied | n/a (needs admin publish after deploy) |
| "1.75L" learner claim | home ×2, /courses ×12, /blog ×2, EMI ×2 | removed from intro (inc. 23) | No |
| GA/GTM scripts | not found in HTML (0 `googletagmanager`) | lazyOnload, both formats | Probably not configured at build (`NEXT_PUBLIC_GA_ID/GTM_ID` empty). **Unconfirmed**: needs a DebugView/Tag Assistant check |
| `/api/health` | `{"ok":true,"database":"ok"}` | — | — |
| www | `www.unnatividya.com` returns 200 (no redirect); canonical points to apex | — | Acceptable; a redirect is optional |
| Duplicate security headers | Permissions-Policy, Referrer-Policy and nosniff are each sent twice (Caddy + Next) | — | Cosmetic |

**Conclusion:** live corresponds to code from before increment 1. **All 72 increments are undeployed**, together with migrations 0004–0007 (live has no contact-first flow, so 0004 is evidently not in use).

---

## 2. Master plan §3 findings (UV01–UV18): status in repo

"Done" means implemented in the repo. None of it is live.

| ID | Status | Evidence / gap |
|---|---|---|
| UV01 expired notices / intake model | **Partly** | Banner removed (no "July 2026" in `src`). No intake/deadline model with source/year/expiry: `lastAdmissionDate` is free text (`catalog.ts:959` "Check current admission cycle"); no auto-expiry. |
| UV02 claims register | **Partly** | Unsupported claims removed from home intro, About, How-we-verify, universities, guides (inc. 23/26/47/48). **No claims register exists** (grep finds the term only in the master plan). |
| UV03 reviews/ratings | **Partly (owner deferral)** | Visible items retained per §14.10. **`AggregateRating` JSON-LD still emitted** from static counts (`courses/[slug]/page.tsx:85`, `universities/[slug]/page.tsx:61`). The §14.10 "review schema separately" step has not been done. |
| UV04 compare gate honesty | **Done** | Server-validated HttpOnly cookie + DB verification (inc. 1); selection preserved, counsellor promise removed (inc. 27). |
| UV05 recommender eligibility honesty | **Partly** | Deterministic 3-filter matcher, no false eligibility claims (inc. 30). Collects no qualifications, so there is no eligible / possibly eligible / needs confirmation output. |
| UV06 AI/Groq | **Not started** (honesty part done) | Scripted chat removed. No `GROQ` reference anywhere in `src`/`scripts`. |
| UV07 URL filters | **Done** | inc. 21 (`course-explorer.tsx`), plus specializations, articles and guides (inc. 31–33). |
| UV08 page length / cards | **Partly** | Home intro is 38% shorter (inc. 23); the mobile filter is inline. **No pagination on the course listing** (no page-size logic in `course-explorer.tsx`). |
| UV09 Blog vs Guides | **Done** | inc. 22. |
| UV10 a11y defects | **Mostly** | Sort label, contrast/cards and the scroll region were reworked (inc. 21/26/39). No documented axe rerun on the original failures; manual SR review not done. |
| UV11 dialog focus | **Done** | inc. 1 + 25 (portal, inert, focus trap/restore). |
| UV12 single publishing pipeline | **Mostly** | Public reads come from the validated CMS snapshot (inc. 6); revisions, rollback and working drafts are in place; the seed no longer overwrites (inc. 3). Missing: rendered preview, scheduled publish, last-good snapshot/caching. The legacy direct-edit path still exists under "Advanced record settings". |
| UV13 sitemap lastmod | **Done** | `src/lib/sitemap.ts` uses CMS timestamps or omits lastmod. |
| UV14 utility canonical | **Not done** | `/shortlist` and `/lead` are noindex but still inherit `canonical: "/"` from `layout.tsx:22`. |
| UV15 GA/GTM duplication | **Not done** | `analytics.tsx` still loads both and `trackEvent` pushes both formats. No consent handling. |
| UV16 Node 20 EOL | **Not done** | `engines` `>=20.9 <21` (app + root), `.nvmrc`=20, Dockerfile `node:20-bookworm-slim`. |
| UV17 image scope | **Not done** | Runner still copies the full root `node_modules` (Dockerfile). |
| UV18 shared rate limit / recognition model | **Not done** | `rate-limit.ts` is in-memory, single-process. `ugcApproved: z.literal(true)` and `universityId: z.enum(["muj","smu","amity"])` are hard-coded (`catalog-snapshot.ts:11,27`). |

## 3. §5 page plan

| Page family | Status | Notes |
|---|---|---|
| Home | Partly | Shorter intro, search, cross-university shortcuts, illustrations. Retained ratings/salary (deferred). |
| Course listing | Partly | URL filters, chips, empty state done. No pagination; no "verified eligibility"/schedule filters (no such data). |
| Course detail | Partly | Section picker, payment cards, illustrative curriculum label, certificate fixes. No source-freshness display per fact, no intake, no international fees, recognition not evidenced. |
| University listing/detail | Mostly | Cards, counts, gallery removed, scholarship cards. Dated approvals/rankings with scope not done. |
| Compare (interactive) | Mostly | Table/mobile rows, URL selection, gate. **No differences-only toggle and no print/share view.** |
| Editorial compare articles | Done | Public, semantic tables (inc. 37). |
| Recommender | Partly | Deterministic 3-question matcher; no qualifications step, no Groq. |
| Shortlist | Done | Selection, undo, malformed-storage recovery (inc. 28). Print/notes not done. |
| Resources/guides/articles | Mostly | Discovery, reading navigation, byline. Article bodies not source-verified. |
| Specializations | Done (UI) | inc. 31/36. |
| EMI tool | Done | Numeric inputs, totals, 0% handling (inc. 29). Not category-aware (no international fees). |
| Apply now flow | Done (local) | Contact-first, step-1 save, preferences, OTP (inc. 1, 41). External CRM delivery not configured. |
| About / verification / contact | Done | inc. 47/48 + content-team page. |
| CMS/admin | Mostly | Roles, revisions, rollback, drafts, quality dashboard, paginated queues/inbox (inc. 2–20, 49–72). Missing: rendered preview, scheduling, source-check scheduler, per-finding resolution workflow. |

## 4. §7 tool roadmap

| Tool | Status |
|---|---|
| Eligibility pre-check | Not started (prepared eligibility text only; no rules engine) |
| Total-cost comparison | Not started (EMI totals only; fee components/extra charges unmodelled) |
| Improved comparison + share/print | Partly (shareable URL of IDs; no print view, no differences-only toggle) |
| Groq recommender | Not started |
| Study-time planner, document checklist, scholarship finder | Not started |
| Opt-in alerts | Not started (out of current scope per §14.13) |
| Groq follow-up questions, learner portal, verified reviews, Hindi | Not started / deferred |

## 5. §14 specifications

| Spec | Status | Evidence / gap |
|---|---|---|
| 14.1 Apply now + contact-first | **Done locally** | `lead-form.tsx`, `lead-capture.ts`, `lead-consent.ts`, migration 0004; 22 API + 24 browser checks. Real OTP send never tested. **No automatic step-1 CRM delivery**: `crm-sync.ts:110` states that no auto-enqueue trigger exists. |
| 14.2 Groq | **Not started** | No code, env vars or model chosen. Needs `GROQ_API_KEY`/`GROQ_MODEL` from the owner. |
| 14.3 Official-source refresh / richer pages | **Partly** | Evidence files for all 30 courses. Page enrichment limited to UI; facts not applied. |
| 14.4 Author + Search Console | **Partly** | Byline/schema/profile in code (not live). Search Console checklist not started (needs property access). |
| 14.5 Compare access | **Done locally** | — |
| 14.6 Admin publishing | **Mostly** | See UV12. Missing: rendered preview, scheduled publish/expiry, last-good snapshot, cache invalidation (pages are simply dynamic). |
| 14.7 Three-university verification matrix | **Partly** | `docs/source-verification-register.json` covers 30/30 with statuses. The completion gate is not met. |
| 14.8 International/NRI fees | **Evidence only** | MUJ 9/9 and SMU 9/9 base schedules cross-checked; Amity unresolved. **No fee-category data model, selector or public section in code** (grep for fee category/NRI fee finds only explanatory copy). |
| 14.9 English-only | Done | No language switcher. |
| 14.10 Deferred claims | **Partly** | Retained, but the required **deferred claims register does not exist**, and AggregateRating schema has not been reviewed. |
| 14.11 Editorial permissions | **Done locally** | Server-side role checks; 31 + 40 + 46 smoke checks. |
| 14.12 Manual + weekly scheduled checks | **Not started** | `scripts/source-import.js` is a manual CLI. No admin "Check for updates" button, scheduler or diff-to-draft pipeline. |
| 14.13 Lead capture only | Done | No booking UI. |
| 14.14 External CRM | **Config UI only** | Settings/mapping/history UI (inc. 61–67). Sync disabled locally; `unnatividya-crm-worker` is profile-gated (`unnatividya-crm-sync`) and off by default. |

---

## 6. "Remaining approved work": what each item concretely needs

| Item | Concrete work | Files | Owner inputs |
|---|---|---|---|
| Field-level verification + publish corrections | (a) Apply the 28 eligibility, 30 curriculum and 1 MAJMC fee proposals via CMS after deploy. (b) Resolve 2 held eligibility cases and the Amity fee discrepancies. (c) Regulator (UGC-DEB) session matching for 30. (d) Model international fees (new fields + UI + compare/EMI awareness). (e) Clear `fee-review-issues.json` entries via code change after admissions confirmation. | `src/data/prepared-*.json`, `fee-review-issues.json`, `eligibility-review-issues.json`, `catalog-snapshot.ts`, course/compare/EMI components, new migration for fee categories | Admissions answers from MUJ/SMU/Amity (questions are listed in the CONTENT_VERIFICATION_FOLLOWUP and AMITY/SMU fee docs), plus an admin who reviews and applies proposals |
| Publishing follow-up | Rendered draft preview, scheduled publication, persistent last-good snapshot + caching/invalidation, remaining friendly forms (FAQs etc.) | `catalog-snapshot-server.ts`, admin revision pages, new migration likely | Decide caching/staleness tolerance |
| Manual + weekly source checks | Admin trigger + scheduler (cron/worker), fetch/extract/diff into `catalog_revision` drafts, source status UI, per-domain limits | `scripts/source-import.js` → new worker/route; compose service or cron; migration for source schedule | Confirm day/time/timezone; hosting for the scheduler (new compose service or host cron) |
| Groq recommender | Server route, structured output validation, eligibility hard filters, fallback to the current deterministic matcher, rate/budget limits, evaluation suite | new `src/app/api/recommender/*`, `recommender-quiz.tsx`, compose env | **GROQ_API_KEY, model choice, monthly budget/limits** |
| Discovery/nav, performance/runtime, SEO/Search Console, tools | Listing pagination, compare differences-only + print, UV14 canonical fix, UV15 analytics owner, Node LTS + slimmer image, eligibility/total-cost tools | various | **Search Console/GA4/GTM access**; choose GA-direct vs GTM |
| External CRM + email E2E | Define upsert contract (external ID), mapping, auto-enqueue on step 1 + updates, retries without duplicates; real ZeptoMail OTP test to dedicated recipients | `crm-sync.ts`, `crm-sync-worker.js`, `api/leads/*`, compose profile | **Target CRM endpoint/API contract + test credentials**; ZeptoMail key (exists in `.env.example`; confirm prod value and sender domain) + test inbox |

## 7. Data verification state (30 courses: MUJ 9, SMU 9, Amity 12)

| Fact | Evidence prepared | Published/applied | Notes |
|---|---|---|---|
| Domestic base tuition | 30/30 official pages observed. 29 agree with CMS. MUJ 9 + SMU 9 cross-checked with 2026–27 prospectus. Amity 12 INR consistent but **9 semester schedules exceed base by INR 200** | **0 marked verified**. MAJMC fix (130,000 → 190,000) prepared, **not applied** | `fee-review-issues.json` has 30 open findings shown in admin |
| International/NRI fees | MUJ: NRI + other-nationals cross-checked (9). SMU: "international" cross-checked, NRI applicability unconfirmed (9). Amity: unconfirmed (12) | **0**; no data model | Must not be currency-converted |
| Eligibility | 28 prepared category-specific drafts (`prepared-eligibility-drafts.json`) | **0 applied** | Held: Amity BA (foreign/NRI evidence), MUJ MSc Mathematics (conflicting sources) |
| Curriculum | 30 paraphrased semester overviews (`prepared-curriculum-drafts.json`) | **0 applied**; 0 subject-level verified | Public pages label curricula "Illustrative study areas" (repo only) |
| Recognition | 27 historical 2025–26 UGC-DEB candidate matches | **0**; register says `pending_regulator_review` for 30/30 | — |
| Intake/deadlines | Not researched | none | No model |
| Ratings/testimonials/placement | Not researched (owner deferral) | displayed unverified | No claims register |

**What the admin must do after deployment to publish the prepared corrections:** for each course go to CMS → Courses → Edit → Propose or review revisions.
- Eligibility: Preview and then Load eligibility correction (28 courses).
- Curriculum: Preview and then Load prepared outline (30 courses). Confirm the BA route before loading.
- MAJMC fees: Load coordinated fee correction (1 course).
- For each, add the source and a review reason, then Submit for review.
- An ADMIN then opens Catalog revisions, reviews the diff and clicks Apply reviewed revision.

Loading does **not** set `verified`. Changing the verified markers needs a deliberate admin decision. Because each course takes 2–3 proposals, roughly 59 proposals need review in total. The docs recommend confirming the current session first, especially for Amity (the 9 discrepancies), and holding Amity BA and MUJ MSc Maths.

---

## 8. Technical health

| Check | Result |
|---|---|
| `tsc --noEmit -p .` (root TS 5.9.3) | **Pass** (exit 0, no errors) |
| `eslint src` (root eslint 9.39.5 + `eslint.config.mjs`) | **Pass**: 0 errors, 4 warnings (`no-location-assign-relative-destination` in `admin-login-form.tsx` ×2, `admin-logout-button.tsx`, `admin-sidebar.tsx`) |
| `eslint scripts` | 201 errors, all `no-require-imports` in `.cjs` smoke scripts. The config override covers only `scripts/**/*.js`; it does not cover `.cjs`. Cosmetic. |
| App `node_modules` | Present but minimal (next **16.1.6**, typescript; no eslint) |
| CI | **The website is not covered by CI**. Root `tsconfig` excludes `apps`; lint runs only `lint:crm`; the Docker job builds only the CRM image. |
| **Next.js version skew** | `apps/unnatividya/package.json` + its lockfile pin **16.1.6**. Local builds via `npm --prefix apps/unnatividya` use that. The **Docker image installs the root lockfile** (`npm ci` at repo root; no workspaces), which became **16.3.8** in `d4bd0e6` (5 Oct). The next VPS build will therefore run 16.3.8, a version **none of the 72 increments' browser suites were run against**. |
| `npm audit` (app lockfile) | 1 critical (next ≤16.3.2: 30 advisories incl. RCE in AVIF image optimization, middleware bypasses, SSRF, cache poisoning, DoS), 2 high (postcss, sharp/libvips). Fix: next 16.3.8. |
| `npm audit` (root lockfile, what Docker uses) | Next is clean. Only 2 moderate (uuid via exceljs, CRM side). |
| Node | Engines/Dockerfile/CI = Node 20 (EOL). The local shell is Node **23.10.0**, outside the engines range, so local validation ran on a different runtime from production. |
| Dockerfile | 3-stage. Builds from the root lockfile and copies the **full root node_modules** into the runner (UV17), which includes all CRM deps. Runs as non-root. `.dockerignore` excludes only the root-level `node_modules`/`.next`, so a local `apps/unnatividya/node_modules` would be sent into the build context. That is harmless on a clean VPS checkout. Build-time args bake GA/GTM/verification values into the image. |
| VPS compose | `unnatividya-web` (port 3100, `data-pg` + `edge` networks, healthcheck `/api/health`). `unnatividya-crm-worker` (same image, `node scripts/crm-sync-worker.js`, profile `unnatividya-crm-sync`, off by default). Caddy proxies apex + www, CSP allows googletagmanager/GA/zeptomail. |
| Migrations | 0001–0007 present. 0004–0007 are the ones the docs require for this release. Runner `scripts/db-migrate-local.js` records applied files in `schema_migration`. 0004 is additive (`if not exists`). **VPS status unknown; presumed not applied** (the live code predates them). |
| Env vars read by `src` | `NEXT_PUBLIC_UNNATIVIDYA_SITE_URL`, `UNNATIVIDYA_DATABASE_URL`, `UNNATIVIDYA_SESSION_SECRET`, `UNNATIVIDYA_CMS_SETUP_TOKEN`, `ZEPTOMAIL_API_URL/KEY/FROM_EMAIL/FROM_NAME`, `GOOGLE_SITE_VERIFICATION`, `BING_SITE_VERIFICATION`, `NEXT_PUBLIC_GA_ID`, `NEXT_PUBLIC_GTM_ID`, `INDEXNOW_ENABLED/KEY/KEY_LOCATION`, `NODE_ENV`. These match the compose list. No new env is needed for the 72 increments. Groq would add `GROQ_API_KEY`/`GROQ_MODEL`. The local `.env` has `UNNATIVIDYA_CMS_SETUP_ENABLED`, which no code reads. |
| Rate limiting | In-memory per process: lead-capture 10/10 min/IP, lead-preferences 30/10 min, OTP send 5/10 min/lead, OTP verify 30/10 min, admin login 10/15 min. Acceptable for one replica only (UV18). |
| Caching | New code reads the catalog **dynamically on every request** with `no-store` on `/courses/*` and `/universities/*`. Live currently serves prerendered/static (s-maxage 1y). After deploy: more DB load and slower TTFB, and **a DB outage takes public pages down** (no last-good snapshot). Not load-tested. |
| Analytics (UV15) | Dual GA+GTM path unchanged. Live HTML shows neither, so analytics is probably not configured. Unverified. |
| Structured data | AggregateRating built from static counts on course/university pages (repo and live). This is a policy risk under Google's review-snippet rules and is not yet reviewed. |

---

## 9. Owner inputs needed

1. **Approval to deploy** the 72 increments, with a maintenance window, a backup, and a person to run the runbook in `CMS_PUBLISHING_DEPLOYMENT.md`.
2. **Decide the Next.js security fix path:** deploy current `main` (Next 16.3.8 via the root lockfile) after testing, or ship a hotfix image of the live code with Next bumped.
3. **Admin reviewer(s)** to apply about 59 prepared proposals, and a decision on what counts as "verified".
4. **University admissions answers** on Amity fee discrepancies and NRI/foreign categories, SMU NRI applicability, MUJ MSc Maths eligibility, extra charges, and current intakes/deadlines.
5. **Groq** API key, model choice and budget.
6. **External CRM** endpoint, auth, upsert/external-ID contract, field mapping and test credentials.
7. **ZeptoMail** production key confirmation, sender-domain verification and a test recipient for an end-to-end OTP check.
8. **Search Console / GA4 / GTM** access, and a choice of a single analytics owner (GA direct or GTM).
9. Weekly source-check day/time/timezone, and where the scheduler runs.
10. Claims-register owner for the deferred ratings, testimonials and salary figures; a decision on the AggregateRating markup.
11. Node LTS target (e.g. 22 or 24) for website and CRM together.

## 10. Deployment gaps and suggested order

1. **Security first:** live is on Next 16.1.6 with AVIF optimization enabled.
   - Option A: bump `apps/unnatividya/package.json` and its lockfile to 16.3.8 so local matches Docker. Rebuild, rerun the smoke suites, then deploy `main`.
   - Option B: an interim mitigation such as disabling AVIF/`/_next/image` at Caddy. This is untested and needs owner approval.
2. Deploy per `CMS_PUBLISHING_DEPLOYMENT.md`:
   - Run the backup.
   - Build `unnatividya-web`.
   - Run `db-migrate-local.js` (0004–0007).
   - Run `check-catalog-ready.js`, which must report 3 universities, 30 courses, `ready: true`.
   - Start the service and run the smoke check.
   - **Risk:** VPS catalog rows came from the old destructive sync; their publication status and field completeness are unknown until readiness runs. There is no static fallback.
3. After deploy, publish the MAJMC fee correction and the other prepared proposals through CMS.
4. Add the website to CI: tsc, eslint and an image build.

## 11. Risks

- **Critical:** Next 16.1.6 is in production with the RCE-class advisory and AVIF enabled.
- **High:** a public fee is wrong (MAJMC ₹1.3L vs official ₹1.9L). An expired admissions deadline is still shown. A named "Senior education counsellor" author is not a real reviewer, against owner policy.
- **High:** the large undeployed change set (72 increments plus 4 migrations plus a switch from static to dynamic DB reads) has only been validated locally on Next 16.1.6 and Node 23. Production will be Next 16.3.8 and Node 20.
- **Medium:** no last-good snapshot means a DB outage causes public outages after the cutover. The in-memory rate limiter blocks horizontal scaling. The website is not in CI.
- **Medium:** AggregateRating markup from unverified static counts. No claims register.
- **Medium:** Node 20 EOL.
- **Low:** duplicate security headers; lint errors limited to `.cjs` scripts; www served without redirect (canonical mitigates).

## 12. Older plan (`/Users/arjunh/Documents/crm/UNNATIVIDYA_WEBSITE_IMPLEMENTATION_PLAN.md`): superseded parts

The master plan revision 2 supersedes the following:
- Static generation as the catalog source of truth is replaced by admin-panel reviewed publishing (§14.6).
- The 5-question scripted recommender that captures the lead after partial value is replaced by a free Groq recommender with deterministic filters and no lead capture (§14.2).
- The lead wizard's course-first order and phone "verify your number" are replaced by contact-first, email OTP and Apply now (§14.1).
- CRM = this repo's Unnatify CRM (§14) is replaced by an owner-configured external CRM (§14.14).
- Nginx/certbot/npm-workspace deploy (§15) differs from reality: Docker Compose + Caddy, no workspaces.
- Env names `CRM_API_URL`, `OTP_PROVIDER`, `WHATSAPP_NUMBER` (§16) were replaced by ZeptoMail + DB-stored CRM config.
- Named authors and "Talk to an expert" style CTAs are replaced by the Content Team byline and Apply now.

Still broadly valid: route families, SEO/programmatic guardrails, the go-live owner checklist (§17: Search Console, legal approvals, claims confirmation).

## 13. Uncertainty / not verified

- Local and VPS DB state (applied revisions, publication flags, applied migrations) was not queried: the permission was denied.
- Live analytics configuration was not verified with DebugView.
- The advisory exploitability was not tested, deliberately. The claim rests on `npm audit` advisory data plus the observed version and AVIF output.
- The live deploy commit is inferred from sitemap lastmod and behaviour; no release SHA is exposed.
- The 72 increments' test claims were taken from IMPLEMENTATION_PROGRESS.md and spot-checked in code, not rerun. The browser smoke suites need a running local DB and Playwright.
