from __future__ import annotations

import asyncio
import uuid
from datetime import datetime, timedelta

from backend.database import (
    get_profile,
    list_feedback_events,
    list_inventory,
    list_recent_recommendations,
    record_recommendation,
    replace_shopping_list_items,
)
from backend.schemas.inventory import ShoppingListItem
from backend.schemas.recommend import PlanDish, RecommendationPlan, RecommendRequest, RecommendResponse
from backend.schemas.recipe import RecipeHit
from backend.services.ingredient_service import (
    ensure_category_key,
    get_default_category,
    get_default_display_name,
    normalize_ingredient_name,
    suggest_recommended_quantity_text,
)
from backend.services.knowledge_service import get_knowledge_service
from backend.services.llm_service import chat, is_configured as llm_is_configured


def _summarize_profile(profile: dict) -> tuple[str, list[str]]:
    body = profile["profile"]
    preferences = profile["preferences"]
    summary_parts = [
        f"目标：{body['goal']}",
        f"人数：{body['household_size']}",
        f"工作日预算：{body['time_budget_minutes']} 分钟",
        f"每周采购：{body.get('purchase_frequency_per_week', 2)} 次",
    ]
    if preferences["dislikes"]:
        summary_parts.append(f"忌口：{', '.join(preferences['dislikes'])}")
    if preferences["health_constraints"]:
        summary_parts.append(f"特殊约束：{', '.join(preferences['health_constraints'])}")
    if preferences["flavors"]:
        summary_parts.append(f"口味偏好：{', '.join(preferences['flavors'])}")
    return "；".join(summary_parts), preferences["health_constraints"]


def _recent_recipe_ids(user_id: str) -> set[str]:
    recent_ids: set[str] = set()
    threshold = datetime.utcnow() - timedelta(days=3)
    for record in list_recent_recommendations(user_id, limit=12):
        created_at = datetime.fromisoformat(record["created_at"].replace("Z", "+00:00")).replace(tzinfo=None)
        if created_at < threshold:
            continue
        for plan in record.get("plan_payload", {}).get("plans", []):
            for dish in plan.get("dishes", []):
                if dish.get("recipe_id"):
                    recent_ids.add(dish["recipe_id"])
    return recent_ids


def _preference_weights(user_id: str) -> dict[str, float]:
    weights: dict[str, float] = {}
    signal_weight = {
        "view": 0.4,
        "start": 1.5,
        "complete": 4.0,
        "like": 2.0,
        "skip": -1.0,
        "dislike": -2.0,
    }
    for event in list_feedback_events(user_id, limit=80):
        payload = event.get("payload") or {}
        if event.get("recipe_id"):
            key = f"recipe::{event['recipe_id']}"
            weights[key] = weights.get(key, 0.0) + signal_weight.get(event["signal"], 0.0) * 1.5
        for tag in payload.get("tags", []):
            weights[tag] = weights.get(tag, 0.0) + signal_weight.get(event["signal"], 0.0)
        difficulty = payload.get("difficulty")
        if difficulty:
            weights[difficulty] = weights.get(difficulty, 0.0) + signal_weight.get(event["signal"], 0.0)
    return weights


def _build_shopping_suggestions(
    hits: list[RecipeHit],
    *,
    inventory_empty: bool,
    household_size: int,
    purchase_frequency_per_week: int,
) -> list[ShoppingListItem]:
    ingredient_hits: dict[str, dict[str, object]] = {}
    for hit in hits[:5]:
        for ingredient in hit.missing_ingredients:
            normalized_name = normalize_ingredient_name(ingredient)
            slot = ingredient_hits.setdefault(
                normalized_name,
                {
                    "display_name": get_default_display_name(normalized_name, ingredient),
                    "count": 0,
                },
            )
            slot["count"] = int(slot["count"]) + 1
    if inventory_empty and not ingredient_hits:
        defaults = [
            ("鸡蛋", "备一点高通用蛋白质"),
            ("西兰花", "适合快手和健康搭配"),
            ("豆腐", "做汤和快炒都方便"),
        ]
        for name, reason in defaults:
            normalized_name = normalize_ingredient_name(name)
            ingredient_hits[normalized_name] = {
                "display_name": name,
                "count": 1,
                "reason": reason,
            }

    suggestions: dict[str, ShoppingListItem] = {}
    for normalized_name, payload in ingredient_hits.items():
        display_name = str(payload["display_name"])
        count = int(payload["count"])
        category = ensure_category_key(get_default_category(normalized_name, display_name), raw_name=display_name)
        suggestions[normalized_name] = ShoppingListItem(
            id=f"shop_{normalized_name}",
            display_name=display_name,
            normalized_name=normalized_name,
            category=category,
            quantity_text="",
            recommended_quantity_text=suggest_recommended_quantity_text(
                normalized_name=normalized_name,
                display_name=display_name,
                category=category,
                missing_count=count,
                household_size=household_size,
                purchase_frequency_per_week=purchase_frequency_per_week,
            ),
            reason=str(payload.get("reason") or f"多道推荐菜缺少 {display_name}"),
            priority="must_buy" if inventory_empty or count > 1 else "optional",
            source="system",
            checked=False,
        )
    return list(suggestions.values())


async def _render_reason(
    *,
    profile_summary: str,
    hit: RecipeHit,
    plan_label: str,
) -> str:
    if not llm_is_configured():
        fits = f"，适合 {', '.join(hit.fit_tags)}" if hit.fit_tags else ""
        missing = f"，仅需补 {', '.join(hit.missing_ingredients)}" if hit.missing_ingredients else ""
        return f"{plan_label}方案优先消耗 {', '.join(hit.matched_ingredients) or '现有库存'}{fits}{missing}。"

    prompt = (
        "你是 LightTable 的饮食规划助手。"
        "请用一句简短中文解释为什么这道菜适合当前用户。"
        "要提到库存命中、特殊约束或时间/目标匹配。"
        "不要超过 36 个字。"
    )
    user_message = (
        f"用户画像：{profile_summary}\n"
        f"方案：{plan_label}\n"
        f"菜名：{hit.title}\n"
        f"命中食材：{', '.join(hit.matched_ingredients) or '无'}\n"
        f"缺失食材：{', '.join(hit.missing_ingredients) or '无'}\n"
        f"匹配标签：{', '.join(hit.fit_tags) or '无'}"
    )
    try:
        reply = await asyncio.wait_for(
            chat(
                [
                    {"role": "system", "content": prompt},
                    {"role": "user", "content": user_message},
                ]
            ),
            timeout=2.5,
        )
        reply = reply.strip()
        return reply or f"{plan_label}方案适合当前库存和约束。"
    except Exception:
        return f"{plan_label}方案适合当前库存和约束。"


async def recommend(request: RecommendRequest) -> RecommendResponse:
    request_id = f"req_{uuid.uuid4().hex[:8]}"
    inventory_items = list_inventory(request.user_id)
    inventory_tokens = [item["normalized_name"] for item in inventory_items]
    profile = get_profile(request.user_id)

    if profile is None:
        raise ValueError("User profile not found")

    profile_summary, health_constraints = _summarize_profile(profile)
    household_size = int(profile["profile"].get("household_size") or 1)
    purchase_frequency_per_week = int(profile["profile"].get("purchase_frequency_per_week") or 2)
    time_budget = int(
        (request.context or {}).get("time_budget_minutes")
        or profile["profile"]["time_budget_minutes"]
        or 20
    )
    preference_weights = _preference_weights(request.user_id)
    recent_recipe_ids = _recent_recipe_ids(request.user_id)

    knowledge = get_knowledge_service()
    hits = knowledge.list_candidate_hits(
        inventory_tokens=inventory_tokens,
        constraints=health_constraints,
        goal=profile["profile"]["goal"],
        explicit_tags=request.tags,
        time_budget_minutes=time_budget,
        preference_weights=preference_weights,
        recent_recipe_ids=recent_recipe_ids,
    )

    plan_map = {"A": "极简", "B": "标准", "C": "进阶"}
    plans: list[RecommendationPlan] = []
    selected_difficulties: set[str] = set()
    for target_difficulty in ("A", "B", "C"):
        hit = next((candidate for candidate in hits if candidate.difficulty == target_difficulty), None)
        if hit is None:
            continue
        selected_difficulties.add(hit.difficulty)
        label = plan_map[target_difficulty]
        reason = await _render_reason(profile_summary=profile_summary, hit=hit, plan_label=label)
        plans.append(
            RecommendationPlan(
                plan_id=target_difficulty,
                label=label,
                dishes=[PlanDish(recipe_id=hit.recipe_id, title=hit.title)],
                matched_inventory=hit.matched_ingredients,
                missing_ingredients=hit.missing_ingredients,
                time_minutes=hit.time_minutes,
                difficulty=hit.difficulty,
                fit_tags=hit.fit_tags,
                reason=reason,
            )
        )

    if len(plans) < 2:
        for hit in hits:
            if hit.difficulty in selected_difficulties:
                continue
            label = plan_map.get(hit.difficulty, "补充")
            reason = await _render_reason(profile_summary=profile_summary, hit=hit, plan_label=label)
            plans.append(
                RecommendationPlan(
                    plan_id=hit.difficulty,
                    label=label,
                    dishes=[PlanDish(recipe_id=hit.recipe_id, title=hit.title)],
                    matched_inventory=hit.matched_ingredients,
                    missing_ingredients=hit.missing_ingredients,
                    time_minutes=hit.time_minutes,
                    difficulty=hit.difficulty,
                    fit_tags=hit.fit_tags,
                    reason=reason,
                )
            )
            if len(plans) >= 3:
                break

    inventory_empty = not inventory_items
    shopping_suggestions = _build_shopping_suggestions(
        hits,
        inventory_empty=inventory_empty,
        household_size=household_size,
        purchase_frequency_per_week=purchase_frequency_per_week,
    )
    replace_shopping_list_items(
        request.user_id,
        [
            {
                "id": item.id,
                "display_name": item.display_name,
                "normalized_name": item.normalized_name,
                "category": item.category,
                "quantity_text": item.quantity_text,
                "recommended_quantity_text": item.recommended_quantity_text,
                "reason": item.reason,
                "priority": item.priority,
                "source": item.source,
                "checked": item.checked,
            }
            for item in shopping_suggestions
        ],
    )

    record_recommendation(
        request.user_id,
        {
            "request_id": request_id,
            "plans": [plan.model_dump() for plan in plans],
            "tags": request.tags,
        },
    )

    strategy_parts = [
        "临期优先" if "消耗临期" in request.tags else "库存优先",
        "特殊约束已过滤" if health_constraints else "通用饮食规则",
        f"时间预算 {time_budget} 分钟",
    ]

    return RecommendResponse(
        request_id=request_id,
        profile_summary=profile_summary,
        strategy_summary="，".join(strategy_parts),
        plans=plans,
        shopping_suggestions=shopping_suggestions,
        debug_retrieval=hits[:8],
    )
