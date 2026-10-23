/**
 * `GET /api/weather/export/csv` (Fase 4, §12-15) — streamende CSV-export van
 * alle metingen van het station binnen een tijdvak. Publiek endpoint (het
 * zijn alleen genormaliseerde weermetingen, geen geheimen) — voor de RUWE
 * pakketten (mogelijk gevoeliger/omvangrijker) bestaat een apart, BEVEILIGD
 * endpoint: `/api/weather/export/raw-packets`.
 *
 * STREAMING (§15 — "laad grote export niet volledig in memory"): de respons
 * is een `ReadableStream` die batch-voor-batch (keyset-gepagineerd, zie
 * `listObservationsForExport()`) uit de database leest en direct naar de
 * client schrijft — het geheugengebruik van deze route blijft dus altijd
 * begrensd tot ~1 batch, ongeacht of het tijdvak 1 dag of 10 jaar beslaat.
 * Een harde bovengrens (`MAX_EXPORT_ROWS`) is het laatste vangnet: Vercel's
 * serverless-functies hebben een tijdslimiet, en een export die langer duurt
 * dan die limiet zou anders zonder duidelijke foutmelding afbreken — bij het
 * bereiken van de grens krijgt de laatste regel van het bestand een
 * duidelijk leesbare afsluitende opmerking (geen stille, onverklaarde
 * afkapping).
 */
import { getStation, listObservationsForExport } from "@/lib/db/queries";
import { getExportColumn, toExportRow } from "@/lib/weather/export/columns";
import { CSV_LINE_ENDING, UTF8_BOM, buildCsvLine, formatCsvNumber } from "@/lib/weather/export/csv";
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
    delimiter: url.searchParams.get("delimiter") ?? undefined,
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

  let range: ReturnType<typeof resolveExportRange>;
  let metricKeys: string[];
  try {
    // Fase 5: periode-presets ("vandaag", "huidige-maand", ...) resolven met
    // de tijdzone VAN DIT station, niet een globale aanname.
    range = resolveExportRange(query, new Date(), station.timezone);
    metricKeys = resolveExportMetricKeys(query.metrics);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Ongeldige export-aanvraag" },
      { status: 400 },
    );
  }

  const delimiter = query.delimiter;
  const header = [
    "timestamp_utc",
    "timestamp_local",
    ...metricKeys.map((key) => getExportColumn(key)!.csvHeader),
    "quality_status",
    "source",
  ];

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(encoder.encode(UTF8_BOM));
      controller.enqueue(encoder.encode(buildCsvLine(header, delimiter) + CSV_LINE_ENDING));

      let cursor: { measuredAt: Date; id: number } | null = null;
      let totalRows = 0;
      let truncated = false;

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
          const windDirectionCompass =
            observation.windDirectionDeg !== null
              ? degreesToCompass(observation.windDirectionDeg)
              : null;
          const row = toExportRow(observation, source, windDirectionCompass, metricKeys);

          const fields = [
            observation.measuredAt.toISOString(),
            formatIsoLocalDateTime(observation.measuredAt, station.timezone),
            ...metricKeys.map((key) => {
              const column = getExportColumn(key)!;
              const value = row.values[key];
              if (column.kind === "compass") return value === null ? "" : String(value);
              return formatCsvNumber(value as number | string | null, delimiter);
            }),
            row.qualityStatus,
            row.source ?? "",
          ];
          controller.enqueue(encoder.encode(buildCsvLine(fields, delimiter) + CSV_LINE_ENDING));
          totalRows++;
        }

        if (truncated) break;
        const last = batch[batch.length - 1]!.observation;
        cursor = { measuredAt: last.measuredAt, id: last.id };
        if (batch.length < BATCH_SIZE) break;
      }

      if (truncated) {
        controller.enqueue(
          encoder.encode(
            `# AFGEKAPT: export bereikte de limiet van ${MAX_EXPORT_ROWS.toLocaleString("nl-NL")} rijen. Kies een kortere periode (from/to) voor de rest van dit tijdvak.${CSV_LINE_ENDING}`,
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
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="weerstation-${station.slug}-${fileFrom}_${fileTo}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
