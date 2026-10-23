/**
 * Detail van één meting (Fase 4, §22) — `GET /api/weather/observations/123`.
 * Publiek (net als de rest van `/data`): geeft alle GENORMALISEERDE waarden
 * terug, nooit de ruwe payload zelf — die blijft uitsluitend bereikbaar via
 * de bestaande beveiligde diagnosepagina (`rawPacketId` in de response is de
 * koppeling daarnaartoe, zie `getObservationDetail()` in `queries.ts`).
 */
import { NextResponse } from "next/server";
import { z } from "zod";

import { getObservationDetail, getStation } from "@/lib/db/queries";

export const dynamic = "force-dynamic";

const paramsSchema = z.object({ id: z.coerce.number().int().positive() });
const querySchema = z.object({ station: z.string().optional() });

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const resolvedParams = paramsSchema.safeParse(await params);
  if (!resolvedParams.success) {
    return NextResponse.json(
      { error: "Ongeldig observatie-id" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  const url = new URL(request.url);
  const parsedQuery = querySchema.safeParse(Object.fromEntries(url.searchParams.entries()));
  if (!parsedQuery.success) {
    return NextResponse.json(
      { error: "Ongeldige queryparameters" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const station = await getStation(parsedQuery.data.station);
    if (!station) {
      return NextResponse.json(
        { error: "Geen (actief) weerstation gevonden." },
        { status: 404, headers: { "Cache-Control": "no-store" } },
      );
    }

    const detail = await getObservationDetail(station.id, resolvedParams.data.id);
    if (!detail) {
      return NextResponse.json(
        { error: "Meting niet gevonden" },
        { status: 404, headers: { "Cache-Control": "no-store" } },
      );
    }

    return NextResponse.json(detail, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "onbekende fout";
    console.error("[weather/observations/:id] databasefout:", message);
    return NextResponse.json(
      { error: "Kon meting niet ophalen" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
