from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_db
from app.core.security import get_current_user, get_current_user_unchecked
from app.models.user import User
from app.schemas.auth import (
    AccountLoginRequest,
    ChangePasswordRequest,
    LoginResponse,
    OAuthCallbackRequest,
    RefreshTokenRequest,
    TokenResponse,
    UserInfo,
)
from app.schemas.common import ApiResponse
from app.services import auth_service

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/oauth/callback", response_model=ApiResponse[LoginResponse])
async def oauth_callback(body: OAuthCallbackRequest, db: AsyncSession = Depends(get_db)):
    result = await auth_service.oauth_login(
        body.provider, body.code, db,
        redirect_uri=body.redirect_uri, client_id=body.client_id,
    )
    return ApiResponse(data=result)


@router.post("/login", response_model=ApiResponse[LoginResponse])
async def login(body: AccountLoginRequest, db: AsyncSession = Depends(get_db)):
    result = await auth_service.login_with_account(body.account, body.password, db)
    return ApiResponse(data=result)


@router.post("/refresh", response_model=ApiResponse[TokenResponse])
async def refresh(body: RefreshTokenRequest, db: AsyncSession = Depends(get_db)):
    result = await auth_service.refresh_tokens(body.refresh_token, db)
    return ApiResponse(data=result)


@router.get("/me", response_model=ApiResponse[UserInfo])
async def get_me(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await auth_service.get_user_info(user, db)
    return ApiResponse(data=result)


@router.post("/change-password", response_model=ApiResponse)
async def change_password(
    body: ChangePasswordRequest,
    user: User = Depends(get_current_user_unchecked),
    db: AsyncSession = Depends(get_db),
):
    await auth_service.change_password(user.id, body.old_password, body.new_password, db)
    return ApiResponse(message="密码修改成功")
