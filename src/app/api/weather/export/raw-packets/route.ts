/**
 * `GET /api/weather/export/raw-packets` (Fase 4, §17) — BEVEILIGDE backup-
 * export van de originele, ongewijzigde Ecowitt-payloads
 * (`raw_weather_packets`). Niet publiek: hergebruikt exact dezelfde
 * beveiliging als de bestaande diagnosepagina's
 * (`STATION_DIAGNOSTICS_SECRET` + `secretMatches()`, zie
 * `src/app/station/diagnostics/page.tsx`) — geen nieuw geheim, geen nieuw
 * auth-mechanisme. Bij een ontbrekende/foute sleutel geeft deze route
 * bewust een gewone 404 terug (niet 401/403): dat lekt niet dat het endpoint
 * bestaat, consistent met hoe de diagnosepagina's dit al deden.
 *
 * Standaard NDJSON (elke pakket-payload kan een aanzienlijke hoeveelheid
 * JSON zijn; NDJSON blijft ook bij tienduizenden pakketten streambaar zonder
 * alles in het geheugen op te bouwen — zie de CSV/JSON-exportroutes voor
 * dezelfde streaming-aanpak).
 */
import { getStation, listRawPacketsForExport } from "@/lib/db/queries";
import { getServerEnv } from "@/lib/env";
import { secretMatches } from "@/lib/weather/secret";
import { exportQuerySchema, resolveExportRange } from "@/lib/weather/export/filters";

export const dynamic = "force-dynamic";

const BATCH_SIZE = 500;
const MAX_EXPORT_PACKETS = 100_000;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const key = url.searchParams.get("key") ?? undefined;
  const { STATION_DIAGNOSTICS_SECRET } = getServerEnv();

  if (!secretMatches(key, STATION_DIAGNOSTICS_SECRET)) {
    return Response.json({ error: "Niet gevonden" }, { status: 404 });
  }

  const slug = url.searchParams.get("slug") ?? undefined;
  const parsedQuery = exportQuerySchema.safeParse({
    preset: url.searchParams.get("preset") ?? undefined,
    from: url.searchParams.get("from") ?? undefined,
    to: url.searchParams.get("to") ?? undefined,
    timezone: url.searchParams.get("timezone") ?? undefined,
  });
  if (!parsedQuery.success) {
    return Response.json(
      { error: "Ongeldige queryparameters", details: parsedQuery.error.flatten() },
      { status: 400 },
    );
  }

  let range: ReturnType<typeof resolveExportRange>;
  try {
    range = resolveExportRange(parsedQuery.data);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Ongeldige export-aanvraag" },
      { status: 400 },
    );
  }

  const station = await getStation(slug).catch(() => undefined);
  if (!station) {
    return Response.json({ error: "Station niet gevonden" }, { status: 404 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let cursor: { receivedAt: Date; id: number } | null = null;
      let total = 0;
      let truncated = false;

      while (true) {
        const batch = await listRawPacketsForExport(
          station.id,
          range.fromUtc,
          range.toUtc,
          BATCH_SIZE,
          cursor,
        );
        if (batch.length === 0) break;

        for (const packet of batch) {
          if (total >= MAX_EXPORT_PACKETS) {
            truncated = true;
            break;
          }
          controller.enqueue(encoder.encode(JSON.stringify(packet) + "\n"));
          total++;
        }

        if (truncated) break;
        const last = batch[batch.length - 1]!;
        cursor = { receivedAt: last.receivedAt, id: last.id };
        if (batch.length < BATCH_SIZE) break;
      }

      if (truncated) {
        controller.enqueue(
          encoder.encode(
            `# AFGEKAPT: export bereikte de limiet van ${MAX_EXPORT_PACKETS} pakketten. Kies een kortere periode.\n`,
          ),
        );
      }

      controller.close();
    },
  });

  const fileFrom = range.fromUtc.toISOString().slice(0, 10);
  const fileTo = range.toUtc.toISOString().slice(0, 10);

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Content-Disposition": `attachment; filename="weerstation-${station.slug}-raw-packets-${fileFrom}_${fileTo}.ndjson"`,
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}
