import type { Metadata, Viewport } from "next";
import "./globals.css";
import type { ReactNode } from "react";
import { BottomNav } from "@/components/layout/BottomNav";
import { DebugOverlay } from "@/components/layout/DebugOverlay";

export const metadata: Metadata = {
  title: "LightTable",
  description: "智能家庭饮食决策助手",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "LightTable",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  minimumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN">
      <head>
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta
          name="apple-mobile-web-app-status-bar-style"
          content="black-translucent"
        />
      </head>
      <body className="min-h-screen bg-background text-text-main">
        <div className="pb-20 pb-safe">
          {children}
        </div>
        <DebugOverlay />
        <BottomNav />
      </body>
    </html>
  );
}
