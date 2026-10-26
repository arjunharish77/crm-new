# Wave 5 content clusters D1–D4 (review note, 24 October 2026)

These are the four clusters from the [Wave 5 plan](../WAVE_5_PLAN_2026-10.md) (decisions V4, V14–V16). Each hub is a catalog page that ships with the release. The supporting pieces are six revisions of existing posts in `scripts/prepared-article-drafts.json` (now 20 drafts: 3 new articles and 17 revisions). The same `node scripts/import-article-drafts.js` run queues them for review.

## Hubs (code, built from the published catalog and sourced data)

| Hub | URL | What it shows | Sources |
|---|---|---|---|
| D4 NRIs and international learners | `/online-degree-guides/international` | NRI and foreign-national fees by degree (published category rows only, in the university's currency), documents for NRI and foreign applicants, exams from outside India, the DEB-ID rule | Published category fees; the document checklist's four official sources (12 Oct); UGC 2020 regulations 15(C)(2); Online Manipal and Amity exam pages; UGC notice of 19 August 2024 |
| D2 Computing, data and mathematics | `/online-degree-guides/computing` | BCA, MCA, MSc Data Science and MSc Mathematics by university: tuition for the visitor's group, specialisation count, entry requirement and roles | The published catalog; the published eligibility and career-scope guide text |
| D3 Commerce, humanities and media | `/online-degree-guides/commerce-humanities` | B.Com, B.Com Honours, BBA, M.Com, BA, the MAs, BA JMC and MA JMC, as for D2. BBA sits here because no other hub covers it. | As D2 |
| D1 How online learning works | `/online-degree-guides/online-learning` | UGC's rules (delivery, 75% participation, 30/70 assessment, exams, equivalence), published class and assessment details per program, each university's exams, planning your time | UGC 2020 regulations; the universities' exam pages; published program details |

The hubs link to each other, the tools and the guides. Within a degree, universities are ordered by listed tuition, and the page says this isn't a ranking.

## Supporting drafts (CMS revisions, read 24 October 2026 unless noted)

1. **`wes-evaluation-online-degrees` (D4).** Rebuilt from [WES's India requirements](https://www.wes.org/resource-library/blog/credential-advice/wes-indian-credential-evaluations/) (20 May 2026) and [IRCC's Express Entry ECA page](https://www.canada.ca/en/immigration-refugees-citizenship/services/immigrate-canada/express-entry/documents/education-assessment.html) (updated 16 October 2026).
   - **Removed:** the claim that WES "recognition is usually granted at the university level". WES evaluates each applicant's credentials.
   - **Kept as the university's own wording:** "WES recognised" on a university page.
   - WES's page says nothing specific about online degrees, and the draft says so.
2. **`online-bca-after-12th-guide` (D2).**
   - Amity's BCA page now asks Indian students only for Class 10 and 12 certificates, so the old "Math/CS/IP preferred" wording is gone. MUJ lists 10+2.
   - Neither page states a minimum percentage.
   - MUJ's first semester includes Fundamentals of Mathematics.
   - New-batch fees: MUJ ₹1,44,000 (₹24,000 per semester), Amity ₹1,75,000 (₹29,200 per semester).
3. **`online-bca-vs-bsc-computer-science` (D2).**
   - **Removed:** the unsourced generalisation about how BCA and BSc CS curricula differ.
   - **Now:** compare the semester-wise subjects, using MUJ's and Amity's current entry rules and specialisations.
4. **`online-msc-data-science-career-scope` (D2).**
   - Amity's page asks for a bachelor's degree in any Science discipline.
   - The role ladder now matches the page exactly.
   - Fees: ₹2,75,000, ₹68,800 per semester.
   - It was on the 2026-27 entitled list under Amity University Rajasthan (checked 5 October).
5. **`online-bcom-vs-bcom-honours-amity` (D3).**
   - Honours asks for 10+2 with 55%; the B.Com states no minimum.
   - Fees: ₹1,75,000 against ₹1,15,000.
   - The ACCA point is quoted as Amity's own FAQ wording ("comes with an ACCA accreditation").
   - **Removed:** the module list (Strategic Business Leadership and so on), because the curriculum is collapsed on the page and couldn't be confirmed, and the "copy-pasted from BA JMC" claim. Today both pages list the same, mostly communications, job roles, and the draft says so neutrally.
6. **`studying-while-working-fulltime` (D1).**
   - **Removed:** the unsourced generalisations (weekend live sessions, "1–2 hours on 3–4 evenings", "most common failure", assessments clustered in windows).
   - **Kept:** UGC's participation and assessment rules, Online Manipal's exam slot booking, and MUJ's own "15–20 hours per week" for its BCA (one program's figure, not a general one).

## For the catalog team (not changed by these drafts)

- **MUJ BCA electives:** the catalog lists three (Data Science & Analytics, Cloud Computing, Cybersecurity). MUJ's page now lists six: Agentic AI & Intelligent Systems, Cyber Security, Cloud Computing, Data Science & Analytics, Generative AI & Intelligent Systems, and Full Stack Software Development. Update them through Catalog revisions after checking the page.
- **Amity semester amounts:** the pages show per-semester fees (for example BCA ₹29,200 and MSc Data Science ₹68,800) that differ slightly from the catalog's computed seed plans. Reviewed fee corrections would replace those.
