/**
 * Orchestratie + validatie voor `GET /api/weather/history` (Fase 3, zie
 * `src/app/api/weather/history/route.ts`). Koppelt de querystring (Zod-
 * gevalideerd) aan `chooseAggregationInterval()` (downsampling.ts) en de
 * SQL-side tijdreeksquery (`getObservationSeries()` in queries.ts).
 */
import { z } from "zod";

import { getObservationSeries } from "@/lib/db/queries";
import {
  chooseAggregationInterval,
  intervalToSeconds,
  MAX_HISTORY_POINTS,
} from "@/lib/weather/downsampling";
import {
  HISTORY_METRICS,
  isHistoryMetricKey,
  type HistoryMetricKey,
} from "@/lib/weather/history-metrics";
import {
  HISTORY_PERIODS,
  type HistoryPeriod,
} from "@/lib/weather/history-metrics-catalog";

export { HISTORY_PERIODS };
export type { HistoryPeriod };

const PERIOD_TO_MS: Record<Exclude<HistoryPeriod, "all">, number> = {
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
  "90d": 90 * 24 * 60 * 60 * 1000,
  "365d": 365 * 24 * 60 * 60 * 1000,
};

/** Ruim vóór de eerst mogelijke meting van dit project — veilige ondergrens voor period=all. */
const EPOCH_FLOOR = new Date("2020-01-01T00:00:00.000Z");

export const historyQuerySchema = z.object({
  metrics: z
    .string()
    .min(1, "metrics is verplicht, bv. ?metrics=temperatureOutdoorC,dewPointC")
    .transform((value) =>
      value
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    )
    .refine((keys) => keys.length > 0, { message: "Geef minstens één metric op." })
    .refine((keys) => keys.length <= 6, { message: "Maximaal 6 metrics tegelijk." })
    .refine((keys) => keys.every(isHistoryMetricKey), {
      message: `Onbekende metric. Geldige waarden: ${Object.keys(HISTORY_METRICS).join(", ")}.`,
    }),
  period: z.enum(HISTORY_PERIODS).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

export type HistoryQuery = z.infer<typeof historyQuerySchema>;

export interface HistoryRange {
  fromUtc: Date;
  toUtc: Date;
}

/**
 * Bepaalt het tijdvak: expliciete `from`/`to` wint (indien beide aanwezig en
 * geldig), anders een `period`-preset, anders het standaard 24-uursvenster.
 */
export function resolveHistoryRange(
  query: HistoryQuery,
  now: Date = new Date(),
): HistoryRange {
  if (query.from && query.to && query.from < query.to) {
    return { fromUtc: query.from, toUtc: query.to };
  }

  const period = query.period ?? "24h";
  if (period === "all") {
    return { fromUtc: EPOCH_FLOOR, toUtc: now };
  }

  return { fromUtc: new Date(now.getTime() - PERIOD_TO_MS[period]), toUtc: now };
}

export interface HistorySeriesPoint {
  t: string; // ISO-8601
  values: Record<string, number | null>;
}

export interface HistoryResponseBody {
  interval: ReturnType<typeof chooseAggregationInterval>;
  from: string;
  to: string;
  metrics: Array<{ key: HistoryMetricKey; label: string; unit: string }>;
  points: HistorySeriesPoint[];
  pointCount: number;
}

export async function getHistoryResponse(
  stationId: number,
  query: HistoryQuery,
  now: Date = new Date(),
): Promise<HistoryResponseBody> {
  const { fromUtc, toUtc } = resolveHistoryRange(query, now);
  const interval = chooseAggregationInterval(fromUtc, toUtc, {
    pointBudget: MAX_HISTORY_POINTS,
  });
  const intervalSeconds = intervalToSeconds(interval);

  const metricDefs = query.metrics.map((key) => HISTORY_METRICS[key]!);
  const rows = await getObservationSeries(
    stationId,
    fromUtc,
    toUtc,
    intervalSeconds,
    metricDefs.map((m) => ({ key: m.key, column: m.column, agg: m.agg })),
    MAX_HISTORY_POINTS,
  );

  return {
    interval,
    from: fromUtc.toISOString(),
    to: toUtc.toISOString(),
    metrics: metricDefs.map((m) => ({
      key: m.key as HistoryMetricKey,
      label: m.labelNl,
      unit: m.unit,
    })),
    points: rows.map((row) => ({ t: row.timestamp.toISOString(), values: row.values })),
    pointCount: rows.length,
  };
}
