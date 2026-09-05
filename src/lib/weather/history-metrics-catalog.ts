/**
 * Client-veilige metric-catalogus (Fase 3): alleen sleutel, categorie, label
 * en eenheid — GEEN databasekolommen/Drizzle-imports, zodat dit bestand
 * zonder probleem in client-componenten geïmporteerd kan worden (bv.
 * `/grafieken`'s categorie-tabs). De databasekant (kolom + aggregatiefunctie)
 * staat in `history-metrics.ts` (server-only), dat deze catalogus als basis
 * hergebruikt — één bron van waarheid voor welke metrics bestaan.
 */
export type HistoryCategory =
  "temperatuur" | "vochtigheid" | "druk" | "wind" | "regen" | "uv-zon";

export interface HistoryMetricMeta {
  key: string;
  category: HistoryCategory;
  labelNl: string;
  unit: string;
}

export const HISTORY_METRICS_CATALOG: HistoryMetricMeta[] = [
  {
    key: "temperatureOutdoorC",
    category: "temperatuur",
    labelNl: "Temperatuur buiten",
    unit: "°C",
  },
  {
    key: "temperatureIndoorC",
    category: "temperatuur",
    labelNl: "Temperatuur binnen",
    unit: "°C",
  },
  {
    key: "feelsLikeC",
    category: "temperatuur",
    labelNl: "Gevoelstemperatuur",
    unit: "°C",
  },
  { key: "dewPointC", category: "temperatuur", labelNl: "Dauwpunt", unit: "°C" },
  { key: "windChillC", category: "temperatuur", labelNl: "Windchill", unit: "°C" },
  { key: "heatIndexC", category: "temperatuur", labelNl: "Hitte-index", unit: "°C" },
  {
    key: "humidityOutdoorPct",
    category: "vochtigheid",
    labelNl: "Luchtvochtigheid buiten",
    unit: "%",
  },
  {
    key: "humidityIndoorPct",
    category: "vochtigheid",
    labelNl: "Luchtvochtigheid binnen",
    unit: "%",
  },
  {
    key: "pressureRelativeHpa",
    category: "druk",
    labelNl: "Luchtdruk (relatief, zeeniveau)",
    unit: "hPa",
  },
  {
    key: "pressureAbsoluteHpa",
    category: "druk",
    labelNl: "Luchtdruk (absoluut)",
    unit: "hPa",
  },
  { key: "windSpeedKmh", category: "wind", labelNl: "Windsnelheid", unit: "km/h" },
  { key: "windGustKmh", category: "wind", labelNl: "Windstoten", unit: "km/h" },
  { key: "rainRateMmH", category: "regen", labelNl: "Regenintensiteit", unit: "mm/u" },
  { key: "uvIndex", category: "uv-zon", labelNl: "UV-index", unit: "" },
  {
    key: "solarRadiationWm2",
    category: "uv-zon",
    labelNl: "Zoninstraling",
    unit: "W/m²",
  },
];

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
