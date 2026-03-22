from __future__ import annotations

from fastapi import APIRouter, HTTPException

from backend.core.config import DEFAULT_USER_ID
from backend.database import (
    get_dislikes,
    get_profile,
    update_body_profile,
    update_preferences,
    update_system,
)
from backend.schemas.user import (
    BodyProfileSchema,
    BodyProfileUpdate,
    PreferenceUpdateRequest,
    PreferencesSchema,
    SystemSchema,
    SystemUpdateRequest,
    UserProfileResponse,
)
from backend.services.memory_service import get_memory_service

router = APIRouter(prefix="/api/v1/user", tags=["user"])


@router.get("/profile", response_model=UserProfileResponse)
def get_user_profile(user_id: str = DEFAULT_USER_ID):
    data = get_profile(user_id)
    if data is None:
        raise HTTPException(status_code=404, detail="User not found")
    return UserProfileResponse(
        profile=BodyProfileSchema(**data["profile"]),
        preferences=PreferencesSchema(**data["preferences"]),
        system=SystemSchema(**data["system"]),
    )


@router.patch("/profile")
def patch_body_profile(body: BodyProfileUpdate, user_id: str = DEFAULT_USER_ID):
    ok = update_body_profile(
        user_id,
        height=body.height,
        weight=body.weight,
        goal=body.goal,
        household_size=body.household_size,
        time_budget_minutes=body.time_budget_minutes,
        purchase_frequency_per_week=body.purchase_frequency_per_week,
    )
    if not ok:
        raise HTTPException(status_code=404, detail="User not found")

    if body.goal is not None:
        goal_text = {"fat_loss": "减脂", "maintain": "维持", "muscle_gain": "增肌"}.get(body.goal, body.goal)
        get_memory_service().add_memory(user_id, f"User goal: {goal_text}")

    return {"ok": True}


@router.patch("/system")
def patch_system_settings(body: SystemUpdateRequest, user_id: str = DEFAULT_USER_ID):
    ok = update_system(user_id, expiry_alert=body.expiry_alert, debug_mode=body.debug_mode)
    if not ok:
        raise HTTPException(status_code=404, detail="User not found")
    return {"ok": True}


@router.post("/preference/update")
def preference_update(request: PreferenceUpdateRequest, user_id: str = DEFAULT_USER_ID):
    memory = get_memory_service()

    if request.type == "dislikes":
        if request.action is None or request.value is None:
            raise HTTPException(status_code=400, detail="dislikes need action and value")
        current = get_dislikes(user_id)
        if request.action == "add":
            values = request.value if isinstance(request.value, list) else [str(request.value)]
            next_values = list(dict.fromkeys(current + [value for value in values if value]))
            update_preferences(user_id, dislikes=next_values)
            for value in values:
                if value:
                    memory.add_memory(user_id, f"User dislikes {value}")
        elif request.action == "remove":
            value = str(request.value)
            update_preferences(user_id, dislikes=[item for item in current if item != value])
        elif request.action == "set":
            values = request.value if isinstance(request.value, list) else [str(request.value)]
            update_preferences(user_id, dislikes=[value for value in values if value])
        else:
            raise HTTPException(status_code=400, detail="action must be add | remove | set")
        return {"ok": True, "message": "已记入大脑"}

    if request.type == "cooking_level":
        level = request.value if isinstance(request.value, str) else None
        if level not in {"survival", "home_cook", "chef"}:
            raise HTTPException(status_code=400, detail="invalid cooking level")
        update_preferences(user_id, cooking_level=level)
        memory.add_memory(user_id, f"User cooking level: {level}")
        return {"ok": True}

    tag_fields = {
        "flavor_tags": "flavor_tags",
        "cuisine_tags": "cuisine_tags",
        "method_tags": "method_tags",
        "health_constraints": "health_constraints",
        "kitchen_tools": "kitchen_tools",
    }
    if request.type in tag_fields:
        values = request.value if isinstance(request.value, list) else ([str(request.value)] if request.value else [])
        kwargs = {tag_fields[request.type]: [value for value in values if value]}
        update_preferences(user_id, **kwargs)
        if values:
            memory.add_memory(user_id, f"User {request.type}: {', '.join(values)}")
        return {"ok": True}

    raise HTTPException(status_code=400, detail="Unsupported preference type")
