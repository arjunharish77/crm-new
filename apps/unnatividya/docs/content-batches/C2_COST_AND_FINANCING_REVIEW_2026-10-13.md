# Content batch C2: cost and financing (review note, 13 October 2026)

Hub C2 from the [Wave 4 plan](../WAVE_4_PLAN_2026-10.md). Most of it is code that reads the published catalog, per decision W7, so it ships with the release. Only one piece is a CMS draft.

## 1. Code (ships with the release)

| Piece | What it shows | Where the facts come from |
|---|---|---|
| Hub: `/online-degree-guides/fees`, "Online degree fees 2026-27 at MUJ, SMU and Amity" | All programs grouped by degree: listed tuition, duration, the fee-check date and Indian semester payment where reviewed. Also what the listed fee leaves out, paying in parts and four FAQs. | The published catalog only. Semester amounts come only from a published applicant-category fee block, never from the seeded computed plans. |
| 17 degree fee guides (`/online-degree-guides/<degree>-fees`), rebuilt | Application fee column, fee-check dates, a "Payment options" table, a "Plan the full cost" section and a sources list per program. | Same. Payment options show only for programs whose fee correction has been published (it records `feeReview`). |
| MBA total-cost comparison | Each comparison guide links to the total cost planner with all its programs preselected (`/tools/total-cost?course=mba-muj,mba-smu,mba-amity`). | The planner's published data. |
| Guides hub | A link card to the fees hub above the guide explorer. | Not applicable |

**Removed from the fee guides because they were unsourced:**
- "covers tuition, LMS access, and online proctored exams";
- "choosing a specialization doesn't change the fee";
- "verified against its individual program page" (now shown only as a dated check, where one exists);
- the template "Full payment (2% off)" plan.

The no-cost EMI sentence remains as the owner-stated claim in the [claims register](../CLAIMS_REGISTER.md).

**Fixed along the way:** the planner no longer shows the older UGC-DEB notice PDF as a program's fee source (it did for Amity's MBA).

Until the six MUJ fee corrections ([FEE_RECHECK_2026-10-12.md](../FEE_RECHECK_2026-10-12.md)) are published, the hub and guides show the old MUJ amounts, because they read the catalog. Publishing the corrections updates them, with no further change needed.

## 2. CMS draft: new article `/blog/no-cost-emi-online-degree`

**Title:** "No-cost EMI for an online degree: how it works and what to check". It is in `scripts/prepared-article-drafts.json` (batch C2), and the same `node scripts/import-article-drafts.js` run queues it with C1 and C5.

| Claim | Source (read 13 October 2026) |
|---|---|
| In zero percent EMI schemes on credit card outstandings, "the interest element is often camouflaged and passed on to customer in the form of processing fee"; "the very concept of zero percent interest is non-existent" | [RBI circular RBI/2013-14/292, 17 September 2013](https://www.rbi.org.in/scripts/NotificationUser.aspx?Id=8461&Mode=0) (addressed to scheduled commercial banks) |
| Banks and NBFCs must give a KFS for new retail and MSME term loans sanctioned on or after 1 October 2024; the APR includes the interest rate and all charges the lender levies; there is a repayment schedule | [RBI circular RBI/2024-25/18, 15 April 2024](https://www.rbi.org.in/Scripts/NotificationUser.aspx?Id=12663&Mode=0) |
| Charges not in the KFS cannot be levied later without explicit consent; the KFS is valid for at least three working days for loans of seven days or more; the borrower acknowledges it; credit card receivables are exempt | Same circular, paras 4, 5 and 10 |
| Every university listed offers no-cost EMI | Owner-stated claim (claims register) |
| The monthly amount on course pages is listed tuition ÷ program months | The site's own convention (increment 91) |

The checklist ("what to check before you sign") is advice to ask the lender, not a statement of any lender's terms. The cover reuses `/blog/online-mba-guide.webp`; replace it if a dedicated image is wanted.

**For reviewers:** the 2013 circular is addressed to banks and speaks of credit card EMI schemes. The draft quotes it as what the RBI said, not as a rule that covers every education lender.
