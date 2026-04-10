"use client";

import { useEffect, useState } from "react";
import {
  Ban,
  Bug,
  ChefHat,
  Clock3,
  Dumbbell,
  Flame,
  Gauge,
  Globe,
  HeartPulse,
  NotebookPen,
  Ruler,
  Trophy,
  Users,
  UtensilsCrossed,
  Weight,
  Wrench,
  Target,
} from "lucide-react";

import { ChipSelect } from "@/components/settings/ChipSelect";
import { DislikesEditor } from "@/components/settings/DislikesEditor";
import { NumberEditSheet, type NumberEditType } from "@/components/settings/NumberEditSheet";
import { SettingsGroup } from "@/components/settings/SettingsGroup";
import { SettingsRow } from "@/components/settings/SettingsRow";
import { Modal } from "@/components/ui/Modal";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Switch } from "@/components/ui/Switch";
import {
  getUserProfile,
  patchBodyProfile,
  patchSystemSettings,
  updatePreference,
} from "@/lib/api";
import { useGlobalStore } from "@/lib/store";
import {
  cookingLevelLabels,
  CUISINE_OPTIONS,
  FLAVOR_OPTIONS,
  goalLabels,
  HEALTH_CONSTRAINT_OPTIONS,
  healthConstraintLabels,
  KITCHEN_TOOL_OPTIONS,
  METHOD_OPTIONS,
} from "@/lib/store";
import type {
  CompetitionCycle,
  CookingLevel,
  Goal,
  TrainingIntensity,
  UserProfileResponse,
} from "@/lib/types";
import { getUserId } from "@/lib/user";

const GOAL_OPTIONS: { value: Goal; label: string; description: string }[] = [
  { value: "fat_loss", label: "减脂", description: "控制热量摄入，优先轻盈但能吃饱的方案" },
  { value: "maintain", label: "维持", description: "均衡饮食，优先实用和少浪费" },
  { value: "muscle_gain", label: "增肌", description: "提高蛋白质密度，兼顾做饭效率" },
];

const COOKING_LEVEL_OPTIONS: { value: CookingLevel; label: string }[] = [
  { value: "survival", label: "生存" },
  { value: "home_cook", label: "家常" },
  { value: "chef", label: "大厨" },
];

const TRAINING_INTENSITY_OPTIONS: { value: TrainingIntensity; label: string }[] = [
  { value: "low", label: "轻量" },
  { value: "moderate", label: "中等" },
  { value: "high", label: "高强度" },
  { value: "double_session", label: "双训" },
];

const COMPETITION_CYCLE_OPTIONS: { value: CompetitionCycle; label: string }[] = [
  { value: "base", label: "基础期" },
  { value: "build", label: "提升期" },
  { value: "taper", label: "减量期" },
  { value: "competition", label: "比赛期" },
  { value: "recovery", label: "恢复期" },
];

type AthleteDraft = {
  sport_type: string;
  training_days_per_week: string;
  training_intensity: TrainingIntensity | "";
  competition_cycle: CompetitionCycle | "";
  training_notes: string;
};

export default function SettingsPage() {
  const userId = getUserId();
  const { system, setDebugMode, addDebugLog } = useGlobalStore();

  const [data, setData] = useState<UserProfileResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [goalModalOpen, setGoalModalOpen] = useState(false);
  const [dislikesModalOpen, setDislikesModalOpen] = useState(false);
  const [numberEditType, setNumberEditType] = useState<NumberEditType | null>(null);
  const [athleteDraft, setAthleteDraft] = useState<AthleteDraft>({
    sport_type: "",
    training_days_per_week: "",
    training_intensity: "",
    competition_cycle: "",
    training_notes: "",
  });
  const [savingAthlete, setSavingAthlete] = useState(false);

  useEffect(() => {
    getUserProfile(userId)
      .then((profile) => {
        setData(profile);
        setDebugMode(profile.system.debug_mode);
        setError(null);
      })
      .catch((error) => {
        console.error(error);
        setError("暂时无法连接后端，请确认 API 服务已启动。");
        addDebugLog("error", "[Settings] Failed to load profile");
      })
      .finally(() => setLoading(false));
  }, [addDebugLog, setDebugMode, userId]);

  useEffect(() => {
    if (!data) return;
    setAthleteDraft({
      sport_type: data.profile.sport_type || "",
      training_days_per_week:
        data.profile.training_days_per_week != null
          ? String(data.profile.training_days_per_week)
          : "",
      training_intensity: data.profile.training_intensity || "",
      competition_cycle: data.profile.competition_cycle || "",
      training_notes: data.profile.training_notes || "",
    });
  }, [data]);

  if (loading) {
    return (
      <main className="px-4 py-8 lg:px-6">
        <p className="text-text-muted">加载中...</p>
      </main>
    );
  }

  if (error || !data) {
    return (
      <main className="px-4 py-8 lg:px-6">
        <p className="text-alert">{error || "设置加载失败"}</p>
      </main>
    );
  }

  const profile = data.profile;
  const preferences = data.preferences;

  const updateLocal = (next: UserProfileResponse) => {
    setData(next);
  };

  const refreshFromServer = async () => {
    const next = await getUserProfile(userId);
    updateLocal(next);
    return next;
  };

  const handleGoalChange = async (goal: Goal) => {
    await patchBodyProfile(userId, { goal });
    const next = await refreshFromServer();
    addDebugLog("mem0", `[Profile] goal -> ${goalLabels[next.profile.goal]}`);
    setGoalModalOpen(false);
  };

  const handleBodyNumberChange = async (type: NumberEditType, value: number) => {
    const payload =
      type === "height"
        ? { height: value }
        : type === "weight"
        ? { weight: value }
        : type === "household_size"
        ? { household_size: value }
        : type === "time_budget_minutes"
        ? { time_budget_minutes: value }
        : { purchase_frequency_per_week: value };
    await patchBodyProfile(userId, payload);
    await refreshFromServer();
  };

  const syncPreference = async (
    type: string,
    value: string | string[],
    action?: "add" | "remove" | "set"
  ) => {
    await updatePreference(userId, type, value, action);
    await refreshFromServer();
  };

  const handleDebugToggle = async (enabled: boolean) => {
    setDebugMode(enabled);
    await patchSystemSettings(userId, { debug_mode: enabled });
    await refreshFromServer();
    addDebugLog("info", `[System] Debug mode ${enabled ? "enabled" : "disabled"}`);
  };

  const handleAthleteDraftChange = <K extends keyof AthleteDraft>(
    key: K,
    value: AthleteDraft[K]
  ) => {
    setAthleteDraft((prev) => ({ ...prev, [key]: value }));
  };

  const handleSaveAthleteProfile = async () => {
    setSavingAthlete(true);
    try {
      await patchBodyProfile(userId, {
        sport_type: athleteDraft.sport_type.trim() || null,
        training_days_per_week: athleteDraft.training_days_per_week
          ? Number(athleteDraft.training_days_per_week)
          : null,
        training_intensity: athleteDraft.training_intensity || null,
        competition_cycle: athleteDraft.competition_cycle || null,
        training_notes: athleteDraft.training_notes.trim() || null,
      });
      await refreshFromServer();
      addDebugLog("mem0", "[Profile] athlete context updated");
    } finally {
      setSavingAthlete(false);
    }
  };

  return (
    <>
      <header className="sticky top-0 left-0 right-0 z-40 border-b border-zinc-200/80 bg-zinc-50/95 pt-safe backdrop-blur">
        <div className="flex h-14 items-center px-4 lg:px-6">
          <h1 className="text-xl font-semibold text-zinc-900">Me</h1>
        </div>
      </header>

      <main className="min-h-screen bg-zinc-50 px-4 py-4 lg:px-6 lg:py-8">
        <div className="mx-auto max-w-6xl">
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.75fr)]">
            <div className="space-y-6">
              <SettingsGroup title="身体档案">
                <SettingsRow
                  icon={<Ruler className="h-5 w-5" />}
                  label="身高"
                  value={`${profile.height} cm`}
                  onClick={() => setNumberEditType("height")}
                  showChevron
                />
                <SettingsRow
                  icon={<Weight className="h-5 w-5" />}
                  label="体重"
                  value={`${profile.weight} kg`}
                  onClick={() => setNumberEditType("weight")}
                  showChevron
                />
                <SettingsRow
                  icon={<HeartPulse className="h-5 w-5" />}
                  label="BMI"
                  value={profile.bmi != null ? `${profile.bmi}` : "—"}
                />
                <SettingsRow
                  icon={<Users className="h-5 w-5" />}
                  label="家庭人数"
                  value={`${profile.household_size} 人`}
                  onClick={() => setNumberEditType("household_size")}
                  showChevron
                />
                <SettingsRow
                  icon={<Clock3 className="h-5 w-5" />}
                  label="工作日时间预算"
                  value={`${profile.time_budget_minutes} 分钟`}
                  onClick={() => setNumberEditType("time_budget_minutes")}
                  showChevron
                />
                <SettingsRow
                  icon={<Clock3 className="h-5 w-5" />}
                  label="每周采购频率"
                  value={
                    profile.purchase_frequency_per_week >= 4
                      ? "4+ 次/周"
                      : `${profile.purchase_frequency_per_week} 次/周`
                  }
                  onClick={() => setNumberEditType("purchase_frequency_per_week")}
                  showChevron
                />
                <SettingsRow
                  icon={<Target className="h-5 w-5" />}
                  label="目标"
                  value={goalLabels[profile.goal]}
                  onClick={() => setGoalModalOpen(true)}
                  showChevron
                  isLast
                />
              </SettingsGroup>

              <SettingsGroup title="运动表现">
                <div className="space-y-4 bg-white px-4 py-4 lg:px-5">
                  <div className="grid gap-4 md:grid-cols-2">
                    <label className="space-y-2">
                      <span className="flex items-center gap-2 text-sm font-medium text-zinc-700">
                        <Dumbbell className="h-4 w-4 text-primary" />
                        运动项目
                      </span>
                      <input
                        type="text"
                        value={athleteDraft.sport_type}
                        onChange={(event) =>
                          handleAthleteDraftChange("sport_type", event.target.value)
                        }
                        placeholder="例如：羽毛球、游泳、铁三"
                        className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-3 text-sm text-zinc-900 outline-none transition focus:border-primary/50 focus:ring-2 focus:ring-primary/20"
                      />
                    </label>

                    <label className="space-y-2">
                      <span className="flex items-center gap-2 text-sm font-medium text-zinc-700">
                        <Clock3 className="h-4 w-4 text-primary" />
                        每周训练天数
                      </span>
                      <input
                        type="number"
                        min={0}
                        max={14}
                        value={athleteDraft.training_days_per_week}
                        onChange={(event) =>
                          handleAthleteDraftChange("training_days_per_week", event.target.value)
                        }
                        placeholder="0-14"
                        className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-3 text-sm text-zinc-900 outline-none transition focus:border-primary/50 focus:ring-2 focus:ring-primary/20"
                      />
                    </label>
                  </div>

                  <div className="space-y-2">
                    <span className="flex items-center gap-2 text-sm font-medium text-zinc-700">
                      <Gauge className="h-4 w-4 text-primary" />
                      训练强度
                    </span>
                    <div className="flex flex-wrap gap-2">
                      {TRAINING_INTENSITY_OPTIONS.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => handleAthleteDraftChange("training_intensity", option.value)}
                          className={`rounded-xl border px-4 py-2 text-sm font-medium transition-colors ${
                            athleteDraft.training_intensity === option.value
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-zinc-200 bg-zinc-50 text-zinc-600 hover:border-primary/40"
                          }`}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <span className="flex items-center gap-2 text-sm font-medium text-zinc-700">
                      <Trophy className="h-4 w-4 text-primary" />
                      赛事周期
                    </span>
                    <div className="flex flex-wrap gap-2">
                      {COMPETITION_CYCLE_OPTIONS.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => handleAthleteDraftChange("competition_cycle", option.value)}
                          className={`rounded-xl border px-4 py-2 text-sm font-medium transition-colors ${
                            athleteDraft.competition_cycle === option.value
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-zinc-200 bg-zinc-50 text-zinc-600 hover:border-primary/40"
                          }`}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <label className="space-y-2">
                    <span className="flex items-center gap-2 text-sm font-medium text-zinc-700">
                      <NotebookPen className="h-4 w-4 text-primary" />
                      训练计划备注
                    </span>
                    <textarea
                      value={athleteDraft.training_notes}
                      onChange={(event) =>
                        handleAthleteDraftChange("training_notes", event.target.value)
                      }
                      rows={4}
                      placeholder="例如：周二力量，周四间歇，周日长距离。"
                      className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-3 text-sm leading-6 text-zinc-900 outline-none transition focus:border-primary/50 focus:ring-2 focus:ring-primary/20"
                    />
                  </label>

                  <button
                    type="button"
                    onClick={handleSaveAthleteProfile}
                    disabled={savingAthlete}
                    className="inline-flex rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {savingAthlete ? "保存中..." : "保存运动员信息"}
                  </button>
                </div>
              </SettingsGroup>

              <SettingsGroup title="Agent 调教">
                <SettingsRow
                  icon={<Ban className="h-5 w-5" />}
                  label="忌口管理"
                  value={preferences.dislikes.length > 0 ? `${preferences.dislikes.length} 项` : "无"}
                  onClick={() => setDislikesModalOpen(true)}
                  showChevron
                />
                <div className="border-b border-zinc-100 bg-white px-4 py-3 lg:px-5">
                  <div className="mb-3 flex items-center gap-3">
                    <span className="flex h-5 w-5 items-center justify-center text-primary">
                      <ChefHat className="h-5 w-5" />
                    </span>
                    <span className="text-base font-medium text-zinc-900">厨艺水平</span>
                  </div>
                  <SegmentedControl
                    options={COOKING_LEVEL_OPTIONS}
                    value={preferences.level}
                    onChange={(value) => syncPreference("cooking_level", value)}
                    className="w-full"
                  />
                </div>
                <div className="border-b border-zinc-100 bg-white px-4 py-3 lg:px-5">
                  <div className="mb-3 flex items-center gap-3">
                    <span className="flex h-5 w-5 items-center justify-center text-primary">
                      <UtensilsCrossed className="h-5 w-5" />
                    </span>
                    <span className="text-base font-medium text-zinc-900">口味偏好</span>
                  </div>
                  <ChipSelect
                    options={FLAVOR_OPTIONS}
                    selected={preferences.flavors}
                    onChange={(values) => syncPreference("flavor_tags", values)}
                  />
                </div>
                <div className="border-b border-zinc-100 bg-white px-4 py-3 lg:px-5">
                  <div className="mb-3 flex items-center gap-3">
                    <span className="flex h-5 w-5 items-center justify-center text-primary">
                      <Globe className="h-5 w-5" />
                    </span>
                    <span className="text-base font-medium text-zinc-900">偏好菜系</span>
                  </div>
                  <ChipSelect
                    options={CUISINE_OPTIONS}
                    selected={preferences.cuisines}
                    onChange={(values) => syncPreference("cuisine_tags", values)}
                  />
                </div>
                <div className="border-b border-zinc-100 bg-white px-4 py-3 lg:px-5">
                  <div className="mb-3 flex items-center gap-3">
                    <span className="flex h-5 w-5 items-center justify-center text-primary">
                      <Flame className="h-5 w-5" />
                    </span>
                    <span className="text-base font-medium text-zinc-900">偏好做法</span>
                  </div>
                  <ChipSelect
                    options={METHOD_OPTIONS}
                    selected={preferences.methods}
                    onChange={(values) => syncPreference("method_tags", values)}
                  />
                </div>
                <div className="border-b border-zinc-100 bg-white px-4 py-3 lg:px-5">
                  <div className="mb-3 flex items-center gap-3">
                    <span className="flex h-5 w-5 items-center justify-center text-primary">
                      <HeartPulse className="h-5 w-5" />
                    </span>
                    <span className="text-base font-medium text-zinc-900">特殊人群约束</span>
                  </div>
                  <ChipSelect
                    options={HEALTH_CONSTRAINT_OPTIONS.map((key) => healthConstraintLabels[key])}
                    selected={preferences.health_constraints.map(
                      (constraint) =>
                        healthConstraintLabels[
                          constraint as keyof typeof healthConstraintLabels
                        ] || constraint
                    )}
                    onChange={(values) => {
                      const keys = HEALTH_CONSTRAINT_OPTIONS.filter((key) =>
                        values.includes(healthConstraintLabels[key])
                      );
                      syncPreference("health_constraints", [...keys]);
                    }}
                  />
                </div>
                <div className="bg-white px-4 py-3 lg:px-5">
                  <div className="mb-3 flex items-center gap-3">
                    <span className="flex h-5 w-5 items-center justify-center text-primary">
                      <Wrench className="h-5 w-5" />
                    </span>
                    <span className="text-base font-medium text-zinc-900">厨房设备</span>
                  </div>
                  <ChipSelect
                    options={KITCHEN_TOOL_OPTIONS}
                    selected={preferences.kitchen_tools}
                    onChange={(values) => syncPreference("kitchen_tools", values)}
                  />
                </div>
              </SettingsGroup>
            </div>

            <div className="space-y-6 xl:pt-7">
              <SettingsGroup title="开发者选项">
                <SettingsRow
                  icon={<Bug className="h-5 w-5" />}
                  label="调试模式"
                  action={<Switch checked={system.debugMode} onChange={handleDebugToggle} />}
                  isLast
                />
              </SettingsGroup>

              <section className="rounded-[24px] border border-zinc-200/70 bg-white/90 px-5 py-6 text-center text-zinc-400 shadow-sm ring-1 ring-zinc-950/5">
                <p className="text-xs uppercase tracking-[0.28em] text-zinc-400/80">LightTable</p>
                <p className="mt-3 text-sm font-medium text-zinc-600">MVP Demo</p>
                <p className="mt-2 text-sm leading-6 text-zinc-500">
                  推荐会综合库存、特殊约束和简单偏好信号，不提供医疗建议。
                </p>
              </section>
            </div>
          </div>
        </div>
      </main>

      <Modal isOpen={goalModalOpen} onClose={() => setGoalModalOpen(false)} title="选择目标">
        <div className="space-y-3">
          {GOAL_OPTIONS.map((option) => {
            const isSelected = profile.goal === option.value;
            return (
              <button
                key={option.value}
                onClick={() => handleGoalChange(option.value)}
                className={`w-full rounded-xl border-2 p-4 text-left transition-all ${
                  isSelected
                    ? "border-primary bg-primary/10"
                    : "border-transparent bg-zinc-50 hover:border-zinc-200"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className={`font-semibold ${isSelected ? "text-primary" : "text-zinc-900"}`}>
                    {option.label}
                  </span>
                </div>
                <p className="mt-1 text-sm text-zinc-500">{option.description}</p>
              </button>
            );
          })}
        </div>
      </Modal>

      <Modal isOpen={dislikesModalOpen} onClose={() => setDislikesModalOpen(false)} title="忌口管理">
        <DislikesEditor
          dislikes={preferences.dislikes}
          onAdd={(item) => syncPreference("dislikes", item, "add")}
          onRemove={(item) => syncPreference("dislikes", item, "remove")}
        />
      </Modal>

      {numberEditType && (
        <NumberEditSheet
          type={numberEditType}
          value={
            numberEditType === "height"
              ? profile.height
              : numberEditType === "weight"
              ? profile.weight
              : numberEditType === "household_size"
              ? profile.household_size
              : numberEditType === "time_budget_minutes"
              ? profile.time_budget_minutes
              : profile.purchase_frequency_per_week
          }
          onConfirm={(value) => handleBodyNumberChange(numberEditType, value)}
          isOpen={!!numberEditType}
          onClose={() => setNumberEditType(null)}
        />
      )}
    </>
  );
}
