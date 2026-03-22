"use client";

import type { ReactNode } from "react";
import { useEffect, useCallback } from "react";
import { X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/cn";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  className?: string;
}

/**
 * 移动端底部抽屉 + 桌面端居中对话框
 */
export function Modal({ isOpen, onClose, title, children, className }: ModalProps) {
  // 按 ESC 关闭
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose]
  );

  useEffect(() => {
    if (isOpen) {
      document.addEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [isOpen, handleKeyDown]);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/40 z-50"
          />

          <div className="fixed inset-0 z-50 flex items-end justify-center lg:items-center lg:p-4">
            <motion.div
              initial={{ opacity: 0, y: 32 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 32 }}
              transition={{ type: "spring", damping: 28, stiffness: 280 }}
              className={cn(
                "w-full overflow-hidden bg-white pb-safe shadow-2xl",
                "max-h-[85vh] rounded-t-[28px]",
                "lg:max-h-[min(720px,calc(100vh-2rem))] lg:max-w-2xl lg:rounded-[28px] lg:pb-0",
                className
              )}
            >
              <div className="flex justify-center pt-3 pb-2 lg:hidden">
                <div className="h-1 w-10 rounded-full bg-zinc-300" />
              </div>

              {title && (
                <div className="flex items-center justify-between border-b border-zinc-100 px-4 pb-3 lg:px-6 lg:pt-5">
                  <h3 className="text-lg font-semibold text-zinc-900">{title}</h3>
                  <button
                    onClick={onClose}
                    className="p-2 -mr-2 text-zinc-500 transition-colors hover:text-zinc-700"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              )}

              <div className="max-h-[calc(85vh-80px)] overflow-y-auto px-4 py-4 lg:max-h-[calc(min(720px,100vh-2rem)-84px)] lg:px-6 lg:py-5">
                {children}
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
