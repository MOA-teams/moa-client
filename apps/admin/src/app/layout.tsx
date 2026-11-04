import type { Metadata } from "next";
import { Geist_Mono } from "next/font/google";
import { AdminShell } from "@/components/admin/shell";
import "./globals.css";

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "모아 어드민",
    template: "%s · 모아 어드민",
  },
  description: "IT 스타트업용 고객 문의 분류·답변 초안 서비스. 코드가 바뀌면 답변 근거도 따라 바뀝니다.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className={`${geistMono.variable} h-full antialiased`}>
      <head>
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
      </head>
      <body className="min-h-full">
        <AdminShell>{children}</AdminShell>
      </body>
    </html>
  );
}
