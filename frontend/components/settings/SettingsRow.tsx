"use client";

import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";

interface SettingsRowProps {
  icon?: ReactNode;
  label: string;
  value?: string;
  onClick?: () => void;
  action?: ReactNode; // 自定义操作组件 (Switch, Chevron, etc.)
  showChevron?: boolean;
  isLast?: boolean;
  className?: string;
}

/**
 * 通用设置行组件
 * Morandi Flat 风格，纯白背景，底部细线分隔
 */
export function SettingsRow({
  icon,
  label,
  value,
  onClick,
  action,
  showChevron = false,
  isLast = false,
  className,
}: SettingsRowProps) {
  const Wrapper = onClick ? "button" : "div";

  return (
    <Wrapper
      onClick={onClick}
      className={cn(
        "w-full flex items-center justify-between px-4 h-14",
        "bg-white",
        !isLast && "border-b border-zinc-100",
        onClick && "active:bg-zinc-50 transition-colors cursor-pointer",
        "text-left",
        className
      )}
    >
      <div className="flex items-center gap-3">
        {icon && (
          <span className="text-primary flex-shrink-0 w-5 h-5 flex items-center justify-center">
            {icon}
          </span>
        )}
        <span className="text-zinc-900 font-medium text-base">{label}</span>
      </div>

      <div className="flex items-center gap-2">
        {value && (
          <span className="text-zinc-500 text-sm">{value}</span>
        )}
        {action}
        {showChevron && (
          <ChevronRight className="w-5 h-5 text-zinc-400" />
        )}
      </div>
    </Wrapper>
  );
}
