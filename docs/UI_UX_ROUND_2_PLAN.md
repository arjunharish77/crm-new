# CRM round 2 plan: fixes, UI, messaging channels and whole-codebase review

**Date:** 2026-10-04
**Status:**
- Section 1 is **done** (in the working copy, not yet committed or deployed).
- **Wave 0 (urgent security) is done** (2026-10-04, uncommitted): see section 8.1, including the settings to add on the server **before** deploying it.
- **Wave 1 (stability and speed) is done** (2026-10-04, uncommitted): see section 8.2. It adds migration 0137.
- **Wave 2 (operations safety) is done** (2026-10-05, uncommitted): see section 8.3. O3 (backups) stays deferred (question 10).
- **Part A** (sections 2–5: UI improvements and the messaging Channels redesign) and **Part B** (sections 7–8: whole-codebase review and roadmap) are **proposals waiting for your approval**. Nothing in them has been built.
- Questions and answers are in section 6. Part B's questions are asked one at a time.

**Follows:** [UI_UX_IMPROVEMENT_PLAN.md](UI_UX_IMPROVEMENT_PLAN.md) (round 1).

**Contents:**
1. Fixed now
2. UI improvements (every audit item, with files and how to check it)
3. Messaging channels: current state and decisions
4. Messaging channels: detailed design (data, providers, templates, replies, screens, security, migration)
5. Order of work, what I need, and testing
6. Questions and answers
7. Part B findings: security, backend, performance, frontend code, usability, contextual data, features, accessibility, testing and operations
8. Part B roadmap (Part A and Part B together)
9. Marketplace: ready-made connectors

Round 1 was implemented, but production use turned up a broken dashboard, settings people couldn't find, and a messaging setup that doesn't actually work. Two read-only audits on 2026-10-04 (one of the whole UI against round 1, one of email/SMS/WhatsApp) produced the findings below. File references are to `crm/src` unless noted.

---

## 1. Fixed now (2026-10-04, uncommitted)

| # | Problem | Cause | Fix | Checked |
|---|---|---|---|---|
| F1 | **Dashboard widgets overlap**: charts drawn outside their cards, a number widget's value under its "Updated" line, buttons over the icon | The built-in templates (`lib/server/crm.ts`, `getDashboardPresetWidgets`) saved layouts in an old two-column scheme (`w` 1–2, `h` 1). On the 12-column grid with 32px rows that is a sliver 32px tall. Charts were a fixed 250px and the card didn't clip. New chart widgets were also created 4 rows tall (176px), still too short. | Charts fill their card's height (`ResponsiveContainer` 100%). Lists and tables scroll inside the card. Minimum sizes per type (charts 8 rows, numbers 4, lists 6). Dashboards saved in the old scheme are laid out afresh on display (charts half width, numbers a third, a row's last chart stretched to the edge); nothing is saved until someone moves a widget. Templates rewritten in real grid units. Number widgets: title and actions on one row, then the value, then "Updated". Funnel labels have room. `components/dashboard/widget-library.tsx`, `dashboard-manager.tsx`, `lib/server/crm.ts`. | Browser (admin template: 6 widgets, none overflowing); phone layout; type check, lint, unit tests |
| F2 | **Theme selector not found** | Round-1 decision 8 moved it to My account › Preferences. Settings had no pointer and the profile menu had no theme option. | Profile menu › **Theme**: Light / Dark / Same as device, and "Accent colour…" (opens Preferences). Settings home and search list **Appearance**, linking to My account › Preferences. `components/layout/header.tsx`, `lib/settings-pages.ts`. | Browser: dark mode applied from the menu; Settings link works |
| F3 | **Add note / Add task were a form inline above the activity history** | Round-1 composer design | Both open a dialog, from the record header and the phone action bar. The Activity tab now shows only the history. Note: a text box (Ctrl/⌘+Enter saves). Task: title plus due chips (Today, Tomorrow, In a week, No date; due 5 pm). `components/detail-shell/record-composer.tsx` (`RecordAddDialog`), `dashboard/leads/[id]/page.tsx`, `dashboard/opportunities/[id]/page.tsx`. | Browser: note and task saved from the dialog on a lead; dialog opens on an opportunity |
| F4 | **Every record page failed with "Invalid URL"** in production (reference 77408379) | `APP_URL` was `app.unnatify.com` (no `https://`). The logo work's link-preview setting parsed it without a guard, and only pages rendered per request (record pages) hit it. | `APP_URL` is read safely: quotes stripped, `https://` added, and it falls back instead of throwing. `lib/app-url.ts` (+ `tests/app-url.test.ts`), used by `app/layout.tsx` and system emails. On the VPS, `APP_URL` was also corrected to `https://app.unnatify.com`. | Reproduced with a production build; tests |
| F5 | **Changing call availability always failed** ("inconsistent types deduced for parameter $6") | One SQL parameter was used for both a timestamp and a user id (an older bug). | Separate parameters. `lib/server/agent-availability.ts`. | Old code reproduces the error on the real database; new code saves |

**To ship section 1:**
1. Commit `src`, `tests`, `docs` and push.
2. On the VPS: `git pull`, `$DC build web worker`, `$DC up -d --no-deps --wait web worker`.

No migrations are needed for section 1.

---

## 2. UI improvements (proposal)

Every item from the UI audit, with what changes, where, and how it will be checked. **Effort:** S = under half a day, M = about a day, L = several days.

### 2.1 High priority

#### U1 · Integrations sections show even when their module is off (bug) · S
- **Now:** `app/dashboard/settings/integrations/page.tsx:53-54` filters sections by the ids `"0"`, `"1"`, `"5"`, `"3"`, but the real ids are `"webhooks"`, `"lead-capture"`, `"phone-system"`, `"external-push"`…, so nothing is ever hidden. Phone system shows with Telephony off; Webhooks, Lead capture and External push show without Data platform.
- **Change:** filter by the real ids and the module each needs.
- **Check:** with Telephony off, no Phone system section; with Data platform off, no Webhooks, Lead capture or External push.
- (Superseded by U2 once Integrations is split, but fixed first because it's a one-line bug.)

#### U2 · Split Integrations into separate pages (round-1 decision 28, not done) · M
- **Now:** one page with 7 sections. "Phone system" and "Email, SMS & WhatsApp" in the Settings menu are only deep links into it. CSV imports sit under Integrations.
- **Change:** each becomes its own page in the Settings menu, with its own title, breadcrumb and module gate:

  | New page | Settings group |
  |---|---|
  | Webhooks | Integrations |
  | Lead capture (forms and API keys for capture) | Integrations |
  | Phone system | Calling |
  | External push | Integrations |
  | Connection health | Integrations |
  | **Imports** | **Data model** |
  | Email, SMS & WhatsApp | Becomes **Messaging › Channels** (section 4) |

  The old `?section=` links redirect to the new pages (`lib/legacy-routes.ts`). The shared state hook (`use-integrations-settings.tsx`) is split so each page loads only its own data.
- **Check:** every old link lands on the right page; each page loads only its own data; Settings search finds each one.

#### U3 · On phones, Add task, AI assistant and Forms can't be reached on records · S
- **Now:** below the `md` breakpoint the record header's quick actions and More menu are hidden (`components/detail-shell/detail-page-header.tsx:70-72`). The bottom bar (`leads/[id]/page.tsx:396-412`, `opportunities/[id]/page.tsx:370-386`) has Call, Log, Note and a menu without these.
- **Change:** the bottom bar's More sheet gets Add task, AI assistant, Forms, Edit, Share and the rest of the record menu.
- **Check:** at 390px wide, every header action is reachable from the bottom bar.

#### U4 · Tasks added on a record don't appear there; "Log activity" in up to 3 places · M
- **Now:** the activity history shows activities and notes only (`components/detail-shell/record-activity-feed.tsx:95-141`), so a task added from the record seems to vanish (only the "Tasks (n)" tab count changes). With Telephony on, the lead page has "Log call" (header), "Log activity" (formerly the composer) and "Log other activity" (More).
- **Change:**
  - An **Upcoming tasks** strip at the top of the Activity tab: the record's next 3 open tasks, with due date, owner, a tick to complete, and "View all" (opens the Tasks tab).
  - One Log entry point: "Log call" in the header when Telephony is on (with "Log other activity" in More), otherwise "Log activity".
- **Check:** after Add task, the task shows in the strip straight away; completing it there removes it; there are no duplicate Log buttons.

#### U5 · Custom fields missing from records; facts shown twice · M
- **Now:** Details shows only fixed fields (`leads/[id]/page.tsx:324-341`, `opportunities/[id]/page.tsx:322-340`). Fields defined in Settings › Objects & fields never appear (`components/leads/custom-fields-card.tsx` is unused). Company, Source and Created appear in both the summary card and Details.
- **Change:**
  - Details shows custom fields in their configured groups and order, editable inline with the same field permissions as the API.
  - Fixed facts appear once: in the summary card, or in Details where the summary doesn't show them.
- **Check:** a custom field created in Settings appears on records, saves, and respects read-only permission.

#### U6 · Dashboard edit mode has three stacked toolbars · S
- **Now:** "Add widgets from a template", Saved layouts and tab management stack while editing (`components/dashboard/dashboard-manager.tsx:531-684`). The button says "Customize".
- **Change:** the button becomes **Edit dashboard**. While editing, one bar holds Add widget, a **Layout ▾** menu (apply a template, save layout, restore layout, version history), Tabs ▾, and Publish / Discard.
- **Check:** edit mode has a single toolbar; every action is still available.

#### U7 · Marketing campaigns: no search, all actions at once, raw values · M
- **Now:** the campaign list is clickable boxes with no search or filter (`dashboard/marketing/page.tsx:331-370`). "Campaign actions" shows Request approval, Approve, Launch and Pause whatever the status (`:377-421`). Raw values like `EMAIL · BROADCAST`, old status styling, uppercase KPI labels, Title Case card titles.
- **Change:**
  - Campaigns in the shared table: Name, Channel, Type, Status, Audience size, Sent / Delivered / Opened, Updated. Search and filters by status and channel.
  - The detail panel shows only the **next valid action** as its main button: Draft → Request approval; Pending → Approve / Reject (approvers); Approved → Launch; Running → Pause; Paused → Resume. The rest go in a menu.
  - Readable labels ("Email · Broadcast"), shared status badges, sentence case.
- **Check:** each status shows exactly one main action; search and filters work; nothing in capitals.

#### U8 · Settings home shows everything twice; no My account card · S
- **Now:** at wide sizes the Settings home also renders the full Settings sidebar (`app/dashboard/settings/layout.tsx:42-45`): two searches and two copies of every link.
- **Change:**
  - No sidebar on the Settings home page (it is the index).
  - A "Your own settings" card at the top: Profile, Password and two-factor, Appearance, Notifications → My account.
- **Check:** one search and one list on the home page; the card links work.

### 2.2 Medium priority

| # | Change | Where | Effort | Check |
|---|---|---|---|---|
| U9 | Opportunity header: **Stage** as a dropdown (round-1 decision 7; today a read-only badge, changed only via the stage path). WhatsApp link for the contact, as on leads. | `dashboard/opportunities/[id]/page.tsx:227, 276-282` | S | Stage changes from the header, with the stage-change note when required. WhatsApp opens. |
| U10 | Settings pages with their own local tabs move to the shared section tabs, so each section has a link and survives a reload. Gamification's tabs-inside-tabs are flattened. | `settings/automation/lead-scoring/page.tsx:184,458`, `settings/rewards/gamification/page.tsx:440,463`, `settings/messaging/ai-assistant/page.tsx:129`, `settings/automation/recommended-actions`, `settings/data/catalog`, `settings/integrations/marketplace` | M | Reload keeps the section; Back goes to the previous section. |
| U11 | Phone cards for Cases, Lists and Views. Exports and Approvals move to the shared table with empty states. | `dashboard/cases`, `dashboard/lists`, `dashboard/views`, `dashboard/exports`, `dashboard/approvals` | M | At 390px every list shows cards; empty lists say what to do. |
| U12 | Workspace currency and number formats everywhere (hard-coded `₹`/`$` remain; 62 raw number formats). | `components/payouts/partner-payouts.tsx:438,499,573,593`, `dashboard/my-points/page.tsx:186`, `settings/rewards/commission-rules/page.tsx:214`, `settings/messaging/ai-assistant/page.tsx:305`, `dashboard/marketing/page.tsx:280` and others | M | Changing the workspace currency changes every amount. |
| U13 | Sentence case and normal weight for labels (round-1 decision 25): uppercase letter-spaced labels in 19 files, Title Case card and dialog titles. | e.g. `cases/[id]`, `leads/lead-quick-view.tsx`, `common/record-preview.tsx`, `settings/security/audit-log`, `settings/access/roles/roles-panel.tsx`, `forms/submissions-table.tsx`, Lead scoring, the Integrations "Add Webhook Subscription" dialog | S | No `uppercase tracking-*` labels; titles in sentence case. |
| U14 | Platform admin › Tenant detail: tabs **Overview, Users, Modules, Usage, Support tools** and the shared header (it's an 839-line stack of cards with mixed title styles). Audit logs: shared page header and table. | `app/platform-admin/tenants/[id]/page.tsx`, `app/platform-admin/audit-logs/page.tsx` | M | Each tab has a link; the audit log sorts and filters. |
| U15 | Smart Views and Case detail use the shared page and record headers, for consistency (custom "Smart Views" heading while the menu says "Views"; a hand-made case header). | `dashboard/views/page.tsx:545-560`, `dashboard/cases/[id]/page.tsx:237-241` | M | Case detail has quick actions and a phone action bar like leads. |
| U16 | Settings sub-pages with hand-made headers and "Back to …" links use the shared header; the breadcrumb covers going back. | `settings/data/activity-types/page.tsx:238`, `settings/access/teams/[id]/page.tsx:196-208`, `settings/access/partners/[id]` | S | Same header and breadcrumb as other settings pages. |

### 2.3 Low priority

| # | Change | Where | Effort |
|---|---|---|---|
| U17 | Record **Back** falls back to the list when there's no history (a record opened from a link or a new tab goes nowhere today). | Record header (`detail-page-header.tsx`), leads, opportunities, cases | S |
| U18 | Two pages are both called "Approvals". The Settings one becomes **Admin approvals**. | `settings/security/approvals/page.tsx:81`, `lib/settings-pages.ts` | S |
| U19 | Workspace profile says "Dates show as dd/MM/yyyy" whatever the setting. Show the real format with an example date. | `settings/workspace/page.tsx:97` | S |
| U20 | Reports sub-sections (metrics, calculated metrics, segment comparison) move to the shared table, for sorting and consistent density. | `dashboard/reports/_components/metrics-section.tsx`, `calculated-metrics-section.tsx`, `segment-comparison-section.tsx` | S |

---

## 3. Messaging channels: current state and decisions

### 3.1 What's wrong today (audit, 2026-10-04)

**Email, SMS and WhatsApp can't be set up from the screen.**
- Settings › Integrations › Email, SMS & WhatsApp sends `publicConfig`, `defaultFromName`, `url` and a string body with `{{to}}`.
- The server (`lib/server/communications.ts:199`) saves `config` and expects `endpointUrl`, an object body and `{{recipient}}`.
- So the SMTP host is dropped and every email fails with "SMTP host required". Reopening a saved provider shows `{}`, and the delivery table's Recipient column is blank.

| Area | Today | Risk |
|---|---|---|
| Providers | Two kinds: a hand-written **SMTP** client and **Generic HTTP**. No named providers. | Every provider must be wired by hand in raw JSON. |
| SMTP security | No STARTTLS: on port 587 the password is sent **unencrypted** (`communications.ts:1067-1133`). Plain text only, no Message-ID or Date header, subject and recipient go straight into headers (header injection). | Credentials exposed in transit; poor deliverability. |
| Secrets | Provider secrets are stored **as plain JSON**. The encryption helper (`lib/server/secret-encryption.ts`) is used only for marketplace apps. | A database leak exposes every provider key. |
| Delivery webhook | `api/communications/webhooks/[channel]`: one shared environment secret, compared non-constant-time, accepted in the URL; tenant taken from the URL; no provider signature checks. Events are stored with `outboxId = null` and never update the message. | Spoofable; status never goes beyond "Sent". |
| Routing | The active provider for a channel = the one edited most recently. No priority, failover or transactional-vs-marketing split. The form's "Rate limit / minute" isn't used. | A provider outage stops all sending. |
| Delivery tracking | No provider message id on the outbox (`CommunicationOutbox`). Bounces and STOP replies don't suppress. | Repeated sends to bad addresses; compliance risk. |
| Replies | No inbound WhatsApp/SMS/email on leads (only Service Desk email). | Conversations happen outside the CRM. |
| Templates | One body with `{{tokens}}`, versions, an approval switch. No WhatsApp header, media, buttons, category or Meta approval sync; no SMS DLT id or segment count; no email HTML; no preview with a real record; no test send. The form's template "Category" isn't saved. | WhatsApp templates can't be used properly; Indian SMS can be rejected. |
| Senders | A read-only list under Marketing. **Nothing can create or verify a sender.** | Senders exist only through the API. |
| Where things are | Set-up is spread over Integrations, Messaging › Snippets, Messaging › Frequency limits, Marketing › Senders and compliance, and each campaign. | Hard to find and understand. |
| Permissions | Template, provider and sender lists are admin-only (`requireTenantAdmin`), so a marketer can't load them in the campaign composer. | The composer is broken for non-admins. |

### 3.2 Decisions (2026-10-04)

| Decision | Answer |
|---|---|
| WhatsApp connection | **Both:** Meta Cloud API direct, and BSPs. |
| WhatsApp BSPs | **Gupshup, Interakt, WATI, Twilio, Engati, MCube** |
| SMS providers | **MSG91, Gupshup SMS, Twilio SMS, Exotel, Kaleyra, MCube** (DLT fields for the Indian providers) |
| Email providers | **ZeptoMail, Amazon SES, SendGrid, Mailgun, Postmark**, plus SMTP for any other mail server |
| Replies | **Include now:** two-way conversations on the lead |
| Email template editor | **Both, chosen per template:** rich text with an HTML view, and a drag-and-drop block editor |
| Custom HTTP | Kept for any provider not in the catalogue (all channels) |

---

## 4. Messaging channels: detailed design

### 4.1 Concepts and words used in the product

| Term | Meaning |
|---|---|
| **Channel** | Email, SMS or WhatsApp. |
| **Connection** | One provider account on one channel (e.g. "Meta – main number", "MSG91 – promotional"). A workspace can have several per channel. |
| **Sender** | What the recipient sees as "from": an email address or domain, an SMS sender id (DLT header), a WhatsApp number. Each belongs to a connection. |
| **Template** | Reusable content for a channel, in one or more languages, with versions and approval. WhatsApp templates also carry Meta/BSP approval. |
| **Use** | **Transactional** (one-to-one: reminders, replies, OTP, automation to a single record) or **Marketing** (campaigns, journeys). Each connection serves one or both, and consent rules differ. |
| **Conversation** | All messages, both directions, between the workspace and one contact on one channel, shown on the lead. |

### 4.2 Data model changes (one migration, `01xx_messaging_channels.sql`: the next free number when wave 5 starts; 0137 went to wave 1)

All changes are additive. Existing rows keep working, and existing connections are migrated as described in 4.9.

**`CommunicationProviderConfig`** (kept as the Connection table, so existing foreign keys stay valid). New columns:

| Column | Purpose |
|---|---|
| `providerKey text` | Catalogue key, e.g. `META_WHATSAPP`, `GUPSHUP_WHATSAPP`, `MSG91_SMS`, `SES_EMAIL`, `SMTP`, `CUSTOM_HTTP`. Replaces the two-value `providerType` check. `providerType` is kept for old rows and derived. |
| `priority int default 100` | Lower is tried first within a channel and use. |
| `usage text` (`TRANSACTIONAL` / `MARKETING` / `ALL`) | Which sends may use it. |
| `status text` (`ACTIVE` / `PAUSED` / `ERROR`) | `ERROR` is set by health checks; the connection is skipped until it passes again. |
| `secretCiphertext text` | Encrypted credentials (AES-256-GCM via `secret-encryption.ts`). `secretConfig` is emptied after the backfill. |
| `webhookToken text unique` | Random id in this connection's webhook URL. |
| `webhookSecretCiphertext text` | Per-connection secret, for providers that sign with a secret we choose. |
| `rateLimitPerMinute int` | Enforced by the outbox worker per connection. |
| `capabilities jsonb` | Copied from the catalogue (templates required, inbound, read receipts, media, DLT). |
| `lastSuccessAt`, `lastErrorAt`, `lastError` | Health. |

**`SenderIdentity`**, new columns:

| Column | Purpose |
|---|---|
| `verificationStatus text` (`UNVERIFIED` / `PENDING` / `VERIFIED` / `FAILED`) | Replaces the bare `isVerified`. |
| `verifiedAt`, `verificationDetail jsonb` | DNS check results (SPF, DKIM, DMARC) or the provider's verification response. |
| `dltEntityId text`, `dltHeader text` | Indian SMS: principal entity id and approved header. |
| `externalId text` | WhatsApp phone-number id (Meta) or the BSP's source number / app name. |
| `qualityRating text`, `messagingLimit text` | WhatsApp number quality and tier, synced. |

**`CommunicationTemplate`**, new columns:

| Column | Purpose |
|---|---|
| `category text` | Saved at last. Email/SMS: `TRANSACTIONAL` / `MARKETING`. WhatsApp: `MARKETING` / `UTILITY` / `AUTHENTICATION`. |
| `content jsonb` | Per-channel structure (4.4). `body` stays filled with the plain-text version, for old code. |
| `editor text` (`RICH` / `BLOCKS` / `HTML`) | Email only: which editor owns the content. |
| `design jsonb` | Block editor document (email, `BLOCKS`). |
| `dltTemplateId text` | Indian SMS. |
| `providerRefs jsonb` | Per connection: `{ connectionId, externalName, externalId, status, rejectedReason, syncedAt }`. One template can be approved on several WhatsApp connections. |

**`CommunicationOutbox`**, new columns:

| Column | Purpose |
|---|---|
| `providerMessageId text` (indexed with tenant and connection) | Matches webhook events to the message. |
| `use text` (`TRANSACTIONAL` / `MARKETING`) | Routing and consent. |
| `deliveryStatus text` (`QUEUED` → `SENT` → `DELIVERED` → `READ`, or `FAILED` / `BOUNCED` / `COMPLAINED` / `UNDELIVERED`) and `deliveryStatusAt` | The normalized journey. The existing `status` keeps worker semantics. |
| `failureCode text`, `failureReason text` | Normalized code plus the provider's message. |
| `conversationMessageId text` | Set when the message belongs to a conversation. |

**`CommunicationDeliveryEvent`:**
- `outboxId` is set by `providerMessageId` lookup;
- new columns `normalizedStatus`, `providerEventId` (unique per connection, so a repeated webhook is ignored) and `connectionId`.

**New `Conversation`:**
- `id`, `tenantId`, `channel`;
- `recordType` / `recordId` (lead or opportunity; null when unmatched);
- `contactAddress` (normalized email or E.164 phone), `connectionId`;
- `status` (`OPEN` / `CLOSED`), `assignedTo`, `unreadCount`;
- `lastInboundAt` (starts WhatsApp's 24-hour window), `lastMessageAt`;
- unique on (`tenantId`, `channel`, `contactAddress`, `connectionId`).

**New `ConversationMessage`:**
- `id`, `tenantId`, `conversationId`;
- `direction` (`IN` / `OUT`), `body`, `media jsonb` (type, url or stored file id, filename, size);
- `providerMessageId`, `deliveryStatus`, `outboxId`, `sentBy`, `createdAt`;
- `raw jsonb` (inbound payload, kept 90 days).

**`MessagingSettings`**, new columns:
- `quietHours jsonb` per channel (defaults for campaigns and journeys; replaces per-campaign entry);
- `stopKeywords text[]` (default STOP, UNSUBSCRIBE, CANCEL, END, QUIT, STOPALL);
- `unsubscribeFooter jsonb` (email footer text and whether to add one-click unsubscribe).

### 4.3 Provider adapters

Each provider is one adapter file in `lib/server/channels/providers/`, implementing:

```ts
interface ChannelAdapter {
  key: string;                       // e.g. "META_WHATSAPP"
  channels: Array<"EMAIL" | "SMS" | "WHATSAPP">;
  label: string; logo: string; region?: string;
  credentialFields: FieldSpec[];     // drives the connect form: label, type (text/secret/select/url), help, required
  settingFields: FieldSpec[];        // non-secret settings (region, base URL, default sender…)
  capabilities: { templatesRequired?: boolean; templateSync?: boolean; inbound?: boolean;
                  readReceipts?: boolean; media?: boolean; dlt?: boolean; html?: boolean };
  testConnection(conn): Promise<{ ok: boolean; detail: string }>;
  send(conn, message): Promise<{ providerMessageId: string | null; accepted: boolean; retryable?: boolean; error?: string }>;
  verifyWebhook(conn, request): Promise<boolean | { challenge: string }>;   // signature or handshake
  parseWebhook(conn, body, headers): Promise<Array<StatusEvent | InboundMessage>>;
  syncTemplates?(conn): Promise<ProviderTemplateStatus[]>;
  submitTemplate?(conn, template): Promise<{ externalId: string; status: string }>;
  syncSenders?(conn): Promise<SenderInfo[]>;
}
```

**Webhook URL (one per connection):** `https://app.unnatify.com/api/channels/webhooks/{webhookToken}`.
- `GET` answers the Meta-style verification handshake.
- `POST` verifies the provider's signature, then records status events and inbound messages.
- It responds 200 quickly; processing happens in the worker.
- Repeated events are ignored by `providerEventId`.

**Catalogue.** The endpoints and auth below are what each provider documents today. **Every adapter will be checked against the provider's current API documentation, with a test account, before it ships.**

**WhatsApp**

| Provider | Auth / credentials | Send | Status and replies | Templates | Notes |
|---|---|---|---|---|---|
| **Meta Cloud API** (direct) | System-user access token; WABA id; phone-number id; app secret (webhook signatures) | Graph API `POST /{phone-number-id}/messages` | Webhook with `X-Hub-Signature-256` (HMAC with the app secret) and GET verify-token handshake; statuses sent/delivered/read/failed; inbound messages | Create, list and sync via `/{waba-id}/message_templates`; categories, languages, components | 24-hour window enforced; quality rating and limits synced. Embedded Signup (one-click onboarding) needs a Meta app with review: phase 3, optional. |
| **Gupshup** | API key; app name; source number | `POST /wa/api/v1/msg` (session) and `/wa/api/v1/template/msg` (template), form-encoded | Callback URL set in the Gupshup dashboard; message events and inbound | Template list API; templates created in Gupshup | Same account can do SMS (separate adapter). |
| **Interakt** | API key (Basic) | `POST /v1/public/message/` (template or session) | Webhooks for status and inbound | Templates created in Interakt; synced by name | |
| **WATI** | Account base URL; bearer token | `sendTemplateMessage` / `sendSessionMessage` | Webhooks for status and inbound | Template list API | Each WATI account has its own base URL. |
| **Twilio** | Account SID; auth token; WhatsApp sender | Messages API with `whatsapp:` addresses; templates via Content API (`ContentSid` and variables) | `StatusCallback` plus the inbound webhook, verified with `X-Twilio-Signature` | Content API list | Same account can do SMS. |
| **Engati** | API key and bot/workspace id (to confirm) | Engati WhatsApp API (to confirm) | Webhooks (to confirm) | To confirm | **Needs Engati API docs and a test account.** Until then it can be connected through Custom HTTP. |
| **MCube** | API key / account id (to confirm) | MCube WhatsApp API (to confirm) | To confirm | To confirm | **Needs MCube API docs and a test account.** |

**SMS**

| Provider | Auth / credentials | Send | Status / inbound | DLT | Notes |
|---|---|---|---|---|---|
| **MSG91** | Auth key; sender id | Flow API `POST /api/v5/flow/` (template id + variables) | Delivery-report webhook; inbound via long code/keyword where enabled | Template and header approved in MSG91; DLT ids stored on our side for display and checks | |
| **Gupshup SMS** | User id; password / API key | Enterprise gateway API | Delivery reports by callback | `principalEntityId` and `dltTemplateId` sent per message | |
| **Twilio SMS** | Account SID; auth token; from number or messaging service | Messages API | `StatusCallback`; inbound webhook (signature verified) | Not applicable outside India (Indian routes via registered senders) | |
| **Exotel** | API key; API token; account SID; subdomain (region) | `/v1/Accounts/{sid}/Sms/send` | `StatusCallback` | `DltEntityId` and `DltTemplateId` per message | Exotel calling already exists separately (Settings › Phone system). |
| **Kaleyra** | API key; SID | `POST /v1/{SID}/messages` | Callback URL | Sender and DLT template id per message | |
| **MCube** | To confirm | To confirm | To confirm | To confirm | **Needs MCube SMS API docs and a test account.** |

**Email**

| Provider | Auth / credentials | Send | Events and replies | Notes |
|---|---|---|---|---|
| **SMTP** (any server) | Host, port, TLS mode, user, password | Via the mail library already used for system email (TLS required, HTML and text, safe headers, Message-ID) | No delivery events. Replies only if an inbound address is set up (below). | Replaces the hand-written SMTP client. |
| **ZeptoMail** | Send-mail token; region (`.in` / `.com`) | ZeptoMail email API | Bounce, open and click webhooks | Already used for the website and system emails. |
| **Amazon SES** | Access key and secret (or IAM role), region, configuration set | SES v2 `SendEmail` (AWS SDK) | Delivery, bounce and complaint via SNS → our webhook (SNS signature verified); replies via SES receiving → SNS | Account must be out of the SES sandbox for real sends. |
| **SendGrid** | API key | `POST /v3/mail/send` | Event Webhook (signed); replies via Inbound Parse | |
| **Mailgun** | API key, domain, region (US/EU) | `POST /v3/{domain}/messages` | Webhooks signed with the signing key; replies via Routes | |
| **Postmark** | Server token; message stream | `POST /email` | Delivery, bounce and spam webhooks; replies via the inbound webhook | Separate streams for transactional and broadcast. |

**Custom HTTP** (any provider, any channel), upgraded from Generic HTTP:
- **Auth:** none, API key header, Basic, Bearer, or HMAC-signed body.
- **Request:** JSON or form; method and URL; the body built from a template with `{{recipient}}`, `{{body}}`, `{{subject}}`, `{{template.name}}`, `{{variables.*}}`, `{{sender}}`.
- **Response mapping:** the path to the message id (e.g. `data.id`) and the success condition.
- **Status webhook mapping:** the paths to the message id and status, and a table from provider status values to ours.
- Keeps the current outbound-URL safety check (no private addresses).

### 4.4 Templates

**Common to all channels:**
- name, channel, category, language(s), versions, approval (when the workspace switch is on);
- variables mapped to CRM fields with a fallback value, snippets, and the locked header/footer;
- **"Used in"**: the campaigns, journeys and automations that use it.

**Email:**
- **Rich text** (TipTap-based editor): headings, bold/italic, lists, links, images (uploaded to file storage), a button block, merge fields from a picker, and an **HTML** tab for pasting a designed email.
- **Block editor**: drag-and-drop sections (header with logo, text, image, button, two/three columns, divider, social links, footer with the unsubscribe link). Saved as a design document and rendered to responsive email HTML (MJML-style table layout) on save.
- Both produce a **plain-text version** automatically (editable), a subject and preheader, and a preview in desktop and phone widths.
- Attachments are allowed on transactional templates only.

**SMS:**
- Plain text with variables;
- a live **character and segment counter** (GSM-7 160/153, Unicode 70/67), with a warning when a character forces Unicode;
- **DLT template id** (required when the connection is an Indian provider), and the sender header picked from senders.

**WhatsApp** (follows Meta's template rules for every provider):
- category (Marketing, Utility, Authentication) and language;
- **header**: none, text (one variable), image, video or document;
- **body**: numbered variables `{{1}}`, `{{2}}`…, each mapped to a CRM field with a sample value (Meta requires samples);
- **footer** text;
- **buttons**: up to 3 quick replies, or call-to-action (URL with an optional variable, phone number), or copy code (authentication).
- **Submit for approval** sends it to Meta (or shows the BSP's steps), and status is synced: Pending → Approved / Rejected (with Meta's reason) / Paused.
- Session messages (free text within 24 hours) need no template.

**Preview and test:** every template editor has a **record picker** (any lead) to fill variables with real data, and **Send test** to an address or number you type (sent through the chosen connection, marked as a test, never counted in campaign stats).

### 4.5 Sending and routing

1. **Pick the connection:**
   - an explicit connection, if the campaign or automation chose one;
   - otherwise the active connections on the channel whose use matches, by priority;
   - connections in `ERROR` or `PAUSED`, or over their rate limit, are skipped for now.
2. **Failover:** if the provider says the error is retryable (timeout, 5xx, rate limit), the next connection of the same channel and use is tried. A permanent error (invalid number, unsubscribed) fails at once with the reason. Cross-channel fallback (WhatsApp → SMS) stays as a campaign option.
3. **Before sending:**
   - **Consent:** marketing needs opt-in on that channel; transactional needs no opt-out.
   - **Suppression:** bounced, complained or STOP.
   - **Quiet hours** (marketing only) and **frequency caps**.
   - **WhatsApp 24-hour window:** free text only if the contact wrote in the last 24 hours, otherwise a template is required.
   - **DLT** fields present for Indian SMS.
   - **Template approved** (if approval is on, or the provider requires it).
4. **Rate limits:** per connection, enforced by the worker with a token bucket. Campaign throttles stay on top.
5. **Statuses** come in through the connection's webhook and move the message along the delivery journey. Hard bounces, complaints and STOP replies add a suppression automatically, with the reason and source message.

### 4.6 Replies and conversations

- **Matching an incoming message:** by connection and the sender's address (email or E.164 phone) to an existing conversation, else to a lead (then opportunity) with that email or phone in the workspace.
  - When several records match, the most recently active wins and the others are listed.
  - Unmatched messages go to **Unassigned** in the Inbox, where they can be linked to a record or turned into a new lead.
- **On the lead/opportunity:** a **Conversations** tab (merged with today's Communications tab).
  - One thread per channel and address: bubbles both ways, delivery ticks (sent, delivered, read), media, timestamps, and who sent each outbound message.
  - **Reply box:** free text within WhatsApp's 24-hour window (a countdown shows), otherwise "Send a template" with the template picker and variables filled from the record. Email replies keep the subject thread (`In-Reply-To`).
  - Incoming messages also appear in the record's activity history as "WhatsApp received" and so on, and trigger automations ("message received" trigger) and notifications to the record owner.
- **Inbox** (new page under Marketing & automation, or Service): all conversations, with filters (Unassigned, Mine, All; channel; unread) and assignment to a person or team. It uses the same thread view.
- **Email replies:**
  - With SendGrid, Mailgun, Postmark or SES, the provider's inbound feature posts replies to the connection webhook.
  - With plain SMTP, an optional inbound mailbox (IMAP polling) can be added later. Until then, SMTP connections are send-only, and the UI says so.
- **STOP keywords** in an inbound SMS or WhatsApp message opt the contact out of marketing on that channel and send the provider's confirmation where required.

### 4.7 Screens

**Settings › Messaging › Channels** (replaces Integrations › Email, SMS & WhatsApp and Marketing › Senders and compliance):
- **Landing:** three cards (Email, SMS, WhatsApp). Each shows:
  - connected providers and the default sender;
  - 7-day sent and delivered rate, and open issues (e.g. "MSG91: 12 failures in the last hour", "2 templates rejected");
  - a set-up checklist (Connect → Add sender → Create template → Send test).
- **Channel page**, with five tabs:
  1. **Connections:**
     - A list with priority (drag to reorder), use, status and health, plus **Add connection**.
     - **Add connection** is a guided dialog:
       1. pick a provider from the catalogue (search; logos; "Custom HTTP" last);
       2. credentials, in a form generated from the provider's fields, with help links;
       3. **Test connection**, then **Send test message** to you;
       4. the webhook URL with copy buttons and provider-specific steps ("In Gupshup, paste this under Callback URL");
       5. use (transactional, marketing, both) and priority.
     - Each connection has Edit, Pause, Delete (blocked while campaigns use it, with a list of where it's used) and "Rotate webhook secret".
  2. **Senders:**
     - Email: addresses and domains with DNS records to add and a **Check** button showing SPF, DKIM and DMARC.
     - SMS: sender ids with DLT header and entity id.
     - WhatsApp: numbers synced from the connection, with status, quality and limit.
     - Pick the default sender per channel.
  3. **Templates:**
     - **The table:** Name, Category, Language, Status, Used in, Updated, with search and filters.
     - **The editor:** content on the left, a live preview with a lead picker on the right, and a variables panel.
     - **Validation:** WhatsApp rules, SMS segments, missing samples.
     - **Actions:** Save draft, Submit for approval, Send test, version history with compare and restore.
  4. **Compliance:**
     - consent rules per use;
     - STOP keywords;
     - email unsubscribe footer and one-click unsubscribe;
     - quiet hours and frequency limits per channel (moved from Messaging › Frequency limits and from each campaign, where they become "use the channel default" with an override);
     - the suppression list (search, add, remove with a reason, import).
  5. **Activity:**
     - The delivery log in the shared table: recipient, record, template, connection, status, time. Filters: status, connection, template, date, use.
     - Opening a message shows its journey (queued → sent → delivered → read, or the failure with the provider's reason) and the raw provider events, with **Retry** and **Resend**.
- **Snippets** stay at Messaging › Snippets. They're linked from the template editor's "Insert snippet".
- **Campaign composer:** connection, sender and template pickers read from the Channels data (marketers can read; only admins configure). It shows only approved templates when approval is on, and warns about missing DLT or WhatsApp approval before launch.

**Who can do what:**

| Action | Who |
|---|---|
| Configure connections, senders, compliance | Admins |
| Create and edit templates | Admins and roles with **Messaging: write** |
| Approve templates (when the switch is on) | Admins (not the author) |
| Read templates, senders and connections (names only) | Anyone who can create campaigns or send messages |
| Read and reply to conversations | Record access, as for the lead; the Inbox's Unassigned view needs **Messaging: write** |

### 4.8 Security and compliance

- **Secrets:**
  - Encrypted at rest (AES-256-GCM, key from `MARKETPLACE_SECRET_ENCRYPTION_KEY`, already set on the VPS).
  - Never sent back to the browser: forms show "•••• set" with Replace.
  - Changes are audit-logged with who and when, not the values.
- **Webhooks:**
  - A secret token in the URL per connection, plus the provider's signature, checked in constant time.
  - Replayed events are ignored (event id) and old timestamps rejected where the provider sends one.
- **SMTP:** TLS required (STARTTLS on 587, TLS on 465); certificates checked; headers encoded.
- **Outbound URL guard** (no private network addresses) for Custom HTTP and media fetches.
- **Consent:** WhatsApp marketing requires an opt-in record (source and time). Email marketing adds `List-Unsubscribe` and one-click unsubscribe (RFC 8058) headers and a footer link. SMS marketing honours STOP. Indian SMS: DLT ids required on Indian providers, and promotional sends blocked in TRAI quiet hours by default.
- **Data retention:** raw inbound payloads are kept 90 days. Message bodies follow the workspace retention policy (Settings › Data retention).

### 4.9 Moving existing data

- **Existing connections:**
  - SMTP rows become `providerKey = SMTP`; Generic HTTP rows become `CUSTOM_HTTP`, with old field names mapped.
  - Secrets are encrypted by a one-time script (`scripts/encrypt-channel-secrets.ts`, run once on deploy) and the plain copies cleared.
  - Because the old form never saved its settings properly, existing rows may be incomplete. The Channels page flags them ("Finish setting up") rather than guessing.
- **Existing templates:** `content` is filled from `body`, the category from `metadata` where present. WhatsApp templates are marked "Not linked to Meta yet" until synced or submitted.
- **Existing outbox and delivery events:** left as they are; new columns stay null for old messages.
- **Campaign quiet hours:** kept on existing campaigns. New campaigns default to the channel setting.

### 4.10 What stays the same

- Campaigns, journeys and automations keep their current behaviour; they gain better pickers and statuses.
- The outbox worker, retries and fallback remain; routing and delivery tracking are added.
- System emails (password reset) keep using `SYSTEM_SMTP_*`. They're the platform's own, not a workspace's.

---

## 5. Order of work, what I need, and testing

### 5.1 Proposed order (after your go-ahead)

| Step | Contents | Effort (rough) |
|---|---|---|
| 1 | **Section 2 quick fixes:** U1, U3, U6, U8, U9, U13, U16–U19 | 2 days |
| 2 | **Section 2 larger items:** U2 (Integrations split, Imports to Data model), U4, U5, U7, U10, U11, U12, U14, U15, U20 | 6–8 days |
| 3 | **Channels phase 1, "work and be safe":** the messaging-channels migration, secrets encrypted, SMTP on the mail library, form/server fixed, outbox `providerMessageId` and delivery statuses, per-connection webhook URL and signatures, marketers can read templates and senders | 4–5 days |
| 4 | **Channels phase 2, hub, providers and templates:** Channels landing and five tabs; connect dialog; adapters for Meta, Gupshup, Interakt, WATI, Twilio (WhatsApp and SMS), MSG91, Exotel, Kaleyra, ZeptoMail, SES, SendGrid, Mailgun, Postmark, Custom HTTP; senders with DNS check; template editors (rich text, HTML, blocks, SMS, WhatsApp) with preview and test send; WhatsApp template submit and sync | 12–15 days |
| 5 | **Channels phase 3, replies and compliance:** conversations, Conversations tab, Inbox, inbound matching, 24-hour window, STOP keywords, one-click unsubscribe, bounce/complaint suppression, routing failover and rate limits, delivery log with retry | 8–10 days |
| 6 | **Engati and MCube adapters**, once their API documents and test accounts are available | 1–2 days each |

Each step ends with the usual checks (type check, lint, unit tests, real-database smoke tests, browser checks in light and dark and on a phone), a docs update, and the commit commands.

### 5.2 What I'll need from you

Step-by-step instructions for everything below, with a final checklist: [SETUP_REQUIREMENTS_GUIDE.md](SETUP_REQUIREMENTS_GUIDE.md).

| For | Needed |
|---|---|
| Meta Cloud API | A Meta Business account with a WhatsApp Business Account, a test or real number, a system-user token and the app secret. Meta's test number works for development. |
| Gupshup, Interakt, WATI, Twilio, MSG91, Exotel, Kaleyra | A test (or real) account for each provider you want proven against the live API before release. Without one, the adapter is built to the documented API and marked "untested with live account". |
| Engati, MCube | Their API documentation (WhatsApp and SMS) and a test account. |
| ZeptoMail, SES, SendGrid, Mailgun, Postmark | A sending domain you can add DNS records to, and API keys (sandbox or free tiers are enough to test). |
| Indian SMS | Your DLT registration (entity id, headers, template ids) for real sends. |

### 5.3 Testing

- **Unit tests per adapter:** request shape, auth headers, response parsing, webhook signature checks (valid, tampered, replayed), status mapping. Recorded examples, no live calls.
- **Real-database smoke tests:**
  - routing by priority and use, failover on a retryable error, rate limit;
  - a webhook moving a message to delivered and read;
  - a hard bounce adding a suppression; STOP opting out;
  - an inbound message matched to the right lead or landing in Unassigned;
  - the 24-hour window enforced;
  - secrets encrypted at rest and never returned by the API;
  - migration of existing connections and templates.
- **Browser checks:**
  - the connect dialog for each provider type;
  - the template editors (all three email editors, SMS counter, WhatsApp builder), preview and test send;
  - the Conversations tab and Inbox;
  - light and dark, and phone width.
- **Live checks** with any test accounts you provide, before each adapter is marked ready.

---

## 6. Questions and answers

| # | Question | Answer (2026-10-04) |
|---|---|---|
| 1 | WhatsApp: Meta direct or a BSP? | **Both.** |
| 1b | Which WhatsApp BSPs? | **Gupshup, Interakt, WATI, Twilio, Engati, MCube** |
| 2 | SMS providers? | **MSG91, Gupshup SMS, Twilio SMS, Exotel, Kaleyra, MCube** |
| 3 | Email providers? | **ZeptoMail, Amazon SES, SendGrid, Mailgun, Postmark** (plus SMTP) |
| 4 | Two-way replies now or later? | **Now** |
| 5 | Email template editor? | **Both** (rich text with HTML view, and block editor), chosen per template |
| 6 | How much of section 2 in this round? | **Wait for confirmation before building; document everything in detail** (this document). |

**Part B questions** (asked one at a time; answers recorded here):

| # | Question | Answer |
|---|---|---|
| 7 | S1: turn the old shared webhook secret off straight away, or give existing integrations a grace period? | **Turn it off now** (wave 0). Integrations must use their workspace's signed webhook; anything still sending the old secret gets a clear 401. |
| 8 | F1/P2: a standard data-loading library (TanStack Query) or a small in-house hook? | **TanStack Query.** Cached hooks for shared lists (users, teams, types, roles, lists, statuses); pages move over gradually, list pages first. |
| 9 | O4: publish Docker images from GitHub (GitHub Container Registry) and deploy by version, or keep building on the server? | **Images from GitHub.** CI builds, tests and publishes web and worker images tagged by commit; the VPS deploy script pulls, backs up, migrates, health-checks and reverts on failure; rollback = previous tag. Unnatividya unchanged. |
| 10 | O3: where should off-server backups go (S3, Backblaze B2, Google Drive, another server)? | **No backups for now.** O3 is deferred and taken out of wave 2. Risk accepted: if the VPS or its disk is lost, the database and uploaded files (invoices, call recordings, exports) can't be recovered. |
| 11 | O5: error tracking with Sentry (hosted), a self-hosted equivalent, or logs only? | **Sentry (hosted)** for web and worker, with personal data scrubbed (user id only). Needs a Sentry account and DSN, added to `deploy/vps/.env`. Structured logs, full health checks and failed-job alerts as planned. |
| 12 | Section 7.7: which new features are in scope, and in what order (fees and payments, email notifications, applicant uploads, partner leads, calendar, Counseling workspace, languages)? Which payment gateway? | **In scope:** G2 email notifications and digest; G1 fees, payments and offers; G5 applicant uploads; G6 partner lead registration; G3 calendar invites and feed (Google/Outlook sync later); G7 API reference. **Not this round:** G4 Counseling workspace, G8 languages, G9 offline, G10 chat widget, G11 public help centre. Gateway: see 12b. |
| 12b | Which payment gateway for fee payments? | **Razorpay, Cashfree, PayU, Stripe and Juspay**, one adapter each, built the same way as the Channels providers. Each workspace connects its own account; payment status arrives by signed webhook and updates the fee milestone. |
| 13 | Q3/Q4: approve the comment clean-up and moving old plan documents to `docs/archive`? | **Both**, file by file as each area is touched, plus a lint rule for new comments. Design notes go to `docs/adr`; old plans to `docs/archive` (README, architecture note and one runbook stay). |
| 14 | Section 8: approve the wave order, or change it? | **Order approved as written** (2026-10-04). Work starts on wave 0 only when you say go. |

**Waiting on you:** waves 0–2 are done (sections 8.1–8.3). Say **go** for wave 3 (correct numbers).

---

# Part B: Whole-codebase review (2026-10-04)

**Status: proposal. Nothing in Part B is built until you approve it.** Questions go one at a time and are recorded in section 6.

Seven read-only reviews covered the whole CRM (not `apps/unnatividya`): security, backend, frontend code quality, performance, accessibility, usability and content, contextual data and features, and testing and operations. Findings already in Part A (U1–U20 and the Channels redesign) aren't repeated. Where two reviews found the same thing, it appears once.

**Effort:** S = under half a day, M = about a day, L = several days.

**Evidence:** paths are under `crm/src` unless shown otherwise. The highest-impact security and performance claims (S1, S2, S3, S6, S7, P1) were confirmed by reading the code again. The rest are as the reviews found them, with file and line, and are re-checked when the item is built.

## 7. Findings

### 7.1 Security

**Act first (confirmed, small fixes):**

| ID | Problem | Evidence | Change | Effort |
|---|---|---|---|---|
| S1 | **One shared secret lets anyone who has it write into any workspace.** If `x-webhook-secret` (or `?secret=`) equals the server-wide `WEBHOOK_SIGNING_SECRET`, inbound lead, case-message and telephony webhooks accept the request before checking that workspace's own signature, and the workspace is taken from the URL or body. No replay check in this mode. The secret is set in production. | `lib/server/inbound-webhooks.ts:106-109`, `lib/server/telephony-webhook.ts:128-130`, `api/telephony/webhook/route.ts:15`, `deploy/vps/.env.example:58` | Turn the legacy mode off (or limit it to named workspaces with a sunset date). Drop the `?secret=` form. Compare in constant time. | S |
| S2 | **Any signed-in user, including partners, can read webhook secrets and add outbound webhooks.** The inbound-webhook settings (and rotate), and the outbound webhooks list and create, only require sign-in, and return secrets. A rep could add a webhook that receives every new lead. | `api/integrations/inbound/settings/route.ts:8`, `.../rotate/route.ts:8`, `api/integrations/webhooks/route.ts:9,20`, `lib/server/crm.ts:1990-2031` | Admin, or integrations permission, as the other integration routes already need. Mask secrets in lists. | S |
| S3 | **Deactivated or SCIM-deleted users keep working sessions** for up to 7 days. Sign-in never checks the user's status. Sessions are revoked only on password reset. | `lib/repositories/auth-admin-postgres.ts:253-256`, `lib/server/auth.ts:132-165`, `lib/server/scim.ts:269` | Reject inactive or deleted users on every request. Revoke sessions on deactivate, delete, role change, MFA reset and own password change. | S |
| S6 | **A workspace admin can approve platform-level requests** (suspend or unsuspend any workspace, platform impersonation). The tenant check only runs when the request has a tenant, and these don't. | `lib/server/privileged-actions.ts:184`, `api/platform-admin/tenants/[id]/suspend/route.ts:24` | Requests with no tenant need a platform admin to approve. | S |
| S7 | **Case attachment filenames can escape their folder.** The raw filename goes into the storage key, so `../..` can overwrite other workspaces' files (invoices, exports). The case isn't checked to belong to the workspace, and there is no size cap or type allowlist. The same applies to inbound case emails. | `api/cases/[id]/attachments/route.ts:42`, `lib/repositories/case-inbound-postgres.ts:95` | Keep only a cleaned base name (the original name stays in the database). Check case access. Cap size and allow listed types. | S |

**High:**

| ID | Problem | Evidence | Change | Effort |
|---|---|---|---|---|
| S4 | **Server-side request forgery.** Four outbound calls skip the safe-URL guard. Three store or return the response, so a workspace admin (or any automation editor) could reach internal services or cloud metadata. | `lib/repositories/automations-postgres.ts:858-863` (webhook step), `marketplace-postgres.ts:1473,1662`, `lib/server/crm.ts:2281` (click-to-call), `external-integrations-postgres.ts:331` | One shared outbound-fetch helper: URL guard when saved and when called, no redirects, timeouts, and pinning the resolved address (against DNS rebinding). | M |
| S5 | **Workspace isolation is enforced only in application code.** Database row-level security is built but off. The app connects as the table owner, which bypasses it, and the variable that turns it on isn't in the production settings. A single missing workspace filter would leak data across workspaces. | `lib/db/query.ts:29-31`, `lib/db/pool.ts:20-22` | Create the restricted database user, prove that the request context reaches every query, turn it on in a staging copy, then in production. | L |

**Medium:**

| ID | Problem | Evidence | Change | Effort |
|---|---|---|---|---|
| S8 | The public page-visit tracker reveals whether an email is a lead (it returns the lead id), writes activities with any text as an arbitrary user, has no rate limit, and is blocked for real browsers by the CSRF guard (so it only works for scripts). | `api/tracking/page-visit/route.ts`, `lib/server/crm.ts:1577-1636`, `proxy.ts:21-26` | Constant response, per-workspace site key instead of the raw workspace id, IP rate limit, deliberate CSRF exemption. | S |
| S9 | When Redis is down, the rate limiter allows everything, including password, two-factor and reset attempts. | `lib/server/rate-limit.ts:58-60,87-89` | Fail closed for sign-in limits, or fall back to a database counter. | S |
| S10 | First-run "bootstrap" (create the platform admin, no sign-in) reopens whenever no platform admin is active, and is racy. | `api/auth/bootstrap/route.ts`, `auth-admin-postgres.ts:196-203` | Require a one-time setup token from the environment. Check inside a locked transaction. | S |
| S11 | Impersonation is only blocked from 4 actions. While impersonating, an admin can change the person's password, two-factor, roles and sessions. Inactive users and platform admins can be impersonated. | `assertNotImpersonating` usage, `auth-admin-postgres.ts:815-818` | Block credential, two-factor, user, role and session changes while impersonating. Refuse inactive or privileged targets. | S |
| S12 | Sign-in replies faster for unknown emails, which reveals which accounts exist. | `api/auth/login/route.ts:97-115` | Run a dummy password check on that path. | S |

**Low:**

| ID | Problem | Change | Effort |
|---|---|---|---|
| S13 | Cron routes accept the secret in the URL and compare it normally (`api/tasks/process-reminders/route.ts:9-11` and 5 more). | Header only, constant-time compare. | S |
| S14 | Turning an inbound webhook off doesn't stop it. No duplicate check inside the 5-minute window. | Honour the setting; ignore repeated deliveries. | S |
| S15 | The content-security policy allows inline scripts (`next.config.ts:6`, Caddyfile). | Per-request nonce. | M |
| S16 | Search doesn't escape `%`/`_` in global search, leads, opportunities, tasks and exports (`crm.ts:2401`, `leads-postgres.ts:270`, `exports.ts:254`). | Use the existing `escapeLike`. | S |
| S17 | The unsubscribe page shows the full email or phone to anyone with the link. | Mask it. | S |
| S18 | The partner invoice download puts the raw filename in the header. | Use the existing safe-filename helper. | S |
| S19 | Signed download links and stored-secret encryption fall back to `JWT_SECRET`, and the deployment guide recommends rotating `JWT_SECRET`, which would break them (see O1). Old tokens without a session id skip session checks (`lib/server/auth.ts:145`). | Separate required secrets; reject tokens without a session id. | S |
| S20 | Rate limits and the API-key IP allowlist trust the first forwarded address. Safe only while Caddy is the only way in (to verify on the VPS). | Trust only the proxy-appended address. | S |
| S21 | Check `next` 16.1.6 / `react` 19.2.3 against current security advisories, and keep `jsonwebtoken`, `nodemailer` and `exceljs` patched. | Upgrade to patched versions; dependency check in CI (O6). | S |

**Verified fine:** SQL column names are allowlisted; storage reads stay inside the storage folder; sign-in token purposes are separated; cookie flags; reset tokens hashed, 1 hour, single use; API-key and marketplace signatures compared safely; call recordings and audit logs are access-checked.

### 7.2 Backend and data

| ID | Problem | Evidence | Change | Effort |
|---|---|---|---|---|
| B1 | **Reports and dashboard widgets count a capped sample, so numbers are wrong for bigger workspaces.** About 11 standard reports load at most 1,000 (some 5,000) leads or opportunities and add them up in code. A number widget loads 500 full leads just to read the total. The predictive widget asks for 5,000 but gets 1,000. | `lib/server/inbuilt-reports.ts:473,613,840,1455,1491,1511,1538,1558,1579,1661,1726,1799,4115,4295`; `lib/server/crm.ts:869-871,1183` | Count and group in SQL for every report and widget (the pattern the 3 already-fixed reports use). Number widgets use `count(*)`. | L |
| B2 | **Message sending tops out at about 50 messages and 25 webhooks a minute.** The worker takes one batch per minute and sends one at a time, so a 10,000-recipient campaign takes hours. The queue lookups have no matching index. | `scripts/worker.ts:62-63`, `lib/server/communications.ts:1233+`, `webhook-outbox.ts:222-235` | Keep sending within a time budget, a few in parallel, with per-provider rate limits (Channels plan); add the queue indexes. | M |
| B3 | **Missing or unusable indexes on busy queries.** Opportunity has no index by lead or creation date (the default sort). Searches use `%text%` without a trigram index. The automation run-limit count is unindexed. 20 places cast ids to text, so indexes are skipped. The website-visit email lookup doesn't match its index. | `migrations/0117:103`, `leads-postgres.ts:270`, `opportunities-postgres.ts:255`, `automations-postgres.ts:1435`, `lead-lists-postgres.ts:287,302` | One migration with the indexes (built without locking tables), trigram search indexes, and the casts removed. | S |
| B4 | **Imports and exports can be stuck forever** if the worker restarts mid-job: the retry finds the job already "processing" and gives up. No recovery, no progress saved; the whole uploaded file sits in one database row. | `lib/server/crm.ts:1879-1886`, `lib/server/exports.ts:939,949` | Leases with recovery (as the message queue has), progress saved and resumed, file kept in storage. | M |
| B5 | **Recomputing lead scores fires one update per lead all at once** (can exhaust database connections). The self-learning version only rescores the newest 2,000 leads. | `lib/server/admin-modules.ts:596-610`, `lib/server/self-learning-scoring.ts:1492-1498,1689-1697` | Batched set-based updates covering all leads. | S |
| B7 | **Failures of important writes are hidden.** 523 places ignore errors, including 105 audit-log writes, 32 automation triggers and 7 webhook events. | e.g. `telephony-webhook.ts:172,312,350,352`, `cases-postgres.ts:817,838`, `scripts/worker.ts:213,231` | Audit entries in the same transaction as the change. Automations and webhooks via the queue. Anything still best-effort is logged and counted. | M |
| B8 | **Every API route repeats its own error handling, and they disagree.** 602 of 620 routes have their own try/catch; 1,445 error-code comparisons; "module off" is a 400 in 63 routes but a 403 elsewhere. | `lib/server/http.ts`, e.g. `api/opportunities/route.ts:58` | One route wrapper (sign-in kind, input validation, error mapping, request id) and typed errors. Start with leads and opportunities, then move routes over as they are touched. | L |
| B9 | **Request bodies are hardly validated.** 315 handlers pass the raw body on. The validation library is used in 3 server files. Creating a lead is validated differently in the app and the public API. | `api/leads/route.ts:44` vs `api/v1/leads/route.ts:45` | Shared schemas per entity, used by the app API and the public API. | M |
| B10 | **`crm.ts` is a 2,647-line pass-through file** (62 pure pass-throughs, 126 importers). It also holds dashboards, imports, webhooks, telephony and search, plus an **old second copy of field-permission logic**, so record updates are checked by two different implementations. | `lib/server/crm.ts:190-229` vs `lib/server/field-permissions.ts` | Remove the duplicate field-permission code first (a correctness fix). Then split by area and drop the pass-throughs. | M |
| B11 | Scheduled reports aren't claimed before sending (two workers could send twice), and the schedule drifts because the next run is counted from "now". | `lib/repositories/report-schedules-postgres.ts:167-207` | Claim with a lock; compute the next run from the previous one. | S |
| B12 | Multi-step writes without a transaction: a privacy delete runs about 20 deletes and removes files before rows; a case SLA update and its automations are separate. | `privacy-postgres.ts:188-250`, `cases-postgres.ts:815-818` | Transactions; files removed after the rows commit. | M |
| B13 | Every list page runs an exact count and offset paging. The lead count runs the whole list query with its extra lookups just for a number. | `leads-postgres.ts:346-349`, `crm.ts:357-360` | Lean count query; keyset paging for very long lists. | M |
| B14 | No clean-up for sessions, reset tokens, idempotency keys, failed-job records or delivered webhooks; these tables only grow. | grep: no deletes | A nightly housekeeping job. | S |
| B15 | API responses are inconsistent: list vs `{data, meta}`, the tasks API changes shape with `?page`, few creates return 201, and the public API returns internal fields. Changing the app's lists therefore changes the public API. | `api/notifications/route.ts:33`, `api/tasks/route.ts:35-39` | One list shape; the public API gets its own fixed output. | M |
| B16 | Background jobs are listed twice (worker and registry). Recurring ticks retry 3 times (noise). Failed imports and exports notify no one. No time limit per run. | `scripts/worker.ts:61-107,330`, `lib/server/job-registry.ts` | Generate the worker from the registry; no retries on ticks; notify on failure; timeouts. | S |
| B17 | Schema: 7 tables use uuid ids while the rest use text, so the call log's lead id can't have a foreign key. `Team.tenantId` is nullable. 149 workspace foreign keys lack delete rules. | `base-schema.sql` | Fix gradually with additive migrations. | M |
| B18 | Migrations build indexes in a way that blocks writes. | `migrations/0117:102-103` | Concurrent index builds (runner support). | S |
| B19 | Some reports group days in UTC or server time, not the workspace time zone. | `inbuilt-reports.ts:933-947,1321-1323` | Group by the workspace time zone in SQL. | S |
| B20 | Record history loads every change with full before/after data. The audit list is capped at 200 with no paging. | `crm.ts:506-511,617-624` | Paging. | S |
| B21 | Small duplicates and races: 87 copies of the user type, 24 of one helper; an activity type check-then-insert can error under load; website-visit activities run as an arbitrary user. | `crm.ts:429-446,1580-1586` | Shared helpers; insert-or-ignore; a defined system user. | S |

### 7.3 Performance and loading

| ID | Problem | Evidence | Change | Effort |
|---|---|---|---|---|
| P1 | **Every full page load mounts the whole app twice, so every request is sent twice.** Two providers re-key the whole tree when sign-in finishes, and pages start fetching before that. You see skeleton → content → skeleton → content, typing done in that first second is lost, and the rate-limit budget runs out twice as fast (the earlier 429 errors). | `providers/auth-provider.tsx:76`, `providers/general-settings-provider.tsx:40`, `components/layout/dashboard-layout.tsx:69-77` | Re-key only on a real change of user; wait for sign-in before rendering pages. | S |
| P2 | **No shared data cache.** The same lists are fetched again and again: the user list in 27–28 places (once per keystroke in the record picker), teams in 15, opportunity types in 12, roles, lists and sales groups in 10 each. | `lib/api.ts:20`, `components/common/record-picker.tsx:35` | A shared fetch-and-cache layer (see question 8), with cached hooks for users, teams, types, roles, lists and statuses. | M |
| P3 | **The workspace rate limit assumes 20 requests per user per minute; real pages make far more.** Opening Tasks is 10–12 requests (6 separate counts), completing a task triggers 8, and bulk actions send one request per record. | `lib/server/rate-limit.ts:241-243`, `dashboard/tasks/page.tsx:276,446,486`, `dashboard/lists/[id]/page.tsx:165`, `dashboard-manager.tsx:262` | One counts endpoint per list, bulk endpoints, then re-measure and set the limit. | M |
| P4 | Heavy libraries load on every page: the dashboard editor and charts even when "My day" is shown; opportunity charts even when not opened; the grid stylesheet and animation library everywhere, including public forms. Nothing is loaded on demand. | `app/dashboard/page.tsx:5`, `opportunities/page.tsx:31`, `app/layout.tsx:7-8,18` | Load them when needed. | S |
| P5 | Public forms, surveys and unsubscribe pages carry the whole signed-in app and call "who am I" for every visitor. | `app/layout.tsx:58-69`, `providers/auth-provider.tsx:45` | Separate light layout for public pages; render the form on the server. | M |
| P6 | The app shell renders nothing on the server (it waits to read screen size and the sidebar setting). | `dashboard-layout.tsx:69-77` | CSS breakpoints and a cookie, so the shell and skeletons stream. | M |
| P7 | Completing a task waits for the server and then reloads everything. | `tasks/page.tsx:444-447`, `components/dashboard/my-day.tsx:122-140` | Tick it at once; roll back on failure. | S |
| P8 | 51 of 86 pages show "Loading…" text instead of skeletons, so the page jumps when data arrives. | e.g. `settings/calling/outcomes/page.tsx:144`, `settings/access/users/page.tsx:370`, `call-center/page.tsx:550` | Shared page and table skeletons. | M |
| P9 | Polling continues in hidden tabs: the call centre every 20 seconds, dashboard auto-refresh, exports. Each trend widget fetches annotations separately. | `call-center/page.tsx:546`, `widget-library.tsx:224-258`, `exports/page.tsx:214` | Pause while hidden; fetch annotations once. | S |
| P10 | No prefetch of record data from lists; the lead page fetches tasks just to count them, then again for the panel. | `leads/[id]/page.tsx:116` | Counts in the record response; prefetch on hover. | S |

### 7.4 Frontend code quality

| ID | Problem | Evidence | Change | Effort |
|---|---|---|---|---|
| F1 | **No shared data-loading hook.** 178 files fetch data in effects with copied loading and error code (`setLoading(true)` 132 times, 481 array guards). Only 4 pages cancel stale requests, so an old slow response can overwrite a newer one. | `hooks/use-abortable-request.ts` (4 users) | A shared hook (question 8), adopted list pages first, then as pages are touched. | S + L |
| F3 | **API data is untyped.** `apiFetch` defaults to `any` (461 untyped calls; about 1,190 `any` in pages and components). There is no Case type. `User` is defined twice with different shapes. `UserOption`, `Task`, `Role` and `Team` are redefined in several files. | `lib/api.ts:20`, `types/auth.ts:1` vs `types/user.ts:30` | Default to `unknown`, a typed endpoint map, and shared entity types. | M/L |
| F4 / Q1 | **Lint checks are switched off:** `any`, unused variables, effect dependencies and the React hooks rules. 31 rule-skip comments are therefore meaningless. A real stale value hides in the automation builder. | `eslint.config.mjs:10,17,20,22`; `automations-v2/[id]/use-automation-builder.tsx:599` | Turn them back on as warnings, with a ratchet so the count can only go down. | M |
| F5 | **About 2,000 lines of unused components:** notes panel, a duplicate create-tenant dialog, import dialog, role editor, features dialog, lead quick view, bulk tag/status dialogs, analytics dashboard, icon and colour pickers, custom-fields card. | listed in the review | Delete them, or wire up the ones Part A needs (custom fields card for U5; the pickers for the type dialogs). | S |
| F6 | **Filters, paging and tabs are lost on reload and can't be shared.** Leads and opportunities read filters from the address once but never write them back; paging is local on every main list; 7 more pages keep filters local; 6 settings pages bypass the shared tab handling. | `leads/page.tsx:64,92-96,166`, `opportunities/page.tsx:87,110,202` | Filters, paging and tabs in the address on every list. | M |
| F7 | **The list-page setup is copied four times** (filters, paging, selection, bulk assign); the score cell is duplicated exactly. | leads, opportunities, activities and tasks pages; `leads/columns.tsx:49,62-74` vs `opportunities/page.tsx:59,310-322` | One shared list hook, one bulk-assign dialog, one score cell. | M |
| F8 | **Searches fire on every keystroke, out of order.** The settings audit log searches the server on every key with no cancel; the platform audit log searches only the 50 rows on screen and says "no matching logs" when there are some. | `settings/security/audit-log/page.tsx:94-97,260-280`, `platform-admin/audit-logs/page.tsx:93-94,205` | Debounce and cancel; search on the server. | S |
| F9 | **Very large files:** marketplace settings 1,888 lines (65 state variables), form editor 1,792, dashboard manager 1,479, automation builder hook 1,245, lead scoring 1,200, views 1,127, tasks 1,053, gamification 1,049. Server: reports 4,363, `crm.ts` 2,647, self-learning scoring 2,095, marketplace 1,685, automations 1,660. | review tables | Split by area, starting with the files most often changed. | L |
| F11 | **Shared components not used everywhere:** 10 pages with hand-made headings, 27 hand-made tables (17 use the shared one), 11 hand-made dialogs. | review list | Move them over as each page is touched (overlaps U14–U16, U20). | M |
| F12 | 14 local status-colour maps and 47 raw colour classes. | e.g. `platform-admin/schema-status/page.tsx:38`, `reports/_components/inbuilt-reports-section.tsx:21-24` | The shared status badge. | S |
| F13 | Two money formatters; `₹` hard-coded in partner payouts. | `lib/utils.ts:15`, `lib/display/format.ts:23` | One formatter (with U12). | S |
| F14 | 17 console calls in the browser code; a local copy of relative-time formatting; one `window.confirm`. | | Remove them; use the shared helpers. | S |

### 7.5 Usability, navigation and content

| ID | Problem | Evidence | Change | Effort |
|---|---|---|---|---|
| N1 | **The lead form takes anything.** Status and source are free text (status starts as "NEW", and a typo is rejected on save). Email and phone aren't checked. Email, phone and web-address field types show as plain text. A blank number is saved as 0, and a required number can be left empty. | `lib/server/metadata.ts:11-16`, `components/forms/dynamic-field.tsx:199`, `components/common/DynamicFormRenderer.tsx:79,89` | Dropdowns for status (workspace statuses), source and owner; proper email, phone and URL inputs with checks; blank number = empty. | M |
| N2 | **Import is hard to find and admin-only.** It's only in Settings › Integrations. The Leads page has Export but no Import. The first-run step "Add or import your leads" opens a page without import. The role editor offers an Import permission that nothing checks. | `leads/page.tsx:350-366,470`, `api/integrations/csv/jobs/route.ts:19` | Import in the Leads and Opportunities menus; honour the Import permission (U2 moves the page to Data model). | M |
| N3 | **Recent items, favourites and saved filter presets are shared by everyone on a browser.** They're stored under fixed names, not per user or workspace, and survive logout, so a shared PC shows another person's lead names in search. | `lib/recent-records.ts:28-29`, `components/filters/advanced-filter-drawer.tsx:62-75` | Per user and workspace, cleared on logout. Favourites saved on the server later. | S |
| N4 | **Three separate saved-filter systems:** the filter drawer's "Save filter" (this browser only), Views (server), and a saved-filters menu used only on the audit log. The main lists have no view switcher. | | One **Views ▾** menu on every list: personal and shared views, "Save current filters as a view". | M–L |
| N5 / C12 | **Search covers too little.** Search covers only leads, opportunities, activities, tasks and partners, 8 each, with no "See all". The search box's go-to commands cover only 4 pages. The Create menu has no Case or Application. | `lib/server/crm.ts:2409-2416`, `components/search/global-search.tsx:222-227`, `header.tsx:133-144` | Search case and application numbers, campaigns and lists; "See all in Leads"; go-to commands for every menu item; Case and Application in Create. | M |
| N6 / C4 | **Related records aren't linked.** A lead can create a case but has no Cases tab. Leads and opportunities show no applications. An application doesn't link back to its lead or opportunity. The Cases and Applications APIs can't filter by lead. The UTM / first-touch source is saved but shown only in reports. | `leads/[id]/page.tsx:55,213`, `applications/[id]/page.tsx:44-56`, `api/cases/route.ts:10-18`, `api/applications/route.ts` | Cases and Applications tabs with counts on leads and opportunities; links from an application to its records; acquisition source in Key facts. | M |
| N7 | Cases and Applications lists have no selection, bulk actions or export. Custom fields can't be columns or filters on Leads. | `cases/page.tsx`, `applications/page.tsx`, `leads/page.tsx:375-390` | Bulk assign, status and export; custom fields as optional columns and filters. | M |
| N8 | The first-run checklist is misleading: "Set up your first pipeline" is ticked from day one; the messaging step opens the wrong place; steps are hidden until clicked; it doesn't mention the workspace profile, lead statuses, assignment rules or modules. | `lib/repositories/onboarding-readiness-postgres.ts:63,92`, `components/dashboard/onboarding-checklist-banner.tsx:26,60` | Honest completion checks, correct links, expanded while under half done, the missing steps added. | S |
| N9 | Developer words on screen: "feature flag for this tenant", "tenant features", "Tenant-wide", "All Records (Tenant Admin)", "Payload Template (JSON)", "Mappings JSON", and a typed "Field key" in Export rules (a typo protects nothing). | e.g. `settings/rewards/commission-rules/page.tsx:164`, `components/views/save-view-dialog.tsx:501,520`, `settings/security/export-rules/page.tsx:76-87` | Plain words ("workspace", "ask your administrator to turn on…"), field pickers, mapping rows instead of JSON. | S–M |
| N10 | The same thing has different names: "Recommended actions" / "Next best action" / "Next Best Actions"; the menu says Campaigns, the page Journeys, the tab Marketing; "Lists" vs "Lead Lists"; three pages called Approvals; "Audit Logs" vs "Audit log". | `NavigationDrawer.tsx:149,164-167`, `lib/page-titles.ts` | One name each, recorded in a short glossary. | S |
| N11 | No help where it's needed: 4 of 6 assignment strategies are unexplained; Service levels takes only minutes and doesn't say what a breach does; no help menu, docs links or "what's new". | `settings/automation/assignment-rules/rule-builder.tsx:375-400`, `settings/automation/service-levels/page.tsx:120-136` | One line of help per option; hours and days; a Help item in the profile menu. | M |
| N12 | One-click delete with no confirmation and no message for report metrics, calculated metrics and schedules. Suspending a workspace doesn't ask you to type its name. | `reports/_components/metrics-section.tsx:198,489`, `calculated-metrics-section.tsx:92,191`, `report-schedules-section.tsx:112,291` | The shared confirmation (typed for suspend). | S |
| N13 | Keyboard shortcuts exist only on the Leads list; none on other lists or records. The header shows ⌘K on Windows. | `leads/page.tsx:234-236`, `header.tsx:115` | The same list shortcuts everywhere; N/T/L/E on records; the right key name per system. | S–M |
| N14 | Message wording: "lead saved successfully" in lower case, "Lead Name", "Due At", "--" in 25 messages, and a mix of "Failed to…" and "Couldn't…". | `DynamicFormRenderer.tsx:190`, `lib/server/metadata.ts` | One wording style. | S |
| N15 | Empty states that say what to do but have no button (gamification, recommended actions, related tasks); the Leads empty state mentions forms and integrations without links. | | Add the button or link. | S |
| N16 | Application numbering isn't in the Settings index; application detail shows plain "Loading…" and a full-width Back button. | `lib/settings-pages.ts`, `applications/[id]/page.tsx:35-41` | Register it; use the shared header and skeleton. | S |
| N17 | The menu's "Custom objects" section loads on every page and links to pages that don't exist; custom objects can't be created. | `NavigationDrawer.tsx:93-101,296-305` | Remove it until custom objects exist. | S |

### 7.6 Contextual data and prefill

| ID | Problem | Evidence | Change | Effort |
|---|---|---|---|---|
| C1 | **Create from a record doesn't carry the record.** The Create menu only knows lead and opportunity pages, and Create › Opportunity on a lead page doesn't pass the lead. Create › Activity on an opportunity leaves its lead blank. No Case or Application in the menu. | `lib/contextual-defaults.ts:6-13`, `components/layout/header.tsx:236-249` | Pass the lead; resolve an opportunity's lead; add case and application pages; add Case and Application to Create. | S |
| C2 | **Record dropdowns list only the first 100 leads** (200–300 elsewhere), so the right lead may be missing, with no search: the opportunity form, test workflow, enrol records, simulate distribution, save view and assignment rule builder. | `opportunities/opportunity-form.tsx:52,78-95` and 5 more | Use the existing searchable record picker. | S |
| C3 | **Call outcomes aren't linked to the call.** No screen passes the call to "Log outcome", so outcomes aren't tied to the recording and queued calls don't clear. The incoming-call popup has no Log outcome, and a lead created from it isn't linked to the call. | `components/telephony/log-call-outcome-dialog.tsx:42,121`, `leads/[id]/page.tsx:411`, `lib/server/dispositions.ts:371-372`, `providers/inbound-call-popup-provider.tsx` | Click-to-call returns the call; Log outcome opens when the call ends, prefilled (call, record, disposition group); Log outcome in the incoming popup; link the call to a new lead. | M |
| C5 | **Applications can't be started from a lead or opportunity**, and the owner is always the creator, not the record owner. The program must be picked although the opportunity type implies it. | `lib/repositories/applications-postgres.ts:69-71,116` | Create application from the record, prefilled (lead, opportunity, program, owner); auto-pick when only one option applies. | S |
| C6 | **A task added on an opportunity doesn't show on its lead** (the lead id isn't filled in), and the lead's recommended actions aren't refreshed. | `components/detail-shell/record-composer.tsx`, `lib/repositories/tasks-postgres.ts:154,352,397` | Fill in the lead from the opportunity on the server. | S |
| C7 | **Duplicates are only flagged after saving**, as a toast. There's no check while typing and no "possible duplicates" panel on records. | `lib/api.ts:149-150`, `api/dedupe/*` | A check endpoint using the duplicate rules; an inline warning with "Open existing" in the create dialogs. | M |
| C8 | Record pickers don't show recent records (they're already stored), and form fields can't be lookups (user, record, catalog program or course) or phone or email types. | `components/common/record-picker.tsx`, `components/forms/dynamic-field.tsx:43-181` | Recent records on open; lookup and phone field types. | M |
| C9 | **Standard reports have no date, owner or team filters** (1 of 30 accepts dates). Report settings are forgotten, and "Set as default" on saved filters is never applied. | `api/reports/inbuilt/*` (only `activity-call-volume-trends` takes dates), `reports/_components/inbuilt-reports-section.tsx:73-76` | A shared date, owner and team filter defaulting to "My records", kept in the address and remembered; default views applied on open. | M |
| C10 | A case created from an opportunity doesn't carry the requester; the case dialog has only subject and description. | `opportunities/[id]/page.tsx:382`, `components/cases/create-case-button.tsx:49-56` | Pass the lead's name and email; add type and priority with defaults. | S |
| C11 | Contextual forms can't be placed on cases, applications or tasks, and custom field values aren't prefilled. | `components/forms/crm-placement-editor.tsx:31-35`, `contextual-forms-panel.tsx:353-366` | Add those placements; prefill custom fields. | S |

### 7.7 Features: missing and half-built

| ID | Problem | Evidence | Change | Effort |
|---|---|---|---|---|
| G1 | **Offers, fee payments, decisions and enrolment exist only as empty database tables.** No payment gateway, no offer letter or e-signature. | `migrations/0101_application_enrollment_schema.sql:110,129,154,168` (unused) | Fee milestones from the catalog, payment links with status updates, offer-letter PDF with accept/decline. | L |
| G2 | **Notifications never leave the app:** no email, no browser push, no daily digest; preferences only mute categories. | `lib/server/notifications.ts`, `components/account/personal-preferences.tsx:235-255` | Email per category plus a daily digest (using system email). | M |
| G3 | No calendar sync and no meeting invites. | | Invites (.ics) for meeting activities and a personal calendar feed first; Google and Microsoft sync later. | L |
| G4 | The Counseling workspace is listed as a module but not built. | `lib/server/module-health.ts:51` | Student profile, sessions, readiness and course fit (needs its own design). | L |
| G5 | Applicants can't upload their documents; reminders go only to the owner. | `33_APPLICATION_DOCUMENT_REMINDERS.md` | A secure upload link per checklist item, sent through the Channels templates. | M |
| G6 | Partners can't register leads themselves. | `api/partners/me/*` | A partner lead-registration page with duplicate check. | M |
| G7 | No API reference; one curl example. | `settings/security/api-keys/page.tsx:343` | A generated API reference page for the public API. | S |
| G8 | English only. | | Interface translation (needs a decision on languages). | L |
| G9 | No offline support. | `app/manifest.ts` | Installable app with offline read of recent records (later). | M |
| G10 | No website chat widget. | | Could feed the Channels Inbox (later). | M |
| G11 | No public help centre (the knowledge base is internal only). | | Public articles page per workspace (later). | M |
| H1 | **Merge can't choose field values**, and duplicates can't be merged from the lead (admin settings only), although the server supports both. | `lib/server/dedupe.ts:38`, `settings/data/duplicates/review-panel.tsx:143` | A side-by-side merge dialog choosing each field, reachable from the lead for permitted users. | S |
| H2 | **@mentions are stored but never filled:** notes always save an empty mentions list. | `lib/server/crm.ts:719-722` | @ picker in the note dialog, with a notification to the person mentioned. | M |
| H3 | **Sandbox/Test workspaces behave like production:** messages and webhooks still go out, and there's no banner. | `api/platform-admin/tenants/[id]/environment/route.ts:6` | Banner; outbound email, SMS, WhatsApp, webhooks and calls go to a test sink in non-production workspaces. | M |
| H4 | Change history exists only on leads and opportunities. | `leads/[id]/page.tsx:380` | History tab on cases, applications and tasks. | S |
| H5 | An unused `ReportDefinition` table. | `migrations/0008_reporting_rollups.sql:12` | Remove (migration) or document. | S |

### 7.8 Accessibility

| ID | Problem | Evidence | Change | Effort |
|---|---|---|---|---|
| A1 | No "skip to content" link. The header sits inside the main region, and the menu isn't a navigation landmark. | `components/layout/dashboard-layout.tsx:84-89`, `NavigationDrawer.tsx:333` | Skip link; correct landmarks. | S |
| A2 | Dashboard widgets can only be moved and resized by dragging. | `dashboard-manager.tsx:776` | Move and resize items in each widget's menu. | M |
| A3 | Drag-and-drop on the opportunity board announces internal ids to screen readers. | `components/opportunities/kanban-board.tsx:101` | Announce the opportunity and stage names. | S |
| A4 | The segmented control (e.g. note/task switch, list views) doesn't support arrow keys. | `components/common/page-tabs.tsx:73-90` | Same keyboard handling as the tabs. | S |
| A5 | Form errors aren't linked to their fields in 6 dialogs (opportunity, activity, tenant, team, user, role). | e.g. `opportunities/opportunity-form.tsx:95,134,166,194` | A small field-error helper. | S |
| A6 | Focus isn't moved to the new page's heading after navigation. | `components/app-states/page-title.tsx:17` | Move focus to the heading. | S |
| A7 | Small tap targets: filter-chip remove (about 18px) and the dashboard "clear filter" (about 16px, no focus ring). | `list-toolbar.tsx:66`, `dashboard-manager.tsx:728` | At least 24px, with a focus ring. | S |
| A8 | Placeholder grey on the muted background is about 4.4:1, just under the minimum. | `app/globals.css:77` | Darken one token. | S |
| F10 | 55 icon-only buttons have no name for screen readers (calling outcomes, scripts, phone system, marketplace, playbooks). The search dialog has no title. Some rows and fields respond only to the mouse. 243 labels aren't linked to their fields. A status shown only by colour. | e.g. `settings/calling/outcomes/page.tsx:172-230`, `components/search/global-search.tsx:291` | The shared icon button (label required) plus a lint rule; hidden dialog title; keyboard-capable rows; linked labels; text with colour. | S |
| M1 | 8 lists have no phone card layout (cases, views, lists, list detail, users, teams, sales groups, form submissions), plus 25 hand-made tables. | | Phone cards, busiest lists first (with U11). | M |

**Already good:** reduced motion is respected; dialogs return focus; the board has keyboard support; tables support the keyboard and announce sorting; toasts are announced; no web fonts.

### 7.9 Testing, operations and code health

| ID | Problem | Evidence | Change | Effort |
|---|---|---|---|---|
| O1 | **The encryption key for stored secrets falls back to `JWT_SECRET`, and the deployment guide recommends rotating `JWT_SECRET`.** Doing so would make every stored integration secret unreadable and break signed links. Both dedicated keys are missing from the production settings template. | `lib/server/secret-encryption.ts:16-19`, `lib/server/signed-urls.ts:11`, `docs/VPS_DEPLOYMENT.md:612` | Require `MARKETPLACE_SECRET_ENCRYPTION_KEY` and `FILE_DOWNLOAD_SIGNING_SECRET` in production (set them once, keeping the current derived value so nothing breaks); key version in each secret; a re-encrypt script; fix the guide. | S |
| O2 | **Settings aren't checked at start-up;** a missing value fails at first use. 10 settings the code reads aren't in either example file. | `instrumentation.ts`; the review lists them | Check settings at start-up for the web and the worker; a CI check that every setting read is documented. | M |
| O3 | **Backups:** not scheduled, kept only on the server, database only. Uploaded files (invoices, recordings, exports) aren't backed up; the restore check isn't scheduled; encryption is optional. | `docs/VPS_DEPLOYMENT.md:120,536-550`, `deploy/vps/scripts/backup-postgres.sh:5-12` | Nightly database and files backup, encrypted, copied off the server (question 13) with retention; a weekly restore check; an age alert. | M |
| O4 | **Deploying builds on the server and rollback means rebuilding.** CI already builds the image but discards it. | `deploy/vps/docker-compose.yml:41,71`, `../.github/workflows/ci.yml:136` | CI publishes versioned images; one deploy script (pull image, back up, migrate, health check, revert on failure); rollback picks the previous version. | M |
| O5 | **Monitoring is console text only:** no error tracking, no request ids, health checks only the database, the worker has no health check, and failed jobs alert nobody. | `api/health/route.ts:8`, `deploy/vps/docker-compose.yml:79`, `lib/server/job-dead-letter.ts` | Structured logs with request and workspace ids; error tracking (question 11); full health (database, Redis, queue); worker health check; alerts on failed jobs and slow queries. | M |
| O6 | CI gaps: no secret scanning, no code scanning, no image scan, the dependency check fails only on critical, no lockfile check, no database or browser tests. | `../.github/workflows/ci.yml` | Add them, and require them before merging. | S |
| O7 | **Two lockfiles drift.** The outer folder treats `crm` as part of its workspace, so installs update the outer lockfile while Docker uses the inner one; this broke the 2026-10-03 deploy. Versions already differ (pg, zod, recharts, bullmq). | `../package.json:4-6` | Make `crm` standalone (or use one lockfile), add a CI guard, pin tool versions. | S |
| T1 | **The 54 real-database smoke tests and 59 browser scripts never run in CI;** CI runs only mocked unit tests. | `package.json:24`, `ci.yml:115` | A CI job running the database smoke tests after migrations. | S–M |
| T2 | **High-risk code without real tests:** payout disputes (none), field-permission masking (none), record sharing (none), privacy delete (mocked only), duplicate merge/unmerge (one mocked test), partner invoices and distribution (unit only), marketplace, external integrations, SCIM. | review list | Database smoke tests for disputes, privacy delete and merge/unmerge; unit tests for field permissions and sharing. | M |
| T3 | No browser test suite in CI; the browser scripts rely on fixed waits (121). | `scripts/ui-*.cjs` | A small Playwright suite of about 10 key journeys, run nightly. | M |
| T4 | No coverage measurement. | `vitest.config.ts` | Coverage report with minimums for server code. | S |
| Q2 | Very large server files (see F9). | | Split as touched. | L |
| Q3 | Comments full of process references ("Gap checklist" 150 times, "WP" 211, "F.. fix" 188, "decision N" 168) and paragraph-long rationale. | e.g. `lib/server/secret-encryption.ts:3-14` | A comment convention (why in 3 lines, history in commits, design notes in `docs/adr`) and a clean-up pass. | M |
| Q4 | 39 plan documents at the top of `crm/`, three deployment guides, an old `handoff_v2` folder. | | README, architecture, one runbook and design notes; archive the rest. | S |
| Q5 | Unused libraries: `js-cookie`, `jwt-decode`, `radix-ui` (meta package), `react-colorful`, `react-day-picker`; `date-fns` used in one file. | `package.json` | Remove them; add an unused-code check. | S |
| Q6 | The production image ships every development library (the worker runs TypeScript directly). | `Dockerfile:7,41` | Compile the worker; slimmer images. | M |
| Q7 | TypeScript could catch more (e.g. unchecked indexed access). | `tsconfig.json` | Tighten gradually. | M |

## 8. Proposed roadmap (Part A + Part B)

Waves run in order; each ends with the usual checks, a docs update and commit commands. "Part A" items are from sections 2 and 4.

| Wave | Contents | Why first | Effort |
|---|---|---|---|
| **0 · Urgent security** | S1, S2, S3, S6, S7, O1 (keeping the current key value), S9, S10, S11, S12, S13, S17, S18, S19 | Each is small, and S1, S2 and S7 are exploitable today | 2–3 days |
| **1 · Stability and speed** | P1 (double loading), N3 (per-user recent items), B3 (indexes), B5, B11, B14, B16, C6, F8, N12, N17, P4, P7, P9, B21 | Visible speed-up, fewer 429s, removes data-integrity risks | 3–4 days |
| **2 · Operations safety** | O7 (lockfiles), T1 (smoke tests in CI), O6, O2, O5 (logs, health, alerts), O4 (image-based deploy and rollback) | Protects data and makes releases safe | 5–7 days |
| **3 · Correct numbers** | B1 (reports and widgets in SQL), B19, C9 (report filters), B10 part 1 (remove duplicate field-permission code), B4 (stuck imports and exports), B13 | Reports are what managers trust | 6–8 days |
| **4 · Everyday usability** | Part A section 2 (U1–U20), N1, N2, N4, N5, N6/C4, N7, N8, N9, N10, N11, N13–N16, C1, C2, C3, C5, C7, C8, C10, C11, H1, H2, H4, A1–A8, F10, M1 | The day-to-day experience for reps and admins | 15–20 days |
| **5 · Connector framework and messaging Channels** | Section 9.4 phase 1 (connector framework: registry, OAuth, encrypted credentials, per-install webhooks, sync engine v2, catalogue screens), then Part A section 4 (Channels phases 1–3) built on it, with S4 (outbound safety), B2 (sending throughput), B6, H3 (sandbox sink) | Channels providers, payment gateways and marketplace connectors share one framework, so it is built once, first | 32–40 days |
| **6 · Foundations, done alongside** | F1/P2 (shared data hook and cache), F3 (types), F4/Q1 (lint ratchet), F6, F7, B8, B9, B15, P3, P5, P6, P8, P10, F5, F9/Q2, F11–F14, B7, B12, B17, B18, B20, T2, T3, T4, Q3–Q7 | Applied to pages and routes as each wave touches them, so there's no big-bang rewrite | ongoing |
| **7 · New features** | G2 (email notifications and digest), G1 (fees, payments with Razorpay, Cashfree, PayU, Stripe and Juspay, offer letters), G5 (applicant uploads), G6 (partner lead registration), G7 (API reference), G3 (calendar invites and feed). S5 (database isolation) after a full test on a copy of production. G4 and G8–G11 are not this round. | Decided in section 6 (questions 12 and 12b) | per item |
| **8 · Marketplace connectors** | Section 9.3 catalogue: **lead sources first**, then email, calendar and meetings; native telephony; chat and automation platforms (public apps on Zapier, Make, Pabbly, n8n); accounting and e-sign; KYC, storage and data quality; conversions and audiences; SSO, BI, education systems and help desk | Decided in 9.6 (questions 15 and 16) | 1–5 days each |

S5 (turning on database-level workspace isolation) is a big, careful change. I recommend preparing it during wave 2 and switching it on only after a full test on a copy of production data.

### 8.1 Wave 0: done (2026-10-04, uncommitted)

| Item | What changed | Files | Checked |
|---|---|---|---|
| S1, S14 | The old shared webhook secret (`x-webhook-secret` header or `?secret=`) is no longer accepted on the inbound-lead, inbound case-message and telephony webhooks. Only the workspace's signed (HMAC) requests are, and only while that workspace's inbound setting is switched on. | `lib/server/inbound-webhooks.ts`, `lib/server/telephony-webhook.ts`, the three webhook routes | Unit tests; API regression (old secret now 403, signed request 200) |
| S2 | Webhook subscriptions and inbound settings, events and retries need admin or integrations access. A webhook's secret is never returned; lists show "has a secret" instead, and the audit log no longer records it. | `lib/server/integrations-access.ts` (new), `api/integrations/webhooks/**`, `api/integrations/inbound/**`, `lib/server/crm.ts` | Unit test; live: a sales rep gets 403 on all of them, an admin 200 |
| S3 | A deactivated or removed user is signed out on their next request. Their sessions are ended on deactivate, role or template change, SCIM delete, admin two-factor reset; changing your own password ends your other sessions. | `lib/server/auth.ts`, `auth-admin-postgres.ts`, `admin.ts`, `scim.ts`, `mfa.ts`, `password-policy.ts` | `scripts/session-revocation-smoke.ts` (6 checks) |
| S6 | Platform-wide privileged requests can only be approved or rejected by a platform admin. | `lib/server/privileged-actions.ts` | Unit tests |
| S7 | Case attachments: the file name is reduced to a safe base name before it becomes part of the storage path, the case must exist in the workspace, files are capped at 25 MB and limited to an allowed list of types (documents, images, audio, video, zip, email). The stored type comes from the extension, never the sender, so HTML, SVG and scripts are refused. Inbound email attachments follow the same rules (a refused file is skipped, the message is kept). Older rows with a page-like type are downloaded as plain files. | `lib/storage/attachment-policy.ts` (new), `api/cases/[id]/attachments`, `case-inbound-postgres.ts`, `api/case-attachments/[id]/download` | Unit tests; live: `../../other/evil.pdf` stored as `evil.pdf` inside the case folder; HTML and SVG refused; unknown case 404 |
| O1 | In production, stored secrets need `MARKETPLACE_SECRET_ENCRYPTION_KEY` and signed links need `FILE_DOWNLOAD_SIGNING_SECRET`; there's no `JWT_SECRET` fallback. The server log says at start-up if either is missing. The deployment guide no longer suggests a rotation that would break them. | `lib/server/secret-encryption.ts`, `signed-urls.ts`, `instrumentation.ts`, `deploy/vps/.env.example`, `docs/VPS_DEPLOYMENT.md` | Unit tests, including "old secrets still decrypt when the key is set to the current `JWT_SECRET`" |
| S9 | If Redis is unreachable, rate limits (sign-in, two-factor, resets and the rest) fall back to a per-server-process counter instead of allowing everything. | `lib/server/rate-limit.ts` | Unit test |
| S10 | First-run setup asks for the one-time `BOOTSTRAP_TOKEN` from the server settings and is turned off in production without it. Two setup requests at once can no longer both succeed. | `api/auth/bootstrap`, `app/bootstrap/page.tsx`, `auth-admin-postgres.ts` | Unit tests; browser (token field, wrong-token message) |
| S11 | While impersonating, sign-in and access settings are read-only: own password and two-factor, users, roles, permission templates, sessions, API keys and SCIM. Inactive users and platform admins can't be impersonated. | `lib/server/auth.ts`, `auth-admin-postgres.ts`, `lib/server/http.ts` | Unit tests; API regression (impersonated session can read, gets 403 changing the password or creating a role) |
| S12 | Signing in with an unknown email takes as long as a wrong password. | `api/auth/login` | Live timing |
| S13 | Cron endpoints take their secret from the header only (not `?secret=`), compared in constant time. | `lib/server/cron-auth.ts` (new), 8 cron routes | Unit tests; live (URL secret refused) |
| S17 | The unsubscribe page shows the address masked (`t******@g***.com`, `******3210`). | `lib/mask-recipient.ts` (new), `api/public/unsubscribe/[outboxId]` | Unit test; live |
| S18 | The public partner-invoice download cleans the file name in its header. | `api/public/partner-invoices/[id]/download` | Type check only (same helper as the other downloads) |
| S19 | Sign-in tokens without a session id are refused (every sign-in has issued one for longer than a token lives). | `lib/server/auth.ts` | Unit test; API regression |

**Before deploying wave 0, on the server** (details in [SETUP_REQUIREMENTS_GUIDE.md](SETUP_REQUIREMENTS_GUIDE.md) section 1): set `MARKETPLACE_SECRET_ENCRYPTION_KEY` and `FILE_DOWNLOAD_SIGNING_SECRET` to the **current** `JWT_SECRET` value, and add a `BOOTSTRAP_TOKEN`. Without the first two, saved integration secrets and signed download links stop working.

**Who notices:**
- Anything posting leads, case messages or call events with the old shared secret is now refused (403). It must sign requests with the workspace's secret (Settings › Integrations › Lead capture).
- An external cron that puts the secret in the URL must send it in the header instead. The built-in worker runs these jobs directly and isn't affected.
- Everyone stays signed in: current sessions all have a session id.
- Non-admin users no longer see webhook or inbound settings.

No migrations in wave 0.

### 8.2 Wave 1: done (2026-10-04, uncommitted)

| Item | What changed | Files | Checked |
|---|---|---|---|
| P1 | A full page load no longer mounts the app twice. The tree is started afresh only when the signed-in person actually changes (sign in or out, impersonation), not when the first "who am I" answer arrives, and dashboard pages wait for sign-in before loading. | `providers/auth-provider.tsx`, `providers/general-settings-provider.tsx`, `components/layout/dashboard-layout.tsx` | Production build: every API call on the leads page is made once (before: twice) |
| N3 | Recent items, favourites, saved filter presets and form drafts are kept per person and workspace. Recent items and drafts are cleared on sign-out; the old shared lists are removed. | `lib/storage.ts`, `lib/recent-records.ts`, `filters/advanced-filter-drawer.tsx`, `forms/contextual-forms-panel.tsx` | Browser: the key carries the workspace and user; no shared key |
| B3 | Migration **0137**: opportunity indexes by lead and creation date; trigram indexes for lead name, email and company, opportunity title and task title (pg_trgm); `lower(email)` indexes for lead and user lookups; an index for the automation run limit. Lead-list member lookups use the list's real id, so their index is used. | `migrations/0137_wave1_indexes.sql`, `lead-lists-postgres.ts` | Applied locally; query plan uses the index |
| B5 | Rule-based score recompute reads leads 1,000 at a time and writes only changed scores, one statement per batch (it fired one update per lead at once). Self-learning scoring still trains on the newest 2,000 leads but now scores every lead, 500 at a time, each batch with its own history. | `lib/server/admin-modules.ts`, `lib/server/self-learning-scoring.ts` | Unit tests |
| B11 | A scheduled report is claimed before it's sent, so two workers can't both send it. The next run counts from the run that was due (no drift), and runs missed while the server was down are skipped, not all sent. Retries are claimed the same way. | `lib/repositories/report-schedules-postgres.ts` | 3 new unit tests |
| B14 | Housekeeping every 6 hours: ended sessions after 90 days, reviewed impersonation sessions after a year, used or expired reset links and trusted devices after 7 days, idempotency keys after 30, failed-job records after 90, delivered webhooks and app events after 30 (failed after 90). At most 5,000 rows per table per run. | `lib/server/housekeeping.ts` (new), `job-registry.ts`, `scripts/worker.ts` | Unit tests; ran against the real database |
| B16 | The worker builds its job lists from the registry with one table of processors, and refuses to start if they disagree. Recurring ticks don't retry and are reported as failed after 10 minutes. A failed export or import is marked failed and the person who asked is notified. | `scripts/worker.ts` | Worker run: every recurring job completed |
| C6 | A task added on an opportunity also gets the opportunity's lead (create and edit), so it shows on the lead and refreshes the lead's recommended actions. Migration 0137 fills in older tasks. | `lib/repositories/tasks-postgres.ts` | API check; no older task left without its lead |
| F8 | The settings audit log waits for a pause in typing and shows only the newest answer. The platform audit log searches on the server (user, email, record type or id, action) instead of only the 50 rows on screen. | `settings/security/audit-log/page.tsx`, `platform-admin/audit-logs/page.tsx`, `api/audit-logs`, `lib/server/crm.ts` | Browser: typing "LEADS" sends one request |
| N12 | Deleting a metric or calculated metric asks first (schedules already did). Suspending a workspace asks for the reason and its typed name. | `metrics-section.tsx`, `calculated-metrics-section.tsx`, `common/reason-dialog.tsx`, `platform-admin/tenants` | Type check only |
| N17 | The menu's "Custom objects" section and its request on every page are gone (the pages it linked to don't exist). | `layout/NavigationDrawer.tsx` | Browser: no request, no section |
| P4 | The dashboard editor and its charts load only on the Dashboards tab; opportunity stage charts only when opened; the grid stylesheet only with the dashboard; the animation library only in the signed-in app, sign-in and password reset (not on public forms). | `app/dashboard/page.tsx`, `opportunities/page.tsx`, `app/layout.tsx`, `common/motion-preferences.tsx` (new), `login/layout.tsx`, `reset-password/layout.tsx` | Browser: My day has no grid styles, the Dashboards tab does |
| P7 | Completing a task changes the row (Tasks) or removes it (My day) at once and goes back if saving fails; only the tab counts reload. | `tasks/page.tsx`, `dashboard/my-day.tsx` | Browser: row shows Completed 0.25 s after the click with the server held for 2.5 s |
| P9 | Polling pauses in hidden tabs and catches up when shown (call centre, exports, imports, dashboard auto-refresh). Trend widgets share one annotations request. | `hooks/use-visible-interval.ts` (new), `call-center`, `exports`, `use-integrations-settings.tsx`, `widget-library.tsx` | Type check, lint |
| B21 | Creating a built-in activity type at the same moment twice no longer errors. Website visits are recorded as the lead's owner (else the workspace's earliest active user), not an arbitrary user. The 24 copies of `requireTenantId` are one shared helper; an unused scoring function is removed. **Not done here:** the 87 local user types differ in shape and are left for F3 (shared types, wave 6). | `lib/server/crm.ts`, `lib/server/tenant-guard.ts` (new), 24 server modules | Type check, unit tests |

**Deploy (wave 1):** migration 0137 must run (`$DC run --rm --no-deps web node scripts/db-migrate-local.js --upgrade`). It builds indexes inside its transaction, which briefly blocks writes to Lead, Opportunity, Task, User and AutomationExecution; at today's sizes that's seconds. It also enables the `pg_trgm` extension (bundled with the standard Postgres image).


### 8.3 Wave 2: done (2026-10-05, uncommitted)

| Item | What changed | Files | Checked |
|---|---|---|---|
| O7 | `crm` stays in the outer workspace (changing that would alter how `apps/unnatividya` installs), but its own lockfile is now guarded: `npm run lockfile:check` (CI runs it first) and `npm run lockfile:update` (regenerates it outside the workspace with npm 10.8.2, the version the image uses). Node 20 and npm 10.8.2 are pinned (`.nvmrc`, `packageManager`). Locally, `crm/node_modules` is now a complete install from its own lockfile, so local runs use exactly what Docker uses. | `scripts/check-lockfile.js`, `scripts/update-lockfile.sh`, `.nvmrc`, `package.json` | `lockfile:update` reproduces the committed lockfile byte for byte |
| O2 | Web and worker check their settings at start-up. In production a missing or invalid required one (`DATABASE_URL`, `REDIS_URL`, `JWT_SECRET` of 32+ characters, the two O1 keys, `APP_URL`) stops the process with one clear message; optional ones warn. CI checks that every setting the code reads is in `deploy/vps/.env.example` (11 weren't; now 46 of 46). The case-survey link and the SCIM address used two settings that were never set (`APP_PUBLIC_URL`, `APP_BASE_URL`), so survey emails had a broken relative link; both now use `APP_URL`. The unused `WEBHOOK_SIGNING_SECRET` is removed from the template. | `lib/server/settings-check.ts` (new), `instrumentation.ts`, `scripts/worker.ts`, `scripts/check-env-documented.js`, `deploy/vps/.env.example` | Unit tests; a production server with the local dev settings refused to start, naming the four problems |
| O5 | Every API request has an id (`x-request-id`, kept from the caller or created) that's in the response header, the logs and Sentry. Server errors are one JSON log line with request, workspace and user ids, and the reply carries a `reference` the app shows in the message. Sentry (11.4) for the server, the browser and the worker, only when a DSN is set, with personal data scrubbed (no cookies, headers except the browser name, bodies, query strings, IPs or console output; user as an id). The browser reads the DSN at run time and sends through `/api/monitoring` (the content security policy blocks sentry.io), which only forwards to the configured project. Failed background jobs (after their last attempt) and queries over 5 seconds go to Sentry. `/api/health` checks the database, Redis and the worker's heartbeats (503 only when the database is down); Platform › Failed jobs shows queue counts, heartbeat ages and failures in the last 24 hours; the worker container has its own health check. Sign-in no longer returns an empty 500 when the database is unreachable. | `lib/server/logger.ts`, `error-reporting.ts`, `system-health.ts` (new), `lib/client-error-reporting.ts`, `instrumentation-client.ts` (new), `api/health`, `api/platform-admin/health`, `api/client-config`, `api/monitoring` (new), `proxy.ts`, `http.ts`, `lib/api.ts`, `scripts/worker.ts`, `platform-admin/jobs/page.tsx`, compose | Against a stand-in Sentry: server, browser and worker events arrive, scrubbed; a database outage gives 503 health and "Sign-in failed (reference …)" matching a log line; the relay refuses other projects; panel screenshot |
| O4 | CI publishes the tested image to GHCR as `sha-<commit>` and `latest`. `deploy/vps/scripts/deploy.sh <version>` pulls, migrates, starts web and worker, waits for their health checks and `/api/health`, and starts the previous version again on any failure; `rollback.sh` goes back one version (no migrations). Compose names the image (`CRM_IMAGE:CRM_VERSION`) and keeps `build:` as a fallback. No backup step (O3 deferred). | `.github/workflows/ci.yml`, `deploy/vps/scripts/deploy.sh`, `rollback.sh` (new), `deploy/vps/docker-compose.yml`, `docs/VPS_DEPLOYMENT.md` | Deploy, three failure-and-revert cases and rollback, run with a stand-in `docker` |
| O6 + T1 | CI for `crm-new` itself (the outer folder's `ci.yml` was never run: that repository has no remote). Four required jobs: checks (lockfile, settings documented, types, lint, unit tests); database (fresh database, every migration, a seeded demo workspace, **all 55 database smoke tests**, production build, app and worker started, **API regression**); scans (gitleaks over the whole history, `npm audit` failing on high); image (Trivy, critical with a fix available). CodeQL runs separately. Lint covers the CRM's code (`npm run lint:crm`); `apps/unnatividya` has 201 lint errors of its own and isn't touched. | `.github/workflows/ci.yml`, `codeql.yml`, `.gitleaks.toml`, `.gitleaksignore`, `scripts/ci-seed.ts` (new) | The database job run locally on a fresh database: 55/55 smoke tests and the regression (181 calls) pass; gitleaks clean (3 reviewed false positives listed); audit passes at "high" |

**Found and fixed along the way:**
- **Next.js 16.1.6 had 30 published advisories**, including two critical remote-code-execution bugs (one in image optimisation) and several high-severity proxy bypasses. Upgraded to **16.3.8** (same major version), with `eslint-config-next`, `sharp` and two small transitive fixes (`brace-expansion`, `fast-uri`). Apart from those and the added Sentry packages, no version in the lockfile changed. Re-checked: type check, unit tests, build, all smoke tests, the regression and the browser checks from wave 1.
- **The demo seed had fallen behind the schema** (assignment rules), and one smoke test depended on run order. Both are fixed, so CI can start from an empty database.
- The newer `eslint-plugin-react-hooks` (7.1, the lockfile's version) adds React Compiler checks. The app doesn't use the compiler, so four of them are off, next to the three that already were.
- Remaining advisories: two moderate ones in `exceljs` (its `uuid`), fixable only by a major downgrade, so they're left for now.

**Before deploying wave 2:** the settings in setup guide section 1 must be in `deploy/vps/.env`, or the new version won't start (the deploy script would then put the old one back). Sentry (section 2) and GHCR (section 3) are optional for the deploy itself: without them errors stay in the logs, and you can keep building on the server.

## 9. Marketplace: ready-made connectors (proposal, 2026-10-04)

**Status: proposal. Nothing is built until you approve it.** Which connectors to build is asked one question at a time; answers go in 9.6.

### 9.1 Where it stands

The marketplace is a good framework for **custom apps a workspace builds itself**. An app is a webhook URL plus a secret the CRM issues. It already has:
- review and approval;
- permission scopes;
- signed event delivery with retries;
- actions, reports and a basic sync;
- health, usage and version history.

What it doesn't have:

| Gap | Evidence |
|---|---|
| **No ready-made connectors at all.** Zapier, Slack, Google, Meta, Exotel, Razorpay, Tally and the rest appear only as placeholder text or search keywords. | review of `src` |
| **No OAuth.** Google, Microsoft 365, Slack, Meta, Zoho, QuickBooks and similar all need it, and nothing stores, refreshes or revokes tokens. `redirectUrls` is saved but never used. | `migrations/0060`, `lib/repositories/marketplace-postgres.ts` |
| **No built-in ("first-party") connector concept.** Every app belongs to a workspace and runs elsewhere; the platform can't ship a connector implemented in this codebase. | `marketplace-postgres.ts:81` |
| **No settings form per connector.** The manifest has no settings schema, so set-up is raw text boxes. | `settings/integrations/marketplace/page.tsx:1144-1240` |
| **Sync is shallow:** leads and opportunities only, a fixed field list, only the first 200 records sent, and the sync point moves forward even when a run fails (failed changes are skipped). No external-id links, no pulling from the app, no deletes, no custom fields. | `lib/server/marketplace-sync.ts:17-20,139-143,209-212` |
| **Inbound webhooks only accept the CRM's own format and signature,** so Meta, Exotel or Razorpay can't post directly. | `inbound-webhooks.ts`, `telephony-webhook.ts:126-148` |
| **The screen is a developer console:** about 15 action buttons per app; the catalogue has no search, filter, logo or set-up wizard. | `settings/integrations/marketplace/page.tsx:898-975,1083-1127` |
| **Security debt:** external-integration, integration-setting and API-key secrets are stored in plain text, and each app request scans every installing workspace's secret. | `secret-encryption.ts:4-7`, `marketplace-inbound.ts:101-110` |

### 9.2 Design: built-in connectors

Built-in connectors work alongside the existing custom apps, using the same install, permissions, logs and health. The pieces:

- **Connector registry in code** (`lib/server/connectors/<key>/`). Each connector declares:
  - key, name, logo, category, description, vendor link;
  - **auth**: OAuth 2.0 (with scopes), API key, or none;
  - **settings fields**, which generate the set-up form (like the Channels providers);
  - **capabilities**:
    - lead source;
    - two-way contact/record sync;
    - calendar;
    - email logging;
    - file storage;
    - notifications;
    - accounting push;
    - payments;
    - e-sign;
    - conversions;
    - SSO;
  - **handlers**: test connection, receive webhook (with the provider's own signature check), pull on a schedule, push on CRM events, actions on records.
- **OAuth client:**
  - tables for app credentials per provider (platform-level client id and secret, set by the platform admin) and **tokens per install**, encrypted;
  - authorize and callback routes with state and PKCE;
  - a worker that refreshes tokens before expiry, with alerts when consent is revoked;
  - disconnect, which revokes the token at the provider.
- **Install:** a workspace admin clicks **Connect** → OAuth consent or API key → settings → field mapping → **Test** → on. Connectors that write CRM data still go through the existing write-permission approval.
- **Sync engine v2:**
  - an **external-id link table** (CRM record ↔ external id per install);
  - **cursor-based** incremental sync that only moves forward on success;
  - pagination, deletes, and custom fields in mappings;
  - conflict rules (CRM wins / app wins / newest wins) with a conflict log;
  - dry run;
  - per-install schedule and rate limit.
- **Inbound webhooks per install:** `https://app.unnatify.com/api/connectors/webhooks/{installToken}`, verified with the provider's own signature and de-duplicated by event id; payload mapping to CRM fields; **source attribution** (each lead tagged with its connector and campaign).
- **Screens (Settings › Integrations › Marketplace):**
  - **Catalogue:** search, categories, logos, "Installed" badges, and a short "what it does" for each.
  - **Connector page:** Overview, Settings, Field mapping, Activity log (syncs, webhooks, actions in one list with retry), Health.
  - The **custom apps** console stays under a "Build your own" tab, for developers.
  - The platform admin enables connectors per plan and enters the OAuth client credentials.
- **Security:** every connector secret and token is encrypted (fixes the plain-text debt above). The scan-all-installs lookup is replaced with an id-prefixed key lookup. Every outbound call goes through the SSRF-safe fetch helper (S4). Connectors work in Sandbox workspaces against test accounts (H3).

### 9.3 Candidate catalogue (to choose from)

Grouped by what enterprise CRMs, and Indian education CRMs in particular, usually connect. Channels (section 4) and payment gateways (question 12b) are already planned and use this same framework.

| Category | Candidates | What the connector does |
|---|---|---|
| **Lead sources (ads)** | Meta Lead Ads (Facebook/Instagram), Google Ads lead forms, LinkedIn Lead Gen Forms | New leads arrive instantly with campaign, ad set and ad; consent captured; duplicate rules applied |
| **Lead sources (portals)** | IndiaMART, JustDial, Sulekha; education portals: Shiksha, CollegeDunia, Careers360, CollegeDekho | Pull or receive enquiries on a schedule, mapped to leads with source attribution. Portals without an API are read from their notification emails by a parsing inbox. |
| **Forms** | Google Forms, Typeform, Jotform, Tally.so | Each submission becomes a lead |
| **Email and calendar** | Google Workspace (Gmail, Calendar, Contacts), Microsoft 365 (Outlook mail, Calendar) | Log emails to records, two-way calendar sync for meetings, send from the rep's own mailbox, contact sync |
| **Meetings** | Zoom, Google Meet, Microsoft Teams meetings, Calendly | Create meeting links on activities; booked slots become meetings on the lead |
| **Team chat** | Slack, Microsoft Teams, Google Chat | Notifications (new hot lead, SLA breach, deal won) to channels; look up records from chat |
| **Telephony (native)** | Exotel, Knowlarity, Ozonetel, MCube, MyOperator, Tata Tele (Smartflo), Twilio Voice | Click-to-call, incoming call pop-up, call logs and recordings directly from the provider's own callbacks (today a middleware layer is needed) |
| **Automation platforms** | Zapier, Make, Pabbly Connect, n8n | A public app listing on each, with triggers (new lead, stage changed…) and actions (create lead, add note…) over the public API with per-install keys |
| **Accounting and ERP** | Tally Prime, Zoho Books, QuickBooks, Xero | Push customers, invoices and receipts when fees are paid; pull payment status |
| **E-signature** | Leegality, Digio, DocuSign, Zoho Sign | Send offer letters and agreements for signature; the signed copy is saved to the record |
| **Identity and KYC (India)** | DigiLocker, Aadhaar/PAN verification (Digio, IDfy, Signzy) | Fetch verified documents; verify identity for applications |
| **File storage** | Google Drive, OneDrive/SharePoint, Dropbox | Attach files from the drive; store generated documents in a folder per record |
| **Conversions and ads** | GA4, Meta Conversions API, Google Ads offline conversions | Send "qualified", "applied" and "enrolled" back to ad platforms, so campaigns optimise for real admissions |
| **Audience sync** | Meta Custom Audiences, Google Customer Match, Mailchimp | Push segments or lists to ad audiences or newsletters |
| **BI and data** | Looker Studio, Power BI, BigQuery, Snowflake | Scheduled export or a read-only data feed of CRM tables |
| **Education systems** | Moodle, Google Classroom, Canvas; SIS/ERP | Create the student account on enrolment; sync course and attendance back |
| **Single sign-on** | Google, Microsoft Entra ID, Okta (SAML/OIDC) | Sign in with company accounts (SCIM provisioning already exists) |
| **Data quality** | Email verification (ZeroBounce, NeverBounce), India Post pincode lookup | Check emails on capture; fill city and state from the pincode |
| **External help desk** | Freshdesk, Zendesk | Show tickets on the lead; create a ticket from the CRM |

### 9.4 Phases

1. **Framework** (about 8–10 days):
   - registry, OAuth client and token refresh, encrypted credentials;
   - per-install webhooks with provider signatures;
   - sync engine v2 with external-id links;
   - the catalogue and connector screens;
   - the platform admin's connector settings.
2. **Connectors in the order chosen in 9.6:** most take 1–3 days each; two-way sync connectors (Google, Microsoft, accounting) take 3–5 days each.
3. **Public listings** on Zapier, Make and Pabbly: these need each platform's review process and a developer account.

### 9.5 What I'll need

Step-by-step instructions for everything below, with a final checklist: [SETUP_REQUIREMENTS_GUIDE.md](SETUP_REQUIREMENTS_GUIDE.md).

| For | Needed |
|---|---|
| OAuth connectors | A developer app on each provider (Google Cloud, Microsoft Entra, Meta, LinkedIn, Slack, Zoom, Zoho, Intuit…): client id and secret, the callback URL registered, and app verification where required (Google and Meta review sensitive scopes, which takes days to weeks) |
| API-key connectors | A test account per provider (IndiaMART, Exotel, Tally…) to prove the integration before it's marked ready |
| Portals without an API | A mailbox to receive their notification emails |

### 9.6 Questions and answers

| # | Question | Answer |
|---|---|---|
| 15 | Which connector categories are in scope? | **All of them:** lead sources (ads, portals, forms); email, calendar and meetings; native telephony; team chat and automation platforms; accounting and e-sign; KYC, storage and data quality; conversions and audiences; SSO, BI, education systems and help desk. Every candidate in 9.3 is in scope. |
| 16 | Which connectors first? | **Lead sources first** (Meta, Google and LinkedIn lead forms; IndiaMART, JustDial, Sulekha; education portals; form tools). The rest follow the order of 9.3. |
