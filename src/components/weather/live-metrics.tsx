"use client";

import {
  CloudRain,
  Droplets,
  Gauge,
  Sun,
  Sunrise,
  Thermometer,
  Wind,
} from "lucide-react";
import { useEffect, useState } from "react";

import { MetricCard } from "@/components/dashboard/metric-card";
import { Badge } from "@/components/ui/badge";

/** Zelfde vorm als de `observation`-tak van `/api/weather/current`. */
export interface LiveObservation {
  measuredAt: string;
  temperatureOutdoorC: string | null;
  feelsLikeC: string | null;
  humidityOutdoorPct: string | null;
  pressureRelativeHpa: string | null;
  windSpeedKmh: string | null;
  windGustKmh: string | null;
  windDirectionDeg: number | null;
  windDirectionCompass: string | null;
  rainDayMm: string | null;
  uvIndex: string | null;
  solarRadiationWm2: string | null;
}

interface LiveWeatherDashboardProps {
  initialObservation: LiveObservation | null;
  stationSlug: string;
  demoModeEnabled: boolean;
  /** Ververs-interval in milliseconden. 60 seconden past bij het gebruikelijke upload-interval van het station. */
  refreshIntervalMs?: number;
}

/**
 * Client-component die de dashboardkaarten toont en elke minuut ververst via
 * `/api/weather/current` — zonder de pagina zelf te herladen. De
 * server-gerenderde `initialObservation` (uit `src/app/dashboard/page.tsx`)
 * voorkomt een lege eerste weergave/hydration-mismatch; ververvingen
 * ná het eerste render gebeuren volledig client-side.
 */
export function LiveWeatherDashboard({
  initialObservation,
  stationSlug,
  demoModeEnabled,
  refreshIntervalMs = 60_000,
}: LiveWeatherDashboardProps) {
  const [observation, setObservation] = useState<LiveObservation | null>(
    initialObservation,
  );
  const [lastCheckedAt, setLastCheckedAt] = useState<Date | null>(null);
  const [isStale, setIsStale] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function refresh() {
      try {
        const response = await fetch(
          `/api/weather/current?slug=${encodeURIComponent(stationSlug)}`,
          { cache: "no-store" },
        );
        if (!response.ok || cancelled) {
          if (!cancelled) setIsStale(true);
          return;
        }
        const data: { observation: LiveObservation | null } = await response.json();
        if (!cancelled) {
          setObservation(data.observation);
          setLastCheckedAt(new Date());
          setIsStale(false);
        }
      } catch {
        if (!cancelled) setIsStale(true);
      }
    }

    const interval = setInterval(refresh, refreshIntervalMs);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [refreshIntervalMs, stationSlug]);

  const hasData = Boolean(observation);
  const showDemoBadge = hasData && demoModeEnabled;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        {showDemoBadge && <Badge variant="warning">Demo-gegevens</Badge>}
        {lastCheckedAt && (
          <span className="text-muted-foreground text-xs">
            Laatst gecontroleerd om{" "}
            {lastCheckedAt.toLocaleTimeString("nl-NL", {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            })}
            {isStale && " · verversen mislukt, vorige gegevens getoond"}
          </span>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        <MetricCard
          icon={Thermometer}
          label="Temperatuur"
          value={observation?.temperatureOutdoorC ?? null}
          unit="°C"
          secondaryLine={
            observation?.feelsLikeC
              ? `Gevoelstemperatuur ${observation.feelsLikeC} °C`
              : null
          }
        />
        <MetricCard
          icon={Droplets}
          label="Luchtvochtigheid"
          value={observation?.humidityOutdoorPct ?? null}
          unit="%"
        />
        <MetricCard
          icon={Gauge}
          label="Luchtdruk"
          value={observation?.pressureRelativeHpa ?? null}
          unit="hPa"
        />
        <MetricCard
          icon={Wind}
          label="Wind"
          value={observation?.windSpeedKmh ?? null}
          unit="km/h"
          secondaryLine={
            observation?.windDirectionCompass
              ? `Richting ${observation.windDirectionCompass}${
                  observation?.windGustKmh
                    ? ` · Windstoten ${observation.windGustKmh} km/h`
                    : ""
                }`
              : null
          }
        />
        <MetricCard
          icon={CloudRain}
          label="Regen"
          value={observation?.rainDayMm ?? null}
          unit="mm"
          secondaryLine="Vandaag"
        />
        <MetricCard icon={Sun} label="UV" value={observation?.uvIndex ?? null} unit="" />
        <MetricCard
          icon={Sunrise}
          label="Zonnestraling"
          value={observation?.solarRadiationWm2 ?? null}
          unit="W/m²"
        />
      </div>
    </div>
  );
}
