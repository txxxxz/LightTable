"""
用户设置与偏好 API 的请求/响应模型。
与前端 store 及 PRD 中的 GET/POST 格式对齐。
"""
from __future__ import annotations

from pydantic import BaseModel, Field

# ---------- 响应：GET /api/v1/user/profile ----------


class BodyProfileSchema(BaseModel):
    height: int = Field(..., description="身高 cm")
    weight: float = Field(..., description="体重 kg")
    goal: str = Field(..., description="fat_loss | maintain | muscle_gain")


class PreferencesSchema(BaseModel):
    dislikes: list[str] = Field(default_factory=list, description="忌口列表")
    level: str = Field(..., description="survival | home_cook | chef")


class SystemSchema(BaseModel):
    expiry_alert: bool = True
    debug_mode: bool = False


class UserProfileResponse(BaseModel):
    profile: BodyProfileSchema
    preferences: PreferencesSchema
    system: SystemSchema


# ---------- 请求：PATCH body / 或 POST preference/update ----------


class BodyProfileUpdate(BaseModel):
    height: int | None = None
    weight: float | None = None
    goal: str | None = None


class PreferenceUpdateRequest(BaseModel):
    """POST /api/v1/user/preference/update"""
    type: str = Field(..., description="dislikes | cooking_level")
    action: str | None = Field(None, description="add | remove | set，dislikes 时使用")
    value: str | list[str] | None = Field(None, description="单条如 'ginger' 或 level 如 'home_cook'")
