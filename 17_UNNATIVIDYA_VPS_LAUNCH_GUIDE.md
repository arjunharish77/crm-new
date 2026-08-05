# Unnati Vidya — VPS Launch Guide

This is the complete, step-by-step path from "code is pushed to git" to "unnatividya.com is
live," plus an exact, verified reference for every environment variable involved — which
ones the code actually reads, and what value to put in each. Everything below was checked
directly against the code (`apps/unnatividya/src`), not assumed.

Companion docs: `deploy/vps/README.md` (quick command reference once you've done this once),
`docs/VPS_DEPLOYMENT.md` (the CRM app's own from-scratch runbook — same VPS, same Caddy
container, same pattern).

---

## Part 0 — Important context before you start

- **Local dev and production use different `.env` files.** Next.js only loads a `.env` file
  from the app's own directory. For local dev that's `apps/unnatividya/.env` (now created —
  see Part 3). For production it's `deploy/vps/.env`, read by Docker Compose via `env_file:`.
  A `.env` sitting at the **repo root** is read by the CRM app, not this one — that's a real
  footgun if you're editing the wrong file expecting it to affect the website.
- **Rotate the ZeptoMail key.** The real key that was sitting in the repo's root
  `.env.example` (and got pasted into this chat) should be treated as exposed. Log into
  ZeptoMail and issue a new key before go-live; use the new one everywhere below.
- **Two real bugs were already found and fixed** in the admin login flow and the VPS
  migration script (see the git log — commits `5833ef4` and `1f13a27`). Make sure whatever
  you deploy is on `1f13a27` or later.

---

## Part 1 — DNS setup for unnatividya.com

Unlike `unnatify.com` (the CRM's domain, already pointed at this VPS from a prior
deployment), `unnatividya.com` is a new domain that needs its own records.

1. **Get the VPS's public IP.** SSH in and run:
   ```bash
   curl -4 ifconfig.me   # IPv4
   curl -6 ifconfig.me   # IPv6, if you have one
   ```
2. **Log into wherever `unnatividya.com` is registered** (registrar or a separate DNS
   provider like Cloudflare) and add:
   ```
   unnatividya.com.       A      <VPS_IPV4>
   www.unnatividya.com.   A      <VPS_IPV4>
   ```
   Add matching `AAAA` records too if you have an IPv6 address. If you're using Cloudflare,
   set the proxy status to **DNS only** (grey cloud) for both records — Caddy needs to
   complete its own Let's Encrypt HTTP-01 challenge directly; Cloudflare's proxy will block
   that unless you switch to DNS-01, which isn't what this Caddyfile is set up for.
3. **Wait for propagation, then verify from your own machine (not the VPS):**
   ```bash
   dig +short unnatividya.com
   dig +short www.unnatividya.com
   ```
   Both must return the VPS's IP before continuing — Caddy will fail to get a certificate
   otherwise, and retry with backoff, which just delays your launch.
4. Ports 80 and 443 must be reachable from the internet on this VPS (they already are, since
   the CRM app is live on the same box/Caddy instance).

---

## Part 2 — Production environment: `deploy/vps/.env`

This file is **not** committed (gitignored). If it already exists (it does, once the CRM
has been deployed at all — it holds that app's real secrets too), **do not overwrite it.**
`cp -n` (no-clobber) refuses to touch an existing destination, so it's safe to run
unconditionally even if you're not sure whether the file is already there:

```bash
cd /opt/unnatify-crm
cp -n deploy/vps/.env.example deploy/vps/.env
```

Below is the exact, correct set of unnatividya-related values for that file. Everything not
listed here (CRM's own `POSTGRES_PASSWORD`, `JWT_SECRET`, etc.) is unrelated to the website
and already covered by the existing CRM runbook.

```bash
# --- Domain / TLS (Part 1 must be done first) ---
UNNATIVIDYA_DOMAIN=unnatividya.com
# ACME_EMAIL is shared with the CRM app's Caddy config -- already set if the CRM is deployed.

# --- Database (separate DB/role from the CRM's) ---
UNNATIVIDYA_POSTGRES_DB=unnatividya
UNNATIVIDYA_POSTGRES_USER=unnatividya_app
UNNATIVIDYA_POSTGRES_PASSWORD=<generate-your-own-see-below>
UNNATIVIDYA_DATABASE_URL=postgresql://unnatividya_app:<same-password-as-above>@postgres:5432/unnatividya

# --- Site identity ---
NEXT_PUBLIC_UNNATIVIDYA_SITE_URL=https://unnatividya.com

# --- Session / auth signing secret (admin cookies + OTP hashing) ---
UNNATIVIDYA_SESSION_SECRET=<generate-your-own-see-below>

# --- One-time admin bootstrap endpoint. Leave true only long enough to run
# create-admin.js once, then flip to false and redeploy (see Part 5, step 3). ---
UNNATIVIDYA_CMS_SETUP_ENABLED=true

# --- Email OTP delivery (admin 2FA + lead email verification). Get a NEW key from
# ZeptoMail -- do not reuse the one that was exposed in this repo/chat. ---
ZEPTOMAIL_API_URL=https://api.zeptomail.in/v1.1/email
ZEPTOMAIL_API_KEY=<real-zeptomail-key>
ZEPTOMAIL_FROM_EMAIL=info@unnatividya.com
ZEPTOMAIL_FROM_NAME=Unnati Vidya

# --- CRM sync worker (separate optional process; leave disabled unless you're
# actually running scripts/crm-sync-worker.js as its own container/cron) ---
UNNATIVIDYA_CRM_SYNC_WORKER_ENABLED=false
UNNATIVIDYA_CRM_SYNC_INTERVAL_MS=60000
UNNATIVIDYA_CRM_SYNC_BATCH_SIZE=25

# --- SEO verification / analytics (see "Where to get these" below) ---
GOOGLE_SITE_VERIFICATION=
BING_SITE_VERIFICATION=
NEXT_PUBLIC_GA_ID=
NEXT_PUBLIC_GTM_ID=

# --- IndexNow (self-issued key, no external account needed -- see below) ---
INDEXNOW_ENABLED=true
INDEXNOW_KEY=<generate-your-own-see-below>
INDEXNOW_KEY_LOCATION=
```

**Generate the three secrets above on the VPS itself** (don't reuse secrets generated
elsewhere, including any shown as examples in chat history):
```bash
openssl rand -hex 32   # UNNATIVIDYA_SESSION_SECRET
openssl rand -hex 24   # UNNATIVIDYA_POSTGRES_PASSWORD
openssl rand -hex 16   # INDEXNOW_KEY
```

**Where to get the SEO/analytics values** (all optional — the site works fine without them,
they just skip the corresponding feature until set):
- `GOOGLE_SITE_VERIFICATION`: Google Search Console → Add property → `unnatividya.com` →
  HTML tag verification method → copy just the `content="..."` value.
- `BING_SITE_VERIFICATION`: Bing Webmaster Tools → Add site → same idea, copy the meta tag's
  content value.
- `NEXT_PUBLIC_GA_ID` / `NEXT_PUBLIC_GTM_ID`: from your Google Analytics 4 property /
  Google Tag Manager container, if you're using them (see `13_UNNATIVIDYA_SEO_MARKETING_RUNBOOK.md`
  §13 for the account-setup list).

### Variables that do NOT exist in the code — do not set these

If you're working from an older draft of this `.env`, the following look plausible but are
**not read anywhere** in `apps/unnatividya` — setting them does nothing, and you can delete
them:

`UNNATIVIDYA_REDIS_URL`, `UNNATIVIDYA_REDIS_PREFIX` (no Redis usage exists in this app),
`UNNATIVIDYA_OTP_CHANNEL`, `UNNATIVIDYA_EMAIL_OTP_PROVIDER` (OTP is hardcoded to email via
ZeptoMail, no provider abstraction), `UNNATIVIDYA_PHONE_OTP_ENABLED`,
`UNNATIVIDYA_PHONE_OTP_PROVIDER` (phone/SMS OTP isn't implemented), `UNNATIVIDYA_CRM_SYNC_ENABLED`,
`UNNATIVIDYA_CRM_AUTO_PUSH_ENABLED`, `UNNATIVIDYA_CRM_API_BASE`,
`UNNATIVIDYA_CRM_LEAD_CAPTURE_SECRET`, `UNNATIVIDYA_CRM_SYNC_SECRETS_MODE`,
`UNNATIVIDYA_CRM_SYNC_ENCRYPTION_KEY` (CRM sync is configured through the admin UI at
`/admin/crm-sync`, which writes to database tables — not through env vars, aside from the
worker toggle/interval/batch-size above), `NEXT_PUBLIC_META_PIXEL_ID`,
`NEXT_PUBLIC_LINKEDIN_PARTNER_ID` (no Meta Pixel or LinkedIn Insight Tag integration exists).

---

## Part 3 — Local dev environment: `apps/unnatividya/.env`

This file has been created for you at `apps/unnatividya/.env` (gitignored, never committed)
with a real generated session secret and IndexNow key, everything else matching local
defaults. `ZEPTOMAIL_API_KEY` is left blank — add a real key there too if you want to
actually test OTP emails locally; without it, OTP requests still work end-to-end (the app
degrades gracefully, per Part 0), you just won't receive a real email.

Restart the dev server after editing it — Next only reads `.env` at process start:
```bash
npm run unnatividya:dev
```

---

## Part 4 — Deploy to the VPS

```bash
cd /opt/unnatify-crm
git pull origin main   # must include commit 1f13a27 or later
```

Bring up the containers (this builds `unnatividya-web` alongside the existing CRM services):
```bash
docker compose -f deploy/vps/docker-compose.yml --env-file deploy/vps/.env up -d --build
docker compose -f deploy/vps/docker-compose.yml --env-file deploy/vps/.env ps
```

Create the Unnati Vidya database/role and apply every migration (idempotent — safe to
re-run; this now uses the tracked migration runner, so it picks up all migration files, not
just the first one):
```bash
deploy/vps/scripts/setup-unnatividya-db.sh
```

Create the first CMS admin (idempotent — skips if the email already exists):
```bash
docker compose -f deploy/vps/docker-compose.yml --env-file deploy/vps/.env run --rm unnatividya-web \
  node scripts/create-admin.js --email you@example.com --password 'a-real-strong-password'
```

Lock down the setup endpoint now that the first admin exists — edit `deploy/vps/.env`:
```
UNNATIVIDYA_CMS_SETUP_ENABLED=false
```
then redeploy just that service:
```bash
docker compose -f deploy/vps/docker-compose.yml --env-file deploy/vps/.env up -d unnatividya-web
```

---

## Part 5 — Verify it's actually live

```bash
dig +short unnatividya.com                          # confirms DNS one more time
curl -fsS https://unnatividya.com/api/health         # app is up
curl -I https://unnatividya.com/sitemap-index.xml    # sitemap is served
curl -s https://unnatividya.com/indexnow-key         # should print your INDEXNOW_KEY value
```

Then in a browser: log in at `https://unnatividya.com/admin/login` with the admin credentials
from Part 4 — since 2FA is on by default, this requires the email OTP step too, so confirm a
real email arrives (proves `ZEPTOMAIL_API_KEY` is actually working in production).

Finally, submit the sitemap:
- Google Search Console → verify the domain using `GOOGLE_SITE_VERIFICATION` → submit
  `https://unnatividya.com/sitemap-index.xml`.
- Bing Webmaster Tools → same, using `BING_SITE_VERIFICATION`.

---

## Part 6 — Ongoing operations

- **Redeploy after a code change:**
  ```bash
  git pull origin main
  docker compose -f deploy/vps/docker-compose.yml --env-file deploy/vps/.env up -d --build unnatividya-web
  ```
- **New migration added later:** re-run `deploy/vps/scripts/setup-unnatividya-db.sh` — it's
  safe to re-run any time, it only applies migrations that haven't been tracked yet.
- **Backups:** `deploy/vps/scripts/backup-postgres.sh` already dumps both the CRM and
  Unnati Vidya databases once `UNNATIVIDYA_POSTGRES_DB` is set.
- **Create another admin, or rotate a password:**
  ```bash
  docker compose -f deploy/vps/docker-compose.yml --env-file deploy/vps/.env run --rm unnatividya-web \
    node scripts/create-admin.js --email new-person@example.com --password 'their-password'
  ```
  (It only creates — it won't overwrite an existing email's password. For a password reset,
  that's a small script gap worth building if/when you need it.)
