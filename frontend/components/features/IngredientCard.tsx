"use client";

import { cn } from "@/lib/cn";
import type { InventoryItem } from "@/lib/types";

const statusConfig: Record<
  InventoryItem["status"],
  { label: string; bg: string; text: string }
> = {
  fresh: { label: "新鲜", bg: "bg-background", text: "text-text-muted" },
  expiring_soon: {
    label: "临期",
    bg: "bg-alert-bg",
    text: "text-alert",
  },
  expired: { label: "过期", bg: "bg-alert-bg", text: "text-alert" },
};

export function IngredientCard({ item }: { item: InventoryItem }) {
  const { label, bg, text } = statusConfig[item.status];
  const macros = item.macros;
  return (
    <li
      className={cn(
        "flex h-full items-start gap-3 rounded-2xl border border-border bg-surface p-3 sm:p-4"
      )}
    >
      <div className="h-12 w-12 shrink-0 overflow-hidden rounded-[6px] bg-background border border-border">
        {item.imageUrl ? (
          <img
            src={item.imageUrl}
            alt=""
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="h-full w-full flex items-center justify-center text-text-muted text-xs">
            —
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-medium text-text-main truncate">{item.displayName}</p>
        {item.quantityText && (
          <p className="text-sm text-text-muted truncate">{item.quantityText}</p>
        )}
        <div className="mt-2 flex flex-wrap gap-2">
          {macros ? (
            <>
              <span className="rounded-full bg-background px-2 py-1 text-[11px] text-text-muted">
                碳水 {macros.carbsG ?? "-"}g
              </span>
              <span className="rounded-full bg-background px-2 py-1 text-[11px] text-text-muted">
                蛋白质 {macros.proteinG ?? "-"}g
              </span>
              <span className="rounded-full bg-background px-2 py-1 text-[11px] text-text-muted">
                脂肪 {macros.fatG ?? "-"}g
              </span>
            </>
          ) : (
            <span className="rounded-full bg-background px-2 py-1 text-[11px] text-text-muted">
              营养待补充
            </span>
          )}
        </div>
      </div>
      <span
        className={cn(
          "shrink-0 rounded-tag px-2 py-0.5 text-xs font-medium",
          bg,
          text
        )}
      >
        {label}
      </span>
    </li>
  );
}
