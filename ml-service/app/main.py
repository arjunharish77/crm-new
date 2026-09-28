from fastapi import Depends, FastAPI, Header, HTTPException
from pydantic import BaseModel

from app.config import settings

app = FastAPI(title="Unnatify CRM ML Service")


def require_internal_auth(x_internal_auth: str | None = Header(default=None)) -> None:
    # F25 fix (WP06): always compare, unconditionally -- settings.internal_secret is now
    # guaranteed to be a configured, non-empty string (app.config raises at import time
    # otherwise), so there is no "secret unconfigured" case left where this could be skipped.
    if x_internal_auth != settings.internal_secret:
        raise HTTPException(status_code=401, detail="Unauthorized")


@app.get("/health")
def health() -> dict:
    return {"ok": True}


class TrainRequest(BaseModel):
    tenantId: str
    targetModule: str  # "LEAD" | "OPPORTUNITY"
    lookbackDays: int = 365
    minimumHistoricalRecords: int = 25
    excludedFeatureKeys: list[str] = []
    prohibitedFeatureKeys: list[str] = []
    previousMetrics: dict | None = None


class ScoreRequest(BaseModel):
    tenantId: str
    targetModule: str
    modelStorageKey: str
    lookbackDays: int = 365


class NbaScoreCandidate(BaseModel):
    key: str
    actionType: str
    features: dict[str, float] = {}


class NbaScoreBatchRequest(BaseModel):
    tenantId: str
    candidates: list[NbaScoreCandidate] = []


@app.post("/train", dependencies=[Depends(require_internal_auth)])
def train(request: TrainRequest) -> dict:
    from app.model import train_and_evaluate

    return train_and_evaluate(
        tenant_id=request.tenantId,
        target_module=request.targetModule,
        lookback_days=request.lookbackDays,
        minimum_historical_records=request.minimumHistoricalRecords,
        excluded_feature_keys=request.excludedFeatureKeys,
        prohibited_feature_keys=request.prohibitedFeatureKeys,
        previous_metrics=request.previousMetrics,
    )


@app.post("/score", dependencies=[Depends(require_internal_auth)])
def score(request: ScoreRequest) -> dict:
    from app.model import score_with_existing_model

    return score_with_existing_model(
        tenant_id=request.tenantId,
        target_module=request.targetModule,
        model_storage_key=request.modelStorageKey,
        lookback_days=request.lookbackDays,
    )


@app.post("/nba-score-batch", dependencies=[Depends(require_internal_auth)])
def nba_score_batch(request: NbaScoreBatchRequest) -> dict:
    from app.nba import score_nba_candidates_batch

    return score_nba_candidates_batch(
        tenant_id=request.tenantId,
        candidates=[candidate.model_dump() for candidate in request.candidates],
    )
