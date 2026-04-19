"use client";

import { useRouter } from "next/navigation";
import { cn } from "@/lib/cn";
import { pickByLocale, useLocale } from "@/lib/i18n";
import type { RecommendationPlan } from "@/lib/types";

export function RecipeCard({
  plan,
  requestId,
}: {
  plan: RecommendationPlan;
  requestId?: string | null;
}) {
  const router = useRouter();
  const locale = useLocale();
  const primaryDish = plan.dishes[0];
  const recipeHref =
    primaryDish && primaryDish.recipeId ? `/recipe/${primaryDish.recipeId}` : null;
  const recipeTarget =
    recipeHref && requestId
      ? `${recipeHref}#request_id=${encodeURIComponent(requestId)}`
      : recipeHref;

  const handleOpenRecipe = () => {
    if (!recipeTarget) return;
    router.push(recipeTarget);
  };

  return (
    <article
      role={recipeTarget ? "link" : undefined}
      tabIndex={recipeTarget ? 0 : -1}
      aria-label={
        recipeTarget
          ? pickByLocale(locale, {
              zh: `查看菜谱 ${plan.dishes.map((dish) => dish.title).join(" + ")}`,
              en: `View recipe ${plan.dishes.map((dish) => dish.title).join(" + ")}`,
            })
          : undefined
      }
      onClick={handleOpenRecipe}
      onKeyDown={(event) => {
        if (!recipeTarget) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          handleOpenRecipe();
        }
      }}
      className={cn(
        "h-full rounded-[24px] border border-border bg-surface p-4 shadow-sm transition-transform sm:p-5",
        recipeTarget && "cursor-pointer active:scale-[0.99] lg:hover:-translate-y-0.5"
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
          {pickByLocale(locale, { zh: "命中库存", en: "In stock" })}: {plan.matchedInventory.join("、")}
        </p>
      )}

      {plan.missingIngredients.length > 0 && (
        <p className="mt-1 text-xs text-text-muted">
          {pickByLocale(locale, { zh: "还缺", en: "Still need" })}: {plan.missingIngredients.join("、")}
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

      <div className="mt-4 flex items-center justify-between">
        <span className="text-xs text-text-muted">
          {recipeTarget
            ? pickByLocale(locale, {
                zh: "点击查看完整菜谱",
                en: "Tap to view full recipe",
              })
            : pickByLocale(locale, {
                zh: "当前方案没有可用详情页",
                en: "No detail page is available for this plan",
              })}
        </span>
        {recipeTarget && (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              handleOpenRecipe();
            }}
            className="rounded-xl border border-primary px-3 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary/5"
          >
            {pickByLocale(locale, { zh: "查看菜谱", en: "View recipe" })}
          </button>
        )}
      </div>
    </article>
  );
}
