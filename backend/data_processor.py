"""
AI-BI — Data loading and cleaning pipeline (Pandas).

This module provides a testable class that:
  * Loads tabular files from disk, bytes (uploads), or an existing DataFrame.
  * Standardizes column names, drops all-empty columns, and imputes missing
    values (numeric: mean or median; text-like columns: a sentinel string).
  * Exposes `get_eda_summary()` for lightweight JSON-friendly dataset stats.
"""

from __future__ import annotations

import io
from enum import Enum
from pathlib import Path
from typing import Any, Literal

import numpy as np
import pandas as pd


class NumericImputation(str, Enum):
    """How to fill missing values in numeric columns during cleaning."""

    MEAN = "mean"
    MEDIAN = "median"


class DataProcessor:
    """
    Load and clean sales-style tabular data into a consistent DataFrame shape.

    Cleaning order (intentional):
      1. Load raw rows into a DataFrame.
      2. Standardize column names (lowercase, underscores, trimmed).
      3. Drop columns that are entirely empty (no non-null cells).
      4. Impute missing cells: numbers with mean or median; other dtypes with
         the string ``Unknown`` (coercing object columns to string where needed).
    """

    # String used for missing non-numeric cells after cleaning.
    TEXT_MISSING_SENTINEL: str = "Unknown"

    def __init__(
        self,
        numeric_imputation: NumericImputation | Literal["mean", "median"] = NumericImputation.MEAN,
    ) -> None:
        # Normalize string literals to enum for consistent comparisons.
        if isinstance(numeric_imputation, str):
            self.numeric_imputation = NumericImputation(numeric_imputation.lower())
        else:
            self.numeric_imputation = numeric_imputation

        # Working copy of the dataset; treat as canonical after `process()`.
        self.df: pd.DataFrame | None = None

    # ------------------------------------------------------------------
    # Loading
    # ------------------------------------------------------------------
    def load_dataframe(self, dataframe: pd.DataFrame) -> pd.DataFrame:
        """
        Attach an already-loaded DataFrame (e.g. from tests or in-memory jobs).

        Returns a defensive copy so callers do not mutate the original frame.
        """
        self.df = dataframe.copy()
        return self.df

    def load_file(self, file_path: str | Path) -> pd.DataFrame:
        """
        Load CSV or Excel from disk. Raises ``ValueError`` for unsupported types.

        ``openpyxl`` is used for ``.xlsx`` / ``.xlsm``.
        """
        path = Path(file_path)
        suffix = path.suffix.lower()

        if suffix == ".csv":
            self.df = pd.read_csv(path)
        elif suffix in {".xlsx", ".xlsm"}:
            self.df = pd.read_excel(path, engine="openpyxl")
        else:
            raise ValueError(
                f"Unsupported file type: {suffix!r}. Use .csv, .xlsx, or .xlsm."
            )
        return self.df

    def load_uploaded_bytes(self, filename: str, file_content: bytes) -> pd.DataFrame:
        """
        Parse an uploaded file from raw bytes (e.g. FastAPI ``UploadFile``).

        The file type is inferred from ``filename``'s extension. Raises
        ``ValueError`` if the extension is not supported or if parsing fails.
        """
        if not file_content:
            raise ValueError("Uploaded file is empty.")

        suffix = Path(filename).suffix.lower()
        buffer = io.BytesIO(file_content)

        try:
            if suffix == ".csv":
                self.df = pd.read_csv(buffer)
            elif suffix == ".xlsx":
                self.df = pd.read_excel(buffer, engine="openpyxl")
            else:
                raise ValueError(
                    f"Unsupported file type: {suffix!r}. Only .csv and .xlsx are accepted."
                )
        except ValueError:
            # Re-raise our own validation errors unchanged.
            raise
        except Exception as exc:  # pragma: no cover - pandas raises varied types
            raise ValueError(f"Could not parse file as tabular data: {exc}") from exc

        return self.df

    # ------------------------------------------------------------------
    # Cleaning — column names & empty columns
    # ------------------------------------------------------------------
    def standardize_column_names(self, dataframe: pd.DataFrame) -> pd.DataFrame:
        """
        Normalize column names for APIs and ML features:
          * strip whitespace
          * lowercase
          * spaces → underscores
          * collapse repeated underscores
        """
        out = dataframe.copy()
        new_cols: list[str] = []
        for col in out.columns:
            name = str(col).strip().lower().replace(" ", "_")
            while "__" in name:
                name = name.replace("__", "_")
            new_cols.append(name)
        out.columns = new_cols
        return out

    def drop_completely_empty_columns(self, dataframe: pd.DataFrame) -> pd.DataFrame:
        """
        Remove columns where every value is NA. Keeps partially filled columns
        so downstream imputation can still run.
        """
        out = dataframe.copy()
        # ``dropna(axis=1, how="all")`` removes columns with no non-null entries.
        return out.dropna(axis=1, how="all")

    def impute_missing_values(self, dataframe: pd.DataFrame) -> pd.DataFrame:
        """
        Fill missing values: numeric columns use mean or median (see
        ``self.numeric_imputation``); all other columns use ``TEXT_MISSING_SENTINEL``.

        All-NaN numeric columns: imputer yields NaN — those are filled with 0.0
        so the frame contains no NA after this step.
        """
        out = dataframe.copy()
        # Treat bool separately: not "business numeric" for mean/median imputation.
        numeric_cols = [
            c
            for c in out.columns
            if pd.api.types.is_numeric_dtype(out[c]) and not pd.api.types.is_bool_dtype(out[c])
        ]
        non_numeric_cols = [c for c in out.columns if c not in numeric_cols]

        for col in numeric_cols:
            series = out[col]
            if self.numeric_imputation == NumericImputation.MEAN:
                fill_value: Any = series.mean()
            else:
                fill_value = series.median()
            # ``fill_value`` can still be NaN if the column is entirely NA.
            if pd.isna(fill_value):
                fill_value = 0.0
            out[col] = series.fillna(fill_value)

        for col in non_numeric_cols:
            # Cast to string so ``Unknown`` is type-consistent and JSON-friendly.
            out[col] = out[col].astype("string").fillna(self.TEXT_MISSING_SENTINEL)
            # Replace pandas ``<NA>`` in string columns if any remain.
            out[col] = out[col].replace({pd.NA: self.TEXT_MISSING_SENTINEL})

        return out

    # ------------------------------------------------------------------
    # Orchestration
    # ------------------------------------------------------------------
    def process(self, dataframe: pd.DataFrame | None = None) -> pd.DataFrame:
        """
        Run the full cleaning pipeline on ``self.df`` or on the provided frame.

        Order: standardize names → drop empty columns → impute missing values.
        """
        if dataframe is not None:
            self.load_dataframe(dataframe)

        if self.df is None:
            raise RuntimeError(
                "No data loaded. Call load_file(), load_uploaded_bytes(), "
                "load_dataframe(), or pass a DataFrame to process()."
            )

        cleaned = self.standardize_column_names(self.df)
        cleaned = self.drop_completely_empty_columns(cleaned)
        cleaned = self.impute_missing_values(cleaned)
        self.df = cleaned
        return self.df

    def get_dataframe(self) -> pd.DataFrame:
        """Return the current working DataFrame (must exist)."""
        if self.df is None:
            raise RuntimeError(
                "No DataFrame loaded. Load data before calling get_dataframe()."
            )
        return self.df

    def get_eda_summary(self) -> dict[str, Any]:
        """
        Basic exploratory stats for the **current** ``self.df`` (typically after
        ``process()``): row count, dtypes, and missing-value counts per column.

        The returned structure is JSON-serializable (Python ``int`` / ``str`` /
        plain dicts and lists only).
        """
        if self.df is None:
            return {
                "total_rows": 0,
                "total_columns": 0,
                "column_dtypes": {},
                "missing_values_per_column": {},
                "total_missing_values": 0,
            }

        df = self.df
        missing_per_col: dict[str, int] = {}
        total_missing = 0
        for col in df.columns:
            # ``isna`` counts float NaN, NaT, pandas NA, and None-like.
            count = int(df[col].isna().sum())
            missing_per_col[str(col)] = count
            total_missing += count

        dtypes_map = {str(c): str(dtype) for c, dtype in df.dtypes.items()}

        return {
            "total_rows": int(df.shape[0]),
            "total_columns": int(df.shape[1]),
            "column_dtypes": dtypes_map,
            "missing_values_per_column": missing_per_col,
            "total_missing_values": total_missing,
        }

    def to_preview_records(self, max_rows: int | None = None) -> list[dict[str, Any]]:
        """
        Serialize rows as JSON-friendly dict records.

        If ``max_rows`` is provided, only the first ``max_rows`` rows are returned.
        If ``None``, the full cleaned dataset is returned.

        Replaces non-finite floats and remaining NA-like values with ``None``
        so ``json.dumps`` works without a custom default handler.
        """
        if self.df is None:
            return []

        preview = self.df.copy() if max_rows is None else self.df.head(max_rows).copy()
        # Normalize odd float values for JSON (numeric columns only; skip bool).
        for col in preview.columns:
            if not pd.api.types.is_numeric_dtype(preview[col]):
                continue
            if pd.api.types.is_bool_dtype(preview[col]):
                continue
            preview[col] = preview[col].apply(
                lambda v: None if pd.isna(v) or (isinstance(v, float) and not np.isfinite(v)) else v
            )
        records = preview.to_dict(orient="records")
        # Final pass: any leftover NaN in object columns → None
        clean_records: list[dict[str, Any]] = []
        for row in records:
            clean_row: dict[str, Any] = {}
            for k, v in row.items():
                if v is pd.NA or (isinstance(v, float) and not np.isfinite(v)):
                    clean_row[k] = None
                elif pd.isna(v):
                    clean_row[k] = None
                else:
                    clean_row[k] = v
            clean_records.append(clean_row)
        return clean_records

    def summary(self) -> dict[str, Any]:
        """Lightweight structural summary (legacy helper for logging)."""
        if self.df is None:
            return {"rows": 0, "columns": 0, "column_names": []}
        return {
            "rows": int(self.df.shape[0]),
            "columns": int(self.df.shape[1]),
            "column_names": list(self.df.columns),
            "dtypes": {str(k): str(v) for k, v in self.df.dtypes.items()},
        }
