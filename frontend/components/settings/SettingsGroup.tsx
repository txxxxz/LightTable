"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

interface SettingsGroupProps {
  title?: string;
  children: ReactNode;
  className?: string;
}

/**
 * 设置分组容器
 * 白色圆角背景，子项通过 overflow-hidden 裁剪
 */
export function SettingsGroup({ title, children, className }: SettingsGroupProps) {
  return (
    <section className={cn("mb-6 lg:mb-0", className)}>
      {title && (
        <h2 className="mb-2 px-1 text-sm font-medium text-text-muted">
          {title}
        </h2>
      )}
      <div className="overflow-hidden rounded-[24px] bg-white shadow-sm ring-1 ring-zinc-950/5">
        {children}
      </div>
    </section>
  );
}
