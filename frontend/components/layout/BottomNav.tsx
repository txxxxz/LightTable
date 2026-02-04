"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Refrigerator, Sparkles, User } from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/cn";

const tabs = [
  { path: "/inventory", label: "库存", Icon: Refrigerator },
  { path: "/decide", label: "决策", Icon: Sparkles },
  { path: "/settings", label: "设置", Icon: User },
] as const;

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      className={cn(
        "fixed bottom-0 left-0 right-0 z-50",
        "bg-white border-t border-border",
        "pb-safe"
      )}
    >
      <div className="flex items-center justify-around h-14">
        {tabs.map(({ path, label, Icon }) => {
          const isActive = pathname === path;
          return (
            <Link
              key={path}
              href={path}
              className="flex flex-col items-center justify-center gap-0.5 min-w-[72px] py-2"
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
                  "text-xs font-medium",
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
