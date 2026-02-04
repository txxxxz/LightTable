"""
Orchestrator: 核心编排层，串联 Mem0 + LlamaIndex + LLM。
流程: Input → Recall → Refine → Retrieve → Generate
"""
from __future__ import annotations

import uuid
from backend.services.knowledge_service import get_knowledge_service, normalize_ingredient
from backend.services.memory_service import get_memory_service
from backend.services.llm_service import chat
from backend.schemas.recommend import RecommendRequest, RecommendResponse, RecipePlan
from backend.schemas.recipe import RecipeHit


def normalize_inventory(inventory: list[str]) -> list[str]:
    """将用户输入的食材名标准化为 token"""
    return list(set(normalize_ingredient(i) for i in inventory if i.strip()))


def refine_query(inventory_tokens: list[str], profile: str, tags: list[str]) -> str:
    """
    将库存 + 用户画像 + 选择标签融合为检索 query。
    """
    parts = []
    if inventory_tokens:
        parts.append(f"使用 {', '.join(inventory_tokens)}")
    if "消耗临期" in tags or "expiring" in tags:
        parts.append("优先消耗临期食材")
    if "减脂" in tags or "diet" in tags:
        parts.append("低脂健康")
    if "快手菜" in tags or "quick" in tags:
        parts.append("快手简单")
    if profile:
        parts.append(profile)
    return "。".join(parts) if parts else "推荐家常菜"


async def generate_reasons(
    profile: str,
    inventory_tokens: list[str],
    hits: list[RecipeHit],
) -> list[RecipePlan]:
    """
    调用 LLM 为每道菜生成推荐理由。
    """
    if not hits:
        return []

    # 构建 prompt
    recipe_list = "\n".join(
        f"{i+1}. {h.title}（食材匹配：{', '.join(h.matched_ingredients) or '无'}）"
        for i, h in enumerate(hits)
    )
    system = (
        "你是 LightTable 的饮食推荐助手。"
        "根据用户画像和库存食材，为每道菜写一句简短的推荐理由（15-30 字）。"
        "理由要提及食材匹配或用户偏好。"
    )
    user_prompt = f"""用户画像：{profile or '无特别偏好'}
库存食材：{', '.join(inventory_tokens) or '未知'}

候选食谱：
{recipe_list}

请为每道菜输出一句推荐理由，格式：
1. 理由
2. 理由
..."""

    try:
        reply = await chat([
            {"role": "system", "content": system},
            {"role": "user", "content": user_prompt},
        ])
    except Exception as e:
        print(f"[Orchestrator] LLM error: {e}")
        reply = ""

    # 解析 LLM 回复
    reasons: list[str] = []
    for line in reply.strip().split("\n"):
        line = line.strip()
        if line and line[0].isdigit():
            # 去掉序号
            parts = line.split(".", 1)
            if len(parts) > 1:
                reasons.append(parts[1].strip())
            else:
                reasons.append(line)

    # 构建 RecipePlan
    plans: list[RecipePlan] = []
    for i, h in enumerate(hits):
        reason = reasons[i] if i < len(reasons) else f"推荐使用 {', '.join(h.matched_ingredients) or '库存食材'}"
        plans.append(
            RecipePlan(
                recipe_id=h.recipe_id,
                name=h.title,
                matched_ingredients=h.matched_ingredients,
                time_minutes=h.time_minutes,
                reason=reason,
            )
        )
    return plans


async def recommend(request: RecommendRequest) -> RecommendResponse:
    """
    完整推荐流程：
    1. Input: 用户库存
    2. Recall: 从 Mem0 获取用户画像
    3. Refine: 融合为查询
    4. Retrieve: 从 LlamaIndex 检索食谱
    5. Generate: LLM 生成推荐理由
    """
    request_id = f"req_{uuid.uuid4().hex[:8]}"

    # 1. 标准化库存
    inventory_tokens = normalize_inventory(request.inventory)

    # 2. Recall（Mem0）
    memory_svc = get_memory_service()
    profile = memory_svc.get_profile_text(request.user_id)

    # 3. Refine Query
    refined_query = refine_query(inventory_tokens, profile, request.tags)

    # 4. Retrieve（LlamaIndex）
    knowledge_svc = get_knowledge_service()
    hits = knowledge_svc.search_recipes(
        query=refined_query,
        inventory_tokens=inventory_tokens,
        top_k=5,
    )

    # 5. Generate（LLM）
    plans = await generate_reasons(profile, inventory_tokens, hits)

    return RecommendResponse(
        request_id=request_id,
        profile_summary=profile or "无特别偏好",
        refined_query=refined_query,
        plans=plans,
        retrieval=hits,
    )
