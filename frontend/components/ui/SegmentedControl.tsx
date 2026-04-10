"use client";

import { cn } from "@/lib/cn";

type Option<T extends string> = {
  value: T;
  label: string;
  description?: string;
};

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  className,
}: {
  options: Array<Option<T>>;
  value: T;
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <div className={cn("grid gap-2 rounded-2xl bg-background p-1 sm:grid-cols-3", className)}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={cn(
              "rounded-xl px-4 py-3 text-left text-sm transition-colors",
              active
                ? "bg-primary text-primary-foreground"
                : "bg-transparent text-text-muted hover:bg-surface"
            )}
          >
            <div className="font-medium">{option.label}</div>
            {option.description ? (
              <div className={cn("mt-1 text-xs", active ? "text-primary-foreground/80" : "text-text-muted")}>
                {option.description}
              </div>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
