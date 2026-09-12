import type { Metadata } from "next";

import { LiveWeatherDashboard } from "@/components/weather/live-metrics";
import type { LiveObservation } from "@/components/weather/live-metrics";
import { DashboardCharts } from "@/components/dashboard/dashboard-charts";
import { Container } from "@/components/layout/container";
import { getLatestObservation, getObservationCount, getStation } from "@/lib/db/queries";
import { publicEnv } from "@/lib/env";
import { EMPTY_CAPABILITIES, getStationCapabilities } from "@/lib/weather/capabilities";
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

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ station?: string }>;
}) {
  const { station: stationParam } = await searchParams;
  const station = await getStation(stationParam).catch(() => undefined);
  const observation = station
    ? await getLatestObservation(station.id).catch(() => undefined)
    : undefined;
  const observationCount = station
    ? await getObservationCount(station.id).catch(() => 0)
    : 0;
  // Vandaag min/max buitentemperatuur, voor de hero (zie weather-hero.tsx) —
  // hergebruikt dezelfde SQL-side MIN/MAX-query als de Records-pagina.
  // Fase 5: in de tijdzone VAN DIT station.
  const todayRecords = station
    ? await getRecordsForPeriod(station.id, "today", 0, new Date(), station.timezone).catch(
        () => undefined,
      )
    : undefined;
  // Fase 5.2: welke sensorkaarten relevant zijn voor DIT station — zie
  // src/lib/weather/capabilities.ts. `EMPTY_CAPABILITIES` (alles `false`)
  // zonder station betekent gewoon: niets te tonen, geen fout.
  const capabilities = station
    ? await getStationCapabilities(station.id)
    : EMPTY_CAPABILITIES;

  const initialObservation: LiveObservation | null = observation
    ? {
        measuredAt: observation.measuredAt.toISOString(),
        temperatureOutdoorC: observation.temperatureOutdoorC,
        feelsLikeC: observation.feelsLikeC,
        dewPointC: observation.dewPointC,
        windChillC: observation.windChillC,
        heatIndexC: observation.heatIndexC,
        temperatureIndoorC: observation.temperatureIndoorC,
        humidityOutdoorPct: observation.humidityOutdoorPct,
        humidityIndoorPct: observation.humidityIndoorPct,
        pressureRelativeHpa: observation.pressureRelativeHpa,
        pressureAbsoluteHpa: observation.pressureAbsoluteHpa,
        windSpeedKmh: observation.windSpeedKmh,
        windGustKmh: observation.windGustKmh,
        windDirectionDeg: observation.windDirectionDeg,
        windDirectionCompass:
          observation.windDirectionDeg !== null
            ? degreesToCompass(observation.windDirectionDeg)
            : null,
        rainDayMm: observation.rainDayMm,
        rainRateMmH: observation.rainRateMmH,
        rainEventMm: observation.rainEventMm,
        rainHourMm: observation.rainHourMm,
        rainWeekMm: observation.rainWeekMm,
        rainMonthMm: observation.rainMonthMm,
        rainYearMm: observation.rainYearMm,
        rainTotalMm: observation.rainTotalMm,
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
          stationName={station.displayName}
          observationCount={observationCount}
          demoModeEnabled={publicEnv.NEXT_PUBLIC_DEMO_MODE}
          latitude={latitude}
          longitude={longitude}
          initialTodayTemperatureMinC={todayRecords?.records.temperatureMinC?.value ?? null}
          initialTodayTemperatureMaxC={todayRecords?.records.temperatureMaxC?.value ?? null}
          capabilities={capabilities}
        />
      )}

      <Container className="flex flex-1 flex-col gap-6 pb-10">
        {!station && (
          <p className="text-muted-foreground py-10 text-center text-sm">
            Er is nog geen station geconfigureerd.
          </p>
        )}
        {station && (
          <DashboardCharts
            stationSlug={station.slug}
            timeZone={station.timezone}
            capabilities={capabilities}
          />
        )}
      </Container>
    </>
  );
}
