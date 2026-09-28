# Existing VPS upgrade: 9c3b95f → this release

Prepared 2026-09-28 for `/opt/unnatify-crm`, branch `main`, Docker Compose in `deploy/vps`. The operator confirmed commit `9c3b95f` and a database ledger ending at `0023_external_integrations.sql`, with `base:base-schema.sql` applied. This guide preserves the existing database, uploads, credentials and Compose project. It is not a fresh installation.

**Run commands one line at a time and stop on any error.** Build failures before the maintenance step leave the old application running. Do not run `docker compose down -v`, remove named volumes, reset the database, re-seed production, overwrite `.env`, or use the old first-install/wipe guide.

No push or VPS deployment was performed by the code review. Push the reviewed local changes to `main` before step 2. Keep the target Git commit in your release record. The local checkout contains many earlier changes; review the staged diff rather than blindly committing every untracked audit artifact.

## 1. Record and preserve the old deployment

```bash
cd /opt/unnatify-crm
```

```bash
git status --short
```

Resolve any unexpected local edits before pulling; do not discard them. Backups and `.env` should remain untracked/ignored.

```bash
git rev-parse HEAD
```

```bash
umask 077
```

```bash
UPGRADE_STAMP=$(date -u +%Y%m%dT%H%M%SZ)
```

```bash
RELEASE_BACKUP="$HOME/crm-upgrade-backups/$UPGRADE_STAMP"
```

```bash
mkdir -p "$RELEASE_BACKUP"
```

```bash
cp deploy/vps/.env "$RELEASE_BACKUP/env.before"
```

```bash
cp deploy/vps/docker-compose.yml "$RELEASE_BACKUP/compose.before.yml"
```

```bash
git rev-parse HEAD > "$RELEASE_BACKUP/git.before.txt"
```

```bash
docker compose -f deploy/vps/docker-compose.yml --env-file deploy/vps/.env ps
```

This must show your existing services. If it shows no containers, stop: a different Compose project/path is in use. Do not create a new project over empty volumes.

Keep old built images before building new ones (this is one command):

```bash
for service in web worker unnatividya-web unnatividya-crm-worker ml-service; do container=$(docker compose -f deploy/vps/docker-compose.yml --env-file deploy/vps/.env ps -aq "$service"); if [ -n "$container" ]; then docker image tag "$(docker inspect --format '{{.Image}}' "$container")" "crm-rollback-$service:$UPGRADE_STAMP" || break; fi; done
```

Do not prune Docker images during this upgrade. Keep the same terminal open so the backup variables remain available.

## 2. Pull, check environment and build while the old app is still running

```bash
git pull --ff-only origin main
```

```bash
git rev-parse HEAD > "$RELEASE_BACKUP/git.target.txt"
```

```bash
python3 deploy/vps/scripts/check-upgrade-env.py --add-safe-defaults
```

It must end with "Required environment keys are present". If it stops with `Missing/placeholder values (values hidden): ML_SERVICE_SECRET`, create one (this release's ML service refuses to start without it; the CRM web/worker read the same `.env` value, so nothing else needs changing):

```bash
cp deploy/vps/.env "$RELEASE_BACKUP/env.before-ml-secret"
```

```bash
sed -i '/^ML_SERVICE_SECRET=/d' deploy/vps/.env
```

```bash
printf 'ML_SERVICE_SECRET=%s\n' "$(openssl rand -hex 32)" >> deploy/vps/.env
```

```bash
python3 deploy/vps/scripts/check-upgrade-env.py --add-safe-defaults
```

If it reports `UNNATIVIDYA_SESSION_SECRET` missing/placeholder, fix it the same way (the website now refuses to sign admin sessions or lead OTPs with the old built-in development default; setting it logs website admins out once and invalidates OTPs sent in the last 10 minutes):

```bash
sed -i '/^UNNATIVIDYA_SESSION_SECRET=/d' deploy/vps/.env
```

```bash
printf 'UNNATIVIDYA_SESSION_SECRET=%s\n' "$(openssl rand -hex 32)" >> deploy/vps/.env
```

**Do not** generate replacements for `JWT_SECRET`, `POSTGRES_PASSWORD`, `REDIS_PASSWORD` or the database URLs if the helper names them — changing those logs out every CRM user or breaks database/Redis access. Stop and ask instead. A list of "Referenced by docker-compose.yml but not defined" names is informational: each becomes empty in its container, which is fine for optional integrations you don't use (e.g. IndexNow, ZeptoMail).

Environment changes from `9c3b95f`:

- Lead/Opportunity APIs, duplicate rules, Applications and their reminder jobs need **no new required secrets**.
- `UNNATIVIDYA_CMS_SETUP_TOKEN` is newly listed explicitly in Compose. The helper adds it **blank only when absent**, disabling one-time website admin setup. It leaves any existing value untouched. Existing website admins continue to log in.
- The helper checks required keys and reports only missing key names, never values. It keeps a timestamped `.env` backup before adding the blank default.
- Preserve `JWT_SECRET`, database/Redis passwords and any existing `MARKETPLACE_SECRET_ENCRYPTION_KEY` / `FILE_DOWNLOAD_SIGNING_SECRET`. Changing encryption/signing keys can invalidate existing secrets or signed links. Do not generate replacement values as part of this upgrade.
- Leave `ENFORCE_TENANT_RLS` and `TENANT_DATABASE_URL` as currently configured. This deployment does not opt into the separate staged RLS rollout.
- AI provider credentials are tenant settings stored in the database. Local Groq settings do not automatically appear on the VPS. Configure/test them in the production workspace if they were never saved there; do not copy the local development database over production.

Validate Compose without printing resolved credentials:

```bash
docker compose -f deploy/vps/docker-compose.yml --env-file deploy/vps/.env config --quiet
```

```bash
df -h
```

Allow space for old/new images plus database and uploaded-file backups. Then build all application services:

```bash
docker compose -f deploy/vps/docker-compose.yml --env-file deploy/vps/.env build web worker unnatividya-web unnatividya-crm-worker ml-service
```

**Stop if any build fails.** Docker is unavailable in the local review environment; this is the required check of the actual Node 20/Linux images. Local production builds are not a substitute for this gate.

## 3. Maintenance window and backups

This step starts downtime for both CRM and the public website. Stop all application writers, keeping Postgres and Redis running for the backup:

```bash
docker compose -f deploy/vps/docker-compose.yml --env-file deploy/vps/.env stop web worker unnatividya-web unnatividya-crm-worker ml-service caddy
```

```bash
bash deploy/vps/scripts/backup-upgrade.sh "$RELEASE_BACKUP/checkpoint"
```

The helper checks that app writers are stopped, dumps the CRM and configured Unnati Vidya database, validates dump readability, saves role definitions and `.env`, copies `/app/storage` from the existing stopped web container and writes checksums. It never prunes or restores data. Backup directories are private; they contain credentials and customer data.

```bash
cd "$RELEASE_BACKUP/checkpoint"
```

```bash
sha256sum -c SHA256SUMS
```

```bash
cd /opt/unnatify-crm
```

Keep a protected off-server copy of `$RELEASE_BACKUP` before proceeding. A checksum/listing is not a restore rehearsal. The existing `deploy/vps/scripts/verify-backup-restore.sh` can restore a dump into a temporary verification database; run it before migration if this server's backup restoration has not been rehearsed:

```bash
bash deploy/vps/scripts/verify-backup-restore.sh "$RELEASE_BACKUP/checkpoint/crm.dump"
```

## 4. Check data, reconcile networks, then migrate

Read-only data check (changes nothing). All three rows must show `violations = 0`; if any is non-zero, stop — that migration would fail on your existing data:

```bash
docker compose -f deploy/vps/docker-compose.yml --env-file deploy/vps/.env exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < deploy/vps/scripts/preflight-upgrade.sql
```


This release splits Compose's old shared default network into explicit networks. Recreate/reconcile Postgres and Redis **with their existing named volumes and the same project name** before starting a new migration container:

```bash
docker compose -f deploy/vps/docker-compose.yml --env-file deploy/vps/.env up -d --wait postgres redis
```

```bash
docker compose -f deploy/vps/docker-compose.yml --env-file deploy/vps/.env run --rm --no-deps web node scripts/db-migrate-local.js --upgrade
```

`--upgrade` requires the existing Tenant table and migration ledger, refuses checksum drift and uses an advisory lock to prevent simultaneous migration runs. It never restores or re-baselines the bootstrap dump, never drops the schema, and does not change the runtime role's BYPASSRLS or schema ownership. It grants table/sequence access needed for new objects. Each pending migration commits separately; a failure stops the run but does not undo previously successful migrations.

The older runner incorrectly re-baselined every migration whenever the bootstrap path was set. As a result your ledger shows `0020`–`0023` as APPLIED, but their tables were never created (advanced predictive scoring, marketing campaigns, the form-submission→opportunity link and external integrations — those features could not have worked on this server). **Expect the first four lines of output to be:**

```text
Repaired 0020_advanced_predictive_scoring.sql (ledger said APPLIED but its objects were missing; migration executed now)
Repaired 0021_marketing_communications.sql (...)
Repaired 0022_form_submission_opportunity_link.sql (...)
Repaired 0023_external_integrations.sql (...)
```

followed by `Applied 0024_...` through `Applied 0117_duplicate_rules_performance.sql` and `Migration complete. Checked 118 migration files.` The repair only runs when the ledger says APPLIED *and* the object is provably absent. This exact sequence was rehearsed on a database built by the `9c3b95f` code itself; afterwards its schema was identical to a fresh install of this release. **Do not run an older image's migration command.** Do not change migration ledger checksums or mark missing migrations applied to silence a failure.

```bash
docker compose -f deploy/vps/docker-compose.yml --env-file deploy/vps/.env run --rm --no-deps web node scripts/check-migrations-applied.js
```

The check must pass before starting the new app. There are 94 new migration files relative to `9c3b95f` (118 SQL files in total). The expected last migration is `0117_duplicate_rules_performance.sql`.

Then run the website's own migrations. This release adds `0003_admin_session_security.sql` (two additive columns on `cms_user` for admin session revocation); expect `Applied 0003_admin_session_security.sql`:

```bash
docker compose -f deploy/vps/docker-compose.yml --env-file deploy/vps/.env run --rm --no-deps unnatividya-web node scripts/db-migrate-local.js
```

## 5. Start and verify

```bash
docker compose -f deploy/vps/docker-compose.yml --env-file deploy/vps/.env up -d --wait
```

```bash
docker compose -f deploy/vps/docker-compose.yml --env-file deploy/vps/.env ps
```

```bash
curl --fail --show-error https://app.unnatify.com/api/health
```

```bash
curl --fail --show-error https://api.unnatify.com/api/health
```

```bash
docker compose -f deploy/vps/docker-compose.yml --env-file deploy/vps/.env logs --tail=100 web worker unnatividya-web unnatividya-crm-worker ml-service
```

Expect healthy web/database services, successful worker registration and no missing-table/column or repeated authentication errors. Health only checks a database query; also sign in, open Leads/Opportunities/Applications, download an existing private file, open the public website and test the API examples with explicitly labelled test records. Review provider/connector settings before triggering outbound workflows. New application-document reminders remain disabled until a user opts in; duplicate rules start with no configured rules.

Behaviour changes users will notice:

- **Website admins are signed out once** (the session format now carries an issue time so sessions can be revoked). They sign in again normally.
- **Website lead form** now shows a required consent checkbox before "Save and send OTP"; lead submission, OTP send/verify and admin login are rate-limited per IP.
- **Website first-admin setup** (`/admin/setup`) is disabled while `UNNATIVIDYA_CMS_SETUP_TOKEN` is blank. Existing admins are unaffected.
- **CRM Settings → Duplicate rules** is new and starts empty; nothing is blocked until an administrator creates a rule.

API instructions: [CRM_CREATE_API.md](CRM_CREATE_API.md).

## Failure recovery

- Before migration: the database is unchanged. The old containers/images remain available; restore the saved Compose configuration and environment if needed, using the same project and volumes. If no network reconciliation occurred, `docker compose start` with the old definition resumes the stopped old containers.
- During/after migration: keep writers stopped. Save the failing migration name and server logs. Because migrations commit individually, first assess whether a forward fix and rerun is appropriate. Do not automatically roll the code back across dozens of schema changes.
- Full rollback may require the protected database **and** file checkpoint, matching old images tagged `crm-rollback-<service>:<stamp>`, old Compose/network definition and old environment. Restoration overwrites current data and must account for any post-upgrade writes; there is deliberately no automatic destructive restore command in this guide.
- Redis volumes are preserved. A database rollback also needs review of queued jobs before workers resume, so queued tasks do not act on reverted records.

Never run a volume deletion or production restore merely to fix a failed build or an `.env` warning.
