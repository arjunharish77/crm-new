# Unnati Vidya — Platform Enhancements Plan (Conversion Tracking, Shortlist, FAQ Expansion, CMS Sync)

> CMS publishing update — 30 September 2026: public catalog readers now use validated published database records. Before upgrading, follow [CMS publishing deployment](apps/unnatividya/docs/CMS_PUBLISHING_DEPLOYMENT.md), including the new image’s read-only readiness check before restart. Older static-source descriptions below are historical.

> Update — 30 September 2026: the historical catalog-mirror behavior described below is superseded. `sync-catalog-to-db.js` now inserts missing records as unpublished drafts, preserves all existing records and never archives entries missing from the code export. Public pages still use static catalog data pending the publishing migration. Current status: [implementation progress](apps/unnatividya/docs/IMPLEMENTATION_PROGRESS.md).

Companion to `20_UNNATIVIDYA_CONTENT_SEO_MASTER_PLAN.md` (content/SEO expansion, phases 0-4, complete) and `21_UNNATIVIDYA_NEW_ASSETS_CHECKLIST.md` (imagery). This document covers the next batch of work — not SEO content this time, but product/conversion features and a data-integrity fix. Status: **plan only, no development started.** This is a living document — more tasks will be added before development begins.

**Architecture decision already made** (confirmed 2026-08-09): for the Postgres CMS fix (§4), the direction is **keep `catalog.ts` as the source of truth, sync the DB to match it** — not migrate to Postgres, not retire the DB. See §4 for what that does and doesn't unlock.

---

## 1. Conversion event tracking (GA4/GTM) — DONE (2026-08-09)

### Current state
- `src/components/analytics.tsx` only injects the GTM/GA4 loader scripts (gated by `NEXT_PUBLIC_GA_ID` / `NEXT_PUBLIC_GTM_ID` env vars). It fires pageviews only.
- Zero custom event tracking exists anywhere in the codebase today — confirmed by grep (`gtag(`, `dataLayer.push`, `trackEvent` all resolve only to the base loader script). Every interactive feature (lead form, EMI calculator, recommender quiz, compare tool, course-card CTAs) is currently invisible to analytics beyond the page load.
- There's already a working precedent for "fire something on click without touching every component": the codebase uses a `data-open-lead` attribute on plain `<Link>`s across many components, presumably read by one global delegated listener. **Reuse this exact pattern** for tracking instead of converting server components to client components one by one.

### Plan
1. **New `trackEvent(name, params)` helper** — add to `src/components/analytics.tsx` (or a new `src/lib/analytics-events.ts` if that file is getting crowded). Pushes to `window.dataLayer`.
   **Critical implementation detail:** GTM/GA4 now load via `strategy="lazyOnload"` (§6 fix), so their own inline script — the one that normally runs `window.dataLayer = window.dataLayer || []` — may not have executed yet when an early user interaction fires. `trackEvent()` must do that initialization itself (`window.dataLayer = window.dataLayer || []` before pushing), not assume GTM already did it. Also no-op safely on the server / when `window` is undefined.
2. **Delegated click tracking, two layers:**
   - **Extend the existing `data-open-lead` delegated listener** to also fire a generic `lead_cta_click` tracking event (params: `intent` + `course_id`, both already present in that link's `href` query string in every case). This single change instruments *every* existing lead-modal entry point at once — homepage hero callback button, `sticky-ctas.tsx`'s callback button, course-card "Enquire", blog/newsletter "Subscribe", article "Ask a counsellor", EMI calculator's counsellor CTA — without touching each of those components individually.
   - **Add a second, sibling delegated listener** for a `data-track-event` + `data-track-params` (JSON string) attribute pair, for interactions that aren't lead-modal opens (view/compare link clicks, source-link clicks, WhatsApp click) — so these also get tracked **without converting server components to client components**.
3. **Event taxonomy** (name → when → params):

   *Lead / conversion*
   | Event | Fires when | Params |
   |---|---|---|
   | `lead_cta_click` | Any `data-open-lead` click, sitewide (see above) | `intent`, `course_id` |
   | `lead_form_submit` | Right after `/api/leads` POST succeeds in `lead-form.tsx` | `intent` |
   | `lead_verified` | Right after OTP verification succeeds (`unlockCompare()` call site) — the strongest conversion signal | `intent` |
   | `whatsapp_click` | Click on the WhatsApp icon in `sticky-ctas.tsx` (`data-track-event`, since it's a plain external link, not `data-open-lead`) | — |

   *Tools / features*
   | Event | Fires when | Params |
   |---|---|---|
   | `emi_calculator_used` | Once per session on fee-input blur or tenure change (guard against firing per keystroke) in `emi-calculator.tsx` | `course_id`, `fee`, `tenure_months` |
   | `recommender_step_answered` | Each `pick()` call in `recommender-quiz.tsx`, i.e. every question answered, not just completion — gives step-by-step drop-off visibility instead of a single pass/fail signal | `step_index`, `answer` |
   | `recommender_completed` | On the `phase → "results"` transition (single clean firing point already identified) | matched course ids |
   | `course_search` | Homepage hero search form submit, and `course-explorer.tsx`'s search input (debounced, fire on blur/pause rather than per keystroke) | `query`, `result_count` |
   | `course_filter_applied` | `course-explorer.tsx` stream/level checkbox toggles and the fee-range slider (debounced on the slider) | `filter_type`, `value`, `result_count` |
   | `compare_course_added` | Click on a course chip / "+ Add to compare" link (`data-track-event`) — the funnel step *before* landing on `/compare` | `course_id` |
   | `compare_view` | `/compare` page loads with ≥2 courses via the `add=` query param | `course_ids` |
   | `shortlist_add` / `shortlist_remove` | From §2's shortlist feature | `course_id` |

   *Content / trust engagement*
   | Event | Fires when | Params |
   |---|---|---|
   | `course_card_click` | Non-lead links on a course card ("View course" / "Compare") via `data-track-event` | `course_id`, `action` |
   | `university_card_click` | Homepage/university-listing card clicks, same mechanism | `university_id` |
   | `source_link_click` | Click on an official verification link in `SourceList` (`online-degree-guides/[slug]/page.tsx`) — directly measures whether visitors actually check the primary sources behind the site's "unbiased/verified" positioning | `source_hostname`, `guide_slug` |

   *Optional / lower priority — revisit only if the above proves useful first*
   - `blog_scroll_75` / `guide_scroll_75`: generic scroll-depth marker on long-form article bodies (blog posts, guide pages), via one shared `IntersectionObserver`-based hook rather than per-page code. Real content-engagement signal for a site this content-heavy, but adds its own moving part — sequence after the simpler click-based events are shipped and validated.
4. **Verification**: use GTM Preview mode / GA4 DebugView against a staging build before calling this done — confirm each event fires exactly once per real user action, not per render, and confirm `lead_cta_click` doesn't double-fire alongside the existing lead-modal-open behavior on the same click.
5. **Config check (not code):** confirm `NEXT_PUBLIC_GA_ID`/`NEXT_PUBLIC_GTM_ID` are actually set in the production environment per `19_ENV_FILES_REFERENCE.md` — if they're unset in prod today, all of this ships inert until that's fixed, which is a config task not a dev task.

### Implementation
Built exactly as planned, with one taxonomy simplification made along the way: `emi_calculator_cta_click` was dropped as a separate event once it became clear that CTA is already a `data-open-lead` link, so `lead_cta_click` already covers it — firing both would have double-counted the same click under two names.

- `trackEvent(name, params)` added to `analytics.tsx`, defensively initializing `window.dataLayer` itself rather than assuming GTM's own script already did (verified live — see below).
- Two delegated `document` click listeners: the existing `data-open-lead` handler in `lead-wizard-modal.tsx` now also fires `lead_cta_click` (covers every lead-modal entry point sitewide — homepage hero, `sticky-ctas.tsx`, course cards' "Enquire", EMI calculator's counsellor CTA, blog "Subscribe", article "Ask a counsellor" — in one change); a new sibling listener in `analytics.tsx` reads `data-track-event`/`data-track-params` for everything else.
- All events from the taxonomy instrumented: `lead_form_submit`/`lead_verified` in `lead-form.tsx`; `emi_calculator_used` in `emi-calculator.tsx` (fires once per page view, gated by a ref, on fee-blur/tenure-click/course-select rather than per keystroke); `recommender_step_answered`/`recommender_completed` in `recommender-quiz.tsx` (refactored the scoring logic into a `topMatches()` function so the completion event can compute matched course ids from the just-submitted answer, not a stale pre-render closure); `course_search`/`course_filter_applied` in `course-explorer.tsx` (added a `countMatches()` helper so `result_count` reflects the filter change being applied, not the pre-change state); `compare_course_added` and `course_card_click` on course cards/list items across `course-card.tsx`, `course-explorer.tsx`, and `page.tsx`; `university_card_click` on homepage university cards; `whatsapp_click` on `sticky-ctas.tsx`; `source_link_click` on `SourceList` in the guide pages (threaded a `guideSlug` prop through); `compare_view` via a new tiny `TrackOnMount` client component (needed because `/compare` is a server component and `trackEvent` needs `window` — fires once on mount from an empty-deps effect).

**Verified live**, not just by reading the code — ran the built production server and drove it with Playwright:
- Confirmed `window.dataLayer` is `undefined` before any interaction (GTM/GA aren't configured locally, so the loader script never runs) — the exact scenario this defensive-init guards against — and that clicking a save button still correctly produced `window.dataLayer = [{"event":"shortlist_add","course_id":"mba-amity"}]`. A second click (`course_card_click`) appended correctly alongside it.
- `npx tsc --noEmit` and `npm run build` both clean throughout.

### Files touched
Edited: `analytics.tsx`, `lead-wizard-modal.tsx`, `lead-form.tsx`, `emi-calculator.tsx`, `recommender-quiz.tsx`, `course-card.tsx`, `course-explorer.tsx`, `compare/page.tsx`, `sticky-ctas.tsx`, `online-degree-guides/[slug]/page.tsx` (`SourceList`), `page.tsx` (home search + university/course cards).
New: `track-on-mount.tsx`.

### Effort
Small–medium, as estimated.

---

## 2. Save / shortlist courses — DONE (2026-08-09)

### Current state
- No global client state library exists (no Context/Zustand/Redux — confirmed via grep). The only existing `localStorage` usage in the app is `uv_lead_unlocked` (compare-gate), which pairs a localStorage key with a custom `window` event (`uv-lead-unlocked`) for cross-component sync — this is the pattern to copy.
- `Course.id` (e.g. `"mba-muj"`) is already the stable key used everywhere for compare (`/compare?add=<id>`) — the natural shortlist key.
- `course-card.tsx` has no save/bookmark affordance today, not even hidden. `/compare` already supports arbitrary course selection today (via the `add=` URL query, capped at 3) — shortlist is a complementary, longer-lived version of the same idea (unlimited count, persists across visits, not just a 3-way comparison).

### Plan
1. **`src/lib/use-shortlist.ts`** (client hook) — reads/writes a `uv_shortlist` localStorage key (array of course ids), exposes `{ ids, isSaved(id), toggle(id), count }`, dispatches a custom `uv-shortlist-changed` window event on mutation (mirrors `uv_lead_unlocked`'s pattern exactly).
2. **`src/components/save-button.tsx`** — small `"use client"` leaf component (heart/bookmark icon + count-aware styling), taking just `courseId`. Dropped into the still-server-rendered `course-card.tsx` and the course detail page header — keeps "use client" pushed to the leaf, not the whole card.
3. **Header indicator** — a small "Shortlist (n)" pill in `site-header.tsx` (client, already has interactive state from the mobile-nav work this session), linking to `/shortlist`.
4. **`/shortlist` page** — server shell (`src/app/shortlist/page.tsx`) passing the full `courses` array from `catalog.ts` as props into a client `ShortlistView` component, which filters by the ids read from `useShortlist()` and renders using the existing `course-card.tsx`. Set `robots: { index: false }` in its metadata — this is user-specific/empty-by-default content, not something that should be indexed or included in the sitemap.
5. Wire `shortlist_add` / `shortlist_remove` GA4 events from §1 into the hook's mutation points.

### Implementation
Built as planned, with one correction discovered mid-build: `course-card.tsx` turned out to be **dead code** — grep confirmed it's not rendered by any real page (the homepage and `/courses` each have their own inline card markup; `course-explorer.tsx` has its own list-item markup). Adding `<SaveButton>` only to `course-card.tsx` would have shipped a feature nobody could see. Added it to every place a course is actually shown to a real visitor instead: the homepage's "Popular online degrees" cards, `course-explorer.tsx`'s list (the real `/courses` page), the university detail page's course table, and the course detail page header — plus `course-card.tsx` itself, kept in sync for whenever it does get used.

- `useShortlist()` hook (`src/lib/use-shortlist.ts`) — `uv_shortlist` localStorage key + a custom `uv-shortlist-changed` window event, mirroring the existing `uv_lead_unlocked`/`uv-lead-unlocked` pattern in `lead-form.tsx`/`compare-gate.tsx` exactly. Fires `shortlist_add`/`shortlist_remove` via `trackEvent` from §1.
- `<SaveButton courseId>` — a small `"use client"` leaf (heart icon, filled when saved) so the pages embedding it stay server components.
- Header: a heart icon + count badge next to the existing nav, linking to `/shortlist`, in both the desktop bar and the mobile panel.
- `/shortlist` page: server shell passing the full `courses` array to a client `ShortlistView`, which filters by saved ids and renders via `course-card.tsx` (this is what finally puts real traffic through that component). `robots: { index: false, follow: false }`, matching the existing `/lead` page's convention — and correctly absent from `sitemap.ts`'s manually-curated route list, so no extra step was needed there.

**Verified live** with Playwright against the built production server, not just read through: saved a course from `/courses`, confirmed `localStorage.uv_shortlist` updated, confirmed the header badge updated to "1", navigated to `/shortlist` and confirmed exactly that course rendered, removed it from there and confirmed the empty state appeared and localStorage cleared. Full round trip, all correct.

### Files touched
New: `src/lib/use-shortlist.ts`, `src/components/save-button.tsx`, `src/components/shortlist-view.tsx`, `src/app/shortlist/page.tsx`.
Edited: `course-card.tsx`, `course-explorer.tsx`, `courses/[slug]/page.tsx`, `universities/[slug]/page.tsx`, `page.tsx`, `site-header.tsx`.

### Effort
Medium, as estimated.

---

## 3. FAQ expansion across all page types (plain-language, page-sourced)

### Current state (audited page by page)
| Page type | Count | Visible FAQ today | JSON-LD today | Source |
|---|---|---|---|---|
| Homepage | 1 | 4 | **No schema** | inline array in `page.tsx` |
| Course detail | 30 | 4 — **identical boilerplate on every course**, not course-specific | Yes | `commonCourseEnrichment()` in `catalog.ts` |
| University detail | 3 | 3 | Yes | `universityEnrichmentById` in `catalog.ts` |
| Blog post | 26 | **0** | **No schema, no field exists** | — |
| Comparison | 18 | 4, computed from real data | Yes | `comparisonFaqs()` |
| Specialization | 101 | 2–3, computed from real data | Yes | `specializationFaqs()` |
| Fee guide | 17 | 4, templated from real data | Yes | `fee-guides.ts` |
| Eligibility guide | 17 | avg 2.18 (range 1–4), hand-written | Yes | `guide-content.ts` |
| Career-scope guide | 17 | avg 2.47 (range 1–3), hand-written | Yes | `guide-content.ts` |
| UGC-approval guide | 17 | avg 1.65 (range 1–3), hand-written | Yes | `guide-content.ts` |
| `/how-we-verify` | 1 | 0 | 0 | — |
| `/recommender` | 1 | 0 | 0 | — |
| `/tools/emi-calculator` | 1 | 0 | 0 | — |

Existing tone is already plain and specific where it exists (e.g. *"Does a higher fee mean a better degree? No. Both universities offer UGC-entitled online degrees with equal degree validity..."*) — the target writing style below should match this, not the more formal tone of the long-form guide articles it's drawn from.

**Honest SEO framing** (so this isn't oversold): Google restricted FAQ *rich snippet* display in search results mostly to government/health sites back in 2023 — adding schema won't reliably win the visual rich-snippet real estate it used to. It's still worth doing because it (a) costs nothing once the content exists, (b) is exactly the structured format AI Overviews / ChatGPT / Perplexity lift answers from when citing a source, and (c) the underlying plain-language Q&A content itself helps "People Also Ask" matching and on-page relevance regardless of whether the schema renders visually.

### Plan — split by how the content gets generated

**3A. Schema-only + algorithmic top-ups (quick, no hand-writing)**
- ~~Homepage: wrap the existing 4 FAQs in `FAQPage` JSON-LD.~~ **DONE (2026-08-09)** — extracted the FAQ array to a `homeFaqs` constant (so the rendered accordion and the schema can't drift apart) and added the `<JsonLd>` block. `tsc`/`build` clean.
- ~~Fee guides, comparison pages, specialization pages: add 1–2 more templated question patterns to each generator function.~~ **DONE (2026-08-09)**:
  - `fee-guides.ts`: comparison guides 4→6 (added shortest-duration and does-specialization-change-fee), single-university guides 4→6 (added specialization count and career roles).
  - `comparisons.ts`: 4→6 (added duration comparison and specialization-count comparison, both computed from real per-pair data via a small `durationMonths()` parser).
  - `specializations.ts`: comparison pages 3→4, single-university pages 2→3 (added a career-roles FAQ to both, sourced from the course's own `careerRoles` field).
  - Verified live: `mba-fees` → 6 questions, an MBA comparison page → 6, `mba-finance` (multi-university specialization) → 4, `b-com-accounting-with-ai` (single-university specialization) → 3.

**3B. Course-page FAQs — replace the boilerplate with real per-course generation** — **DONE (2026-08-09)**
- New `src/lib/course-faqs.ts`: `buildCourseFaqs(course)` composes 6 Q&As per course — UGC-entitlement, fee + EMI, specializations, eligibility, career roles, duration — with templated *questions* but *answers* pulled straight from that course's own fields. Removed the now-dead `faqs` array from `commonCourseEnrichment()` in `catalog.ts` (confirmed via grep it had zero other consumers) and wired the new generator into both the course page's `FAQPage` JSON-LD and its rendered accordion.
- **Verified live** across multiple courses, not just one: MUJ's Online MBA correctly shows its 13 specializations, ₹1,80,000 fee, and its own career roles; MUJ's Online BCA on the same generator correctly shows a completely different 3 specializations and its own roles — confirming the 30 course pages are no longer identical boilerplate.

**3C. University-page FAQs — hand-written expansion (cheap, only 3 pages)** — **DONE (2026-08-09)**
- Expanded each of the 3 universities from 3 → 6 FAQs in `universityEnrichmentById` (`catalog.ts`), each grounded in that university's own already-researched `factTiles`/`rankings`/`scholarships`/`placementSupport` data rather than generic filler, and picked to avoid overlapping the 3 questions each university already had:
  - MUJ (+3): placement support specifics, scholarships (merit up to 20% + defence/differently-abled/alumni concessions), WES recognition for study/work abroad.
  - SMU (+3): scholarships (defence/differently-abled/alumni/Northeast), EMI/instalment options, placement/career support.
  - Amity (+3): scholarships + EMI, WES recognition, January/July batch timing.
- No code change needed — the university detail page already renders `enrichment.faqs` directly with no length cap, and the same array already feeds both the visible accordion and the `FAQPage` JSON-LD, so both updated automatically.
- **Verified live**: rebuilt, started the production server, and confirmed via `curl` that all 3 university pages now render exactly 6 `Question` entries each in the FAQPage schema (was 3). `tsc`/`build` clean throughout.

**3D. Guide pages — hand-written expansion (the biggest batch)** — **DONE (2026-08-09)**
- Read the entire `guide-content.ts` (1,006 lines) into context and wrote 2 new hand-written FAQs for every one of the 51 guides myself, directly — rather than delegating to agents. Once the full file was in context, writing it directly was both faster and safer than delegating: this content has subtle, easy-to-lose nuances (legal-entity distinctions like "Amity University Rajasthan" vs. "Amity University Uttar Pradesh," hedged claims like "unverified marketing claim," a flagged "content-cloning error" on Amity's own site) that a delegated agent would need the same context to get right, and verifying its output for those nuances after the fact would cost nearly as much effort as writing it directly.
- Every new FAQ is strictly derived from facts already present in that exact guide's own `facts`/`differentiatorNote`/`universityHighlights`/`unverifiedClaimsNote`/`approvals` fields — no new research, no new claims introduced anywhere.
- **Actual result** (verified by parsing the file after all edits): every guide now has at least 3 FAQs (up from as low as 1) —
  | Guide type | Before (avg / total) | After (avg / total) |
  |---|---|---|
  | Eligibility | 2.18 / 37 | 4.18 / 71 |
  | Career-scope | 2.47 / 42 | 4.47 / 76 |
  | UGC-approval | 1.65 / 28 | 3.65 / 62 |

  ~102 new FAQs total (close to the ~150 estimate — came in lower because several guides only had one university's data to begin with, e.g. the SMU-only single-subject MA programs, which naturally support fewer additional angles than a 3-university cluster like the MBA).
- **Verified live**: rebuilt, started the production server, and `curl`-checked the FAQPage schema count on 5 spot-checked guides across all 3 types — every one matched the count computed by parsing the source file exactly (6, 5, 4, 3, 4).

**3E. Blog posts — new field + hand-written FAQs (zero today)** — **DONE (2026-08-09)**
- Added a required `faqs: Array<[question: string, answer: string]>` field to `BlogPost` in `blog.ts` (required, not optional, so TypeScript itself would catch any post left without one — and it caught nothing, confirming all 26 got one).
- Read the entire `blog.ts` (583 lines) and wrote 2–3 FAQs per post — 76 new Q&As total — each derived strictly from that specific post's own existing body paragraphs, headings, and tip notes. No new research, no claims beyond what each post already said.
- Wired `post.faqs` into `blog/[slug]/page.tsx`: added a `FAQPage` JSON-LD block (alongside the existing `Article`/`BreadcrumbList` schema) and a rendered accordion section using the same `faq-list`/`faq-item` classes already used on the guide pages, placed right after the article body and before the "Ask a counsellor" CTA.
- **Verified live**: rebuilt, started the production server, and `curl`-checked the FAQPage schema count on 6 spot-checked posts — all matched exactly (three 3-question posts, one 3, and the two genuinely shorter posts at 2 each, matching the source file precisely).

**3F. Tool/editorial pages — hand-written, cheap (only 3 pages)** — **DONE (2026-08-09)**
- `/how-we-verify`: 5 FAQs derived directly from the page's own 5 existing principles (UGC-DEB primary-source verification, unverified-claims flagging, last-reviewed dates, cross-page inconsistency flagging, no thin/templated pages).
- `/recommender`: 5 FAQs, including one deliberately honest one — *"Is this an actual AI model, or a fixed set of rules?"* — answered truthfully by reading `recommender-quiz.tsx`'s actual `scoreCourse()` logic (a deterministic scoring function, not an LLM call), rather than overselling the "AI" label the UI uses.
- `/tools/emi-calculator`: 5 FAQs derived from the calculator's own existing disclaimer text (no-cost/0% structure, lender-dependent approval, tenure options, processing fees, auto-fill behavior).
- All 15 verified live via the built production server: 5/5/5 `Question` entries respectively, in both schema and the rendered accordion.

### Rough total new content
~150 (guides) + ~90 (blog) + ~18 (university) + ~15 (tools) ≈ **270+ new hand-written FAQ items**, plus the algorithmic/generated ones for courses (3B) and the top-ups in 3A. Comparable in scale to the `guide-content.ts` authoring effort earlier this session — expect a similar multi-batch execution once approved.

### Files touched
New: `src/lib/course-faqs.ts`.
Edited: `page.tsx` (home), `catalog.ts` or its replacement generator, `universityEnrichmentById` entries, `blog.ts` (+ type), `blog/[slug]/page.tsx`, `guide-content.ts` (all 51 entries), `fee-guides.ts`, `comparisons.ts`, `specializations.ts`, `how-we-verify/page.tsx`, `recommender/page.tsx`, `tools/emi-calculator/page.tsx`.

### Effort
Large, content-heavy — by far the biggest task in this batch. Recommend running 3A/3B/3C first (fast, mostly mechanical) and treating 3D/3E as their own phased sub-project.

---

## 4. Fix the Postgres CMS drift — DONE (2026-08-09)

**Decision confirmed: keep `catalog.ts` as the source of truth; sync Postgres to match it.** This is the cheap, low-risk fix — not a migration to make Postgres authoritative, and not retiring the CMS.

### Current state (root cause, fully diagnosed)
- The public site **only ever reads `catalog.ts`** — confirmed via full import-graph check, zero public page/component/lib touches the database.
- The admin CMS (`/admin/courses`, `/admin/universities`) reads and writes **only Postgres**, via direct `query()` calls in server components and the `src/app/api/admin/catalog/*` routes. Nothing in that path ever reads or writes `catalog.ts`.
- **No sync ever existed in either direction** — not a regression, the two stores were seeded independently and have drifted ever since with zero reconciliation code. This is why admin edits today have no effect on the live site, and why the DB has stale data (e.g. the previously-found stale MUJ MBA eligibility text, the old `majmc-amity` name bug, missing specializations).
- Root structural mismatch: `catalog.ts` models courses/universities as fully-typed flat objects with every field required; Postgres only has 6–7 scalar columns (`id`, `slug`, `name`, `level`, `fee_inr`, etc.) plus one **unvalidated** `data jsonb` catch-all for everything else (specializations, eligibility, careerRoles, faqs, all of `UniversityEnrichment`). The admin API's zod schema validates the scalar columns but accepts the jsonb blob as `z.record(z.string(), z.unknown())` — completely unchecked, which is how required catalog.ts fields go missing or stale in the DB with no error anywhere.
- The DB has its own legitimate, unrelated tables that are unaffected by any of this: `lead_capture`, `crm_sync_*`, `seo_redirect`, `site_setting`, `cms_audit_log`, and the `source_import*` scrape-review pipeline (a genuinely useful separate workflow: staff review scraped facts, then an engineer manually incorporates confirmed ones into `catalog.ts` — the same process used for the catalog expansion earlier this session).

### Implementation
Split into two scripts instead of one, once it became clear the production container never has `src/` available (the Docker runner stage only gets compiled Next.js output plus `scripts/` and `migrations/` — confirmed by reading the existing `Dockerfile`, which explains explicitly in a comment why its CLI scripts are plain `require()`-based rather than TypeScript):

1. **`scripts/export-catalog.ts`** — a build-time-only step, run via `tsx` (already a devDependency one level up, in `crm/package.json`, and resolved via Node's ordinary ancestor `node_modules` walk — confirmed both by testing it locally and by checking `crm/package-lock.json` has it pinned, so a real `npm ci` in the Docker `deps` stage installs it correctly regardless of any local drift on a given machine). Imports `catalog.ts` directly (universities, courses, `courseEnrichmentById`, `universityEnrichmentById`) and writes a plain `scripts/catalog-export.json` snapshot. New npm script `export-catalog` in `apps/unnatividya/package.json`, and `unnatividya:export-catalog` in `crm/package.json` (mirroring the existing `unnatividya:build` pattern). Added `RUN npm run unnatividya:export-catalog` to the `Dockerfile`'s builder stage, right after `RUN npm run unnatividya:build` — since `scripts/` is already copied wholesale into the runner image, the generated JSON ships automatically with no other Dockerfile change needed.
2. **`scripts/sync-catalog-to-db.js`** — plain CommonJS `pg` client, same style as `create-admin.js`/`source-import.js`. Reads `catalog-export.json` and **upserts** `university`/`course` rows: scalar columns mapped directly (`fee` → `fee_inr`, etc.), everything else (specializations, eligibility, careerRoles, all of `UniversityEnrichment`/`CourseEnrichment`) rebuilt wholesale into the `data` jsonb column. Every catalog.ts entry is implicitly published, so sets `status='PUBLISHED'`, `is_published=true` unconditionally. Anything left in the DB that catalog.ts no longer lists gets `status='ARCHIVED'`, never deleted — reversible by construction. Wrapped in a single transaction (rollback on any failure, matching `create-admin.js`'s convention). New npm script `unnatividya:sync-catalog` in `crm/package.json`.
3. **Deploy wiring** — since this project has no CI/CD (deploys are manual `docker compose` commands per `17_UNNATIVIDYA_VPS_LAUNCH_GUIDE.md`, confirmed by checking `.github/workflows/ci.yml`, which turns out to belong to the unrelated CRM app in this monorepo, not Unnati Vidya), "wire into the deploy pipeline" means documenting it as a step in that guide — added to both the first-launch sequence (Part 5, right before `create-admin.js`) and the "Redeploy after a code change" step (Part 6), using the same `docker compose run --rm unnatividya-web node scripts/...` invocation as the existing `create-admin.js` step.
4. **Admin UI honesty banner** — added an amber notice to the top of both `course-edit-form.tsx` and `university-edit-form.tsx`: *"This data is sourced from `src/data/catalog.ts` and will be overwritten the next time that file is deployed and synced. To make a permanent change, edit the file directly rather than saving here."*
5. No changes needed to `lead_capture`, `crm_sync_*`, `seo_redirect`, `site_setting`, `cms_audit_log`, or `source_import*` — all genuinely DB-owned and unaffected.

**Verified against the real local Postgres DB** (not just a dry run): ran `sync-catalog-to-db.js` and confirmed every previously-diagnosed drift item is now actually fixed —
- `mba-muj` went from 0 specializations / generic eligibility text to 13 real specializations and the correct eligibility text.
- `majmc-amity` went from the stale "Online MA (JMC)" name to the correct "Online MA JMC".
- Course count went from 23 (stale) to 30 (matches catalog.ts, including all 7 courses added earlier this session).
- Ran it a second time immediately after — confirmed idempotent, no errors, same result.

### Files touched
New: `apps/unnatividya/scripts/export-catalog.ts`, `apps/unnatividya/scripts/sync-catalog-to-db.js`.
Edited: `apps/unnatividya/package.json`, `crm/package.json`, `apps/unnatividya/Dockerfile`, `course-edit-form.tsx`, `university-edit-form.tsx`, `17_UNNATIVIDYA_VPS_LAUNCH_GUIDE.md`.

### Effort
Small–medium, as estimated. No content dependency — done independently of §1–§3.

---

## 5. Recommended sequencing

1. **§4 Postgres sync** first — purely technical, fixes a real correctness bug, zero design/copy decisions, quick win.
2. **§1 Conversion tracking** next — small-medium, unblocks real usage data that could usefully inform prioritization of later phases (e.g. does the EMI calculator or the recommender get more real engagement).
3. **§2 Shortlist** after §1, so its `shortlist_add`/`shortlist_remove` events plug into infrastructure that already exists.
4. **§3 FAQ expansion** last, phased internally: 3A → 3B → 3C (fast, mechanical) then 3D and 3E as their own longer content batches (mirroring how `guide-content.ts` was built across multiple "proceed" cycles earlier this session).

This is a draft — add more tasks before development starts, and I'll fold them into this document and re-sequence as needed.

---

## 7. Deep-dive audit (2026-08-09) — everything found and fixed after §1-§6 shipped

Requested as a final check once all of §1-§3 and §6 were done. Found and fixed several real issues outside the plan's original scope; one finding (below) needs your decision, not mine.

**⚠️ Needs your decision — possible real secret in `.env.example`:** `git diff .env.example` shows an uncommitted line `ZEPTOMAIL_API_KEY=Zoho-enczapikey ...` with what looks like a real, live-format API key value — every *other* secret in that file uses an obvious placeholder (`replace-with-a-long-random-secret`). `.env.example` is a template meant to be committed to git (unlike `.env`), so if this is a real key and gets committed, it leaks into git history permanently. It hasn't been committed yet (confirmed via `git log`), so nothing has leaked so far. I did not touch this — it's not mine to fix silently. Please check whether that's a real active key (rotate it and replace with a placeholder here) or already-inert/rotated (safe to leave).

**Fixed directly:**
- **Lint**: 4 pre-existing `react/no-unescaped-entities` errors (literal apostrophes in JSX text, none introduced this session) and 1 React-Compiler memoization warning introduced by this session's `recommender-quiz.tsx` refactor (fixed by wrapping `topMatches` in `useCallback`). `npm run lint` is now fully clean — it hadn't been run at all before this audit.
- **Git hygiene**: `apps/unnatividya/scripts/catalog-export.json` (generated by `export-catalog.ts`, read by `sync-catalog-to-db.js`) was untracked with no `.gitignore` rule — would have been swept into a commit by anyone running `git add -A`. Added a rule; it's regenerated fresh on every build, so it should never be committed.
- **Mobile horizontal-scroll bugs on 3 more pages** — found via a systematic sweep (loaded 21 representative URLs at a 390px mobile viewport and checked `scrollWidth` vs `clientWidth`), not by inspection. All are the same root-cause family already fixed repeatedly earlier in this session (raw inline `gridTemplateColumns` with no mobile handling), just on pages nobody had mobile-tested yet:
  - `/blog/[slug]` — the article/rail layout had the class-vs-inline-style conflict pattern (inline style always wins over a non-`!important` media query rule); removed the redundant inline style so the existing `.article-layout` class's mobile collapse actually applies.
  - `/universities/[slug]` — same conflict on the hero section, plus the page's *entire* two-column content layout was raw inline `1fr 340px` with zero mobile handling at all; replaced with `className="container detail-layout"`, matching the exact convention already used on the course/compare pages.
  - `/courses/[slug]` and `/universities/[slug]` both also blew out because the shared mobile media-query rule used a bare `1fr` track instead of `minmax(0, 1fr)` — a bare `1fr` still respects a descendant's unshrinkable min-content width (e.g. a data table with `min-width: 760px`), so one wide table was expanding the *entire* single-column mobile layout instead of just scrolling internally. Fixed the shared rule once, which resolved the `/compare/[course]/[pair]` page too as a side effect.
  - Beyond those, found **12 more raw, unresponsive inline grids** across just these two pages (career-role cards, spec cards, similar-programs cards, fact tiles, rankings, campus photos, admission steps, partner logos, other-universities cards, plus 3 genuine data tables). Fixed the card/tile ones with the existing `.grid.three`/`.grid.four`/`.stats-band-grid` classes (or a new `.overview-grid`/`.grid-mobile-stack` where no exact-fit class existed); fixed the 3 real data tables (course-fee-plans, university-programs, university-scholarships) by giving them `overflow-x: auto` + `min-width` on the inner grid — the same horizontal-scroll pattern already used correctly on `.compare-table`, rather than naively stacking a table with column headers to one column (which would have made each row's fields meaningless without their labels).
  - **Verified empirically, not just by re-reading the CSS**: swept all 21 URLs again after each fix; final state is 0px overflow on every one, confirmed via `tsc`/`lint`/`build` (all clean) and screenshots of the two fixed data tables and the fixed certificate-image block, checked visually.
- **Content quality**: scripted a check for exact-duplicate FAQ question text within any single guide/blog-post array across all 77 arrays (51 guides + 26 posts) added in §3 — zero duplicates found.
- No stray server processes left running; no other untracked files created by this session's work outside what's expected (new lib/component files, new docs).

---

## 6. PageSpeed Insights fixes (completed 2026-08-09)

Requested via two PSI report links (desktop + mobile, for the homepage). Those links couldn't be read directly — PageSpeed Insights renders its results client-side via JavaScript, and a static fetch only returns an empty "no data" shell. Instead of guessing, I ran Lighthouse myself directly against the live production homepage (`unnatividya.com`) to get equivalent real audit data, then fixed every concrete issue it surfaced.

### Baseline (live production, before fixes)
| | Desktop | Mobile |
|---|---|---|
| Performance | 94 | 75 |
| Accessibility | 94 | 94 |
| Best Practices | 100 | 100 |
| SEO | 100 | 100 |
| LCP | 1.3s | 5.0s |

### Root causes found and fixed
1. **Sitewide low-contrast text** — `#AAAAAA` on white/light backgrounds (ratio 2.32:1, needs 4.5:1) was used in 14 places across 8 files (homepage, university/course/blog/guide/specialization/compare pages, `blog-explorer.tsx`). Replaced with `#707070` (4.95:1), an existing site token already used elsewhere — no new color introduced.
2. **Low-contrast badge/pill text** — the `#4FA8FF` blue used for "UG" level tags and approval badges ("UGC-entitled", "NAAC A+", etc.) on their own light-blue tinted background only hit 2.26:1. Replaced with `#0F5BB8` (5.9:1) across all 5 files using that pattern (`page.tsx`, `universities/[slug]/page.tsx`, `blog/[slug]/page.tsx`, `course-explorer.tsx`, `blog-explorer.tsx`). The background tint and the PG badge's purple were untouched (already passing).
3. **Heading-order violation** — the footer's three link-group labels (`Explore`/`Top courses`/`Company`) were `<h4>` elements appearing right after the page's last `<h2>`/`<h3>`, skipping a level, on every page site-wide (shared `<SiteFooter>`). Changed to plain `<p>` tags with identical styling — footer nav labels don't need to be in the heading outline, so this fixes it permanently regardless of any given page's heading depth, rather than requiring a specific heading level that could still break on a short page.
4. **Footer grid didn't collapse on mobile** (found while re-verifying the contrast fix — this was actually the root cause of one contrast violation that survived the first pass: the footer's 4-column grid was squeezed by an inline `gridTemplateColumns` with no mobile override, and at narrow widths one link ended up rendered against the page's white background instead of the footer's dark background). There was a pre-existing `.footer`/`.footer-grid` CSS class with the correct mobile collapse rule already in `globals.css` — but `site-footer.tsx` had been rewritten with inline styles at some point and never wired to it, so the rule was dead code. Added a new `.uv-footer-grid` class (matching this session's naming convention) with a `@media (max-width: 900px)` collapse to a single column, and applied it alongside the existing inline styles.
5. **Mobile image delivery (127 KiB estimated savings)** — the hero "AI recommender preview" image and the 3 university campus-photo cards had a `sizes` attribute of `100vw`/`33vw` that didn't account for the page's 24px side padding and the card's own internal padding, so the browser requested a wider image than actually needed. Corrected to `calc(100vw - 98px)` (hero) and `calc(100vw - 50px)` (campus cards) to match true rendered width — pure metadata change, no visual difference, smaller bytes shipped.
6. **Third-party analytics blocking the initial load** — GTM and GA4 loader scripts (`src/components/analytics.tsx`) were loaded with Next's `afterInteractive` strategy, contributing ~74 KiB + ~72 KiB of JS parsed during the critical window (mostly unused at that point). Changed to `lazyOnload` (loads during idle time, after everything else) — analytics still fires normally, just slightly later, which is standard practice for third-party tags that don't gate rendering.

### Verified result (local production build, `next build && next start`, Lighthouse re-run)
| | Desktop | Mobile |
|---|---|---|
| Performance | **100** | **97** |
| Accessibility | **100** | **100** |
| Best Practices | **100** | **100** |
| SEO | **100** | **100** |
| LCP | 0.6s | 2.7s |
| Contrast violations | 0 (was several) | 0 (was several) |
| Heading-order violations | 0 | 0 |

Verified via `npx tsc --noEmit` (clean), `npm run build` (clean, all pages generated), and a full Lighthouse re-run against the built production server. Also spot-checked that every page type touched by the color changes (course, university, blog, guide, specialization, compare, courses/blog listing pages) still renders 200 with no leftover old color values.

**Honest caveat on the remaining mobile Performance score (97, not 100):** this was measured against an uncached local server with Lighthouse's simulated mobile network/CPU throttling — real production numbers depend on your actual hosting/CDN setup and may come in higher or lower. The concrete LCP delta (2.7s vs. the theoretical 100-score ceiling of ~1.2s) is now driven by network/CPU throttling simulation on the remaining page weight, not by an identifiable bug — literal 100 mobile Performance is a genuinely hard bar industry-wide (most content sites, including large ones, don't hit it) and chasing the last few points (e.g. hand-splitting the shared JS framework chunk, or dropping legacy-browser JS polyfills) would trade real engineering risk for a small, uncertain gain, so I stopped once every identifiable, fixable issue was resolved. Re-run PSI against production after this deploys to get the real-world number — happy to iterate further if it comes in meaningfully under 97.

### Files changed
`src/app/page.tsx`, `src/app/universities/[slug]/page.tsx`, `src/app/blog/[slug]/page.tsx`, `src/app/online-degree-guides/[slug]/page.tsx`, `src/app/courses/[slug]/page.tsx`, `src/app/specializations/[slug]/page.tsx`, `src/app/compare/[course]/[pair]/page.tsx`, `src/components/blog-explorer.tsx`, `src/components/course-explorer.tsx`, `src/components/site-footer.tsx`, `src/components/analytics.tsx`, `src/styles/globals.css`.
