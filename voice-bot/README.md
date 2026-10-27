# Voice bot service

Holds the CRM voice bots' conversations (voice bot plan, `docs/VOICE_BOT_PLAN.md`, wave C). Built on [Pipecat](https://github.com/pipecat-ai/pipecat) 1.12.

```
caller audio → Silero VAD + Smart Turn v3 (on this server) → Groq Whisper
            → Groq gpt-oss or Claude (instant failover) → Google Chirp 3 HD or Azure voice → caller
```

## How it fits with the CRM

1. The CRM creates a session with a single-use token (`src/lib/server/voice-bot-sessions.ts`). For a browser test call it also records the bot's fixed lines in advance.
2. The audio connects with that token:
   - a browser test call: `WS /voice-bot/test/{token}`, 16 kHz PCM;
   - a phone call: `WS /voice-bot/plivo/{token}`, through Plivo's `<Stream>` (from wave E).
3. The service **claims** the session from the CRM. The claim returns the bot's settings, the caller details, that conversation's provider keys and the recorded lines.
4. During the call, it reports provider usage. Claude usage is reported at once, so the monthly budget is enforced mid-call.
5. At the end, it reports the transcript, reply times, fields, events and outcome.

All calls to the CRM go to `/api/internal/voice-bot/…`, signed with the shared `VOICE_BOT_SERVICE_SECRET`:
- the header is `x-voice-bot-signature: t=<unix>,v1=<HMAC-SHA256 of "<t>.<METHOD>.<path>.<body>">`;
- the CRM refuses anything older than a minute;
- Caddy blocks that path from outside.

Provider keys are never in this service's environment.

## Knowledge (wave D)

The CRM keeps each bot's knowledge sources and calls the service, signed the same way, for the work that needs Python:

| Endpoint | Does |
|---|---|
| `POST /internal/knowledge/document` | Text from a PDF, Word (.docx) or text file |
| `POST /internal/knowledge/page` | Readable text of a web page (the CRM fetches it) |
| `POST /internal/knowledge/prepare` | Passages with their language and a vector |
| `POST /internal/knowledge/query` | The vector of a question (the builder's "test a question") |

Vectors come from multilingual-e5-small (MIT), as an int8 ONNX file pinned by revision and checksum (`app/fetch_model.py`). The Docker image downloads it at build time. For development, run `python -m app.fetch_model models/e5` or set `VOICE_BOT_MODEL_DIR`.

During a call, the passages come with the claim and are searched in memory (`app/knowledge.py`).

## Settings (environment)

| Variable | Meaning |
|---|---|
| `VOICE_BOT_SERVICE_SECRET` | Shared with the CRM; at least 32 characters. Without it the service starts but refuses calls and `/health` answers 503. |
| `CRM_INTERNAL_URL` | The CRM on the private network; default `http://web:3000`. |
| `APP_URL` or `VOICE_BOT_BROWSER_ORIGINS` | Origins a browser test call may come from. |
| `VOICE_BOT_MODEL_DIR` | Where the knowledge model is; `/app/models/e5` in the image. |

## Development

```bash
python3.12 -m venv .venv && .venv/bin/pip install -r requirements-dev.txt
.venv/bin/python -m pytest -q
```

- `tests/test_units.py` covers language following, the prompt, field answers, tools, fixed steps and request signing. The signing vector is the one the CRM checks too.
- `tests/test_knowledge.py` covers reading documents and pages, passages, and search in Hindi, English and Hinglish with the real model. It is skipped when the model isn't downloaded.
- `tests/test_e2e.py` runs a browser-style test call through the real service, with real speech and end-of-turn detection on recorded Hindi and English speech, and stand-in AI and voice providers. It measures the service's own reply time and checks failover and usage reporting. It needs macOS `say` and is skipped elsewhere.

Dependencies are pinned in `requirements.txt`. To update them, re-resolve with `pip install --uploaded-prior-to <date two weeks ago>` and freeze again.

## Deployment

See `docs/VOICE_BOT_SETUP.md`, section 7.
