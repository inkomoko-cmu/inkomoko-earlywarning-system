"""CSV upload endpoints for data and user bulk-import."""

from __future__ import annotations

import io
import re
import uuid
from datetime import datetime, timezone
from typing import Iterable

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_roles
from app.core.security import hash_password
from app.db.session import get_db
from app.models.auth import AuthUser, AuthRole, AuthUserRole

router = APIRouter(prefix="/upload", tags=["upload"])

# ---------------------------------------------------------------------------
# Required column sets per dataset
# ---------------------------------------------------------------------------
BASELINE_REQUIRED = {
    "client_id", "country", "survey_date", "job_created",
    "revenue", "business_sector",
}
ENDLINE_REQUIRED = {
    "client_id", "country", "survey_date", "job_created",
    "revenue", "business_sector",
}
INVESTMENT_REQUIRED = {
    "loannumber", "country", "disbursementdate",
    "appliedamount", "approvedamount", "disbursedamount",
    "currentbalance", "daysinarrears", "loanstatus",
    "industrysectorofactivity",
}
USER_REQUIRED = {"email", "full_name", "password", "role"}

DATASET_META: dict[str, dict] = {
    "baseline": {
        "table": "anon_baseline_raw",
        "required": BASELINE_REQUIRED,
        "numeric": {"job_created", "revenue"},
        "date": {"survey_date"},
        "boolean": set(),
    },
    "endline": {
        "table": "anon_endline_raw",
        "required": ENDLINE_REQUIRED,
        "numeric": {"job_created", "revenue"},
        "date": {"survey_date"},
        "boolean": {"nps_promoter", "nps_detractor", "satisfied_yes", "satisfied_no"},
    },
    "investment": {
        "table": "anon_investment_raw",
        "required": INVESTMENT_REQUIRED,
        "numeric": {
            "appliedamount", "approvedamount", "disbursedamount",
            "currentbalance", "daysinarrears",
        },
        "date": {"disbursementdate"},
        "boolean": set(),
    },
}

VALID_ROLES = {"admin", "program_manager", "advisor", "donor"}
MAX_FILE_SIZE = 50 * 1024 * 1024  # 50 MB
NUMERIC_RE = re.compile(r"^[0-9.\-,\s]*$")
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$|^\d{2}/\d{2}/\d{4}$")
BOOL_VALUES = {"true", "false", "1", "0", "yes", "no", "t", "f"}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _normalize_col(col: str) -> str:
    """Mirror upload_anonymized_data.py normalize_column_names logic."""
    base = re.sub(r"[^a-zA-Z0-9]+", "_", str(col).strip().lower()).strip("_")
    return base or "column"


def _normalize_columns(columns: Iterable[str]) -> list[str]:
    used: dict[str, int] = {}
    out: list[str] = []
    for idx, col in enumerate(columns):
        base = _normalize_col(col)
        if not base:
            base = f"column_{idx + 1}"
        count = used.get(base, 0) + 1
        used[base] = count
        out.append(base if count == 1 else f"{base}_{count}")
    return out


def _parse_csv(raw_bytes: bytes) -> tuple[list[str], list[dict[str, str]]]:
    """Parse CSV bytes with encoding fallback. Returns (columns, rows_as_dicts)."""
    import csv as _csv

    text_content: str | None = None
    for enc in ("utf-8-sig", "utf-8", "latin-1", "cp1252"):
        try:
            text_content = raw_bytes.decode(enc)
            break
        except UnicodeDecodeError:
            continue
    if text_content is None:
        text_content = raw_bytes.decode("utf-8", errors="replace")

    reader = _csv.DictReader(io.StringIO(text_content))
    if not reader.fieldnames:
        raise ValueError("CSV has no header row")
    raw_cols = list(reader.fieldnames)
    norm_cols = _normalize_columns(raw_cols)

    rows: list[dict[str, str]] = []
    col_map = dict(zip(raw_cols, norm_cols))
    for row in reader:
        rows.append({col_map[k]: (v or "") for k, v in row.items() if k in col_map})
    return norm_cols, rows


def _validate(
    columns: list[str],
    rows: list[dict[str, str]],
    meta: dict,
) -> list[str]:
    """Return list of validation error strings (empty = OK)."""
    errors: list[str] = []
    col_set = set(columns)

    # 1) Required columns present
    missing = meta["required"] - col_set
    if missing:
        errors.append(f"Missing required columns: {', '.join(sorted(missing))}")

    if errors:
        return errors  # stop early if columns missing

    sample = rows[:200]

    # 2) Required columns not entirely blank
    for col in meta["required"]:
        if all(not r.get(col, "").strip() for r in sample):
            errors.append(f"Column '{col}' is entirely blank in the first {len(sample)} rows")

    # 3) Numeric checks
    for col in meta.get("numeric", set()) & col_set:
        bad = [
            i + 1
            for i, r in enumerate(sample)
            if r.get(col, "").strip() and not NUMERIC_RE.match(r[col].strip())
        ]
        if bad:
            errors.append(
                f"Column '{col}' has non-numeric values in rows: "
                f"{bad[:5]}{'...' if len(bad) > 5 else ''}"
            )

    # 4) Date checks
    for col in meta.get("date", set()) & col_set:
        bad = [
            i + 1
            for i, r in enumerate(sample)
            if r.get(col, "").strip() and not DATE_RE.match(r[col].strip())
        ]
        if bad:
            errors.append(
                f"Column '{col}' has invalid date format in rows: "
                f"{bad[:5]}{'...' if len(bad) > 5 else ''} (expected YYYY-MM-DD or DD/MM/YYYY)"
            )

    # 5) Boolean checks
    for col in meta.get("boolean", set()) & col_set:
        bad = [
            i + 1
            for i, r in enumerate(sample)
            if r.get(col, "").strip() and r[col].strip().lower() not in BOOL_VALUES
        ]
        if bad:
            errors.append(
                f"Column '{col}' has invalid boolean values in rows: "
                f"{bad[:5]}{'...' if len(bad) > 5 else ''}"
            )

    return errors


# ---------------------------------------------------------------------------
# Dataset upload (baseline / endline / investment)
# ---------------------------------------------------------------------------

@router.post("/{dataset_type}")
async def upload_dataset(
    dataset_type: str,
    file: UploadFile = File(...),
    _admin=Depends(require_roles("admin")),
    db: AsyncSession = Depends(get_db),
):
    if dataset_type not in DATASET_META:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid dataset type '{dataset_type}'. Must be one of: {', '.join(DATASET_META)}",
        )

    meta = DATASET_META[dataset_type]

    # Read + size check
    raw = await file.read()
    if len(raw) > MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail="File exceeds 50 MB limit")
    if not raw.strip():
        raise HTTPException(status_code=400, detail="File is empty")

    # Parse
    try:
        columns, rows = _parse_csv(raw)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    if not rows:
        raise HTTPException(status_code=400, detail="CSV contains a header but no data rows")

    # Validate
    errors = _validate(columns, rows, meta)
    if errors:
        raise HTTPException(status_code=422, detail={"validation_errors": errors})

    # --- Insert into raw table ---
    table = meta["table"]
    all_cols = columns + ["_source_file", "_loaded_at"]

    # CREATE TABLE IF NOT EXISTS (all TEXT + metadata)
    col_defs = ", ".join(f'"{c}" TEXT' for c in columns)
    col_defs += ', "_source_file" TEXT NOT NULL, "_loaded_at" TIMESTAMPTZ NOT NULL DEFAULT now()'
    await db.execute(text(f'CREATE TABLE IF NOT EXISTS "{table}" ({col_defs})'))

    # Batch insert
    now_ts = datetime.now(timezone.utc).isoformat()
    source = file.filename or "upload"
    batch_size = 1000
    inserted = 0

    for start in range(0, len(rows), batch_size):
        batch = rows[start: start + batch_size]
        placeholders_row = ", ".join(f":c{i}" for i in range(len(columns)))
        placeholders_row += ", :src, :ts"
        values_sql = ", ".join(
            f"({placeholders_row})" for _ in batch
        )
        # Build flat params for executemany-style via individual INSERTs
        for row in batch:
            params = {f"c{i}": row.get(col, None) for i, col in enumerate(columns)}
            params["src"] = source
            params["ts"] = now_ts
            col_names = ", ".join(f'"{c}"' for c in all_cols)
            ph = ", ".join(f":c{i}" for i in range(len(columns))) + ", :src, :ts"
            await db.execute(text(f'INSERT INTO "{table}" ({col_names}) VALUES ({ph})'), params)
            inserted += 1

    await db.commit()

    # Count total rows
    result = await db.execute(text(f'SELECT count(*) FROM "{table}"'))
    total = result.scalar()

    return {
        "status": "ok",
        "dataset_type": dataset_type,
        "file_name": file.filename,
        "rows_uploaded": inserted,
        "total_rows_in_table": total,
        "columns_detected": columns,
    }


# ---------------------------------------------------------------------------
# User bulk upload
# ---------------------------------------------------------------------------

@router.post("/users")
async def upload_users(
    file: UploadFile = File(...),
    _admin=Depends(require_roles("admin")),
    db: AsyncSession = Depends(get_db),
):
    raw = await file.read()
    if len(raw) > MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail="File exceeds 50 MB limit")
    if not raw.strip():
        raise HTTPException(status_code=400, detail="File is empty")

    try:
        columns, rows = _parse_csv(raw)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    if not rows:
        raise HTTPException(status_code=400, detail="CSV contains a header but no data rows")

    # Validate required columns
    col_set = set(columns)
    missing = USER_REQUIRED - col_set
    if missing:
        raise HTTPException(
            status_code=422,
            detail={"validation_errors": [f"Missing required columns: {', '.join(sorted(missing))}"]},
        )

    # Row-level validation
    errors: list[str] = []
    for i, row in enumerate(rows, start=1):
        email = row.get("email", "").strip()
        pwd = row.get("password", "").strip()
        role = row.get("role", "").strip().lower()
        name = row.get("full_name", "").strip()
        if not email or "@" not in email:
            errors.append(f"Row {i}: invalid or missing email")
        if len(pwd) < 6:
            errors.append(f"Row {i}: password must be at least 6 characters")
        if role not in VALID_ROLES:
            errors.append(f"Row {i}: invalid role '{role}'. Must be one of: {', '.join(sorted(VALID_ROLES))}")
        if not name:
            errors.append(f"Row {i}: full_name is required")
        if len(errors) >= 20:
            errors.append("... (too many errors, showing first 20)")
            break

    if errors:
        raise HTTPException(status_code=422, detail={"validation_errors": errors})

    # Fetch existing emails to skip duplicates
    result = await db.execute(text("SELECT lower(email) FROM auth_user"))
    existing_emails = {r[0] for r in result.fetchall()}

    # Fetch role map
    result = await db.execute(text("SELECT role_id, role_key FROM auth_role"))
    role_map = {r[1]: r[0] for r in result.fetchall()}

    created = 0
    skipped = 0
    skipped_emails: list[str] = []

    for row in rows:
        email = row["email"].strip().lower()
        if email in existing_emails:
            skipped += 1
            skipped_emails.append(email)
            continue

        role_key = row["role"].strip().lower()
        role_id = role_map.get(role_key)
        if not role_id:
            continue  # validated above, but guard anyway

        user = AuthUser(
            user_id=uuid.uuid4(),
            email=email,
            full_name=row["full_name"].strip(),
            password_hash=hash_password(row["password"].strip()),
            is_active=False,  # ← uploaded users are DEACTIVATED by default
        )
        db.add(user)
        await db.flush()

        db.add(AuthUserRole(user_id=user.user_id, role_id=role_id))
        existing_emails.add(email)
        created += 1

    await db.commit()

    return {
        "status": "ok",
        "users_created": created,
        "users_skipped": skipped,
        "skipped_emails": skipped_emails[:20],
        "note": "All uploaded users are set as INACTIVE by default. Activate them in the Users tab.",
    }
