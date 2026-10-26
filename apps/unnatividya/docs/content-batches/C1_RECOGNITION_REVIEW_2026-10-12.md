# Content batch C1: recognition and validity (review note, 12 October 2026)

Four prepared drafts from the [Wave 4 plan](../WAVE_4_PLAN_2026-10.md) (hub C1, decision W4). They are in `scripts/prepared-article-drafts.json`. Run `node scripts/import-article-drafts.js` once to put them into the CMS review queue (see "Loading the drafts" below). Nothing is published until an administrator applies each revision in **CMS → Articles**.

Please check each claim against its source before applying. Every source below was opened on the date shown.

## 1. Hub: rewrite of `/blog/ugc-approved-online-degree-guide`

**New title:** "Is an online degree valid in India? How to check a program's UGC-DEB entitlement (2026-27)". The URL stays the same. The old government-jobs angle now links to `/blog/is-online-mba-valid-for-government-jobs`.

| Claim | Source |
|---|---|
| Entitlement is per program and per session; the year-wise lists are published at deb.ugc.ac.in | UGC public notice of 19 August 2024; UGC-DEB 2026-27 lists |
| A degree from an entitled online program is treated the same as an on-campus degree | UGC (ODL and Online Programmes) Regulations, 2020. This wording is already used on course pages. |
| 2026-27 has an "entitled" list and a "recognised" list, and the latter prints a period | [UGC_DEB_RECOGNITION_2026-27_2026-10-05.md](../UGC_DEB_RECOGNITION_2026-27_2026-10-05.md) (PDFs checked 5 October) |
| MUJ: 9 programs under Manipal University, Rajasthan (S.No. 74); SMU: 9 under Sikkim Manipal University, Sikkim (S.No. 80) | Same |
| Amity: programs under Amity University Rajasthan and Amity University Uttar Pradesh; 5 only under UP; 3 of those printed as valid up to January 2027 | Same. The awarding attribution for the five is the owner's (5 October decision). The draft tells learners to ask Amity. |
| The DEB-ID is required from 2024-25 and is created with an ABC ID | UGC public notice of 19 August 2024; UGC-DEB DEB-ID FAQ |

## 2. New: `/blog/abc-id-and-deb-id-guide`

| Claim | Source |
|---|---|
| The DEB-ID is a unique ID that must be created before admission to an ODL or online program, so that learners enrol only in recognised HEIs | [UGC-DEB DEB-ID FAQ](https://deb.ugc.ac.in/StudentDEBId/FAQ), questions 1–3 |
| It is required for every student except foreign learners from academic year 2024-25; the foreign-learner mechanism is "yet to be implemented" | [UGC public notice, 19 August 2024](https://www.ugc.gov.in/pdfnews/8295117_Public-Notice-prodedure-for-students-enrolling-in-ODL.pdf) |
| The ABC ID is created through DigiLocker, and a DEB-ID cannot be created without one | DEB-ID FAQ, questions 5–6 |
| The DEB-ID is valid for life across ODL and online learning; learners can be admitted to two programs at once under the regulations | DEB-ID FAQ, questions 7 and 9; the notice |
| The order of steps | [UGC-DEB steps PDF](https://deb.ugc.ac.in/pdf/StepsDEBID.pdf) |

The cover reuses `/blog/online-admission-documents-checklist.webp`; replace it if a dedicated image is wanted.

## 3. Revision: `/blog/how-to-verify-ugc-approved-degree`

This replaces the general advice with four steps. It uses legal-name examples from the 5 October check:
- MUJ is printed as Manipal University, Rajasthan, distinct from the Karnataka entry;
- Amity appears under two institutions;
- SMU's BA is printed with its subjects.

## 4. Revision: `/blog/naac-ugc-deb-aicte-explained`

- Adds NIRF, AIU and WES.
- **Removes** the published sentence that BBA and BCA "aren't AICTE-regulated at all". It had no source, and AICTE's position on BBA/BCA changed in 2024. The draft now says to check the program page and ask the university. If you want a definite statement, add an official AICTE source first.
- The NAAC/NIRF conditions sentence relies on the 2025-26 entitlement letter, as recorded in the recognition research file.
- The AIU example comes from MUJ's admission manual (version 5, 2022).

## Loading the drafts

On the VPS, after the release is deployed, run this inside the website container as with the article sync:

```bash
docker compose -f deploy/vps/docker-compose.yml --env-file deploy/vps/.env run --rm --no-deps unnatividya-web node scripts/import-article-drafts.js
```

The script:
- creates the new article as a draft;
- queues each revision only if the live article still has the text the draft was written against;
- skips anything already queued.

It prints what it queued and skipped. Then review and apply each item in **CMS → Articles**.

## Not covered by this batch

"Online vs distance vs regular" is now prepared as a new article plus revisions of the two related posts; see the [follow-up note](FOLLOW_UPS_REVIEW_2026-10-13.md).
