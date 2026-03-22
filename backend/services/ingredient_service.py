from __future__ import annotations

import json
import re
import uuid
from dataclasses import dataclass
from datetime import date, timedelta

from backend.services.llm_service import (
    is_configured as llm_is_configured,
    vision_chat,
)


CATEGORY_ORDER = (
    "dairy",
    "vegetables_tofu",
    "meat_poultry_eggs",
    "seafood",
    "pantry_condiments",
    "dry_goods",
    "baking_dairy",
    "ready_meals",
    "beverages",
    "fruit_snacks",
)

CATEGORY_LABELS = {
    "dairy": "乳制品",
    "vegetables_tofu": "蔬菜豆制品",
    "meat_poultry_eggs": "肉禽蛋",
    "seafood": "海鲜水产",
    "pantry_condiments": "粮油调味",
    "dry_goods": "干货",
    "baking_dairy": "乳品烘焙",
    "ready_meals": "熟食快手菜",
    "beverages": "酒水饮料",
    "fruit_snacks": "水果零食",
}

CATEGORY_LABEL_TO_KEY = {label: key for key, label in CATEGORY_LABELS.items()}

CATEGORY_KEYWORDS: tuple[tuple[str, tuple[str, ...]], ...] = (
    ("pantry_condiments", ("蚝油", "酱油", "生抽", "老抽", "醋", "盐", "白糖", "冰糖", "淀粉", "料酒", "辣椒油", "花椒", "胡椒", "食用油", "香油", "橄榄油", "调味", "香料")),
    ("baking_dairy", ("黄油", "奶油", "芝士", "奶酪", "面粉", "酵母", "炼乳", "可可粉", "淡奶油")),
    ("ready_meals", ("熟食", "卤", "午餐肉", "罐头", "速冻", "丸子", "饺子", "包子", "手抓饼", "预制", "快手菜")),
    ("beverages", ("酒", "饮料", "气泡水", "可乐", "汽水", "咖啡", "奶茶", "茶", "果汁", "苏打水")),
    ("seafood", ("虾", "鱼", "蟹", "贝", "蛤", "蚬", "蚝", "鱿", "海鲜", "鲍")),
    ("meat_poultry_eggs", ("鸡", "鸭", "鹅", "猪", "牛", "羊", "排骨", "肉", "肉丸", "香肠", "火腿", "蛋")),
    ("vegetables_tofu", ("豆腐", "豆皮", "豆芽", "青菜", "白菜", "卷心菜", "番茄", "西红柿", "黄瓜", "茄子", "辣椒", "青椒", "萝卜", "生菜", "西兰花", "蘑菇", "南瓜", "土豆")),
    ("dairy", ("牛奶", "酸奶", "乳", "奶")),
    ("fruit_snacks", ("苹果", "香蕉", "芒果", "橙", "橘", "桃", "梨", "莓", "葡萄", "水果", "零食", "薯片", "饼干", "坚果", "果")),
    ("dry_goods", ("大米", "米", "燕麦", "面条", "挂面", "粉丝", "米线", "干货", "木耳", "海带", "银耳", "豆类", "杂粮", "菌菇", "蘑菇干")),
)


@dataclass(frozen=True)
class IngredientCatalogEntry:
    token: str
    display_name: str
    category: str
    default_storage_type: str
    default_expiry_days: int
    synonyms: tuple[str, ...]
    shopping_unit: str = "份"


CATALOG: tuple[IngredientCatalogEntry, ...] = (
    IngredientCatalogEntry("tomato_cherry", "圣女果", "vegetables_tofu", "fridge", 4, ("圣女果", "小番茄", "樱桃番茄"), "盒"),
    IngredientCatalogEntry("tomato", "番茄", "vegetables_tofu", "fridge", 5, ("番茄", "西红柿", "大番茄"), "个"),
    IngredientCatalogEntry("pepper", "青椒", "vegetables_tofu", "fridge", 5, ("青椒", "甜椒", "菜椒"), "个"),
    IngredientCatalogEntry("chili_pepper", "辣椒", "vegetables_tofu", "fridge", 5, ("辣椒", "红辣椒", "小米椒"), "把"),
    IngredientCatalogEntry("egg", "鸡蛋", "meat_poultry_eggs", "fridge", 14, ("鸡蛋", "鸡蛋仔", "蛋"), "个"),
    IngredientCatalogEntry("lettuce", "生菜", "vegetables_tofu", "fridge", 3, ("生菜", "油麦菜", "罗马生菜"), "颗"),
    IngredientCatalogEntry("milk", "牛奶", "dairy", "fridge", 7, ("牛奶", "纯牛奶", "低脂牛奶"), "盒"),
    IngredientCatalogEntry("tofu", "豆腐", "vegetables_tofu", "fridge", 3, ("豆腐", "嫩豆腐", "北豆腐", "南豆腐"), "盒"),
    IngredientCatalogEntry("cucumber", "黄瓜", "vegetables_tofu", "fridge", 5, ("黄瓜",), "根"),
    IngredientCatalogEntry("chicken", "鸡胸肉", "meat_poultry_eggs", "fridge", 2, ("鸡胸肉", "鸡肉", "鸡腿肉"), "份"),
    IngredientCatalogEntry("broccoli", "西兰花", "vegetables_tofu", "fridge", 4, ("西兰花", "花椰菜"), "朵"),
    IngredientCatalogEntry("beef", "牛肉", "meat_poultry_eggs", "fridge", 2, ("牛肉", "牛里脊", "牛腱子"), "份"),
    IngredientCatalogEntry("pork_belly", "五花肉", "meat_poultry_eggs", "fridge", 2, ("五花肉", "猪五花"), "斤"),
    IngredientCatalogEntry("mushroom", "蘑菇", "vegetables_tofu", "fridge", 4, ("蘑菇", "香菇", "口蘑", "平菇"), "盒"),
    IngredientCatalogEntry("shrimp", "虾仁", "seafood", "fridge", 2, ("虾仁", "鲜虾", "虾"), "份"),
    IngredientCatalogEntry("salmon", "三文鱼", "seafood", "fridge", 2, ("三文鱼", "鲑鱼"), "块"),
    IngredientCatalogEntry("spinach", "菠菜", "vegetables_tofu", "fridge", 3, ("菠菜",), "把"),
    IngredientCatalogEntry("cabbage", "卷心菜", "vegetables_tofu", "fridge", 5, ("卷心菜", "圆白菜", "包菜"), "颗"),
    IngredientCatalogEntry("mango", "芒果", "fruit_snacks", "fridge", 5, ("芒果",), "个"),
    IngredientCatalogEntry("oats", "燕麦", "dry_goods", "pantry", 30, ("燕麦", "燕麦片"), "袋"),
    IngredientCatalogEntry("yogurt", "酸奶", "dairy", "fridge", 7, ("酸奶", "希腊酸奶"), "盒"),
    IngredientCatalogEntry("scallion", "葱", "pantry_condiments", "fridge", 5, ("葱", "小葱", "香葱"), "把"),
    IngredientCatalogEntry("garlic", "蒜", "pantry_condiments", "pantry", 30, ("蒜", "蒜瓣", "大蒜"), "头"),
    IngredientCatalogEntry("ginger", "姜", "pantry_condiments", "pantry", 20, ("姜", "生姜"), "块"),
    IngredientCatalogEntry("rice", "大米", "dry_goods", "pantry", 30, ("米饭", "大米"), "袋"),
    IngredientCatalogEntry("flour", "面粉", "baking_dairy", "pantry", 60, ("面粉", "小麦粉"), "袋"),
    IngredientCatalogEntry("noodle", "面条", "dry_goods", "pantry", 45, ("面条", "挂面", "乌冬面"), "袋"),
    IngredientCatalogEntry("oyster_sauce", "蚝油", "pantry_condiments", "pantry", 180, ("蚝油",), "瓶"),
    IngredientCatalogEntry("soy_sauce", "酱油", "pantry_condiments", "pantry", 180, ("酱油", "生抽", "老抽"), "瓶"),
    IngredientCatalogEntry("cooking_wine", "料酒", "pantry_condiments", "pantry", 180, ("料酒",), "瓶"),
    IngredientCatalogEntry("vinegar", "醋", "pantry_condiments", "pantry", 180, ("醋", "陈醋", "香醋", "白醋"), "瓶"),
    IngredientCatalogEntry("starch", "淀粉", "pantry_condiments", "pantry", 180, ("淀粉", "水淀粉", "玉米淀粉"), "袋"),
    IngredientCatalogEntry("sugar", "糖", "pantry_condiments", "pantry", 180, ("糖", "白糖", "冰糖"), "袋"),
    IngredientCatalogEntry("salt", "盐", "pantry_condiments", "pantry", 180, ("盐",), "袋"),
    IngredientCatalogEntry("black_pepper", "胡椒", "pantry_condiments", "pantry", 180, ("胡椒", "黑胡椒", "胡椒粉"), "瓶"),
    IngredientCatalogEntry("chili_oil", "辣椒油", "pantry_condiments", "pantry", 180, ("辣椒油",), "瓶"),
    IngredientCatalogEntry("cooking_oil", "食用油", "pantry_condiments", "pantry", 180, ("食用油", "橄榄油", "香油", "菜籽油", "花生油"), "瓶"),
    IngredientCatalogEntry("butter", "黄油", "baking_dairy", "fridge", 30, ("黄油",), "盒"),
    IngredientCatalogEntry("cream", "奶油", "baking_dairy", "fridge", 15, ("奶油", "淡奶油"), "盒"),
    IngredientCatalogEntry("cheese", "芝士", "baking_dairy", "fridge", 20, ("芝士", "奶酪"), "袋"),
    IngredientCatalogEntry("yeast", "酵母", "baking_dairy", "pantry", 180, ("酵母",), "袋"),
    IngredientCatalogEntry("dumplings", "速冻饺子", "ready_meals", "freezer", 30, ("速冻饺子", "饺子"), "袋"),
    IngredientCatalogEntry("luncheon_meat", "午餐肉", "ready_meals", "pantry", 120, ("午餐肉",), "罐"),
    IngredientCatalogEntry("sparkling_water", "气泡水", "beverages", "pantry", 90, ("气泡水", "苏打水"), "瓶"),
    IngredientCatalogEntry("cola", "可乐", "beverages", "pantry", 90, ("可乐", "汽水"), "瓶"),
    IngredientCatalogEntry("juice", "果汁", "beverages", "pantry", 30, ("果汁",), "盒"),
    IngredientCatalogEntry("snack", "零食", "fruit_snacks", "pantry", 60, ("零食", "薯片", "饼干", "坚果"), "袋"),
)

CATALOG_BY_TOKEN = {entry.token: entry for entry in CATALOG}

ALIAS_TO_TOKEN: dict[str, str] = {}
for entry in CATALOG:
    ALIAS_TO_TOKEN[entry.display_name] = entry.token
    for synonym in entry.synonyms:
        ALIAS_TO_TOKEN[synonym] = entry.token

ALIASES_SORTED = sorted(ALIAS_TO_TOKEN, key=len, reverse=True)
EMBEDDED_ALIASES_SORTED = [alias for alias in ALIASES_SORTED if len(alias) > 1]

SOURCE_TYPES = {"manual_text", "manual_form", "image", "receipt"}
STORAGE_TYPES = {"fridge", "freezer", "pantry"}

QUANTITY_PATTERN = re.compile(
    r"(半(?:盒|袋|个|把|瓶|包|颗|根|块|斤|kg|g|克|毫升|ml|勺)?|少许|适量|一点|[一二两三四五六七八九十百\d]+(?:\.\d+)?\s*(?:个|盒|袋|瓶|包|把|根|块|颗|斤|kg|g|克|毫升|ml|勺))"
)

PREFIX_QUANTITY_PATTERN = re.compile(
    rf"^\s*{QUANTITY_PATTERN.pattern}\s*(.+)$"
)
SUFFIX_QUANTITY_PATTERN = re.compile(
    rf"^(.+?)\s*{QUANTITY_PATTERN.pattern}\s*$"
)

CHINESE_NUMBERS = {
    "零": 0,
    "一": 1,
    "二": 2,
    "两": 2,
    "三": 3,
    "四": 4,
    "五": 5,
    "六": 6,
    "七": 7,
    "八": 8,
    "九": 9,
    "十": 10,
}

CONNECTOR_SPLIT_PATTERN = re.compile(r"(?:、|和|及|还有|再来|再买|外加|加上|\+|,|，)")
LEADING_NOISE_PATTERN = re.compile(r"^(?:买了?|补货|补一点|补点|来点|需要|想买|还要|还有|再来|再买)+")
TRAILING_NOISE_PATTERN = re.compile(r"(?:还有|和|及|等|吧|呀)+$")


class ImageRecognitionError(Exception):
    def __init__(self, detail: str, *, status_code: int = 422) -> None:
        super().__init__(detail)
        self.detail = detail
        self.status_code = status_code


def normalize_display_name(name: str) -> str:
    cleaned = re.sub(r"\s+", "", name.strip())
    cleaned = re.sub(r"[（(].*?[)）]", "", cleaned)
    cleaned = re.sub(r"^\d+(?:\.\d+)?\s*(?:g|kg|克|斤)", "", cleaned, flags=re.IGNORECASE)
    return cleaned


def normalize_ingredient_name(name: str) -> str:
    cleaned = normalize_display_name(name)
    if cleaned in ALIAS_TO_TOKEN:
        return ALIAS_TO_TOKEN[cleaned]
    for alias in EMBEDDED_ALIASES_SORTED:
        if alias in cleaned:
            return ALIAS_TO_TOKEN[alias]
    slug = re.sub(r"[^\w\u4e00-\u9fff]+", "_", cleaned.lower()).strip("_")
    return slug or "ingredient"


def get_catalog_entry(token: str) -> IngredientCatalogEntry | None:
    return CATALOG_BY_TOKEN.get(token)


def get_default_display_name(token: str, fallback: str | None = None) -> str:
    entry = get_catalog_entry(token)
    return entry.display_name if entry else (fallback or token)


def get_default_storage_type(token: str) -> str:
    entry = get_catalog_entry(token)
    return entry.default_storage_type if entry else "fridge"


def get_default_category(token: str, fallback: str | None = None) -> str:
    entry = get_catalog_entry(token)
    if entry:
        return entry.category
    probe = fallback or token
    for category, keywords in CATEGORY_KEYWORDS:
        if any(keyword in probe for keyword in keywords):
            return category
    return "other"


def ensure_category_key(
    category: str | None,
    *,
    raw_name: str | None = None,
    normalized_name: str | None = None,
) -> str:
    if category:
        cleaned = category.strip()
        if cleaned in CATEGORY_LABELS:
            return cleaned
        if cleaned in CATEGORY_LABEL_TO_KEY:
            return CATEGORY_LABEL_TO_KEY[cleaned]
    token = normalized_name or normalize_ingredient_name(raw_name or "")
    return get_default_category(token)


def estimate_expiry_date(token: str, *, storage_type: str, date_added: date) -> date:
    entry = get_catalog_entry(token)
    days = entry.default_expiry_days if entry else 5
    if storage_type == "freezer":
        days = max(days, 30)
    if storage_type == "pantry":
        days = max(days, 10)
    return date_added + timedelta(days=days)


def compute_status(estimated_expiry_date: str | None, *, today: date | None = None) -> str:
    if not estimated_expiry_date:
        return "fresh"
    current = today or date.today()
    expiry = date.fromisoformat(estimated_expiry_date)
    remaining = (expiry - current).days
    if remaining < 0:
        return "expired"
    if remaining <= 2:
        return "expiring_soon"
    return "fresh"


def parse_quantity_text(quantity_text: str | None) -> tuple[float | None, str | None]:
    if not quantity_text:
        return None, None
    text = quantity_text.strip()
    if not text:
        return None, None
    if text in {"适量", "少许"}:
        return None, text
    if text.startswith("半"):
        unit = text[1:] or "份"
        return 0.5, unit

    match = re.match(r"([一二两三四五六七八九十百\d]+(?:\.\d+)?)\s*([^\d\s]+)?", text)
    if not match:
        return None, text
    raw_number = match.group(1)
    unit = match.group(2) or "份"
    if raw_number.replace(".", "", 1).isdigit():
        return float(raw_number), unit
    if raw_number == "十":
        return 10.0, unit
    if len(raw_number) == 2 and raw_number[0] == "十":
        return 10.0 + CHINESE_NUMBERS.get(raw_number[1], 0), unit
    if len(raw_number) == 2 and raw_number[1] == "十":
        return CHINESE_NUMBERS.get(raw_number[0], 0) * 10, unit
    if raw_number in CHINESE_NUMBERS:
        return float(CHINESE_NUMBERS[raw_number]), unit
    return None, unit


def format_quantity(value: float, unit: str | None) -> str:
    value = float(value)
    if value.is_integer():
        number = str(int(value))
    else:
        number = f"{value:.1f}".rstrip("0").rstrip(".")
    return f"{number}{unit or ''}".strip() or number


def merge_quantity_text(existing: str | None, incoming: str | None) -> str:
    if not existing:
        return incoming or "1份"
    if not incoming:
        return existing
    existing_value, existing_unit = parse_quantity_text(existing)
    incoming_value, incoming_unit = parse_quantity_text(incoming)
    if (
        existing_value is not None
        and incoming_value is not None
        and (existing_unit or "份") == (incoming_unit or "份")
    ):
        return format_quantity(existing_value + incoming_value, existing_unit or incoming_unit)
    if existing == incoming:
        return existing
    return f"{existing} + {incoming}"


def extract_quantity(segment: str) -> str:
    match = QUANTITY_PATTERN.search(segment)
    if match:
        return match.group(1).replace(" ", "")
    return "1份"


def suggest_recommended_quantity_text(
    *,
    normalized_name: str,
    display_name: str,
    category: str,
    missing_count: int,
    household_size: int,
    purchase_frequency_per_week: int,
) -> str:
    del display_name, category

    entry = get_catalog_entry(normalized_name)
    unit = entry.shopping_unit if entry else "份"

    amount = max(1.0, float(missing_count))
    if household_size >= 3:
        amount *= 1.5
    if household_size >= 5:
        amount *= 1.5
    if purchase_frequency_per_week <= 1:
        amount *= 1.5
    elif purchase_frequency_per_week >= 4:
        amount *= 0.75

    if unit in {"瓶", "袋", "盒", "罐"}:
        amount = max(1.0, round(amount))
    else:
        amount = max(1.0, round(amount * 2) / 2)
    return format_quantity(amount, unit)


def build_inventory_candidate(
    raw_name: str,
    *,
    quantity_text: str | None = None,
    category: str | None = None,
    storage_type: str | None = None,
    source_type: str = "manual_text",
    date_added: str | None = None,
    image_url: str | None = None,
) -> dict[str, str]:
    token = normalize_ingredient_name(raw_name)
    added = date.fromisoformat(date_added) if date_added else date.today()
    safe_storage_type = storage_type if storage_type in STORAGE_TYPES else get_default_storage_type(token)
    expiry = estimate_expiry_date(token, storage_type=safe_storage_type, date_added=added)
    safe_quantity_text = quantity_text or "1份"
    return {
        "id": f"inv_{uuid.uuid4().hex[:10]}",
        "display_name": get_default_display_name(token, normalize_display_name(raw_name)),
        "normalized_name": token,
        "category": ensure_category_key(category, raw_name=raw_name, normalized_name=token),
        "quantity_text": safe_quantity_text,
        "unit": parse_quantity_text(safe_quantity_text)[1] or "份",
        "storage_type": safe_storage_type,
        "date_added": added.isoformat(),
        "estimated_expiry_date": expiry.isoformat(),
        "status": compute_status(expiry.isoformat(), today=added),
        "source_type": source_type if source_type in SOURCE_TYPES else "manual_text",
        "image_url": image_url or "",
    }


def merge_inventory_candidates(candidates: list[dict[str, str]]) -> list[dict[str, str]]:
    merged: dict[str, dict[str, str]] = {}
    for candidate in candidates:
        token = candidate["normalized_name"]
        if token in merged:
            merged[token]["quantity_text"] = merge_quantity_text(
                merged[token].get("quantity_text"),
                candidate.get("quantity_text"),
            )
            merged[token]["unit"] = parse_quantity_text(merged[token]["quantity_text"])[1] or "份"
            continue
        merged[token] = candidate.copy()
    return list(merged.values())


def _clean_fragment(fragment: str) -> str:
    cleaned = fragment.strip()
    cleaned = cleaned.strip("，,；;、。.!? ")
    cleaned = LEADING_NOISE_PATTERN.sub("", cleaned)
    cleaned = TRAILING_NOISE_PATTERN.sub("", cleaned)
    return cleaned.strip("，,；;、。.!? ")


def _build_candidates_from_fragment(fragment: str, *, quantity_text: str) -> list[dict[str, str]]:
    cleaned = _clean_fragment(fragment)
    if not cleaned:
        return []
    return [build_inventory_candidate(cleaned, quantity_text=quantity_text, source_type="manual_text")]


def _parse_segment(segment: str) -> list[dict[str, str]]:
    cleaned = _clean_fragment(segment)
    if not cleaned:
        return []

    parts = [part for part in (piece.strip() for piece in CONNECTOR_SPLIT_PATTERN.split(cleaned)) if part]
    if len(parts) > 1:
        results: list[dict[str, str]] = []
        for part in parts:
            results.extend(_parse_segment(part))
        return results

    prefix_match = PREFIX_QUANTITY_PATTERN.match(cleaned)
    if prefix_match:
        return _build_candidates_from_fragment(
            prefix_match.group(2),
            quantity_text=prefix_match.group(1).replace(" ", ""),
        )

    suffix_match = SUFFIX_QUANTITY_PATTERN.match(cleaned)
    if suffix_match:
        return _build_candidates_from_fragment(
            suffix_match.group(1),
            quantity_text=suffix_match.group(2).replace(" ", ""),
        )

    return _build_candidates_from_fragment(cleaned, quantity_text=extract_quantity(cleaned))


def parse_freeform_inventory_text(text: str) -> list[dict[str, str]]:
    cleaned = text.strip()
    if not cleaned:
        return []

    raw_hits: list[dict[str, str]] = []
    segments = [segment.strip() for segment in re.split(r"[，,；;\n]", cleaned) if segment.strip()]
    if not segments:
        segments = [cleaned]

    for segment in segments:
        raw_hits.extend(_parse_segment(segment))

    return merge_inventory_candidates(raw_hits)


async def enrich_candidates_with_categories(candidates: list[dict[str, str]]) -> list[dict[str, str]]:
    enriched: list[dict[str, str]] = []
    for candidate in candidates:
        item = candidate.copy()
        token = item.get("normalized_name") or normalize_ingredient_name(item.get("display_name", ""))
        item["normalized_name"] = token
        item["category"] = ensure_category_key(
            item.get("category"),
            raw_name=item.get("display_name"),
            normalized_name=token,
        )
        item["display_name"] = item.get("display_name") or get_default_display_name(token, token)
        enriched.append(item)
    return enriched


def _extract_json_payload(text: str) -> list[dict[str, str]]:
    payload = text.strip()
    if payload.startswith("```"):
        payload = re.sub(r"^```(?:json)?\s*", "", payload)
        payload = re.sub(r"\s*```$", "", payload)
    match = re.search(r"(\[[\s\S]*\]|\{[\s\S]*\})", payload)
    if match:
        payload = match.group(1)
    data = json.loads(payload)
    if isinstance(data, dict):
        for key in ("items", "ingredients", "results"):
            value = data.get(key)
            if isinstance(value, list):
                data = value
                break
        else:
            data = [data]
    if not isinstance(data, list):
        raise ValueError("识别结果不是列表")
    return [item for item in data if isinstance(item, dict)]


async def recognize_from_uploaded_file(
    file_bytes: bytes,
    filename: str,
    *,
    source_type: str,
) -> list[dict[str, str]]:
    if not file_bytes:
        raise ImageRecognitionError("上传文件为空。")
    if not llm_is_configured():
        raise RuntimeError("OPENROUTER_API_KEY 未配置，无法执行图片识别。")

    prompt = (
        "请识别图片里的食材或购物清单，只返回 JSON 数组。"
        "每个元素包含 display_name、quantity_text、category、storage_type。"
        "category 使用英文 key；storage_type 仅能是 fridge/freezer/pantry。"
    )
    response_text = await vision_chat(prompt, image_bytes=file_bytes, filename=filename)
    try:
        payload = _extract_json_payload(response_text)
    except (json.JSONDecodeError, ValueError) as exc:
        raise ImageRecognitionError(f"无法解析识别结果: {exc}") from exc

    results: list[dict[str, str]] = []
    for item in payload:
        raw_name = str(item.get("display_name") or item.get("name") or "").strip()
        if not raw_name:
            continue
        results.append(
            build_inventory_candidate(
                raw_name,
                quantity_text=str(item.get("quantity_text") or item.get("quantity") or "1份").strip() or "1份",
                category=item.get("category"),
                storage_type=item.get("storage_type"),
                source_type=source_type,
            )
        )

    if not results:
        raise ImageRecognitionError("未识别到可用食材，请换一张更清晰的图片。")
    return await enrich_candidates_with_categories(results)
