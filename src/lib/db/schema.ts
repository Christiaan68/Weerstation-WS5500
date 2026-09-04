/**
 * Drizzle-schema voor het Alecto WS5500 weerstation-project.
 *
 * Ontwerpprincipes (zie ook docs/ARCHITECTURE.md):
 * - Alle timestamps worden intern in UTC opgeslagen (`timestamp` kolommen).
 *   Lokale tijd (Europe/Amsterdam) wordt alleen gebruikt voor presentatie en
 *   voor kalenderaggregaties (`local_date`, `year`, `month` in de
 *   summary-tabellen).
 * - Numerieke metingen gebruiken `decimal` (geen `float`/`double`) zodat
 *   waarden exact en reproduceerbaar worden opgeslagen/opgeteld.
 * - Primary keys zijn `bigint unsigned auto_increment`. Bij dit
 *   schrijfvolume (een meting per ~60 seconden) is er geen praktisch risico
 *   op write-hotspots in TiDB; zie ARCHITECTURE.md §"Keuze primary keys".
 * - `raw_weather_packets` bewaart de ruwe, ongewijzigde payload. De
 *   genormaliseerde tabellen (`weather_observations`, `sensor_measurements`)
 *   worden hieruit afgeleid door een (latere) parser.
 */
import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  date,
  decimal,
  index,
  int,
  json,
  mysqlEnum,
  mysqlTable,
  smallint,
  timestamp,
  tinyint,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";

// ---------------------------------------------------------------------------
// Herbruikbare kolom-helpers
// ---------------------------------------------------------------------------

const id = () =>
  bigint("id", { mode: "number", unsigned: true }).autoincrement().primaryKey();

const createdAt = () =>
  timestamp("created_at", { mode: "date", fsp: 3 }).notNull().defaultNow();

const updatedAt = () =>
  timestamp("updated_at", { mode: "date", fsp: 3 }).notNull().defaultNow().onUpdateNow();

/** Standaard precisie voor temperaturen in graden Celsius. */
const temperatureC = (name: string) => decimal(name, { precision: 4, scale: 1 });
/** Standaard precisie voor relatieve luchtvochtigheid in procenten. */
const humidityPct = (name: string) => decimal(name, { precision: 4, scale: 1 });
/** Standaard precisie voor luchtdruk in hPa. */
const pressureHpa = (name: string) => decimal(name, { precision: 6, scale: 1 });
/** Standaard precisie voor windsnelheden in km/h. */
const windKmh = (name: string) => decimal(name, { precision: 5, scale: 1 });

// ---------------------------------------------------------------------------
// stations
// ---------------------------------------------------------------------------

export const stations = mysqlTable(
  "stations",
  {
    id: id(),
    name: varchar("name", { length: 120 }).notNull(),
    slug: varchar("slug", { length: 140 }).notNull(),
    manufacturer: varchar("manufacturer", { length: 80 }).notNull().default("Alecto"),
    model: varchar("model", { length: 80 }).notNull().default("WS5500"),
    /** Eigen/externe identifier van het station (bv. Ecowitt device id). */
    stationIdentifier: varchar("station_identifier", { length: 120 }).notNull(),
    macAddress: varchar("mac_address", { length: 17 }),
    timezone: varchar("timezone", { length: 64 }).notNull().default("Europe/Amsterdam"),
    latitude: decimal("latitude", { precision: 9, scale: 6 }),
    longitude: decimal("longitude", { precision: 9, scale: 6 }),
    elevationM: decimal("elevation_m", { precision: 6, scale: 1 }),
    expectedUploadIntervalSeconds: int("expected_upload_interval_seconds", {
      unsigned: true,
    })
      .notNull()
      .default(60),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("stations_slug_unique").on(table.slug),
    uniqueIndex("stations_station_identifier_unique").on(table.stationIdentifier),
  ],
);

// ---------------------------------------------------------------------------
// raw_weather_packets — ongewijzigde, originele payloads
// ---------------------------------------------------------------------------

export const rawWeatherPacketProcessingStatus = [
  "pending",
  "processed",
  "error",
  "ignored",
] as const;

export const rawWeatherPackets = mysqlTable(
  "raw_weather_packets",
  {
    id: id(),
    stationId: bigint("station_id", { mode: "number", unsigned: true })
      .notNull()
      .references(() => stations.id),
    receivedAt: timestamp("received_at", { mode: "date", fsp: 3 }).notNull().defaultNow(),
    /** Herkomst van de payload, bv. "ecowitt_http", "demo_generator", "manual_seed". */
    source: varchar("source", { length: 40 }).notNull(),
    /** Timestamp zoals door het station/de bron zelf gerapporteerd, indien aanwezig. */
    remoteTimestamp: timestamp("remote_timestamp", { mode: "date", fsp: 3 }),
    contentType: varchar("content_type", { length: 80 }),
    rawPayload: json("raw_payload").notNull(),
    /** SHA-256 hex van de ruwe payload, handig voor deduplicatie/debugging. */
    payloadHash: varchar("payload_hash", { length: 64 }),
    parserVersion: varchar("parser_version", { length: 20 }),
    processingStatus: mysqlEnum("processing_status", rawWeatherPacketProcessingStatus)
      .notNull()
      .default("pending"),
    processingError: varchar("processing_error", { length: 2000 }),
    createdAt: createdAt(),
  },
  (table) => [
    index("raw_packets_station_received_idx").on(table.stationId, table.receivedAt),
    index("raw_packets_payload_hash_idx").on(table.payloadHash),
  ],
);

// ---------------------------------------------------------------------------
// weather_observations — genormaliseerde hoofdmetingen
// ---------------------------------------------------------------------------

export const observationQualityStatus = [
  "ok",
  "estimated",
  "suspect",
  "missing",
] as const;

export const weatherObservations = mysqlTable(
  "weather_observations",
  {
    id: id(),
    stationId: bigint("station_id", { mode: "number", unsigned: true })
      .notNull()
      .references(() => stations.id),
    rawPacketId: bigint("raw_packet_id", { mode: "number", unsigned: true }).references(
      () => rawWeatherPackets.id,
    ),
    /** Tijdstip van de meting zelf (UTC). */
    measuredAt: timestamp("measured_at", { mode: "date", fsp: 3 }).notNull(),
    /** Tijdstip waarop de meting door onze server ontvangen is (UTC). */
    receivedAt: timestamp("received_at", { mode: "date", fsp: 3 }).notNull().defaultNow(),

    temperatureOutdoorC: temperatureC("temperature_outdoor_c"),
    temperatureIndoorC: temperatureC("temperature_indoor_c"),
    humidityOutdoorPct: humidityPct("humidity_outdoor_pct"),
    humidityIndoorPct: humidityPct("humidity_indoor_pct"),
    dewPointC: temperatureC("dew_point_c"),
    feelsLikeC: temperatureC("feels_like_c"),
    windChillC: temperatureC("wind_chill_c"),
    heatIndexC: temperatureC("heat_index_c"),

    pressureAbsoluteHpa: pressureHpa("pressure_absolute_hpa"),
    pressureRelativeHpa: pressureHpa("pressure_relative_hpa"),

    windSpeedKmh: windKmh("wind_speed_kmh"),
    windGustKmh: windKmh("wind_gust_kmh"),
    windDirectionDeg: smallint("wind_direction_deg", { unsigned: true }),

    rainRateMmH: decimal("rain_rate_mm_h", { precision: 6, scale: 2 }),
    rainEventMm: decimal("rain_event_mm", { precision: 7, scale: 2 }),
    rainHourMm: decimal("rain_hour_mm", { precision: 7, scale: 2 }),
    rainDayMm: decimal("rain_day_mm", { precision: 7, scale: 2 }),
    rainWeekMm: decimal("rain_week_mm", { precision: 8, scale: 2 }),
    rainMonthMm: decimal("rain_month_mm", { precision: 8, scale: 2 }),
    rainYearMm: decimal("rain_year_mm", { precision: 9, scale: 2 }),
    rainTotalMm: decimal("rain_total_mm", { precision: 10, scale: 2 }),

    uvIndex: decimal("uv_index", { precision: 3, scale: 1 }),
    solarRadiationWm2: decimal("solar_radiation_wm2", { precision: 6, scale: 1 }),

    qualityStatus: mysqlEnum("quality_status", observationQualityStatus)
      .notNull()
      .default("ok"),
    qualityFlags: json("quality_flags"),

    createdAt: createdAt(),
  },
  (table) => [
    index("observations_station_measured_idx").on(table.stationId, table.measuredAt),
  ],
);

// ---------------------------------------------------------------------------
// sensor_measurements — generieke tabel voor (toekomstige) extra sensoren
// ---------------------------------------------------------------------------

export const sensorMeasurements = mysqlTable(
  "sensor_measurements",
  {
    id: id(),
    stationId: bigint("station_id", { mode: "number", unsigned: true })
      .notNull()
      .references(() => stations.id),
    observationId: bigint("observation_id", {
      mode: "number",
      unsigned: true,
    }).references(() => weatherObservations.id),
    measuredAt: timestamp("measured_at", { mode: "date", fsp: 3 }).notNull(),
    /** Bv. "soil_moisture", "leaf_wetness", "pm25", "pm10", "co2", "lightning", "water_leak". */
    sensorType: varchar("sensor_type", { length: 40 }).notNull(),
    /** Kanaalnummer voor sensoren met meerdere kanalen (bv. extra temp-sensoren). */
    channel: tinyint("channel", { unsigned: true }),
    /** Bv. "moisture_pct", "concentration_ugm3", "distance_km". */
    metric: varchar("metric", { length: 60 }).notNull(),
    valueNumeric: decimal("value_numeric", { precision: 12, scale: 4 }),
    valueText: varchar("value_text", { length: 255 }),
    unit: varchar("unit", { length: 32 }),
    metadata: json("metadata"),
    createdAt: createdAt(),
  },
  (table) => [
    index("sensor_measurements_station_measured_idx").on(
      table.stationId,
      table.measuredAt,
    ),
    index("sensor_measurements_type_metric_measured_idx").on(
      table.sensorType,
      table.metric,
      table.measuredAt,
    ),
  ],
);

// ---------------------------------------------------------------------------
// Herbruikbare aggregatiekolommen voor de summary-tabellen
// ---------------------------------------------------------------------------

function summaryAggregateColumns() {
  return {
    temperatureMinC: temperatureC("temperature_min_c"),
    temperatureMaxC: temperatureC("temperature_max_c"),
    temperatureAvgC: temperatureC("temperature_avg_c"),
    humidityMinPct: humidityPct("humidity_min_pct"),
    humidityMaxPct: humidityPct("humidity_max_pct"),
    humidityAvgPct: humidityPct("humidity_avg_pct"),
    pressureMinHpa: pressureHpa("pressure_min_hpa"),
    pressureMaxHpa: pressureHpa("pressure_max_hpa"),
    pressureAvgHpa: pressureHpa("pressure_avg_hpa"),
    windAvgKmh: windKmh("wind_avg_kmh"),
    windMaxKmh: windKmh("wind_max_kmh"),
    windGustMaxKmh: windKmh("wind_gust_max_kmh"),
    rainTotalMm: decimal("rain_total_mm", { precision: 8, scale: 2 }),
    rainRateMaxMmH: decimal("rain_rate_max_mm_h", { precision: 6, scale: 2 }),
    uvMax: decimal("uv_max", { precision: 3, scale: 1 }),
    solarRadiationMaxWm2: decimal("solar_radiation_max_wm2", { precision: 6, scale: 1 }),
    observationCount: int("observation_count", { unsigned: true }).notNull().default(0),
    expectedObservationCount: int("expected_observation_count", { unsigned: true }),
    coveragePct: decimal("coverage_pct", { precision: 5, scale: 2 }),
  };
}

// ---------------------------------------------------------------------------
// daily_weather_summary
// ---------------------------------------------------------------------------

export const dailyWeatherSummary = mysqlTable(
  "daily_weather_summary",
  {
    id: id(),
    stationId: bigint("station_id", { mode: "number", unsigned: true })
      .notNull()
      .references(() => stations.id),
    /** Lokale kalenderdatum (Europe/Amsterdam), bv. "2026-09-04". */
    localDate: date("local_date", { mode: "string" }).notNull(),
    ...summaryAggregateColumns(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("daily_summary_station_date_unique").on(table.stationId, table.localDate),
  ],
);

// ---------------------------------------------------------------------------
// monthly_weather_summary
// ---------------------------------------------------------------------------

export const monthlyWeatherSummary = mysqlTable(
  "monthly_weather_summary",
  {
    id: id(),
    stationId: bigint("station_id", { mode: "number", unsigned: true })
      .notNull()
      .references(() => stations.id),
    year: smallint("year", { unsigned: true }).notNull(),
    /** 1 t/m 12. */
    month: tinyint("month", { unsigned: true }).notNull(),
    ...summaryAggregateColumns(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("monthly_summary_station_year_month_unique").on(
      table.stationId,
      table.year,
      table.month,
    ),
  ],
);

// ---------------------------------------------------------------------------
// yearly_weather_summary
// ---------------------------------------------------------------------------

export const yearlyWeatherSummary = mysqlTable(
  "yearly_weather_summary",
  {
    id: id(),
    stationId: bigint("station_id", { mode: "number", unsigned: true })
      .notNull()
      .references(() => stations.id),
    year: smallint("year", { unsigned: true }).notNull(),
    ...summaryAggregateColumns(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("yearly_summary_station_year_unique").on(table.stationId, table.year),
  ],
);

// ---------------------------------------------------------------------------
// app_settings
// ---------------------------------------------------------------------------

export const appSettings = mysqlTable(
  "app_settings",
  {
    id: id(),
    settingKey: varchar("setting_key", { length: 120 }).notNull(),
    value: json("value").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [uniqueIndex("app_settings_key_unique").on(table.settingKey)],
);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Station = typeof stations.$inferSelect;
export type NewStation = typeof stations.$inferInsert;

export type RawWeatherPacket = typeof rawWeatherPackets.$inferSelect;
export type NewRawWeatherPacket = typeof rawWeatherPackets.$inferInsert;

export type WeatherObservation = typeof weatherObservations.$inferSelect;
export type NewWeatherObservation = typeof weatherObservations.$inferInsert;

export type SensorMeasurement = typeof sensorMeasurements.$inferSelect;
export type NewSensorMeasurement = typeof sensorMeasurements.$inferInsert;

export type DailyWeatherSummary = typeof dailyWeatherSummary.$inferSelect;
export type MonthlyWeatherSummary = typeof monthlyWeatherSummary.$inferSelect;
export type YearlyWeatherSummary = typeof yearlyWeatherSummary.$inferSelect;

export type AppSetting = typeof appSettings.$inferSelect;
export type NewAppSetting = typeof appSettings.$inferInsert;

/** Handig verzamelobject, bv. voor drizzle-kit of generieke helpers. */
export const schema = {
  stations,
  rawWeatherPackets,
  weatherObservations,
  sensorMeasurements,
  dailyWeatherSummary,
  monthlyWeatherSummary,
  yearlyWeatherSummary,
  appSettings,
};

// sql import wordt hierboven niet direct gebruikt maar blijft beschikbaar
// voor toekomstige generated/default kolommen (bv. sql`(uuid())`).
export { sql };
