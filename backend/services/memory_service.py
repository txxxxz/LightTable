"""
MemoryService: 基于 Mem0 的用户长期记忆服务。
- Add Memory: 写入偏好、约束、目标
- Search Memory: 召回用户画像
"""
from __future__ import annotations

from backend.core.config import MEM0_API_KEY, has_mem0

# 本地 fallback 存储（当 Mem0 未配置时）
_local_memories: dict[str, list[str]] = {}


class MemoryService:
    """
    用户长期记忆服务。
    若配置了 MEM0_API_KEY，则使用 Mem0 云端；否则使用本地内存 fallback。
    """

    _instance: "MemoryService | None" = None
    _client: object | None = None

    def __new__(cls) -> "MemoryService":
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    def __init__(self) -> None:
        if MemoryService._client is not None:
            return
        if has_mem0():
            try:
                from mem0 import MemoryClient
                MemoryService._client = MemoryClient(api_key=MEM0_API_KEY)
                print("[MemoryService] Initialized with Mem0 cloud")
            except Exception as e:
                print(f"[MemoryService] Failed to init Mem0: {e}, using local fallback")
                MemoryService._client = None
        else:
            print("[MemoryService] MEM0_API_KEY not set, using local fallback")

    def add_memory(self, user_id: str, text: str) -> bool:
        """
        写入一条记忆。
        text 示例: "User likes spicy food", "User avoids sugar"
        """
        if MemoryService._client is not None:
            try:
                MemoryService._client.add(text, user_id=user_id)
                return True
            except Exception as e:
                print(f"[MemoryService] add error: {e}")
                return False
        else:
            # 本地 fallback
            if user_id not in _local_memories:
                _local_memories[user_id] = []
            # 简单去重
            if text not in _local_memories[user_id]:
                _local_memories[user_id].append(text)
            return True

    def search_memory(self, user_id: str, query: str, limit: int = 5) -> list[str]:
        """
        召回与 query 相关的记忆文本列表。
        Mem0 v2 API 需要 filters 参数。
        """
        if MemoryService._client is not None:
            try:
                # Mem0 v2: 使用 filters 格式获取用户记忆
                response = MemoryService._client.get_all(
                    filters={"user_id": user_id},
                    version="v2"
                )
                # Mem0 v2 返回格式: {"results": [{"memory": "...", ...}, ...]}
                results = response.get("results", []) if isinstance(response, dict) else response
                memories = [r.get("memory", "") for r in results if isinstance(r, dict) and r.get("memory")]
                # 简单关键词匹配
                query_lower = query.lower()
                matched = [m for m in memories if any(w in m.lower() for w in query_lower.split())]
                return matched[:limit] if matched else memories[:limit]
            except Exception as e:
                print(f"[MemoryService] search error: {e}")
                return []
        else:
            # 本地 fallback：简单关键词匹配
            user_mems = _local_memories.get(user_id, [])
            query_lower = query.lower()
            matched = [m for m in user_mems if any(w in m.lower() for w in query_lower.split())]
            return matched[:limit] if matched else user_mems[:limit]

    def get_profile_text(self, user_id: str) -> str:
        """
        聚合用户画像：偏好 + 约束 + 目标，返回短文本。
        """
        prefs = self.search_memory(user_id, "food preferences likes", limit=3)
        constraints = self.search_memory(user_id, "diet constraints avoids allergic", limit=3)
        goals = self.search_memory(user_id, "health goals diet keto", limit=2)

        all_mems = list(set(prefs + constraints + goals))
        if not all_mems:
            return ""
        # 简化：直接拼接
        return " ".join(all_mems[:5])

    def get_all_memories(self, user_id: str) -> list[str]:
        """获取用户所有记忆（调试用）"""
        if MemoryService._client is not None:
            try:
                # Mem0 v2: 使用 filters 格式
                response = MemoryService._client.get_all(
                    filters={"user_id": user_id},
                    version="v2"
                )
                # Mem0 v2 返回格式: {"results": [{"memory": "...", ...}, ...]}
                results = response.get("results", []) if isinstance(response, dict) else response
                return [r.get("memory", "") for r in results if isinstance(r, dict) and r.get("memory")]
            except Exception as e:
                print(f"[MemoryService] get_all error: {e}")
                return []
        else:
            return _local_memories.get(user_id, [])


# 单例实例
_memory_service: MemoryService | None = None


def get_memory_service() -> MemoryService:
    global _memory_service
    if _memory_service is None:
        _memory_service = MemoryService()
    return _memory_service
