/**
 * Maandsamenvattingen van een jaar — Fase 3, gebruikt door `/history` en
 * `/charts` (jaaroverzicht per maand).
 * `GET /api/weather/summary/monthly?year=2026`
 */
import { NextResponse } from "next/server";
import { z } from "zod";

import { getStation, listMonthlySummariesForYear } from "@/lib/db/queries";
import { getLocalYearMonth } from "@/lib/weather/timezone";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100).optional(),
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

    // Fase 5: het huidige jaar (bij weglaten van `year`) is bepaald in de
    // tijdzone VAN DIT station.
    const year = parsed.data.year ?? getLocalYearMonth(new Date(), station.timezone).year;

    const rows = await listMonthlySummariesForYear(station.id, year);

    return NextResponse.json(
      { year, months: rows },
      { status: 200, headers: { "Cache-Control": "public, max-age=0, s-maxage=60" } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "onbekende fout";
    console.error("[weather/summary/monthly] databasefout:", message);
    return NextResponse.json(
      { error: "Kon maandsamenvattingen niet ophalen" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
