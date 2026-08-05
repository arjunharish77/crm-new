# Unnati Vidya UI/Design Fidelity Audit — Follow-up Pass

Date: 29/07/2026

Status: full design-fidelity re-audit against `static_site/*.html` (design source of truth per `12_UNNATIVIDYA_WEBSITE_IMPLEMENTATION_PLAN.md` §1) and `design_handoff_unnatividya/*.dc.html` (secondary reference for behavior not covered by static_site). This pass re-checked every public page against the approved design and requirement documents, verified each finding against the actual current code (not assumed from a prior pass), fixed what was in scope for direct code changes, and documents what's still missing below.

This is a follow-up to `15_UNNATIVIDYA_FULL_AUDIT_REPORT.md` (04/08/2026). That pass is not re-litigated here except where a previously-claimed fix had regressed.

## Scope Reviewed

Every public page against its corresponding static HTML: home, header/footer/sticky CTAs/lead wizard, courses listing + course detail (all 23 courses), universities listing + detail (all 3 universities), compare, recommender, blog listing + article detail, legal pages (privacy/terms/refund-policy), about. CMS/admin pages were not in scope for this pass (design source of truth only covers public pages).

## Issues Found and Fixed

### Critical (business-impacting bugs)

- **Online MBA — Amity University Online was permanently unable to appear on `/courses`, with all filters cleared.** The fee-range slider's hard max (`200000`) was copied verbatim from the static handoff's slider before a later "live catalog" pass repriced this course to ₹2,25,000 — above the slider's own ceiling, and `clearFilters()` also reset to that same ceiling, so there was no way to see this course on the listing page at all.
  - Fixed: the slider's max, initial value, and clear-filters reset now derive from `Math.max(...courses.map(fee))` instead of a hardcoded constant, so this class of bug can't recur as the catalog changes. Verified live: the course now appears with all filters cleared.
- **Internal CMS/editorial notes were publicly visible on production-facing pages.** Specifically, on Amity's university page: the About copy read "...detailed copy should be reviewed in CMS before publishing page-level changes"; the scholarships table listed "CMS/source review required" as a proof document; and a public FAQ literally answered "Can Unnati Vidya push leads to CRM?" with internal integration mechanics. A shared FAQ answer used on all 23 course pages also read "...so CMS source review is required before final counselling."
  - Fixed: rewrote all of the above with learner-facing copy that reads like a real answer to a real question, with no internal process language. Verified: none of the strings "CMS", "source review", or "push leads to CRM" remain anywhere in the rendered Amity university page or course FAQ.
- **Blog listing advertised 6 distinct articles; only 3 actually existed.** Half the listing cards (different titles, categories, and excerpts) pointed at a slug that was already used by a different card, so clicking "MCA vs MBA in IT: which switch pays better?" (Careers) or "Documents checklist for online university admission" (Admissions) both landed on the same generic "Validity" article about UGC entitlement — completely unrelated to what was promised.
  - Fixed: gave all 6 posts distinct slugs and real, topic-appropriate body content (new `src/data/blog.ts`), and made the article template (`blog/[slug]/page.tsx`) render the actual matched post's category/title/body instead of a single hardcoded body for every slug. Added a working category filter (new `src/components/blog-explorer.tsx`) since the listing's filter chips previously had no click handlers at all. Verified live: each of the 6 slugs now renders its own distinct content.

### High

- **Contradictory "Annual fee from" figures on every university page.** The About section's fact tile showed a materially lower number (e.g. MUJ ₹40,000) than the same page's own right-rail and every other reference to that university's fee (₹75,000) — on the same page, for all three universities. For a site whose entire pitch is trustworthy, verified fee comparison, a page contradicting its own fee is a real credibility problem.
  - Fixed: fact tiles now use the same `feeFrom` value as the rest of the page, and the tile previously used for a stray "Application fee" (not present in the static design) was replaced with the static handoff's actual "Batches: January & July" tile, matching the design for all three universities.
- **Amity's display name was wrong site-wide.** Catalog data name was "Amity Online"; the static handoff and one already-existing special-case patch (in the course listing only) both used "Amity University Online" — meaning the course detail hero, structured data (JSON-LD `provider.name`), and homepage cards all showed the wrong name for every Amity course and the university page itself.
  - Fixed at the data source (`src/data/catalog.ts`) rather than patching each consumer, and removed the now-redundant special-case patch in `course-explorer.tsx`.
- **A regressed fix reappeared: non-handoff "Program benefits" and "Admission process" sections were back on every course detail page**, between Fees & EMI and Careers. `15_UNNATIVIDYA_FULL_AUDIT_REPORT.md` explicitly lists removing these as already fixed; they were present again (or the fix didn't fully take) in the current code, breaking DOM-order parity with `static_site/course-*.html` on all 23 course pages.
  - Fixed: removed both sections and the now-unused `benefits`/`admissionSteps` course-enrichment fields and their supporting data (`benefitsByStream`, `defaultAdmissionSteps`) that had no other reader.
- **Career-outcome salary bands were hardcoded to one fixed MBA-shaped array and applied by position to every course**, regardless of the actual role shown. On every non-MBA course (BCA, MCA, BCom, MCom, BA, MA — most of the catalog), the salary figure next to a role like "Software Developer" was actually the unrelated MBA figure for whatever position it happened to occupy in the array.
  - Fixed: added a `careerRoleSalary` lookup covering all 61 distinct roles used across the catalog, with realistic entry-to-mid India market bands per role/domain, anchored against the static handoff's own MBA and BCA reference figures.
- **Compare page's "no programs selected" empty state was unreachable dead code.** Clearing every selection navigated to `?add=` (empty string), which is falsy in JS, so the page's own `params.add ? ... : <default 3 courses>` fallback silently repopulated the default trio — `CompareGate`'s `selectedCount === 0` branch could never actually render.
  - Fixed: distinguish "no `add` param at all" (first visit → use default pair, matching static's actual default of 2 courses, not 3) from "`add` param present but empty" (user explicitly cleared selection → must stay empty).
- **Compare table showed the wrong rows and no best-value highlighting.** Static's table (per `site.js`'s actual render logic) shows Total fee / EMI from / Duration / Level / Rating / Approvals / Placement rate / Average package / Hiring partners / Specialisations (as a "N tracks" count) — with the lowest fee, highest rating, and highest placement rate bolded and highlighted. The implementation showed a different row set entirely (dropped Level, Rating, Placement rate, Average package, Hiring partners; added University, Eligibility, Career roles, and a full specialisation list) and never highlighted a best value in any row.
  - Fixed: rewrote the row set and cell rendering to match static exactly, with real best-value comparison (lowest fee wins, highest rating wins, highest placement rate wins) bolded with a green tint background, matching `site.js`'s own comparator logic.
- **Legal pages (Privacy, Terms, Refund policy) showed live, user-facing internal notes** — e.g. "It should be reviewed by the business/legal owner before production launch" — directly in the public policy text visitors and any reviewing authority would read.
  - Fixed: replaced with normal opening copy for each policy. This does **not** substitute for an actual legal review — see Remaining Gaps below.

### Medium

- **Recommender's follow-up chat was mislabeled "guided assistant"** when it is, factually, a fixed set of keyword-matched canned replies (`botReply()`'s literal regex matching) — the inverse of the honesty fix `15_UNNATIVIDYA_FULL_AUDIT_REPORT.md` already made once for the results themselves ("Recommender page labelled live recommendations as sample content"). Mislabeling a scripted feature as more capable than it is works against the same trust goal that earlier fix was for.
  - Fixed: restored the static handoff's honest disclosure, "demo — responses are scripted".
- **Recommender's "Why" explanation and chat replies drifted from `recommender.js`'s actual logic** — different clauses, dropped the real placement percentage, dropped the working-professional/weekend-classes bullet, and one reply asserted stale hardcoded fee figures that no longer match the current catalog.
  - Fixed: realigned `why()` to the same bit-for-bit structure as `recommender.js` (stream fit, budget fit, working-professional bullet, placement rate at the university), and rewrote `botReply()` to restore the missing factual content while keeping fee-dependent claims computed dynamically from the actual shortlisted courses rather than reusing static's now-outdated hardcoded numbers.
  - Also fixed: "Question X of 5" label color/case (was gray+uppercase, static is purple, sentence case), thinking-state timing (900ms → 1400ms, matching static) and ellipsis character.
- **Missing "Other universities to consider" section** on all three university detail pages — present in all three static HTML files, absent from the Next.js implementation entirely.
  - Fixed: added the section (2-card grid linking to the other two universities), matching static's position (after FAQ) and card content (name, city, rating, fee).
- **Course fee-plan table structure didn't match static**: "Full payment" showed no actual discount (same amount as every other row) and carried a 4th "Application fee" row not present in the static design.
  - Fixed: applied the 2% full-payment discount static uses, and removed the extra row (the `applicationFee` field itself is unaffected — it's a separate enrichment field, not part of this table).
- **Dead footer links.** "Top courses" pointed at `/online-mba`, `/online-bba`, `/online-bca`, `/online-mca` — none of these routes exist (confirmed via `generateStaticParams` and the redirect table; they 404 for every visitor on every page, since the footer is site-wide).
  - Fixed: linked to the real MUJ course pages (MBA/BCA/MCA/B.Com), matching static's link set and order.
- **Blog category filter chips had no click handlers at all** (server component, no `"use client"`, no state) — visually present, functionally inert.
  - Fixed as part of the blog-post rebuild described above (new client `BlogExplorer` component).
- **Newsletter "Subscribe" caused a full page navigation** (`<form action="/lead" method="GET">`) instead of opening the in-page lead modal like every other CTA on the site.
  - Fixed: converted to a `data-open-lead` link, consistent with the rest of the app's CTA convention.

### Low

- Dead CSS: `.uv-card` (used by the homepage's "Top online universities" cards) had no matching hover rule anywhere in `globals.css`, so hovering did nothing; `.similar-card` (course detail's "Similar programs" cards) existed in CSS but was applied nowhere, and the course-detail links had no hover treatment either. Consolidated into one real `.uv-card:hover` rule (matching static's `box-shadow` treatment) applied consistently across homepage cards, course-detail similar-program cards, and the new university "other universities" cards; removed the dead `.similar-card` rule.
- Header's "Talk to an expert" button had no hover state (inline-styled, no matching class). Added a small `.uv-header-cta:hover` rule matching static's exact hover color.
- FAQ accordions (home, university detail) and the course-detail curriculum accordion used independent `<details>` elements, so multiple could be open at once — static's `site.js` explicitly closes every other item in a group when one opens. Fixed using the native HTML `<details name="...">` exclusive-group behavior (no JS needed) instead of re-implementing the JS accordion logic.
- Lead-wizard success screen never personalized with the visitor's name ("You're all set" vs static's "You're all set, Priya"); consent microcopy was paraphrased (dropped "WhatsApp", changed "number" to "details"); the modal's title never reflected which course/university the visitor clicked "Enquire" from. All three fixed to match static wording/behavior.
- Course detail: two minor copy deviations from the templated static text ("Chosen during the elective phase - same fee, same duration" / "Elective track · final terms" instead of static's "Chosen in semester 3 — same fee, same duration" / "Elective track · semesters 3–4"), and "{learners} learners guided" instead of static's "{learners} learners across {University} online programs". All aligned to the static wording.
- About page duplicated shorter, conflicting Privacy and Refund-policy summaries that could drift out of sync with the dedicated `/privacy` and `/refund-policy` pages; breadcrumb "Home" was plain text, not a link. Rewrote About to link to the dedicated policy pages instead of restating them, and made the breadcrumb a real link.
- "9 am - 9 pm" used a plain hyphen instead of static's en dash on privacy/terms/refund-policy/about.
- Article JSON-LD author ("Unnati Vidya editorial team") didn't match the visible byline ("Ritika Desai"); fixed to a consistent `Person` entity.
- Article body was missing a second inline image (between the tip callout and the next heading) that `static_site/article.html` has; added support for inline images in the article data model and restored it for the affected post.

### Verified as not a bug (checked against static, not changed)

- University listing page shows only 3 approval badges per card (truncating MUJ's "WES recognised" and Amity's "QS ranked") — this exactly matches `static_site/universities.html`'s own card content; it isn't a truncation bug, static also only shows 3.

## Verification Performed

- `npm --prefix apps/unnatividya run lint` — clean, zero warnings.
- `npx tsc --noEmit --project apps/unnatividya/tsconfig.json` — clean.
- `npm --prefix apps/unnatividya run build` — production build passes; all 23 course pages, 3 university pages, and 6 blog post pages statically generate correctly.
- `unnatividya:routes:smoke`, `unnatividya:sitemap:smoke` (36 URLs, 23 courses, 3 universities), `unnatividya:mobile:smoke`, `unnatividya:lead-otp:smoke` (against local Postgres) — all pass.
- Local runtime crawl against a production server build (port 3100): fetched every changed page and asserted specific fixed content is actually present in the rendered HTML (not just that the page returns 200) — e.g. confirmed Amity's course now appears in `/courses`, confirmed the CMS-language strings are gone, confirmed two previously-colliding blog slugs now render genuinely distinct body content, confirmed the compare table's new rows render.
- No interactive browser testing was performed (standing constraint for this session); verification was via rendered server HTML and the project's existing smoke scripts, consistent with how `15_UNNATIVIDYA_FULL_AUDIT_REPORT.md` describes its own "local runtime crawl" verification.

## Remaining Gaps (not addressed by this pass — tracked here, not fixed)

These were out of scope for a code-fidelity pass (they require real assets, a real legal reviewer, or a real browser/device) and were already flagged in `14_UNNATIVIDYA_ASSET_CHECKLIST.md` / `15_UNNATIVIDYA_FULL_AUDIT_REPORT.md`; restated here because they're still genuinely open as of this pass:

- **Legal copy still needs an actual legal/business review.** This pass only removed the internal disclaimer sentences that were incorrectly left visible in the public copy — it did not have a lawyer review the substance of the Privacy/Terms/Refund policies themselves. Do not treat these pages as launch-ready from a legal standpoint.
- **Production asset checklist is still incomplete**: no final favicons, Open Graph image, university logos, campus photography, certificate samples, stream images, or blog images have been added — `public/approvals/`, `public/hero/`, `public/streams/`, `public/blog/`, and `public/universities/` are still empty except the temporary handoff logo SVGs in `public/brand/`. The site currently renders correctly using remote Wikimedia reference imagery and text-badge fallbacks (verified this pass), but Lighthouse/PageSpeed and true brand fidelity can't be signed off until real assets land.
- **Manual cross-browser/device QA is still pending** at the breakpoints called out in `15_UNNATIVIDYA_FULL_AUDIT_REPORT.md` (1440/1280/1024/768/390/360) and in Safari/Firefox/Edge — this pass verified rendered HTML content and structure, not real browser rendering/interaction.
- **CMS/admin pages were not re-audited** in this pass — scope was limited to the public site against the design source of truth, since the CMS has no corresponding design handoff to check fidelity against.
- **`majmc-amity`** remains flagged from the prior audit pass as pending exact current official fee confirmation.

## Files Changed In This Pass

- `apps/unnatividya/src/data/catalog.ts` — Amity display name, university fact tiles (fee/Batches), CMS-language removal (Amity overview/scholarships/FAQs, shared course FAQ), fee-plan table structure, new `careerRoleSalary` map, dead-field cleanup (`benefits`, `admissionSteps`).
- `apps/unnatividya/src/data/blog.ts` (new) — 6 distinct blog posts with real per-topic body content.
- `apps/unnatividya/src/components/blog-explorer.tsx` (new) — working category filter, extracted from the listing page.
- `apps/unnatividya/src/components/course-explorer.tsx` — dynamic fee-filter ceiling, live result count, removed dead Amity name special-case.
- `apps/unnatividya/src/components/site-footer.tsx` — fixed dead course links.
- `apps/unnatividya/src/components/site-header.tsx` — CTA hover state.
- `apps/unnatividya/src/components/lead-form.tsx` — name personalization, consent copy.
- `apps/unnatividya/src/components/lead-wizard-modal.tsx` — context-aware modal title.
- `apps/unnatividya/src/components/recommender-quiz.tsx` — `why()`/`botReply()` fidelity, question label styling, thinking-state timing, chat disclosure honesty fix.
- `apps/unnatividya/src/app/page.tsx` — FAQ accordion grouping.
- `apps/unnatividya/src/app/courses/[slug]/page.tsx` — removed regressed sections, salary-band fix, certificate copy, copy fixes, accordion grouping, hover class.
- `apps/unnatividya/src/app/universities/[slug]/page.tsx` — "Other universities to consider" section, FAQ accordion grouping.
- `apps/unnatividya/src/app/compare/page.tsx` — empty-state reachability, correct row set, best-value highlighting, correct default preselection, correct 4th-pick behavior.
- `apps/unnatividya/src/app/blog/page.tsx`, `apps/unnatividya/src/app/blog/[slug]/page.tsx` — rebuilt on the shared data module; real per-slug content; newsletter CTA fix.
- `apps/unnatividya/src/app/privacy/page.tsx`, `apps/unnatividya/src/app/terms/page.tsx`, `apps/unnatividya/src/app/refund-policy/page.tsx` — removed internal placeholder text, en-dash fix.
- `apps/unnatividya/src/app/about/page.tsx` — removed duplicated policy content, breadcrumb link fix.
- `apps/unnatividya/src/styles/globals.css` — `.uv-card:hover`, `.uv-header-cta:hover`, `.compare-row-label`, removed dead `.similar-card`.

## Third Pass — Real Assets Wired In + Exact Pixel-Fidelity Sweep

Two follow-on requests in the same audit thread: (1) wire in the real image/icon assets once they were added to `public/`, matching them only to slots that genuinely exist in the design (not inventing new sections); (2) a second, stricter comparison pass explicitly checking literal values (hex colors, px spacing, font-weight, exact copy) rather than structural/functional correctness, since "exactly as per design document" was the bar this time.

### Asset wiring

All assets the user fetched matched the `14_UNNATIVIDYA_ASSET_CHECKLIST.md` spec exactly (right filenames, right paths). Wired in wherever a real code slot already existed:

- University campus photos and logos (`data/media.ts`) — replaced Wikimedia URLs and the plain grey placeholder "logo" boxes on the university/course hero sections.
- Blog cover images (`data/blog.ts`) — replaced Wikimedia URLs for all 6 posts, including the one post's extra inline body image.
- Approval icons (UGC/NAAC/AICTE/WES/AIU) — new shared `ApprovalBadge` component (`components/approval-badge.tsx` + `lib/approval-icons.ts`) renders the matching icon next to the existing text badge everywhere approvals are shown (home, courses listing is N/A, course detail hero, university listing, university detail hero). This is a deliberate, explicit deviation from the static design (which uses text-only badges) made at the user's direct request this round.
- Homepage AI-recommender card and course-detail overview image — swapped to the more thematically correct `hero/recommender-preview.webp` and `hero/student-online-degree.webp` respectively (both slots already showed a photo in the static design; only the specific image changed).

**Explicitly not wired in**, because the exact static design has no slot for them: `illustrations/compare-programs.webp` (the dark "Compare now" CTA band is text+button only, no image column, in the real static HTML), `illustrations/lead-wizard-success.webp` (the wizard's success step is a checkmark icon + text only), and `hero/counselor-guidance.webp` (no unclaimed slot without reusing an image already prominent elsewhere). The university "Campus & learner moments" 3-photo grid was also left on Wikimedia — checked all three static university pages and confirmed the design itself intentionally reuses the identical 3 generic stock photos on every university (only the hero photo varies), so this isn't a placeholder gap, and there weren't enough distinct local generic photos to replace all 3 without repeating an image already used elsewhere on the site.

### Exact pixel-fidelity fixes

A much larger, more literal comparison pass (re-reading every relevant static HTML file's exact inline style values against the current code) turned up real mismatches a functional-only review had missed:

- **Sitewide**: FAQ accordion open/close mark used the wrong glyph (en dash instead of minus sign); homepage FAQ was missing the `faq-item` class entirely, so it showed the browser's default disclosure triangle instead of the custom `+`/`−` mark; lead-modal close button used the wrong × glyph and wrong font-size; `.container`'s max-width was 20px narrower than static's actual 1200px; `--uv-shadow-lg` was referenced in CSS but never defined, silently dropping a shadow.
- **Course detail**: breadcrumb text was invisible against the dark hero (color mismatch on the wrapping div vs. the links); curriculum accordion had no expand/collapse indicator and its "currently open" highlight was frozen to whichever panel opened by default instead of tracking real state; right-rail sticky offset, `.detail-sub` font-size, review star counts (both reviews were hardcoded to 5★ regardless of actual rating), review copy, an overview fact-tile, and a fee-table footnote all had small but real deviations from the literal static text/values.
- **Universities**: listing-page action buttons and the metrics row (rating/programs/placement/package) were using generic/wrong sizing, color, weight, and had invented divider lines not in the design; review counts lost their thousands separator; the "Fees from" line was missing "per year"; an extra ~28px of whitespace sat under the listing page's header; listing cards had a hover shadow/lift animation the design doesn't have; a stale z-index left the sticky pill-nav one layer too low.
- **Compare**: the table header showed a university's short name instead of its full name and a level badge not present in static, and the label column read "Metric" instead of "CRITERIA". More significantly, the whole unlock gate was rebuilt: it previously showed only a standalone form card with no table visible at all, whereas the real design blurs the actual (real) comparison table behind a centered unlock overlay, then replaces that overlay with a small green success banner once verified — `components/compare-gate.tsx` now matches that exact interaction pattern, using the same global lead-wizard modal the rest of the site already uses instead of a bespoke inline form.
- **Recommender**: several font-weight drifts (quiz options/back button/chat chips were 700 instead of static's 600; the match score/best-match badge/chat send button were 800 instead of static's 700), a question-heading size mismatch, a missing spinner margin, and the "Why:" line under each match card was sharing a CSS rule with the duration line above it, giving it the wrong color and wrong top margin.
- **Blog article**: the bottom CTA band, cover image, and two CTA buttons were all falling through to generic shared-class defaults instead of the static design's per-instance sizing (extra unwanted border on the cover image; wrong padding/gap/font-size on the CTA band; wrong button heights); the right-rail heading and "more from the blog" links had a font-size/weight/spacing mismatch.

Every fix in this pass was checked against the actual shared CSS class's other usages first (grep across the codebase) before changing anything, specifically to avoid fixing fidelity on one page by breaking it on another page relying on the same class — several fixes needed a page-specific override rather than a shared-class edit for exactly this reason (e.g. `.detail-sub` font-size differs between course and university pages; `.section` padding needed a one-page override rather than a global change).

**Verification**: `npx tsc --noEmit`, `eslint`, and `npm run build` all clean; all four existing smoke scripts (routes/sitemap/mobile/lead-otp against real Postgres) pass; spot-checked the actual rendered HTML from the user's live dev server (not just build success) for a representative sample of the fixes above, confirming each one is genuinely present in output, not just written in source.
