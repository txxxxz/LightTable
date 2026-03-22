from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from backend.database import (
    delete_inventory_item,
    get_generated_recipe,
    list_inventory,
    record_feedback_event,
    replace_shopping_list_items,
    update_inventory_item,
)
from backend.schemas.feedback import RecipeCompletionRequest
from backend.schemas.inventory import ShoppingListItem
from backend.schemas.recipe import RecipeDetail, VideoReference
from backend.services.ingredient_service import get_default_category, normalize_ingredient_name
from backend.services.knowledge_service import get_knowledge_service
from backend.services.video_reference_service import get_video_reference_service

router = APIRouter(prefix="/api/v1/recipe", tags=["recipe"])


@router.get("/{recipe_id}", response_model=RecipeDetail)
async def get_recipe(recipe_id: str, user_id: str = Query("default")) -> RecipeDetail:
    generated_recipe = get_generated_recipe(user_id, recipe_id)
    if generated_recipe is not None:
        recipe = RecipeDetail(**generated_recipe)
        video_reference = get_video_reference_service().get_video_reference(recipe.name)
        return RecipeDetail(
            **{
                **recipe.model_dump(),
                "video_reference": VideoReference(**video_reference.__dict__).model_dump(),
            }
        )

    knowledge = get_knowledge_service()
    base_recipe = knowledge.get_recipe_by_id(recipe_id)
    if base_recipe is None:
        raise HTTPException(status_code=404, detail="Recipe not found")
    inventory_tokens = [item["normalized_name"] for item in list_inventory(user_id)]
    video_reference = get_video_reference_service().get_video_reference(base_recipe.name)
    recipe = knowledge.get_recipe_by_id(
        recipe_id,
        inventory_tokens=inventory_tokens,
        video_reference=VideoReference(**video_reference.__dict__).model_dump(),
    )
    if recipe is None:
        raise HTTPException(status_code=404, detail="Recipe not found")
    return recipe


@router.get("/{recipe_id}/video-reference", response_model=VideoReference)
async def get_recipe_video_reference(recipe_id: str, user_id: str = Query("default")) -> VideoReference:
    knowledge = get_knowledge_service()
    recipe = knowledge.get_recipe_by_id(recipe_id)
    recipe_name = recipe.name if recipe is not None else None
    if recipe_name is None:
        generated_recipe = get_generated_recipe(user_id, recipe_id)
        if generated_recipe is not None:
            recipe_name = str(generated_recipe.get("name") or "")
    if not recipe_name:
        raise HTTPException(status_code=404, detail="Recipe not found")
    result = get_video_reference_service().get_video_reference(recipe_name)
    return VideoReference(**result.__dict__)


@router.post("/{recipe_id}/complete")
async def complete_recipe(recipe_id: str, request: RecipeCompletionRequest) -> dict:
    inventory = list_inventory(request.user_id)
    inventory_by_name = {item["normalized_name"]: item for item in inventory}
    generated_recipe = get_generated_recipe(request.user_id, recipe_id)
    if generated_recipe is not None:
        recipe = RecipeDetail(**generated_recipe)
    else:
        knowledge = get_knowledge_service()
        recipe = knowledge.get_recipe_by_id(recipe_id, inventory_tokens=list(inventory_by_name))
        if recipe is None:
            raise HTTPException(status_code=404, detail="Recipe not found")

    for matched_name in recipe.matched_inventory:
        normalized_matched_name = normalize_ingredient_name(matched_name)
        for item in inventory:
            if item["normalized_name"] != normalized_matched_name:
                continue
            if request.usage_mode == "all":
                delete_inventory_item(request.user_id, item["id"])
            elif request.usage_mode == "half":
                update_inventory_item(request.user_id, item["id"], {"quantity_text": "约剩一半"})
            else:
                update_inventory_item(
                    request.user_id,
                    item["id"],
                    {"quantity_text": request.notes or "已按自定义扣减"},
                )
            break

    record_feedback_event(
        request.user_id,
        signal="complete",
        recipe_id=recipe_id,
        payload={
            "tags": recipe.tags + recipe.nutrition_tags,
            "difficulty": recipe.difficulty,
            "usage_mode": request.usage_mode,
            "notes": request.notes or "",
        },
    )

    shopping_candidates = [
        ShoppingListItem(
            id=f"shop_{ingredient}",
            display_name=ingredient,
            normalized_name=ingredient,
            category=get_default_category(ingredient),
            reason=f"{recipe.name} 缺少或消耗了 {ingredient}",
            priority="optional",
            source="recipe_completion",
            checked=False,
        )
        for ingredient in recipe.missing_ingredients[:3]
    ]
    replace_shopping_list_items(
        request.user_id,
        [candidate.model_dump() for candidate in shopping_candidates],
    )

    return {
        "ok": True,
        "message": "库存已更新",
        "shopping_suggestions": [candidate.model_dump() for candidate in shopping_candidates],
    }
