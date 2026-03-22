"""
应用配置：从环境变量读取，不将密钥写入代码。
"""
import os
from pathlib import Path

from dotenv import load_dotenv

# 从项目根目录加载 .env（backend 上一级）
_root = Path(__file__).resolve().parents[2]
load_dotenv(_root / ".env")

# ============ OpenRouter (LLM) ============
OPENROUTER_API_KEY: str | None = os.getenv("OPENROUTER_API_KEY")
OPENROUTER_BASE_URL: str = os.getenv(
    "OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1"
)
OPENROUTER_MODEL: str = os.getenv(
    "OPENROUTER_MODEL", "openai/gpt-4o-mini"
)

def has_openrouter() -> bool:
    return bool(OPENROUTER_API_KEY and OPENROUTER_API_KEY.startswith("sk-"))


# ============ Paths ============
BACKEND_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BACKEND_DIR / "data"
RECIPES_JSON = Path(os.getenv("LIGHTTABLE_RECIPES_JSON", str(DATA_DIR / "recipes.json")))
CHROMA_PERSIST_DIR = DATA_DIR / "chroma_db"

# 用户设置与偏好（关系型源数据）
SQLITE_DB_PATH = Path(os.getenv("LIGHTTABLE_SQLITE_DB_PATH", str(DATA_DIR / "lighttable.db")))
DEFAULT_USER_ID = "default"

# ============ Embedding Model ============
EMBEDDING_MODEL_NAME: str = os.getenv(
    "EMBEDDING_MODEL_NAME", "BAAI/bge-small-zh-v1.5"
)

# ============ Mem0 ============
MEM0_API_KEY: str | None = os.getenv("MEM0_API_KEY")

# ============ Optional RedNote MCP ============
REDNOTE_MCP_COMMAND: str | None = os.getenv("REDNOTE_MCP_COMMAND")

def has_mem0() -> bool:
    return bool(MEM0_API_KEY)
