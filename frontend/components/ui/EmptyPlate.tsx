"use client";

import { cn } from "@/lib/cn";

export function EmptyPlate({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "relative h-24 w-24 rounded-full border-4 border-dashed border-border bg-background",
        className
      )}
      aria-hidden="true"
    >
      <div className="absolute inset-4 rounded-full border border-border/80" />
    </div>
  );
}
