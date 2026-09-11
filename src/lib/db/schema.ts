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
  foreignKey,
  index,
  int,
  json,
  mediumtext,
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
    /**
     * Fase 5 — MENSELIJKE identiteit, leidend in de UI (bv. "Achtertuin").
     * Voorheen kolom `name` (Fase 1-4); hernoemd naar `display_name` om het
     * expliciete onderscheid met de TECHNISCHE identiteit (`stationIdentifier`
     * / `macAddress` / `model`) te benadrukken — zie migratie 0003. Bestaande
     * waarden (bv. "Mijn Alecto WS5500") blijven ongewijzigd staan; alleen de
     * kolomnaam verandert.
     */
    displayName: varchar("display_name", { length: 120 }).notNull(),
    slug: varchar("slug", { length: 140 }).notNull(),
    manufacturer: varchar("manufacturer", { length: 80 }).notNull().default("Alecto"),
    model: varchar("model", { length: 80 }).notNull().default("WS5500"),
    /**
     * Welke providerintegratie dit station bedient (Fase 5). Op dit moment is
     * `"ecowitt_cloud"` de enige ondersteunde waarde — expliciet vastgelegd
     * per station (i.p.v. impliciet aangenomen) zodat `pollAllActiveEcowitt
     * Stations()` (zie `src/lib/weather/providers/ecowitt-cloud.ts`) precies
     * weet welke actieve stations het moet pollen, zonder aannames.
     */
    provider: varchar("provider", { length: 40 }).notNull().default("ecowitt_cloud"),
    /** Eigen/externe identifier van het station (bv. Ecowitt device id/PASSKEY). */
    stationIdentifier: varchar("station_identifier", { length: 120 }).notNull(),
    /**
     * MAC-adres — dient bij de Ecowitt Cloud-provider tevens als
     * `providerDeviceId` (het `mac`-queryparameter waarmee het specifieke
     * device bij Ecowitt wordt opgevraagd, zie ecowitt-cloud.ts).
     */
    macAddress: varchar("mac_address", { length: 17 }),
    /**
     * Fase 6 — EIGEN Ecowitt Cloud-sleutels voor dit station, alleen nodig
     * als dit station bij een ANDER Ecowitt.net-account hoort dan de
     * gedeelde `ECOWITT_APPLICATION_KEY`/`ECOWITT_API_KEY` (environment-
     * variabelen, zie env.ts). Beide NULL (het gangbare geval — één account
     * bedient meerdere eigen stations) betekent: val terug op die gedeelde
     * sleutel, exact het gedrag van vóór Fase 6. Zie `fetchCurrent()` in
     * ecowitt-cloud.ts voor de terugval-logica.
     */
    ecowittApplicationKey: varchar("ecowitt_application_key", { length: 80 }),
    ecowittApiKey: varchar("ecowitt_api_key", { length: 80 }),
    /** Firmwareversie, indien bekend (bv. uit de laatste geslaagde poll) — puur informatief. */
    firmwareVersion: varchar("firmware_version", { length: 60 }),
    timezone: varchar("timezone", { length: 64 }).notNull().default("Europe/Amsterdam"),
    /** Vrije locatieomschrijving voor de gebruiker (bv. "Achtertuin, bij de schutting"). */
    locationDescription: varchar("location_description", { length: 160 }),
    latitude: decimal("latitude", { precision: 9, scale: 6 }),
    longitude: decimal("longitude", { precision: 9, scale: 6 }),
    elevationM: decimal("elevation_m", { precision: 6, scale: 1 }),
    expectedUploadIntervalSeconds: int("expected_upload_interval_seconds", {
      unsigned: true,
    })
      .notNull()
      .default(60),
    isActive: boolean("is_active").notNull().default(true),
    /**
     * Fase 5 — precies één station mag `true` zijn (afgedwongen in de
     * applicatielaag via `setDefaultStation()`, transactioneel: nieuwe default
     * → alle andere stations expliciet naar `false`, zie queries.ts). Bepaalt
     * welk station getoond wordt zonder expliciete `?station=`-keuze.
     */
    isDefault: boolean("is_default").notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("stations_slug_unique").on(table.slug),
    uniqueIndex("stations_station_identifier_unique").on(table.stationIdentifier),
    // Fase 5: met meerdere stations moet de database zelf voorkomen dat twee
    // stations per ongeluk hetzelfde MAC-adres krijgen (zou de Ecowitt Cloud-
    // provider en/of de ingestie-matching in de war kunnen brengen — zie
    // findStationByIdentifier() in queries.ts). NULL blijft toegestaan
    // (meerdere stations zonder mac_address kunnen naast elkaar bestaan) —
    // MySQL/TiDB staat dat toe binnen een unieke index.
    uniqueIndex("stations_mac_address_unique").on(table.macAddress),
  ],
);

// ---------------------------------------------------------------------------
// raw_weather_packets — ongewijzigde, originele payloads
// ---------------------------------------------------------------------------

/**
 * Verwerkingsstatus van een ruw pakket (Fase 2).
 *
 * - "received"   → opgeslagen, nog niet (verder) verwerkt.
 * - "normalized" → volledig geparsed, station herkend, meting opgeslagen.
 * - "partial"    → station herkend en meting opgeslagen, maar met
 *                  kanttekeningen (onbekende/afgekeurde velden, zie
 *                  `unknownFields`/`processingError`). Geen dataverlies —
 *                  wél een signaal om de parser te verfijnen.
 * - "failed"     → kon niet tot een bruikbare meting komen (bv. onbekende
 *                  station-identifier, of geen enkel herkend meetveld). De
 *                  ruwe payload blijft hoe dan ook bewaard.
 * - "duplicate"  → payload (hash) is al eerder exact zo ontvangen voor dit
 *                  station; niet opnieuw verwerkt om dubbele metingen te
 *                  voorkomen, maar wel als apart pakket bewaard (audit-trail).
 */
export const rawWeatherPacketProcessingStatus = [
  "received",
  "normalized",
  "partial",
  "failed",
  "duplicate",
] as const;

export const rawWeatherPackets = mysqlTable(
  "raw_weather_packets",
  {
    id: id(),
    /**
     * Nullable: een payload met een geldig ingest-secret maar een
     * onbekende/niet-vooraf-geregistreerde station-identifier wordt SOM
     * ongewijzigd bewaard (voor diagnose) met `stationId = null` — er wordt
     * nooit automatisch een nieuw station aangemaakt.
     */
    stationId: bigint("station_id", { mode: "number", unsigned: true }).references(
      () => stations.id,
    ),
    receivedAt: timestamp("received_at", { mode: "date", fsp: 3 }).notNull().defaultNow(),
    /**
     * Herkomst van de payload, bv. "ecowitt_push", "ecowitt_cloud_api",
     * "demo_generator", "manual_seed".
     */
    source: varchar("source", { length: 40 }).notNull(),
    /** HTTP-methode waarmee de payload binnenkwam ("POST"/"GET"), indien van toepassing. */
    httpMethod: varchar("http_method", { length: 10 }),
    /** Timestamp zoals door het station/de bron zelf gerapporteerd, indien aanwezig (UTC). */
    remoteTimestamp: timestamp("remote_timestamp", { mode: "date", fsp: 3 }),
    contentType: varchar("content_type", { length: 80 }),
    /**
     * De ruwe payload als key/value-object (form-urlencoded/query/JSON-velden
     * ongewijzigd overgenomen, alleen samengevoegd tot één structuur — geen
     * enkele waarde wordt geïnterpreteerd of gewijzigd).
     */
    rawPayload: json("raw_payload").notNull(),
    /** Exacte, ongewijzigde request-body (indien aanwezig) voor volledige reproduceerbaarheid. */
    rawBodyText: mediumtext("raw_body_text"),
    /** Herkomstadres van de aanvraag — uitsluitend voor diagnose, nooit als beveiligingsmaatregel. */
    remoteAddress: varchar("remote_address", { length: 64 }),
    /** SHA-256 hex van de (gecanonicaliseerde) ruwe payload, voor deduplicatie/debugging. */
    payloadHash: varchar("payload_hash", { length: 64 }),
    parserVersion: varchar("parser_version", { length: 20 }),
    processingStatus: mysqlEnum("processing_status", rawWeatherPacketProcessingStatus)
      .notNull()
      .default("received"),
    processingError: varchar("processing_error", { length: 2000 }),
    /** Velden uit de payload die de parser niet herkende (voor diagnose/toekomstige uitbreiding). */
    unknownFields: json("unknown_fields"),
    /** Niet-kritieke parser-waarschuwingen (bv. een veld buiten een plausibel bereik). */
    parseWarnings: json("parse_warnings"),
    createdAt: createdAt(),
  },
  (table) => [
    index("raw_packets_station_received_idx").on(table.stationId, table.receivedAt),
    index("raw_packets_payload_hash_idx").on(table.payloadHash),
    // Fase 5: expliciete samengestelde index voor de per-station deduplicatie
    // in `findDuplicateRawPacket()` (queries.ts) — die query filterde al
    // correct op (station_id, payload_hash) samen, maar kon tot nu toe alleen
    // de losse `payload_hash`-index gebruiken. Met meerdere stations kan
    // dezelfde hash (toevallig) bij verschillende stations voorkomen; deze
    // index laat TiDB dan direct de juiste (kleine) subset scannen i.p.v. alle
    // rijen met die hash over alle stations.
    index("raw_packets_station_payload_hash_idx").on(table.stationId, table.payloadHash),
    index("raw_packets_status_idx").on(table.processingStatus),
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
    // Fase 3 — records-pagina: elke recordquery is een "ORDER BY <kolom>
    // DESC/ASC LIMIT 1" binnen een stations-/periodefilter (zie
    // `getWeatherRecords()` in `src/lib/db/queries.ts`). Deze samengestelde
    // indexen laten TiDB die sortering direct via de index doen in plaats
    // van een volledige tabelscan — noodzakelijk zodra de tabel jaren aan
    // 5-minuutmetingen bevat. Er wordt bewust NOOIT `Math.max()` over een
    // volledige in-memory dataset gebruikt (expliciete Fase 3-eis).
    index("observations_station_temp_idx").on(table.stationId, table.temperatureOutdoorC),
    index("observations_station_wind_gust_idx").on(table.stationId, table.windGustKmh),
    index("observations_station_wind_speed_idx").on(table.stationId, table.windSpeedKmh),
    index("observations_station_rain_rate_idx").on(table.stationId, table.rainRateMmH),
    index("observations_station_pressure_idx").on(
      table.stationId,
      table.pressureRelativeHpa,
    ),
    index("observations_station_humidity_idx").on(
      table.stationId,
      table.humidityOutdoorPct,
    ),
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
// weather_provider_state — bijhouden van pull-based providers (Ecowitt Cloud)
// ---------------------------------------------------------------------------

/**
 * Eén rij per (station, provider): bewaart wanneer een pull-based provider
 * (bv. de Ecowitt Cloud API) voor het laatst is bevraagd, wanneer dat voor
 * het laatst lukte, en de hash van de laatst verwerkte meting. Dit is nodig
 * omdat de Ecowitt Cloud API een "huidige stand"-endpoint is: zonder deze
 * bijhoudtabel zou elke poll dezelfde meting opnieuw als "nieuw" behandelen.
 */
export const weatherProviderState = mysqlTable(
  "weather_provider_state",
  {
    id: id(),
    stationId: bigint("station_id", { mode: "number", unsigned: true })
      .notNull()
      .references(() => stations.id),
    /** Bv. "ecowitt_cloud". */
    provider: varchar("provider", { length: 40 }).notNull(),
    lastPolledAt: timestamp("last_polled_at", { mode: "date", fsp: 3 }),
    lastSuccessAt: timestamp("last_success_at", { mode: "date", fsp: 3 }),
    lastErrorAt: timestamp("last_error_at", { mode: "date", fsp: 3 }),
    lastError: varchar("last_error", { length: 2000 }),
    lastPayloadHash: varchar("last_payload_hash", { length: 64 }),
    lastRawPacketId: bigint("last_raw_packet_id", { mode: "number", unsigned: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("provider_state_station_provider_unique").on(
      table.stationId,
      table.provider,
    ),
    // Expliciete, korte naam: de automatisch afgeleide naam
    // ("weather_provider_state_last_raw_packet_id_raw_weather_packets_id_fk")
    // overschrijdt MySQL/TiDB's limiet van 64 tekens voor identifiers.
    foreignKey({
      name: "provider_state_last_packet_fk",
      columns: [table.lastRawPacketId],
      foreignColumns: [rawWeatherPackets.id],
    }),
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
export type RawWeatherPacketProcessingStatus =
  (typeof rawWeatherPacketProcessingStatus)[number];

export type ObservationQualityStatus = (typeof observationQualityStatus)[number];

export type WeatherObservation = typeof weatherObservations.$inferSelect;
export type NewWeatherObservation = typeof weatherObservations.$inferInsert;

export type SensorMeasurement = typeof sensorMeasurements.$inferSelect;
export type NewSensorMeasurement = typeof sensorMeasurements.$inferInsert;

export type WeatherProviderState = typeof weatherProviderState.$inferSelect;
export type NewWeatherProviderState = typeof weatherProviderState.$inferInsert;

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
  weatherProviderState,
  dailyWeatherSummary,
  monthlyWeatherSummary,
  yearlyWeatherSummary,
  appSettings,
};

// sql import wordt hierboven niet direct gebruikt maar blijft beschikbaar
// voor toekomstige generated/default kolommen (bv. sql`(uuid())`).
export { sql };
