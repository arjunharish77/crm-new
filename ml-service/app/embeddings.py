"""Mean-pooled sentence embeddings for the free-text sources connected to a Lead/Opportunity
(Note.content, EmailLog.subject+body, Activity.notes, CommunicationOutbox.body). Each
record's texts from a given source are averaged into one fixed-size vector so a record with
many notes and a record with one note both produce a same-shaped feature, and a record with
none gets a zero vector (rather than requiring the whole row to be dropped)."""

import functools

import numpy as np

from app.config import settings

EMBEDDING_DIM = 384  # all-MiniLM-L6-v2's output size; used for the zero-vector fallback.


@functools.lru_cache(maxsize=1)
def _get_model():
    from sentence_transformers import SentenceTransformer

    return SentenceTransformer(settings.embedding_model_name)


def embed_texts(texts: list[str]) -> np.ndarray:
    """Embeds a batch of texts, one vector per text. Empty input returns an empty array."""
    cleaned = [text.strip() for text in texts if text and text.strip()]
    if not cleaned:
        return np.zeros((0, EMBEDDING_DIM), dtype=np.float32)
    model = _get_model()
    return model.encode(cleaned, batch_size=32, show_progress_bar=False, convert_to_numpy=True)


def mean_pool(texts: list[str]) -> np.ndarray:
    """One fixed-size vector per record: the mean of all its texts' embeddings, or a zero
    vector if it has none."""
    vectors = embed_texts(texts)
    if vectors.shape[0] == 0:
        return np.zeros(EMBEDDING_DIM, dtype=np.float32)
    return vectors.mean(axis=0)


def mean_pool_by_record(texts_by_record_id: dict[str, list[str]], record_ids: list[str]) -> dict[str, np.ndarray]:
    """Batches embedding computation across all records' texts at once (much faster than
    calling the model once per record), then pools per record."""
    all_texts: list[str] = []
    spans: dict[str, tuple[int, int]] = {}
    for record_id in record_ids:
        texts = [t.strip() for t in texts_by_record_id.get(record_id, []) if t and t.strip()]
        start = len(all_texts)
        all_texts.extend(texts)
        spans[record_id] = (start, len(all_texts))

    if not all_texts:
        return {record_id: np.zeros(EMBEDDING_DIM, dtype=np.float32) for record_id in record_ids}

    model = _get_model()
    vectors = model.encode(all_texts, batch_size=32, show_progress_bar=False, convert_to_numpy=True)

    result: dict[str, np.ndarray] = {}
    for record_id in record_ids:
        start, end = spans[record_id]
        if end > start:
            result[record_id] = vectors[start:end].mean(axis=0)
        else:
            result[record_id] = np.zeros(EMBEDDING_DIM, dtype=np.float32)
    return result
