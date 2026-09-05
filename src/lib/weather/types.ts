/**
 * Gedeelde types voor de weerdata-ingestie (Fase 2).
 *
 * De ingestieflow bestaat uit twee onafhankelijke stappen die bewust NIET in
 * de route-handlers zelf staan (zie docs/WS5500_INGESTION.md):
 *
 * 1. Een parser (`src/lib/weather/ecowitt/parse.ts`) zet een ruwe,
 *    key/value-payload (welke vorm dan ook — form-urlencoded, query-string
 *    of JSON, altijd al omgezet naar een plat object) om naar een
 *    `ParsedWeatherPacket`: een tussenvorm in metrische eenheden, met
 *    expliciete metadata over wat wél en niet herkend is.
 * 2. Een normalisatiestap (`src/lib/weather/normalize.ts`) zet die
 *    `ParsedWeatherPacket` om naar rijen voor `weather_observations` en
 *    `sensor_measurements`.
 *
 * Zowel de directe push-ingestie (`/api/weather/ingest/[secret]`) als de
 * Ecowitt Cloud-provider herbruiken exact dezelfde parser/normalisatielaag —
 * de providers leveren allebei alleen een plat, Ecowitt-achtig key/value-
 * object aan (zie `src/lib/weather/providers/`).
 */

/** Ruwe, nog niet geïnterpreteerde payload: alle velden als string/number/boolean. */
export type RawFieldValue = string | number | boolean | null | undefined;
export type RawPayload = Record<string, RawFieldValue>;

/**
 * Kwaliteitsoordeel van de parser over het geheel van de payload.
 * Zie ook `observationQualityStatus` in `src/lib/db/schema.ts` — deze
 * waarden komen bewust overeen.
 */
export type ParsedQualityStatus = "ok" | "estimated" | "suspect" | "missing";

/** Eén generieke sensormeting (batterij, extra kanaal, bodemvocht, enz.). */
export interface ParsedSensorMeasurement {
  /** Bv. "battery", "soil_moisture", "pm25", "leak", "extra_temperature". */
  sensorType: string;
  /** Kanaalnummer voor sensoren met meerdere kanalen, indien van toepassing. */
  channel?: number;
  /** Bv. "battery_ok", "battery_voltage", "moisture_pct", "concentration_ugm3". */
  metric: string;
  valueNumeric?: number;
  valueText?: string;
  unit?: string;
  /** Herleidbaarheid: het originele veld waaruit deze meting is afgeleid. */
  sourceField: string;
}

/**
 * De genormaliseerde hoofdmeting, in exact dezelfde vorm/eenheden als de
 * kolommen van `weather_observations` (zie `src/lib/db/schema.ts`), maar nog
 * los van een concrete `stationId`/`rawPacketId`.
 */
export interface ParsedObservationFields {
  temperatureOutdoorC?: number;
  temperatureIndoorC?: number;
  humidityOutdoorPct?: number;
  humidityIndoorPct?: number;
  dewPointC?: number;
  feelsLikeC?: number;
  windChillC?: number;
  heatIndexC?: number;
  pressureAbsoluteHpa?: number;
  pressureRelativeHpa?: number;
  windSpeedKmh?: number;
  windGustKmh?: number;
  windDirectionDeg?: number;
  rainRateMmH?: number;
  rainEventMm?: number;
  rainHourMm?: number;
  rainDayMm?: number;
  rainWeekMm?: number;
  rainMonthMm?: number;
  rainYearMm?: number;
  rainTotalMm?: number;
  uvIndex?: number;
  solarRadiationWm2?: number;
}

/** Resultaat van het parsen van één ruwe payload. */
export interface ParsedWeatherPacket {
  /** Tijdstip van de meting zelf, in UTC. */
  measuredAt: Date;
  /** Hoe `measuredAt` bepaald is — puur voor diagnose/logging. */
  measuredAtSource: "dateutc" | "dateutc_now" | "received_at_fallback" | "epoch_seconds";
  observation: ParsedObservationFields;
  sensors: ParsedSensorMeasurement[];
  /** Namen van alle payload-velden die de parser heeft herkend (metadata + meetwaarden). */
  recognizedFields: string[];
  /**
   * Velden die de parser niet herkende: geen bekende metadata (PASSKEY,
   * stationtype, dateutc, ...) en geen match met een bekend meetveld/
   * kanaalpatroon. Deze payload-inhoud gaat NOOIT verloren (hij staat al
   * ongewijzigd in `raw_weather_packets.raw_payload`) — dit is puur een
   * kant-en-klare lijst voor diagnose en toekomstige parser-uitbreiding.
   */
  unknownFields: RawPayload;
  /** Niet-kritieke waarschuwingen (bv. een waarde buiten een plausibel bereik, genegeerd). */
  warnings: string[];
  /** Algeheel kwaliteitsoordeel voor de (toekomstige) `weather_observations`-rij. */
  quality: ParsedQualityStatus;
}

/** Resultaat van één ophaalpoging door een `WeatherDataProvider`. */
export type ProviderFetchResult =
  | {
      ok: true;
      /** Plat key/value-object, in dezelfde velden/eenheden als het Ecowitt push-protocol. */
      rawPayload: RawPayload;
    }
  | {
      ok: false;
      error: string;
    };

/**
 * Gemeenschappelijke interface voor een (pull-based) weerdata-bron. De
 * Ecowitt Cloud API (`src/lib/weather/providers/ecowitt-cloud.ts`) is de
 * eerste/enige implementatie in Fase 2, maar deze interface houdt de deur
 * open voor een andere bron in een latere fase zonder de ingestie-pijplijn
 * te hoeven aanpassen.
 */
export interface WeatherDataProvider {
  readonly name: string;
  fetchCurrent(): Promise<ProviderFetchResult>;
}
