import type { Metadata, Viewport } from "next";

import { Footer } from "@/components/layout/footer";
import { Header } from "@/components/layout/header";
import { ThemeProvider } from "@/components/layout/theme-provider";
import { publicEnv } from "@/lib/env";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: `${publicEnv.NEXT_PUBLIC_STATION_NAME} Weerstation`,
    template: `%s | ${publicEnv.NEXT_PUBLIC_STATION_NAME}`,
  },
  description:
    "Cloudgebaseerd dashboard voor actuele en historische weergegevens van een Alecto WS5500 weerstation.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/favicon.ico",
    apple: "/icons/apple-touch-icon.png",
  },
  appleWebApp: {
    title: "Mijnweerstation",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f8fafc" },
    { media: "(prefers-color-scheme: dark)", color: "#0b1220" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="nl" suppressHydrationWarning className="h-full antialiased">
      <body className="bg-background text-foreground flex min-h-full flex-col">
        <ThemeProvider>
          <Header />
          <main className="flex flex-1 flex-col">{children}</main>
          <Footer />
        </ThemeProvider>
      </body>
    </html>
  );
}
