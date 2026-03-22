"use client";

import Link from "next/link";
import { cn } from "@/lib/cn";
import type { RecommendationPlan } from "@/lib/types";

export function RecipeCard({ plan }: { plan: RecommendationPlan }) {
  const primaryDish = plan.dishes[0];

  return (
    <Link
      href={primaryDish ? `/recipe/${primaryDish.recipeId}` : "/decide"}
      className={cn(
        "block h-full rounded-[24px] border border-border bg-surface p-4 shadow-sm transition-transform active:scale-[0.99] sm:p-5",
        "lg:hover:-translate-y-0.5"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-text-muted">{plan.label}</p>
          <h3 className="mt-2 font-semibold text-text-main">
            {plan.dishes.map((dish) => dish.title).join(" + ")}
          </h3>
        </div>
        <span className="rounded-tag bg-background px-2 py-1 text-xs text-text-muted">
          {plan.difficulty}
        </span>
      </div>

      {plan.matchedInventory.length > 0 && (
        <p className="mt-3 text-sm text-primary">
          命中库存：{plan.matchedInventory.join("、")}
        </p>
      )}

      {plan.missingIngredients.length > 0 && (
        <p className="mt-1 text-xs text-text-muted">
          还缺：{plan.missingIngredients.join("、")}
        </p>
      )}

      {plan.fitTags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {plan.fitTags.map((tag) => (
            <span
              key={tag}
              className="rounded-tag bg-background px-2 py-1 text-xs text-text-muted"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      <p className="mt-3 text-sm leading-relaxed text-text-muted">{plan.reason}</p>
    </Link>
  );
}
