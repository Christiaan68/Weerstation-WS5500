"use client";

import { useEffect, useState } from "react";

import { TechnicalGrid } from "@/components/weather/technical-grid";
import { WeatherHero } from "@/components/weather/weather-hero";
import { determineWeatherScene, type WeatherScene } from "@/lib/weather/condition";

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
  rainRateMmH: string | null;
  uvIndex: string | null;
  solarRadiationWm2: string | null;
}

interface LiveWeatherDashboardProps {
  initialObservation: LiveObservation | null;
  /** Serverzijdig bepaalde scene (zie dashboard/page.tsx) — voorkomt een flits bij de eerste weergave. */
  initialScene: WeatherScene;
  stationSlug: string;
  stationName: string;
  observationCount: number;
  demoModeEnabled: boolean;
  /** Stationcoördinaten (`null` ⇒ condition.ts valt terug op De Bilt). */
  latitude: number | null;
  longitude: number | null;
  initialTodayTemperatureMinC: number | null;
  initialTodayTemperatureMaxC: number | null;
  /** Ververs-interval in milliseconden. 60 seconden past bij het gebruikelijke upload-interval van het station. */
  refreshIntervalMs?: number;
}

function toNumberOrNull(value: string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Client-component die de dashboard-hero + technische sensorlaag toont en
 * elke minuut ververst via `/api/weather/current` — zonder de pagina zelf te
 * herladen. De server-gerenderde `initialObservation`/`initialScene` (uit
 * `src/app/dashboard/page.tsx`) voorkomen een lege/verkeerde eerste
 * weergave; ververvingen ná het eerste render gebeuren volledig
 * client-side, inclusief het herberekenen van de weer-scene (die ook zonder
 * nieuwe meting kan wijzigen — bv. de overgang van dag naar zonsondergang).
 */
export function LiveWeatherDashboard({
  initialObservation,
  initialScene,
  stationSlug,
  stationName,
  observationCount,
  demoModeEnabled,
  latitude,
  longitude,
  initialTodayTemperatureMinC,
  initialTodayTemperatureMaxC,
  refreshIntervalMs = 60_000,
}: LiveWeatherDashboardProps) {
  const [observation, setObservation] = useState<LiveObservation | null>(
    initialObservation,
  );
  const [todayMinC, setTodayMinC] = useState<number | null>(initialTodayTemperatureMinC);
  const [todayMaxC, setTodayMaxC] = useState<number | null>(initialTodayTemperatureMaxC);
  const [scene, setScene] = useState<WeatherScene>(initialScene);
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
        const data: {
          observation: LiveObservation | null;
          todayTemperatureMinC: number | null;
          todayTemperatureMaxC: number | null;
        } = await response.json();
        if (cancelled) return;

        const now = new Date();
        setObservation(data.observation);
        setTodayMinC(data.todayTemperatureMinC);
        setTodayMaxC(data.todayTemperatureMaxC);
        setScene(
          determineWeatherScene({
            now,
            latitude,
            longitude,
            rainRateMmH: toNumberOrNull(data.observation?.rainRateMmH),
            solarRadiationWm2: toNumberOrNull(data.observation?.solarRadiationWm2),
          }).scene,
        );
        setLastCheckedAt(now);
        setIsStale(false);
      } catch {
        if (!cancelled) setIsStale(true);
      }
    }

    const interval = setInterval(refresh, refreshIntervalMs);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [refreshIntervalMs, stationSlug, latitude, longitude]);

  const hasData = Boolean(observation);
  const showDemoBadge = hasData && demoModeEnabled;
  const lastCheckedLabel = lastCheckedAt
    ? `Laatst gecontroleerd om ${lastCheckedAt.toLocaleTimeString("nl-NL", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })}`
    : null;

  return (
    <div className="flex flex-col">
      <WeatherHero
        scene={scene}
        stationName={stationName}
        observationCount={observationCount}
        temperatureOutdoorC={observation?.temperatureOutdoorC ?? null}
        feelsLikeC={observation?.feelsLikeC ?? null}
        todayMinC={todayMinC}
        todayMaxC={todayMaxC}
        lastCheckedLabel={lastCheckedLabel}
        isStale={isStale}
        showDemoBadge={showDemoBadge}
      />
      <TechnicalGrid observation={observation} />
    </div>
  );
}
