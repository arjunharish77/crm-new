import os

# app.main reads its settings at import; tests never talk to a real CRM.
os.environ.setdefault("VOICE_BOT_SERVICE_SECRET", "test-secret-0123456789abcdef0123456789")
