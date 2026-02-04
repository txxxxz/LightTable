from pydantic import BaseModel
from .recipe import RecipeHit


class RecommendRequest(BaseModel):
    user_id: str
    inventory: list[str]  # 食材名列表
    tags: list[str] = []  # 用户选择的标签：消耗临期、减脂、快手菜等
    context: dict | None = None  # 可选：day_type, time_budget_minutes


class RecipePlan(BaseModel):
    recipe_id: str
    name: str
    matched_ingredients: list[str]
    time_minutes: int | None
    reason: str


class RecommendResponse(BaseModel):
    request_id: str
    profile_summary: str
    refined_query: str
    plans: list[RecipePlan]
    retrieval: list[RecipeHit]
