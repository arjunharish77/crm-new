# Voice bots: keys and setup

This guide covers everything voice bots need **apart from Plivo**:
- the four provider accounts and their keys;
- where the keys go in the CRM;
- the server pieces;
- watching how the bots do (section 9) and the first real calls (section 10).

Plivo has its own guide, [PLIVO_CONNECTOR_SETUP.md](PLIVO_CONNECTOR_SETUP.md). Its section 8 covers what voice bots add.

Keys are entered only in the CRM, under **Voice bots → Providers**. The CRM stores them encrypted and never shows them again, only their last four characters. Don't paste a key into chat, email, a ticket or `.env`.

## 1. What you need

| Provider | What it does for the bots | Needed? | Cost | Time to set up |
|---|---|---|---|---|
| **Groq** | Turns the caller's speech into text (Whisper). It can also run the conversation (gpt-oss models). | **Always** | Free plan, no card | 5 minutes |
| **Claude (Anthropic)** | Runs the conversation for bots set to Claude. It also writes call summaries and fields, drafts bots, and builds knowledge. | Only for bots set to Claude, and for the Claude helpers | Prepaid credits; the CRM's monthly budget (default $160) caps spend | 15 minutes |
| **Google Text-to-Speech** | The bots' voice: Chirp 3 HD, in Indian Hindi and English. | **Yes**, unless every bot uses Azure | Free up to 1 million characters a month, then $30 per million. Needs a billing account. | 20 minutes |
| **Azure Speech** | Backup voice when Google's free amount is close to used up. It can also be a bot's main voice. | Recommended | Free tier (F0): 0.5 million characters a month. Needs a card at sign-up. | 20 minutes |

On the free plans, the limits that matter are:
- **Groq speech-to-text:** 20 requests a minute and 2,000 a day. This limit allows **about 2 calls at the same time**.
- **Groq conversation:** 1,000 requests a day per model, which is about 25–40 calls a day on Groq alone. Claude doesn't have this limit.
- **Google voice:** about 1 million characters a month, roughly 4,000–6,000 minutes of bot speech.

The CRM watches these limits and shows usage on the Providers tab.

Prices and limits were checked on the providers' pages on 2026-10-27. They change, so check again before relying on them.

## 2. Groq (required)

Use a **separate Groq account just for the CRM**, not the website's (decision 22). Groq applies its limits per organisation, so a separate account keeps the bots and the website from using up each other's limits.

1. Go to [console.groq.com](https://console.groq.com) and sign up with an email used only for this (for example a `crm-voice@` address). The free plan needs no card.
2. Open **API Keys**, then **Create API Key**. Name it `CRM voice bots` and copy the key. It starts with `gsk_` and is shown only once.
3. In the CRM, open **Voice bots → Providers → Groq**, paste it into **API key**, and click **Save** on the save bar. Then click **Test connection**. A pass means Groq accepted the key and lists the models.
4. Optional: Groq's **Settings → Limits** page shows the organisation's current limits.

If Groq later changes its free models, the CRM picks models by setting, so the bots keep working; tell the developer which models are offered.

## 3. Claude (only for Claude bots and the Claude helpers)

The CRM tracks Claude spend itself and stops at the monthly budget. Anthropic's own spend limit on a separate workspace is a second safety net.

1. Go to [platform.claude.com](https://platform.claude.com) and sign in, or create the organisation.
2. **Add credits.** Open **Settings → Billing** and buy credits. API use is prepaid.
3. **Create a workspace for the CRM.**
   - Open **Settings → Workspaces → Create workspace** and name it `CRM voice bots`.
   - A spend limit can't be set on the Default workspace, which is why the CRM gets its own.
4. **Set the workspace's spend limit a little above the CRM budget**, for example **$170 a month** when the CRM budget is $160.
   - The CRM's own budget is reached first. Bots then move to Groq without the caller noticing, and admins are alerted at 50%, 80% and 95%.
   - Anthropic's limit only matters if something goes wrong. When it's hit, the CRM shows "Claude's spend limit in the Anthropic Console has been reached" and bots use Groq.
5. **Create the key.** Open **Settings → API keys → Create key**, choose the **CRM voice bots** workspace, and name it `CRM voice bots`. Copy the key; it starts with `sk-ant-` and is shown only once.
6. **Enter it in the CRM.**
   - Open **Voice bots → Providers → Claude (Anthropic)** and paste the key.
   - Set **Monthly budget (US$)**; the default is 160.
   - Click **Save**, then **Test connection**. A pass means the key works and both Claude Haiku 5.5 and Claude Sonnet 5.5 are available to it.

What it costs (Anthropic prices, per million tokens):

| Model | Input | Output | Cached input |
|---|---|---|---|
| Haiku 5.5 | $0.10 | $0.50 | $0.01 |
| Sonnet 5.5 | $2 | $10 | $0.10 |

A 4-minute call on Haiku costs about $0.002–0.005, and its Sonnet summary about $0.01. $160 a month covers roughly 10,000 calls.

New Anthropic organisations can start with lower rate limits that rise with use. If a bot reports "Claude is busy", check **Usage → Rate limits** in the Console.

## 4. Google Text-to-Speech (the bots' voice)

You need a Google Cloud project with the Text-to-Speech API on, a billing account (Google requires one even for the free amount), a budget alert, and an API key restricted to Text-to-Speech.

1. **Project.** Go to [console.cloud.google.com](https://console.cloud.google.com) and create a project named `crm-voice-bots`.
2. **Billing.**
   - Open **Billing** and link a billing account to the project, creating one with a card if needed.
   - Then open **Billing → Budgets & alerts → Create budget**:
     - scope: this project;
     - amount: **₹1**;
     - alerts: at 50%, 90% and 100%, by email to you.
   - A budget only alerts; it doesn't stop spending. The CRM switches the voice to Azure at 90% of Google's free amount, and comes back to Google at the paid rate only once Azure's free amount is used too (decision 33); the CRM alerts admins when that starts. So this alert firing means paid voice use has begun, as expected late in a busy month. If it fires early in the month, tell the developer.
3. **Turn on the API.** Open **APIs & Services → Library**, search for **Cloud Text-to-Speech API** and click **Enable**.
4. **Create the key.**
   - Open **APIs & Services → Credentials → Create credentials → API key**, then open the new key to edit it.
   - **Name:** `CRM voice bots`.
   - **API restrictions:** **Restrict key**, and tick only **Cloud Text-to-Speech API**.
   - **Application restrictions:** **IP addresses**, then add the VPS's public IP address. Both the CRM and the bot service call Google from the VPS. Leave this out only while testing from a laptop, and add it before going live.
   - Save, then copy the key; it starts with `AIza`.
5. **Enter it in the CRM.** Open **Voice bots → Providers → Google Text-to-Speech**, paste the key, then **Save** and **Test connection**. A pass lists the Hindi voices.
6. **Choose voices.**
   - In each bot, open **Basics → Languages and voices**, choose **Google**, then a voice for Hindi and one for English.
   - **Play sample** speaks a line in that voice. Chirp 3 HD voices are named like `hi-IN-Chirp3-HD-Aoede`, and the same voice name exists for both languages, so the bot can sound like one person in both.

## 5. Azure Speech (backup voice)

1. Sign in at [portal.azure.com](https://portal.azure.com). A new account needs a card; the free tier doesn't charge it.
2. **Create a resource**, search for **Speech** and choose the **Speech service** resource.
   - Choose your subscription and a resource group, for example create `crm-voice`.
   - **Region: Central India.** Text then stays in India for the backup voice.
   - **Name:** for example `crm-voice-bots-speech`.
   - **Pricing tier: Free F0.** Azure allows one F0 Speech resource per subscription.
   - Review and create.
3. Open the resource, then **Keys and Endpoint**. Copy **KEY 1** and the **Location/Region** value, which is `centralindia`.
4. **Enter it in the CRM.**
   - Open **Voice bots → Providers → Azure Speech** and paste the key into **API key**.
   - Enter `centralindia` in **Region**.
   - Click **Save**, then **Test connection**. A pass lists the Indian voices.
5. The free tier has 0.5 million characters a month. When Google's free amount is 90% used, the bots switch to Azure. When Azure's is close to used up too, they go back to Google **at the paid rate** (about $30 per million characters, roughly ₹1 per call-minute), and admins get an alert when that starts (decision 33). Together the two free amounts cover roughly 1,000 calls a month.

## 6. In the CRM

1. **Modules.** A platform admin makes sure **Telephony** and **Voice bots** are on for the workspace (Platform admin → the tenant → Modules). Voice bots needs Telephony.
2. **Who can do what.** Open **Settings → Users & access → Roles & permissions**. Each role has a **Voice bots** level and a **Voice bots: bulk calls** switch.

   | Level | Can |
   |---|---|
   | No access | Nothing with voice bots |
   | View bot calls | See bot calls and their results |
   | Use | Start bot calls on records they can see. This is the default when the level isn't set. |
   | Manage | Also build bots and set numbers, holidays and providers |

   Admins have everything. The **bulk calls** switch decides whether a role can start bot calls for many records at once.
3. **Providers.** Enter the keys from sections 2–5, then **Save** and **Test connection** for each.
4. **Plivo.** Follow [PLIVO_CONNECTOR_SETUP.md](PLIVO_CONNECTOR_SETUP.md), then its section 8 for numbers and bot calls.
5. **Holidays.** Open **Voice bots → Holidays** and add days when bots shouldn't call.
6. **Build a bot.** Open **Voice bots → Bots → Create bot**. The **Before this bot can go live** list at the top of the bot shows what's still missing, with a link to the place that fixes each item.
7. **Start calls.** Once a bot is live, bot calls can be started from:
   - a lead or opportunity: **More → Call with voice bot**;
   - the leads or opportunities list: select records, or **select all matching** (up to 5,000, so a saved view works too), then **Call with voice bot** on the selection bar;
   - a lead list: **Call with voice bot** at the top;
   - an automation or journey: the step **Call with Voice Bot**. With **Wait for the outcome**, the next steps can branch on **Voice Bot Call: Outcome**;
   - a call campaign: set **Dialled by** to a voice bot (**Settings → Calling → Call campaigns**);
   - new enquiries: the bot's **Calling** tab, **New enquiries**, with the lead sources to call within about a minute;
   - incoming calls: **Voice bots → Numbers**, mode **Bot** or **People, then bot**.

## 7. Server (done once, by whoever deploys)

The bots run in their own container, `voice-bot`, next to the CRM on the VPS. Plivo sends call audio to it over a secure WebSocket, through Caddy, at `wss://<APP_DOMAIN>/voice-bot/…`. The CRM and the bot service talk over the private Docker network.

1. **One new secret in `deploy/vps/.env`:** `VOICE_BOT_SERVICE_SECRET`. The CRM and the bot service use it to trust each other. Generate it once on the VPS, from `/opt/unnatify-crm`, so the value is never shown:

   ```bash
   cd /opt/unnatify-crm
   grep -q '^VOICE_BOT_SERVICE_SECRET=' deploy/vps/.env || echo "VOICE_BOT_SERVICE_SECRET=$(openssl rand -hex 32)" >> deploy/vps/.env
   awk -F= '/^VOICE_BOT_SERVICE_SECRET=/{print "VOICE_BOT_SERVICE_SECRET=" (length($2) >= 32 ? "<set>" : "<too short>")}' deploy/vps/.env
   ```

   Keep it stable. Changing it only means restarting `web`, `worker` and `voice-bot` together; nothing stored depends on it.
2. **Start it.** `deploy.sh` updates only `web` and `worker`, so the bot service is built and started on its own, on the server, from `/opt/unnatify-crm`:

   ```bash
   cd /opt/unnatify-crm
   DC="docker compose -f deploy/vps/docker-compose.yml --env-file deploy/vps/.env"
   $DC up -d --build voice-bot
   $DC up -d --no-deps web worker
   $DC run --rm --no-deps caddy caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
   $DC up -d --no-deps --force-recreate caddy
   ```

   - The first command builds the service; all its packages are pinned in `voice-bot/requirements.txt`.
   - The second recreates `web` and `worker`, so they join the bot service's private network and get its address (`VOICE_BOT_SERVICE_URL=http://voice-bot:8765`, set in the Compose file).
   - The third checks the new Caddyfile, and the fourth restarts Caddy with it (both sites pause for a second or two). Run the fourth only if the third says `Valid configuration`. `caddy reload` isn't enough: the Caddyfile is mounted as a single file, so after `git pull` the running container still sees the old version. The Caddyfile:
     - sends `/voice-bot/*` on the CRM domain to the service;
     - allows the microphone on CRM pages;
     - blocks `/api/internal/*` from outside.
   - Provider keys are **not** in `.env`: the CRM hands each call's keys to the service over the private network.
   - After later updates to `voice-bot/`, run the first command again.
3. **Size.** Plan for about **2 CPU cores and 2 GB of RAM** on top of what runs today. The service detects speech and the end of each turn on the CPU, and the knowledge search (voice bot wave D) adds more. After the first week of real calls, check with `docker stats` before deciding to upgrade the VPS.
4. **Check it's running.** These show only status, not secrets:

   ```bash
   cd /opt/unnatify-crm
   docker compose -f deploy/vps/docker-compose.yml --env-file deploy/vps/.env ps voice-bot
   docker compose -f deploy/vps/docker-compose.yml --env-file deploy/vps/.env exec -T voice-bot python -c "import urllib.request; print(urllib.request.urlopen('http://127.0.0.1:8765/health', timeout=5).read().decode())"
   ```

   Then, in the CRM, open any bot. If the service can't be reached, its **Before this bot can go live** list says so.
5. **Test call from the browser.** Each bot has a **Test call** button: you talk to the bot through your computer's microphone, without Plivo. The browser asks for microphone permission for the CRM site. This tests the voice, language switching and replies before any real call.
6. **A real call to your phone.** Once Plivo is set up, the bot's **Calls** tab has **Call my phone**: the bot calls the phone on your profile through Plivo. The **worker** container places bot calls, so it must be running (it is in the normal deployment).

If browser **Test call** reports a public URL error, or **Call my phone** stays queued or fails, check the runtime URL in both containers. From `/opt/unnatify-crm` on the VPS, run these lines one at a time:

```bash
grep '^APP_DOMAIN=' deploy/vps/.env
docker compose -f deploy/vps/docker-compose.yml --env-file deploy/vps/.env exec -T web node -e 'console.log("web APP_URL:", process.env.APP_URL || "<missing>")'
docker compose -f deploy/vps/docker-compose.yml --env-file deploy/vps/.env exec -T worker node -e 'console.log("worker APP_URL:", process.env.APP_URL || "<missing>")'
docker compose -f deploy/vps/docker-compose.yml --env-file deploy/vps/.env exec -T web node -e 'console.log("VOICE_BOT_PUBLIC_URL:", process.env.VOICE_BOT_PUBLIC_URL || "<automatic>")'
docker compose -f deploy/vps/docker-compose.yml --env-file deploy/vps/.env ps web worker voice-bot
```

`APP_DOMAIN` must be the CRM hostname alone, and both runtime values must be `https://` plus that hostname. Leave `VOICE_BOT_PUBLIC_URL` unset on the VPS; if set, it must point to the public `wss://` bot path. After correcting the `.env` file or pulling a Compose change, recreate the containers with `docker compose -f deploy/vps/docker-compose.yml --env-file deploy/vps/.env up -d --no-deps --force-recreate web worker`. Then refresh the Plivo Application URLs in CRM Settings. If URLs appear but calls still fail, inspect the bot's Calls tab for the call error and compare Plivo **Voice → Logs → Calls**; a browser test does not require Plivo, but a phone call does.

## 8. Troubleshooting

| What you see | What to do |
|---|---|
| Groq test: "key refused" | The key was deleted or mistyped. Create a new one in console.groq.com and save it. |
| Bots slow down or say they'll call back, at busy times | Groq's per-minute speech limit (about 2 calls at once). The queue keeps to it; the paid Groq tier removes it. |
| "This month's Claude budget is used up" | The CRM budget was reached; bots are on Groq. Raise **Monthly budget** in Providers, or wait for the 1st of next month. |
| "Claude's spend limit in the Anthropic Console has been reached" | Anthropic's workspace limit is lower than the CRM budget. Raise it in the Console (step 3.4). |
| "Claude is busy" | Anthropic's rate limit, common for new organisations. It rises with use; check **Usage → Rate limits** in the Console. |
| Google test fails with "API not enabled" or "key refused" | Check step 4.3, and that the key's API restriction includes **Cloud Text-to-Speech API**. With an IP restriction, the VPS IP must match. |
| Google test passes on a laptop but fails on the server | The key's IP restriction doesn't include the VPS's public IP. |
| Azure test fails | Check the key is **KEY 1** of the Speech resource, and the region is exactly `centralindia` (lower case, no space). |
| Test call: "microphone blocked" | Allow the microphone for the CRM site in the browser's site settings, then reload. |
| Test call doesn't connect | The bot service isn't running or isn't reachable (section 7.4). |

## 9. Watching how the bots do

- **Voice bots → Overview** shows every bot's calls for the last 7, 30 or 90 days. Each bot's **Results** tab shows the same for that bot.
  - Calls placed and answered, incoming calls, interested, callbacks and hand-overs, and calls per day.
  - **Reply time** per AI: the typical time, and the time 9 in 10 replies beat, from the end of the caller's speech to the bot's first sound. It is split into hearing, thinking and voice. Use it to compare Groq with Claude on real calls.
  - **Free limits and budget**: today's use of each Groq model and Whisper (Groq's limits reset daily, UTC), this month's Google and Azure voice characters, and the Claude budget.
  - **Calls to listen to**: see below.
- **Quality review.** After each answered call, Claude scores how the bot did (1–5) against the bot's persona, goal and rules. It flags a call **worth a listen** when the bot made something up, broke a rule, misunderstood the caller, upset or confused them, or missed a hand-over they asked for. The review is part of the summary request, so it costs about the same (well under a cent a call). When Claude isn't set up or its budget is used up, Groq writes it. Flagged calls are under **Calls → To listen**, with the reasons, the transcript and the recording when the bot keeps audio.
- **Reports → Voice Bot Performance** gives one row per bot for chosen dates, for export or a schedule. It needs the View level for Voice bots or higher.
- **Alerts** go to workspace admins as notifications:
  - at 80% of any free limit (a Groq model's daily requests or tokens, Whisper's daily audio, Google's or Azure's monthly characters);
  - at 50%, 80%, 95% and 100% of the Claude budget;
  - when bots start using Google's voice at the paid rate.

## 10. First real calls (live test list)

Do these in order, after sections 2–7 and Plivo's section 8. Note anything odd on the call's line in the bot's **Calls** tab: the transcript, reply times and review are there.

1. **Providers.** In **Voice bots → Providers**, every key you use shows **Connected** after **Test connection**.
2. **Browser test call.** On a bot, use **Test call** (no Plivo, no cost). Speak Hindi, then English, then mix them. The bot should follow you within a turn or two.
3. **Call my phone.** On the bot's **Calls** tab, use **Call my phone**. Check:
   - the opening line and the voice in Hindi and in English;
   - interrupting the bot mid-sentence (it should stop and listen);
   - a question from the bot's knowledge (it answers from it, not made up);
   - staying silent for the silence limit (it asks if you're there, then ends politely);
   - saying "don't call me again", **from a spare phone only**: the number goes on the bot stop list, and there's no screen yet to take a number off it.
4. **Reply time.** Open the call's line: typical replies under about 1 second on Groq is good; Claude is usually a little slower. Over 1.5 seconds often means the server is far from the providers or busy.
5. **Hand-over.** Ask the bot to talk to a person. Your owner phone should ring, then the team's online agents. Try once answering and once letting it ring out (you should hear the bot's "nobody is free" line, and a callback task should appear).
6. **A lead call.** Make yourself a lead with your number, then **More → Call with voice bot**. Afterwards the lead shows the bot's activity with its summary and fields, any mapped fields changed ("modified by voice bot" in History), and a task if you asked for a callback.
7. **Unanswered and machine.** Call a number that won't answer, and one with voicemail. Both should count as not answered and be tried again per the bot's retries, inside calling hours.
8. **Incoming.** Set a number to **Bot** in **Voice bots → Numbers** and call it from a phone that isn't a lead: a new lead appears with source **Voice bot (inbound)**. Then try **People, then bot** in calling hours and let the owner's phone ring out: the bot should take the call.
9. **Results.** Check the bot's **Results** tab and **Reports → Voice Bot Performance** show the calls, and that the free limits moved.

If anything in steps 3–8 doesn't behave as described, keep the call's line on the Calls tab and report it with the time of the call.
