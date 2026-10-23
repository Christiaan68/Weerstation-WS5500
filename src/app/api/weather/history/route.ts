/**
 * Historische, gedownsamplede tijdreeksdata voor de `/charts`-pagina (en de
 * 24-uursgrafiek op het dashboard) — Fase 3, sectie 5 van de opdracht.
 *
 * `GET /api/weather/history?metrics=temperatureOutdoorC,dewPointC&period=7d`
 * `GET /api/weather/history?metrics=windSpeedKmh&from=2026-08-01T00:00:00Z&to=2026-08-08T00:00:00Z`
 *
 * De resolutie (ruw/5m/uur/dag) wordt NIET door de client gekozen — die
 * wordt server-side bepaald door `chooseAggregationInterval()`, zodat er
 * nooit meer dan ~1500 punten per serie teruggestuurd worden (expliciete
 * Fase 3-eis). Geen publieke/gedocumenteerde externe API — uitsluitend voor
 * de eigen dashboardpagina's.
 */
import { NextResponse } from "next/server";

import { getStation } from "@/lib/db/queries";
import { getHistoryResponse, historyQuerySchema } from "@/lib/weather/history";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const searchParams = Object.fromEntries(url.searchParams.entries());

  const parsed = historyQuerySchema.safeParse(searchParams);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Ongeldige queryparameters",
        details: parsed.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const station = await getStation(searchParams.station);
    if (!station) {
      return NextResponse.json(
        { error: "Geen (actief) weerstation gevonden." },
        { status: 404, headers: { "Cache-Control": "no-store" } },
      );
    }

    const body = await getHistoryResponse(station.id, parsed.data);

    return NextResponse.json(body, {
      status: 200,
      // 60s server-side/CDN-cache: de client ververst zelf niet vaker dan het
      // pollinterval (5 min), en dit voorkomt herhaalde identieke aggregatie-
      // queries bij snel achter elkaar wisselen van periode/tabblad.
      headers: { "Cache-Control": "public, max-age=0, s-maxage=60" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "onbekende fout";
    console.error("[weather/history] databasefout:", message);
    return NextResponse.json(
      { error: "Kon historische gegevens niet ophalen" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
