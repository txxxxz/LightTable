"""
用户设置与偏好 API。
- 数据源：SQLite (database.py)
- 更新偏好时同步写入 Mem0，供 Agent 回忆
"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException

from backend.core.config import DEFAULT_USER_ID
from backend.database import (
    get_profile,
    update_body_profile,
    update_preferences,
    get_dislikes,
)
from backend.schemas.user import (
    UserProfileResponse,
    BodyProfileSchema,
    PreferencesSchema,
    SystemSchema,
    BodyProfileUpdate,
    PreferenceUpdateRequest,
)
from backend.services.memory_service import get_memory_service

router = APIRouter(prefix="/api/v1/user", tags=["user"])


@router.get("/profile", response_model=UserProfileResponse)
def get_user_profile(user_id: str = DEFAULT_USER_ID):
    """
    获取当前用户的完整设置（身体档案、偏好、系统）。
    前端 Settings 页加载时调用。
    """
    data = get_profile(user_id)
    if data is None:
        raise HTTPException(status_code=404, detail="User not found")
    return UserProfileResponse(
        profile=BodyProfileSchema(**data["profile"]),
        preferences=PreferencesSchema(**data["preferences"]),
        system=SystemSchema(**data["system"]),
    )


@router.patch("/profile")
def patch_body_profile(
    body: BodyProfileUpdate,
    user_id: str = DEFAULT_USER_ID,
):
    """更新身体档案（身高、体重、目标）。"""
    ok = update_body_profile(
        user_id,
        height=body.height,
        weight=body.weight,
        goal=body.goal,
    )
    if not ok:
        raise HTTPException(status_code=404, detail="User not found")

    # 可选：把目标同步到 Mem0，方便 Agent 回忆
    if body.goal is not None:
        goal_text = {"fat_loss": "减脂", "maintain": "维持", "muscle_gain": "增肌"}.get(body.goal, body.goal)
        get_memory_service().add_memory(user_id, f"User goal: {goal_text}")

    return {"ok": True}


@router.post("/preference/update")
def preference_update(
    request: PreferenceUpdateRequest,
    user_id: str = DEFAULT_USER_ID,
):
    """
    更新偏好（忌口 / 厨艺水平）。
    忌口变更会同步到 Mem0；厨艺水平仅写 DB。
    """
    if request.type == "dislikes":
        if request.action is None or request.value is None:
            raise HTTPException(status_code=400, detail="dislikes need action and value")
        current = get_dislikes(user_id)
        if request.action == "add":
            if isinstance(request.value, list):
                new_list = list(current)
                for v in request.value:
                    if v and v not in new_list:
                        new_list.append(v)
            else:
                v = str(request.value).strip()
                if v and v not in current:
                    new_list = current + [v]
                else:
                    new_list = current
            update_preferences(user_id, dislikes=new_list)
            # 同步 Mem0
            mem = get_memory_service()
            if isinstance(request.value, list):
                for v in request.value:
                    if v:
                        mem.add_memory(user_id, f"User dislikes {v}")
            else:
                get_memory_service().add_memory(user_id, f"User dislikes {request.value}")
        elif request.action == "remove":
            v = str(request.value).strip()
            new_list = [x for x in current if x != v]
            update_preferences(user_id, dislikes=new_list)
            # Mem0 无删除 API 时仅从 DB 删除；若 Mem0 支持删除可在此调用
        elif request.action == "set":
            new_list = request.value if isinstance(request.value, list) else [str(request.value)]
            update_preferences(user_id, dislikes=new_list)
        else:
            raise HTTPException(status_code=400, detail="action must be add | remove | set")
        return {"ok": True, "message": "已记入大脑"}

    if request.type == "cooking_level":
        level = request.value if isinstance(request.value, str) else None
        if not level or level not in ("survival", "home_cook", "chef"):
            raise HTTPException(status_code=400, detail="cooking_level need value in survival|home_cook|chef")
        update_preferences(user_id, cooking_level=level)
        level_cn = {"survival": "生存", "home_cook": "家常", "chef": "大厨"}.get(level, level)
        get_memory_service().add_memory(user_id, f"User cooking level: {level_cn}")
        return {"ok": True}

    raise HTTPException(status_code=400, detail="type must be dislikes | cooking_level")
