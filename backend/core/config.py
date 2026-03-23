"""
应用配置：从环境变量读取，不将密钥写入代码。
"""
import importlib.util
import os
from pathlib import Path

from dotenv import load_dotenv

# 从项目根目录加载 .env（backend 上一级）
_root = Path(__file__).resolve().parents[2]
load_dotenv(_root / ".env")


def _env_path(name: str, default: Path) -> Path:
    value = os.getenv(name)
    return Path(value) if value else default


def _env_csv(name: str, default: str = "") -> list[str]:
    raw = os.getenv(name, default)
    return [item.strip() for item in raw.split(",") if item.strip()]

# ============ OpenRouter (LLM) ============
OPENROUTER_API_KEY: str | None = os.getenv("OPENROUTER_API_KEY")
OPENROUTER_BASE_URL: str = os.getenv(
    "OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1"
)
OPENROUTER_MODEL: str = os.getenv(
    "OPENROUTER_MODEL", "openai/gpt-4o-mini"
)
OPENROUTER_RECIPE_MODEL: str = os.getenv(
    "OPENROUTER_RECIPE_MODEL", "openai/gpt-4o"
)
OPENROUTER_RECIPE_TIMEOUT_SECONDS: float = float(
    os.getenv("OPENROUTER_RECIPE_TIMEOUT_SECONDS", "12")
)

def has_openrouter() -> bool:
    return bool(OPENROUTER_API_KEY and OPENROUTER_API_KEY.startswith("sk-"))


# ============ Paths ============
BACKEND_DIR = Path(__file__).resolve().parent.parent
BUNDLED_DATA_DIR = BACKEND_DIR / "data"
DATA_DIR = _env_path("LIGHTTABLE_DATA_DIR", BUNDLED_DATA_DIR)
RECIPES_JSON = _env_path("LIGHTTABLE_RECIPES_JSON", BUNDLED_DATA_DIR / "recipes.json")
CHROMA_PERSIST_DIR = _env_path("LIGHTTABLE_CHROMA_PERSIST_DIR", DATA_DIR / "chroma_db")

# 用户设置与偏好（关系型源数据）
SQLITE_DB_PATH = _env_path("LIGHTTABLE_SQLITE_DB_PATH", DATA_DIR / "lighttable.db")
DEFAULT_USER_ID = os.getenv("LIGHTTABLE_DEFAULT_USER_ID", "default")

# ============ Embedding Model ============
EMBEDDING_MODEL_NAME: str = os.getenv(
    "EMBEDDING_MODEL_NAME", "BAAI/bge-small-zh-v1.5"
)

# ============ Mem0 ============
MEM0_API_KEY: str | None = os.getenv("MEM0_API_KEY")

# ============ Optional RedNote MCP ============
REDNOTE_MCP_COMMAND: str | None = os.getenv("REDNOTE_MCP_COMMAND")

def has_mem0() -> bool:
    return bool(MEM0_API_KEY and importlib.util.find_spec("mem0"))


# ============ Security / runtime ============
CORS_ALLOW_ORIGINS = _env_csv(
    "LIGHTTABLE_CORS_ALLOW_ORIGINS",
    "http://localhost:3000,http://127.0.0.1:3000",
)
ENABLE_RATE_LIMIT = os.getenv("LIGHTTABLE_ENABLE_RATE_LIMIT", "1").lower() not in {
    "0",
    "false",
    "no",
}
RATE_LIMIT_RECOMMEND_PER_HOUR = int(os.getenv("LIGHTTABLE_RATE_LIMIT_RECOMMEND_PER_HOUR", "30"))
RATE_LIMIT_RECOGNIZE_PER_HOUR = int(os.getenv("LIGHTTABLE_RATE_LIMIT_RECOGNIZE_PER_HOUR", "12"))
RATE_LIMIT_PARSE_TEXT_PER_HOUR = int(os.getenv("LIGHTTABLE_RATE_LIMIT_PARSE_TEXT_PER_HOUR", "120"))
RATE_LIMIT_LLM_TEST_PER_HOUR = int(os.getenv("LIGHTTABLE_RATE_LIMIT_LLM_TEST_PER_HOUR", "5"))
