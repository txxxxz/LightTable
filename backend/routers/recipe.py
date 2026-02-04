"""
食谱相关 API
"""
from fastapi import APIRouter, HTTPException

from backend.services.knowledge_service import get_knowledge_service

router = APIRouter(prefix="/api/v1/recipe", tags=["recipe"])


@router.get("/{recipe_id}")
async def get_recipe(recipe_id: str) -> dict:
    """获取食谱详情"""
    knowledge_svc = get_knowledge_service()
    recipe = knowledge_svc.get_recipe_by_id(recipe_id)
    if not recipe:
        raise HTTPException(status_code=404, detail="Recipe not found")
    return recipe
