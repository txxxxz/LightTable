"""
KnowledgeService: 基于 LlamaIndex 的食谱 RAG 检索服务。
- 加载 recipes.json
- 构建 VectorStoreIndex（Chroma 持久化）
- 支持 Metadata Filtering（按库存食材过滤）
"""
from __future__ import annotations

import json
import re
from pathlib import Path
from typing import TYPE_CHECKING

from backend.core.config import (
    RECIPES_JSON,
    CHROMA_PERSIST_DIR,
    EMBEDDING_MODEL_NAME,
)
from backend.schemas.recipe import RecipeHit

if TYPE_CHECKING:
    from llama_index.core import VectorStoreIndex

# 食材标准化映射（简化版，后续可扩展）
INGREDIENT_ALIASES: dict[str, str] = {
    "猪里脊": "pork",
    "猪肉": "pork",
    "猪肉末": "pork",
    "五花肉": "pork",
    "青椒": "pepper",
    "辣椒": "pepper",
    "番茄": "tomato",
    "西红柿": "tomato",
    "鸡蛋": "egg",
    "蛋": "egg",
    "茄子": "eggplant",
    "蒜": "garlic",
    "姜": "ginger",
    "葱": "scallion",
}


def normalize_ingredient(name: str) -> str:
    """将食材名标准化为 token"""
    name = name.lower().strip()
    # 去掉数量描述
    name = re.sub(r"[\d\s]*(g|个|根|瓣|勺|少许|适量|可选).*", "", name)
    for cn, en in INGREDIENT_ALIASES.items():
        if cn in name:
            return en
    return name


class KnowledgeService:
    _instance: "KnowledgeService | None" = None
    _index: "VectorStoreIndex | None" = None

    def __new__(cls) -> "KnowledgeService":
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    def __init__(self) -> None:
        if KnowledgeService._index is not None:
            return
        self._build_index()

    def _build_index(self) -> None:
        """构建或加载向量索引"""
        from llama_index.core import Document, VectorStoreIndex, StorageContext
        from llama_index.core.settings import Settings
        from llama_index.embeddings.huggingface import HuggingFaceEmbedding
        import chromadb

        # 设置 Embedding 模型
        Settings.embed_model = HuggingFaceEmbedding(model_name=EMBEDDING_MODEL_NAME)
        Settings.llm = None  # 不使用 LlamaIndex 内置 LLM

        # Chroma 持久化
        CHROMA_PERSIST_DIR.mkdir(parents=True, exist_ok=True)
        chroma_client = chromadb.PersistentClient(path=str(CHROMA_PERSIST_DIR))

        # 检查是否已有 collection
        try:
            collection = chroma_client.get_collection("recipes")
            # 如果 collection 存在且有数据，直接加载
            if collection.count() > 0:
                from llama_index.vector_stores.chroma import ChromaVectorStore
                vector_store = ChromaVectorStore(chroma_collection=collection)
                storage_context = StorageContext.from_defaults(vector_store=vector_store)
                KnowledgeService._index = VectorStoreIndex.from_vector_store(
                    vector_store, storage_context=storage_context
                )
                print(f"[KnowledgeService] Loaded existing index with {collection.count()} docs")
                return
        except Exception:
            pass

        # 否则从 recipes.json 构建
        recipes = self._load_recipes()
        documents = []
        for r in recipes:
            ingredient_tokens = [normalize_ingredient(i) for i in r["ingredients"]]
            text = f"{r['name']}。{' '.join(r['tags'])}。食材：{', '.join(r['ingredients'])}"
            doc = Document(
                text=text,
                metadata={
                    "recipe_id": r["id"],
                    "title": r["name"],
                    "ingredient_tokens": ",".join(set(ingredient_tokens)),
                    "tags": ",".join(r["tags"]),
                    "time_minutes": r.get("time_minutes"),
                },
            )
            documents.append(doc)

        # 创建新 collection
        collection = chroma_client.get_or_create_collection("recipes")
        from llama_index.vector_stores.chroma import ChromaVectorStore
        vector_store = ChromaVectorStore(chroma_collection=collection)
        storage_context = StorageContext.from_defaults(vector_store=vector_store)
        KnowledgeService._index = VectorStoreIndex.from_documents(
            documents, storage_context=storage_context
        )
        print(f"[KnowledgeService] Built new index with {len(documents)} docs")

    def _load_recipes(self) -> list[dict]:
        """加载食谱 JSON"""
        if not RECIPES_JSON.exists():
            return []
        with open(RECIPES_JSON, "r", encoding="utf-8") as f:
            return json.load(f)

    def search_recipes(
        self,
        query: str,
        inventory_tokens: list[str],
        top_k: int = 5,
    ) -> list[RecipeHit]:
        """
        检索食谱。
        - query: 语义查询（如 "Spicy pork and pepper recipes, low sugar"）
        - inventory_tokens: 标准化后的库存食材 token
        - top_k: 返回数量
        """
        if KnowledgeService._index is None:
            return []

        retriever = KnowledgeService._index.as_retriever(similarity_top_k=top_k * 3)
        nodes = retriever.retrieve(query)

        # 二次过滤：至少命中一个库存食材
        inventory_set = set(t.lower() for t in inventory_tokens)
        hits: list[RecipeHit] = []
        for node in nodes:
            meta = node.metadata
            doc_tokens = set(meta.get("ingredient_tokens", "").split(","))
            matched = doc_tokens & inventory_set
            if not matched and inventory_tokens:
                continue  # 不命中任何库存食材则跳过
            hits.append(
                RecipeHit(
                    recipe_id=meta.get("recipe_id", ""),
                    title=meta.get("title", ""),
                    snippet=node.text[:100],
                    tags=meta.get("tags", "").split(","),
                    time_minutes=meta.get("time_minutes"),
                    score=node.score or 0.0,
                    matched_ingredients=list(matched),
                )
            )
            if len(hits) >= top_k:
                break

        # 按匹配数 + 分数排序
        hits.sort(key=lambda h: (len(h.matched_ingredients), h.score), reverse=True)
        return hits[:top_k]

    def get_recipe_by_id(self, recipe_id: str) -> dict | None:
        """根据 ID 获取完整食谱"""
        recipes = self._load_recipes()
        for r in recipes:
            if r["id"] == recipe_id:
                return r
        return None


# 单例实例
_knowledge_service: KnowledgeService | None = None


def get_knowledge_service() -> KnowledgeService:
    global _knowledge_service
    if _knowledge_service is None:
        _knowledge_service = KnowledgeService()
    return _knowledge_service
