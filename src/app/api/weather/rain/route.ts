/**
 * Regenoverzicht per periode — Fase 3, `/rain`-pagina.
 * `GET /api/weather/rain?period=today|week|month|year`
 */
import { NextResponse } from "next/server";

import { getStation } from "@/lib/db/queries";
import {
  getRainOverview,
  RAIN_PERIODS,
  type RainPeriod,
} from "@/lib/weather/rain-service";

export const dynamic = "force-dynamic";

function isRainPeriod(value: string): value is RainPeriod {
  return (RAIN_PERIODS as readonly string[]).includes(value);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const periodParam = url.searchParams.get("period") ?? "today";

  if (!isRainPeriod(periodParam)) {
    return NextResponse.json(
      { error: `Ongeldige period. Geldige waarden: ${RAIN_PERIODS.join(", ")}.` },
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

    const result = await getRainOverview(station.id, periodParam);

    return NextResponse.json(result, {
      status: 200,
      headers: { "Cache-Control": "public, max-age=0, s-maxage=60" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "onbekende fout";
    console.error("[weather/rain] databasefout:", message);
    return NextResponse.json(
      { error: "Kon regengegevens niet ophalen" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
