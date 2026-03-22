"use client";

import { Suspense, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { RecipeCard } from "@/components/features/RecipeCard";
import { Button } from "@/components/ui/Button";
import { recommend, sendFeedback } from "@/lib/api";
import { cn } from "@/lib/cn";
import { useGlobalStore } from "@/lib/store";
import type { RecommendationPlan, ShoppingListItem } from "@/lib/types";
import { getUserId } from "@/lib/user";

const DECIDE_TAGS = [
  { id: "消耗临期", label: "消耗临期" },
  { id: "减脂", label: "减脂" },
  { id: "快手菜", label: "快手菜" },
] as const;

const TYPEWRITER_LINES = ["正在读取库存…", "正在套用饮食约束…", "正在生成方案…"];

function DecidePageContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [selectedTags, setSelectedTags] = useState<string[]>(["消耗临期"]);
  const [phase, setPhase] = useState<"input" | "generating" | "results">("input");
  const [typewriterIndex, setTypewriterIndex] = useState(0);
  const [typewriterLines, setTypewriterLines] = useState<string[]>(TYPEWRITER_LINES);
  const [plans, setPlans] = useState<RecommendationPlan[]>([]);
  const [shoppingSuggestions, setShoppingSuggestions] = useState<ShoppingListItem[]>([]);
  const [profileSummary, setProfileSummary] = useState("");
  const [strategySummary, setStrategySummary] = useState("");
  const [activeRequestId, setActiveRequestId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
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
    setSelectedTags(snapshot.selectedTags);
    setPlans(snapshot.plans);
    setShoppingSuggestions(snapshot.shoppingSuggestions);
    setProfileSummary(snapshot.profileSummary);
    setStrategySummary(snapshot.strategySummary);
    setActiveRequestId(snapshot.requestId);
    setError(null);
    setPhase("results");
  }, [currentRecommendationId, recommendationSnapshots, searchParams]);

  const toggleTag = (tagId: string) => {
    setSelectedTags((prev) =>
      prev.includes(tagId) ? prev.filter((tag) => tag !== tagId) : [...prev, tagId]
    );
  };

  const handleStart = async () => {
    setPhase("generating");
    setTypewriterIndex(0);
    setError(null);
    setPlans([]);
    setShoppingSuggestions([]);

    try {
      const userId = getUserId();
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
        "正在读取库存…",
        `用户画像：${result.profileSummary.slice(0, 22)}…`,
        `策略：${result.strategySummary}`,
        "方案已就绪。",
      ]);
      addDebugLog("rag", `[Recommend] ${result.strategySummary}`);
      setTimeout(() => {
        router.replace(
          `${pathname}?view=results&request_id=${encodeURIComponent(result.requestId)}`,
          { scroll: false }
        );
        setPhase("results");
      }, 500);
    } catch (cause) {
      console.error(cause);
      setError("生成推荐失败，请稍后重试");
      setPhase("input");
      addDebugLog("error", "[Recommend] Failed to generate plans");
    }
  };

  const handleReset = async () => {
    if (plans.length > 0) {
      const firstDish = plans[0]?.dishes[0];
      if (firstDish) {
        await sendFeedback(getUserId(), "skip", firstDish.recipeId, "重新规划", [], {
          tags: plans[0].fitTags,
          difficulty: plans[0].difficulty,
        }).catch(() => undefined);
      }
    }
    setPhase("input");
    setPlans([]);
    setShoppingSuggestions([]);
    setProfileSummary("");
    setStrategySummary("");
    setActiveRequestId(null);
    setTypewriterIndex(0);
    clearLastRecommendation();
    router.replace(pathname, { scroll: false });
  };

  return (
    <>
      <header className="sticky top-0 left-0 right-0 z-40 border-b border-border bg-surface/95 pt-safe backdrop-blur">
        <div className="flex h-14 items-center justify-between px-4 lg:px-6">
          <h1 className="text-lg font-semibold text-text-main">决策</h1>
          {phase === "results" && (
            <button onClick={handleReset} className="text-sm font-medium text-primary">
              重新规划
            </button>
          )}
        </div>
      </header>

      <main className="px-4 py-4 lg:px-6 lg:py-8">
        {phase === "input" && (
          <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
            <section className="rounded-[24px] border border-border bg-surface p-5 shadow-sm">
              <p className="text-sm font-medium text-text-muted">今晚怎么吃</p>
              <h2 className="mt-3 text-2xl font-semibold text-text-main">调用大模型为你私人订制菜谱</h2>
              <p className="mt-3 text-sm leading-6 text-text-muted">
                推荐会优先考虑临期食材、特殊约束、时间预算和你最近的偏好信号。
              </p>
            </section>
            <section className="rounded-[24px] border border-border bg-surface p-5 shadow-sm">
              <p className="mb-3 text-base font-medium text-text-main">今天偏向什么？</p>
              <div className="mb-6 flex flex-wrap gap-2">
                {DECIDE_TAGS.map((tag) => (
                  <button
                    key={tag.id}
                    type="button"
                    onClick={() => toggleTag(tag.id)}
                    className={cn(
                      "rounded-xl border px-4 py-2 text-sm font-medium transition-colors",
                      selectedTags.includes(tag.id)
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-background text-text-muted hover:border-primary/50"
                    )}
                  >
                    #{tag.label}
                  </button>
                ))}
              </div>
              {error && <p className="mb-4 text-sm text-alert">{error}</p>}
              <Button fullWidth onClick={handleStart}>
                开始规划
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
              <p className="text-sm text-text-muted">策略摘要</p>
              <p className="mt-2 text-sm leading-6 text-text-main">{profileSummary}</p>
              <p className="mt-2 text-sm text-text-muted">{strategySummary}</p>
            </section>

            {plans.length === 0 ? (
              <section className="rounded-[24px] border border-border bg-surface p-5 text-center text-text-muted shadow-sm">
                暂时没有合适菜谱，建议先去补货页看看。
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
                <p className="text-sm font-medium text-text-main">补货建议</p>
                <ul className="mt-3 space-y-2 text-sm text-text-muted">
                  {shoppingSuggestions.map((item) => (
                    <li key={item.id}>
                      {item.displayName}：{item.reason}
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        )}
      </main>
    </>
  );
}

function DecidePageFallback() {
  return (
    <>
      <header className="sticky top-0 left-0 right-0 z-40 border-b border-border bg-surface/95 pt-safe backdrop-blur">
        <div className="flex h-14 items-center justify-between px-4 lg:px-6">
          <h1 className="text-lg font-semibold text-text-main">决策</h1>
        </div>
      </header>

      <main className="px-4 py-4 lg:px-6 lg:py-8">
        <div className="mx-auto max-w-2xl rounded-[24px] border border-border bg-surface px-5 py-8 text-sm text-text-muted shadow-sm">
          加载中...
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
