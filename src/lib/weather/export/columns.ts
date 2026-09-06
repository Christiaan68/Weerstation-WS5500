/**
 * Kolomdefinities voor de Fase 4-exports (`/api/weather/export/csv` en
 * `/api/weather/export/json`) — bewust een APARTE registratie van
 * `history-metrics.ts` (Fase 3): die is voor gedownsamplede grafiekdata
 * (met aggregatiefunctie per bucket), dit is voor de RUWE, ongedownsamplede
 * rij-per-meting-export, inclusief velden die in grafieken geen zin hebben
 * (windrichting, de losse regenperiodes, kwaliteitsstatus, herkomst).
 *
 * Elke sleutel komt 1-op-1 overeen met een veld in `WeatherObservation`
 * (`src/lib/db/schema.ts`) — zie `§13` van de Fase 4-opdracht voor de
 * volledige, verplichte kolomlijst.
 */
import type { WeatherObservation } from "@/lib/db/schema";

export type ExportColumnKind = "number" | "string" | "compass";

export interface ExportColumnDef {
  /** Sleutel zoals gebruikt in de `metrics`-queryparameter en het JSON-veld. */
  key: string;
  /** snake_case kolomnaam in de CSV-header (zie §13, exact zo gespeld). */
  csvHeader: string;
  labelNl: string;
  unit: string;
  kind: ExportColumnKind;
}

/**
 * De selecteerbare METINGEN-kolommen (§13, exclusief de structurele velden
 * timestamp/quality/source die hieronder apart staan — die zijn altijd
 * aanwezig, nooit optioneel via `metrics`).
 */
export const EXPORT_METRIC_COLUMNS: ExportColumnDef[] = [
  { key: "temperatureOutdoorC", csvHeader: "temperature_outdoor_c", labelNl: "Temperatuur buiten", unit: "°C", kind: "number" },
  { key: "temperatureIndoorC", csvHeader: "temperature_indoor_c", labelNl: "Temperatuur binnen", unit: "°C", kind: "number" },
  { key: "dewPointC", csvHeader: "dew_point_c", labelNl: "Dauwpunt", unit: "°C", kind: "number" },
  { key: "feelsLikeC", csvHeader: "feels_like_c", labelNl: "Gevoelstemperatuur", unit: "°C", kind: "number" },
  { key: "windChillC", csvHeader: "wind_chill_c", labelNl: "Windchill", unit: "°C", kind: "number" },
  { key: "heatIndexC", csvHeader: "heat_index_c", labelNl: "Hitte-index", unit: "°C", kind: "number" },
  { key: "humidityOutdoorPct", csvHeader: "humidity_outdoor_pct", labelNl: "Luchtvochtigheid buiten", unit: "%", kind: "number" },
  { key: "humidityIndoorPct", csvHeader: "humidity_indoor_pct", labelNl: "Luchtvochtigheid binnen", unit: "%", kind: "number" },
  { key: "pressureRelativeHpa", csvHeader: "pressure_relative_hpa", labelNl: "Luchtdruk (relatief)", unit: "hPa", kind: "number" },
  { key: "pressureAbsoluteHpa", csvHeader: "pressure_absolute_hpa", labelNl: "Luchtdruk (absoluut)", unit: "hPa", kind: "number" },
  { key: "windSpeedKmh", csvHeader: "wind_speed_kmh", labelNl: "Windsnelheid", unit: "km/h", kind: "number" },
  { key: "windGustKmh", csvHeader: "wind_gust_kmh", labelNl: "Windstoten", unit: "km/h", kind: "number" },
  { key: "windDirectionDeg", csvHeader: "wind_direction_deg", labelNl: "Windrichting", unit: "°", kind: "number" },
  { key: "windDirectionCompass", csvHeader: "wind_direction_compass", labelNl: "Windrichting (kompas)", unit: "", kind: "compass" },
  { key: "rainRateMmH", csvHeader: "rain_rate_mm_h", labelNl: "Regenintensiteit", unit: "mm/u", kind: "number" },
  { key: "rainEventMm", csvHeader: "rain_event_mm", labelNl: "Regen (deze bui)", unit: "mm", kind: "number" },
  { key: "rainHourMm", csvHeader: "rain_hour_mm", labelNl: "Regen (afgelopen uur)", unit: "mm", kind: "number" },
  { key: "rainDayMm", csvHeader: "rain_day_mm", labelNl: "Regen (vandaag)", unit: "mm", kind: "number" },
  { key: "rainWeekMm", csvHeader: "rain_week_mm", labelNl: "Regen (deze week)", unit: "mm", kind: "number" },
  { key: "rainMonthMm", csvHeader: "rain_month_mm", labelNl: "Regen (deze maand)", unit: "mm", kind: "number" },
  { key: "rainYearMm", csvHeader: "rain_year_mm", labelNl: "Regen (dit jaar)", unit: "mm", kind: "number" },
  { key: "rainTotalMm", csvHeader: "rain_total_mm", labelNl: "Regen (totaal)", unit: "mm", kind: "number" },
  { key: "uvIndex", csvHeader: "uv_index", labelNl: "UV-index", unit: "", kind: "number" },
  { key: "solarRadiationWm2", csvHeader: "solar_radiation_wm2", labelNl: "Zoninstraling", unit: "W/m²", kind: "number" },
];

export const EXPORT_METRIC_KEYS = EXPORT_METRIC_COLUMNS.map((c) => c.key);

export function isExportMetricKey(value: string): boolean {
  return EXPORT_METRIC_COLUMNS.some((c) => c.key === value);
}

export function getExportColumn(key: string): ExportColumnDef | undefined {
  return EXPORT_METRIC_COLUMNS.find((c) => c.key === key);
}

/** Eén exportrij: de structurele velden plus alle (geselecteerde) metingen, als ruwe waarden (nog niet CSV/JSON-geformatteerd). */
export interface ExportRow {
  measuredAtUtc: Date;
  qualityStatus: string;
  source: string | null;
  values: Record<string, string | number | null>;
}

/** Zet een `WeatherObservation`-rij (plus opgehaalde `source`) om naar een `ExportRow` voor de opgegeven kolomselectie. */
export function toExportRow(
  observation: WeatherObservation,
  source: string | null,
  windDirectionCompass: string | null,
  selectedKeys: string[],
): ExportRow {
  const values: Record<string, string | number | null> = {};
  for (const key of selectedKeys) {
    if (key === "windDirectionCompass") {
      values[key] = windDirectionCompass;
      continue;
    }
    const raw = (observation as unknown as Record<string, unknown>)[key];
    values[key] = raw === undefined ? null : (raw as string | number | null);
  }
  return {
    measuredAtUtc: observation.measuredAt,
    qualityStatus: observation.qualityStatus,
    source,
    values,
  };
}
