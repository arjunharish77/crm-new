# Voice bot module: plan for approval

Status: **approved 2026-10-27; wave A done** (§11). Decisions were answered one at a time on 2026-10-26/27 and are listed in section 1.

The aim is AI voice agents that call leads who enquired and answer inbound calls on chosen Plivo numbers. They speak Hindi, English and Hinglish in a natural Indian voice, answer from a knowledge base, hand interested callers to a person live, and write the outcome back into the CRM as their own activity type with fields. The only running cost is Plivo's per-minute charge. Every other service uses a free tier and can be switched to a paid one later without rebuilding.

## 1. Decisions

| # | Topic | Decision |
|---|---|---|
| 1 | Volume and cost | Start on free tiers (about 1–2 calls at once; daily capacity in §3), with a switch per service to a paid provider later. |
| 2 | Who is called | Outbound only to leads who enquired (transactional/service calls), plus inbound calls. No cold or promotional calling. |
| 3 | Live transfer | Lead owner first; if no answer within the ring time, the next available agent of the bot's team; if nobody answers, a callback task. |
| 4, 23 | Inbound numbers | Each Plivo number is set to **Bot**, **Owner** (today's routing) or **Owner then bot** (the bot takes calls nobody answers and calls outside working hours). Each bot picks its numbers from the account's number list. |
| 5 | Knowledge | Uploaded documents, written Q&A, CRM catalogue data, website pages. |
| 6 | Server | The India-region VPS runs the bot service and can be upgraded (needs about 2 cores and 2 GB more). |
| 7 | Voice | Google Chirp 3 HD Indian voices on the free tier; when the monthly free amount runs out, Azure's free tier automatically. |
| 8 | Opening line | Fully editable per bot, no required notice (see §12 on DPDP). |
| 9 | Manual calls | System activity types (Call, WhatsApp, Email, SMS, every voice-bot type) can't be created by hand. Reps log outside calls under a new editable type, "Call (logged manually)". |
| 10 | Editing system activities | Call facts are read-only; custom fields and notes are editable with edit rights; only admins delete. |
| 11 | Field mapping | Per mapped field: fill if empty / always overwrite / never copy; every change is in the record's history as "set by voice bot". |
| 12 | Retries | Per bot (default 3 attempts: after 2 hours, then next day) within its calling hours; answering machines count as not answered. |
| 13 | Triggers | Manual selection (leads, opportunities, lead lists), automations, instant call on a new enquiry, Smart Views, journeys and call campaigns. |
| 14 | Queue order | Inbound, then new enquiries, then retries, then bulk; daily limit per bot shown as "x of y used". |
| 15 | Calling hours | Per bot, default 10:00–19:00 Monday–Saturday in the workspace time zone, plus a holiday list (new: the CRM has no holiday calendar). |
| 16 | Languages | Hindi, English, Hinglish; switches to the caller's language; more Indian languages can be added later. |
| 17 | What's kept | Per bot: keep audio or not. Transcript and summary are always kept. |
| 18 | Permissions | New role permission "Voice bots": none / use / manage, plus a "bulk calls" switch. Admins have everything. |
| 19 | Variation | Each bot is its own activity type with its own script, knowledge, numbers and fields. |
| 20 | Builder | Guided AI conversation (persona, goal, rules, fields to collect, when to transfer or end), plus optional fixed steps (e.g. a fixed first question or closing). |
| 21 | "Don't call me" | Stops **bot** calls to that number; people can still call. |
| 22 | Groq | A separate free Groq account for the CRM voice bot. |
| 27 | Claude for the conversation (2026-10-27) | Each bot picks its AI: Groq, Claude Haiku 5.5 or Claude Sonnet 5.5 (default Haiku), switchable at any time. |
| 28 | AI fallback | If the chosen AI fails mid-call (Groq limit reached, Claude error), the call carries on with the other one at once, both ways; the switch is logged on the call. |
| 29 | Claude budget | A hard monthly cap set in the CRM (default $160). Admins are alerted at 50%, 80% and 95%; at 100% bots use Groq until the next month. Spend is shown per bot. |
| 30 | Other Claude uses | After-call summary and fields (Sonnet 5.5), knowledge building (cleaning pages and documents, drafting Q&A), a bot-builder helper (draft persona, rules, fields and opening line from a description; review test calls), and call quality review (score finished calls, flag ones to listen to). |
| 31 | Caller details | Each bot ticks which lead and opportunity fields (standard and custom) it may see. Only those go to the AI and can be used as placeholders. |
| 32 | Which opportunity | For a call started from a lead, a bot setting decides: the latest open opportunity, the latest of a chosen type, or none. A call started from an opportunity uses that one. |
| 33 | Voice after the free amounts | 2026-10-27: the on-server voice is dropped, because the Piper Hindi voices are licensed for non-commercial use only. When Google's and Azure's free amounts are both used, bots keep using Google's voice at the paid rate (about $30 per million characters), and admins are alerted when that starts. |
| 34 | Unknown inbound callers | 2026-10-27: when the bot answers a number that matches no lead, a new lead is created after the call: the caller's number, the name if they gave it, source "Voice bot (inbound)", owned per the lead assignment rules. The bot's activity, fields and any callback task go on it. |
| 35 | Working hours for "Owner then bot" | 2026-10-27: the bot's own calling hours (Calling tab, with holidays). Inside them people are rung first and the bot takes calls nobody answers; outside them the bot answers straight away. |
| 24 | Sent messages (2026-10-27) | Emails, WhatsApp messages and SMS the CRM sends to a lead or opportunity are logged as locked activities that follow delivery (sent, delivered, read, failed). Before this they weren't activities at all. Outside messages go under "Email/WhatsApp/SMS (logged manually)". |

## 2. How a call works

```
Caller/lead phone ⇄ Plivo (India) ⇄ [audio stream, WebSocket] ⇄ voice-bot service (VPS, Python)
                                                                   ├─ speech detection + end-of-turn: Silero VAD + Smart Turn v3 (on the VPS)
                                                                   ├─ speech to text: Groq Whisper large-v3
                                                                   ├─ conversation: Groq gpt-oss-20b (prompt caching)
                                                                   ├─ knowledge search: local embeddings, on the VPS
                                                                   └─ voice: Google Chirp 3 HD (streaming) → Azure → Google paid (decision 33)
CRM (Next.js) ⇄ voice-bot service: start call, bot config, knowledge, transfer, results (signed internal API)
```

- **Bot service.** A new Python container, `voice-bot`, built on [Pipecat](https://github.com/pipecat-ai/pipecat) (BSD licence; it has a ready Plivo audio serializer, barge-in and turn handling). It runs next to the CRM on the VPS, like the existing `ml-service`. Caddy forwards one public WebSocket path to it. Plivo connects there with a `<Stream bidirectional>` element in the call's answer XML.
- **Outbound.** The CRM queue places the call through the Plivo Call API with answering-machine detection. The answer URL returns `<Stream>` to the bot service. The bot speaks the opening line within about 300 ms of the person saying hello.
- **Inbound.** The number's mode decides who answers:
  - **Bot** returns `<Stream>`.
  - **Owner** is today's routing.
  - **Owner then bot**: today's routing, and when nobody answers or it's outside working hours, `<Stream>` instead of the "nobody available" message.
- **Transfer.** When the caller is interested (the AI decides from the bot's rules, or the caller asks for a person), the bot says a short line. Plivo's transfer API then moves the caller to a `<Dial>`: the lead owner first, then the next available agent of the bot's team, using the CRM's own agent-availability data and the ring time. While it rings, the caller hears a hold tone. The agent gets a CRM popup with the bot's summary so far. If nobody answers, the bot comes back, says someone will call back, and books a callback task.
- **After the call.** The service sends the CRM the transcript, the turn timings, the outcome and the recording (when kept). A second AI pass (`gpt-oss-120b`, which has its own free quota) writes the summary and fills the bot's fields from the transcript. The CRM then:
  - creates the bot's activity with those fields;
  - applies the field mapping to the lead or opportunity;
  - updates the call log, queue and retries;
  - fires the existing call automations.

### Latency: what "zero lag" can honestly mean

No phone AI reaches literally zero. The realistic target with this free stack, measured from the caller stopping speaking to hearing the bot start:

| Step | Typical |
|---|---|
| End-of-turn decision (VAD + Smart Turn, on the VPS) | 150–250 ms |
| Speech to text (Groq Whisper, one utterance) | 250–400 ms |
| First words of the reply (Groq gpt-oss-20b, cached prompt) | 150–300 ms |
| First audio from the voice (Chirp 3 HD streaming) | 150–300 ms |
| Network (Plivo India ⇄ VPS India ⇄ US services) | 100–200 ms |
| **Total** | **about 0.8–1.3 s** |

Ways to make it feel faster:
- The reply is spoken sentence by sentence while the rest is still being written.
- A short natural acknowledgement ("haan ji", "okay", "sure") is pre-recorded in the bot's voice. It plays at once when the reply will take longer, for example during a knowledge lookup.
- The caller can interrupt at any time: barge-in stops the bot mid-sentence.
- The opening line and fixed steps are synthesised in advance and cached.

Most callers then hear about 0.6–0.9 s. That is in line with paid phone-AI products, but it is not instant. The plan measures every turn and shows the median and slowest on the bot's dashboard.

## 3. Free stack, limits and the upgrade switch

| Part | Free choice | Limits (checked 2026-10-26) | Paid switch later |
|---|---|---|---|
| Speech to text | Groq Whisper large-v3 | 20 requests/min, 2,000/day, 8 hours of audio/day | Groq paid, Deepgram Nova-3 (Hindi), Sarvam |
| Conversation | Groq gpt-oss-20b (120b selectable per bot) | 30 requests/min, 1,000/day, 8,000 tokens/min, 200,000 tokens/day, **per model**; cached prompt tokens don't count | Groq paid tier |
| Summary and fields | Groq gpt-oss-120b | separate quota from the 20b | same |
| Voice | Google Chirp 3 HD → Azure neural (F0) → Google paid (decision 33) | Google about 1M characters/month free; Azure 0.5M characters/month free (together roughly 1,000 calls a month) | Google paid, ElevenLabs, Sarvam Bulbul |
| End-of-turn, speech detection, knowledge search | Silero VAD, Smart Turn v3, multilingual-e5-small embeddings, all on the VPS | CPU only | none needed |
| Calls | Plivo | ₹0.38/min in India, billed per 30 seconds; audio streaming and answering-machine detection included at no charge; a number is ₹200/month (Plivo India price page, 2026-10-27) | none |

Each provider is a setting on the bot service, not code. Switching to a paid provider later means changing the provider and key in **Voice bots → Providers**.

**Capacity on free tiers (estimate, to be confirmed with real calls):**
- At most **2 calls at the same time** (Whisper's 20 requests a minute).
- About **25–40 calls a day** of 3–4 minutes, set by the 1,000 conversation requests a day and the caching.

The queue (§7) enforces both limits. It shows "x of y used today" and holds the rest for the next day rather than failing calls. The bot service also watches each provider's remaining quota. When Google's monthly free amount is close (90%), it switches the voice to Azure. When Azure's is close too, it goes back to Google at the paid rate (about $30 per million characters, roughly ₹1 per call-minute) and alerts admins (decision 33). Openings and fillers are synthesised once and reused, so they don't count again.

## 3a. Claude alongside Groq (decisions 27–32)

Claude only handles text, so speech-to-text (Groq Whisper) and the voice (Google/Azure) are unchanged. The live-conversation AI is a per-bot setting, and the conversation engine uses the same prompt, tools and caching with either provider: Claude's prompt cache plays the role of Groq's.

| Use | Model | Cost (Anthropic pricing, 2026-10-27) |
|---|---|---|
| Live conversation (when the bot is set to Claude) | Haiku 5.5 or Sonnet 5.5 | Haiku about $0.002–0.005 and Sonnet about $0.03 per 4-minute call |
| After-call summary and fields | Sonnet 5.5 | about $0.01 per call |
| Knowledge building, bot-builder helper, call quality review | Sonnet 5.5 | cents each |

Haiku 5.5 costs $0.10 per million input tokens and $0.50 per million output, with cached input at $0.01; Sonnet 5.5 costs $2 and $10, with cached input at $0.10. With Haiku live and Sonnet summaries, $160 a month covers about 10,000 calls.
- **What Claude doesn't change.** It takes away the Groq conversation limit, but not the 2-calls-at-once limit, which comes from the free speech-to-text.
- **Speed.** Claude will probably reply a little more slowly than Groq. The bot dashboard shows reply times per provider so the toggle can be judged on real calls.
- **Budget.** A monthly spend counter uses the token counts in each API response. It sends the alerts and enforces the cap; at the cap, bots switch to Groq.
- **Key.** The Claude API key is entered under **Voice bots → Providers**, encrypted like the others. Anthropic doesn't train on API data.

**Caller details and placeholders.** Each bot has a "Caller details" list of the fields it may see. Its opening line, fixed steps, rules and closing can use placeholders:
- `{{lead.name}}`, `{{lead.phone}}`, `{{lead.<custom field key>}}`, `{{opportunity.title}}`, `{{opportunity.stage}}`, `{{opportunity.<custom field key>}}`, `{{owner.name}}`;
- with a fallback, e.g. `{{lead.name|there}}`.

The builder warns about a placeholder whose field isn't ticked. A placeholder with no value and no fallback is left out of the sentence. The ticked fields are also given to the AI as facts about the caller, and nothing else is sent.

## 4. What gets built

### 4.1 Data (new migrations, numbered from 0141)

| Table | What it holds |
|---|---|
| `VoiceBot` | Name, status, activity type, persona, goal, rules, opening line, closing line, fixed steps, languages, voice per language, model, transfer team, ring time, retry policy, calling hours, daily limit, keep-audio switch, created by. |
| `VoiceBotField` | The bot's fields: the activity type's custom fields (existing `FieldDefinition` with `entityType='ACTIVITY_TYPE'`), plus the question, allowed answers and whether the bot must ask it. |
| `VoiceBotFieldMapping` | Bot field → lead or opportunity field, with fill-if-empty / overwrite / never. |
| `VoiceBotNumber` | Plivo number → mode (BOT / OWNER / OWNER_THEN_BOT) and bot. |
| `VoiceBotKnowledgeSource` / `VoiceBotKnowledgeChunk` | Documents, Q&A, catalogue and website sources; chunks with text, language and an embedding stored as `real[]` (no pgvector needed: a bot's knowledge is small enough to search in memory on the bot service). |
| `VoiceBotCall` | One row per bot call or queued call: trigger, priority, attempt, next try, status, provider IDs, transcript, turn timings, outcome, summary, links to the call log and activity. |
| `VoiceBotStopList` | Numbers that said "don't call me" to a bot (bot calls only). |
| `VoiceBotHoliday` | Holiday dates per workspace (bots skip them). |
| `VoiceProviderSettings` | Groq, Claude (Anthropic), Google and Azure keys per workspace, **encrypted** like the Plivo token; usage counters per provider per day and month; the Claude monthly cap and alert levels. |
| `ActivityType` | New columns: `systemKey` (CALL, WHATSAPP, EMAIL, SMS, VOICE_BOT) and `isSystem`. |

Two existing gaps this needs, both fixed as part of the module:
1. **Custom-field values were never saved, for any record.** Fields could be defined and the activity form showed them, but every save dropped the values. Activities now save them (wave A) in the existing `CustomFieldValue` table. Leads and opportunities still don't show or save custom fields at all; see §11 before wave B.
2. **System activity types.** There is no system flag yet; activities from calls, WhatsApp, email and SMS share ordinary types that can also be chosen by hand.

### 4.2 System activity types (decisions 9–10)

- Migration marks the existing Call, WhatsApp, Email and SMS types (and each new bot's type) as system types.
  - "Call (logged manually)" is added as an ordinary type.
  - Activities a person created by hand under "Call" so far are moved to "Call (logged manually)". An activity with no linked call log counts as hand-made. The real dialled calls stay under Call.
- The activity form, the record activity feed and the API refuse system types for manual creation (server check, not only hidden in the UI).
- On a system activity, call facts are read-only: time, duration, numbers, transcript, recording, provider IDs. Custom fields and notes follow normal edit rights. Delete is admin-only.
- Reports can now separate dialled calls from self-reported ones.

### 4.3 The bot builder (Voice bots page)

One page per bot, in tabs:
1. **Basics.** Name, status (Draft / Live / Paused), languages, voice per language with a "play sample" button, **AI: Groq / Claude Haiku / Claude Sonnet** (switchable at any time), team for transfers, numbers, daily limit, keep audio, which opportunity a lead-started call uses.
   - **Caller details:** the lead and opportunity fields this bot may see and use as placeholders.
2. **Conversation.**
   - Persona, goal and rules in plain language; opening and closing lines.
   - Optional fixed steps (say / ask / branch) before or after the AI part.
   - When to transfer: a rule in words plus "caller asks for a person".
   - When to end.
3. **Fields.** The bot's activity fields (the usual field editor: text, number, picklist, date, yes/no). For each: the question to ask, allowed answers and "must ask".
4. **Mapping.** Each bot field → lead or opportunity field, with fill-if-empty / overwrite / never.
5. **Knowledge.**
   - Upload documents (PDF, Word, text).
   - Write Q&A.
   - Tick catalogue items (programs, fees, intakes, kept in sync).
   - Add website URLs (fetched daily, with "refresh now").
   - Each source shows its status and chunk count.
   - A "test a question" box shows what the bot would find.
6. **Calling.** Calling days and hours, holidays, retry attempts and gaps, answering-machine handling.
7. **Test.**
   - Talk to the bot in the browser (microphone), or have it call your own phone.
   - Every test shows the transcript, the fields it filled and the time per turn.
8. **Calls.** This bot's calls with status, outcome, duration, transcript, audio and reply-time chart; usage "x of y today".

**Voice bots → Providers:** keys for Groq, Google and Azure (stored encrypted, never shown again), usage this month, and "test" per provider. **Voice bots → Numbers:** the list of Plivo numbers read from the account, each with its mode and bot.

### 4.4 The conversation engine (bot service)

- **Prompt built for caching.** A fixed part (persona, rules, fields, tools) that Groq caches, plus a short changing tail: the latest turns, knowledge found for this question, and a running summary of older turns. This keeps each turn within the free per-minute token limit.
- **Tools the AI can call:**
  - `set_field`
  - `search_knowledge`
  - `transfer_to_person`
  - `book_callback(time)`
  - `stop_bot_calls`
  - `end_call(outcome)`
- **Fixed steps** run before or after the AI part exactly as written.
- **Language.** Each utterance's language is detected from the text: Devanagari or Hindi words, or romanised Hindi, against English. The bot replies in the caller's language and switches after two turns in a row in the other language, so a single English word in Hindi speech doesn't flip it. Hinglish callers get Hinglish replies (Hindi voice, English terms kept). Whisper gets a word list per bot (course names, place names) so it spells them right.
- **Guards:**
  - The bot only states facts found in its knowledge or fields. Otherwise it says it will have someone confirm, and books a callback.
  - A maximum call length per bot.
  - A silence timeout ("are you there?" twice, then a polite end).
  - "Don't call me" ends the call and adds the number to the bot stop list.

### 4.5 Triggers and the queue (decisions 12–15)

- **Where calls are started:**
  - Leads and opportunities pages: "Call with voice bot" on the selection bar, including "select all matching", up to 5,000.
  - Lead list page; Smart Views, through the list pages.
  - New automation step "Call with voice bot", which also covers journeys, since journeys are automations. The next step can wait for the outcome.
  - Call campaigns: a new "dialled by" setting, People or a bot.
  - **Instant call on a new enquiry**: per bot, "call new leads from these sources within 1 minute".
- **Checks before every call:**
  - existing do-not-call, consent opt-out and quiet hours;
  - the bot stop list;
  - the bot's calling hours and holidays;
  - not already called by this bot today;
  - lead not deleted or merged.
  Blocked records are listed with the reason, not silently dropped.
- **Queue:** priority inbound > new enquiry > retry > bulk. At most the free-tier number of calls run at once; the daily limit per bot is enforced. It runs as a worker job, like the existing transfer recovery. Retries follow the bot's policy, inside calling hours.
- **Automation server check:** automation steps are now checked against a list on the server. Today any step type is stored, and an unknown one silently does nothing.

### 4.6 Permissions and module (decision 18)

- **New module `VOICE_BOT`**, which depends on Telephony. It can be switched off per workspace like other modules. Switching it off pauses queued bot calls.
- **New role permission "Voice bots":**
  - **none**;
  - **use**: start bot calls on records the person can see;
  - **manage**: build and edit bots, knowledge, fields, mappings, numbers and providers.
  - Plus a **bulk calls** switch.
- Admins have everything. Bot activities follow the usual record access.

## 5. Results in the CRM after a call (decisions 10, 11, 17)

On the lead or opportunity's timeline, the bot's activity ("Voice bot: Admission follow-up") shows:
- the outcome, for example interested, transferred, callback booked, not interested, wrong number, no answer or machine;
- the summary;
- the filled fields;
- duration and language;
- the transcript, with a play button per turn when audio is kept;
- the transfer result.

The mapped lead and opportunity fields are updated per their rule, each change in the record history as "set by voice bot". The existing call log row, call automations (answered, missed, completed, recording available) and reports all include bot calls; reports can filter by bot.

## 6. Security and privacy

- **Keys.** Provider keys are encrypted at rest with the CRM's existing secret encryption and are never returned to the browser.
- **Service access.**
  - CRM ⇄ bot service calls are signed with a per-install secret over the internal Docker network.
  - The public WebSocket accepts only streams that carry a short-lived, single-use token issued by the CRM for that call.
  - All Plivo callbacks use the V3 signature and nonce checks built in the connector fix.
- **Data leaving India.** During the call, audio and text go to Groq (US) and Google's speech service (global endpoint). Azure Speech, the fallback voice, uses its Central India region. The plan doesn't send CRM data beyond the lead's name and the fields the bot needs. Uploaded knowledge stays on the VPS.
- **Storage.** Transcripts and audio follow the existing recording retention setting.
- **No training on your data.** The bot doesn't use providers whose free tier trains on your data. This is why Gemini's free tier was ruled out.

## 7. Deployment and operations

- A new `voice-bot` service in `deploy/vps/docker-compose.yml`, built from `voice-bot/` (Python 3.12, Pipecat).
  - Same private networks as `ml-service`, plus one Caddy route for the media WebSocket, and a health check.
  - No new `.env` secrets: provider keys are entered in CRM settings. One internal shared secret is generated at deploy.
- **VPS sizing:** about 2 cores and 2 GB RAM extra (Smart Turn, VAD and embeddings run on CPU). Check `docker stats` after the first week before upgrading.
- **Monitoring:** reply-time percentiles, provider errors and quota use per day on the bot dashboard; alerts at 80% of any daily or monthly free limit.
- **What you set up once:**
  - a new free Groq account (CRM only);
  - a Google Cloud project with the Text-to-Speech API, a billing account and a budget alert at ₹1;
  - an Azure Speech resource on the F0 tier;
  - Plivo India KYC and a normal-series number for the bots.
  The setup guide will walk through each.

## 8. Build order (each wave tested and checked before the next)

| Wave | Contents | Checks |
|---|---|---|
| A | System activity types and locking, "Call (logged manually)" and the move of old manual calls, activity custom-field values saved, automation step allow-list | unit + database smoke tests; activity form in the browser |
| B | Module, permission, provider settings (encrypted; Claude key, monthly cap and alerts), numbers list and modes, bot builder (basics with the AI toggle and caller details, conversation with placeholders, fields, mapping, calling), holidays, Claude bot-builder helper | unit + smoke; builder in the browser at desktop and phone widths |
| C | Bot service: Plivo stream, VAD, Smart Turn, Whisper; the conversation on Groq or Claude (both cached, instant fallback between them, spend counted against the cap); Chirp/Azure voice with switching (Google paid after both free amounts, decision 33); language switching, barge-in, fillers, tools, placeholders; browser test call | service tests with recorded Hindi, English and Hinglish audio; reply-time measurements |
| D | Knowledge: documents, Q&A, catalogue, website (cleaned and turned into Q&A by Claude); embeddings; "test a question" | retrieval tests in Hindi and English |
| E | Outbound queue, priorities, limits, retries, machine detection, calling hours; post-call summary and fields (Claude Sonnet, Groq when over the cap), mapping, activity, call log; transfer to owner and team with callback | smoke tests on the real database; end-to-end test with a stand-in Plivo |
| F | Triggers: selection bars, lists, Smart Views, automation step, journeys, call campaigns, instant enquiry calls; inbound modes (Bot, Owner then bot) | smoke + browser |
| G | Dashboard (reply times per provider, Claude spend), reports by bot, Claude call quality review, setup guide, deployment; **real calls on your Plivo account** in Hindi, English and Hinglish, inbound and outbound, transfer | the live test list in the guide |

## 9. Risks and open points

- **Free-tier ceilings.** About 2 calls at a time and roughly 25–40 a day. Bulk lists larger than that take several days. The queue makes this visible; the paid switch removes it.
- **Hindi recognition on phone audio** (8 kHz) is good but not perfect, especially names and numbers. The bot repeats back critical answers (phone, date, amount) before saving them. The per-bot word list helps.
- **Groq models and limits change.** Today's free chat models are gpt-oss-20b/120b and Qwen. The service picks models by setting, so a change needs no code.
- **Plivo machine detection** is free in India (checked 2026-10-27). It is still a per-bot switch, because detection adds a short wait before the bot speaks.
- **DPDP.** The opening line is yours to write (decision 8). From 13 May 2027, India's DPDP rules expect notice and consent for personal data processing. A one-line AI-and-recording notice in the opening is the simple way to meet that when the time comes.

## 10. Noticed while planning (outside this module)

- The AI assistant settings store the external API key **unencrypted** (`AiProviderSettings.secretConfig`). It is hidden from the browser, but readable in the database and backups. It should use the same encryption as the Plivo token. This is a small fix; I'd do it in wave A unless you'd rather keep it separate.

## 11. Progress

### Wave A: done 2026-10-27 (uncommitted)

- **System activity types** (migration 0141).
  - Activity types have a `systemKey`. Call and Page Visit are system types; Email, WhatsApp and SMS system types are added on first use.
  - Hand-logged calls moved to "Call (logged manually)"; dialled calls stay under Call.
  - The old hand-made Email, WhatsApp and SMS types became "… (logged manually)", keeping their activities.
- **Manual creation refused.** System types can't be used by people, imports, website forms, automations or Next Best Action. The server refuses them, with a plain-English message, and the pickers hide them.
- **System type settings.** System types can't be renamed, switched off or deleted; their icon, colour, defaults and custom fields can be changed. Settings → Activity types shows a "System" badge, and its rows now wrap on phones (they used to overflow).
- **System activities.** Only notes, custom fields and "mark complete" can change. Nobody can delete activities at all today, so "only admins delete" needed no change.
- **Custom field values** are saved, typed per field, for every activity type. They are shown with their labels on the timeline and removed with privacy erasure (`custom-field-values-postgres.ts`, written so leads and opportunities can reuse it).
- **Sent messages are activities** (decision 24).
  - The activity is created with the outbox row, inside the same transaction under a savepoint, so a logging problem never stops a send.
  - Delivery events and provider webhooks move it on: only forward, and a late bounce doesn't undo a read.
  - These activities don't fire "activity created" automations, which avoids loops.
- **Automation step check.** Workflows with an unknown step can't be saved or published, and a step can't create a system-type activity.
- **AI assistant key encrypted** at rest; a key saved before this is encrypted the first time it's read.
- **Shared helper.** `userMessage()` in `http.ts` (code `USER_MESSAGE`) shows a server refusal as written.
- **Checks.**
  - 2,206 unit tests pass (new `system-activities.test.ts`).
  - 58/58 database smoke tests pass (new `system-activity-smoke.ts`, 27 checks).
  - The same on a fresh database: every migration, the seed, all smoke tests.
  - Lint 0/0; build OK.
  - Checked in the browser: settings at 1440 and 390 px, the log-activity form, refusal messages.

Found while building wave A, not fixed (they need a decision):
- **Leads and opportunities have no working custom fields.** Their forms don't show them and nothing saves them. Decision 11 (copying bot answers to lead fields) can only reach standard lead fields until this exists.
- **Lead and opportunity custom fields:** decision 25 (2026-10-27) was to build them before wave B. **Done 2026-10-27, uncommitted:**
  - **Values saved and returned.** Create and update save `customFields` (or the record form's `data`) and return values with labels on get, list and create. Changes go in the record's history; hidden fields are masked on read and refused on write per permission template.
  - **Forms.** The form metadata includes custom fields (as form input types; the activity form's dropdowns and checkboxes also fixed). The opportunity form adds the chosen type's own fields, and edit forms are pre-filled.
  - **Detail pages** have a "Custom fields" section.
  - **Lists, Smart Views and journeys.**
    - Lead and opportunity lists have custom field columns, off by default; a saved column choice no longer hides new columns from the defaults.
    - Filters (drawer, Smart Views, server) cover every operator, including "is empty".
    - The same filters apply to counts, "select all matching" and journey audiences.
  - **Data in and out.**
    - Import maps columns to `customFields.<key>` for new and updated records.
    - Export adds labelled columns.
    - Website forms save mapped answers, skipping wrong-kind values.
    - The v1 API accepts `customFields` (docs/CRM_CREATE_API.md).
    - Merging carries over values the survivor lacked; unmerge moves them back.
  - **Permission templates** can hide custom fields or make them read-only.
  - **Checks.** New `scripts/custom-fields-smoke.ts` (26 checks); all 59 smoke tests pass, also on a fresh database. 2,206 unit tests pass, lint is 0/0 and the build is OK. Checked in the browser: create form, detail page, edit prefill, column picker, filter.
- **Five automation steps the builder offers never run** (decision 26, 2026-10-27: left for later): Distribute Lead, Distribute Opportunity, Calculate Partner Commission, Award Gamification Points and Evaluate Badges. The functions for the last three exist, but nothing calls them. Saved automations using these steps skip them silently.

### Wave B: done 2026-10-27 (uncommitted)

- **Where it lives.** Voice bots is its own page, `/dashboard/voice-bots`, in the side menu under Service and listed in Settings under Calling. Settings pages are admin-only, so a page there would have shut out users with the Manage level. Numbers are a tab on this page, not under Phone system. Tabs: Bots, Numbers, Holidays, Providers.
- **Module and permission** (decision 18).
  - Module `VOICE_BOT` depends on Telephony (migration 0142). Like other modules it is on unless a platform admin switches it off, and Telephony can't be switched off while it is on.
  - Roles have a "Voice bots" level (No access / View bot calls / Use / Manage; not set means Use) and a "Voice bots: bulk calls" switch.
- **Providers.**
  - Groq, Claude, Google and Azure keys are stored encrypted and shown only as "…1234", each with a connection test.
  - The Claude monthly budget (default $160) has a usage bar. Alerts go to admins at 50%, 80% and 95%; at the cap, Claude calls are refused and bots use Groq.
  - Usage is recorded per bot and per month at the official Claude prices.
- **Numbers and holidays.** Each Plivo number (read from the account, or the saved ones if Plivo can't be reached) has a mode: Bot, Owner, or Owner then bot, with the bot to use. Holidays are shared by every bot that skips holidays.
- **Bot builder.** Five tabs with one save bar; readiness, status and archiving sit around them.
  - **Basics:** name and purpose; AI per bot (Groq 20b/120b, Claude Haiku/Sonnet); languages, the start language, and a voice per language with a sample; caller details; which opportunity a lead call uses; keeping audio.
  - **Conversation:** opening line with a preview filled from a real lead; persona, goal, rules; fixed steps before and after the AI part; live transfer; ending. Placeholders come from an "Insert detail" menu, and fields not ticked in caller details are flagged.
  - **Fields:** each is a custom field on the bot's own system activity type, with its question, must-ask and repeat-back. Fields save straight away.
  - **Mapping:** per field, the lead or opportunity field it goes to, and the mode.
  - **Calling:** days and hours, skip holidays, calling number, retries with gaps, answering machines, daily limit, longest call, silence limit.
  - **Readiness.** A "Before this bot can go live" list links to the tab, Providers or Phone system that fixes each item. Go live is refused until the list is empty.
  - **Status and archiving.** Pause, Resume, Archive and Restore. Archiving hands the bot's numbers back to the owner; a restored bot comes back as a draft.
  - **Claude bot-builder helper.** "Draft with Claude" when creating a bot, and "Redraft with Claude" on Conversation; both use Sonnet.
- **Checks.**
  - 2,214 unit tests pass (new `voice-bot-config.test.ts`).
  - 60/60 database smoke tests pass (new `voice-bots-smoke.ts`, 31 checks). The module smoke tests were updated for the new module: Voice bots must be off before Telephony, and there are 29 modules.
  - The same on a fresh database (143 migrations).
  - Lint 0/0; tsc clean; build OK.
  - Checked in the browser at 1440 px light and dark and at 390 px: every tab, the create dialog, the field sheet and the role dialog. No horizontal overflow, no text under 12 px, no page errors. Labelled selects now get their names through a new `SelectField`.

### Wave C: done 2026-10-27 (uncommitted)

**Setup docs**
- New `docs/VOICE_BOT_SETUP.md`: the Groq, Claude, Google and Azure accounts and keys, where they go, the server steps and troubleshooting.
- `PLIVO_CONNECTOR_SETUP.md` gains section 8 for voice bots: numbers and who answers, bot call audio, transfer, number series, recording and Plivo India prices.
- `SETUP_REQUIREMENTS_GUIDE.md` links to both.
- Checked on the providers' pages (2026-10-27):
  - Plivo India is ₹0.38/min billed per 30 s; streaming and answering-machine detection are included; a number is ₹200/month. The plan's "detection may cost extra" was wrong and is corrected.
  - Anthropic's own spend limits answer 400 or 429 and are now told apart from "busy" (`CLAUDE_ACCOUNT_LIMIT`).

**Decision 33.** The on-server Piper voice was dropped (its Hindi voices are licensed for non-commercial use only). After both free amounts, Google is used at the paid rate, with an admin alert.

**Bot service** (`voice-bot/`, Python 3.12, Pipecat 1.12, every dependency pinned and released before 13 Oct)
- **Hearing.** Silero VAD and Smart Turn v3 run on the server. When Smart Turn isn't sure the caller has finished, it waits at most 2 s (Pipecat's default is 3 s; to be tuned on real calls).
- **Speech-to-text.** Groq Whisper large-v3 detects Hindi or English on each utterance. Anything labelled another language (often Urdu for short Hindi) is transcribed again in the conversation's language. A per-bot word list helps spelling.
- **Talking.** Groq or Claude, per bot, with prompt caching.
  - On any error or a slow start (4 s), the call moves to the other AI and the turn is answered again.
  - Claude usage is reported at once, so a budget reached mid-call moves the call to Groq.
- **Voice.** Google Chirp 3 HD (streaming, API key) or Azure. The provider is chosen when the call starts: the bot's own while its free amount lasts, then the other, then Google paid. A stand-in voice keeps the voice's gender.
- **Language.** Replies follow the caller after two turns in the other language, or at once when asked. The system prompt's language note and the voice change together. Hindi verbs agree with the voice's gender.
- **Conversation.**
  - Fixed steps before and after the AI part, with answers matched and saved.
  - Tools: `set_field` (answers cleaned per field type), `search_knowledge` (says "not on record" until wave D), `book_callback`, `stop_bot_calls`, `transfer_to_person` (a test call stops at the hand-over; wave E rings people), and `end_call`, which asks once for must-ask fields.
  - Short fillers when a reply is slow, the "are you there?" check twice then a polite end, and a time limit.
- **Recorded lines.** The opening, closing, fixed steps and built-in lines are recorded when the call is set up and cached, so the bot speaks at once and repeats cost nothing.
- **Trust.**
  - Each conversation has a single-use, two-minute token.
  - CRM ⇄ service requests are HMAC-signed with a 60-second window. A shared test vector is checked on both sides.
  - Caddy blocks `/api/internal/`.
  - Keys are never stored with a session, and never in the service's environment.

**CRM**
- Migration **0143** adds `VoiceBotSession` and character and audio-second usage.
- Internal routes: claim, usage, end.
- Housekeeping closes stale sessions and removes month-old test calls.
- Readiness includes "the bot service isn't set up or isn't answering".
- **Test call** in the builder:
  - unsaved changes are saved first;
  - optional lead for caller details;
  - live transcript with events (fields saved, callback, transfer, AI switch, language);
  - reply time measured from the end of the caller's speech;
  - result with the fields.
- The microphone is allowed on CRM pages (the browser still asks), in both Next.js and Caddy; the embeddable form pages keep it off. `ws://localhost` is allowed only in development.
- Deploy: a `voice-bot` service in Compose (its own `voice-net`), the Caddy route, `VOICE_BOT_SERVICE_SECRET` in `.env.example`, and a CI job (service tests and image build).

**Checks**
- 2,224 unit tests pass (new `voice-bot-service.test.ts`; housekeeping test updated).
- 61/61 database smoke tests pass (new `voice-bot-sessions-smoke.ts`, 42 checks), also on a fresh database (144 migrations).
- Lint 0/0; tsc clean; build OK; env check OK.
- Service: 15 tests pass, including two end to end through the real service. Those use real speech detection on recorded Hindi and English speech, stand-in AI and voice, and a stand-in CRM that checks every signature.
  - The service's own share of a reply is about 0.3 s after the caller stops, or 2.2 s when Smart Turn is unsure.
  - The AI failover and usage reporting are covered too.
- **In the browser** (1440 light and dark, 390): the real CRM, the real service with stand-in providers, and Chrome's fake microphone playing recorded speech. Checked: microphone → service → transcript → result stored. No horizontal overflow, no page errors.
- **Not yet measured:** real providers, so speech-to-text, AI and voice timing and Hindi recognition. That needs the keys (`VOICE_BOT_SETUP.md`) and is the first thing to try with **Test call**. The Docker image was not built locally (no Docker here); CI builds it.


### Wave D: done 2026-10-27 (uncommitted)

- **Sources** (Knowledge tab in the builder; changes save straight away):
  - **Written Q&A:** ready at once.
  - **Documents:** PDF, Word or text, up to 10 MB, kept in private storage.
  - **Web pages:** one address each, read again daily.
  - **Catalogue programs:** a picker, kept in step with the catalogue. Each program's courses and specialisations, intakes with dates, fees, scholarships and eligibility become plain sentences naming the program.
  - Each source shows its status ("Ready · N passages", "Reading…", or "Failed" with the reason in plain words) and can be viewed, read again or removed.
  - Limits: 200 sources and 3,000 passages per bot.
- **Tidy with Claude** (decision 30), optional per web page or document: Sonnet turns the text into short facts in English (Hindi translated), with numbers kept exact. The cost counts against the Claude budget.
- **How it works:**
  - The CRM fetches web pages, checking every redirect against the outbound guard, so private addresses are refused.
  - The bot service reads PDF, Word and HTML (pypdf, python-docx, BeautifulSoup) and splits the text into passages of about 700 characters, cut at paragraph and sentence ends (including the Hindi danda), with a little overlap.
  - Each passage gets a vector from multilingual-e5-small (MIT; int8 ONNX, pinned by revision and checksum and built into the image). The vectors are stored as `real[]` (migration **0144**).
  - A refresh keeps the passages when the text hasn't changed. The hourly job `voiceBots.refreshKnowledge` reads day-old pages and catalogue sources and retries stuck ones.
- **During a call:**
  - The CRM hands the bot's passages over when the call is claimed, and the service searches them in memory (about 3–4 ms a question).
  - The AI writes its search in English. That makes Hinglish questions and facts written only in Hindi findable.
  - It gets up to 3 passages near the best match, and answers only from them; otherwise it offers to have the team confirm.
- **"Test a question"** in the builder runs the same search, with the source and a match score.
- **CRM ⇄ service:**
  - the CRM signs its calls to the service (`/internal/knowledge/*`) the same way the service signs its calls to the CRM;
  - Caddy never routes `/internal`;
  - the service refuses anything unsigned or stale.
- **Fixed on the way:** catalogue intake dates read from Postgres as JavaScript dates printed a day early outside India. They are now read as text.
- **Checks:**
  - 2,224 unit tests pass.
  - 62/62 database smoke tests pass, also on a fresh database (145 migrations). The new `voice-bot-knowledge-smoke.ts` has 44 checks with a stand-in service; the same script passes 42 checks against the real service and model.
  - 36 service tests pass, including retrieval in English, Hindi and Hinglish (11 of 11 cases) and the signed endpoints.
  - Lint 0/0; tsc clean; env check OK; build OK.
  - Checked in the browser (1440 light and dark, 390) with the real service and model. A Q&A, a document and a real web page (example.com) were added; "hostel ki fees kitni hai" found the hostel passage, and "MBA tuition fee" the fee Q&A at 95%. No page errors, no horizontal overflow.


### Wave E: done 2026-10-27 (uncommitted)

- **Queue** (migration **0145**: `VoiceBotCall`, one row per attempt; `VoiceBotStopList`).
  - Calls are queued to leads or opportunities the user can see. This needs the Use level; more than one record needs the bulk switch.
  - Records that can't be called are kept as **Not called** with the reason (no phone, already waiting, stop list, do-not-call, opt-out, record gone).
  - Priority: inbound 0, new enquiry 1, retry 2, the rest 3 (decision 14).
- **Dispatch** (worker job `voiceBots.dispatchCalls` every 15 s, and right after calls are queued):
  - at most 2 calls at a time per workspace;
  - the bot's calling days, hours and holidays in the workspace time zone (decision 15); outside them a call waits for the next opening;
  - the bot's daily limit, and "this bot already spoke to this number today";
  - the CRM's quiet hours;
  - a paused bot's calls wait.
- **The call:**
  - Plivo's Call API, from the bot's calling number.
  - Asynchronous machine detection, which counts as not answered and is hung up (decision 12).
  - A time limit past the bot's longest call.
  - The call log is written first, without a generic Call activity.
- **Answered:** `<Record recordSession>` when the bot keeps audio (decision 17), then `<Stream bidirectional>` (μ-law 8 kHz) to the bot service. The single-use stream token is issued at that moment, so nothing passes between the worker that dialled and the web process answering Plivo.
- **Hand-over** (decision 3):
  - The bot says its hold line and asks the CRM. The CRM moves the call with Plivo's transfer API to the lead owner, then the bot's team's online agents (fewest calls today first), each rung for the bot's ring time. Each person gets a notification with the reason and the caller's last words.
  - If nobody answers, Plivo plays the bot's own "nobody is free" line (a signed 15-minute address to the recorded line) and hangs up, and the owner gets a callback task.
  - If nobody can be rung at all, the bot says it itself and books the callback.
- **After the call:**
  - Claude Sonnet writes the summary, the outcome and any fields the bot didn't capture live; Groq gpt-oss-120b does it over the Claude budget (decision 30). The callback time is understood in the workspace time zone.
  - The bot's own activity (completed, with its fields) goes on the record, including for unanswered attempts ("No answer (attempt 1 of 3)").
  - The transcript goes on the call log, which the recordings panel already shows.
  - Answers are copied per mapping mode, and the lead's or opportunity's **History shows "modified by voice bot …"** (a new change source on the audit entry).
  - The owner gets a callback task when one was asked for or a hand-over failed.
  - "Don't call me" puts the number on the stop list and cancels its waiting calls (decision 21).
  - Retries follow the bot's attempts and gaps, inside calling hours.
- **Builder:**
  - New **Calls** tab: list with live status (waiting, ringing, on the call, answered, no answer, machine, not called with the reason, cancelled). The detail shows the summary, fields, what happened next and the transcript. Waiting calls can be cancelled.
  - **Call my phone**: the bot calls your own phone with its saved settings, even before it's live.
- **Also:**
  - Bot call recordings follow the bot's setting, not the connector's switch.
  - History labels custom fields by name ("Intake", not "Custom Fields.intake").
- **Checks:**
  - 2,225 unit tests pass.
  - 63/63 database smoke tests pass, also on a fresh database (146 migrations). The new `voice-bot-calls-smoke.ts` has 44 checks and runs a stand-in Plivo with signed callbacks through the real route: queueing, limits, calling hours, answer and stream, claim, the hand-over chain and its audio, the after-call work, history, task, machine and retry, stop list, call my phone.
  - 39 service tests pass, including the transfer paths and a phone call over Plivo's stream protocol on recorded Hindi speech (bot audio 304 ms after the caller stopped, with stand-in providers).
  - Lint 0/0; tsc clean; build OK.
  - Checked in the browser (1440 light and dark, 390): the Calls tab, call detail, Call my phone and its plain refusal without Plivo, and the lead history label.
- **Not yet tried:** a real Plivo call. That needs the Plivo account and keys; **Call my phone** is the first test.

### Wave F: done 2026-10-27 (uncommitted)

- **Migration 0146:** `VoiceBotCall.automationQueueId` and `campaignMemberId` (kept on the first attempt; retries find them through it); `CallCampaign.dialledBy` (PEOPLE or BOT) and `voiceBotId`.
- **Call with voice bot** (shared dialog: choose a live bot; shows its calling days, hours, daily limit and attempts; warns how many days a big selection takes at the daily limit; queues in batches of 500 and sums up what was skipped and why):
  - lead and opportunity pages, in More (only with a phone, and for roles with the Use level);
  - leads and opportunities selection bars, including "select all matching" up to 5,000, so Smart Views are covered through the list with the view applied (several records need the bulk switch);
  - the lead list page ("Call with voice bot" calls everyone in the list this person can see; new `GET /api/lead-lists/[id]/ids`, up to 5,000).
  - Live bots for these pickers come from `GET /api/voice-bots/callable` (Use level).
- **Automation step "Call with Voice Bot"** (lead and opportunity triggers, so journeys too):
  - it queues the call to the lead's phone (an opportunity's lead's);
  - with **Wait for the outcome**, the automation waits (an `AutomationQueue` row) until the call and its retries are over, or at most the chosen days (1–14, default 3). The next steps can branch on new condition fields **Voice Bot Call: Outcome** and **Answered?**;
  - a record the bot can't call carries on at once with the outcome "Not called".
- **Call campaigns, Dialled by People or a voice bot:**
  - With a bot, pending members become bot calls 20 at a time, at the dispatcher's pace. The bot's calling hours, daily limit and retries apply; the campaign's script, dispositions, team and retry fields are hidden.
  - Agents can't take its calls; it isn't listed in My campaigns.
  - Pausing, completing or deleting withdraws calls still waiting and puts those members back to pending.
  - A member ends Completed (answered), Exhausted (not answered after the bot's attempts) or Do not call (stop list, do-not-call, opt-out).
  - Who dials can't change while it's active, and it can't start without a live bot.
- **New enquiries** (Calling tab, "New enquiries"):
  - leads from the chosen sources (picked from the sources in use, or typed) are queued at priority 1 within the 15-second dispatch, in calling hours, otherwise at the next opening;
  - covers leads made by hand, the API, inbound webhooks and forms (after the form's transaction commits);
  - imports, demo data and the bot's own inbound leads aren't called;
  - if two live bots choose a source, the first by name calls.
- **Incoming calls** (Settings › Voice bots › Numbers):
  - **Bot:** the bot answers. The bot call's ID is Plivo's call UUID, so the call's later callbacks find it, and the call log has no generic Call activity.
  - **People, then bot** (decision 35):
    - in the bot's calling hours, people's routing first (owner, then the default agent), and the bot takes the call nobody answered;
    - outside them, the bot answers at once.
  - With 2 bot calls already running, the module off, or the bot not live, people's routing carries on as before.
  - An unknown caller becomes a new lead after the call (decision 34): named from the call when they said their name (Claude's summary now returns `callerName`), else the number; source "Voice bot (inbound)"; owned per the assignment rules. The activity, answers and task go on it.
- **Voice bots switched off:** queued calls stay queued (paused) and are placed when it's back on; Bot numbers go to people.
  - This is read as the system: the worker and Plivo's callbacks have no signed-in user, and the shared module check reads through row-level security.
- **Also:**
  - A bot's daily limit counts outbound calls only (inbound calls no longer use it up).
  - The Numbers panel says "People, then bot" covers every call outside the bot's calling hours.
- **Checks:**
  - 2,225 unit tests pass.
  - 64/64 database smoke tests pass, also on a fresh database (147 migrations). The new `voice-bot-triggers-smoke.ts` has 31 checks covering: enquiry calls and their exclusions, module off and on, the automation step (waiting, release with the outcome, not called), bot campaigns (queueing, agents refused, pause, member result), and inbound Bot and People-then-bot through the real signed route (unknown caller → new lead with the bot's activity, busy → people, in hours → owner then bot, after hours → bot).
  - Lint 0/0; tsc clean; env check; build OK.
  - Checked in the browser (1440 light and dark, 390), with no page errors:
    - the lead page dialog, which queued a call that waited for calling hours (the dev workspace has no Plivo);
    - the leads selection bar;
    - the list page dialog;
    - the automation step and the outcome condition;
    - the campaign dialog with a bot;
    - the New enquiries section.
- **Not checked in the browser:**
  - the opportunity page and the opportunities selection bar (same component as the leads ones);
  - the leads selection bar at phone width.
- **Not covered by a smoke test:** the form-submission enquiry path.

### Wave G, part 1 (code): done 2026-10-27 (uncommitted)

- **Migration 0147:**
  - `VoiceProviderDailyUsage`: use per UTC day per meter: `groq-chat:<model>`, `groq-whisper`, `google-tts`, `azure-tts`, `claude`;
  - `VoiceBotCall.review`.
- **Usage meters and alerts:**
  - The bot service now reports usage per provider, kind (chat, speech-to-text, voice) and model; before, Groq's chat and Whisper were added together.
  - Every use is counted on its meter for the day. The free limits (`FREE_LIMITS`, checked 2026-10-26/27):
    - Groq: 1,000 requests and 200,000 tokens per model a day;
    - Whisper: 2,000 requests and 28,800 audio seconds a day;
    - voices per month: Google 1M and Azure 0.5M characters.
  - Admins get one notification per meter and period at 80%, saying what happens at the limit. The Claude budget alerts and the paid-voice alert are unchanged.
- **Quality review** (decision 30): it is part of the after-call summary request, so there is no second call to Claude. Given the bot's brief (persona, goal, rules, hand-over and end rules), Claude returns:
  - a 1–5 score;
  - up to 5 issues;
  - **worth a listen** (made-up or wrong information, a rule broken, the caller upset or confused, misunderstood, or a missed hand-over);
  - a reason.

  Groq writes it when Claude isn't available. It is saved on the call; the Calls tab has **All calls / To listen**, a flag on the row, and the review in the call's detail.
- **Dashboard** (`voice-bot-stats.ts`, `GET /api/voice-bots/dashboard`, View level):
  - **Voice bots → Overview** (now the first tab) and each bot's **Results** tab, for the last 7, 30 or 90 days. Calls to your own phone are left out.
  - Content:
    - calls placed and the answer rate, incoming, not called, interested, callbacks, hand-overs, minutes talked, average quality;
    - calls per day;
    - what came of the calls;
    - **reply time per AI** (typical, 9 in 10, slowest, plus the hearing, thinking and voice parts), from the turns the service records;
    - by bot, with this month's Claude spend;
    - the free limits and the Claude budget;
    - calls to listen to, each linking to the call.
- **Report:** **Reports → Voice Bot Performance**, one row per bot for chosen dates (export and schedules as other reports). It is listed only with the Voice bots module and a Voice bots level. The module-gate audit now covers the voice bot routes (31, all checked).
- **Guide:** `VOICE_BOT_SETUP.md` section 9 (watching how the bots do) and section 10, the **live test list** for the first real calls.
- **Checks:**
  - 2,225 unit tests and 40 service tests pass (new: usage grouped per kind and model).
  - 65/65 smoke tests pass, also on a fresh database (148 migrations). The new `voice-bot-dashboard-smoke.ts` has 20 checks: meters and 80% alerts for a Groq model, Whisper and Google; Claude's review and Groq's; the dashboard totals, per bot, outcomes, days, reply times, flagged calls and spend; one bot; the report with dates.
  - Lint 0/0; tsc; env check; build OK.
  - Checked in the browser (1440 light and dark, 390): Overview, Results, a flagged call, the To listen filter and the report. The day chart first rendered empty in the check (its animation); animation is now off.
- **Not done here:** the Docker image is still unbuilt locally (no Docker on this machine). The CI job builds it on push.

- **Next: wave G, part 2** (deployment on the VPS, then the live test list with real calls on your Plivo account), step by step with you, once the provider keys are ready.

