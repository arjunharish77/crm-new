# Claims register

Updated 8 October 2026 (Waves 1–3 are local; the latest code has not been pushed to the VPS).

This register lists **identified** claims in the intended repository release that are not backed by dated, claim-specific evidence on the page. It is not an exhaustive inventory or evidence of what is currently live on the VPS. It covers owner-stated claims, figures whose verification is deferred, and content removed from the new pages and parked here until it can be sourced. See [current release status](CURRENT_STATUS_AND_RELEASE_PLAN.md).

A claim leaves the register in one of two ways. Either a dated source is added on the page and the status becomes **Sourced**, or the claim is removed from the site.

Statuses:

- **Owner-stated**: the owner decided to show it. This records an owner assertion, **not independent substantiation**.
- **Deferred**: verification is postponed by owner decision. The value stays visible.
- **Removed (parked)**: taken off the pages. It returns only with evidence.
- **Pending check**: we are re-checking it against an official source.

For each retained claim, the next review should record the exact page text and placement, the underlying substantiation (for example a dated aggregate calculation, partner terms, lender terms or permissioned review record), the accountable reviewer, last review date and next review trigger/expiry. Keep a claim `Owner-stated` or `Deferred` until that record exists; a source URL or an owner decision alone does not change it to `Sourced`. The first evidence requests are for the 10k+ learner count, lowest-fee guarantee terms and exceptions, no-cost-EMI availability by program/category, and the underlying ratings/testimonials/outcome cohort.

The [content/UI expansion review](CONTENT_AND_UI_EXPANSION_PLAN.md) also flags the university-page rail's “Live + recorded weekend classes” and “Alumni status equal to on-campus” wording, the admission-step fallback that mentions an LMS-login time, and certificate sample provenance. Audit each as a program/institution-specific claim before expanding or reusing it; do not promote a generic fallback to a verified fact.

## Business claims (owner-stated, decision 3)

| Claim | Where | Source | Status | Owner |
|---|---|---|---|---|
| "10k+ learners guided" | Homepage, catalog summary under the search box (`src/app/page.tsx`) | Owner | Owner-stated | Owner |
| "No hidden charges": counselling is free and Unnati Vidya adds no charge on top of the university fee | Homepage, "Why learners trust UnnatiVidya" (`src/app/page.tsx`) | Owner | Owner-stated | Owner |
| "₹0 extra · lowest-fee guarantee" | Homepage stats strip (`src/app/page.tsx`) | Owner | Owner-stated | Owner |
| No-cost EMI on every listed program | Homepage FAQ, course stats band ("Financing"), course FAQ, fee guides, fees hub "Paying in parts", course rail; draft article `no-cost-emi-online-degree` (C2) | Owner | Owner-stated exception. Obtain current lender/program/category terms before treating it as verified; the fee guides' local rebuild alone does not establish universal eligibility. | Owner |
| "Approvals you can check: we link each program to the official UGC-DEB list and show when we last checked it" | Homepage, "Why learners trust UnnatiVidya" | Owner (replaced "Approvals verified … re-checked every admission cycle", 5 October 2026) | The link/date feature is built locally. Confirm it works on the deployed site **and** each program's recognition proposal is applied before treating this as fulfilled. | Owner |
| Free counselling | University FAQ, specialization rail, footer | Owner | Owner-stated | Owner |
| "Support till enrolment: documents, loans and follow-ups handled until your LMS login arrives" (document checks, education-loan help, follow-up until the university login) | Homepage, "Why learners trust UnnatiVidya"; the documents checklist article's "free pre-check" | Owner (confirmed 5 October 2026: all three services exist) | Owner-stated | Owner |
| "India's unbiased marketplace for online degrees from UGC-entitled universities. Compare, get counselled, enrol — all free." | Footer brand line; About page H1 (UI redesign, increment 88) | Owner (UI redesign Q12, 10 October 2026; About H1 Q17, 11 October 2026) | Owner-approved wording. Recognition is still shown per program, never as a blanket statement. | Owner |
| "Free counselling · No obligation" | /lead eyebrow (UI redesign, increment 88) | Owner (UI redesign Q18, 11 October 2026) | Owner-approved; true of the lead-only flow (no booking or payment). | Owner |

## Ratings, reviews and outcome figures (deferred, decision 4)

The stars remain in the intended release. `AggregateRating` structured data was removed from course and university pages in the local Wave 1 code (T1); production still needs verification after deployment.

| Claim | Where | Values | Status |
|---|---|---|---|
| University ratings and review counts | University pages, course hero, course cards, comparison tables | MUJ 4.7, SMU 4.5, Amity 4.4 (catalog) | Deferred |
| Course ratings and review counts | Course hero, course cards, comparison tables, similar programs | Per course (catalog) | Deferred |
| University learner counts | Not shown on public pages (CMS data only) | MUJ 52,000+, SMU 38,000+, Amity 85,000+ | Deferred. Removed from university Key highlights (UI redesign Q19, 11 October 2026) and the course-page sidebar (Q21, 12 October 2026). |
| Placement assistance rate, average package and hiring partners | Course "Career outcomes", comparison tables, homepage hero card, course rail | MUJ 88% / ₹7.2 LPA / 320+, SMU 81% / ₹5.1 LPA / 210+, Amity 84% / ₹6.5 LPA | Deferred. Now labelled "university-wide" on course and comparison pages (T3). |
| Salary bands per career role (`careerRoleSalary`, `src/lib/catalog-format.ts`) | Course "Career outcomes" | e.g. Business Analyst ₹5-9 LPA | Deferred. Labelled "indicative industry ranges, not verified for this program or university" (decision 5). |
| Homepage testimonials ("What learners say") | Homepage | Named testimonials | Deferred |

## Removed from the pages (parked)

| Claim | Was shown | Why it was removed | Returns when |
|---|---|---|---|
| Two named course reviews: "Sneha Iyer" (5★, "Classes are genuinely live…") and "Rohit Verma" (4★, "Good curriculum and the EMI made it affordable…") | The same two reviews on all 30 course pages | They are not attributed to any program, so they can't be shown "only on the course they're about" (decision 5) | The owner identifies the program and has the reviewer's consent |
| "Full payment (2% off)" plan | Every course's fee plans | Template value, no per-program evidence | An administrator adds a sourced plan in the CMS |
| Credits "80-90 credits" / "120 credits" | Every course's fact grid | Template value | A per-program value is entered in the CMS. The page shows "Confirm with the university" until then. |
| "Online proctored" exams | Course fact grid and course FAQ | Not evidenced per program | The exam format is sourced from the programme guide or PPR |
| ₹500 application fee on Amity programs | Course fact grid | Only MUJ and SMU specify ₹500 for Indian applicants (fee evidence, 3 October 2026) | Amity's application charge is sourced |
| "UGC-entitled" in the course overview and course structured data | Every course page | 2026-27 recognition is pending | The 2026-27 check is published per program |
| "Every university pays us the same" | Homepage | Replaced by "No hidden charges" (decision 3) | — |
| "Call 1800-120-4050 (toll-free, 9 am – 9 pm)" | Footer and policy-page sidebar | The owner had not confirmed the number or the hours (plan §11 #16) | The owner gives the number to show |
| "Free service · no spam · unbiased advice" microcopy | Guide and editorial-comparison Apply rails | UI redesign (increment 88): "unbiased advice" is a service promise beyond the owner-approved line. Now "Free counselling · no hidden charges" / "Free service · no spam" | — |
| "A counsellor will review it against your career plan" (design copy) | Never shown; proposed for saved courses | An unconfirmed service promise; the page says "Talk it through with a counsellor before you apply. Counselling is free." | The owner confirms the review service |
| Fee guide FAQ: the fee "covers tuition, LMS access, and online proctored exams" | The single-university fee guides | No per-program evidence (Wave 4 C2, increment 93) | A program's official fee page states what the fee includes |
| Fee guide FAQ: choosing a specialization "doesn't change the total fee" | The comparison fee guides | Not checked per university (increment 93) | Each university confirms it on its fee page |
| Fee guide intro: "verified against its individual program page" | Every fee guide | Only true where a fee check is recorded; dates are now shown per program instead (increment 93) | — |
| Education-loan documents ("salary slips or income proof, bank statements, and PAN") | Article `online-admission-documents-checklist` (published text; removed in its prepared revision) | No lender or university source (Wave 4 follow-up, increment 95) | A sourced lender or university list |
| "Most common reasons" an application is sent back (name/date-of-birth mismatches, illegible scans, missing final-year marksheets) | Same article (removed in its prepared revision) | No data behind "most common"; the name-mismatch point is kept with MUJ's manual as its source | Aggregated, permissioned application data |
| Eligibility for further studies and government jobs "all follow from entitlement status" | Article `online-degree-vs-regular-degree-employers` (removed in its prepared revision) | Broader than regulation 22 of the UGC 2020 regulations, which the revision now cites | — |
| Reading times ("5–8 min read") | Blog cards and articles | Fixed values that overstated 1–2 minute posts | Now computed from the words on the page |
| Article claims: "₹6-12 LPA" (MSc Data Science), Amity BA JMC salary figures, MUJ "10% discount for 80%+", "widest fee gap", "verified directly / confirmed with the universities" (3 posts), "no B.Com needed" for M.Com | Blog posts #8, #11, #15, #17, #18, #21, #22, #24 | Unsourced, promotional or contradicted by the catalog (report 02 §c) | A dated official source is added to the post |
| "Annual fee from" (MUJ ₹75,000, SMU ₹55,000, Amity ₹99,000) | University pages, Key highlights | Hand-entered with no source, and none matched the catalog (removed 25 October 2026). The "Listed total tuition (Indian applicants)" range, worked out from the published programs, stays | A sourced per-year figure is added in the CMS |
| "Which university offers the cheapest …" and "the specialization sharpens your fit for these roles rather than opening entirely different ones" | Specialization page FAQs | Ranking wording, and an unsourced generalisation (25 October 2026). The FAQ now lists each university's listed tuition for Indian applicants and the roles the university names | — |
| "MUJ's own page suggests the Data Science and Computational Science electives align most closely with higher-paying roles" | MSc Mathematics career-scope guide FAQ | MUJ's page, re-read 25 October 2026, doesn't link any elective to particular roles or pay. Replaced with what the page says | MUJ publishes elective-level outcomes |

## Recognition

The 5 October 2026–27 UGC-DEB research records **25 direct listed matches and five Amity programs found only under Amity University Uttar Pradesh**. The evidence file classifies those five as `unclear`; the owner states UP awards them, and the prepared proposals classify them as listed with that attribution. Do not describe the five as independently verified awarding-entity matches. See [recognition evidence](UGC_DEB_RECOGNITION_2026-27_2026-10-05.md). The results reach public pages only after deployment and an administrator applies the prepared proposals (**Publishing checklist** in the CMS). Three UP entries show a period ending January 2027; recheck before later intakes.

| Claim | Where | Status |
|---|---|---|
| Program-level UGC-DEB entitlement for 2026-27 | Course chip and Recognition section, course FAQ, comparison FAQ, the 17 "Is … UGC approved?" guides (the local code reads the published result), articles #8 and #17 | 25 directly matched; five depend on the owner's Amity UP awarding-entity attribution. Public sourcing requires deployment and application. |
| Five Amity programs (B.Com, BA, BA JMC, M.Com, MA Public Policy) are awarded by Amity University Uttar Pradesh, so its listing covers them | Their course pages, comparison and guide entries | Owner-stated (5 October 2026, plan §11 #15). The three on UP's "recognized" list show the printed "valid up to January 2027" note. |
| University approvals (UGC-entitled, NAAC A+, AICTE, WES, AIU, QS) | University pages, approvals strip, comparison "University approvals" row, guide NAAC/AICTE notes | University-level and not yet sourced per badge |
| "Approvals you can check" (homepage) | Homepage | True for each program once its recognition proposal is applied |
