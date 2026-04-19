"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Terminal, ChevronDown, ChevronUp, Trash2 } from "lucide-react";
import { useGlobalStore } from "@/lib/store";
import { cn } from "@/lib/cn";
import { pickByLocale, useLanguageTag, useLocale } from "@/lib/i18n";

/**
 * 调试日志悬浮窗口
 * 当 Debug Mode 开启时显示
 */
export function DebugOverlay() {
  const { system, debugLogs, clearDebugLogs } = useGlobalStore();
  const [isExpanded, setIsExpanded] = useState(true);
  const locale = useLocale();
  const languageTag = useLanguageTag();

  if (!system.debugMode) return null;

  const getLogColor = (type: string) => {
    switch (type) {
      case "rag":
        return "text-blue-400";
      case "mem0":
        return "text-green-400";
      case "error":
        return "text-red-400";
      default:
        return "text-zinc-400";
    }
  };

  const formatTime = (date: Date) => {
    return new Date(date).toLocaleTimeString(languageTag, {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ y: 100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 100, opacity: 0 }}
        className={cn(
          "fixed left-2 right-2 z-[100]",
          "bg-zinc-900/95 backdrop-blur-sm",
          "rounded-t-xl border border-zinc-700",
          "shadow-2xl",
          isExpanded ? "bottom-20" : "bottom-20"
        )}
        style={{ maxHeight: isExpanded ? "40vh" : "auto" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-700">
          <div className="flex items-center gap-2">
            <Terminal className="w-4 h-4 text-primary" />
            <span className="text-sm font-mono text-zinc-300">
              {pickByLocale(locale, { zh: "Agent 思考", en: "Agent Thoughts" })}
            </span>
            <span className="text-xs text-zinc-500">({debugLogs.length})</span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={clearDebugLogs}
              className="p-1.5 text-zinc-500 hover:text-zinc-300 transition-colors"
              title={pickByLocale(locale, { zh: "清空日志", en: "Clear logs" })}
            >
              <Trash2 className="w-4 h-4" />
            </button>
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="p-1.5 text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              {isExpanded ? (
                <ChevronDown className="w-4 h-4" />
              ) : (
                <ChevronUp className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>

        {/* Logs */}
        {isExpanded && (
          <div className="overflow-y-auto max-h-[calc(40vh-44px)] p-2 font-mono text-xs">
            {debugLogs.length === 0 ? (
              <p className="text-zinc-500 text-center py-4">
                {pickByLocale(locale, {
                  zh: "暂无日志，操作后将显示 Agent 思考过程...",
                  en: "No logs yet. Agent reasoning will appear here after actions.",
                })}
              </p>
            ) : (
              <div className="space-y-1">
                {debugLogs.map((log) => (
                  <div key={log.id} className="flex gap-2">
                    <span className="text-zinc-600 shrink-0">
                      {formatTime(log.timestamp)}
                    </span>
                    <span className={cn("break-all", getLogColor(log.type))}>
                      {log.message}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
