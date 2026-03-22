from __future__ import annotations

from enum import Enum

from pydantic import BaseModel, Field


class FeedbackSignal(str, Enum):
    view = "view"
    skip = "skip"
    start = "start"
    complete = "complete"
    like = "like"
    dislike = "dislike"
    goal_update = "goal_update"
    constraint_update = "constraint_update"


class FeedbackRequest(BaseModel):
    user_id: str
    recipe_id: str | None = None
    signal: FeedbackSignal
    note: str | None = None
    tags: list[str] = Field(default_factory=list)
    payload: dict | None = None


class FeedbackResponse(BaseModel):
    ok: bool
    written_memories: list[str] = Field(default_factory=list)


class RecipeCompletionRequest(BaseModel):
    user_id: str
    usage_mode: str = Field("all", description="all | half | custom")
    notes: str | None = None
