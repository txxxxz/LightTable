"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Mic, MicOff } from "lucide-react";

import { AddItemSheet, type DraftItem } from "@/components/features/AddItemSheet";
import { IngredientCard } from "@/components/features/IngredientCard";
import { SmartCameraButton } from "@/components/features/SmartCameraButton";
import { Button } from "@/components/ui/Button";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import {
  addSelectedShoppingItemsToInventory,
  getInventory,
  getShoppingList,
  saveInventoryItems,
  updateShoppingListItem,
} from "@/lib/api";
import { groupByInventoryCategory } from "@/lib/inventory-categories";
import { pickByLocale, useLocale } from "@/lib/i18n";
import type { InventoryItem, ShoppingListItem } from "@/lib/types";
import { getUserId } from "@/lib/user";

type ActiveTab = "inventory" | "suggestions";

type PendingSheet =
  | {
      file: File;
      sourceType: "image" | "receipt";
    }
  | {
      rawText: string;
      sourceType: "manual_text";
    };

type SpeechRecognitionAlternativeLike = {
  transcript: string;
};

type SpeechRecognitionEventLike = {
  results: ArrayLike<ArrayLike<SpeechRecognitionAlternativeLike>>;
};

type SpeechRecognitionErrorEventLike = {
  error: string;
};

type SpeechRecognitionInstance = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionInstance;

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

function ShoppingPageContent() {
  const locale = useLocale();
  const userId = getUserId();
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const activeTab: ActiveTab = searchParams.get("tab") === "suggestions" ? "suggestions" : "inventory";

  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [shoppingItems, setShoppingItems] = useState<ShoppingListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [inputText, setInputText] = useState("");
  const [pendingSheet, setPendingSheet] = useState<PendingSheet | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [speechError, setSpeechError] = useState<string | null>(null);
  const [speechSupported, setSpeechSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [movingToInventory, setMovingToInventory] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);

  const refresh = async () => {
    const [nextInventory, nextShopping] = await Promise.all([
      getInventory(userId),
      getShoppingList(userId),
    ]);
    setInventoryItems(nextInventory);
    setShoppingItems(nextShopping);
  };

  useEffect(() => {
    refresh()
      .then(() => setError(null))
      .catch((cause) => {
        console.error(cause);
        setError(
          pickByLocale(locale, {
            zh: "补货页加载失败，请确认后端服务已启动。",
            en: "Failed to load the restock page. Please make sure the backend is running.",
          })
        );
      })
      .finally(() => setLoading(false));
  }, [locale, userId]);

  useEffect(() => {
    const browserWindow = window as Window & {
      SpeechRecognition?: SpeechRecognitionConstructor;
      webkitSpeechRecognition?: SpeechRecognitionConstructor;
    };
    const Recognition =
      browserWindow.SpeechRecognition || browserWindow.webkitSpeechRecognition;
    if (!Recognition) {
      setSpeechSupported(false);
      return undefined;
    }

    const recognition = new Recognition();
    recognition.lang = "zh-CN";
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .flatMap((result) => Array.from(result))
        .map((entry) => entry.transcript)
        .join("")
        .trim();
      if (!transcript) return;
      setInputText((prev) => {
        if (!prev.trim()) return transcript;
        return /[，,。\s]$/.test(prev) ? `${prev}${transcript}` : `${prev}，${transcript}`;
      });
      setSpeechError(null);
    };
    recognition.onerror = (event) => {
      setListening(false);
      setSpeechError(
        event.error === "not-allowed"
          ? pickByLocale(locale, {
              zh: "请先允许麦克风权限。",
              en: "Please allow microphone access first.",
            })
          : pickByLocale(locale, {
              zh: `语音输入失败：${event.error}`,
              en: `Voice input failed: ${event.error}`,
            })
      );
    };
    recognition.onend = () => setListening(false);

    recognitionRef.current = recognition;
    setSpeechSupported(true);

    return () => {
      recognition.stop();
      recognitionRef.current = null;
    };
  }, [locale]);

  const groupedInventory = useMemo(
    () => groupByInventoryCategory(inventoryItems, locale),
    [inventoryItems, locale]
  );
  const groupedSuggestions = useMemo(
    () => groupByInventoryCategory(shoppingItems, locale),
    [locale, shoppingItems]
  );
  const selectedSuggestionIds = useMemo(
    () => shoppingItems.filter((item) => item.checked).map((item) => item.id),
    [shoppingItems]
  );

  const setTab = (tab: ActiveTab) => {
    const next = new URLSearchParams(searchParams.toString());
    next.set("tab", tab);
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  };

  const handleVoiceToggle = () => {
    const recognition = recognitionRef.current;
    if (!recognition) {
      setSpeechError(
        pickByLocale(locale, {
          zh: "当前浏览器不支持语音输入。",
          en: "Voice input is not supported in this browser.",
        })
      );
      return;
    }
    if (listening) {
      recognition.stop();
      setListening(false);
      return;
    }
    try {
      setSpeechError(null);
      recognition.start();
      setListening(true);
    } catch (cause) {
      console.error(cause);
      setListening(false);
      setSpeechError(
        pickByLocale(locale, {
          zh: "语音输入启动失败，请稍后重试。",
          en: "Failed to start voice input. Please try again.",
        })
      );
    }
  };

  const handleConfirmInventory = async (nextItems: DraftItem[]) => {
    const saved = await saveInventoryItems(
      userId,
      nextItems.map((item) => ({
        displayName: item.displayName,
        quantityText: item.quantityText,
        category: item.category,
        storageType: item.storageType,
        sourceType: item.sourceType,
        dateAdded: item.dateAdded,
        imageUrl: item.imageUrl,
      }))
    );
    setInventoryItems(saved);
    setInputText("");
    setError(null);
    setSuccessMessage(
      pickByLocale(locale, {
        zh: `已加入库存 ${nextItems.length} 项。`,
        en: `Added ${nextItems.length} items to inventory.`,
      })
    );
  };

  const handleToggleSuggestion = async (item: ShoppingListItem) => {
    try {
      const updated = await updateShoppingListItem(userId, item.id, !item.checked);
      setShoppingItems((prev) => prev.map((entry) => (entry.id === updated.id ? updated : entry)));
      setError(null);
      setSuccessMessage(null);
    } catch (cause) {
      console.error(cause);
      setError(
        pickByLocale(locale, {
          zh: "补货清单更新失败，请稍后重试。",
          en: "Failed to update the shopping list. Please try again.",
        })
      );
    }
  };

  const handleAddSelectedToInventory = async () => {
    if (selectedSuggestionIds.length === 0) return;
    setMovingToInventory(true);
    try {
      const result = await addSelectedShoppingItemsToInventory(userId, selectedSuggestionIds);
      setInventoryItems(result.inventoryItems);
      setShoppingItems(result.shoppingItems);
      setError(null);
      setSuccessMessage(
        pickByLocale(locale, {
          zh: `已将 ${result.movedCount} 项补货加入库存。`,
          en: `Added ${result.movedCount} shopping items to inventory.`,
        })
      );
      setTab("inventory");
    } catch (cause) {
      console.error(cause);
      setError(
        pickByLocale(locale, {
          zh: "加入库存失败，请稍后重试。",
          en: "Failed to add items to inventory. Please try again.",
        })
      );
    } finally {
      setMovingToInventory(false);
    }
  };

  return (
    <>
      <header className="sticky top-0 left-0 right-0 z-40 border-b border-border bg-surface/95 pt-safe backdrop-blur">
        <div className="flex h-14 items-center px-4 lg:px-6">
          <h1 className="text-lg font-semibold text-text-main">
            {pickByLocale(locale, { zh: "补货", en: "Restock" })}
          </h1>
        </div>
      </header>

      <main className="px-4 py-4 lg:px-6 lg:py-8">
        <div className="mx-auto max-w-6xl space-y-4">
          <section className="rounded-[24px] border border-border bg-surface p-4 shadow-sm">
            <SegmentedControl
              options={[
                {
                  value: "inventory",
                  label: pickByLocale(locale, { zh: "分类库存展示", en: "Inventory view" }),
                },
                {
                  value: "suggestions",
                  label: pickByLocale(locale, { zh: "建议补货清单", en: "Suggested shopping list" }),
                },
              ]}
              value={activeTab}
              onChange={(value) => setTab(value as ActiveTab)}
              className="w-full"
            />
          </section>

          {error && (
            <div className="rounded-2xl border border-alert/20 bg-alert-bg px-4 py-3 text-sm text-alert">
              {error}
            </div>
          )}
          {successMessage && (
            <div className="rounded-2xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm text-primary">
              {successMessage}
            </div>
          )}

          {activeTab === "inventory" ? (
            <section className="space-y-4">
              <div className="rounded-[24px] border border-border bg-surface p-5 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-text-muted">
                      {pickByLocale(locale, {
                        zh: "拍照录入 + 自然语言 + 语音",
                        en: "Photo capture + natural language + voice",
                      })}
                    </p>
                    <p className="mt-1 text-sm text-text-muted">
                      {pickByLocale(locale, {
                        zh: "这里直接维护真实库存，确认后会立即进入分类库存。",
                        en: "Manage your real inventory here. Confirmed items go straight into categorized inventory.",
                      })}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <SmartCameraButton onCapture={(file) => setPendingSheet({ file, sourceType: "image" })} />
                    <button
                      type="button"
                      onClick={handleVoiceToggle}
                      disabled={!speechSupported}
                      className="inline-flex items-center gap-2 rounded-xl border border-border bg-background px-4 py-3 text-sm font-medium text-text-main disabled:opacity-50"
                    >
                      {listening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                      {listening
                        ? pickByLocale(locale, { zh: "停止语音输入", en: "Stop voice input" })
                        : pickByLocale(locale, { zh: "语音输入", en: "Voice input" })}
                    </button>
                  </div>
                </div>

                <textarea
                  value={inputText}
                  onChange={(event) => setInputText(event.target.value)}
                  placeholder={pickByLocale(locale, {
                    zh: "例如：买12个鸡蛋、一盒酸奶、一个卷心菜、家里没有蚝油还要一颗生菜",
                    en: "For example: 12 eggs, one yogurt, one cabbage, and we also need oyster sauce and lettuce.",
                  })}
                  className="mt-4 min-h-28 w-full rounded-2xl border border-border bg-background px-4 py-3 text-sm text-text-main outline-none"
                />
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() =>
                      inputText.trim() && setPendingSheet({ rawText: inputText.trim(), sourceType: "manual_text" })
                    }
                    disabled={!inputText.trim()}
                    className="rounded-xl bg-primary px-4 py-3 text-sm font-medium text-primary-foreground disabled:opacity-50"
                  >
                    {pickByLocale(locale, { zh: "解析并加入库存", en: "Parse and add to inventory" })}
                  </button>
                </div>
                <div className="mt-3 space-y-1 text-sm text-text-muted">
                  <p>
                    {pickByLocale(locale, {
                      zh: "库存和补货统一使用 10 个固定分类，不再用自由标签。",
                      en: "Inventory and shopping both use the same 10 fixed categories instead of free-form tags.",
                    })}
                  </p>
                  {!speechSupported && (
                    <p>
                      {pickByLocale(locale, {
                        zh: "当前浏览器不支持语音输入。",
                        en: "Voice input is not supported in this browser.",
                      })}
                    </p>
                  )}
                  {speechError && <p className="text-alert">{speechError}</p>}
                </div>
              </div>

              <div className="rounded-[24px] border border-border bg-surface p-5 shadow-sm">
                {loading ? (
                  <p className="py-10 text-center text-sm text-text-muted">
                    {pickByLocale(locale, { zh: "加载中...", en: "Loading..." })}
                  </p>
                ) : groupedInventory.length === 0 ? (
                  <p className="py-10 text-center text-sm text-text-muted">
                    {pickByLocale(locale, {
                      zh: "当前还没有库存，先拍照或输入一段采购文本。",
                      en: "There is no inventory yet. Start with a photo or a shopping note.",
                    })}
                  </p>
                ) : (
                  <div className="space-y-5">
                    {groupedInventory.map((group) => (
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
              </div>
            </section>
          ) : (
            <section className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-[24px] border border-border bg-surface p-5 shadow-sm">
                <div>
                  <p className="text-sm font-medium text-text-main">
                    {pickByLocale(locale, { zh: "建议补货清单", en: "Suggested shopping list" })}
                  </p>
                  <p className="mt-1 text-sm text-text-muted">
                    {pickByLocale(locale, {
                      zh: "先勾选这次实际买到的物品，再一键加入库存。",
                      en: "Check what you actually bought this time, then add everything to inventory in one tap.",
                    })}
                  </p>
                </div>
                <Button
                  onClick={handleAddSelectedToInventory}
                  disabled={selectedSuggestionIds.length === 0 || movingToInventory}
                >
                  {movingToInventory
                    ? pickByLocale(locale, { zh: "加入库存中...", en: "Adding to inventory..." })
                    : pickByLocale(locale, {
                        zh: `一键加入库存${selectedSuggestionIds.length > 0 ? `（${selectedSuggestionIds.length}）` : ""}`,
                        en: `Add to inventory${selectedSuggestionIds.length > 0 ? ` (${selectedSuggestionIds.length})` : ""}`,
                      })}
                </Button>
              </div>

              <section className="rounded-[24px] border border-border bg-surface p-5 shadow-sm">
              {loading ? (
                <p className="py-10 text-center text-sm text-text-muted">
                  {pickByLocale(locale, { zh: "加载中...", en: "Loading..." })}
                </p>
              ) : groupedSuggestions.length === 0 ? (
                <p className="py-10 text-center text-sm text-text-muted">
                  {pickByLocale(locale, {
                    zh: "当前没有建议补货项。",
                    en: "There are no suggested shopping items right now.",
                  })}
                </p>
              ) : (
                <div className="space-y-5">
                  {groupedSuggestions.map((group) => (
                    <section key={group.category}>
                      <SectionHeader title={group.label} count={group.items.length} />
                      <ul className="space-y-3">
                        {group.items.map((item) => (
                          <li
                            key={item.id}
                            className="rounded-2xl border border-border bg-background px-4 py-3"
                          >
                            <label className="flex items-start gap-3">
                              <input
                                type="checkbox"
                                checked={item.checked}
                                onChange={() => handleToggleSuggestion(item)}
                                className="mt-1"
                              />
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <p className="font-medium text-text-main">{item.displayName}</p>
                                  {item.recommendedQuantityText ? (
                                    <span className="rounded-full bg-surface px-2 py-1 text-xs text-text-muted">
                                      {pickByLocale(locale, { zh: "建议补", en: "Suggested" })}{" "}
                                      {item.recommendedQuantityText}
                                    </span>
                                  ) : null}
                                  {item.quantityText ? (
                                    <span className="rounded-full bg-surface px-2 py-1 text-xs text-text-muted">
                                      {pickByLocale(locale, { zh: "已记", en: "Recorded" })} {item.quantityText}
                                    </span>
                                  ) : null}
                                </div>
                                <p className="mt-1 text-sm text-text-muted">{item.reason}</p>
                              </div>
                            </label>
                          </li>
                        ))}
                      </ul>
                    </section>
                  ))}
                </div>
              )}
              </section>
            </section>
          )}
        </div>
      </main>

      {pendingSheet?.sourceType === "manual_text" ? (
        <AddItemSheet
          rawText={pendingSheet.rawText}
          sourceType="manual_text"
          confirmLabel={pickByLocale(locale, { zh: "加入分类库存", en: "Add to inventory" })}
          onConfirm={handleConfirmInventory}
          onClose={() => setPendingSheet(null)}
        />
      ) : null}

      {pendingSheet && pendingSheet.sourceType !== "manual_text" ? (
        <AddItemSheet
          file={pendingSheet.file}
          sourceType={pendingSheet.sourceType}
          confirmLabel={pickByLocale(locale, { zh: "加入分类库存", en: "Add to inventory" })}
          onConfirm={handleConfirmInventory}
          onClose={() => setPendingSheet(null)}
        />
      ) : null}
    </>
  );
}

function ShoppingPageFallback() {
  const locale = useLocale();
  return (
    <>
      <header className="sticky top-0 left-0 right-0 z-40 border-b border-border bg-surface/95 pt-safe backdrop-blur">
        <div className="flex h-14 items-center px-4 lg:px-6">
          <h1 className="text-lg font-semibold text-text-main">
            {pickByLocale(locale, { zh: "补货", en: "Restock" })}
          </h1>
        </div>
      </header>

      <main className="px-4 py-4 lg:px-6 lg:py-8">
        <div className="mx-auto max-w-6xl rounded-[24px] border border-border bg-surface p-5 text-sm text-text-muted shadow-sm">
          {pickByLocale(locale, { zh: "加载中...", en: "Loading..." })}
        </div>
      </main>
    </>
  );
}

export default function ShoppingPage() {
  return (
    <Suspense fallback={<ShoppingPageFallback />}>
      <ShoppingPageContent />
    </Suspense>
  );
}
