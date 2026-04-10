from __future__ import annotations

from pydantic import BaseModel, Field


class BodyProfileSchema(BaseModel):
    height: int = Field(..., description="身高 cm")
    weight: float = Field(..., description="体重 kg")
    bmi: float | None = Field(None, description="BMI")
    goal: str = Field(..., description="fat_loss | maintain | muscle_gain")
    household_size: int = Field(2, description="家庭人数")
    time_budget_minutes: int = Field(20, description="工作日时间预算")
    purchase_frequency_per_week: int = Field(2, description="每周采购频率，范围 1-4")
    sport_type: str | None = Field(None, description="运动项目")
    training_days_per_week: int | None = Field(None, description="每周训练天数")
    training_intensity: str | None = Field(
        None,
        description="low | moderate | high | double_session",
    )
    competition_cycle: str | None = Field(
        None,
        description="base | build | taper | competition | recovery",
    )
    training_notes: str | None = Field(None, description="训练计划备注")


class PreferencesSchema(BaseModel):
    dislikes: list[str] = Field(default_factory=list)
    level: str = Field(..., description="survival | home_cook | chef")
    flavors: list[str] = Field(default_factory=list)
    cuisines: list[str] = Field(default_factory=list)
    methods: list[str] = Field(default_factory=list)
    health_constraints: list[str] = Field(default_factory=list)
    kitchen_tools: list[str] = Field(default_factory=list)


class SystemSchema(BaseModel):
    expiry_alert: bool = True
    debug_mode: bool = False


class UserProfileResponse(BaseModel):
    profile: BodyProfileSchema
    preferences: PreferencesSchema
    system: SystemSchema


class BodyProfileUpdate(BaseModel):
    height: int | None = None
    weight: float | None = None
    goal: str | None = None
    household_size: int | None = None
    time_budget_minutes: int | None = None
    purchase_frequency_per_week: int | None = None
    sport_type: str | None = None
    training_days_per_week: int | None = None
    training_intensity: str | None = None
    competition_cycle: str | None = None
    training_notes: str | None = None


class PreferenceUpdateRequest(BaseModel):
    type: str = Field(
        ...,
        description=(
            "dislikes | cooking_level | flavor_tags | cuisine_tags | method_tags "
            "| health_constraints | kitchen_tools"
        ),
    )
    action: str | None = Field(None, description="add | remove | set，dislikes 时使用")
    value: str | list[str] | None = Field(None)


class SystemUpdateRequest(BaseModel):
    expiry_alert: bool | None = None
    debug_mode: bool | None = None
