# VPS Deployment Runbook — Unnatify CRM

This is a complete, start-to-finish runbook for taking this app from "nothing running"
(or "a different app running") on your VPS to a live, HTTPS-secured deployment at
`app.unnatify.com` (frontend + same-origin `/api/*`) and `api.unnatify.com` (an additional
public entry point into the same API).

**Scope note:** I do not have SSH/remote access to your VPS. Every command below is meant
to be run *by you* (as `root` or your `deploy` user, as indicated) over your own SSH
session. Read a section fully before running it — several steps are destructive
(removing the old app) or hard to reverse (DNS, first-time secrets).

## Architecture

This app is a single Next.js 16 process — pages and `/api/*` routes are the same
codebase, not separate frontend/backend services. The deployment stack (already checked
into this repo under `deploy/vps/`) is:

```
Internet
   │
   ├── app.unnatify.com ──┐
   │                       ├──► Caddy (ports 80/443, automatic Let's Encrypt TLS)
   └── api.unnatify.com ──┘         │
                                     ▼
                              web (Next.js, :3000, internal only)
                                     │
                        ┌────────────┼────────────┐
                        ▼            ▼            ▼
                   postgres      redis        (local disk)
                   (own data)   (BullMQ)      app-storage volume
                                     ▲
                                     │
                                worker (BullMQ job processor —
                                automations, task reminders, report
                                rollups/schedules, communications
                                outbox, export file generation)
```

Both domains reverse-proxy to the **same** `web` service (see `deploy/vps/caddy/Caddyfile`).
The app's own frontend keeps calling relative `/api/...` paths (same-origin, via
`app.unnatify.com`); `api.unnatify.com` is just an additional public hostname that reaches
the identical `/api/*` routes, useful if you ever want a cleaner URL to hand to external
integrations/webhooks. No CORS or cross-domain cookie configuration is needed because of
this choice.

Everything (Postgres, Redis, the app, the worker, Caddy) runs as Docker containers on one
VPS via Docker Compose — there is no external managed database dependency.

## Prerequisites

- A VPS with a `root` user and a `deploy` user (sudo-capable), both already set up (per
  your message).
- DNS control for `unnatify.com` (to point `app` and `api` subdomains at the VPS) — **on
  this VPS, both subdomains already resolve here from a prior deployment; see Part 6.**
- Your VPS's public IPv4 (and IPv6 if you have one) address.
- This git repository accessible from the VPS (a deploy key, PAT, or `git clone` over
  HTTPS with credentials — your call in Part 4).

---

## Part 1 — Discover what's currently running (do this before touching anything)

SSH in as `root` or `deploy` (whichever has the access) and run every command below.
**Do not delete/stop anything yet** — this is pure reconnaissance so you have a clear
picture of everything on the box before wiping it.

```bash
# What's listening on the web ports?
sudo ss -tlnp | grep -E ':80|:443|:3000|:8080'

# Docker: what containers/projects exist?
docker ps -a
docker compose ls 2>/dev/null   # newer Docker Compose v2 tracks projects here

# systemd: any other native services?
systemctl list-units --type=service --state=running | grep -viE 'ssh|cron|systemd|dbus|network|resolved|journald|logind|udev|polkit'

# PM2: any Node apps managed by PM2?
command -v pm2 >/dev/null && pm2 list

# Nginx or Apache reverse proxy?
command -v nginx >/dev/null && sudo nginx -T 2>/dev/null | grep -E 'server_name|proxy_pass|listen'
command -v apache2 >/dev/null && sudo apache2ctl -S 2>/dev/null

# Existing crontabs that might restart/monitor the old app
sudo crontab -l -u root 2>/dev/null
sudo crontab -l -u deploy 2>/dev/null

# What's actually installed under common deploy roots?
ls -la /opt /srv /var/www /home/deploy 2>/dev/null
```

**Decision made (confirmed with you directly): full wipe, no backups.** You don't need
anything from the old app's code or database — Part 2 below deletes all of it outright
(containers, volumes, images, code directory). Nothing is archived or dumped first. Treat
the VPS as if you were starting on a brand-new box, minus the OS reinstall.

### What we actually found on this VPS

Running the Part 1 commands turned up a concrete, already-running deployment — not an
unrelated app:

- **It's a previous deployment of this same product** — Docker Compose project
  `unnatify-crm` at `/opt/unnatify-crm`, containers `unnatify_backend` (:4000, internal
  only), `unnatify_frontend` (:3000, internal only), `unnatify_workers`,
  `unnatify_postgres` (:5432, internal only), `unnatify_redis` (:6379, internal only) —
  all `Up 2 days (healthy)`, created 7 weeks ago. It was built with an older
  frontend/backend-split architecture, unlike the current single Next.js app.
- **Nginx** (not Caddy) is already bound to `0.0.0.0:80`/`0.0.0.0:443`, with certs
  "managed by Certbot," reverse-proxying:
  - `api.unnatify.com` → `http://127.0.0.1:4000` (old backend)
  - `app.unnatify.com` → `http://127.0.0.1:3000` (old frontend)
- **DNS for both domains is already correctly pointed at this VPS** — Certbot couldn't
  have issued those certs otherwise. **Part 6 (DNS) below is already done** — nothing to
  change there.
- **`fail2ban` is already installed and active.** Skip that part of Part 3.
- **No crontab entries exist yet** on `root` or `deploy` — the backup automation in
  Part 8 still needs to be set up.
- Docker Compose's project bookkeeping (`docker compose ls`) tracked the old stack under
  the name `unnatify-crm`, but its `docker-compose.yml` file itself is **not** sitting
  directly at `/opt/unnatify-crm` — running `docker compose down` from that directory
  fails with `no configuration file provided: not found`. Part 2.2 below locates the
  real file (or, since we're wiping everything anyway, just kills the containers
  directly by name/ID instead of depending on finding it).

**Nginx vs. Caddy:** this repo's checked-in `deploy/vps/` scaffold is built around Caddy
(automatic Let's Encrypt renewal, no manual Certbot cron job to maintain, and the
security headers I added in `deploy/vps/caddy/Caddyfile` are already wired up there).
Part 2 below removes Nginx entirely and lets Caddy own ports 80/443 directly, matching
how the rest of this runbook (and the repo) already assumes things are wired. Caddy will
request its own fresh Let's Encrypt certificates the first time it starts — it does not
reuse Certbot's existing ones, and that's expected, not an error.

## Part 2 — Wipe the old app completely (no backups)

**No backups are taken in this section — this is a deliberate, confirmed decision.**
Everything from the old deployment (containers, images, volumes/data, code directory)
gets deleted outright. Treat the rest of Part 2 as "reset this VPS to a blank slate,"
not "migrate off the old app carefully."

### 2.1 Stop and remove every Docker container, volume, and network

The old stack's `docker-compose.yml` isn't sitting directly at `/opt/unnatify-crm` (that's
why `docker compose down` from that directory fails with `no configuration file provided:
not found`) — but since nothing here needs to be preserved, there's no need to hunt for
it. Just remove the containers directly by name, then nuke everything Docker-wide:

```bash
# Stop + remove the old app's specific containers (ignore "No such container" if a
# name doesn't match — container names can vary slightly, docker ps -a above shows
# the real ones)
docker stop unnatify_backend unnatify_frontend unnatify_workers unnatify_postgres unnatify_redis 2>/dev/null
docker rm -f unnatify_backend unnatify_frontend unnatify_workers unnatify_postgres unnatify_redis 2>/dev/null

# Confirm nothing is left running
docker ps -a

# Full wipe: every stopped container, every unused image, every volume (this deletes
# the old database's data on disk), every unused network, and the build cache.
docker system prune -a --volumes -f

# Confirm Docker is now a clean slate
docker ps -a
docker volume ls
docker images
```

`docker system prune -a --volumes -f` is intentionally broad — it removes *all* Docker
state on the box, not just the old app's, which is exactly "start fresh like a new VPS."
Since nothing needs to survive, this is safe here; don't run it on a VPS with other
containers you still care about.

### 2.2 Stop and purge Nginx (Caddy needs ports 80/443)

Since we're not preserving anything, fully remove Nginx/Certbot rather than just
stopping them:
```bash
sudo systemctl stop nginx
sudo systemctl disable nginx
sudo apt purge -y nginx nginx-common certbot python3-certbot-nginx
sudo apt autoremove -y
sudo rm -rf /etc/letsencrypt /etc/nginx
sudo ss -tlnp | grep -E ':80|:443'   # should now print nothing
```

### 2.3 Delete the old app directory

```bash
sudo rm -rf /opt/unnatify-crm
```
Part 4 below clones the new repo fresh into `/opt/unnatify-crm`.

### 2.4 (Reference) Generic removal patterns for other setups

If you ever need to repeat this process elsewhere and find a systemd service or PM2
process instead of Docker Compose:

**systemd:**
```bash
sudo systemctl stop <old-service>
sudo systemctl disable <old-service>
sudo rm /etc/systemd/system/<old-service>.service
sudo systemctl daemon-reload
```

**If it's PM2:**
```bash
pm2 stop <old-process>
pm2 delete <old-process>
pm2 save
```

**If Apache is in the way instead of Nginx:**
```bash
sudo systemctl stop apache2
sudo systemctl disable apache2
```
Whichever web server it is, this CRM's deploy uses **Caddy**, so it needs to end up
owning ports 80/443 alone — confirm with `sudo ss -tlnp | grep -E ':80|:443'` that nothing
else is bound to them before moving on.

---

## Part 3 — Prepare the VPS

Already confirmed done on this VPS: `fail2ban` is installed and active, and Docker is
already installed (skip 3.4 and 3.5 below — just verify with `docker compose version`).
The rest — firewall rules, SSH hardening, swap — still apply as written. All of this runs
as `root` (or via `sudo`).

### 3.1 OS updates and baseline packages

```bash
apt update && apt upgrade -y
apt install -y curl git ufw fail2ban unattended-upgrades ca-certificates
```

### 3.2 Firewall (ufw)

```bash
ufw default deny incoming
ufw default allow outgoing
ufw allow OpenSSH       
ufw allow 80/tcp
ufw allow 443/tcp
ufw enable
ufw status verbose
```

Do **not** open 5432 (Postgres) or 6379 (Redis) — both only need to be reachable from
other containers on the Docker Compose network, never from the internet. The compose
file already keeps them un-published (no `ports:` mapping to the host), so this is
belt-and-suspenders.

### 3.3 SSH hardening (recommended, do carefully so you don't lock yourself out)

Since you already have a `deploy` user with sudo:
```bash
# Test that `deploy` can sudo and that SSH key auth works for it BEFORE disabling
# root/password login — open a second terminal and confirm you can log in as
# `deploy` before touching sshd_config.
sudo -u deploy -i
exit

sudo nano /etc/ssh/sshd_config
```
Set:
```
PermitRootLogin no
PasswordAuthentication no
```
Then:
```bash
sudo systemctl restart sshd
```
Verify you can still SSH in as `deploy` with your key from a **new** terminal window
before closing your current session.

### 3.4 fail2ban (basic SSH brute-force protection)

```bash
systemctl enable --now fail2ban
fail2ban-client status sshd
```

### 3.5 Docker + Docker Compose plugin

```bash
curl -fsSL https://get.docker.com | sh
usermod -aG docker deploy
```
Log out and back in as `deploy` (or run `newgrp docker`) for the group change to take
effect, then verify:
```bash
docker run --rm hello-world
docker compose version
```

### 3.6 Swap file (recommended if the VPS has < 4 GB RAM)

Postgres + Redis + the Next.js build step can be memory-hungry. If you don't already
have swap:
```bash
fallocate -l 2G /swapfile
chmod 600 /swapfile
mkswap /swapfile
swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
```

---

## Part 4 — Get the code onto the VPS

As the `deploy` user:

```bash
sudo mkdir -p /opt/unnatify-crm
sudo chown deploy:deploy /opt/unnatify-crm
cd /opt/unnatify-crm
git clone https://github.com/arjunharish77/crm-new.git .      # clones directly into /opt/unnatify-crm; use a deploy key or a scoped PAT, not your personal password
```

The pushed GitHub repo (`crm-new`) is the Next.js app root itself — `package.json`,
`Dockerfile`, `deploy/vps/docker-compose.yml`, etc. all live directly at the repo root,
**not** under a nested `crm/` subfolder (that nested layout only exists in the local
working copy this app was developed in, one level up in a separate parent monorepo that
was never pushed). So cloning lands the app directly at `/opt/unnatify-crm` — all paths
in the rest of this doc are relative to that directory, with no `/crm` suffix. Always run
`docker compose` commands from `/opt/unnatify-crm` itself, since that's where
`deploy/vps/docker-compose.yml`'s `context: ../..` resolves back to (two levels above
`deploy/vps/`).

---

## Part 5 — Configure secrets

```bash
cd /opt/unnatify-crm
cp deploy/vps/.env.example deploy/vps/.env
chmod 600 deploy/vps/.env
nano deploy/vps/.env
```

Generate strong random secrets for every `replace-with-a-long-random-*` placeholder:
```bash
openssl rand -hex 32
```
Run that once per secret (`POSTGRES_PASSWORD`, `REDIS_PASSWORD`, `JWT_SECRET`,
`AUTOMATION_CRON_SECRET`, `TASKS_CRON_SECRET`, `REPORTING_CRON_SECRET`,
`COMMUNICATIONS_CRON_SECRET`, `COMMUNICATIONS_WEBHOOK_SECRET`, `WEBHOOK_SIGNING_SECRET`)
— use a **different** random value for each, never reuse one secret across multiple vars.

Set these specifically:
```
APP_DOMAIN=app.unnatify.com
API_DOMAIN=api.unnatify.com
ACME_EMAIL=<a real email you control — Let's Encrypt sends renewal-failure notices here>

POSTGRES_DB=crm
POSTGRES_USER=crm_app
POSTGRES_PASSWORD=<generated>

DATABASE_URL=postgresql://crm_app:<same generated POSTGRES_PASSWORD>@postgres:5432/crm
DIRECT_DATABASE_URL=postgresql://crm_app:<same generated POSTGRES_PASSWORD>@postgres:5432/crm
REDIS_URL=redis://:<generated REDIS_PASSWORD>@redis:6379

JWT_SECRET=<generated>
NODE_ENV=production
AUTH_DEBUG=false
NEXT_PUBLIC_API_DEBUG=false
```
Leave `DATABASE_SSL=false` as-is — the Postgres connection stays entirely inside the
Docker Compose private network, never crossing the public internet, so TLS there would
be redundant.

**Do not commit `deploy/vps/.env`.** It's covered by the repo's root `.gitignore` (`.env*`
pattern) — verify with `git status` that it shows as untracked/ignored, never staged.

---

## Part 6 — DNS

**Already done** — Part 1's discovery confirmed both `app.unnatify.com` and
`api.unnatify.com` already resolve to this VPS (that's how the old Nginx setup got valid
Certbot certificates for them). Nothing to change here; skip straight to Part 7. Keeping
this section for reference in case you ever repoint these domains or add a new one:

```
app.unnatify.com.   A   <VPS_IPV4>
api.unnatify.com.   A   <VPS_IPV4>
```

You can double check anytime with `dig +short app.unnatify.com` /
`dig +short api.unnatify.com` from your own machine — both should return the VPS IP. Caddy
will only successfully obtain Let's Encrypt certificates once both records resolve
correctly and ports 80/443 are reachable from the internet.

---

## Part 7 — First build and start

```bash
cd /opt/unnatify-crm
docker compose -f deploy/vps/docker-compose.yml --env-file deploy/vps/.env up -d --build
docker compose -f deploy/vps/docker-compose.yml --env-file deploy/vps/.env ps
```

Watch the logs while everything comes up (Caddy needs a minute to issue certificates the
first time):
```bash
docker compose -f deploy/vps/docker-compose.yml --env-file deploy/vps/.env logs -f
```

Once `web` and `caddy` both show healthy:
```bash
deploy/vps/scripts/healthcheck.sh
curl -sI https://app.unnatify.com/api/health
curl -sI https://api.unnatify.com/api/health
```
Both should return `HTTP/2 200`. Also confirm the security headers landed:
```bash
curl -sI https://app.unnatify.com | grep -iE 'strict-transport|x-frame|x-content-type|content-security|permissions-policy'
```

### 7.1 Apply database migrations

The very first start needs the app's schema (all the checked-in `migrations/*.sql`
files, tracked via the `SchemaMigration` table) applied against the fresh `postgres`
container:

```bash
deploy/vps/scripts/migrate-postgres.sh
```

Since you're starting completely fresh (no existing data to import), the checked-in
numbered migrations alone aren't enough — they assume the pre-migration-system base
schema (`Tenant`, `User`, `Lead`, and everything else that predates the migration
tooling) already exists. This is already handled: `deploy/vps/.env.example` sets
`BASE_SCHEMA_SQL_PATH=db-bootstrap/base-schema.sql`, a schema-only dump baked directly
into the Docker image (see the `db-bootstrap` `COPY` line in the `Dockerfile`) that's
been regenerated from a database with all current migrations applied and validated
end-to-end against a throwaway empty database — it correctly baselines every migration
file so none of them re-run redundantly, and it uses the current schema (`timestamptz`
columns, all tables through migration 0019). As long as you copied `.env.example`
as-is in Part 5, this variable is already set correctly — nothing extra to do here.

### 7.2 Import existing data (not applicable here — you chose to start fresh)

Skip this section entirely for this deployment; keeping it for reference in case a future
migration ever needs it. If you ever do have a `pg_dump -Fc` backup you want to bring in
(a prior VPS, or a Supabase export from before the Postgres migration):
```bash
deploy/vps/scripts/restore-postgres.sh /absolute/path/to/backup.dump
deploy/vps/scripts/healthcheck.sh
```
**Always rehearse this on a throwaway database first** if this is your production cutover
— restore into a scratch Postgres container or a staging VPS, confirm the app boots and
looks correct, *then* do the real cutover restore.

### 7.3 Create the first platform admin login

```bash
docker compose -f deploy/vps/docker-compose.yml --env-file deploy/vps/.env run --rm \
  -e PLATFORM_ADMIN_EMAIL="arjukannu@gmail.com" \
  -e PLATFORM_ADMIN_NAME="Your Name" \
  -e PLATFORM_ADMIN_PASSWORD="$(openssl rand -base64 18)" \
  web node scripts/ensure-platform-admin.js
```
The generated password is printed once to the command output — copy it immediately and
store it in your password manager; it is not recoverable afterward (only a bcrypt hash
is stored). Log in at `https://app.unnatify.com/login` and change the password
immediately via the app once you're in, if you want a memorable one instead.

This script is idempotent — if a platform admin already exists it just reports who, and
does nothing, so it's safe to leave in your notes and re-run without risk.

### 7.4 Confirm the worker is running

```bash
docker compose -f deploy/vps/docker-compose.yml --env-file deploy/vps/.env logs -f worker
```
You should see it register its repeatable jobs (automations, task reminders, report
rollups/schedules, communications outbox) without errors.

---

## Part 8 — Ongoing operations

### Deploying an update

```bash
cd /opt/unnatify-crm
git pull
docker compose -f deploy/vps/docker-compose.yml --env-file deploy/vps/.env up -d --build
deploy/vps/scripts/migrate-postgres.sh   # safe/no-op if there are no new migration files
deploy/vps/scripts/healthcheck.sh
```
`docker compose up -d --build` rebuilds only what changed and restarts `web`/`worker`
with a brief interruption (not zero-downtime — acceptable for a first deployment; ask if
you want a blue-green setup layered on top later).

### Logs

```bash
docker compose -f deploy/vps/docker-compose.yml --env-file deploy/vps/.env logs -f web
docker compose -f deploy/vps/docker-compose.yml --env-file deploy/vps/.env logs -f worker
docker compose -f deploy/vps/docker-compose.yml --env-file deploy/vps/.env logs -f caddy
```
Docker's default log driver grows unbounded over time — add log rotation once, at the
Docker daemon level:
```bash
cat <<'EOF' | sudo tee /etc/docker/daemon.json
{
  "log-driver": "json-file",
  "log-opts": { "max-size": "10m", "max-file": "5" }
}
EOF
sudo systemctl restart docker
```
(This requires recreating existing containers to take effect: `docker compose -f
deploy/vps/docker-compose.yml --env-file deploy/vps/.env up -d --force-recreate`.)

### Backups

Run manually any time:
```bash
deploy/vps/scripts/backup-postgres.sh
```
Automate it daily via the `deploy` user's crontab:
```bash
crontab -e
```
```
0 3 * * * /opt/unnatify-crm/deploy/vps/scripts/backup-postgres.sh >> /opt/unnatify-crm/deploy/vps/backups/backup.log 2>&1
```
Back up the `deploy/vps/backups/` directory itself off-VPS periodically (e.g. synced to
S3/Backblaze/another host) — a backup that only lives on the same machine as the
database doesn't protect you from disk failure or the VPS being lost entirely.

**Rehearse a restore quarterly**, on a scratch environment, not production:
```bash
deploy/vps/scripts/restore-postgres.sh /opt/unnatify-crm/deploy/vps/backups/<latest>.dump
deploy/vps/scripts/healthcheck.sh
```

### Monitoring

At minimum, point an external uptime checker (UptimeRobot, Better Uptime, a cron+curl on
another machine, etc.) at `https://app.unnatify.com/api/health` and
`https://api.unnatify.com/api/health`, alerting on non-200 responses. There's no
in-app APM/error-tracking wired up currently (logging is plain `console.*` to stdout,
captured by Docker) — consider adding Sentry or similar if you want real error
visibility beyond grepping container logs.

### Rollback

If a deploy breaks something:
```bash
cd /opt/unnatify-crm
git log --oneline -10          # find the last known-good commit
git checkout <good-commit-sha>
docker compose -f deploy/vps/docker-compose.yml --env-file deploy/vps/.env up -d --build
```
If a migration is the problem and you need to restore data too, fall back to your most
recent `backup-postgres.sh` dump via `restore-postgres.sh` — this is why the quarterly
restore rehearsal matters: you want the first time you run a real restore under pressure
to not be the first time you've ever run it.

---

## Security hardening summary (already applied in this codebase)

- **Rate limiting**: `/api/auth/login` (20 attempts / 15 min per IP, 5 / 15 min per
  email) and public form submissions (per-form configurable limit, already exposed in
  the form editor UI, now actually enforced) — both backed by Redis, fail open if Redis
  is briefly unreachable.
- **Security headers**: HSTS, `X-Content-Type-Options`, `Referrer-Policy`,
  `Permissions-Policy`, a CSP, and `X-Frame-Options`/`frame-ancestors` are set by Caddy
  for every route **except** the public form-embed pages (`/f/*`, `/public-form/*`,
  `/api/public/forms/*`), which intentionally allow being iframed on third-party sites —
  that's a real, existing feature (`EmbedCodeDialog.tsx`), not an oversight.
- **`/api/health`** no longer leaks the raw exception message in production (only in
  `NODE_ENV=development`).
- **`robots.ts`** disallows all crawling — this is an internal, authenticated CRM.
- **Graceful shutdown**: `SIGTERM`/`SIGINT` now close the Postgres connection pool
  cleanly via `src/instrumentation.ts` before the process exits (relevant for
  `docker compose down`/restarts).
- **Error responses** (`serverError()` in `src/lib/server/http.ts`) already only include
  stack traces/internal detail outside production — confirmed, not changed.

### Known, deliberately-not-changed item

The `token` auth cookie is set with `httpOnly: false`. This is intentional, existing
architecture: the client reads it directly via `js-cookie` to build
`Authorization: Bearer <token>` headers for API calls (see `src/providers/auth-provider.tsx`),
rather than relying on the browser to send it automatically. This means the token is
readable by any JS running on the page, which is a real XSS-exfiltration risk if this app
is ever vulnerable to injected scripts. Converting to a fully `httpOnly` cookie-based auth
flow (server reads the cookie transparently, client never touches the token directly) is
a legitimate follow-up hardening project, but it's a genuine architecture change — not
something to silently flip as part of this deployment. Flagging it here so it's a
deliberate decision, not a forgotten one.

### Recommended, not yet done

- Rotate `JWT_SECRET`/all cron+webhook secrets periodically, and immediately if you ever
  suspect `deploy/vps/.env` was exposed.
- Consider Sentry (or similar) for real error tracking beyond container log greps.
- Consider a blue-green or rolling-restart deploy strategy if brief downtime during
  deploys becomes a problem.
- Revisit the `httpOnly` cookie question above as a dedicated auth-hardening project.
