# Unnati Vidya implementation progress

30 September 2026. Owner approved phased implementation. This is a working-tree update, not a production deployment.

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

## Remaining approved work

- Full field-level verification across all three universities, including international/NRI fees and regulator evidence; review and publication of corrected catalog facts.
- Publishing follow-up: extend friendly editing to remaining content forms, rendered previews, scheduled publication and persistent last-good snapshots/performance caching. Core CMS public reads, role-restricted revision application and reviewed rollback controls are implemented.
- Manual plus weekly scheduled official-source checks creating drafts only.
- Groq-backed, source-grounded free recommender (credentials/model configuration pending); current matching uses deterministic catalog filters; the scripted chat has been removed.
- Broader discovery/navigation, performance/runtime upgrade, SEO/Search Console validation and tools from the agreed phases.
- Configured external CRM create/update delivery and real email-provider end-to-end checks using dedicated test credentials/recipients.

Appointment booking is excluded. English-only, three-university scope, public editorial comparisons and gated interactive comparison remain unchanged.
