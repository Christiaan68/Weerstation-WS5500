import type { AxisScaleKind } from "@/lib/weather/axis-scale";

/**
 * Client-veilige metric-catalogus (Fase 3): alleen sleutel, categorie, label,
 * eenheid en schaalsoort — GEEN databasekolommen/Drizzle-imports, zodat dit
 * bestand zonder probleem in client-componenten geïmporteerd kan worden (bv.
 * `/grafieken`'s categorie-tabs). De databasekant (kolom + aggregatiefunctie)
 * staat in `history-metrics.ts` (server-only), dat deze catalogus als basis
 * hergebruikt — één bron van waarheid voor welke metrics bestaan.
 *
 * `scaleKind` (Fase 6) bepaalt welke Y-as-schaalregels een grafiek voor deze
 * metric krijgt — zie `computeAxisDomain()` in `axis-scale.ts` voor de
 * betekenis van elke soort.
 */
export type HistoryCategory =
  "temperatuur" | "vochtigheid" | "druk" | "wind" | "regen" | "uv-zon";

export interface HistoryMetricMeta {
  key: string;
  category: HistoryCategory;
  labelNl: string;
  unit: string;
  scaleKind: AxisScaleKind;
}

export const HISTORY_METRICS_CATALOG: HistoryMetricMeta[] = [
  {
    key: "temperatureOutdoorC",
    category: "temperatuur",
    labelNl: "Temperatuur buiten",
    unit: "°C",
    scaleKind: "free",
  },
  {
    key: "temperatureIndoorC",
    category: "temperatuur",
    labelNl: "Temperatuur binnen",
    unit: "°C",
    scaleKind: "free",
  },
  {
    key: "feelsLikeC",
    category: "temperatuur",
    labelNl: "Gevoelstemperatuur",
    unit: "°C",
    scaleKind: "free",
  },
  { key: "dewPointC", category: "temperatuur", labelNl: "Dauwpunt", unit: "°C", scaleKind: "free" },
  {
    key: "windChillC",
    category: "temperatuur",
    labelNl: "Windchill",
    unit: "°C",
    scaleKind: "free",
  },
  {
    key: "heatIndexC",
    category: "temperatuur",
    labelNl: "Hitte-index",
    unit: "°C",
    scaleKind: "free",
  },
  {
    key: "humidityOutdoorPct",
    category: "vochtigheid",
    labelNl: "Luchtvochtigheid buiten",
    unit: "%",
    scaleKind: "percentage",
  },
  {
    key: "humidityIndoorPct",
    category: "vochtigheid",
    labelNl: "Luchtvochtigheid binnen",
    unit: "%",
    scaleKind: "percentage",
  },
  {
    key: "pressureRelativeHpa",
    category: "druk",
    labelNl: "Luchtdruk (relatief, zeeniveau)",
    unit: "hPa",
    scaleKind: "free",
  },
  {
    key: "pressureAbsoluteHpa",
    category: "druk",
    labelNl: "Luchtdruk (absoluut)",
    unit: "hPa",
    scaleKind: "free",
  },
  {
    key: "windSpeedKmh",
    category: "wind",
    labelNl: "Windsnelheid",
    unit: "km/h",
    scaleKind: "nonNegative",
  },
  {
    key: "windGustKmh",
    category: "wind",
    labelNl: "Windstoten",
    unit: "km/h",
    scaleKind: "nonNegative",
  },
  {
    key: "rainRateMmH",
    category: "regen",
    labelNl: "Regenintensiteit",
    unit: "mm/u",
    scaleKind: "nonNegative",
  },
  { key: "uvIndex", category: "uv-zon", labelNl: "UV-index", unit: "", scaleKind: "uvIndex" },
  {
    key: "solarRadiationWm2",
    category: "uv-zon",
    labelNl: "Zoninstraling",
    unit: "W/m²",
    scaleKind: "nonNegative",
  },
];

/**
 * Geeft de `AxisScaleKind` voor een metric-sleutel. Onbekende sleutels
 * (bv. een toekomstige metric die nog niet in de catalogus staat) vallen
 * veilig terug op "nonNegative" — nooit een negatieve ondergrens tonen is de
 * minst verrassende aanname voor een meetwaarde waarvan de betekenis niet
 * bekend is.
 */
export function getAxisScaleKind(metricKey: string): AxisScaleKind {
  return HISTORY_METRICS_CATALOG.find((m) => m.key === metricKey)?.scaleKind ?? "nonNegative";
}

export const HISTORY_CATEGORIES: HistoryCategory[] = [
  "temperatuur",
  "vochtigheid",
  "druk",
  "wind",
  "regen",
  "uv-zon",
];

export const HISTORY_CATEGORY_LABELS_NL: Record<HistoryCategory, string> = {
  temperatuur: "Temperatuur",
  vochtigheid: "Luchtvochtigheid",
  druk: "Luchtdruk",
  wind: "Wind",
  regen: "Regenintensiteit",
  "uv-zon": "UV & zon",
};

export function metricsForCategory(category: HistoryCategory): HistoryMetricMeta[] {
  return HISTORY_METRICS_CATALOG.filter((m) => m.category === category);
}

/**
 * Periode-presets voor `/grafieken` — client-veilig (geen DB-imports), zodat
 * dit ook rechtstreeks door client-componenten gebruikt kan worden. De
 * server-side resolutie naar concrete UTC-grenzen staat in `history.ts`
 * (`resolveHistoryRange()`), dat deze lijst hergebruikt.
 */
export const HISTORY_PERIODS = ["24h", "7d", "30d", "90d", "365d", "all"] as const;
export type HistoryPeriod = (typeof HISTORY_PERIODS)[number];
