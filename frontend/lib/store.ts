"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

// ==================== 类型定义 ====================

export type Goal = "fat_loss" | "maintain" | "muscle_gain";
export type CookingLevel = "survival" | "home_cook" | "chef";

export interface BodyProfile {
  height: number; // cm
  weight: number; // kg
  goal: Goal;
}

export interface KitchenPreferences {
  dislikes: string[]; // 不喜欢的食材
  cookingLevel: CookingLevel;
}

export interface SystemSettings {
  expiryAlert: boolean;
  debugMode: boolean;
}

export interface DebugLog {
  id: string;
  timestamp: Date;
  type: "info" | "rag" | "mem0" | "error";
  message: string;
}

// ==================== Store 接口 ====================

interface GlobalStore {
  // Body Profile
  bodyProfile: BodyProfile;
  setBodyProfile: (profile: Partial<BodyProfile>) => void;

  // Kitchen Preferences
  preferences: KitchenPreferences;
  setPreferences: (prefs: Partial<KitchenPreferences>) => void;
  addDislike: (item: string) => void;
  removeDislike: (item: string) => void;

  // System Settings
  system: SystemSettings;
  setDebugMode: (enabled: boolean) => void;
  setExpiryAlert: (enabled: boolean) => void;

  // Debug Logs
  debugLogs: DebugLog[];
  addDebugLog: (type: DebugLog["type"], message: string) => void;
  clearDebugLogs: () => void;
}

// ==================== Store 实现 ====================

export const useGlobalStore = create<GlobalStore>()(
  persist(
    (set, get) => ({
      // ========== Body Profile ==========
      bodyProfile: {
        height: 170,
        weight: 65,
        goal: "maintain",
      },

      setBodyProfile: (profile) =>
        set((state) => ({
          bodyProfile: { ...state.bodyProfile, ...profile },
        })),

      // ========== Kitchen Preferences ==========
      preferences: {
        dislikes: [],
        cookingLevel: "home_cook",
      },

      setPreferences: (prefs) =>
        set((state) => ({
          preferences: { ...state.preferences, ...prefs },
        })),

      addDislike: (item) => {
        const current = get().preferences.dislikes;
        if (!current.includes(item)) {
          set((state) => ({
            preferences: {
              ...state.preferences,
              dislikes: [...state.preferences.dislikes, item],
            },
          }));
          // Mock: 触发 Mem0 记忆添加
          get().addDebugLog("mem0", `[Mem0] Adding memory: User dislikes "${item}"`);
        }
      },

      removeDislike: (item) => {
        set((state) => ({
          preferences: {
            ...state.preferences,
            dislikes: state.preferences.dislikes.filter((d) => d !== item),
          },
        }));
        // Mock: 触发 Mem0 记忆删除
        get().addDebugLog("mem0", `[Mem0] Removing memory: User dislikes "${item}"`);
      },

      // ========== System Settings ==========
      system: {
        expiryAlert: true,
        debugMode: false,
      },

      setDebugMode: (enabled) =>
        set((state) => ({
          system: { ...state.system, debugMode: enabled },
        })),

      setExpiryAlert: (enabled) =>
        set((state) => ({
          system: { ...state.system, expiryAlert: enabled },
        })),

      // ========== Debug Logs ==========
      debugLogs: [],

      addDebugLog: (type, message) =>
        set((state) => ({
          debugLogs: [
            ...state.debugLogs.slice(-49), // 保留最近 50 条
            {
              id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
              timestamp: new Date(),
              type,
              message,
            },
          ],
        })),

      clearDebugLogs: () => set({ debugLogs: [] }),
    }),
    {
      name: "lighttable-settings",
      partialize: (state) => ({
        bodyProfile: state.bodyProfile,
        preferences: state.preferences,
        system: state.system,
      }),
    }
  )
);

// ==================== 辅助函数 ====================

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
