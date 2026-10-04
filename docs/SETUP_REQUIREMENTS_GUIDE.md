# What you need to set up and provide

**For:** you, the Unnatify owner/administrator, setting up accounts with outside providers.
**Goes with:** [UI_UX_ROUND_2_PLAN.md](UI_UX_ROUND_2_PLAN.md) (the plan these steps support).
**Date:** 2026-10-04.

This guide lists every account, setting and key the plan needs. For each one it says what to do, step by step, and what to keep at the end. Section 10 is the final checklist.

---

## 0. Read this first

### 0.1 Two kinds of set-up

| Kind | Who does it | Where the values go |
|---|---|---|
| **Platform (you, once)** | You, as the company running Unnatify. One set of credentials serves every customer workspace, e.g. the "Sign in with Google" app, Sentry, the Meta app for Lead Ads. | The server settings file `deploy/vps/.env` on the VPS (sections 1–3), or **Platform admin › Connectors** once that screen exists |
| **Workspace (each customer)** | Each customer connects their own account in the CRM, e.g. their own Razorpay keys, IndiaMART key, Exotel account, WhatsApp number. | Typed into the CRM by the customer's admin (Settings › Channels / Payments / Marketplace) |

For workspace-type items, you only need **test accounts**, so each connector can be proven against the real service before it's released. You enter those test credentials yourself in the CRM when I ask you to test. **Secrets never go through chat or into files I read.**

### 0.2 Keeping secrets safe

- **Never** paste passwords, API keys, tokens or secrets into chat, email or tickets.
- Platform secrets go only in `deploy/vps/.env` on the VPS, and in `crm/.env.local` on your Mac if you test locally. Git ignores both files, and I don't read them.
- Keep a copy of every secret in a password manager (Bitwarden, 1Password or similar), in a vault only you and trusted admins can open.
- Where a provider offers **test** and **live** keys, give test keys first. Live keys only come in when a feature is released.

### 0.3 When each item is needed

The plan runs in waves. You don't need everything now.

| Wave (plan section 8) | Needs from you |
|---|---|
| 0 · Urgent security | Section 1 (two server settings, 10 minutes) |
| 1 · Stability and speed | Nothing |
| 2 · Operations safety | Section 2 (Sentry) and section 3 (GitHub image publishing) |
| 3 · Correct numbers / 4 · Usability | Nothing |
| 5 · Connector framework and messaging | Sections 4–6 (email, SMS, WhatsApp) and the first OAuth app (Google or Microsoft) for testing |
| 7 · New features | Section 7 (payment gateways) |
| 8 · Marketplace connectors | Section 8 (OAuth apps) and section 9 (test accounts), **lead sources first** |

### 0.4 Start the slow ones early

Some providers review your company or app before letting you go live. Start these now, even before the wave that needs them:

| Item | Typical wait | Section |
|---|---|---|
| Meta Business Verification (WhatsApp and Lead Ads) | 2–14 days | 6.1 |
| Meta App Review for Lead Ads (`leads_retrieval`) | 1–3 weeks | 8.3 |
| India SMS DLT registration (entity, then headers and templates) | 3–10 working days | 5.1 |
| Google OAuth app verification (Calendar, Contacts, Drive) | 2–6 weeks | 8.1 |
| Gmail reading (restricted scopes) needs a yearly paid security assessment (CASA) | 4–8 weeks, plus cost | 8.1 |
| LinkedIn Lead Sync API access (application, can be refused) | 2–6 weeks | 8.4 |
| Google Ads API developer token (Basic access) | 1–3 weeks | 8.5 |
| Microsoft publisher verification | 1–5 days | 8.2 |
| Zapier, Make and Pabbly public app review | 2–6 weeks each | 8.12 |
| QuickBooks / Xero production app review | 1–4 weeks | 8.9 |
| Payment gateway live activation (KYC) | 2–10 days each | 7 |
| DigiLocker requester onboarding (government) | 1–3 months | 9.7 |

### 0.5 Addresses you'll give providers

Providers ask for a **redirect (callback) URL** for "Sign in with…" (OAuth) or a **webhook URL** for sending events. These are the planned addresses. I'll confirm each one before you need it.

| Use | Address |
|---|---|
| OAuth redirect, one per provider | `https://app.unnatify.com/api/connectors/oauth/callback/<provider>`, e.g. `.../callback/google`, `.../callback/microsoft`, `.../callback/meta`, `.../callback/linkedin`, `.../callback/slack`, `.../callback/zoom`, `.../callback/calendly`, `.../callback/zoho`, `.../callback/intuit`, `.../callback/xero`, `.../callback/docusign`, `.../callback/dropbox`, `.../callback/mailchimp` |
| Platform-wide webhooks (one per provider app) | `https://app.unnatify.com/api/connectors/webhooks/meta`, `.../webhooks/slack` |
| Per-connection webhooks (email, SMS, WhatsApp, payments, telephony) | Shown in the CRM **after** a connection is added: `https://app.unnatify.com/api/channels/webhooks/<token>` or `https://app.unnatify.com/api/connectors/webhooks/<token>` |
| Privacy policy and terms (most app reviews ask for them) | Your public site's privacy and terms pages, e.g. `https://unnatify.com/privacy` and `https://unnatify.com/terms` (**create these if they don't exist**) |
| App logo | `https://app.unnatify.com/brand/icon-512.png` (in the repo at `public/brand/`) |

---

## 1. Server settings (before the wave 0 deploy)

**From wave 2 the app refuses to start without these** (it logs exactly which one is missing, and the deploy script puts the previous version back): `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET` (32+ characters, not the example value), `MARKETPLACE_SECRET_ENCRYPTION_KEY`, `FILE_DOWNLOAD_SIGNING_SECRET` and `APP_URL`. The steps below set the two new ones; the others are already set.

On the VPS, in the same terminal you use for deploys:

```bash
cd /opt/unnatify-crm
ENV=deploy/vps/.env
set_env() { sed -i "/^$1=/d" "$ENV"; printf '%s=%s\n' "$1" "$2" >> "$ENV"; }
```

### 1.1 Dedicated encryption and signing keys (O1, S19)

Today, stored integration secrets are encrypted with a key derived from `JWT_SECRET`, and signed download links use `JWT_SECRET` too. Copy the **current** `JWT_SECRET` value into two dedicated settings, so everything keeps working and `JWT_SECRET` can later be changed safely:

```bash
grep -q '^MARKETPLACE_SECRET_ENCRYPTION_KEY=' "$ENV" && echo "already set - leave it" || { JWT=$(grep '^JWT_SECRET=' "$ENV" | cut -d= -f2-); set_env MARKETPLACE_SECRET_ENCRYPTION_KEY "$JWT"; unset JWT; echo added; }
grep -q '^FILE_DOWNLOAD_SIGNING_SECRET=' "$ENV" && echo "already set - leave it" || { JWT=$(grep '^JWT_SECRET=' "$ENV" | cut -d= -f2-); set_env FILE_DOWNLOAD_SIGNING_SECRET "$JWT"; unset JWT; echo added; }
```

- **Never change `MARKETPLACE_SECRET_ENCRYPTION_KEY` afterwards** without the re-encrypt script planned in O1. Changing it makes stored integration secrets unreadable.
- **Copy both lines into your password manager.**

### 1.2 First-run setup token (S10)

The "create the first platform admin" page will need a one-time token from the server settings:

```bash
set_env BOOTSTRAP_TOKEN "$(openssl rand -hex 32)"
```

Your platform admin already exists, so this only matters on a fresh install. Keep it in the password manager anyway.

### 1.3 Check

```bash
grep -E '^(MARKETPLACE_SECRET_ENCRYPTION_KEY|FILE_DOWNLOAD_SIGNING_SECRET|BOOTSTRAP_TOKEN|APP_URL|SYSTEM_SMTP_HOST)=' "$ENV" | sed -E 's/=.*/=<set>/'
```

All five should print `=<set>`. (`APP_URL` and `SYSTEM_SMTP_HOST` were done in the last deploy.)

Also check the length of the secrets, without showing them (each should say 32 or more):
```bash
for k in JWT_SECRET MARKETPLACE_SECRET_ENCRYPTION_KEY FILE_DOWNLOAD_SIGNING_SECRET; do printf '%s: ' "$k"; grep -E "^$k=" "$ENV" | tail -1 | cut -d= -f2- | tr -d '\n' | wc -c; done
```

**Provide:** nothing. Just say "section 1 done".

---

## 2. Sentry: error tracking (wave 2)

1. Go to **sentry.io** and sign up (company email). The free "Developer" plan is enough to start; the "Team" plan adds more volume and users.
2. When asked for the data region, pick **EU** or **US**. Error data is stored there, and personal data is scrubbed before sending.
3. Create an **organization**, e.g. `unnatify`.
4. Create two **projects**, platform **Next.js**:
   - `crm-web`;
   - `crm-worker` (platform **Node.js**).
5. In each project open **Settings › Client Keys (DSN)** and copy the **DSN** (it looks like `https://abc123@o123.ingest.sentry.io/456`).
6. Set the alert: in **Alerts › Create alert**, "Issues", choose "When a new issue is created" and "Send a notification to: your email (or Slack later)".
7. Not needed yet: source-map upload (an auth token) isn't set up; errors show the built code's locations, with the stack trace.

**On the VPS:**
```bash
set_env SENTRY_DSN_WEB 'https://…your crm-web DSN…'
set_env SENTRY_DSN_WORKER 'https://…your crm-worker DSN…'
set_env SENTRY_ENVIRONMENT 'production'
```

Then restart web and worker so they pick the settings up (`deploy/vps/scripts/deploy.sh <the running version>`, or `$DC up -d --no-deps --force-recreate web worker`).

The web DSN is used by the server and the browser: the browser reads it at run time from `/api/client-config` and sends its reports through the app (`/api/monitoring`), so nothing about Sentry is baked into the image. Personal data is scrubbed before sending: no cookies, headers (except the browser name), request bodies, query strings, IP addresses or console output; the user is an id only.

**What you'll get:** an email for each new kind of error: server, browser, failed background job (once it has used up its attempts) or a query slower than 5 seconds.

**Provide:** "Sentry done". The DSNs go only in the server file.

---

## 3. GitHub: publishing images and deploying by version (wave 2)

The CRM image will be built and tested by GitHub Actions and published to **GitHub Container Registry (GHCR)**. The VPS then pulls ready-made versions instead of building.

### 3.1 In the GitHub repository (the one holding `crm`)

1. **Settings › Actions › General › Workflow permissions** → select **Read and write permissions** → Save. This lets the workflow publish packages.
2. **Settings › Branches › Add branch protection rule** for `main`:
   - Require a pull request before merging (optional, if you work alone);
   - **Require status checks to pass**: tick the CI checks once they've run at least once (typecheck, lint, tests, build, smoke tests).
3. **Settings › Code security**: turn on **Secret scanning** and **Push protection** (free for public repositories; included with GitHub Advanced Security on private ones). Also turn on **Dependabot alerts**.

CI runs four checks on every push and pull request (`.github/workflows/ci.yml`): **Typecheck, lint, unit tests**; **Migrations, database smoke tests, API regression**; **Secret and dependency scans**; **Docker image (scan; publish on main)**. Tick all four in the branch rule. Code scanning (`codeql.yml`) runs separately: it works on a public repository, and on a private one only with GitHub Advanced Security, so it isn't a required check.

Optional: **Settings › Secrets and variables › Actions › Variables** → `APP_URL` = `https://app.unnatify.com` (the default if unset; used for link-preview images built into the image).

### 3.2 A read-only token for the VPS

1. Your GitHub profile › **Settings › Developer settings › Personal access tokens › Fine-grained tokens › Generate new token**.
2. Name: `unnatify-vps-pull`. Expiration: 1 year (set a calendar reminder to renew).
3. Resource owner: the account or organization that owns the repository.
4. **Permissions:** Account or Organization permissions › **Packages: Read**. Nothing else.
   - If your organization doesn't allow fine-grained tokens for packages, use a classic token with only `read:packages`.
5. Generate, then copy the token.

**On the VPS** (once):
```bash
read -rsp 'GitHub token: ' T; echo; echo "$T" | docker login ghcr.io -u <your-github-username> --password-stdin; unset T
```
It should say `Login Succeeded`. Docker remembers this login.

### 3.3 Switch the server to published images (once)

After the first green CI run on `main`, the image is at `ghcr.io/arjunharish77/crm-new` (from the repository name), tagged `sha-<first 7 characters of the commit>` and `latest`. The run's summary page shows the exact deploy command.

```bash
cd /opt/unnatify-crm && git pull
grep -q '^CRM_IMAGE=' deploy/vps/.env || echo 'CRM_IMAGE=ghcr.io/arjunharish77/crm-new' >> deploy/vps/.env
deploy/vps/scripts/deploy.sh sha-xxxxxxx     # the version from the Actions run
```

### 3.4 Deploying from now on

```bash
cd /opt/unnatify-crm && git pull               # for compose and script changes only; the app comes from the image
deploy/vps/scripts/deploy.sh sha-xxxxxxx       # pull, migrate, start, health-check; puts the previous version back on failure
deploy/vps/scripts/rollback.sh                 # back to the version before
```
Every deploy is recorded in `deploy/vps/.deploy-history`. `$DC build` still works if GitHub is ever unavailable.

**Provide:** "GHCR login done".

---

## 4. Email sending (wave 5, messaging Channels)

You'll send from a domain such as `unnatify.com`, or each customer from their own. Every provider asks you to prove you own the domain with **DNS records**. Do this in your DNS host (GoDaddy, Cloudflare, Route 53, Hostinger…).

### 4.1 DNS basics (all email providers)

| Record | What it does | Note |
|---|---|---|
| **SPF** (TXT on the domain) | Lists services allowed to send for the domain | **Only one SPF record per domain.** Combine providers: `v=spf1 include:zeptomail.in include:amazonses.com ~all` |
| **DKIM** (TXT or CNAME, given by each provider) | Signs mail so receivers trust it | One per provider; add exactly as given |
| **DMARC** (TXT on `_dmarc.yourdomain`) | Tells receivers what to do with failing mail | Start with `v=DMARC1; p=none; rua=mailto:dmarc@yourdomain.com`, move to `p=quarantine` after 2–4 weeks of clean reports |
| **Return-path / bounce** (CNAME, some providers) | Bounce handling and alignment | Add as given |

Tip: send marketing from a subdomain (e.g. `mail.unnatify.com` or `news.unnatify.com`), so the main domain's reputation is protected.

### 4.2 ZeptoMail (Zoho), which you already use

1. **zeptomail.zoho.in** (India data centre) → sign in.
2. **Mail Agents › Add mail agent**, e.g. `crm-test`.
3. **Domains › Add domain** → enter the sending domain → add the **DKIM** and **CNAME (bounce)** records it shows → **Verify**.
4. In the mail agent: **SMTP/API › API** → copy the **Send mail token**.
5. **Webhooks** (in the mail agent): the CRM will show the webhook address once connected; you'll add it here for bounces, opens and clicks.

**Test account provide:** domain verified and a token created. You'll enter the token in the CRM yourself.

### 4.3 Amazon SES

1. **AWS console** → choose the region (e.g. **Asia Pacific (Mumbai) ap-south-1**) → **Amazon SES**.
2. **Configuration › Identities › Create identity › Domain** → enter the domain, choose **Easy DKIM (RSA 2048)** → add the 3 CNAME records → wait for "Verified".
3. **Request production access** (SES starts in a sandbox that only sends to verified addresses): **Account dashboard › Request production access** → describe the use (transactional and opted-in marketing for education enquiries), bounce and complaint handling. Approval takes about 1 day.
4. **Configuration sets › Create** `crm-events` → **Event destinations › Add** → **Amazon SNS** → events Delivery, Bounce, Complaint, Reject, Open, Click → create an SNS topic `ses-crm-events`. The CRM's webhook address is subscribed to this topic later (HTTPS subscription).
5. **IAM › Users › Create user** `ses-crm-sender` → attach a policy allowing only `ses:SendEmail` and `ses:SendRawEmail` → **Security credentials › Create access key** → "Application running outside AWS" → copy the **Access key ID** and **Secret access key**.

**Test account provide:** domain verified (production access requested), and the configuration set name. You enter the keys and region in the CRM.

### 4.4 SendGrid

1. **sendgrid.com** → sign up.
2. **Settings › Sender Authentication › Authenticate your domain** → add the CNAME records → Verify.
3. **Settings › API Keys › Create API key** → **Restricted access** → Mail Send: Full; everything else: no access → copy the key (shown once).
4. **Settings › Mail Settings › Event Webhook** → after connecting, paste the CRM's webhook address, tick all events, turn on **Signed Event Webhook** and copy the **verification key**.
5. Optional, for replies: **Settings › Inbound Parse** → add a host such as `reply.yourdomain.com` (needs an MX record), pointing to the CRM's webhook address.

**Test account provide:** domain authenticated; the key and verification key entered by you in the CRM.

### 4.5 Mailgun

1. **mailgun.com** → sign up → choose the **US** or **EU** region (remember which).
2. **Sending › Domains › Add new domain** (e.g. `mg.yourdomain.com`) → add the TXT, CNAME and MX records → Verify.
3. **Settings › API Keys** → copy the **Private API key**, and the **HTTP webhook signing key**.
4. **Sending › Webhooks** → after connecting, add the CRM's webhook address for delivered, permanent fail, complained, opened and clicked.
5. Optional, replies: **Receiving › Create route** → forward to the CRM's webhook address.

### 4.6 Postmark

1. **postmarkapp.com** → sign up → **Servers › Create server** `crm`.
2. **Sender signatures › Add domain** → add the DKIM and Return-Path records → Verify.
3. The server has two **message streams**: "Default transactional" and a new **Broadcast** stream for marketing.
4. **Server › API Tokens** → copy the **Server API token**.
5. **Webhooks** → after connecting, add the CRM's webhook address (Delivery, Bounce, Spam complaint, Open, Click), with basic-auth credentials the CRM shows you.
6. Optional, replies: **Inbound stream** → set the webhook address.
7. New accounts start "pending approval": request approval in the account (about 1 day).

**Provide for section 4:** the domain(s) you'll send from, and which of the five providers you have test accounts for. You enter keys in the CRM yourself.

---

## 5. SMS (wave 5)

### 5.1 India DLT registration (required for any SMS in India)

TRAI rules require every business sending SMS in India to register on a **DLT platform** (any one operator portal is enough):
- **Jio:** trueconnect.jio.com
- **Vodafone Idea:** vilpower.in
- **Airtel:** dltconnect.airtel.in
- **BSNL:** ucc-bsnl.co.in
- **Tata:** telemarketer.tatateleservices.com

Steps:
1. **Register as Principal Entity (PE):**
   - upload the company PAN, GST (or other business proof) and a letter of authorisation on letterhead;
   - pay the one-time fee (about ₹5,900 including GST on most portals);
   - approval takes 1–7 working days, after which you receive your **Entity ID** (19 digits).
2. **Register Headers (Sender IDs):**
   - **Promotional:** 6 digits, e.g. `567890`.
   - **Transactional / service:** 6 letters, e.g. `UNNATI`, linked to your brand.
   - Approval takes 1–3 days.
3. **Register Content Templates.** Each message text you'll send is registered with variables written as `{#var#}`, e.g. `Dear {#var#}, your application {#var#} is received. - Unnatify`.
   - Choose the type: Promotional, Service Implicit (to existing customers) or Service Explicit (with consent).
   - Each approved template gets a **Template ID** (19 digits).
   - Approval takes 1–3 days.
4. **Link your SMS provider (telemarketer).** On the DLT portal, add your provider (MSG91, Gupshup, Exotel, Kaleyra…) as an authorised telemarketer, or give the provider your Entity ID as they ask.
5. Keep an **export of approved templates** (CSV): Template ID, header, type and text. The CRM's SMS templates store the DLT Template ID.

### 5.2 Providers (test accounts)

| Provider | Steps | What you'll enter in the CRM |
|---|---|---|
| **MSG91** | msg91.com → sign up → complete KYC → **DLT**: add your Entity ID, headers and templates (or import from the DLT portal) → **Flows / Templates**: create a flow per DLT template → **API › Authkey**: create a key → **Webhook**: delivery report URL (from the CRM) | Auth key, sender ID, flow IDs |
| **Gupshup (SMS Enterprise)** | enterprise.smsgupshup.com → account from Gupshup sales → submit the Entity ID and templates → get the **user ID** and **password/API key** → set the delivery-report URL | User ID, password/key |
| **Twilio SMS** | twilio.com → sign up → **Console › Account info**: Account SID and Auth Token → buy a number (outside India) or register an Indian sender through Twilio's India process → **Messaging service** (optional) | Account SID, Auth Token, from number or Messaging Service SID |
| **Exotel** | exotel.com → account (sales) → **Developer settings › API**: API key, API token, Account SID, and the subdomain/region (e.g. `api.exotel.com` or `api.in.exotel.com`) → add the DLT Entity ID and templates in Exotel's SMS settings | API key, token, SID, subdomain |
| **Kaleyra** | kaleyra.io → account → **Developers › API keys**: API key and SID → register the DLT details (entity, headers, templates) in the console | API key, SID |
| **MCube** | mcube.com account manager → request **SMS API documentation** and an API key → send their docs to me (the adapter needs them) | As per their docs |

**Provide for section 5:** your **DLT Entity ID**, the list of approved **headers**, and the **template export (CSV)**. These aren't secret, so they can be shared normally. Also say which providers have test accounts, and send MCube's API documentation.

---

## 6. WhatsApp (wave 5)

### 6.1 Meta WhatsApp Cloud API (direct)

**Before you start:** a **Facebook account** for an admin, your company's legal documents (for Business Verification), a phone number for WhatsApp **not already used on the WhatsApp app** (or delete it from the app first), and a public website with privacy policy.

1. **Meta Business Suite / Business Manager.** Go to **business.facebook.com** → create a business portfolio (if you don't have one) with your legal company name.
2. **Business Verification** (start now, it takes 2–14 days):
   - **Business settings › Security centre › Start verification**;
   - upload the incorporation certificate/GST/PAN and utility bill as asked;
   - verify by domain (DNS TXT or meta-tag on your site), email or phone.
3. **Create the developer app:**
   - **developers.facebook.com › My Apps › Create App** → type **Business** → name `Unnatify CRM` → link the business portfolio;
   - add the products **WhatsApp** and (for section 8.3) **Webhooks**.
4. **WhatsApp › API Setup.** Meta gives you a **test phone number** and a temporary token, enough for development. Note:
   - **Phone number ID** (test number);
   - **WhatsApp Business Account ID (WABA ID)**.
5. **Add your real number** (when ready): **WhatsApp › API Setup › Add phone number** → display name (must match your brand; reviewed in 1–2 days) → verify by SMS or call.
6. **Permanent token (system user):**
   - **Business settings › Users › System users › Add** → name `crm-system`, role **Admin**;
   - **Add assets** → your app (full control) and your WhatsApp account (full control);
   - **Generate new token** → choose the app → permissions **`whatsapp_business_messaging`** and **`whatsapp_business_management`** → expiry **Never** → copy the token.
7. **App secret:** **App settings › Basic** → **App secret** → Show → copy (used to verify webhook signatures).
8. **Webhook** (after the connection exists in the CRM):
   - **WhatsApp › Configuration › Webhook** → callback URL = the CRM's address;
   - **Verify token** = the one the CRM shows;
   - Subscribe to **messages** (statuses and inbound).
9. **Payment method:** **WhatsApp Manager › Payment settings** → add a card (Meta charges per conversation beyond free tiers).
10. **Templates:** created from the CRM later and submitted to Meta automatically. You don't need to create them in Meta's screens.

**You'll enter in the CRM:** WABA ID, phone number ID, system-user token, app secret.
**Provide:** "Business verification approved" (or its status), "app created", the **app ID** (not secret), and the **WABA ID**.

### 6.2 WhatsApp through a BSP (test accounts)

| BSP | Steps | You'll enter in the CRM |
|---|---|---|
| **Gupshup** | gupshup.io → sign up → **WhatsApp › Create app** → connect a number (Gupshup handles Meta onboarding) → **Dashboard › API key** → in the app's settings set the **Callback URL** (from the CRM) and enable message events | API key, app name, source number |
| **Interakt** | interakt.shop → sign up → connect the WhatsApp number (embedded signup) → **Settings › Developer settings** → copy the **API key** → set the webhook URL and enable events | API key |
| **WATI** | wati.io → sign up → connect the number → **API Docs** page → copy the **API endpoint** (your account's own base URL) and **access token** → **Webhooks** → add the URL, events message received and status | Base URL, token |
| **Twilio** | Twilio console → **Messaging › Senders › WhatsApp senders** → register the number (Twilio guides the Meta steps) → **Content Template Builder** for templates → Account SID and Auth Token | Account SID, Auth Token, WhatsApp sender |
| **Engati** | engati.com account → ask your account manager for the **WhatsApp API documentation** and an API key → send the docs to me | As per their docs |
| **MCube** | Ask your MCube account manager for the **WhatsApp API documentation** and an API key → send the docs to me | As per their docs |

**Provide for section 6.2:** which BSPs you have test accounts with, and **Engati's and MCube's API documents**.

---

## 7. Payment gateways (wave 7)

Each customer workspace connects its own gateway. You need **test (sandbox) accounts** to prove each one. Live activation needs that business's KYC.

| Gateway | Test set-up | Webhook | You'll enter in the CRM |
|---|---|---|---|
| **Razorpay** | dashboard.razorpay.com → sign up → stay in **Test mode** → **Account & Settings › API keys › Generate test key** | **Settings › Webhooks › Add**: URL from the CRM, a secret you make up (the CRM can generate one), events `payment_link.paid`, `payment_link.cancelled`, `payment.failed`, `refund.processed` | Key ID, key secret, webhook secret |
| **Cashfree** | merchant.cashfree.com → sign up → **Payment Gateway › Test environment** → **Developers › API keys** | **Developers › Webhooks**: URL from the CRM; payment success/failure; note the signing method | App ID, secret key |
| **PayU** | onboarding.payu.in → **test merchant** (test key and salt are in PayU's developer docs, or ask PayU) | Set webhook / "surl, furl" per PayU's dashboard (the CRM shows the URL) | Merchant key, salt |
| **Stripe** | dashboard.stripe.com → **Test mode** → **Developers › API keys** (publishable and secret) | **Developers › Webhooks › Add endpoint**: URL from the CRM; events `checkout.session.completed`, `payment_intent.payment_failed`, `charge.refunded` → copy the **signing secret** | Secret key, webhook signing secret |
| **Juspay** | Contact Juspay (juspay.in) for a **sandbox merchant** → they provide the merchant ID, API key and documentation | Configure the webhook URL in their dashboard, as they describe | Merchant ID, API key |

**Provide for section 7:** which gateways have test accounts, and Juspay's API documentation once you receive it.

---

## 8. Platform OAuth apps (wave 8: one app per provider, made by you once)

Each of these lets customers click **Connect** and sign in with that provider. For every app:
- use the redirect address from 0.5;
- use your privacy policy and terms pages;
- use the logo from `public/brand/icon-512.png`;
- add support email `support@yourdomain`.

### 8.1 Google (Gmail, Calendar, Contacts, Drive, Google Ads, Classroom, Google Forms, GA4)

1. **console.cloud.google.com** → **Create project** `unnatify-crm`.
2. **APIs & Services › Library** → enable: **Gmail API**, **Google Calendar API**, **People API** (contacts), **Google Drive API**, **Google Forms API**, **Google Classroom API**; for ads also **Google Ads API**; for BigQuery, the **BigQuery API**.
3. **OAuth consent screen:**
   - user type **External**;
   - app name, support email, logo, home page, privacy and terms links;
   - **authorised domain** `unnatify.com`.
4. **Scopes:** add only what's used, per feature:

   | Feature | Scope | Google category |
   |---|---|---|
   | Calendar sync | `calendar.events` | sensitive |
   | Contacts | `contacts` | sensitive |
   | Drive files picked by the user | `drive.file` | non-sensitive (recommended over full Drive) |
   | Send from the rep's mailbox | `gmail.send` | sensitive |
   | **Log received emails** | `gmail.readonly` | **restricted**: needs a yearly third-party security assessment (CASA, paid). **Recommendation:** start with send and calendar; decide on email reading later. |
   | Forms | `forms.responses.readonly` | |
   | Classroom | `classroom.rosters`, `classroom.courses` | |

5. **Credentials › Create credentials › OAuth client ID** → type **Web application** → authorised redirect URI `https://app.unnatify.com/api/connectors/oauth/callback/google` (and `http://localhost:3000/api/connectors/oauth/callback/google` for testing) → copy the **Client ID** and **Client secret**.
6. While in **Testing** status, add test users (up to 100) under **Audience › Test users**.
7. **Publish app › Prepare for verification:** a demo video of each scope in use (I can provide a script once it's built), the privacy policy, and domain verification in **Google Search Console** for `unnatify.com`. Verification takes 2–6 weeks.

**Server:** `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`.

### 8.2 Microsoft 365 (Outlook mail, Calendar, Contacts, OneDrive/SharePoint, Teams, Entra sign-in)

1. **entra.microsoft.com** (Microsoft Entra admin centre) with your Microsoft 365 admin account → **Applications › App registrations › New registration**.
2. Name `Unnatify CRM`; supported accounts: **Accounts in any organizational directory (multitenant)** plus personal accounts if needed; redirect URI type **Web**: `https://app.unnatify.com/api/connectors/oauth/callback/microsoft`.
3. Note the **Application (client) ID**.
4. **Certificates & secrets › New client secret** (24 months) → copy the **Value** (shown once). Set a renewal reminder.
5. **API permissions › Add › Microsoft Graph › Delegated:** `offline_access`, `User.Read`, `Mail.Send`, `Calendars.ReadWrite`, `Contacts.ReadWrite`, `Files.ReadWrite` (OneDrive), `Mail.Read` (only if logging received emails), `ChannelMessage.Send` (Teams notifications) → **Grant admin consent** for your own tenant.
6. **Branding & properties:** logo, terms and privacy links. **Publisher verification:** link a **Microsoft Partner Network (MPN) ID** (create one free in Partner Center), which removes the "unverified" warning on consent screens.
7. For single sign-on (Entra ID) the same app is used; the redirect `.../callback/microsoft-sso` is added later.

**Server:** `MICROSOFT_OAUTH_CLIENT_ID`, `MICROSOFT_OAUTH_CLIENT_SECRET`.

### 8.3 Meta (Facebook/Instagram Lead Ads, Conversions API, Custom Audiences)

Use the same Meta business and app as WhatsApp (6.1), or a second app `Unnatify Lead Sync`.

1. **developers.facebook.com › your app › Add product › Facebook Login for Business** → redirect `https://app.unnatify.com/api/connectors/oauth/callback/meta`.
2. **Webhooks › Page** → callback `https://app.unnatify.com/api/connectors/webhooks/meta` with a verify token (I'll give you one) → subscribe to **leadgen**.
3. **Permissions for App Review:**
   - `pages_show_list`, `pages_read_engagement`, `pages_manage_metadata` and **`leads_retrieval`** (Lead Ads);
   - `ads_management` (Custom Audiences, Conversions);
   - `business_management`.
4. **App Review:** submit each permission with a screencast of the CRM using it (I'll provide the flow once built), plus Business Verification (6.1). Approval takes 1–3 weeks.
5. **Conversions API** for each customer uses their own Pixel/dataset ID and token. Nothing more is needed from you.

**Server:** `META_APP_ID`, `META_APP_SECRET`, `META_WEBHOOK_VERIFY_TOKEN`.

### 8.4 LinkedIn (Lead Gen Forms)

1. **linkedin.com/developers › Create app** → name, your **company LinkedIn page** (must exist, and you must be its admin), logo, privacy link → verify the app with the page.
2. **Auth** tab → redirect `https://app.unnatify.com/api/connectors/oauth/callback/linkedin` → copy the **Client ID** and **Client secret**.
3. **Products** tab → request **Lead Sync API** (and **Advertising API** if offered). Fill in the use-case form; review takes 2–6 weeks and can be declined.

**Server:** `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET`.

### 8.5 Google Ads (lead form extensions and offline conversions)

1. Create a **Google Ads manager account (MCC)** at ads.google.com/home/tools/manager-accounts.
2. In the manager account: **Admin › API Center** → apply for a **developer token** (company details, use case "CRM: import lead form leads, upload offline conversions") → Basic access in 1–3 weeks.
3. OAuth uses the Google app (8.1) with scope `https://www.googleapis.com/auth/adwords`.
4. Lead form webhook (simpler alternative): each customer pastes the CRM's lead webhook URL and key into their Google Ads lead form.

**Server:** `GOOGLE_ADS_DEVELOPER_TOKEN`, `GOOGLE_ADS_LOGIN_CUSTOMER_ID` (the manager account number).

### 8.6 Slack

1. **api.slack.com/apps › Create New App › From scratch** → name `Unnatify CRM`, a development workspace.
2. **OAuth & Permissions:** redirect `https://app.unnatify.com/api/connectors/oauth/callback/slack`. Bot scopes: `chat:write`, `chat:write.public`, `channels:read`, `groups:read`, `users:read`, `users:read.email`, `commands`, `links:read`, `links:write`.
3. **Event Subscriptions** (record unfurls): request URL `https://app.unnatify.com/api/connectors/webhooks/slack`.
4. **Slash commands** (optional): `/crm` → same webhook.
5. **Basic Information:** copy the **Client ID**, **Client Secret** and **Signing Secret**.
6. **Manage Distribution › Activate public distribution** (no Slack review needed unless listing in the Slack Marketplace).

**Server:** `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET`, `SLACK_SIGNING_SECRET`.

### 8.7 Microsoft Teams and Google Chat

- **Teams** notifications use the Microsoft app (8.2). A Teams app package (manifest) is created later for the Teams store, if wanted.
- **Google Chat:** in the Google project (8.1) enable the **Google Chat API** and configure the Chat app (name, avatar, "HTTP endpoint" `https://app.unnatify.com/api/connectors/webhooks/google-chat`). Simplest alternative: customers create an incoming webhook in their Chat space and paste it in.

### 8.8 Zoom and Calendly

| | Steps | Server settings |
|---|---|---|
| **Zoom** | marketplace.zoom.us › **Develop › Build App › General app (OAuth)** → redirect `.../callback/zoom` → scopes `meeting:write:meeting`, `meeting:read:meeting`, `user:read:user` → copy the Client ID and secret → to let other companies install it, submit for **publishing** (review 1–4 weeks), or keep it unlisted for testing | `ZOOM_CLIENT_ID`, `ZOOM_CLIENT_SECRET` |
| **Calendly** | developer.calendly.com › **Create OAuth app** → redirect `.../callback/calendly` → copy the Client ID, secret and webhook signing key | `CALENDLY_CLIENT_ID`, `CALENDLY_CLIENT_SECRET`, `CALENDLY_WEBHOOK_SIGNING_KEY` |

### 8.9 Accounting

| | Steps | Server settings |
|---|---|---|
| **Zoho Books** (also Zoho Sign) | api-console.zoho.in › **Server-based Applications** → redirect `.../callback/zoho` → copy the Client ID and secret. Zoho has data centres (.in, .com, .eu): users connect to their own, and the CRM handles that. | `ZOHO_CLIENT_ID`, `ZOHO_CLIENT_SECRET` |
| **QuickBooks Online** | developer.intuit.com › **Create an app › QuickBooks Online** → scope `com.intuit.quickbooks.accounting` → **Keys & credentials**: development keys now; production keys after completing the app assessment (1–4 weeks) → redirect `.../callback/intuit` | `INTUIT_CLIENT_ID`, `INTUIT_CLIENT_SECRET` |
| **Xero** | developer.xero.com › **New app** → web app → redirect `.../callback/xero` → copy the Client ID and secret; certification is needed for more than 25 connected organisations | `XERO_CLIENT_ID`, `XERO_CLIENT_SECRET` |
| **Tally Prime** | No cloud API. Tally is reached on the customer's own computer through Tally's built-in XML/HTTP server (port 9000) or a Tally connector app. **Provide:** a PC or VM with TallyPrime (education licence or trial) to test against, and tell me whether customers run Tally on-premise or on a Tally cloud host (e.g. TallyonCloud). | none |

### 8.10 E-signature

| | Steps | Server settings |
|---|---|---|
| **DocuSign** | developers.docusign.com › free developer account → **Apps and Keys › Add app** → copy the **Integration key**, add a secret key, redirect `.../callback/docusign`; **Connect** webhook configured per account later. Go-live review is needed for production. | `DOCUSIGN_INTEGRATION_KEY`, `DOCUSIGN_SECRET` |
| **Zoho Sign** | Uses the Zoho app (8.9), scope `ZohoSign.documents.ALL` | (Zoho above) |
| **Leegality** | leegality.com → sales → **sandbox** account → API key and private salt (for webhook verification) | entered per workspace |
| **Digio** | digio.in → sales → **sandbox** client ID and secret (e-sign and KYC) | entered per workspace |

### 8.11 Storage, audiences, help desk and single sign-on

| | Steps | Server settings |
|---|---|---|
| **Dropbox** | dropbox.com/developers › **Create app** → Scoped access, Full Dropbox or App folder → redirect `.../callback/dropbox` → permissions `files.content.write`, `files.content.read` → copy the App key and secret (production needs "Apply for production" after 50 users) | `DROPBOX_APP_KEY`, `DROPBOX_APP_SECRET` |
| **Google Drive / OneDrive** | Covered by 8.1 / 8.2 | — |
| **Mailchimp** | mailchimp.com/developer › **Register an app** → redirect `.../callback/mailchimp` → copy the Client ID and secret | `MAILCHIMP_CLIENT_ID`, `MAILCHIMP_CLIENT_SECRET` |
| **Okta (SSO)** | Each customer creates a SAML/OIDC app in their own Okta; nothing needed from you except an **Okta developer account** (developer.okta.com, free) for testing | none |
| **Freshdesk / Zendesk** | Per workspace: the customer's domain plus an API key. For testing, a free **Freshdesk trial** and a **Zendesk trial** | none |

### 8.12 Automation platforms (public apps)

These are developer accounts where the "Unnatify" app is published. Customers then use their own Unnatify API key inside Zapier and similar tools.

| | Steps |
|---|---|
| **Zapier** | developer.zapier.com → **Start a Zapier integration** (Platform UI or CLI) → I'll provide the triggers and actions definition → test with your account → submit for **public** review (needs a few active users and app polish; 2–6 weeks). Private sharing by invite link works before approval. |
| **Make** | make.com › **Custom apps** (developer) → create app `Unnatify` → I'll provide the modules definition → request approval to publish. |
| **Pabbly Connect** | Contact Pabbly to list an integration (they build from API docs). Send them the API reference (G7) once published. |
| **n8n** | A community node package published to npm (`n8n-nodes-unnatify`). You need an **npm account** for the company, or I prepare the package for your developer to publish. |

**Provide for section 8:**
- the **Client ID** of each app (not secret) and confirmation that the secret is in the server file;
- app-review status (Google, Meta, LinkedIn, Google Ads, Zoom, Intuit);
- the company LinkedIn page;
- the Google Ads manager account number;
- confirmation that your privacy and terms pages exist.

---

## 9. Test accounts for workspace connectors (wave 8)

These are connected by each customer with their own account. You need one **test account each**, so I can prove the connector; you enter its keys in the CRM when testing.

### 9.1 Lead sources (first group)

| Source | How it connects | What you need |
|---|---|---|
| **IndiaMART** | Seller panel → **Lead Manager › CRM Integration / Push API**: generate the **CRM key** (pull API) or set the push URL | A paid IndiaMART seller account with lead manager access |
| **JustDial** | JustDial gives API or lead-push access **on request** to paid listings: email your JustDial account manager asking for "CRM API / lead push integration" | Their response and API details; send me the docs |
| **Sulekha** | Ask your Sulekha account manager for API / lead push access | Their API details |
| **Shiksha, CollegeDunia, Careers360, CollegeDekho** | These portals usually **email** each enquiry or give a lead panel. Ask each account manager for "lead API or webhook". If there is none, set up a **dedicated mailbox** (e.g. `leads@yourdomain.com`, forwarded to the CRM's parsing inbox) and forward 3–5 sample lead emails per portal | Account manager replies, a mailbox, sample emails (with personal data blanked) |
| **Google Forms** | Uses Google OAuth (8.1) | A test form |
| **Typeform** | typeform.com → **Account › Personal tokens** (testing); OAuth app at **Developer apps** for production (redirect `.../callback/typeform`) | Test account |
| **Jotform** | jotform.com → **Settings › API › Create new key** | Test account |
| **Tally.so** | Webhooks per form (the customer pastes the CRM URL), no keys needed | Test form |

### 9.2 Telephony (native)

For each provider:
1. Get an account with a **virtual number** and **API access**.
2. Find the API credentials (dashboard developer / API settings).
3. Configure **call-status callbacks** and **recording URLs** to the CRM address shown after connecting.
4. Provide agent phone numbers for the test.

| Provider | Credentials |
|---|---|
| **Exotel** | API key, API token, Account SID, subdomain. Calls: **Exophones** (virtual numbers) plus an **app/flow (Passthru)** for incoming calls. |
| **Knowlarity (SuperReceptionist)** | API key and authorization token from the SR dashboard; caller ID number |
| **Ozonetel (CloudAgent)** | API key, username, campaign name; agents set up in CloudAgent |
| **MCube** | API key/token from MCube; **send me their API docs** |
| **MyOperator** | API token and secret from **Manage › API**; office number |
| **Tata Tele Business (Smartflo)** | API token from the Smartflo portal; DID number |
| **Twilio Voice** | Account SID and Auth Token; a voice-capable number (outside India), or Indian calling through Twilio's local process |

### 9.3 Accounting, e-sign and KYC

As in 8.9 and 8.10, plus:
- **IDfy** and **Signzy:** sandbox API keys from sales;
- **Digio:** sandbox (8.10).

### 9.4 Data quality

| | Steps |
|---|---|
| **ZeroBounce** | zerobounce.net → free credits → **API** → key |
| **NeverBounce** | neverbounce.com → **Apps › Custom integration** → API key |
| **India Post pincode** | Public, free (`api.postalpincode.in`); nothing needed |

### 9.5 BI and data

| | Steps |
|---|---|
| **BigQuery** | In the Google project (8.1): **BigQuery › Create dataset** `crm_export` → **IAM › Service accounts › Create** `crm-bq-writer` with role **BigQuery Data Editor** on that dataset and **Job User** → **Keys › Add key › JSON**. Customers use their own; for testing, put the JSON on the VPS only if we test there (better: a local test). |
| **Power BI / Looker Studio** | No app needed: they read the CRM's data feed (a read-only API key per workspace). A **Power BI Pro trial** or a Google account is enough to test. |
| **Snowflake** | Trial account (snowflake.com) → user and role with write access to a test database |

### 9.6 Education systems

| | Steps |
|---|---|
| **Moodle** | A test Moodle site (moodlecloud.com trial, or your institution's staging) → **Site administration › Server › Web services**: enable, create a service with user/course/enrolment functions, create a **token** for a dedicated user |
| **Canvas** | Free **Canvas test instance** (instructure) or your institution's beta → **Admin › Developer keys › API key** (redirect `.../callback/canvas`) |
| **Google Classroom** | Google OAuth (8.1) plus a Google Workspace for Education test domain (or a teacher test account) |

### 9.7 DigiLocker

DigiLocker access for fetching verified documents requires onboarding as a **Requester** with MeitY / DigiLocker (digitallocker.gov.in › Partners). It needs organisation documents and an approval that can take 1–3 months.
- **Decide** whether to apply directly, or use a KYC provider (Digio, IDfy, Signzy) that already offers DigiLocker fetch as an API. Usually that's faster: no separate government onboarding.

---

## 10. Final checklist: what to provide

Tick each item as you finish. **"Provide"** means tell me in chat (non-secret values only) or confirm it's done. **"Server file"** means set it in `deploy/vps/.env` (and `crm/.env.local` for local testing); never in chat.

### Now (before wave 0 deploy)

| # | Item | Provide | Server file |
|---|---|---|---|
| 1 | Encryption and signing keys (1.1) | "Done" | `MARKETPLACE_SECRET_ENCRYPTION_KEY`, `FILE_DOWNLOAD_SIGNING_SECRET` |
| 2 | Setup token (1.2) | "Done" | `BOOTSTRAP_TOKEN` |
| 3 | Privacy policy and terms pages live | The two URLs | — |
| 4 | Start the slow reviews (0.4): Meta Business Verification, DLT entity, Google project, LinkedIn page | Status of each | — |

### Wave 2

| # | Item | Provide | Server file / GitHub |
|---|---|---|---|
| 5 | Sentry (2) | Organization slug, "done" | `SENTRY_DSN_WEB`, `SENTRY_DSN_WORKER`, `SENTRY_ENVIRONMENT`; GitHub secret `SENTRY_AUTH_TOKEN` (optional) |
| 6 | GitHub settings and VPS login (3) | GitHub owner and repository name; "login done" | Docker login on the VPS |

### Wave 5 (messaging)

| # | Item | Provide | Entered by you in the CRM |
|---|---|---|---|
| 7 | Sending domain(s) and DNS (4.1) | Domain names; "SPF/DKIM/DMARC added" | — |
| 8 | Email provider test accounts (4.2–4.6) | Which ones are ready | Tokens and keys |
| 9 | DLT (5.1) | Entity ID, headers, template export (CSV) | — |
| 10 | SMS provider test accounts (5.2) | Which ones are ready; MCube SMS docs | Keys |
| 11 | Meta WhatsApp (6.1) | App ID, WABA ID, verification status | Token, phone number ID, app secret |
| 12 | WhatsApp BSP test accounts (6.2) | Which ones are ready; Engati and MCube docs | Keys |

### Wave 7 (features)

| # | Item | Provide | Entered by you in the CRM |
|---|---|---|---|
| 13 | Payment gateway test accounts (7) | Which ones are ready; Juspay docs | Keys and webhook secrets |

### Wave 8 (connectors), lead sources first

| # | Item | Provide | Server file |
|---|---|---|---|
| 14 | Meta app permissions and App Review (8.3) | Review status | `META_APP_ID`, `META_APP_SECRET`, `META_WEBHOOK_VERIFY_TOKEN` |
| 15 | Google app (8.1) | Client ID, verification status | `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET` |
| 16 | LinkedIn app and Lead Sync access (8.4) | Client ID, access status | `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET` |
| 17 | Google Ads developer token (8.5) | Access level, manager account number | `GOOGLE_ADS_DEVELOPER_TOKEN`, `GOOGLE_ADS_LOGIN_CUSTOMER_ID` |
| 18 | IndiaMART, JustDial, Sulekha (9.1) | Account status, their API docs | (entered in the CRM) |
| 19 | Education portals (9.1) | Replies from account managers, lead mailbox address, sample emails | — |
| 20 | Form tools (9.1) | Which ones are ready | (entered in the CRM) |
| 21 | Microsoft app (8.2) | Client ID, publisher verification status | `MICROSOFT_OAUTH_CLIENT_ID`, `MICROSOFT_OAUTH_CLIENT_SECRET` |
| 22 | Zoom and Calendly (8.8) | Client IDs | `ZOOM_*`, `CALENDLY_*` |
| 23 | Telephony test accounts (9.2) | Which ones are ready; MCube docs | (entered in the CRM) |
| 24 | Slack app (8.6), Google Chat (8.7) | Client ID | `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET`, `SLACK_SIGNING_SECRET` |
| 25 | Zapier, Make, Pabbly, n8n accounts (8.12) | Account emails, "ready" | — |
| 26 | Accounting (8.9): Zoho, Intuit, Xero apps; a Tally test machine | Client IDs; Tally set-up details | `ZOHO_*`, `INTUIT_*`, `XERO_*` |
| 27 | E-sign (8.10): DocuSign app; Leegality and Digio sandboxes | Integration key; sandbox status | `DOCUSIGN_*` |
| 28 | KYC (9.3, 9.7): IDfy/Signzy sandboxes; DigiLocker decision | Decision and status | (entered in the CRM) |
| 29 | Storage and audiences (8.11): Dropbox, Mailchimp apps | Client IDs | `DROPBOX_*`, `MAILCHIMP_*` |
| 30 | Data quality (9.4) | Which keys are ready | (entered in the CRM) |
| 31 | BI (9.5) | BigQuery dataset name; trial status | (local test only) |
| 32 | Education systems (9.6) | Test site URLs | (entered in the CRM) |
| 33 | SSO and help desk (8.11) | Okta developer account; Freshdesk and Zendesk trials | — |

**Total server-file settings added over all waves:** about 30. I'll give the exact list for each wave with that wave's deploy steps, the same way as the last deploy.
