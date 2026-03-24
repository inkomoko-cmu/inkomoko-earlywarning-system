#!/usr/bin/env python3
"""One-off uploader for anonymized CSVs into raw PostgreSQL tables.

Loads these files:
- ml/Anomynized data/Anomynized data/Anomynized data/baseline_*.csv
- ml/Anomynized data/Anomynized data/Anomynized data/endline_*.csv
- ml/Anomynized data/Anomynized data/Anomynized data/Investment data_*.csv

Target tables:
- anon_baseline_raw
- anon_endline_raw
- anon_investment_raw

Usage:
    DATABASE_URL=postgresql://user:pass@localhost:5432/db python upload_anonymized_data.py
"""

from __future__ import annotations

import argparse
import io
import os
import re
import sys
import time
from pathlib import Path
from typing import Iterable

import pandas as pd
import psycopg
from psycopg import sql


DATA_DIR = (
    Path(__file__).resolve().parent
    / "ml"
    / "Anomynized data"
    / "Anomynized data"
    / "Anomynized data"
)

FILE_TABLE_MAP = {
    "baseline_RW-ET-SS_existing businesses 2022-2025_Inkomoko.csv": "anon_baseline_raw",
    "endline_RW-ET-SS_existing businesses 2022-2025_Inkomoko.csv": "anon_endline_raw",
    "Investment data_all clients_RW-KE-ET-SS_2021-2025_Inkomoko.csv": "anon_investment_raw",
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="One-off anonymized CSV uploader")
    parser.add_argument(
        "--database-url",
        default=None,
        help="PostgreSQL URL. Defaults to DATABASE_URL/POSTGRES_URL env vars or backend settings.",
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        default=2000,
        help="Rows per executemany batch.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Validate files/schema mapping without creating tables or inserting rows.",
    )
    return parser.parse_args()


def resolve_db_url(cli_url: str | None) -> str:
    if cli_url:
        return normalize_db_url(cli_url)

    env_url = os.getenv("DATABASE_URL") or os.getenv("POSTGRES_URL")
    if env_url:
        return normalize_db_url(env_url)

    backend_dir = Path(__file__).resolve().parent / "backend"
    if backend_dir.exists():
        sys.path.insert(0, str(backend_dir))
        try:
            from app.core.config import settings  # type: ignore

            if settings.DATABASE_URL:
                return normalize_db_url(settings.DATABASE_URL)
        except Exception:
            pass

    raise RuntimeError(
        "Database URL not found. Pass --database-url or set DATABASE_URL/POSTGRES_URL."
    )


def normalize_db_url(url: str) -> str:
    # Backend defaults to SQLAlchemy async URL; psycopg expects plain postgresql://
    return url.replace("postgresql+asyncpg://", "postgresql://")


def read_csv_with_fallback(path: Path) -> pd.DataFrame:
    for encoding in ("utf-8", "latin-1", "cp1252"):
        try:
            return pd.read_csv(path, encoding=encoding, dtype=str)
        except UnicodeDecodeError:
            continue
    raw = path.read_bytes()
    text = raw.decode("utf-8", errors="replace")
    return pd.read_csv(io.StringIO(text), dtype=str)


def normalize_column_names(columns: Iterable[str]) -> list[str]:
    used: dict[str, int] = {}
    normalized: list[str] = []

    for idx, col in enumerate(columns):
        base = re.sub(r"[^a-zA-Z0-9]+", "_", str(col).strip().lower()).strip("_")
        if not base:
            base = f"column_{idx + 1}"

        count = used.get(base, 0) + 1
        used[base] = count

        name = base if count == 1 else f"{base}_{count}"
        normalized.append(name)

    return normalized


def to_python_records(df: pd.DataFrame) -> list[tuple]:
    cleaned = df.where(pd.notna(df), None)
    cleaned = cleaned.astype(object)
    rows = cleaned.to_records(index=False).tolist()

    records: list[tuple] = []
    for row in rows:
        records.append(tuple(None if v == "" else v for v in row))
    return records


def ensure_table(cur: psycopg.Cursor, table_name: str, columns: list[str]) -> None:
    col_defs = [
        sql.SQL("{} TEXT").format(sql.Identifier(col_name)) for col_name in columns
    ]
    col_defs.append(sql.SQL("_source_file TEXT NOT NULL"))
    col_defs.append(sql.SQL("_loaded_at TIMESTAMPTZ NOT NULL DEFAULT now()"))

    query = sql.SQL("CREATE TABLE IF NOT EXISTS {} ({})").format(
        sql.Identifier(table_name),
        sql.SQL(", ").join(col_defs),
    )
    cur.execute(query)


def insert_rows(
    cur: psycopg.Cursor,
    table_name: str,
    columns: list[str],
    source_file: str,
    rows: list[tuple],
    batch_size: int,
) -> int:
    insert_cols = columns + ["_source_file"]
    query = sql.SQL("INSERT INTO {} ({}) VALUES ({})").format(
        sql.Identifier(table_name),
        sql.SQL(", ").join(sql.Identifier(c) for c in insert_cols),
        sql.SQL(", ").join(sql.Placeholder() for _ in insert_cols),
    )

    inserted = 0
    for start in range(0, len(rows), batch_size):
        batch = rows[start : start + batch_size]
        payload = [tuple(list(row) + [source_file]) for row in batch]
        cur.executemany(query, payload)
        inserted += len(batch)
    return inserted


def table_count(cur: psycopg.Cursor, table_name: str) -> int:
    cur.execute(
        sql.SQL("SELECT COUNT(*) FROM {}").format(sql.Identifier(table_name))
    )
    return int(cur.fetchone()[0])


def validate_inputs() -> dict[Path, str]:
    missing = []
    file_to_table: dict[Path, str] = {}

    for filename, table in FILE_TABLE_MAP.items():
        path = DATA_DIR / filename
        if not path.exists():
            missing.append(str(path))
        else:
            file_to_table[path] = table

    if missing:
        details = "\n".join(f"- {m}" for m in missing)
        raise FileNotFoundError(f"Missing input CSV files:\n{details}")

    return file_to_table


def main() -> int:
    args = parse_args()
    started = time.time()

    file_to_table = validate_inputs()
    db_url = resolve_db_url(args.database_url)
    db_target = db_url.split("@")[-1] if "@" in db_url else db_url

    print(f"[INFO] Data directory: {DATA_DIR}")
    print(f"[INFO] Database URL host target: {db_target}")

    results: list[tuple[str, int, int]] = []

    if args.dry_run:
        for csv_path, table in file_to_table.items():
            df = read_csv_with_fallback(csv_path)
            normalized_cols = normalize_column_names(df.columns)
            print(
                f"[DRY-RUN] {csv_path.name} -> {table} | columns={len(normalized_cols)} rows={len(df)}"
            )
        print("[DRY-RUN] No DB changes were made.")
        return 0

    with psycopg.connect(db_url) as conn:
        for csv_path, table in file_to_table.items():
            print(f"[INFO] Loading {csv_path.name} into {table}...")
            df = read_csv_with_fallback(csv_path)
            df.columns = normalize_column_names(df.columns)
            rows = to_python_records(df)

            with conn.cursor() as cur:
                ensure_table(cur, table, list(df.columns))
                inserted = insert_rows(
                    cur=cur,
                    table_name=table,
                    columns=list(df.columns),
                    source_file=csv_path.name,
                    rows=rows,
                    batch_size=args.batch_size,
                )
                persisted = table_count(cur, table)
                results.append((table, inserted, persisted))

            conn.commit()

    elapsed = time.time() - started
    print("\n[SUMMARY]")
    for table, inserted, persisted in results:
        print(
            f"- {table}: inserted_this_run={inserted}, total_rows_in_table={persisted}"
        )
    print(f"[DONE] Completed in {elapsed:.2f}s")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
