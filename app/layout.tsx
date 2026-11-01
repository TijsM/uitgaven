import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ServiceWorker } from "./sw-register";

export const metadata: Metadata = {
  title: "Uitgaven",
  applicationName: "Uitgaven",
  appleWebApp: { capable: true, title: "Uitgaven", statusBarStyle: "default" },
  // Older iOS versions only open full screen from the home screen with the apple-prefixed tag
  other: { "apple-mobile-web-app-capable": "yes" },
};

export const viewport: Viewport = { themeColor: "#fafaf9" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="nl">
      <body>
        {children}
        <ServiceWorker />
      </body>
    </html>
  );
}
