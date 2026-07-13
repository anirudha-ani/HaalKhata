/** Root layout: HTML shell, PWA metadata/viewport, query provider and service worker registration. */

import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Providers } from "@/components/providers/Providers";
import { RegisterServiceWorker } from "@/components/providers/RegisterServiceWorker";
import "./globals.css";

/** Site-wide metadata: title template, description, PWA manifest and icons. */
export const metadata: Metadata = {
  title: { default: "HaalKhata", template: "%s · HaalKhata" },
  description: "Split expenses with friends — groups, receipts, balances.",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icon.svg", apple: "/icon-192.png" },
};

/** Viewport configuration: brand theme color and mobile-friendly scaling. */
export const viewport: Viewport = {
  themeColor: "#b03a25",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

/**
 * Root layout for every route: renders the HTML/body shell, wraps the app in
 * the TanStack Query provider, and registers the service worker.
 *
 * @param props - Layout props.
 * @param props.children - The routed page tree to render inside the shell.
 * @returns The full HTML document element.
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
        <RegisterServiceWorker />
      </body>
    </html>
  );
}
