"use client";

import { useState, useEffect } from "react";
import { SmartCameraButton } from "@/components/features/SmartCameraButton";
import { AddItemSheet } from "@/components/features/AddItemSheet";
import { IngredientCard } from "@/components/features/IngredientCard";
import { EmptyPlate } from "@/components/ui/EmptyPlate";
import { cn } from "@/lib/cn";
import { getUserId } from "@/lib/user";
import { getInventory, addInventoryItems } from "@/lib/api";
import type { InventoryItem } from "@/lib/types";

export default function InventoryPage() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingFile, setPendingFile] = useState<File | null>(null);

  useEffect(() => {
    const userId = getUserId();
    getInventory(userId)
      .then(setItems)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const expiringCount = items.filter(
    (i) => i.status === "expiring_soon" || i.status === "expired"
  ).length;
  const isEmpty = items.length === 0;

  const handleConfirmAdd = async (newItems: InventoryItem[]) => {
    const userId = getUserId();
    try {
      await addInventoryItems(userId, newItems);
      setItems((prev) => [...prev, ...newItems]);
    } catch (e) {
      console.error("Failed to add items:", e);
    }
    setPendingFile(null);
  };

  return (
    <>
      <header
        className={cn(
          "sticky top-0 left-0 right-0 z-40",
          "bg-surface border-b border-border",
          "pt-safe"
        )}
      >
        <div className="flex items-center justify-between px-4 h-14">
          <h1 className="text-lg font-semibold text-text-main">LightTable</h1>
          <SmartCameraButton onCapture={setPendingFile} />
        </div>
      </header>

      <main className="px-4 py-4">
        {expiringCount > 0 && (
          <div className="mb-4 rounded-lg bg-alert-bg border border-alert/20 px-4 py-2.5 text-sm text-alert">
            {expiringCount} 个食材即将过期
          </div>
        )}

        {loading ? (
          <div className="py-16 text-center text-text-muted">加载中...</div>
        ) : isEmpty ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <EmptyPlate className="mb-4" />
            <p className="text-text-muted text-base">冰箱空空如也</p>
          </div>
        ) : (
          <ul className="space-y-2">
            {items.map((item) => (
              <IngredientCard key={item.id} item={item} />
            ))}
          </ul>
        )}
      </main>

      {pendingFile && (
        <AddItemSheet
          file={pendingFile}
          onConfirm={handleConfirmAdd}
          onClose={() => setPendingFile(null)}
        />
      )}
    </>
  );
}
