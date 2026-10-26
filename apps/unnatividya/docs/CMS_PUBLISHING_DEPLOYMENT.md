# CMS publishing deployment

Updated 12 October 2026 (UI redesign, increment 88). On 9 October the owner confirmed the latest repository code has not been pushed to the VPS. This is the **single** procedure for the next existing-VPS upgrade, to use after the intended commit is pushed. Record the VPS commit and migration state before running it; the earlier Wave 0 deployment entry in the progress log has not been independently checked here. See [current release status](CURRENT_STATUS_AND_RELEASE_PLAN.md).

In the intended release, public course data comes from the website database, not `catalog.ts`. Existing VPS catalog records must pass the new validator before that release takes traffic. A structural pass is not official-source verification.

## Existing VPS upgrade: one sequence

This release includes any unapplied website migrations through `0011_guides.sql`: `0004`–`0007` support the catalog/contact-first workflow, `0008` adds marketing consent/newsletter, `0009` adds articles, `0010` adds scheduled article publishing and `0011` adds guides in the CMS. The migration runner decides which are already applied. The release also moves the 26 existing posts into the CMS and changes Caddy for www → apex and the analytics CSP. These are **website** migrations, separate from CRM migrations.

Waves 1–3 added no required `.env` key. The newer Groq recommender requires `GROQ_API_KEY` and `GROQ_MODEL` in the **VPS** `deploy/vps/.env` to enable AI ranking and follow-up classification. Both are server-only; without them, matching and scoped answers still work in standard mode. The local website key does not move to the VPS through Git. `NEXT_PUBLIC_GTM_ID` is no longer read; the site uses the existing `NEXT_PUBLIC_GA_ID` directly. Confirm that its value and the existing ZeptoMail settings are correct before testing analytics or newsletter email. Search Console/Bing verification and IndexNow need their existing configuration only when those services are enabled. Do not paste secrets into logs or chat.

Run these commands **one at a time** from the VPS. Stop if any command fails or the inventory differs unexpectedly. The migration runner prints `Skipped` or `Applied` for every migration, which records the effective website migration state during the upgrade. The backup script backs up both CRM and website databases when `UNNATIVIDYA_POSTGRES_DB` is configured; check its output before migration. By default it retains local backups for 14 days and can prune older ones, so preserve a verified copy of this release backup securely before continuing.

```bash
cd /opt/unnatify-crm
git status --short
git rev-parse --short HEAD
git branch --show-current
```

Resolve unexpected tracked-file changes before `git pull`; keep `deploy/vps/.env` private. Record the commit shown above and compare it with the commit being deployed.

```bash
deploy/vps/scripts/backup-postgres.sh
```

```bash
git pull --ff-only origin main
```

```bash
git rev-parse --short HEAD
```

Before rebuilding the website, edit the private VPS file and add the two lines shown in `deploy/vps/.env.example` with your own key and a model supported by your Groq account. The locally verified model is `openai/gpt-oss-20b`. Save and exit without displaying the file or key in shell history:

```bash
nano deploy/vps/.env
```

```bash
docker compose -f deploy/vps/docker-compose.yml --env-file deploy/vps/.env build unnatividya-web
```

**Node 24 (Wave 5, increment 96):** this release moves every Node image (CRM `web` and `worker`, `unnatividya-web` and `unnatividya-crm-worker`) from Node 20 to `node:24-bookworm-slim`. Build the other three as well, one at a time, and stop if any build fails:

```bash
docker compose -f deploy/vps/docker-compose.yml --env-file deploy/vps/.env build web worker unnatividya-crm-worker
```

The local checks ran on the official Node 24.22.0 macOS build, because Docker isn't available locally, so these VPS builds are the first Linux-image check. Node 24 ships npm 11, which skips dependency install scripts that aren't approved. Four packages are affected (esbuild, fsevents, msgpackr-extract and unrs-resolver); all local checks passed without them. If a build fails on a missing native binary, stop and report it rather than allowing scripts.

```bash
docker compose -f deploy/vps/docker-compose.yml --env-file deploy/vps/.env run --rm --no-deps unnatividya-web node scripts/db-migrate-local.js
```

```bash
docker compose -f deploy/vps/docker-compose.yml --env-file deploy/vps/.env run --rm --no-deps unnatividya-web node scripts/sync-articles-to-db.js
```

The article import inserts missing slugs as published and does not overwrite an existing CMS article. First use on an empty article table should report `Migrated 26 articles as published; kept 0`. A safe rerun reports `Migrated 0 ...; kept 26` if all 26 already exist. Check the total in the CMS; do not switch the new blog reader to traffic if expected articles are absent.

Copy the eligibility and career-scope guides' text into the CMS once (Wave 5 C3). Like the article import, it never overwrites a guide that already has a row. The first run reports `Migrated 34 guides; kept 0`, and a rerun reports `Migrated 0 guides; kept 34`. Until it runs, the guide pages show their built-in text.

```bash
docker compose -f deploy/vps/docker-compose.yml --env-file deploy/vps/.env run --rm --no-deps unnatividya-web node scripts/sync-guides-to-db.js
```

```bash
docker compose -f deploy/vps/docker-compose.yml --env-file deploy/vps/.env run --rm --no-deps unnatividya-web node scripts/check-catalog-ready.js
```

Continue only if that reports `ready: true`, with the intended published inventory (currently three universities and 30 courses). This is a structural check, not official-source certification. Resolve any reported CMS issues without running an old overwrite-style catalog sync.

```bash
docker compose -f deploy/vps/docker-compose.yml --env-file deploy/vps/.env up -d --no-deps unnatividya-web
```

Because the CRM images were rebuilt for Node 24, restart them too:

```bash
docker compose -f deploy/vps/docker-compose.yml --env-file deploy/vps/.env up -d --no-deps web worker unnatividya-crm-worker
```

```bash
docker compose -f deploy/vps/docker-compose.yml --env-file deploy/vps/.env logs --tail=80 unnatividya-web
```

```bash
docker compose -f deploy/vps/docker-compose.yml --env-file deploy/vps/.env exec caddy caddy validate --config /etc/caddy/Caddyfile
```

This release also changes the website's Caddy block. The camera and microphone Permissions-Policy is now set by two path matchers: allowed for this origin on `/tools/exam-check` only (decision V10), and blocked everywhere else. After the reload, check with `curl -sI https://<domain>/tools/exam-check | grep -i permissions-policy` and the same for `/`.

Only if validation succeeds:

```bash
docker compose -f deploy/vps/docker-compose.yml --env-file deploy/vps/.env exec caddy caddy reload --config /etc/caddy/Caddyfile
```

This upgrade does not configure the external CRM endpoint. Groq runs only if its two VPS environment variables are populated. The script above changes no CMS catalog facts; prepared fees, eligibility, curriculum and recognition need separate administrator review/application. The Groq response contract follows the [official structured-output guide](https://console.groq.com/docs/structured-outputs), with strict JSON schema for the verified GPT-OSS model and a standard fallback if the provider fails.

Page wording, layout and other code changes go live with the deployed build; they are not CMS drafts. For content already **submitted for review**, an administrator can open **CMS → Publishing checklist → Publish submitted content** and use **Publish all ready revisions**. The page lists the exact course, university, article and guide revisions included. Scheduled article revisions are left to their schedule (unschedule one to publish it now). The action applies them in one database transaction: a validation failure or changed list publishes nothing. It excludes unfinished working drafts, stale/conflicting proposals, archived records and prepared source files that have not been loaded and submitted. Those remain visible with reasons or in the prepared-update checklist. Do not use this button as a substitute for checking source accuracy before submission.

**Administrators edit and publish in one step (25 October 2026).** Administrators can do everything editors can: create, edit, save drafts and submit. They can also publish their own changes straight away:
- **Catalog:** Courses or Universities → (record) → Catalog revisions → **Save and publish**. It works from a fresh edit or from a saved working draft.
- **Articles:** CMS → Articles → (article) → **Save and publish**. A new article has **Create and publish**.
- **Guides:** CMS → Guides → (guide) → **Save and publish**.

Each asks for confirmation and needs a "what changed and why" note. The change is recorded as a revision reviewed by that administrator, with the note "Published directly by an administrator.", and appears in the history and audit log like any reviewed change, so it can be rolled back the same way. The same checks still apply: a stale edit is refused, and a catalog change that would leave the published catalog invalid publishes nothing. Editors still submit for review. No migration or `.env` change is needed.

The three MBA pages now offer **Load prepared program details** in Catalog revisions. Review the [program-specific evidence and held questions](MBA_PROGRAM_DETAILS_EVIDENCE.md) first. Loading only fills the unsaved proposal; submit one reviewed revision per course before the bulk publish button can include it. No new migration or `.env` key is required for these fields.

For the 18 prepared MUJ/SMU student-category fee blocks, **CMS → Publishing checklist → Review MUJ and SMU applicant-category fees** shows each prospectus and program link, category labels and any blocker. The administrator checks the current session and exclusions, confirms the review checkbox, then uses **Submit fee proposals for review**. This stages one private revision per eligible course in a single transaction; public tuition does not change. Existing category fees, changed Indian base tuition, working drafts and submitted revisions are excluded. Review the exact submitted revisions under **Publish submitted content** before the separate publish action. The 2026–27 prospectus PDF checksums matched the 3 October evidence again on 9 October. This workflow adds no migration or `.env` key. SMU NRI applicability and Amity category prices remain unresolved.

The free `/tools/eligibility-checker` uses only published structured rules. In **Catalog revisions**, seven MUJ/SMU MBA, BBA, BCom and BA courses have **Load prepared checker rules**; review the [pilot evidence and held cases](ELIGIBILITY_CHECKER_PILOT_2026-10-09.md), all applicant categories, accepted routes, thresholds and AIU requirement before submitting. BCom NRI/foreign diploma routes need confirmation. SMU BA's Class 12 route is prepared, but its diploma and NRI/foreign routes are held because official sources differ; the free-text BA draft carries a CMS warning. The CMS editor can create later program rules, defaulting to incomplete so they return **Needs university confirmation** until all academic conditions are sourced. If the eligibility paragraph changes, its older checker rule is removed from the proposal. Applying a reviewed rule updates the tool without a rebuild. Until at least one complete rule is published, the tool is `noindex` and absent from the sitemap. No migration or `.env` setting is needed.

The weekly official-source checker is a separate, draft-only CLI. After deployment, run `bash deploy/vps/scripts/weekly-unnatividya-source-check.sh` once, inspect **CMS → Source imports**, then add the [documented weekly cron entry](WEEKLY_SOURCE_CHECKS_2026-10-09.md) if the results are sound. It does not use the older mutating `source-import.js`, does not create publishable fact changes automatically, and requires no new environment setting or migration.

### Fees by visitor location and Amity's international fees (Wave 5 E)

Visitors in India's time zone see Indian-applicant fees; everyone else sees the NRI fee, or the university's single international fee, wherever one is published. Anyone can change the "Showing fees for" switch. Where no international fee is published, pages say "Confirm the fee for international applicants with the university".

To add Amity's international fees: **CMS → Catalog revisions → (course) → Fees and admission → Student-category fees → Add category fee row**.
1. Enter the official source link, a label and the date you checked it.
2. Add one row per applicant category (for example "International applicants", USD, total, per semester, number of semesters).
3. If you also add an Indian-applicants INR row, it must equal the course's total tuition.
4. Submit, then publish as usual. Each published course updates every fee display without a rebuild.

No migration or `.env` key is needed.

### Scheduled article publishing (Wave 5 C2)

An administrator can schedule a submitted article revision under **CMS → Articles → (article) → Waiting for review → Or publish later**. Enter the date and time in India time and add a review note.
- **When scheduling:** the revision gets the same checks as publishing now (valid content, and the article unchanged since the draft started). It stays "Waiting for review", so it can still be published now, sent back, rescheduled or cancelled.
- **When it is due:** `scripts/publish-scheduled.js` applies it exactly as a manual publish by the administrator who scheduled it, and records it in the audit log.
- **If it is refused** (for example, the article changed in the meantime): the reason is shown on the article page, and it isn't retried until someone schedules it again.

It needs migration `0010_article_schedule.sql`, which the migration step applies, and one cron entry on the VPS, which runs inside the running website container. First run it once by hand; a run with nothing due prints nothing:

```bash
bash deploy/vps/scripts/publish-scheduled-articles.sh
```

Then add this to the VPS user's crontab (every five minutes; `flock` prevents overlapping runs, and the database lock does too):

```
*/5 * * * * /usr/bin/flock -n /tmp/unnatividya-publish.lock /bin/bash /opt/unnatify-crm/deploy/vps/scripts/publish-scheduled-articles.sh >> /opt/unnatify-crm/deploy/vps/scheduled-publish.log 2>&1
```

No new `.env` key is needed. Until the cron entry is added, scheduled revisions simply wait; they never publish by themselves.

### New-batch fees and the Wave 4 article drafts (increments 91–94)

Do these after the restart and the [redesign checks](#redesign-checks-after-restart), in this order. Nothing here changes the public site until an administrator applies it.

1. **Fee corrections first.** In **CMS → Catalog revisions**, for each of the six MUJ programs (MBA, BBA, BCA, MCA, B.Com, MSc Mathematics), use **Load coordinated fee correction**, check it against the official program page listed in [FEE_RECHECK_2026-10-12.md](FEE_RECHECK_2026-10-12.md), submit, then load and submit **Load student-category fees**. Publish them under **Publishing checklist → Publish submitted content**. Until the new fee is published, the category-fee batch holds those six courses back with "Current Indian fee differs from the prepared amount".
2. **Queue the article drafts.** Run once, inside the website container:

   ```bash
   docker compose -f deploy/vps/docker-compose.yml --env-file deploy/vps/.env run --rm --no-deps unnatividya-web node scripts/import-article-drafts.js
   ```

   It queues 20 items for review (Wave 4 hubs C1, C5 and C2, the follow-ups, and the Wave 5 clusters): three new draft articles and seventeen revisions of published posts. A revision is queued only if the live post still has the text the draft was written against, and a rerun queues nothing new. The script prints what it queued and skipped.
3. **Review and apply** each item in **CMS → Articles**, using the review notes: [C1 recognition](content-batches/C1_RECOGNITION_REVIEW_2026-10-12.md) and [C5 online MBA](content-batches/C5_ONLINE_MBA_REVIEW_2026-10-13.md) [C2 cost and financing](content-batches/C2_COST_AND_FINANCING_REVIEW_2026-10-13.md) the [follow-ups](content-batches/FOLLOW_UPS_REVIEW_2026-10-13.md) and the [Wave 5 clusters](content-batches/WAVE_5_CLUSTERS_REVIEW_2026-10-24.md). Apply C5 only after step 1, because its posts quote the new-batch MUJ fees.

No migration or `.env` key is needed. The enriched comparison pages (`/compare/<course>/<pair>`), the fees hub (`/online-degree-guides/fees`) and the rebuilt fee guides are code, so they change with the deployed build. After the restart, open `/online-degree-guides/fees` and check that it lists all 30 programs, and that `/sitemaps/guides.xml` includes it. Open `/online-degree-guides/admissions` and check that it shows the steps for all three universities, and that `/sitemaps/eligibility-guides.xml` includes it. Each applied eligibility correction then appears on its eligibility guide with its checked date ([C3 note](content-batches/C3_ADMISSIONS_REVIEW_2026-10-13.md)).

## UI redesign (increment 88): what changes for the upgrade

**Next.js 16.4.0 (increment 90).** The image rebuild picks up the upgrade from the committed lock files; nothing extra to run. It fixes the image optimizer hang where a visitor leaving a page mid-load could leave that image size pending for everyone until a restart. After deploy, the check under "Images" below should pass without restarts.

The redesign ships with the same build and upgrade sequence above:
- **No new migration and no new `.env` key** in the redesign itself. (Wave 5 adds `0010_article_schedule.sql`; see [Scheduled article publishing](#scheduled-article-publishing-wave-5-c2).)
- **No Caddy change.** The font is self-hosted by `next/font`, and nothing loads from a new external origin. The existing CSP (`font-src 'self' data:`, `style-src 'self' 'unsafe-inline'`) covers the self-hosted font and the inline style attributes used by the match ring and the EMI bar.
- **Browser storage.** The compare list lives in the visitor's own browser (`uv_compare`, at most three programs, empty by default). Nothing is stored server-side.
- **Recognition stays per program.** The UGC/NAAC/AICTE footer badges are labelled university-level, with "How we verify".

Before committing, decide whether to include `apps/unnatividya/design_handoff_unnati_vidya/` (the 384 KB design handoff the redesign was built from). Nothing in the build reads it.

### Redesign checks after restart

In addition to the list below, check each of these on a phone (about 390 px wide) and a desktop:
- **Header:**
  - flat links plus the Guides and Tools dropdowns, search, Saved courses and Apply now;
  - below 1080 px, the menu button opens the panel and Escape closes it;
  - at the narrowest phone width (320 px) the page has no sideways scroll.
- **Home:** the hero search goes to `/courses` with the chosen level and stream. The mobile bottom bar shows only on Home and course pages.
- **Course page:**
  - Apply now, + Compare and Save work;
  - the compare tray appears after adding a program and opens `/compare?add=…`, which stays OTP-gated;
  - "Open EMI calculator" arrives with the course pre-selected.
- **Compare:**
  - before verification, the preview shows no program values in the page source;
  - after verification, Share copies an `?add=` link and Print shows only the table;
  - there is no Best/Lowest highlighting.
- **University page:**
  - the sections run Overview, Programs, Recognition, Admission, Placements, Scholarships, then Before choosing;
  - there is no "Online learners" figure, and placement figures are labelled university-wide.
- **Find my course:**
  - finish the five answers; the URL now carries them;
  - open that URL in a private window: the same results appear, with no lead created;
  - "Start again" clears the answers from the URL.
- **Apply now:**
  - an invalid email shows "Enter a valid email address…" under the field;
  - submitting with gaps focuses the first one and sends nothing;
  - consent stays a single, unticked box.
- **Admin:** sign in, then check the sidebar, a list page, an editor and the mobile menu ("Close menu" fits at 320 px).
- **Images:** pages with photos (blog, articles, university pages) finish loading. During local testing a single AVIF conversion in the image optimizer twice hung until the server restarted. If any `/_next/image` request stays pending in production, record the URL and restart the website container.

## Verify after restart

- Open a course and university page, course discovery, comparison and the EMI tool.
- Confirm the course fee agrees across the detail page, metadata, comparison and tool options.
- In CMS, open **Catalog preview** and check inventory and validation issues.
- Use a dedicated draft/test record to check editor proposal and administrator review. A draft must not appear publicly; applying a revision to a published record changes public values on the next request. Do not use real learner submissions for a deployment smoke test.
- Check `/sitemap.xml` and `/sitemaps/courses.xml`; published URLs only should appear. Interactive comparison remains OTP-gated; editorial comparison articles remain public.
- Confirm `https://www.unnatividya.com/courses` permanently redirects to the apex URL. `/blog` should list the existing 26 posts; inspect an updated article's date and the Content Team byline.
- In CMS, open **Articles**, **Publishing checklist** and **Newsletter**. With your own test address, confirm the newsletter email, opt-in and unsubscribe. Verify one GA4 Realtime visit rather than relying only on a loaded script.
- Open `/recommender`, complete the five choices, and confirm an **AI-assisted order** or a clearly labelled standard fallback. Ask about the second course's fees, then “What about the first one?”; each reply must refer to the selected course and a source. An unrelated question must be declined. No lead should be created by using the tool alone.
- Open `/tools/total-cost?course=mba-muj`. Check that INR tuition is labelled as a listed amount until the relevant category-fee revision is published; choosing international/NRI must show an unavailable fee, not a conversion. After approved category-fee publication, check the source, checked date, original currency and semester amounts. In the EMI calculator, choosing a USD category must disable the INR estimate.
- Open `/tools/eligibility-checker?course=mba-muj`. Before rule publication, it should say **Needs university confirmation** and remain noindex/outside the sitemap. After a reviewed MBA rule is applied, check Indian and NRI/foreign thresholds, 12th-only and unlisted-degree routes, missing CGPA conversion and AIU equivalence. A match must still say that the university makes the admission decision. Confirm mobile form/result layout and no lead creation from using the tool alone.
- From a course with a published applicant-category fee, choose a category and follow **Apply now**. Name, email and phone must remain step 1; step 2 should carry the selected course, university and category. The fee category is validated and stored in the website's preference event, but the external CRM mapping does not yet forward this optional field.

An open browser tab does not receive pushed updates. Reload to fetch current content. Public routes use dynamic reads and never fall back to the code seed. Since October 2026 each server process keeps the last valid published catalog and article list for up to a day and serves it if the database is unreachable or a record stops validating (it logs `[catalog] Serving the last good catalog…`). A restart during an outage still shows the error page. CMS login and readiness stay separate so records can be repaired.

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
node apps/unnatividya/scripts/bulk-publish-smoke.cjs
node apps/unnatividya/scripts/program-details-smoke.cjs
node apps/unnatividya/scripts/contact-first-smoke.cjs
node --import tsx apps/unnatividya/scripts/recommender-smoke.mts
node --import tsx apps/unnatividya/scripts/total-cost-smoke.mts
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
