from pydantic import BaseModel, Field
from typing import Optional


class RegisterRequest(BaseModel):
    username: str = Field(min_length=3, max_length=64)
    password: str = Field(min_length=8, max_length=128)
    nickname: Optional[str] = Field(default=None, max_length=64)


class LoginRequest(BaseModel):
    username: str
    password: str


class RefreshRequest(BaseModel):
    refresh_token: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class UserResponse(BaseModel):
    id: str
    username: str
    is_admin: bool
    nickname: Optional[str] = None
    avatar_data: Optional[str] = None


class UpdateProfileRequest(BaseModel):
    nickname: Optional[str] = Field(default=None, max_length=64)
    avatar_data: Optional[str] = None  # base64 data URL
