from __future__ import annotations

from pydantic import BaseModel, Field

from .inventory import ShoppingListItem
from .recipe import RecipeHit


class RecommendRequest(BaseModel):
    user_id: str
    tags: list[str] = Field(default_factory=list)
    context: dict | None = None


class PlanDish(BaseModel):
    recipe_id: str
    title: str


class RecommendationPlan(BaseModel):
    plan_id: str
    label: str
    dishes: list[PlanDish]
    matched_inventory: list[str] = Field(default_factory=list)
    missing_ingredients: list[str] = Field(default_factory=list)
    time_minutes: int | None = None
    difficulty: str
    fit_tags: list[str] = Field(default_factory=list)
    reason: str


class RecommendResponse(BaseModel):
    request_id: str
    profile_summary: str
    strategy_summary: str
    plans: list[RecommendationPlan]
    shopping_suggestions: list[ShoppingListItem] = Field(default_factory=list)
    debug_retrieval: list[RecipeHit] = Field(default_factory=list)
