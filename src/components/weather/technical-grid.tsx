import { CloudRain, Gauge, Home, Navigation, Sun, Thermometer, Wind } from "lucide-react";
import type { ComponentType, ReactNode } from "react";

import { DashboardWindRose } from "@/components/dashboard/dashboard-wind-rose";
import { Container } from "@/components/layout/container";
import {
  AtmosphereArt,
  ComfortArt,
  IndoorArt,
  RainArt,
  SunArt,
  WindArt,
} from "@/components/weather/sensor-card-art";
import type { StationCapabilities } from "@/lib/weather/capabilities";
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
        "relative overflow-hidden rounded-xl border p-3 sm:p-4",
        TONE_CLASSES[tone],
        className,
      )}
    >
      <Art
        className={cn(
          "pointer-events-none absolute -right-5 -bottom-5 h-24 w-24 opacity-[0.12]",
          WATERMARK_CLASSES[tone],
        )}
      />
      <div className="relative">{children}</div>
    </div>
  );
}

function PanelLabel({ icon: Icon, children }: { icon: typeof Wind; children: ReactNode }) {
  return (
    <div className="text-muted-foreground mb-2 flex items-center gap-1.5 text-xs font-medium sm:text-sm">
      <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
      {children}
    </div>
  );
}

/** Eén label/waarde-regel in de compacte lijstpanelen (atmosfeer, zon, gevoel, binnen). */
function StatRow({
  label,
  value,
  unit,
}: {
  label: string;
  value: string | null | undefined;
  unit?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="text-foreground text-sm font-semibold whitespace-nowrap tabular-nums">
        {value ?? "—"}
        {unit && <span className="text-muted-foreground ml-0.5 text-xs font-normal">{unit}</span>}
      </dd>
    </div>
  );
}

/** Compacte label-onder-waarde-cel voor de neerslagperiodes. */
function PeriodStat({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <p className="text-foreground text-sm font-semibold tabular-nums">
        {value ?? "—"}
        <span className="text-muted-foreground ml-0.5 text-xs font-normal">mm</span>
      </p>
      <p className="text-muted-foreground text-xs">{label}</p>
    </div>
  );
}

/**
 * De "technische" laag onder de weer-hero: alle sensormetingen van het
 * station, compact bij elkaar. Zes panelen (de twee neerslagpanelen zijn
 * samengevoegd) in een raster van 2 kolommen op de telefoon en 4 kolommen
 * vanaf `sm`:
 *
 *  - Wind (2 breed, 2 hoog op `sm`+): snelheid, richting, stoten + windroos.
 *  - Neerslag (2 breed): vandaag + de losse periodes (bui/uur/week/…).
 *  - Atmosfeer, Zon: 1 breed, als korte label/waarde-lijsten.
 *  - Gevoelstemperatuur, Binnenklimaat: 1 breed op de telefoon, 2 breed op `sm`+.
 */
export function TechnicalGrid({
  observation,
  capabilities,
  stationSlug,
}: {
  observation: TechnicalObservation | null;
  /**
   * Fase 5.2: welke panelen relevant zijn voor DIT station — een station
   * zonder regenmeter toont het "Neerslag"-paneel dan helemaal niet, in
   * plaats van voor altijd "Nog geen gegevens ontvangen" te tonen (dat zou
   * een sensordefect suggereren i.p.v. "deze sensor bestaat niet hier").
   * Optioneel + standaard alles tonen, zodat een aanroeper zonder bekende
   * capabilities (nog) hetzelfde gedrag houdt als vóór Fase 5.2.
   */
  capabilities?: StationCapabilities;
  /** Voor de windroos in het windpaneel; zonder slug wordt er geen roos getoond. */
  stationSlug?: string;
}) {
  const hasWindDirection =
    observation?.windDirectionDeg !== null && observation?.windDirectionDeg !== undefined;
  const isRainingNow =
    observation?.rainRateMmH !== null &&
    observation?.rainRateMmH !== undefined &&
    Number(observation.rainRateMmH) > 0;

  const showWind = capabilities?.hasWind ?? true;
  const showRain = capabilities?.hasRain ?? true;
  const showAtmosphere = capabilities
    ? capabilities.hasHumidityOutdoor || capabilities.hasPressure
    : true;
  const showSun = capabilities ? capabilities.hasUV || capabilities.hasSolar : true;
  const showComfort = capabilities?.hasOutdoorTemperature ?? true;
  const showIndoor = capabilities
    ? capabilities.hasIndoorTemperature || capabilities.hasHumidityIndoor
    : true;

  if (!showWind && !showRain && !showAtmosphere && !showSun && !showComfort && !showIndoor) {
    return null;
  }

  return (
    <Container className="flex flex-col gap-3 pt-5 sm:gap-4 sm:pt-6">
      <h2 className="text-muted-foreground text-sm font-semibold tracking-wide uppercase">
        Sensormetingen
      </h2>

      <div className="grid grid-cols-2 gap-2.5 sm:grid-flow-dense sm:grid-cols-4 sm:gap-3">
        {showWind && (
          <Panel tone="wind" className="col-span-2 sm:row-span-2">
            <PanelLabel icon={Wind}>Wind</PanelLabel>
            {observation?.windSpeedKmh === null || observation?.windSpeedKmh === undefined ? (
              <p className="text-muted-foreground text-sm">Nog geen gegevens ontvangen</p>
            ) : (
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-foreground text-3xl font-semibold tracking-tight">
                    {observation.windSpeedKmh}
                    <span className="text-muted-foreground ml-1 text-sm font-normal">km/h</span>
                  </p>
                  <p className="text-muted-foreground mt-0.5 text-xs">
                    {observation.windDirectionCompass
                      ? `Richting ${observation.windDirectionCompass}`
                      : "Richting onbekend"}
                    {observation.windGustKmh && ` · Stoten ${observation.windGustKmh} km/h`}
                  </p>
                </div>
                {hasWindDirection && (
                  <div className="border-sky-500/30 bg-background/60 dark:border-sky-400/25 flex h-11 w-11 shrink-0 items-center justify-center rounded-full border">
                    <Navigation
                      className="h-5 w-5 text-sky-600 dark:text-sky-400"
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
            {stationSlug && (
              <div className="border-sky-500/20 mt-3 border-t pt-3">
                <DashboardWindRose stationSlug={stationSlug} />
              </div>
            )}
          </Panel>
        )}

        {showRain && (
          <Panel tone="regen" className="col-span-2">
            <PanelLabel icon={CloudRain}>Neerslag</PanelLabel>
            {observation?.rainDayMm === null || observation?.rainDayMm === undefined ? (
              <p className="text-muted-foreground text-sm">Nog geen gegevens ontvangen</p>
            ) : (
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-foreground text-3xl font-semibold tracking-tight">
                  {observation.rainDayMm}
                  <span className="text-muted-foreground ml-1 text-sm font-normal">mm</span>
                </p>
                <p className="text-muted-foreground text-right text-xs">
                  {isRainingNow ? `Nu: ${observation.rainRateMmH} mm/u` : "Vandaag · geen neerslag nu"}
                </p>
              </div>
            )}
            <div className="border-cyan-500/20 mt-3 grid grid-cols-3 gap-x-3 gap-y-2 border-t pt-3">
              <PeriodStat label="Deze bui" value={observation?.rainEventMm} />
              <PeriodStat label="Afgelopen uur" value={observation?.rainHourMm} />
              <PeriodStat label="Deze week" value={observation?.rainWeekMm} />
              <PeriodStat label="Deze maand" value={observation?.rainMonthMm} />
              <PeriodStat label="Dit jaar" value={observation?.rainYearMm} />
              <PeriodStat label="Totaal" value={observation?.rainTotalMm} />
            </div>
          </Panel>
        )}

        {showAtmosphere && (
          <Panel tone="atmos">
            <PanelLabel icon={Gauge}>Atmosfeer</PanelLabel>
            <dl className="flex flex-col gap-1.5">
              <StatRow label="Vochtigheid" value={observation?.humidityOutdoorPct} unit="%" />
              <StatRow label="Luchtdruk" value={observation?.pressureRelativeHpa} unit="hPa" />
              {observation?.pressureAbsoluteHpa && (
                <StatRow label="Abs. druk" value={observation.pressureAbsoluteHpa} />
              )}
            </dl>
          </Panel>
        )}

        {showSun && (
          <Panel tone="zon">
            <PanelLabel icon={Sun}>Zon</PanelLabel>
            <dl className="flex flex-col gap-1.5">
              <StatRow label="UV-index" value={observation?.uvIndex} />
              <StatRow label="Straling" value={observation?.solarRadiationWm2} unit="W/m²" />
            </dl>
          </Panel>
        )}

        {showComfort && (
          <Panel tone="comfort" className="sm:col-span-2">
            <PanelLabel icon={Thermometer}>Gevoelstemperatuur</PanelLabel>
            <dl className="flex flex-col gap-1.5">
              <StatRow label="Dauwpunt" value={observation?.dewPointC} unit="°" />
              <StatRow label="Gevoel wind" value={observation?.windChillC} unit="°" />
              <StatRow label="Hitte-index" value={observation?.heatIndexC} unit="°" />
            </dl>
          </Panel>
        )}

        {showIndoor && (
          <Panel tone="indoor" className="sm:col-span-2">
            <PanelLabel icon={Home}>Binnenklimaat</PanelLabel>
            <dl className="flex flex-col gap-1.5">
              <StatRow label="Temperatuur" value={observation?.temperatureIndoorC} unit="°C" />
              <StatRow label="Vochtigheid" value={observation?.humidityIndoorPct} unit="%" />
            </dl>
          </Panel>
        )}
      </div>
    </Container>
  );
}
