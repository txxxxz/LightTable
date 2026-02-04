"use client";

import { useState } from "react";
import {
  User,
  Ruler,
  Weight,
  Target,
  ChefHat,
  Ban,
  Bug,
  Sparkles,
} from "lucide-react";
import { SettingsGroup } from "@/components/settings/SettingsGroup";
import { SettingsRow } from "@/components/settings/SettingsRow";
import { Switch } from "@/components/ui/Switch";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Modal } from "@/components/ui/Modal";
import { DislikesEditor } from "@/components/settings/DislikesEditor";
import { NumberEditSheet, type NumberEditType } from "@/components/settings/NumberEditSheet";
import {
  useGlobalStore,
  goalLabels,
  cookingLevelLabels,
  type Goal,
  type CookingLevel,
} from "@/lib/store";

// 目标选项
const GOAL_OPTIONS: { value: Goal; label: string; description: string }[] = [
  { value: "fat_loss", label: "减脂", description: "控制热量摄入，推荐低卡食谱" },
  { value: "maintain", label: "维持", description: "均衡饮食，保持当前体重" },
  { value: "muscle_gain", label: "增肌", description: "高蛋白饮食，支持肌肉生长" },
];

// 厨艺水平选项
const COOKING_LEVEL_OPTIONS: { value: CookingLevel; label: string }[] = [
  { value: "survival", label: "生存" },
  { value: "home_cook", label: "家常" },
  { value: "chef", label: "大厨" },
];

export default function SettingsPage() {
  const {
    bodyProfile,
    setBodyProfile,
    preferences,
    setPreferences,
    system,
    setDebugMode,
    addDebugLog,
  } = useGlobalStore();

  // Modal 状态
  const [goalModalOpen, setGoalModalOpen] = useState(false);
  const [dislikesModalOpen, setDislikesModalOpen] = useState(false);
  const [numberEditType, setNumberEditType] = useState<NumberEditType | null>(null);

  // 处理目标选择
  const handleGoalChange = (goal: Goal) => {
    setBodyProfile({ goal });
    addDebugLog("mem0", `[Mem0] Updating user goal to: ${goalLabels[goal]}`);
    setGoalModalOpen(false);
  };

  // 处理厨艺水平变更
  const handleCookingLevelChange = (level: CookingLevel) => {
    setPreferences({ cookingLevel: level });
    addDebugLog("mem0", `[Mem0] Updating cooking level to: ${cookingLevelLabels[level]}`);
  };

  // 处理 Debug 模式切换
  const handleDebugToggle = (enabled: boolean) => {
    setDebugMode(enabled);
    if (enabled) {
      addDebugLog("info", "[System] Debug mode enabled - Agent thoughts will be visible");
    }
  };

  return (
    <>
      <header className="sticky top-0 left-0 right-0 z-40 bg-zinc-50 border-b border-zinc-200 pt-safe">
        <div className="px-4 h-14 flex items-center">
          <h1 className="text-xl font-semibold text-zinc-900">Me</h1>
        </div>
      </header>

      <main className="px-4 py-4 bg-zinc-50 min-h-screen">
        {/* Section 1: Body Profile */}
        <SettingsGroup title="身体档案">
          <SettingsRow
            icon={<Ruler className="w-5 h-5" />}
            label="身高"
            value={`${bodyProfile.height} cm`}
            onClick={() => setNumberEditType("height")}
            showChevron
          />
          <SettingsRow
            icon={<Weight className="w-5 h-5" />}
            label="体重"
            value={`${bodyProfile.weight} kg`}
            onClick={() => setNumberEditType("weight")}
            showChevron
          />
          <SettingsRow
            icon={<Target className="w-5 h-5" />}
            label="目标"
            value={goalLabels[bodyProfile.goal]}
            onClick={() => setGoalModalOpen(true)}
            showChevron
            isLast
          />
        </SettingsGroup>

        {/* Section 2: Kitchen Preferences */}
        <SettingsGroup title="Agent 大脑调教">
          <SettingsRow
            icon={<Ban className="w-5 h-5" />}
            label="忌口管理"
            value={
              preferences.dislikes.length > 0
                ? `${preferences.dislikes.length} 项`
                : "无"
            }
            onClick={() => setDislikesModalOpen(true)}
            showChevron
          />
          <div className="px-4 py-3 bg-white border-b border-zinc-100 last:border-b-0">
            <div className="flex items-center gap-3 mb-3">
              <span className="text-primary w-5 h-5 flex items-center justify-center">
                <ChefHat className="w-5 h-5" />
              </span>
              <span className="text-zinc-900 font-medium text-base">厨艺水平</span>
            </div>
            <SegmentedControl
              options={COOKING_LEVEL_OPTIONS}
              value={preferences.cookingLevel}
              onChange={handleCookingLevelChange}
              className="w-full"
            />
          </div>
        </SettingsGroup>

        {/* Section 3: Developer Zone */}
        <SettingsGroup title="开发者选项">
          <SettingsRow
            icon={<Bug className="w-5 h-5" />}
            label="调试模式"
            action={
              <Switch
                checked={system.debugMode}
                onChange={handleDebugToggle}
              />
            }
          />
          <SettingsRow
            icon={<Sparkles className="w-5 h-5" />}
            label="显示 Agent 思考"
            value={system.debugMode ? "已开启" : "已关闭"}
            isLast
          />
        </SettingsGroup>

        {/* 版本信息 */}
        <div className="text-center text-zinc-400 text-xs mt-8 mb-4">
          <p>LightTable v0.1.0</p>
          <p className="mt-1">智能家庭饮食决策助手</p>
        </div>
      </main>

      {/* Goal Selection Modal */}
      <Modal
        isOpen={goalModalOpen}
        onClose={() => setGoalModalOpen(false)}
        title="选择目标"
      >
        <div className="space-y-3">
          {GOAL_OPTIONS.map((option) => {
            const isSelected = bodyProfile.goal === option.value;
            return (
              <button
                key={option.value}
                onClick={() => handleGoalChange(option.value)}
                className={`
                  w-full p-4 rounded-xl text-left transition-all
                  ${
                    isSelected
                      ? "bg-primary/10 border-2 border-primary"
                      : "bg-zinc-50 border-2 border-transparent hover:border-zinc-200"
                  }
                `}
              >
                <div className="flex items-center justify-between">
                  <span
                    className={`font-semibold ${
                      isSelected ? "text-primary" : "text-zinc-900"
                    }`}
                  >
                    {option.label}
                  </span>
                  {isSelected && (
                    <div className="w-5 h-5 bg-primary rounded-full flex items-center justify-center">
                      <svg
                        className="w-3 h-3 text-white"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={3}
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                    </div>
                  )}
                </div>
                <p className="text-sm text-zinc-500 mt-1">{option.description}</p>
              </button>
            );
          })}
        </div>
      </Modal>

      {/* Dislikes Editor Modal */}
      <Modal
        isOpen={dislikesModalOpen}
        onClose={() => setDislikesModalOpen(false)}
        title="忌口管理"
      >
        <DislikesEditor />
      </Modal>

      {/* Height / Weight Edit Sheet */}
      {numberEditType && (
        <NumberEditSheet
          type={numberEditType}
          value={numberEditType === "height" ? bodyProfile.height : bodyProfile.weight}
          onConfirm={(val) =>
            setBodyProfile(numberEditType === "height" ? { height: val } : { weight: val })
          }
          isOpen={!!numberEditType}
          onClose={() => setNumberEditType(null)}
        />
      )}
    </>
  );
}
