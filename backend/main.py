from pathlib import Path

from dotenv import load_dotenv

# 在导入任何读取 env 的模块之前，从项目根目录加载 .env
_load_env = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(_load_env)

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.core.config import has_openrouter, has_mem0
from backend.services.llm_service import chat
from backend.database import init_db

# 路由
from backend.routers import recommend, inventory, recipe, user

app = FastAPI(title="LightTable API", version="0.1.0")

# CORS（允许前端跨域调用）
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 生产环境应限制具体域名
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 注册路由
app.include_router(recommend.router)
app.include_router(inventory.router)
app.include_router(recipe.router)
app.include_router(user.router)


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


@app.post("/api/v1/llm/test")
async def llm_test():
    """简单对话测试，验证 API Key 是否可用。"""
    if not has_openrouter():
        return {"ok": False, "error": "OPENROUTER_API_KEY 未配置"}
    try:
        reply = await chat([{"role": "user", "content": "用一句话说「LightTable 已就绪」。"}])
        return {"ok": True, "reply": reply.strip() or "(空回复)"}
    except Exception as e:
        return {"ok": False, "error": str(e)}

