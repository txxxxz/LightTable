from __future__ import annotations

import asyncio
import json
import logging
import re
import uuid
from datetime import date, datetime, timedelta

from backend.core.config import OPENROUTER_RECIPE_MODEL, OPENROUTER_RECIPE_TIMEOUT_SECONDS
from backend.database import (
    get_profile,
    list_feedback_events,
    list_inventory,
    list_recent_recommendations,
    record_recommendation,
    replace_shopping_list_items,
)
from backend.schemas.inventory import ShoppingListItem
from backend.schemas.recommend import (
    PlanDish,
    RecommendationPlan,
    RecommendRequest,
    RecommendResponse,
    WeeklyPlanDay,
    WeeklyRecommendResponse,
)
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

logger = logging.getLogger(__name__)


def _build_athlete_context(profile: dict) -> dict[str, object]:
    body = profile["profile"]
    return {
        "sport_type": (body.get("sport_type") or "").strip(),
        "training_days_per_week": int(body.get("training_days_per_week") or 0),
        "training_intensity": (body.get("training_intensity") or "").strip(),
        "competition_cycle": (body.get("competition_cycle") or "").strip(),
        "training_notes": (body.get("training_notes") or "").strip(),
    }


def _summarize_profile(profile: dict) -> tuple[str, list[str], list[str]]:
    body = profile["profile"]
    preferences = profile["preferences"]
    athlete_context = _build_athlete_context(profile)
    summary_parts = [
        f"目标：{body['goal']}",
        f"人数：{body['household_size']}",
        f"工作日预算：{body['time_budget_minutes']} 分钟",
        f"每周采购：{body.get('purchase_frequency_per_week', 2)} 次",
    ]
    if body.get("bmi") is not None:
        summary_parts.append(f"BMI：{body['bmi']}")
    if athlete_context["sport_type"]:
        summary_parts.append(f"项目：{athlete_context['sport_type']}")
    if athlete_context["training_days_per_week"]:
        summary_parts.append(f"训练频次：每周 {athlete_context['training_days_per_week']} 天")
    if athlete_context["training_intensity"]:
        summary_parts.append(f"训练强度：{athlete_context['training_intensity']}")
    if athlete_context["competition_cycle"]:
        summary_parts.append(f"赛事周期：{athlete_context['competition_cycle']}")
    if athlete_context["training_notes"]:
        summary_parts.append(f"训练备注：{athlete_context['training_notes']}")
    if preferences["dislikes"]:
        summary_parts.append(f"忌口：{', '.join(preferences['dislikes'])}")
    if preferences["health_constraints"]:
        summary_parts.append(f"特殊约束：{', '.join(preferences['health_constraints'])}")
    if preferences["flavors"]:
        summary_parts.append(f"口味偏好：{', '.join(preferences['flavors'])}")
    if preferences["methods"]:
        summary_parts.append(f"偏好做法：{', '.join(preferences['methods'])}")
    if preferences["cuisines"]:
        summary_parts.append(f"偏好菜系：{', '.join(preferences['cuisines'])}")
    summary_parts.append(f"厨艺水平：{preferences['level']}")
    preference_signals = [
        *preferences["flavors"],
        *preferences["methods"],
        *preferences["cuisines"],
    ]
    return "；".join(summary_parts), preferences["health_constraints"], preference_signals


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


def _feedback_preference_weights(user_id: str) -> dict[str, float]:
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


def _explicit_preference_weights(profile: dict) -> dict[str, float]:
    preferences = profile["preferences"]
    athlete_context = _build_athlete_context(profile)
    weights: dict[str, float] = {}

    def add_weight(key: str, value: float) -> None:
        weights[key] = weights.get(key, 0.0) + value

    for flavor in preferences["flavors"]:
        add_weight(flavor, 2.0)
        if flavor == "高蛋白":
            add_weight("high_protein", 2.4)
            add_weight("高蛋白", 1.6)
        elif flavor == "低碳水":
            add_weight("low_sugar", 1.8)
        elif flavor == "清淡":
            add_weight("清淡", 2.2)
            add_weight("low_sodium", 1.2)
        elif flavor == "辣":
            add_weight("辣", 2.2)
        elif flavor == "酸甜":
            add_weight("酸甜", 2.2)

    for method in preferences["methods"]:
        add_weight(method, 5.0)
        if method == "快手":
            add_weight("快手菜", 2.5)

    for cuisine in preferences["cuisines"]:
        add_weight(cuisine, 2.4)

    level = preferences["level"]
    if level == "survival":
        add_weight("A", 2.5)
        add_weight("快手", 1.5)
    elif level == "home_cook":
        add_weight("A", 0.8)
        add_weight("B", 1.2)
        add_weight("家常", 1.0)
    elif level == "chef":
        add_weight("B", 1.0)
        add_weight("C", 2.5)
        add_weight("进阶", 1.6)

    if athlete_context["training_days_per_week"] and int(athlete_context["training_days_per_week"]) >= 5:
        add_weight("快手菜", 1.0)
        add_weight("A", 0.5)

    training_intensity = str(athlete_context["training_intensity"] or "")
    competition_cycle = str(athlete_context["competition_cycle"] or "")

    if training_intensity in {"high", "double_session"}:
        add_weight("high_protein", 2.0)
        add_weight("高蛋白", 1.4)
    elif training_intensity == "moderate":
        add_weight("high_protein", 1.0)

    if competition_cycle in {"base", "build"}:
        add_weight("high_protein", 1.5)
        add_weight("高蛋白", 1.0)
    elif competition_cycle in {"taper", "competition"}:
        add_weight("清淡", 1.4)
        add_weight("low_sodium", 1.2)
        add_weight("A", 0.8)
        add_weight("B", 0.8)
    elif competition_cycle == "recovery":
        add_weight("high_protein", 1.4)
        add_weight("low_sodium", 1.0)
        add_weight("汤", 1.0)

    return weights


def _preference_weights(user_id: str, profile: dict) -> dict[str, float]:
    weights = _feedback_preference_weights(user_id)
    for key, value in _explicit_preference_weights(profile).items():
        weights[key] = weights.get(key, 0.0) + value
    return weights


def _build_shopping_suggestions(
    hits: list[RecipeHit],
    *,
    inventory_empty: bool,
    household_size: int,
    purchase_frequency_per_week: int,
) -> list[ShoppingListItem]:
    return _build_shopping_suggestions_from_missing_lists(
        [hit.missing_ingredients for hit in hits[:5]],
        inventory_empty=inventory_empty,
        household_size=household_size,
        purchase_frequency_per_week=purchase_frequency_per_week,
    )


def _build_shopping_suggestions_from_missing_lists(
    missing_lists: list[list[str]],
    *,
    inventory_empty: bool,
    household_size: int,
    purchase_frequency_per_week: int,
) -> list[ShoppingListItem]:
    ingredient_hits: dict[str, dict[str, object]] = {}
    for missing_ingredients in missing_lists:
        for ingredient in missing_ingredients:
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


def _extract_json_payload(text: str) -> dict:
    payload = text.strip()
    if payload.startswith("```"):
        payload = re.sub(r"^```(?:json)?\s*", "", payload)
        payload = re.sub(r"\s*```$", "", payload)
    match = re.search(r"(\{[\s\S]*\})", payload)
    if match:
        payload = match.group(1)
    data = json.loads(payload)
    if not isinstance(data, dict):
        raise ValueError("LLM blueprint is not a dict")
    return data


async def _select_plans_with_llm(
    *,
    request_id: str,
    profile_summary: str,
    inventory_items: list[dict],
    health_constraints: list[str],
    request_tags: list[str],
    preference_signals: list[str],
    hits: list[RecipeHit],
    recipe_payloads: dict[str, dict],
) -> dict[str, object] | None:
    if not llm_is_configured():
        return None

    prompt = (
        "你是 LightTable 的私人饮食规划与菜谱生成助手。"
        "请直接基于用户库存、临期状态、特殊约束、时间预算和偏好，生成 2 到 3 组结构化菜谱方案。"
        "优先消耗临期食材。能直接用现有库存就不要额外补货；缺少的食材要明确写进 missing_ingredients。"
        "每个方案必须给出完整菜名、食材、步骤、命中库存、缺失食材、原因、标签、难度和时长。"
        "A 代表更轻量快手，B 代表标准家常，C 代表更完整或稍进阶。"
        "只返回 JSON 对象，不要 markdown。"
        '格式：{"strategy_summary":"一句中文总结","plans":[{"plan_id":"A","title":"辣椒炒肉","difficulty":"A","time_minutes":15,"reason":"...","fit_tags":["临期优先"],"tags":["炒","家常"],"ingredients":["五花肉 200g","青椒 2 个"],"core_ingredients":["五花肉","青椒"],"optional_ingredients":["蒜","酱油"],"matched_inventory":["五花肉"],"missing_ingredients":["青椒"],"steps":["..."],"nutrition_tags":["low_sugar"],"allergen_tags":[],"constraint_tags":["dairy_free"]}]}.'
    )
    user_message = (
        f"用户画像：{profile_summary}\n"
        f"特殊约束：{', '.join(health_constraints) or '无'}\n"
        f"本次显式诉求：{', '.join(request_tags) or '无'}\n"
        f"用户偏好信号：{', '.join(preference_signals) or '无'}\n"
        "当前库存：\n"
        + json.dumps(
            [
                {
                    "name": item.get("display_name"),
                    "normalized_name": item.get("normalized_name"),
                    "quantity_text": item.get("quantity_text"),
                    "category": item.get("category"),
                    "status": item.get("status"),
                }
                for item in inventory_items
            ],
            ensure_ascii=False,
        )
    )
    try:
        response_text = await asyncio.wait_for(
            chat(
                [
                    {"role": "system", "content": prompt},
                    {"role": "user", "content": user_message},
                ],
                model=OPENROUTER_RECIPE_MODEL,
            ),
            timeout=OPENROUTER_RECIPE_TIMEOUT_SECONDS,
        )
        payload = _extract_json_payload(response_text)
    except Exception as exc:
        logger.warning("LLM recipe planning fell back to rules: %s", exc)
        return None

    raw_plans = payload.get("plans")
    if not isinstance(raw_plans, list):
        return None

    inventory_name_by_token = {
        item["normalized_name"]: item["display_name"] for item in inventory_items if item.get("normalized_name")
    }
    inventory_tokens = set(inventory_name_by_token)
    generated_plans: list[RecommendationPlan] = []
    generated_recipes: dict[str, dict[str, object]] = {}
    legacy_blueprint: list[dict[str, object]] = []
    plan_map = {"A": "极简", "B": "标准", "C": "进阶"}

    def normalize_list(value: object) -> list[str]:
        if not isinstance(value, list):
            return []
        return [str(item).strip() for item in value if str(item).strip()]

    def to_int(value: object) -> int | None:
        if value is None or value == "":
            return None
        try:
            return int(value)
        except (TypeError, ValueError):
            return None

    for item in raw_plans:
        if not isinstance(item, dict):
            continue
        plan_id = str(item.get("plan_id") or "").strip().upper()
        if plan_id not in {"A", "B", "C"}:
            continue

        title = str(item.get("title") or item.get("name") or "").strip()
        ingredients = normalize_list(item.get("ingredients"))
        steps = normalize_list(item.get("steps"))
        if not title or not ingredients or not steps:
            if item.get("recipe_id"):
                legacy_blueprint.append(item)
            continue

        core_ingredients = normalize_list(item.get("core_ingredients"))
        optional_ingredients = normalize_list(item.get("optional_ingredients"))
        matched_inventory = normalize_list(item.get("matched_inventory"))
        missing_ingredients = normalize_list(item.get("missing_ingredients"))

        if not core_ingredients:
            core_ingredients = matched_inventory + missing_ingredients
        if not core_ingredients:
            core_ingredients = [part.split(" ")[0] for part in ingredients[:3] if str(part).strip()]

        if not matched_inventory or not missing_ingredients:
            derived_matched: list[str] = []
            derived_missing: list[str] = []
            for ingredient_name in core_ingredients:
                token = normalize_ingredient_name(ingredient_name)
                if token in inventory_tokens:
                    derived_matched.append(inventory_name_by_token[token])
                else:
                    derived_missing.append(get_default_display_name(token, ingredient_name))
            matched_inventory = matched_inventory or derived_matched
            missing_ingredients = missing_ingredients or derived_missing

        recipe_id = f"gen_{request_id}_{plan_id.lower()}"
        difficulty = str(item.get("difficulty") or plan_id).strip().upper() or plan_id
        detail = {
            "id": recipe_id,
            "name": title,
            "ingredients": ingredients,
            "core_ingredients": core_ingredients,
            "optional_ingredients": optional_ingredients,
            "steps": steps,
            "tags": normalize_list(item.get("tags")),
            "time_minutes": to_int(item.get("time_minutes")),
            "difficulty": difficulty if difficulty in {"A", "B", "C"} else plan_id,
            "nutrition_tags": normalize_list(item.get("nutrition_tags")),
            "allergen_tags": normalize_list(item.get("allergen_tags")),
            "constraint_tags": normalize_list(item.get("constraint_tags")),
            "matched_inventory": matched_inventory,
            "missing_ingredients": missing_ingredients,
        }
        generated_recipes[recipe_id] = detail
        generated_plans.append(
            RecommendationPlan(
                plan_id=plan_id,
                label=plan_map[plan_id],
                dishes=[PlanDish(recipe_id=recipe_id, title=title)],
                matched_inventory=matched_inventory,
                missing_ingredients=missing_ingredients,
                time_minutes=detail["time_minutes"],
                difficulty=detail["difficulty"],
                fit_tags=normalize_list(item.get("fit_tags")),
                reason=str(item.get("reason") or "").strip() or f"{title} 更贴合当前库存和约束。",
            )
        )

    if generated_plans:
        return {
            "mode": "generated",
            "plans": generated_plans,
            "generated_recipes": generated_recipes,
            "strategy_summary": str(payload.get("strategy_summary") or "").strip() or None,
        }
    if legacy_blueprint:
        return {
            "mode": "selection",
            "plans": legacy_blueprint,
            "generated_recipes": {},
            "strategy_summary": str(payload.get("strategy_summary") or "").strip() or None,
        }
    return None


async def _build_plan_from_hit(
    *,
    hit: RecipeHit,
    plan_id: str,
    reason: str | None,
    fit_tags: list[str] | None,
    profile_summary: str,
    plan_map: dict[str, str],
) -> RecommendationPlan:
    label = plan_map.get(plan_id, "补充")
    rendered_reason = (reason or "").strip() or await _render_reason(
        profile_summary=profile_summary,
        hit=hit,
        plan_label=label,
    )
    return RecommendationPlan(
        plan_id=plan_id,
        label=label,
        dishes=[PlanDish(recipe_id=hit.recipe_id, title=hit.title)],
        matched_inventory=hit.matched_ingredients,
        missing_ingredients=hit.missing_ingredients,
        time_minutes=hit.time_minutes,
        difficulty=hit.difficulty,
        fit_tags=fit_tags or hit.fit_tags,
        reason=rendered_reason,
    )


async def _fallback_plan_build(
    *,
    hits: list[RecipeHit],
    profile_summary: str,
    existing_plan_ids: set[str] | None = None,
    existing_recipe_ids: set[str] | None = None,
) -> list[RecommendationPlan]:
    plan_map = {"A": "极简", "B": "标准", "C": "进阶"}
    plans: list[RecommendationPlan] = []
    selected_difficulties = set(existing_plan_ids or set())
    selected_recipe_ids = set(existing_recipe_ids or set())

    for target_difficulty in ("A", "B", "C"):
        if target_difficulty in selected_difficulties:
            continue
        hit = next(
            (
                candidate
                for candidate in hits
                if candidate.difficulty == target_difficulty and candidate.recipe_id not in selected_recipe_ids
            ),
            None,
        )
        if hit is None:
            continue
        plans.append(
            await _build_plan_from_hit(
                hit=hit,
                plan_id=target_difficulty,
                reason=None,
                fit_tags=None,
                profile_summary=profile_summary,
                plan_map=plan_map,
            )
        )
        selected_difficulties.add(target_difficulty)
        selected_recipe_ids.add(hit.recipe_id)

    if len(plans) + len(existing_plan_ids or set()) < 2:
        for hit in hits:
            if hit.recipe_id in selected_recipe_ids:
                continue
            plan_id = hit.difficulty
            plans.append(
                await _build_plan_from_hit(
                    hit=hit,
                    plan_id=plan_id,
                    reason=None,
                    fit_tags=None,
                    profile_summary=profile_summary,
                    plan_map=plan_map,
                )
            )
            selected_recipe_ids.add(hit.recipe_id)
            if len(plans) + len(existing_plan_ids or set()) >= 3:
                break
    return plans


def _load_request_state(request: RecommendRequest) -> dict[str, object]:
    inventory_items = list_inventory(request.user_id)
    inventory_tokens = [item["normalized_name"] for item in inventory_items]
    expiring_inventory_tokens = {
        item["normalized_name"] for item in inventory_items if item.get("status") == "expiring_soon"
    }
    profile = get_profile(request.user_id)
    if profile is None:
        raise ValueError("User profile not found")

    profile_summary, health_constraints, preference_signals = _summarize_profile(profile)
    athlete_context = _build_athlete_context(profile)
    household_size = int(profile["profile"].get("household_size") or 1)
    purchase_frequency_per_week = int(profile["profile"].get("purchase_frequency_per_week") or 2)
    time_budget = int(
        (request.context or {}).get("time_budget_minutes")
        or profile["profile"]["time_budget_minutes"]
        or 20
    )

    return {
        "inventory_items": inventory_items,
        "inventory_tokens": inventory_tokens,
        "expiring_inventory_tokens": expiring_inventory_tokens,
        "profile": profile,
        "profile_summary": profile_summary,
        "health_constraints": health_constraints,
        "preference_signals": preference_signals,
        "athlete_context": athlete_context,
        "household_size": household_size,
        "purchase_frequency_per_week": purchase_frequency_per_week,
        "time_budget": time_budget,
        "preference_weights": _preference_weights(request.user_id, profile),
        "recent_recipe_ids": _recent_recipe_ids(request.user_id),
    }


def _build_strategy_summary(
    *,
    request_tags: list[str],
    health_constraints: list[str],
    time_budget: int,
    preference_signals: list[str],
    athlete_context: dict[str, object],
    llm_strategy_summary: str | None = None,
) -> str:
    if llm_strategy_summary:
        return llm_strategy_summary

    strategy_parts = [
        "临期优先" if "消耗临期" in request_tags else "库存优先",
        "特殊约束已过滤" if health_constraints else "通用饮食规则",
        f"时间预算 {time_budget} 分钟",
    ]
    if preference_signals:
        strategy_parts.append(f"偏好加权 {', '.join(preference_signals[:3])}")
    if athlete_context.get("competition_cycle"):
        strategy_parts.append(f"赛事周期 {athlete_context['competition_cycle']}")
    if athlete_context.get("training_intensity"):
        strategy_parts.append(f"训练强度 {athlete_context['training_intensity']}")
    return "，".join(strategy_parts)


def _weekly_focus_sequence(athlete_context: dict[str, object]) -> list[str]:
    competition_cycle = str(athlete_context.get("competition_cycle") or "")
    training_intensity = str(athlete_context.get("training_intensity") or "")
    if competition_cycle in {"taper", "competition"}:
        return ["稳态补给", "赛前轻负担", "易消化主菜"]
    if competition_cycle == "recovery":
        return ["恢复修复", "高蛋白修复", "轻负担补水"]
    if competition_cycle in {"base", "build"} or training_intensity in {"high", "double_session"}:
        return ["训练后补能", "高蛋白主菜", "均衡加餐日"]
    return ["库存优先", "快手补能", "均衡家常"]


def _weekly_training_hint(athlete_context: dict[str, object], day_index: int) -> str:
    competition_cycle = str(athlete_context.get("competition_cycle") or "")
    training_intensity = str(athlete_context.get("training_intensity") or "")
    hints = _weekly_focus_sequence(athlete_context)
    base_hint = hints[day_index % len(hints)]
    if competition_cycle in {"taper", "competition"}:
        return f"{base_hint}，控制油腻和陌生食材。"
    if competition_cycle == "recovery":
        return f"{base_hint}，优先蛋白质和补水。"
    if training_intensity in {"high", "double_session"}:
        return f"{base_hint}，注意训练后尽快进食。"
    return f"{base_hint}，优先保持库存消耗效率。"


def _build_weekly_day_labels() -> list[str]:
    weekday_map = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"]
    today = date.today()
    return [weekday_map[(today.weekday() + offset) % 7] for offset in range(7)]


async def recommend(request: RecommendRequest) -> RecommendResponse:
    request_id = f"req_{uuid.uuid4().hex[:8]}"
    state = _load_request_state(request)
    inventory_items = state["inventory_items"]
    inventory_tokens = state["inventory_tokens"]
    expiring_inventory_tokens = state["expiring_inventory_tokens"]
    profile = state["profile"]
    profile_summary = state["profile_summary"]
    health_constraints = state["health_constraints"]
    preference_signals = state["preference_signals"]
    athlete_context = state["athlete_context"]
    household_size = int(state["household_size"])
    purchase_frequency_per_week = int(state["purchase_frequency_per_week"])
    time_budget = int(state["time_budget"])
    preference_weights = state["preference_weights"]
    recent_recipe_ids = state["recent_recipe_ids"]

    plans: list[RecommendationPlan] = []
    generated_recipes: dict[str, dict[str, object]] = {}
    selected_plan_ids: set[str] = set()
    selected_recipe_ids: set[str] = set()
    llm_strategy_summary: str | None = None
    hits: list[RecipeHit] = []

    llm_selection = await _select_plans_with_llm(
        request_id=request_id,
        profile_summary=profile_summary,
        inventory_items=inventory_items,
        health_constraints=health_constraints,
        request_tags=request.tags,
        preference_signals=preference_signals,
        hits=[],
        recipe_payloads={},
    )
    if llm_selection and llm_selection.get("mode") == "generated":
        plans = list(llm_selection.get("plans") or [])
        generated_recipes = dict(llm_selection.get("generated_recipes") or {})
        llm_strategy_summary = llm_selection.get("strategy_summary")  # type: ignore[assignment]
    else:
        knowledge = get_knowledge_service()
        recipe_payloads = {recipe["id"]: recipe for recipe in knowledge.recipes}
        hits = knowledge.list_candidate_hits(
            inventory_tokens=inventory_tokens,
            expiring_inventory_tokens=expiring_inventory_tokens,
            constraints=health_constraints,
            goal=profile["profile"]["goal"],
            explicit_tags=request.tags,
            time_budget_minutes=time_budget,
            preference_weights=preference_weights,
            recent_recipe_ids=recent_recipe_ids,
            athlete_context=athlete_context,
        )
        candidate_map = {hit.recipe_id: hit for hit in hits}
        if llm_selection and llm_selection.get("mode") == "selection":
            blueprint = llm_selection.get("plans") or []
            llm_strategy_summary = llm_selection.get("strategy_summary")  # type: ignore[assignment]
        else:
            blueprint = []

        for item in blueprint:
            plan_id = str(item.get("plan_id") or "").strip()
            recipe_id = str(item.get("recipe_id") or "").strip()
            if plan_id not in {"A", "B", "C"}:
                continue
            hit = candidate_map.get(recipe_id)
            if hit is None or recipe_id in selected_recipe_ids:
                continue
            plan = await _build_plan_from_hit(
                hit=hit,
                plan_id=plan_id,
                reason=str(item.get("reason") or "").strip() or None,
                fit_tags=[str(tag) for tag in item.get("fit_tags", []) if isinstance(tag, str)] or None,
                profile_summary=profile_summary,
                plan_map={"A": "极简", "B": "标准", "C": "进阶"},
            )
            plans.append(plan)
            selected_plan_ids.add(plan_id)
            selected_recipe_ids.add(recipe_id)

        plans.extend(
            await _fallback_plan_build(
                hits=hits,
                profile_summary=profile_summary,
                existing_plan_ids=selected_plan_ids,
                existing_recipe_ids=selected_recipe_ids,
            )
        )

    inventory_empty = not inventory_items
    if generated_recipes:
        shopping_suggestions = _build_shopping_suggestions_from_missing_lists(
            [plan.missing_ingredients for plan in plans],
            inventory_empty=inventory_empty,
            household_size=household_size,
            purchase_frequency_per_week=purchase_frequency_per_week,
        )
    else:
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
            "generated_recipes": generated_recipes,
            "tags": request.tags,
            "mode": "single",
        },
    )

    return RecommendResponse(
        request_id=request_id,
        profile_summary=profile_summary,
        strategy_summary=_build_strategy_summary(
            request_tags=request.tags,
            health_constraints=health_constraints,
            time_budget=time_budget,
            preference_signals=preference_signals,
            athlete_context=athlete_context,
            llm_strategy_summary=llm_strategy_summary,
        ),
        plans=plans,
        shopping_suggestions=shopping_suggestions,
        debug_retrieval=hits[:8] if not generated_recipes else [],
    )


async def recommend_weekly(request: RecommendRequest) -> WeeklyRecommendResponse:
    request_id = f"week_{uuid.uuid4().hex[:8]}"
    state = _load_request_state(request)
    inventory_items = state["inventory_items"]
    inventory_tokens = state["inventory_tokens"]
    expiring_inventory_tokens = state["expiring_inventory_tokens"]
    profile = state["profile"]
    profile_summary = state["profile_summary"]
    health_constraints = state["health_constraints"]
    preference_signals = state["preference_signals"]
    athlete_context = state["athlete_context"]
    household_size = int(state["household_size"])
    purchase_frequency_per_week = int(state["purchase_frequency_per_week"])
    time_budget = int(state["time_budget"])
    preference_weights = state["preference_weights"]
    recent_recipe_ids = state["recent_recipe_ids"]

    knowledge = get_knowledge_service()
    hits = knowledge.list_candidate_hits(
        inventory_tokens=inventory_tokens,
        expiring_inventory_tokens=expiring_inventory_tokens,
        constraints=health_constraints,
        goal=profile["profile"]["goal"],
        explicit_tags=request.tags,
        time_budget_minutes=time_budget,
        preference_weights=preference_weights,
        recent_recipe_ids=recent_recipe_ids,
        athlete_context=athlete_context,
    )

    full_hits = [hit for hit in hits if not hit.missing_ingredients]
    unique_weekly_hits: list[RecipeHit] = []
    seen_recipe_ids: set[str] = set()
    for hit in full_hits:
        if hit.recipe_id in seen_recipe_ids:
            continue
        unique_weekly_hits.append(hit)
        seen_recipe_ids.add(hit.recipe_id)
        if len(unique_weekly_hits) >= 5:
            break

    shopping_suggestions = _build_shopping_suggestions(
        hits,
        inventory_empty=not inventory_items,
        household_size=household_size,
        purchase_frequency_per_week=purchase_frequency_per_week,
    )

    strategy_summary = _build_strategy_summary(
        request_tags=request.tags,
        health_constraints=health_constraints,
        time_budget=time_budget,
        preference_signals=preference_signals,
        athlete_context=athlete_context,
    )

    if len(unique_weekly_hits) < 4:
        blocking_reasons = [
            "当前库存可直接完成的主菜不足 4 道，无法稳定覆盖一周。",
            "先补齐关键蛋白质和蔬菜，再生成完整周食谱。",
        ]
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
                "mode": "weekly_blocked",
                "tags": request.tags,
                "blocking_reasons": blocking_reasons,
                "shopping_suggestions": [item.model_dump() for item in shopping_suggestions],
            },
        )
        return WeeklyRecommendResponse(
            status="needs_ingredients",
            request_id=request_id,
            profile_summary=profile_summary,
            strategy_summary=f"{strategy_summary}，当前库存不足以直接排出 7 天主餐。",
            shopping_suggestions=shopping_suggestions,
            required_ingredients=shopping_suggestions,
            blocking_reasons=blocking_reasons,
        )

    day_labels = _build_weekly_day_labels()
    focus_labels = _weekly_focus_sequence(athlete_context)
    weekly_days: list[WeeklyPlanDay] = []
    previous_recipe_id: str | None = None

    for index, day_label in enumerate(day_labels):
        hit = unique_weekly_hits[index % len(unique_weekly_hits)]
        if previous_recipe_id and hit.recipe_id == previous_recipe_id and len(unique_weekly_hits) > 1:
            hit = unique_weekly_hits[(index + 1) % len(unique_weekly_hits)]
        previous_recipe_id = hit.recipe_id
        plan = await _build_plan_from_hit(
            hit=hit,
            plan_id=hit.difficulty,
            reason=None,
            fit_tags=None,
            profile_summary=profile_summary,
            plan_map={"A": "极简", "B": "标准", "C": "进阶"},
        )
        weekly_days.append(
            WeeklyPlanDay(
                day_label=day_label,
                focus=focus_labels[index % len(focus_labels)],
                training_hint=_weekly_training_hint(athlete_context, index),
                plan=plan,
            )
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
            "mode": "weekly_ready",
            "tags": request.tags,
            "weekly_days": [day.model_dump() for day in weekly_days],
        },
    )

    return WeeklyRecommendResponse(
        status="ready",
        request_id=request_id,
        profile_summary=profile_summary,
        strategy_summary=f"{strategy_summary}，按现有库存排出 7 天主餐。",
        days=weekly_days,
        shopping_suggestions=shopping_suggestions,
        required_ingredients=[],
        blocking_reasons=[],
    )
