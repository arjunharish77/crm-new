# Native Plivo voice connector setup

This guide is for the CRM app on port 3000 and the VPS Docker Compose deployment. It covers calling, inbound routing, call activity, recording, and verification. Plivo credentials belong in the CRM admin form; do not put the Auth Token in a document or ticket.

Voice bots use this same connector. Section 8 covers what they add; the other keys they need (Groq, Claude, Google, Azure) are in [VOICE_BOT_SETUP.md](VOICE_BOT_SETUP.md).

## 1. CRM and VPS prerequisites

1. In Platform Admin, enable the **Telephony** module for the tenant. A disabled module rejects calls and provider callbacks.
2. Deploy the CRM version containing the Plivo connector and run the migrations (`$DC run --rm --no-deps web node scripts/db-migrate-local.js --upgrade`, or `deploy/vps/scripts/deploy.sh`, which migrates). Migration **0140** adds the table that stops a recorded Plivo callback from being replayed. The existing `web` and `worker` Compose services already mount the persistent `app-storage` volume at `/app/storage`; no new Docker volume is needed.
3. Confirm `APP_DOMAIN` is the public CRM hostname only (for example `app.example.com`, with no `https://`, path, or quotes). Compose sets runtime `APP_URL=https://${APP_DOMAIN}` for `web`, `worker`, and `voice-bot`. Also confirm `FILE_STORAGE_DRIVER=local`, `FILE_STORAGE_ROOT=/app/storage`, and `MARKETPLACE_SECRET_ENCRYPTION_KEY` is present in `deploy/vps/.env`. Keep the encryption key stable across deployments or saved Plivo credentials become unreadable. There are **no new `.env` keys** for Plivo.
4. Confirm the CRM is reachable over HTTPS from Plivo. Plivo signs each callback over the exact public URL it called, and the CRM checks the signature against `APP_URL`. So the Plivo Application must use the URLs shown in CRM Settings exactly: same host (`www.` or not), same scheme, no redirect in between. The HTTPS proxy must forward the `/api/integrations/telephony/plivo/` paths to the web container and pass the `X-Plivo-Signature-V3` and `X-Plivo-Signature-V3-Nonce` headers through unchanged.

From `/opt/unnatify-crm` on the VPS, these checks only display setting names and mounted paths, not secret values:

```bash
cd /opt/unnatify-crm
grep -E '^(APP_DOMAIN|APP_URL|FILE_STORAGE_DRIVER|FILE_STORAGE_ROOT)=' deploy/vps/.env
awk -F= '/^MARKETPLACE_SECRET_ENCRYPTION_KEY=/{print "MARKETPLACE_SECRET_ENCRYPTION_KEY=" (length($2) ? "<set>" : "<empty>")}' deploy/vps/.env
docker compose -f deploy/vps/docker-compose.yml --env-file deploy/vps/.env config --volumes
docker compose -f deploy/vps/docker-compose.yml --env-file deploy/vps/.env exec -T web node -e 'console.log("web APP_URL:", process.env.APP_URL || "<missing>")'
docker compose -f deploy/vps/docker-compose.yml --env-file deploy/vps/.env exec -T worker node -e 'console.log("worker APP_URL:", process.env.APP_URL || "<missing>")'
docker compose -f deploy/vps/docker-compose.yml --env-file deploy/vps/.env exec -T web node -e 'const fs=require("fs"); try { fs.accessSync("/app/storage", fs.constants.W_OK); console.log("/app/storage is mounted and writable") } catch { console.log("/app/storage is missing or not writable"); process.exitCode=1 }'
```

If `APP_DOMAIN` is missing or wrong, edit `deploy/vps/.env` on the VPS. After pushing the code and waiting for the GitHub Actions image build to finish, pull the repository and deploy the new image. The deployment script recreates `web` and `worker` when the image or environment changes:

```bash
cd /opt/unnatify-crm
git pull --ff-only origin main
bash deploy/vps/scripts/deploy.sh latest
docker compose -f deploy/vps/docker-compose.yml --env-file deploy/vps/.env exec -T web node -e 'console.log("web APP_URL:", process.env.APP_URL || "<missing>")'
docker compose -f deploy/vps/docker-compose.yml --env-file deploy/vps/.env exec -T worker node -e 'console.log("worker APP_URL:", process.env.APP_URL || "<missing>")'
```

Both outputs must be the same `https://` CRM origin that the browser uses. A container restart alone does not reload environment variables; if the image is already current and you only changed `.env`, use `docker compose -f deploy/vps/docker-compose.yml --env-file deploy/vps/.env up -d --no-deps --force-recreate web worker`. Do not generate a new `MARKETPLACE_SECRET_ENCRYPTION_KEY` on an existing installation that has encrypted secrets.

## 2. Phone numbers

The CRM saves every Plivo number in international (E.164) form, which is what Plivo dials. You can type numbers the way people write them; on save the CRM converts them and shows what it stored:

| Typed | Saved |
|---|---|
| `98765 43210` (10 digits) | `+919876543210` |
| `09876543210` or `080 2345 6789` (leading 0) | `+919876543210`, `+918023456789` |
| `919876543210` (country code, no +) | `+919876543210` |
| `+91 98765-43210` or `0091 98765 43210` | `+919876543210` |

A 10-digit number, or one starting with a single `0`, gets the **Default country code** (91 unless you change it). Lead phone numbers are converted the same way when a call is placed, so leads saved as 10-digit numbers work. Users' phones (profile or User-Agent Mapping) are converted when used.

For Indian numbers, Plivo requires KYC on the account and an India-registered business before it gives you an Indian number. Indian numbers come as normal landline/mobile series (for transactional and service calls, such as calling back a lead who enquired) or the 140-series (required for promotional calls, which also must stay within 9 am–9 pm and respect DND). Choose the series that matches how you call; Plivo's India regulatory pages have the current rules.

## 3. Configure CRM

1. Sign in as a tenant admin and open **Settings → Integrations → Phone System → Plivo native connector**.
2. Select **Plivo (native)**. Enter **Auth ID** and **Auth Token** from the Plivo Console overview page. Use the main account's credentials, or a subaccount's if this workspace's number lives in a subaccount; the number, the Application and the credentials must all be in the same (sub)account. A saved token is not shown again; leave its field blank to keep it. Re-enter a token to rotate it.
3. Enter the Plivo **inbound number** and **outbound caller ID** (usually the same Plivo number). Customers see the outbound caller ID when you call them. Enter a **Default agent phone**: it rings for callers who match no lead (or several leads), for a matched lead whose owner has no phone, for click-to-call by a user with no phone, and as the second try when the lead owner doesn't answer. It must be a different number from the Plivo number, or calls would loop.
4. **Ring time** (10–120 seconds, default 30) is how long a phone rings before the call counts as not answered. **Message for inbound callers when nobody answers** is spoken (in English) before the call ends; blank uses a standard message.
5. Set each CRM agent's phone in their user profile. Click-to-call rings that user's phone; incoming calls with one clear lead match ring the lead owner's phone. A **User-Agent Mapping** entry with `userId` and `phoneNumber` overrides the profile phone for both. Agents see the Plivo number as the caller on both kinds of call (the customer's number is in the CRM's incoming-call popup and call log).
6. Turn **Record calls and store audio on this VPS** on only if your calling policy requires it. It defaults to off. Recording starts when the dialled phone answers and stops at 4 hours. In **Compliance & Consent**, set **Recording Retention (days)**; blank or `0` keeps local audio indefinitely.
7. Turn the connector **Enabled** on and save. Click **Test Plivo connection**; it checks the saved credentials with Plivo's [Account API](https://docs.plivo.com/docs/account/api/account) without placing a call. Copy the **Answer URL** and **Hangup URL** shown in the Plivo section. They are specific to this workspace. The universal connector's webhook signing secret does not apply to Plivo.

CRM click-to-call from a lead or opportunity uses the [Plivo Call API](https://docs.plivo.com/docs/voice/api/calls) directly. It logs the call first, then rings the agent; when the agent answers, it dials the customer with [Dial XML](https://docs.plivo.com/docs/voice/xml/dial). The existing do-not-call, opt-out and quiet-hours checks still run before dialing.

## 4. Configure Plivo

1. In Plivo Console, get a voice-enabled number and confirm the account's geo permissions allow the countries you call. Plivo's [call-failure guide](https://docs.plivo.com/docs/voice/troubleshooting/call-failures) lists credits, geo permissions, caller ID and number format as common causes of failure.
2. Open **Voice → Applications → Add New Application**. Create an XML application for this workspace. Paste the CRM **Answer URL** as the **Answer URL**, method **POST**, and the CRM **Hangup URL** as the **Hangup URL**, method **POST**. Save. Plivo documents the [application and number assignment flow](https://docs.plivo.com/docs/voice/use-cases/receive-incoming-calls).
3. Open **Phone Numbers**, choose the inbound number, set **Application Type: XML Application**, select the new application, and save. Use one application per workspace.
4. If recording is on, open **Voice → Settings** and turn on **HTTP Auth on recordings**. Without it, anyone with a recording's URL can play it; with it, Plivo asks for the Auth ID and Auth Token, which the CRM sends when it downloads. See [Recording Authentication](https://docs.plivo.com/docs/voice/api/recordings).
5. Nothing else is needed for outbound calls: the CRM sends the ring, answer, hangup, dial and recording URLs with each call. Don't add a custom shared secret, and don't strip the signature headers at the proxy.

## 5. How calls are recorded in the CRM

| What happened | Call log status | Talk time |
|---|---|---|
| Customer (or agent, inbound) answered and the call ended | `completed` | The answered leg's own duration, not counting ringing |
| The dialled phone didn't answer in the ring time, or the call was cancelled | `no-answer` | none |
| Busy / failed | `busy` / `failed` | none |
| Click-to-call: the agent's own phone didn't answer | `no-answer`, reason "agent not reached" | none |
| Inbound: the caller hung up while it was ringing | `no-answer`, reason "caller hung up" | none |
| Plivo refused to start the call (credentials, credits, number) | `failed`, reason "Plivo request failed" | none |

An unanswered inbound call rings the lead owner, then the default agent phone (if it's a different phone), then plays the message. It goes to the missed-callback queue of the team set as the default call queue. A call's first outcome is kept: Plivo's callbacks for the two legs can arrive in any order, and a later one never turns a missed call into a completed one.

Each Plivo callback is checked against its V3 signature, and its one-time nonce is kept for 2 days. A callback sent again with the same nonce is answered but changes nothing. Every refused callback (unknown workspace, Plivo off, wrong signature) gets the same `403 Forbidden`.

## 6. Verify the full flow

1. Keep recording **off**. Start click-to-call from a test lead. The agent phone should ring first; after the agent answers, the customer should ring. Check **Settings → Integrations → Phone System → Call Log API** or the Call Center call list for one `plivo` call record, then check the lead's Call activity for status, numbers, timing and outcome. Repeat once without answering the customer phone: the call should end `no-answer`, not `completed`.
2. Call the Plivo inbound number from a test lead's phone. The lead owner's phone should ring. Let it ring out: the default agent phone should ring next. Repeat from a phone that matches no lead: the default agent should ring. Confirm the inbound popup and the missed-call queue.
3. Turn recording **on** and make a connected call longer than a minute. After Plivo's recording-ready callback, which comes once the call has ended, the lead or opportunity **Call Recordings** panel should show the full recording. Play and download it through the CRM. Confirm the file exists inside `/app/storage/telephony/` in the web container. The UI never shows the Plivo media URL.
4. Turn recording **off** and make another call. Its call history and activity should still appear; no new recording should be created. Recordings already saved stay until retention expires.
5. When a status differs from what you expect, compare with Plivo **Voice → Logs → Calls**. Plivo's [Dial XML](https://docs.plivo.com/docs/voice/xml/dial) and [hangup causes](https://docs.plivo.com/docs/voice/troubleshooting/hangup-causes) explain the provider side.

## 7. Troubleshooting

| Symptom | Cause and fix |
|---|---|
| Plivo's debug log shows `403` for the CRM URL | The signature didn't match, Plivo is off for the workspace, or the Telephony module is disabled. Check that the Application's URLs are exactly the ones in CRM Settings (same host as `APP_URL`, `https`, no redirect) and that the Auth Token saved in the CRM belongs to the account or subaccount that owns the number. |
| Plivo Application URLs are missing in CRM Settings | Read the exact message in the URL card. Check `APP_DOMAIN` in `deploy/vps/.env`, then check the running `web APP_URL` using the command in section 1. Pull the latest Compose file and recreate `web` and `worker`. The URL card does not require the connector to be enabled. |
| `404 Unknown call` | A callback for an outbound call the CRM didn't place (for example an old call from before the upgrade, or a call made from the Plivo Console). Safe to ignore. |
| `500` | A server error; the CRM's logs have the details (`Plivo webhook failed`). |
| Click-to-call says the agent number is missing | Neither the user nor the default agent phone has a usable number. Set the user's phone (or a User-Agent Mapping) or the Default agent phone. |
| Saving shows "A phone number isn't valid" | The number has too few or too many digits. Enter it with its country code, such as `+919876543210`. |
| Calls fail immediately with `failed` | Check Plivo credits, geo permissions and that the caller ID is a Plivo number on this account. |
| Recording missing | Recording was off when the call started, the call wasn't answered, or the download failed: check the CRM logs for `Plivo recording failed` and that **HTTP Auth on recordings** matches the saved credentials. |

The CRM streams each recording into a private file after Plivo's recording-ready callback, capped at **500 MB per recording**. It doesn't delete Plivo's hosted copy; manage that in Plivo's Voice Recordings page or its [Recording API](https://docs.plivo.com/docs/voice/api/recordings) after checking the CRM copy. The app-storage volume is on the VPS and is covered by the project's existing decision not to make off-server file backups yet. There is no voicemail: an unanswered inbound caller hears the message and the call ends.

## 8. Voice bots

Voice bots place and answer calls through this connector: there is no second Plivo setup. Do sections 1–6 first.

1. **Connector on.** A bot can't go live until the connector is **Enabled** with **Plivo (native)** selected. The bot's **Before this bot can go live** list checks this and links to Phone system.
2. **Numbers and who answers.**
   - **Voice bots → Numbers** lists the Plivo numbers on the account, read with the saved Auth ID and Auth Token (up to 100). Subaccount credentials see that subaccount's numbers. If Plivo can't be reached, it shows the inbound number and caller ID saved here.
   - Each number has a mode:
     - **People:** today's routing (section 5).
     - **Bot:** the chosen bot answers.
     - **People, then bot:** within the bot's calling hours (its Calling tab), today's routing first, and the bot answers when nobody picks up. Outside those hours, the bot answers at once.
   - Every number stays assigned to this workspace's CRM Application (section 4, steps 2–3). **Don't point a number at the bot service.** The CRM's Answer URL decides on each call whether the bot or a person answers.
   - If the bot can't take a call, today's routing carries on. That happens when two bot calls are already running in the workspace, when Voice bots is switched off, or when the bot isn't live.
   - A caller whose number matches no lead becomes a new lead after the call, with source **Voice bot (inbound)**, owned per the assignment rules.
3. **Bot calls and audio.**
   - The CRM places outbound bot calls with the [Call API](https://docs.plivo.com/docs/voice/api/calls), from the bot's **Calling from** number (Calling tab), or the outbound caller ID when none is chosen. The worker places them (job `voiceBots.dispatchCalls`, every 15 seconds), so the worker must be running.
   - Answering-machine detection, a per-bot setting, runs in the background: Plivo reports a machine to the CRM's `/machine` callback and the CRM hangs up. It counts as not answered and is retried.
   - Bot calls use the same Application URLs as section 4; there is nothing more to add in Plivo.
   - During a bot call, the CRM's Answer XML tells Plivo to stream the call's audio both ways, with the [Stream element](https://www.plivo.com/docs/voice/xml/audio-streaming), to `wss://<APP_DOMAIN>/voice-bot/…` on this VPS.
   - There's nothing to set in the Plivo Console for this. The proxy must allow WebSocket connections on that path; the supplied Caddyfile does (see [VOICE_BOT_SETUP.md](VOICE_BOT_SETUP.md) section 7).
   - Each stream carries a single-use token issued by the CRM for that one call, so the bot service accepts no other audio.
4. **Live transfer.** When a bot hands a caller to a person, the CRM moves the live call with Plivo's [transfer API](https://docs.plivo.com/docs/voice/api/call/transfer-a-call) to a Dial of the lead owner, then the bot's team's agents whose availability is **Online**. Agents with the fewest calls today are rung first, each for the bot's ring time. These are the same agent phones as click-to-call (section 3, step 5).
   - Each person rung gets a CRM notification with the reason and the caller's last words.
   - If nobody answers, Plivo plays the bot's own "nobody is free right now" line and the call ends. The owner gets a callback task.
   - Plivo fetches that line from a signed address on the CRM (`/api/public/voice-bot-audio/…`) that lasts 15 minutes.
5. **Number series.** Bots call only leads who enquired (decision 2). That is a transactional/service call, so a normal-series Indian number is the right one. Bots also keep to the bot's calling hours, the holiday list, and the CRM's do-not-call, opt-out and quiet-hours checks.
6. **Recording.**
   - Bot calls follow the bot's own **Keep call audio** setting (Basics tab), not the connector's recording switch.
   - Transcripts are always kept on the bot's activity.
   - Kept audio is stored on this VPS and follows the same **Recording Retention (days)**. **HTTP Auth on recordings** (section 4, step 4) still applies.
7. **Cost.** Plivo's India price page (checked 2026-10-27):

   | Item | Price |
   |---|---|
   | Calls in and out | ₹0.38 a minute, billed per 30 seconds |
   | Audio streaming | Included |
   | Answering-machine detection | Included |
   | Number rental | ₹200 a month |
   | Noise cancellation | ₹0.12 a minute; not used |

   Recheck before relying on these.
8. **Check bot calls.**
   1. On the bot's **Calls** tab, use **Call my phone**. The bot calls your profile phone with its saved settings, even before it's live and outside calling hours. Check Plivo **Voice → Logs → Calls** for the call and its stream.
   2. The call's line on the Calls tab shows the summary, fields and transcript.
   3. To check answering, set a number to **Bot** in **Voice bots → Numbers** and call it from another phone. Then try **People, then bot** and let the owner's phone ring out.
   3. Then call a test lead: the lead's timeline gets the bot's activity, with its fields, and the History tab shows any fields the bot copied.
   - Use **Test call** (in the browser, no Plivo) to work on the conversation itself.

