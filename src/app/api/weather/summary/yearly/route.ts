/**
 * Alle jaarsamenvattingen van het station — Fase 3, gebruikt door
 * `/history` en `/records` (all-time-overzicht per jaar).
 * `GET /api/weather/summary/yearly`
 */
import { NextResponse } from "next/server";

import { getStation, listYearlySummaries } from "@/lib/db/queries";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);

  try {
    const station = await getStation(url.searchParams.get("stationSlug") ?? undefined);
    if (!station) {
      return NextResponse.json(
        { error: "Geen (actief) weerstation gevonden." },
        { status: 404, headers: { "Cache-Control": "no-store" } },
      );
    }

    const rows = await listYearlySummaries(station.id);

    return NextResponse.json(
      { years: rows },
      { status: 200, headers: { "Cache-Control": "public, max-age=0, s-maxage=60" } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "onbekende fout";
    console.error("[weather/summary/yearly] databasefout:", message);
    return NextResponse.json(
      { error: "Kon jaarsamenvattingen niet ophalen" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
