import type { Metadata, Viewport } from "next";
import { Manrope } from "next/font/google";
import "./globals.css";

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-manrope",
  display: "swap",
});

export const metadata: Metadata = {
  title: "SEO Command",
  description:
    "Multi-brand SEO intelligence platform — portfolio-first rankings, audits, backlinks and AI visibility.",
  // The name under the icon when SEO Command is added to a home screen.
  appleWebApp: { title: "SEO Command" },
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
    <html lang="en" className={manrope.variable}>
      <body>{children}</body>
    </html>
  );
}
