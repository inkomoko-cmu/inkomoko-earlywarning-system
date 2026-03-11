"""Shared pytest fixtures for the Inkomoko EWS test suite."""

from __future__ import annotations

import io
import csv
import pytest
import pandas as pd
from httpx import AsyncClient, ASGITransport

from app.main import app
from app.models import load_models, get_registry
from app.config import PREDICTIONS_DIR, LEAKAGE_COLS, HORIZONS


# ── Load models once for the entire test session ────────────────────────────


@pytest.fixture(scope="session", autouse=True)
def _load_models_once():
    """Ensure all 15 ML models are loaded before any test runs."""
    load_models()
    yield


# ── AsyncClient for FastAPI ─────────────────────────────────────────────────


@pytest.fixture
async def client():
    """Async HTTP client wired to the FastAPI app (no network needed)."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


# ── Sample data helpers ─────────────────────────────────────────────────────


@pytest.fixture(scope="session")
def test_csv_df() -> pd.DataFrame:
    """Load the full test.csv once per session."""
    return pd.read_csv(PREDICTIONS_DIR / "test.csv")


@pytest.fixture(scope="session")
def sample_record(test_csv_df: pd.DataFrame) -> dict:
    """A single clean client record (no targets/leakage/pred columns)."""
    target_names = set()
    for h in HORIZONS:
        target_names |= {
            f"risk_tier_{h}m",
            f"risk_score_{h}m",
            f"jobs_created_{h}m",
            f"jobs_lost_{h}m",
            f"revenue_{h}m",
        }
    drop_cols = [
        c
        for c in test_csv_df.columns
        if c.startswith("pred_") or c in LEAKAGE_COLS or c in target_names
    ]
    clean = test_csv_df.drop(columns=drop_cols, errors="ignore")
    row = clean.iloc[0].to_dict()
    # Convert NaN → None for JSON
    return {k: (None if pd.isna(v) else v) for k, v in row.items()}


@pytest.fixture(scope="session")
def sample_records(test_csv_df: pd.DataFrame) -> list[dict]:
    """Five clean client records for batch testing."""
    target_names = set()
    for h in HORIZONS:
        target_names |= {
            f"risk_tier_{h}m",
            f"risk_score_{h}m",
            f"jobs_created_{h}m",
            f"jobs_lost_{h}m",
            f"revenue_{h}m",
        }
    drop_cols = [
        c
        for c in test_csv_df.columns
        if c.startswith("pred_") or c in LEAKAGE_COLS or c in target_names
    ]
    clean = test_csv_df.drop(columns=drop_cols, errors="ignore")
    rows = clean.head(5).to_dict(orient="records")
    return [{k: (None if pd.isna(v) else v) for k, v in row.items()} for row in rows]


@pytest.fixture(scope="session")
def retrain_csv_bytes(test_csv_df: pd.DataFrame) -> bytes:
    """A small CSV with target columns included — suitable for retrain tests.

    Takes first 50 rows from test.csv (which has all columns including targets).
    """
    buf = io.StringIO()
    test_csv_df.head(50).to_csv(buf, index=False)
    return buf.getvalue().encode("utf-8")


@pytest.fixture(scope="session")
def registry():
    """Convenience access to the model registry."""
    return get_registry()
