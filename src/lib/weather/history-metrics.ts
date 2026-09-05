/**
 * Server-only metric-registratie voor `GET /api/weather/history`: koppelt de
 * client-veilige catalogus (`history-metrics-catalog.ts`) aan de bijbehorende
 * databasekolom en aggregatiefunctie bij downsampling.
 *
 * Aggregatiekeuze per metric: `avg` voor waarden waar een gemiddelde
 * betekenisvol is (temperatuur, vochtigheid, druk, windsnelheid); `max` voor
 * waarden waar het PIEK juist interessant is en een gemiddelde die piek zou
 * wegmiddelen (windstoten, regenintensiteit, UV, zoninstraling). Windrichting
 * zit hier bewust NIET in — die is niet zinvol te middelen/downsamplen als
 * losse tijdreeks (rondloop-probleem: het gemiddelde van 350° en 10° is geen
 * 180°) en heeft zijn eigen endpoint (`/api/weather/wind`, windroos).
 */
import { weatherObservations } from "@/lib/db/schema";
import type { HistoryAggregationFn, HistoryMetricColumn } from "@/lib/db/queries";
import {
  HISTORY_METRICS_CATALOG,
  type HistoryMetricMeta,
} from "@/lib/weather/history-metrics-catalog";

export type { HistoryCategory } from "@/lib/weather/history-metrics-catalog";
export {
  HISTORY_CATEGORIES,
  metricsForCategory,
} from "@/lib/weather/history-metrics-catalog";

export interface HistoryMetricDefinition extends HistoryMetricMeta {
  column: HistoryMetricColumn["column"];
  agg: HistoryAggregationFn;
}

const COLUMN_BY_KEY: Record<string, HistoryMetricColumn["column"]> = {
  temperatureOutdoorC: weatherObservations.temperatureOutdoorC,
  temperatureIndoorC: weatherObservations.temperatureIndoorC,
  feelsLikeC: weatherObservations.feelsLikeC,
  dewPointC: weatherObservations.dewPointC,
  windChillC: weatherObservations.windChillC,
  heatIndexC: weatherObservations.heatIndexC,
  humidityOutdoorPct: weatherObservations.humidityOutdoorPct,
  humidityIndoorPct: weatherObservations.humidityIndoorPct,
  pressureRelativeHpa: weatherObservations.pressureRelativeHpa,
  pressureAbsoluteHpa: weatherObservations.pressureAbsoluteHpa,
  windSpeedKmh: weatherObservations.windSpeedKmh,
  windGustKmh: weatherObservations.windGustKmh,
  rainRateMmH: weatherObservations.rainRateMmH,
  uvIndex: weatherObservations.uvIndex,
  solarRadiationWm2: weatherObservations.solarRadiationWm2,
};

/** `max` voor piekwaarden, `avg` voor de rest — zie de toelichting hierboven. */
const MAX_AGGREGATED_KEYS = new Set([
  "windGustKmh",
  "rainRateMmH",
  "uvIndex",
  "solarRadiationWm2",
]);

export const HISTORY_METRICS: Record<string, HistoryMetricDefinition> =
  Object.fromEntries(
    HISTORY_METRICS_CATALOG.map((meta) => [
      meta.key,
      {
        ...meta,
        column: COLUMN_BY_KEY[meta.key]!,
        agg: MAX_AGGREGATED_KEYS.has(meta.key) ? "max" : "avg",
      },
    ]),
  );

export type HistoryMetricKey = keyof typeof HISTORY_METRICS;

export const HISTORY_METRIC_KEYS = Object.keys(HISTORY_METRICS) as HistoryMetricKey[];

export function isHistoryMetricKey(value: string): value is HistoryMetricKey {
  return Object.prototype.hasOwnProperty.call(HISTORY_METRICS, value);
}
