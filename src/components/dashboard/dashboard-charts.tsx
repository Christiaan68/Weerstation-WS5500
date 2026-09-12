"use client";

import { useMemo, useState } from "react";

import { HistoryChartCard } from "@/components/weather/history-chart-card";
import { PeriodNavigator } from "@/components/weather/period-navigator";
import type { StationCapabilities } from "@/lib/weather/capabilities";
import {
  addDaysToDateKey,
  formatLocalDateLong,
  getLocalDayBoundsUtc,
  todayLocalDateKey,
} from "@/lib/weather/timezone";

interface DashboardChartsProps {
  stationSlug: string;
  timeZone: string;
  capabilities: StationCapabilities;
}

/**
 * Grafiekensectie van het dashboard, met dezelfde terug/vooruit-dagnavigatie
 * als Regen/Wind/Grafieken/Records (zie `period-navigator.tsx`). `offset`
 * (0 = vandaag) bepaalt welke lokale kalenderdag alle kaarten tonen — elke
 * `HistoryChartCard` krijgt dezelfde `dayOffset` mee, zodat ze altijd in sync
 * blijven.
 */
export function DashboardCharts({ stationSlug, timeZone, capabilities }: DashboardChartsProps) {
  const [offset, setOffset] = useState(0);

  const rangeLabel = useMemo(() => {
    const dateKey = addDaysToDateKey(todayLocalDateKey(timeZone), -offset);
    return formatLocalDateLong(getLocalDayBoundsUtc(dateKey, timeZone).startUtc, timeZone);
  }, [timeZone, offset]);

  const hasAnyChart =
    capabilities.hasOutdoorTemperature ||
    capabilities.hasIndoorTemperature ||
    capabilities.hasHumidityOutdoor ||
    capabilities.hasHumidityIndoor ||
    capabilities.hasPressure ||
    capabilities.hasWind ||
    capabilities.hasRain ||
    capabilities.hasUV ||
    capabilities.hasSolar;

  if (!hasAnyChart) {
    return null;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-muted-foreground text-sm font-semibold tracking-wide uppercase">
          Grafieken — {rangeLabel}
        </h2>
        <PeriodNavigator
          label={rangeLabel}
          onBack={() => setOffset((o) => o + 1)}
          onForward={() => setOffset((o) => Math.max(0, o - 1))}
          forwardDisabled={offset === 0}
        />
      </div>

      {capabilities.hasOutdoorTemperature && (
        <HistoryChartCard
          stationSlug={stationSlug}
          timeZone={timeZone}
          dayOffset={offset}
          showLatestMeasurementTime
          metricGroups={[
            ["temperatureOutdoorC", "feelsLikeC", "dewPointC", "windChillC", "heatIndexC"],
          ]}
          title="Temperatuur"
          description="Buitentemperatuur, gevoelstemperatuur, dauwpunt, windchill en hitte-index."
        />
      )}
      {capabilities.hasIndoorTemperature && (
        <HistoryChartCard
          stationSlug={stationSlug}
          timeZone={timeZone}
          dayOffset={offset}
          metricGroups={[["temperatureIndoorC"]]}
          title="Binnentemperatuur"
          description="Temperatuur binnenshuis."
        />
      )}
      {(capabilities.hasHumidityOutdoor ||
        capabilities.hasHumidityIndoor ||
        capabilities.hasPressure) && (
        <HistoryChartCard
          stationSlug={stationSlug}
          timeZone={timeZone}
          dayOffset={offset}
          metricGroups={[
            ["humidityOutdoorPct", "humidityIndoorPct"],
            ["pressureRelativeHpa", "pressureAbsoluteHpa"],
          ]}
          groupLabels={["Luchtvochtigheid (buiten/binnen)", "Luchtdruk"]}
          title="Atmosfeer"
          description="Luchtvochtigheid en luchtdruk — twee aparte schalen, want % en hPa lopen te ver uiteen voor één grafiek."
        />
      )}
      {capabilities.hasWind && (
        <HistoryChartCard
          stationSlug={stationSlug}
          timeZone={timeZone}
          dayOffset={offset}
          metricGroups={[["windSpeedKmh", "windGustKmh"]]}
          title="Wind"
          description="Windsnelheid en windstoten."
        />
      )}
      {capabilities.hasRain && (
        <HistoryChartCard
          stationSlug={stationSlug}
          timeZone={timeZone}
          dayOffset={offset}
          metricGroups={[["rainRateMmH"]]}
          title="Neerslag"
          description="Regenintensiteit."
        />
      )}
      {(capabilities.hasUV || capabilities.hasSolar) && (
        <HistoryChartCard
          stationSlug={stationSlug}
          timeZone={timeZone}
          dayOffset={offset}
          metricGroups={[["uvIndex", "solarRadiationWm2"]]}
          title="Zon"
          description="UV-index en zonnestraling."
        />
      )}
    </div>
  );
}
