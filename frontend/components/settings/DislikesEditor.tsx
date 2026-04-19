"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";

import { cn } from "@/lib/cn";
import { pickByLocale, useLocale } from "@/lib/i18n";

export function DislikesEditor({
  dislikes,
  onAdd,
  onRemove,
}: {
  dislikes: string[];
  onAdd: (item: string) => void;
  onRemove: (item: string) => void;
}) {
  const [input, setInput] = useState("");
  const locale = useLocale();

  const handleAdd = () => {
    const trimmed = input.trim();
    if (trimmed && !dislikes.includes(trimmed)) {
      onAdd(trimmed);
      setInput("");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              handleAdd();
            }
          }}
          placeholder={pickByLocale(locale, {
            zh: "输入食材名称...",
            en: "Enter an ingredient...",
          })}
          className={cn(
            "flex-1 rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3",
            "text-zinc-900 placeholder:text-zinc-400 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/50"
          )}
        />
        <button
          type="button"
          onClick={handleAdd}
          disabled={!input.trim()}
          className="flex items-center justify-center rounded-lg bg-primary px-4 py-3 text-white disabled:opacity-50"
        >
          <Plus className="h-5 w-5" />
        </button>
      </div>

      <div className="min-h-[100px]">
        {dislikes.length === 0 ? (
          <p className="py-8 text-center text-sm text-zinc-400">
            {pickByLocale(locale, {
              zh: "暂无忌口，添加后推荐会自动避开这些食材",
              en: "No dislikes yet. Recommendations will avoid added ingredients automatically.",
            })}
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {dislikes.map((item) => (
              <span
                key={item}
                className="inline-flex items-center gap-1.5 rounded-lg bg-red-50 px-3 py-1.5 text-sm font-medium text-red-800"
              >
                {item}
                <button
                  type="button"
                  onClick={() => onRemove(item)}
                  className="rounded p-0.5 transition-colors hover:bg-red-100"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
