"""
OpenRouter LLM 调用封装，供编排层生成推荐、解释和视觉解析。
"""
from __future__ import annotations

import base64
import mimetypes

import httpx
from backend.core.config import (
    OPENROUTER_API_KEY,
    OPENROUTER_BASE_URL,
    OPENROUTER_MODEL,
    OPENROUTER_RECIPE_MODEL,
    has_openrouter,
)


async def chat(messages: list[dict[str, str]], *, model: str | None = None) -> str:
    """
    调用 OpenRouter Chat Completions，返回 assistant 文本。
    messages: [{"role": "user"|"assistant"|"system", "content": "..."}]
    """
    if not has_openrouter():
        return "（未配置 OPENROUTER_API_KEY，无法调用 LLM）"

    effective_model = model or OPENROUTER_MODEL
    url = f"{OPENROUTER_BASE_URL.rstrip('/')}/chat/completions"
    payload = {
        "model": effective_model,
        "messages": messages,
        "max_tokens": 2200 if effective_model == OPENROUTER_RECIPE_MODEL else 1024,
        "temperature": 0.4 if effective_model == OPENROUTER_RECIPE_MODEL else 0.7,
    }
    headers = {
        "Authorization": f"Bearer {OPENROUTER_API_KEY}",
        "Content-Type": "application/json",
        "HTTP-Referer": "https://lighttable.local",
    }

    async with httpx.AsyncClient(timeout=12.0 if effective_model == OPENROUTER_RECIPE_MODEL else 5.0) as client:
        resp = await client.post(url, json=payload, headers=headers)
        resp.raise_for_status()
        data = resp.json()
        choice = data.get("choices") or []
        if not choice:
            return ""
        return (choice[0].get("message") or {}).get("content") or ""


def is_configured() -> bool:
    return has_openrouter()


async def vision_chat(
    prompt: str,
    *,
    image_bytes: bytes,
    filename: str,
    model: str | None = None,
) -> str:
    """
    调用 OpenRouter 多模态能力，对图片进行 OCR / 结构化抽取。
    """
    if not has_openrouter():
        raise RuntimeError("OPENROUTER_API_KEY 未配置，无法执行图片识别。")

    mime_type = mimetypes.guess_type(filename)[0] or "image/jpeg"
    image_base64 = base64.b64encode(image_bytes).decode("utf-8")
    image_url = f"data:{mime_type};base64,{image_base64}"

    url = f"{OPENROUTER_BASE_URL.rstrip('/')}/chat/completions"
    payload = {
        "model": model or OPENROUTER_MODEL,
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": prompt},
                    {"type": "image_url", "image_url": {"url": image_url}},
                ],
            }
        ],
        "max_tokens": 1024,
        "temperature": 0.1,
    }
    headers = {
        "Authorization": f"Bearer {OPENROUTER_API_KEY}",
        "Content-Type": "application/json",
        "HTTP-Referer": "https://lighttable.local",
    }

    async with httpx.AsyncClient(timeout=20.0) as client:
        resp = await client.post(url, json=payload, headers=headers)
        resp.raise_for_status()
        data = resp.json()
        choice = data.get("choices") or []
        if not choice:
            return ""
        return (choice[0].get("message") or {}).get("content") or ""
