"use client";

import { cn } from "@/lib/cn";

/** 线条风格空盘子插图，用于冰箱空状态 */
export function EmptyPlate({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 120 80"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("w-24 h-16 text-text-muted", className)}
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <ellipse cx="60" cy="42" rx="44" ry="28" />
      <path d="M20 42 L76 42" />
      <path d="M60 14 L60 26" />
      <path d="M60 58 L60 70" />
      <path d="M16 42 L26 42" />
      <path d="M94 42 L104 42" />
    </svg>
  );
}
