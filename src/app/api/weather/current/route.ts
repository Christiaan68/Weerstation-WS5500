/**
 * Actuele weergegevens voor de website zelf (dashboard-auto-refresh — zie
 * `src/components/weather/live-metrics.tsx`). Geen publieke, gedocumenteerde
 * API voor extern gebruik (dat is expliciet buiten scope voor Fase 2).
 */
import { NextResponse } from "next/server";

import { getLatestObservation, getStation } from "@/lib/db/queries";
import { getRecordsForPeriod } from "@/lib/weather/records";
import { degreesToCompass } from "@/lib/weather/units";

export const dynamic = "force-dynamic";

interface CurrentWeatherResponse {
  station: { name: string; slug: string } | null;
  observation: {
    measuredAt: string;
    temperatureOutdoorC: string | null;
    feelsLikeC: string | null;
    dewPointC: string | null;
    windChillC: string | null;
    heatIndexC: string | null;
    temperatureIndoorC: string | null;
    humidityOutdoorPct: string | null;
    humidityIndoorPct: string | null;
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
  } | null;
  /**
   * Hoogste/laagste buitentemperatuur van vandaag (lokale kalenderdag) — voor
   * de dashboard-hero (`weather-hero.tsx`). `null` zolang er nog geen
   * metingen zijn; NIET hetzelfde als `observation.temperatureOutdoorC`
   * (dat is de huidige waarde, dit is het bereik van de hele dag).
   */
  todayTemperatureMinC: number | null;
  todayTemperatureMaxC: number | null;
}

export async function GET(request: Request) {
  const slug = new URL(request.url).searchParams.get("slug") ?? undefined;

  try {
    const station = await getStation(slug);
    const observation = station ? await getLatestObservation(station.id) : undefined;
    const todayRecords = station
      ? await getRecordsForPeriod(station.id, "today")
      : undefined;

    const body: CurrentWeatherResponse = {
      station: station ? { name: station.name, slug: station.slug } : null,
      observation: observation
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
        : null,
      todayTemperatureMinC: todayRecords?.records.temperatureMinC?.value ?? null,
      todayTemperatureMaxC: todayRecords?.records.temperatureMaxC?.value ?? null,
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
