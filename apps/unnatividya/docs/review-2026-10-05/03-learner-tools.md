# Unnati Vidya: tools audit and new-tool proposals

Reviewer role: product designer. Date: 5 October 2026. This was a read-only review; no repo files were changed.
Inputs: `docs/WEBSITE_IMPROVEMENT_MASTER_PLAN.md` (§7, §14), `docs/DESIGN_AND_CONTENT_STANDARD.md`, `docs/IMPLEMENTATION_PROGRESS.md`, tool source, `src/data/catalog.ts`, evidence JSON in `docs/`, and a light check of competitor tools and search results (sources at the end).

## 0. Constraints every tool must respect (from owner decisions)

- Show the core result with **no gate**. **Apply now** is the only lead entry and opens the contact-first flow: name, email and phone, then course and optional university, then email OTP. Only the interactive `/compare` tool sits behind form submission plus email OTP.
- Lead capture only. No booking slots. English only. No generic chatbot. Groq is used only for the recommender and its grounded follow-up questions, with deterministic eligibility checks and a non-AI fallback.
- Never invent facts. Unknown, "Confirm with university" and "last checked" are normal states that the UI should show. Never convert a domestic fee into an NRI fee. Never treat a fit score as an admission probability.
- Existing ratings, placement and salary figures are under a deferred-review exception (§14.10). They must **not** feed tool logic, rankings, "best" highlights or Groq evidence.

## 1. Data reality check (what a tool can safely use today)

| Data | Where | State | Usable by tools? |
|---|---|---|---|
| Base tuition and semester schedule, Indian nationals, 30/30 programs | `catalog.ts` `fee`; `COURSE_FEE_EVIDENCE_2026-09-30.json`; `*_CATEGORY_FEES_2026-10-03.json` | Official pages observed. 29/30 match the CMS. Amity MAJMC differs: CMS ₹1.30L vs official ₹1.90L | Yes, after the admin publishes the MAJMC correction |
| NRI and foreign fees | MUJ: 9/9 programs × 3 categories (Indian INR, NRI USD, Foreign USD). SMU: 9/9 × 2 ("International students" USD). Amity: INR only; USD responses are of **unconfirmed category** | Evidence only (`not_applied`) | MUJ and SMU yes, once published. Amity: show "Confirm with university" |
| Mandatory extras (exam, resit, convocation, tax, processing) | none | Explicitly unresolved in all three fee files | **No.** Show "Not included / confirm" rows |
| Application fee | ₹500 for MUJ/SMU Indian applicants (evidence). Amity: "As per university" | Partial | MUJ/SMU domestic only |
| Eligibility | `catalog.ts` free text; `prepared-eligibility-drafts.json` covers 28/30 with domestic and international paragraphs | Text only, not structured rules. 17 observed, 12 need confirmation, 1 conflicting (MUJ MSc Maths) | Only after the paragraphs are turned into reviewed structured rules |
| Curriculum | generic stream templates | 18 not verified, 12 differ in semester coverage | No (show "Illustrative study areas" only) |
| Weekly hours | `weeklyHours: "15-20 hours/week"` hard-coded for **every** course in `commonCourseEnrichment` | Invented generic value, shown publicly on course pages | **No.** A planner must use the learner's own inputs |
| Recognition (UGC-DEB) | `COURSE_CONTENT_EVIDENCE` recognition block; candidate 2025-26 online rows for 27 programs | All 30 `session_and_institution_confirmation_pending` | Only as "how to verify" plus an honest per-program status |
| Scholarships | university enrichment: category names with "As applicable", one "Up to 20%" | No criteria, amounts, dates or sources per cycle | **No.** Needs owner sourcing |
| Admission deadline | `lastAdmissionDate: "Check current admission cycle"` | None confirmed (UV01) | No |
| Career roles and salary | `careerRoles`, `careerRoleSalary` (unsourced LPA bands, shown on course pages) | Unverified | Roles: only as illustrative. **Salary: no** |
| Ratings, placement %, packages | `University` and `Course` fields | Deferred claims | No (for tool logic) |

Takeaway: the strongest data assets today are **category-specific fees and semester schedules** (MUJ and SMU fully, Amity domestic) and **eligibility paragraphs for 28/30 programs**. Build on those first.

## 2. Audit of existing tools

### 2.1 Recommender: `src/components/recommender-quiz.tsx`, `/recommender`
What it does: three radio questions (level, stream, budget), a client-side filter, the first three results sorted by fee, Compare and View-all links, and Apply now with `intent=recommender`. It is honest that it is not AI and does not check eligibility, has edit chips, sets heading focus and needs no sign-up. That is good.

Limits:
- No qualification inputs, so no eligibility screening. This is UV05, still open. A BA graduate can be shown MCA, and a 12th-pass learner can choose PG.
- Budget options are fixed at ₹1L, ₹1.8L or "any". The catalog runs from ₹75k to ₹2.75L, so 7 programs between ₹1.8L and ₹2.75L can only be reached with "No budget limit". Options are not derived from data.
- Assumes domestic fees only: there is no fee-category question, so NRI learners get the INR budget logic.
- Stream taxonomy oddities: MSc Mathematics is filed under "IT & Computers", and there is no "Science/Data" choice.
- Results "ordered by lowest tuition" means the top 3 are always the cheapest. That is defensible but thin, with no reason beyond the filters themselves. Results show no eligibility summary and no applicant-category caveat.
- Results are not in the URL, so they cannot be shared or revisited. `force-dynamic` page.
- No Groq yet (credentials pending), which is expected.

Quick wins (S): derive budget bands from catalog quantiles; add a "highest qualification completed" question that hard-excludes PG for 12th-pass learners (deterministic and safe even before structured rules); show each result's eligibility summary text and "applicant category: Indian nationals" fee label; put answers in the URL (`?level=PG&stream=…&budget=…`) so results can be shared and the back button works; move MSc Maths into a "Science & Mathematics" stream or let one course belong to several interest tags.

### 2.2 EMI calculator: `src/components/emi-calculator.tsx`, `/tools/emi-calculator`
Good: number inputs with validation, a correct reducing-balance formula, the 0% case handled, total outlay including down payment, honest copy ("not a loan offer"), optional course prefill, no gate, Apply now carries the course.

Limits:
- Prefills domestic `course.fee` only; no Indian/NRI/Foreign selector (conflicts with §12/§14.8 once category fees publish).
- No **processing fee / GST on interest / upfront charges** field, so "overall payment" understates real loans. Help text tells the user to fold costs into the fee, which is awkward.
- No comparison against the university's own **semester instalment schedule**, even though semester fee and count exist in evidence. This is the most common real choice learners face.
- No amortisation view and no "total by month X". Inputs are not in the URL, so results cannot be shared.
- Inline styles on the page shell (standard §2 asks for tokens). FAQ JSON-LD is fine but has no rich-result upside (FAQ feature withdrawn May 2026, per master plan §8).

Quick wins (S): add a "Processing/other one-time charges (₹)" input included in overall cost; add a "Compare with paying per semester" panel using published semester amounts; mirror inputs in the URL; label the fee source and "last checked".

### 2.3 Compare: `compare-picker.tsx`, `compare-gate.tsx`, `src/lib/comparisons.ts`, `/compare`, `/compare/[course]/[pair]`
Good: server-validated unlock (`/api/compare-access` checks the OTP-verified, preferences-complete lead plus token cookie), locked content is not rendered at all (no blur leak), selection survives in `?add=`, the picker is accessible and filterable, the 3-course cap is enforced, and editorial pair pages are public and indexable.

Limits and standard conflicts (some are P0-grade):
- `buildComparisonRows` highlights a **"best" on rating, placement rate and specialization count**. These are deferred, unverified claims, and the standard says not to pick universal winners. It also "best"s the lowest fee, but the standard says cheapest is not automatically best value.
- Rows include Rating, Placement rate, Average package and Hiring partners as **university-wide** figures next to program facts. That violates the like-with-like rule and leans on deferred claims.
- `comparisonFaqs` (public editorial pages plus FAQ JSON-LD) asserts **"Yes — both … list their programs as UGC-entitled"** and "**equal degree validity**", while all 30 programs' recognition is `session_and_institution_confirmation_pending`. Templated recognition claims like this are what the standard says need editorial verification. It also says "ask a counsellor", which is off-label (should be Apply now / university).
- "EMI from" shows the `course.emi` string (for example "₹7,500/mo"), an unsourced figure with no tenure or rate.
- No fee-category alignment, no "differences only" toggle, no row grouping, no missing-data labels, no print view or share text. Editorial pairs only cover the same degree across universities (for example MBA MUJ vs SMU), not the common cross-degree questions (MCA vs MSc Data Science, BCom vs BBA).
- Sharing a gated `/compare?add=` URL lands the recipient on the gate. That is acceptable, but a public printable summary of the *editorial* page would serve the family-decision journey.

Quick wins (S): drop the "best" flags except on neutral, defined facts (or replace with a learner-chosen priority); move university-wide outcome rows into a collapsed "University-reported figures (not verified)" group or remove them from compare; rewrite FAQ recognition answers so they come from the per-program recognition status ("Verification pending — here's how to check on deb.ugc.ac.in"); add a "Show differences only" toggle; add a print stylesheet plus a "Copy link" button on editorial pair pages and the unlocked tool (IDs only, no PII).

### 2.4 Shortlist: `shortlist-view.tsx`, `/shortlist`
Good: localStorage guest saves, malformed-storage recovery, undo, explicit 2–3 compare selection, noindex.
Limits: no notes per course; no print or share; the fee-range summary is domestic only; ratings and placement still sit in an expandable panel (acceptable under §14.10, but they should not be the only "extra"); there are no eligibility or "next step" status cues ("Eligible? / documents ready?").
Quick wins (S): print view (course, fee by category, eligibility text, source link and checked date); per-course private note in localStorage; "Copy shortlist link" (`/shortlist?ids=…` read-only import with confirmation, IDs only).

### 2.5 Course explorer filters: `course-explorer.tsx`, `/courses`
Good: URL-persisted filters (UV07 fixed), data-derived university, stream and fee options, chips, reset.
Limits: the **default sort "popular" orders by `reviews`**, and the "rating" sort uses `rating`. Both are deferred claims driving order without a defined basis (standard §6: no "most popular" without a basis). There is no duration filter, no applicant-category filter, no "eligible with my qualification" filter, no specialization facet (text search only), and the fee filter is domestic only.
Quick wins (S): rename the default sort to "Recommended order" with a disclosed rule (for example alphabetical within level) or make "Lowest fee" the default, and drop review-count ordering; add a duration (24/36 months) facet; add a "My highest qualification" facet that hides programs a learner clearly cannot enter (12th vs graduate), which is safe today.

### 2.6 Specialization explorer: `specialization-explorer.tsx`, `/specializations`
Good: URL state, grouping by subject, empty state.
Limits: browse-only. No goal or role entry point. It does not explain degree vs specialization vs elective (master plan §5 asks for this). "Tuition from" is the *degree* fee with no cue that the specialization does not change it (true for these catalog entries, but it should say so). Only 2 of 30 courses carry a verified specialization marker per the evidence notes.
Quick win (S): a one-line explainer plus a "Same degree fee whichever specialization you choose (as listed)" note; add a "by goal" chip row (Finance, Marketing, Data/Analytics, HR, Tech) that maps to existing specialization names with no invented outcomes.

## 3. New tool proposals

Scoring: Learner value (V), SEO demand (S) and Feasibility with current or near-term data (F), each 1–5. Rank score = V×S×F (max 125). Effort: S ≤1 week, M 2–3 weeks, L >3 weeks (one dev, including tests).

### T1. Eligibility checker ("Can I apply?") per program
- **Question:** "With my qualification and marks, can I apply for this program?"
- **Inputs:** applicant category (Indian national / NRI / foreign national, as the university labels them); highest qualification (10+2, diploma, bachelor's 3-yr/4-yr, master's); stream/subjects (maths in 12th or graduation, for MCA/MSc Maths/BCA); aggregate % (or "I only have CGPA", see T7); reserved-category toggle where the source distinguishes it; English-medium (Amity). No PII.
- **Outputs:** per program **Meets published criteria / Needs confirmation / Does not meet published criteria**, each with the exact rule matched, source link, checked date, and "the university makes the final decision". Unmet rules are explained ("needs 50%; you entered 47%; 45% applies to reserved categories"). Embed it on every course page eligibility section and on `/online-degree-guides/*-eligibility`, plus a standalone `/tools/eligibility-checker` that runs across all 30 programs.
- **Data:** 28/30 prepared eligibility paragraphs (domestic and international) plus `COURSE_CONTENT_EVIDENCE` and Amity rendered review. **Needs a new structured rule schema** (minQual, minPercent, reservedPercent, requiredSubjects, entranceTestCondition, englishCondition, categoryScope, unknowns[]), entered and approved through the admin flow. MUJ MSc Maths (conflicting) and the 2 missing programs default to "Needs confirmation".
- **SEO:** strong, specific intent: "online MBA eligibility", "Amity online MBA eligibility 40%", "can I do MCA without maths", "BCA eligibility for commerce students". Existing eligibility guide URLs give a home, and an embedded checker makes them more useful than competitor prose.
- **Lead fit:** after the result, "Apply now for <program>" with course context. On "Needs confirmation", say "The university decides — Apply now and our team will confirm with the university." Never gate the verdict.
- **Effort:** M (rule schema, admin fields, evaluator, test suite of edge cases). **Risks:** wrong exclusions cause harm. Rules must be reviewed, versioned by session, and default to "Needs confirmation" when unsure. Never "eligible/guaranteed". This engine is also the **hard-constraint layer the Groq recommender requires**.
- **Score:** V5 · S4 · F3 = **60**

### T2. Total cost and payment schedule (by applicant category)
- **Question:** "What will I actually pay, when, and in what currency, for my category?"
- **Inputs:** program(s) (1–3), applicant category selector (labels exactly as each university uses them), payment mode (full / per semester / per year where published), optional user-entered extras.
- **Outputs:** base tuition total, semester-by-semester schedule (Sem 1 … Sem n, with amount and currency), application fee where known, and explicit rows "Exam / convocation / taxes / other: **not published — confirm with university**". Side-by-side for up to 3 programs **only when categories and currencies align**; otherwise a warning. Source plus checked date per row. No currency conversion. Printable.
- **Data:** **exists** in `MUJ_/SMU_/AMITY_CATEGORY_FEES_2026-10-03.json` (MUJ: 3 categories × 9 programs, SMU: 2 × 9, Amity: INR × 12 with documented semester/annual rounding mismatches, for example BA ₹1,15,000 vs 6×₹19,200). These must be **published through the admin pipeline** first (currently `not_applied`). Amity NRI/foreign stays "Confirm with university". Extras need owner/official sourcing.
- **SEO:** high. "Manipal online MBA fees", "online MBA fees for NRI", "SMU online BCom fees semester wise", "Amity online BBA fees per semester". Fee guides (`/online-degree-guides/*-fees`) already exist to embed into. NRI pages are a competitor gap: most aggregators show one INR number.
- **Lead fit:** "Apply now" with course plus fee-category context (§14.8 allows fee context as a preference). The schedule is never gated.
- **Effort:** M (category selector component reused on course, compare, EMI and fee guides). **Risks:** stale fees (show checked date, weekly source checks already planned), silently mixing categories (block by design), and the Amity rounding (show both, do not reconcile).
- **Score:** V5 · S4 · F4 = **80**

### T3. Admission document checklist (printable)
- **Question:** "What documents do I need ready to apply to X?"
- **Inputs:** university and program, applicant category, a few branching toggles (graduation completed or final-year, name change, work experience if relevant, reserved category, foreign qualification).
- **Outputs:** a tick-list (stored only in the browser) with format notes (for example scan type/size if the source states it), what each document proves, "AIU equivalence needed" for foreign qualifications (already in the MUJ international draft), a print/PDF-friendly view, source and checked date. No uploads.
- **Data:** **needs sourcing.** MUJ has an official "Admission Manual for Online Programmes" PDF on onlinemanipal.com (V5, uploaded 2022, so the current version must be confirmed). SMU and Amity document lists need official pages or the admissions team. Category-specific items (passport, AIU equivalence) are partly in prepared eligibility drafts.
- **SEO:** good, specific long tail: "documents required for Manipal online MBA admission", "Amity online admission documents". Shiksha Q&A and careers360 articles rank, so demand is real. A printable checklist is linkable.
- **Lead fit:** natural. "Ready? Apply now" at the end, and "Save checklist" stays local, never requiring contact details.
- **Effort:** S (static data plus a component) once lists are sourced. **Risks:** outdated lists, so version by session and university and show the checked date. Do not ask for or store document data.
- **Score:** V4 · S4 · F4 = **64**

### T4. Recognition check helper ("Is this online degree valid? How to verify")
- **Question:** "Is this specific program approved for online mode this session, and how do I check myself?"
- **Inputs:** program (or university plus program).
- **Outputs:** per-program status from our register ("Verified for 2026-27 on <date> / Verification pending / Not found"), with what was matched (institution, state, program name, mode OL vs ODL, academic year). Plus a step-by-step **"Verify it yourself"** walkthrough to `deb.ugc.ac.in` (program list, filter by year/mode/institution), what NAAC/AICTE/WES do and do not mean, and the "institutional badge ≠ program approval" warning. No automated scraping at runtime.
- **Data:** partial. `COURSE_CONTENT_EVIDENCE` has candidate 2025-26 OL rows for 27 programs (all pending session/institution confirmation). Needs an **editor to confirm the current-session rows** (the audit browser could not reliably fetch UGC-DEB).
- **SEO:** high. "is Manipal online degree valid", "UGC DEB approved online universities 2026", "Amity online degree valid for government jobs". Competitors publish lists without per-program evidence, so a dated, sourced status is a differentiator and citable.
- **Lead fit:** low pressure. Apply now after the status; never gate the verification steps.
- **Effort:** S for the walkthrough, M for per-program status UI plus admin fields. **Risks:** the biggest compliance risk on the site. Never auto-mark "approved". Government-job or overseas validity claims require separate sourcing. Also fixes the templated "Yes — both UGC-entitled" FAQ.
- **Score:** V5 · S4 · F3 = **60**

### T5. Online exams and proctoring explainer, with a device readiness check
- **Question:** "How are exams conducted, and can I take them from home with my setup?"
- **Inputs:** university; optional self-check toggles (laptop/desktop with webcam, stable internet, quiet private room, valid ID); optionally a browser-side camera/mic permission test (local only, nothing recorded).
- **Outputs:** per-university sourced summary (mode: remote proctored or centre, internal/external weighting, question formats, retake/resit basics if published), a readiness checklist, and links to official exam pages/manuals.
- **Data:** **needs official sourcing.** Amity publishes exam-process blog pages on amityonline.com; MUJ/SMU need official handbook pages. The current "Exams: Online proctored" highlight is generic and not program-sourced.
- **SEO:** good. "Amity online exam pattern", "Manipal online exam proctored", "can I give online MBA exam on mobile". Aggregators rank with second-hand info.
- **Lead fit:** medium. Apply now after the explainer.
- **Effort:** S (content plus checklist), M if a camera/mic test is included. **Risks:** rules change per session or program; label the scope. The device test must not record or upload anything.
- **Score:** V4 · S4 · F3 = **48**

### T6. "Online vs distance vs regular" decision helper
- **Question:** "Which mode suits my situation, and what is legally different?"
- **Inputs:** five or six situational questions (working full-time? can attend campus? need live interaction? budget band? need government recognition for X?).
- **Outputs:** a plain-language explanation of the **regulatory definitions** (UGC Online vs ODL vs regular, from the UGC regulations, to be sourced) and practical trade-offs. The output is "considerations for you", not a verdict. Clearly states this site only lists **online** programs (disclosure, per the standard's impartiality rule).
- **Data:** regulatory text needs sourcing (UGC (ODL and Online Programmes) Regulations, current amendment). No catalog dependency.
- **SEO:** high volume and evergreen ("online MBA vs distance MBA", "is online degree equal to regular degree"). Very competitive SERP. Win with sourced regulation quotes and a balanced view.
- **Lead fit:** medium. Results link to course listing filters, with Apply now secondary.
- **Effort:** S. **Risks:** bias (the site sells online), so state the conflict and do not disparage distance/regular. Validity-equivalence claims must cite the regulation.
- **Score:** V3 · S4 · F4 = **48**

### T7. CGPA / grades input helper (folded into T1, not a standalone converter)
- **Question:** "My marksheet shows CGPA; does it meet a percentage cut-off?"
- **Design:** the conversion that matters is the **formula of the learner's previous board/university** (for example CBSE ×9.5 is board-specific; MUJ campus uses ×10 per a Senate note), not the target university's. Ask the learner to enter the percentage printed on their marksheet or certificate, or the conversion formula stated on their grade card. Offer a calculator for "CGPA × multiplier you enter". Do **not** ship a generic "CGPA to percentage" tool with assumed formulas.
- **Data:** none needed if user-entered. University-specific formulas would require official sourcing per board/university, which is out of scope.
- **SEO:** huge generic volume, but off-intent (mostly current campus students) and dominated by single-purpose sites. Low conversion fit.
- **Effort:** S (inside T1). **Risk:** a wrong formula makes the eligibility verdict wrong. If the target university states its own conversion rule for applicants, use that instead (owner to source).
- **Score as standalone:** V3 · S5 · F2 = 30. Recommend only as part of T1.

### T8. Recommender v2 (deterministic now, Groq explanations next), plus grounded follow-up questions
- **Question:** "Which of these 30 programs fit me, and why?"
- **Inputs:** qualification and marks (reuse T1), applicant category, goal (career switch, promotion, first degree, govt-exam prep), interest area, budget (category currency), weekly time available (reuse T9).
- **Outputs:** eligible/needs-confirmation candidates **filtered by the T1 engine**; ranking explained by matched preferences only. Groq writes the explanation and answers follow-up questions **only from the published, verified corpus** (fees by category, eligibility rules, specializations, recognition status, sources). Output is validated against allowed course IDs and fields. Deterministic fallback on 401/429/timeout. "Compare these" leads to the gated tool; Apply now carries course context. No lead from quiz use.
- **Data:** T1 rules plus T2 fees are prerequisites. **Owner: Groq API key, model choice, budget/limits.** Deferred claims are excluded from the corpus.
- **SEO:** low to medium (the tool page itself; "which online course is best for me"). Value is conversion and engagement, not ranking.
- **Effort:** M (deterministic v2) + M/L (Groq, eval suite, abuse limits). **Risks:** hallucinated fees or approvals (mitigate with server-owned facts and output validation), prompt injection via sourced text, cost.
- **Score:** V5 · S2 · F3 = **30**. Owner-mandated, so it stays on the roadmap regardless of score, but it is **sequenced after T1/T2**, which it depends on.

### T9. Weekly study-time planner for working professionals
- **Question:** "Can I fit this program around my job, and what would my week look like?"
- **Inputs:** work hours/days, commute, family time blocks, preferred study windows (weekday evenings / weekends), and **hours per week the learner assumes** (prefilled with a range and the label "your assumption", never the hard-coded 15–20).
- **Outputs:** a printable weekly grid with study blocks, a semester view (weeks per semester from the published duration/semester count), a buffer for exam weeks, and a warning if planned hours are under the learner's own target. Optional .ics export of *personal* study blocks (not university dates).
- **Data:** semester count/duration exists. Program-specific workload (live session timings, credits, expected hours) **needs official sourcing**; until then, label it as user-assumed. Also flag that `weeklyHours` on course pages is an unsourced generic (fix separately).
- **SEO:** medium. "how to manage online MBA with full time job", "online MBA study hours per week". Few competitors offer a planner, so it can earn links.
- **Lead fit:** medium. "Apply now" after the plan; "Save plan" is local/print.
- **Effort:** S–M. **Risk:** implying official workload. Keep all hours user-entered until sourced.
- **Score:** V4 · S3 · F3 = **36**

### T10. Loan EMI vs university instalment comparison (EMI calculator v2)
- **Question:** "Should I pay per semester, take a lender EMI, or pay upfront?"
- **Inputs:** program and category (prefill from T2), lender rate/tenure/processing fee (user-entered), optional upfront discount (user-entered, only if the learner has a quote).
- **Outputs:** cash-flow table by month for (a) university semester instalments as published, (b) lender EMI, (c) full upfront. Total paid, peak monthly outflow, interest cost. A "0% EMI" scenario is labelled a scenario. Text summary for accessibility.
- **Data:** semester schedules **exist** (category evidence). Financing partner terms **unverified**, so they stay user-entered. Domestic panels note that financing "cannot be combined with additional offers" (sourced caveat to show).
- **SEO:** medium. "no cost EMI online MBA", "Manipal online MBA EMI", "education loan for online degree". The existing `/tools/emi-calculator` URL already ranks for its intent; extend it rather than add a new URL.
- **Effort:** S–M. **Risks:** implying lender availability (keep the existing honest copy).
- **Score:** V4 · S3 · F3 = **36**

### T11. Specialization finder by goal (not a personality quiz)
- **Question:** "Which MBA/BBA/MCom specialization matches what I want to do?"
- **Inputs:** goal role family (finance, marketing, HR, operations/supply chain, analytics/tech, international business), current background.
- **Outputs:** matching specialization names across the 3 universities (from catalog lists), what each typically covers (only from verified curriculum, otherwise labelled "illustrative"), which programs offer it, and links to specialization pages. No salary, no "best".
- **Data:** specialization lists exist (only some marked verified). Role descriptions need editorial sourcing (government NCO/NCS role definitions are a candidate neutral source).
- **SEO:** medium. "which MBA specialization is best for me", "MBA specialization list Manipal online". A quiz format is a gimmick risk; a goal filter is more honest.
- **Effort:** S (filter plus copy) to M. **Risk:** implied career outcomes.
- **Score:** V3 · S3 · F3 = **27**

### T12. Scholarship and concession finder (blocked on data)
- **Question:** "Which concessions might I qualify for, and what proof is needed?"
- **Inputs:** category (defence/dependant, differently-abled, alumni, region such as Sikkim/NE, merit), program.
- **Outputs:** possible concessions with criteria, benefit, proof, validity window and source. Expired awards are hidden automatically. "Possibly eligible — university confirms."
- **Data:** **does not exist.** Current rows are names with "As applicable"; one "Up to 20%" is unsourced per cycle. Needs **owner/official per-cycle sourcing** with dates.
- **SEO:** good ("Manipal online scholarship for defence", "SMU online scholarship Northeast").
- **Effort:** S once data exists. **Risk:** promising discounts, stale offers, combination rules.
- **Score:** V4 · S4 · F1 = **16** (Phase 3)

### T13. Application deadline / intake tracker (blocked on data)
- Only confirmed, sourced dates with automatic expiry (UV01). Output: next intake per program, "date not yet announced", optional consented email alert (master plan §7 Phase 2 "opt-in intake/fee alerts").
- Data: none confirmed. **Owner must supply dates through the admin panel.** SEO: "Manipal online admission last date 2026" is real and seasonal. Effort S–M (alerts need consent, unsubscribe, sending).
- **Risk:** stale or fake urgency, the top trust risk. **Score:** V4 · S3 · F1 = **12**

### T14. ROI / payback calculator (user-entered only, optional)
- **Question:** "How long until the fee pays back if my salary rises by X?"
- Inputs: total cost (from T2), the learner's **own** current salary and **own** expected raise. Outputs: payback months, before/after-tax note. **No salary data from us.** Do not use `careerRoleSalary` or university package figures.
- SEO: medium (competitors such as College Vidya and EduCollege run "ROI calculators" with salary predictions; ours would be honest but less "magical"). Value is moderate; risk of implied outcomes is high.
- Effort S. **Score:** V2 · S4 · F3 = **24**. Fold in as a small panel inside T2 at most.

### T15. Career path explorer by specialization (defer)
- Needs sourced role descriptions and outcome evidence. Current `careerRoleSalary` LPA bands are unsourced and are shown on course pages today (recommend adding them to the deferred claims register). **Score:** V3 · S3 · F2 = **18**. Defer until outcome data with cohort/source exists.

### T16. Comparison share/print (quick win, not ranked)
- Print stylesheet plus "Copy link" (IDs only) for editorial pair pages, the unlocked compare tool and the shortlist, with a "Prepared on <date>, sources" footer. Serves the "choosing with family" journey (master plan §4). Effort S. No SEO, but useful for leads indirectly (shared links bring family members back to Apply now).

### T17. Rejected
- **Resume/LinkedIn headline helper:** unrelated to the decision journey, generic-AI territory, and the master plan says "do not prioritize unrelated calculators". Reject.
- **Generic chatbot / open Q&A:** excluded by the owner. Only the grounded recommender follow-up (T8) is allowed.
- **MBA "personality" quiz:** gimmick. Replaced by T11.
- **City pages, auto-generated tool permutations:** spam-policy risk.

## 4. Ranking: top 10 (V × S × F)

| # | Tool | V | S | F | Score | Effort | Blocked on owner? |
|---|---|---|---|---|---|---|---|
| 1 | T2 Total cost and payment schedule by category | 5 | 4 | 4 | 80 | M | Publish category fee evidence; MAJMC correction; Amity intl categories; extras |
| 2 | T3 Admission document checklist (printable) | 4 | 4 | 4 | 64 | S | Current official document lists (MUJ manual version, SMU, Amity) |
| 3 | T1 Eligibility checker (+T7 grades input) | 5 | 4 | 3 | 60 | M | Approve structured rule schema; publish 28 reviewed rule sets; resolve MUJ MSc Maths + 2 missing |
| 4 | T4 Recognition check + "verify it yourself" | 5 | 4 | 3 | 60 | S/M | Editor confirms current-session UGC-DEB rows |
| 5 | T5 Exams and proctoring explainer + readiness check | 4 | 4 | 3 | 48 | S/M | Official exam-process sources per university |
| 6 | T6 Online vs distance vs regular helper | 3 | 4 | 4 | 48 | S | Approve regulation sources and the disclosure wording |
| 7 | T9 Weekly study-time planner | 4 | 3 | 3 | 36 | S/M | Optional: official live-session/workload data |
| 8 | T10 EMI v2: loan vs instalment vs upfront | 4 | 3 | 3 | 36 | S/M | None for v1 (user-entered lender terms) |
| 9 | T8 Recommender v2 → Groq (owner-mandated) | 5 | 2 | 3 | 30 | M + M/L | **Groq API key, model, limits/budget**; T1+T2 data |
| 10 | T11 Specialization finder by goal | 3 | 3 | 3 | 27 | S/M | Editorial role descriptions |

Below the cut: T14 ROI payback (24, fold into T2), T15 career explorer (18, defer), T12 scholarships (16, blocked), T13 deadlines (12, blocked). T7 lives inside T1. T16 is a quick win.

Note: T8 ranks low on formula because the tool page has little search demand, but it is owner-mandated and the highest-conversion surface. Build the deterministic v2 alongside T1 and add Groq once the key arrives.

## 5. Phased roadmap

**Phase 0: quick wins and trust fixes (1–2 weeks, no new data)**
1. Compare: remove "best" flags on rating, placement and spec count; group or remove university-wide outcome rows; replace templated "Yes — both UGC-entitled" / "equal degree validity" FAQs with status-driven text; add a differences-only toggle; print view plus copy link (T16).
2. Course explorer: stop default ordering by review count; add a duration facet and a "my highest qualification" facet (12th vs graduate only).
3. Recommender: data-derived budget bands, qualification-level hard exclusion, eligibility text and fee-category label on results, URL state; fix the MSc Maths stream tag.
4. EMI: one-time charges input, URL state, a "pay per semester" comparison using the current domestic semester fee.
5. Flag the unsourced `weeklyHours: "15-20 hours/week"` and `careerRoleSalary` bands on course pages for the claims register (content fix, not a tool).

**Phase 1: core decision tools on existing evidence (3–5 weeks)**
- T2 Total cost and schedule plus the shared **Applicant-category selector** (reused by course, compare, EMI, fee guides).
- T1 Eligibility engine plus checker (course-page embed, standalone tool, eligibility guide embeds); T7 grades input inside it.
- T4 Recognition helper (walkthrough first, then per-program status as rows are confirmed).
- T3 Document checklist for MUJ/SMU first (Amity when sourced).
- Gate: owner publishes the fee/eligibility evidence through admin; unit tests per rule; no "eligible" without a reviewed rule.

**Phase 2: guidance and AI layer (4–6 weeks)**
- T8 Recommender v2 deterministic → Groq explanations plus grounded follow-up questions (eval suite per §14.2; launch only when critical exclusion tests pass).
- T10 EMI v2 cash-flow comparison; T9 study planner; T5 exam explainer; T6 mode helper; T11 specialization by goal.

**Phase 3: data-dependent (when owner supplies data)**
- T12 Scholarship finder; T13 deadline tracker plus consented alerts; T14 payback panel; T15 career explorer once sourced outcomes exist.

## 6. Owner inputs required

| Input | Needed for |
|---|---|
| Groq API key (server-only), chosen model, monthly budget and rate limits | T8 |
| Admin publication of MUJ/SMU/Amity category fee evidence and the MAJMC fee correction | T2, T10, T8, compare |
| Amity NRI/foreign category confirmation (USD responses currently unattributed) | T2 (Amity rows) |
| Mandatory extras per university (exam, resit, convocation, certificate, taxes, payment charges) | T2 completeness |
| Approval of a structured eligibility-rule schema plus review of 28 prepared rule sets; resolution of MUJ MSc Maths and the 2 missing programs | T1, T8 |
| Current-session UGC-DEB confirmation per program | T4, compare FAQs |
| Current admission document lists per university and category | T3 |
| Official exam/proctoring process pages | T5 |
| Per-cycle scholarship criteria, benefit, proof, validity and combination rules | T12 |
| Confirmed intake/deadline dates; consent and sending setup for alerts | T13 |
| Decision: treat `careerRoleSalary` and `weeklyHours` as deferred claims (remove or label) | T9, T14, T15, course pages |

## 7. Shared design notes for all tools
- One page pattern: the question as H1, inputs (labelled, native controls, URL state, no PII), result with source and checked date, limits, then **Apply now** with context, then related tools. Result announced via `aria-live`, text equivalent for any chart, print stylesheet.
- One "fact with provenance" component (value, category/currency, source link, checked date, status), reused by tools, compare and course pages.
- Tool pages: unique title/H1, indexable, server-rendered explanatory content with the interactive part as an island. FAQ JSON-LD is optional and has no rich-result upside. Embed tools in matching guides (fees, eligibility, recognition) to concentrate topical authority instead of making thin standalone URLs.
- Analytics: tool_used / tool_result / apply_click_from_tool with no PII; measure the Apply-now rate per tool, not tool-gated leads.

## 8. Sources consulted (competitor and search-intent check)
- College Vidya home and tools (Suggest Me University, 30+ factor compare, ROI and EMI calculators): https://collegevidya.com/ , https://collegevidya.com/tool/how-to-calculate-roi-calculator/
- EduCollege salary predictor / ROI: https://educollege.in/salary-predictor-and-degree-roi-calculator
- Careers360 UGC-DEB compliance article: https://www.careers360.com/courses/is-your-online-college-approved-ugc-deb-compliance-check-2026
- Shiksha/Careers360 predictors (entrance-exam focused, not online-degree eligibility): https://www.shiksha.com/mba/cat-college-predictor
- MUJ admission manual (official, version to confirm): https://www.onlinemanipal.com/wp-content/uploads/2022/01/MUJ-Admission-Manual-Online-Programmes-V5.pdf
- Shiksha Q&A on Online Manipal documents: https://ask.shiksha.com/what-are-the-documents-required-for-admission-to-online-manipal-qna-10435837
- Amity official exam-process blog: https://amityonline.com/blog/amity-online-conduct-exams-for-bba-mba-students
- CGPA converter SERP (many single-purpose sites; MUJ ×10 campus formula reported by third parties): https://cgpapercent.in/universities/manipal-university/
- Online vs distance MBA SERP (heavily competed): https://onlinechitkarau.com/our-blogs/online-mba-vs-distance-mba/
No Search Console or keyword-volume data was available. SEO scores are qualitative judgements from SERP presence and competitor coverage.
