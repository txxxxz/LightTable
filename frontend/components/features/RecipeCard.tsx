"use client";

import Link from "next/link";
import { cn } from "@/lib/cn";
import type { RecipeCardDisplay } from "@/lib/types";

export function RecipeCard({ recipe }: { recipe: RecipeCardDisplay }) {
  return (
    <Link
      href={`/recipe/${recipe.id}`}
      className={cn(
        "block rounded-lg border border-border bg-surface p-4",
        "active:scale-[0.99] transition-transform"
      )}
    >
      <h3 className="font-semibold text-text-main">{recipe.name}</h3>
      {recipe.matchedIngredients && recipe.matchedIngredients.length > 0 && (
        <p className="mt-2 text-sm text-primary">
          {recipe.matchedIngredients.join("、")}
        </p>
      )}
      {recipe.reason && (
        <p className="mt-1 text-xs text-text-muted leading-relaxed">
          {recipe.reason}
        </p>
      )}
    </Link>
  );
}
