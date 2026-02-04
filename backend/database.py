"""
用户设置与偏好的关系型存储（SQLite）。
作为 Body Profile、Kitchen Preferences、System Settings 的唯一可信来源。
Mem0 仅作为 Agent 记忆层，由 API 在更新偏好时同步写入。
"""
from __future__ import annotations

import json
import sqlite3
from contextlib import contextmanager
from pathlib import Path
from typing import Any

from backend.core.config import DEFAULT_USER_ID, SQLITE_DB_PATH


def _dict_factory(cursor: sqlite3.Cursor, row: tuple) -> dict[str, Any]:
    return {cursor.description[i][0]: row[i] for i in range(len(row))}

# 表结构：单表存储当前用户（单用户场景，可扩展为多用户）
_SCHEMA = """
CREATE TABLE IF NOT EXISTS user (
    id TEXT PRIMARY KEY,
    -- Body Profile
    height INTEGER NOT NULL DEFAULT 170,
    weight REAL NOT NULL DEFAULT 65.0,
    goal TEXT NOT NULL DEFAULT 'maintain' CHECK(goal IN ('fat_loss', 'maintain', 'muscle_gain')),
    -- Kitchen Preferences
    dislikes TEXT NOT NULL DEFAULT '[]',
    cooking_level TEXT NOT NULL DEFAULT 'home_cook' CHECK(cooking_level IN ('survival', 'home_cook', 'chef')),
    -- System
    expiry_alert INTEGER NOT NULL DEFAULT 1,
    debug_mode INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
"""


def _ensure_data_dir() -> None:
    SQLITE_DB_PATH.parent.mkdir(parents=True, exist_ok=True)


@contextmanager
def get_connection():
    _ensure_data_dir()
    conn = sqlite3.connect(str(SQLITE_DB_PATH))
    conn.row_factory = _dict_factory
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def init_db() -> None:
    """创建表并插入默认用户（若不存在）。"""
    with get_connection() as conn:
        conn.executescript(_SCHEMA)
        cur = conn.execute("SELECT 1 FROM user WHERE id = ?", (DEFAULT_USER_ID,))
        if cur.fetchone() is None:
            from datetime import datetime
            now = datetime.utcnow().isoformat() + "Z"
            conn.execute(
                """INSERT INTO user (id, height, weight, goal, dislikes, cooking_level, expiry_alert, debug_mode, created_at, updated_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (DEFAULT_USER_ID, 170, 65.0, "maintain", "[]", "home_cook", 1, 0, now, now),
            )


def get_user_row(user_id: str) -> dict[str, Any] | None:
    with get_connection() as conn:
        cur = conn.execute("SELECT * FROM user WHERE id = ?", (user_id,))
        return cur.fetchone()


def get_profile(user_id: str) -> dict[str, Any] | None:
    """返回 API 所需的 profile 结构：body + preferences + system。"""
    row = get_user_row(user_id)
    if not row:
        return None
    try:
        dislikes = json.loads(row["dislikes"]) if row.get("dislikes") else []
    except (TypeError, json.JSONDecodeError):
        dislikes = []
    return {
        "profile": {
            "height": int(row["height"]),
            "weight": float(row["weight"]),
            "goal": row["goal"],
        },
        "preferences": {
            "dislikes": dislikes,
            "level": row["cooking_level"],
        },
        "system": {
            "expiry_alert": bool(row["expiry_alert"]),
            "debug_mode": bool(row["debug_mode"]),
        },
    }


def update_body_profile(user_id: str, height: int | None = None, weight: float | None = None, goal: str | None = None) -> bool:
    from datetime import datetime
    row = get_user_row(user_id)
    if row is None:
        return False
    updates = []
    params = []
    if height is not None:
        updates.append("height = ?")
        params.append(height)
    if weight is not None:
        updates.append("weight = ?")
        params.append(weight)
    if goal is not None:
        updates.append("goal = ?")
        params.append(goal)
    if not updates:
        return True
    params.append(datetime.utcnow().isoformat() + "Z")
    params.append(user_id)
    with get_connection() as conn:
        conn.execute(
            f"UPDATE user SET {', '.join(updates)}, updated_at = ? WHERE id = ?",
            params,
        )
    return True


def update_preferences(user_id: str, dislikes: list[str] | None = None, cooking_level: str | None = None) -> bool:
    from datetime import datetime
    row = get_user_row(user_id)
    if row is None:
        return False
    updates = []
    params = []
    if dislikes is not None:
        updates.append("dislikes = ?")
        params.append(json.dumps(dislikes, ensure_ascii=False))
    if cooking_level is not None:
        updates.append("cooking_level = ?")
        params.append(cooking_level)
    if not updates:
        return True
    params.append(datetime.utcnow().isoformat() + "Z")
    params.append(user_id)
    with get_connection() as conn:
        conn.execute(
            f"UPDATE user SET {', '.join(updates)}, updated_at = ? WHERE id = ?",
            params,
        )
    return True


def update_system(user_id: str, expiry_alert: bool | None = None, debug_mode: bool | None = None) -> bool:
    from datetime import datetime
    row = get_user_row(user_id)
    if row is None:
        return False
    updates = []
    params = []
    if expiry_alert is not None:
        updates.append("expiry_alert = ?")
        params.append(1 if expiry_alert else 0)
    if debug_mode is not None:
        updates.append("debug_mode = ?")
        params.append(1 if debug_mode else 0)
    if not updates:
        return True
    params.append(datetime.utcnow().isoformat() + "Z")
    params.append(user_id)
    with get_connection() as conn:
        conn.execute(
            f"UPDATE user SET {', '.join(updates)}, updated_at = ? WHERE id = ?",
            params,
        )
    return True


def get_dislikes(user_id: str) -> list[str]:
    row = get_user_row(user_id)
    if row is None:
        return []
    try:
        return json.loads(row["dislikes"]) if row["dislikes"] else []
    except (TypeError, json.JSONDecodeError):
        return []
