"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ChevronRight, ShoppingBasket } from "lucide-react";

import { IngredientCard } from "@/components/features/IngredientCard";
import { EmptyPlate } from "@/components/ui/EmptyPlate";
import { getInventory } from "@/lib/api";
import { cn } from "@/lib/cn";
import { groupByInventoryCategory } from "@/lib/inventory-categories";
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
        setError("库存加载失败，请确认后端服务正常运行。");
        addDebugLog("error", "[Inventory] Failed to load inventory");
      })
      .finally(() => setLoading(false));
  }, [addDebugLog]);

  const expiringCount = useMemo(
    () => items.filter((item) => item.status !== "fresh").length,
    [items]
  );
  const groupedItems = useMemo(() => groupByInventoryCategory(items), [items]);
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
            <p className="text-xs text-text-muted">分类库存总览</p>
          </div>
          <Link
            href="/shopping?tab=inventory"
            className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            <ShoppingBasket className="h-4 w-4" />
            去补货
          </Link>
        </div>
      </header>

      <main className="px-4 py-4 lg:px-6 lg:py-8">
        <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)] lg:items-start">
          <section className="space-y-4 rounded-[24px] border border-border bg-surface p-5 shadow-sm">
            <div>
              <p className="text-sm font-medium text-text-muted">库存总览</p>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-2xl bg-background px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.2em] text-text-muted">总数</p>
                  <p className="mt-2 text-2xl font-semibold text-text-main">{items.length}</p>
                </div>
                <div className="rounded-2xl bg-background px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.2em] text-text-muted">临期</p>
                  <p className="mt-2 text-2xl font-semibold text-alert">{expiringCount}</p>
                </div>
              </div>
            </div>

            <div className="rounded-2xl bg-background p-4 text-sm text-text-muted">
              录入入口已经统一移到补货页。拍照、自然语言和语音输入都在
              <span className="font-medium text-text-main"> 分类库存展示 </span>
              标签下。
            </div>

            <Link
              href="/shopping?tab=inventory"
              className="flex items-center justify-between rounded-2xl border border-border bg-background px-4 py-4 text-sm text-text-main"
            >
              <div>
                <p className="font-medium">去补货维护库存</p>
                <p className="mt-1 text-text-muted">拍照补录、自然语言和语音都在这里</p>
              </div>
              <ChevronRight className="h-4 w-4 text-text-muted" />
            </Link>
          </section>

          <section className="rounded-[24px] border border-border bg-surface p-4 shadow-sm sm:p-5">
            {error && (
              <div className="mb-4 rounded-2xl border border-alert/20 bg-alert-bg px-4 py-3 text-sm text-alert">
                <p>{error}</p>
                <Link href="/shopping?tab=inventory" className="mt-3 inline-flex text-sm font-medium underline">
                  去补货页维护库存
                </Link>
              </div>
            )}
            {expiringCount > 0 && (
              <div className="mb-4 rounded-2xl border border-alert/20 bg-alert-bg px-4 py-3 text-sm text-alert">
                {expiringCount} 个食材临期，建议优先消耗。
              </div>
            )}

            {loading ? (
              <div className="py-16 text-center text-text-muted">加载中...</div>
            ) : isEmpty ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <EmptyPlate className="mb-4" />
                <p className="text-base text-text-muted">冰箱空空如也</p>
                <Link
                  href="/shopping?tab=inventory"
                  className="mt-4 inline-flex items-center rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
                >
                  去补货
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
