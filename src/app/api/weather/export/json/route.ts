/**
 * `GET /api/weather/export/json` (Fase 4, §16) — zelfde filters/periodes als
 * de CSV-export (`/api/weather/export/csv`, zie die route voor de
 * streaming-/limietstoelichting), maar als JSON. `format=ndjson` levert
 * newline-delimited JSON (één object per regel, geen omsluitende `[...]`) —
 * geschikter voor grotere datasets: elke regel is direct te verwerken zonder
 * het hele bestand te hoeven parsen, en de server hoeft nooit de volledige
 * JSON-array in het geheugen op te bouwen.
 */
import { getStation, listObservationsForExport } from "@/lib/db/queries";
import { getExportColumn, toExportRow } from "@/lib/weather/export/columns";
import { exportQuerySchema, resolveExportMetricKeys, resolveExportRange } from "@/lib/weather/export/filters";
import { formatIsoLocalDateTime } from "@/lib/weather/timezone";
import { degreesToCompass } from "@/lib/weather/units";

export const dynamic = "force-dynamic";

const BATCH_SIZE = 2000;
const MAX_EXPORT_ROWS = 500_000;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const stationParam = url.searchParams.get("station") ?? undefined;

  const parsedQuery = exportQuerySchema.safeParse({
    preset: url.searchParams.get("preset") ?? undefined,
    from: url.searchParams.get("from") ?? undefined,
    to: url.searchParams.get("to") ?? undefined,
    metrics: url.searchParams.get("metrics") ?? undefined,
    source: url.searchParams.get("source") ?? undefined,
    timezone: url.searchParams.get("timezone") ?? undefined,
    format: url.searchParams.get("format") ?? undefined,
  });
  if (!parsedQuery.success) {
    return Response.json(
      { error: "Ongeldige queryparameters", details: parsedQuery.error.flatten() },
      { status: 400 },
    );
  }
  const query = parsedQuery.data;

  const station = await getStation(stationParam).catch(() => undefined);
  if (!station) {
    return Response.json({ error: "Station niet gevonden" }, { status: 404 });
  }

  // Losse const (i.p.v. `station.timezone` telkens opnieuw lezen): TypeScript
  // kan de `station`-narrowing hierboven niet doorzien in de geneste
  // `rowToObject()`-closure hieronder, dus dit voorkomt een "possibly
  // undefined"-fout zonder een niet-null-assertion nodig te hebben.
  const stationTimeZone = station.timezone;

  let range: ReturnType<typeof resolveExportRange>;
  let metricKeys: string[];
  try {
    range = resolveExportRange(query, new Date(), stationTimeZone);
    metricKeys = resolveExportMetricKeys(query.metrics);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Ongeldige export-aanvraag" },
      { status: 400 },
    );
  }

  const ndjson = query.format === "ndjson";
  const encoder = new TextEncoder();

  function rowToObject(
    observation: Parameters<typeof toExportRow>[0],
    source: string | null,
  ): Record<string, unknown> {
    const windDirectionCompass =
      observation.windDirectionDeg !== null
        ? degreesToCompass(observation.windDirectionDeg)
        : null;
    const row = toExportRow(observation, source, windDirectionCompass, metricKeys);
    const obj: Record<string, unknown> = {
      timestamp_utc: observation.measuredAt.toISOString(),
      timestamp_local: formatIsoLocalDateTime(observation.measuredAt, stationTimeZone),
    };
    for (const key of metricKeys) {
      obj[getExportColumn(key)!.csvHeader] = row.values[key] ?? null;
    }
    obj.quality_status = row.qualityStatus;
    obj.source = row.source ?? null;
    return obj;
  }

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      if (!ndjson) controller.enqueue(encoder.encode("[\n"));

      let cursor: { measuredAt: Date; id: number } | null = null;
      let totalRows = 0;
      let truncated = false;
      let isFirstRow = true;

      while (true) {
        const batch = await listObservationsForExport(
          station.id,
          range.fromUtc,
          range.toUtc,
          BATCH_SIZE,
          cursor,
          query.source,
        );
        if (batch.length === 0) break;

        for (const { observation, source } of batch) {
          if (totalRows >= MAX_EXPORT_ROWS) {
            truncated = true;
            break;
          }
          const json = JSON.stringify(rowToObject(observation, source));
          if (ndjson) {
            controller.enqueue(encoder.encode(json + "\n"));
          } else {
            controller.enqueue(encoder.encode((isFirstRow ? "" : ",\n") + json));
            isFirstRow = false;
          }
          totalRows++;
        }

        if (truncated) break;
        const last = batch[batch.length - 1]!.observation;
        cursor = { measuredAt: last.measuredAt, id: last.id };
        if (batch.length < BATCH_SIZE) break;
      }

      if (!ndjson) {
        controller.enqueue(encoder.encode("\n]\n"));
      }
      if (truncated) {
        const notice = `# AFGEKAPT: export bereikte de limiet van ${MAX_EXPORT_ROWS} rijen. Kies een kortere periode voor de rest.`;
        controller.enqueue(encoder.encode(ndjson ? notice + "\n" : ""));
      }

      controller.close();
    },
  });

  const fileFrom = range.fromUtc.toISOString().slice(0, 10);
  const fileTo = range.toUtc.toISOString().slice(0, 10);
  const ext = ndjson ? "ndjson" : "json";

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": ndjson ? "application/x-ndjson; charset=utf-8" : "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="weerstation-${station.slug}-${fileFrom}_${fileTo}.${ext}"`,
      "Cache-Control": "no-store",
    },
  });
}
