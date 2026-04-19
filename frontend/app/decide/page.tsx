"use client";

import { Suspense, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { RecipeCard } from "@/components/features/RecipeCard";
import { Button } from "@/components/ui/Button";
import {
  recommend,
  recommendWeekly,
  saveShoppingListItems,
  sendFeedback,
} from "@/lib/api";
import { cn } from "@/lib/cn";
import { getDecideTagLabel, pickByLocale, useLocale } from "@/lib/i18n";
import { useGlobalStore } from "@/lib/store";
import type {
  RecommendationPlan,
  ShoppingListItem,
  WeeklyRecommendResponse,
} from "@/lib/types";
import { getUserId } from "@/lib/user";

const DECIDE_TAGS = ["减脂", "增肌", "运动后恢复", "消耗临期", "快手菜"] as const;

type PlanningMode = "single" | "weekly";

function DecidePageContent() {
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [planningMode, setPlanningMode] = useState<PlanningMode>("single");
  const [selectedTags, setSelectedTags] = useState<string[]>(["消耗临期"]);
  const [phase, setPhase] = useState<"input" | "generating" | "results">("input");
  const [typewriterIndex, setTypewriterIndex] = useState(0);
  const [typewriterLines, setTypewriterLines] = useState<string[]>([]);
  const [plans, setPlans] = useState<RecommendationPlan[]>([]);
  const [shoppingSuggestions, setShoppingSuggestions] = useState<ShoppingListItem[]>([]);
  const [profileSummary, setProfileSummary] = useState("");
  const [strategySummary, setStrategySummary] = useState("");
  const [activeRequestId, setActiveRequestId] = useState<string | null>(null);
  const [weeklyResult, setWeeklyResult] = useState<WeeklyRecommendResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [addingRequiredIngredients, setAddingRequiredIngredients] = useState(false);
  const {
    addDebugLog,
    currentRecommendationId,
    recommendationSnapshots,
    setLastRecommendation,
    clearLastRecommendation,
  } = useGlobalStore();

  useEffect(() => {
    if (phase !== "generating") return;
    if (typewriterIndex >= typewriterLines.length) return;
    const timer = setTimeout(() => setTypewriterIndex((value) => value + 1), 750);
    return () => clearTimeout(timer);
  }, [phase, typewriterIndex, typewriterLines]);

  useEffect(() => {
    if (searchParams.get("view") !== "results") return;
    const requestedId = searchParams.get("request_id") || currentRecommendationId;
    if (!requestedId) return;
    const snapshot = recommendationSnapshots[requestedId];
    if (!snapshot) return;
    setPlanningMode("single");
    setSelectedTags(snapshot.selectedTags);
    setPlans(snapshot.plans);
    setShoppingSuggestions(snapshot.shoppingSuggestions);
    setProfileSummary(snapshot.profileSummary);
    setStrategySummary(snapshot.strategySummary);
    setActiveRequestId(snapshot.requestId);
    setWeeklyResult(null);
    setError(null);
    setActionMessage(null);
    setPhase("results");
  }, [currentRecommendationId, recommendationSnapshots, searchParams]);

  useEffect(() => {
    setTypewriterLines([
      pickByLocale(locale, { zh: "正在读取库存…", en: "Reading inventory..." }),
      pickByLocale(locale, { zh: "正在套用饮食约束…", en: "Applying dietary constraints..." }),
      pickByLocale(locale, { zh: "正在生成方案…", en: "Generating plans..." }),
    ]);
  }, [locale]);

  const toggleTag = (tagId: string) => {
    setSelectedTags((prev) =>
      prev.includes(tagId) ? prev.filter((tag) => tag !== tagId) : [...prev, tagId]
    );
  };

  const resetLocalResults = () => {
    setPlans([]);
    setShoppingSuggestions([]);
    setProfileSummary("");
    setStrategySummary("");
    setActiveRequestId(null);
    setWeeklyResult(null);
    setTypewriterIndex(0);
    setActionMessage(null);
  };

  const handleStart = async () => {
    setPhase("generating");
    setTypewriterIndex(0);
    setTypewriterLines([
      pickByLocale(locale, { zh: "正在读取库存…", en: "Reading inventory..." }),
      pickByLocale(locale, { zh: "正在套用饮食约束…", en: "Applying dietary constraints..." }),
      pickByLocale(locale, { zh: "正在生成方案…", en: "Generating plans..." }),
    ]);
    setError(null);
    setActionMessage(null);
    resetLocalResults();

    try {
      const userId = getUserId();
      if (planningMode === "single") {
        const result = await recommend(userId, selectedTags, {});
        setPlans(result.plans);
        setShoppingSuggestions(result.shoppingSuggestions);
        setProfileSummary(result.profileSummary);
        setStrategySummary(result.strategySummary);
        setActiveRequestId(result.requestId);
        setLastRecommendation({
          requestId: result.requestId,
          selectedTags,
          profileSummary: result.profileSummary,
          strategySummary: result.strategySummary,
          plans: result.plans,
          shoppingSuggestions: result.shoppingSuggestions,
        });
        setTypewriterLines([
          pickByLocale(locale, { zh: "正在读取库存…", en: "Reading inventory..." }),
          pickByLocale(locale, {
            zh: `用户画像：${result.profileSummary.slice(0, 22)}…`,
            en: `Profile: ${result.profileSummary.slice(0, 22)}...`,
          }),
          pickByLocale(locale, {
            zh: `策略：${result.strategySummary}`,
            en: `Strategy: ${result.strategySummary}`,
          }),
          pickByLocale(locale, { zh: "方案已就绪。", en: "Plans are ready." }),
        ]);
        addDebugLog("rag", `[Recommend] ${result.strategySummary}`);
        setTimeout(() => {
          router.replace(
            `${pathname}?view=results&request_id=${encodeURIComponent(result.requestId)}`,
            { scroll: false }
          );
          setPhase("results");
        }, 500);
        return;
      }

      const result = await recommendWeekly(userId, selectedTags, {});
      setWeeklyResult(result);
      setProfileSummary(result.profileSummary);
      setStrategySummary(result.strategySummary);
      setShoppingSuggestions(result.shoppingSuggestions);
      setTypewriterLines([
        pickByLocale(locale, { zh: "正在盘点库存覆盖率…", en: "Checking inventory coverage..." }),
        pickByLocale(locale, {
          zh: `用户画像：${result.profileSummary.slice(0, 22)}…`,
          en: `Profile: ${result.profileSummary.slice(0, 22)}...`,
        }),
        pickByLocale(locale, {
          zh: `策略：${result.strategySummary}`,
          en: `Strategy: ${result.strategySummary}`,
        }),
        result.status === "ready"
          ? pickByLocale(locale, { zh: "7 天主餐已就绪。", en: "7-day meal plan is ready." })
          : pickByLocale(locale, {
              zh: "需要先补齐关键食材。",
              en: "Some key ingredients need to be restocked first.",
            }),
      ]);
      addDebugLog("rag", `[Weekly] ${result.strategySummary}`);
      setTimeout(() => setPhase("results"), 500);
    } catch (cause) {
      console.error(cause);
      setError(
        planningMode === "single"
          ? pickByLocale(locale, {
              zh: "生成推荐失败，请稍后重试",
              en: "Failed to generate recommendations. Please try again.",
            })
          : pickByLocale(locale, {
              zh: "周食谱生成失败，请稍后重试",
              en: "Failed to generate the weekly plan. Please try again.",
            })
      );
      setPhase("input");
      addDebugLog(
        "error",
        planningMode === "single" ? "[Recommend] Failed to generate plans" : "[Weekly] Failed to generate plans"
      );
    }
  };

  const handleReset = async () => {
    if (planningMode === "single" && plans.length > 0) {
      const firstDish = plans[0]?.dishes[0];
      if (firstDish) {
        await sendFeedback(getUserId(), "skip", firstDish.recipeId, "重新规划", [], {
          tags: plans[0].fitTags,
          difficulty: plans[0].difficulty,
        }).catch(() => undefined);
      }
    }
    setPhase("input");
    resetLocalResults();
    clearLastRecommendation();
    router.replace(pathname, { scroll: false });
  };

  const handleAddRequiredIngredients = async () => {
    if (!weeklyResult) return;
    const sourceItems =
      weeklyResult.requiredIngredients.length > 0
        ? weeklyResult.requiredIngredients
        : weeklyResult.shoppingSuggestions;
    if (sourceItems.length === 0) return;

    setAddingRequiredIngredients(true);
    setActionMessage(null);
    try {
      await saveShoppingListItems(
        getUserId(),
        sourceItems.map((item) => ({
          displayName: item.displayName,
          normalizedName: item.normalizedName,
          category: item.category,
          quantityText: item.quantityText || undefined,
          recommendedQuantityText: item.recommendedQuantityText || undefined,
          reason: item.reason,
        }))
      );
      setActionMessage(
        pickByLocale(locale, {
          zh: "已加入购物清单，补齐后可再回来生成一周食谱。",
          en: "Added to the shopping list. Come back after restocking to generate the weekly plan.",
        })
      );
    } catch (cause) {
      console.error(cause);
      setActionMessage(
        pickByLocale(locale, {
          zh: "加入购物清单失败，请稍后再试。",
          en: "Failed to add items to the shopping list. Please try again.",
        })
      );
    } finally {
      setAddingRequiredIngredients(false);
    }
  };

  return (
    <>
      <header className="sticky top-0 left-0 right-0 z-40 border-b border-border bg-surface/95 pt-safe backdrop-blur">
        <div className="flex h-14 items-center justify-between px-4 lg:px-6">
          <h1 className="text-lg font-semibold text-text-main">
            {pickByLocale(locale, { zh: "决策", en: "Decide" })}
          </h1>
          {phase === "results" && (
            <button onClick={handleReset} className="text-sm font-medium text-primary">
              {pickByLocale(locale, { zh: "重新规划", en: "Replan" })}
            </button>
          )}
        </div>
      </header>

      <main className="px-4 py-4 lg:px-6 lg:py-8">
        {phase === "input" && (
          <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
            <section className="rounded-[24px] border border-border bg-surface p-5 shadow-sm">
              <p className="text-sm font-medium text-text-muted">
                {planningMode === "single"
                  ? pickByLocale(locale, { zh: "今晚怎么吃", en: "What should I eat tonight?" })
                  : pickByLocale(locale, { zh: "一周怎么吃", en: "What should I eat this week?" })}
              </p>
              <h2 className="mt-3 text-2xl font-semibold text-text-main">
                {planningMode === "single"
                  ? pickByLocale(locale, {
                      zh: "调用大模型为你私人订制菜谱",
                      en: "Generate a personalized meal plan with AI",
                    })
                  : pickByLocale(locale, {
                      zh: "按库存和训练周期排 7 天主餐计划",
                      en: "Build a 7-day meal plan around inventory and training",
                    })}
              </h2>
              <p className="mt-3 text-sm leading-6 text-text-muted">
                {planningMode === "single"
                  ? pickByLocale(locale, {
                      zh: "推荐会优先考虑临期食材、特殊约束、时间预算和你最近的偏好信号。",
                      en: "Recommendations prioritize expiring items, constraints, time budget, and your recent preferences.",
                    })
                  : pickByLocale(locale, {
                      zh: "周计划会优先使用现有库存；如果关键食材不够，会先要求补齐再生成。",
                      en: "The weekly plan uses current inventory first. If key ingredients are missing, it will ask you to restock before generating.",
                    })}
              </p>
            </section>

            <section className="rounded-[24px] border border-border bg-surface p-5 shadow-sm">
              <p className="mb-3 text-base font-medium text-text-main">
                {pickByLocale(locale, { zh: "规划方式", en: "Planning mode" })}
              </p>
              <div className="mb-6 grid gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => setPlanningMode("single")}
                  className={cn(
                    "rounded-2xl border px-4 py-3 text-left transition-colors",
                    planningMode === "single"
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-background text-text-muted"
                  )}
                >
                  <p className="font-medium">
                    {pickByLocale(locale, { zh: "今晚吃什么", en: "Tonight's meal" })}
                  </p>
                  <p className="mt-1 text-xs">
                    {pickByLocale(locale, { zh: "适合单次决策", en: "Best for one-off decisions" })}
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => setPlanningMode("weekly")}
                  className={cn(
                    "rounded-2xl border px-4 py-3 text-left transition-colors",
                    planningMode === "weekly"
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-background text-text-muted"
                  )}
                >
                  <p className="font-medium">
                    {pickByLocale(locale, { zh: "一周主餐", en: "Weekly meals" })}
                  </p>
                  <p className="mt-1 text-xs">
                    {pickByLocale(locale, { zh: "适合训练期排餐", en: "Great for training cycles" })}
                  </p>
                </button>
              </div>

              <p className="mb-3 text-base font-medium text-text-main">
                {pickByLocale(locale, { zh: "今天偏向什么？", en: "What are you in the mood for today?" })}
              </p>
              <div className="mb-6 flex flex-wrap gap-2">
                {DECIDE_TAGS.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => toggleTag(tag)}
                    className={cn(
                      "rounded-xl border px-4 py-2 text-sm font-medium transition-colors",
                      selectedTags.includes(tag)
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-background text-text-muted hover:border-primary/50"
                    )}
                  >
                    #{getDecideTagLabel(tag, locale)}
                  </button>
                ))}
              </div>
              {error && <p className="mb-4 text-sm text-alert">{error}</p>}
              <Button fullWidth onClick={handleStart}>
                {planningMode === "single"
                  ? pickByLocale(locale, { zh: "开始规划", en: "Start planning" })
                  : pickByLocale(locale, { zh: "生成一周食谱", en: "Generate weekly plan" })}
              </Button>
            </section>
          </div>
        )}

        {phase === "generating" && (
          <div className="mx-auto max-w-2xl rounded-[24px] border border-border bg-surface px-5 py-8 shadow-sm">
            <div className="space-y-2">
              {typewriterLines.slice(0, typewriterIndex).map((line) => (
                <p key={line} className="text-sm text-text-muted">
                  {line}
                </p>
              ))}
              {typewriterIndex < typewriterLines.length && (
                <span className="inline-block h-4 w-2 animate-pulse bg-primary" />
              )}
            </div>
          </div>
        )}

        {phase === "results" && (
          <div className="space-y-4">
            <section className="rounded-[24px] border border-border bg-surface p-5 shadow-sm">
              <p className="text-sm text-text-muted">
                {pickByLocale(locale, { zh: "策略摘要", en: "Strategy summary" })}
              </p>
              <p className="mt-2 text-sm leading-6 text-text-main">{profileSummary}</p>
              <p className="mt-2 text-sm text-text-muted">{strategySummary}</p>
              {actionMessage && <p className="mt-3 text-sm text-primary">{actionMessage}</p>}
            </section>

            {planningMode === "single" ? (
              <>
                {plans.length === 0 ? (
                  <section className="rounded-[24px] border border-border bg-surface p-5 text-center text-text-muted shadow-sm">
                    {pickByLocale(locale, {
                      zh: "暂时没有合适菜谱，建议先去补货页看看。",
                      en: "No suitable recipes right now. Check the restock page first.",
                    })}
                  </section>
                ) : (
                  <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {plans.map((plan) => (
                      <li key={`${plan.planId}-${plan.dishes[0]?.recipeId || "none"}`}>
                        <RecipeCard plan={plan} requestId={activeRequestId} />
                      </li>
                    ))}
                  </ul>
                )}

                {shoppingSuggestions.length > 0 && (
                  <section className="rounded-[24px] border border-border bg-surface p-5 shadow-sm">
                    <p className="text-sm font-medium text-text-main">
                      {pickByLocale(locale, { zh: "补货建议", en: "Restock suggestions" })}
                    </p>
                    <ul className="mt-3 space-y-2 text-sm text-text-muted">
                      {shoppingSuggestions.map((item) => (
                        <li key={item.id}>
                          {item.displayName}：{item.reason}
                        </li>
                      ))}
                    </ul>
                  </section>
                )}
              </>
            ) : weeklyResult?.status === "needs_ingredients" ? (
              <section className="rounded-[24px] border border-border bg-surface p-5 shadow-sm">
                <p className="text-base font-medium text-text-main">
                  {pickByLocale(locale, { zh: "先补齐关键食材", en: "Restock key ingredients first" })}
                </p>
                <ul className="mt-3 space-y-2 text-sm text-text-muted">
                  {weeklyResult.blockingReasons.map((reason) => (
                    <li key={reason}>{reason}</li>
                  ))}
                </ul>

                <div className="mt-4 rounded-2xl bg-background p-4">
                  <p className="text-sm font-medium text-text-main">
                    {pickByLocale(locale, { zh: "建议补充", en: "Suggested items" })}
                  </p>
                  <ul className="mt-3 space-y-3 text-sm text-text-muted">
                    {weeklyResult.requiredIngredients.map((item) => (
                      <li key={item.id}>
                        <p className="font-medium text-text-main">{item.displayName}</p>
                        <p className="mt-1">
                          {item.recommendedQuantityText
                            ? pickByLocale(locale, {
                                zh: `建议补 ${item.recommendedQuantityText}`,
                                en: `Suggested: ${item.recommendedQuantityText}`,
                              })
                            : pickByLocale(locale, {
                                zh: "建议补齐关键库存",
                                en: "Suggested: restore key inventory",
                              })}
                          ，{item.reason}
                        </p>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="mt-5 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={handleAddRequiredIngredients}
                    disabled={addingRequiredIngredients}
                    className="rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {addingRequiredIngredients
                      ? pickByLocale(locale, { zh: "加入中...", en: "Adding..." })
                      : pickByLocale(locale, { zh: "加入购物清单", en: "Add to shopping list" })}
                  </button>
                  <button
                    type="button"
                    onClick={() => router.push("/shopping")}
                    className="rounded-full border border-border px-4 py-2 text-sm font-medium text-text-main"
                  >
                    {pickByLocale(locale, { zh: "去补货页", en: "Open restock page" })}
                  </button>
                </div>
              </section>
            ) : (
              <>
                <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {weeklyResult?.days.map((day) => (
                    <article
                      key={`${day.dayLabel}-${day.plan.dishes[0]?.recipeId || day.plan.planId}`}
                      className="rounded-[24px] border border-border bg-surface p-5 shadow-sm"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="text-sm text-text-muted">{day.dayLabel}</p>
                          <h3 className="mt-1 text-lg font-semibold text-text-main">
                            {day.plan.dishes[0]?.title || day.plan.label}
                          </h3>
                        </div>
                        <span className="rounded-full bg-background px-3 py-1 text-xs text-text-muted">
                          {day.focus}
                        </span>
                      </div>
                      <p className="mt-3 text-sm leading-6 text-text-muted">{day.trainingHint}</p>
                      <p className="mt-3 text-sm leading-6 text-text-main">{day.plan.reason}</p>
                      {day.plan.fitTags.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {day.plan.fitTags.map((tag) => (
                            <span
                              key={`${day.dayLabel}-${tag}`}
                              className="rounded-full bg-background px-2 py-1 text-[11px] text-text-muted"
                            >
                              #{tag}
                            </span>
                          ))}
                        </div>
                      )}
                      <div className="mt-4 space-y-2 text-sm text-text-muted">
                        <p>
                          {pickByLocale(locale, { zh: "命中库存", en: "In stock" })}:{" "}
                          {day.plan.matchedInventory.join("、") ||
                            pickByLocale(locale, { zh: "待补录", en: "Not recorded yet" })}
                        </p>
                        <p>
                          {pickByLocale(locale, { zh: "缺失食材", en: "Missing ingredients" })}:{" "}
                          {day.plan.missingIngredients.join("、") ||
                            pickByLocale(locale, { zh: "无", en: "None" })}
                        </p>
                      </div>
                    </article>
                  ))}
                </section>

                {shoppingSuggestions.length > 0 && (
                  <section className="rounded-[24px] border border-border bg-surface p-5 shadow-sm">
                    <p className="text-sm font-medium text-text-main">
                      {pickByLocale(locale, { zh: "顺手补货建议", en: "Helpful restock suggestions" })}
                    </p>
                    <ul className="mt-3 space-y-2 text-sm text-text-muted">
                      {shoppingSuggestions.map((item) => (
                        <li key={item.id}>
                          {item.displayName}
                          {item.recommendedQuantityText ? ` (${item.recommendedQuantityText})` : ""}
                          ：{item.reason}
                        </li>
                      ))}
                    </ul>
                  </section>
                )}
              </>
            )}
          </div>
        )}
      </main>
    </>
  );
}

function DecidePageFallback() {
  const locale = useLocale();
  return (
    <>
      <header className="sticky top-0 left-0 right-0 z-40 border-b border-border bg-surface/95 pt-safe backdrop-blur">
        <div className="flex h-14 items-center justify-between px-4 lg:px-6">
          <h1 className="text-lg font-semibold text-text-main">
            {pickByLocale(locale, { zh: "决策", en: "Decide" })}
          </h1>
        </div>
      </header>

      <main className="px-4 py-4 lg:px-6 lg:py-8">
        <div className="mx-auto max-w-2xl rounded-[24px] border border-border bg-surface px-5 py-8 text-sm text-text-muted shadow-sm">
          {pickByLocale(locale, { zh: "加载中...", en: "Loading..." })}
        </div>
      </main>
    </>
  );
}

export default function DecidePage() {
  return (
    <Suspense fallback={<DecidePageFallback />}>
      <DecidePageContent />
    </Suspense>
  );
}
