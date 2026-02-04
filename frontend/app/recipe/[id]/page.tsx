"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { getRecipe, sendFeedback } from "@/lib/api";
import { getUserId } from "@/lib/user";
import type { Recipe } from "@/lib/types";

export default function RecipeDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getRecipe(id)
      .then(setRecipe)
      .catch((e) => {
        console.error("Failed to load recipe:", e);
        setError("未找到该食谱");
      })
      .finally(() => setLoading(false));
  }, [id]);

  const handleStartCooking = async () => {
    // 发送反馈：用户开始做这道菜
    try {
      const userId = getUserId();
      await sendFeedback(userId, "like", id, `开始做 ${recipe?.name || id}`);
    } catch (e) {
      console.error("Failed to send feedback:", e);
    }
    router.push("/inventory");
  };

  if (loading) {
    return (
      <main className="px-4 py-8">
        <p className="text-text-muted">加载中...</p>
      </main>
    );
  }

  if (error || !recipe) {
    return (
      <main className="px-4 py-8">
        <p className="text-text-muted">{error || "未找到该食谱"}</p>
        <Link href="/decide" className="mt-4 inline-block text-primary underline">
          返回决策
        </Link>
      </main>
    );
  }

  return (
    <>
      <header className="sticky top-0 left-0 right-0 z-40 bg-surface border-b border-border pt-safe">
        <div className="px-4 h-14 flex items-center">
          <h1 className="text-lg font-semibold text-text-main truncate pr-2">
            {recipe.name}
          </h1>
        </div>
      </header>

      <main className="px-4 py-6 bg-background min-h-screen">
        <div className="rounded-lg border border-border bg-surface p-4">
          {recipe.timeMinutes != null && (
            <p className="text-sm text-text-muted">
              预计 {recipe.timeMinutes} 分钟
            </p>
          )}
          <hr className="my-4 border-border" />
          <section>
            <h2 className="font-medium text-text-main mb-2">食材</h2>
            <ul className="text-sm text-text-muted space-y-1">
              {recipe.ingredients.map((ing, i) => (
                <li key={i}>{ing}</li>
              ))}
            </ul>
          </section>
          <hr className="my-4 border-border" />
          <section>
            <h2 className="font-medium text-text-main mb-2">步骤</h2>
            <ol className="space-y-4 leading-loose text-text-main">
              {recipe.steps.map((step, i) => (
                <li key={i} className="flex gap-3">
                  <span className="shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground text-sm flex items-center justify-center font-medium">
                    {i + 1}
                  </span>
                  <span className="flex-1">{step}</span>
                </li>
              ))}
            </ol>
          </section>
        </div>

        <div
          className="fixed left-0 right-0 p-4 bg-surface border-t border-border flex gap-3 pb-safe"
          style={{ bottom: "calc(3.5rem + env(safe-area-inset-bottom, 0px))" }}
        >
          <Button
            variant="ghost"
            className="flex-1"
            onClick={() => router.push("/decide")}
          >
            换一个
          </Button>
          <Button className="flex-1" onClick={handleStartCooking}>
            开做
          </Button>
        </div>
        <div className="h-28" aria-hidden />
      </main>
    </>
  );
}
