"""
推荐相关 API
"""
from fastapi import APIRouter

from backend.schemas.recommend import RecommendRequest, RecommendResponse
from backend.schemas.feedback import FeedbackRequest, FeedbackResponse
from backend.services.orchestrator import recommend as do_recommend
from backend.services.memory_service import get_memory_service

router = APIRouter(prefix="/api/v1", tags=["recommend"])


@router.post("/recommend", response_model=RecommendResponse)
async def recommend_endpoint(request: RecommendRequest) -> RecommendResponse:
    """
    触发完整推荐流程：Input → Recall → Refine → Retrieve → Generate
    """
    return await do_recommend(request)


@router.post("/feedback", response_model=FeedbackResponse)
async def feedback_endpoint(request: FeedbackRequest) -> FeedbackResponse:
    """
    用户反馈：喜欢/不喜欢某道菜、更新目标/约束 → 写入 Mem0
    """
    memory_svc = get_memory_service()
    written: list[str] = []

    if request.signal.value == "like":
        text = f"User likes dish {request.recipe_id or 'unknown'}"
        if request.note:
            text = f"User likes: {request.note}"
        if memory_svc.add_memory(request.user_id, text):
            written.append(text)

    elif request.signal.value == "dislike":
        text = f"User dislikes dish {request.recipe_id or 'unknown'}"
        if request.note:
            text = f"User dislikes: {request.note}"
        if memory_svc.add_memory(request.user_id, text):
            written.append(text)

    elif request.signal.value == "goal_update":
        if request.note:
            text = f"User goal: {request.note}"
            if memory_svc.add_memory(request.user_id, text):
                written.append(text)

    elif request.signal.value == "constraint_update":
        if request.note:
            text = f"User constraint: {request.note}"
            if memory_svc.add_memory(request.user_id, text):
                written.append(text)

    return FeedbackResponse(ok=True, written_memories=written)
