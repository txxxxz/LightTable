"use client";

import { cn } from "@/lib/cn";

type ChipOption = string | { value: string; label: string };

interface ChipSelectProps {
  options: readonly ChipOption[];
  selected?: string[];
  onChange: (selected: string[]) => void;
  className?: string;
}

/**
 * 多选标签组：未选为灰底，选中为 Sage Green 底 + 白字
 */
export function ChipSelect({ options, selected, onChange, className }: ChipSelectProps) {
  const safeSelected = Array.isArray(selected) ? selected : [];
  const normalizedOptions = options.map((option) =>
    typeof option === "string" ? { value: option, label: option } : option
  );

  const toggle = (opt: string) => {
    if (safeSelected.includes(opt)) {
      onChange(safeSelected.filter((s) => s !== opt));
    } else {
      onChange([...safeSelected, opt]);
    }
  };

  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      {normalizedOptions.map((opt) => {
        const isSelected = safeSelected.includes(opt.value);
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => toggle(opt.value)}
            className={cn(
              "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
              isSelected
                ? "bg-primary text-white"
                : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
