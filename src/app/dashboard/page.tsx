import type { Metadata } from "next";

import { LiveWeatherDashboard } from "@/components/weather/live-metrics";
import type { LiveObservation } from "@/components/weather/live-metrics";
import { HistoryChartCard } from "@/components/weather/history-chart-card";
import { Container } from "@/components/layout/container";
import { getLatestObservation, getObservationCount, getStation } from "@/lib/db/queries";
import { publicEnv } from "@/lib/env";
import { determineWeatherScene } from "@/lib/weather/condition";
import { getRecordsForPeriod } from "@/lib/weather/records";
import { degreesToCompass } from "@/lib/weather/units";

export const metadata: Metadata = {
  title: "Dashboard",
  description: "Actueel overzicht van temperatuur, wind, regen en meer.",
};

// Toont de meest recente meting; nooit statisch cachen.
export const dynamic = "force-dynamic";

function toNumberOrNull(value: string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export default async function DashboardPage() {
  const station = await getStation().catch(() => undefined);
  const observation = station
    ? await getLatestObservation(station.id).catch(() => undefined)
    : undefined;
  const observationCount = station
    ? await getObservationCount(station.id).catch(() => 0)
    : 0;
  // Vandaag min/max buitentemperatuur, voor de hero (zie weather-hero.tsx) —
  // hergebruikt dezelfde SQL-side MIN/MAX-query als de Records-pagina.
  const todayRecords = station
    ? await getRecordsForPeriod(station.id, "today").catch(() => undefined)
    : undefined;

  const initialObservation: LiveObservation | null = observation
    ? {
        measuredAt: observation.measuredAt.toISOString(),
        temperatureOutdoorC: observation.temperatureOutdoorC,
        feelsLikeC: observation.feelsLikeC,
        dewPointC: observation.dewPointC,
        humidityOutdoorPct: observation.humidityOutdoorPct,
        pressureRelativeHpa: observation.pressureRelativeHpa,
        windSpeedKmh: observation.windSpeedKmh,
        windGustKmh: observation.windGustKmh,
        windDirectionDeg: observation.windDirectionDeg,
        windDirectionCompass:
          observation.windDirectionDeg !== null
            ? degreesToCompass(observation.windDirectionDeg)
            : null,
        rainDayMm: observation.rainDayMm,
        rainRateMmH: observation.rainRateMmH,
        uvIndex: observation.uvIndex,
        solarRadiationWm2: observation.solarRadiationWm2,
      }
    : null;

  const latitude = station?.latitude !== null && station?.latitude !== undefined
    ? Number(station.latitude)
    : null;
  const longitude = station?.longitude !== null && station?.longitude !== undefined
    ? Number(station.longitude)
    : null;

  // Serverzijdig bepaald zodat de allereerste weergave meteen de juiste
  // achtergrond toont (geen flits van een verkeerde scene ná hydratie) — zie
  // src/lib/weather/condition.ts. De client-component (live-metrics.tsx)
  // herberekent dit bij elke ververing met de dan actuele tijd/meting.
  const initialScene = determineWeatherScene({
    now: new Date(),
    latitude,
    longitude,
    rainRateMmH: toNumberOrNull(initialObservation?.rainRateMmH),
    solarRadiationWm2: toNumberOrNull(initialObservation?.solarRadiationWm2),
    temperatureOutdoorC: toNumberOrNull(initialObservation?.temperatureOutdoorC),
    humidityOutdoorPct: toNumberOrNull(initialObservation?.humidityOutdoorPct),
    dewPointC: toNumberOrNull(initialObservation?.dewPointC),
  });

  return (
    <>
      {station && (
        <LiveWeatherDashboard
          initialObservation={initialObservation}
          initialScene={initialScene.scene}
          stationSlug={station.slug}
          stationName={station.name}
          observationCount={observationCount}
          demoModeEnabled={publicEnv.NEXT_PUBLIC_DEMO_MODE}
          latitude={latitude}
          longitude={longitude}
          initialTodayTemperatureMinC={todayRecords?.records.temperatureMinC?.value ?? null}
          initialTodayTemperatureMaxC={todayRecords?.records.temperatureMaxC?.value ?? null}
        />
      )}

      <Container className="flex flex-1 flex-col gap-6 pb-10">
        {!station && (
          <p className="text-muted-foreground py-10 text-center text-sm">
            Er is nog geen station geconfigureerd.
          </p>
        )}
        {station && (
          <HistoryChartCard
            stationSlug={station.slug}
            metrics={["temperatureOutdoorC", "feelsLikeC", "dewPointC"]}
            period="24h"
            title="Laatste 24 uur"
            description="Temperatuur, gevoelstemperatuur en dauwpunt."
          />
        )}
      </Container>
    </>
  );
}
