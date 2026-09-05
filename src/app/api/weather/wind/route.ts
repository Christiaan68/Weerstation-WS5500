/**
 * Windroos per periode — Fase 3, `/wind`-pagina.
 * `GET /api/weather/wind?period=today|7d|30d`
 *
 * Bewust begrensd tot maximaal 30 dagen — zie
 * `src/lib/weather/wind-service.ts` voor de onderbouwing (windrichting is
 * niet vooraf te aggregeren, dus dit blijft een begrensde live query).
 */
import { NextResponse } from "next/server";

import { getStation } from "@/lib/db/queries";
import {
  getWindRoseOverview,
  WIND_ROSE_PERIODS,
  type WindRosePeriod,
} from "@/lib/weather/wind-service";

export const dynamic = "force-dynamic";

function isWindRosePeriod(value: string): value is WindRosePeriod {
  return (WIND_ROSE_PERIODS as readonly string[]).includes(value);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const periodParam = url.searchParams.get("period") ?? "today";

  if (!isWindRosePeriod(periodParam)) {
    return NextResponse.json(
      { error: `Ongeldige period. Geldige waarden: ${WIND_ROSE_PERIODS.join(", ")}.` },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const station = await getStation(url.searchParams.get("stationSlug") ?? undefined);
    if (!station) {
      return NextResponse.json(
        { error: "Geen (actief) weerstation gevonden." },
        { status: 404, headers: { "Cache-Control": "no-store" } },
      );
    }

    const result = await getWindRoseOverview(station.id, periodParam);

    return NextResponse.json(result, {
      status: 200,
      headers: { "Cache-Control": "public, max-age=0, s-maxage=60" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "onbekende fout";
    console.error("[weather/wind] databasefout:", message);
    return NextResponse.json(
      { error: "Kon windgegevens niet ophalen" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
