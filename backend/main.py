from pathlib import Path

from dotenv import load_dotenv

# 在导入任何读取 env 的模块之前，从项目根目录加载 .env
_load_env = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(_load_env)

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.core.config import (
    CORS_ALLOW_ORIGINS,
    RATE_LIMIT_LLM_TEST_PER_HOUR,
    has_mem0,
    has_openrouter,
)
from backend.core.rate_limit import rate_limit
from backend.services.llm_service import chat
from backend.database import init_db

# 路由
from backend.routers import recommend, inventory, recipe, user

app = FastAPI(title="LightTable API", version="0.1.0")

# CORS（允许前端跨域调用）
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ALLOW_ORIGINS,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 注册路由
app.include_router(recommend.router)
app.include_router(inventory.router)
app.include_router(recipe.router)
app.include_router(user.router)


llm_test_rate_limit = rate_limit(
    "llm_test",
    limit=RATE_LIMIT_LLM_TEST_PER_HOUR,
    window_seconds=3600,
)


@app.on_event("startup")
def startup():
    init_db()


@app.get("/")
def root():
    return {"message": "Hello LightTable"}


@app.get("/api/v1/status")
def api_status():
    """检查各服务配置状态"""
    return {
        "openrouter_configured": has_openrouter(),
        "mem0_configured": has_mem0(),
    }


@app.get("/api/v1/llm/status")
def llm_status():
    """检查 OpenRouter 是否已配置（不暴露 Key）。"""
    return {"openrouter_configured": has_openrouter()}


@app.post("/api/v1/llm/test", dependencies=[Depends(llm_test_rate_limit)])
async def llm_test():
    """简单对话测试，验证 API Key 是否可用。"""
    if not has_openrouter():
        return {"ok": False, "error": "OPENROUTER_API_KEY 未配置"}
    try:
        reply = await chat([{"role": "user", "content": "用一句话说「LightTable 已就绪」。"}])
        return {"ok": True, "reply": reply.strip() or "(空回复)"}
    except Exception as e:
        return {"ok": False, "error": str(e)}
