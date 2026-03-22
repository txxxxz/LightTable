"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

import type { CookingLevel, Goal, RecommendationPlan, ShoppingListItem } from "./types";

export interface DebugLog {
  id: string;
  timestamp: Date;
  type: "info" | "rag" | "mem0" | "error";
  message: string;
}

export interface RecommendationSnapshot {
  requestId: string;
  selectedTags: string[];
  profileSummary: string;
  strategySummary: string;
  plans: RecommendationPlan[];
  shoppingSuggestions: ShoppingListItem[];
}

interface GlobalStore {
  system: {
    debugMode: boolean;
  };
  debugLogs: DebugLog[];
  currentRecommendationId: string | null;
  recommendationSnapshots: Record<string, RecommendationSnapshot>;
  setDebugMode: (enabled: boolean) => void;
  addDebugLog: (type: DebugLog["type"], message: string) => void;
  clearDebugLogs: () => void;
  setLastRecommendation: (snapshot: RecommendationSnapshot) => void;
  clearLastRecommendation: () => void;
}

export const useGlobalStore = create<GlobalStore>()(
  persist(
    (set) => ({
      system: {
        debugMode: false,
      },
      debugLogs: [],
      currentRecommendationId: null,
      recommendationSnapshots: {},
      setDebugMode: (enabled) =>
        set((state) => ({
          system: { ...state.system, debugMode: enabled },
        })),
      addDebugLog: (type, message) =>
        set((state) => ({
          debugLogs: [
            ...state.debugLogs.slice(-49),
            {
              id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
              timestamp: new Date(),
              type,
              message,
            },
          ],
        })),
      clearDebugLogs: () => set({ debugLogs: [] }),
      setLastRecommendation: (snapshot) =>
        set((state) => ({
          currentRecommendationId: snapshot.requestId,
          recommendationSnapshots: {
            ...Object.fromEntries(
              Object.entries(state.recommendationSnapshots).slice(-4)
            ),
            [snapshot.requestId]: snapshot,
          },
        })),
      clearLastRecommendation: () =>
        set({
          currentRecommendationId: null,
          recommendationSnapshots: {},
        }),
    }),
    {
      name: "lighttable-debug",
      partialize: (state) => ({
        system: state.system,
        currentRecommendationId: state.currentRecommendationId,
        recommendationSnapshots: state.recommendationSnapshots,
      }),
    }
  )
);

export const goalLabels: Record<Goal, string> = {
  fat_loss: "减脂",
  maintain: "维持",
  muscle_gain: "增肌",
};

export const cookingLevelLabels: Record<CookingLevel, string> = {
  survival: "生存",
  home_cook: "家常",
  chef: "大厨",
};

export const FLAVOR_OPTIONS = ["清淡", "重口味", "辣", "酸甜", "低碳水", "高蛋白"] as const;
export const CUISINE_OPTIONS = ["川菜", "粤菜", "湘菜", "家常", "西式", "日韩", "东南亚", "其他"] as const;
export const METHOD_OPTIONS = ["炒", "煮", "蒸", "烤", "煎", "炸", "凉拌", "微波", "炖", "快手"] as const;
export const HEALTH_CONSTRAINT_OPTIONS = [
  "gluten_free",
  "diabetes_friendly",
  "low_sugar",
  "low_sodium",
  "high_protein",
  "dairy_free",
  "nut_free",
  "vegetarian",
] as const;
export const KITCHEN_TOOL_OPTIONS = ["空气炸锅", "烤箱", "微波炉", "电饭煲", "不粘锅"] as const;

export const healthConstraintLabels: Record<(typeof HEALTH_CONSTRAINT_OPTIONS)[number], string> = {
  gluten_free: "无麸质",
  diabetes_friendly: "控糖友好",
  low_sugar: "低糖",
  low_sodium: "低钠",
  high_protein: "高蛋白",
  dairy_free: "无乳制品",
  nut_free: "无坚果",
  vegetarian: "素食",
};
