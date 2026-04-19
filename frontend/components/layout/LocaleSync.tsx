"use client";

import { useEffect } from "react";

import { useLanguageTag } from "@/lib/i18n";

export function LocaleSync() {
  const languageTag = useLanguageTag();

  useEffect(() => {
    document.documentElement.lang = languageTag;
  }, [languageTag]);

  return null;
}
