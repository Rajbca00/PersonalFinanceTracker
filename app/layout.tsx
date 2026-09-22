import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { ThemeProvider, themeScript } from "@/components/ThemeProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: "Personal Finance Tracker",
  description: "Track accounts, cards, buckets and trips in one place.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f7f9" },
    { media: "(prefers-color-scheme: dark)", color: "#0b0e14" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        {/*
          Applies the stored theme before first paint, so there's no flash of
          the wrong one. This goes through next/script rather than a bare
          <script> tag: React 19 does not execute inline scripts rendered by a
          component, and "beforeInteractive" is what guarantees it runs ahead
          of hydration.
        */}
        <Script id="theme-init" strategy="beforeInteractive">
          {themeScript}
        </Script>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
