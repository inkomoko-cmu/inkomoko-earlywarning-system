from __future__ import annotations

import pytest
from jose import jwt
from fastapi.testclient import TestClient

from app.core.config import settings
from app.main import app


@pytest.fixture
def api_client():
    with TestClient(app) as client:
        yield client


@pytest.fixture
def admin_auth_headers() -> dict[str, str]:
    token = jwt.encode(
        {"email": "admin@admin.com", "roles": ["admin"]},
        settings.JWT_SECRET,
        algorithm=settings.JWT_ALG,
    )
    return {"Authorization": f"Bearer {token}"}
