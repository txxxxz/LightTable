"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/Button";
import { RecipeCard } from "@/components/features/RecipeCard";
import { cn } from "@/lib/cn";
import { getUserId } from "@/lib/user";
import { getInventory, recommend, type RecommendResult } from "@/lib/api";
import type { RecipeCardDisplay } from "@/lib/types";

const DECIDE_TAGS = [
  { id: "消耗临期", label: "消耗临期" },
  { id: "减脂", label: "减脂" },
  { id: "快手菜", label: "快手菜" },
] as const;

const TYPEWRITER_LINES = [
  "正在检查库存…",
  "检索 Mem0 记忆…",
  "正在生成食谱…",
];

export default function DecidePage() {
  const [selectedTags, setSelectedTags] = useState<string[]>(["消耗临期"]);
  const [phase, setPhase] = useState<"input" | "generating" | "results">("input");
  const [typewriterIndex, setTypewriterIndex] = useState(0);
  const [typewriterLines, setTypewriterLines] = useState<string[]>(TYPEWRITER_LINES);
  const [recipes, setRecipes] = useState<RecipeCardDisplay[]>([]);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (phase !== "generating") return;
    if (typewriterIndex >= typewriterLines.length) {
      return; // 等待 API 返回
    }
    const t = setTimeout(
      () => setTypewriterIndex((i) => i + 1),
      typewriterIndex === 0 ? 600 : 800
    );
    return () => clearTimeout(t);
  }, [phase, typewriterIndex, typewriterLines.length]);

  const toggleTag = (tagId: string) => {
    setSelectedTags((prev) =>
      prev.includes(tagId)
        ? prev.filter((t) => t !== tagId)
        : [...prev, tagId]
    );
  };

  const handleStart = async () => {
    setPhase("generating");
    setTypewriterIndex(0);
    setError(null);
    setRecipes([]);

    try {
      const userId = getUserId();
      // 获取库存
      const inventory = await getInventory(userId);
      const inventoryNames = inventory.map((i) => i.name);

      if (inventoryNames.length === 0) {
        setTypewriterLines([
          "正在检查库存…",
          "库存为空，使用默认食材…",
          "正在生成食谱…",
        ]);
      } else {
        setTypewriterLines([
          "正在检查库存…",
          `找到 ${inventoryNames.length} 种食材`,
          "检索 Mem0 记忆…",
          "正在生成食谱…",
        ]);
      }

      // 调用推荐 API
      const result: RecommendResult = await recommend(
        userId,
        inventoryNames,
        selectedTags
      );

      // 更新打字机显示用户画像
      if (result.profileSummary && result.profileSummary !== "无特别偏好") {
        setTypewriterLines((prev) => {
          const idx = prev.findIndex((l) => l.includes("Mem0"));
          if (idx >= 0) {
            const next = [...prev];
            next[idx] = `检索 Mem0 记忆：${result.profileSummary.slice(0, 20)}…`;
            return next;
          }
          return prev;
        });
      }

      setRecipes(result.plans);
      // 延迟显示结果
      setTimeout(() => setPhase("results"), 500);
    } catch (e) {
      console.error("Recommend error:", e);
      setError("生成推荐失败，请稍后重试");
      setPhase("input");
    }
  };

  const handleReset = () => {
    setPhase("input");
    setRecipes([]);
    setTypewriterIndex(0);
  };

  return (
    <>
      <header className="sticky top-0 left-0 right-0 z-40 bg-surface border-b border-border pt-safe">
        <div className="px-4 h-14 flex items-center justify-between">
          <h1 className="text-lg font-semibold text-text-main">决策</h1>
          {phase === "results" && (
            <button
              onClick={handleReset}
              className="text-sm text-primary font-medium"
            >
              重新规划
            </button>
          )}
        </div>
      </header>

      <main className="px-4 py-4">
        {phase === "input" && (
          <>
            <p className="text-text-main font-medium mb-3">想怎么吃？</p>
            <div className="flex flex-wrap gap-2 mb-6">
              {DECIDE_TAGS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => toggleTag(t.id)}
                  className={cn(
                    "rounded-lg border px-4 py-2 text-sm font-medium transition-colors",
                    selectedTags.includes(t.id)
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-surface text-text-muted border-border hover:border-primary/50"
                  )}
                >
                  #{t.label}
                </button>
              ))}
            </div>
            {error && (
              <p className="text-alert text-sm mb-4">{error}</p>
            )}
            <Button fullWidth onClick={handleStart}>
              开始规划
            </Button>
          </>
        )}

        {phase === "generating" && (
          <div className="py-12 space-y-2">
            {typewriterLines.slice(0, typewriterIndex).map((line, i) => (
              <p key={i} className="text-sm text-text-muted">
                {line}
              </p>
            ))}
            {typewriterIndex < typewriterLines.length && (
              <span className="inline-block w-2 h-4 bg-primary animate-pulse" />
            )}
            {typewriterIndex >= typewriterLines.length && (
              <p className="text-sm text-text-muted">正在生成中...</p>
            )}
          </div>
        )}

        {phase === "results" && (
          <>
            <p className="text-text-muted text-sm mb-4">为你推荐</p>
            {recipes.length === 0 ? (
              <p className="text-text-muted text-center py-8">
                暂无推荐，请先添加库存食材
              </p>
            ) : (
              <ul className="space-y-3">
                {recipes.map((r) => (
                  <li key={r.id}>
                    <RecipeCard recipe={r} />
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </main>
    </>
  );
}
