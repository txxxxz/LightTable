"use client";

import { useGlobalStore } from "./store";
import type { Locale } from "./locale";
import { getLanguageTag } from "./locale";
import {
  CUISINE_OPTIONS,
  FLAVOR_OPTIONS,
  HEALTH_CONSTRAINT_OPTIONS,
  KITCHEN_TOOL_OPTIONS,
  METHOD_OPTIONS,
} from "./store";
import type {
  CompetitionCycle,
  CookingLevel,
  Goal,
  IngredientStatus,
  TrainingIntensity,
} from "./types";

type LocalizedText<T = string> = {
  zh: T;
  en: T;
};

function fromMap<K extends string>(locale: Locale, map: Record<K, LocalizedText>, key: K) {
  return locale === "zh" ? map[key].zh : map[key].en;
}

export function pickByLocale<T>(locale: Locale, values: LocalizedText<T>) {
  return locale === "zh" ? values.zh : values.en;
}

export function useLocale() {
  return useGlobalStore((state) => state.system.language);
}

export function useLanguageTag() {
  return getLanguageTag(useLocale());
}

export const LANGUAGE_OPTIONS: Array<{ value: Locale; label: string }> = [
  { value: "zh", label: "中文" },
  { value: "en", label: "English" },
];

const goalText: Record<Goal, LocalizedText> = {
  fat_loss: { zh: "减脂", en: "Fat loss" },
  maintain: { zh: "维持", en: "Maintain" },
  muscle_gain: { zh: "增肌", en: "Muscle gain" },
};

const goalDescriptionText: Record<Goal, LocalizedText> = {
  fat_loss: {
    zh: "控制热量摄入，优先轻盈但能吃饱的方案",
    en: "Control calories with lighter meals that still feel filling.",
  },
  maintain: {
    zh: "均衡饮食，优先实用和少浪费",
    en: "Keep meals balanced, practical, and low-waste.",
  },
  muscle_gain: {
    zh: "提高蛋白质密度，兼顾做饭效率",
    en: "Increase protein density while keeping cooking efficient.",
  },
};

const cookingLevelText: Record<CookingLevel, LocalizedText> = {
  survival: { zh: "生存", en: "Survival" },
  home_cook: { zh: "家常", en: "Home cook" },
  chef: { zh: "大厨", en: "Chef" },
};

const trainingIntensityText: Record<TrainingIntensity, LocalizedText> = {
  low: { zh: "轻量", en: "Light" },
  moderate: { zh: "中等", en: "Moderate" },
  high: { zh: "高强度", en: "High" },
  double_session: { zh: "双训", en: "Double session" },
};

const competitionCycleText: Record<CompetitionCycle, LocalizedText> = {
  base: { zh: "基础期", en: "Base" },
  build: { zh: "提升期", en: "Build" },
  taper: { zh: "减量期", en: "Taper" },
  competition: { zh: "比赛期", en: "Race" },
  recovery: { zh: "恢复期", en: "Recovery" },
};

const healthConstraintText: Record<
  (typeof HEALTH_CONSTRAINT_OPTIONS)[number],
  LocalizedText
> = {
  gluten_free: { zh: "无麸质", en: "Gluten-free" },
  diabetes_friendly: { zh: "控糖友好", en: "Diabetes-friendly" },
  low_sugar: { zh: "低糖", en: "Low sugar" },
  low_sodium: { zh: "低钠", en: "Low sodium" },
  high_protein: { zh: "高蛋白", en: "High protein" },
  dairy_free: { zh: "无乳制品", en: "Dairy-free" },
  nut_free: { zh: "无坚果", en: "Nut-free" },
  vegetarian: { zh: "素食", en: "Vegetarian" },
};

const flavorText: Record<(typeof FLAVOR_OPTIONS)[number], LocalizedText> = {
  清淡: { zh: "清淡", en: "Light" },
  重口味: { zh: "重口味", en: "Bold" },
  辣: { zh: "辣", en: "Spicy" },
  酸甜: { zh: "酸甜", en: "Sweet & sour" },
  低碳水: { zh: "低碳水", en: "Low carb" },
  高蛋白: { zh: "高蛋白", en: "High protein" },
};

const cuisineText: Record<(typeof CUISINE_OPTIONS)[number], LocalizedText> = {
  川菜: { zh: "川菜", en: "Sichuan" },
  粤菜: { zh: "粤菜", en: "Cantonese" },
  湘菜: { zh: "湘菜", en: "Hunan" },
  家常: { zh: "家常", en: "Homestyle" },
  西式: { zh: "西式", en: "Western" },
  日韩: { zh: "日韩", en: "Japanese & Korean" },
  东南亚: { zh: "东南亚", en: "Southeast Asian" },
  其他: { zh: "其他", en: "Other" },
};

const methodText: Record<(typeof METHOD_OPTIONS)[number], LocalizedText> = {
  炒: { zh: "炒", en: "Stir-fry" },
  煮: { zh: "煮", en: "Boil" },
  蒸: { zh: "蒸", en: "Steam" },
  烤: { zh: "烤", en: "Bake" },
  煎: { zh: "煎", en: "Pan-fry" },
  炸: { zh: "炸", en: "Deep-fry" },
  凉拌: { zh: "凉拌", en: "Cold mix" },
  微波: { zh: "微波", en: "Microwave" },
  炖: { zh: "炖", en: "Stew" },
  快手: { zh: "快手", en: "Quick" },
};

const kitchenToolText: Record<(typeof KITCHEN_TOOL_OPTIONS)[number], LocalizedText> = {
  空气炸锅: { zh: "空气炸锅", en: "Air fryer" },
  烤箱: { zh: "烤箱", en: "Oven" },
  微波炉: { zh: "微波炉", en: "Microwave" },
  电饭煲: { zh: "电饭煲", en: "Rice cooker" },
  不粘锅: { zh: "不粘锅", en: "Non-stick pan" },
};

const ingredientStatusText: Record<IngredientStatus, LocalizedText> = {
  fresh: { zh: "新鲜", en: "Fresh" },
  expiring_soon: { zh: "临期", en: "Expiring" },
  expired: { zh: "过期", en: "Expired" },
};

const decideTagText: Record<string, LocalizedText> = {
  减脂: { zh: "减脂", en: "Fat loss" },
  增肌: { zh: "增肌", en: "Muscle gain" },
  运动后恢复: { zh: "运动后恢复", en: "Post-workout recovery" },
  消耗临期: { zh: "消耗临期", en: "Use expiring items" },
  快手菜: { zh: "快手菜", en: "Quick meals" },
};

export function getGoalLabel(goal: Goal, locale: Locale) {
  return fromMap(locale, goalText, goal);
}

export function getGoalDescription(goal: Goal, locale: Locale) {
  return fromMap(locale, goalDescriptionText, goal);
}

export function getCookingLevelLabel(level: CookingLevel, locale: Locale) {
  return fromMap(locale, cookingLevelText, level);
}

export function getTrainingIntensityLabel(intensity: TrainingIntensity, locale: Locale) {
  return fromMap(locale, trainingIntensityText, intensity);
}

export function getCompetitionCycleLabel(cycle: CompetitionCycle, locale: Locale) {
  return fromMap(locale, competitionCycleText, cycle);
}

export function getHealthConstraintLabel(
  constraint: (typeof HEALTH_CONSTRAINT_OPTIONS)[number],
  locale: Locale
) {
  return fromMap(locale, healthConstraintText, constraint);
}

export function getFlavorLabel(flavor: (typeof FLAVOR_OPTIONS)[number], locale: Locale) {
  return fromMap(locale, flavorText, flavor);
}

export function getCuisineLabel(cuisine: (typeof CUISINE_OPTIONS)[number], locale: Locale) {
  return fromMap(locale, cuisineText, cuisine);
}

export function getMethodLabel(method: (typeof METHOD_OPTIONS)[number], locale: Locale) {
  return fromMap(locale, methodText, method);
}

export function getKitchenToolLabel(tool: (typeof KITCHEN_TOOL_OPTIONS)[number], locale: Locale) {
  return fromMap(locale, kitchenToolText, tool);
}

export function getIngredientStatusLabel(status: IngredientStatus, locale: Locale) {
  return fromMap(locale, ingredientStatusText, status);
}

export function getDecideTagLabel(tag: string, locale: Locale) {
  return decideTagText[tag] ? pickByLocale(locale, decideTagText[tag]) : tag;
}

export function getLocalizedOptions<T extends string>(
  values: readonly T[],
  getLabel: (value: T, locale: Locale) => string,
  locale: Locale
) {
  return values.map((value) => ({
    value,
    label: getLabel(value, locale),
  }));
}

export function getGoalOptions(locale: Locale) {
  return Object.keys(goalText).map((goal) => ({
    value: goal as Goal,
    label: getGoalLabel(goal as Goal, locale),
    description: getGoalDescription(goal as Goal, locale),
  }));
}

export function getCookingLevelOptions(locale: Locale) {
  return (["survival", "home_cook", "chef"] as const).map((value) => ({
    value,
    label: getCookingLevelLabel(value, locale),
  }));
}

export function getTrainingIntensityOptions(locale: Locale) {
  return (["low", "moderate", "high", "double_session"] as const).map((value) => ({
    value,
    label: getTrainingIntensityLabel(value, locale),
  }));
}

export function getCompetitionCycleOptions(locale: Locale) {
  return (["base", "build", "taper", "competition", "recovery"] as const).map((value) => ({
    value,
    label: getCompetitionCycleLabel(value, locale),
  }));
}
