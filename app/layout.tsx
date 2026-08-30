import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "股基罗盘｜AI 持仓分析助手",
  description: "面向个人投资研究的股票与基金 AI 持仓分析助手。",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
