"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Modal } from "@/components/ui/Modal";
import { cn } from "@/lib/cn";
import { pickByLocale, useLocale } from "@/lib/i18n";

export type NumberEditType =
  | "height"
  | "weight"
  | "household_size"
  | "time_budget_minutes"
  | "purchase_frequency_per_week";

function getConfig(locale: ReturnType<typeof useLocale>) {
  return {
    height: { min: 100, max: 250, step: 1, unit: "cm", label: pickByLocale(locale, { zh: "身高", en: "Height" }) },
    weight: { min: 30, max: 200, step: 0.5, unit: "kg", label: pickByLocale(locale, { zh: "体重", en: "Weight" }) },
    household_size: {
      min: 1,
      max: 8,
      step: 1,
      unit: pickByLocale(locale, { zh: "人", en: "people" }),
      label: pickByLocale(locale, { zh: "家庭人数", en: "Household size" }),
    },
    time_budget_minutes: {
      min: 10,
      max: 90,
      step: 5,
      unit: pickByLocale(locale, { zh: "分钟", en: "min" }),
      label: pickByLocale(locale, { zh: "工作日时间预算", en: "Weekday time budget" }),
    },
    purchase_frequency_per_week: {
      min: 1,
      max: 4,
      step: 1,
      unit: pickByLocale(locale, { zh: "次/周", en: "times/wk" }),
      label: pickByLocale(locale, { zh: "每周采购频率", en: "Weekly shopping frequency" }),
    },
  } satisfies Record<
    NumberEditType,
    { min: number; max: number; step: number; unit: string; label: string }
  >;
}

function formatOptionValue(type: NumberEditType, value: number, unit: string) {
  if (type === "purchase_frequency_per_week" && value >= 4) {
    return `4+ ${unit}`;
  }
  return `${value} ${unit}`;
}

function generateOptions(min: number, max: number, step: number): number[] {
  const opts: number[] = [];
  for (let v = min; v <= max; v += step) {
    opts.push(Number(v.toFixed(step < 1 ? 1 : 0)));
  }
  return opts;
}

interface NumberEditSheetProps {
  type: NumberEditType;
  value: number;
  onConfirm: (value: number) => void;
  isOpen: boolean;
  onClose: () => void;
}

const ROW_HEIGHT = 44;
const VISIBLE_ROWS = 5;
const PICKER_HEIGHT = ROW_HEIGHT * VISIBLE_ROWS;

export function NumberEditSheet({
  type,
  value,
  onConfirm,
  isOpen,
  onClose,
}: NumberEditSheetProps) {
  const locale = useLocale();
  const config = getConfig(locale)[type];
  const options = generateOptions(config.min, config.max, config.step);
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollEndTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [inputValue, setInputValue] = useState(String(value));
  const [pickerValue, setPickerValue] = useState(value);

  const clamp = useCallback(
    (v: number) => Math.min(config.max, Math.max(config.min, v)),
    [config.min, config.max]
  );

  // 同步初始值
  useEffect(() => {
    if (isOpen) {
      const num = clamp(value);
      setInputValue(String(num));
      setPickerValue(num);
    }
  }, [isOpen, value, clamp]);

  // 仅弹窗打开时滚动到当前值，不依赖 pickerValue，避免用户滑动时被重置导致抖动
  useEffect(() => {
    if (!isOpen) return;
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const el = scrollRef.current;
        if (!el) return;
        const initial = clamp(value);
        const idx = options.findIndex((o) => Math.abs(o - initial) < 0.01);
        if (idx >= 0) {
          el.scrollTop = idx * ROW_HEIGHT;
        }
      });
    });
    return () => cancelAnimationFrame(id);
  }, [isOpen, value]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/[^\d.]/g, "");
    setInputValue(raw);
    const num = parseFloat(raw);
    if (!Number.isNaN(num)) {
      const clamped = clamp(num);
      setPickerValue(clamped);
    }
  };

  const handleInputBlur = () => {
    const num = parseFloat(inputValue);
    if (Number.isNaN(num)) {
      setInputValue(String(pickerValue));
      return;
    }
    const clamped = clamp(num);
    setInputValue(String(clamped));
    setPickerValue(clamped);
  };

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    if (scrollEndTimerRef.current) clearTimeout(scrollEndTimerRef.current);
    scrollEndTimerRef.current = setTimeout(() => {
      scrollEndTimerRef.current = null;
      const idx = Math.round(el.scrollTop / ROW_HEIGHT);
      const safeIdx = Math.max(0, Math.min(idx, options.length - 1));
      const newVal = options[safeIdx];
      setPickerValue(newVal);
      setInputValue(String(newVal));
    }, 80);
  };

  const handleConfirm = () => {
    const num = parseFloat(inputValue);
    const final = Number.isNaN(num) ? pickerValue : clamp(num);
    onConfirm(final);
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={pickByLocale(locale, {
        zh: `编辑${config.label}`,
        en: `Edit ${config.label}`,
      })}
    >
      <div className="space-y-6">
        <div>
          <label className="block text-sm font-medium text-zinc-500 mb-2">
            {pickByLocale(locale, { zh: "直接输入", en: "Enter directly" })}
          </label>
          <div className="flex items-center gap-2">
            <input
              type="text"
              inputMode="decimal"
              value={inputValue}
              onChange={handleInputChange}
              onBlur={handleInputBlur}
              className={cn(
                "flex-1 px-4 py-3 rounded-xl",
                "bg-zinc-50 border border-zinc-200",
                "text-zinc-900 text-lg font-medium text-center",
                "focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
              )}
            />
            <span className="text-zinc-500 font-medium w-10">{config.unit}</span>
          </div>
        </div>

        <div className="relative">
            <div
              className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-11 rounded-lg bg-primary/10 border border-primary/30 pointer-events-none z-10"
              style={{ marginTop: -ROW_HEIGHT / 2 }}
            />
            <div
              ref={scrollRef}
              onScroll={handleScroll}
              className="overflow-y-auto overscroll-contain snap-y snap-mandatory"
              style={{
                height: PICKER_HEIGHT,
                scrollSnapType: "y mandatory",
              }}
            >
              <div style={{ height: (VISIBLE_ROWS - 1) / 2 * ROW_HEIGHT }} />
              {options.map((opt) => (
                <div
                  key={opt}
                  className={cn(
                    "flex items-center justify-center text-lg font-medium snap-center",
                    opt === pickerValue ? "text-primary" : "text-zinc-400"
                  )}
                  style={{ height: ROW_HEIGHT }}
                >
                  {formatOptionValue(type, opt, config.unit)}
                </div>
              ))}
              <div style={{ height: (VISIBLE_ROWS - 1) / 2 * ROW_HEIGHT }} />
            </div>
          </div>

        <button
          onClick={handleConfirm}
          className={cn(
            "w-full py-3 rounded-xl font-medium",
            "bg-primary text-white",
            "hover:bg-primary-hover active:opacity-90 transition-colors"
          )}
        >
          {pickByLocale(locale, { zh: "确定", en: "Confirm" })}
        </button>
      </div>
    </Modal>
  );
}
