import { CloudRain, Droplets, Gauge, Navigation, Sun, Waves, Wind } from "lucide-react";
import type { ComponentType, ReactNode } from "react";

import { Container } from "@/components/layout/container";
import { AtmosphereArt, RainArt, SunArt, WindArt } from "@/components/weather/sensor-card-art";
import { cn } from "@/lib/utils";

/** Zelfde vorm als de `observation`-tak van `/api/weather/current`. */
export interface TechnicalObservation {
  humidityOutdoorPct: string | null;
  pressureRelativeHpa: string | null;
  windSpeedKmh: string | null;
  windGustKmh: string | null;
  windDirectionDeg: number | null;
  windDirectionCompass: string | null;
  rainDayMm: string | null;
  rainRateMmH: string | null;
  uvIndex: string | null;
  solarRadiationWm2: string | null;
}

/**
 * Elk paneel krijgt een duidelijk herkenbare kleurtoon (i.p.v. bijna-wit) én
 * een groot, vervaagd "watermerk"-icoon — zo blijft het rustig, maar oogt het
 * nooit als een rij identieke witte kaartjes.
 */
const TONE_CLASSES = {
  wind: "bg-gradient-to-br from-sky-500/20 via-sky-500/5 to-transparent border-sky-500/30 dark:from-sky-400/15 dark:border-sky-400/25",
  regen:
    "bg-gradient-to-br from-cyan-500/20 via-cyan-500/5 to-transparent border-cyan-500/30 dark:from-cyan-400/15 dark:border-cyan-400/25",
  atmos:
    "bg-gradient-to-br from-violet-500/15 via-violet-500/5 to-transparent border-violet-500/25 dark:from-violet-400/10 dark:border-violet-400/20",
  zon: "bg-gradient-to-br from-amber-500/20 via-amber-500/5 to-transparent border-amber-500/30 dark:from-amber-400/15 dark:border-amber-400/25",
} as const;

const WATERMARK_CLASSES = {
  wind: "text-sky-500",
  regen: "text-cyan-500",
  atmos: "text-violet-500",
  zon: "text-amber-500",
} as const;

/** Eén verfijnde, gelaagde illustratie per paneeltype — zie sensor-card-art.tsx. */
const ART_COMPONENT: Record<keyof typeof TONE_CLASSES, ComponentType<{ className?: string }>> = {
  wind: WindArt,
  regen: RainArt,
  atmos: AtmosphereArt,
  zon: SunArt,
};

function Panel({
  tone,
  className,
  children,
}: {
  tone: keyof typeof TONE_CLASSES;
  className?: string;
  children: ReactNode;
}) {
  const Art = ART_COMPONENT[tone];
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border p-5",
        TONE_CLASSES[tone],
        className,
      )}
    >
      <Art
        className={cn(
          "pointer-events-none absolute -right-6 -bottom-6 h-32 w-32 opacity-[0.14]",
          WATERMARK_CLASSES[tone],
        )}
      />
      <div className="relative">{children}</div>
    </div>
  );
}

function PanelLabel({ icon: Icon, children }: { icon: typeof Wind; children: ReactNode }) {
  return (
    <div className="text-muted-foreground mb-3 flex items-center gap-2 text-sm font-medium">
      <Icon className="h-4 w-4" aria-hidden="true" />
      {children}
    </div>
  );
}

/**
 * De "technische" laag onder de weer-hero: sensormetingen van het station,
 * logisch gegroepeerd (i.p.v. één rij identieke witte kaartjes) — wind en
 * regen krijgen meer visueel gewicht (meest actiegericht), luchtvochtigheid
 * en luchtdruk delen één "atmosfeer"-paneel, UV/zonnestraling zijn bewust
 * kleiner en secundair gestyled.
 */
export function TechnicalGrid({ observation }: { observation: TechnicalObservation | null }) {
  const hasWindDirection = observation?.windDirectionDeg !== null && observation?.windDirectionDeg !== undefined;
  const isRainingNow =
    observation?.rainRateMmH !== null &&
    observation?.rainRateMmH !== undefined &&
    Number(observation.rainRateMmH) > 0;

  return (
    <Container className="flex flex-col gap-4 pt-6">
      <h2 className="text-muted-foreground text-sm font-semibold tracking-wide uppercase">
        Sensormetingen
      </h2>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Panel tone="wind" className="lg:col-span-2">
          <PanelLabel icon={Wind}>Wind</PanelLabel>
          {observation?.windSpeedKmh === null || observation?.windSpeedKmh === undefined ? (
            <p className="text-muted-foreground text-sm">Nog geen gegevens ontvangen</p>
          ) : (
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="text-foreground text-4xl font-semibold tracking-tight">
                  {observation.windSpeedKmh}
                  <span className="text-muted-foreground ml-1 text-base font-normal">
                    km/h
                  </span>
                </p>
                <p className="text-muted-foreground mt-1 text-xs">
                  {observation.windDirectionCompass
                    ? `Richting ${observation.windDirectionCompass}`
                    : "Richting onbekend"}
                  {observation.windGustKmh && ` · Stoten ${observation.windGustKmh} km/h`}
                </p>
              </div>
              {hasWindDirection && (
                <div className="border-sky-500/30 bg-background/60 dark:border-sky-400/25 flex h-14 w-14 shrink-0 items-center justify-center rounded-full border">
                  <Navigation
                    className="h-6 w-6 text-sky-600 dark:text-sky-400"
                    // windDirectionDeg is de richting waar de wind VANDAAN komt
                    // (meteorologische conventie) — +180° zodat de pijl wijst
                    // in de richting waar de wind NAARTOE waait (intuïtiever
                    // in één oogopslag dan "waar komt hij vandaan").
                    style={{ transform: `rotate(${observation.windDirectionDeg! + 180}deg)` }}
                    aria-hidden="true"
                  />
                </div>
              )}
            </div>
          )}
        </Panel>

        <Panel tone="regen">
          <PanelLabel icon={CloudRain}>Neerslag</PanelLabel>
          {observation?.rainDayMm === null || observation?.rainDayMm === undefined ? (
            <p className="text-muted-foreground text-sm">Nog geen gegevens ontvangen</p>
          ) : (
            <>
              <p className="text-foreground text-4xl font-semibold tracking-tight">
                {observation.rainDayMm}
                <span className="text-muted-foreground ml-1 text-base font-normal">mm</span>
              </p>
              <p className="text-muted-foreground mt-1 text-xs">
                {isRainingNow
                  ? `Nu: ${observation.rainRateMmH} mm/u`
                  : "Vandaag · geen neerslag nu"}
              </p>
            </>
          )}
        </Panel>

        <Panel tone="atmos" className="lg:col-span-2">
          <PanelLabel icon={Gauge}>Atmosfeer</PanelLabel>
          <div className="grid grid-cols-2 divide-x divide-border/60">
            <div>
              <p className="text-foreground text-2xl font-semibold tracking-tight">
                {observation?.humidityOutdoorPct ?? "—"}
                <span className="text-muted-foreground ml-1 text-sm font-normal">%</span>
              </p>
              <p className="text-muted-foreground mt-1 flex items-center gap-1 text-xs">
                <Droplets className="h-3.5 w-3.5" aria-hidden="true" /> Luchtvochtigheid
              </p>
            </div>
            <div className="pl-4">
              <p className="text-foreground text-2xl font-semibold tracking-tight">
                {observation?.pressureRelativeHpa ?? "—"}
                <span className="text-muted-foreground ml-1 text-sm font-normal">hPa</span>
              </p>
              <p className="text-muted-foreground mt-1 flex items-center gap-1 text-xs">
                <Waves className="h-3.5 w-3.5" aria-hidden="true" /> Luchtdruk
              </p>
            </div>
          </div>
        </Panel>

        <Panel tone="zon">
          <PanelLabel icon={Sun}>Zon</PanelLabel>
          <div className="flex items-baseline gap-4">
            <div>
              <p className="text-foreground text-xl font-semibold tracking-tight">
                {observation?.uvIndex ?? "—"}
              </p>
              <p className="text-muted-foreground text-xs">UV-index</p>
            </div>
            <div>
              <p className="text-foreground text-xl font-semibold tracking-tight">
                {observation?.solarRadiationWm2 ?? "—"}
                <span className="text-muted-foreground ml-1 text-xs font-normal">W/m²</span>
              </p>
              <p className="text-muted-foreground text-xs">Zonnestraling</p>
            </div>
          </div>
        </Panel>
      </div>
    </Container>
  );
}
