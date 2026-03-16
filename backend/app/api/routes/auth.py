from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import _build_engine
from app.schemas.auth import LoginRequest, TokenResponse
from app.schemas.user import MeResponse
from app.crud.audit import create_audit_log
from app.crud.auth import get_user_by_email, get_user_roles
from app.core.security import verify_password, create_access_token
from app.api.deps import get_current_user
from app.core.audit import log_event as fallback_log_event

router = APIRouter(prefix="/auth", tags=["auth"])


def _request_context(request: Request) -> dict:
    client_ip = request.client.host if request.client else None
    return {
        "ip": client_ip,
        "user_agent": request.headers.get("user-agent"),
        "endpoint": request.url.path,
        "method": request.method,
    }


async def _log_login_event(
    *,
    db: AsyncSession | None,
    request: Request,
    user_id,
    actor: str,
    success: bool,
    error_message: str | None,
    details: str,
) -> None:
    try:
        if db is None:
            async with _build_engine()() as audit_db:
                await create_audit_log(
                    audit_db,
                    action="User login",
                    category="auth",
                    severity="info" if success else "warning",
                    actor=actor,
                    details=details,
                    user_id=user_id,
                    resource_type="auth_user",
                    resource_id=user_id,
                    request_context=_request_context(request),
                    success=success,
                    error_message=error_message,
                    meta={"source": "backend"},
                )
        else:
            await create_audit_log(
                db,
                action="User login",
                category="auth",
                severity="info" if success else "warning",
                actor=actor,
                details=details,
                user_id=user_id,
                resource_type="auth_user",
                resource_id=user_id,
                request_context=_request_context(request),
                success=success,
                error_message=error_message,
                meta={"source": "backend"},
            )
    except Exception:
        fallback_log_event(
            action="User login",
            category="auth",
            severity="info" if success else "warning",
            actor=actor,
            details=details,
            source="backend",
            meta={"error": error_message} if error_message else {},
        )


@router.post("/login", response_model=TokenResponse)
async def login(payload: LoginRequest, request: Request):
    try:
        email = payload.email.lower().strip()

        # DEBUG MODE: Allow "admin@admin.com"/"admin" bypass — no DB needed
        if email == "admin@admin.com" and payload.password == "admin":
            print("🔓 DEBUG MODE: Admin bypass authenticated")
            token = create_access_token(
                {"sub": "debug-admin", "email": "admin@admin.com", "roles": ["admin"]}
            )
            # Don't await audit log for debug mode - it can fail without breaking login
            try:
                await _log_login_event(
                    db=None,
                    request=request,
                    user_id=None,
                    actor="admin@admin.com",
                    success=True,
                    error_message=None,
                    details="Debug admin authenticated via bypass",
                )
            except Exception as e:
                print(f"⚠️ Audit log failed (non-blocking): {e}")
            return TokenResponse(access_token=token)

        # For real users, open a DB session only now
        async with _build_engine()() as db:
            user = await get_user_by_email(db, email)
            print(f"Login attempt for email: {email}, user found: {user is not None}")
            if not user or not user.is_active:
                await _log_login_event(
                    db=db,
                    request=request,
                    user_id=user.user_id if user else None,
                    actor=email,
                    success=False,
                    error_message="Invalid credentials",
                    details="Login failed: inactive or unknown user",
                )
                raise HTTPException(status_code=401, detail="Invalid credentials")

            if not verify_password(payload.password, user.password_hash):
                await _log_login_event(
                    db=db,
                    request=request,
                    user_id=user.user_id,
                    actor=email,
                    success=False,
                    error_message="Invalid credentials",
                    details="Login failed: incorrect password",
                )
                raise HTTPException(status_code=401, detail="Invalid credentials")

            roles = await get_user_roles(db, user.user_id)
            token = create_access_token(
                {"sub": str(user.user_id), "email": user.email, "roles": roles}
            )
            await _log_login_event(
                db=db,
                request=request,
                user_id=user.user_id,
                actor=user.email,
                success=True,
                error_message=None,
                details="User authenticated successfully",
            )
            return TokenResponse(access_token=token)
    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ Login endpoint error: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/me", response_model=MeResponse)
async def me(current=Depends(get_current_user)):
    user, roles = current
    return MeResponse(
        user_id=str(user.user_id),
        email=user.email,
        full_name=user.full_name,
        roles=roles,
    )
