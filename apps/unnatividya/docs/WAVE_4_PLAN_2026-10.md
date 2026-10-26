# Wave 4: tools and hubs (plan, October 2026)

**Status: approved 12 October 2026 (W1–W4).**
- **Done:**
  - tools A1–A5 (increment 89);
  - hubs C1 and C5, prepared and tested as CMS drafts (eight items), with review notes in `docs/content-batches/`;
  - the enriched comparisons (part C, increment 92);
  - hub C2: the fees hub page, the rebuilt fee guides and the planner prefill (code), plus the no-cost EMI article draft (increment 93);
  - hub C3: the admissions hub page and eligibility guides that read published CMS eligibility (code, increment 94). The intake calendar is left out (W9).
- **Next:** the planned Wave 4 pieces are built. What remains:
  - administrator work after deploy: publish the fee corrections, import and review the 14 article drafts, and apply the eligibility corrections.
  - The optional follow-ups (C1 "online vs distance vs regular", the C5 MBA-vs-MCA post and the C3 documents post) are prepared as five more drafts ([review note](content-batches/FOLLOW_UPS_REVIEW_2026-10-13.md), increment 95).

Wave 4 comes from [NEXT_PHASE_PLAN_2026-10.md](NEXT_PHASE_PLAN_2026-10.md) §5, §4.3 and §9: "Tools 1–4; content hubs C1, C2, C3, C5 with their first-priority pieces; enriched MBA, BCA and MCA comparisons". The original estimate was 3–5 weeks. Part of it is already done. This plan covers only what is left, using the new design system (increment 88).

## 1. Already done (not repeated)

| Item | Where |
|---|---|
| Tool 1 · Total cost and payment schedule by category | `/tools/total-cost` (increment 82) |
| Tool 3 · Eligibility checker | `/tools/eligibility-checker` (increments 84, 86, 87). Seven rules are prepared, none published |
| Recommender with Groq (planned for wave 5) | `/recommender` (increment 81), redesigned in increment 88, answers in the URL (Q23) |
| Compare print and share-by-ids, EMI category selector, matcher "PG only after a bachelor's" | Increments 82 and 88 |
| Per-degree fee, eligibility, career and UGC guides | `/online-degree-guides/*` (68 guides) |
| Relevant existing articles | Documents checklist, how to verify UGC approval, NAAC/UGC-DEB explained, online vs distance MBA, MBA guide |

## 2. What is left

### A. Tools

| # | Item | What it does | Data | Effort |
|---|---|---|---|---|
| A1 | **Admission document checklist** (tool 2) | Learner picks a program and their applicant category (Indian, NRI, foreign) and gets a printable, tickable checklist with the source and checked date. The ticks stay only in their browser. Apply now comes after the list. | MUJ: official admission manual. **SMU and Amity: to be sourced** from official pages; missing items show "Confirm with the university". | M |
| A2 | **Recognition check** (tool 4) | Learner picks a program and sees its 2026-27 UGC-DEB status, the name exactly as printed, the source and checked date, plus a "check it yourself" walk-through. | The 2026-27 check is prepared for all 30 programs (all "listed") but **not published in the CMS**. The tool shows only published status and says "being re-checked" until an admin applies the proposals. | S/M |
| A3 | **Matcher: show each result's eligibility** | Each result shows the checker outcome for the learner's answers, or "Needs university confirmation" when no published rule exists. | Published rules only | S |
| A4 | **EMI: processing fee and the semester-payment comparison** | Optional lender processing fee in the total; compares "loan EMI" with "pay the university each semester" where a published schedule exists. | Published category fees and schedules | S/M |
| A5 | **Saved courses: print, notes and copy link** | Print view, a private note per saved program (this browser only) and a copy-link of the ids. | None | S |

Not in scope: the catalog-driven budget bands, which you kept as three in Q25.

### B. Content hubs (first-priority pieces only)

I draft every piece from official sources, with a dated source list. Pieces go into the CMS as **unpublished drafts** for your team to review and publish. Facts that need the university are flagged, never guessed.

| Hub | Hub article | First-priority pieces | Reuses |
|---|---|---|---|
| C1 Recognition and validity | "Is an online degree valid in India? How to check a program's UGC-DEB entitlement (2026-27)", with a status table for all 30 programs | Step-by-step DEB check · online vs distance vs regular · what NAAC/NIRF/AICTE/AIU/WES mean · ABC ID and DEB-ID | Existing posts on verifying UGC approval and NAAC/UGC-DEB (rewrite into the hub per §4.2) |
| C2 Cost and financing | "Online degree fees 2026-27: full cost at MUJ, SMU and Amity (all 30 programs)" | 8 fee guides rebuilt by degree · MBA total-cost comparison · "No-cost EMI: how it works and what to check" | Fee guides, total cost tool |
| C3 Admissions and eligibility | "How to apply: eligibility, documents, intake dates and steps" | Documents checklist (Indian, NRI, foreign) · eligibility guides with category corrections · intake calendar · MCA bridge courses | Documents post, eligibility guides, tool A1 |
| C5 Online MBA | "Online MBA at MUJ, SMU and Amity: fees, eligibility, specializations and how to choose" | 3 enriched MBA comparisons · MBA while working · MBA vs MCA for IT professionals | MBA guide, MBA evidence file |

### C. Enriched comparisons

The editorial comparison pages for **MBA, BCA and MCA** (`/compare/[course]/[pair]`) get a decision summary, a fee breakup by category (where published), eligibility differences, specialisations side by side, dated sources and "who should pick which", with no ranking and no winner.

## 3. Order and effort

1. **Tools A5, A3, A4, A2** (code only, about 4–6 days).
2. **Tool A1** (code plus sourcing the SMU and Amity documents, about 3–4 days).
3. **Hubs C1, C5, C2, C3** as CMS drafts, plus the enriched comparisons (about 2–3 weeks of drafting, in batches for review).

Each step ends with tests, screenshots at 390 and 1280 px, the docs and a progress-log entry.

## 4. Rules carried over

The rules from the redesign stay in force:
- Apply now only, contact-first;
- no phone numbers and no invented facts;
- ratings never used for ranking;
- placement figures labelled university-wide;
- per-program recognition;
- byline "Content Team, Unnati Vidya";
- English only, three universities;
- every tool works without a form.

## 5. Open questions

Asked one at a time; the answers are logged in §6.

## 6. Decision log

| # | Decision | Date |
|---|---|---|
| W1 | Scope: everything in §2, meaning tools A1–A5, hubs C1/C2/C3/C5 and the enriched MBA, BCA and MCA comparisons. | 12 Oct 2026 |
| W2 | Recognition check tool shows only published CMS status ("being re-checked for 2026-27" until an admin applies the 30 prepared proposals). | 12 Oct 2026 |
| W3 | Document lists for SMU and Amity may be researched from official university/UGC sites only, with source URL and checked date. Anything not found shows "Confirm with the university". | 12 Oct 2026 |
| W4 | Hub content arrives in review batches of 3–4 pieces, one hub at a time starting with C1. Each batch lands as unpublished CMS drafts plus a review note listing claims and sources. Drafts reach the VPS through a prepared-drafts file imported as unpublished (never overwriting an existing article), so they can be reviewed in the production CMS. | 12 Oct 2026 |
| W5 | C5 hub rewrites /blog/online-mba-guide at its existing URL. | 13 Oct 2026 |
| W6 | C5 articles quote the new-batch fees with "listed on the official page, 12 October 2026" and link each to its course page. Publish them after the fee corrections. | 13 Oct 2026 |
| W7 | The C2 hub is a catalog page, not a CMS article: a new page, `/online-degree-guides/fees` ("Online degree fees 2026-27"), lists all 30 programs from the published catalog, so it always matches the course pages. The guides hub keeps its other topics and links to this page. | 13 Oct 2026 |
| W8 | The C3 hub is also a catalog page: `/online-degree-guides/admissions` reads each university's admission steps, the published eligibility rules and intakes, and links the eligibility checker, document checklist and recognition check. | 13 Oct 2026 |
| W9 | No intake calendar in C3 for now. The official pages show only rolling, conflicting promotional deadlines (MUJ/SMU MBA: "11th Oct" beside a countdown to 15 October 2026) with no batch name. | 13 Oct 2026 |
| W10 | The eligibility guides show a course's published CMS eligibility (with applicant categories) once an admin has applied its prepared correction, which records the source and check date, and keep the hand-written fact until then. No fact bypasses CMS review. | 13 Oct 2026 |
