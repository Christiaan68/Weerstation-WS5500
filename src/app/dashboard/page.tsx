import type { Metadata } from "next";

import { LiveWeatherDashboard } from "@/components/weather/live-metrics";
import type { LiveObservation } from "@/components/weather/live-metrics";
import { HistoryChartCard } from "@/components/weather/history-chart-card";
import { Container } from "@/components/layout/container";
import { PageHeader } from "@/components/layout/page-header";
import { getLatestObservation, getObservationCount, getStation } from "@/lib/db/queries";
import { publicEnv } from "@/lib/env";
import { degreesToCompass } from "@/lib/weather/units";

export const metadata: Metadata = {
  title: "Dashboard",
  description: "Actueel overzicht van temperatuur, wind, regen en meer.",
};

// Toont de meest recente meting; nooit statisch cachen.
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const station = await getStation().catch(() => undefined);
  const observation = station
    ? await getLatestObservation(station.id).catch(() => undefined)
    : undefined;
  const observationCount = station
    ? await getObservationCount(station.id).catch(() => 0)
    : 0;

  const initialObservation: LiveObservation | null = observation
    ? {
        measuredAt: observation.measuredAt.toISOString(),
        temperatureOutdoorC: observation.temperatureOutdoorC,
        feelsLikeC: observation.feelsLikeC,
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
        uvIndex: observation.uvIndex,
        solarRadiationWm2: observation.solarRadiationWm2,
      }
    : null;

  return (
    <Container className="flex flex-1 flex-col gap-6 py-10">
      <PageHeader
        title="Dashboard"
        description={
          station
            ? `Actuele metingen van ${station.name}${
                observationCount > 0
                  ? ` · ${observationCount.toLocaleString("nl-NL")} metingen in de database`
                  : ""
              }`
            : "Er is nog geen station geconfigureerd."
        }
      />

      {station && (
        <>
          <LiveWeatherDashboard
            initialObservation={initialObservation}
            stationSlug={station.slug}
            demoModeEnabled={publicEnv.NEXT_PUBLIC_DEMO_MODE}
          />
          <HistoryChartCard
            stationSlug={station.slug}
            metrics={["temperatureOutdoorC", "feelsLikeC", "dewPointC"]}
            period="24h"
            title="Laatste 24 uur"
            description="Temperatuur, gevoelstemperatuur en dauwpunt."
          />
        </>
      )}
    </Container>
  );
}
