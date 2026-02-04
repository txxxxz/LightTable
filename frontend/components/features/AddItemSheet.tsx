"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import type { InventoryItem } from "@/lib/types";

type RecognizedItem = { name: string; quantity: string };

export function AddItemSheet({
  file,
  onConfirm,
  onClose,
}: {
  file: File;
  onConfirm: (items: InventoryItem[]) => void;
  onClose: () => void;
}) {
  const [phase, setPhase] = useState<"loading" | "list">("loading");
  const [list, setList] = useState<RecognizedItem[]>([]);
  const [previewUrl, setPreviewUrl] = useState<string>("");

  useEffect(() => {
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  useEffect(() => {
    const t = setTimeout(() => {
      setList([
        { name: "青椒", quantity: "2 个" },
        { name: "番茄", quantity: "3 个" },
      ]);
      setPhase("list");
    }, 1500);
    return () => clearTimeout(t);
  }, []);

  const handleConfirm = () => {
    const items: InventoryItem[] = list.map((l, i) => ({
      id: `new-${Date.now()}-${i}`,
      name: l.name,
      quantity: l.quantity,
      status: "fresh" as const,
      expiryHint: "建议 3 天内食用",
    }));
    onConfirm(items);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      <div className="relative flex-1 min-h-0">
        <img
          src={previewUrl}
          alt="预览"
          className="h-full w-full object-cover object-top"
        />
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 h-10 w-10 rounded-lg bg-black/40 text-white flex items-center justify-center"
          aria-label="关闭"
        >
          ×
        </button>
      </div>
      <div className="bg-surface border-t border-border rounded-t-xl flex flex-col max-h-[50vh]">
        <div className="p-4 overflow-auto flex-1">
          {phase === "loading" && (
            <p className="text-text-muted text-center py-6">正在识别…</p>
          )}
          {phase === "list" && (
            <ul className="space-y-2">
              {list.map((item, i) => (
                <li
                  key={i}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background p-3"
                >
                  <span className="font-medium text-text-main">{item.name}</span>
                  <input
                    type="text"
                    value={item.quantity}
                    onChange={(e) => {
                      const next = [...list];
                      next[i] = { ...next[i], quantity: e.target.value };
                      setList(next);
                    }}
                    className="w-20 rounded-lg border border-border bg-surface px-2 py-1.5 text-sm text-text-main"
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="p-4 border-t border-border">
          <Button fullWidth onClick={handleConfirm} disabled={phase === "loading"}>
            放入冰箱
          </Button>
        </div>
      </div>
    </div>
  );
}
