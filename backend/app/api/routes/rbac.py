from fastapi import APIRouter, Depends
from app.api.deps import require_roles

router = APIRouter(prefix="/rbac", tags=["rbac"])

@router.get("/admin")
async def admin_ping(_=Depends(require_roles("admin"))):
    return {"ok": True, "role": "admin"}

@router.get("/pm")
async def pm_ping(_=Depends(require_roles("admin", "program_manager"))):
    return {"ok": True, "role": "program_manager"}

@router.get("/donor")
async def donor_ping(_=Depends(require_roles("admin", "donor"))):
    return {"ok": True, "role": "donor"}

@router.get("/advisor")
async def advisor_ping(_=Depends(require_roles("admin", "advisor"))):
    return {"ok": True, "role": "advisor"}
