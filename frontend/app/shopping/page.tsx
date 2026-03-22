"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, MicOff } from "lucide-react";

import { AddItemSheet } from "@/components/features/AddItemSheet";
import {
  getShoppingList,
  saveShoppingListItems,
  updateShoppingListItem,
} from "@/lib/api";
import type { ShoppingListItem } from "@/lib/types";
import { getUserId } from "@/lib/user";

type PendingText = {
  rawText: string;
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

export default function ShoppingPage() {
  const userId = getUserId();
  const [items, setItems] = useState<ShoppingListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [inputText, setInputText] = useState("");
  const [pendingText, setPendingText] = useState<PendingText | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [speechError, setSpeechError] = useState<string | null>(null);
  const [speechSupported, setSpeechSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);

  useEffect(() => {
    getShoppingList(userId)
      .then((next) => {
        setItems(next);
        setError(null);
      })
      .catch((cause) => {
        console.error(cause);
        setError("补货清单加载失败，请确认后端服务已启动。");
      })
      .finally(() => setLoading(false));
  }, [userId]);

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
          ? "请先允许麦克风权限。"
          : `语音输入失败：${event.error}`
      );
    };
    recognition.onend = () => {
      setListening(false);
    };

    recognitionRef.current = recognition;
    setSpeechSupported(true);

    return () => {
      recognition.stop();
      recognitionRef.current = null;
    };
  }, []);

  const handleToggle = async (item: ShoppingListItem) => {
    try {
      const updated = await updateShoppingListItem(userId, item.id, !item.checked);
      setItems((prev) => prev.map((entry) => (entry.id === updated.id ? updated : entry)));
      setError(null);
    } catch (cause) {
      console.error(cause);
      setError("补货清单更新失败，请稍后重试。");
    }
  };

  const handleVoiceToggle = () => {
    const recognition = recognitionRef.current;
    if (!recognition) {
      setSpeechError("当前浏览器不支持语音输入。");
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
      setSpeechError("语音输入启动失败，请稍后重试。");
    }
  };

  const handleConfirmAdd = async (
    nextItems: Array<{
      displayName: string;
      normalizedName: string;
      quantityText: string;
    }>
  ) => {
    const saved = await saveShoppingListItems(
      userId,
      nextItems.map((item) => ({
        displayName: item.displayName,
        normalizedName: item.normalizedName,
        quantityText: item.quantityText,
        reason: "自然语言补货",
      }))
    );
    setItems(saved);
    setInputText("");
    setError(null);
  };

  return (
    <>
      <header className="sticky top-0 left-0 right-0 z-40 border-b border-border bg-surface/95 pt-safe backdrop-blur">
        <div className="flex h-14 items-center px-4 lg:px-6">
          <h1 className="text-lg font-semibold text-text-main">补货</h1>
        </div>
      </header>

      <main className="px-4 py-4 lg:px-6 lg:py-8">
        <section className="rounded-[24px] border border-border bg-surface p-5 shadow-sm">
          <p className="text-sm font-medium text-text-muted">自然语言补货 + 语音输入</p>
          <textarea
            value={inputText}
            onChange={(event) => setInputText(event.target.value)}
            placeholder="例如：买鸡蛋两盒、无糖酸奶、小番茄和生菜"
            className="mt-4 min-h-28 w-full rounded-2xl border border-border bg-background px-4 py-3 text-sm text-text-main outline-none"
          />
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleVoiceToggle}
              disabled={!speechSupported}
              className="inline-flex items-center gap-2 rounded-xl border border-border bg-background px-4 py-3 text-sm font-medium text-text-main disabled:opacity-50"
            >
              {listening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
              {listening ? "停止语音输入" : "语音输入"}
            </button>
            <button
              type="button"
              onClick={() => inputText.trim() && setPendingText({ rawText: inputText.trim() })}
              disabled={!inputText.trim()}
              className="rounded-xl bg-primary px-4 py-3 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              解析并加入补货清单
            </button>
          </div>
          <div className="mt-3 space-y-1 text-sm text-text-muted">
            <p>补货页现在负责自然语言录入，库存页只保留拍照入库。</p>
            {!speechSupported && <p>当前浏览器不支持语音输入。</p>}
            {speechError && <p className="text-alert">{speechError}</p>}
          </div>
        </section>

        <section className="mt-4 rounded-[24px] border border-border bg-surface p-5 shadow-sm">
          {error ? (
            <p className="text-sm text-alert">{error}</p>
          ) : loading ? (
            <p className="text-sm text-text-muted">加载中...</p>
          ) : items.length === 0 ? (
            <p className="text-sm text-text-muted">当前没有补货建议。</p>
          ) : (
            <ul className="space-y-3">
              {items.map((item) => (
                <li key={item.id} className="rounded-2xl border border-border bg-background px-4 py-3">
                  <label className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={item.checked}
                      onChange={() => handleToggle(item)}
                      className="mt-1"
                    />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium text-text-main">{item.displayName}</p>
                        {item.quantityText ? (
                          <span className="rounded-full bg-surface px-2 py-1 text-xs text-text-muted">
                            {item.quantityText}
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-1 text-sm text-text-muted">{item.reason}</p>
                    </div>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>

      {pendingText && (
        <AddItemSheet
          rawText={pendingText.rawText}
          sourceType="manual_text"
          confirmLabel="加入补货清单"
          onConfirm={handleConfirmAdd}
          onClose={() => setPendingText(null)}
        />
      )}
    </>
  );
}
