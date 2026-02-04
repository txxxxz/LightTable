"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { useGlobalStore } from "@/lib/store";
import { cn } from "@/lib/cn";

/**
 * 忌口管理组件
 * 用于在 Modal 中添加/删除不喜欢的食材
 */
export function DislikesEditor() {
  const { preferences, addDislike, removeDislike } = useGlobalStore();
  const [input, setInput] = useState("");

  const handleAdd = () => {
    const trimmed = input.trim();
    if (trimmed && !preferences.dislikes.includes(trimmed)) {
      addDislike(trimmed);
      setInput("");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAdd();
    }
  };

  return (
    <div className="space-y-4">
      {/* 输入区域 */}
      <div className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="输入食材名称..."
          className={cn(
            "flex-1 px-4 py-3 rounded-lg",
            "bg-zinc-50 border border-zinc-200",
            "text-zinc-900 placeholder:text-zinc-400",
            "focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary",
            "transition-colors"
          )}
        />
        <button
          onClick={handleAdd}
          disabled={!input.trim()}
          className={cn(
            "px-4 py-3 rounded-lg",
            "bg-primary text-white",
            "flex items-center justify-center",
            "hover:bg-primary-hover transition-colors",
            "disabled:opacity-50 disabled:cursor-not-allowed"
          )}
        >
          <Plus className="w-5 h-5" />
        </button>
      </div>

      {/* 标签展示 */}
      <div className="min-h-[100px]">
        {preferences.dislikes.length === 0 ? (
          <p className="text-zinc-400 text-sm text-center py-8">
            暂无忌口，添加后 Agent 会记住你的偏好
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {preferences.dislikes.map((item) => (
              <span
                key={item}
                className={cn(
                  "inline-flex items-center gap-1.5 px-3 py-1.5",
                  "bg-red-50 text-red-800 rounded-lg",
                  "text-sm font-medium"
                )}
              >
                {item}
                <button
                  onClick={() => removeDislike(item)}
                  className="p-0.5 hover:bg-red-100 rounded transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      <p className="text-xs text-zinc-400 text-center">
        点击标签右侧的 × 可删除
      </p>
    </div>
  );
}
