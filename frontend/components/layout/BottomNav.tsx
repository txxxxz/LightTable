"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Refrigerator, ShoppingCart, Sparkles, User } from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/cn";

const tabs = [
  { path: "/inventory", label: "库存", Icon: Refrigerator },
  { path: "/decide", label: "决策", Icon: Sparkles },
  { path: "/shopping", label: "补货", Icon: ShoppingCart },
  { path: "/settings", label: "设置", Icon: User },
] as const;

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      className={cn(
        "fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-white/95 backdrop-blur",
        "pb-safe shadow-[0_-10px_30px_rgba(15,23,42,0.06)]",
        "lg:left-1/2 lg:right-auto lg:bottom-6 lg:w-auto lg:min-w-[360px] lg:-translate-x-1/2 lg:rounded-2xl lg:border lg:pb-0 lg:shadow-xl"
      )}
    >
      <div className="flex h-14 items-center justify-around px-1 lg:h-[58px] lg:gap-2 lg:px-2">
        {tabs.map(({ path, label, Icon }) => {
          const isActive = pathname === path;
          return (
            <Link
              key={path}
              href={path}
              className={cn(
                "flex min-w-[72px] flex-col items-center justify-center gap-0.5 rounded-xl px-2 py-2 transition-colors",
                "lg:min-w-[96px] lg:flex-row lg:gap-2 lg:px-3",
                isActive && "bg-primary/10"
              )}
              aria-current={isActive ? "page" : undefined}
            >
              <motion.span
                whileTap={{ scale: 0.95 }}
                className="flex items-center justify-center"
              >
                <Icon
                  className={cn(
                    "w-6 h-6 transition-colors",
                    isActive ? "text-primary" : "text-text-muted"
                  )}
                  strokeWidth={1.5}
                />
              </motion.span>
              <span
                className={cn(
                  "text-xs font-medium lg:text-sm",
                  isActive ? "text-primary" : "text-text-muted"
                )}
              >
                {label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
