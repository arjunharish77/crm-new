"""Train/evaluate/persist and score-with-existing-model. The train/holdout split and
holdout-metric formulas deliberately replicate src/lib/server/self-learning-scoring.ts's
hashUnitInterval/binaryClassificationMetrics exactly (same hash, same thresholds, same
rounding) so this candidate's holdout is evaluated on the identical record split and in the
identical metric shape as the JS heuristic/logistic-regression candidates it's compared
against -- otherwise "pick whichever has the lower Brier score" wouldn't be a fair fight.
"""

import uuid
from typing import Any

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.inspection import permutation_importance

from app.features import extract_lead_features, extract_opportunity_features
from app.storage import read_private_file, write_private_file

MIN_TRAINING_ROWS = 20


def hash_unit_interval(record_id: str) -> float:
    hash_value = 0
    for ch in record_id:
        hash_value = (hash_value * 31 + ord(ch)) & 0xFFFFFFFF
    return hash_value / 4294967296


def split_train_holdout(df: pd.DataFrame, holdout_ratio: float = 0.2) -> tuple[pd.DataFrame, pd.DataFrame]:
    buckets = df["recordId"].map(hash_unit_interval)
    holdout_mask = buckets < holdout_ratio
    return df[~holdout_mask].copy(), df[holdout_mask].copy()


def binary_classification_metrics(predicted: np.ndarray, actual: np.ndarray) -> dict[str, Any]:
    n = len(predicted)
    if n == 0:
        return {"sampleSize": 0, "brierScore": None, "accuracy": None, "precision": None,
                "recall": None, "hotBandActualRate": None, "coldBandActualRate": None, "lift": None}

    probability = predicted / 100
    squared_error = np.sum((probability - actual.astype(float)) ** 2)
    predicted_positive = predicted >= 50
    true_positive = int(np.sum(predicted_positive & actual))
    false_positive = int(np.sum(predicted_positive & ~actual))
    false_negative = int(np.sum(~predicted_positive & actual))
    true_negative = int(np.sum(~predicted_positive & ~actual))

    accuracy = (true_positive + true_negative) / n
    precision = true_positive / (true_positive + false_positive) if (true_positive + false_positive) > 0 else None
    recall = true_positive / (true_positive + false_negative) if (true_positive + false_negative) > 0 else None
    brier_score = float(squared_error / n)

    hot_mask = predicted >= 75
    cold_mask = predicted < 45
    hot_actual_rate = float(np.mean(actual[hot_mask])) if hot_mask.any() else None
    cold_actual_rate = float(np.mean(actual[cold_mask])) if cold_mask.any() else None
    lift = (hot_actual_rate / cold_actual_rate) if (hot_actual_rate is not None and cold_actual_rate is not None and cold_actual_rate > 0) else None

    def r3(value):
        return None if value is None else round(value, 3)

    return {
        "sampleSize": n,
        "brierScore": r3(brier_score),
        "accuracy": r3(accuracy),
        "precision": r3(precision),
        "recall": r3(recall),
        "hotBandActualRate": r3(hot_actual_rate),
        "coldBandActualRate": r3(cold_actual_rate),
        "lift": r3(lift),
        "confusionMatrix": {
            "truePositive": true_positive,
            "falsePositive": false_positive,
            "trueNegative": true_negative,
            "falseNegative": false_negative,
        },
    }


def _score_band(probability: float) -> str:
    if probability >= 75:
        return "HOT"
    if probability >= 45:
        return "WARM"
    return "COLD"


def advanced_quality_metrics(predicted: np.ndarray, actual: np.ndarray, previous_metrics: dict | None = None) -> dict[str, Any]:
    if len(predicted) == 0:
        return {
            "calibrationBuckets": [],
            "conversionByDecile": [],
            "liftByScoreBand": [],
            "driftFromPrevious": {},
            "safeguards": [{"code": "EMPTY_HOLDOUT", "severity": "WARN", "message": "No holdout records were available."}],
        }

    df = pd.DataFrame({"predicted": predicted.astype(float), "actual": actual.astype(int)})
    df["decile"] = pd.qcut(df["predicted"].rank(method="first"), 10, labels=False, duplicates="drop")
    deciles = []
    for decile, group in df.groupby("decile", dropna=True):
        deciles.append({
            "decile": int(decile) + 1,
            "recordCount": int(len(group)),
            "averageScore": round(float(group["predicted"].mean()), 2),
            "actualRate": round(float(group["actual"].mean()), 3),
        })

    buckets = []
    for low, high in [(0, 20), (20, 40), (40, 60), (60, 80), (80, 101)]:
        group = df[(df["predicted"] >= low) & (df["predicted"] < high)]
        buckets.append({
            "range": f"{low}-{high - 1}",
            "recordCount": int(len(group)),
            "predictedAverage": round(float(group["predicted"].mean()), 2) if len(group) else None,
            "actualRate": round(float(group["actual"].mean()), 3) if len(group) else None,
        })

    overall = float(df["actual"].mean()) if len(df) else 0
    band_rows = []
    for band in ["HOT", "WARM", "COLD"]:
        group = df[df["predicted"].map(_score_band) == band]
        actual_rate = float(group["actual"].mean()) if len(group) else None
        band_rows.append({
            "band": band,
            "recordCount": int(len(group)),
            "actualRate": round(actual_rate, 3) if actual_rate is not None else None,
            "lift": round(actual_rate / overall, 3) if actual_rate is not None and overall > 0 else None,
        })

    current_brier = binary_classification_metrics(predicted, actual).get("brierScore")
    previous_brier = (previous_metrics or {}).get("holdout", {}).get("brierScore")
    drift = {
        "brierScoreDelta": round(float(current_brier) - float(previous_brier), 3)
        if current_brier is not None and previous_brier is not None else None,
    }

    positive_rate = float(df["actual"].mean())
    safeguards = []
    if len(df) < 20:
        safeguards.append({"code": "SMALL_HOLDOUT", "severity": "WARN", "message": "Holdout sample is small; confidence is reduced."})
    if positive_rate < 0.05 or positive_rate > 0.95:
        safeguards.append({"code": "CLASS_IMBALANCE", "severity": "WARN", "message": "Historic outcomes are imbalanced; fallback rules may be safer for low-confidence records."})
    if current_brier is not None and current_brier > 0.35:
        safeguards.append({"code": "LOW_QUALITY", "severity": "FAIL", "message": "Holdout Brier score is above the configured production threshold."})

    return {
        "calibrationBuckets": buckets,
        "conversionByDecile": deciles,
        "liftByScoreBand": band_rows,
        "driftFromPrevious": drift,
        "safeguards": safeguards,
    }


CATEGORICAL_COLUMNS_BY_MODULE = {
    "LEAD": ["source", "status", "ownerRoleId", "ownerTeamName", "ownerSalesGroupName"],
    "OPPORTUNITY": ["stageName", "opportunityTypeName", "priority", "ownerRoleId", "ownerTeamName", "ownerSalesGroupName"],
}


MAX_CATEGORICAL_CARDINALITY = 100


def _matches_feature_key(column: str, keys: set[str]) -> bool:
    if column in keys:
        return True
    normalized = column.lower()
    return any(key.lower() in normalized for key in keys)


def _prepare_matrix(
    df: pd.DataFrame,
    target_module: str,
    feature_names: list[str] | None = None,
    excluded_feature_keys: list[str] | None = None,
    prohibited_feature_keys: list[str] | None = None,
) -> tuple[pd.DataFrame, list[str], list[str], list[str]]:
    """Coerces every non-identifier/label column into a modeling-ready dtype (category for
    known categoricals plus any custom_* string columns, numeric otherwise), and aligns to a
    previously-fit feature_names order when scoring so the classifier sees the same columns
    it was trained on even if this tenant's custom fields have since changed.

    At training time (feature_names is None), string-typed custom fields that are
    identifier-like (e.g. an application number -- almost as many distinct values as rows)
    are dropped entirely rather than treated as categorical: HistGradientBoostingClassifier
    caps categorical cardinality at 255, and a column with near-unique values per row can't
    generalize as a category anyway, only memorize/overfit.
    """
    exclude = {"recordId", "label"}
    known_categorical = set(CATEGORICAL_COLUMNS_BY_MODULE[target_module])

    working = df.copy()
    blocked_keys = set(excluded_feature_keys or []) | set(prohibited_feature_keys or [])
    blocked_columns: list[str] = []
    if feature_names is not None:
        columns = feature_names
    else:
        candidate_columns = [c for c in working.columns if c not in exclude]
        columns = [
            c for c in candidate_columns
            if not (c.startswith("custom_") and working[c].dtype == object and working[c].nunique(dropna=True) > MAX_CATEGORICAL_CARDINALITY)
        ]
        next_columns = []
        for column in columns:
            if _matches_feature_key(column, blocked_keys):
                blocked_columns.append(column)
            else:
                next_columns.append(column)
        columns = next_columns

    categorical_columns = []
    for column in columns:
        if column not in working.columns:
            working[column] = np.nan
        if column in known_categorical or (column.startswith("custom_") and working[column].dtype == object):
            # Safety net regardless of source: HistGradientBoostingClassifier hard-caps
            # categorical cardinality at 255. Collapse rare categories into "OTHER" rather
            # than crash, so an unusually diverse real tenant never breaks training.
            if working[column].nunique(dropna=True) > 200:
                top_categories = working[column].value_counts().nlargest(200).index
                working[column] = working[column].where(working[column].isin(top_categories), "OTHER")
            working[column] = working[column].astype("category")
            categorical_columns.append(column)
        elif column.startswith("emb_") or working[column].dtype != object:
            working[column] = pd.to_numeric(working[column], errors="coerce")

    return working[columns], columns, categorical_columns, blocked_columns


def _feature_importance(classifier, X_holdout: pd.DataFrame, y_holdout: np.ndarray, feature_names: list[str]) -> list[dict[str, Any]]:
    if X_holdout.empty or len(y_holdout) < 5:
        return []
    try:
        result = permutation_importance(classifier, X_holdout, y_holdout, n_repeats=5, random_state=42, scoring="neg_brier_score")
        rows = [
            {"feature": feature, "importance": round(float(importance), 6)}
            for feature, importance in zip(feature_names, result.importances_mean)
        ]
        return sorted(rows, key=lambda row: abs(row["importance"]), reverse=True)[:25]
    except Exception:
        return []


def train_and_evaluate(
    tenant_id: str,
    target_module: str,
    lookback_days: int,
    minimum_historical_records: int,
    excluded_feature_keys: list[str] | None = None,
    prohibited_feature_keys: list[str] | None = None,
    previous_metrics: dict | None = None,
) -> dict:
    df = extract_lead_features(tenant_id, lookback_days) if target_module == "LEAD" else extract_opportunity_features(tenant_id, lookback_days)
    effective_minimum = max(MIN_TRAINING_ROWS, int(minimum_historical_records or MIN_TRAINING_ROWS))
    if df.empty or len(df) < effective_minimum:
        return {"trained": False, "reason": "INSUFFICIENT_DATA", "recordCount": len(df)}

    train_df, holdout_df = split_train_holdout(df)
    positives = train_df["label"].sum()
    if len(train_df) < MIN_TRAINING_ROWS or positives == 0 or positives == len(train_df):
        return {"trained": False, "reason": "NO_LABEL_CONTRAST", "trainCount": len(train_df)}

    X_train, feature_names, categorical_columns, blocked_columns = _prepare_matrix(
        train_df,
        target_module,
        excluded_feature_keys=excluded_feature_keys,
        prohibited_feature_keys=prohibited_feature_keys,
    )
    y_train = train_df["label"].to_numpy()

    classifier = HistGradientBoostingClassifier(
        categorical_features="from_dtype",
        max_iter=200,
        learning_rate=0.08,
        max_depth=6,
        l2_regularization=0.1,
        random_state=42,
    )
    classifier.fit(X_train, y_train)

    holdout_metrics = {"sampleSize": 0, "brierScore": None, "accuracy": None, "precision": None,
                        "recall": None, "hotBandActualRate": None, "coldBandActualRate": None, "lift": None,
                        "confusionMatrix": {"truePositive": 0, "falsePositive": 0, "trueNegative": 0, "falseNegative": 0}}
    advanced_metrics = advanced_quality_metrics(np.array([]), np.array([]), previous_metrics)
    feature_importance = []
    if not holdout_df.empty:
        X_holdout, _, _, _ = _prepare_matrix(holdout_df, target_module, feature_names)
        holdout_predicted = np.clip(np.round(classifier.predict_proba(X_holdout)[:, 1] * 100), 0, 100)
        y_holdout = holdout_df["label"].to_numpy().astype(bool)
        holdout_metrics = binary_classification_metrics(holdout_predicted, y_holdout)
        advanced_metrics = advanced_quality_metrics(holdout_predicted, y_holdout, previous_metrics)
        feature_importance = _feature_importance(classifier, X_holdout, holdout_df["label"].to_numpy(), feature_names)

    # Score every record (train + holdout) with the trained model for the live scoring pass.
    X_all, _, _, _ = _prepare_matrix(df, target_module, feature_names)
    all_predicted = np.clip(np.round(classifier.predict_proba(X_all)[:, 1] * 100), 0, 100)

    model_id = str(uuid.uuid4())
    storage_key = f"scoring-models/{tenant_id}/{target_module.lower()}/{model_id}.joblib"
    bundle = {
        "classifier": classifier,
        "feature_names": feature_names,
        "categorical_columns": categorical_columns,
        "target_module": target_module,
        "excluded_feature_keys": excluded_feature_keys or [],
        "prohibited_feature_keys": prohibited_feature_keys or [],
    }
    buffer_path = f"/tmp/{model_id}.joblib"
    joblib.dump(bundle, buffer_path)
    with open(buffer_path, "rb") as handle:
        write_private_file(storage_key, handle.read())

    return {
        "trained": True,
        "trainCount": len(train_df),
        "holdoutCount": len(holdout_df),
        "holdoutMetrics": holdout_metrics,
        "advancedMetrics": advanced_metrics,
        "featureImportance": feature_importance,
        "blockedFeatureColumns": blocked_columns,
        "modelStorageKey": storage_key,
        "featureNames": feature_names,
        "predictions": [{"recordId": rid, "probability": float(p)} for rid, p in zip(df["recordId"], all_predicted)],
    }


def score_with_existing_model(tenant_id: str, target_module: str, model_storage_key: str, lookback_days: int) -> dict:
    model_bytes = read_private_file(model_storage_key)
    buffer_path = f"/tmp/{uuid.uuid4()}.joblib"
    with open(buffer_path, "wb") as handle:
        handle.write(model_bytes)
    bundle = joblib.load(buffer_path)
    classifier = bundle["classifier"]
    feature_names = bundle["feature_names"]

    df = extract_lead_features(tenant_id, lookback_days) if target_module == "LEAD" else extract_opportunity_features(tenant_id, lookback_days)
    if df.empty:
        return {"predictions": []}

    X, _, _, _ = _prepare_matrix(df, target_module, feature_names)
    predicted = np.clip(np.round(classifier.predict_proba(X)[:, 1] * 100), 0, 100)
    return {"predictions": [{"recordId": rid, "probability": float(p)} for rid, p in zip(df["recordId"], predicted)]}
