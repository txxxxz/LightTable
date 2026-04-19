"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ChevronRight, ShoppingBasket } from "lucide-react";

import { IngredientCard } from "@/components/features/IngredientCard";
import { EmptyPlate } from "@/components/ui/EmptyPlate";
import { getInventory } from "@/lib/api";
import { cn } from "@/lib/cn";
import { groupByInventoryCategory } from "@/lib/inventory-categories";
import { pickByLocale, useLocale } from "@/lib/i18n";
import { useGlobalStore } from "@/lib/store";
import type { InventoryItem } from "@/lib/types";
import { getUserId } from "@/lib/user";

function SectionHeader({ title, count }: { title: string; count: number }) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <h3 className="text-sm font-semibold text-text-main">{title}</h3>
      <span className="rounded-full bg-background px-2 py-1 text-xs text-text-muted">
        {count}
      </span>
    </div>
  );
}

export default function InventoryPage() {
  const locale = useLocale();
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { addDebugLog } = useGlobalStore();

  useEffect(() => {
    const userId = getUserId();
    getInventory(userId)
      .then((next) => {
        setItems(next);
        setError(null);
        addDebugLog("info", `[Inventory] Loaded ${next.length} items from SQLite`);
      })
      .catch((cause) => {
        console.error(cause);
        setError(
          pickByLocale(locale, {
            zh: "库存加载失败，请确认后端服务正常运行。",
            en: "Failed to load inventory. Please make sure the backend is running.",
          })
        );
        addDebugLog("error", "[Inventory] Failed to load inventory");
      })
      .finally(() => setLoading(false));
  }, [addDebugLog, locale]);

  const expiringCount = useMemo(
    () => items.filter((item) => item.status !== "fresh").length,
    [items]
  );
  const groupedItems = useMemo(() => groupByInventoryCategory(items, locale), [items, locale]);
  const isEmpty = items.length === 0;

  return (
    <>
      <header
        className={cn(
          "sticky top-0 left-0 right-0 z-40",
          "border-b border-border bg-surface/95 backdrop-blur",
          "pt-safe"
        )}
      >
        <div className="flex h-14 items-center justify-between px-4 lg:px-6">
          <div>
            <h1 className="text-lg font-semibold text-text-main">LightTable</h1>
            <p className="text-xs text-text-muted">
              {pickByLocale(locale, { zh: "分类库存总览", en: "Inventory by category" })}
            </p>
          </div>
          <Link
            href="/shopping?tab=inventory"
            className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            <ShoppingBasket className="h-4 w-4" />
            {pickByLocale(locale, { zh: "去补货维持库存", en: "Restock inventory" })}
          </Link>
        </div>
      </header>

      <main className="px-4 py-4 lg:px-6 lg:py-8">
        <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)] lg:items-start">
          <section className="space-y-4 rounded-[24px] border border-border bg-surface p-5 shadow-sm">
            <div>
              <p className="text-sm font-medium text-text-muted">
                {pickByLocale(locale, { zh: "库存总览", en: "Inventory overview" })}
              </p>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-2xl bg-background px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.2em] text-text-muted">
                    {pickByLocale(locale, { zh: "总数", en: "Total" })}
                  </p>
                  <p className="mt-2 text-2xl font-semibold text-text-main">{items.length}</p>
                </div>
                <div className="rounded-2xl bg-background px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.2em] text-text-muted">
                    {pickByLocale(locale, { zh: "临期", en: "Expiring" })}
                  </p>
                  <p className="mt-2 text-2xl font-semibold text-alert">{expiringCount}</p>
                </div>
              </div>
            </div>

            <Link
              href="/shopping?tab=inventory"
              className="flex items-center justify-between rounded-2xl border border-border bg-background px-4 py-4 text-sm text-text-main"
            >
              <div>
                <p className="font-medium">
                  {pickByLocale(locale, { zh: "去补货维护库存", en: "Maintain inventory" })}
                </p>
                <p className="mt-1 text-text-muted">
                  {pickByLocale(locale, {
                    zh: "拍照补录、自然语言和语音都在这里",
                    en: "Photo capture, natural language, and voice input all live here.",
                  })}
                </p>
              </div>
              <ChevronRight className="h-4 w-4 text-text-muted" />
            </Link>
          </section>

          <section className="rounded-[24px] border border-border bg-surface p-4 shadow-sm sm:p-5">
            {error && (
              <div className="mb-4 rounded-2xl border border-alert/20 bg-alert-bg px-4 py-3 text-sm text-alert">
                <p>{error}</p>
                <Link href="/shopping?tab=inventory" className="mt-3 inline-flex text-sm font-medium underline">
                  {pickByLocale(locale, {
                    zh: "去补货页维护库存",
                    en: "Open restock page",
                  })}
                </Link>
              </div>
            )}
            {expiringCount > 0 && (
              <div className="mb-4 rounded-2xl border border-alert/20 bg-alert-bg px-4 py-3 text-sm text-alert">
                {pickByLocale(locale, {
                  zh: `${expiringCount} 个食材临期，建议优先消耗。`,
                  en: `${expiringCount} items are expiring soon. Consider using them first.`,
                })}
              </div>
            )}

            {loading ? (
              <div className="py-16 text-center text-text-muted">
                {pickByLocale(locale, { zh: "加载中...", en: "Loading..." })}
              </div>
            ) : isEmpty ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <EmptyPlate className="mb-4" />
                <p className="text-base text-text-muted">
                  {pickByLocale(locale, { zh: "冰箱空空如也", en: "Your fridge is empty" })}
                </p>
                <Link
                  href="/shopping?tab=inventory"
                  className="mt-4 inline-flex items-center rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
                >
                  {pickByLocale(locale, { zh: "去补货维持库存", en: "Restock inventory" })}
                </Link>
              </div>
            ) : (
              <div className="space-y-5">
                {groupedItems.map((group) => (
                  <section key={group.category}>
                    <SectionHeader title={group.label} count={group.items.length} />
                    <ul className="grid gap-3 md:grid-cols-2">
                      {group.items.map((item) => (
                        <IngredientCard key={item.id} item={item} />
                      ))}
                    </ul>
                  </section>
                ))}
              </div>
            )}
          </section>
        </div>
      </main>
    </>
  );
}
