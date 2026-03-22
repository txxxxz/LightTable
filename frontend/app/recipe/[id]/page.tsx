"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/Button";
import { completeRecipe, getRecipe, getRecipeVideoReference, sendFeedback } from "@/lib/api";
import { useGlobalStore } from "@/lib/store";
import type { Recipe, VideoReference } from "@/lib/types";
import { getUserId } from "@/lib/user";

export default function RecipeDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const userId = getUserId();
  const { addDebugLog } = useGlobalStore();

  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [videoReference, setVideoReference] = useState<VideoReference | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isStarted, setIsStarted] = useState(false);
  const [usageMode, setUsageMode] = useState<"all" | "half" | "custom">("all");
  const [customNote, setCustomNote] = useState("");
  const [completeState, setCompleteState] = useState<"idle" | "submitting" | "done">("idle");
  const [returnToResultsHref, setReturnToResultsHref] = useState("/decide?view=results");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const hash = window.location.hash.replace(/^#/, "");
    const params = new URLSearchParams(hash);
    const requestId = params.get("request_id");
    if (!requestId) return;
    setReturnToResultsHref(`/decide?view=results&request_id=${encodeURIComponent(requestId)}`);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [nextRecipe, nextVideo] = await Promise.all([
          getRecipe(id, userId),
          getRecipeVideoReference(id).catch(() => null),
        ]);
        if (cancelled) return;
        setRecipe(nextRecipe);
        setVideoReference(nextVideo || nextRecipe.videoReference || null);
        await sendFeedback(userId, "view", id, `查看 ${nextRecipe.name}`, nextRecipe.tags, {
          tags: [...nextRecipe.tags, ...nextRecipe.nutritionTags],
          difficulty: nextRecipe.difficulty,
        }).catch(() => undefined);
      } catch (cause) {
        console.error(cause);
        if (!cancelled) setError("未找到该食谱");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [id, userId]);

  const handleStartCooking = async () => {
    if (!recipe) return;
    await sendFeedback(userId, "start", id, `开始做 ${recipe.name}`, recipe.tags, {
      tags: [...recipe.tags, ...recipe.nutritionTags],
      difficulty: recipe.difficulty,
    }).catch(() => undefined);
    setIsStarted(true);
    addDebugLog("mem0", `[Recipe] Start cooking ${recipe.name}`);
  };

  const handleComplete = async () => {
    if (!recipe) return;
    setCompleteState("submitting");
    try {
      await completeRecipe(id, userId, usageMode, usageMode === "custom" ? customNote : undefined);
      setCompleteState("done");
      addDebugLog("info", `[Recipe] Completed ${recipe.name}`);
    } catch (cause) {
      console.error(cause);
      setCompleteState("idle");
    }
  };

  if (loading) {
    return (
      <main className="px-4 py-8 lg:px-6">
        <p className="text-text-muted">加载中...</p>
      </main>
    );
  }

  if (error || !recipe) {
    return (
      <main className="px-4 py-8 lg:px-6">
        <p className="text-text-muted">{error || "未找到该食谱"}</p>
        <Link href="/decide" className="mt-4 inline-block text-primary underline">
          返回决策
        </Link>
      </main>
    );
  }

  return (
    <>
      <header className="sticky top-0 left-0 right-0 z-40 border-b border-border bg-surface/95 pt-safe backdrop-blur">
        <div className="flex h-14 items-center justify-between gap-3 px-4 lg:px-6">
          <h1 className="truncate pr-2 text-lg font-semibold text-text-main">{recipe.name}</h1>
          <Button
            variant="ghost"
            className="h-auto shrink-0 px-0 text-sm no-underline"
            onClick={() => router.push(returnToResultsHref)}
          >
            返回方案选择
          </Button>
        </div>
      </header>

      <main className="min-h-screen bg-background px-4 py-6 lg:px-6 lg:py-8">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="space-y-6">
            <section className="rounded-[24px] border border-border bg-surface p-4 shadow-sm sm:p-5">
              <div className="flex flex-wrap items-center gap-3">
                {recipe.timeMinutes != null && (
                  <span className="rounded-tag bg-background px-3 py-1 text-sm text-text-muted">
                    约 {recipe.timeMinutes} 分钟
                  </span>
                )}
                <span className="rounded-tag bg-background px-3 py-1 text-sm text-text-muted">
                  难度 {recipe.difficulty}
                </span>
              </div>

              <hr className="my-4 border-border" />
              <section>
                <h2 className="mb-2 font-medium text-text-main">命中库存</h2>
                <p className="text-sm text-text-muted">
                  {recipe.matchedInventory.length > 0
                    ? recipe.matchedInventory.join("、")
                    : "这道菜更适合补货后再做"}
                </p>
              </section>

              <hr className="my-4 border-border" />
              <section>
                <h2 className="mb-2 font-medium text-text-main">食材准备</h2>
                <ul className="space-y-1 text-sm text-text-muted">
                  {recipe.ingredients.map((ingredient) => (
                    <li key={ingredient}>{ingredient}</li>
                  ))}
                </ul>
                {recipe.missingIngredients.length > 0 && (
                  <p className="mt-3 text-sm text-alert">
                    还缺：{recipe.missingIngredients.join("、")}
                  </p>
                )}
              </section>

              <hr className="my-4 border-border" />
              <section>
                <h2 className="mb-2 font-medium text-text-main">步骤</h2>
                <ol className="space-y-4 leading-loose text-text-main">
                  {recipe.steps.map((step, index) => (
                    <li key={step} className="flex gap-3">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-medium text-primary-foreground">
                        {index + 1}
                      </span>
                      <span className="flex-1">{step}</span>
                    </li>
                  ))}
                </ol>
              </section>
            </section>

            {videoReference && (
              <section className="rounded-[24px] border border-border bg-surface p-5 shadow-sm">
                <p className="text-sm font-medium text-text-main">视频参考</p>
                <p className="mt-2 text-sm text-text-muted">{videoReference.title}</p>
                <a
                  href={videoReference.url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 inline-flex rounded-xl border border-primary px-4 py-2 text-sm font-medium text-primary"
                >
                  打开视频/搜索链接
                </a>
              </section>
            )}
          </div>

          <aside className="space-y-4">
            <div className="sticky top-24 rounded-[24px] border border-border bg-surface p-5 shadow-sm">
              <p className="text-sm text-text-muted">执行这道菜</p>
              <h2 className="mt-3 text-xl font-semibold text-text-main">{recipe.name}</h2>

              {!isStarted ? (
                <div className="mt-6 space-y-3">
                  <Button
                    variant="ghost"
                    className="w-full no-underline"
                    onClick={() => router.push(returnToResultsHref)}
                  >
                    换一个
                  </Button>
                  <Button className="w-full" onClick={handleStartCooking}>
                    开做
                  </Button>
                </div>
              ) : (
                <div className="mt-6 space-y-3">
                  <p className="text-sm text-text-muted">本次用了多少食材？</p>
                  <div className="grid gap-2">
                    {[
                      { value: "all", label: "全部用完" },
                      { value: "half", label: "只用一半" },
                      { value: "custom", label: "自定义备注" },
                    ].map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setUsageMode(option.value as typeof usageMode)}
                        className={`rounded-xl border px-4 py-3 text-left text-sm ${
                          usageMode === option.value
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border text-text-muted"
                        }`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                  {usageMode === "custom" && (
                    <textarea
                      value={customNote}
                      onChange={(event) => setCustomNote(event.target.value)}
                      placeholder="例如：鸡蛋只用了 1 个，豆腐还剩半盒"
                      className="min-h-24 w-full rounded-2xl border border-border bg-background px-4 py-3 text-sm text-text-main outline-none"
                    />
                  )}
                  <Button
                    className="w-full"
                    onClick={handleComplete}
                    disabled={completeState === "submitting" || (usageMode === "custom" && !customNote.trim())}
                  >
                    {completeState === "submitting"
                      ? "更新库存中..."
                      : completeState === "done"
                      ? "已完成，返回库存"
                      : "我做完了"}
                  </Button>
                  {completeState === "done" && (
                    <Button variant="secondary" className="w-full" onClick={() => router.push("/inventory")}>
                      返回库存
                    </Button>
                  )}
                </div>
              )}
            </div>
          </aside>
        </div>
      </main>
    </>
  );
}
