/**
 * Ontbrekende intervallen binnen ÉÉN lokale dag (Fase 4, §28) —
 * `GET /api/weather/data-quality/missing-intervals?date=2026-09-05`.
 *
 * Bewust een aparte route van `/api/weather/data-quality` (maandoverzicht):
 * het uitlezen van alle individuele meettijden van een dag (om gaten te
 * kunnen detecteren) is een duurdere query dan de maand-samenvattingsrijen —
 * die wordt daarom alleen uitgevoerd voor de ene dag die de gebruiker
 * daadwerkelijk uitklapt, nooit voor een hele maand tegelijk (§49:
 * performance, geen onbegrensde rij-aantallen naar de client).
 */
import { NextResponse } from "next/server";
import { z } from "zod";

import { getStation, listDistinctMeasuredAtInRange } from "@/lib/db/queries";
import { computeDayCompletenessDetail } from "@/lib/weather/data-quality";
import { getLocalDayBoundsUtc } from "@/lib/weather/timezone";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Verwacht formaat YYYY-MM-DD"),
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

    const { startUtc, endUtc, durationSeconds } = getLocalDayBoundsUtc(
      parsed.data.date,
      station.timezone,
    );
    const measuredAtTimes = await listDistinctMeasuredAtInRange(station.id, startUtc, endUtc);

    const detail = computeDayCompletenessDetail(
      parsed.data.date,
      measuredAtTimes,
      startUtc,
      endUtc,
      durationSeconds,
      station.expectedUploadIntervalSeconds,
    );

    return NextResponse.json(detail, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "onbekende fout";
    console.error("[weather/data-quality/missing-intervals] databasefout:", message);
    return NextResponse.json(
      { error: "Kon ontbrekende intervallen niet ophalen" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
