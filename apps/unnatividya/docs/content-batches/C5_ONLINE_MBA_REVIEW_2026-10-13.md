# Content batch C5: Online MBA (review note, 13 October 2026)

Four prepared revisions of existing posts, from the [Wave 4 plan](../WAVE_4_PLAN_2026-10.md) (hub C5, decisions W5 and W6). They are in `scripts/prepared-article-drafts.json` with the C1 and C2 batches, and the same `node scripts/import-article-drafts.js` run queues all of them for review.

**Publish order (W6):** these posts quote the new-batch MUJ fees. Apply the six MUJ fee corrections ([FEE_RECHECK_2026-10-12.md](../FEE_RECHECK_2026-10-12.md)) first, so the posts and the course pages show the same amounts.

## 1. Hub: rewrite of `/blog/online-mba-guide`

**New title:** "Online MBA at MUJ, SMU and Amity: fees, eligibility, specializations and how to choose". The URL stays the same, per W5.

| Claim | Source (read) |
|---|---|
| Fees: MUJ ₹1,84,000 (4 × ₹46,000); SMU ₹1,20,000 (4 × ₹30,000); Amity ₹2,25,000 (4 × ₹56,300), before discounts | Official program pages, 12 October; Amity rendered 13 October |
| MUJ and SMU list a ₹500 non-refundable application fee | MUJ and SMU program pages |
| MUJ: 10+2+3 degree with 50% (45% reserved); SMU: 10+2+3, 10+2+4 or 10+3+3 in any discipline with 50% (45%); Amity: any discipline with 40%, and an admission test below 40% | Program-page eligibility sections (Amity rendered) |
| No entrance exam or work experience required; MUJ lists a CAT/GMAT/MAT score and a work-experience certificate as **optional** documents | MUJ, SMU and Amity pages. This resolves the 2022 MUJ manual's entrance-test wording, which the current page no longer requires. |
| MUJ: 13 electives, super or dual specialization in Semester 3. SMU: dual specialization, two of six areas (named). Amity: the options as listed on its page | Program pages |
| All three MBAs were on the 2026-27 entitled list; Amity's appears under both Amity University Rajasthan and Amity University Uttar Pradesh | [UGC_DEB_RECOGNITION_2026-27_2026-10-05.md](../UGC_DEB_RECOGNITION_2026-27_2026-10-05.md) |

The old version discussed placement packages and "international recognition". The hub leaves them out: placement figures remain deferred claims, and recognition is per program.

## 2. Revision: `/blog/best-online-mba-working-professionals`

- **New title:** "Online MBA while working: what MUJ, SMU and Amity ask for". The old title's "Best" is a superlative the site avoids.
- **Claims:** eligibility, optional documents and new-batch semester payments, all from the same pages as the hub.
- **Removed:** no weekly-hours figure and no "weekend classes" claim, because neither is sourced. Learners are told to ask the university about their batch's schedule.

## 3. Revision: `/blog/mca-vs-mba-it-careers`

- **New title:** "MBA or MCA if you work in IT: how to decide".
- **MCA eligibility, as on the current pages:**
  - MUJ and SMU accept a CA/CS/IT degree, or other streams with compulsory bridge courses in computing (and in mathematics if not studied), with 50% (45% reserved).
  - Amity prefers a BCA or equivalent, accepts science/commerce/arts graduates with mathematics at 10+2, and lets others apply after a bridge course. Its page shows no marks figure.
- **New-batch fees:** MCA ₹1,64,000, ₹1,10,000 and ₹1,99,000; MBA as in the hub.
- **Note for reviewers:** the existing post `online-mba-vs-online-mca-which-is-better` says SMU "prefers" a computing background. SMU's current page now uses the same bridge-course wording as MUJ. That post's revision is now prepared; see the [follow-up note](FOLLOW_UPS_REVIEW_2026-10-13.md).

## 4. Revision: `/blog/manipal-university-jaipur-vs-amity-online-mba`

- The fee difference changes from ₹45,000 to ₹41,000 (₹1,84,000 vs ₹2,25,000).
- Specialization and payment details now come from the official pages.
- The "International Finance (ACCA)" label is softened to "International Finance", because the Amity page we read doesn't show the ACCA link.

## The three MBA comparison pages

The enriched MBA comparisons (`/compare/mba/…`) are code, not CMS articles (part C, increment 92). They read the published catalog, so their fee lines change when the MUJ correction is published.
