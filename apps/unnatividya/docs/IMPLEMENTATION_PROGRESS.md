# Unnati Vidya implementation progress

Started 30 September 2026; updated through increment 76 on 5 October. This is an **implementation history**, so earlier increment paragraphs describe what was true at that stage, not the current release state. The owner confirms the latest code has **not** been pushed to the VPS. Increment 73 records Wave 0 as deployed, but the present VPS commit has not been independently checked for this update. Use [CURRENT_STATUS_AND_RELEASE_PLAN.md](CURRENT_STATUS_AND_RELEASE_PLAN.md) for current status and [CMS_PUBLISHING_DEPLOYMENT.md](CMS_PUBLISHING_DEPLOYMENT.md) for the next upgrade.

## First increment: contact-first Apply now flow

Implemented:

- Apply now labels on primary lead-entry controls, including header, course cards, sticky actions, guides, articles and tools.
- Name/email/phone and explicit follow-up consent first, even from a course-specific entry. Step 1 immediately saves the enquiry to the website database/admin inbox.
- Step 2 uses a course dropdown and an optional university dropdown. A degree-only preference remains distinct from a university-specific course; it does not silently choose a provider.
- Step 2 and contact edits update the same enquiry. Creation retries use a stable submission key and private edit capability, transactional locking and consent evidence.
- Email OTP comes after preferences. Protected send/verify endpoints, bounded delivery timeout, resend cooldown, failure/retry states and verification reset after email edits. No real OTP was sent during testing.
- Comparison unlock checks a server-validated HttpOnly cookie and current database verification state rather than an editable localStorage flag. Public comparison articles remain public. Verification access expires with the form capability, 24 hours after creation.
- Accessible modal focus containment/restoration and background inertness; narrow-screen form layout and reduced-motion behavior. Course enquiry card no longer places personal contact data into a link URL.
- Content Team, Unnati Vidya byline and Organization author metadata for blog articles; byline on degree guides/editorial comparison pages; a public editorial team page and sitemap entry.
- Removed the expired July/August admissions banner. Existing ratings/testimonials/outcome figures retained under the agreed deferral.
- CRM mapping exposes course preference and preference completion; website admin lead detail shows incomplete preference state.

## Validation

- Website TypeScript check passed.
- Website source ESLint passed.
- 22 localhost database/HTTP checks passed: capture, consent validation, concurrent idempotent retries, protected edits, invalid options, nullable university, synthetic OTP verification and reset after email changes. Disposable fixtures removed; external delivery disabled during tests.
- 24 mocked browser checks passed against the production build across 320/390/1280px for contextual contact-first entry, modal focus, step-1 save, course preselection, optional university, verification and no document-wide overflow. API calls intercepted; no real submissions.
- Website production build passed (`npm run unnatividya:build`).

Repeat API checks: from the repo root, run `node apps/unnatividya/scripts/contact-first-smoke.cjs` with the local website running on port 3100. The script rejects non-local hosts and enabled CRM delivery; it inserts a synthetic OTP instead of sending email. The legacy DB-only OTP smoke does not exercise these HTTP endpoints; use this script for the capability-based flow.

## Database and deployment

Website migrations added: `0004_contact_first_leads.sql`, `0005_catalog_revisions.sql` and `0006_catalog_rollback_proposals.sql` under `apps/unnatividya/migrations/`. All applied to the localhost website database only. The contact-first migration adds nullable submission/edit-capability, consent and preference fields plus a unique submission-key index; existing records are retained.

Apply these migrations to the website database before deploying code that reads the new columns. Use the existing website migration runner with the correct environment; this is separate from CRM migrations. Old in-progress forms must be reopened after deployment because the public write endpoints now require a private form capability. Existing old localStorage unlock flags are intentionally no longer trusted. No new environment secret is required for this increment; existing email-provider/session configuration remains necessary for real OTP delivery.

## External CRM limitation

Owner will configure another CRM endpoint. Local settings currently have sync disabled and no endpoint. This increment saves records in the website admin inbox; it does **not** claim remote CRM delivery or automatic create/update synchronization. Existing sync supports manual queued pushes, not a proven remote upsert contract. Before enabling automatic step-1 delivery, define the target CRM’s stable external ID/update semantics, map nullable course/university and verification state, adjust the configured email-verification gate as intended, and test retries without duplicate CRM records. Do not blindly repeat create requests for later preference changes.

## Source verification started

`source-verification-register.json` inventories all current catalog programs and existing candidate source links. These links are not themselves proof of verification. Initial MUJ/SMU MBA observations are recorded from official program pages; Amity MBA regional/parameterized responses require resolution. No wholesale fee refresh or international-fee publication has occurred in this increment.

Primary pages checked:

- [MUJ online MBA](https://www.onlinemanipal.com/online-mba-manipal-university-jaipur): base tuition/duration and separate international categories observed; discounts require applicable-date/category review.
- [SMU online MBA](https://www.onlinemanipal.com/online-mba-degree-dual-specialization-smu): domestic/international fee sections observed; base fees and promotional amounts must remain distinct.
- [Amity online MBA](https://amityonline.com/master-of-business-administration-online): direct audit fetch and indexed variants differ; do not infer a current fee from a search excerpt alone.

## Second increment: catalog publishing permissions

Implemented on 30 September 2026:

- Course/university create and update APIs reject viewer writes. Editors can create and update only unpublished `DRAFT`/`NEEDS_REVIEW` records; administrators control publication, archival and edits to published records.
- Existing-record restrictions are part of the SQL update condition, so an editor cannot overwrite a record an administrator has already published. Database roles remain authoritative even when an older session claims administrator access.
- Source-import review actions reject viewers; applying imported data to catalog records requires an administrator.
- Catalog forms receive the current server-side role, disable unauthorized edits, limit editor status choices, and explain the restriction. Selecting Published now determines visibility, removing the contradictory status/visibility checkbox combination. Save failures show a retryable connection message.
- TypeScript and targeted ESLint passed. `scripts/catalog-permissions-smoke.cjs` passed 31 local HTTP/database authorization checks using disposable accounts and records, including role downgrade, publication and archival bypass attempts. No external messages sent.

This is a permissions increment, **not completed admin-authoritative publishing**. At this increment, public pages still used the static catalog and deployment sync still overwrote catalog database records; the third increment below removes that overwrite behavior. Separate revisions of published content, preview, publication audit history/rollback, cache invalidation and replacement of the overwrite sync remain required. At that stage editors could work only on unpublished records; the fourth increment below adds separate proposals for published records. The form warning was retained at this stage and updated in the third increment. No additional migration or environment variable is required for this permissions increment.

Repeat the permissions checks with the local website running: `node apps/unnatividya/scripts/catalog-permissions-smoke.cjs`. The script refuses non-local database/HTTP hosts and removes its fixtures.

## Third increment: preserve editorial changes during deployment

Implemented on 30 September 2026:

- Catalog seeding now inserts missing IDs as unpublished drafts. It never overwrites existing fields, republishes archived records, or archives CMS-created records absent from the export.
- Existing timestamps and structured content remain intact. The operation is transactional; slug collisions or invalid references roll back all inserts. A transaction-level advisory lock serializes concurrent seed runs. Invalid exports/duplicate IDs fail before writes.
- CMS form notices and list descriptions explain the current boundary: saved data is preserved, but public pages still use static catalog data. The launch guide and historical plan notices reflect the new command behavior.
- `node apps/unnatividya/scripts/catalog-seed-smoke.cjs` passed 16 regression checks against session-local temporary tables, including repeat runs, editorial edits, archived/published states, CMS-only records, empty exports, duplicate IDs, slug collisions and rollback. Existing catalog rows were not modified by this test.
- No environment changes or migration required for this increment. This is not a deployment; use the newly built image when invoking the seed command. Old images retain the destructive sync behavior.

The public-reader inventory still includes course/university pages, home/discovery, lead dropdowns, comparison, shortlist, recommender, fee tools, editorial helper libraries and sitemaps. These must consume a consistent published snapshot together; switching only detail pages would leave contradictory fees/options elsewhere. Next publishing work: separate reviewed revisions and source validation, public snapshot loading, private preview, administrator publication/rollback, and cache invalidation. No published content snapshot or verified fee refresh is claimed yet.

## Fourth increment: separate proposals and administrator review

Implemented on 30 September 2026:

- New `catalog_revision` table stores the original record snapshot, proposed content, reason, author, review status, reviewer and review note. Proposed changes never mutate the current catalog record.
- Editors and administrators can propose revisions to existing courses/universities, including published records. Viewers cannot submit. Proposals are immutable once submitted; create another proposal to revise one. They enter `NEEDS_REVIEW` immediately; an editable work-in-progress draft stage is not implemented yet.
- Only administrators can apply or reject proposals. Applying changes content while preserving record identity and publication status; this is **not public website publication**. The entity type and writable columns are fixed allowlists, and proposed fields are validated.
- Creation rejects stale base snapshots; applying checks the full original snapshot again under a row lock. Changed/deleted catalog records, previously reviewed revisions and slug/reference conflicts cannot silently overwrite data. Catalog update, review result and actor-attributed audit event commit together.
- `/admin/catalog-revisions` provides the review queue. Course/university edit pages link to a record-specific proposal form, before/proposed field comparison and administrator review actions. Editors see no apply/reject controls. Structured JSON editing is an interim interface; field-specific editorial forms remain pending.
- `scripts/catalog-revisions-smoke.cjs` passed 40 local database/API checks covering both entity types, role denials, isolation, application, rejection, stale submissions, stale application, repeated review and actor audit evidence. A local browser run also exercised editor submission and administrator application, checked role-specific controls and desktop overflow (45 checks including the API suite). Fixtures removed.
- TypeScript, targeted ESLint, whitespace checks and the website production build passed. Migration `0005_catalog_revisions.sql` must run before these routes are deployed. No new environment variable is required.

How to use: **CMS → Courses/Universities → Edit → Propose or review revisions**. Change the JSON content, provide the review reason/source context and submit. Administrators open **Catalog revisions**, expand the before/proposed comparison, enter a review note, then apply to the CMS record or reject. A conflict requires a fresh proposal from the latest record; there is no force-overwrite button.

Remaining publishing requirements include official-source/field validation, friendly field editors, private rendered previews, editable drafts, rollback UI, and public snapshot loading/cache invalidation across all catalog consumers. Legacy direct admin edit and source-import paths still exist; this is not yet a complete revision-only publication system. Existing and proposed data are not automatically treated as verified merely because a CMS review occurred.

## Fifth increment: validated CMS snapshot and private preview

Implemented on 30 September 2026:

- Added a shared, pure CMS-to-catalog converter and reader with the existing course/university lookup interface. It uses explicit public-field allowlists and strips internal notes/import payloads rather than copying arbitrary CMS JSON into client data.
- Only `PUBLISHED` records with `is_published=true` enter a snapshot. Typed validation covers required content, fees, tuple/list shapes, URLs and the current three-university scope. Duplicate identities/slugs, unresolved university references, malformed data or an empty catalog block the whole snapshot. No partial or static-data fallback is silently substituted.
- Added a request-memoized server loader using one read-only, repeatable-read transaction for a consistent database view. It does not mutate a process-global catalog or mix records read before/after an editorial transaction.
- **CMS → Catalog preview** (`/admin/catalog-preview`) reads actual CMS values, shows course fees/eligibility and university summaries, or lists record/field validation issues with review links. It requires CMS login and is marked noindex. It is a data preview, not yet a rendered public-page preview.
- `node --import tsx apps/unnatividya/scripts/catalog-snapshot-smoke.ts` passed 29 pure regression checks. Add `--local-db` for the guarded read-only local readiness check: current result **3 universities, 30 courses, zero structural issues**. A private browser check verified login gating, counts, course rows, noindex and desktop overflow. TypeScript and targeted lint passed.

No database migration or environment change is required for this increment. Source accuracy, regulator evidence, international fees and pending owner claims are not certified by structural validation. Public pages still use the static catalog; they have not yet been switched to this reader. That switch must include all derived tools, metadata, lead-option validation, client components and sitemaps together, with explicit caching/failure behavior. Public publishing remains incomplete until that integration and end-to-end verification are done.

## Sixth increment: public CMS catalog connected

Implemented on 30 September 2026:

- Public course/university pages, homepage/discovery, metadata/schema, comparison tools/articles, fee/specialization guides, shortlist, the existing recommender, EMI course options and lead dropdowns now read the validated published CMS catalog. The lead preferences API validates choices against that same catalog. The scripted recommender is still not Groq-backed.
- Shared helpers take an explicit reader instead of importing mutable/static seed arrays. Each public page owns its client provider; placing it in a shared layout retained stale values during soft navigation, which the browser regression test caught and the page boundary fixes. Metadata, page and boundary share request-memoized database reads.
- Public pages render dynamically. Database reads use a consistent read-only transaction, with no static-catalog fallback. Old response-cache headers were removed from catalog pages/sitemaps. Updates appear on a fresh request without rebuilding. An already-open tab is not pushed an automatic update.
- Catalog writes now run transactionally with a shared advisory lock, validation and rollback. Direct admin saves, revision applications and import application cannot leave the published snapshot malformed. Known payment-plan totals and total-fee highlights must agree with the main fee. Published URL slugs are locked until reviewed redirect support is implemented.
- Published records feed public pages; proposals/drafts/archived records stay private. Applying a proposal preserves its publication state. Admin access and readiness diagnostics remain separate from the public provider so administrators can repair invalid data.
- Sitemaps read the same catalog and use recorded CMS modification timestamps for catalog/derived pages. Unsupported request-time lastmod guesses were removed from static/editorial sitemap entries and the sitemap index.
- Format-only utilities and the client reader were separated from legacy seed data and server validation to avoid sending the seed catalog or validation schemas through the provider's client dependency.
- Added `scripts/check-catalog-ready.js`, a production-compatible read-only command using the exact app validator compiled during `export-catalog`. It exits nonzero with record/field issues. Current local result: **3 universities, 30 courses, ready structurally**.

Validation: 33 snapshot checks, 31 role checks, 40 revision checks, 43 public-reader HTTP/database checks (45 with the optional browser navigation checks), and 22 contact/OTP checks passed. The public-reader fixture proves draft isolation, administrator publication, page/metadata/sitemap visibility, reviewed fee changes without rebuilding, invalid-edit rollback, URL protection and archival. The browser proved a later navigation to the EMI tool receives the new fee. The 24 mocked application-flow checks also passed at 320/390/1280px. Disposable fixtures were removed; no real email/CRM delivery occurred. TypeScript, website source lint and the production build passed. The maintained 45-check public-reader/browser suite also passed against that production build.

No new environment variables or migration beyond `0004`/`0005` are required. **Before deploying this reader change, run the new image's readiness command against the target website database.** Do not switch traffic if it fails; missing CMS fields are no longer silently supplied from the static seed. The deployment procedure is in `CMS_PUBLISHING_DEPLOYMENT.md`.

This cutover does not certify official university facts or pending marketing claims. Public rendering now depends on the website database; a database failure produces an error rather than serving an unvalidated seed fallback. A persistent last-good published snapshot, fine-grained cross-request caching, friendly field editors, rendered draft previews, rollback UI and scheduled publication remain follow-up work. Static editorial narratives, blog copy, media mappings and the owner-deferred salary/marketing text are still maintained separately; only their catalog-derived values were migrated here.

## Seventh increment: reviewed rollback controls

Implemented on 30 September 2026:

- Administrators can open an applied revision and select **Restore earlier content → Prepare rollback proposal**. The proposal captures the current record as its review baseline and restores the editable content from before the selected historical revision.
- Preparing a rollback never changes current/public content. The normal before/proposed comparison, administrator review note and **Apply reviewed revision** action are required. The original applied revision remains in history, and the new proposal links back through `rollback_of`.
- Publication state and record identity are preserved. Restoring an archived record does not republish it. A rollback can replace later content changes, so the UI states this explicitly and shows the full content comparison.
- Only administrators can prepare rollbacks. The endpoint accepts only applied source revisions, checks the target still exists, rejects no-op restores, and reuses an existing pending proposal on retries. A unique partial index prevents multiple pending rollbacks for one source revision. A stale pending proposal must be rejected before preparing a fresh one.
- Applying a rollback uses the existing row locks, current-snapshot conflict checks, public-schema validation and URL protection. Old invalid fees/content cannot bypass the current validation rules. The proposal and application audit events record the administrator and original revision link.
- Added migration `0006_catalog_rollback_proposals.sql` (local database only). Run the standard website migration runner before deploying these controls. No new environment variables.

Validation: the complete 46-check database/API/browser suite passed against the production build, covering permissions, proposal isolation, retry reuse, stale baseline, historical validation, archived-state preservation, missing records, audit links and the actual preparation/review/apply UI. Editors have no restore controls. Test fixtures were removed; no external messages sent. TypeScript, targeted lint, whitespace checks and the production build passed.

Repeat locally with `node apps/unnatividya/scripts/catalog-rollback-smoke.cjs`. Optional browser coverage uses the same `UV_BROWSER_SMOKE`, `UV_PLAYWRIGHT_MODULE` and `UV_CHROMIUM_PATH` settings as the public-reader smoke.

Rollback is available for history captured by applied revisions. It cannot recover edits for which no earlier snapshot exists, and it does not automatically decide whether historical university facts are still accurate. Friendly content editing, editable drafts, rendered previews, source verification and scheduling remain separate work.

## Eighth increment: readable content forms and mobile CMS navigation

Implemented on 30 September 2026:

- Revision proposals now use labelled course/university fields grouped into basic details, fees/admission and official sources. Payment plans and highlights have add/remove rows; specializations, career roles, approvals and sources use one item per line.
- Advanced JSON remains collapsed for curriculum, FAQs and other fields. Unchanged fields are preserved. Invalid JSON gives a recovery message and opens the advanced editor. Optional application fee/deadline fields can be cleared; numeric fees remain numbers and blank list entries are removed on submission.
- Editing eligibility, specializations, career roles or the admission deadline clears that field's earlier verified marker. Source links alone do not certify facts. This is not a replacement for official-source validation; advanced content still requires administrator review.
- Review comparisons show individual readable content fields instead of one large data object. Existing course/university pages make the revision workflow primary and collapse legacy direct editing under **Advanced record settings**.
- The CMS sidebar becomes a collapsible menu on narrow screens. Navigation, account text, editor rows and review values wrap within the viewport. Choosing a navigation link closes the mobile menu.

Validation: the maintained browser/database editor suite passed 29 checks covering both entity types, proposal isolation, preserved hidden fields, readable differences, verification markers, numeric/optional fields, JSON recovery and 320/390px menus with no horizontal overflow. Fixtures were removed. TypeScript, targeted ESLint and the production build passed. The same 29 editor checks also passed against the production build.

Use **CMS → Courses/Universities → Edit → Propose or review revisions**, fill the labelled fields and provide a review reason. Administrators still review and apply separately. No new migration or environment variable is needed for this increment. New-record forms, rendered draft previews and editable draft storage remain follow-up work.

## Ninth increment: official course source and fee evidence

Reviewed on 30 September 2026:

- Retrieved dedicated official program pages for all 30 current courses; added exact program URLs to the verification register while preserving historical candidate links.
- Compared full-program base INR amounts with the local CMS: 29 agree. Amity MAJMC differs (CMS INR 130,000; official INR response INR 190,000). A document-only correction proposal records the required fee-plan/highlight/EMI review; no CMS revision was submitted or applied.
- Recorded duration and base fee evidence with source URL, check date and fetched-text hash. MUJ NRI/foreign and SMU combined international amounts were mapped using fee-tab identifiers, excluding commented-out tabs and promotional discounts.
- Amity direct requests returned INR, while web-tool requests returned USD variants or fetch errors for some identical URLs. International category applicability, intake terms and rounded instalment discrepancies remain unresolved. Its M.Com record also needs a specialization-scope review.
- Current-session UGC-DEB program matching remains pending; mixed-year search results and historical PDFs were not promoted to current verification.

Artifacts: `OFFICIAL_COURSE_REVIEW_2026-09-30.md`, `COURSE_FEE_EVIDENCE_2026-09-30.json`, `CATALOG_CORRECTION_PROPOSALS_2026-09-30.json`, and the updated source register. Coverage and arithmetic validation checked all 30 unique course IDs and the one recorded mismatch. No app/runtime, database or environment changes; no deployment or external messages.

This completes a source/fee evidence pass, not full official content verification. Eligibility, curriculum, electives, FAQs, international terms and session-specific recognition still need review before publishing corrected or newly verified facts.

## Tenth increment: eligibility evidence and honest curriculum presentation

Reviewed and implemented on 30 September 2026:

- Recorded eligibility observations for all 30 courses: 18 from MUJ/SMU eligibility sections, 12 provisional observations from Amity's structured metadata where visible eligibility panels were empty.
- Identified missing diploma routes, M.Com discipline restrictions, MCA bridge/marks details and other course-specific review actions. No eligibility value or verified marker was automatically changed.
- All 12 undergraduate official pages list six semester headings, while the CMS contains four curriculum groups. None of the 30 CMS curricula has a verified marker. Subject-level verification remains pending even when postgraduate term counts match.
- Course pages now display unverified curricula as **Illustrative study areas**, with a clear provisional explanation and group labels. Reviewed curricula retain actual term labels. Removed the unsupported blanket semesters 3–4 label from elective cards.
- CMS content quality flags unverified eligibility/curriculum and checks `careerRoles` rather than the unused `careers` field.
- Direct retrieval of the UGC directory succeeded. Located 27 historical 2025–26 candidate program matches; current-session and awarding-institution confirmation remains pending. MUJ MSc Mathematics and two Amity programs require additional evidence; Rajasthan entries must not be assigned to the Uttar Pradesh institution without confirmation.

Evidence: `COURSE_CONTENT_REVIEW_2026-09-30.md`, `COURSE_CONTENT_EVIDENCE_2026-09-30.json` and updated source register. TypeScript, targeted lint, production build and whitespace checks passed. All 30 production course pages showed the provisional curriculum correctly; browser accordion/overflow checks passed at 320/390/1280px. Evidence validation confirmed 30 unique IDs and 12 undergraduate coverage gaps.

No database, migration or environment changes, no real submissions and no deployment. Official semester subjects, current-session recognition, Amity international terms and the earlier MAJMC fee correction still require editorial completion.

## Eleventh increment: curriculum revision form

Implemented on 30 September 2026:

- Added labelled curriculum fields to course revision proposals: semester/term name, one subject per line, add/remove and move-up/down controls. This allows six-semester undergraduate outlines without editing JSON.
- Editing through these controls clears the earlier curriculum verification marker. Blank subject lines are normalized on submission; other term metadata and unrelated content remain intact.
- Unsupported structured curriculum values produce a recovery message instead of silently overwriting them. Advanced JSON remains available for repair and other fields.
- Review comparisons show terms and subjects as readable lists, including additional term metadata. Submission stays private and still requires administrator review/application.

Validation: 43 labelled-editor browser/database checks passed against the production build, including six-term entry, reordering, removal, malformed-data recovery, preserved metadata, verification reset, private proposals and 320/390px overflow checks. Fixtures were removed. TypeScript, targeted ESLint, production build and whitespace checks passed.

This is the editorial interface needed for official syllabus replacement; no real course syllabus was rewritten or automatically verified in this increment. Source verification and subject-level replacement remain pending. No migration or environment changes.

## Twelfth increment: prepared undergraduate semester overviews

Implemented on 30 September 2026:

- Prepared ten six-semester topic summaries from the official undergraduate curriculum sections: MUJ BBA/BCA/B.Com; SMU BBA/B.Com; Amity BBA/BCA/B.Com/B.Com Honours/BAJMC. These are paraphrased overviews, not exhaustive syllabi or exact subject-title lists.
- Matching course revision forms now provide source/date context, a prepared-outline preview and **Load prepared outline**. Only the matching draft is passed to the private client editor; public catalog readers do not import prepared data.
- Loading replaces the outline only in the unsaved proposal, retains fees/other edits, adds its official source and review context, and sets curriculum verification to generic. No automatic revision submission, database update or publication occurs.
- Elective choices remain choices. Amity BCA provisional mini-project wording and Amity B.Com Honours awarding-body/route checks are explicitly flagged. The two BA programs remain pending because their subject combinations must not be flattened into compulsory subjects.

Validation: TypeScript, targeted lint, production build and whitespace checks passed. All 56 editor browser/database checks passed against production, including preview, six-term loading, preservation of unsaved name/fees, verification reset, source context, no POST on loading, unchanged real course snapshot and narrow-screen overflow. Existing disposable proposal fixtures were removed. Data checks validated ten unique official-source drafts with six ordered, nonempty terms each.

Usage and boundaries: `PREPARED_CURRICULUM_DRAFTS.md`. No migration or environment change, no real curriculum publication and no deployment. Two BA outlines, 18 postgraduate outlines, full subject-level verification and the previous fee/recognition issues remain pending.

## Thirteenth increment: postgraduate semester overviews

Implemented on 30 September 2026:

- Added prepared four-semester topic summaries for all 18 postgraduate records, bringing CMS draft coverage to 28 courses (10 undergraduate and 18 postgraduate).
- Summaries preserve elective choices, dual-specialization arrangements, projects, dissertations and internships without presenting all elective tracks as compulsory. They remain paraphrased overviews, not exhaustive subject lists.
- Added review notes for qualification-dependent MCA foundation/bridge content, Amity MCA source annotations, Amity M.Com Financial Management scope and unresolved recognition/awarding-body checks.
- CMS loading feedback now reports the actual number of terms instead of always saying six. Loading stays local to an unsaved proposal and does not mark the outline verified.
- Updated the prepared-draft guide and source register. The two BA outlines remain pending subject-combination modelling. Full subject-level and admission-session confirmation remain pending for every prepared overview.

Validation: all 28 drafts have unique course IDs, official-domain sources and ordered nonempty terms (10 with six terms; 18 with four). TypeScript, targeted lint, production build and whitespace checks passed. All 62 editor browser/database checks passed against production, including four-term postgraduate loading, accurate feedback, elective wording, fee preservation and unchanged real course snapshots. Disposable fixtures were removed.

No migrations, environment changes, real course publication or deployment. See `PREPARED_CURRICULUM_DRAFTS.md` for course coverage and review instructions.

## Fourteenth increment: BA subject-combination overviews

Implemented on 30 September 2026:

- Added prepared six-semester summaries for SMU BA and Amity BA. All 30 catalog courses now have prepared editorial overviews (12 undergraduate and 18 postgraduate).
- SMU BA distinguishes shared introductory themes from English, Sociology and Political Science combinations. Amity BA labels English, Economics, Political Science and Sociology alternatives within each semester.
- Scope and review notes explicitly state that alternatives are not a combined compulsory syllabus, do not select a learner’s route and require confirmation of current combination rules.
- Prepared-outline previews now render each topic/route on a separate list line instead of joining them into one paragraph. Loading retains the existing unsaved-proposal-only workflow and generic verification marker.
- Updated source register and coverage/deployment guides. Data validation confirmed all 30 IDs, correct term counts and preserved BA alternative labels. TypeScript, targeted lint, production build and whitespace checks passed.

Validation: all 78 editor browser/database checks passed against production, including both BA previews, route-labelled loading, six-term coverage, review context, generic verification, unchanged real records and narrow-screen overflow. Disposable fixtures were removed.

Prepared overviews are not complete verified syllabi. Subject-level/current-session verification, recognition, international fee terms and the earlier fee/eligibility corrections remain outstanding. No migration, environment change or deployment.

## Fifteenth increment: coordinated MAJMC fee correction

Implemented on 30 September 2026:

- Rechecked Amity MAJMC's direct INR response: INR 190,000 base and INR 47,500 semester payments. The web-tool response still shows USD variants, so domestic category/intake and international terms remain review items.
- Added a matching-course prepared fee correction in the CMS form. It updates the proposed tuition, semester plan and total-fee highlight together, removes the unsupported 2% plan, old numeric EMI/highlight and legacy scholarship rows, and records source/review context.
- Loading changes only the unsaved proposal and preserves other fields. It requires the recorded INR 130,000 proposed-fee baseline; changed values require manual review. Normal administrator review/application remains required.
- Public fee-plan column now says **Payment terms**, and financing labels no longer promise that every value is a monthly no-cost quote. Removed blanket no-cost/20% scholarship wording from course pages in favour of current provider terms and eligibility.

Validation: all 92 editor browser/database checks passed against the production build, including the fee-baseline guard, coordinated values, removal of stale rows, preserved curriculum, unchanged real record, narrow-screen layout and full proposed-catalog validation. Public HTTP checks confirmed payment labels and removal of blanket claims. TypeScript, targeted lint, build and whitespace checks passed; disposable fixtures were removed.

No actual MAJMC fee change has been published. Eligibility correction proposals remain the next content task. No migration or environment change; no deployment.

## Sixteenth increment: category-specific eligibility corrections

Implemented on 30 September 2026:

- Prepared 17 MUJ/SMU eligibility corrections with distinct Indian and NRI/foreign applicant paragraphs, based on the recorded official eligibility sections.
- Preserved undergraduate diploma routes, MBA route/marks differences, separate MCA computing/mathematics bridge conditions and international equivalence checks. M.Com drafts remove unsupported commerce-only restrictions subject to admissions review.
- Added matching-course previews and **Load eligibility correction** controls. Loading changes only the unsaved eligibility text/source context, preserves other edits and resets eligibility verification to generic. Submission and administrator application remain separate.
- Kept all 12 Amity courses and MUJ MSc Mathematics out of the prepared loader pending stronger admissions evidence or wording clarification. Manual proposals remain possible; no certainty is inferred from incomplete evidence.
- Updated the source register, deployment instructions and `PREPARED_ELIGIBILITY_CORRECTIONS.md`. Data checks validated all 17 IDs and course-specific category distinctions. TypeScript, targeted lint, production build and whitespace checks passed.

Validation: all 128 editor browser/database checks passed against production. Coverage includes category previews, undergraduate/MCA/M.Com loading, international marks distinctions, preserved fees/curriculum/unsaved edits, verification reset, held-back records without loaders, narrow-screen layout and unchanged real course snapshots. Disposable fixtures were removed.

No real eligibility update was submitted or applied, no external messages sent, and no migration/environment change or deployment. Current-session verification and the thirteen held-back records remain pending.

## Seventeenth increment: rendered Amity eligibility evidence

Implemented on 30 September 2026:

- Checked all twelve Amity program pages in a read-only browser. Their eligibility text is populated after JavaScript runs, explaining missing content in the earlier static-HTML checks.
- Added eleven prepared eligibility corrections, bringing coverage to 28/30 courses. Kept applicant categories separate, retained the 55% B.Com Honours threshold, MBA/MAJMC test conditions, English-medium rules and the M.Com foreign experience condition with review notes.
- Recorded paraphrased evidence, official URLs and rendered-text hashes in `AMITY_RENDERED_ELIGIBILITY_REVIEW_2026-09-30.json`; updated the source register and review/deployment guidance.
- Kept Amity BA pending its foreign-applicant evidence. Recorded the MUJ MSc Mathematics project-report/course-page discrepancy; it remains without a prepared correction.
- Expanded the maintained browser suite to cover Amity MBA, MAJMC, B.Com Honours and M.Com, including preserved published snapshots and other unsaved edits.

Validation: production build, TypeScript, smoke-script syntax, evidence/coverage consistency and whitespace checks passed. All 172 maintained editor browser/data checks passed against production, including the new Amity loaders, two held-back records, narrow-screen overflow and unchanged real course snapshots. Disposable fixtures were removed. No real eligibility proposal has been submitted or applied, no external forms submitted, and no migration or environment change is required.

## Eighteenth increment: applicant categories and visible evidence gaps

Implemented on 30 September 2026:

- Corrected Amity eligibility previews and loaders to label the university’s foreign-applicant requirements separately. Added an explicit NRI category-confirmation paragraph instead of assigning foreign criteria to all NRIs. MUJ/SMU combined category wording is retained.
- Added course-specific evidence notices for Amity BA and MUJ MSc Mathematics, including official sources and the clarification needed. Notices appear on the revision page for readers as well as editors. They are advisory, leave manual evidence-backed proposals available and do not imply that a conflict is resolved.
- Public eligibility text preserves paragraph breaks and wraps long text, so category-specific copy remains readable after administrator publication.
- Updated the maintained browser regression suite for category labels, NRI notes, evidence links and narrow-screen layout.

Validation completed on 1 October 2026: production build, TypeScript, targeted lint, data consistency, script syntax and whitespace checks passed. All 190 maintained editor browser/data checks passed; disposable fixtures were removed. A separate read-only browser check confirmed public eligibility paragraph formatting at 390px. The initial attempt at that additional check was blocked by an automatic-review usage limit; the authorized retry completed successfully. No real course record or saved proposal changed; no migration or environment change.

## Nineteenth increment: labelled draft creation

Implemented on 1 October 2026:

- Replaced the new course/university JSON-first forms with the shared labelled content editor. Staff can enter eligibility, term outlines, fees, sources and university descriptions directly; advanced JSON remains available for other fields.
- Creation forms always request a private draft and navigate to its saved record. URL slug becomes the record ID; university selection is explicit, degree level is selectable, and UGC approval starts unchecked.
- Incomplete draft details are allowed. Name/short name and course stream remain required; blank tuition remains null rather than zero. Publication validation and existing server-side permissions are unchanged.
- Database failures loading universities now surface instead of being silently presented as an empty list. A genuinely empty university list explains the next step and disables course creation.
- Extended the maintained browser suite to create disposable course/university drafts through the forms, check stored fields/defaults and private status, verify mobile layout and viewer restrictions, and clean up creation audit records.

Validation: production build, TypeScript, targeted lint, smoke-script syntax and whitespace checks passed. All 214 maintained browser/data checks passed, including creation of both record types, private status, null tuition, unchecked approval, source normalization, viewer restrictions and narrow-screen layout. Disposable records and audit entries were removed. No real catalog records created or published; no migration or environment change.

## Twentieth increment: private editable working drafts

Implemented on 1 October 2026:

- Added migration `0007_catalog_working_drafts.sql`, applied locally only. Working drafts live separately from immutable submitted revisions and public catalog records.
- Editors/administrators can explicitly save incomplete content and review reasons, then resume their own draft on the record’s revision page. Each user has one draft per record; viewers cannot save or read another user’s private draft through this workflow.
- Version checks prevent stale-tab overwrites. Submission validates full revision fields and the original catalog snapshot, then creates a review proposal and removes the working draft atomically. Existing administrator application is unchanged.
- Catalog conflicts keep the saved draft available. The UI exposes the current page snapshot for comparison and a version-checked explicit discard control; there is no automatic rebase or publication.
- Added browser/API coverage for incomplete save/reload, permissions, separate user drafts, version conflicts, stale catalog submission, continued saving, atomic submission and unchanged catalog content.

Validation: production build, TypeScript, targeted lint, script syntax and whitespace checks passed. All 233 maintained browser/API/data checks passed, including incomplete draft save/reload, viewer denial, per-user isolation, version conflicts, stale catalog protection, continued private saving, atomic submission, discard and unchanged catalog snapshots. Disposable draft/revision/catalog fixtures and audit records were removed. No real catalog content changed. VPS requires migration 0007 before restart; no environment change.

## Twenty-first increment: public course discovery filters

Implemented on 1 October 2026:

- Course search, level, stream, university, tuition ceiling and sorting now read from the URL. Filter/sort choices create browser history entries; typing and fee-slider movement replace the current entry to avoid one history item per keystroke. Unrelated query parameters are retained; reset clears only discovery parameters.
- University/stream options and fee ceiling come from the published catalog. Repeated/comma-separated multi-select values and existing short-name university links are supported; invalid filter values are ignored and fee values are bounded.
- Added removable active-filter chips, live result counts, accessible control labels and an actionable empty state. Removed the unsupported July 2026 fee-verification statement. Search analytics no longer send the learner’s raw search text.
- Replaced the mobile filter overlay with an inline expandable section, including Escape/close focus return and narrow-screen wrapping. Collapsed quick comparison shortcuts and shortened helper text to bring courses higher on small screens. Existing course actions and retained legacy ratings remain available.
- Added `scripts/course-discovery-smoke.cjs`, a read-only suite for history/reload, shared URLs, malformed parameters, zero results, keyboard controls and responsive layouts.

Validation: production build, TypeScript, targeted lint, script syntax and whitespace checks passed. All 48 read-only discovery browser checks passed: filter history/reload, multiple universities, compatibility links, invalid/repeated parameters, empty results/reset, accessible controls, Escape/close focus return, comparison disclosure and overflow at 320/390/768/1280px. Mobile screenshots were visually reviewed. No browser exceptions or catalog mutations; no migration or environment change.

## Twenty-second increment: public navigation and resource clarity

Implemented on 1 October 2026:

- Grouped the public header into Courses, Universities, Compare, Resources and Tools. Resources distinguishes degree guides, articles and the verification policy; Tools exposes course matching and the EMI calculator. Saved courses remains a utility link and Apply now remains the lead CTA.
- Added accessible disclosure buttons, active-page indicators, Escape/focus return, outside-click closing, route-reset behavior and responsive breakpoint resets. Mobile menus have a bounded scroll region, and hidden links are excluded from focus/navigation.
- Renamed the blog index to Online learning articles with distinct metadata, the agreed Content Team attribution and a link to degree guides. Existing article and guide URLs remain unchanged.
- Replaced the misleading article-index Subscribe/email box (which opened lead capture) with Browse courses and Apply now. No newsletter service was added.
- Added `scripts/public-navigation-smoke.cjs` for desktop/mobile grouping, keyboard behavior, route/resize cleanup, link destinations and article-page semantics.

Validation: production build, TypeScript, targeted lint, script syntax and whitespace checks passed. All 39 navigation checks and all 48 discovery regression checks passed against production, covering 320/390/768/1100/1280/1440px across the suites, keyboard focus, grouped links, route/resize resets and no browser exceptions. The mobile menu screenshot was visually reviewed. No data migration, environment change or real form submission.

## Twenty-third increment: homepage discovery introduction

Implemented on 1 October 2026:

- Shortened the homepage headline/introduction, clarified the three-university scope, removed unsupported repeat-verification/learner-count claims from the introduction and used published catalog counts.
- Degree shortcuts now lead to cross-university course searches instead of selecting MUJ automatically. The GET search has a visible focus state and a bounded search field.
- Reduced mobile hero spacing/image height and moved floating image facts into regular cards. Retained existing salary figures, ratings and testimonials under the owner’s deferral; this phase does not verify them.
- Reworded the homepage recommender promotion as preference-based course matching, without promising eligibility/schedule verification or a live Groq integration. Broader recommender changes remain pending.
- Mobile quick actions now offer Browse courses and Apply now. Existing images are reused; no new asset is required.
- Added `scripts/homepage-discovery-smoke.cjs` for first-screen search visibility, overflow, shortcut/search routing and mobile actions across 320/390/768/1280/1440px.

Validation: production build, TypeScript, targeted lint, script syntax and whitespace checks passed. All 34 homepage discovery checks passed at 320/390/768/1280/1440px: visible first-screen search, no document-wide overflow, cross-university shortcuts, GET search and mobile actions. The mobile screenshot was visually reviewed. At 390×844, introduction height fell from approximately 1,285px to 793px (38%); search bottom moved from 614px to 407px. These are local layout measurements, not performance benchmarks. No catalog mutation, lead/OTP submission, migration or environment change.

## Twenty-fourth increment: detail-page navigation and payment readability

Implemented on 1 October 2026:

- Replaced the course fee section’s horizontally scrolling three-column layout with responsive payment cards. Each plan retains its existing amount and payment terms with visible labels; no fee facts were changed.
- Added a mobile Jump to section picker to the shared course/university section navigation. Desktop pill links remain available, expose their current location, and have visible keyboard focus. Picker navigation updates the fragment and focuses the destination section.
- Aligned the sticky section navigation with the 68px header and increased mobile anchor spacing so headings remain visible after navigation. Visual review caught a fixed-offset active-label mismatch; tracking now includes the responsive navigation height.
- Replaced the unsupported blanket specialisation timing/fee statement with admission-session confirmation guidance. Existing curriculum verification labels and source-review boundaries are unchanged.
- Added `scripts/course-detail-ui-smoke.cjs` for representative PG/UG pages, payment labels, destination focus/visibility, curriculum disclosure, desktop/mobile layout and the shared university picker.

Validation: production build, TypeScript, targeted lint and all 50 read-only detail-page browser checks passed. Coverage includes representative PG/UG courses from all three universities, payment labels, mobile fragment navigation and destination focus, active section labels, curriculum disclosure, shared university navigation and overflow at 320/390/768/1280px. The final mobile screenshot was visually reviewed. No catalog mutation, migration or environment change.

## Twenty-fifth increment: supplied illustrations and accessible enquiry dialog

Implemented on 1 October 2026:

- Integrated all seven supplied WebP illustrations: four homepage stream cards, empty shortlist, no course matches and verified enquiry confirmation. Intrinsic dimensions and responsive sizes reserve layout space; decorative images have empty alternative text and use Next image optimization/lazy loading.
- Verified supplied dimensions: stream images 1200 × 800, state images 800 × 600. Existing files are reused without image editing. Removed completed generation requests from the asset requirements document.
- Added responsive empty-state spacing, visible stream-card keyboard focus and reduced-motion handling.
- Moved the enquiry dialog to a body portal so background inertness applies consistently. Explicitly retain the clicked opener for focus restoration, describe the dialog, provide a 44px close button and make the form body flex/scroll beneath its heading using dynamic viewport height.
- Added a local browser suite covering image decoding, responsive bounds, keyboard trapping/restoration, background inertness and the confirmation flow. Lead/OTP calls are mocked; no external delivery is attempted.

Validation: production build, TypeScript, targeted lint, script syntax and scoped whitespace checks passed. All 61 illustration/dialog checks passed at 320 × 568, 390 × 844, 844 × 390 and 1280 × 800, including image decoding, dialog bounds, keyboard trapping/restoration, background inertness and mocked confirmation. All 34 homepage and 48 course-discovery regression checks also passed (143 total). The mobile stream-card screenshot was visually reviewed. No real lead/OTP submissions, catalog mutations, migration or environment change.

## Twenty-sixth increment: university discovery readability

Implemented on 1 October 2026:

- Reorganized university cards around semantic headings, published course counts, listed total tuition and degree levels. Starting tuition is derived from published course records rather than the separate annual-fee label; this does not verify or change stored fees.
- Added direct university-filtered Browse courses actions, retained Apply now and university detail links, and placed existing ratings/placement figures in a keyboard-operable disclosure. Their verification remains deferred under the owner's earlier instruction.
- Removed the unsupported cycle-verification badge/introductory claim and replaced the premature AI promotion with preference-based course matching. Added a link to the verification policy and current-session/applicant-category fee guidance.
- Replaced the crowded three-column card layout with responsive two/one-column layouts, wrapping facts and 44px actions. Scoped styles preserve other page layouts.
- Added a read-only browser suite for all three universities, narrow/intermediate/wide widths, keyboard disclosure and course-link count consistency.

Validation: production build, TypeScript, targeted lint, script syntax and scoped whitespace checks passed. All 50 read-only university-discovery browser checks passed at 320/390/768/900/1024/1280px, covering headings, disclosure keyboard operation, card/document overflow, 44px actions and all three university-filtered course links/counts. The mobile screenshot was visually reviewed. No catalog mutation, lead/OTP submission, migration or environment change.

## Twenty-seventh increment: interactive comparison usability

Implemented on 1 October 2026:

- Replaced three large empty slots and filter-chip clusters with a compact selection area, one add control, labelled search/filter fields, live counts and a reset action. Remove actions identify both course and university and use 44px targets.
- Added search focus on open/add, Escape/close focus return and selection-heading focus after removal/full selection. Options come from the published catalog.
- Selection is read from the URL, deduplicated, limited to three valid published course IDs and updated through native history. Repeated `add` parameters are supported; unrelated query parameters persist. Explicit empty selections stay empty after reload.
- Replaced the visual comparison grid with a captioned table and labelled mobile row groups. All underlying comparison values remain; comparative best-value highlighting is omitted. Quick-start labels no longer imply weekly popularity evidence.
- Retained the existing email-verification access check and Apply now capture. At least two courses are required before showing the gate/table. The locked card now uses normal layout flow; removed the unsupported promise of a counsellor call from the unlocked status.
- Added read-only browser coverage for malformed/repeated selections, filters, focus, history/reload, locked/unlocked rendering and responsive layout. Access responses are mocked for UI checks; lead and OTP requests are blocked.

Validation: production build, TypeScript, targeted lint, script syntax and scoped whitespace checks passed. All 47 comparison UI checks passed across 320/390/768/1024/1280px, covering repeated/invalid URLs, deduplication, selection limit, filter labels/reset, focus, browser history/reload, persistent empty selections and locked/unlocked presentation. The first browser pass identified ambiguous nested select labels; explicit label/control associations fixed them before the successful run. The mobile screenshot was visually reviewed. Access responses were mocked for UI testing; no lead/OTP submissions or catalog mutations. No migration or environment change.

## Twenty-eighth increment: shortlist selection and recovery

Implemented on 1 October 2026:

- Replaced misleading Compare all (which silently exceeded the comparison's three-course limit) with explicit checkbox selection of two or three saved programs. A fourth selection is disabled until one is deselected; the comparison link contains only chosen IDs.
- Reorganized saved-course cards into labelled tuition/duration/EMI facts, semantic headings, larger controls and wrapping actions. Existing rating and university placement figures remain in expandable details; verification is still deferred.
- Added focus restoration after removal and an explicit undo action, including removal of the final saved course. Undo uses an idempotent save operation rather than toggling an item that another tab may already have restored.
- Validate local-storage values as a deduplicated string array, ignore malformed shapes and show a loading state before initial browser storage is read. Existing same-tab and cross-tab synchronization remains.
- Added browser coverage for comparison limits/navigation, malformed storage, removal/undo, reload persistence, cross-tab events and responsive card bounds. Fixtures are confined to disposable browser storage.

Validation: production build, TypeScript, targeted lint, script syntax and scoped whitespace checks passed. All 39 shortlist UI/storage checks passed, including malformed JSON/shapes, comparison limits, removal/undo/focus, final-item recovery, reload persistence, real cross-tab storage events, comparison navigation and responsive bounds at 320/390/768/1024/1280px. The mobile screenshot was visually reviewed. Fixtures were confined to a disposable browser context; no catalog mutation or lead/OTP submission. No database migration or environment change.

## Twenty-ninth increment: EMI inputs and payment totals

Implemented on 2 October 2026:

- Replaced fixed-step sliders with labelled exact-value numeric inputs for fee, down payment, repayment months and annual interest. Invalid/blank/non-finite values and a down payment above the fee suppress results with associated field guidance.
- Separated upfront payment, loan principal, interest, loan repayments and overall payment including the down payment. Use a numerically stable reducing-balance formula, with explicit zero-interest/zero-principal handling and whole-rupee display rounding.
- Course selection fills listed tuition without inferring loan tenure from course duration; manual fee edits clear the course selection. Removed unsupported cheapest-EMI ranking and lender/approval promises; 0% is described as a scenario rather than an available offer.
- Updated visible FAQs and matching FAQ structured data, metadata and introduction to describe the current controls and estimate limits. Apply now and selected-course navigation remain.
- Added responsive input/results panels, field associations, visible focus and a live estimate. Local development preview remains on port 3001.

Validation: production build, TypeScript, targeted lint, script syntax and scoped whitespace checks passed. All 37 calculation/UI browser checks passed against local port 3001, including known zero/nonzero-interest examples, full upfront payment, invalid inputs, course/manual transitions, small positive interest and bounds at 320/390/768/1024/1280px. The mobile result screenshot was visually reviewed. No catalog mutations, lead/OTP submissions, migration or environment change.

## Thirtieth increment: transparent course matching

Implemented on 2 October 2026:

- Replaced the scripted five-question/scoring/chat demo with three relevant preference questions: degree level, subject and maximum total tuition. Published courses must meet all selected filters; results show up to three in ascending listed tuition order, with no match percentages or quality ranking.
- Removed unsupported eligibility/schedule-checking, loan and placement claims from generated matching explanations and scripted replies. Existing underlying catalog ratings/placement data elsewhere remain unchanged; no Groq integration is claimed.
- Added native radio groups, explicit Continue/Back controls, focus transitions, editable answer summaries, restart and an honest empty state. Results remain free; Apply now is retained for separate lead capture and comparison gating is unchanged.
- Added filtered catalog navigation and comparison links only when at least two results exist. Metadata and visible/structured FAQ content now explain deterministic matching rather than AI advice. Answers are not sent to an AI provider; existing usage analytics remain.

Validation: production build, TypeScript, targeted lint, script syntax and scoped whitespace checks passed. All 28 matching browser checks passed against local port 3001, including strict filtering, no results, ordered tuition, back/edit/restart state, focus, filtered catalog links and responsive bounds at 320/390/768/1280px. The mobile screenshot was visually reviewed. No AI requests, catalog mutation or lead/OTP submission. No migration or environment change.

## Thirty-first increment: specialization discovery

Implemented on 2 October 2026:

- Added labelled search, subject and degree filters, a live result count and a reset action. Search supports specialization, degree and university names; filter choices come from the published catalog.
- Persist search and filters in the URL with native history, preserving unrelated parameters. Search typing replaces the current entry; filter changes create entries. Invalid filter values are ignored and repeated search values use the first value.
- Reorganized cards into semantic headings and responsive grids. Starting tuition is explicitly calculated across the listed course options and labelled as base-degree tuition. All subjects present in the catalog can appear, rather than relying on a fixed subject ordering.
- Removed blanket source-verification/elective-availability claims from the index and added confirmation guidance for availability, selection timing and extra fees. Underlying catalog facts and detail pages were not rewritten in this increment.

Validation: production build, TypeScript, targeted lint, script syntax and scoped whitespace checks passed. All 33 specialization browser checks passed against local port 3001, covering combined filters, empty/reset states, preserved query parameters, reload/history, invalid/repeated parameters, detail navigation and responsive bounds at 320/390/768/1024/1280px. The mobile screenshot was visually reviewed. No catalog mutation or lead/OTP submission. No migration or environment change.

## Thirty-second increment: article discovery

Implemented on 2 October 2026:

- Added labelled article search, topic filtering, newest/title sorting, live result counts and reset/empty-state recovery. Categories derive from available posts.
- Store discovery controls in the URL with native browser history, preserving unrelated parameters and tolerating invalid categories/sort values. Typing replaces the current entry; category/sort changes add entries.
- Reworked article cards into responsive grids with linked semantic headings, descriptive read-link names, decorative cover alternative text, publication dates and the required Content Team, Unnati Vidya byline. Dates come from stored publication metadata; article bodies were not verified or rewritten in this increment.
- Added visible focus, 44px controls and a cross-link to degree guides from empty results. Existing article URLs and lead actions remain unchanged.

Validation: production build, TypeScript, targeted lint, script syntax, whitespace and all 31 read-only article browser checks passed on local port 3001: combined search/category filters, sorting, reset, metadata, reload/history, invalid/repeated parameters, image loading, article navigation and bounds at 320/390/768/1024/1280px. The mobile screenshot was visually reviewed. No catalog mutation or lead/OTP submission. No migration or environment change.

## Thirty-third increment: university gallery removal and guide navigation

Implemented on 2 October 2026:

- Removed Campus & learner moments from the shared university detail template, including its fallback external images and unused availability lookup, as requested. Other university sections and media assets remain.
- Rebuilt the degree-guide index around labelled search, topic/degree filters, live counts and reset/empty states. Group fee, admission, career and recognition guides under semantic headings with clear card titles.
- Persist filters in native browser history and shared URLs while preserving unrelated parameters. Invalid selections are ignored; search typing replaces the current entry.
- Retained existing guide URLs and matching ItemList/breadcrumb structured data. Removed unsupported most-read and blanket verified/exact-fee claims from the index; added the agreed author attribution and current-session confirmation guidance. Guide article bodies remain outside this increment's source verification scope.

Validation: production build, TypeScript, targeted lint, script syntax and scoped whitespace checks passed. All 43 guide/university browser checks passed on local port 3001: removal on all three universities, retained admission sections, combined filters, reset, URL/history/reload, invalid/repeated parameters, sample detail routes for each topic and responsive bounds at 320/390/768/1024/1280px. The first test used MBA instead of the actual Online MBA label; the corrected test passed. The mobile screenshot was visually reviewed. No catalog mutation or lead/OTP submission. No migration or environment change.

## Thirty-fourth increment: article reading navigation

Implemented on 2 October 2026:

- Added a native contents disclosure generated from article headings, fragment links with focusable destinations and spacing below the fixed header, plus a return-to-start link.
- Added the existing excerpt as an introduction, responsive title sizing and a smaller mobile cover. The related-content rail uses normal document flow rather than a potentially over-tall sticky area; related articles prioritize the same category.
- Corrected the visible date label to Published and used semantic dates with an explicit time zone. Existing Content Team attribution remains. Reworded the enquiry invitation to remove an unsupported program-verification promise; article bodies and source claims were not reverified in this UI phase.
- Fixed global smooth scrolling to respect the reduced-motion preference after the browser check exposed it during anchor navigation.

Validation: production build, TypeScript, targeted lint, script syntax, scoped whitespace and all 41 read-only article checks passed on local port 3001, covering three article categories, contents keyboard behavior, destination focus/visibility, return navigation, FAQ disclosure and bounds at 320/390/768/1024/1280px. The mobile screenshot was visually reviewed. No catalog mutation or lead/OTP submission. No migration or environment change.

## Thirty-fifth increment: degree-guide detail readability

Implemented on 2 October 2026:

- Added guide section navigation across fee, eligibility, career and recognition pages, with focusable destinations and clearance below the fixed header. Long sidebars now follow document flow.
- Replaced cramped fee and scholarship grids with responsive cards labelled for tuition, EMI, duration, discount and proof requirements. Stored fee/scholarship facts remain unchanged.
- Fixed the fee-guide comparison link to select up to three listed courses instead of only one. Wrapped approval badges and long sources on narrow screens.
- Removed the hardcoded July fee-review statement and broad entitlement claim from the fee summary in favour of current-session confirmation guidance. Other guide source assertions and content still require the planned official-source verification; this UI phase does not certify them.

Validation: production build, TypeScript, targeted lint, script syntax, scoped whitespace and all 76 read-only guide-detail browser checks passed on local port 3001. Coverage includes all four guide types, anchor focus/visibility, responsive bounds at 320/390/768/1280px, fee labels, three-course comparison routing and a single-university scholarship guide. The mobile fee-card screenshot was visually reviewed. No catalog mutation or lead/OTP submission. No migration or environment change.

## Thirty-sixth increment: specialization detail readability

Implemented on 2 October 2026:

- Reused the labelled responsive fee-card layout for specialization pages, replacing the fixed five-column grid. Existing degree tuition, EMI and duration values remain unchanged.
- Added native section links for fees, careers, guides and FAQs with focusable destinations and header clearance. Multi-university pages link to comparison with up to three actual course IDs; all pages link to a related-specialization search.
- Changed current-offering assertions to catalog-listing language and clarified that base-degree fees do not establish specialization availability, timing or extra fees. Removed the broad UGC qualifier from comparison metadata; the underlying FAQs/career content still await the planned source review.

Validation: production build, TypeScript, targeted lint, script syntax, scoped whitespace and all 46 read-only specialization-detail browser checks passed on local port 3001, covering single/multi-university pages, fee labels, section focus/visibility, FAQ disclosure, comparisons, related searches and bounds at 320/390/768/1280px. The mobile screenshot was visually reviewed. No catalog mutation or lead/OTP submission. No migration or environment change.

## Thirty-seventh increment: public comparison article readability

Implemented on 3 October 2026:

- Replaced the fixed comparison grid with a captioned semantic table and labelled mobile rows, reusing the interactive comparison's responsive presentation while keeping editorial articles public.
- Added section links and focusable destinations for comparison, program pages, related guides and questions. Program and third-program action labels can wrap with 44px minimum targets.
- Removed the hardcoded August review/verified-catalog claim and the blanket equal-validity summary; readers are directed to confirm current admission-session details. Existing comparison values and FAQ content were not source-verified or rewritten in this UI increment; best-value coloring is omitted.
- Retained the two selected courses when opening the interactive comparison; its separate email-verification gate remains unchanged.

Validation: production build, TypeScript, targeted lint, script syntax, scoped whitespace and all 83 read-only public comparison checks passed on local port 3001. Coverage includes three editorial pages, public access, table semantics, section focus/visibility, program actions, responsive bounds at 320/390/768/1280px, preserved two-course selections and the interactive email-verification gate. The mobile screenshot was visually reviewed. No catalog mutation or lead/OTP submission. No migration or environment change.

## Thirty-eighth increment: mobile action overlap

Implemented on 3 October 2026:

- Hid the generic corner Apply now button on mobile after screenshots showed it covering reading/card controls. Existing page-specific bottom bars remain; the generic desktop button is suppressed on the full lead page.
- Added an in-flow footer Apply now link, retaining lead-modal behavior without a floating mobile overlay. Corrected footer labels to Find my course and Articles.
- Reserved bottom space on pages with mobile action bars, added scroll clearance and safe-area padding, and allowed action labels to wrap.

Validation: production build, TypeScript, targeted lint, script syntax, scoped whitespace and all 31 mobile-action browser checks passed on local port 3001. Coverage includes six discovery/reading pages, retained home/EMI bottom bars, footer clearance, footer enquiry open/close and focus restoration, desktop visibility, full lead-page suppression and 320px overflow. No catalog mutation or lead/OTP submission. No migration or environment change.

## Thirty-ninth increment: university program and scholarship cards

Implemented on 3 October 2026:

- Replaced horizontally scrolling university program and scholarship grids with responsive cards and labelled values. Program cards have semantic headings, duration/tuition/EMI facts, course links and 44px save controls.
- Retained stored university-specific scholarship concessions/proof requirements. Removed generic fallback percentages when no scholarship data exists, replacing them with a confirmation message. Removed the blanket one-scholarship rule from the UI; current eligibility and combination rules require university confirmation.
- Reused the existing card styles and retained section IDs/mobile navigation. No catalog facts were edited or marked verified.

Validation: production build, TypeScript, targeted lint, script syntax, scoped whitespace and all 59 university-card browser checks passed on local port 3001. Coverage includes all three universities, program and scholarship labels, mobile navigation, save/remove persistence, 44px save controls, course destinations and section/document bounds at 320/390/768/1280px. The mobile screenshot was visually reviewed. Only disposable browser storage changed; no catalog mutation or lead/OTP submission. No migration or environment change.

## Fortieth increment: course reading sidebar and certificate presentation

Implemented on 3 October 2026:

- Made the course sidebar follow document flow and its long action labels wrap at 44px minimum height. Updated the obsolete five-question UnnatiAI promotion to the current three-question catalog matcher; class-schedule guidance now asks for university confirmation.
- Display sample certificates without cropping and explicitly identify unavailable images. Replaced blanket certificate wording/recognition promises with confirmation guidance; no new legal/recognition claims are introduced.
- Wrapped eligibility headers, stacked long overview facts on narrow screens and removed arbitrary timing promises from fallback admission steps. Existing stored admission content, reviews and salary/placement figures remain under the previously agreed review boundary.

Validation: production build, TypeScript, targeted lint, script syntax, scoped whitespace, all 50 existing detail-page regression checks and 22 sidebar/certificate checks passed (72 browser checks total) on local port 3001. Additional coverage includes all three universities at 320px, wrapped action bounds, normal sidebar flow, matcher links and uncropped certificate images. The mobile certificate screenshot was visually reviewed. No catalog mutation or lead/OTP submission. No migration or environment change.

## Forty-first increment: keyboard bypass and application-page clarity

Implemented on 3 October 2026:

- Added a visible-on-focus skip link targeting the focusable main landmark, with header clearance.
- Rebuilt the full application page around its existing contact-first form and a concise explanation of saving, preferences and email verification. Mobile layout places the form before explanatory material. Removed unsupported compensation, learner-count and response-time promotions from this page.
- Normalized repeated application parameters to their first value and resolved course/university IDs or slugs for contextual labels and form preferences. Existing lead API behavior, consent, OTP flow and noindex setting remain unchanged.

Validation: production build, TypeScript, targeted lint, script syntax, scoped whitespace and all 49 keyboard/application browser checks passed on local port 3001. Coverage includes first-tab skip access on three public pages, main focus, contact-first fields, repeated/unknown parameters, noindex, consent-gated Continue, mobile form order and bounds at 320/390/768/1280px. The mobile screenshot was visually reviewed. Lead/OTP requests were blocked; no records or messages created. No migration or environment change.

## Forty-second increment: policy reading and section navigation

Implemented on 3 October 2026:

- Added collapsible section navigation and keyboard-focusable anchors to Privacy, Terms and Refund pages, plus Back to top links.
- Updated the shared policy/About layout with semantic breadcrumbs, an early last-updated label, responsive reading widths and a normal-flow sidebar. Added links between policies and 44px resource controls.
- Preserved policy wording and existing content dates; this is a presentation update, not a legal or factual verification.

Validation: production build, TypeScript, targeted lint, script syntax, scoped whitespace and all 84 policy-reading browser checks passed on port 3001. Coverage includes all four shared-layout pages, keyboard section/back navigation, header clearance, resource controls and overflow at 320/390/768/1280px. Mobile screenshot visually reviewed. Lead/OTP requests blocked; no form submissions. No migration or environment change.

## Forty-third increment: footer navigation and touch targets

Implemented on 3 October 2026:

- Grouped footer links into four named navigation landmarks with visible section headings, improved mobile separation and wrapping.
- Increased all footer links to at least 44px high, added visible keyboard focus, and made the existing contact number a telephone link. Renamed the unsupported Top courses heading to Courses.
- Retained application-modal behavior and existing destinations.

Validation: production build, targeted lint, whitespace and 31 existing mobile-action browser checks passed. A separate local inspection confirmed footer link dimensions, bounds, keyboard outline and navigation groups at 320/390/768/1280px; mobile screenshot reviewed. Standalone TypeScript initially overlapped the build's regeneration of .next types; rerun after the build passed. No form submissions, migration or environment change.

## Forty-fourth increment: useful missing-page recovery

Implemented on 3 October 2026:

- Replaced the framework's default missing-page screen with a branded, responsive recovery page.
- Added labelled course search and clear links to courses, universities, degree guides and the homepage. Controls have at least 44px targets and visible keyboard focus.
- Recovery content does not need a catalog read; existing redirect resolution is unchanged.

Validation: targeted lint, TypeScript, scoped whitespace and 27 local browser assertions passed. Four missing routes (general, course, university, article) returned actual HTTP 404 responses with noindex; search navigated to the course catalog with the entered query. Controls and page bounds checked at 320/390/768/1280px; mobile screenshot visually reviewed. Production build passed. No form submissions, migration or environment change.

## Forty-fifth increment: page failure recovery

Implemented on 3 October 2026:

- Added the application page error boundary with a clear retry action, keyboard focus on the heading and a homepage link that performs a full navigation to clear failed client state.
- Error content does not read the catalog or render internal exception messages. Responsive actions meet the 44px touch-target baseline.
- Scope is page-content failures; this does not cover failures inside the root layout or a total server/network outage.

Validation: TypeScript, targeted lint, script syntax and whitespace passed. All 13 isolated browser checks passed with the actual component inside a React error boundary: simulated render failure, private-message suppression, heading focus, keyboard retry recovery and bounds/targets at 320/390/768/1280px. Mobile fixture screenshot reviewed. No live database or server fault was induced; this is not an outage end-to-end test. Production build passed. No migration or environment change.

## Forty-sixth increment: root-layout failure recovery

Implemented on 3 October 2026:

- Added the global error boundary with its own HTML/body, page title, language, viewport and noindex metadata.
- Extracted the shared recovery view and a small independent stylesheet, so the root fallback does not depend on the normal layout, catalog or global stylesheet. Both fallbacks retain focus, retry and full-navigation homepage actions.
- Covers React root-layout failures after the fallback can load; total server/network outages remain outside application-rendered recovery.

Validation: TypeScript, targeted lint and script syntax passed. The isolated root-document fixture passed 17 checks without the normal stylesheet, including metadata, landmark, private-message suppression, keyboard retry and responsive bounds. Mobile screenshot visually reviewed. All 13 existing page-recovery regression checks and production build passed (30 simulated checks total); scoped whitespace passed. No real outage was induced. No migration or environment change.

## Forty-seventh increment: About and editorial information

Implemented on 3 October 2026:

- Expanded About with practical tool links, the contact-first enquiry sequence, information-use guidance and policies. Removed unsupported equal-compensation and blanket verified-placement claims from this page.
- Expanded the Content Team profile while preserving the required shared byline. Added coverage, source/date limitations, administrator-reviewed corrections and a corrections email link using the existing published address. No credentials or completed verification were invented.
- Applied the shared responsive reading layout and section navigation to both pages; updated their content dates and descriptions.

Validation: production build, TypeScript, targeted lint, script syntax and scoped whitespace passed. The expanded reading suite passed 111 checks across five pages, and six local interaction assertions covered About enquiry opening, contact fields, focus restoration and editorial links (117 total). An initial interaction assertion ran before lazy form loading finished; rerun with visibility/focus waits passed. Mobile screenshot reviewed. Lead/OTP requests blocked; no submissions, migration or environment change. Verification of the underlying university facts remains pending.

## Forty-eighth increment: verification-process clarity

Implemented on 3 October 2026:

- Rebuilt How we verify around current review status, four verification standards, dates/outcome caveats, correction reporting and concise FAQs.
- Removed unsupported blanket completed-verification claims, informal review-collection provenance and the one-working-day correction promise from this page. Existing catalog ratings/outcome figures remain untouched under the agreed boundary.
- Added shared reading navigation, responsive check cards and a clear ongoing-review notice. Correction reporting uses the already-published admin email rather than routing a report through a course-enquiry form.
- Visible FAQ answers and JSON-LD share one data source. This change documents the process; it does not verify additional university facts or guarantee search results.

Validation: production build, TypeScript, targeted lint, script syntax and scoped whitespace passed. The reading suite passed 133 checks across six pages; six additional local assertions verified FAQ/schema equality, FAQ keyboard operation, card count and correction link (139 total). Mobile screenshot visually reviewed. No form submissions, migration or environment change.

## Forty-ninth increment: admin source-review detail usability

Implemented on 3 October 2026:

- Replaced the wide item table with responsive review cards, labelled parsed facts, source links and collapsed raw-data/hash disclosures. Metadata is also collapsed by default.
- Renamed Apply facts to Attach source notes to reflect the existing API behavior. Guidance distinguishes source evidence attachment from publishing catalog fact changes, with direct links to the catalog revision workflow.
- UI controls reflect ADMIN/EDITOR/VIEWER permissions: only administrators see eligible attachment actions, reference-only rows cannot attach, and viewers see read-only guidance. Existing server permission checks remain unchanged.
- Network failures restore actionable controls and announce the failure; successful review requests refresh the displayed server status. Database read failures now propagate to error recovery instead of masquerading as empty/missing imports.

Validation: production build, TypeScript, targeted lint, script syntax and scoped whitespace passed. All 46 local browser/API checks passed across three roles and four widths, including long fact/hash wrapping, disclosures, real 403 denials and mocked attachment success/network failure. Test harness fixes used the website DB variable and excluded Next’s separate route announcer from the error selector. Disposable users/imports were cleaned up; no catalog records were changed and successful writes were mocked. Mobile screenshot reviewed. No migration or environment change.

## Fiftieth increment: searchable source-import history

Implemented on 3 October 2026:

- Replaced the 900px-minimum import table with responsive source cards and labelled captured/awaiting-review counts.
- Added server-side name/URL/ID search, status filters and 20-row pagination across the full history instead of silently limiting access to the newest 100 rows. Pagination retains filters; repeated/invalid parameters normalize safely, and LIKE wildcard characters in searches are treated literally.
- Distinguished no matching results from an empty history, removed terminal commands from the empty-state flow, and allowed database failures to reach error recovery rather than masquerading as no data.
- Clarified that fetch status does not imply verified or published facts.

Validation: production build, TypeScript, targeted lint, script syntax and scoped whitespace passed. All 23 local browser/database checks passed with 23 disposable import fixtures and a VIEWER account: pagination, filters, literal search, repeated/unknown parameters, pending-item count, empty matches and four viewport widths. Mobile screenshot reviewed; fixtures removed. No catalog or review mutations, migration or environment change.

Follow-up addressed in increment 51: contextual admin header replaces unrelated lead controls.

## Fifty-first increment: contextual admin navigation

Implemented on 3 October 2026:

- Replaced global lead search/export controls with section-aware breadcrumbs. Lead search/export now lives inside the Lead inbox, with a labelled search field, explicit submit/reset controls and an accurate export-scope note.
- Added active sidebar semantics, 44px navigation/account controls and visible keyboard focus. The mobile menu closes with Escape (restoring toggle focus), on route changes and at the desktop/mobile breakpoint.
- Normalized repeated lead search parameters and removed the long search query from the count badge after browser checks found mobile overflow.
- Existing export authorization and data scope are unchanged; no export was performed.

Validation: TypeScript, targeted lint, script syntax, scoped whitespace and all 29 local browser checks passed across four viewport widths. Coverage includes contextual controls, breadcrumbs, active section markers, menu behavior, repeated query parameters and long-email search layout. Disposable VIEWER account removed; export requests blocked and none attempted. Mobile screenshot reviewed. Final production build passed. No migration or environment change.

## Fifty-second increment: responsive, paginated Lead inbox

Implemented on 3 October 2026:

- Replaced the wide lead table with labelled enquiry cards, separate email/phone verification states, CRM delivery status and India-time capture timestamps.
- Added 20-record pagination across all matching enquiries and an email-verification filter. Search supports literal wildcard characters; pagination preserves filters and safely normalizes repeated/invalid parameters.
- Removed the newest-50 access limit and database-error-as-empty behavior. Empty history and no matches now have distinct messages. Export scope and authorization remain unchanged.
- Placed Search after both filter fields following mobile visual review.

Validation: TypeScript, targeted lint, script syntax and scoped whitespace passed. All 23 browser/database checks passed, including pagination, verification filtering, literal search, long contact data, invalid/repeated parameters and four viewport widths. Final layout recheck passed. Tests used 23 synthetic enquiries with CRM delivery DISABLED and a temporary VIEWER; all fixtures removed, API actions blocked, no messages or exports. Mobile screenshot reviewed. Final production build passed. No migration or environment change.

## Fifty-third increment: targeted official-source verification

Implemented on 3 October 2026:

- Rechecked Amity BA foreign/NRI eligibility, MUJ MSc Mathematics eligibility conflicts and the prepared Amity MAJMC fee correction against official pages/documents.
- Reconfirmed the rendered MAJMC INR base/semester amounts; recorded unresolved Amity BA and MAJMC USD instalment discrepancies.
- Visually verified separate MUJ NRI/other-nationality fee rows in the official 2026–27 prospectus, including INR-payment exceptions. Preserved the unresolved eligibility warning.
- Added dated, paraphrased evidence with source/capture hashes, admissions questions and explicit publication holds. Refreshed CMS review notices/proposal notes and linked the targeted follow-up without changing historical full-review dates.

Validation: official-page read-only rendering and prospectus fee-table visual inspection completed; JSON integrity, proposal invariants, TypeScript and scoped whitespace checks passed. No catalog records, publication flags or forms submitted. Full 30-program verification remains incomplete; this pass did not certify recognition or intake availability.

## Fifty-fourth increment: MUJ category-specific tuition cross-check

Completed on 3 October 2026:

- Rechecked all nine existing MUJ program pages and mapped domestic, NRI and foreign fee tabs within each fee section, avoiding reused IDs elsewhere in source HTML.
- Visually cross-checked 27 base tuition/semester schedules against the official 2026–27 combined prospectus (PDF page 36). All agreed, reconciled across the program duration and matched the earlier observed base amounts.
- Recorded application-charge evidence, neighbouring-country INR-payment exceptions, promotion/financing limits and unresolved additional costs. No all-inclusive fee or current-admission claim was made.
- Added structured category evidence and a reviewer table; linked it from the verification register while preserving historical review dates. No catalog publication or code behavior changed.

Validation: 27 independent page-versus-prospectus comparisons and instalment arithmetic checks passed; INR 500 application-charge text found on all nine domestic panels. JSON parsing and scoped whitespace passed. Documentation/evidence-only changes; no application build needed. No forms, database writes, migration or environment changes. SMU and Amity category/charge checks remain next.

## Fifty-fifth increment: SMU category-specific tuition cross-check

Completed on 3 October 2026:

- Checked nine SMU program pages and 18 domestic/international schedules against the visually inspected 2026–27 combined prospectus (PDF page 29). All base totals match and reconcile with semester fees and duration.
- Recorded INR 500 domestic application charges, neighbouring-country payment exceptions and unresolved additional charges. Preserved the distinction between “International students” and “Other Nationals”; separate NRI applicability remains unconfirmed.
- Saved the prospectus edition/hash because search retrieval showed an older edition at the same URL. Linked scoped evidence from the verification register without changing historical full-review dates or publishing catalog facts.

Validation: 18 page/prospectus comparisons and semester arithmetic checks passed; application-charge text found on all nine domestic panels. JSON parsing and scoped whitespace passed. Documentation only; no migration, environment or database change. Amity category fees remain next.

## Fifty-sixth increment: Amity fee reconciliation and category holds

Completed on 3 October 2026:

- Rechecked 12 official Amity INR fee panels using rendered pages and separate direct HTTP retrievals. All base totals match September observations; browser and direct base/semester amounts agree.
- Documented nine INR 200 semester-versus-base discrepancies and smaller annual rounding differences. Retained displayed values rather than inventing final instalments.
- Recorded contrasting BA/MAJMC USD web responses with retrieval freshness and explicit unconfirmed category status. International/NRI applicability remains unresolved; the other ten international schedules still require evidence.
- Added structured evidence, a reviewer table and precise admissions questions; updated scoped verification-register links. No catalog facts or prices published.

Validation: 24 successful read-only page requests; 12 base and semester cross-retrieval comparisons; all 12 semester/annual calculations checked, including nine expected semester discrepancies. JSON integrity and scoped whitespace passed. Documentation/evidence only; no build, migration, environment change or database mutation required.

## Fifty-seventh increment: fee findings in the admin review workflow

Implemented on 3 October 2026:

- Added dated, source-linked fee notices to all 30 reviewed course editors and their revision screens. Amity notices expose exact semester/annual discrepancies; SMU preserves unresolved NRI applicability; MUJ preserves neighbouring-country currency exceptions.
- Content quality includes these unresolved findings even when a source note is attached. Replaced broad readiness labels with “without listed checks”; removed database-error fallbacks that could report an empty, apparently clean audit.
- Notices are advisory and do not change authorization, publication controls or public prices. Existing administrator review remains required.
- Findings are maintained in `src/data/fee-review-issues.json`. After admissions confirmation, update the dated evidence and the corresponding finding in a reviewed code change; do not remove a finding solely because a source note was attached. A per-finding CMS resolution workflow is not implemented in this increment.

Validation: TypeScript, targeted lint, scoped whitespace and production build passed. All 81 local browser checks passed across ADMIN, EDITOR and VIEWER roles, both editor/revision locations, three university-specific notices and four viewport widths. Temporary test users removed; catalog requests read-only and mutation requests blocked. No migration or environment change.

## Fifty-eighth increment: responsive content-quality review dashboard

Implemented on 3 October 2026:

- Replaced the wide quality table with responsive cards showing record type, publication state, expandable findings and explicit record/revision links.
- Added server-rendered name/ID search and record-type/review-status filters, including unresolved fee findings. Repeated, invalid and long query values are normalized; substring search treats wildcard characters literally.
- Kept overall summary counts distinct from filtered results and added recoverable no-match/no-record states. Clarified that automated checks and attached source notes do not certify accuracy or control indexing.
- Added keyboard disclosure/focus styles and 44px controls. No publication or data-write behavior changed.

Validation: TypeScript, targeted lint, script syntax, scoped whitespace and production build passed. All 22 local browser checks passed, covering filtering/reset, literal substring search, repeated/invalid/long parameters, keyboard disclosure and four viewport widths. Mobile screenshot reviewed. The temporary VIEWER was removed; catalog access remained read-only and mutation requests were blocked. No migration or environment change.

## Fifty-ninth increment: responsive catalog review queues

Implemented on 3 October 2026:

- Replaced seven/eight-column university/course tables with shared responsive cards, labelled fields, record/revision links and 12-record pagination.
- Added literal name/ID/short-name search, status filtering and a university filter for courses. Course cards now identify their university; query normalization handles repeated, invalid and long values, and pagination preserves filters.
- Added publication flag/status conflict notices, filtered-empty recovery and role-appropriate creation links. VIEWER users retain review access without an unusable creation action; API permissions are unchanged.
- Removed database-error-as-empty fallbacks and used stable ordering. Filtering/pagination currently operates on the loaded small catalog; database-side pagination remains a future scaling improvement.

Validation: TypeScript, targeted lint, script syntax, scoped whitespace and production build passed. All 69 browser checks passed across ADMIN, EDITOR and VIEWER roles, both queues, four viewport widths, filter preservation/reset and malformed parameters. Mobile screenshot reviewed; temporary users removed. Catalog access remained read-only; no migration or environment changes.

## Sixtieth increment: readable admin dashboard

Implemented on 3 October 2026:

- Replaced the recent-leads table with responsive labelled cards; added long-name wrapping, explicit pending program selection, separate email/CRM states and India-time timestamps.
- Added direct inbox, content-check and revision shortcuts, plus mobile stacking and keyboard focus treatments.
- Clarified rolling seven-day and all-time labels, CRM denominator and published-flag count. Publication is no longer labelled content readiness. Program ranking identifies record IDs and states its top-six, selected-program scope.
- Removed database-error fallbacks that silently presented zero counts or empty history; failures now reach the existing error boundary. Added stable tie-break ordering. No metrics formula or publication behavior changed.

Validation: TypeScript, targeted lint, script syntax, scoped whitespace and production build passed. All 48 browser checks passed across ADMIN, EDITOR and VIEWER roles and four viewport widths, including long-name wrapping, explicit status labels and shortcut links. Mobile screenshot reviewed. Temporary users and a synthetic enquiry with delivery DISABLED were removed; no forms, CRM delivery or publication actions occurred. No migration or environment change.

## Sixty-first increment: readable lead detail and resilient CRM controls

Implemented on 3 October 2026:

- Converted lead details into semantic labelled fields with explicit missing-value messages, separate email/phone verification and India-time timestamps. Added long-value wrapping and mobile field stacking.
- Collapsed raw comparison/recommender data and event metadata into keyboard-accessible disclosures; clarified the latest-50 timeline scope.
- Removed database-error fallbacks that appeared as missing leads or empty activity; malformed UUID routes return not-found before querying.
- Added CRM network-error recovery, accessible feedback and accurate queued-versus-delivered messaging. Existing authorization and delivery logic are unchanged; an interrupted queue request advises checking status before retrying.

Validation: TypeScript, targeted lint, script syntax, scoped whitespace and production build passed. All 45 browser checks passed across three roles and four viewport widths, including keyboard disclosures, interrupted preview/queue recovery, mocked success feedback and malformed-ID handling. Mobile screenshot reviewed. Synthetic lead delivery was DISABLED; all CRM requests were blocked or mocked, and temporary records/users were removed. No real delivery, migration or environment change.

## Sixty-second increment: searchable CRM delivery history

Implemented on 3 October 2026:

- Replaced the wide attempt table with responsive cards, explicit HTTP/CRM/timestamp labels, expandable outcomes and direct lead links.
- Added literal attempt/lead/CRM-ID search, status/trigger filters and 20-record database pagination across the full history, replacing the latest-50 limit. Filters persist through pagination; invalid/repeated parameters are normalized.
- Corrected uppercase SUCCESS styling and misleading “No response yet” text on completed attempts. Timestamps explicitly use India time; queued/processing messages do not imply delivery.
- Removed database-error-as-empty fallback. No delivery, retry or settings behavior changed.

Validation: TypeScript, targeted lint, script syntax, scoped whitespace and production build passed. Eighteen browser checks passed using a disposable VIEWER, synthetic disabled lead and terminal-state attempts; fixtures removed through lead deletion cascade. No queued/processing fixtures, external requests or real CRM delivery. Mobile screenshot reviewed.

## Sixty-third increment: responsive redirect management and save recovery

Implemented on 4 October 2026:

- Replaced the wide redirect table with labelled cards, wrapping long paths, readable state/status labels and India-time hit timestamps.
- Explained existing-source replacement and immediate activation; aligned the reason input with the API’s 500-character limit.
- Added accessible success/error messages and busy recovery for create, enable/disable and delete. Failed requests no longer silently reload. Failed form submission preserves entered paths for retry.
- Removed database-error-as-empty fallback and added stable ordering. Existing redirect rules, API permissions and activation defaults remain unchanged.

Validation: TypeScript, targeted lint, script syntax, scoped whitespace and final production build passed. All 42 browser checks passed across three roles and four widths, including long destinations, blocked network requests, mocked validation errors and mocked successful saves. Temporary inactive redirect and users removed; no real redirect mutations were requested. Mobile screenshot reviewed.

## Sixty-fourth increment: usable SEO route browser

Implemented on 4 October 2026:

- Replaced the full route table and numerous intent tiles with concise overall counts, searchable cards, intent/type filters and 20-route pagination.
- Added expandable internal references, clear empty states and live-route links; candidate topics do not offer links to unimplemented destinations. Repeated/invalid/long query values are normalized.
- Clarified that the page lists routes rather than creating pages or submitting URLs. Generator indexing flags are not evidence of robots/canonical correctness or actual indexing; internal references are not official university/regulator sources.
- Removed blanket verified-data claims from the admin presentation without changing the shared generator, public pages, sitemap or indexing rules.

Validation: TypeScript, targeted lint, script syntax, scoped whitespace and production build passed. All 19 local browser checks passed, covering four widths, filters, pagination, keyboard disclosures, invalid/repeated parameters and the current empty candidate list. Mobile screenshot reviewed; temporary VIEWER removed. Catalog access was read-only, no search-engine submissions occurred, and no migration or environment change is needed.

## Sixty-fifth increment: readable published-catalog preview

Implemented on 4 October 2026:

- Replaced the wide course preview table with responsive cards, course search, university filtering and 12-course pagination. University summaries explicitly remain unfiltered.
- Collapsed long eligibility and overview text into keyboard-accessible disclosures. Added direct public-page and revision links, with clear labels distinguishing published values from unsaved edits and proposed revisions.
- Presented structural snapshot issues as wrapping cards while retaining the all-or-nothing snapshot behavior. Source verification remains distinct from structural readiness.
- Preserved snapshot loading, validation, public catalog contents and publication controls.

Validation: TypeScript, targeted lint, script syntax, scoped whitespace and production build passed. All 18 local browser checks passed for pagination, filters, repeated/invalid parameters, keyboard disclosure and four widths. Mobile screenshot reviewed. Temporary VIEWER removed; no catalog mutations or environment/migration changes. The invalid-snapshot branch was not exercised against the live local catalog.

## Sixty-sixth increment: clearer CRM configuration and save feedback

Implemented on 4 October 2026:

- Grouped configuration into delivery controls, destination and request/response options, with labelled fieldsets and responsive controls.
- Preserved entries after failed saves; added accessible network/server-error feedback and accurate saved-versus-connected wording. Automatic delivery wording no longer incorrectly implies OTP is always required.
- Added client checks for string-valued header objects, complete HTTP-code entries and API-aligned timeout bounds. Existing API permissions, configuration defaults and delivery behavior are unchanged.
- Reused the configuration model for the status summary, eliminating its duplicate query and error-as-disabled fallback.

Validation: TypeScript, targeted lint, script syntax, scoped whitespace and production build passed. All 15 local browser checks passed for validation, recovery, mocked success and four viewport widths. Mobile screenshot reviewed; temporary VIEWER removed. Initial test execution was rejected by automatic approval review; the revised test explicitly blocked configuration requests before page load and used only mocked responses afterward. No settings saved or CRM deliveries made. No migration or environment change.

## Sixty-seventh increment: usable CRM mapping editor

Implemented on 4 October 2026:

- Moved the request editor before the merge-field reference on mobile; added field search, wrapping tokens and bounded scrolling for the reference list.
- Added clipboard success/failure feedback with a manual-copy fallback, valid-object checks, accessible save feedback and network-error recovery. Failed saves preserve the mapping name and JSON.
- Clarified that saving activates a mapping for future delivery attempts but does not send a lead or verify connectivity. Added a back-to-settings link.
- Preserved mapping semantics, existing API permissions and delivery behavior.

Validation: TypeScript, targeted lint, script syntax, scoped whitespace and production build passed. All 14 browser checks passed, covering object validation, failed-save preservation, mocked success, clipboard success/failure, token search and four viewport widths. Mobile capture rechecked after clearing focus/scroll; temporary VIEWER removed. Mapping requests were blocked before page load and only mocked afterward; no mapping changes, real delivery, migration or environment changes.

## Sixty-eighth increment: resilient CMS sign-in UI

Implemented on 4 October 2026:

- Preserved credential/code inputs on failed submissions and restored buttons after network interruptions. Added accessible success/error announcements and busy state.
- Added a password visibility control, focus transfer to the email-code field and an explicit association between the code input and delivery/expiry guidance.
- Returning to credentials clears stale code messages and resets password visibility; credentials and the website/CRM account distinction are explained clearly.
- Authentication endpoints, password checks, OTP rules and rate limits are unchanged. One-time setup remains a separate follow-up.

Validation: TypeScript, targeted lint, script syntax, scoped whitespace and production build passed. All 16 browser checks passed, including password visibility, credential/code preservation, failure recovery, OTP focus, switching login and four widths. Mobile screenshot reviewed. All authentication requests were blocked or mocked; no real sessions, user changes or email delivery. No migration or environment change.

## Sixty-ninth increment: resilient first-admin setup form

Implemented on 4 October 2026:

- Added clear password-length and private setup-token guidance, autocomplete hints, password visibility and an explicit sign-in link.
- Preserved entries on failed submissions, restored controls after network errors and added accessible feedback. An interrupted request advises checking sign-in before retrying because creation may have completed.
- Kept the setup token in its existing request header rather than the account payload. Setup availability, authentication checks and server validation are unchanged.

Validation: TypeScript, targeted lint, script syntax, scoped whitespace and final production build passed. All 14 isolated browser checks passed, including network/server failures, value preservation, password visibility, token/header separation, success state and four widths. Mobile screenshot reviewed. The fixture uses the real form with a plain-anchor shim for framework Link and blocked/mocked APIs; it does not test full Next.js navigation. Existing users were not removed to bypass setup restrictions, and no actual account was created. No migration or environment change.

## Seventieth increment: searchable, paginated revision history

Implemented on 4 October 2026:

- Removed the latest-50 history limit; added 20-record database pagination with stable ordering, status filters and literal reason/record/revision-ID search.
- Preserved record scope across filters, reset and pagination; normalized repeated and invalid query values. History controls sit after the editor, with a reminder to save working drafts before navigation.
- Added scoped counts, empty-filter guidance and mobile wrapping. Existing proposal editing, approval, rejection, rollback and authorization behavior is unchanged.

Validation: TypeScript, targeted lint, script syntax, scoped whitespace and production build passed. All 17 browser checks passed, including full pagination, literal search, record-scope preservation, status/invalid/repeated parameters and four widths. Mobile screenshot reviewed. Disposable proposals and VIEWER removed; API mutations were blocked, no proposals applied or public records changed. No migration or environment change.

## Seventy-first increment: preserve administrator review notes on failure

Implemented on 4 October 2026:

- Switched review/rollback forms to explicit submission handling so React does not clear their uncontrolled note fields after a handled error; submitter values still distinguish Apply and Reject.
- Added error announcements and friendly interrupted-request messages for revision/draft operations, advising status checks before retries when an action may have completed.
- Corrected rejection success feedback to state that the catalog is unchanged. Existing approval, rollback and role-enforcement APIs are unchanged.

Validation: TypeScript, targeted lint, script syntax, scoped whitespace and production build passed. Eleven targeted browser checks passed for interrupted apply/rollback, rejected requests, preserved notes, Reject submitter values and accurate success text. Apply/reject/rollback requests were blocked or mocked; database checks confirmed the pending fixture stayed pending and no rollback was created. Temporary revisions and ADMIN user removed. No public catalog changes, migration or environment changes.

## Seventy-second increment: preserve advanced catalog edits on failed saves

Implemented on 4 October 2026:

- Changed advanced course/university form submission to preserve entered values after client validation, server errors and interrupted requests.
- Added JSON-object checks, accessible error announcements and busy state; disabled spellcheck for structured JSON.
- Clarified that an interrupted save may have completed and the record should be checked before retrying. Existing field permissions, status choices and publication APIs are unchanged.

Validation: TypeScript, targeted lint, script syntax, scoped whitespace and production build passed. All 42 browser checks passed across ADMIN, EDITOR and VIEWER roles and four widths, covering JSON validation, interrupted/server-failed saves, mocked success and retained values. Temporary users removed; catalog write endpoints were blocked before page load and only mocked afterward. No published content, migration or environment changes.

## Seventy-third increment: release readiness on Next.js 16.3.8 and first UI fixes

Implemented on 5 October 2026 (next-phase plan wave 0; see `NEXT_PHASE_PLAN_2026-10.md`):

- **Security:** the website moves to Next.js 16.3.8. Version 16.1.6, which the live site still runs, has a critical remote-code-execution advisory in image optimisation (AVIF is enabled) and 29 other advisories. The Docker build already resolved 16.3.8 from the shared lockfile; `package.json` and the app lockfile now agree.
- **Fixed before deploy:** every enquiry would have been refused. Lead and OTP routes compared the browser's Origin with `request.url`, which in the container is the bind address (`http://0.0.0.0:3100`), so a real visitor's `https://unnatividya.com` never matched and every Apply now step returned 403. `validOrigin` now compares with the public host (`X-Forwarded-Host`, `Host`) and the configured site URL. Requests from other sites are still refused. Checked locally, through a Caddy-style forwarded request and with a foreign Origin.
- **UI fixes 1–6** (owner request):
  1. "Ask UnnatiAI" became "Find my course".
  2. The course list sorts by relevance by default: same degree side by side, cheaper first. The review-count and rating sorts were removed (unverified figures); old `?sort=popular`/`rating` links fall back. Phones get full-width search and sort and compact cards with the fee and duration first; the mobile course list is about 31% shorter.
  3. The floating Apply now appears only between 641 and 1100px, where the header has no button of its own, and its phone icon was replaced.
  4. The dark strip under the header was removed.
  5. The course header has one recognition chip ("program status being re-checked for 2026-27") instead of four institution badges, a quieter ratings line, and no "Weekly effort" (owner decision 5).
  6. Article sidebar spacing fixed. The false "Online MBA under ₹1 lakh" title/excerpt corrected (the catalog's lowest MBA fee is ₹1,20,000). Two excerpts no longer open with commentary on Amity's site. The UGC source is labelled 2025-26.
- **Test maintenance:** these suites had fallen behind earlier increments and were updated:
  - editor evidence-link count (increment 53);
  - hidden header Tools link (increment 22);
  - removed page cache headers (increment 6);
  - `clamp()` font sizes and the rebuilt application page (increment 41);
  - the new sort and floating-button rules.

  The two comparison suites wait for `load`: under 16.3 the comparison pages' link prefetches stay open in the browser, although the server answers them at once.

Validation:
- Production build, TypeScript and source lint passed.
- The readiness check passed (3 universities, 30 courses).
- All 55 smoke suites passed against the standalone server started as in the Docker image (`node server.js`, full shared `node_modules`).
- Desktop and mobile screenshots were reviewed.
- Disposable fixtures were removed; no real enquiries, OTP emails or CRM deliveries.

No migration or environment change beyond the pending `0004`–`0007`.

## Seventy-fourth increment: trust fixes (wave 1)

Implemented on 5 October 2026 (next-phase plan wave 1, items T1–T8; owner decisions 3–7). Wave 0 (increment 73) is deployed.

- **T1, rating markup:** `AggregateRating` was removed from the course and university structured data, and the stars stay visible (decision 4). The course `Offer` now points to the course page instead of `/lead`, which `robots.txt` blocks.
- **T2, per-program values only** (decision 5, `src/lib/program-facts.ts`): the CMS records still hold the old template values, so the pages filter them.
  - Credits, exam format and the application fee show "Confirm with the university" unless the record holds a program-specific value.
  - ₹500 is shown only for MUJ and SMU, as "non-refundable (Indian applicants)", per the 3 October fee evidence.
  - The "Full payment (2% off)" plan is dropped.
  - The overview and structured data no longer call every program "UGC-entitled".
  - The two named reviews were the same on all 30 courses and can't be tied to a program, so they moved to the claims register; the Reviews section and its tab are gone.
  - Salary bands carry "indicative industry ranges, not verified for this program or university", and placement figures are labelled university-wide.
- **T3, comparisons:**
  - The rows no longer carry "best" flags.
  - The placement, package and partner rows are labelled "(university-wide)".
  - The "Yes, both UGC-entitled" and "equal degree validity" answers now give the dated 2026-27 re-check status. The same change applies to the course FAQ, fee guides and one article tip.
  - Both comparison tables have a CSS-only "Show differences only" toggle, which also works on the server-rendered editorial pages.
- **T5, homepage and About** (decisions 3, 11 and 12):
  - "10k+ learners guided" is added to the catalog summary.
  - "Unbiased by design / Every university pays us the same" became "No hidden charges".
  - "Approvals verified … re-checked every admission cycle" became "Approvals you can check". Wave 2 adds the per-program UGC-DEB link and the last-checked date that this promises.
  - The lowest-fee guarantee and the no-cost EMI wording stay as owner-stated claims.
  - About has a "Contact us" section with the owner's details (name, Noida address, admin@unnatividya.com; no phone yet). The site-wide Organization structured data carries the same address and email.
- **T6, articles** (report 02 §c):
  - #7: MCA eligibility corrected per university from the verified catalog (Amity: BCA, a degree with Mathematics, or a CS B.Tech/BE; SMU prefers CA/CS/IT).
  - #11: "widest fee gap" removed.
  - #8, #17 and #18: "verified directly / confirmed with the universities" replaced with the dated re-check status and general guidance.
  - #21: the unsourced ₹6-12 LPA removed. #24: Amity blog salaries removed. #22: the "10% discount" promotion removed and the eligibility wording hedged.
  - #15: "no B.Com needed" corrected, because the catalog lists commerce or a related discipline for all three.
- **T7:** the no-cost EMI wording stays (decision 3); fee guides are rebuilt from evidence in wave 2. The fee-guide "equal degree validity" answer was corrected under T3.
- **T8, specialization pages** (decision 6, all 101 stay indexable):
  - The grammar is fixed ("with the Accounting specialization", not "with a Accounting").
  - Titles fit in 60 characters: 99 of 101 do. Two MA Public Policy names are longer than 60 on their own and are kept whole.
  - Descriptions are built from each page's own fee, duration and EMI.
  - A new "Other specializations" section links each university's sibling specializations in the same program.
- **Claims register:** new `docs/CLAIMS_REGISTER.md` lists every retained, deferred, parked and pending claim with its location, source and status.

- **Test maintenance:**
  - The course section picker has 9 entries (Reviews removed).
  - The specialization nav expects the extra "Other specializations" link when that section exists.
  - The interactive comparison suite waits for the table after the mocked access check instead of racing it; it had failed 1 run in 3.

Validation:
- Production build, TypeScript and source lint passed.
- All 55 smoke suites passed against the standalone server started as in the Docker image.
- Desktop and mobile screenshots were reviewed: course facts, fees, careers, the comparison differences toggle, specialization siblings and the homepage trust strip. There is no mobile horizontal overflow.

There are no migrations or environment changes. The catalog data in the database is unchanged: the template values are filtered at render time, so an administrator can still enter real per-program values in the CMS.

## Seventy-fifth increment: publish the data we have (wave 2)

Implemented on 5 October 2026 (next-phase plan §3). Publishing stays admin-reviewed. Every new fact reaches the public pages only after an administrator applies a revision. Nothing in the database changed.

- **2026-27 recognition check.** All 30 programs were researched against the UGC-DEB 2026-27 online lists (evidence: `docs/UGC_DEB_RECOGNITION_2026-27_2026-10-05.md` / `.json`). The research file records 25 direct listed matches and five Amity records as `unclear` on the awarding entity; the prepared proposals mark those five `listed` based on the owner's UP attribution.
  - MUJ 9/9 and SMU 9/9 are listed.
  - For Amity, seven are directly matched to the catalog's existing institution context. Five (B.Com, BA, BA JMC, M.Com, MA Public Policy) appear only under Amity University Uttar Pradesh, which the owner states awards them (plan §11 #15). That owner statement is the basis for the prepared `listed` result, not independent regulator proof of the awarding link. The three on UP's "recognized" list show its printed "valid up to January 2027" period and need a later-intake check.
  - Without an applied result, a page keeps the dated "being re-checked" status. A result with the "unclear" status would show "confirm the awarding university".
  - The site's earlier citations were an undated table and the ODL (distance) list; neither is cited any more.
- **New optional course fields** (`categoryFees`, `recognition`, `intakes`, plus the `feeReview` / `eligibilityReview` / `curriculumReview` source stamps the loaders already wrote). The snapshot now keeps them.
  - A malformed review stamp is dropped rather than failing the catalog.
  - An INR category fee that differs from the course fee is a validation issue, so it blocks the write like any other.
- **Prepared proposals:**
  - `src/data/prepared-category-fees.json` holds 18 MUJ/SMU programs from the 3 October prospectus evidence. Fees are in their own currency, never converted. SMU has no NRI row.
  - `src/data/prepared-recognition.json` holds all 30 programs.
  - Both have **Load** panels in Catalog revisions, next to the existing eligibility, curriculum and fee-correction panels.
- **Course page:**
  - A Domestic / NRI / Foreign (MUJ) or Indian / International (SMU) fee selector, built on native radios with 44px targets.
  - Source and checked-date lines under fees, eligibility and the verified curriculum.
  - A new Recognition section (list, entry as printed, official PDF and checked date), and the header chip now shows the published result.
  - "Next intake": only confirmed intakes, hidden the day after their deadline (India time), otherwise "Not yet announced". Intakes are edited in the CMS.
- **Comparisons and guides:**
  - A "Fee outside India" row and a recognition FAQ built from each program's result.
  - Fee guides show the outside-India fees with their source.
  - The 17 UGC-approval guides now read each program's published result instead of hard-coded "Yes" answers and "confirmed with the university" notes. The university-level NAAC/AICTE notes are kept.
- **Publishing checklist** (`/admin/publishing-checklist`, in the CMS sidebar): every prepared item per course is shown as applied, waiting for review, to load or on hold, with a link to that course's revisions.
- **Tests:**
  - New `wave2-publishing-smoke.cjs`. It loads the prepared items in the editor with every write blocked. It then writes the values into three local records, checks the public pages and the fee selector, and restores the records exactly (data and `updated_at`).
  - The comparison table now has 13 rows and the course picker 10 entries.
  - The editorial comparison now has 12 rows. About has 5 sections and was last updated on 5 October.
- **Also:** the Amity NAAC guide note no longer says Amity University Rajasthan awards every amityonline.com program. The old UGC-guide `faqs`/`note` text is marked as no longer rendered.

Validation:
- Production build, TypeScript and source lint passed.
- The readiness check passed (3 universities, 30 courses).
- All 56 smoke suites passed against the standalone server.
- Applied-state screenshots were reviewed (course fees and recognition, Amity UP note, UGC guide, mobile fee selector, CMS checklist and editor panel). There is no mobile horizontal overflow.
- Local records changed for testing were restored exactly, and the disposable CMS users were deleted.

No migration or environment change. After the deploy, an editor works through **Publishing checklist** (about 107 items across 30 courses), and an administrator applies each proposal.

## Seventy-sixth increment: measurement and foundations (wave 3)

Implemented on 5 October 2026 (next-phase plan §6–§8; owner decisions 8, 9 and §11 #16–18).

- **Analytics (decision 17: GA4 tag only).** GTM is removed, so gtag.js no longer loads twice and page views are no longer double-counted.
  - `gtag` is a queue from the first call, with `config` queued first, so events fired before the lazy library loads are kept, not dropped.
  - `NEXT_PUBLIC_GTM_ID` is no longer passed by Docker or compose.
  - The Caddy CSP now allows `analytics.google.com` and `stats.g.doubleclick.net` (some GA hits were blocked).
- **Technical SEO (report 04):**
  - www → apex permanent redirect (Caddyfile, H3).
  - Every page sets its own canonical and `og:url`, site name, type and image via `withSocial()`. The layout no longer leaks `canonical: "/"` to `/lead`, `/shortlist` and 404s (H4/H5).
  - Titles: `fitTitle()` patterns for course, fee, eligibility, career, UGC and blog pages. Titles over 60 characters went from 148 to 10: 8 editorial blog titles, kept whole for the content work, and 2 long specialization names.
  - Guide descriptions name only the universities that offer the program.
  - The 23 robots-blocked `/lead?…` links carry `rel="nofollow"` (M3).
  - Article markup gains the image, `mainEntityOfPage`, a real `dateModified` (from the new `updatedDate`, set on the 11 posts whose facts changed) and a PNG publisher logo. The breadcrumb names the post. The sitemap `lastmod` follows `updatedDate` (M4/M8).
  - `/courses` uses the course-list `ListItem` format.
  - The broken `api-otp.amityonline.com` source is hidden from public source lists (M9).
- **Last-good snapshot (§8).** The public catalog and article reads keep the last valid result in the server process for up to 24 hours and serve it on a database error or an invalid record, logging it. Admin preview still reads live. New `catalog-last-good-smoke.cjs`.
- **Marketing consent and newsletter (decisions 9 and 18; migration `0008`).**
  - Apply now has an optional, unticked box: "Send me Unnati Vidya's newsletter and WhatsApp updates…". It is stored separately from the contact consent, with its wording version and time, in the lead events and the lead export.
  - Footer and article sign-up use double opt-in. The confirmation email has a POST confirm button, so link scanners can't subscribe anyone. Apply now consents are confirmed by the OTP email check instead.
  - One-click unsubscribe uses HMAC links and RFC 8058, and withdraws marketing consent on the enquiry too.
  - CMS **Newsletter** page, plus an ADMIN-only CSV export with a per-subscriber unsubscribe URL. Exports neutralise spreadsheet formulas without altering phone numbers.
  - The privacy policy has a new "Newsletter and WhatsApp updates" section.
  - New `marketing-consent-smoke.cjs`. It sends no email.
- **Phone number (§11 #16):** "Call 1800-120-4050 (toll-free, 9 am – 9 pm)" was removed from the footer and policy pages and replaced by admin@unnatividya.com until the owner gives a number.
- **CMS article editor (decision 8; migration `0009`).**
  - `article` holds what is live; `article_revision` holds drafts and proposals.
  - Editors keep one open draft per article, edit with labelled fields (title, category, summary, cover, dates, a block editor for paragraphs, headings, tip boxes, images and link boxes, FAQs, sources with checked dates) and submit with a reason.
  - Administrators preview, publish or send back with a note. Publishing is refused if the article changed after the draft began.
  - History can restore any published version as a new draft, and administrators can unpublish and republish. Audit-logged.
  - The strict schema blocks unsafe links and non-local images.
  - The blog, articles, sitemap and IndexNow read published CMS articles. Reading time is computed from the words: the old fixed "5–8 min" overstated 1–2 minute posts.
  - Sources show per post; the default is the 2026-27 UGC-DEB list, not the undated table.
  - The 26 posts are migrated by `sync-articles-to-db.js` (built into `scripts/articles-export.json`; safe to re-run).
  - New `article-cms-smoke.cjs`. It restores the edited article exactly.
- **Website CI.** A new `website` job in `.github/workflows/ci.yml`: lint, catalog export, types, a fresh database with migrations, catalog and article seed, the production build run like the Docker image, Playwright, and every website smoke suite. It was rehearsed locally on a throwaway database with no `.env`, and its first GitHub run is still to come.
- **Test fixes:**
  - The specialization search waits for its debounced URL update.
  - The policy pages reflect the new About and Privacy sections.
  - The Apply now dialog test ticks the contact consent by name and checks that the marketing box stays unticked.

Validation:
- Production build, TypeScript and source lint passed.
- All 59 smoke suites passed twice: against the standalone server on the local database, and against a CI-like server on a fresh throwaway database with no `.env`.
- GA4 was checked with a throwaway build using a fake ID: only `gtag/js` loads, and the queue is `js`, `config`, then events.
- Titles over 60 characters were re-measured across all 261 sitemap URLs: 10 remain.
- Screenshots were reviewed (newsletter sign-up, the two Apply now boxes, the CMS article list and block editor, the newsletter page). There is no mobile horizontal overflow.
- Every test record and disposable CMS identity was deleted, and the edited article was restored exactly.

Migrations `0008` and `0009` are needed, plus `sync-articles-to-db.js` before the new image takes traffic (see `CMS_PUBLISHING_DEPLOYMENT.md`). There is no new environment variable.


## Seventy-seventh increment: learner-page decision guidance

Implemented locally on 8 October 2026 under the [content and UI expansion plan](CONTENT_AND_UI_EXPANSION_PLAN.md). This is a presentation and question-guidance pass; it does not publish new university facts.

- Course pages now lead into four practical checks: eligibility, applicant-category cost, study arrangements and current-session recognition. A compact seven-item section picker replaces ten top-level choices; the secondary content remains on the page.
- The study section has a clear list of class and assessment questions where program-specific rules are not yet verified. The fee section identifies the selected applicant-category tuition where available and prompts for additional mandatory charges rather than treating tuition as the complete payable amount.
- University pages group published programs by undergraduate and postgraduate level, show the lowest listed **total tuition** as such, and explain the difference between institutional badges and program recognition. The right-rail claim list has been replaced with a short verification path. Owner-deferred placement figures remain visible in their own section with scope and verification caveats.
- New card hover motion is limited to a 2px lift and 160ms transition. Reduced-motion preferences also suppress shared card, button, pill, fade and skeleton effects.

Validation: the website TypeScript check, targeted page lint and optimized production build passed; the built MUJ MBA route returned HTTP 200 with the new sections. Browser interaction and responsive screenshot checks remain to be rerun: the local Playwright package is absent, and Chrome headless did not produce a screenshot in this sandbox. No CMS record, migration, environment variable or VPS deployment was changed by this increment.

## Seventy-eighth increment: one-click publishing for submitted CMS content

Implemented locally on 8 October 2026. The prior course/university layout and wording changes are code and become public with deployment; they were never stored as CMS drafts.

- **Publishing checklist** now separates submitted, ready-to-publish revisions from unfinished working drafts and prepared source files. An administrator can inspect the exact ready list and publish all ready course, university and article revisions with one button.
- The action rechecks the list under the catalog and article write locks, then applies the entire batch in one transaction. A stale record, conflicting revision, unpublished catalog record, archived article or invalid payload stays out of the batch with a visible reason. If validation fails during publishing, the entire batch rolls back. Each applied revision and the batch are audit-logged.
- No migration or environment variable was added. Prepared fee, eligibility, curriculum and recognition files still require loading, source review and submission before the button includes them.

Validation: TypeScript, targeted lint and the optimized production build passed. A disposable local database/HTTP integration check passed 13 assertions covering admin permission, list drift, atomic application of one course plus one article, applied statuses and repeat-click rejection. The test course, article and CMS users were removed and verified absent. The action has not been used on real content or on the VPS.

## Seventy-ninth increment: source-linked online MBA learning pilot

Implemented locally on 8 October 2026 under the content and UI expansion plan.

- Added four optional, validated CMS blocks for program-specific study format, assessment/exams, charges beyond tuition and specialization timing. Each stores its own official source URL, scope and checked date. The course page renders a block only if it has been published in the catalog; unanswered topics remain practical questions rather than inferred facts.
- Prepared sourced facts for MUJ and SMU online MBA across all four blocks. Prepared Amity online MBA study-format facts only; its exam split, extra-charge schedule, international/domestic fee applicability and awarding-entity questions remain unresolved. The three preparations are available in labelled Catalog revisions controls and the Publishing checklist. Loading them does not submit or publish them.
- Added [MBA evidence and held questions](MBA_PROGRAM_DETAILS_EVIDENCE.md). No published CMS course record, migration, environment variable or VPS deployment changed.

Validation: TypeScript, targeted lint and optimized production build passed. A disposable published course demonstrated that the public page shows sourced learning, assessment, charge and specialization cards only after the corresponding database content is present (8 HTTP/content assertions); it was then deleted. Responsive browser screenshots and administrator source review remain pending.

## Eightieth increment: sourced NIRF results and simpler Apply now form

Implemented locally on 8 October 2026.

- The three university profiles show the official 2025 NIRF **University** result with a direct Ministry of Education source link and the exact ranked institution. MUJ is rank 58; SMU is shown correctly as the 151–200 **band**; Amity's rank 22 is identified as belonging to Amity University, Gautam Budh Nagar, not every Amity Online awarding entity. The card explains that an institution's NIRF result does not rank its online courses. Source evidence and the update rule are in [NIRF_UNIVERSITY_RANKINGS_2025.md](NIRF_UNIVERSITY_RANKINGS_2025.md).
- Removed the optional newsletter/WhatsApp marketing checkbox from the one shared Apply now form used by modal and direct `/lead` entries. The form no longer sends `marketingConsent`; existing API records and historical subscribers remain supported. Newsletter opt-in remains on its separate footer/article sign-up. Privacy and newsletter-admin copy now match.
- The owner approved one required, initially unchecked consent for enquiry follow-up by email, SMS, WhatsApp and voice call. Its wording identifies Unnati Vidya and authorised counselling associates and explains withdrawal. The owner then removed the unfinished-form/email-verification clause from the learner-facing copy; the resulting evidence version is `application-follow-up-2026-10-08-v2`. The form omits the proposed blanket DND/NDNC override. The official [DPDP Act](https://www.meity.gov.in/static/uploads/2024/02/Digital-Personal-Data-Protection-Act-2023-1.pdf) requires a clear affirmative action for consent, and [TRAI's sender advice](https://www.trai.gov.in/advice-to-senders) describes additional requirements for commercial messages; a website checkbox alone must not be represented as a blanket DND override.
- When an older enquiry's contact details are edited under the new wording, the API records the newly accepted version and exact text as a separate event. Omitting the retired marketing field on a same-email edit preserves an earlier opt-in; changing the email cannot transfer that opt-in to the new address.

Validation: TypeScript, targeted lint and optimized production build passed after the shortened consent update. The rebuilt `/lead` route returned HTTP 200 and rendered exactly one unchecked checkbox with the new channels, withdrawal wording and no unfinished-form, newsletter or DND-override copy. The contact-first smoke passed 28 local HTTP/database checks, including the stored consent version, text and re-acceptance path; the legacy marketing/newsletter smoke passed 37 checks, including same-email opt-in preservation and no transfer to a changed email. Both used disposable records and no external email or CRM delivery. All three university routes returned HTTP 200 locally and rendered the expected result and institutional caveat. No migration, environment variable or VPS deployment was changed. Local interactive browser verification remains pending because a Playwright installation is unavailable in this workspace.

## Remaining approved work (updated 8 October 2026)

- Full field-level verification across all three universities, including international/NRI fees and regulator evidence; review and publication of corrected catalog facts.
- Publishing follow-up: extend friendly editing to remaining content forms, **guides in the CMS**, rendered previews, scheduled publication and persistent last-good snapshots/performance caching. Core CMS public reads, blog article editing, role-restricted revision application, reviewed rollback, the process-local last-good fallback and website CI are implemented in the local code. They still require the intended release to reach the VPS.
- The draft-only weekly official-source checker is implemented locally in increment 85; first production run, host cron installation and admin review of captured changes remain.
- A reviewed structured eligibility-rule schema and checker. The existing free-text eligibility paragraphs are not sufficient for a program-level admission verdict.
- Publication of reviewed applicant-category fee blocks; the total cost planner is implemented but cannot display international/NRI amounts from private prepared files.
- Groq recommender VPS configuration and production verification. The local integration, bounded follow-up chat and standard fallback are implemented in increment 81 below.
- Broader discovery/navigation, a tested move off end-of-life Node 20, SEO/Search Console validation and tools from the agreed phases. GA4-only is implemented locally; the older GTM recommendation is superseded.
- Configured external CRM create/update delivery and real email-provider end-to-end checks using dedicated test credentials/recipients.

Appointment booking is excluded. English-only, three-university scope, public editorial comparisons and gated interactive comparison remain unchanged.

## Eighty-first increment: Groq course recommender and scoped follow-up

Implemented locally on 8 October 2026. The five-question tool first excludes courses outside the learner's published-catalog level, qualification, subject and maximum listed tuition choices. Groq may order up to three remaining courses and select pre-approved reason keys; server validation rejects invented IDs, reason keys and malformed output. The results remain free without contact details, and Apply now remains a separate lead form.

The follow-up chat passes only the selected shortlist, current question and previous topic/course context to Groq. It accepts only a structured topic and selected course ID, then composes the visible answer from server-side published facts. Off-topic prompts are declined; email/phone text is rejected before any provider call. Missing international/NRI fees, program-level recognition and study details are explicitly described as unverified until a reviewed CMS revision is published. Provider errors, timeouts and rate limits use standard course matching and answer templates; the tool never creates a lead or sends a message.

Server-only `GROQ_API_KEY` and `GROQ_MODEL` were added to the VPS Compose environment and examples. Local live calls with the configured `openai/gpt-oss-20b` key passed strict JSON-schema ranking and follow-up classification. A rebuilt local HTTP server returned `mode: ai` and three MBA course IDs; contextual fee questions about the second then first option returned the corresponding published amounts and source links. Off-topic, contact-detail and forged-shortlist requests were declined or rejected. TypeScript, targeted lint, smoke assertions, production build and rendered page check passed. The browser interaction script was updated but could not run without Playwright. No VPS deployment or CMS publication occurred.

## Eighty-second increment: category-aware total cost planner

Implemented locally on 8 October 2026. `/tools/total-cost` lets a learner view up to three published programs, select each university's own applicant-category label, see the original-currency tuition and semester schedule where published, add a personal allowance for unknown charges, and print the resulting planning view. It does not convert currencies, treat a domestic INR fee as an NRI fee, or call an incomplete subtotal a university quote. A direct numeric comparison is enabled only when the selected programs have the same published category label and currency; otherwise the tool shows separate cards and an explanation.

Course fee sections prefill the planner and carry a published category selection. The existing EMI calculator now shows the selected fee category and accepts only a published/listed INR amount; USD or unavailable categories do not produce an INR loan estimate. A published category choice follows Apply now into the existing contact-first form's second step and is validated against the selected course before being recorded in `PREFERENCES_SAVED` event metadata. The current external CRM mapping does not yet forward that event field. The tool is linked from site navigation, footer, course pages and sitemap. There is no lead capture in the tool; Apply now remains a separate enquiry.

At implementation, a read-only query found 30 published courses and **zero published category-fee blocks** in the local website database. The tool therefore shows listed INR tuition with an unconfirmed applicant category and explicitly unavailable international/NRI fees until reviewed CMS proposals are applied. The prepared MUJ/SMU research files were not published by this increment. No migration, new environment variable, VPS deployment or customer communication was made.

Validation: TypeScript, targeted lint, the optimized production build and `total-cost-smoke.mts` passed. The local planner, EMI and MUJ MBA pages and static sitemap all returned HTTP 200 with the intended links and content. Headless Chrome with true 320, 390, 768 and 1280 px emulation found no document-width overflow; at 390 px, switching to the unpublished applicant category removed the subtotal, and adding a second course showed the comparison warning without overflow. Apply now opened the contact-first mobile modal with name, email and phone before course selection. The disposable contact-first regression passed 31 HTTP/database assertions, including rejection of a forged fee-category key and clearing that context; it deleted its test lead and made no external delivery. Published USD and semester-schedule interactions remain untestable against the live local catalog until an administrator publishes reviewed category-fee blocks; synthetic data tests cover their arithmetic and isolation.

## Eighty-third increment: batch review of prepared category fees

Implemented locally on 9 October 2026. The CMS publishing checklist shows all 18 MUJ/SMU prepared courses, each official prospectus and program fee link, category labels and a reason for any excluded course. An administrator can affirm source review and submit all currently eligible fees as private catalog revisions in one transaction. The endpoint compares the exact reviewed course list again while holding course rows; changed base fees, existing category blocks, pending revisions and working drafts block individual courses. Repeated or stale submissions are rejected. The existing separate admin publish action remains the only step that changes public catalog facts.

The current official 2026–27 MUJ and SMU prospectus PDF checksums matched the 3 October evidence exactly on 9 October. The prepared data's 45 tuition schedules matched all stored program observations and reconciled with their semester counts. A read-only local CMS query found the 18 courses published with no category-fee blocks or pending revisions. The database smoke check staged all 18 proposals inside a transaction, verified that public course rows did not change, rejected a repeat submission and rolled back. The cost planner and EMI choice list also show an explicit unavailable NRI option whenever published fee rows do not identify an NRI rate, so SMU's international price cannot silently stand in for it. TypeScript, targeted lint, production build and anonymous endpoint checks passed. No CMS fees were published, no migration or `.env` key was added, and no VPS change was made. SMU NRI applicability, Amity international/NRI rates, and charge inclusions remain open for explicit review.

## Eighty-fourth increment: source-bounded eligibility checker pilot

Implemented locally on 9 October 2026. `/tools/eligibility-checker` asks for applicant category, completed qualification route, institution recognition, graduation marks or CGPA unknown, reserved status, education outside India and AIU equivalence where relevant. It shows **Matches published academic criteria**, **Needs university confirmation**, or **Does not meet the selected published criteria**, with the specific reasons, official source and check date when a rule exists. No sign-up is required, answers stay in browser memory, and Apply now is a separate lead action. The selected result is prominent; other programs are grouped compactly so 30 unknown states do not flood the page. Course pages and eligibility guides link to the tool.

Only `eligibilityRules` applied through the CMS are executable. The new labelled admin editor records source/date, applicant categories, degree routes, thresholds, AIU requirements and unresolved conditions; manual rules default to incomplete. Changing the free-text eligibility paragraph removes an older rule from that proposal. MUJ and SMU online MBA rules are prepared from their official pages in [pilot evidence](ELIGIBILITY_CHECKER_PILOT_2026-10-09.md); none was applied to the local catalog. Amity MBA was held because the current source could not be reliably rechecked as a complete rendered rule, and MUJ MSc Mathematics remains disputed. All 30 local programs therefore return **Needs university confirmation** today. The route is noindex and omitted from both sitemaps until at least one complete reviewed rule is published.

Validation: the rule smoke covered the two sourced MBA pilots, Indian/NRI/foreign thresholds, reserved cases, unlisted bachelor routes, 12th-only applicants, missing marks, uncertain awarding institution, AIU equivalence and invalidation after text edits. TypeScript, targeted lint and the optimized build passed. HTTP returned 200 for the tool and linked course page; the dynamic static sitemap omitted the unready tool. Headless Chrome at 320, 390, 768 and 1280 px found no horizontal overflow; the 390 px form produced the expected confirmation result, and its mobile screenshot was inspected. No CMS publication, migration, environment variable, VPS deployment or external message was made.

## Eighty-fifth increment: weekly official-source evidence checks

Implemented locally on 9 October 2026. A separate CLI reads published CMS source URLs, including structured fee, eligibility and recognition sources. It accepts only selected official HTTPS hosts, compares normalized HTML or PDF hashes with the previous capture, and creates a private Source imports item only for a first capture or changed page. Unchanged and failed checks stay visible in history. A database advisory lock prevents overlapping runs; the VPS wrapper and example Monday 09:30 IST cron command are in [the operator guide](WEEKLY_SOURCE_CHECKS_2026-10-09.md). The checker does not run until an operator deploys and installs that schedule.

Weekly evidence cannot be attached directly to the public catalog through the Source imports action, including via the API. An editor reviews it, then proposes real fact changes using Catalog revisions; an administrator applies those separately. The legacy mutating source importer is not used. The smoke test covered allowed and rejected hosts, source selection, script/style normalization, baseline/change decisions, private evidence insertion and redirect failure without a catalog write. A rollback-only local database capture created a private evidence item and left the published course row unchanged. The local catalog currently yields 51 monitored entries across 29 courses and all three universities; Amity BBA needs a reviewed accessible official source URL. Targeted lint, TypeScript and the production build passed; HTTP health returned 200 and anonymous CMS source access redirected to login. No new migration, environment variable, CMS publication or VPS change was made.

## Eighty-sixth increment: BBA eligibility-rule pilot and clearer learner form

Prepared MUJ and SMU BBA structured rules from their official course pages on 9 October 2026. MUJ Indian applicants can use a recognised Class 12 or 10+3 diploma route; its NRI/foreign published wording expressly names Class 12 or AIU-recognised equivalent, so the rule uses category-specific routes and sends NRI/foreign diploma cases to university confirmation. SMU's Indian route is prepared for Class 12 or 10+3 diploma. Its main eligibility block and FAQ differ on the NRI/foreign diploma route, so those categories are intentionally absent and always return confirmation. Neither source states a minimum marks threshold for these BBA programs. The prepared records remain private until an administrator checks the current intake, submits and applies a CMS revision.

The public checker now says “qualification route for this application,” labels Class 12/diploma marks correctly, and hides the percentage field when the selected published rule has no threshold. The admin rule editor exposes category-specific routes. The eligibility smoke test passed new BBA route, category and AIU cases; targeted lint, TypeScript and the production build passed. A rendered browser check at 320, 390, 768 and 1280 px found no horizontal overflow; mobile submission and the expanded other-program list worked. The local published catalog still has zero structured rules, so current public results remain “Needs university confirmation” and the tool remains noindex. No migration, environment change or VPS deployment was made.

## Eighty-seventh increment: BCom and BA eligibility review

Prepared category-specific structured rules for MUJ and SMU BCom from their current official program pages. Both list recognised Class 12 or 10+3 diploma for Indian applicants and Class 12 or AIU-recognised equivalent for NRI/foreign applicants, without a published minimum marks percentage. NRI/foreign diploma cases stay at university confirmation. These are private CMS proposals and require current-intake administrator review before publication.

The SMU BA source review found a material mismatch: the current page lists an Indian 10+3 diploma, while the official 2026–27 BA prospectus expressly lists Class 12 or equivalent and omits the diploma. An older 2025–26 international BA brochure unexpectedly states a bachelor's-degree requirement. The prepared BA checker rule therefore covers only the consistent Indian Class 12 route. Diploma and NRI/foreign routes return confirmation. The CMS free-text BA proposal now carries a source-linked evidence warning and a dated note so it is not submitted casually. Seven of the 30 course rules are now prepared, none is published; the remaining 23 need course-specific review. The seven-rule smoke, JSON validation, targeted lint, TypeScript, production build, and authenticated local CMS rendering for the BA revision and publishing checklist passed. No migration, environment change or VPS deployment was made.

## Eighty-eighth increment: UI redesign from the Claude Design handoff

Implemented locally on 10–11 October 2026 from the approved [UI redesign plan](UI_REDESIGN_PLAN_2026-10.md). The plan's owner decisions are in its §10 (Q1–Q16). The approval added two things: pages missing from the designs also get the new format, and the admin panel is restyled too. This is a UI-only change: routes, URLs, data reads, JSON-LD and metadata, analytics events, the contact-first lead flow, the compare OTP gate and CMS behaviour are unchanged except where a §10 decision says otherwise.

**Design system:**
- Plus Jakarta Sans, self-hosted through `next/font`.
- Design tokens on `:root` in `globals.css`, plus shared CSS in `src/styles/ui/shell.css` and one stylesheet per area: home, courses, compare, universities, guides, tools, company and admin.
- Subtle CSS-only entrance motion, which is turned off under reduced motion and when printing.

**Shared components:**
- New site header: flat links plus Guides and Tools dropdowns, search, "Saved courses" with a bookmark count, and Apply now.
- New footer with UGC/NAAC/AICTE badges and an email-only contact.
- One `CourseCard`, plus `SaveButton`, `CompareToggle`, `FaqAccordion` and `SectionTabs`.
- A compare list (`uv_compare`, at most 3, starts empty) with a tray that opens the still-gated `/compare?add=`.
- Mobile action bars only on Home and course pages (Q16).

**Pages:**
- Home, the courses list and course detail, compare (selection slots, a locked preview, the unlocked table, Share and Print) and the editorial comparisons, and saved courses.
- Universities, university detail, specializations and specialization detail.
- Both guide hubs, guide and article reading pages, and the author page.
- Find my course (new quiz and results, with match percentages from the learner's answers only; see `recommender-match-score.ts` and its smoke test), the EMI calculator, the total cost planner and the eligibility checker.
- Apply now (/lead and the dialog), About, How we verify, the legal pages, the newsletter pages, 404 and the error pages.
- The CMS admin shell and pages.

**Owner rules kept over the design:**
- no phone number;
- no Best/Lowest or winner highlighting;
- placement and package figures labelled university-wide;
- per-program recognition only;
- no unconfirmed perks, reviews or "Who it suits" copy;
- ratings shown but never used for ranking;
- byline "Content Team, Unnati Vidya";
- the CTA is exactly "Apply now".

**Clean-up:**
- About 950 rules in `globals.css` that nothing references any more were removed (4,806 → 1,753 lines). Every removed selector contains a class that no source, migration or public file mentions. Every kept rule is byte-identical to the original.
- The now-unused `approval-badge`, `section-pill-nav`, `sticky-ctas` and `sticky-mobile-bar` components were deleted.
- Smoke suites were updated for the new markup without dropping checks. New checks cover the design rules: no `tel:` links, the unticked single consent, the locked compare preview with no values in the DOM, list sync, and the match-score weights.

**Owner follow-ups, 11 October 2026:**
- **Q17:** the About H1 keeps "unbiased".
- **Q18:** the /lead eyebrow keeps "No obligation".
- **Q19:** "Online learners" is removed from the university Key highlights.
- **Q20:** the university detail page drops the two-column pairs. Rankings & recognition is now a NIRF banner (rank block plus explanation) with equal approval tiles. Admission process moved above Placements and shows as a horizontal stepper on wide screens. Placements, Scholarships and "Before choosing" (now including Sources) are full-width panels using the shared icon tiles, and the section tabs follow the new order.

**Validation (11 October 2026, final code including Q17–Q20):**
- TypeScript passes. ESLint on `src` has no errors; its 4 warnings are the existing admin `location.assign` calls.
- The production build passes, and the static mobile CSS check passes.
- The match-score, recommender, total-cost and eligibility-rules library suites pass. `category-fee-batch-smoke.mts` was not run: it needs a local CMS administrator, and CI doesn't run it.
- All 62 website smoke suites (browser suites included) pass against the standalone production server in two setups:
  - with local data (port 3100);
  - in the CI rehearsal: a fresh `unnatividya_ci` database and no `.env`, on port 3200.
- Disposable CMS users created by the suites were removed.
- Screenshots were reviewed at 320, 390, 768, 1280 and 1440 px with no horizontal overflow.

**Bugs QA found and fixed:**
- A reduced-motion rule using `transition-duration: 0.01ms` on every element made every layout change transition briefly. It is now `transition: none`.
- At 320 px the header was 13 px too wide. The logo and gap are now fluid, with no breakpoint.
- The Home hero selects were named "Degree level Any level", because a select inside its label adds its chosen option to the name. They now use `aria-labelledby`.
- The CMS "Close menu" toggle overflowed by 1 px at 320 px.
- "UnnatiVidya" now has its space. Logo `width`/`height` attributes now match each SVG. The article top no longer lands under the header. Section-tab focus is now synchronous.

No commit, push, migration, environment change or VPS deployment was made.

**Owner follow-ups, 12 October 2026 (Q21–Q29):**
- **Q21:** the course sidebar no longer shows learner counts, so they appear on no public page.
- **Q22:** the red "does not meet" tint is kept as the `--uv-error-bg` token.
- **Q23:** Find my course writes its five answers to the URL; a shared link reopens the results, and "Start again" or "Edit" clears them.
- **Q24:** course pages open the EMI calculator with `?course=` pre-selected. Unknown ids are ignored.
- **Q25 and Q26:** the three budget bands and the "Name" and "Phone" labels stay.
- **Q27:** the Apply now form shows inline field messages linked with `aria-describedby`. They appear on blur for filled fields and on submit for all fields, and submit focuses the first field that needs attention. Empty fields are not flagged on blur, because the message would shift the form under the pointer.
- **Q28:** the duplicate article newsletter styling was removed from company.css.
- **Q29:** the per-area stylesheets were pruned (admin.css lost 8 lines, universities.css lost 1). The shared `shell.css` primitives were kept. The pruning script now treats `:is()` and `:where()` groups as alive if any alternative is used. A re-check of the earlier globals.css pruning found no rule removed wrongly.
- New checks cover these: the URL round trip and restart in course-matcher-smoke, the `?course=` prefill in emi-ui-smoke, and the inline messages in application-accessibility-smoke.


**Validation of Q21–Q29 (12 October 2026):**
- TypeScript, ESLint and the production build pass.
- **CI rehearsal (port 3200):** all 62 website smoke suites pass in one uninterrupted run.
- **Local data (port 3100):** 56 suites passed in the full run. The other 6 hit timeouts while the machine was under heavy load (load average up to 63, memory swapping). All 6 pass when rerun one at a time on a quiet machine: course-discovery, crm-config-ui, crm-history-ui, lead-detail-ui, mobile-actions and redirect-ui.
- Earlier failures in this session were also environmental. One AVIF encode in the image optimizer got stuck inside a server process; after a restart the same image encodes in 0.13 s. Two suites ran concurrently against the same database. Each affected suite passes when run alone.
- **Uninterrupted local run on a quiet machine (port 3100):** 61 of 62 suites passed. course-matcher timed out once, waiting for network idle on the restored shared-link page. It passed in two immediate reruns, and no request was left open when the same URL was probed.
- **Watch item:** twice in this session, a request to the standalone server's image optimizer (`/_next/image`) stayed open until the server process restarted. Both times it was one image and size, with AVIF requested. This was seen only on the local macOS machine under heavy load, and it has not been reproduced on demand. After the VPS deploy, check that pages with images reach network idle.

## Eighty-ninth increment: Wave 4 learner tools (A1–A5)

Implemented locally on 12 October 2026 from the approved [Wave 4 plan](WAVE_4_PLAN_2026-10.md) (decisions W1–W4).

- **A5, Saved courses:**
  - Copy link (`/shortlist?ids=…`). A visitor opening it sees "Shared with you" and saves nothing until they choose to.
  - A private note per saved program, kept only in this browser (`uv_shortlist_notes`, up to 500 characters).
  - A print view that includes the notes.
- **A3, Find my course:** each result shows the program's listed eligibility, plus either the eligibility checker (when a complete reviewed rule is published) or "Confirm with the university" with the course's entry details. The quiz never claims a personal verdict.
- **A4, EMI calculator:**
  - An optional lender processing fee counts in the total payable; it is not borrowed.
  - A "Loan or semester payments" section compares the plan with the published INR semester schedule, as a difference only. When no schedule is published, it says so (true for every program today).
  - `semesterComparison()` is unit-tested.
- **A2, Recognition check** (`/tools/recognition-check`, decision W2):
  - Shows each program's published 2026-27 UGC-DEB result, with list, institution, programme as printed, checked date and source.
  - Includes a four-step "check it yourself" guide and an all-programs table.
  - Shows only published CMS status. All 30 programs read "being re-checked" until an administrator applies the prepared proposals.
  - The page is noindex and outside the sitemap until one result is published.
- **A1, Admission document checklist** (`/tools/document-checklist`, decision W3):
  - Lists documents by program level and applicant category, from official pages only, read on 12 October 2026:
    - Online Manipal's online MBA admission page, for MUJ and SMU;
    - the MUJ Admission Manual for Online Programmes (version 5, 2022), for upload rules and special cases;
    - Amity University Online's FAQs and its January 2026 "How to apply" guide.
  - Ticks stay in this browser, and the page has a print view. Where a source has no list for a category (SMU NRI/foreign, Amity NRI), the page says "Confirm with the university".
- **Navigation and smoke checks:** both tools are in the header Tools menu and the footer, and the lead dialog has labels for their intents. A new `learner-tools-wave4-smoke.cjs` covers them. Shortlist, course-matcher, EMI and total-cost suites were extended.

**Source conflicts found (not changed, for owner review):**
- The 2022 MUJ manual says MBA applicants need CAT/MAT/GMAT (above the 40th percentile) or the Manipal Management Aptitude Test. The current Online Manipal MBA admission page and our catalog list no entrance test. The checklist leaves the test out; confirm with MUJ.
- The Online Manipal MBA admission page (read 12 October 2026) shows the MUJ online MBA full fee as ₹1,84,000; the published catalog has ₹1,80,000. The weekly source check and an administrator fee review should confirm the current figure before any change.

## Ninetieth increment: Next.js 16.4.0 (stuck image fix)

Implemented locally on 12 October 2026, with owner approval to upgrade the website and the CRM together.

**The bug.** In Next.js 16.3.8, the image optimizer fetches a local source image through a mocked request that reuses the visitor's socket. If the visitor disconnects while that image size is being optimized for the first time, the internal fetch never finishes. The response cache funnels every later request for the same image and size onto that one fetch, so the image stays pending for all visitors until the server restarts. Locally, 32 of 40 image sizes stayed stuck after cancelled AVIF requests and 1 of 40 after WebP ones. This also explains the intermittent page-load timeouts in increments 88–89. Next.js 16.4.0 fixes it: the mocked response no longer references the requester's socket. After the upgrade, 0 of 40 sizes were stuck, both for warm images and for 40 never-requested sizes.

**Changes:**
- `next` and `eslint-config-next` go from 16.3.8 to 16.4.0 in the CRM root `package.json`, and `next` in `apps/unnatividya/package.json`.
- Both lock files were regenerated with npm 10, which CI uses. They change only the Next.js packages (12 entries in the root lock, 10 in the website lock), and `npm ci` accepts them.

**Validation:**
- CRM: `check-lockfile.js`, TypeScript, CRM lint, 2,155 unit tests in 177 files, and the production build pass.
- Website: TypeScript, lint and the production build pass; the smoke suites are recorded below.
- The CRM database smoke tests and the API regression run were not repeated locally.
- No migration or `.env` change.

**Local environment note.** The folder above `crm/` is an npm workspace root that lists `crm`. Running `npm install` inside `crm/` therefore installs into that outer workspace and rewrites its lock file. It also hoisted most packages out of `crm/node_modules`, which broke the standalone copies (`pg` not found). `crm/node_modules` was rebuilt with `npm ci` (npm 10) in an isolated copy. The previous folder is kept in the session scratchpad. The outer project's `package-lock.json`, which already had uncommitted changes before this session, now also reflects the upgrade; every dependency of its own workspaces still resolves.

**Follow-up fixes found while validating 16.4.0:**
- **Filters reflected a frame late.** On 16.4.0, `useSearchParams` picks up a `history.pushState` change about one frame later, so pills, Reset and compare slots showed the old state on the next read. The new `src/lib/use-live-search-params.ts`:
  - `writeUrl` records each written query, and `useLiveSearchParams` shows it until Next's own value catches up. Next's value remains the source of truth for first render, Link navigations and back/forward.
  - The course, blog, guide, specialization and compare explorers use it instead of calling `history.pushState` directly.
- **Fast typing dropped characters.** Fast typing in the course, blog, specialization and guide search boxes dropped characters ("online" became "onlne") because each box took its value from the lagging URL. `useUrlSearchText` keeps the box's own text, writes every keystroke to the URL, ignores late echoes of what it wrote, and still accepts outside changes (Reset, back/forward, links). Article- and course-discovery suites now type at full speed and assert the exact text.
- **Generated catalog validator broke.** `scripts/generated/catalog-snapshot.js` now imports the eligibility rules (since increment 84). The generator compiled each file alone, leaving `require("@/lib/eligibility-rules")` unresolved, so `check-catalog-ready.js` would crash in CI and in the VPS upgrade sequence. `export-catalog.ts` now also generates `eligibility-rules.js`, rewrites `@/lib/…` requires to sibling files, and fails the export if an unknown `@/` import remains. `check-catalog-ready.js` reports ready again (3 universities, 30 courses).
- Three discovery suites wait for a filter's pressed state before asserting it, and the comparison suite waits for the third slot.

**Validation of increments 89–90 (12 October 2026, run on a quiet machine):**
- **Builds and unit checks.** TypeScript and lint pass, and so does the production build on Next.js 16.4.0. The library suites (total-cost, match-score, recommender, eligibility rules) pass, as does `prepared-article-drafts-smoke.mts` (4 drafts).
- **Smoke suites.** All 63 website smoke suites pass both against local data (port 3100) and in the CI rehearsal (port 3200). The 63 include the new learner-tools suite.
- **CRM.** Lock check, TypeScript, lint, 2,155 unit tests and the production build pass.
- **C1 import, on the CI database:**
  - The first run queued 4 drafts and a re-run queued 0.
  - The new article stayed private (404) and the published hub kept its old text.
  - A disposable administrator opened CMS → Articles and applied two revisions through the normal review API. The new article and the rewritten hub then appeared publicly.
  - The CI database was then restored (no C1 rows, no disposable user).

## Ninety-first increment: new-batch fee re-check (12 October 2026)

The owner reported that fees changed for the new batch. All 30 programs were re-read from their official program pages; see the [summary](FEE_RECHECK_2026-10-12.md) and the [structured evidence](FEE_RECHECK_2026-10-12.json).

**What changed:**
- Six MUJ Indian-applicant fees rose:
  - MBA ₹1,80,000 → ₹1,84,000
  - BBA ₹1,39,500 → ₹1,44,000
  - BCA ₹1,39,500 → ₹1,44,000
  - MCA ₹1,58,000 → ₹1,64,000
  - B.Com ₹99,000 → ₹1,05,000
  - MSc Mathematics ₹80,000 → ₹84,000
- Everything else is unchanged:
  - MUJ M.Com, MA Economics and MA JMC; all SMU programs; every NRI/foreign USD schedule;
  - all Amity programs, apart from the MA JMC correction already pending since 3 October.
- The MUJ 2026-27 prospectus PDF is unchanged and still prints the older Indian fees, so the updated drafts cite the program pages.

**How the change is prepared.** Owner decision: prepared CMS corrections only; nothing is written to the code seed or published.
- Six coordinated fee corrections were added to `prepared-fee-corrections.json`. They carry the new fee, and their semester, annual and full-payment plans come from the official page with no discounts.
- The "No-cost EMI" row (an owner-stated claim) and "EMI from" follow the site's convention of fee ÷ program months: MBA ₹7,667, BBA and BCA ₹4,000, MCA ₹6,833, B.Com ₹2,917, MSc ₹3,500 per month. Scholarships are kept.
- `loadPreparedFeeCorrection` gained optional `emi`, `feePlans`, `highlights` and `keepScholarships`. Without them it keeps its cautious defaults, which the Amity MA JMC correction still uses.
- The six MUJ applicant-category drafts now expect the new fee. The administrator loads the fee correction first, then the category fees. Until the corrections are published, the category-fee batch holds those six back with "Current Indian fee differs from the prepared amount".
- The editor's source link and the generated review note no longer say "prospectus" when the source is the program page.

**Tests.** `category-fee-batch-smoke.mts` checks each draft against the evidence it cites and against today's pages, and checks every correction against the re-check. It passes in the CI rehearsal (45 schedules; 12 ready, 6 held). `wave2-publishing-smoke.cjs` now loads the coordinated fee correction before the category fees and publishes the fee with its plans and highlights. It passes on both servers (31 checks), with records restored; `catalog-editor-smoke.cjs` passes on both.

## Ninety-second increment: hub C5 and enriched comparisons (13 October 2026)

**Hub C5 (online MBA), prepared as CMS drafts.** Four revisions of published posts were added to `scripts/prepared-article-drafts.json`, which now holds both Wave 4 batches (eight items, each tagged with its batch). The [review note](content-batches/C5_ONLINE_MBA_REVIEW_2026-10-13.md) lists every claim and its source.
- `online-mba-guide` is rewritten as the hub at the same URL (decision W5).
- `best-online-mba-working-professionals` is retitled "Online MBA while working: what MUJ, SMU and Amity ask for", without the superlative.
- `mca-vs-mba-it-careers` is retitled "MBA or MCA if you work in IT: how to decide".
- `manipal-university-jaipur-vs-amity-online-mba` gets the new fee difference (₹41,000).

The posts quote the new-batch fees as "listed on the official page, 12 October 2026" and link to the course pages (W6). The current MUJ page lists a CAT/GMAT/MAT score and a work-experience certificate as optional documents, which settles the 2022 manual's entrance-test wording. Placement figures, weekly hours and "weekend classes" are left out because they are unsourced. `prepared-article-drafts-smoke.mts` now also checks every `/courses/<slug>` link against the exported catalog.

**Enriched comparisons (Wave 4 part C).** Every editorial comparison page (`/compare/<course>/<pair>`) gains three sections and matching tabs. Nothing on these pages ranks the programs.
- **At a glance:** listed tuition and the difference, duration, specialisation counts and the 2026-27 recognition status, all from the published catalog. A note says the page doesn't rank the programs. When both programs share a status, it is stated once.
- **Specialisations side by side:** two columns with each university's listed options.
- **Sources:** each program's public source pages, opening in a new tab. Machine endpoints (`publicSourceUrls`) and the older UGC-DEB notice tables are left out. A program with no page of its own falls back to its university's public pages, and the fee-check date shows when the CMS has one.

The existing table already covers eligibility and the outside-India fee. `editorial-comparison-smoke.cjs` now checks the summary labels and ranking words, both specialisation columns, and that source links are https, open in a new tab and avoid machine endpoints. It also checks the three new tab targets.

**Deploy.** [CMS_PUBLISHING_DEPLOYMENT.md](CMS_PUBLISHING_DEPLOYMENT.md) now gives the order after restart: publish the six MUJ fee corrections, run `import-article-drafts.js` once, then review C1 and apply C5 last. No migration or `.env` key is needed.

## Ninety-third increment: hub C2, cost and financing (13 October 2026)

Owner decision W7: the C2 hub is a catalog page, not a CMS article, so its fee table always matches the course pages. The [review note](content-batches/C2_COST_AND_FINANCING_REVIEW_2026-10-13.md) lists every claim and source.

**The fees hub.** `/online-degree-guides/fees`, "Online degree fees 2026-27 at MUJ, SMU and Amity":
- It lists all 30 programs, grouped by degree, with a jump list. Each row links to the course page and shows listed tuition, duration and the fee-check date where one exists.
- An Indian semester payment appears only from a published applicant-category block. The seeded plans were computed from the total; Amity's ₹56,250 differs from the official ₹56,300.
- It also has "At a glance" (counts, tuition range, application fee by university, checks), "What the listed fee leaves out", "Paying in parts", four FAQs, the Content Team byline and FAQ structured data.
- Within a degree, rows are ordered by listed tuition, and a note says this is not a ranking.
- It is in the guides sitemap. The guides hub links to it from a card above the explorer and keeps its Q11 layout.

**Fee guides rebuilt (all 17, one template).**
- New "Application fee" column (via `programApplicationFee`), a "Per semester" column when a reviewed schedule exists, and fee-check dates.
- A "Payment options" table appears only after a fee correction is published (`feeReview`). It omits the template "2% off" plan.
- A "Plan the full cost" section links to the total cost planner with the whole degree preselected. For MBA, that is the MBA total-cost comparison.
- A per-program sources list. Machine endpoints are hidden, and a program with no public page of its own falls back to its university's public pages, as on the comparison pages.
- The intro and FAQs no longer say "verified against its individual program page", "covers tuition, LMS access, and online proctored exams" or that a specialisation never changes the fee. They now give the application fee and a dated "How current are these fees?" answer.

**Total cost planner.** `?course=` accepts up to three comma-separated programs; unknown and repeated ids are dropped, and the category preset still applies to a single program only. The planner no longer cites the older UGC-DEB notice PDF as a fee source (it did for Amity's MBA).

**C2 article draft.** "No-cost EMI for an online degree: how it works and what to check" (`no-cost-emi-online-degree`) was added to `prepared-article-drafts.json` (now nine drafts, batch C2). It quotes two RBI circulars:
- RBI/2013-14/292 of 17 September 2013, on zero percent EMI schemes;
- RBI/2024-25/18 of 15 April 2024, on the Key Facts Statement: APR including all charges, no charges outside the KFS without consent, three working days' validity, and credit card receivables exempt.

It also repeats the owner-stated no-cost EMI claim, listed in the claims register. `prepared-article-drafts-smoke.mts` accepts `rbi.org.in` as an official source.

**Tests.** The new `fees-hub-smoke.cjs` (33 checks) covers:
- the hub link, the 30 unique course rows, the degree jump links, the glance labels, ranking words, the byline, FAQ data and overflow from 320 to 1280 px;
- the MBA guide's columns, sources for all three universities (https only, new tab, no machine endpoints), the three-program planner link and the removed FAQ claims;
- the planner prefill, its fee sources, and invalid or repeated ids.

`guide-reading-smoke.cjs` (131) and `guide-discovery-smoke.cjs` (53) pass unchanged.

**Validation of increments 92–93 (13 October 2026):**
- TypeScript, lint and the production build pass.
- The library suites (total-cost, recommender, match score, eligibility rules) pass, as does `prepared-article-drafts-smoke.mts` (9 drafts). `recommender-groq-live.mts` needs the Groq key and was not run.
- With part C built, all 63 website smoke suites passed both locally (port 3100) and in the CI rehearsal (port 3200). With C2 built, all 64 passed on both, including the new fees-hub suite.
- **Import, on the CI database:**
  - The first run queued 9 items (two new articles, seven revisions) and a re-run queued 0.
  - Both new articles stayed private (404), and `online-mba-guide` kept its published title.
  - The database was restored afterwards: 26 applied revisions, 26 articles, no disposable rows.

## Ninety-fourth increment: hub C3, admissions and eligibility (13 October 2026)

Owner decisions W8–W10 (see the [review note](content-batches/C3_ADMISSIONS_REVIEW_2026-10-13.md)):
- **W8:** the hub is a catalog page.
- **W9:** no intake calendar. The official pages show only rolling, conflicting promotional deadlines.
- **W10:** the eligibility guides read published CMS eligibility.

**Admissions hub.** `/online-degree-guides/admissions` has five sections:
- **The order to follow:** eligibility checker → recognition check → ABC ID and DEB-ID (citing UGC's 19 August 2024 notice) → document checklist → apply, with the application fee by university.
- **Eligibility by degree:** links to every eligibility guide for a degree in the catalog.
- **Documents:** a checklist link plus its four official sources with checked dates.
- **Admission steps by university:** from the published `admissionSteps`.
- **Four FAQs**, the Content Team byline and FAQ structured data.

The hub is in the eligibility-guides sitemap. The guides hub now shows two link cards (fees and admissions) above the explorer. The lead wizard labels the new `admissions-guide` intent "your application".

**Eligibility guides.**
- **The switch:** a university card shows the course's published eligibility, split by applicant category, once its prepared correction is applied. The correction records `eligibilityReview`, and the card adds "From the course record: source, checked date". The source joins the guide's sources, and a caption says these cards take precedence over the hand-written notes.
- **Until then:** cards keep the hand-written fact. Every eligibility guide also links to the admissions hub.

**Tests.** The new `admissions-hub-smoke.cjs` (29 checks) covers:
- the guides hub cards, the five ordered steps and their tool links, the UGC notice link, eligibility guide links and source links;
- three university step lists, no intake dates, FAQ data and overflow from 320 to 1280 px;
- the W10 path: it writes the prepared SMU MCA correction into the local record as the CMS loader would, checks the category labels, the dated source (44 px), the precedence caption and the sources list, then restores the record (data and `updated_at`).

**Validation of increment 94 (13 October 2026):**
- TypeScript, lint and the production build pass.
- **Smoke suites (65 in total):**
  - Locally (port 3100), 64 passed on the first run. The fees-hub suite's guides-hub locator matched both new link cards; it now targets the fees card and passes on both servers (34 checks).
  - In the CI rehearsal (port 3200), 56 passed. Eight of the nine failures were timeouts while machine load rose to 25–67 (browser launch, page load).
  - `catalog-queue-ui` failed at a different line on each of two loaded runs.
  - Rerun one at a time with load below 8, all nine passed, with the corrected fees-hub suite.
- `admissions-hub-smoke.cjs` passes on both servers (29 checks), and its SMU MCA record is restored each time.
- The CI database has no disposable users or queued revisions left (26 applied revisions).

## Ninety-fifth increment: Wave 4 follow-up drafts (13 October 2026)

The three optional follow-ups from the C1, C5 and C3 notes are now five CMS drafts in `prepared-article-drafts.json` (14 drafts in total). The [review note](content-batches/FOLLOW_UPS_REVIEW_2026-10-13.md) has every claim and source. Owner decision: "online vs distance vs regular" is a new article, and the two related posts get small revisions.

- **New:** `online-vs-distance-vs-regular-degree`. It is sourced from the UGC 2020 regulations, which were read in full on 13 October:
  - the definitions in regulation 2(f), (u) and (v);
  - the evaluation rules in regulation 15(A)–(C);
  - the equivalence clause, regulation 22.
  None of the three amendments changes these.
- **Revisions:**
  - `online-mba-vs-distance-mba-difference`: mode differences, the 5 October list result and sources.
  - `online-degree-vs-regular-degree-employers`: cites regulation 22 and drops the unsourced "all follow from entitlement" sentence.
  - `online-mba-vs-online-mca-which-is-better`: MCA eligibility from the current pages; SMU no longer "prefers" a computing degree.
  - `online-admission-documents-checklist`: rebuilt from the checklist tool's four official sources and UGC's DEB-ID notice. The unsourced loan-document list and "common rejection reasons" are removed.

**Tests.**
- `prepared-article-drafts-smoke.mts` passes with all 14 drafts.
- On the CI database:
  - the import queued 14 items;
  - applying the new article and the documents revision through the review API published both, with their sources;
  - the database was then restored exactly, as a script compared article, revision, user and audit counts before and after.
- The claims register's "Removed from the pages" table now lists the claims dropped in C2 (three fee-guide claims) and in these follow-ups (three article claims).
- No site code changed in this increment, so the increment 94 build and suite results still apply.

## Ninety-sixth increment: Node 24 for the CRM and the website (Wave 5 A1, 14 October 2026)

[Wave 5 plan](WAVE_5_PLAN_2026-10.md) approved on 14 October 2026 (decisions V1–V9). Node 20 reached end-of-life on 30 April 2026. Decision V5: one shared Node 24 LTS for both apps.

**What changed.**
- The shared `.nvmrc` is now 24. Both Dockerfiles use `node:24-bookworm-slim`.
- Both `engines` fields now read `node >=24 <25` and `npm >=11 <12`, and `@types/node` is `^24`.
- The outer repository's CI uses Node 24.
- `scripts/update-lockfile.sh` now uses npm 11.19.1, the version bundled with Node 24.22.0.

**Lockfiles.** Both `package-lock.json` files were regenerated in isolated copies with npm 11.19.1. A second and a third pass changed nothing, and a fresh `npm ci` from each lock succeeds (857 and 45 packages). The only content changes:
- `@types/node` 24.19.2 (and its `undici-types`);
- `ajv`, `fast-uri` and `json-schema-traverse` are no longer hoisted; eslint keeps its own `ajv`.

**npm 11 install scripts.** Node 24's npm skips dependency install scripts that aren't approved in `allowScripts`. Four packages are affected: esbuild, fsevents, msgpackr-extract and unrs-resolver. No approval was added, because everything below passes without their scripts and blocking is the safer default.

**Verification on Node 24.22.0.** The official macOS build was checksum-verified and run from the scratchpad, on an isolated copy of the repository.
- **CRM:** the lockfile check, settings documentation, TypeScript, lint (0 errors; the 2 existing `window.location` warnings), 2,155 unit tests in 177 files, and the production build all pass.
- **Website:** lint, TypeScript and the production build pass, and both standalone servers ran on Node 24.
  - All 65 smoke suites pass locally and in the CI rehearsal. In the first run, `catalog-editor-smoke` lacked the git-ignored generated validator; after `unnatividya:export-catalog`, it passes on both servers (233 checks).
  - The library suites pass (Groq live test not run).
- **Not checked:** the Linux images, because Docker isn't available locally. The deploy doc now builds and restarts all four Node images and says to stop on any build failure.
- **Local development:** `crm/node_modules` was not swapped, because another session's dev server on port 3001 uses it. It still has `@types/node` 20 until it is reinstalled.

## Ninety-seventh increment: five Wave 5 learner tools (14 October 2026)

Tools B1–B5 from the [Wave 5 plan](WAVE_5_PLAN_2026-10.md) (decisions V3, V9, V10). Each is free and needs no sign-up. Answers stay in the page (nothing stored or sent), every fact carries its source and date, and every tool ends with Apply now. None ranks programs.

- **B2 Mode helper** (`/tools/mode-helper`). Four questions: in-person attendance, studying around work, reaching an exam centre, and how you prefer to learn.
  - Regular, ODL and online are grouped as "Fits your answers", "Possible" or "Less likely to fit", each with the reasons in the learner's terms.
  - Each mode cites the UGC 2020 regulations: 2(f), (u) and (v); 15(A)(3), (B)(1) and (C); and 22 for equivalence (`src/lib/study-modes.ts`).
- **B3 Study-time planner** (`/tools/study-planner`). The learner's own weekly hours for work, travel, sleep, family and everything else, plus a study goal and a day-by-day plan. It shows committed, free and planned hours and the gap to the goal, with a print view.
  - It flags weeks over 168 hours and days over 24 hours, and never states a university's expected hours: the learner is told to ask.
- **B5 Specialization finder** (`/tools/specialization-finder`). 11 career areas, filterable by level, match the specializations and listed career roles by their own names. Medium-of-instruction options and "General" are excluded.
  - Every one of the 85 specializations and 67 roles falls into at least one area, and links go to the specialization and course pages.
- **B4 EMI v2** (in `/tools/emi-calculator`). "Loan or semester payments" becomes "Ways to pay: upfront, each semester or a loan".
  - **Upfront:** the published "Full payment" amount once a reviewed fee correction is live, otherwise the listed tuition, less only a one-time discount the learner enters.
  - **Comparison:** the semester schedule (when published) and the loan plan, with their differences as numbers, the timing of each route and a pointer to the lender's Key Facts Statement.
  - **Fixed during testing:** an invalid discount used to hide the whole section, including the field that needed correcting.
- **B1 Exams and device check** (`/tools/exam-check`).
  - **What each university says:** how it holds exams, what your computer needs and the rules, from the official pages: Online Manipal's exam-process page (updated 3 November 2025) for MUJ and SMU, and Amity's exam page (updated 14 September 2026). Amity's unstated figures are left out.
  - **Device check:** compares what the browser reports (device type, operating system, browser, screen size, memory, connection estimate) with that university's figures. Anything the browser can't report (processor, Windows version) shows "Check yourself".
  - **Camera and microphone:** start on click, with an on-screen preview and level meter. Both stop on Stop or when the page closes.
- **Camera and microphone policy (V10).** `/tools/exam-check` is the only page whose Permissions-Policy allows them, for this origin only. This is set in `next.config.ts` and in Caddy, where two exclusive path matchers replace the single site-wide value. Every other page still blocks them.
- **Tools menu (V9).** The header Tools menu has labelled sections (Choose, Afford, Apply, Study) in two columns on desktop and a list on mobile.
  - **Fixed during testing:** the sectioned panel's `display: grid` overrode the `hidden` attribute, which left the menu showing when closed.
  - The footer, the sitemap and the lead wizard's intent labels list the four new pages.

**Tests.**
- The new `learner-tools-wave5-smoke.cjs` (115 checks) covers:
  - the menu: sections, every link returns 200, it stays on screen and closes on Escape;
  - the mode helper's fit groups for three answer sets;
  - planner totals and validation;
  - finder matching, the level filter and its links;
  - EMI upfront, discount, differences and validation;
  - the exam check: facts and sources per university, which checks appear, the camera allowed only on this page (`document.featurePolicy`), and the fake camera and microphone tracks live after start and ended after Stop;
  - no ranking words, and no overflow from 320 to 1280 px.
- `emi-ui-smoke.cjs` was updated for the new section name.

## Ninety-eighth increment: CMS scheduling and guides (Wave 5 C1–C3, 14 October 2026)

**C1 Article previews** already existed (Wave 3): any revision opens at `/admin/articles/<id>/preview?revision=` in the public article view, noindex, with a banner. `article-cms-smoke.cjs` covers it. No change was needed.

**C2 Scheduled publishing** (decision V7; migration `0010_article_schedule.sql`).
- An administrator can schedule a submitted article revision for a date and time entered in India time, with a review note. Scheduling runs the same checks as publishing now (valid content, article unchanged since the draft started) and must be 5 minutes to a year ahead.
- The revision stays "Waiting for review", so it can still be published now, sent back, rescheduled or cancelled. The page shows "Scheduled to go live on … (India time)", and the article list counts scheduled items.
- `scripts/publish-scheduled.js` applies due revisions through the same `reviewRevision` path, as the scheduling administrator, under the article lock and in one transaction. It reuses the app's code, compiled into `scripts/generated` by the catalog export. A refused schedule (for example, a stale base) is recorded on the revision and shown to admins, and isn't retried.
- `deploy/vps/scripts/publish-scheduled-articles.sh` runs it inside the running container. The deploy doc gives the 5-minute cron line with `flock`. No `.env` key was added.

**C3 Guides in the CMS** (decision V6; migration `0011_guides.sql`).
- **What's editable:** the text of the 17 eligibility and 17 career-scope guides (per-university facts or roles and industries, the note, FAQs, sources, "last reviewed") is edited at **CMS → Guides**, with draft → submit → publish or send back, history and restore. It mirrors articles, with a separate lock, `guide_*` audit actions and a stale-base guard.
- **What stays in code:** which guides exist and their URLs and labels. An edit keeps one entry per covered university; sources must be https.
- **Public pages:** the published text shows through `publishedGuide()`. With no row, an invalid row or a database error, the built-in text shows instead.
- **Preview:** CMS users can preview any revision on the guide's own URL with `?preview=<revision>`. It is noindex, carries a banner, and anyone else sees the live guide.
- **One-time import:** `scripts/sync-guides-to-db.js` imports the text from `guides-export.json`, which the catalog export writes and validates (34 guides) and which is now git-ignored. The first run created 34 on the local and CI databases, and a rerun kept 34.

**Tests.**
- **`article-schedule-smoke.cjs` (37 checks):** who may schedule, time-window and format validation, the stored instant, the audit row, admin page and list labels, the publisher before and after the due time, the applied revision's reviewer and note, the live title, a stale schedule refused and not retried, and unscheduling.
- **`guide-cms-smoke.cjs` (28 checks):** roles, validation (universities, https, FAQs, unknown keys), draft and submit, preview for CMS users only (noindex, banner), the cross-guide preview ignored, admin-only publishing, the live change, a stale revision refused, and restore as a draft.
- Both restore their rows exactly (content and timestamps checked by hash) and remove their disposable users.
- `public-navigation-smoke.cjs` now closes the Tools menu by clicking the bottom-left of the page, because the wider sectioned panel covers the heading it used to click.

## Ninety-ninth increment: dependency security fixes (24 October 2026)

When restarted, `next dev` reported a security advisory for Next.js 16.4.0, and `npm audit` confirmed it. Your decision: fix all now.
- **Next.js 16.4.0 (critical):** HTTP request smuggling in rewrites, a null-origin bypass of the Server Actions CSRF check, and unbounded `next/image` cache and postponed-resume growth. Fixed in 16.4.3.
- **12 high-severity advisories** in production dependencies, including zod, sharp, postcss, fast-uri, js-cookie, serialize-javascript, js-yaml, minimatch, picomatch, brace-expansion, browserslist and source-map-js.

**Changes.**
- **CRM:** `next` and `eslint-config-next` 16.4.3, `zod` ^4.6.7 and `js-cookie` ^3.0.8.
- **Website app:** `next` 16.4.3 and `zod` ^4.6.7.
- **Both lockfiles** were regenerated in isolated copies with Node 24's npm 11.19.1, plus `npm audit fix --package-lock-only` for transitive packages. They were stable on the next pass and pass `check-lockfile.js` and a fresh `npm ci` (857 packages).

**Result.**
- The website lock audits clean.
- The CRM lock has no critical or high advisory left. Two moderate ones remain: `uuid` <11.1.1 inside `exceljs`, about v3/v5/v6 buffer bounds. npm's only fix is downgrading `exceljs` to 3.4.0, so they're left and recorded; nothing in the code imports `uuid`.
- The local `crm/node_modules` was replaced with a fresh install from the new lock. The old tree is kept in the scratchpad, and the other session's port-3001 server is no longer running.

## Hundredth increment: fees by visitor location (Wave 5 E1–E3, 24 October 2026)

Your request: show Indian fees to visitors in India and international fees elsewhere; your team will enter Amity's international fees in the CMS. Decisions V11–V13: detect by browser time zone, apply everywhere fees appear except the EMI calculator, and show the NRI fee first outside India.

**E1, category fees entered by hand.** Catalog revisions → course → Fees and admission has a "Student-category fees" form:
- a source link, source label and checked date;
- rows of applicant category, currency (INR or USD), total, per-semester amount and number of semesters.

Removing every row removes the block. The catalog validator still applies (an INR row must equal the course fee), and amounts are never converted between currencies. Amity's international fees can be entered this way and published through the normal review.

**E2, the visitor's fee group** (`src/lib/fee-group.ts`, `src/components/fee-group.tsx`).
- **Default:** India's time zone means Indian applicants; anywhere else means NRI applicants.
- **Override:** a "Showing fees for" switch (Indian / NRI / Foreign national), remembered in the browser. A saved choice beats the time zone. Nothing is sent anywhere.
- **Row matching:** Indian uses the INR row. NRI uses an NRI row, else the single international row. Foreign national uses a foreign-national row, else the single international row.
- **No published fee:** the page says "Confirm the fee for international applicants with the university" (on cards: "Ask for the international fee"). EMI figures show only for Indian applicants.
- **Rendering:** the server always renders the Indian fee and the browser switches after hydration (`useSyncExternalStore`), so no page depends on location. Metadata, structured data, budget filters and fee sorting keep the listed Indian tuition.

**E3, where it applies.**
- **Course pages:** the headline stat, enquiry card, mobile bar and fee section (with a switch). The category selector starts on the visitor's group, and choosing a category updates the group everywhere. Notes appear when no international fee is published, and to say the payment plans are for Indian applicants.
- **Fee guides and the fees hub:** tuition, per-semester and EMI cells.
- **Listings and comparisons:** course cards (course list, saved courses, specialization pages, recommender, similar programs), the homepage teaser table, university program lists, editorial comparison program lists and the compare picker. Each has a switch.
- **Total cost planner:** each program starts on the group's published category, or "fee not published".
- **Labelled, not switched:** "Listed tuition from …" minimums across several programs, now marked "(Indian applicants)". The comparison table already shows both "Total fee" and "Fee outside India".

**Fixed along the way:** on reading pages, a fee table's screen-reader text (absolutely positioned) escaped its scrolling region and widened the page at 390 px whenever the outside-India column appeared. `.uv-read-table` is now `position: relative`.

**Tests.**
- **`fee-group-smoke.cjs` (29 checks):** server HTML stays Indian; India and London time zones; no rupee figure is passed off as international; the course-page selector and its site-wide effect; the fee guide (MUJ NRI and foreign, SMU international, Amity "confirm"); the fees hub, homepage, university page, compare picker and planner defaults; the EMI calculator stays INR; a saved choice beats the time zone; phone widths. It sets temporary category fees on two local courses and restores them exactly.
- **`category-fee-editor-smoke.cjs` (8 checks):** fills the form for Amity's MBA with every write blocked and checks the unsaved proposal.

## Hundred-and-first increment: content clusters D1–D4 (Wave 5, 24 October 2026)

There are four new catalog-page hubs, linked from the guides hub (decision V4; review note [WAVE_5_CLUSTERS_REVIEW_2026-10-24.md](content-batches/WAVE_5_CLUSTERS_REVIEW_2026-10-24.md)).
- **D4, `/online-degree-guides/international`:** NRI and foreign-national fees by degree (published category rows only, never converted; "Confirm with the university" otherwise), the extra documents for NRI and foreign applicants from the checklist's official sources, exams from outside India (UGC regulation 15(C)(2) and the universities' exam pages) and the DEB-ID rule (UGC notice of 19 August 2024). The document checklist now accepts `?category=nri|foreign`.
- **D2, `/online-degree-guides/computing`, and D3, `/online-degree-guides/commerce-humanities`:** a shared `DegreeFamilyHub` lists each degree by entry level, with each university's fee for the visitor's group, its specialisation count, its entry requirement (published eligibility guide text) and the roles it names (published career guide text). Each degree links to its fee, eligibility and career guides and its comparison pages. BBA is in D3.
- **D1, `/online-degree-guides/online-learning`:** UGC's rules (delivery, 75% participation, 30/70 assessment, exams, equivalence), each program's published class and assessment details where they exist, each university's exams, and planning your time with the study-time planner.

**Supporting drafts** (decisions V14–V16): six revisions, now 20 prepared drafts (3 new, 17 revisions). They cover WES evaluation, BCA after 12th, BCA vs BSc CS, MSc Data Science careers, B.Com vs B.Com Honours at Amity, and studying while working. Each was re-read from the official pages on 24 October, and unsourced generalisations are removed. `prepared-article-drafts-smoke.mts` now validates comparison links against the catalog and accepts `wes.org` and `canada.ca` as official sources.

**Tests.** The new `cluster-hubs-smoke.cjs` (198 checks) covers, for each hub:
- sections, degrees present, no ranking words, FAQ data and the byline;
- every internal link returns 200, and no overflow at 320 and 390 px;
- the guides-hub cards.

For the international hub it also checks "Confirm" with no fees published, NRI and foreign USD amounts once a temporary block is published (restored exactly), and that the checklist opens on the linked category. `admissions-hub-smoke.cjs` expects the six hub cards.

**Wave 5 final validation (25 October 2026, increments 96–101 together).** Run on Node 24.22.1 with Next.js 16.4.3, from a fresh copy of the working tree:
- **Website:** lint (0 errors), TypeScript and the production build passed.
- **Suites:** all 71 browser and database suites passed on both standalone servers: one on the local database and one on the CI database, seeded as CI seeds it, including `sync-guides-to-db.js`.
- **CRM:** the lockfile check, env check, TypeScript, lint (0 errors), 2,155 unit tests and the build passed on Node 24 with 16.4.3.
- **Draft import:** all 20 prepared drafts were imported into the CI database. They were queued for review, and a second import queued none. While queued, the three new posts returned 404 and weren't on the blog list or in the sitemap. The drafts were then removed.
- **Cleanup:** every record a suite changed was restored. MUJ MBA matches its earlier checksum, no test data or temporary CMS users remain, and the article, revision and guide-revision counts are unchanged.

## Hundred-and-second increment: layout fixes and a full review pass (25 October 2026)

Your request: the courses page looked broken on desktop after the "Showing fees for" selector was added. Fix that, then do a full pass for bugs, gaps and enhancements, and ask questions one at a time.

**The courses page.** The filter panel was set to `grid-row: 1 / span 2`, which was right while the grid had two rows. The fee selector added a third row, so the empty fee row stretched to the panel's full height and the program list started about 1,150 px down. The panel now spans every row (`grid-row: 1 / -1`).

**Found and fixed in the pass.**
- **Homepage:** the same kind of bug. In the "Stuck between two universities?" panel, the fee selector took the right-hand column and pushed the MBA table below the copy. The selector and table now share one column.
- **Course page:**
  - with no international fee published, the "Confirm the fee…" sentence showed at the 32 px figure size in the enquiry card; it now uses body size;
  - the top stats showed the rupee EMI to visitors outside India; they now use the visitor's fee group;
  - the status chip started with a lowercase "program".
- **Compare page:** with two programs chosen it still said "Choose at least two to compare". It now says so only when fewer than two are chosen.
- **University pages:** "Annual fee from" was hand-entered, had no source and didn't match the catalog for any university, so it's removed from Key highlights. The listed tuition range is labelled "(Indian applicants)", as are the homepage's lowest-MBA figure and the specialization page's EMI figure.
- **Copy against the owner rules** (claims register updated):
  - the specialization FAQs said "Which university offers the cheapest …" and made an unsourced role claim; they now list each university's listed tuition for Indian applicants and the roles it names;
  - the MSc Mathematics career guide said MUJ links certain electives to "higher-paying roles", which MUJ's page doesn't say; it now matches the page.
  - Guide text is copied into the CMS on the first `sync-guides-to-db.js` run, so production picks up the corrected FAQ. Local databases that were already synced keep the old copy.
- **Footer:** now five columns, Explore, Popular degrees, Tools, Resources and Company. Resources gains the fees, admissions and international hubs, and Saved courses moves to Explore. Before, one column had 14 links and the right third of the footer was empty.
- **404 page:** has its own title ("Page not found") instead of the homepage's.

**Your decisions.**
- **Tools landing page:** not added. Tools stay in the header menu and footer.
- **Guides menu:** now sectioned like Tools. "Browse" has Degree guides, Articles and How we verify. "Topics" has Fees and EMI, Admissions, Applying from outside India and How online learning works. "Degrees" has Computing and data, and Commerce and humanities. Within a menu, only the most specific matching link is marked as the current page.
- **"Best online MBA…" article title:** prepared draft 20 (Wave 4 C5) already retitles it "Online MBA while working: what MUJ, SMU and Amity ask for". Its eligibility facts were re-read against the MUJ, SMU and Amity pages on 25 October, so no new draft was needed.

**Crawl.** All 277 sitemap and extra pages were crawled at 1280 and 390 px: no page errors, no console errors, no horizontal overflow, one H1 on each page and no broken internal links (701 checked). The only empty-looking links were hidden-until-opened menus.

**Tests.**
- `fee-group-smoke.cjs` now checks the courses-page grid (the switch and results sit right under the count) and the homepage panel (the switch sits above the table, beside the copy).
- `public-navigation-smoke.cjs` checks the six hubs in the Guides menu and the single current-page link on a hub.

## Hundred-and-third increment: administrators edit and publish directly (25 October 2026)

Your request: in the CMS, an administrator can do everything, including editing content and publishing it directly, and bulk publishing, not only the editorial team.

**What was already in place.** Administrators were allowed on every edit route and could apply any submitted revision. Publishing their own change still took three steps: save a draft, submit it, then apply it from the review panel. Bulk publish covered catalog and article revisions only.

**What changed.**
- **Save and publish (administrators only).** The catalog record editor, the article editor ("Create and publish" for a new article) and the guide editor each have a one-step publish. After a confirmation, the change is saved, recorded as a revision and applied in one transaction. It goes through the same apply code as a reviewed revision, so:
  - validation, the stale-edit guard and the whole-catalog check still apply;
  - nothing is published if any check fails;
  - the revision shows in history and the audit log, reviewed by the administrator, with the note "Published directly by an administrator.", and can be rolled back.
  - Editors and viewers see no change; the server refuses their publish requests with 403.
- **Shared catalog apply** (`src/lib/catalog-apply.ts`). The administrator review, direct publish and bulk publish now share one apply function, so they can't drift apart.
- **Bulk publish** (Publishing checklist):
  - now includes guide revisions, with the same checks as articles (one per guide, valid content, guide unchanged since the draft), and takes the guide lock;
  - leaves scheduled article revisions to their schedule, with the scheduled time shown as the reason. Before, a scheduled revision could be published early by bulk publish.
- **New routes:** `POST /api/admin/articles/[id]/draft/publish` and `POST /api/admin/guides/[id]/draft/publish`. `POST /api/admin/catalog-revisions` and `POST /api/admin/catalog-drafts` accept `publish: true` from administrators.
- No migration or `.env` change.

**Tests.**
- New `admin-direct-publish-smoke.cjs` (41 checks). It covers:
  - the buttons appear only for administrators;
  - catalog publish straight away and from a working draft;
  - refusal of a stale snapshot, and of an invalid category fee with nothing recorded;
  - a new article created and published, an existing one edited and published, editors refused;
  - a guide published directly;
  - bulk publish with a guide revision while a scheduled article is held back;
  - two real browser clicks through the confirmation dialog (article and catalog).
- `bulk-publish-smoke`, `guide-cms-smoke`, `article-schedule-smoke` and `article-cms-smoke` still pass.
- `learner-tools-wave5-smoke` now scopes its Tools-menu headings, since the Guides menu has sections too.

## Hundred-and-fourth increment: social channels (26 October 2026)

Your request: add the social channels before pushing. YouTube (`@Unnati_Vidya`), Instagram (`unnati_vidya`) and Facebook (`unnatividya`) were each opened on 26 October and show the Unnati Vidya profile.

**Your choice of placements:**
- **Footer:** a row of three logo links on every page, under "How we verify".
- **Search data:** `sameAs` on the site-wide Organization and on each article's publisher, so search engines can connect the profiles to the site.
- **About page:** "Follow Unnati Vidya" under Contact us.
- **Content Team author page:** a "Follow Unnati Vidya" section, also listed in its contents.
- **Each article:** "Follow Unnati Vidya" under the newsletter box.

Not used: the header, the step after applying, embedded feeds and a WhatsApp number link.

**How it's built:**
- One list in `src/lib/social.ts` feeds every placement, so adding a channel is a one-line change.
- `SocialLinks` renders plain links: new tab, `rel="noopener noreferrer me"`, 44 px targets and accessible names. There are no embeds or tracking scripts, so the privacy policy doesn't need updating.

**Checked:** all placements at 1280 and 390 px, with no overflow or page errors. `public-navigation-smoke.cjs` now checks the footer links and the Organization `sameAs`.

**Test harness:** `cluster-hubs-smoke.cjs` now launches its browser inside `try`. Before, a failed launch left the database connection open and the suite never exited, which stalled a full run. It hadn't changed any data.

**Validation (26 October 2026, increments 102–104 together).** Everything was rebuilt on Node 24.22.1 with Next.js 16.4.3: lint (0 errors), TypeScript and the production build passed. The full run covered all 72 suites on both standalone servers, one on the local database and one on the CI database.
- 70 passed outright on each server.
- `article-reading-smoke` expected 3 links in the author page's contents; the new "Follow Unnati Vidya" section makes it 4. The test now expects 4 and passes on both.
- `catalog-queue-ui-smoke` (CI only) found a fourth university. It was a draft fixture left by an earlier `catalog-editor-smoke` run that timed out under heavy load, and my first cleanup missed it. It was removed, and the suite passes.

Both databases are back to their baseline:
- **Local:** 2 real admin users, no open drafts or revisions, and MUJ MBA matches its earlier checksum.
- **CI:** 3 universities, 30 courses, no test users and no catalog revisions.

The local runner (scratchpad, not in the repository) now waits for load below 8 before each suite and limits each suite to 15 minutes.

## Deployed to the VPS (26 October 2026)

**Releases.** Release commit `fa8ca07`, then `6178f61`, which runs the CI fee suites in India time, marks the intentional sign-in/out reloads and moves the GitHub Actions to Node 24. The VPS moved from `2811a1a` to `6178f61`. GitHub CI passed every job on `6178f61`.

**Steps, run one at a time:**
1. Built all four images on Node 24 (`unnatividya-web`, the shared `unnatify-crm:local` for `web`/`worker`, and `unnatividya-crm-worker`).
2. Ran the website migrations: `0001`–`0007` skipped, `0008`–`0011` applied.
3. Imported the articles (26 migrated) and the guides (34 migrated). `check-catalog-ready` reported `ready: true`, with 3 universities and 30 courses.
4. Restarted `unnatividya-web` on Next.js 16.4.3. `web` and `worker` are healthy on Node 24.
5. Recreated Caddy, because the single-file bind mount was still serving the old Caddyfile.
6. Checked from outside:
   - every key page returns 200;
   - camera and microphone are allowed only on `/tools/exam-check`;
   - www returns a 301 to the main domain;
   - the CRM domains respond;
   - the CSP allows Google Analytics.
7. Set up the timers. The scheduled-publish script ran clean once, and two crontab entries were added: publishing every 5 minutes, and the weekly source check on Monday at 04:00 UTC (09:30 IST).
8. Ran the first source check: 39 MUJ/SMU baselines; the 12 Amity sources fail (see the deployment guide).
9. Queued the 20 prepared article drafts for review; nothing was published.

**Notes.**
- The backup step was skipped (owner decision).
- `unnatividya-crm-worker` was started once by mistake, looped because CRM sync is disabled, and was stopped. The guide now says not to start it.
- `deploy/vps/*.log` is now git-ignored, so the cron logs don't show in `git status`.
- The guide corrections and this entry are local, waiting for the next commit.
