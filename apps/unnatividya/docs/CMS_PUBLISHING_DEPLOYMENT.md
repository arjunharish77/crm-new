# CMS publishing deployment

1 October 2026. Code is implemented locally; these commands have not been run on the VPS.

Public course data now comes from the website database, not `catalog.ts`. Existing VPS catalog records must pass the new validator before this version takes traffic. A structural pass is not official-source verification.

## Existing VPS upgrade

From `/opt/unnatify-crm`, take the normal database backup first. Run these commands individually, stopping on any error:

```bash
cd /opt/unnatify-crm
```

```bash
deploy/vps/scripts/backup-postgres.sh
```

```bash
git pull --ff-only origin main
```

```bash
docker compose -f deploy/vps/docker-compose.yml --env-file deploy/vps/.env build unnatividya-web
```

```bash
docker compose -f deploy/vps/docker-compose.yml --env-file deploy/vps/.env run --rm --no-deps unnatividya-web node scripts/db-migrate-local.js
```

```bash
docker compose -f deploy/vps/docker-compose.yml --env-file deploy/vps/.env run --rm --no-deps unnatividya-web node scripts/check-catalog-ready.js
```

Continue only if that reports `ready: true`. It must show the expected published inventory; the first release contains three universities and 30 courses. Review any intentional difference. The command is read-only and prints record/field errors, not secrets. Fix the reported CMS records or test the correction in staging; do not overwrite editorial data by running an older image's sync script.

```bash
docker compose -f deploy/vps/docker-compose.yml --env-file deploy/vps/.env up -d --no-deps unnatividya-web
```

```bash
docker compose -f deploy/vps/docker-compose.yml --env-file deploy/vps/.env logs --tail=80 unnatividya-web
```

The website migration runner must include `0007_catalog_working_drafts.sql` for private working drafts, plus `0006_catalog_rollback_proposals.sql` for rollback controls and the earlier `0004`/`0005` migrations. Apply these before restarting the new image; revision pages require the working-draft table. No new `.env` variable is required. Existing website database, session and email-provider variables remain in use. This upgrade does not configure Groq or an external CRM endpoint.

## Verify after restart

- Open a course and university page, course discovery, comparison and the EMI tool.
- Confirm the course fee agrees across the detail page, metadata, comparison and tool options.
- In CMS, open **Catalog preview** and check inventory and validation issues.
- Use a dedicated draft/test record to check editor proposal and administrator review. A draft must not appear publicly; applying a revision to a published record changes public values on the next request. Do not use real learner submissions for a deployment smoke test.
- Check `/sitemap.xml` and `/sitemaps/courses.xml`; published URLs only should appear. Interactive comparison remains OTP-gated; editorial comparison articles remain public.

An open browser tab does not receive pushed updates. Reload to fetch current content. Public routes currently use dynamic reads and no stale seed fallback; database unavailability affects those pages. CMS login/readiness remains separate so records can be repaired. A last-good publication snapshot and tuned caching are pending.

## New installation

Seeding only inserts missing records as unpublished drafts. It does not publish or overwrite records. Review the universities and their course data in CMS, publish the required universities and courses, then run readiness before exposing public traffic. Empty or malformed catalogs do not fall back to the code seed. `catalog.ts` remains a migration/export seed and reference, not an alternate live authority.

## Repeat local regression checks

With the local website running and CRM delivery disabled:

```bash
node --import tsx apps/unnatividya/scripts/catalog-snapshot-smoke.ts
node apps/unnatividya/scripts/catalog-permissions-smoke.cjs
node apps/unnatividya/scripts/catalog-revisions-smoke.cjs
node apps/unnatividya/scripts/catalog-public-smoke.cjs
node apps/unnatividya/scripts/catalog-rollback-smoke.cjs
node apps/unnatividya/scripts/contact-first-smoke.cjs
```

The database/HTTP smoke scripts reject non-local targets and clean up fixtures. For the optional navigation regression, enable `UV_BROWSER_SMOKE=1` for `catalog-public-smoke.cjs`; Playwright and a browser must already be installed. `UV_PLAYWRIGHT_MODULE` and `UV_CHROMIUM_PATH` can identify existing local installations. This does not install or download browsers automatically.

## Restore earlier content

In **CMS → Catalog revisions**, open an applied revision’s **Restore earlier content** section. Enter the reason and prepare a rollback proposal. Review the current-versus-proposed values, add an administrator review note and apply the proposal. Until that last action, public content is unchanged. Publication state is preserved, so archived or draft records are not republished by restoring content. If another edit makes the rollback stale, reject that pending proposal and prepare a fresh one. Historical content must still pass today’s validation rules.

## Edit content through labelled forms

Open **Courses/Universities → Edit → Propose or review revisions**. Use the grouped fields for basic details, fees, payment plans and sources. Advanced structured content holds fields without a dedicated form, such as curriculum and FAQs. Submitting creates a private proposal; an administrator reviews the individual before/proposed differences and applies it. Adding a source URL does not verify its claims.

Legacy direct editing is under **Advanced record settings**. On mobile, use **Menu** to open CMS navigation. These interface changes require no additional migration or `.env` setting.

The maintained editor browser check is `node apps/unnatividya/scripts/catalog-editor-smoke.cjs`, with `UV_PLAYWRIGHT_MODULE` and `UV_CHROMIUM_PATH` pointing to installed Playwright/Chromium. It requires a local running website/database, creates disposable users and records, and removes its fixtures.

## Prepare a curriculum revision

In a course's **Propose or review revisions** form, use **Curriculum** to enter semester/term labels and one subject per line. Add the required number of terms, use Move up/Move down to match the source order, and remove obsolete groups. Blank subject lines are removed on submission. Unknown term metadata is preserved and remains visible in the review comparison.

These field controls reset `dataQuality.curriculum` to `generic` when the outline changes. Enter the official syllabus URL under Sources and describe the admission session and changes in the review reason. Submission creates a private proposal; administrator application remains a separate action. The public outline remains illustrative until its verification marker is explicitly reviewed. This editor does not fetch or certify a syllabus, and it does not replace the 30 outstanding subject-level reviews.

No additional migration or environment variable is required. The labelled-editor smoke suite covers six-term editing, reordering, removal, normalization, metadata preservation and verification reset.

## Load a prepared curriculum outline

All thirty course revision forms now offer **Preview prepared outline** and **Load prepared outline** in Curriculum. Check the source date, semester summaries and any route-specific notes first. Loading edits only the unsaved proposal; review and normal administrator application are still required. The data is a paraphrased overview, not a full verified syllabus. See `PREPARED_CURRICULUM_DRAFTS.md` for coverage and remaining work. No migration or `.env` changes are needed.

BA draft previews keep route-labelled alternatives on separate lines. Confirm the selected subject combination before editing or approving the outline; loading a summary does not choose a route for a learner.

## Prepare the Amity MAJMC fee correction

Open the `majmc-amity` course revision form and find **Prepared fee correction** under Fees and admission. Review the official source and regional/intake caveats, then use **Load coordinated fee correction**. The loader requires the proposed fee to match the recorded INR 130,000 baseline; it disables loading if that value has changed.

The unsaved proposal changes base tuition to INR 190,000 and keeps one semester plan (INR 47,500 × 4). It replaces the total-fee highlight and removes the old 2% discount, numeric EMI quote, EMI highlight and legacy scholarship rows. It leaves financing for confirmation and preserves unrelated content. Review custom descriptions/FAQs for any additional figures before submitting. Source response variants mean domestic category and current intake still need confirmation; no international/NRI price is inferred.

Loading does not save or publish. Submit a review reason, then use the existing administrator review/application workflow. No migration or `.env` change is needed.

## Prepare eligibility corrections

Twenty-eight MUJ/SMU/Amity revision forms include **Preview eligibility correction** and **Load eligibility correction** in Basic details. Review both Indian and NRI/foreign categories before submission. Loading only changes the unsaved proposal, adds source context and clears the eligibility verification marker. Administrator application remains separate. See `PREPARED_ELIGIBILITY_CORRECTIONS.md` for coverage and the two records awaiting further evidence. No migration or `.env` change is required.

Amity previews now distinguish **Foreign applicants** from **NRI applicants**. Confirm NRI categorisation with the university rather than assuming foreign requirements apply. Amity BA and MUJ MSc Mathematics revision pages display source-linked evidence notices explaining why no prepared correction is available. These notices are advisory; include confirmed current-session evidence with any manual proposal. Public eligibility paragraphs preserve line breaks when an approved correction is applied.

## Create a course or university draft

Use **Courses → New course** or **Universities → New university**. Enter a unique lowercase URL slug (also the permanent ID), name and short name; courses additionally require a university and stream. Fill the labelled content sections as evidence becomes available. Advanced JSON is optional for fields without dedicated controls.

**Create draft** saves privately and opens the saved record. Additional details may remain blank; unknown tuition is not converted to zero, and UGC approval is unchecked by default. Complete sources and required public fields before administrator review/publication. The creation UI has no publish control; existing server-side role restrictions and publication validation continue to apply. No migration or environment change is required.

## Save an unfinished revision

On a record’s **Propose or review revisions** page, **Save working draft** stores your unfinished content and reason privately. Required completion fields may remain unfinished. Return to the same record to resume automatically. Each editor/administrator has one separate working draft per record; other staff cannot overwrite it, and viewers cannot save drafts.

**Submit for review** validates the completed content, checks that the catalog still matches its original snapshot, creates an immutable revision and removes the working draft in one transaction. Only the existing administrator application step changes the catalog. Another tab’s save produces a conflict instead of overwriting it; reload before continuing, retaining a copy of any unsaved text you need.

If the catalog has changed, you may continue saving your own draft but cannot submit it against stale facts. **Compare or discard your working draft** shows the page’s current catalog snapshot. Copy useful text first, then explicitly discard and prepare a new revision from the latest record. Discarding is version-checked and affects only your draft. There is no automatic merge, scheduled publication or autosave.

Local migration 0007 has been applied; VPS migration remains part of the upgrade commands above. No new environment variable is required.
