/**
 * Gepagineerde, filterbare lijst van ruwe metingen — Fase 3, `/historie`
 * (data-explorer). `GET /api/weather/observations?from=...&to=...&page=1&pageSize=50`
 */
import { NextResponse } from "next/server";
import { z } from "zod";

import { getStation, listObservationsPaged } from "@/lib/db/queries";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
  stationSlug: z.string().optional(),
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
    const station = await getStation(parsed.data.stationSlug);
    if (!station) {
      return NextResponse.json(
        { error: "Geen (actief) weerstation gevonden." },
        { status: 404, headers: { "Cache-Control": "no-store" } },
      );
    }

    const result = await listObservationsPaged(
      station.id,
      { fromUtc: parsed.data.from, toUtc: parsed.data.to },
      parsed.data.page,
      parsed.data.pageSize,
    );

    return NextResponse.json(result, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "onbekende fout";
    console.error("[weather/observations] databasefout:", message);
    return NextResponse.json(
      { error: "Kon metingen niet ophalen" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
