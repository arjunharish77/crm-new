# Voice bot service (voice bot plan §7). Every dependency is pinned in requirements.txt; the
# speech-detection (Silero) and end-of-turn (Smart Turn v3) models ship inside pipecat-ai and the
# knowledge model is fetched below, so nothing is downloaded when a call starts.
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt \
    && useradd --system --uid 10001 --home-dir /app voicebot

COPY app ./app

# The knowledge-search model (multilingual-e5-small, MIT), pinned by revision and checksum.
ENV VOICE_BOT_MODEL_DIR=/app/models/e5
RUN python -m app.fetch_model /app/models/e5

USER voicebot
EXPOSE 8765
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8765", "--ws", "auto", "--proxy-headers", "--forwarded-allow-ips", "*"]
