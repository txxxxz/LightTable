"use client";

import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/Button";
import { parseInventoryText, recognizeInventory } from "@/lib/api";
import { cn } from "@/lib/cn";
import {
  getInventoryCategoryLabel,
  INVENTORY_CATEGORY_OPTIONS,
  normalizeInventoryCategory,
} from "@/lib/inventory-categories";
import type { InventoryItem } from "@/lib/types";
import { getUserId } from "@/lib/user";

export type DraftItem = InventoryItem & { selected: boolean };

export function AddItemSheet({
  file,
  rawText,
  sourceType,
  onConfirm,
  onClose,
  confirmLabel = "放入冰箱",
}: {
  file?: File | null;
  rawText?: string;
  sourceType: "image" | "receipt" | "manual_text";
  onConfirm: (items: DraftItem[]) => Promise<void> | void;
  onClose: () => void;
  confirmLabel?: string;
}) {
  const [phase, setPhase] = useState<"loading" | "list" | "error">("loading");
  const [items, setItems] = useState<DraftItem[]>([]);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return undefined;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  useEffect(() => {
    let cancelled = false;

    async function loadCandidates() {
      setPhase("loading");
      setError(null);
      try {
        const userId = getUserId();
        const candidates =
          sourceType === "manual_text"
            ? await parseInventoryText(userId, rawText || "")
            : await recognizeInventory(userId, file as File, sourceType);
        if (cancelled) return;
        setItems(
          candidates.map((item) => ({
            ...item,
            category: normalizeInventoryCategory(item.category),
            selected: true,
          }))
        );
        setPhase("list");
      } catch (cause) {
        if (cancelled) return;
        console.error(cause);
        const nextError = cause instanceof Error ? cause.message.replace(/[:：]\s*$/, "") : "识别失败，请稍后重试";
        setError(nextError || "识别失败，请稍后重试");
        setPhase("error");
      }
    }

    loadCandidates();
    return () => {
      cancelled = true;
    };
  }, [file, rawText, sourceType]);

  const selectedCount = useMemo(
    () => items.filter((item) => item.selected).length,
    [items]
  );

  const handleConfirm = async () => {
    await onConfirm(items.filter((item) => item.selected));
    onClose();
  };

  const handleItemChange = <K extends keyof DraftItem>(index: number, key: K, value: DraftItem[K]) => {
    setItems((prev) =>
      prev.map((entry, entryIndex) =>
        entryIndex === index ? { ...entry, [key]: value } : entry
      )
    );
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 lg:p-4">
      <div className="flex h-full flex-col bg-background lg:mx-auto lg:max-h-[min(86vh,820px)] lg:max-w-6xl lg:flex-row lg:overflow-hidden lg:rounded-[28px] lg:border lg:border-border lg:bg-surface lg:shadow-2xl">
        {file ? (
          <div className="relative min-h-[34vh] border-b border-border bg-zinc-950 lg:min-h-0 lg:basis-[42%] lg:border-b-0 lg:border-r">
            <button
              type="button"
              onClick={onClose}
              className="absolute right-4 top-4 z-10 flex h-10 w-10 items-center justify-center rounded-lg bg-black/40 text-white"
              aria-label="关闭"
            >
              ×
            </button>
            <div className="flex h-full w-full items-center justify-center p-4 lg:p-6">
              {previewUrl ? (
                <img
                  src={previewUrl}
                  alt="预览"
                  className="h-full max-h-[68vh] w-full object-contain"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-sm text-zinc-300">
                  正在生成预览…
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="relative min-h-[24vh] border-b border-border bg-surface px-5 py-6 lg:basis-[40%] lg:border-b-0 lg:border-r lg:px-7">
            <button
              type="button"
              onClick={onClose}
              className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-lg bg-background text-text-main"
              aria-label="关闭"
            >
              ×
            </button>
            <p className="text-sm font-medium text-text-muted">模糊输入预览</p>
            <p className="mt-3 text-base leading-7 text-text-main">{rawText}</p>
            <p className="mt-4 text-sm text-text-muted">
              系统会先做标准化和分类预测，再让你确认后写入真实库存。
            </p>
          </div>
        )}

        <div className="flex min-h-0 flex-1 flex-col rounded-t-[24px] border-t border-border bg-surface lg:rounded-none lg:border-t-0">
          <div className="flex-1 overflow-y-auto p-4 lg:p-6">
            {phase === "loading" && (
              <p className="py-6 text-center text-text-muted">正在解析食材…</p>
            )}

            {phase === "error" && (
              <div className="rounded-2xl border border-alert/20 bg-alert-bg px-4 py-3 text-sm text-alert">
                {error || "识别失败，请稍后重试。"}
              </div>
            )}

            {phase === "list" && (
              <ul className="space-y-3">
                {items.map((item, index) => (
                  <li
                    key={item.id}
                    className="rounded-2xl border border-border bg-background p-3 lg:p-4"
                  >
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={item.selected}
                        onChange={(event) => handleItemChange(index, "selected", event.target.checked)}
                        className="mt-1"
                      />
                      <div className="min-w-0 flex-1 space-y-3">
                        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_136px]">
                          <input
                            type="text"
                            value={item.displayName}
                            onChange={(event) => handleItemChange(index, "displayName", event.target.value)}
                            className="w-full rounded-xl border border-border bg-surface px-3 py-3 text-sm text-text-main"
                          />
                          <input
                            type="text"
                            value={item.quantityText}
                            onChange={(event) => handleItemChange(index, "quantityText", event.target.value)}
                            className={cn(
                              "w-full rounded-xl border border-border bg-surface px-3 py-3 text-sm text-text-main"
                            )}
                          />
                        </div>
                        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_180px]">
                          <div className="text-xs text-text-muted">
                            归一名称：{item.normalizedName}
                          </div>
                          <select
                            value={item.category}
                            onChange={(event) =>
                              handleItemChange(index, "category", normalizeInventoryCategory(event.target.value))
                            }
                            className="w-full rounded-xl border border-border bg-surface px-3 py-3 text-sm text-text-main"
                          >
                            {INVENTORY_CATEGORY_OPTIONS.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </div>
                        <p className="text-xs text-text-muted">
                          当前分类：{getInventoryCategoryLabel(item.category)}
                        </p>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="border-t border-border p-4 lg:p-6">
            <Button
              fullWidth
              onClick={handleConfirm}
              disabled={phase !== "list" || selectedCount === 0}
            >
              {confirmLabel}（{selectedCount}）
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
