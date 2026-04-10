from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from backend.services.ingredient_service import normalize_ingredient_name, parse_quantity_text


@dataclass(frozen=True)
class MacroProfile:
    carbs_per_100g: float
    protein_per_100g: float
    fat_per_100g: float
    unit_weight_grams: float | None = None


MACRO_DB: dict[str, MacroProfile] = {
    "tomato_cherry": MacroProfile(3.9, 0.9, 0.2, 15),
    "tomato": MacroProfile(3.9, 0.9, 0.2, 120),
    "pepper": MacroProfile(6.0, 1.0, 0.2, 80),
    "chili_pepper": MacroProfile(8.8, 1.9, 0.4, 20),
    "egg": MacroProfile(1.1, 12.6, 10.6, 50),
    "lettuce": MacroProfile(2.9, 1.4, 0.2, 180),
    "milk": MacroProfile(4.8, 3.2, 3.6, 250),
    "tofu": MacroProfile(1.9, 8.1, 4.8, 350),
    "cucumber": MacroProfile(3.6, 0.7, 0.1, 180),
    "chicken": MacroProfile(0.0, 23.0, 1.9, 150),
    "broccoli": MacroProfile(6.6, 2.8, 0.4, 250),
    "beef": MacroProfile(0.0, 26.0, 10.0, 150),
    "pork_belly": MacroProfile(0.0, 9.3, 53.0, 150),
    "mushroom": MacroProfile(3.3, 3.1, 0.3, 100),
    "shrimp": MacroProfile(0.9, 20.4, 0.7, 150),
    "salmon": MacroProfile(0.0, 20.0, 13.0, 150),
    "spinach": MacroProfile(3.6, 2.9, 0.4, 200),
    "cabbage": MacroProfile(5.8, 1.3, 0.1, 300),
    "mango": MacroProfile(15.0, 0.8, 0.4, 200),
    "hami_melon": MacroProfile(8.0, 0.8, 0.2, 500),
    "oats": MacroProfile(66.3, 16.9, 6.9, 40),
    "yogurt": MacroProfile(4.7, 3.5, 3.0, 200),
    "scallion": MacroProfile(7.3, 1.8, 0.2, 15),
    "garlic": MacroProfile(33.1, 6.4, 0.5, 10),
    "ginger": MacroProfile(17.8, 1.8, 0.8, 10),
    "rice": MacroProfile(77.2, 7.9, 0.7, 100),
    "flour": MacroProfile(76.0, 10.3, 1.0, 100),
    "noodle": MacroProfile(75.0, 10.0, 1.5, 100),
    "oyster_sauce": MacroProfile(18.0, 1.5, 0.2, 15),
    "soy_sauce": MacroProfile(10.0, 8.0, 0.0, 15),
    "cooking_wine": MacroProfile(4.0, 0.0, 0.0, 15),
    "vinegar": MacroProfile(0.9, 0.0, 0.0, 15),
    "starch": MacroProfile(91.0, 0.3, 0.1, 10),
    "sugar": MacroProfile(100.0, 0.0, 0.0, 10),
    "salt": MacroProfile(0.0, 0.0, 0.0, 5),
    "black_pepper": MacroProfile(64.0, 10.0, 3.3, 2),
    "chili_oil": MacroProfile(0.0, 0.0, 100.0, 15),
    "cooking_oil": MacroProfile(0.0, 0.0, 100.0, 15),
    "butter": MacroProfile(0.1, 0.9, 81.0, 10),
    "cream": MacroProfile(3.0, 2.0, 35.0, 30),
    "cheese": MacroProfile(1.3, 25.0, 33.0, 20),
    "yeast": MacroProfile(33.0, 40.0, 7.0, 5),
    "dumplings": MacroProfile(28.0, 7.0, 6.0, 300),
    "luncheon_meat": MacroProfile(4.0, 14.0, 20.0, 340),
    "sparkling_water": MacroProfile(0.0, 0.0, 0.0, 330),
    "cola": MacroProfile(10.6, 0.0, 0.0, 330),
    "juice": MacroProfile(11.0, 0.5, 0.1, 250),
    "snack": MacroProfile(60.0, 6.0, 25.0, 40),
}

WEIGHT_UNITS = {
    "g": 1.0,
    "克": 1.0,
    "kg": 1000.0,
    "公斤": 1000.0,
    "斤": 500.0,
    "两": 50.0,
    "ml": 1.0,
    "毫升": 1.0,
    "升": 1000.0,
    "l": 1000.0,
}


def _resolve_profile(token: str | None, display_name: str | None) -> MacroProfile | None:
    if token and token in MACRO_DB:
        return MACRO_DB[token]
    if display_name:
        normalized = normalize_ingredient_name(display_name)
        return MACRO_DB.get(normalized)
    return None


def _estimate_weight_grams(quantity_text: str | None, profile: MacroProfile) -> float:
    value, unit = parse_quantity_text(quantity_text)
    if value is None:
        return profile.unit_weight_grams or 100.0

    safe_unit = (unit or "份").strip().lower()
    if safe_unit in WEIGHT_UNITS:
        return value * WEIGHT_UNITS[safe_unit]

    if safe_unit in {"份", "个", "颗", "盒", "袋", "瓶", "包", "把", "根", "朵", "块", "头"}:
        return value * (profile.unit_weight_grams or 100.0)

    return value * (profile.unit_weight_grams or 100.0)


def estimate_inventory_macros(
    *,
    normalized_name: str | None,
    display_name: str | None,
    quantity_text: str | None,
) -> dict[str, Any] | None:
    profile = _resolve_profile(normalized_name, display_name)
    if profile is None:
        return None

    grams = max(1.0, _estimate_weight_grams(quantity_text, profile))
    factor = grams / 100.0
    return {
        "carbs_g": round(profile.carbs_per_100g * factor, 1),
        "protein_g": round(profile.protein_per_100g * factor, 1),
        "fat_g": round(profile.fat_per_100g * factor, 1),
        "estimated": True,
    }
