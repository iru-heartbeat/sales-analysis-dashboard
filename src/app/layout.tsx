import type { Metadata } from "next";
import { Noto_Sans_JP } from "next/font/google";
import { Suspense } from "react";
import { AuthControls } from "@/components/AuthControls";
import "./globals.css";

const notoSansJp = Noto_Sans_JP({
  variable: "--font-noto-sans-jp",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "売上分析ダッシュボード",
  description: "CSVをアップロードして月次KPIとAI分析コメントを確認できます",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ja" className={`${notoSansJp.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <header className="bg-brand text-brand-foreground">
          <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-4">
            <span className="text-lg font-semibold tracking-wide">
              売上分析ダッシュボード
            </span>
            <Suspense fallback={null}>
              <AuthControls />
            </Suspense>
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
          {children}
        </main>
      </body>
    </html>
  );
}
