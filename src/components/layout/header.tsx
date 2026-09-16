import { CloudSun, LogOut } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";

import { logout } from "@/app/login/actions";
import { Container } from "@/components/layout/container";
import { MainNav } from "@/components/layout/main-nav";
import { MobileNav } from "@/components/layout/mobile-nav";
import { StationSwitcher, type StationOption } from "@/components/layout/station-switcher";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { hasValidSession } from "@/lib/auth/session-cookie";
import { getStations } from "@/lib/db/queries";
import { publicEnv } from "@/lib/env";

/**
 * Fase 5.2: haalt de stationlijst op voor de stationselector. Elke pagina
 * onder deze layout is al `dynamic = "force-dynamic"` (nooit statisch
 * geprerenderd), dus dit maakt de Header niet "meer dynamisch" dan hij al
 * effectief was — maar de query zelf mag nooit de hele layout laten
 * crashen (bv. tijdelijk geen databaseverbinding), vandaar de `catch`.
 */
async function getStationOptions(): Promise<StationOption[]> {
  const stations = await getStations().catch(() => []);
  return stations.map((station) => ({
    slug: station.slug,
    displayName: station.displayName,
    isDefault: station.isDefault,
  }));
}

export async function Header() {
  const [stationOptions, isLoggedIn] = await Promise.all([
    getStationOptions(),
    hasValidSession(),
  ]);

  return (
    <header className="border-border bg-background/90 supports-[backdrop-filter]:bg-background/70 sticky top-0 z-50 border-b backdrop-blur">
      <Container className="flex h-16 items-center justify-between gap-2 sm:gap-4">
        <div className="flex min-w-0 items-center gap-2">
          {/* Helemaal links vastgezet (i.p.v. rechts) zodat hij op een smalle
              telefoon/tablet altijd zichtbaar blijft, ook als de rechterkant
              (stationkeuze, thema) weinig ruimte overlaat. */}
          <Suspense fallback={null}>
            <MobileNav stationOptions={stationOptions} isLoggedIn={isLoggedIn} />
          </Suspense>
          <Link
            href="/dashboard"
            className="text-foreground focus-visible:outline-primary flex min-w-0 items-center gap-2 rounded-md text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            <CloudSun className="text-primary h-6 w-6 shrink-0" aria-hidden="true" />
            <span className="hidden truncate sm:inline">{publicEnv.NEXT_PUBLIC_STATION_NAME}</span>
            <span className="truncate sm:hidden">Weerstation</span>
          </Link>
        </div>

        <Suspense fallback={null}>
          <MainNav />
        </Suspense>

        <div className="flex shrink-0 items-center gap-2">
          <Suspense fallback={null}>
            <StationSwitcher stations={stationOptions} />
          </Suspense>
          <ThemeToggle />
          {/* Alleen zichtbaar wanneer ingelogd — op /login zelf is
              `isLoggedIn` altijd false (die pagina stuurt anders al door). */}
          {isLoggedIn && (
            <form action={logout}>
              <button
                type="submit"
                title="Uitloggen"
                aria-label="Uitloggen"
                className="border-border text-foreground hover:bg-accent hover:text-accent-foreground hidden h-10 w-10 items-center justify-center rounded-md border sm:flex"
              >
                <LogOut className="h-4 w-4" aria-hidden="true" />
              </button>
            </form>
          )}
        </div>
      </Container>
    </header>
  );
}
