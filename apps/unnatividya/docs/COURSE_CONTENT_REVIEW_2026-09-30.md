# Course content review — 30 September 2026

## Findings and implemented presentation fix

All 30 program pages were checked for eligibility evidence and curriculum coverage. The CMS currently stores four curriculum groups for every course, with no verified curriculum markers. **All 12 undergraduate pages list six semesters at the official source.** Matching the four postgraduate semester headings does not verify their subjects; every curriculum still requires subject-by-subject review.

Course pages now label unverified outlines **Illustrative study areas**, explain their provisional nature and use study-area group labels instead of claiming that those groups are the university's semesters. A reviewed curriculum keeps its actual term labels. Removed the blanket claim that every elective belongs to semesters 3–4. CMS content quality now flags unverified eligibility/curriculum and checks the correct `careerRoles` field.

This is a presentation correction, not publication of a new official syllabus. No course database values or verification markers were changed.

## Eligibility review

The 18 MUJ/SMU pages expose eligibility sections. Amity's visible eligibility panels were empty in retrieved responses, while official JSON-LD contains prerequisites for all 12 programs. Metadata is recorded as provisional evidence and requires confirmation against visible admissions content or a current admissions document.

| Course | Review action |
| --- | --- |
| [mba-muj](https://www.onlinemanipal.com/online-mba-manipal-university-jaipur) | Confirm the unconditional no-entrance-test/no-experience claims separately; preserve the domestic/international marks distinction. |
| [mba-smu](https://www.onlinemanipal.com/online-mba-degree-dual-specialization-smu) | Add the 10+3+3 route. Keep specialization choices outside eligibility. |
| [mba-amity](https://amityonline.com/master-of-business-administration-online) | An unconditional no-entrance-test statement conflicts with the described lower-marks eligibility-test route. |
| [bba-muj](https://www.onlinemanipal.com/online-bba-degree-muj) | Add the explicit 10+3 diploma route and review international equivalence conditions. |
| [bba-amity](https://amityonline.com/bachelor-of-business-administration-online) | Review category-specific equivalence and document requirements. |
| [bca-muj](https://www.onlinemanipal.com/online-bca-degree-muj) | Add the explicit 10+3 diploma route and review international equivalence conditions. |
| [bca-amity](https://amityonline.com/bachelor-of-computer-applications-online) | Review category-specific equivalence and document requirements. |
| [mca-muj](https://www.onlinemanipal.com/online-mca-degree-muj) | Separate the computing bridge trigger from the mathematics bridge trigger. |
| [mca-amity](https://amityonline.com/master-of-computer-applications-online) | Review category-specific equivalence and document requirements. |
| [bcom-muj](https://www.onlinemanipal.com/online-bcom-degree-muj) | Add the explicit 10+3 diploma route and review international equivalence conditions. |
| [bcom-smu](https://www.onlinemanipal.com/online-bcom-degree-smu) | Add the explicit 10+3 diploma route and review international equivalence conditions. |
| [mcom-muj](https://www.onlinemanipal.com/online-mcom-degree-muj) | Remove the unsupported commerce/related-discipline restriction after review. |
| [ba-smu](https://www.onlinemanipal.com/online-ba-degree-smu) | Add the explicit 10+3 diploma route and review international equivalence conditions. |
| [bba-smu](https://www.onlinemanipal.com/online-bba-degree-smu) | Add the explicit 10+3 diploma route and review international equivalence conditions. |
| [mca-smu](https://www.onlinemanipal.com/online-mca-degree-smu) | Add the marks threshold and both distinct bridge-course conditions. |
| [mcom-smu](https://www.onlinemanipal.com/online-mcom-degree-smu) | Remove the unsupported commerce/related-discipline restriction after review. |
| [ma-english-smu](https://www.onlinemanipal.com/online-ma-english-degree) | Expand the qualification route and international equivalence requirements. |
| [ma-political-science-smu](https://www.onlinemanipal.com/online-ma-political-science-degree) | Expand the qualification route and international equivalence requirements. |
| [ma-sociology-smu](https://www.onlinemanipal.com/online-ma-sociology-degree) | Expand the qualification route and international equivalence requirements. |
| [ma-economics-muj](https://www.onlinemanipal.com/online-ma-economics-degree) | Expand the qualification route and international equivalence requirements. |
| [majmc-muj](https://www.onlinemanipal.com/online-ma-journalism-and-mass-communication) | Expand the qualification route and international equivalence requirements. |
| [bcom-amity](https://amityonline.com/bachelor-of-commerce-online) | Review category-specific equivalence and document requirements. |
| [majmc-amity](https://amityonline.com/master-of-arts-journalism-and-mass-communication-online) | Review category-specific equivalence and document requirements. |
| [ba-amity](https://amityonline.com/bachelor-of-arts-online) | Review category-specific equivalence and document requirements. |
| [bcom-honours-amity](https://amityonline.com/bachelor-of-commerce-honours) | Confirm the 55% threshold before retaining or removing it. |
| [mcom-amity](https://amityonline.com/master-of-commerce-financial-management-online) | Resolve the generic M.Com versus Financial Management scope and the commerce restriction. |
| [bajmc-amity](https://amityonline.com/bachelor-of-arts-journalism-and-mass-communication-online) | Review category-specific equivalence and document requirements. |
| [msc-data-science-amity](https://amityonline.com/msc-in-data-science) | Review category-specific equivalence and document requirements. |
| [msc-mathematics-muj](https://www.onlinemanipal.com/online-msc-mathematics-muj) | Resolve mathematics-condition wording against an admissions document. |
| [ma-public-policy-governance-amity](https://amityonline.com/ma-public-policy) | Review the missing degree-duration, English and diploma-exclusion conditions. |

Detailed paraphrased observations, current CMS text, evidence type and curriculum coverage appear in `COURSE_CONTENT_EVIDENCE_2026-09-30.json`. No blanket eligibility verification flag was set. Do not turn an omitted condition into a claim that the university has no such condition.

## Recognition: historical matches are not current approval

A direct HTTPS request to the [UGC-DEB directory](https://deb.ugc.ac.in/Home/HEI_Prog_List) succeeded, resolving the earlier web-tool retrieval failure. Candidate online-mode rows for 27 programs were found in 2025–26. They remain provisional until matched to the exact awarding institution and admission session. The directory also contains a 2026–27 Amity BCA entry with blank state/session fields.

Three programs need further evidence: MUJ MSc Mathematics, Amity B.Com Honours and Amity MSc Data Science. Similar entries for the two Amity programs occur under Rajasthan; they must not be attributed to the Uttar Pradesh institution without confirmation. Missing or ambiguous rows in this pass do not establish that a program is unrecognised. No recognition claims were changed.

## Remaining content work

- Replace illustrative outlines with reviewed semester subjects and electives, preserving course-specific choices and projects.
- Apply eligibility corrections through fresh CMS revisions, separating domestic and international requirements.
- Obtain current-session, exact-institution regulator evidence and resolve Amity's awarding-body details.
- Confirm international/NRI inclusions and admission documents; the earlier fee observations do not settle those terms.
- Resolve the previously identified Amity MAJMC fee mismatch with its payment plans and dependent copy.
