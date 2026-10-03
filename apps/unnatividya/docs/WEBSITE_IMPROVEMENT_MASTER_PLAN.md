# Unnati Vidya: website improvement master plan

Date: 29 September 2026. Status: **owner approved phased implementation after the decisions recorded below; implementation began with contact-first lead capture.** See IMPLEMENTATION_PROGRESS.md for tested work and remaining scope.

## Confirmed owner requirements — revision 2

These decisions supersede conflicting recommendations in revision 1 and older plans. These decisions were subsequently approved together for phased implementation.

- Use **Apply now** as the application-entry CTA everywhere, replacing “Talk to an expert” and equivalent generic lead-entry labels across header, mobile menu, sticky bars, cards, detail pages, articles, tools and recommender results. Keep functional actions such as Search, Compare, Save, Back and Verify email correctly named.
- **Full interactive course comparisons remain locked until form submission and successful email OTP verification**, as confirmed by the owner. **Editorial comparison articles remain public**, including university/program comparison landing pages. Preserve selected courses throughout unlocking; clearly disclose the requirement before opening the form.
- Lead flow: **1. Your details** (name, email, phone) → **2. Course preferences** (course dropdown and optional university dropdown) → existing email verification → accurate success state. Never start with the course picker, even from a course-specific CTA.
- **Save the CRM lead after step 1** when the learner submits name, email and phone with contact consent. **The team may follow up even if the learner leaves before completing preferences or email verification.** Step 2 and email verification update that same lead; an incomplete/unverified lead is not a completed application.
- **Existing ratings, testimonials and placement/salary figures remain visible for now**, at the owner’s request. Verification of these existing items is deferred and tracked explicitly; this does not make them verified or authorize new invented claims. See §14.10.
- **Conversion scope: lead capture only for now. Appointment booking is not required.** Apply now saves and updates the lead through the agreed form; staff arrange follow-up outside the website.
- **First-release language: English only.** Hindi and other translations are deferred; international/NRI fee information is also presented in English.
- **Include dedicated international/NRI fees in the first release** for the current three universities, using their official fee categories, currencies and payment conditions. Do not infer fees by converting domestic prices.
- **First release: fully verify the current three universities only—Manipal University Jaipur (MUJ), Sikkim Manipal University (SMU) and Amity Online.** Audit every currently listed program and its material facts; adding universities is deferred.
- **Offer both manual and scheduled official-source checks, with a weekly default schedule.** Detected changes create review drafts; neither path publishes automatically. Administrators control schedules and publication.
- **Publish reviewed content from the admin panel**, without code changes or deployment for routine course, fee, deadline and university updates. **Only administrators may publish; editors prepare drafts and submit them for review.** Use draft, review, preview, publish and rollback controls.
- **AI recommendations are freely visible without contact details or email verification.** Use **Apply now** for lead capture; the interactive comparison tool remains locked under its separate access rule.
- Integrate **Groq** for the AI course recommender; the owner will provide credentials securely at implementation. Retain deterministic eligibility checks and a usable non-AI fallback.
- Fetch and reconcile facts against the proper official university program pages and relevant official recognition records before publishing updates. Expand useful information without crowding the first screen.
- Every blog/article uses the exact byline **Content Team, Unnati Vidya**, including existing content, cards, author page and structured data.
- Follow Google Search technical/content guidance and a documented Search Console validation workflow. Use subtle, accessible motion.
- Asset sourcing, sizes, formats and ready-to-use generation prompts are specified in [ASSET_REQUIREMENTS_AND_PROMPTS.md](ASSET_REQUIREMENTS_AND_PROMPTS.md). No generated imagery is required to start work; reuse suitable existing assets.

## 1. Recommended direction

Build a trustworthy online-degree decision service: help learners understand their options, check suitability, compare the full cost and learning experience, and request help when ready. Offer comprehensive information through well-organized pages and tools, rather than putting every fact and conversion prompt on every screen.

Preserve the existing purple identity, working Next.js application, course catalog, comparison infrastructure, guides, shortlist, calculator, lead capture and CRM integration. Improve their accuracy and connection before adding more features. No full framework rewrite is justified by this audit.

The first priorities are **trustworthy information, accessible decision journeys, dependable publishing, and measurable conversion quality**. More pages and more CTAs will not resolve the current weaknesses. Rankings, indexing and inclusion in AI answers cannot be guaranteed.

Planning assumption: Indian learners exploring online UG/PG degrees, including working professionals and parents; English-only first release; Hindi and other translations deferred. Domain assumed to be https://unnatividya.com from the application configuration; owner confirmation pending. University scope is confirmed: fully verify the current MUJ, SMU and Amity Online catalog for the first release; no additional universities. Dedicated international/NRI fee information is included in the first release. This does not automatically expand the scope to international recruitment operations or a complete international admissions service; the first release is English-only, with Hindi and other translations deferred.

## 2. Evidence and limits

Reviewed the website source, public routes, shared navigation/forms, catalog types, recommender, comparison gate, analytics, SEO/sitemaps, CMS write path, sync script, Dockerfile and previous plans 20/22/23. Current local commit at inspection: `53ce057`; working tree also contains unrelated CRM work, which this audit does not alter.

Read-only live browser audit: 10 routes at both 390px and 1440px, all 20 loads returned HTTP 200, with no detected document-wide overflow or broken loaded images. Routes: home, courses, MUJ MBA detail, selected comparison, recommender, EMI calculator, universities, blog, guides and shortlist. One H1 was present on each. Additional mobile accessibility samples and learner interactions are recorded in `audit-2026-09-29/`.

Mobile axe checks found an unnamed course-sort select, contrast failures on comparison and university pages, and a university scholarship scroll region without keyboard focusability. Automated checks do not establish WCAG compliance. The guessed `/online-degree-guides/online-mba-fees` returned an appropriate 404; the listing links to `/online-degree-guides/mba-fees`. The guessed route is excluded from valid-template accessibility coverage. Robots, sitemap index and the course sitemap returned 200; a deliberately missing route returned 404. A five-answer recommender interaction produced three results without page-wide mobile overflow. Course filter changes did not update the URL, and the first Tab after opening counselling moved to the background home link. Detailed testing of every catalog URL, every admin workflow, payments, OTP delivery, CRM delivery and authenticated account functions remains a later validation task. No real enquiry, OTP or external message was submitted.

No current Search Console, GA4, Bing Webmaster Tools, CrUX field data, server logs or conversion records were supplied. No current Lighthouse score, real-user speed score, traffic forecast or ranking position is claimed. Browser load timings in the raw evidence are uncontrolled desktop-machine observations, not mobile performance benchmarks. Live source parity and deployment commit are not proven by visual similarity.

Previous plans contain delivered work and historical decisions. Their “DONE” labels are not proof of current accuracy. In particular, prior decisions deliberately retained a static public catalog, scripted recommender and email OTP. The owner has now selected Groq for the recommender, superseding the scripted-only decision. The owner has also selected reviewed admin-panel publishing, superseding the static-catalog publishing decision. Email OTP remains the verification mechanism. These are confirmed planning choices; implementation still awaits approval.

## 3. Confirmed findings and priorities

Priority definitions: P0 = trust/release prerequisite; P1 = core learner experience; P2 = growth and operational improvement; P3 = optional expansion. These are product priorities, not vulnerability severity ratings.

| ID | Priority | Evidence / current behavior | Proposed outcome and acceptance |
|---|---|---|---|
| UV01 | P0 | `site-header.tsx` and live pages advertise July 2026 admissions, deadline 20 August, after that date. | Model intake dates with source, year and expiry; hide expired notices automatically; show university-specific deadlines only when confirmed. |
| UV02 | P0 | Homepage claims 1.75L+ learners, equal university compensation, no commission bias, universal no-cost EMI and categorical certificate/recognition outcomes. Catalog has placement/package/rating numbers without field-level provenance. | Create claims register; substantiate, qualify or remove each claim. Distinguish university-wide vs online-program outcomes, placement support vs jobs obtained, and advertised vs independently checked information. |
| UV03 | P0 | Course detail repeats the same two named student reviews across courses and emits aggregate ratings from static counts. | Owner exception: retain existing visible reviews/ratings for now and track their verification as deferred (§14.10). Do not fabricate replacements, add verified badges or introduce unsupported review markup; review existing schema separately for policy compliance. |
| UV04 | P1 | `compare-gate.tsx` blurs core information and asks to verify a number; `lead-form.tsx` actually verifies email. Unlock copy also implies a counsellor call. | Owner confirmed: keep full comparisons locked until form submission and successful email OTP verification. Disclose the requirement, align email-verification/contact-consent copy and restore the selected comparison after unlocking. |
| UV05 | P0 | Recommender scores level/stream/budget and static ratings/placements; it does not collect qualifications or validate eligibility/schedule despite promising those checks. `why()` can claim stream fit even when a result does not match. | Separate hard eligibility from preferences; return eligible/possibly eligible/needs confirmation; explain actual matched and unmet criteria. Never present a fit score as admission probability. |
| UV06 | P1 | AI branding is prominent; only the result chat labels itself “demo — scripted responses.” Replies make broad financing/recognition claims. | Plan Groq-backed recommendations using approved sources, deterministic eligibility filtering and truthful explanations; label fallback mode and remove unsupported claims. See §14 for the integration acceptance criteria. |
| UV07 | P1 | Course filters use component state; hard-coded university options and fee bounds. | URL-persisted filters, back/forward restoration, data-derived options, visible selected chips and useful zero-result recovery. Share a selection without sharing personal data. |
| UV08 | P1 | At 390px home is 10,138px tall; course listing 15,685px; specialization listing 15,709px. Hero H1 occupies several lines; public cards repeat many actions and metadata. | Shorter first-screen introduction, clear search, compact decision cards, meaningful grouping/pagination and optional detail expansion. Preserve useful content on detail pages. Length alone is not a defect; task completion is the criterion. |
| UV09 | P1 | `/blog` and `/online-degree-guides` both use “Online Degree Guides” titles, with overlapping navigation labels. | One clear resources navigation group and distinct page purposes/titles; preserve existing URLs unless redirect plan is approved. |
| UV10 | P1 | Live axe: course sort lacks accessible name; comparison has 2 contrast failures; MUJ university has 5 contrast failures and an unfocusable scroll region. | Correct accessible labeling/contrast/keyboard scrolling; zero critical/serious automated issues in agreed release matrix plus manual keyboard/screen-reader review. |
| UV11 | P1 | Lead dialog has dialog semantics and Escape close, but code lacks focus placement/trap/return and background inert handling. Live opening leaves focus on body; the next Tab focuses the background home link. | A shared accessible dialog/sheet with focus management, body scroll lock, close recovery and mobile keyboard-safe actions. |
| UV12 | P1 | Public pages import `catalog.ts`; admin PATCH updates Postgres; sync script overwrites DB catalog from code. This is an earlier deliberate architecture choice. | Owner selected admin-panel publishing: migrate to one reviewed publishing pipeline with versioned snapshots and cache invalidation, so routine approved edits appear without code deployment. Until migration, label the existing publishing limitations accurately. |
| UV13 | P2 | Sitemap `lastmod` is generated using current time for most route families. | Emit actual substantive modification timestamps; exclude draft, redirected, duplicate and noindex URLs. |
| UV14 | P2 | Shortlist inherits homepage canonical but correctly has noindex; not an indexable duplicate-content emergency. | Give private/utility pages intentional metadata; retain noindex and remove misleading canonical inheritance. |
| UV15 | P2 | Analytics can load both direct GA and GTM; event helper emits both formats. This creates a duplication risk depending on container configuration. | Choose one event-delivery owner; test exactly-once conversions and consent behavior, including SPA navigation and early interactions. Do not assume production tracking is broken without a DebugView check. |
| UV16 | P0 | Package engines and Dockerfile require Node 20; official Node release page now lists it EOL. | Plan a tested supported LTS migration across website, root dependencies, CI and containers; validate compatibility before selecting exact versions. |
| UV17 | P2 | Website runtime image copies the entire root `node_modules`, including dependencies outside the website. | Isolate required runtime/CLI dependencies and measure smaller image/build time; keep migrations and sync tools functional. |
| UV18 | P2 | Rate limiter is explicitly process-local; public catalog has fixed university ID union and `ugcApproved: true` type. | Shared abuse limits before scaling replicas; model recognition status and new universities as verified data rather than constants. |

## 4. Proposed information architecture and learner journeys

Primary navigation: **Courses · Universities · Compare · Resources · Tools**. Keep **Saved courses** visible as a utility and **Apply now** as the primary application-entry action. Recommender becomes “Find my course” under Tools and a contextual CTA. Resources contains degree guides, articles, admissions, recognition and careers; expose the difference with descriptions. Maintain indexable existing URLs initially.

Journeys to support:

| Learner intent | Intended flow | Success criterion |
|---|---|---|
| “I know the degree I want” | Search → filtered list → course detail → compare/save → optional guidance | Finds fee, eligibility and duration without registering. |
| “I do not know what fits” | Find my course → qualifications/goals/budget/time → explained shortlist | Sees disqualifications and uncertainty, can revise answers. |
| “Can I afford this?” | Full-cost table → EMI/semester comparison → scholarship criteria | Understands mandatory extras and financing assumptions. |
| “Is it recognized and worthwhile?” | Program-specific recognition → dated official source → learning/outcome evidence | Does not confuse an institutional badge with program/session approval. |
| “I am choosing with family” | Save → compare → share sanitized snapshot or print | Can revisit choices and explain trade-offs. |
| “I want to apply” | Apply now → name/email/phone → course + optional university → email verification → next steps → CRM tracking | No repeated data entry; knows who will contact them and when. |

Use moderated usability tests with 5–8 representative learners per major iteration, including mobile users and working professionals. Test “find total cost,” “compare two relevant degrees,” “check eligibility,” and “request help.” Suggested initial target: 80% unassisted success; refine after baseline measurement.

## 5. Page-by-page product plan

| Page family | Proposed changes |
|---|---|
| Home | Concise value proposition and catalog scope; prominent course search; degree/goal entry points; compact featured comparisons; evidence-led trust; practical tools; one counselling section. Reduce repetitive promises and promotional stats. |
| Course listing | Data-derived filters for level, degree, university, total fee, subject, verified eligibility and study schedule where data exists; sort by relevance/fee with method explained. Keep comparison tray, save state, selected chips, result count and reset. Begin with small-page pagination rather than endless rows. |
| Course detail | Above-fold decision summary: university, mode, duration, full fee, eligibility summary, next confirmed intake, source freshness. Then contents navigation, curriculum, workload/live attendance/exams, recognition, cost, support/outcomes, pros/limitations, sources, relevant FAQs and alternatives. |
| University listing/detail | Actual catalog coverage; distinguish institution from online division; display dated approvals/rankings with scope; source-backed services and student support; course table; admissions/refund links; avoid making campus pictures imply on-campus experience. |
| Compare | Keep full two/three-course comparisons locked until form submission and email OTP verification; preserve selection through the unlock flow; difference-only toggle, category grouping, clear unknowns, fee basis alignment, strengths and trade-offs. Mobile two-column or stacked category view with accessible horizontal scrolling where needed. No universal “winner” based only on fee/rating. |
| Recommender | Qualifications first where needed, then goals/budget/time; editable summary, explainable matches, no-match recovery, optional alternative pathways. Remove artificial processing delay. Test contradictory answers and missing catalog evidence. |
| Shortlist | Guest saving remains available; robust storage-disabled/removed-course states; compare selection, notes, print/share. Cross-device account sync optional only after demand is established. |
| Resources/guides | Clear topic and learner-stage taxonomy; answer summary, author/reviewer, substantive updated date, primary sources, helpful tables and tool embeds. Consolidate overlapping articles only after traffic/intent review and redirects. |
| Specializations | Explain difference between a degree, formal specialization and elective set; group by goal/stream; bounded result lists; source university availability. |
| EMI/fee tools | Numeric entry alongside sliders; total outlay including down payment, interest and disclosed extra charges; multiple payment scenarios; zero-interest and invalid-input handling. Estimates are not lender offers. |
| Apply now flow | Step 1: name, email and phone. Step 2: course dropdown and optional university dropdown; preserve contextual preselection. Then email OTP and accurate success. Back navigation retains values; contact and marketing preferences are distinct; see §14. |
| About/verification/contact | Named organization and responsible team, actual contact details, support hours, commercial relationships, how facts are verified, correction request, review policy and accessible grievance/support route. |
| CMS/admin | Draft → review → preview → publish; field provenance, freshness queue, broken-source alerts, redirects, safe scheduled admissions, content version history, publish audit, CRM failures/retries, operational dashboards. Test role boundaries before broadening editor access. |

## 6. Information and editorial standard

Each program needs structured facts, not only prose: degree/provider, mode, duration, credits where published, admission session, eligibility conditions/exceptions, curriculum/specialization, weekly commitment, attendance, teaching language, exam/proctoring/travel requirements, application process/documents, deadlines, complete fee components, installment options, scholarship eligibility, cancellation/refund source, recognition scope, support contacts and career-service details.

Each material fact should have `sourceUrl`, source title, applicable program/session, `checkedAt`, reviewer, status (verified/unverified/stale/not applicable) and change history. Unknown is valid and must be displayed honestly. A page should not say “verified” merely because some other section was checked.

Maintain a claims register for placement percentages, salary figures, rankings, ratings, testimonials, learner counts, financing and admissions statements. Record methodology, cohort/date, population, consent/usage rights, owner and expiry. Do not infer online-program salaries from university-wide placement material. Preserve accurate existing facts; do not replace them with generic AI prose.

Proposed service levels: admission/fee changes reviewed weekly during intake and immediately when notified; recognition checked for the relevant session before publication; evergreen guidance reviewed quarterly. Deadline expiry is automatic. These are editorial operating targets requiring an assigned owner, not claims about the current site.

Confirmed public publishing direction: retain server-rendered/static-speed pages while moving approved content into versioned published snapshots. Editors change drafts; an approval action validates and publishes a snapshot, refreshes affected pages/sitemaps and records changes. DB availability should not make every cached public page unavailable. Import/backfill, preview, parity checks and rollback precede any source-of-truth switch. Never run the existing code→DB overwrite blindly after a new editorial publishing system is introduced.

## 7. Feature and tool roadmap

| Order | Feature | Learner value | Dependencies / release criteria |
|---|---|---|---|
| 1 | Eligibility pre-check | Avoid unsuitable applications | Reviewed program rules; qualifying/uncertain/not-qualifying explanations; edge-case tests; university makes final decision. |
| 1 | Total-cost comparison | Prevent misleading low starting prices | Fee components/session/source coverage; consistent totals across pages, compare and tools. |
| 1 | Improved comparison + share/print | Support family decisions | Sanitized IDs only, no personal data in URLs, unavailable-course recovery. |
| 1 | Groq-backed course recommender | Explain suitable options from verified information | Deterministic hard constraints; approved source retrieval; server-only credentials; validated results and fallback; see §14. |
| 2 | Study-time planner | Show compatibility with work | Sourced live/recorded/exam workload; editable assumptions. |
| 2 | Admission document checklist | Reduce application friction | University/session versioning; printable guest checklist; no sensitive uploads initially. |
| 2 | Scholarship finder | Discover real eligible offers | Dates, criteria, source and verified benefits; expired awards excluded. |
| 2 | Opt-in intake/fee alerts | Support return visits | Consent, unsubscribe, verified change events, delivery limits. |
| 2 | Follow-up questions within Groq recommender | Explain differences with citations | Same verified corpus and controls as the recommender; no unsupported approval/fee/eligibility claims. A general-purpose chatbot is outside this scope. |
| 3 | Learner portal/application status | Reduce follow-up uncertainty | Secure account model, authorized CRM mapping, retention/support ownership; avoid copying the entire CRM into the website. |
| 3 | Verified learner reviews/Q&A | First-hand useful evidence | Moderation, identity/consent, spam handling, university/program association and review policy. |
| 3 | Hindi and further languages | Improve access | Human-reviewed translations, hreflang, stable language URLs, parity updates and support capacity. |

Do not prioritize a generic chatbot, mobile app, unrelated calculators, auto-generated city pages or a large social community before the core decisions and data are reliable.

## 8. SEO and organic acquisition

### Technical foundation

Keep current indexable URLs wherever possible. Crawl all sitemap URLs after approval and classify indexable canonical 200s, intentional noindex utilities, redirects, genuine 404/410s and errors. Audit query parameters, duplicate filter combinations, protocol/host normalization, pagination and internal links. Curated search-intent pages can be indexable; arbitrary personal filter combinations should not multiply the index. Robots blocking is not a substitute for crawlable noindex.

Use specific titles/descriptions/H1s by intent; correct Blog/Guides duplication. Ensure key content and links exist in server HTML. Canonicals should reflect actual equivalence, not hide unrelated content. Sitemaps should contain only canonical indexable pages and real update timestamps. Monitor redirects and avoid chains. Preserve schema matching visible, verified content; validate supported types at implementation time. No invented ratings or review counts.

Retain useful FAQs for learners, but do not project FAQ rich-result traffic: Google documents withdrawal of that feature in May 2026. `llms.txt` is not a Google ranking requirement. Reference: [Google documentation updates](https://developers.google.com/search/updates).

### Content strategy

Start with current catalog strengths rather than mass-producing every degree/city permutation. Candidate intent groups: degree fees and full cost; degree eligibility; credible university comparisons; online learning/exams; admissions/documents; recognition by program/session; specialization selection; careers with realistic evidence. Query demand and difficulty remain unmeasured until Search Console and competitor/SERP research are supplied.

Create a keyword-to-URL map: primary learner question, secondary questions, page owner, source evidence, next action, related pages and overlap risk. Consolidate only where intent overlaps. Distinct fee/eligibility/career guides can remain separate when each has substantive original value. Prioritize 5–10 complete topic clusters before catalog expansion.

Proposed first pilot: MBA costs/eligibility/working-professional fit, BCA entry requirements/learning workload, and MCA prerequisites/alternatives. Validate the business priority before commissioning content. Build authoritative comparisons, transparent calculations, sourced intake calendars and practical checklists that others may cite. Avoid claims that more words or more pages guarantee ranking. Google's [people-first guidance](https://developers.google.com/search/docs/fundamentals/creating-helpful-content) supports prioritizing useful original material; its [spam policies](https://developers.google.com/search/docs/essentials/spam-policies) constrain manipulative scaled content and link tactics.

### Authority, distribution and AI discovery

Use the exact author **Content Team, Unnati Vidya**, backed by a truthful editorial team profile and correction process; add separate reviewer credits only for reviews actually performed; disclose partnerships and commercial ranking rules. Seek legitimate university/source citations, expert contributions, interviews and relevant education partnerships. Publish useful videos with transcripts and reusable visual explainers. Distribute through owned email/social only with appropriate consent. No purchased ranking links, fake reviews or city doorway pages.

Use consistent organization identity/contact details; pursue a business profile only if genuinely eligible. Bing Webmaster Tools/IndexNow can supplement discovery where applicable; they do not guarantee indexing or Google ranking. Build AI-search visibility through crawlable answers, original evidence, clear entities and source freshness; Google recommends established SEO foundations for its [generative search features](https://developers.google.com/search/docs/fundamentals/ai-optimization-guide). Track observed citations/referrals, not promised universal inclusion.

## 9. Performance, build and infrastructure

Measure first on a production build and live host: representative home/list/detail/compare/guide/form pages, cold and warm caches, mobile throttling, at least three lab runs per template. Obtain CrUX/Search Console field data where available. Separate origin response time, LCP resource discovery, JavaScript work, hydration, image transfer and third-party costs.

Targets: field p75 LCP ≤2.5s, INP ≤200ms, CLS ≤0.1, segmented by device; these are [Core Web Vitals thresholds](https://web.dev/articles/vitals), not measured current results or ranking guarantees. Proposed engineering budgets, subject to baseline: initial compressed JS ≤200KB for a simple public template, initial mobile transfer ≤1MB, hero image around ≤150KB at its delivered size, no >10% median lab regression without review. Budgets include framework cost and may require documented exceptions for interactive tools.

Keep static/server rendering where suitable; constrain client components to interactive islands. Avoid importing the full enriched catalog into globally mounted components when only a small ID/name lookup is needed. Inspect bundler output before splitting. Optimize image dimensions/sizes and priority only for actual above-fold assets; preserve dimensions to prevent shifts. Defer below-fold media and nonessential tracking. Do not lazy-load the LCP image.

Review cache behavior in deployed Next.js/reverse proxy rather than assuming `next.config.ts` headers prove effective caching. Cache public assets/content safely; never cache admin, lead or user-specific responses publicly. Add content-aware invalidation for published changes. Fingerprint assets before long immutable caching; stable-name brand asset updates can otherwise remain stale.

Upgrade Node to a supported LTS in a compatibility branch: package engines, root lockfile constraints, CI, website Dockerfile, worker/CLI tooling and shared CRM impact. Node 20 is currently EOL according to the [official release table](https://nodejs.org/en/about/previous-releases). Check framework/dependency advisories and patched versions at implementation time; this audit does not assert a specific exploitable package vulnerability.

Reduce Docker image scope and dependency duplication; use reproducible installs, layer caching and isolated website builds. Keep DB migrations separate from application startup, maintain backup/restore tests, add release SHA visibility and staged rollout/rollback. Proposed monitoring: uptime, 5xx, lead/OTP failure rates, CRM queue age, disk/memory, failed jobs and certificate expiry. Do not run destructive setup during upgrades.

## 10. Conversion, privacy and operational quality

Define one funnel: organic landing → useful course/tool interaction → shortlist/compare → enquiry start → saved enquiry → verified contact → counselor connection → qualified lead → application/enrollment where tracked legitimately. Separate raw volume from qualified outcomes and duplicate/spam leads.

Suggested events: search, filter, zero results, view program, compare change, save, tool completion, enquiry start, lead saved, OTP sent/verified/failed. Use stable event IDs, avoid double counting GA/GTM and exclude names, email, phone, full chat text and personal query strings. Redact session replay and server logs if those tools are introduced.

Do not assume deployment of tracking code means useful data exists. Validate production event flow in the selected analytics tool, consent behavior, SPA pageviews, conversion deduplication and CRM attribution. Preserve first/last-touch campaign information without placing PII in public URLs. Use server-accepted enquiry events for reliable conversion records.

Improve form failure/retry and duplicate submission behavior; OTP resend cooldown and changed-address flow; context retention; safe success states if CRM sync is delayed. Check provider failures, timeouts and replay/idempotency in staging with test adapters. Keep access checks on all CMS endpoints; test CSRF/origin protections, admin session expiry/revocation, redirects and import URLs. Shared rate limiting and trusted proxy handling are prerequisites for multiple replicas. This is planned hardening, not a completed penetration test.

Retention, consent wording, commercial disclosures, financing and education claims need business/compliance ownership. This plan does not certify legal compliance or substitute for verification of current university/regulator policies.

## 11. Delivery phases and approval gates

Estimates are rough working effort for one engineer with design/content support; they are not deadlines or additive guarantees. Content verification and external integrations can dominate elapsed time.

| Phase | Scope | Rough effort | Dependency / completion gate |
|---|---|---|---|
| 0 | Confirm audience/lead policy; baseline crawl, analytics, field speed; claims register; reconcile deployment/version and existing docs | 2–4 days | Owner approves scope and evidence/claims policy; baseline report saved. |
| 1 | Expired notices, misleading copy/reviews, OTP consistency, critical accessibility, recommender honesty; supported runtime validation | 4–8 days | Core facts checked, with the explicit deferred legacy-claims exception in §14.10; expiry tests; keyboard/form checks; compatible production build. |
| 2 | Shared design system, Apply now CTA, contact-first form, navigation, home/list/detail templates, URL filters, mobile compare, accessible dialogs and subtle motion | 8–15 days | Owner approves representative desktop/mobile designs; learner tasks pass; responsive/a11y matrix passes. |
| 3 | Provenance model and reviewed publishing pipeline, single source of truth, intake scheduling, editorial workflow | 8–15 days | Full data parity, publish/unpublish/rollback tests, no draft leaks, sources/freshness on core facts. |
| 4 | Technical SEO corrections, content clusters, internal links, valid schema, performance/build optimization | 6–12 engineering days + ongoing editorial work | Canonical sitemap crawl passes; performance report; no indexing regressions; pilot clusters reviewed. |
| 5 | Groq recommender, eligibility/full-cost tools, share/print, checklist, CRM lead-capture measurement; alerts only under a separate future scope | 8–15 days depending on choices | Tool edge-case suites; privacy review; staging end-to-end delivery; measurable funnel. |
| 6 | Evidence-led growth, Hindi pilot, verified reviews and optional learner portal | Individually scoped after results | Business case, source coverage, evaluation and separate approved scope. |

Phases can overlap after dependencies are satisfied: field measurement begins early, technical SEO defects need not wait for the whole publishing project. Deliver one small reviewed release at a time. No current application change, deployment or vendor signup is authorized until the owner approves the plan.

## 12. Release acceptance and measurement

- Responsive coverage: 320/360/390/768/1024/1280/1440px; portrait/landscape; 200% zoom and 320 CSS-pixel reflow; long labels, empty data, unknown fees, stale dates, slow network and errors. No document-wide scroll; intentional table scrolling labeled and keyboard accessible.
- Accessibility: WCAG 2.2 AA target; automated checks plus keyboard, focus, VoiceOver/NVDA sampling, reduced motion and zoom. The [W3C quick reference](https://www.w3.org/WAI/WCAG22/quickref/) is the verification standard.
- SEO: representative schema validation; complete sitemap crawl; canonical/status consistency; old URLs maintained or deliberately redirected; draft/admin/utilities kept out of the index; title/description uniqueness reviewed by intent. Review markup follows [Google's review guidance](https://developers.google.com/search/docs/appearance/structured-data/review-snippet).
- Functional: search/filter history, compare/save/share, recommender boundary cases, calculator zero/invalid inputs, forms and retries, source links, publication/rollback and CRM delivery. Real customer communications are not test fixtures.
- Build: lint/typecheck, targeted unit/integration tests, production website/container build on supported runtime, migration/backups and deployment smoke check. Do not infer production health solely from local dev mode.
- Content: all core fees/eligibility/recognition/intake facts have an owner/source/freshness state. Existing visible ratings/testimonials/placement/salary claims have the explicit deferred-review exception in §14.10; do not introduce new unsupported proof or fabricated expertise, or mark retained items verified.
- Business: baseline then compare non-brand organic clicks, qualified organic enquiries, contact rate, application conversion, tool completion and task success. Segment by landing page/device/course and compare seasonally; no arbitrary traffic-growth promise before baseline.

After release: daily error/lead delivery checks in the first week; weekly query and landing-page review; monthly content freshness/CWV/funnel review; quarterly usability and topic coverage review. Track ranking distribution only as one diagnostic alongside qualified outcomes.

## 13. Decisions to confirm one at a time

1. Live domain and primary audience/geography.
2. Main business conversion goal; comparison gating is resolved: full comparisons stay locked until form submission and email OTP verification.
3. Who can substantiate claims, reviews, financing and partnership disclosures.
4. Publishing is resolved: reviewed updates publish from the admin panel without routine code deployment; only administrators may publish; editors prepare drafts for review.
5. Remaining tool priorities and budget/support ownership; Groq is selected, learner accounts remain optional.
6. Analytics access, brand constraints and rollout pace; language is resolved: English-only first release.

Recommended first release after approval: phases 0–1, followed by a reviewed mobile course discovery/compare prototype before broad visual changes. Companion: `DESIGN_AND_CONTENT_STANDARD.md`. The agreed plan is approved for phased implementation; unselected optional expansions remain proposals.


## 14. Implementation specifications for confirmed decisions

### 14.1 Apply now and contact-first application enquiry

Inventory all shared and page-specific lead-entry labels, accessible names and empty/error states. Replace generic “Talk to an expert,” “Get guidance,” “Enquire now” and “Request a callback” entry CTAs with **Apply now**. Do not rename a real telephone/WhatsApp link unless its destination is also changed to the application flow. Preserve Search, View details, Compare, Save and Find my course as distinct tasks. The visible action starts an application enquiry; supporting text must explain that university submission/admission is a later step unless a real university submission integration exists. Do not report “application submitted to university” for a saved CRM lead.

1. **Your details:** visible Name, Email and Phone labels, all required; appropriate autocomplete, phone country code and international validation. Show privacy/contact consent before submitting details. `Continue` validates on client and server, persists the lead and initiates CRM delivery before advancing. Clearly disclose before this action that contact details will be saved for application follow-up even if later steps are unfinished. Save only on explicit submission, not on typing or blur. Mark the record as contact-details-saved, preferences-incomplete and email-unverified; course and university may be null at this stage. Use an idempotency key so retries create no duplicate lead. If CRM delivery is queued, retain a durable record and report the pending state accurately; a save failure must not appear successful. Never store contact data in URLs, analytics or localStorage.
2. **Course preferences:** required course dropdown, optional university dropdown with explicit “No preference.” Offer unique degree/course choices, not duplicate university-specific options. University options are filtered to providers offering the selected course. Preserve course/university context from the clicked page and display it here, but always show the contact page first. A changed course clears an incompatible university with an explanation; server validates IDs and availability. Back retains contact details. Use accessible native selects initially; add searchable comboboxes only when list size justifies them. A missing optional university must never prevent submission. Persist preferences by updating the step-1 record and its linked CRM lead, not by creating another lead. Preserve that partial lead if the learner exits before this step.
3. **Verify email:** after valid step 2 submission, update the existing lead and send email OTP using the existing mechanism. Support resend cooldown, edit email and retry without creating duplicate leads. State truthfully whether details are saved but not verified. Optional marketing consent is independent of necessary contact consent.
4. **Success:** explain what was received, selected preferences and actual next step; no claim of confirmed admission. Preserve an opaque reference and backend idempotency across retries. If university is unspecified, store degree preference + nullable university; do not invent a university or silently map to the first course record. Update website→CRM field mapping/schema if current integration requires a university-specific course ID.

Acceptance includes every CTA location, direct `/lead` entry, contextual and generic entry, keyboard/mobile flow, optional university, course changes, invalid IDs, back/edit, timeout/retry, email changes, duplicate submissions and CRM mapping. Stage analytics contain no PII and distinguish CTA click, step-1 lead accepted, preferences submitted and verified contact. CRM reporting separates partial/unverified leads from completed/verified enquiries. Test abandonment after step 1, repeated Continue, delayed CRM delivery, out-of-order updates and resumed edits. Protect follow-up updates with a server-issued session-bound capability; a bare lead ID is not authorization. Changing email resets verification. Owner confirmed: staff may contact partial leads before preferences are completed or email is verified, provided step-1 contact consent was explicitly given. Show a clear unchecked consent control explaining application follow-up even if the form is unfinished; record consent wording/version, timestamp and source. Keep marketing consent separate. Display incomplete-preferences and unverified-email statuses to staff, honor withdrawal/do-not-contact settings and do not claim ownership of an unverified address or phone. This permits staff follow-up; automated campaigns are not enabled by this decision. Comparison access still requires successful email verification and the completed form.

### 14.2 Groq integration

Groq is the selected provider. The owner confirmed that the recommender and its results are available without lead-form submission or email verification. Ask only the non-contact inputs needed for suitability; show source-backed recommendations and offer **Apply now** to enter the agreed contact-first lead flow. Do not create a lead from quiz answers or AI chat alone. The interactive comparison tool remains gated even when entered from free recommendation results; preserve selected course IDs through that gate. Public access still uses server-side abuse limits and provider budgets, with a transparent fallback when unavailable. Final model selection uses the current [Groq supported-model catalog](https://console.groq.com/docs/models), tested for accuracy, latency and account limits. Do not hard-code an unverified model name or assume a free tier will support production volume. Proposed server-only configuration: `GROQ_API_KEY`, `GROQ_MODEL`, feature enablement and request/token limits; document actual configuration at implementation. Never use `NEXT_PUBLIC_` for credentials or bundle them in browser code. No credentials are needed for this documentation task.

Flow: collect qualifications/goals/budget/time → validate inputs → deterministically exclude known-ineligible programs → retrieve relevant **published, source-verified** catalog facts → ask Groq for explanations/ranking within those candidates → validate output against allowed course IDs and factual fields → render source links, checked dates and uncertainties. The server owns fees, eligibility and URLs; the model cannot invent or replace them. Retrieved webpage text is untrusted data, not executable instructions. Use a controlled ingestion pipeline rather than unrestricted runtime URL fetching.

Use structured output validation, bounded prompt/context size, timeouts, rate limits, bounded transient retries and server-side observability without contact details. Do not send name, email or phone to the recommender provider. Treat streamed output as provisional until validated if streaming is adopted. Keep keyboard-accessible loading/cancel/retry states. Provider 401/429/timeout/malformed output or insufficient evidence produces a transparent deterministic fallback; it must not disable course browsing or applications. AI never creates a lead or sends messages without the user's explicit form action.

Evaluate against a curated suite spanning UG/PG prerequisites, math/bridge requirements, contradictory preferences, under-budget/no-match cases, missing/stale facts, unknown university, misleading prompts, forged source instructions and provider failures. Launch only when every critical eligibility exclusion and source/fee consistency test passes; have editorial review judge explanation quality. A connection test alone is not recommender validation.

### 14.3 Official-source refresh and richer pages

Initial source discovery: [Online Manipal](https://www.onlinemanipal.com/) for the explicitly identified MUJ/SMU institution and program, and [Amity Online](https://amityonline.com/) for Amity programs. These roots were checked during plan revision; individual catalog facts have **not** yet been comprehensively reverified. Online Manipal also lists other institutions, so never substitute MAHE facts for MUJ or SMU. Use exact course detail pages, current official prospectuses/fee schedules and admissions/refund notices; record canonical deep links, applicable intake, student category and retrieval date. Recognition verification uses relevant official regulator records, including the [UGC-DEB portal](https://deb.ugc.ac.in/); that portal could not be retrieved by the audit browser, so manual verification remains required before recognition claims are marked verified.

After implementation approval: inventory every course/university field → fetch official pages/PDFs respectfully with caching and request limits → extract candidate facts → produce old/new/source comparison → resolve conflicting intake or domestic/international figures → editorial review → publish validated updates → propagate into detail pages, comparisons, guides, tools, schema, recommender corpus and CRM mappings. Do not overwrite good data with missing extraction results; preserve version history and rollback. Summarize facts in original language; do not republish entire university articles or assume permission to reuse their photos.

Expand pages with available verified information: term-wise curriculum and credits; specialization prerequisites; live/recorded teaching and expected attendance; learning platform and assessments; exams/proctoring/locations; actual fee breakup including mandatory extras; installments and financing conditions; scholarship criteria; eligibility exceptions; admission documents; confirmed deadlines; cancellation/refund steps; academic/accessibility support; realistic career services; official contacts and cited sources. Source-backed comparisons and FAQs answer learner decisions. Do not fabricate unavailable sections.

Show decision summaries first, anchor navigation and well-grouped detail below. Use accordions for secondary detail without requiring a network fetch or login to read the core information. Keep content in rendered HTML, searchable and available to assistive technology. More useful information is approved; adding generic filler and repeated promotional blocks is not.

### 14.4 Author and Google Search Console acceptance

Every existing/new blog and article, including editorial guides, displays **Content Team, Unnati Vidya**. Add one truthful team profile (proposed `/authors/content-team`) describing sourcing, editing, corrections and contact. Use that same name and profile URL in Article/BlogPosting `author` with `@type: Organization`; do not invent a named person, portrait or qualifications. `publisher` remains Unnati Vidya. Dates reflect original publication and substantive revision, not every rebuild. Editorial review records can identify real internal reviewers without changing the required public byline. Follow [Google Article structured-data guidance](https://developers.google.com/search/docs/appearance/structured-data/article).

Search Console rollout checklist (requires property access during implementation):

- Confirm ownership of the production Domain property through the owner's DNS workflow; use the correct canonical HTTPS host. Keep staging private/noindex and public CSS/JS crawlable.
- Save baseline Performance, Page indexing, Sitemaps and Core Web Vitals data; check Security issues and Manual actions. Search Console is a diagnostic tool, not a certification or rank guarantee.
- Publish canonical indexable 200 pages with useful server-rendered content, relevant internal links and truthful structured data. Keep private application/OTP states out of indexing; never index personal information.
- Validate sitemap files containing only canonical indexable URLs and actual substantive `lastmod`; submit the sitemap index and inspect processing errors. See [Google sitemap guidance](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap).
- Use URL Inspection for representative home, listing, program, university, article and guide URLs; compare declared/Google-selected canonical, crawlability and rendered content. Validate Article/Breadcrumb and other applicable structured data with Rich Results Test. Request indexing selectively after important fixes, not as a bulk ranking tactic.
- After release, monitor new exclusions/404s/server errors and search performance by query/page/device; distinguish expected utility-page exclusions from defects. Record outcomes weekly, with seasonal context.

Acceptance includes one consistent team byline across HTML/cards/schema, correct dates/images/canonicals, no broken source links, no draft leaks and a documented inspection report. SEO follows the [Google SEO Starter Guide](https://developers.google.com/search/docs/fundamentals/seo-starter-guide); no exact ranking or indexing deadline is promised.


### 14.5 Confirmed comparison access decision

Full interactive comparisons remain locked. Allow learners to select and identify courses before unlocking, explain the form/email verification requirement, then route **Apply now** through contact details → course preferences → email OTP. Preserve comparison IDs separately from the single application course preference; do not silently choose a university or lose the comparison when the learner edits preferences. After verification, return to the selected comparison rather than a generic home page.

A form submission alone, an OTP failure or closing the form must not unlock full results. Maintain the verified state across navigation for its defined lifetime, with a server-validated access state rather than treating an editable localStorage flag as proof of verification. Define expiry and returning-visitor behavior during implementation. Keep locked content out of keyboard focus and assistive reading until access is granted; show an accessible explanation rather than relying on blur alone. Tests cover failed/expired OTP, retry, successful unlock, direct links, preserved selections and attempts to bypass the client flag.

Owner confirmed: public course pages and editorial comparison articles remain fully readable without form submission or OTP. This includes blog comparisons and curated `/compare/[course]/[pair]` editorial landing pages; the interactive `/compare` tool remains gated. Public articles may contain useful comparison tables and Apply now links without inheriting the interactive gate. Keep their substantive content server-rendered, indexable where appropriate, internally linked and independently canonical. Show crawlers and ordinary visitors the same public content; never expose gated tool results only to crawlers. Acceptance tests verify that article routes stay accessible without verification while the interactive tool requires it.


### 14.6 Confirmed admin-panel publishing decision

The admin panel becomes the authoritative editing and publishing workflow for course/university information, including fees and intake deadlines. Routine approved content edits must not require an engineer, code commit or application deployment. Drafts remain private; publishing requires validated fields, source/freshness records and publisher permission. Provide preview, field-level change review, revision history, scheduled publication/expiry where applicable and rollback to a previous published revision. Importing a university source proposes a draft update; it does not automatically publish unreviewed claims.

Migrate and reconcile existing catalog content before switching public reads. Stop the legacy code-to-DB overwrite path from replacing editorial changes; retain static data only as migration seed or explicitly managed fallback, never as a competing authority. Public pages, comparison articles/tables, tools, metadata/schema, sitemaps and the Groq source corpus consume the approved published revision. Invalidate affected caches after publication and show publication/refresh status in admin; drafts must never enter public caches or AI retrieval.

Test publishing and rollback without rebuilding the site, stale-cache recovery, missing source data, simultaneous edits, permission enforcement, unpublished/archived programs, scheduled expiry and retained URL redirects. Keep the last valid published snapshot available where feasible during temporary publishing/backend failures. This decision authorizes the planning direction only; no CMS or database change has been made.


### 14.7 Confirmed first-release university scope

Fully verify **Manipal University Jaipur, Sikkim Manipal University and Amity Online**, including every program currently listed for these institutions. Do not add another university in this release. Maintain an institution/program verification matrix covering official identity, exact degree/specialization, current session and student category, eligibility, duration, curriculum, fee components, financing conditions, recognition, deadlines, exams, support and refund information. Record primary source links, checked dates, reviewer and unresolved discrepancies.

“Fully verified” means every material displayed claim has been reviewed and either substantiated, corrected, qualified as unknown/unconfirmed, or removed from publication—not that missing university information may be inferred. Unresolved essential eligibility/recognition/availability facts must be visibly flagged and excluded from confident AI recommendations; do not claim universal verification while gaps remain. Separate MUJ and SMU facts from other institutions listed on Online Manipal, particularly MAHE.

Completion gate: every currently listed program appears in the matrix; no material claim lacks a recorded disposition; stale fees/deadlines are corrected across public pages, editorial comparisons, tools, structured data and the recommender corpus. Existing visible ratings/testimonials/placement/salary claims follow the deferred-review exception in §14.10 and remain excluded from verified recommendation evidence until substantiated. Review program removals, redirects and unavailable-program behavior before publishing. Broader university expansion requires a later scope decision.


### 14.8 Confirmed international/NRI fee coverage

The first release includes dedicated international/NRI fee information for MUJ, SMU and Amity Online programs. Research each university’s official international program pages and current fee schedules. Use the university’s actual category definitions: NRI, foreign national, OCI/PIO or other categories must not be assumed equivalent. Explain applicable residency/citizenship or country conditions only when documented; otherwise ask the learner to confirm their category with the university.

Store fee category, program, intake, original currency, tuition, published mandatory extras, payment period, total where calculable, installment schedule, source URL, checked date and any country-specific applicability. Clearly distinguish official program fees from scholarships, financing offers and indicative amounts. Do not reuse domestic EMI/discount conditions internationally without evidence. Never manufacture an international fee by currency-converting the domestic fee; optional currency estimates, if introduced later, need their own exchange-rate source, timestamp and explicit estimate label.

Provide a visible Domestic / International–NRI fee selector on relevant course/university fee sections and comparison tools. Where the university distinguishes more categories, expose those labels instead of flattening them. Default domestic context may remain, but selection must be explicit and changeable; do not infer citizenship or fee eligibility from IP address, language or phone country code. Preserve selected fee context across relevant browsing and application entry without changing the contact-first form sequence.

Show fee category and currency on every relevant amount, comparison row and AI explanation. Only compare aligned categories/currencies or clearly identify differences; unavailable international fees display “Confirm with university” with a source/contact route and no invented number. Fee calculators must use the selected category’s verified amounts and supported financing assumptions, or explain that a calculation is unavailable. The application record may carry the selected fee context as a preference, not verified residency status.

Publish dedicated public international/NRI fee sections and, where enough distinct verified information exists, substantive fee-guide pages with their own appropriate metadata/canonicals. Avoid thin duplicate country pages. Include required cross-border payment/refund qualifications where the official source supplies them. These fee additions do not by themselves commit to translated content or end-to-end international admissions support.

Acceptance: the verification matrix covers international/NRI fee availability for every current program; domestic/international figures never mix silently; original currencies and source dates are displayed; missing data is explicit; comparisons, tools, published metadata and Groq explanations use the correct category. No complete international-fee verification has been performed during this documentation update.


### 14.9 Confirmed first-release language

All first-release learner pages, articles, international/NRI fee sections, application steps and Groq recommender responses are in English. Hindi and other translations are deferred. Do not add an inactive language switcher, placeholder translated URLs or hreflang references to pages that do not exist. Preserve Unicode support for learner names and international contact information; English-only content does not restrict who may enquire. Keep visible copy organized so future reviewed translations can be introduced without changing the core flow.


### 14.10 Owner decision: retain existing claims pending later review

Keep existing visible ratings, testimonials and placement/salary figures for now; the owner will handle their verification later. This scoped exception supersedes earlier instructions to automatically hide these existing items. Record each in a deferred claims register with its current text/value, locations, available source, verification status and follow-up owner. Do not mark the review complete or claim that the whole site is fully verified while these exceptions remain. No review deadline has been agreed.

This decision does not authorize inventing new claims, copying a testimonial to additional programs, raising figures, adding verified badges or fabricating supporting records. Newly fetched university facts still follow the source-review workflow. Retained unverified claims must not become trusted Groq evidence or deterministic recommendation inputs. Structured-data eligibility is reviewed independently: retaining visible content is not proof that it qualifies for rating/review markup, and no new unsupported markup should be introduced. Document any proposed markup correction for implementation review.

The current audit findings remain valid; this is a recorded deferral, not a finding that the figures are accurate. Continue verifying core fees, eligibility, recognition and deadlines for all three universities, including dedicated international/NRI fees. This update changes planning documents only.


### 14.11 Confirmed editorial permissions

Only authorized website CMS administrators may publish content. Editors may create/edit drafts, attach sources, preview drafts and submit them for review; they cannot change live content. Administrators review changes and may publish, schedule publication, unpublish/archive live content or restore a published revision. Editors cannot bypass this restriction through imports, API calls, status-field edits, scheduling, rollback or cache-refresh endpoints. Draft preview must remain private and must not affect published pages or the Groq corpus.

Enforce permissions server-side as well as in the UI. Record actor, timestamp and revision in the publication audit trail. A scheduled publication must originate from an authorized administrator and execute only the approved revision. Existing website CMS authentication/roles must be inspected before implementation; do not assume a CRM administrator automatically has website publishing rights. Test editor denials and administrator success for every operation that can alter live content.


### 14.12 Confirmed manual and scheduled source checks

Provide both an admin-panel “Check for updates” action and scheduled checks of registered official university sources. Both use the same fetch, extraction, validation and draft-review pipeline. A detected change creates a reviewable proposal; neither a scheduled job nor a manual fetch may publish directly or overwrite a published revision.

Administrators configure enabled sources, frequency and schedules, and can pause checks or trigger a manual run. Show last attempt, last successful fetch, last substantive change, next scheduled check, source status and errors separately; successful fetching alone does not mean facts were verified. The owner selected **weekly** as the default frequency. Administrators may change or pause the schedule and run a manual check anytime. Choose and display the configured day, time and timezone during setup; weekly frequency does not imply a particular weekday. Use explicit timezone display and bounded concurrency, per-domain request limits, timeouts and retries. Deduplicate overlapping manual/scheduled runs and repeated identical proposals. Honor source access restrictions; a blocked or unreadable source becomes a review task, not an inferred update.

Diff candidate facts against the current published revision and pending drafts. Preserve editor changes; flag conflicts instead of silently overwriting them. Include old/new values, precise source links, applicable program/session/student category, currency, fetched date and extraction confidence. Missing fields, PDF failures, redirects or layout changes must never erase valid facts automatically. Record job and reviewer audit trails; provide an internal review queue for changed or failed sources without automatically emailing learners or creating marketing campaigns.

Test manual and scheduled runs, no-change checks, duplicate runs, extraction failures, partial results, conflicting edits, domestic/international fee separation, paused schedules, retries and unauthorized publish attempts. Administrator-only publication remains the final gate. This decision adds scheduled draft creation to the plan; no scheduler or source-fetching implementation has been changed.


### 14.13 Confirmed conversion scope: lead capture only

Appointment booking is not required and is excluded from the current implementation scope. Do not build appointment calendars, time-slot selectors, counselor availability scheduling, meeting links, booking confirmations or booking analytics. Apply now uses the agreed contact-first lead form, saves the CRM lead after step 1 and updates the same record with preferences and verification. Staff handle follow-up; existing consent and incomplete/unverified-lead labeling requirements remain.

Success messaging confirms receipt and explains that the team will follow up; do not promise a booked appointment, a response deadline without operational support, or submission/admission to a university. This scope choice does not remove the approved free recommender, public editorial content or gated comparison tool. Learner portals, enrollment/payment transactions and proactive marketing/fee-alert workflows are not implied by lead capture and require separate future scope approval.


### 14.14 External CRM configuration

The owner will configure another CRM endpoint, rather than use the Unnatify CRM in this repository. Do not provision local CRM API keys or enable external delivery on the owner’s behalf. Local website lead capture and admin-inbox visibility can be tested independently. External creation, update/upsert identity, retries, field mapping and step-1 delivery require the target CRM contract/configuration and separate end-to-end verification. Never describe a locally saved enquiry as successfully delivered to that CRM without a confirmed response.
