# Weekly official-source checks — 9 October 2026

The new `scripts/weekly-source-check.js` captures **evidence drafts**, never course copy or public facts. It reads general and structured fee, eligibility, recognition, curriculum, program-detail and intake source URLs from published CMS courses and universities. It permits only HTTPS pages on `onlinemanipal.com`, `amityonline.com`, or `deb.ugc.ac.in`, and skips every other URL. It fetches serially with a 15-second timeout and a 3 MB response limit. HTML comparison ignores scripts, styles and whitespace; PDF comparison uses the document bytes. A first capture or changed hash creates a private `source_import_item` with `NEEDS_REVIEW`. Unchanged captures appear in the import history without another draft. Failed, redirected, oversized and unreadable sources are recorded as failures for manual checking.

The 9 October local CMS audit found **51 monitored source entries across 29 of 30 courses and all three universities**. Amity BBA has only an `api-otp.amityonline.com` source in the published CMS. A search-indexed alternative course URL returned 404 on direct retrieval, so it was not substituted automatically. Find and review a working official BBA page before adding it to the CMS source list. The monitor does not claim complete course coverage until then.

In **CMS → Source imports**, filter or search for `WEEKLY_OFFICIAL_SOURCE`. Open a fetched item, compare the current official page, verify the applicable admission session and any category-specific details, then mark it reviewed or skipped. Use **Catalog revisions** to propose a corrected fact; an administrator must apply that proposal separately. Weekly evidence cannot use **Attach source notes** to bypass review. Source hashes and excerpts are change signals, not verified claims. Dynamic official pages may produce false-positive changes or unreadable results; a human review is required.

After deploying the new image, the operator can run one check manually from the repository root:

```bash
bash deploy/vps/scripts/weekly-unnatividya-source-check.sh
```

Then schedule that same command weekly in the VPS user's crontab. Example for a **UTC-configured VPS**: `0 4 * * 1 /usr/bin/flock -n /tmp/unnatividya-source-check.lock /bin/bash /opt/unnatify-crm/deploy/vps/scripts/weekly-unnatividya-source-check.sh >> /opt/unnatify-crm/deploy/vps/source-check.log 2>&1` runs Mondays at 09:30 IST. Check `timedatectl` and adjust the cron hour if the host is not UTC. The database advisory lock also prevents overlapping runs. A failed source makes the command exit nonzero, so check the log and CMS queue. The script needs the existing `UNNATIVIDYA_DATABASE_URL` passed to `unnatividya-web`; it adds no new environment variable or migration. Scheduling is **not enabled** by the code change alone.

This is not a structured-fact extractor. It does not infer that an HTML change means fees or eligibility changed, and it cannot reliably read JavaScript-only admissions content. The older `scripts/source-import.js` has a separate legacy write path and must not be used as this weekly job.
