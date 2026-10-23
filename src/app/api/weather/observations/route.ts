/**
 * Gepagineerde, filterbare en sorteerbare lijst van ruwe metingen. Gebruikt
 * door `/data` (Fase 4 Data Explorer, §20-24: `from`/`to`/`page`/`pageSize`
 * plus `source`, `quality`, `sortBy`, `sortDir`). Tot Fase 4.2 werd deze
 * route ook door de losse `/historie`-pagina (Fase 3) gebruikt zonder de
 * extra filters; die pagina is vervallen (permanente redirect naar `/data`,
 * zie `next.config.ts`) omdat `/data` er functioneel een superset van is.
 * Aanroepen zonder de nieuwe parameters gedragen zich nog steeds zoals
 * voorheen (standaard: sorteren op meettijd, aflopend, geen bron-/
 * kwaliteitsfilter), dus deze route blijft ook geschikt voor toekomstige
 * eenvoudige consumers.
 *
 * `GET /api/weather/observations?from=...&to=...&page=1&pageSize=50`
 * `GET /api/weather/observations?source=ecowitt_cloud_api&quality=suspect&sortBy=windGustKmh&sortDir=desc`
 */
import { NextResponse } from "next/server";
import { z } from "zod";

import {
  getStation,
  listObservationsForExplorer,
  OBSERVATION_EXPLORER_SORT_KEYS,
} from "@/lib/db/queries";
import { observationQualityStatus } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
  station: z.string().optional(),
  source: z.string().min(1).max(40).optional(),
  quality: z.enum(observationQualityStatus).optional(),
  sortBy: z.enum(OBSERVATION_EXPLORER_SORT_KEYS).default("measuredAt"),
  sortDir: z.enum(["asc", "desc"]).default("desc"),
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

    const result = await listObservationsForExplorer(
      station.id,
      {
        fromUtc: parsed.data.from,
        toUtc: parsed.data.to,
        source: parsed.data.source,
        qualityStatus: parsed.data.quality,
      },
      parsed.data.sortBy,
      parsed.data.sortDir,
      parsed.data.page,
      parsed.data.pageSize,
    );

    // `/historie` (ongewijzigd) verwacht `{ rows: WeatherObservation[], ... }`
    // zonder de `source`-wrapper — vlak de rijen hier uit zodat beide
    // pagina's met dezelfde response overweg kunnen (`/data` gebruikt zowel
    // `observation` als `source` uit elke rij).
    return NextResponse.json(
      {
        rows: result.rows.map((row) => ({ ...row.observation, source: row.source })),
        total: result.total,
        page: result.page,
        pageSize: result.pageSize,
      },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "onbekende fout";
    console.error("[weather/observations] databasefout:", message);
    return NextResponse.json(
      { error: "Kon metingen niet ophalen" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
