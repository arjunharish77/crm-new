# Unnati Vidya: content audit and content plan

Prepared 5 October 2026 by a read-only review of `apps/unnatividya` (working tree on `main`), the live `/blog` listing and a small sample of public competitor and university pages. No repository files were changed.

Rules applied throughout: the master plan §6, §8 and §14 and `DESIGN_AND_CONTENT_STANDARD.md`. That means the byline is exactly **Content Team, Unnati Vidya**; content is English only; only MUJ, SMU and Amity Online are covered; no invented facts, rankings, salaries, reviews or approvals; every material fact has an official source and a checked date; existing ratings and testimonials stay visible but are marked unverified; no padding; no doorway or city pages.

Labels used in this report:
- **[OWNER]** means the item needs facts that only the owner can supply.
- **[SOURCE]** means an official document must be obtained or re-checked before publication.

---

## 0. Headline findings

1. **The blog has 26 posts, not 28.** That is true of both `src/data/blog.ts` and the live `/blog` listing. Every post is thin: the body is 128–195 words, the FAQs add about 80–140 words, and most FAQ answers repeat the body. The read times are inflated: posts of about 150 words are labelled "5–8 min read". No post has a table, no post cites its own sources, and the "Sources" rail shows the same 2025 UGC-DEB PDF on every post, including career posts. `dateModified` always equals `publishedDate`, and no updated date is shown.
2. **Several posts contradict the evidence files or the catalog.** These need fixing before any growth work:
   - `online-mba-guide` is titled "Online MBA under ₹1 lakh" and its excerpt promises "three UGC-entitled MBAs under a lakh". The cheapest MBA in the catalog is SMU at ₹1,20,000. **The title is false.**
   - `online-mba-vs-online-mca-which-is-better` says both degrees are "open to any bachelor's degree at MUJ, SMU and Amity". Amity's MCA requires BCA, or a Science/Commerce/Arts degree with Maths at 10+2, or a CS-related B.Tech, with a bridge-course route (`guide-content.ts` mca). **This is a contradiction.**
   - `how-to-verify-ugc-approved-degree`, `is-online-mba-valid-for-government-jobs` and the MSc Mathematics UGC guide say three program discrepancies were "directly verified and confirmed with the universities". `COURSE_CONTENT_REVIEW_2026-09-30.md` says MUJ MSc Mathematics, Amity B.Com Honours and Amity MSc Data Science **still need evidence**, and all recognition rows are "provisional" until matched to the exact institution and session. The register shows `recognitionStatus: pending_regulator_review` for the programs. **Nothing on file supports "confirmed with the universities".**
   - Recognition copy cites the "Entitled Online **2025-26**" list. UGC-DEB has since published the 2026-27 (August 2026 session) lists, so every validity page is stale for the current cycle. [SOURCE]
   - `sikkim-manipal-vs-amity-online-bba` calls the BBA gap of ₹1,09,000 "the widest fee gap of any comparison on this site". Once the prepared Amity MAJMC correction (₹1,30,000 → ₹1,90,000) is published, MUJ vs Amity MA JMC becomes a ₹1,10,000 gap and the claim is false.
   - `online-msc-data-science-career-scope` repeats an unsourced "₹6–12 LPA" salary range. `online-ba-jmc-what-to-expect` repeats Amity blog salary figures. `online-msc-mathematics-worth-it` repeats a "10% discount for 80%+" promotion. These are new or unverified salary and promotional claims inside articles, so they fall outside the §14.10 "retain existing" exception.
3. **Programmatic page families are mostly templated.** There are 17 fee guides, 18 comparison landing pages and 101 specialization pages, and nearly all of them are built only from catalog numbers plus templated FAQs. Of the specialization pages, **92 are single-university pages with no specialization-specific content** (no subjects, no electives, no prerequisites), and several are near-duplicate pairs (for example `mca-cybersecurity` and `mca-cyber-security`). This is the main thin and duplicate risk on the site. The 51 hand-researched eligibility, career and UGC guides (`guide-content.ts`) are the strongest original asset, but they are dated "August 2026" and partly stale.
4. **Templated text states unsupported facts as universal**, and it appears on many pages:
   - `fee-guides.ts`: "Every university listed offers no-cost EMI". The standard explicitly forbids this.
   - "Specializations never change the fee".
   - "Fee covers tuition, LMS access and online proctored exams".
   - "Fee differences reflect brand/placement scale".
   - `catalog.ts` `commonCourseEnrichment` gives every course the same values: "Full payment (2% off)", "15-20 hours/week", "80-90 credits" or "120 credits", "₹500" application fee and "Online proctored". These were not sourced per course. The MUJ evidence supports ₹500 for Indian applicants only, and Amity shows a different lump-sum discount.
   - `course-faqs.ts` asserts "UGC-entitled… legally equivalent… for PSU recruitment".
   - The homepage claims "lowest-fee guarantee", "Every university pays us the same", "Approvals re-checked every admission cycle", "We handle documents, loans… until LMS login", "Every listed program offers no-cost EMI" and "certificate won't say online". These are master plan UV02 items that remain in `src/app/page.tsx` and need [OWNER] substantiation or removal.
5. **Verified research exists but is not shown on pages.** Course pages render no source links and no checked dates. They also do not use any of the following, all of which sit in `docs/`:
   - category fees (MUJ: INR / NRI USD / Foreign USD; SMU: INR / International USD)
   - semester schedules
   - the 2026-27 prospectus and PPR links
   - official program URLs
   - prepared eligibility corrections that separate domestic and foreign applicants
   - 30 prepared curriculum overviews
   - UGC-DEB candidate rows
   - the Amity instalment discrepancies
6. **Competitors win on structured, decision-ready formats**, not on prose length:
   - category fee tables with lump-sum, annual and semester options
   - EMI amounts
   - semester-wise syllabus
   - a sample degree certificate
   - an assessment pattern (for example the 30% internal / 70% end-term split that third parties report for both universities; must be confirmed from the official PPR or programme guide)
   - live-class and LMS description
   - downloadable brochures
   - faculty lists
   - admission deadlines
   - long FAQs

   Unnati Vidya's opportunity is to present the same formats **with sources and checked dates**, and to be honest about unknowns. Competitors generally do not do either.

---

## 1. Blog audit (26 posts)

Word counts are body words / FAQ words. Structure is the count of H2 headings, plus N for a note, L for a link box, I for an image and F for FAQs. No post has a table. No post cites a primary source inline: the only external citation is the shared rail PDF, and a few posts name "deb.ugc.ac.in" as text without linking it.

| # | Slug / title | Category | Words | Structure | Freshness and dated claims | Overlap | Quality issues | Rating |
|---|---|---|---|---|---|---|---|---|
| 1 | ugc-approved-online-degree-guide: "Are online degrees valid for government jobs in 2026?" | Validity | 151/116 | 3 H2, N, I, 3F | "2026" in the title; no session named | #17, #18, #19, #20, 17 UGC guides | Generic; no regulation cited (the UGC ODL & Online Programmes Regulations 2020 equivalence clause); no DEB-ID or ABC mention; "the one check" is oversimplified | **Rewrite** as the validity pillar (keep this URL) |
| 2 | online-mba-guide: "Online MBA under ₹1 lakh: real options compared" | Fees & EMI | 183/115 | 3 H2, N, 3F | Undated fees | #10, #12, mba-fees guide, 3 MBA compare pages | **False title and excerpt.** Generic text; tells readers to compare "placement rate/average package", which are unverified university-wide figures | **Rewrite** as "Online MBA total cost 2026-27" with a category fee table, or 301 to the mba-fees guide |
| 3 | mca-vs-mba-it-careers: "MCA vs MBA in IT: which switch pays better?" | Careers | 172/86 | 3 H2, N, 2F | None | #7 (same intent) | The title promises pay data that the post does not have; generic | **Merge** into #7 (301) |
| 4 | online-admission-documents-checklist | Admissions | 157/104 | 3 H2, N, 3F | None | eligibility guides | Generic; misses ABC ID and DEB-ID (UGC requirement since 2024), category and foreign or NRI documents (AIU equivalence), and per-university lists; "free pre-check" is an unverified service [OWNER] | **Expand** into the admissions pillar's checklist |
| 5 | wes-evaluation-online-degrees | Validity | 185/93 | 3 H2, N, 2F | None | #20 | Unsourced claims about how WES evaluates; nothing cited from WES itself; the "WES recognised" badge is used on catalog cards | **Rewrite** with a WES primary source, or retire until sourced [SOURCE] |
| 6 | studying-while-working-fulltime | Careers | 176/114 | 3 H2, N, 3F | None | none | Unsourced generalisations ("live sessions typically on weekends"); no program data, although MUJ's own page states its weekly hours | **Expand** with sourced, per-program workload and a planner |
| 7 | online-mba-vs-online-mca-which-is-better | Careers | 174/114 | 2 H2, N, L, 3F | None | #3 | **Factual error on Amity MCA eligibility** | **Rewrite** and absorb #3 |
| 8 | online-mba-vs-distance-mba-difference | Validity | 149/104 | 2 H2, N, L, 3F | Implicitly 2025-26 | #1 | Useful distinction but thin; asserts "verified directly against UGC-DEB list" with no session or row | **Expand** into "Online vs distance (ODL) vs regular" |
| 9 | online-bca-vs-bsc-computer-science | Careers | 174/108 | 2 H2, N, L, 3F | None | #13, bca-eligibility | No BSc CS program in the catalog to link to; "Maths not mandatory" repeated across 3 pages; Amity's own minimum % is inconsistent (guide) | **Rewrite** as "BCA vs BSc CS vs B.Tech" (explainer) or merge into #13 |
| 10 | manipal-university-jaipur-vs-amity-online-mba | Fees & EMI | 128/80 | 2 H2, N, L, 3F | Undated fees | `/compare/mba/amity-online-vs-manipal-university-jaipur` (same intent) | Thinnest post; "equal validity" and "compare placement rate" | **Merge** into the editorial compare page (enrich it, 301 the post) |
| 11 | sikkim-manipal-vs-amity-online-bba | Fees & EMI | 134/111 | 2 H2, N, L, 3F | "Widest gap" claim will become false | `/compare/bba/...` | Same as #10 | **Merge** into the compare page |
| 12 | best-online-mba-working-professionals | Careers | 148/120 | 2 H2, N, L, 3F | None | #2, #14, mba-eligibility | A "best" title with no ranking basis; content is really "no work experience needed" | **Rewrite** as "Choosing an online MBA while working" (no "best") |
| 13 | online-bca-after-12th-guide | Admissions | 146/107 | 2 H2, N, L, 3F | None | #9, bca-eligibility | Thin; good learner intent | **Expand** into the BCA pillar |
| 14 | online-mba-after-bcom-right-path | Careers | 148/123 | 2 H2, N, L, 3F | None | #12 | Reasonable; specialization claims are sourced to the catalog | **Keep** and expand lightly |
| 15 | online-mcom-working-professionals-worth-it | Careers | 171/116 | 2 H2, N, L, 3F | None | #26, m-com guides | The "no B.Com needed" claim conflicts with review notes: the Amity M.Com commerce restriction is unresolved and MUJ/SMU need review | **Expand** and absorb #26 after the eligibility check |
| 16 | careers-after-online-ma-political-science | Careers | 135/107 | 2 H2, N, L, 3F | None | ma-political-science-career-scope guide | Shorter duplicate of the guide | **Merge** into the guide |
| 17 | is-online-mba-valid-for-government-jobs | Validity | 162/120 | 2 H2, N, L, 3F | 2025-26 list; "verified" overclaim | #1, #18, mba-ugc-approval | Unsupported "confirmed" language | **Merge** into the #1 pillar (301) |
| 18 | how-to-verify-ugc-approved-degree | Validity | 189/141 | 2 H2, N, L, 3F | 2025-26 | #1, #17 | **Unsupported "verified with universities"**; no screenshots or steps | **Rewrite** as a step-by-step "how to check the UGC-DEB list" tutorial |
| 19 | online-degree-vs-regular-degree-employers | Validity | 149/118 | 2 H2, N, L, 3F | None | #1 | "What employers think" without employer evidence; "regulatory fact" with no citation | **Expand** with the regulation citation, or merge into #1 |
| 20 | naac-ugc-deb-aicte-explained | Validity | 195/115 | 3 H2, N, L, 3F | None | 17 UGC guides, #5 | Useful; "AICTE matters for MBA/MCA" needs the current AICTE position on online programmes [SOURCE]; misses NIRF, NBA, AIU, QS and WES | **Expand** into a "recognition glossary" with a per-university entity table |
| 21 | online-msc-data-science-career-scope | Careers | 154/106 | 2 H2, N, L, 3F | None | msc-data-science career guide | **Unsourced ₹6–12 LPA salary** | **Merge** into the guide; drop the salary |
| 22 | online-msc-mathematics-worth-it | Careers | 132/108 | 2 H2, N, L, 3F | Promotion claim | msc-mathematics guides | Eligibility wording is still unresolved (PPR vs page); discount is promotional | **Merge** into the guides |
| 23 | online-ma-public-policy-governance-careers | Careers | 161/106 | 2 H2, N, L, 3F | None | career guide | Duplicate | **Merge** |
| 24 | online-ba-jmc-what-to-expect | Careers | 149/112 | 2 H2, N, L, 3F | Amity blog salary | ba-jmc guides | Repeats marketing salary; the English-medium rule needs a current check | **Merge** |
| 25 | online-bcom-vs-bcom-honours-amity | Fees & EMI | 190/111 | 3 H2, N, L, 3F | Commentary on Amity's page error (will date) | b-com guides | Genuinely useful comparison; the 55% threshold is "to confirm" per the review; "our own career-scope guide lists roles" means the site authored roles the university does not state | **Keep and fix**: remove page-error commentary, add a fee/curriculum table |
| 26 | online-mcom-fintech-amity-explained | Fees & EMI | 190/135 | 2 H2, N, L, 3F | Title-tag commentary (will date) | #15, the `m-com-financial-technology` spec page | A whole post about a competitor's metadata bug; review notes say do not combine the FinTech program with the Financial Management record | **Merge** into an M.Com explainer |

**Net result after consolidation: 26 posts become about 15.** Merge 9 posts (#3, #10, #11, #16, #17, #21, #22, #23, #24), merge #26 into #15, and retire or rewrite #5. Every merge needs a 301 redirect and an entry in `src/lib/redirects.ts`.

Template-level fixes for all posts:
- compute reading time from the word count
- add an `updatedDate` that is set only on substantive change, and use it for `dateModified`
- add a per-post `sources[]` list with `checkedAt`, replacing the generic rail PDF
- add `table` and `checklist` block types
- set `related` by cluster rather than category
- keep the exact byline

---

## 2. Degree guides and programmatic families

| Family | Route | Count | Unique content | Templated content | Thin or duplicate risk |
|---|---|---|---|---|---|
| Eligibility guides | `/online-degree-guides/{key}-eligibility` | 17 | Hand-written per-university facts, a differentiator note and 3–6 FAQs; source URLs; "Last reviewed: August 2026" | Page frame | **Low to medium.** Content is original, but it still uses pre-correction eligibility text, while 28 prepared corrections (domestic vs foreign) are unpublished. Several single-university guides (MA English, Sociology, Economics) are very short. |
| Career-scope guides | `{key}-career-scope` | 17 | Roles and industries from university pages; "what we couldn't verify" note | Frame; the H1 says "salary", yet no salary is given | **Medium.** The title promises salary. Roles are mostly lists, with no skills, entry routes or realistic timelines. Some cite aggregators (CollegeDunia 93%), which conflicts with the source rule. |
| UGC-approval guides | `{key}-ugc-approval` | 17 | Per-university entitlement, NAAC and AICTE notes | Frame | **High freshness risk.** They cite the 2025-26 list, while recognition is "pending regulator review" in the register. There are 17 near-identical pages for a question that is answered per program and per session; consider one recognition hub plus a per-course recognition block on course pages. |
| Fee guides | `{key}-fees` | 17 (8 multi-university) | None: an intro string, fee cards and FAQs are all generated | 100% | **High.** No sources or dates; universal EMI, inclusion and specialization-fee claims; no NRI or international fees, semester schedule or application fee. The 9 single-university fee guides duplicate the course page. |
| Comparison landing pages | `/compare/{key}/{a}-vs-{b}` | 18 | None beyond catalog rows; generated FAQs | 100% | **Medium to high.** "Best" highlighting of rating and placement uses unverified university-wide data, against the standard's no-universal-winner rule. Two blog posts duplicate the intent. These pages are worth keeping (public editorial comparisons are approved), but they need a written verdict, category-aligned fee rows, curriculum and assessment differences, and sources. |
| Specialization pages | `/specializations/{course}-{spec}` | 101 (9 multi-university, 92 single) | None specific to the specialization: fee and duration of the base program, base program roles, templated FAQs | ~100% | **Highest risk.** About 92 pages differ only in name. Near-duplicates include `mba-hr` / `mba-human-resource-management`, `mba-marketing` / `mba-marketing-sales-management`, `mba-international-business` / `-management`, `mba-digital-marketing` / `-management`, `mba-healthcare` / `mba-hospital-and-healthcare-management`, `mba-operations-management` / `-production-and-operations-management`, `mba-data-science` / `mba-analytics-data-science` / `mba-business-analytics`, `mca-cybersecurity` / `mca-cyber-security`, and `mca-ai-and-ml` / `mca-ai-machine-learning` / `mca-machine-learning-artificial-intelligence`. The `ba-*-medium` pages (Hindi/Kannada/Malayalam/Tamil/Telugu medium) describe instruction languages, not specializations. |
| Course FAQs | `course-faqs.ts` | 6 per course × 30 | Fills in per-course values | Same 6 questions everywhere; asserts entitlement, PSU equivalence and "no-cost EMI" | Medium |

**Recommendations:**
- **Specialization pages.** `noindex` the single-university pages, or fold them into course-page anchors, until each has sourced elective subjects, prerequisites and the specialization's semester placement. Canonicalise near-duplicates to one "topic" page per course key, for example "Online MBA in HR (MUJ: Human Resource Management; SMU: HR; Amity: …)". Keep and enrich the multi-university topic pages: they are the legitimate comparison intent.
- **Fee guides.** Keep the 8 multi-university fee guides and rebuild them around category fee tables from `*_CATEGORY_FEES_*.json`. Redirect or noindex the 9 single-university fee guides into the course page's fee section.
- **UGC guides.** Consolidate the 17 into one recognition hub plus a per-course recognition block, or refresh all 17 to the 2026-27 session with row-level evidence (institution, state, mode, session, row ID, checked date).

---

## 3. Core pages: what learners need versus what is shown

Field list from the master plan (§6, §14.3) and the standard (§4 Detail page).

### 3.1 Course detail (`src/app/courses/[slug]/page.tsx`)

| Learner need | Current state | Evidence on file, not surfaced | Gap |
|---|---|---|---|
| Decision summary (fee, eligibility, intake, freshness) | Stats band: duration, fee, EMI, level and weekly effort, where weekly effort is a template value | `sourceCheckedAt`, `officialProgramUrl` (register) | No checked date, no source link, no next intake |
| Total fee and fee breakup | Three generated plans, including a fabricated "Full payment (2% off)" | Semester fee per category; ₹500 application fee (Indian and four neighbouring countries only); Amity's +₹200 instalment discrepancies; MAJMC ₹1,90,000 correction | Replace with an official schedule; label lump-sum discounts as promotions with a date; show "confirm" for exam, resit, convocation and tax charges |
| International/NRI fees | None | MUJ NRI and Foreign USD; SMU International USD (all 18 programs) | **Domestic / International–NRI selector** (approved in §14.8) |
| Eligibility by applicant category | One string | 28 prepared domestic/foreign corrections; Amity foreign: AIU equivalence | Publish the corrections; show the category split |
| Curriculum | "Illustrative study areas" for all 30 | 30 prepared semester overviews; PPR PDFs (for example MUJ MSc Maths PPR) | Review and apply; link the PPR or prospectus |
| Credits and weekly workload | Template "80-90 credits / 15-20 h" | MUJ MBA page states its weekly hours and credits | Per-program sourced values, or "Not published" |
| Exams and proctoring | "Online proctored" asserted | None on file | [SOURCE] official exam pattern (programme guide or PPR): internal/external weighting, exam windows, proctoring requirements, resit fees |
| Live and recorded classes, LMS | "Confirm live-class schedules" | None | [SOURCE] |
| Admission steps and documents | University-level generic steps | None per category | Checklist including ABC ID/DEB-ID [SOURCE UGC notice] |
| Deadlines and intake | `lastAdmissionDate` = "Check current admission cycle" (not rendered) | None | Dated intake with expiry (UV01); MUJ's page currently shows a dated last admission date |
| Refund and cancellation | Not shown on the course page | None | [SOURCE] university refund policy per program and session |
| Recognition | Badges from university-level `approvals[]` | UGC-DEB candidate rows (row ID, session 2025-26, mode, state) | Per-program, per-session recognition block with checked date; separate the Amity awarding entity (Rajasthan vs Noida) |
| Scholarships | University-level scholarship table | — | Per-program criteria and dates |
| Career services | University-wide placement %, package and partners (unverified) plus `careerRoleSalary` bands (unsourced) | Career guides | Mark these as retained, unverified claims (§14.10); add "services offered" from official pages |
| Sample certificate | Image slot (often a placeholder) | — | [OWNER/SOURCE] permission to show an official sample |
| Reviews | **The same two named reviews on all 30 courses**, and AggregateRating schema from static counts | — | Retained per the owner, but flag in the claims register; review the schema separately (UV03) |
| Sources | **Not rendered** | Every course has source URLs | Add a SourceList with dates |

### 3.2 University detail

What exists: overview, rankings/recognitions with notes, programs, placements (unverified), admission steps, scholarships, FAQs and a source list.

Gaps:
- The awarding entity and the online division are not distinguished. This matters most for Amity: the catalog says "Noida, Uttar Pradesh", while the UGC guide says Amity University Rajasthan is the entitled entity. The record must be resolved before any copy uses it. [SOURCE]
- Learner counts and the "QS ranked" badge have no source.
- No intake calendar.
- No refund or grievance links (UGC requires an ombudsperson for HEIs) [SOURCE].
- No learning-platform or exam information.
- No category fee summary and no prospectus link (2026-27 prospectus links exist for MUJ and SMU).

### 3.3 Home

Copy is now concise, but the UV02 claims listed in §0.4 are still present: lowest-fee guarantee, equal compensation, post-admission support, job portal, community, "approvals re-checked every cycle", universal no-cost EMI and certificate wording. The line "every program checked against the UGC-DEB entitlement list" overstates the review status. Testimonials (Priya, Arjun, Farhan) are retained but unverified [OWNER].

### 3.4 About, how-we-verify and the author page

how-we-verify is honest and good. The gaps:
- **About:** no legal entity, address, phone or support hours, and no commercial-relationship disclosure (who pays Unnati Vidya, and whether that affects ordering) [OWNER].
- **Author page:** no editorial policy specifics (source hierarchy, review steps, refresh cadence, AI-use statement), no article list and no corrections log.
- The blog, fee guides and home make "verified" claims that contradict how-we-verify's "verification ongoing". **Align them to how-we-verify.**

---

## 4. Competitor and official-page formats

Sources: onlinemanipal.com MUJ MBA, amityonline.com MBA, collegevidya.com online MBA, and a careers360 MUJ vs Amity comparison found in search. shiksha.com returned 403.

| Format | Who uses it | Learner value | Unnati Vidya approach (no copying) |
|---|---|---|---|
| Fee tables by category (Indian/NRI/Foreign) with lump-sum, annual and semester options | MUJ official; Amity official (lump sum shown as a discount); careers360 comparison | Very high | Already researched: publish with currency, category, source and date; label promotions separately |
| EMI per month, tenure, "no-cost" | All | High | Show the official EMI figure with lender conditions; the calculator gives a total-outlay view |
| Semester-wise syllabus with subject descriptions; credits; weekly hours | MUJ, Amity, CollegeVidya | High | Apply the prepared overviews; link the PPR |
| Assessment pattern (internal/external split, exam sections) | careers360, from university sources | High | [SOURCE] from the official programme guide or PPR only |
| Sample degree certificate | MUJ official, CollegeVidya | High (trust) | Only with an official image or permission [OWNER] |
| Hiring-partner logos, placement services | All | Medium; often unverifiable | Describe *services* with a source; no logos without permission |
| Faculty profiles, immersion programs, Coursera access | MUJ, Amity | Medium | Link to the official page; summarise inclusions with a date |
| Deadline timers and "97% seats filled" | MUJ official | Urgency (not trustworthy) | Show the dated deadline only; no urgency |
| Brochure download | All | Medium | Link the official prospectus PDF with edition year |
| Online vs regular tables; ROI calculator; checklists | CollegeVidya | Medium | Original checklists and a transparent calculator |
| Long FAQs, testimonials, salary ranges | CollegeVidya, careers360 | Mixed: salary ranges are usually unsourced | Avoid unsourced salary; FAQs only where they are specific to the program |
| Last-updated dates and author bylines | Inconsistent across aggregators | Trust | Differentiator: checked dates per fact and an editorial policy |

---

## (a) Gap list by page type

1. **Blog posts.** Thin (under 200 words); no tables; no own sources; inflated read time; no updated date; factual errors in #2, #7, #11 and #18; heavy overlap with guides; only 4 categories, none for learning experience or international learners; no links from articles into course pages (they link only to guides).
2. **Eligibility guides.** Stale review date; domestic/foreign split missing; prepared corrections unpublished; no "what if I don't meet it" pathways (bridge course, admission test); no document list.
3. **Career guides.** H1 promises salary; no skills mapping, entry paths, employer-type evidence or official career-services description; aggregator figures cited.
4. **UGC guides.** 2025-26 session; unsupported "confirmed" language; entity ambiguity; 17 near-duplicates.
5. **Fee guides.** Generated only; no categories, sources, date, semester schedule, application fee, exclusions list or promotions policy; universal EMI claim.
6. **Comparison landing pages.** No written analysis; rating and placement "winners"; fee basis not aligned (category, lump sum vs semester); no curriculum, assessment or support rows.
7. **Specialization pages.** No elective subjects, no prerequisites, duplicates, "medium" pages misclassified.
8. **Course pages.** The fields listed in §3.1; plus duplicate reviews, template facts and unrendered sources.
9. **University pages.** Entity clarity, intake calendar, refunds and grievance, prospectus links, international fees, sourced learner counts and rankings.
10. **Home, about, author.** UV02 claims, commercial disclosure, contact details, editorial policy, corrections log.

---

## (b) Prioritized content plan: 8 clusters, 52 pieces

**Priority.** P1 means do first: high learner value, fixes trust, and the evidence mostly exists. P2 means needs new official sources. P3 means later or depends on owner input.

**Every piece:**
- uses the byline **Content Team, Unnati Vidya**
- starts with a short answer
- includes a dated source list
- links to related course pages and tools
- ends with **Apply now**
- never uses "best" or "top" without a stated method

"PPR" means the Programme Project Report that each university publishes for the program. These are already partly located (for example the MUJ MSc Mathematics PPR).

### Cluster 1: Recognition and validity
**Pillar: C1-P "Is an online degree valid in India? How to check a program's UGC-DEB entitlement (2026-27)"** (rewrite of blog #1; absorbs #17)

| # | Piece | Search intent / learner | Outline | Sources needed | Links | Pri |
|---|---|---|---|---|---|---|
| 1 | C1-P pillar | "are online degrees valid", "online degree govt job"; school-leavers, parents, government-job aspirants | Short answer; what entitlement means (per program, mode and session); equivalence clause; what it does *not* settle (employer and exam-specific rules); a 2026-27 status table for all 30 programs (institution, state, mode, session, checked date); how to check yourself; unresolved items shown openly | UGC (ODL & Online Programmes) Regulations 2020 and amendments [SOURCE]; DEB 2026-27 entitled lists; DEB HEI_Prog_List | All 30 course pages; how-we-verify | P1 |
| 2 | "How to check the UGC-DEB entitled list step by step" (rewrite of #18) | "how to check UGC DEB approval"; cautious applicants | Annotated screenshots of deb.ugc.ac.in; exact legal names (Manipal University Jaipur; Sikkim Manipal University; Amity University [state to confirm]); matching mode and session; what to ask the university if a row is missing | DEB portal (dated screenshots) | Pillar; course pages | P1 |
| 3 | "Online vs distance (ODL) vs regular degree: what's different" (expand #8) | "online vs distance MBA" | Comparison table: mode, regulator category, exams, classes, recognition; why the same university can differ by mode | UGC Regulations 2020 | MBA hub; pillar | P1 |
| 4 | "NAAC, NIRF, NBA, AICTE, AIU, WES, QS: what each badge on an online degree means" (expand #20; absorbs #5) | "NAAC A+ meaning online degree" | Glossary table: issuer, scope (institution or program), validity, where to verify; per-university entity table with dates; why an institutional badge ≠ program approval | NAAC, NIRF, NBA, AICTE, AIU, WES official pages [SOURCE] | University pages | P1 |
| 5 | "ABC ID and DEB-ID: what online learners must create before admission" | "DEB ID registration", "ABC ID online degree" | What each ID is; who is exempt (foreign students, per the notice); step-by-step; common errors; when the university asks for it | UGC notice (Aug 2024) and ABC portal [SOURCE] | Admissions pillar | P1 |
| 6 | "Will employers accept an online degree? What's settled and what isn't" (expand #19) | "online degree value for jobs" | Regulatory equivalence (cited); employer-specific rules; how to check a job notification's qualification clause; no employer-survey claims | Regulation; sample public job-notification clauses [SOURCE] | Career cluster | P2 |
| 7 | "Using an Indian online degree abroad: credential evaluation basics" (replaces #5) | NRI and abroad learners | What evaluators do; why outcomes are evaluator- and program-specific; documents; questions to ask | WES/ECA official pages [SOURCE]; university statements | C8 hub | P2 |
| 8 | "Is the MUJ/SMU/Amity awarding entity what my certificate will show?" (entity explainer) | "Amity online degree Noida or Rajasthan" | Awarding institution vs online platform (Online Manipal, Amity Online); why it matters for verification | University and regulator records [SOURCE]; needs resolution first | University pages | P2 |

### Cluster 2: Cost, fees and financing
**Pillar: C2-P "Online degree fees 2026-27: full cost at MUJ, SMU and Amity (all 30 programs)"**

| # | Piece | Intent / learner | Outline | Sources | Links | Pri |
|---|---|---|---|---|---|---|
| 9 | C2-P pillar | "online degree fees", "cheapest online MBA" | Master table: program, domestic total, semester amount, NRI/International USD, application fee, checked date; what is and isn't included; promotions vs base fee; how to compare like with like | Category fee JSONs; prospectuses (2026-27) | Fee guides; course pages; EMI tool | P1 |
| 10 | Rebuilt multi-university fee guides (8: MBA, MCA, BCA, BBA, B.Com, M.Com, BA, MA JMC) | "online MBA fees" etc. | Category-aligned table; semester schedule; application fee applicability; Amity instalment note; exclusions to confirm; worked total-cost example | Same | Course, compare and EMI tool | P1 |
| 11 | "Online MBA total cost: MUJ vs SMU vs Amity" (rewrite of #2) | Price-sensitive MBA seekers | Honest answer (no option under ₹1 lakh in this catalog); full-cost table; lump-sum offer vs base (dated); the trade-offs that matter | Official pages and prospectus | MBA hub | P1 |
| 12 | "No-cost EMI on online degrees: how it works and what to check" | "online MBA EMI" | How no-cost EMI is usually structured (lender, processing fee, credit check); questions to ask; the university-stated EMI figures with dates; calculator walkthrough | University fee/EMI panels [SOURCE]; lender T&Cs where public | EMI calculator | P1 |
| 13 | "Scholarships at MUJ, SMU and Amity Online: who qualifies (2026-27)" | "Manipal online scholarship" | Table: category, benefit, proof, validity, source; exclusions (cannot combine with offers, per MUJ panel) | Official scholarship pages [SOURCE] | Course and university pages | P2 |
| 14 | "Hidden costs checklist: exam, resit, convocation, ID card, bridge course" | Careful planners | Checklist of charge types; which the university states and which are unknown (shown honestly) | Fee policies or PPR [SOURCE] | Fee guides | P2 |
| 15 | "Refunds and cancellation for online degrees: what each university's policy says" | "online MBA refund policy" | Per-university table (deadline, deductions, process); UGC refund guidance if applicable | University refund pages; UGC fee-refund notices [SOURCE] | Refund-policy page | P2 |
| 16 | "Education loans for online degrees: eligibility and documents" | Financing | When banks or NBFCs lend for online programs; documents; tips | Lender public pages [SOURCE] | EMI tool; documents checklist | P3 |

### Cluster 3: Admissions and eligibility
**Pillar: C3-P "How to apply for an online degree: eligibility, documents, intake dates and steps"**

| # | Piece | Intent / learner | Outline | Sources | Links | Pri |
|---|---|---|---|---|---|---|
| 17 | C3-P pillar | "online degree admission process" | Step flow per university (application, fee, documents, approval, LMS access); intake calendar (dated, auto-expiring); category paths; what an Unnati Vidya enquiry is and isn't | Official admission pages | Eligibility guides; lead form | P1 |
| 18 | "Online degree admission documents checklist (Indian, NRI, foreign)" (expand #4) | "documents required online admission" | Printable checklist by category; ABC/DEB-ID; AIU equivalence for foreign qualifications; name-mismatch fixes; scan specs | Official pages; AIU [SOURCE] | Pillar | P1 |
| 19 | Republish 17 eligibility guides with the prepared domestic/foreign corrections | "online MCA eligibility" | Add "if you don't meet it" (bridge course, admission test); category split; dated | Evidence JSONs | Course pages | P1 |
| 20 | "Online admission intake calendar 2026-27: MUJ, SMU, Amity" | "online MBA admission last date" | Dated table by program and session with expiry; "not yet announced" states | Official pages (checked weekly in intake) [SOURCE] | Course pages | P1 (needs operations) |
| 21 | "Bridge courses explained: MCA without maths or computing" | "MCA without maths" | Which trigger applies at each university (MUJ: separate computing and maths triggers); credits and fee if stated | PPR and program pages | MCA hub | P1 |
| 22 | "Below 50%? Online MBA/MCA options and admission tests" | "MBA with 45 percent" | Thresholds by university and category; Amity admission-test route; reserved-category rules | Program pages | MBA/MCA hubs | P2 |
| 23 | "Lateral entry, credit transfer and gap years: what's allowed" | Returning learners | Only what the universities publish; otherwise "ask" | [SOURCE] | Pillar | P3 |

### Cluster 4: How online learning works (classes, workload, exams)
**Pillar: C4-P "What studying an online degree is really like: classes, weekly hours, exams and support"**

| # | Piece | Intent / learner | Outline | Sources | Links | Pri |
|---|---|---|---|---|---|---|
| 24 | C4-P pillar | "how online degree classes work" | Live vs recorded; LMS (named apps only from official pages); weekly hours per program where published; support channels; table across the 3 universities | Official pages and PPRs [SOURCE] | Course pages | P1 |
| 25 | "Online exam pattern and proctoring at MUJ, SMU and Amity" | "online MBA exam pattern", "proctored exam rules" | Internal/external weighting; exam windows; device and room requirements; resits; what happens if the connection fails | Programme guides, PPRs, exam FAQs [SOURCE] | Course pages | P1 |
| 26 | "Study while working full-time: a weekly plan based on published workloads" (expand #6) | Working professionals | Use only stated hours; editable weekly template; exam-week planning; employer conversation | Same | Study-time planner (roadmap tool) | P2 |
| 27 | "Curriculum explained: semester-by-semester subjects for each program" (feeds course pages) | "online BCA syllabus" | Not separate articles: publish the 30 reviewed curriculum blocks on course pages with PPR links | PPRs, prepared drafts | — | P1 (data task) |
| 28 | "Projects, internships and capstones in online degrees" | Career-minded | What each program requires (project semester, viva) | PPRs [SOURCE] | Course pages | P3 |
| 29 | "Student support and grievance routes for online learners" | Anxious applicants and parents | Helpdesk, ombudsperson, UGC grievance portal | UGC grievance regulations; university pages [SOURCE] | University pages | P3 |

### Cluster 5: Online MBA decision hub
**Pillar: C5-P "Online MBA in India (MUJ, SMU, Amity): fees, eligibility, specializations and how to choose"**

| # | Piece | Intent / learner | Outline | Sources | Links | Pri |
|---|---|---|---|---|---|---|
| 30 | C5-P pillar | "online MBA" | Summary table; who it suits; decision tree (budget, specialization, schedule); links to everything below | Catalog plus evidence | All MBA URLs | P1 |
| 31 | Enriched compare pages: MBA MUJ vs Amity, MUJ vs SMU, SMU vs Amity (absorbs blog #10) | "MUJ vs Amity online MBA" | Written analysis; category-aligned fees; specialization set differences; assessment and learning differences; who each suits; no single winner | Evidence | Course pages | P1 |
| 32 | "Choosing an online MBA while working" (rewrite of #12) | Professionals | No work-experience gate (verify the "no entrance test" claim per the review note); workload; specialization fit | Program pages | Pillar | P1 |
| 33 | "Online MBA specializations compared: what you actually study" (replaces most MBA spec pages) | "online MBA specializations list" | Grouped topic table (HR, Marketing, Finance, Analytics, Operations, IT, Healthcare, International Business…) × university naming; elective subjects where sourced | PPRs [SOURCE] | Spec topic pages | P2 |
| 34 | "SMU dual specialization explained" | SMU MBA seekers | How 2-of-6 works; combinations; timing | SMU page/PPR | SMU MBA | P2 |
| 35 | "MBA vs MCA for IT professionals" (rewrite of #7, absorbs #3) | IT staff | Correct eligibility; role direction; workload; no pay claims | Program pages | MBA/MCA hubs | P1 |
| 36 | "Online MBA after B.Com/BBA/B.Tech" (expand #14) | Graduates | Background → specialization mapping using offered tracks | Catalog | Pillar | P2 |

### Cluster 6: Computing and data (BCA, MCA, MSc Data Science, MSc Mathematics)
**Pillar: C6-P "Online BCA, MCA and MSc Data Science: which computing degree fits you?"**

| # | Piece | Intent / learner | Outline | Sources | Links | Pri |
|---|---|---|---|---|---|---|
| 37 | C6-P pillar | "online BCA or MCA" | Ladder (12th → BCA → MCA / MSc); eligibility table incl. bridge; fees; curriculum emphasis | Evidence | All computing URLs | P1 |
| 38 | "Online BCA after 12th: eligibility, maths, fees and syllabus" (expand #13; absorbs #9's useful parts) | 12th-pass learners and parents | Stream rules (Amity "preferred", MUJ not gated); Amity's inconsistent % shown openly; syllabus; fees | Program pages | BCA courses | P1 |
| 39 | Enriched compare pages: BCA MUJ vs Amity; MCA (3 pairs) | Comparers | As #31 | Evidence | Course pages | P1 |
| 40 | "Online MSc Data Science vs MCA (AI/DS) vs MBA Analytics" | Career switchers | Eligibility (Amity MSc DS: any Science degree; recognition evidence pending, so say so); curriculum emphasis; fees | Program pages; PPR | Course pages | P2 |
| 41 | "Online MSc Mathematics at MUJ: eligibility routes and electives" (merges #22 into the guide) | Maths graduates | Elective table; eligibility shown as unresolved until written clarification; no promotion claims | PPR and prospectus | Course page | P2 |

### Cluster 7: Commerce, humanities and media (B.Com, M.Com, BA, MA, JMC, Public Policy)
**Pillar: C7-P "Online B.Com, M.Com, BA and MA: options, fees and who each suits"**

| # | Piece | Intent / learner | Outline | Sources | Links | Pri |
|---|---|---|---|---|---|---|
| 42 | C7-P pillar | "online BCom", "online MA" | Program grid by level and university; fees; eligibility; medium of instruction (BA language mediums belong here, not as specializations) | Evidence | Course pages | P2 |
| 43 | "Online B.Com vs B.Com Honours at Amity" (fix #25) | Commerce aspirants | Table: eligibility (55% to confirm), fee, curriculum, ACCA track; remove page-error commentary | Program pages | Course pages | P1 |
| 44 | "Online M.Com options: MUJ, SMU, Amity (Financial Management, FinTech)" (merges #15 and #26) | Working commerce staff | Eligibility once resolved; FinTech kept separate from Financial Management; fees | Program pages | Course pages | P2 |
| 45 | Enriched compare pages: B.Com (3), M.Com (3), BA, MA JMC (MAJMC fee correction first) | Comparers | As #31 | Evidence | Course pages | P2 |
| 46 | Career guides refreshed (MA Political Science, Public Policy, BA JMC, MA English/Sociology/Economics), absorbing blog #16, #23, #24 | "careers after MA political science" | Roles stated by the university; skills; realistic routes; "what we couldn't verify"; no salary | Program pages | Course pages | P2 |

### Cluster 8: International and NRI learners
**Pillar: C8-P "Online degrees for NRIs and international learners: fees, eligibility and documents (MUJ, SMU, Amity)"**

| # | Piece | Intent / learner | Outline | Sources | Links | Pri |
|---|---|---|---|---|---|---|
| 47 | C8-P pillar | "Manipal online MBA NRI fees" | Category definitions per university (MUJ: NRI vs Other Nationals; SMU: International only; Amity: unresolved); USD fee table for 18 programs; INR rules for Nepal, Bhutan, Bangladesh and Sri Lanka; "Confirm with university" for Amity | Category JSONs; prospectuses | Course fee selector | P1 |
| 48 | "Foreign qualifications: AIU equivalence for online admission" | Foreign-educated applicants | What AIU equivalence is; how to apply; timelines | AIU official [SOURCE] | C3 | P2 |
| 49 | "Exams and classes across time zones" | Gulf, US and UK learners | Only stated proctoring and slot rules | [SOURCE] | C4 | P3 |

### Trust and editorial pages (cross-cluster)

| # | Piece | Outline | Pri |
|---|---|---|---|
| 50 | Editorial policy on `/authors/content-team` | Source hierarchy (regulator > university official > prospectus/PPR > never aggregators); review steps; refresh cadence; AI-assistance statement; corrections log; article index | P1 |
| 51 | "How Unnati Vidya is funded and how listings are ordered" (About section) | Commercial relationships, ordering rules, counselling scope | P1 [OWNER] |
| 52 | Glossary page (UGC-DEB, ODL, PPR, ABC, DEB-ID, NRI, semester, credit, proctoring, bridge course) | Short definitions linked site-wide | P2 |

**Explicitly not planned:**
- city or state pages
- "top 10 online universities" lists
- salary-ranking articles
- universities outside the three
- Hindi pages
- per-specialization "career" pages without sourced subjects

---

## (c) Existing posts: what to do with each

| Action | Posts | How |
|---|---|---|
| **Fix now (factual)** | #2, #7, #11, #18, #17, #21, #22, #24 | Change the false #2 title and excerpt; correct Amity MCA eligibility in #7; remove "widest gap" from #11; replace "verified/confirmed with universities" with the evidence status; remove the unsourced salary and promotion lines |
| **Rewrite into pillars** | #1 (→ C1-P), #2 (→ #11 MBA cost), #12 (→ #32), #18 (→ #2 tutorial), #7 (→ #35) | Keep URLs; new outline; sources; tables; mark as updated |
| **Merge with 301** | #3 → #7; #17 → #1; #10 → compare/mba/amity-vs-muj; #11 → compare/bba/amity-vs-smu; #16, #21, #23, #24 → respective career guides; #22 → msc-mathematics guide; #26 → #15; #5 → C1 #7 | Move any unique sentence into the target first; update internal links and the sitemap |
| **Expand** | #4, #6, #8, #13, #14, #15, #19, #20 | Per the cluster outlines; add tables and checklists; no word-count targets |
| **Keep and fix** | #25 | Remove commentary on Amity's page errors; add a table; confirm 55% |

---

## (d) Content templates

### Course page: section list (standard §4 order)
1. **Decision summary:** degree, university and awarding entity; mode; duration and semesters; total fee for the selected category (Domestic / NRI / International), with semester amount and currency; eligibility one-liner; next intake (dated or "not announced"); **Last checked dd Mon yyyy · Sources**.
2. On-page navigation.
3. **Who can apply:** by category; conditions and exceptions (bridge course, admission test); "university decides" note.
4. **Curriculum:** semester subjects (only if reviewed), otherwise "Illustrative study areas"; electives and specializations with their semester; credits; project or capstone; PPR or prospectus link.
5. **How you'll learn:** live and recorded split, LMS, weekly hours (sourced or "not published").
6. **Exams and assessment:** internal/external split, proctoring requirements, exam windows, resits.
7. **Fees and payment:** official schedule table (lump sum, annual, semester); application fee and who pays it; promotions labelled with validity; "charges to confirm" list; EMI terms; scholarships; refund policy link.
8. **Recognition:** program, mode and session entitlement row, with checked date; institutional accreditations with scope.
9. **Admission steps and documents:** checklist including ABC/DEB-ID.
10. **Support and career services:** services stated by the university; retained unverified figures shown with an "unverified" label (§14.10).
11. **Reviews:** retained, labelled; no copying to new programs.
12. **Compare and alternatives:** same degree at other universities; related guides.
13. **Program-specific FAQs:** only questions with program-specific answers.
14. **Sources:** URL, title, edition or session, checked date.

### University page
1. Identity: legal awarding institution, online division or platform, location; what is and isn't covered here.
2. Recognition table: item, scope, validity, source, checked date.
3. Programs on Unnati Vidya: table of level, duration, domestic fee and international fee.
4. Intake calendar (dated, expiring).
5. How learning and exams work at this university.
6. Fees, payment, scholarships and refund policy (links to the official policy).
7. Admission process and documents by category.
8. Student support and grievance (helpdesk, ombudsperson).
9. Career services (described with a source; retained metrics labelled).
10. Prospectus and PPR downloads (official links, edition year).
11. FAQs specific to this university.
12. Sources.

### Blog article or guide
1. H1 (specific, no "best" without a method).
2. Byline **Content Team, Unnati Vidya**; published date and "Updated" date (substantive change only); "Facts checked dd Mon yyyy".
3. **Short answer** (2–4 sentences).
4. Who this is for, and what it doesn't cover.
5. Contents.
6. Body sections, each with at least one table, checklist or worked example where useful; inline citations next to material facts.
7. "What we couldn't confirm" (when relevant).
8. Next steps: course pages, tools, Apply now.
9. FAQs (only new information, not restatements).
10. Sources: title, publisher, edition or session, URL, checked date.
11. Related reading (same cluster).

### Comparison landing page
1. Summary verdict by learner priority (budget, specialization, schedule), with no single winner.
2. Category-aligned fee table.
3. Eligibility rows.
4. Curriculum and specialization differences.
5. Learning and exam differences.
6. Recognition rows with dates.
7. Retained unverified metrics separated and labelled.
8. "Unknowns".
9. Links to both course pages and the gated interactive tool.
10. Sources.

---

## (e) Editorial workflow

1. **Claim-level source register for articles.** Extend `docs/source-verification-register.json` to cover articles and guides. Each record holds: claim ID, page or anchor, text, source URL, source type (regulator / university / prospectus / PPR), edition or session, checkedAt, reviewer, status (verified / unverified / stale / unknown), and expiry. Articles reference claim IDs, so a fee change flags every page that uses the fee. The same register feeds the Groq corpus; only verified claims go into it.
2. **Source hierarchy.** Regulator (UGC, DEB, AIU, NAAC) > university program page > prospectus or PPR (note the edition; URLs are reused across years, as with the SMU 2024 path holding the 2026-27 edition) > written admissions clarification. Aggregators are never a source. Third-party figures are mentioned only to warn about them, without repeating the number.
3. **Refresh cadence:**
   - fees, intake and deadlines: weekly during intake windows (the scheduled checks default to weekly)
   - recognition: at each DEB list release and every session (July/August and January)
   - eligibility and curriculum: each session
   - evergreen guides: quarterly
   - articles: review date set at publication, with automatic "stale" flags in admin when a linked claim expires
4. **Review steps:** editor drafts → fact-check against register claims → second reviewer reads for people-first value and overlap (keyword-to-URL map) → administrator publishes. The update date changes only for substantive edits, with a changelog note.
5. **Keyword-to-URL map** (master plan §8). Before any new piece, record its primary question, its cluster, any overlapping URLs and the plan for each overlap (merge, differentiate or link). No two URLs target the same primary question.
6. **Consolidation process.** Merge, add a 301 in `redirects.ts`, update internal links, update the sitemap `lastmod`, and check Search Console after 4–6 weeks.
7. **Measurement.** Per cluster: non-brand clicks, tool use (EMI calculator, recommender), course-page visits from articles, and Apply now starts. No traffic promises before a baseline exists.
8. **AI-assisted drafting.** Allowed only as a drafting aid. Every fact maps to a register claim; no generated statistics; human review is required.

### Facts needed from the owner [OWNER]
- Commercial model: is Unnati Vidya paid by universities, is it paid equally, and does that affect ordering? This decides the home claims "Every university pays us the same" and "unbiased".
- Whether these services actually exist, and their scope: lowest-fee guarantee, document pre-check, loan facilitation, post-admission support "till graduation", job portal, learner community.
- Counselling team: who they are, hours, channels, languages and response expectations (lead capture only; no booking). Legal entity, address and phone for the About page.
- Provenance of the existing ratings, review counts, learner counts, placement %, packages and partner counts, and of the 5 testimonials (2 course-page, 3 home) for the deferred claims register. Real student stories only with written consent: program, cohort, and permission to use name and photo.
- Permission to show official sample certificates and university logos; any partnership agreements.
- Written admissions clarifications for the open questions: MUJ MSc Maths eligibility; Amity NRI and foreign fees; Amity instalments; the Amity awarding entity; the three recognition gaps.
- Whether staff can obtain current PPRs, programme guides and exam handbooks for all 30 programs.

---

## Sources consulted (external, 5 October 2026)
- [Online Manipal: MUJ Online MBA](https://www.onlinemanipal.com/online-mba-manipal-university-jaipur)
- [Amity Online MBA](https://amityonline.com/master-of-business-administration-online)
- [College Vidya online MBA](https://collegevidya.com/courses/online-mba/)
- [Careers360 Manipal vs Amity Online 2026](https://www.careers360.com/courses/manipal-vs-amity-online-2026) (search result summary)
- [UGC-DEB notices](https://deb.ugc.ac.in/Notices) (search indicates 2026-27 entitled lists are published)
- [Careers360 news: DEB-ID mandatory (14 Aug 2024)](https://news.careers360.com/ugc-deb-id-must-admission-odl-online-programmes-distance-education-chairman-jagadesh-kumar-enrolment-guidelines/amp). Secondary report; cite the UGC notice itself.
- shiksha.com returned HTTP 403 and was not reviewed.
