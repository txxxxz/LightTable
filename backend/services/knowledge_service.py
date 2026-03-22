from __future__ import annotations

import json
from functools import lru_cache

from backend.core.config import RECIPES_JSON
from backend.schemas.recipe import RecipeDetail, RecipeHit
from backend.services.ingredient_service import (
    get_default_display_name,
    normalize_ingredient_name,
)


def normalize_ingredient(name: str) -> str:
    return normalize_ingredient_name(name)


def _load_recipes() -> list[dict]:
    if not RECIPES_JSON.exists():
        return []
    with open(RECIPES_JSON, "r", encoding="utf-8") as file:
        return json.load(file)


class KnowledgeService:
    def __init__(self) -> None:
        self._recipes = _load_recipes()

    @property
    def recipes(self) -> list[dict]:
        if not self._recipes:
            self._recipes = _load_recipes()
        return self._recipes

    def get_recipe_by_id(
        self,
        recipe_id: str,
        *,
        inventory_tokens: list[str] | None = None,
        video_reference: dict | None = None,
    ) -> RecipeDetail | None:
        inventory_set = set(inventory_tokens or [])
        for recipe in self.recipes:
            if recipe["id"] != recipe_id:
                continue
            core_tokens = [normalize_ingredient_name(item) for item in recipe.get("core_ingredients", [])]
            matched = [get_default_display_name(token, token) for token in core_tokens if token in inventory_set]
            missing = [get_default_display_name(token, token) for token in core_tokens if token not in inventory_set]
            return RecipeDetail(
                id=recipe["id"],
                name=recipe["name"],
                ingredients=recipe["ingredients"],
                core_ingredients=recipe.get("core_ingredients", []),
                optional_ingredients=recipe.get("optional_ingredients", []),
                steps=recipe["steps"],
                tags=recipe.get("tags", []),
                time_minutes=recipe.get("time_minutes"),
                difficulty=recipe.get("difficulty", "B"),
                nutrition_tags=recipe.get("nutrition_tags", []),
                allergen_tags=recipe.get("allergen_tags", []),
                constraint_tags=recipe.get("constraint_tags", []),
                matched_inventory=matched,
                missing_ingredients=missing,
                video_reference=video_reference,
            )
        return None

    def list_candidate_hits(
        self,
        *,
        inventory_tokens: list[str],
        constraints: list[str],
        goal: str,
        explicit_tags: list[str],
        time_budget_minutes: int,
        preference_weights: dict[str, float],
        recent_recipe_ids: set[str],
    ) -> list[RecipeHit]:
        hits: list[RecipeHit] = []
        inventory_set = set(inventory_tokens)
        for recipe in self.recipes:
            core_tokens = [normalize_ingredient_name(item) for item in recipe.get("core_ingredients", [])]
            optional_tokens = [normalize_ingredient_name(item) for item in recipe.get("optional_ingredients", [])]
            matched = [token for token in core_tokens if token in inventory_set]
            missing = [token for token in core_tokens if token not in inventory_set]
            fit_tags = self._fit_tags(recipe, constraints, goal, explicit_tags)
            if not self._passes_constraints(recipe, constraints):
                continue
            if inventory_tokens and not matched and len(missing) == len(core_tokens):
                continue

            score = 0.0
            expiring_tokens = set(explicit_tags)
            score += len(matched) * 4.0
            score -= len(missing) * 2.5
            score += len(fit_tags) * 2.0

            if recipe.get("time_minutes") and recipe["time_minutes"] <= time_budget_minutes:
                score += 2.0
            if "快手菜" in explicit_tags and recipe.get("difficulty") == "A":
                score += 2.5
            if "减脂" in explicit_tags and "low_sugar" in recipe.get("nutrition_tags", []):
                score += 1.5
            if recipe["id"] in recent_recipe_ids:
                score -= 3.0
            if expiring_tokens & set(core_tokens):
                score += 1.0

            for key, weight in preference_weights.items():
                if key == f"recipe::{recipe['id']}":
                    score += weight
                    continue
                if key in recipe.get("tags", []) or key in recipe.get("nutrition_tags", []):
                    score += weight
                if key == recipe.get("difficulty"):
                    score += weight

            hits.append(
                RecipeHit(
                    recipe_id=recipe["id"],
                    title=recipe["name"],
                    tags=recipe.get("tags", []),
                    difficulty=recipe.get("difficulty", "B"),
                    time_minutes=recipe.get("time_minutes"),
                    matched_ingredients=[get_default_display_name(token, token) for token in matched],
                    missing_ingredients=[
                        get_default_display_name(token, token)
                        for token in missing or optional_tokens[:1]
                    ],
                    fit_tags=fit_tags,
                    score=round(score, 2),
                )
            )
        hits.sort(key=lambda hit: hit.score, reverse=True)
        return hits

    def _passes_constraints(self, recipe: dict, constraints: list[str]) -> bool:
        recipe_constraints = set(recipe.get("constraint_tags", []))
        nutrition_tags = set(recipe.get("nutrition_tags", []))
        allergen_tags = set(recipe.get("allergen_tags", []))

        if "vegetarian" in constraints and "vegetarian" not in recipe_constraints:
            return False
        if "gluten_free" in constraints and "gluten" in allergen_tags:
            return False
        if "dairy_free" in constraints and "dairy" in allergen_tags:
            return False
        if "nut_free" in constraints and "nuts" in allergen_tags:
            return False
        if "diabetes_friendly" in constraints and "diabetes_friendly" not in recipe_constraints:
            return False
        if "low_sugar" in constraints and "low_sugar" not in nutrition_tags:
            return False
        if "low_sodium" in constraints and "low_sodium" not in nutrition_tags:
            return False
        if "high_protein" in constraints and "high_protein" not in nutrition_tags:
            return False
        return True

    def _fit_tags(self, recipe: dict, constraints: list[str], goal: str, explicit_tags: list[str]) -> list[str]:
        fit: list[str] = []
        nutrition_tags = set(recipe.get("nutrition_tags", []))
        recipe_constraints = set(recipe.get("constraint_tags", []))
        if goal == "fat_loss" and {"high_protein", "low_sugar"} & nutrition_tags:
            fit.append("减脂友好")
        if goal == "muscle_gain" and "high_protein" in nutrition_tags:
            fit.append("高蛋白")
        if "quick" in explicit_tags or "快手菜" in explicit_tags or recipe.get("difficulty") == "A":
            fit.append("快手")
        if "消耗临期" in explicit_tags:
            fit.append("优先消耗库存")
        if "gluten_free" in constraints and "gluten_free" in recipe_constraints:
            fit.append("无麸质")
        if "diabetes_friendly" in constraints and "diabetes_friendly" in recipe_constraints:
            fit.append("控糖友好")
        return fit


@lru_cache(maxsize=1)
def get_knowledge_service() -> KnowledgeService:
    return KnowledgeService()
