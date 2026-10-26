# Structured eligibility checker pilot — 9 October 2026

This is a prepared CMS proposal, not a published admission determination. The learner tool reads **published** `eligibilityRules` only. The local catalog currently has no such blocks, so all 30 programs return **Needs university confirmation**, and the checker stays `noindex` and outside the sitemap until at least one complete reviewed rule is applied.

## Source-checked MBA rules

| Program | Listed bachelor's routes | Indian marks | NRI / foreign marks | Foreign education |
|---|---|---|---|---|
| [MUJ online MBA](https://www.onlinemanipal.com/online-mba-manipal-university-jaipur) | 10+2+3, or an equivalent confirmed by the university/AIU | 50%; 45% for reserved categories | 50%; no separate reserved threshold shown | AIU equivalence certificate required when 10+2 or graduation was completed outside India |
| [SMU online MBA](https://www.onlinemanipal.com/online-mba-degree-dual-specialization-smu) | 10+2+3, 10+2+4 or 10+3+3, or accepted equivalent | 50%; 45% for reserved categories | The page repeats 50%; 45% for reserved categories | AIU equivalence certificate required when 10+2 or graduation was completed outside India |

The prepared structured records are in `src/data/prepared-eligibility-rules.json`, with source links and the 9 October check date. The checker treats unlisted bachelor's routes as **Needs university confirmation**, since the university may accept an equivalent. Class 12 or a diploma alone does not meet the published MBA bachelor's requirement. Unknown marks, CGPA conversion, uncertain reserved status near a threshold, an unconfirmed awarding institution, and missing AIU equivalence also return **Needs university confirmation**. “Matches published academic criteria” is not an admission offer; the university checks the actual documents, category and current intake.

## Source-checked BBA rules

| Program | Indian qualification | NRI / foreign qualification | Marks | Outside-India education |
|---|---|---|---|---|
| [MUJ online BBA](https://www.onlinemanipal.com/online-bba-degree-muj) | Recognised 10+2 or recognised 10+3 diploma | Recognised 10+2 or AIU-recognised equivalent; 10+3 diploma needs university confirmation | No minimum stated on program page | AIU equivalence certificate required |
| [SMU online BBA](https://www.onlinemanipal.com/online-bba-degree-smu) | Recognised 10+2, recognised 10+3 diploma or AIU-recognised equivalent | Held for clarification: the main eligibility block lists 10+3, while its FAQ narrows the wording to 10+2/equivalent | No minimum stated on program page | AIU equivalence check retained conservatively |

The checker now supports accepted qualification routes **per applicant category**. That keeps MUJ's Indian diploma route from automatically matching NRI/foreign applicants. The SMU draft encodes only the consistent Indian category; NRI and foreign applicants return **Needs university confirmation** even if the Indian rule is published. BBA rules have no marks threshold, so the learner form hides its percentage field when one of these rules is selected. It still asks about institution recognition and foreign education. These BBA records are private prepared proposals; none is live.

## BCom and BA source check

| Program | Indian route encoded | NRI / foreign route encoded | Held route or caveat |
|---|---|---|---|
| [MUJ online BCom](https://www.onlinemanipal.com/online-bcom-degree-muj) | Recognised 10+2 or recognised 10+3 diploma | Recognised 10+2, with AIU equivalence for outside-India education | NRI/foreign diploma or other equivalent route needs university confirmation |
| [SMU online BCom](https://www.onlinemanipal.com/online-bcom-degree-smu) | Recognised 10+2 or recognised 10+3 diploma | Recognised 10+2, with AIU equivalence for outside-India education | NRI/foreign diploma or other equivalent route needs university confirmation |
| [SMU online BA](https://www.onlinemanipal.com/online-ba-degree-smu) | Recognised 10+2 only | Not encoded | Current page lists an Indian 10+3 diploma, but the [2026–27 BA prospectus](https://www.onlinemanipal.com/wp-content/uploads/2023/06/SMU-BA-Domestic-Brochure-1.pdf) does not expressly repeat that route. An [older 2025–26 international BA brochure](https://www.onlinemanipal.com/wp-content/uploads/2023/06/SMU-BA-International-Brochure.pdf) unexpectedly lists a bachelor's-degree requirement. Obtain current-session confirmation before enabling diploma or NRI/foreign matches. |

No minimum marks percentage is stated in the current BCom or BA program-page eligibility sections. These three additional structured rules are prepared proposals only. The BA rule is deliberately narrower than its page: the common Class 12 route can match after review, while diploma and international cases always ask the university. The existing free-text BA draft now carries a prominent source-conflict warning in CMS; do not submit it without resolving the routes.

Amity MBA is held out of this pilot. Its prepared free-text eligibility correction is separate, and the current official page needs another reliable rendered/source check before a complete structured rule is proposed. MUJ MSc Mathematics remains held because official requirements conflict. The remaining 23 programs need a course-by-course structured review; free-text paragraphs are not treated as executable rules.

## CMS application

1. In **CMS → Publishing checklist**, open one of the seven prepared course revisions: `mba-muj`, `mba-smu`, `bba-muj`, `bba-smu`, `bcom-muj`, `bcom-smu` or `ba-smu`. Under **Structured eligibility checker rules**, open the official page, check the current admission session and applicant categories, and load the prepared pilot. Read the BA conflict notice before loading or submitting its free-text proposal.
2. Review every route and marks field, plus the checkbox confirming that every condition needed for a **Matches** result on the encoded categories and routes is covered. Unlisted categories and routes always return confirmation; if an encoded route still has an unresolved condition, clear the checkbox or add it as an unresolved condition. Submit the revision with an evidence-based reason.
3. An administrator reviews the diff and applies the rule separately. The tool then uses it immediately from the published catalog; the checker can be indexed once at least one complete rule is live. The displayed free-text eligibility paragraph remains a separate reviewed fact; editing it removes a previously published structured rule from the proposal so the two cannot silently conflict.

No migration or environment variable is required. No personal information is stored by the checker. Keep the university's admissions team as the final authority.
