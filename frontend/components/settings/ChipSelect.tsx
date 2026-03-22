"use client";

import { cn } from "@/lib/cn";

interface ChipSelectProps {
  options: readonly string[];
  selected?: string[];
  onChange: (selected: string[]) => void;
  className?: string;
}

/**
 * 多选标签组：未选为灰底，选中为 Sage Green 底 + 白字
 */
export function ChipSelect({ options, selected, onChange, className }: ChipSelectProps) {
  const safeSelected = Array.isArray(selected) ? selected : [];

  const toggle = (opt: string) => {
    if (safeSelected.includes(opt)) {
      onChange(safeSelected.filter((s) => s !== opt));
    } else {
      onChange([...safeSelected, opt]);
    }
  };

  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      {options.map((opt) => {
        const isSelected = safeSelected.includes(opt);
        return (
          <button
            key={opt}
            type="button"
            onClick={() => toggle(opt)}
            className={cn(
              "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
              isSelected
                ? "bg-primary text-white"
                : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
            )}
          >
            {opt}
          </button>
        );
      })}
    </div>
  );
}
