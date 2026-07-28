import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Orwell SEO Command Centre",
  description:
    "Multi-brand SEO intelligence platform — portfolio-first rankings, audits, backlinks and AI visibility.",
};

/**
 * viewportFit: "cover" lets the 100dvh shell use the full iPad/iOS viewport
 * including the safe-area insets. Zoom is intentionally left enabled.
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body>{children}</body>
    </html>
  );
}
