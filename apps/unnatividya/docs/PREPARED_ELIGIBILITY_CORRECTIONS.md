# Prepared eligibility corrections

30 September 2026. Twenty-eight course revision forms offer source-based eligibility corrections. They retain separate applicant-category paragraphs. MUJ/SMU use their combined NRI/foreign wording; Amity keeps foreign-applicant requirements separate from an NRI category-confirmation note. The evidence is the official eligibility sections recorded in `COURSE_CONTENT_EVIDENCE_2026-09-30.json` and the rendered Amity follow-up in `AMITY_RENDERED_ELIGIBILITY_REVIEW_2026-09-30.json`; these remain editorial proposals, not admissions decisions or current-session guarantees.

A [3 October follow-up](CONTENT_VERIFICATION_FOLLOWUP_2026-10-03.md) reconfirmed that the two held eligibility cases remain unresolved; it did not publish any correction.

## CMS workflow

Open **Courses → Edit → Propose or review revisions → Basic details**. Expand **Preview eligibility correction**, inspect both categories and open the official source. **Load eligibility correction** replaces only the unsaved eligibility text, adds its source and review context, and clears the previous eligibility verification marker. Other edits remain intact. Add a review reason and submit through the normal administrator review/application workflow.

No course database update or saved revision happens merely by loading. Sources and text must still be checked for the current session before approval. No fee, curriculum, recognition or publication state changes are included.

| Course | Official source |
| --- | --- |
| mba-muj | [Program page](https://www.onlinemanipal.com/online-mba-manipal-university-jaipur) |
| mba-smu | [Program page](https://www.onlinemanipal.com/online-mba-degree-dual-specialization-smu) |
| bba-muj | [Program page](https://www.onlinemanipal.com/online-bba-degree-muj) |
| bca-muj | [Program page](https://www.onlinemanipal.com/online-bca-degree-muj) |
| mca-muj | [Program page](https://www.onlinemanipal.com/online-mca-degree-muj) |
| bcom-muj | [Program page](https://www.onlinemanipal.com/online-bcom-degree-muj) |
| bcom-smu | [Program page](https://www.onlinemanipal.com/online-bcom-degree-smu) |
| mcom-muj | [Program page](https://www.onlinemanipal.com/online-mcom-degree-muj) |
| ba-smu | [Program page](https://www.onlinemanipal.com/online-ba-degree-smu) |
| bba-smu | [Program page](https://www.onlinemanipal.com/online-bba-degree-smu) |
| mca-smu | [Program page](https://www.onlinemanipal.com/online-mca-degree-smu) |
| mcom-smu | [Program page](https://www.onlinemanipal.com/online-mcom-degree-smu) |
| ma-english-smu | [Program page](https://www.onlinemanipal.com/online-ma-english-degree) |
| ma-political-science-smu | [Program page](https://www.onlinemanipal.com/online-ma-political-science-degree) |
| ma-sociology-smu | [Program page](https://www.onlinemanipal.com/online-ma-sociology-degree) |
| ma-economics-muj | [Program page](https://www.onlinemanipal.com/online-ma-economics-degree) |
| majmc-muj | [Program page](https://www.onlinemanipal.com/online-ma-journalism-and-mass-communication) |

| mba-amity | [Program page](https://amityonline.com/master-of-business-administration-online) |
| bba-amity | [Program page](https://amityonline.com/bachelor-of-business-administration-online) |
| bca-amity | [Program page](https://amityonline.com/bachelor-of-computer-applications-online) |
| mca-amity | [Program page](https://amityonline.com/master-of-computer-applications-online) |
| bcom-amity | [Program page](https://amityonline.com/bachelor-of-commerce-online) |
| majmc-amity | [Program page](https://amityonline.com/master-of-arts-journalism-and-mass-communication-online) |
| bcom-honours-amity | [Program page](https://amityonline.com/bachelor-of-commerce-honours) |
| mcom-amity | [Program page](https://amityonline.com/master-of-commerce-financial-management-online) |
| bajmc-amity | [Program page](https://amityonline.com/bachelor-of-arts-journalism-and-mass-communication-online) |
| msc-data-science-amity | [Program page](https://amityonline.com/msc-in-data-science) |
| ma-public-policy-governance-amity | [Program page](https://amityonline.com/ma-public-policy) |

## Conditions preserved

- Undergraduate domestic 10+3 diploma routes are explicit. International routes follow their own source sections; a domestic option is not silently copied into an international rule.
- MBA route/mark requirements remain course-specific, including different international reserved-category wording at MUJ and SMU. No unconditional entrance-test or experience waiver is added.
- MCA computing and mathematics bridge requirements remain distinct, with the domestic 50%/45% thresholds and the international section's 50% requirement.
- MUJ/SMU M.Com drafts remove the unsupported commerce-only restriction, subject to current admissions-policy review.
- International equivalence and supporting-document checks remain explicit.

## Amity follow-up

The program pages populate eligibility after JavaScript runs; initial HTML and structured metadata omitted material conditions. Read-only browser checks now support eleven additional proposals. Indian and foreign sections remain separate. The preview and loaded text label Amity’s foreign requirements explicitly. A separate NRI paragraph asks applicants to confirm which category applies; foreign criteria are not automatically assigned to all NRIs.

- MBA and MAJMC: preserve the domestic 40% threshold and admission-test route below it.
- B.Com Honours: retain 55%; both the rendered program page and official application article support it.
- M.Com Financial Management: retain the foreign section’s 36 months of executive experience for explicit current-intake confirmation; do not apply it automatically to other specialisations or domestic applicants.
- MCA: preserve mathematics/bridge conditions; foreign wording does not establish an exemption.
- BAJMC: retain the three-year English-medium requirement.
- MSc Data Science: preserve domestic science-degree wording; shorter foreign wording does not establish acceptance of every degree subject.

## Two records held back

**Amity BA:** domestic requirements are visible, but the browser-rendered page did not expose a foreign-applicant section. The metadata-only international route still needs admissions confirmation.

**MUJ MSc Mathematics:** the [program page](https://www.onlinemanipal.com/online-msc-mathematics-muj) mentions compulsory mathematics alongside BSc/equivalent routes. The [programme project report](https://muj.onlinemanipal.com/wp-content/uploads/sites/2/2026/08/M.Sc-Mathematics-PPR.pdf), printed page 45, instead describes a BSc/equivalent route and 50%/45% marks without repeating that mathematics condition. Obtain current admissions clarification for both route and marks requirements; omission is not a waiver.

Both records show an **Eligibility evidence needs review** notice with the discrepancy, required follow-up and official source links in the CMS revision page. These advisory notices are visible to readers and editors; they do not prevent manual proposals supported by confirmed evidence. Neither record has a prepared eligibility loader. Prepared corrections for the other 28 remain unverified editorial proposals until reviewed; this is not full catalog certification.

Data: `src/data/prepared-eligibility-drafts.json`. No migration or environment setting is required. Public pages are unchanged until an administrator applies a submitted revision.
