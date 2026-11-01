import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Uitgaven",
  appleWebApp: { capable: true, title: "Uitgaven", statusBarStyle: "default" },
};

export const viewport: Viewport = { themeColor: "#fafaf9" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="nl">
      <body>{children}</body>
    </html>
  );
}
