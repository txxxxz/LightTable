from __future__ import annotations

from fastapi import APIRouter, Depends

from backend.core.config import RATE_LIMIT_RECOMMEND_PER_HOUR
from backend.core.rate_limit import rate_limit
from backend.database import record_feedback_event
from backend.schemas.feedback import FeedbackRequest, FeedbackResponse
from backend.schemas.recommend import RecommendRequest, RecommendResponse
from backend.services.memory_service import get_memory_service
from backend.services.orchestrator import recommend as do_recommend

router = APIRouter(prefix="/api/v1", tags=["recommend"])
recommend_rate_limit = rate_limit(
    "recommend",
    limit=RATE_LIMIT_RECOMMEND_PER_HOUR,
    window_seconds=3600,
)


@router.post(
    "/recommend",
    response_model=RecommendResponse,
    dependencies=[Depends(recommend_rate_limit)],
)
async def recommend_endpoint(request: RecommendRequest) -> RecommendResponse:
    return await do_recommend(request)


@router.post("/feedback", response_model=FeedbackResponse)
async def feedback_endpoint(request: FeedbackRequest) -> FeedbackResponse:
    payload = request.payload or {}
    if request.tags:
        payload["tags"] = request.tags
    if request.note:
        payload["note"] = request.note

    record_feedback_event(
        request.user_id,
        signal=request.signal.value,
        recipe_id=request.recipe_id,
        payload=payload,
    )

    memory_svc = get_memory_service()
    written: list[str] = []
    if request.signal.value in {"like", "start", "complete"} and request.note:
        text = f"User prefers {request.note}"
        if memory_svc.add_memory(request.user_id, text):
            written.append(text)
    if request.signal.value in {"dislike", "constraint_update"} and request.note:
        text = f"User avoids {request.note}"
        if memory_svc.add_memory(request.user_id, text):
            written.append(text)
    if request.signal.value == "goal_update" and request.note:
        text = f"User goal: {request.note}"
        if memory_svc.add_memory(request.user_id, text):
            written.append(text)

    return FeedbackResponse(ok=True, written_memories=written)
