/**
 * Records (min/max + tijdstip) per periode — Fase 3, `/records`-pagina.
 * `GET /api/weather/records?period=today|month|year|all&offset=0`
 *
 * `offset` (Fase 4.4): aantal vensters terug vanaf nu, voor de terug/vooruit-
 * navigatie op de pagina — 0 (of weggelaten) is de huidige periode; genegeerd
 * bij `period=all` (er is maar één "all-time").
 */
import { NextResponse } from "next/server";

import { getStation } from "@/lib/db/queries";
import {
  getRecordsForPeriod,
  isRecordsPeriod,
  RECORD_PERIODS,
} from "@/lib/weather/records";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const periodParam = url.searchParams.get("period") ?? "today";

  if (!isRecordsPeriod(periodParam)) {
    return NextResponse.json(
      { error: `Ongeldige period. Geldige waarden: ${RECORD_PERIODS.join(", ")}.` },
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

    const offsetParam = url.searchParams.get("offset");
    const parsedOffset = offsetParam === null ? 0 : Number.parseInt(offsetParam, 10);
    const offset = Number.isFinite(parsedOffset) && parsedOffset > 0 ? parsedOffset : 0;

    const result = await getRecordsForPeriod(station.id, periodParam, offset);

    return NextResponse.json(result, {
      status: 200,
      headers: { "Cache-Control": "public, max-age=0, s-maxage=60" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "onbekende fout";
    console.error("[weather/records] databasefout:", message);
    return NextResponse.json(
      { error: "Kon records niet ophalen" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
