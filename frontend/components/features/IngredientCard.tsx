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
  return (
    <li
      className={cn(
        "flex h-full items-center gap-3 rounded-2xl border border-border bg-surface p-3 sm:p-4"
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
