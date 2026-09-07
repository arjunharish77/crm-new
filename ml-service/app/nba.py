"""Next-Best-Action candidate scoring -- a real, if lightweight, trained-model signal for
NBA (gap checklist: "Add NBA scoring in ml-service"). Deliberately simpler than
model.py's train/holdout pipeline (built for LEAD/OPPORTUNITY conversion prediction, a
different problem shape): rather than a persisted model trained ahead of time via a separate
/train call, this trains a small LogisticRegression on-the-fly from each tenant's own
NextBestActionRecommendation history, using the exact same score-breakdown features Node
already computes and stores per historical recommendation (next-best-action.ts's
computeCandidateScore). That keeps this self-contained (no model storage/versioning needed)
while still being genuine ML, not just a SQL aggregate -- the whole reason to route this
through ml-service instead of computing it in Node directly.

Batch-shaped by design, not per-candidate: generateRecommendationsForRecord evaluates every
active rule for one record in a single pass, and several rules can easily share one
actionType. A per-candidate endpoint would mean training an identical model from scratch once
per rule; this groups candidates by actionType and trains each unique one exactly once per
batch, no matter how many rules in that batch share it.

Fails closed (available=False) below a minimum sample size, or when history is single-class
(nothing to learn a boundary from) -- callers on the Node side treat both exactly like a
network failure: skip this signal, proceed with the deterministic formula alone.
"""

from typing import Any

import numpy as np
from sklearn.linear_model import LogisticRegression

from app.db import query

MIN_NBA_SAMPLES = 20

# Same keys next-best-action.ts's computeCandidateScore writes into scoreBreakdown --
# order matters here (defines the feature vector column order for both training and scoring).
FEATURE_KEYS = [
    "basePriority",
    "propensity",
    "stallRisk",
    "recencyBoost",
    "businessValueBoost",
    "callEngagementBoost",
    "workloadPenalty",
]


def _feature_row(breakdown: dict[str, Any]) -> list[float]:
    row = []
    for key in FEATURE_KEYS:
        value = breakdown.get(key) if breakdown else None
        try:
            row.append(float(value))
        except (TypeError, ValueError):
            row.append(0.0)
    return row


def _train_for_action_type(tenant_id: str, action_type: str):
    """Returns (model_or_none, sample_size, reason_if_unavailable)."""
    rows = query(
        """
        select "scoreBreakdown", status
        from "NextBestActionRecommendation"
        where "tenantId" = %s and "actionType" = %s
          and status in ('ACCEPTED', 'COMPLETED', 'DISMISSED', 'NOT_USEFUL')
        order by "createdAt" desc
        limit 500
        """,
        (tenant_id, action_type),
    )

    if len(rows) < MIN_NBA_SAMPLES:
        return None, len(rows), "insufficient_history"

    x_train = np.array([_feature_row(row["scoreBreakdown"]) for row in rows])
    y_train = np.array([1 if row["status"] in ("ACCEPTED", "COMPLETED") else 0 for row in rows])

    if len(set(y_train.tolist())) < 2:
        # Every historical outcome for this action type was the same (all accepted, or all
        # rejected) -- a classifier has no decision boundary to learn, so this would either
        # trivially always predict one class or fail to fit depending on solver, neither of
        # which is a real signal worth returning.
        return None, len(rows), "single_class_history"

    model = LogisticRegression(max_iter=200)
    model.fit(x_train, y_train)
    return model, len(rows), None


def score_nba_candidates_batch(tenant_id: str, candidates: list[dict]) -> dict:
    """candidates: [{key, actionType, features}, ...] -- key is caller-defined (next-best-
    action.ts uses the rule id) and just echoed back so the caller can match results to
    candidates; this function has no opinion on what it means.
    """
    by_action_type: dict[str, list[dict]] = {}
    for candidate in candidates:
        by_action_type.setdefault(candidate["actionType"], []).append(candidate)

    results: dict[str, dict] = {}
    for action_type, group in by_action_type.items():
        model, sample_size, reason = _train_for_action_type(tenant_id, action_type)
        if model is None:
            for candidate in group:
                results[candidate["key"]] = {"available": False, "reason": reason, "sampleSize": sample_size}
            continue

        feature_matrix = np.array([_feature_row(candidate.get("features") or {}) for candidate in group])
        probabilities = model.predict_proba(feature_matrix)[:, 1]
        for candidate, probability in zip(group, probabilities):
            results[candidate["key"]] = {
                "available": True,
                "mlScore": round(float(probability) * 100, 2),
                "sampleSize": sample_size,
            }

    return {"results": results}
