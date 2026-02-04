"use client";

import { useRef } from "react";
import { Camera } from "lucide-react";
import { motion } from "framer-motion";

/**
 * 混合架构相机按钮：Web 下用 <input type="file" capture="environment" />，
 * 后续可在此处检测 window.ReactNativeWebView 并切换为调用 Native 相机 API。
 */
export function SmartCameraButton({
  onCapture,
}: {
  onCapture?: (file: File) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleClick = () => {
    inputRef.current?.click();
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onCapture?.(file);
    }
    e.target.value = "";
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        aria-hidden
        onChange={handleChange}
      />
      <motion.button
        type="button"
        whileTap={{ scale: 0.95 }}
        onClick={handleClick}
        className="flex items-center justify-center w-12 h-12 rounded-full bg-primary text-primary-foreground hover:bg-primary-hover border border-border transition-colors"
        aria-label="拍照识别食材"
      >
        <Camera className="w-6 h-6" strokeWidth={1.5} />
      </motion.button>
    </>
  );
}
