# Content batch C3: admissions and eligibility (review note, 13 October 2026)

Hub C3 from the [Wave 4 plan](../WAVE_4_PLAN_2026-10.md). Owner decisions W8–W10 make it code that reads the published catalog, with no CMS drafts. It ships with the release.

## 1. Hub: `/online-degree-guides/admissions`

"How to apply for an online degree at Amity, MUJ and SMU". The university names come from the catalog.

| Section | Content | Source |
|---|---|---|
| The order to follow | 1. Check eligibility (checker). 2. Check the program is listed for your session (recognition check). 3. Create your ABC ID and DEB-ID. 4. Gather documents (checklist). 5. Apply on the university's portal; application fee by university. | Tools as built (A1–A5). DEB-ID: [UGC public notice, 19 August 2024](https://www.ugc.gov.in/pdfnews/8295117_Public-Notice-prodedure-for-students-enrolling-in-ODL.pdf). Application fee: `programApplicationFee` (₹500 for MUJ/SMU Indian applicants per the 3 October evidence; Amity "confirm") |
| Eligibility by degree | Links to every eligibility guide for a degree in the catalog, with the universities offering it | Catalog |
| Documents | Link to the document checklist, plus its four official sources with checked dates | `DOCUMENT_SOURCES` (A1, checked 12 October 2026) |
| Admission steps by university | Each university's own steps and its application fee | Published university records (`admissionSteps`), the same text as the university pages |
| FAQs | Closing dates (we don't list them), admission not guaranteed, NRI/international applicants, the DEB-ID | As above |

**For reviewers:** the DEB-ID sentence is the only regulatory fact the hub states itself. It matches the C1 article draft `abc-id-and-deb-id-guide` and links straight to UGC's notice. Once that article is published, consider linking it from step 3.

## 2. No intake calendar (W9)

On 13 October the official MUJ and SMU MBA pages showed "Last date of admission: 11th Oct" next to an application countdown to 15 October 2026, with no batch name. The hub doesn't list dates; its FAQ asks learners to check the current deadline with the university.

## 3. Eligibility guides read published CMS eligibility (W10)

Each university card on an eligibility guide works as follows:
- **Before:** it shows the hand-written fact (last reviewed August 2026).
- **After:** once an administrator applies that course's prepared eligibility correction (CMS → Catalog revisions → **Load eligibility correction**), it shows the published text by applicant category ("Indian applicants", "NRI / foreign applicants"), plus "From the course record: source, checked date". That source is added to the guide's sources.
- **Conflicts:** a caption says the dated cards take precedence over the guide's hand-written notes and FAQs.

Twenty-eight corrections are prepared ([PREPARED_ELIGIBILITY_CORRECTIONS.md](../PREPARED_ELIGIBILITY_CORRECTIONS.md)). Example: SMU's current MCA page uses the same bridge-course wording as MUJ, while the hand-written MCA guide card says "Same rule as MUJ". Applying the correction shows the official wording.

## 4. Not covered

- **The documents post** (`/blog/online-admission-documents-checklist`): its revision is prepared separately; see the [follow-up note](FOLLOW_UPS_REVIEW_2026-10-13.md).
- **Category-specific eligibility for Amity NRI applicants:** still a held case.
