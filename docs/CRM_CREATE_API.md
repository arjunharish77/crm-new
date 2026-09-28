# CRM Lead and Opportunity creation API

Updated 2026-09-28. These are the API-key endpoints in the `crm` application (port 3000 locally). Production example: `https://api.unnatify.com`. Apply migrations through `0117` before using this release.

## Authentication and setup

Enable **API Access** for the workspace. In **Settings → API Keys**, create a key using an active administrator belonging to that workspace. Save the key ID and the secret shown once. Send:

```http
Authorization: Bearer <key-id>.<secret>
Content-Type: application/json
Idempotency-Key: <a-unique-id-for-this-business-request>
```

The key determines the tenant; never send `tenantId` in a body. Keys have their own module permissions, expiry, IP allowlist and per-minute limit. These server-to-server endpoints have tenant-wide record scope under those permissions. Writes require the key creator to remain active in the same workspace; audit rows record that real user and `metadata.apiKeyId`. Reissue a key if its creator is no longer available. API secrets belong on your server, not in a public website's JavaScript.

Required permissions:

| Endpoint | Method | Key permissions |
| --- | --- | --- |
| `/api/v1/leads` | POST | `leads.create` |
| `/api/v1/opportunities` | POST | `opportunities.create` |
| `/api/v1/leads-with-opportunity` | POST | Both create permissions |
| `/api/v1/opportunity-types` | GET | `opportunities.read` or `opportunities.create` |

A module permission of `full` also grants its actions. Opportunities must be enabled for the workspace. Cookie login and Marketplace App credentials are separate authentication systems and do not replace these API-key headers.

Set these shell variables once. The secret prompt does not write the token into your shell history:

```bash
CRM_URL=https://api.unnatify.com
read -rsp 'API key ID.secret: ' CRM_API_TOKEN
printf '\n'
```

## 1. Create a Lead

```bash
curl --fail-with-body -sS "$CRM_URL/api/v1/leads" -H "Authorization: Bearer $CRM_API_TOKEN" -H 'Content-Type: application/json' -H 'Idempotency-Key: website-enquiry-1001' --data '{"name":"Sample Applicant","email":"applicant@example.com","phone":"+919876543210","company":"Example Ltd","source":"Website","status":"NEW"}'
```

| Field | Required | Contract |
| --- | --- | --- |
| `name` | Yes | Nonblank text, maximum 250 characters; trimmed |
| `email` | No | Valid email, empty string or null |
| `phone`, `company`, `source` | No | Text up to 500 characters, or null; trimmed |
| `status` | No | `NEW`, `CONTACTED`, `QUALIFIED`, `LOST`, `CONVERTED`; default `NEW` |

Unknown fields are rejected. Owner assignment follows configured distribution rules; `ownerId`, tags and arbitrary custom fields are not accepted by this contract.

Success: **201**, the Lead object directly, including `id`, `name`, contact fields and `duplicateWarnings`. Example excerpt:

```json
{"id":"lead-id","name":"Sample Applicant","email":"applicant@example.com","duplicateWarnings":[]}
```

Store `id` to link a later Opportunity. Use a stable idempotency key to make retries safe.

## 2. Find valid Opportunity types and stages

```bash
curl --fail-with-body -sS "$CRM_URL/api/v1/opportunity-types" -H "Authorization: Bearer $CRM_API_TOKEN"
```

Response is an array of types with `id`, `name`, `isActive`, and a `stages` array. Use the type's ID and a stage ID from that same type, not display names or IDs copied from another workspace. If `stageId` is omitted, the first stage by configured order is used. Types without a valid stage cannot be used to create an Opportunity.

## 3. Create an Opportunity for an existing Lead

Replace `LEAD_ID`, `TYPE_ID` and `STAGE_ID` below with actual IDs:

```bash
curl --fail-with-body -sS "$CRM_URL/api/v1/opportunities" -H "Authorization: Bearer $CRM_API_TOKEN" -H 'Content-Type: application/json' -H 'Idempotency-Key: website-opportunity-1001' --data '{"title":"Sample application enquiry","leadId":"LEAD_ID","opportunityTypeId":"TYPE_ID","stageId":"STAGE_ID","amount":25000,"priority":"MEDIUM","expectedCloseDate":"2026-12-31"}'
```

| Field | Required | Contract |
| --- | --- | --- |
| `title` | Yes | Nonblank text, maximum 250 characters; trimmed |
| `leadId` | Yes | Existing accessible Lead in the same workspace |
| `opportunityTypeId` | Yes | Type in this workspace |
| `stageId` | No | Stage belonging to that type |
| `amount` | No | Finite nonnegative number or null; zero is preserved |
| `priority` | No | `LOW`, `MEDIUM`, `HIGH`, `URGENT`; default `MEDIUM` |
| `expectedCloseDate` | No | Valid `YYYY-MM-DD` date or null |

Success: **201**, the Opportunity object directly, including `id`, `leadId`, type/stage IDs and `duplicateWarnings`. Unknown fields are rejected. The record, initial stage history, audit event and durable webhook event commit together.

## 4. Create Lead + Opportunity together

Use this when both must be created as one operation. `Idempotency-Key` is **required**. Do not supply `opportunity.leadId`; the server links the new Lead automatically.

```bash
curl --fail-with-body -sS "$CRM_URL/api/v1/leads-with-opportunity" -H "Authorization: Bearer $CRM_API_TOKEN" -H 'Content-Type: application/json' -H 'Idempotency-Key: admission-enquiry-1002' --data '{"lead":{"name":"Another Applicant","email":"another@example.com","phone":"+919876543211","source":"Website"},"opportunity":{"title":"Course enquiry","opportunityTypeId":"TYPE_ID","amount":0,"priority":"HIGH"}}'
```

Success: **201**:

```json
{
  "lead": {"id":"new-lead-id","name":"Another Applicant","duplicateWarnings":[]},
  "opportunity": {"id":"new-opportunity-id","leadId":"new-lead-id","duplicateWarnings":[]},
  "duplicateWarnings": []
}
```

Response examples are abbreviated. If either insert, its validation, a blocking duplicate rule, required audit or webhook write fails, neither record is committed. A blocked duplicate Lead is not automatically reused or merged. If your intention is to add an Opportunity to an existing Lead, use endpoint 3 instead.

Durable webhook events commit with the records. Distribution, automations, marketplace events and next-best-action refresh run after commit; their failure does not undo the committed pair. The idempotency response is a creation snapshot; later ownership or automation changes need not appear in that snapshot. These secondary hooks are not a guaranteed exactly-once workflow engine.

## Retries and errors

Keys must contain 1–200 printable non-whitespace ASCII characters. Reuse the **same key and body** after a timeout or uncertain response. A UUID generated once and stored with the external request is suitable. A new key is a new create request.

- Matching tenant + operation + key + body returns the stored creation response, still **201**.
- Reusing a key with a different body returns **409**.
- Lead, Opportunity and combined-create operations have separate idempotency namespaces.
- Do not send a new idempotency key merely because the first request timed out.

| Status | Meaning / action |
| --- | --- |
| 400 | Invalid JSON, unsupported fields, invalid values or record references; correct the body |
| 401 | Missing/invalid/expired credentials or invalid signed request |
| 403 | Missing permissions, disabled API Access, revoked key or unavailable key creator |
| 409 | Blocking duplicate rule or idempotency-body conflict; do not blindly retry with a new key |
| 429 | Key rate limit; respect `Retry-After` |
| 500 | Unexpected server failure; retry using the same idempotency key |

Errors contain `message`. A duplicate block also contains a stable code:

```json
{"code":"DUPLICATE_RULE_BLOCK","message":"Duplicate blocked by rule: Unique email"}
```

A warning rule allows saving and adds this to `duplicateWarnings`:

```json
[{"ruleId":"rule-id","name":"Email match","action":"WARN"}]
```

Warnings disclose rule information, not matching record IDs or contact data. Handle them in your integration's UI/logs. The CRM's own API client shows a warning after a successful save.

## Administrator-configured duplicate rules

Open **Settings → Duplicate rules**. Create/edit/disable rules with either **Block saving** or **Warn and allow saving**. Multiple fields in one rule use AND; separate rules are evaluated independently.

- Lead fields: `name`, `email`, `phone`, `company`, `source`, `status`.
- Opportunity fields: `title`, `leadId`, `opportunityTypeId`, `stageId`, `priority`.
- Suggested starting rules: Lead email; Lead phone; Opportunity `leadId + opportunityTypeId`. Select block/warn according to your business policy.
- Text is trimmed and case-insensitive. Phone punctuation is ignored; country codes are retained and are not inferred. `9876543210` and `+919876543210` differ.
- All fields must have nonempty values. Missing values skip that rule; a uniqueness rule is not a required-field rule.
- Rules apply within one tenant, exclude merged-away and deleted records, and run on database inserts/updates, covering API, UI, imports and other writers. Restoring a deleted record re-checks it, so a blocking rule can prevent restoring a record that would now be a duplicate.
- Existing duplicates are neither deleted nor merged. Unrelated edits on an existing duplicate are allowed; changing its matching values into another collision is blocked. Existing matches may appear as warnings even under a newly enabled blocking rule.
- A maximum of 50 rules per workspace and five fields per rule is enforced by the settings API. Edits use version checks to prevent overwriting another administrator's changes.
- Custom fields, fuzzy/similarity matching, phone country-code inference and automatic merging are outside this release. The field picker explicitly lists the supported fields.

Rule configuration is stored in Postgres, not `.env`. No rules are enabled automatically during migration. A stored `duplicateWarnings` value describes the last save that changed a rule's matching values (or created the record), not a continuously recomputed duplicate report. Saves that change no matching value keep the stored warnings and skip the duplicate check entirely.

## Optional signed authentication

Instead of Bearer auth, send `x-api-key-id`, `x-api-timestamp` (Unix seconds), and `x-api-signature` (hex HMAC-SHA256 with the API secret). Sign the exact string:

```text
<timestamp>.<UPPERCASE_METHOD>.<URL_PATH>.<EXACT_RAW_REQUEST_BODY>
```

The path is e.g. `/api/v1/leads` without the query string. GET uses an empty body. The allowed clock skew is five minutes. Signed requests still need the permissions and idempotency headers above.
