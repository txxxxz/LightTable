"use client";

import type { Locale } from "@/lib/locale";
import type { InventoryCategory } from "@/lib/types";

export const INVENTORY_CATEGORY_ORDER: InventoryCategory[] = [
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
];

export const INVENTORY_CATEGORY_LABELS: Record<
  Locale,
  Record<InventoryCategory, string>
> = {
  zh: {
    dairy: "乳制品",
    vegetables_tofu: "蔬菜豆制品",
    meat_poultry_eggs: "肉禽蛋",
    seafood: "海鲜水产",
    pantry_condiments: "粮油调味",
    dry_goods: "干货",
    baking_dairy: "乳品烘焙",
    ready_meals: "熟食快手菜",
    beverages: "酒水饮料",
    fruit_snacks: "水果零食",
  },
  en: {
    dairy: "Dairy",
    vegetables_tofu: "Vegetables & tofu",
    meat_poultry_eggs: "Meat, poultry & eggs",
    seafood: "Seafood",
    pantry_condiments: "Pantry & condiments",
    dry_goods: "Dry goods",
    baking_dairy: "Baking & dairy",
    ready_meals: "Ready meals",
    beverages: "Beverages",
    fruit_snacks: "Fruit & snacks",
  },
};

export function isInventoryCategory(value: string): value is InventoryCategory {
  return INVENTORY_CATEGORY_ORDER.includes(value as InventoryCategory);
}

export function getInventoryCategoryLabel(category: string, locale: Locale = "zh"): string {
  if (isInventoryCategory(category)) return INVENTORY_CATEGORY_LABELS[locale][category];
  return INVENTORY_CATEGORY_LABELS[locale].dry_goods;
}

export function getInventoryCategoryOptions(locale: Locale = "zh") {
  return INVENTORY_CATEGORY_ORDER.map((category) => ({
    value: category,
    label: INVENTORY_CATEGORY_LABELS[locale][category],
  }));
}

export function normalizeInventoryCategory(category: string): InventoryCategory {
  return isInventoryCategory(category) ? category : "dry_goods";
}

export function groupByInventoryCategory<T extends { category: string }>(
  items: T[],
  locale: Locale = "zh"
) {
  return INVENTORY_CATEGORY_ORDER.map((category) => ({
    category,
    label: INVENTORY_CATEGORY_LABELS[locale][category],
    items: items.filter((item) => normalizeInventoryCategory(item.category) === category),
  })).filter((group) => group.items.length > 0);
}
