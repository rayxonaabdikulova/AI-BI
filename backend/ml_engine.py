"""
AI-BI — Customer segmentation (K-Means) and 2D visualization (PCA).

``ClusterEngine`` fits models on numeric features only, applies optional
power transforms on skewed signed features, scales with ``RobustScaler``,
and mutates copies of the input frame with ``cluster``,
``pca1``, and ``pca2`` columns for downstream APIs.
"""

from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd
from sklearn.cluster import KMeans, MiniBatchKMeans
from sklearn.decomposition import PCA
from sklearn.ensemble import IsolationForest, RandomForestRegressor
from sklearn.impute import KNNImputer
from sklearn.linear_model import LinearRegression
from sklearn.metrics import silhouette_score
from sklearn.preprocessing import PowerTransformer, RobustScaler

# Columns produced by this engine — never treat them as PCA/KMeans inputs.
_OUTPUT_COLUMNS: frozenset[str] = frozenset({"cluster", "pca1", "pca2", "is_anomaly"})


class ClusterEngine:
    """
    Stateless clustering + PCA helpers for tabular customer / sales data.

    All public methods return a **new** DataFrame (copy-on-write style) so
    callers can keep the original ``df`` unchanged.
    """

    def __init__(self, random_state: int = 42) -> None:
        # Fixed seed keeps segment IDs stable across runs for the same data.
        self.random_state = random_state

    # ------------------------------------------------------------------
    # Feature matrix
    # ------------------------------------------------------------------
    def _numeric_feature_columns(self, df: pd.DataFrame) -> list[str]:
        """
        Pick columns suitable for K-Means / PCA: numeric, non-bool, not engine outputs.

        Object columns from JSON uploads are coerced with ``to_numeric`` when
        at least half of the values parse as numbers, so lightly typed APIs
        still work.
        """
        names: list[str] = []
        for col in df.columns:
            if col in _OUTPUT_COLUMNS:
                continue
            series = df[col]
            if pd.api.types.is_bool_dtype(series):
                continue
            if pd.api.types.is_numeric_dtype(series):
                names.append(col)
                continue
            converted = pd.to_numeric(series, errors="coerce")
            if converted.notna().sum() == 0:
                continue
            # Require a minimal density of numeric parses to avoid mis-typing IDs.
            if converted.notna().mean() < 0.5:
                continue
            names.append(col)
        return names

    def _build_feature_matrix(self, df: pd.DataFrame, feature_columns: list[str]) -> tuple[np.ndarray, list[str]]:
        """
        Build ``X`` (float64) aligned with ``df`` rows. Drops all-NaN columns.

        Missing values are imputed with ``KNNImputer`` so feature relationships
        are preserved better than simple per-column averages.
        """
        if not feature_columns:
            return np.empty((len(df), 0), dtype=np.float64), []

        blocks: list[pd.Series] = []
        kept: list[str] = []
        for col in feature_columns:
            series = df[col]
            if not pd.api.types.is_numeric_dtype(series):
                series = pd.to_numeric(series, errors="coerce")
            if series.notna().sum() == 0:
                continue
            blocks.append(series.astype("float64"))
            kept.append(col)

        if not blocks:
            return np.empty((len(df), 0), dtype=np.float64), []

        X_raw = np.column_stack([b.to_numpy(dtype=np.float64, copy=True) for b in blocks])
        imputer = KNNImputer(n_neighbors=5)
        X = imputer.fit_transform(X_raw)
        return X, kept

    def _power_transform_features(self, X: np.ndarray) -> np.ndarray:
        """
        Reduce heavy skewness while supporting both positive and negative values.

        Uses Yeo-Johnson ``PowerTransformer`` (works with signed data, e.g. refunds).
        ``standardize=False`` keeps scaling responsibility in ``RobustScaler``.
        """
        if X.size == 0:
            return X

        transformer = PowerTransformer(method="yeo-johnson", standardize=False)
        try:
            return transformer.fit_transform(X)
        except ValueError:
            # Defensive fallback for degenerate matrices (e.g. zero-variance columns).
            return X

    def _scale(self, X: np.ndarray) -> tuple[np.ndarray, RobustScaler]:
        scaler = RobustScaler()
        if X.size == 0:
            return X, scaler
        return scaler.fit_transform(X), scaler

    def _build_kmeans_estimator(
        self,
        n_clusters: int,
        n_samples: int,
        *,
        for_search: bool = False,
    ) -> KMeans | MiniBatchKMeans:
        """
        Choose a faster K-Means variant for large datasets.
        """
        use_minibatch = for_search or n_samples >= 12000
        if use_minibatch:
            return MiniBatchKMeans(
                n_clusters=n_clusters,
                random_state=self.random_state,
                batch_size=min(4096, max(256, n_samples // 10)),
                n_init=5,
                max_iter=120,
            )
        return KMeans(
            n_clusters=n_clusters,
            random_state=self.random_state,
            n_init="auto",
        )

    def _prepare_model_matrix(self, df: pd.DataFrame) -> tuple[pd.DataFrame, np.ndarray]:
        """
        Build reusable transformed+scaled features for clustering and PCA.
        """
        out = df.copy()
        for col in _OUTPUT_COLUMNS:
            if col in out.columns:
                out = out.drop(columns=[col])

        feature_cols = self._numeric_feature_columns(out)
        X, _ = self._build_feature_matrix(out, feature_cols)
        if X.shape[1] == 0:
            raise ValueError(
                "No usable numeric columns for clustering/PCA. "
                "Provide at least one numeric feature (or strings that parse as numbers)."
            )
        X_model = self._power_transform_features(X)
        X_scaled, _ = self._scale(X_model)
        return out, X_scaled

    def _select_optimal_k(self, X_scaled: np.ndarray, requested_k: int) -> int:
        """
        Pick K via silhouette score across ``k in [2, 3, 4, 5]``.

        Falls back safely when data volume is too small or silhouette is undefined.
        """
        n_samples = X_scaled.shape[0]
        if n_samples < 2:
            return 1

        candidate_ks = [k for k in (2, 3, 4, 5) if k <= n_samples]
        if not candidate_ks:
            return min(max(1, requested_k), n_samples)

        # Downsample for model selection to keep latency bounded on large files.
        X_eval = X_scaled
        if n_samples > 6000:
            rng = np.random.default_rng(self.random_state)
            idx = rng.choice(n_samples, size=6000, replace=False)
            X_eval = X_scaled[idx]

        best_k = candidate_ks[0]
        best_score = -1.0
        for k in candidate_ks:
            model = self._build_kmeans_estimator(k, n_samples=X_eval.shape[0], for_search=True)
            labels = model.fit_predict(X_eval)
            # Silhouette needs at least 2 non-empty clusters.
            if len(np.unique(labels)) < 2:
                continue
            try:
                score = float(
                    silhouette_score(
                        X_eval,
                        labels,
                        sample_size=min(2000, len(X_eval)),
                        random_state=self.random_state,
                    )
                )
            except Exception:
                continue
            if score > best_score:
                best_score = score
                best_k = k
        return best_k

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------
    def apply_kmeans(self, df: pd.DataFrame, n_clusters: int = 3) -> pd.DataFrame:
        """
        Segment rows using K-Means on transformed + robust-scaled numeric features.

        Adds an integer ``cluster`` column (0-based). The effective cluster count
        is selected dynamically via silhouette score across ``k in [2, 3, 4, 5]``
        whenever possible.
        """
        if df.empty:
            raise ValueError("Input DataFrame has no rows.")

        out, X_scaled = self._prepare_model_matrix(df)

        k = int(n_clusters)
        if k < 1:
            raise ValueError("n_clusters must be at least 1.")
        k_effective = self._select_optimal_k(X_scaled, requested_k=k)

        model = self._build_kmeans_estimator(
            n_clusters=k_effective,
            n_samples=X_scaled.shape[0],
            for_search=False,
        )
        labels = model.fit_predict(X_scaled)
        out["cluster"] = labels.astype(int)
        return out

    def apply_pca(self, df: pd.DataFrame) -> pd.DataFrame:
        """
        Project numeric features onto two components for scatter plots.

        Adds ``pca1`` and ``pca2``. The ``cluster`` label column is **not**
        used as a PCA input. If fewer than two components are mathematically
        available (e.g. a single numeric feature), ``pca2`` is padded with 0.0.
        """
        if df.empty:
            raise ValueError("Input DataFrame has no rows.")

        out, X_scaled = self._prepare_model_matrix(df)

        n_samples, n_features = X_scaled.shape
        max_components = min(2, n_features, max(1, n_samples))
        svd_solver = "randomized" if n_samples >= 4000 and n_features > 2 else "auto"
        pca = PCA(n_components=max_components, random_state=self.random_state, svd_solver=svd_solver)
        coords = pca.fit_transform(X_scaled)

        if max_components >= 2:
            out["pca1"] = coords[:, 0].astype(float)
            out["pca2"] = coords[:, 1].astype(float)
        else:
            out["pca1"] = coords[:, 0].astype(float)
            out["pca2"] = 0.0

        return out

    def cluster_and_embed(self, df: pd.DataFrame, n_clusters: int = 3) -> pd.DataFrame:
        """
        Optimized combined path: shared preprocessing, then K-Means + PCA.
        """
        if df.empty:
            raise ValueError("Input DataFrame has no rows.")

        out, X_scaled = self._prepare_model_matrix(df)

        k = int(n_clusters)
        if k < 1:
            raise ValueError("n_clusters must be at least 1.")
        k_effective = self._select_optimal_k(X_scaled, requested_k=k)
        model = self._build_kmeans_estimator(
            n_clusters=k_effective,
            n_samples=X_scaled.shape[0],
            for_search=False,
        )
        out["cluster"] = model.fit_predict(X_scaled).astype(int)

        n_samples, n_features = X_scaled.shape
        max_components = min(2, n_features, max(1, n_samples))
        svd_solver = "randomized" if n_samples >= 4000 and n_features > 2 else "auto"
        pca = PCA(n_components=max_components, random_state=self.random_state, svd_solver=svd_solver)
        coords = pca.fit_transform(X_scaled)
        if max_components >= 2:
            out["pca1"] = coords[:, 0].astype(float)
            out["pca2"] = coords[:, 1].astype(float)
        else:
            out["pca1"] = coords[:, 0].astype(float)
            out["pca2"] = 0.0
        return out

    def infer_numeric_feature_names(self, df: pd.DataFrame) -> list[str]:
        """
        Return the numeric feature names that would be used for K-Means / PCA.

        Useful for API responses and debugging without duplicating selection logic.
        """
        base = df.copy()
        for col in _OUTPUT_COLUMNS:
            if col in base.columns:
                base = base.drop(columns=[col])
        feature_cols = self._numeric_feature_columns(base)
        _, used = self._build_feature_matrix(base, feature_cols)
        return used

    def build_api_payload(self, df: pd.DataFrame) -> dict[str, Any]:
        """
        Serialize cluster labels and PCA coordinates in row order (JSON-friendly).
        """
        if "cluster" not in df.columns:
            raise ValueError("DataFrame is missing ``cluster``; run apply_kmeans first.")
        if "pca1" not in df.columns or "pca2" not in df.columns:
            raise ValueError("DataFrame is missing PCA columns; run apply_pca first.")

        labels = [int(x) for x in df["cluster"].tolist()]
        points: list[dict[str, float]] = [
            {"pca1": float(r["pca1"]), "pca2": float(r["pca2"])}
            for _, r in df.iterrows()
        ]
        return {"cluster_labels": labels, "pca_coordinates": points}

    def detect_anomalies(self, df: pd.DataFrame, numeric_columns: list[str]) -> pd.DataFrame:
        """
        Flag multivariate outliers with ``IsolationForest`` on the chosen numeric columns.

        Adds ``is_anomaly`` (``True`` = outlier) and returns only the outlier rows.
        """
        if df.empty:
            raise ValueError("Input DataFrame has no rows.")
        if not numeric_columns:
            raise ValueError("numeric_columns must be non-empty.")

        out = df.copy()
        if "is_anomaly" in out.columns:
            out = out.drop(columns=["is_anomaly"])

        missing = [c for c in numeric_columns if c not in out.columns]
        if missing:
            raise ValueError(f"Unknown columns for anomaly detection: {missing}")

        blocks: list[pd.Series] = []
        for col in numeric_columns:
            series = out[col]
            if not pd.api.types.is_numeric_dtype(series):
                series = pd.to_numeric(series, errors="coerce")
            if series.notna().sum() == 0:
                raise ValueError(f"Column {col!r} has no numeric values after coercion.")
            fill = float(series.mean()) if series.notna().any() else 0.0
            blocks.append(series.astype("float64").fillna(fill))

        X = np.column_stack([b.to_numpy(dtype=np.float64, copy=True) for b in blocks])
        n_samples = X.shape[0]
        if n_samples < 2:
            out["is_anomaly"] = False
            return out

        iso = IsolationForest(
            random_state=self.random_state,
            contamination="auto",
            n_estimators=min(200, max(10, n_samples * 4)),
        )
        pred = iso.fit_predict(X)
        out["is_anomaly"] = pred == -1
        return out.loc[out["is_anomaly"]].reset_index(drop=True)

    def forecast_sales(
        self,
        df: pd.DataFrame,
        date_col: str,
        value_col: str,
        days_to_predict: int = 30,
    ) -> list[dict[str, Any]]:
        """
        Aggregate ``value_col`` by calendar day, fit ``LinearRegression`` on day index,
        and predict the next ``days_to_predict`` daily totals.
        """
        if df.empty:
            raise ValueError("Input DataFrame has no rows.")
        if days_to_predict < 1:
            raise ValueError("days_to_predict must be at least 1.")
        if value_col not in df.columns:
            raise ValueError(f"Unknown value column: {value_col!r}")

        resolved_date_col = date_col
        if resolved_date_col not in df.columns:
            if "transaction_date" in df.columns:
                resolved_date_col = "transaction_date"
            elif "date" in df.columns:
                resolved_date_col = "date"
            else:
                resolved_date_col = "__generated_date__"

        work = df.copy()
        if resolved_date_col == "__generated_date__":
            # Fallback for datasets without explicit date fields.
            end = pd.Timestamp.utcnow().normalize()
            start = end - pd.Timedelta(days=59)
            work[resolved_date_col] = pd.date_range(start=start, end=end, periods=len(work))

        work = work[[resolved_date_col, value_col]].copy()
        work[resolved_date_col] = pd.to_datetime(work[resolved_date_col], errors="coerce")
        work[value_col] = pd.to_numeric(work[value_col], errors="coerce")
        work = work.dropna(subset=[resolved_date_col, value_col])
        if work.empty:
            # Final fallback: generate synthetic timeline if parsed dates are all invalid.
            end = pd.Timestamp.utcnow().normalize()
            start = end - pd.Timedelta(days=59)
            work = df[[value_col]].copy()
            work[resolved_date_col] = pd.date_range(start=start, end=end, periods=len(work))
            work[value_col] = pd.to_numeric(work[value_col], errors="coerce")
            work = work.dropna(subset=[value_col])
            if work.empty:
                raise ValueError("No rows with valid numeric values for forecasting.")

        day = work[resolved_date_col].dt.normalize()
        daily = work.assign(_day=day).groupby("_day", as_index=False)[value_col].sum()
        daily = daily.rename(columns={"_day": "date"}).sort_values("date").reset_index(drop=True)

        n = len(daily)
        history_payload = [
            {
                "date": pd.Timestamp(d).strftime("%Y-%m-%d"),
                "historical_value": float(v),
                "predicted_value": None,
            }
            for d, v in zip(daily["date"], daily[value_col])
        ]

        if n == 1:
            only_date = pd.Timestamp(daily["date"].iloc[0]).normalize()
            only_value = float(daily[value_col].iloc[0])
            future_dates = pd.date_range(
                start=only_date + pd.Timedelta(days=1),
                periods=days_to_predict,
                freq="D",
            )
            future_payload = [
                {
                    "date": d.strftime("%Y-%m-%d"),
                    "historical_value": None,
                    "predicted_value": only_value,
                }
                for d in future_dates
            ]
            return history_payload + future_payload

        y = daily[value_col].to_numpy(dtype=np.float64, copy=True)

        def build_model_predictions(y_train: np.ndarray, horizon: int, start_idx: int) -> dict[str, np.ndarray]:
            """
            Generate multiple forecast variants on a unified time index.

            This is an ensemble-friendly set combining trend, nonlinear, and
            smoothing-style predictors.
            """
            out: dict[str, np.ndarray] = {}
            train_n = len(y_train)
            x_train = np.arange(train_n, dtype=np.float64).reshape(-1, 1)
            x_future = np.arange(start_idx, start_idx + horizon, dtype=np.float64).reshape(-1, 1)

            # 1) Linear trend.
            try:
                lr = LinearRegression()
                lr.fit(x_train, y_train)
                out["linear"] = lr.predict(x_future)
            except Exception:
                pass

            # 2) Polynomial trend (quadratic when enough points).
            if train_n >= 3:
                try:
                    degree = 2 if train_n >= 5 else 1
                    coeffs = np.polyfit(np.arange(train_n, dtype=np.float64), y_train, deg=degree)
                    out["poly"] = np.polyval(coeffs, x_future.ravel())
                except Exception:
                    pass

            # 3) Tree-based nonlinear learner on time index.
            if train_n >= 6:
                try:
                    rf = RandomForestRegressor(
                        n_estimators=240,
                        random_state=self.random_state,
                        min_samples_leaf=2,
                    )
                    rf.fit(x_train, y_train)
                    out["forest"] = rf.predict(x_future)
                except Exception:
                    pass

            # 4) Last-value baseline (naive forecast).
            out["naive"] = np.full(horizon, float(y_train[-1]), dtype=np.float64)

            # 5) Short-window moving average baseline.
            window = min(7, train_n)
            out["moving_avg"] = np.full(horizon, float(np.mean(y_train[-window:])), dtype=np.float64)

            # 6) Exponential smoothing-like level estimate.
            try:
                level = float(pd.Series(y_train).ewm(alpha=0.35, adjust=False).mean().iloc[-1])
                out["ewm"] = np.full(horizon, level, dtype=np.float64)
            except Exception:
                pass

            return out

        def ensemble_weights(y_full: np.ndarray) -> dict[str, float]:
            """
            Compute model weights from holdout MAE (lower error => higher weight).
            """
            train_n = len(y_full)
            if train_n < 6:
                return {}

            val_size = max(2, min(14, train_n // 4))
            train = y_full[:-val_size]
            val = y_full[-val_size:]
            if len(train) < 2:
                return {}

            candidate_preds = build_model_predictions(train, horizon=val_size, start_idx=len(train))
            scores: dict[str, float] = {}
            for name, pred in candidate_preds.items():
                if len(pred) != len(val):
                    continue
                mae = float(np.mean(np.abs(pred - val)))
                if np.isfinite(mae):
                    scores[name] = 1.0 / max(mae, 1e-6)

            if not scores:
                return {}
            total = float(sum(scores.values()))
            return {k: float(v / total) for k, v in scores.items()}

        full_preds = build_model_predictions(y, horizon=days_to_predict, start_idx=n)
        if not full_preds:
            raise ValueError("Could not generate forecasts from available models.")

        weights = ensemble_weights(y)
        if not weights:
            # Fallback: equal weights across available models.
            equal = 1.0 / float(len(full_preds))
            weights = {name: equal for name in full_preds.keys()}
        else:
            # Keep only models available in final run, then re-normalize.
            weights = {name: w for name, w in weights.items() if name in full_preds}
            if not weights:
                equal = 1.0 / float(len(full_preds))
                weights = {name: equal for name in full_preds.keys()}
            else:
                total = float(sum(weights.values()))
                weights = {name: float(w / total) for name, w in weights.items()}

        preds = np.zeros(days_to_predict, dtype=np.float64)
        for name, arr in full_preds.items():
            preds += float(weights.get(name, 0.0)) * arr

        # Sales totals should not go below zero in the output payload.
        preds = np.clip(preds, a_min=0.0, a_max=None)

        last_date = pd.Timestamp(daily["date"].iloc[-1]).normalize()
        future_dates = pd.date_range(
            start=last_date + pd.Timedelta(days=1),
            periods=days_to_predict,
            freq="D",
        )
        future_payload = [
            {
                "date": d.strftime("%Y-%m-%d"),
                "historical_value": None,
                "predicted_value": float(p),
            }
            for d, p in zip(future_dates, preds)
        ]

        # Bridge point to connect the forecast line smoothly from history.
        bridge = {
            "date": pd.Timestamp(daily["date"].iloc[-1]).strftime("%Y-%m-%d"),
            "historical_value": float(daily[value_col].iloc[-1]),
            "predicted_value": float(daily[value_col].iloc[-1]),
        }

        return history_payload + [bridge] + future_payload
