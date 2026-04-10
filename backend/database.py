"""
SQLite persistence for LightTable MVP.

- `user` remains the source of truth for settings/profile.
- `inventory_items` stores normalized fridge state.
- `feedback_events` stores lightweight preference signals.
- `recommendation_history` supports de-dup and debugging.
- `shopping_list_items` powers procurement suggestions.
"""
from __future__ import annotations

import json
import sqlite3
import uuid
from contextlib import contextmanager
from pathlib import Path
from typing import Any

from backend.core.config import DEFAULT_USER_ID, SQLITE_DB_PATH
from backend.services.ingredient_service import (
    build_inventory_candidate,
    compute_status,
    get_default_category,
    get_default_storage_type,
    merge_quantity_text,
)


def _dict_factory(cursor: sqlite3.Cursor, row: tuple[Any, ...]) -> dict[str, Any]:
    return {cursor.description[i][0]: row[i] for i in range(len(row))}


USER_SCHEMA = """
CREATE TABLE IF NOT EXISTS user (
    id TEXT PRIMARY KEY,
    height INTEGER NOT NULL DEFAULT 170,
    weight REAL NOT NULL DEFAULT 65.0,
    goal TEXT NOT NULL DEFAULT 'maintain' CHECK(goal IN ('fat_loss', 'maintain', 'muscle_gain')),
    dislikes TEXT NOT NULL DEFAULT '[]',
    cooking_level TEXT NOT NULL DEFAULT 'home_cook' CHECK(cooking_level IN ('survival', 'home_cook', 'chef')),
    flavor_tags TEXT NOT NULL DEFAULT '[]',
    cuisine_tags TEXT NOT NULL DEFAULT '[]',
    method_tags TEXT NOT NULL DEFAULT '[]',
    health_constraints TEXT NOT NULL DEFAULT '[]',
    kitchen_tools TEXT NOT NULL DEFAULT '[]',
    household_size INTEGER NOT NULL DEFAULT 2,
    time_budget_minutes INTEGER NOT NULL DEFAULT 20,
    purchase_frequency_per_week INTEGER NOT NULL DEFAULT 2,
    sport_type TEXT DEFAULT '',
    training_days_per_week INTEGER,
    training_intensity TEXT DEFAULT '',
    competition_cycle TEXT DEFAULT '',
    training_notes TEXT DEFAULT '',
    expiry_alert INTEGER NOT NULL DEFAULT 1,
    debug_mode INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
"""

TABLE_SCHEMAS = """
CREATE TABLE IF NOT EXISTS inventory_items (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    display_name TEXT NOT NULL,
    normalized_name TEXT NOT NULL,
    category TEXT NOT NULL,
    quantity_text TEXT NOT NULL DEFAULT '1份',
    unit TEXT,
    storage_type TEXT NOT NULL DEFAULT 'fridge',
    date_added TEXT NOT NULL,
    estimated_expiry_date TEXT NOT NULL,
    source_type TEXT NOT NULL DEFAULT 'manual_text',
    image_url TEXT DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS feedback_events (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    recipe_id TEXT,
    signal TEXT NOT NULL,
    payload TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS recommendation_history (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    plan_payload TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS shopping_list_items (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    display_name TEXT NOT NULL,
    normalized_name TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'dry_goods',
    quantity_text TEXT DEFAULT '',
    recommended_quantity_text TEXT DEFAULT '',
    reason TEXT NOT NULL,
    priority TEXT NOT NULL DEFAULT 'optional',
    source TEXT NOT NULL DEFAULT 'system',
    checked INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
"""

USER_MIGRATIONS = [
    "ALTER TABLE user ADD COLUMN flavor_tags TEXT NOT NULL DEFAULT '[]';",
    "ALTER TABLE user ADD COLUMN cuisine_tags TEXT NOT NULL DEFAULT '[]';",
    "ALTER TABLE user ADD COLUMN method_tags TEXT NOT NULL DEFAULT '[]';",
    "ALTER TABLE user ADD COLUMN health_constraints TEXT NOT NULL DEFAULT '[]';",
    "ALTER TABLE user ADD COLUMN kitchen_tools TEXT NOT NULL DEFAULT '[]';",
    "ALTER TABLE user ADD COLUMN household_size INTEGER NOT NULL DEFAULT 2;",
    "ALTER TABLE user ADD COLUMN time_budget_minutes INTEGER NOT NULL DEFAULT 20;",
    "ALTER TABLE user ADD COLUMN purchase_frequency_per_week INTEGER NOT NULL DEFAULT 2;",
    "ALTER TABLE user ADD COLUMN sport_type TEXT DEFAULT '';",
    "ALTER TABLE user ADD COLUMN training_days_per_week INTEGER;",
    "ALTER TABLE user ADD COLUMN training_intensity TEXT DEFAULT '';",
    "ALTER TABLE user ADD COLUMN competition_cycle TEXT DEFAULT '';",
    "ALTER TABLE user ADD COLUMN training_notes TEXT DEFAULT '';",
]

SHOPPING_LIST_MIGRATIONS = [
    "ALTER TABLE shopping_list_items ADD COLUMN quantity_text TEXT DEFAULT '';",
    "ALTER TABLE shopping_list_items ADD COLUMN category TEXT NOT NULL DEFAULT 'dry_goods';",
    "ALTER TABLE shopping_list_items ADD COLUMN recommended_quantity_text TEXT DEFAULT '';",
]


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


def _parse_json_list(raw: Any) -> list[str]:
    if raw is None:
        return []
    if isinstance(raw, list):
        return [str(item) for item in raw if item is not None]
    try:
        value = json.loads(raw) if raw else []
    except (TypeError, json.JSONDecodeError):
        return []
    return [str(item) for item in value] if isinstance(value, list) else []


def _json_dumps(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False)


def _utc_now() -> str:
    from datetime import datetime

    return datetime.utcnow().isoformat() + "Z"


def _compute_bmi(height_cm: int | float | None, weight_kg: int | float | None) -> float | None:
    if not height_cm or not weight_kg:
        return None
    height_m = float(height_cm) / 100.0
    if height_m <= 0:
        return None
    return round(float(weight_kg) / (height_m * height_m), 1)


def init_db() -> None:
    with get_connection() as conn:
        conn.executescript(USER_SCHEMA)
        for sql in USER_MIGRATIONS:
            try:
                conn.execute(sql)
            except sqlite3.OperationalError as exc:
                if "duplicate column" not in str(exc).lower():
                    raise
        conn.executescript(TABLE_SCHEMAS)
        for sql in SHOPPING_LIST_MIGRATIONS:
            try:
                conn.execute(sql)
            except sqlite3.OperationalError as exc:
                if "duplicate column" not in str(exc).lower():
                    raise

        cur = conn.execute("SELECT 1 FROM user WHERE id = ?", (DEFAULT_USER_ID,))
        if cur.fetchone() is None:
            now = _utc_now()
            conn.execute(
                """
                INSERT INTO user (
                    id, height, weight, goal, dislikes, cooking_level, flavor_tags,
                    cuisine_tags, method_tags, health_constraints, kitchen_tools,
                    household_size, time_budget_minutes, purchase_frequency_per_week,
                    sport_type, training_days_per_week, training_intensity, competition_cycle,
                    training_notes,
                    expiry_alert, debug_mode,
                    created_at, updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    DEFAULT_USER_ID,
                    170,
                    65.0,
                    "maintain",
                    "[]",
                    "home_cook",
                    "[]",
                    "[]",
                    "[]",
                    "[]",
                    "[]",
                    2,
                    20,
                    2,
                    "",
                    None,
                    "",
                    "",
                    "",
                    1,
                    0,
                    now,
                    now,
                ),
            )


def get_user_row(user_id: str) -> dict[str, Any] | None:
    with get_connection() as conn:
        cur = conn.execute("SELECT * FROM user WHERE id = ?", (user_id,))
        return cur.fetchone()


def get_profile(user_id: str) -> dict[str, Any] | None:
    row = get_user_row(user_id)
    if not row:
        return None
    return {
        "profile": {
            "height": int(row["height"]),
            "weight": float(row["weight"]),
            "bmi": _compute_bmi(row.get("height"), row.get("weight")),
            "goal": row["goal"],
            "household_size": int(row.get("household_size", 2)),
            "time_budget_minutes": int(row.get("time_budget_minutes", 20)),
            "purchase_frequency_per_week": int(row.get("purchase_frequency_per_week", 2)),
            "sport_type": (row.get("sport_type") or "").strip() or None,
            "training_days_per_week": (
                int(row["training_days_per_week"])
                if row.get("training_days_per_week") not in (None, "")
                and int(row["training_days_per_week"]) > 0
                else None
            ),
            "training_intensity": (row.get("training_intensity") or "").strip() or None,
            "competition_cycle": (row.get("competition_cycle") or "").strip() or None,
            "training_notes": (row.get("training_notes") or "").strip() or None,
        },
        "preferences": {
            "dislikes": _parse_json_list(row.get("dislikes")),
            "level": row["cooking_level"],
            "flavors": _parse_json_list(row.get("flavor_tags")),
            "cuisines": _parse_json_list(row.get("cuisine_tags")),
            "methods": _parse_json_list(row.get("method_tags")),
            "health_constraints": _parse_json_list(row.get("health_constraints")),
            "kitchen_tools": _parse_json_list(row.get("kitchen_tools")),
        },
        "system": {
            "expiry_alert": bool(row["expiry_alert"]),
            "debug_mode": bool(row["debug_mode"]),
        },
    }


def update_body_profile(
    user_id: str,
    *,
    height: int | None = None,
    weight: float | None = None,
    goal: str | None = None,
    household_size: int | None = None,
    time_budget_minutes: int | None = None,
    purchase_frequency_per_week: int | None = None,
    sport_type: str | None = None,
    training_days_per_week: int | None = None,
    training_intensity: str | None = None,
    competition_cycle: str | None = None,
    training_notes: str | None = None,
) -> bool:
    row = get_user_row(user_id)
    if row is None:
        return False
    updates: list[str] = []
    params: list[Any] = []
    if height is not None:
        updates.append("height = ?")
        params.append(height)
    if weight is not None:
        updates.append("weight = ?")
        params.append(weight)
    if goal is not None:
        updates.append("goal = ?")
        params.append(goal)
    if household_size is not None:
        updates.append("household_size = ?")
        params.append(household_size)
    if time_budget_minutes is not None:
        updates.append("time_budget_minutes = ?")
        params.append(time_budget_minutes)
    if purchase_frequency_per_week is not None:
        updates.append("purchase_frequency_per_week = ?")
        params.append(max(1, min(4, int(purchase_frequency_per_week))))
    if sport_type is not None:
        updates.append("sport_type = ?")
        params.append(sport_type.strip())
    if training_days_per_week is not None:
        updates.append("training_days_per_week = ?")
        params.append(max(0, min(14, int(training_days_per_week))))
    if training_intensity is not None:
        updates.append("training_intensity = ?")
        params.append(training_intensity.strip())
    if competition_cycle is not None:
        updates.append("competition_cycle = ?")
        params.append(competition_cycle.strip())
    if training_notes is not None:
        updates.append("training_notes = ?")
        params.append(training_notes.strip())
    if not updates:
        return True
    params.extend([_utc_now(), user_id])
    with get_connection() as conn:
        conn.execute(
            f"UPDATE user SET {', '.join(updates)}, updated_at = ? WHERE id = ?",
            params,
        )
    return True


def update_preferences(
    user_id: str,
    *,
    dislikes: list[str] | None = None,
    cooking_level: str | None = None,
    flavor_tags: list[str] | None = None,
    cuisine_tags: list[str] | None = None,
    method_tags: list[str] | None = None,
    health_constraints: list[str] | None = None,
    kitchen_tools: list[str] | None = None,
) -> bool:
    row = get_user_row(user_id)
    if row is None:
        return False
    updates: list[str] = []
    params: list[Any] = []
    if dislikes is not None:
        updates.append("dislikes = ?")
        params.append(_json_dumps(dislikes))
    if cooking_level is not None:
        updates.append("cooking_level = ?")
        params.append(cooking_level)
    if flavor_tags is not None:
        updates.append("flavor_tags = ?")
        params.append(_json_dumps(flavor_tags))
    if cuisine_tags is not None:
        updates.append("cuisine_tags = ?")
        params.append(_json_dumps(cuisine_tags))
    if method_tags is not None:
        updates.append("method_tags = ?")
        params.append(_json_dumps(method_tags))
    if health_constraints is not None:
        updates.append("health_constraints = ?")
        params.append(_json_dumps(health_constraints))
    if kitchen_tools is not None:
        updates.append("kitchen_tools = ?")
        params.append(_json_dumps(kitchen_tools))
    if not updates:
        return True
    params.extend([_utc_now(), user_id])
    with get_connection() as conn:
        conn.execute(
            f"UPDATE user SET {', '.join(updates)}, updated_at = ? WHERE id = ?",
            params,
        )
    return True


def update_system(
    user_id: str,
    *,
    expiry_alert: bool | None = None,
    debug_mode: bool | None = None,
) -> bool:
    row = get_user_row(user_id)
    if row is None:
        return False
    updates: list[str] = []
    params: list[Any] = []
    if expiry_alert is not None:
        updates.append("expiry_alert = ?")
        params.append(1 if expiry_alert else 0)
    if debug_mode is not None:
        updates.append("debug_mode = ?")
        params.append(1 if debug_mode else 0)
    if not updates:
        return True
    params.extend([_utc_now(), user_id])
    with get_connection() as conn:
        conn.execute(
            f"UPDATE user SET {', '.join(updates)}, updated_at = ? WHERE id = ?",
            params,
        )
    return True


def get_dislikes(user_id: str) -> list[str]:
    row = get_user_row(user_id)
    return _parse_json_list(row.get("dislikes") if row else [])


def list_inventory(user_id: str) -> list[dict[str, Any]]:
    with get_connection() as conn:
        rows = conn.execute(
            """
            SELECT *
            FROM inventory_items
            WHERE user_id = ?
            ORDER BY
                CASE
                    WHEN julianday(estimated_expiry_date) - julianday('now') < 0 THEN 0
                    WHEN julianday(estimated_expiry_date) - julianday('now') <= 2 THEN 1
                    ELSE 2
                END,
                estimated_expiry_date ASC,
                updated_at DESC
            """,
            (user_id,),
        ).fetchall()
    items: list[dict[str, Any]] = []
    for row in rows:
        item = dict(row)
        item["status"] = compute_status(item["estimated_expiry_date"])
        items.append(item)
    return items


def get_inventory_item(user_id: str, item_id: str) -> dict[str, Any] | None:
    with get_connection() as conn:
        row = conn.execute(
            "SELECT * FROM inventory_items WHERE user_id = ? AND id = ?",
            (user_id, item_id),
        ).fetchone()
    if not row:
        return None
    result = dict(row)
    result["status"] = compute_status(result["estimated_expiry_date"])
    return result


def upsert_inventory_items(user_id: str, items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    saved_items: list[dict[str, Any]] = []
    with get_connection() as conn:
        for item in items:
            existing = conn.execute(
                """
                SELECT *
                FROM inventory_items
                WHERE user_id = ? AND normalized_name = ?
                """,
                (user_id, item["normalized_name"]),
            ).fetchone()

            now = _utc_now()
            if existing:
                merged_quantity = merge_quantity_text(existing.get("quantity_text"), item.get("quantity_text"))
                conn.execute(
                    """
                    UPDATE inventory_items
                    SET display_name = ?, category = ?, quantity_text = ?, unit = ?,
                        storage_type = ?, date_added = ?, estimated_expiry_date = ?,
                        source_type = ?, image_url = ?, updated_at = ?
                    WHERE id = ?
                    """,
                    (
                        item["display_name"],
                        item["category"],
                        merged_quantity,
                        item.get("unit"),
                        item["storage_type"],
                        item["date_added"],
                        item["estimated_expiry_date"],
                        item["source_type"],
                        item.get("image_url", ""),
                        now,
                        existing["id"],
                    ),
                )
                saved_items.append(
                    {
                        **item,
                        "id": existing["id"],
                        "quantity_text": merged_quantity,
                        "status": compute_status(item["estimated_expiry_date"]),
                    }
                )
                continue

            item_id = item.get("id") or f"inv_{uuid.uuid4().hex[:10]}"
            conn.execute(
                """
                INSERT INTO inventory_items (
                    id, user_id, display_name, normalized_name, category, quantity_text,
                    unit, storage_type, date_added, estimated_expiry_date, source_type,
                    image_url, created_at, updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    item_id,
                    user_id,
                    item["display_name"],
                    item["normalized_name"],
                    item["category"],
                    item.get("quantity_text") or "1份",
                    item.get("unit"),
                    item["storage_type"],
                    item["date_added"],
                    item["estimated_expiry_date"],
                    item["source_type"],
                    item.get("image_url", ""),
                    now,
                    now,
                ),
            )
            saved_items.append(
                {
                    **item,
                    "id": item_id,
                    "status": compute_status(item["estimated_expiry_date"]),
                }
            )
    return saved_items


def update_inventory_item(user_id: str, item_id: str, updates: dict[str, Any]) -> dict[str, Any] | None:
    existing = get_inventory_item(user_id, item_id)
    if not existing:
        return None

    merged = {**existing, **updates}
    candidate = build_inventory_candidate(
        merged["display_name"],
        quantity_text=merged.get("quantity_text"),
        category=merged.get("category"),
        storage_type=merged.get("storage_type"),
        source_type=merged.get("source_type", "manual_form"),
        date_added=merged.get("date_added"),
        image_url=merged.get("image_url"),
    )
    candidate["id"] = item_id
    candidate["normalized_name"] = merged.get("normalized_name") or candidate["normalized_name"]
    candidate["display_name"] = merged.get("display_name") or candidate["display_name"]
    candidate["quantity_text"] = merged.get("quantity_text") or candidate["quantity_text"]
    candidate["unit"] = merged.get("unit") or candidate["unit"]

    with get_connection() as conn:
        conn.execute(
            """
            UPDATE inventory_items
            SET display_name = ?, normalized_name = ?, category = ?, quantity_text = ?,
                unit = ?, storage_type = ?, date_added = ?, estimated_expiry_date = ?,
                source_type = ?, image_url = ?, updated_at = ?
            WHERE id = ? AND user_id = ?
            """,
            (
                candidate["display_name"],
                candidate["normalized_name"],
                candidate["category"],
                candidate["quantity_text"],
                candidate.get("unit"),
                candidate["storage_type"],
                candidate["date_added"],
                candidate["estimated_expiry_date"],
                candidate["source_type"],
                candidate.get("image_url", ""),
                _utc_now(),
                item_id,
                user_id,
            ),
        )
    return get_inventory_item(user_id, item_id)


def delete_inventory_item(user_id: str, item_id: str) -> bool:
    with get_connection() as conn:
        cur = conn.execute(
            "DELETE FROM inventory_items WHERE user_id = ? AND id = ?",
            (user_id, item_id),
        )
    return cur.rowcount > 0


def record_feedback_event(
    user_id: str,
    *,
    signal: str,
    recipe_id: str | None = None,
    payload: dict[str, Any] | None = None,
) -> dict[str, Any]:
    event = {
        "id": f"fb_{uuid.uuid4().hex[:10]}",
        "user_id": user_id,
        "recipe_id": recipe_id,
        "signal": signal,
        "payload": payload or {},
        "created_at": _utc_now(),
    }
    with get_connection() as conn:
        conn.execute(
            """
            INSERT INTO feedback_events (id, user_id, recipe_id, signal, payload, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                event["id"],
                event["user_id"],
                event["recipe_id"],
                event["signal"],
                _json_dumps(event["payload"]),
                event["created_at"],
            ),
        )
    return event


def list_feedback_events(user_id: str, *, limit: int = 50) -> list[dict[str, Any]]:
    with get_connection() as conn:
        rows = conn.execute(
            """
            SELECT *
            FROM feedback_events
            WHERE user_id = ?
            ORDER BY created_at DESC
            LIMIT ?
            """,
            (user_id, limit),
        ).fetchall()
    events: list[dict[str, Any]] = []
    for row in rows:
        event = dict(row)
        try:
            event["payload"] = json.loads(event.get("payload") or "{}")
        except json.JSONDecodeError:
            event["payload"] = {}
        events.append(event)
    return events


def record_recommendation(user_id: str, plan_payload: dict[str, Any]) -> dict[str, Any]:
    record = {
        "id": f"rec_{uuid.uuid4().hex[:10]}",
        "user_id": user_id,
        "plan_payload": plan_payload,
        "created_at": _utc_now(),
    }
    with get_connection() as conn:
        conn.execute(
            """
            INSERT INTO recommendation_history (id, user_id, plan_payload, created_at)
            VALUES (?, ?, ?, ?)
            """,
            (record["id"], user_id, _json_dumps(plan_payload), record["created_at"]),
        )
    return record


def list_recent_recommendations(user_id: str, *, limit: int = 10) -> list[dict[str, Any]]:
    with get_connection() as conn:
        rows = conn.execute(
            """
            SELECT *
            FROM recommendation_history
            WHERE user_id = ?
            ORDER BY created_at DESC
            LIMIT ?
            """,
            (user_id, limit),
        ).fetchall()
    recommendations: list[dict[str, Any]] = []
    for row in rows:
        item = dict(row)
        try:
            item["plan_payload"] = json.loads(item.get("plan_payload") or "{}")
        except json.JSONDecodeError:
            item["plan_payload"] = {}
        recommendations.append(item)
    return recommendations


def get_generated_recipe(user_id: str, recipe_id: str, *, limit: int = 20) -> dict[str, Any] | None:
    for record in list_recent_recommendations(user_id, limit=limit):
        payload = record.get("plan_payload") or {}
        generated_recipes = payload.get("generated_recipes") or {}
        recipe = generated_recipes.get(recipe_id)
        if isinstance(recipe, dict):
            return recipe
    return None


def replace_shopping_list_items(user_id: str, items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    now = _utc_now()
    with get_connection() as conn:
        conn.execute("DELETE FROM shopping_list_items WHERE user_id = ?", (user_id,))
        for item in items:
            conn.execute(
                """
                INSERT INTO shopping_list_items (
                    id, user_id, display_name, normalized_name, category, quantity_text,
                    recommended_quantity_text, reason, priority, source, checked, created_at, updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    item.get("id") or f"shop_{uuid.uuid4().hex[:10]}",
                    user_id,
                    item["display_name"],
                    item["normalized_name"],
                    item.get("category") or "dry_goods",
                    item.get("quantity_text") or "",
                    item.get("recommended_quantity_text") or "",
                    item["reason"],
                    item.get("priority", "optional"),
                    item.get("source", "system"),
                    1 if item.get("checked") else 0,
                    now,
                    now,
                ),
            )
    return list_shopping_list_items(user_id)


def list_shopping_list_items(user_id: str) -> list[dict[str, Any]]:
    with get_connection() as conn:
        rows = conn.execute(
            """
            SELECT *
            FROM shopping_list_items
            WHERE user_id = ?
            ORDER BY CASE priority WHEN 'must_buy' THEN 0 ELSE 1 END, created_at DESC
            """,
            (user_id,),
        ).fetchall()
    return [dict(row) for row in rows]


def update_shopping_list_item(user_id: str, item_id: str, *, checked: bool) -> dict[str, Any] | None:
    with get_connection() as conn:
        conn.execute(
            """
            UPDATE shopping_list_items
            SET checked = ?, updated_at = ?
            WHERE user_id = ? AND id = ?
            """,
            (1 if checked else 0, _utc_now(), user_id, item_id),
        )
        row = conn.execute(
            "SELECT * FROM shopping_list_items WHERE user_id = ? AND id = ?",
            (user_id, item_id),
        ).fetchone()
    return dict(row) if row else None


def add_manual_shopping_item(
    user_id: str,
    *,
    display_name: str,
    normalized_name: str,
    category: str | None = None,
    quantity_text: str | None,
    recommended_quantity_text: str | None = None,
    reason: str,
    priority: str = "optional",
) -> dict[str, Any]:
    safe_category = category or get_default_category(normalized_name)
    with get_connection() as conn:
        existing = conn.execute(
            """
            SELECT *
            FROM shopping_list_items
            WHERE user_id = ? AND normalized_name = ?
            """,
            (user_id, normalized_name),
        ).fetchone()
        now = _utc_now()
        if existing is not None:
            merged_reason = existing["reason"]
            if reason and reason not in merged_reason:
                merged_reason = f"{merged_reason}；{reason}" if merged_reason else reason
            merged_quantity = merge_quantity_text(existing.get("quantity_text"), quantity_text)
            conn.execute(
                """
                UPDATE shopping_list_items
                SET display_name = ?, category = ?, quantity_text = ?, recommended_quantity_text = ?,
                    reason = ?, priority = ?,
                    source = 'manual', checked = 0, updated_at = ?
                WHERE user_id = ? AND normalized_name = ?
                """,
                (
                    display_name,
                    safe_category,
                    merged_quantity,
                    recommended_quantity_text or merged_quantity,
                    merged_reason,
                    priority,
                    now,
                    user_id,
                    normalized_name,
                ),
            )
            row = conn.execute(
                """
                SELECT *
                FROM shopping_list_items
                WHERE user_id = ? AND normalized_name = ?
                """,
                (user_id, normalized_name),
            ).fetchone()
            return dict(row) if row else {}

        item = {
            "id": f"shop_{uuid.uuid4().hex[:10]}",
            "display_name": display_name,
            "normalized_name": normalized_name,
            "category": safe_category,
            "quantity_text": quantity_text or "",
            "recommended_quantity_text": recommended_quantity_text or quantity_text or "",
            "reason": reason,
            "priority": priority,
            "source": "manual",
            "checked": 0,
        }
        conn.execute(
            """
            INSERT INTO shopping_list_items (
                id, user_id, display_name, normalized_name, category, quantity_text,
                recommended_quantity_text, reason, priority, source, checked, created_at, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                item["id"],
                user_id,
                item["display_name"],
                item["normalized_name"],
                item["category"],
                item["quantity_text"],
                item["recommended_quantity_text"],
                item["reason"],
                item["priority"],
                item["source"],
                0,
                now,
                now,
            ),
        )
    return item


def add_shopping_items_to_inventory(
    user_id: str,
    *,
    item_ids: list[str] | None = None,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]], int]:
    with get_connection() as conn:
        params: list[Any] = [user_id]
        query = """
            SELECT *
            FROM shopping_list_items
            WHERE user_id = ? AND checked = 1
        """
        if item_ids:
            placeholders = ", ".join("?" for _ in item_ids)
            query += f" AND id IN ({placeholders})"
            params.extend(item_ids)
        query += " ORDER BY updated_at DESC, created_at DESC"
        rows = conn.execute(query, params).fetchall()

    selected_items = [dict(row) for row in rows]
    if not selected_items:
        return list_inventory(user_id), list_shopping_list_items(user_id), 0

    inventory_candidates: list[dict[str, Any]] = []
    moved_ids: list[str] = []
    today = _utc_now().split("T", 1)[0]

    for item in selected_items:
        quantity_text = item.get("quantity_text") or item.get("recommended_quantity_text") or "1份"
        candidate = build_inventory_candidate(
            item["display_name"],
            quantity_text=quantity_text,
            category=item.get("category"),
            storage_type=get_default_storage_type(item.get("normalized_name") or ""),
            source_type="manual_form",
            date_added=today,
        )
        candidate["display_name"] = item["display_name"]
        candidate["normalized_name"] = item.get("normalized_name") or candidate["normalized_name"]
        candidate["category"] = item.get("category") or candidate["category"]
        inventory_candidates.append(candidate)
        moved_ids.append(item["id"])

    upsert_inventory_items(user_id, inventory_candidates)

    with get_connection() as conn:
        placeholders = ", ".join("?" for _ in moved_ids)
        conn.execute(
            f"DELETE FROM shopping_list_items WHERE user_id = ? AND id IN ({placeholders})",
            [user_id, *moved_ids],
        )

    return list_inventory(user_id), list_shopping_list_items(user_id), len(moved_ids)
