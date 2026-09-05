/**
 * Actuele weergegevens voor de website zelf (dashboard-auto-refresh — zie
 * `src/components/weather/live-metrics.tsx`). Geen publieke, gedocumenteerde
 * API voor extern gebruik (dat is expliciet buiten scope voor Fase 2).
 */
import { NextResponse } from "next/server";

import { getLatestObservation, getStation } from "@/lib/db/queries";
import { degreesToCompass } from "@/lib/weather/units";

export const dynamic = "force-dynamic";

interface CurrentWeatherResponse {
  station: { name: string; slug: string } | null;
  observation: {
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
  } | null;
}

export async function GET(request: Request) {
  const slug = new URL(request.url).searchParams.get("slug") ?? undefined;

  try {
    const station = await getStation(slug);
    const observation = station ? await getLatestObservation(station.id) : undefined;

    const body: CurrentWeatherResponse = {
      station: station ? { name: station.name, slug: station.slug } : null,
      observation: observation
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
        : null,
    };

    return NextResponse.json(body, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "onbekende fout";
    console.error("[weather/current] databasefout:", message);
    return NextResponse.json(
      { error: "Kon actuele gegevens niet ophalen" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
