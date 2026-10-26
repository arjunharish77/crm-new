# Wave 4 follow-up drafts (review note, 13 October 2026)

These are the three optional follow-ups from the C1, C5 and C3 review notes, prepared as five CMS drafts. They are in `scripts/prepared-article-drafts.json` (14 drafts in total), and the same `node scripts/import-article-drafts.js` run queues them with the hub batches. Nothing is published until an administrator applies each item in **CMS → Articles**.

## 1. New article `/blog/online-vs-distance-vs-regular-degree` (C1)

**Title:** "Online, distance or regular: what each mode means for your degree". Owner decision: a new article, with small revisions to the two related posts.

| Claim | Source (read 13 October 2026) |
|---|---|
| Definitions of conventional mode ("face to face interaction … in regular class room environment"), ODL ("a variety of media, including print, electronic, online and occasional interactive face-to-face meetings") and online mode ("full-fledged programme delivery through the internet") | [UGC (ODL Programmes and Online Programmes) Regulations, 2020](https://deb.ugc.ac.in/pdf/20200906.pdf), regulation 2(f), (u) and (v) |
| Continuous assessment at most 30%, end-semester exam at least 70%; 75% participation (online) or 75% attendance in personal contact sessions (ODL) before the end-semester exam | Regulation 15(A)(3) |
| ODL end-semester exams are proctored in examination centres within the territorial jurisdiction | Regulation 15(B)(1) |
| Online programs can use technology-enabled online tests with security arrangements, or proctored exams; the territorial restriction does not apply to online learning | Regulation 15(C)(1)–(2) |
| ODL and online degrees from recognised institutions are equivalent to the conventional-mode awards | Regulation 22 |
| None of the three amendments (2021, 2022, 2024) changes regulation 2's definitions or regulation 22 | [UGC-DEB regulations page](https://deb.ugc.ac.in/Regulations); amendment texts read on 13 October |
| All 30 listed programs were on the 2026-27 list of institutions entitled to offer online programmes | [UGC_DEB_RECOGNITION_2026-27_2026-10-05.md](../UGC_DEB_RECOGNITION_2026-27_2026-10-05.md) |

The cover reuses `/blog/online-mba-vs-distance-mba-difference.webp`.

## 2. Revision: `/blog/online-mba-vs-distance-mba-difference` (C1)

- Adds how the two modes differ: delivery and exams, from the same regulations.
- Replaces "we are re-checking" with the 5 October 2026 result for the three MBAs.
- Adds sources and links to the new article.

## 3. Revision: `/blog/online-degree-vs-regular-degree-employers` (C1)

- Cites regulation 22 for equivalence.
- **Removes** the unsourced sentence that eligibility for further studies and government jobs "all follow from entitlement status". It now says that whether a job or course accepts a degree is decided by that employer or institution, so read the notification.
- Keeps the existing sentence on placement percentages, and adds sources.

## 4. Revision: `/blog/online-mba-vs-online-mca-which-is-better` (C5)

The MCA eligibility now follows the current official pages, the same as the C5 `mca-vs-mba-it-careers` draft:
- **MUJ and SMU:** a computing degree directly, or other streams with compulsory computing (and mathematics) bridge courses, at 50% (45% reserved). The published post said SMU "prefers" a computing degree and MUJ "accepts any discipline".
- **Amity:** prefers a BCA or equivalent, accepts science, commerce or arts graduates with mathematics at 10+2, or others after a bridge course. Its page shows no marks figure.

The MBA lines add MUJ's optional CAT/GMAT/MAT score and work-experience certificate. Sources and course-page links are added.

## 5. Revision: `/blog/online-admission-documents-checklist` (C3)

**New title:** "Documents for online degree admission at MUJ, SMU and Amity".
- **Rebuilt from** the four official sources behind the document checklist tool (Online Manipal admission page, MUJ admission manual v5, Amity FAQs, Amity's how-to-apply guide), plus UGC's DEB-ID notice.
- **Removed as unsourced:** the education-loan document list ("salary slips, bank statements, PAN") and the "most common rejection reasons".
- **Kept, now sourced:** the name-mismatch point, from MUJ's manual (a notarised affidavit for name variations).

## Tested

On the CI database:
- the import queued all 14 items, and the new article stayed private until applied;
- applying the new article and the documents revision through the normal review API published both with their sources;
- the database was then restored exactly (26 articles, 26 revisions, no disposable user, audit rows unchanged).
