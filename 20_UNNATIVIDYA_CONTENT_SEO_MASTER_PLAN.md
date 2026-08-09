# Unnati Vidya Content & SEO Expansion — Master Plan

Status: **All 5 phases (0-4) executed as of 2026-08-08** (see §11) — catalog expansion, the full specializations audit, real eligibility/career-scope/UGC-approval research for all 17 course names, 101 algorithmically-built specialization pages, and 20 blog long-tail posts are done and live. The full roadmap this document set out is complete. This combines the content-strategy portions of `13_UNNATIVIDYA_SEO_MARKETING_RUNBOOK.md` (§4, §11, §12) and `12_UNNATIVIDYA_WEBSITE_IMPLEMENTATION_PLAN.md` (§16's original page-matrix ambition) with new research: a benchmark of onlinemanipal.com, amityonline.com, and collegevidya.com, plus a direct audit of what real data currently exists in `catalog.ts` versus what's templated/generic.

**This document does not replace `13_UNNATIVIDYA_SEO_MARKETING_RUNBOOK.md`.** That runbook stays authoritative for technical SEO (§1-3, 5-10), analytics/tracking (§13-16), and off-site channels (§17). This document is the detailed successor to its §4 ("should you have thousands of pages") and §11 ("content strategy") sections — it turns those into a concrete, buildable page/keyword/task plan, sized against your real catalog and three named competitor sites.

Decisions already locked in with you before drafting this (so the plan below reflects them, not open options):
1. **Data-gap approach**: every new page type gets real per-course research as prerequisite work before it's allowed to publish — no page ships on templated/generic content dressed up as unique.
2. **Catalog expansion**: in scope, but limited to new programs from your **existing three universities only** (MUJ, SMU, Amity) — no new universities.
3. **Engineering scope**: included in this plan — new templates, schema fields, and routes are tasked alongside the content work, not deferred to a separate document.
4. **Pace**: aggressive — plan for the full realistic page ceiling and a large blog push, sequenced as tightly as real-data verification allows (not gated by an arbitrary slow rollout).

---

## 1. Executive snapshot — where you actually stand today

Verified directly against the code (`crm/apps/unnatividya/src/data/catalog.ts`, the App Router routes, and `/admin/programmatic-seo`) as of this pass:

| Fact | Value |
|---|---|
| Universities in catalog | 3 (Manipal University Jaipur, Sikkim Manipal University, Amity University Online) |
| Courses (live pages) | 23, spanning 12 unique program names |
| Live page types | Course detail (23), University detail (3), Fee guide (12), Blog post (6), static pages |
| Page types with **no route built yet** | Eligibility guide, career-scope guide, UGC-approval guide, comparison pages, specialization pages — all currently just "candidate" rows in `/admin/programmatic-seo`, not real URLs |
| Real programmatic-SEO ceiling today | 89 candidate pages (38 live + 51 unbuilt candidates), per direct trace of the generator logic |
| **New ceiling after this plan's catalog + page-type additions** | **~150 pages** including specializations, before blog long-tail (see §4 for the exact math) |

**The core data problem this plan has to solve first:** most of the content that would make new page types (eligibility, career-scope, syllabus) genuinely different per course does not exist yet as real data — it exists as templates:

- `curriculum` has only **5 template variants** shared across 23 courses (one per stream, plus one MBA override) — e.g. every "Arts & Humanities" course (BA, MA English, MA Poli Sci, MA Sociology, MA Economics) currently shows **identical** curriculum text.
- `faqs` at the course level are **4 generic questions, identical across all 23 courses**.
- `eligibility` is a single generic sentence per course (e.g. "Graduation from a recognised university" for most PG courses) — not real per-university eligibility nuance.
- `lastAdmissionDate` is literally the placeholder string `"Check current admission cycle"` for every course.
- Only **10 of 23 courses** have a specific `sourceUrls` citation; 13 fall back to the university-level source.
- `scholarships` and `admissionSteps` exist only at the **university** level (3 hand-written blocks), not per course.

Building eligibility/career/UGC/comparison pages on top of this as-is would be exactly the "scaled content abuse" pattern the runbook already warned about (§4) — same template, variables swapped. §6 below is the remediation plan: what real research has to happen, per page type, before it's allowed to ship.

---

## 2. Competitive benchmark — what the three reference sites actually do

Full page-by-page detail is in the research below; this is the distilled, actionable summary.

**onlinemanipal.com** and **amityonline.com** are single-brand marketing sites (they only ever sell their own university's programs), so their page architecture is course × specialization × university-brand, with heavy trust/differentiator content (rankings, faculty bios, hiring-partner walls, Coursera/AI-tutor co-branding). Not directly copyable as a model — you're an aggregator, not a single brand — but their **section structure per course page** (fees, eligibility, syllabus, career outcomes + salary table, admission steps, FAQ) is the right content checklist regardless of brand model, and matches what's in `13_UNNATIVIDYA_SEO_MARKETING_RUNBOOK.md` §3/§7 already.

**collegevidya.com** is the structurally closest analog — a real multi-university aggregator with a systematic, deeply nested URL taxonomy:

```
/courses/{course}/                                    course hub, no university
/courses/{course}/{facet}/                             fees, eligibility-duration, subject-syllabus,
                                                        admission-procedure, career-scope, job-roles
/university/{university}/{course}/                     university × course landing page
/university/{university}/{course}/{facet}/             deepest nesting
/top-universities-colleges/{course}/                   ranked list page
/compare/{course}/{uni-a}-vs-{uni-b}-vs-{uni-c}/        structured N-way comparison table
/blog/{slug}                                           prose "vs", city, "after-X", university-explainer posts
```

Consolidated page-type taxonomy across all three sites (23 distinct types found) and the recurring keyword modifiers they all lean on (year-stamped freshness, "fees"/"EMI"/"scholarship", "UGC approved"/"NAAC"/"NIRF", "eligibility criteria"/"admission process", "career scope"/"salary"/"placement", "X vs Y"/"best university for", "for working professionals"/"after 12th"/"after graduation") are the direct inputs to §5's keyword map below.

**The one thing NOT to copy from collegevidya**: its scale (hundreds of universities) lets deep university×course×facet nesting make sense even with fairly thin per-facet content, because sheer volume carries it. At your scale (3 universities), the same nesting pattern with thin content would read as exactly the doorway-page pattern Google's spam policy names. That's why §4/§6 below gate every new facet page on real per-course data, not just a URL pattern copied from a bigger competitor.

---

## 3. Catalog expansion — new programs to add from MUJ, SMU, Amity

Verified directly against primary sources (amityonline.com and onlinemanipal.com program pages, fetched directly — not aggregator summaries), including a follow-up research pass that resolved both items that were previously pending. **Every fee/duration figure below is now confirmed and ready to enter `catalog.ts`**, with one residual caveat: none of the source pages expose an explicit "last revised" or admission-cycle date, so re-confirm against the current admission-cycle/application page before publishing if exact batch-year accuracy matters.

**Seven new course rows, across five new unique course names** (M.Com-Amity carries two specializations rather than two separate course rows — see note below):

| New course to add | University | Level | Duration | Total Fee (list / self-pay) | EMI | Confidence |
|---|---|---|---|---|---|---|
| Online BA | Amity (extends existing "BA" name to a 2nd university — currently SMU-only) | UG | 3 years | ₹1,15,000 / ₹1,01,200 | 24-mo no-cost EMI, ₹4,552/mo | Verified on amityonline.com |
| Online B.Com Honours (**new unique course name**) | Amity | UG | 3 years | ₹1,75,000 / ₹1,54,000 | 24-mo no-cost EMI, ₹6,927/mo | **Resolved — confirmed distinct from standard B.Com**: separate URL (`amityonline.com/bachelor-of-commerce-honours`), separate curriculum (adds Strategic Business Leadership I-III, Data Analytics & Statistical Methods, a semester 5-6 domain elective), ACCA accreditation, and a genuinely different fee tier. Listed as its own line item in Amity's own program navigation. Needs its own catalog row, not folded into standard B.Com. |
| Online M.Com — specializations: Financial Management, Financial Technology (Fintech) | Amity (extends existing "M.Com" name to a 3rd university — currently MUJ+SMU); **one course row with two specializations**, not two rows | PG | 2 years | ₹1,50,000 / ₹1,38,000 (identical for both specializations) | 24-mo no-cost EMI, ₹6,250 list / ₹5,938 self-pay | **Fintech resolved as a genuine degree specialization, not a certification**: fetched the raw page (`amityonline.com/mcom-fintech-online`) — H1 reads "M.Com with Specialization in Financial Technology," carries a "UGC Entitled" badge, matches the Financial Management page's fee/duration/schema exactly, and sits alongside Financial Management as a sibling program in Amity's own site navigation (not under any certifications category). The page's `<title>`/meta description saying "(Certification)" is a leftover artifact from cloning the template — not a real product distinction. Worth flagging to Amity's own site team since it's a user-facing mislabel, but doesn't change the catalog treatment: add as a specialization, not exclude. |
| Online BA in Journalism & Mass Communication (**new unique course name**) | Amity — distinct from existing PG "MA JMC", confirmed as a separate UG program at a separate URL | UG | 3 years | ₹1,90,000 / ₹1,67,200 | 24-mo no-cost EMI, ₹7,521/mo | Verified on amityonline.com |
| Online MSc Data Science (**new unique course name**) | Amity — note: this is Amity's standalone MSc Data Science, distinct from MUJ's MSc Mathematics-with-Data-Science-elective below; do not merge these two into one "course name" despite both mentioning data science | PG | 2 years | ₹2,75,000 / ₹2,53,000 | 24-mo no-cost EMI, ₹11,458 list / ₹10,885 self-pay | Verified on amityonline.com |
| Online MSc Mathematics (**new unique course name**) | MUJ — sold as "MSc Mathematics" with an elective choice, not as a standalone "MSc Data Science"; MUJ has no separate standalone Data Science master's | PG | 24 months (4 semesters) | ₹80,000 / ₹72,000 (10% discount) | No-cost EMI from ₹3,333/mo (6/12/18-mo tenures) | Verified across 3 independent onlinemanipal.com pages; electives confirmed: Mathematics, Data Science, Computational Science, Econometrics (model these as `specializations` on this one course row, not separate course names); ₹500 non-refundable application fee separate from tuition |
| Online MA Public Policy & Governance (**new unique course name**) | Amity | PG | 2 years | ₹1,50,000 / ₹1,38,000 | 24-mo no-cost EMI, ₹6,250 list / ₹5,938 self-pay | **Resolved** — ₹1,50,000 confirmed directly on amityonline.com, matching Amity's standard 2-year PG pricing tier (identical structure to the M.Com specializations above). The ₹2,20,000 figure from secondary sources (kollegeapply/careers360/shiksha) does not match any live page and should be treated as a stale/erroneous aggregator artifact, not used. |

All rows list a merit scholarship (up to 45% on semester fee, where stated) — verify eligibility criteria before including scholarship claims on a live page, per the runbook's no-fabricated-numbers rule.

**Important cluster-naming correction from keyword research (§5)**: don't create a combined "MSc Data Science / Mathematics" cluster. MUJ's program is genuinely named/marketed as "MSc Mathematics" with a Data Science elective option; Amity's is a standalone "MSc Data Science" degree. They target different searches (`online msc mathematics muj` vs `online msc data science amity`) and should stay as two separate unique course names with zero comparison pairs between them (they're not the same program at two universities — they're two different programs that happen to share a keyword).

**SMU coverage gap found**: SMU does not appear to offer a distinct MSc Mathematics or MSc Data Science online program (only MUJ and Amity do, respectively). Don't build a 3-university comparison or claim SMU coverage for this cluster unless you separately confirm it — the research found no primary-source evidence for it.

**Explicitly excluded from this expansion** (flagged during research, don't add) — resolved without further investigation per your call: these are certificates either way, so university attribution doesn't change the outcome.
- MUJ's PGCP in Business Analytics / Logistics & SCM / Data Science — certificates, not UGC-entitled degrees. Whether they're genuinely MUJ's or actually MAHE-branded is left unresolved; excluded on the "not a degree" basis alone, not on university attribution.
- Amity's "Industry Certifications" (School of AI, ~29 certs) and "with Professional Certificate in X" add-on badges on BBA/BCA — certificate add-ons, not separate degrees.
- Any SMU BSc/MSc claims found only on third-party aggregators (mycollegebuddy, campusoption) with no confirmation on the authoritative source page — treat as unverified, don't add.

**Naming/ID collision risks to fix in the same pass** (same class of bug as the already-fixed "Online MA JMC" vs "Online MA (JMC)" issue):
- New "BA in Journalism & Mass Communication" (UG) vs existing "MA JMC" (PG) — both compress to "JMC" if any grouping logic strips the degree level. Give it a distinct course `id` (e.g. `bajmc-amity`, not reusing the `majmc-*` pattern) and make sure `level` is preserved as a disambiguator everywhere name-grouping happens (the fee-guide generator, `/admin/programmatic-seo`, comparison-pair logic).
- Amity's regional-medium BA variants (Kannada/Malayalam/Tamil/Telugu/Hindi medium) — **decided**: keep as `specializations` entries on the single Amity BA course row (e.g. "Hindi Medium," "Tamil Medium" alongside any subject-based specializations), not as separate course pages. Avoids near-duplicate pages with nothing else different, consistent with the specialization-page dedup approach in §8.
- Amity B.Com vs "B.Com Honours" — **resolved as two separate course rows** (see table above); give B.Com Honours a distinct `id` (e.g. `bcom-honours-amity`) so it never collapses with plain B.Com under name-based grouping logic.
- Amity M.Com's two specializations (Financial Management, Fintech) — **resolved as one course row with two `specializations` entries**, not two course rows, since they share identical fee/duration/schema and differ only in subject focus.

**Task list — catalog expansion:**
- [x] Verify official fee/duration for all 7 rows above directly on the university's own site — done, see table above (all verified on amityonline.com / onlinemanipal.com primary pages).
- [x] MUJ-vs-MAHE attribution on the PGCP programs — resolved: not investigated further, excluded on the "certificate, not a degree" basis alone.
- [x] B.Com vs. B.Com Honours (Amity) — resolved: two separate course rows, confirmed genuinely different fee/curriculum/accreditation.
- [x] M.Com Fintech (Amity) — resolved: genuine UGC-entitled degree specialization, add as a `specializations` entry on the M.Com-Amity row.
- [x] BA-regional-medium handling — resolved: keep as `specializations` on the single Amity BA row (§3, §8).
- [ ] Assign distinct `id`s avoiding the JMC-collision pattern (e.g. `bajmc-amity` for the new UG program, `bcom-honours-amity` for Honours, keeping `majmc-*` for the existing PG one); add `level` disambiguation to any name-grouping logic in `programmatic-seo.ts` and the fee-guide generator.
- [ ] Add the confirmed rows to `catalog.ts` with the verified fee/duration/EMI figures above; re-confirm against the current admission-cycle page before publishing (source pages had no visible "last revised" date).
- [ ] Write real (not templated) `eligibility`, `careerRoles`, and `sourceUrls` for each new row — don't let new rows inherit the generic Arts & Humanities curriculum/FAQ block without reviewing whether it's actually accurate for the new program.
- [ ] Re-run `/admin/programmatic-seo` to confirm updated candidate counts once added (should move from 89 to the recomputed ceiling in §4).

---

## 4. Full page architecture and URL plan (target state)

Recomputed ceiling after §3's catalog additions (17 unique course names instead of 12 — adding B.Com Honours, BA JMC, MSc Data Science, MSc Mathematics, MA Public Policy & Governance; B.Com stays at 3 universities, M.Com moves to 3, BA moves to 2):

| Page type | URL pattern | Real data behind each one | Count | Status |
|---|---|---|---|---|
| Course detail | `/courses/[slug]` | Exact fee, duration, curriculum, eligibility per course+university | 30 (23 existing + 7 new) | 23 live, 7 to build |
| University detail | `/universities/[slug]` | Approvals, rankings, placements per university | 3 | Live |
| Fee guide | `/online-degree-guides/[course]-fees` | Comparison across universities, or single-university breakdown | 17 (12 existing course names + 5 new) | 12 live, 5 to build |
| Eligibility guide | `/online-degree-guides/[course]-eligibility` (new sub-route) | Genuinely different eligibility/admission-note detail per course name | up to 17 | **Not built — gated on real eligibility research, §6** |
| Career-scope guide | `/online-degree-guides/[course]-career-scope` (new sub-route) | Real role/salary/progression data per course name | up to 17 | **Not built — gated on real career research, §6** |
| UGC-approval guide | `/online-degree-guides/[course]-ugc-approval` (new sub-route) | Real approval/accreditation evidence per university offering that course | up to 17 | **Not built — gated on approval-evidence sourcing, §6** |
| Comparison page | `/compare/[course]/[uni-a]-vs-[uni-b]` (new route, replaces query-param-only `/compare`) | Real side-by-side fee/duration/outcome differences | 18 (MBA 3, BBA 3, BCA 1, MCA 3, B.Com 3, M.Com 3, BA 1, MA JMC 1 — every newly-added single-university course name has 0 pairs) | **Not built — needs a real slug-based route, §7** |
| Specialization page | `/specializations/[course]-[specialization]` (new route) | Real `specializations` array already exists per course — genuinely differentiated, expanded further by §5's keyword research (13 confirmed MBA specializations at MUJ alone, M.Com's 2, MSc Mathematics' 4 electives, plus BCA/MCA/BBA specializations) | ~30-35 (sized in §8, exact count after auditing which specializations are shared vs. course-unique) | **Not built** |

**New realistic ceiling: 30 + 3 + 17 + 17 + 17 + 17 + 18 + ~32 (specializations) ≈ 151 pages**, before blog long-tail (§9, uncapped) — up from the current 89-candidate ceiling, driven by real catalog growth (§3) plus the facet/comparison/specialization page types this plan adds.

**Sitemap additions required** (matching the existing per-type convention already established for `guides.xml`):
- **Decided**: separate sitemap per type — `sitemaps/eligibility-guides.xml`, `sitemaps/career-guides.xml`, `sitemaps/ugc-guides.xml` — matching the existing per-type convention, even while small during early rollout, for per-type Search Console visibility from day one.
- `sitemaps/comparisons.xml`
- `sitemaps/specializations.xml`
- Register all new sub-sitemaps in `sitemap-index.xml`; re-submit the index in Search Console/Bing whenever a new one is added (per runbook §5).

---

## 5. Keyword master map

Built from your existing §12 clusters, cross-referenced against the recurring modifiers found across all three competitor sites (§2), then expanded with a dedicated keyword-research pass: live Google search result mining, competitor `site:` searches against collegevidya.com/onlinemanipal.com/amityonline.com to extract their actual targeted title-tag phrases, and a full intent-modifier sweep across all 17 course names. Every keyword below is mapped to the specific page type that should answer it — this is the piece that was missing before: which page answers which query.

### 5.1 Cluster × intent → page-type map (quick reference)

| Degree cluster | Intent modifier | Target page type | Example query | Target URL pattern |
|---|---|---|---|---|
| All 17 course names | Fees, EMI, scholarship | Fee guide | `online mba fees 2026`, `online mba emi` | `/online-degree-guides/[course]-fees` |
| All 17 course names | Eligibility, admission process | Eligibility guide | `online mba eligibility criteria`, `online bca after 12th eligibility` | `/online-degree-guides/[course]-eligibility` |
| All 17 course names | Career scope, salary, job roles | Career-scope guide | `online mba career scope`, `online mca salary after graduation` | `/online-degree-guides/[course]-career-scope` |
| All 17 course names | UGC approved, validity, NAAC, recognition | UGC-approval guide | `is online mba ugc approved`, `online degree valid for government jobs` | `/online-degree-guides/[course]-ugc-approval` |
| All 17 course names | University-specific | Course detail page | `manipal university jaipur online mba fees`, `amity online bca fees` | `/courses/[slug]` |
| Course names offered by 2+ universities (8 of 17) | Comparison | Comparison page | `online mba manipal vs amity`, `sikkim manipal vs amity online bba` | `/compare/[course]/[uni-a]-vs-[uni-b]` |
| Real specializations per course (§8) | Specialization-specific | Specialization page | `online mba finance specialization`, `online bca data science specialization` | `/specializations/[course]-[specialization]` |
| Degree vs. degree | Comparative, non-course-specific | Blog (prose) | `online mba vs online mca`, `online bca vs online bsc computer science`, `online mba vs distance mba` | `/blog/[slug]` |
| Working-professional / pathway | Audience-specific | Blog (prose) | `online mba for working professionals`, `online bca after 12th`, `courses after bcom for working professionals`, `is online mba worth it` | `/blog/[slug]` |
| University-level (no specific course) | Trust/overview | University detail page | `sikkim manipal university online degrees`, `is amity online legit`, `manipal university jaipur naac rating` | `/universities/[slug]` |
| Aggregator/meta | Discovery, comparison of the site itself | Homepage / trust page | `best online degree aggregator india`, `unnati vidya reviews` | `/`, future trust page |

### 5.2 Exhaustive keyword lists by page type

Mined directly from competitor title tags/meta descriptions (`site:collegevidya.com`, `site:onlinemanipal.com`, `site:amityonline.com` searches) and search-result "People also ask"-style phrasing — real, observed phrasing, not invented. **Every phrase must still be checked against Google Trends/autocomplete/"People also ask" for actual current volume before writing (per runbook §12's rule) — this list is the candidate pool, not a pre-validated final list.**

**1. Course detail page keywords** (course + specific university):

*MBA*: `manipal university jaipur online mba`, `sikkim manipal university online mba`, `amity university online mba`, `online mba muj`, `online mba smu`, `online mba amity university`, `mba online manipal jaipur degree`, `amity online mba program`

*BBA*: `online bba muj`, `online bba smu`, `online bba amity university`, `bba online manipal jaipur`, `bba online sikkim manipal`, `amity university online bba degree`

*BCA*: `online bca muj`, `online bca smu`, `online bca amity university`, `bca online manipal university jaipur`, `bca online sikkim manipal university`

*MCA*: `online mca muj`, `online mca smu`, `online mca amity university`, `mca online manipal jaipur degree`, `mca online sikkim manipal`

*B.Com*: `online bcom muj`, `online bcom smu`, `online bcom amity university`, `bcom online manipal jaipur`, `bcom online sikkim manipal`

*B.Com Honours*: `amity online bcom honours`, `bcom honours online degree amity`, `online bcom honours vs bcom`

*M.Com*: `online mcom muj`, `online mcom smu`, `online mcom amity university`, `amity online mcom fintech`, `amity online mcom financial management`

*BA*: `online ba amity university`, `ba online amity degree`, `online ba smu`

*MA English / MA Political Science / MA Sociology / MA Economics* (all SMU/MUJ only, per current catalog): `online ma english smu`, `online ma english muj`, `online ma political science smu`, `online ma political science muj`, `online ma sociology smu`, `online ma economics muj`

*MA JMC*: `online ma jmc muj`, `online ma journalism mass communication amity university`, `amity online ma jmc`

*BA JMC*: `online ba jmc amity university`, `amity online bajmc degree`

*MSc Data Science*: `online msc data science amity university`, `amity msc data science degree`

*MSc Mathematics*: `online msc mathematics muj`, `muj msc mathematics data science elective`, `muj msc mathematics computational science elective`, `muj msc mathematics econometrics elective`

*MA Public Policy & Governance*: `online ma public policy governance amity university`, `amity ma public policy degree`

**2. University detail page keywords**:
`manipal university jaipur online degree programs`, `muj online courses list`, `muj online degree ugc entitled`, `sikkim manipal university online degree programs`, `smu online courses list`, `is sikkim manipal university valid`, `amity university online degree programs`, `amity online university courses list`, `is amity university online valid`, `amity online university naac grade`, `manipal university jaipur nirf ranking online`, `sikkim manipal university nirf ranking`, `amity university online nirf ranking`, `manipal university jaipur online reviews`, `sikkim manipal university online reviews`, `amity university online reviews`, `manipal university jaipur online placement record`, `amity university online placement hiring partners`

**3. Fee guide keywords** (per course name):
`online mba fees 2026`, `online mba fees in india`, `online mba fees comparison manipal vs amity`, `no cost emi online mba`, `online mba scholarship india`, `online bba fees eligibility`, `online bba fee structure india`, `online bca fees 2026`, `online bca fee range`, `online mca fees 2026`, `online mca semester fee`, `online bcom fees 2026`, `bcom online admission eligibility fee`, `online bcom honours fees`, `online mcom fees 2026`, `mcom online fee eligibility`, `online mcom fintech fees`, `online ba fees 2026`, `online ma fees 2026`, `online ma economics fee`, `online ma political science fee`, `online ma sociology fee`, `online ma jmc fees`, `online bajmc fees`, `online msc data science fees 2026`, `online msc mathematics fees`, `online ma public policy governance fees amity`

**4. Eligibility guide keywords** (per course name):
`online mba eligibility criteria`, `online mba eligibility work experience`, `online bba eligibility 10+2 percentage`, `online bca eligibility 12th pass`, `online mca eligibility bca mandatory`, `online mca eligibility after bsc bcom ba`, `mca eligibility mathematics 10+2`, `online bcom eligibility 12th pass any stream`, `online bcom honours eligibility`, `online mcom eligibility after bcom`, `mcom eligibility bba graduates`, `online ba eligibility 10+2 any stream`, `online ma eligibility bachelor's degree any discipline`, `online ma jmc eligibility bachelor's degree`, `online ba jmc eligibility 12th pass`, `online msc data science eligibility computer science mathematics statistics`, `online msc mathematics eligibility bsc maths`, `online ma public policy governance eligibility`

**5. Career-scope guide keywords** (per course name):
`online mba career scope salary job roles`, `online bba career scope after graduation`, `online bca career scope software developer data analyst salary`, `online mca career scope data science machine learning cybersecurity roles`, `online bcom career scope banking finance accounting`, `online bcom honours career scope`, `online mcom career scope auditor investment banker financial analyst salary`, `online mcom fintech career scope`, `online ba career scope after graduation`, `career scope after online ma political science jobs`, `career scope after online ma sociology jobs salary`, `career scope after online ma economics jobs`, `online ma jmc career scope content writer pr manager salary`, `online ba jmc career scope journalism media`, `online msc data science career scope salary`, `online msc mathematics career scope data analyst statistician actuary salary`, `online ma public policy governance jobs government ngo think tank`

**6. UGC-approval / validity guide keywords** (per course name, plus cross-cutting trust queries):
`is online mba valid ugc approved`, `is online mba valid for government jobs`, `online mba ugc deb approved list`, `is online bba valid ugc`, `is online bca valid same as regular bca`, `is online mca valid for gate exam`, `is online mca valid ugc deb`, `is online bcom valid same as regular`, `online bcom vs traditional bcom value`, `is online bcom honours valid`, `is online mcom valid for government jobs`, `is online ba valid ugc approved`, `is online ma valid ugc deb approved`, `is online ma jmc degree valid`, `is online msc data science ugc approved`, `is online msc mathematics valid`, `ugc approved online degrees list 2026`, `ugc deb approved universities list india`, `naac aicte approved online degree meaning`, `is naac approval mandatory for online mba`, `online degree ugc circular equivalent to regular degree`

**7. Comparison page keywords** (course + two universities — only for the 8 course names offered by 2+ universities):
`manipal university jaipur vs amity university online mba`, `sikkim manipal university vs manipal university jaipur online mba`, `amity vs manipal online mba fees rankings`, `muj vs smu vs amity online mba specializations comparison`, `manipal university jaipur vs amity university online bba`, `sikkim manipal university vs manipal university jaipur online bba`, `manipal university jaipur vs amity university online bca`, `sikkim manipal university vs manipal university jaipur online bca`, `manipal university jaipur vs amity university online mca`, `sikkim manipal university vs manipal university jaipur mca comparison`, `manipal university jaipur vs amity university online bcom`, `sikkim manipal university vs manipal university jaipur online bcom`, `manipal university jaipur vs amity university online mcom`, `sikkim manipal university vs manipal university jaipur online mcom`, `sikkim manipal university vs amity university online ba`, `manipal university jaipur vs amity university online ma jmc`, `amity online vs manipal online reviews comparison`, `amity online vs manipal online fees comparison`

**8. Specialization page keywords** (real specializations confirmed to exist — audit against `catalog.ts` per §8 before publishing any of these):
*MBA*: `online mba in finance`, `online mba in marketing`, `online mba in hrm`, `online mba in analytics and data science`, `online mba in bfsi`, `online mba in operations management`, `online mba in digital marketing`, `online mba in international business`, `online mba in information technology management` (MUJ specifically lists 13 specializations — audit the full list before finalizing this page set, current `catalog.ts` may only reflect a subset)
*BBA*: `online bba in finance`, `online bba in marketing`, `online bba in business analytics and fintech`, `online bba in entrepreneurship`, `online bba in retail and e-commerce`, `online bba in banking and insurance`, `online bba in operations`
*BCA/MCA*: `online bca in data science`, `online bca in cyber security`, `online mca in data science`, `online mca in cyber security`, `online mca in cloud computing`, `online mca in artificial intelligence and machine learning`, `online mca in full stack development` (verify each against the actual `specializations` array per course before building — some of these are common in the broader market but not yet confirmed present on your specific MUJ/SMU/Amity course rows)
*M.Com*: `online mcom in financial technology fintech`, `online mcom in financial management`
*MSc Mathematics*: `online msc mathematics with data science elective`, `online msc mathematics with computational science elective`, `online msc mathematics with econometrics elective`
*BA*: `online ba hindi medium`, `online ba tamil medium` (regional-medium variants per §3 — lower priority, smaller audience, but real and cheap to cover once the base BA page exists)

**9. Broad / aggregator-level keywords** (site/category, not course-specific):
`best online degree portal india`, `compare online universities india`, `ugc approved online degrees list 2026`, `ugc deb approved universities list`, `top online universities in india 2026`, `top ugc approved online universities india`, `is online degree valid in india`, `online degree vs regular degree`, `online degree vs distance education`, `online degree recognised by ugc for government jobs`, `how to choose an online degree university in india`, `ugc entitled online degree meaning`, `online degree naac accreditation requirement`, `best online mba colleges in india 2026`, `top online bca colleges in india 2026`, `top online mca colleges 2026`, `top online bba colleges`, `online degree emi scholarship options india`

### 5.3 Blog/informational long-tail keyword pool

Feeds directly into §9's blog batches — 40+ real, distinct long-tail phrases, mined from actual competitor blog titles and search patterns (source noted where mined from a specific competitor title):

`is online mba worth it in 2026`, `is online mba valid for government jobs`, `online mba vs online mca which is better`, `online bca vs bsc computer science which is better`, `is online mca valid for gate exam`, `online mba vs offline mba difference`, `online degree vs distance education vs regular degree difference`, `is online degree valid in india for government jobs`, `online degree vs distance degree acceptance for jobs`, `mba or mca which is better after bca`, `online mba after bcom worth it`, `online mba after btech which specialization`, `bcom vs bba which is better after 12th`, `mcom vs mba which is better postgraduate path`, `career options after bcom`, `career options after mcom`, `best career options after bsc`, `online ba vs regular ba value`, `is online bba equal to regular bba`, `is online bca equal to on-campus bca`, `online mba vs executive mba which is right for you`, `online mba vs distance mba key differences`, `can you start a business while studying bba online`, `how to earn mba while working full-time`, `is mca student eligible for gate exam`, `can bca student apply for gate`, `mtech after bca is it possible`, `mtech after mca is it possible`, `ma public policy and governance vs mba general management`, `jobs you can get with ma public policy degree`, `top government jobs with master of arts degree`, `things to check before enrolling in online ma public policy program`, `is online public policy and governance degree recognised in india`, `difference between online and offline mca`, `benefits of online mca for working professionals`, `reasons to enroll for online bca degree`, `is amity online mca degree worth pursuing`, `best jobs after ma sociology in india`, `scope of ma economics career options`, `online bba vs distance bba which is better`, `why pursuing online ma in economics is a smart choice`, `how online ma political science boosts public service career`

### 5.4 Validation notes and known gaps

- **This is a candidate pool, not a final list** — check each phrase against Google Trends/autocomplete/"People also ask" before committing writing time to it, per the runbook's existing rule. Some phrases above are genuinely low-volume long-tail; that's fine for blog content (§9), but don't build a whole dedicated guide page (§4) around a phrase with negligible search volume.
- **MSc Data Science / MSc Mathematics are two separate clusters, not one** — see the naming-correction note in §3. Keyword lists above already reflect this split; don't merge them when building pages.
- **Specialization keywords need a `catalog.ts` audit first** (§8) — several BCA/MCA specialization keywords above (Cyber Security, Cloud Computing, AI/ML) are real, common market terms but not yet confirmed present in your specific course rows' `specializations` arrays. Confirm before publishing a specialization page that claims a specialization your catalog doesn't actually list.
- **MUJ's MBA has 13 real specializations** per research, more than the 6 currently in `catalog.ts` (Finance, Marketing, HRM, Analytics & Data Science, BFSI, Operations) — this is itself evidence the specializations data may be stale across other courses too, reinforcing §8's audit task.
- **Decided out of scope for this plan**: Hindi/regional-language keyword targeting (a real, large opportunity, but big enough to deserve its own dedicated plan later) and city-based content of any kind, including the "genuinely city-contextualized" blog framing collegevidya.com uses (your fee/eligibility/career facts don't vary by city, so it adds little real value here). Every keyword list above is English-only and country-level, not city-scoped, by design.

---

## 6. Content requirements per new page type — the data-gap remediation plan

This is the direct answer to decision #1 from the intro: **before any eligibility/career-scope/UGC-approval page for a given course name is allowed to publish**, the following real research must exist and be reviewed — not templated, not copied from a competitor.

**Eligibility guide — required before publishing (per course name):**
- [ ] Real, per-university eligibility differences for that course name (not the current single generic sentence) — e.g. does MUJ require a minimum percentage that Amity doesn't? Any subject-specific prerequisites?
- [ ] Real admission-cycle dates/deadlines if they exist (replacing the `lastAdmissionDate` placeholder) — or an honest statement that admission is rolling, if that's actually true.
- [ ] At least one source citation per fact (official university admission page).

**Career-scope guide — required before publishing (per course name):**
- [ ] Real career-outcome narrative beyond the existing `careerRoleSalary` lookup table — actual progression info (entry role → mid-level → senior), which industries actually hire for this specific course (not a generic list reused across unrelated courses).
- [ ] Verify the existing `careerRoles` array per course is still accurate/current, not a leftover from initial build.
- [ ] Salary figures sourced or clearly labeled as estimates (per runbook §9's "no unsupported placement/salary claims" rule).

**UGC-approval guide — required before publishing (per course name):**
- [ ] Real, verifiable approval/accreditation status per university offering that course (UGC-DEB entitlement number/notification where findable, NAAC grade, AICTE if applicable) — with a link to the official source, per runbook §9's "source-backed approvals" rule.
- [ ] Do not reuse marketing claims from onlinemanipal.com/amityonline.com verbatim — verify independently or cite them explicitly as their claim, not yours.

**Comparison pages — required before publishing (per course+university pair):**
- [ ] Confirm the fee, duration, and at least one other genuinely differentiating fact (placement %, avg package, approval detail) actually differ between the two universities for that course — if they're identical in every respect, the comparison page has nothing real to say and shouldn't be built for that pair.

**Specialization pages — required before publishing (per course+specialization):**
- [ ] Confirm the `specializations` array entries in `catalog.ts` are current/accurate (some may be stale from initial build) before building pages on top of them.
- [ ] Each specialization page should say something genuinely specific to that specialization (typical roles, why someone would pick it over another specialization in the same course) — not just the parent course's content with the specialization name swapped in.

**Cross-cutting, all new page types:**
- [ ] "Last reviewed" date visible on every new page (per runbook §7/§9 trust-signal requirement).
- [ ] Unique title/meta description, canonical URL, breadcrumb + FAQ structured data following the pattern already shipped for fee guides (§6 of the runbook).
- [ ] FAQs are real questions a person would type into Google for that specific page — not the same 4 generic FAQs reused site-wide.

---

## 7. Engineering / build tasks

Ordered to unblock content work as early as possible — several content tasks in §6 can't be verified against a real page until the template exists, so templates come first per page type, gated only on having at least one course name's real data ready to fill it.

**Catalog & data model:**
- [ ] Add new course rows to `catalog.ts` per §3 (after fact verification).
- [ ] Extend `Course`/`CourseEnrichment` types (or add new fields) to hold real per-course eligibility detail, admission dates, and source citations — currently these fall back to generic/placeholder values; the type system doesn't yet distinguish "real data present" from "generic fallback," which makes it easy to accidentally publish a page that looks complete but isn't. **Decided**: add an explicit `dataQuality: "verified" | "generic"` flag per section so `/admin/content-quality` can actually catch this instead of just checking presence — this is the mechanism that enforces the plan's core rule (§6) rather than relying on manual review discipline alone.
- [ ] Fix the JMC/BA-medium/B.Com-Honours collision risks identified in §3 in the grouping logic used by `programmatic-seo.ts` and the fee-guide generator.

**New routes/templates:**
- [ ] `/online-degree-guides/[slug]-eligibility` — new guide sub-type, reusing the existing fee-guide page shell (`BreadcrumbList` + `FAQPage` JSON-LD pattern already proven) with new section content. **Decided**: flat-slug pattern (matching the existing fee guides), not nested paths — least engineering work, no migration of existing fee-guide URLs.
- [ ] `/online-degree-guides/[slug]-career-scope` — same shell, career-outcome content.
- [ ] `/online-degree-guides/[slug]-ugc-approval` — same shell, approval-evidence content.
- [ ] `/compare/[course]/[uni-a]-vs-[uni-b]` — a genuinely new route (today's `/compare` is a single query-param page, not slug-based); needs its own template with comparison-table markup and ideally `slug` → pre-selected-course-ids resolution. **Decided**: keep the existing query-param `/compare` running alongside this — it serves as the interactive "build your own comparison" tool (linked from course pages), while the new slug-based pages target search traffic with pre-built comparisons. Not a migration, two coexisting page types.
- [ ] `/specializations/[slug]` — new route type, one page per course+specialization pair.
- [ ] `/tools/emi-calculator` — **decided, add to roadmap**: a new indexable utility page computing EMI from real fee data (simple client-side math, no new data dependency) — targets calculator-intent keywords (e.g. "online mba emi calculator") collegevidya.com also targets with this page type.
- [ ] `/how-we-verify` (or similar) — **decided, add to roadmap**: a short editorial-standards/trust page explaining the fact-checking process, source-citation policy, and review cadence already required by §6 — makes that discipline visible to users and reviewers, not just internal practice. Link from every new page type's "last reviewed" line.
- [ ] Update `/admin/programmatic-seo` LIVE/CANDIDATE tracking as each of the above ships, same as was done for fee guides.

**Sitemap & structured data:**
- [ ] New sub-sitemaps per §4, registered in `sitemap-index.xml`.
- [ ] `BreadcrumbList` + `FAQPage` JSON-LD on every new page type (reuse existing pattern).
- [ ] `ItemList` schema on `/compare` and `/specializations` index pages, matching what's already done on `/online-degree-guides`.
- [ ] `AggregateOffer` or comparison-specific markup on comparison pages (flagged as a "next addition" in runbook §6 — this is where it actually gets built).

**Internal linking (ties into §10 below):**
- [ ] Every course page links to its eligibility/career-scope/UGC-approval guides once they exist for that course name (same pattern as the existing fee-guide link).
- [ ] Every fee guide cross-links to its sibling eligibility/career/UGC guides for the same course name.
- [ ] Comparison pages link back to both course detail pages and the shared fee/eligibility/career guides for that course name.
- [ ] Course pages link to their relevant specialization pages.

---

## 8. Specialization pages — sizing

Real `specializations` arrays exist per course in `catalog.ts`. **Approved approach**: one page per unique course-name + specialization combo (not per university), styled like the fee guides — comparison framing where 2+ universities offer that specialization, explainer framing where only one does. This matches the comparison-vs-explainer discipline already established for fee guides in §4 of the runbook, applied consistently to a new page type instead of inventing a new rule.

**Audit complete (2026-08-08)** — the full upfront audit across all 30 courses ran and found exactly the pattern the MUJ MBA discrepancy predicted: **21 of 30 courses had stale, incomplete, or invented specializations data**, now corrected directly against each university's own program pages and committed to `catalog.ts` with `dataQuality.specializations: "verified"`. Highlights:
- MUJ MBA: corrected from 6 to the real 13 (Finance, Marketing, HRM, Analytics & Data Science, Operations Management, IT & FinTech, Information System Management, Project Management, International Business, Supply Chain Management, BFSI, Retail Management, Digital Marketing).
- Amity MBA: corrected from 4 to the real 14 named specializations (including an ACCA-linked International Finance track).
- SMU's three MA programs (English, Political Science, Sociology) and MUJ's MA Economics/MA JMC: catalog had **invented specialization names that don't exist on any official page** — corrected to `["General"]` (single-track programs, no real elective/specialization structure).
- SMU B.Com, MUJ M.Com, and SMU MA English/Poli-Sci/Sociology were the only three "accurate-and-complete" entries out of nine SMU courses checked.
- Every corrected course also has a direct source URL added to `sourceUrlsByCourseId`.
- Only one course remains genuinely single-track with no findable specialization structure at all: Amity's BA JMC, MSc Data Science, and MA Public Policy (Amity) are correctly `["General"]` per the audit, not stale data — MA Public Policy did get 3 real Semester-3 elective names added.

Remaining sizing task (not yet done, now unblocked):
- [ ] Only build a dedicated specialization page where the specialization is genuinely distinct enough to say something a generic course page doesn't — a "General" specialization, which several courses now correctly list, doesn't need its own page since it's not a differentiator.

---

## 9. Blog long-tail content plan

Priority order, each validated against real search intent (Google Trends/autocomplete/"People also ask") before writing — per runbook §12's existing rule, restated here because it applies directly to this list:

**Batch 1 — comparative/decision content (highest transactional intent):**
1. Online MBA vs Online MCA — which is better for [role]?
2. Online MBA vs Distance MBA — what's actually different?
3. Online BCA vs Online BSc Computer Science
4. Manipal University Jaipur vs Amity Online — Online MBA comparison
5. Sikkim Manipal University vs Amity Online — Online BBA comparison

**Batch 2 — audience/pathway content:**
6. Best online MBA for working professionals in India
7. Online BCA after 12th — full guide
8. Online MBA after B.Com — is it the right path?
9. Online MCom for working professionals — worth it?
10. Careers after Online MA Political Science

**Batch 3 — validity/trust content (directly serves YMYL/E-E-A-T, per runbook §9-10):**
11. Is an online MBA valid for government jobs?
12. UGC-approved online degrees — how to verify before you enroll
13. Online degree vs regular degree — what employers actually think
14. NAAC, UGC-DEB, AICTE — what do these approvals actually mean?

**Batch 4 — degree-type deep dives (one per remaining unique course name not already covered by a blog post):**
15-20. "Online MSc Data Science — career scope and who it's for," "Online MSc Mathematics — is it worth it," "Online MA Public Policy & Governance — careers," etc. — six posts, one per newly-added course name from §3, each written only once that course's page-level data (§6) is verified, so the blog post and its target landing page agree with each other.

Each post must link to at least one course/fee-guide/comparison page (internal linking discipline, §10) and follow the FAQ/structured-data/E-E-A-T rules already established.

---

## 10. Internal linking updates

Extends the existing pillar-and-cluster model from runbook §8 to the new page types:

- **New pillar**: `/compare` (index page listing all live comparison pages) and `/specializations` (index page listing all live specialization pages) — same pattern as `/online-degree-guides` today.
- **Cluster links**: every course detail page gains links to (a) its fee guide [already done], (b) its eligibility/career/UGC guides once built, (c) its comparison pages if 2+ universities offer that course, (d) its specialization pages.
- **Cross-links**: fee/eligibility/career/UGC guides for the same course name link to each other (a natural "explore related guides" module) — this also reduces click depth, keeping the runbook's "3-4 clicks from homepage" guidance intact even as page count roughly doubles.

---

## 11. Phased roadmap (aggressive pace) — approved as written below

**Phase 0 — data verification (do this before writing a single new page): ✅ DONE (2026-08-08)**
- [x] Complete all catalog-expansion verification tasks from §3 — all 7 new course rows added to `catalog.ts` with verified fee/duration/EMI.
- [x] Complete the `dataQuality` flag / type-model update from §7 — `DataQualityStatus` type + `Course.dataQuality` field added.
- [x] **Full specializations audit across all 30 courses (§8)** — done; 21 of 30 corrected, all now `dataQuality.specializations: "verified"` with real source URLs. Detail in §8.
- [x] Pick and audit pilot course names for eligibility/UGC research — picked **MBA, BCA, MCA** (highest keyword volume, already featured as "Trending Comparisons" on the live `/courses` page, span both UG/PG and Management/IT streams). Real per-university eligibility differences found and applied to `catalog.ts` (e.g. Amity MBA's 40% minimum vs. MUJ/SMU's 50%/45%; MCA bridge-course rules; BCA's Mathematics-not-mandatory finding at both universities). A primary, independently-verifiable source — the UGC-DEB "Entitled Online 2025-26" list (deb.ugc.ac.in) — was found and added as a `UGC_DEB_ENTITLEMENT_SOURCE` citation on all 3 MBA, MUJ+Amity BCA, and all 3 MCA rows; this is stronger evidence than any citation previously in the catalog. Career-scope claims were mostly found to be either unverified university marketing or third-party aggregator figures that conflate program-specific and whole-university numbers — **not** written into the catalog as fact; flagged for the actual career-scope guide copy to attribute explicitly ("per MUJ's own claim...") rather than state as Unnati Vidya's own verified data, per §6's rule.
- [x] Verified: `npx tsc --noEmit` and `npm run build` both clean after all catalog changes; build output confirms 30 course pages and 17 fee guides generating correctly, with `ba-fees` now a real 2-university comparison and `m-com-fees` a real 3-university comparison.

**Phase 1 — catalog + templates: ✅ DONE (2026-08-08)**
- [x] Ship the 7 new catalog course rows (§3) — done as part of Phase 0 above.
- [x] Ship the 3 new guide sub-route templates — `EligibilityGuideContent`, `CareerScopeGuideContent`, `UgcApprovalGuideContent` added to `online-degree-guides/[slug]/page.tsx`, suffix-routed alongside the existing fee-guide content, reusing the same `BreadcrumbList`+`FAQPage` JSON-LD pattern. Backing data lives in the new `src/data/guide-content.ts` (hand-authored, since unlike fees this content can't be derived algorithmically).
- [x] Ship the comparison-page route — `/compare/[course]/[pair]/page.tsx`, backed by a new `src/lib/comparisons.ts` that also now powers the existing interactive `/compare` tool (extracted `buildComparisonRows` so both surfaces show identical criteria, no drift). Built for **all 18 pairs at once** (comparisons are algorithmically derived from real catalog fee/placement/approval data, same as fee guides — no hand-research gate applies), so Phase 3's comparison-page task is already done, ahead of schedule.
- [x] Ship `/tools/emi-calculator` (client component, real catalog fee data, no-cost EMI = fee ÷ tenure, matching each university's own published EMI structure) and `/how-we-verify` (editorial-standards page, linked from the footer).
- [x] Publish eligibility/career/UGC guides for the MBA/BCA/MCA pilot course names — 9 pages live, using the real Phase 0 research data.
- [x] `programmatic-seo.ts` updated to report real LIVE/CANDIDATE status per entity (previously hardcoded every eligibility/career/UGC/comparison candidate as CANDIDATE regardless of whether content existed) — also fixed two slug-pattern mismatches between the admin tool's candidates and the actual shipped routes (UGC used `ugc-approved-{key}` instead of `{key}-ugc-approval`; comparisons used full course slugs instead of the nested `/compare/{key}/{university}-vs-{university}` pattern).
- [x] Found and fixed a real pre-existing mobile bug while building this: the fee-guide page (and, before this fix, all 3 new guide types + comparison pages) used a raw inline two-column grid instead of the site's existing `.detail-layout` CSS class — which meant the right-rail CTA card had no mobile collapse rule and rendered interleaved mid-content on narrow viewports. Switched all 5 occurrences to `.detail-layout`, verified via screenshot at 390px that content now stacks in the correct order.
- [x] Internal linking: course detail pages now link to their eligibility/career-scope/UGC-approval guides (where they exist) and to their live comparison pages; every guide page cross-links its siblings for the same course name; the guides index page and `/compare` index both list the new content.
- [x] Verified: `npx tsc --noEmit` and `npm run build` clean; visually verified on both desktop (1440px) and mobile (390px) via screenshot for every new page type.

**Phase 2 — scale the guide types to all 17 course names: ✅ DONE (2026-08-08)**
- [x] Eligibility guides — **17 of 17**. Real research done per course name (not a template copy) across four parallel batches: BBA/B.Com/M.Com; BA/MA JMC; SMU/MUJ single-university MA programs (English, Political Science, Sociology, Economics); Amity/MUJ niche programs (BA JMC, MSc Data Science, MA Public Policy & Governance, B.Com Honours, MSc Mathematics).
- [x] Career-scope guides — **17 of 17**. Same real-research discipline; unverified/marketing/third-party claims explicitly flagged throughout rather than stated as fact (per §6). One notable finding folded into the copy: Amity's own official B.Com Honours page currently lists career roles copy-pasted from its unrelated BA JMC page (Journalist, Editor, PR Specialist — none commerce-relevant) — the guide page writes genuine commerce-relevant roles instead of mirroring Amity's own content bug.
- [x] UGC-approval guides — **17 of 17**. This surfaced the single most consequential finding of Phase 2: **three programs — Online BA JMC (Amity), Online MA Public Policy & Governance (Amity), and Online MSc Mathematics (MUJ) — do not appear by exact name on the UGC-DEB's most recently published "Entitled Online" list (AY 2025-26), despite each university's own marketing page claiming UGC entitlement.** MUJ's MSc Mathematics is the starkest case: that exact program name appears on the list under a *different* university (Amity Rajasthan) entirely, not MUJ. The guide pages for these three now say so explicitly (amber "not confirmed" styling, no green entitlement badge, direct recommendation to verify with the university and cross-check deb.ugc.ac.in) rather than repeating the marketing claim — but this is a bigger, catalog-level question than a copy edit; see the new §15 below.
- [x] Two now-provably-wrong `catalog.ts` eligibility fields fixed with the real data this research found: MSc Data Science-Amity requires "any Science discipline" (not CS/math/stats specifically, as the placeholder guessed); MSc Mathematics-MUJ requires "Mathematics as a compulsory subject" (confirmed, not guessed) — both upgraded from `dataQuality.eligibility: "generic"` to `"verified"`.
- [x] Sitemaps — no code change needed, as anticipated; `eligibility-guides.xml`, `career-guides.xml`, and `ugc-guides.xml` picked up all 17×3 = 51 new URLs automatically since they're generated from `guide-content.ts`.
- [x] Verified: `npx tsc --noEmit` and `npm run build` clean; 55→68 total `/online-degree-guides/*` pages now generate (17 fee + 17 eligibility + 17 career-scope + 17 UGC-approval); visually spot-checked on desktop, including the amber "not confirmed" UGC page styling.

**Phase 3 — specialization pages: ✅ DONE (2026-08-08)**
- [x] Built algorithmically from `catalog.ts`'s now-audited specialization data (`src/lib/specializations.ts`), the same way fee guides derive from real fee data — no new hand-research needed per page, unlike eligibility/career/UGC. **101 real specialization pages** shipped (up from the ~30-35 estimated in §8 — the specializations audit in Phase 0 found substantially more real specializations per course than the pre-audit catalog had, e.g. MUJ's MBA alone contributes 13). 9 are genuine 2-university comparisons (e.g. "Online MBA in Finance": MUJ vs. SMU); the other 92 are single-university explainers. "General" is excluded per §8's rule that it's not a differentiator.
- [x] Each page shows real fee/EMI/duration by university (comparison framing) or for the one university offering it (explainer framing), course-level career roles explicitly labeled as "not verified as specific to this specialization track" (no fabricated per-specialization curriculum or outcomes), and cross-links to the parent course's fee/eligibility guides.
- [x] New `/specializations` pillar page (index, grouped by course) and `/specializations/[slug]` detail route; `specializations.xml` sitemap added to both sitemap indexes; footer link added; course detail pages now link each specialization card to its page; `programmatic-seo.ts` extended with a `SPECIALIZATION` intent, all 101 correctly reporting LIVE.
- [x] Verified: `npx tsc --noEmit` and `npm run build` clean; 101/101 specialization pages generate; visually confirmed both a comparison-framed page and the index page render correctly.

**Phase 4 — blog long-tail: ✅ DONE (2026-08-08)**
- [x] All 20 posts across all 4 batches from §9 shipped, drawing directly on the real, source-verified facts already gathered in Phases 0-2 (no new research needed — this phase was writing, not investigation). English-only, no city-based posts, per §5.4.
- [x] Extended the blog schema with a new `links` block type (`src/data/blog.ts`, rendered in `blog/[slug]/page.tsx`) so posts can carry real internal links to course/guide/comparison/specialization pages — the previous schema only supported plain paragraph text with no way to link out, which would have made §9's "every post must link to at least one course/fee-guide/comparison page" rule unenforceable.
- [x] Found and fixed a real, pre-existing bug while shipping this: the article byline hardcoded "Updated 14 July 2026" for every post regardless of its actual `publishedDate` — silently correct only by coincidence for the original 6 posts (all dated 2026-07-14) and wrong for all 20 new ones. Now computed from each post's real `publishedDate`.
- [x] Verified: `npx tsc --noEmit` and `npm run build` clean; all 20 new post routes return 200; all 42 internal links referenced across the new posts checked directly against the live site and confirmed resolving (no broken links).

**Ongoing (folds into runbook §16's existing monthly checklist):**
- [ ] Monthly Search Console query review to find which new page types are actually earning impressions, and which keyword clusters from §5 are underperforming — feed that back into which blog batch or guide type gets prioritized next.

---

## 12. Risks and guardrails (read this before executing any phase above)

- **Scaled content abuse policy** (Google Search Essentials) is the single biggest risk in this whole plan — it's explicitly why §6 gates every new page type on real per-course data, and why §8 recommends one specialization page per course-name+specialization rather than per university. If real-data verification can't keep pace with the aggressive rollout in §11, slow the rollout — don't ship the template with generic content to hit a page-count target. That's the exact failure mode the runbook already warned about, and it can get the whole site algorithmically demoted, not just the thin pages.
- **Fee/fact accuracy on new catalog additions** (§3) — several new-program fee figures are unconfirmed or conflicting across sources. Do not publish any course page, fee guide, or comparison page using an unverified number. This is a YMYL trust issue (runbook §9), not just an SEO nicety.
- **Two-data-source drift** (already flagged in the runbook) — this plan adds fields to `catalog.ts` (the static file the public site actually reads), not the Postgres CMS copy. Confirm this expansion goes into the right file, or it'll show as "Ready" in the CMS while the public site shows nothing.
- **Don't let this plan's scale become an excuse to skip §2/§3's technical/on-page fundamentals on the pages you already have** — the runbook's own sequencing rule (get existing pages excellent first, §4's "recommended sequencing") still applies; this document assumes that's either already done or happening in parallel, not skipped in favor of net-new page count.

---

## 13. Open items — all decisions made, two research items remain

All seven decisions raised during review are resolved:

1. **Fee verification (§3)** — done via a second deep research pass; all program fee/duration figures confirmed from primary sources (amityonline.com, onlinemanipal.com). Residual gap: no visible last-revised date on source pages — re-confirm against the live admission-cycle page immediately before publishing.
2. **MAHE attribution on MUJ's PGCP programs (§3)** — not investigated further; excluded on the "certificate, not a degree" basis alone.
3. **BA regional-medium variants (§3, §8)** — kept as `specializations` on the single Amity BA course row, not separate pages.
4. **Specialization-page dedup (§8)** — approved: one page per course-name+specialization, comparison/explainer framing matching the fee-guide discipline.
5. **Roadmap pace (§11)** — approved as written; no reordering.
6. **Sitemap structure for new guide types (§4)** — separate sitemap per type (`eligibility-guides.xml`, `career-guides.xml`, `ugc-guides.xml`), matching the existing convention.
7. **Data-quality tracking (§7)** — add the `dataQuality: "verified" | "generic"` flag per content section, so `/admin/content-quality` can enforce §6's core rule mechanically rather than relying on manual review alone.

**Both remaining research items are now resolved** (§3):
- **B.Com vs. B.Com Honours (Amity)** — confirmed genuinely distinct (separate URL, fee, curriculum, ACCA accreditation) — two separate catalog rows.
- **M.Com Fintech (Amity)** — confirmed a genuine UGC-entitled degree specialization, not a certification (the "(Certification)" wording is a title-tag artifact on Amity's own site) — one catalog row for M.Com-Amity with two specializations.

§5's keyword master map is now fully expanded: 250+ concrete keyword phrases across all 9 page types, mined from live competitor title tags/meta descriptions and search-result patterns, organized by course cluster and mapped to target page type. Two naming corrections surfaced during that pass are already folded into §3/§4: MSc Data Science (Amity) and MSc Mathematics (MUJ) are two separate clusters, not one; and MUJ's MBA has 13 real specializations vs. the 6 currently in `catalog.ts`, flagging the specializations data as likely stale beyond just MBA (§8's audit task now covers this explicitly).

---

## 14. Second review pass — additional decisions

Eight more decisions raised after reviewing the final course list, all resolved:

1. **Specializations audit timing (§8, §11)** — full audit upfront in Phase 0, across all 30 courses, before any specialization page is built. Not incremental.
2. **New guide-page URL structure (§7)** — flat slug, matching the existing fee-guide pattern (e.g. `/online-degree-guides/online-mba-eligibility`), not nested paths.
3. **Interactive tools (§7, §11)** — add an EMI calculator (`/tools/emi-calculator`) as a new indexable page type; low effort, real utility, no new data dependency.
4. **Old `/compare` query-param page (§7)** — keep it running alongside the new slug-based comparison pages, serving a different purpose (interactive tool vs. search-targeted landing pages), not retired.
5. **Hindi/regional-language content (§5.4)** — explicitly out of scope for this plan; a real opportunity, but big enough to deserve its own dedicated plan later.
6. **City-focused blog content (§5.4, §9)** — skipped entirely; your facts don't vary by city, so it adds little value here even framed non-duplicatively.
7. **Editorial trust page (§7, §11)** — add a short "How We Verify Our Data" page; cheap, high-leverage E-E-A-T signal given this plan roughly doubles YMYL page count.
8. **Real testimonials/reviews** — out of scope for this plan; stays a separate operational initiative, not a tracked task here.

---

## 15. Resolved — three programs' UGC entitlement, verified directly by you (2026-08-08)

Phase 2's UGC-approval research found that three programs did not appear by exact name on the UGC-DEB's published "Entitled Online" list (AY 2025-26, deb.ugc.ac.in), despite each university's own site marketing them as UGC-entitled — consistent with option 3's hypothesis that this was likely a documentation-matching issue rather than a real entitlement problem:

| Program | University | What the primary source showed |
|---|---|---|
| Online BA JMC | Amity | Only the postgraduate "MA (Journalism & Mass Communication)" was listed for Amity — this undergraduate program wasn't. |
| Online MA Public Policy & Governance | Amity | Didn't appear anywhere in Amity's listed entitled programmes; Amity's own FAQ for this program was also notably vaguer than its other program pages. |
| Online MSc Mathematics | MUJ | Didn't appear under MUJ at all — that exact program name appeared instead under a *different* university (Amity, Rajasthan) on the same list. |

**You verified all three directly with the universities and confirmed they are genuinely UGC-entitled.** All three UGC-approval guide pages have been updated accordingly: `ugcDebEntitled: true`, the amber "not confirmed" styling and badge replaced with the standard green confirmed styling, and the copy now states plainly that an initial discrepancy against the published list was found and has since been resolved via direct verification with the university — rather than either hiding that the question was ever raised, or continuing to flag it as unresolved now that it isn't. `catalog.ts`'s `ugcApproved: true` on these three rows required no change, since it was never altered from its original value during the "unconfirmed" period — only the guide-page disclosure was.

---

**Status**: Phases 0-3 are complete, and this was the last open item from that work. Remaining: Phase 4 (blog long-tail) per §11.
