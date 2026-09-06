import {
  CloudRain,
  Droplets,
  Gauge,
  Home,
  Navigation,
  Sun,
  Thermometer,
  Umbrella,
  Waves,
  Wind,
} from "lucide-react";
import type { ComponentType, ReactNode } from "react";

import { Container } from "@/components/layout/container";
import {
  AtmosphereArt,
  ComfortArt,
  IndoorArt,
  RainArt,
  SunArt,
  WindArt,
} from "@/components/weather/sensor-card-art";
import { cn } from "@/lib/utils";

/** Zelfde vorm als de `observation`-tak van `/api/weather/current`. */
export interface TechnicalObservation {
  humidityOutdoorPct: string | null;
  pressureRelativeHpa: string | null;
  pressureAbsoluteHpa: string | null;
  windSpeedKmh: string | null;
  windGustKmh: string | null;
  windDirectionDeg: number | null;
  windDirectionCompass: string | null;
  rainDayMm: string | null;
  rainRateMmH: string | null;
  rainEventMm: string | null;
  rainHourMm: string | null;
  rainWeekMm: string | null;
  rainMonthMm: string | null;
  rainYearMm: string | null;
  rainTotalMm: string | null;
  uvIndex: string | null;
  solarRadiationWm2: string | null;
  dewPointC: string | null;
  windChillC: string | null;
  heatIndexC: string | null;
  temperatureIndoorC: string | null;
  humidityIndoorPct: string | null;
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
  comfort:
    "bg-gradient-to-br from-emerald-500/15 via-emerald-500/5 to-transparent border-emerald-500/25 dark:from-emerald-400/10 dark:border-emerald-400/20",
  indoor:
    "bg-gradient-to-br from-rose-500/15 via-rose-500/5 to-transparent border-rose-500/25 dark:from-rose-400/10 dark:border-rose-400/20",
} as const;

const WATERMARK_CLASSES = {
  wind: "text-sky-500",
  regen: "text-cyan-500",
  atmos: "text-violet-500",
  zon: "text-amber-500",
  comfort: "text-emerald-500",
  indoor: "text-rose-500",
} as const;

/** Eén verfijnde, gelaagde illustratie per paneeltype — zie sensor-card-art.tsx. */
const ART_COMPONENT: Record<keyof typeof TONE_CLASSES, ComponentType<{ className?: string }>> = {
  wind: WindArt,
  regen: RainArt,
  atmos: AtmosphereArt,
  zon: SunArt,
  comfort: ComfortArt,
  indoor: IndoorArt,
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
 * De "technische" laag onder de weer-hero: alle sensormetingen van het
 * station, logisch gegroepeerd (i.p.v. één rij identieke witte kaartjes) —
 * wind en regen krijgen meer visueel gewicht (meest actiegericht),
 * luchtvochtigheid en luchtdruk delen één "atmosfeer"-paneel, UV/
 * zonnestraling zijn bewust kleiner en secundair gestyled. Een derde rij
 * vult dit aan met de overige metingen die niet in de hoofdpanelen passen:
 * de losse neerslagperiodes (bui/uur/week/maand/jaar/totaal), afgeleide
 * "gevoels"-waarden (dauwpunt, windchill, hitte-index) en het binnenklimaat
 * (temperatuur/vochtigheid binnen) — bewust kleiner en rustiger gestyled dan
 * de hoofdpanelen, in lijn met hun secundaire belang.
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
                <Waves className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /> Luchtdruk
              </p>
              {observation?.pressureAbsoluteHpa && (
                <p className="text-muted-foreground/70 text-xs">
                  Abs. {observation.pressureAbsoluteHpa} hPa
                </p>
              )}
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

        <Panel tone="regen">
          <PanelLabel icon={Umbrella}>Neerslag — periodes</PanelLabel>
          <div className="grid grid-cols-2 gap-x-3 gap-y-2.5">
            <RainStat label="Deze bui" value={observation?.rainEventMm} />
            <RainStat label="Afgelopen uur" value={observation?.rainHourMm} />
            <RainStat label="Deze week" value={observation?.rainWeekMm} />
            <RainStat label="Deze maand" value={observation?.rainMonthMm} />
            <RainStat label="Dit jaar" value={observation?.rainYearMm} />
            <RainStat label="Totaal" value={observation?.rainTotalMm} />
          </div>
        </Panel>

        <Panel tone="comfort">
          <PanelLabel icon={Thermometer}>Gevoelstemperatuur</PanelLabel>
          <div className="grid grid-cols-2 gap-x-3 gap-y-2.5">
            <RainStat label="Dauwpunt" value={observation?.dewPointC} unit="°" wide />
            <RainStat label="Gevoel wind" value={observation?.windChillC} unit="°" />
            <RainStat label="Hitte-index" value={observation?.heatIndexC} unit="°" />
          </div>
        </Panel>

        <Panel tone="indoor">
          <PanelLabel icon={Home}>Binnenklimaat</PanelLabel>
          <div className="grid grid-cols-2 divide-x divide-border/60">
            <div>
              <p className="text-foreground text-2xl font-semibold tracking-tight">
                {observation?.temperatureIndoorC ?? "—"}
                <span className="text-muted-foreground ml-1 text-sm font-normal">°C</span>
              </p>
              <p className="text-muted-foreground mt-1 text-xs">Temperatuur</p>
            </div>
            <div className="pl-4">
              <p className="text-foreground text-2xl font-semibold tracking-tight">
                {observation?.humidityIndoorPct ?? "—"}
                <span className="text-muted-foreground ml-1 text-sm font-normal">%</span>
              </p>
              <p className="text-muted-foreground mt-1 text-xs">Luchtvochtigheid</p>
            </div>
          </div>
        </Panel>
      </div>
    </Container>
  );
}

/** Compacte label/waarde-cel voor de mini-statgrids (neerslagperiodes, gevoelstemperatuur). */
function RainStat({
  label,
  value,
  unit = "mm",
  wide = false,
}: {
  label: string;
  value: string | null | undefined;
  unit?: string;
  wide?: boolean;
}) {
  return (
    <div className={wide ? "col-span-2" : undefined}>
      <p className="text-foreground text-lg font-semibold tracking-tight">
        {value ?? "—"}
        <span className="text-muted-foreground ml-0.5 text-xs font-normal">{unit}</span>
      </p>
      <p className="text-muted-foreground text-xs">{label}</p>
    </div>
  );
}
