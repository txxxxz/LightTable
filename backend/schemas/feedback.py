from enum import Enum
from pydantic import BaseModel


class FeedbackSignal(str, Enum):
    like = "like"
    dislike = "dislike"
    goal_update = "goal_update"
    constraint_update = "constraint_update"


class FeedbackRequest(BaseModel):
    user_id: str
    recipe_id: str | None = None
    signal: FeedbackSignal
    note: str | None = None  # 用户备注，如 "喜欢辣一点"


class FeedbackResponse(BaseModel):
    ok: bool
    written_memories: list[str] = []
