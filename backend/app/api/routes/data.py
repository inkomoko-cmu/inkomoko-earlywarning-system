from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.session import get_db
from app.api.deps import get_current_user
from app.crud.scope import get_user_scopes

router = APIRouter(prefix="/data", tags=["data"])

def _match_scope(scope_row, country_code):
    return scope_row.country_code is None or scope_row.country_code == country_code

@router.get("/kpis")
async def list_kpis(
    country_code: str = Query(...),
    current=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    user, roles = current
    if "admin" not in roles:
        scopes = await get_user_scopes(db, user.user_id)
        if not any(_match_scope(s, country_code) for s in scopes):
            raise HTTPException(403, "Out of scope")
    return {"ok": True, "country_code": country_code, "roles": roles}
