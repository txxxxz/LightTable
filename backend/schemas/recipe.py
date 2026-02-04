from pydantic import BaseModel


class Recipe(BaseModel):
    id: str
    name: str
    ingredients: list[str]
    steps: list[str]
    tags: list[str]
    time_minutes: int | None = None


class RecipeHit(BaseModel):
    """检索命中的食谱，含相关度分数"""
    recipe_id: str
    title: str
    snippet: str
    tags: list[str]
    time_minutes: int | None = None
    score: float
    matched_ingredients: list[str] = []
