"use client";

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

export const INVENTORY_CATEGORY_LABELS: Record<InventoryCategory, string> = {
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
};

export const INVENTORY_CATEGORY_OPTIONS = INVENTORY_CATEGORY_ORDER.map((category) => ({
  value: category,
  label: INVENTORY_CATEGORY_LABELS[category],
}));

export function isInventoryCategory(value: string): value is InventoryCategory {
  return INVENTORY_CATEGORY_ORDER.includes(value as InventoryCategory);
}

export function getInventoryCategoryLabel(category: string): string {
  if (isInventoryCategory(category)) return INVENTORY_CATEGORY_LABELS[category];
  return INVENTORY_CATEGORY_LABELS.dry_goods;
}

export function normalizeInventoryCategory(category: string): InventoryCategory {
  return isInventoryCategory(category) ? category : "dry_goods";
}

export function groupByInventoryCategory<T extends { category: string }>(items: T[]) {
  return INVENTORY_CATEGORY_ORDER.map((category) => ({
    category,
    label: INVENTORY_CATEGORY_LABELS[category],
    items: items.filter((item) => normalizeInventoryCategory(item.category) === category),
  })).filter((group) => group.items.length > 0);
}
