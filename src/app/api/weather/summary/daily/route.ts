/**
 * Dagsamenvattingen binnen een lokaal-datumbereik — Fase 3, gebruikt door
 * `/history` en `/charts` voor tabellen/staafgrafieken op dagniveau.
 * `GET /api/weather/summary/daily?from=2026-08-01&to=2026-08-31`
 */
import { NextResponse } from "next/server";
import { z } from "zod";

import { getStation, listDailySummaries } from "@/lib/db/queries";
import { todayLocalDateKey } from "@/lib/weather/timezone";

export const dynamic = "force-dynamic";

const LOCAL_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

const querySchema = z.object({
  from: z.string().regex(LOCAL_DATE_REGEX, "from moet YYYY-MM-DD zijn").optional(),
  to: z.string().regex(LOCAL_DATE_REGEX, "to moet YYYY-MM-DD zijn").optional(),
  station: z.string().optional(),
});

export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams.entries()));

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Ongeldige queryparameters", details: parsed.error.issues },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const station = await getStation(parsed.data.station);
    if (!station) {
      return NextResponse.json(
        { error: "Geen (actief) weerstation gevonden." },
        { status: 404, headers: { "Cache-Control": "no-store" } },
      );
    }

    // Fase 5: "vandaag" (bij weglaten van from/to) is de lokale dag VAN DIT
    // station, niet een globale aanname.
    const today = todayLocalDateKey(station.timezone);
    const to = parsed.data.to ?? today;
    const from = parsed.data.from ?? to;

    const rows = await listDailySummaries(station.id, from, to);

    return NextResponse.json(
      { from, to, days: rows },
      { status: 200, headers: { "Cache-Control": "public, max-age=0, s-maxage=60" } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "onbekende fout";
    console.error("[weather/summary/daily] databasefout:", message);
    return NextResponse.json(
      { error: "Kon dagsamenvattingen niet ophalen" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
