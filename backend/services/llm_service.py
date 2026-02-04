"""
OpenRouter LLM 调用封装，供编排层生成推荐与解释。
"""
from __future__ import annotations

import httpx
from backend.core.config import (
    OPENROUTER_API_KEY,
    OPENROUTER_BASE_URL,
    OPENROUTER_MODEL,
    has_openrouter,
)


async def chat(messages: list[dict[str, str]], *, model: str | None = None) -> str:
    """
    调用 OpenRouter Chat Completions，返回 assistant 文本。
    messages: [{"role": "user"|"assistant"|"system", "content": "..."}]
    """
    if not has_openrouter():
        return "（未配置 OPENROUTER_API_KEY，无法调用 LLM）"

    url = f"{OPENROUTER_BASE_URL.rstrip('/')}/chat/completions"
    payload = {
        "model": model or OPENROUTER_MODEL,
        "messages": messages,
        "max_tokens": 1024,
        "temperature": 0.7,
    }
    headers = {
        "Authorization": f"Bearer {OPENROUTER_API_KEY}",
        "Content-Type": "application/json",
        "HTTP-Referer": "https://lighttable.local",
    }

    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.post(url, json=payload, headers=headers)
        resp.raise_for_status()
        data = resp.json()
        choice = data.get("choices") or []
        if not choice:
            return ""
        return (choice[0].get("message") or {}).get("content") or ""


def is_configured() -> bool:
    return has_openrouter()
