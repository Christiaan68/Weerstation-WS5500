import { CloudSun } from "lucide-react";
import Link from "next/link";

import { Container } from "@/components/layout/container";
import { MainNav } from "@/components/layout/main-nav";
import { MobileNav } from "@/components/layout/mobile-nav";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { publicEnv } from "@/lib/env";

export function Header() {
  return (
    <header className="border-border bg-background/90 supports-[backdrop-filter]:bg-background/70 sticky top-0 z-50 border-b backdrop-blur">
      <Container className="flex h-16 items-center justify-between gap-4">
        <Link
          href="/dashboard"
          className="text-foreground focus-visible:outline-primary flex items-center gap-2 rounded-md text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          <CloudSun className="text-primary h-6 w-6" aria-hidden="true" />
          <span className="hidden sm:inline">{publicEnv.NEXT_PUBLIC_STATION_NAME}</span>
          <span className="sm:hidden">Weerstation</span>
        </Link>

        <MainNav />

        <div className="flex items-center gap-2">
          <ThemeToggle />
          <MobileNav />
        </div>
      </Container>
    </header>
  );
}
