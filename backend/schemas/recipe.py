from __future__ import annotations

from pydantic import BaseModel, Field


class RecipeHit(BaseModel):
    recipe_id: str
    title: str
    tags: list[str] = Field(default_factory=list)
    difficulty: str
    time_minutes: int | None = None
    matched_ingredients: list[str] = Field(default_factory=list)
    missing_ingredients: list[str] = Field(default_factory=list)
    fit_tags: list[str] = Field(default_factory=list)
    score: float = 0.0


class VideoReference(BaseModel):
    provider: str
    title: str
    url: str
    available: bool = True


class RecipeDetail(BaseModel):
    id: str
    name: str
    ingredients: list[str]
    core_ingredients: list[str] = Field(default_factory=list)
    optional_ingredients: list[str] = Field(default_factory=list)
    steps: list[str]
    tags: list[str] = Field(default_factory=list)
    time_minutes: int | None = None
    difficulty: str = "B"
    nutrition_tags: list[str] = Field(default_factory=list)
    allergen_tags: list[str] = Field(default_factory=list)
    constraint_tags: list[str] = Field(default_factory=list)
    matched_inventory: list[str] = Field(default_factory=list)
    missing_ingredients: list[str] = Field(default_factory=list)
    video_reference: VideoReference | None = None
