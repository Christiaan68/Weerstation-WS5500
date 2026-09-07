/**
 * Server-side service/repository-laag.
 *
 * Doel: pagina's en API-routes praten met deze functies, niet rechtstreeks
 * met `db`/Drizzle. Dat houdt querylogica op één plek en maakt het later
 * eenvoudig om caching, logging of extra validatie toe te voegen zonder
 * elke pagina aan te passen.
 *
 * Zie `src/lib/db/index.ts` voor waarom dit bestand bewust GEEN
 * `import "server-only"` gebruikt (deze functies worden ook vanuit losse
 * scripts aangeroepen, buiten Next.js' bundler om).
 */
import { and, asc, count, desc, eq, isNotNull, isNull, or, sql } from "drizzle-orm";
import type { AnyMySqlColumn } from "drizzle-orm/mysql-core";

import { db, pingDatabase } from "@/lib/db";
import {
  dailyWeatherSummary,
  monthlyWeatherSummary,
  rawWeatherPackets,
  sensorMeasurements,
  stations,
  weatherObservations,
  weatherProviderState,
  yearlyWeatherSummary,
} from "@/lib/db/schema";
import type {
  DailyWeatherSummary,
  MonthlyWeatherSummary,
  NewRawWeatherPacket,
  NewSensorMeasurement,
  NewWeatherObservation,
  ObservationQualityStatus,
  RawWeatherPacket,
  RawWeatherPacketProcessingStatus,
  SensorMeasurement,
  Station,
  WeatherObservation,
  WeatherProviderState,
  YearlyWeatherSummary,
} from "@/lib/db/schema";

/**
 * Haalt één weerstation op — de centrale station-resolutiefunctie voor alle
 * pagina's en API-routes (Fase 5).
 *
 * `slugOrId` mag zijn:
 * - een slug (bv. "achtertuin") — exacte match op `stations.slug`;
 * - een numerieke id als string (bv. "3") — exacte match op `stations.id`,
 *   zodat `?station=<id>` net zo goed werkt als `?station=<slug>` (Fase 5,
 *   §36: "station=<slug-or-id>");
 * - weggelaten — dan geldt de DEFAULT-stationlogica: eerst het station met
 *   `isDefault = true`, en als (nog) geen enkel station als default is
 *   gemarkeerd (bv. een installatie van vóór Fase 5, of tussen migratie en
 *   backfill in) de oudste ACTIEVE station — exact hetzelfde gedrag als vóór
 *   Fase 5. Voor een bestaande, ongewijzigde single-station-installatie is
 *   dit dus altijd hetzelfde station als voorheen (zie migratie 0003, die het
 *   bestaande station meteen default maakt).
 */
export async function getStation(slugOrId?: string): Promise<Station | undefined> {
  if (slugOrId) {
    const isNumericId = /^\d+$/.test(slugOrId);
    const rows = isNumericId
      ? await db
          .select()
          .from(stations)
          .where(eq(stations.id, Number(slugOrId)))
          .limit(1)
      : await db.select().from(stations).where(eq(stations.slug, slugOrId)).limit(1);
    return rows[0];
  }

  const defaultRows = await db
    .select()
    .from(stations)
    .where(and(eq(stations.isActive, true), eq(stations.isDefault, true)))
    .orderBy(stations.id)
    .limit(1);
  if (defaultRows[0]) return defaultRows[0];

  const fallbackRows = await db
    .select()
    .from(stations)
    .where(eq(stations.isActive, true))
    .orderBy(stations.id)
    .limit(1);

  return fallbackRows[0];
}

/**
 * Alle stations, standaard alleen actieve — voor de (toekomstige)
 * stationselector en het stationbeheer (`/admin/stations`, Fase 5). Actieve
 * stations eerst gesorteerd op weergavenaam (menselijk leesbare volgorde in
 * een selector), gevolgd door eventuele inactieve stations wanneer
 * `includeInactive` gezet is (bv. voor de admin-lijst, die ook gearchiveerde
 * stations moet tonen).
 */
export async function getStations(options?: { includeInactive?: boolean }): Promise<Station[]> {
  const rows = options?.includeInactive
    ? await db.select().from(stations).orderBy(stations.displayName)
    : await db
        .select()
        .from(stations)
        .where(eq(stations.isActive, true))
        .orderBy(stations.displayName);
  return rows;
}

/** Eén station op numerieke id — voor stationbeheer (bewerken/verbinding testen). */
export async function getStationById(id: number): Promise<Station | undefined> {
  const rows = await db.select().from(stations).where(eq(stations.id, id)).limit(1);
  return rows[0];
}

/**
 * Maakt het opgegeven station het (enige) default-station: transactioneel
 * eerst alle andere stations naar `isDefault = false`, dan dit station naar
 * `true` — zodat er nooit een moment is waarop nul of meerdere stations
 * default zijn (Fase 5, §76). Gooit een fout als het station niet bestaat.
 */
export async function setDefaultStation(id: number): Promise<void> {
  await db.transaction(async (tx) => {
    const existing = await tx
      .select({ id: stations.id })
      .from(stations)
      .where(eq(stations.id, id))
      .limit(1);
    if (existing.length === 0) {
      throw new Error(`Station #${id} bestaat niet.`);
    }
    await tx.update(stations).set({ isDefault: false }).where(eq(stations.isDefault, true));
    await tx.update(stations).set({ isDefault: true }).where(eq(stations.id, id));
  });
}

export interface NewStationInput {
  displayName: string;
  slug: string;
  manufacturer?: string;
  model?: string;
  provider?: string;
  stationIdentifier: string;
  macAddress?: string | null;
  timezone?: string;
  locationDescription?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  elevationM?: number | null;
  expectedUploadIntervalSeconds?: number;
  isActive?: boolean;
}

/**
 * Maakt een nieuw station aan (Fase 5 station-onboarding, `/admin/stations`).
 * Maakt NOOIT automatisch het eerste/default-station aan — dat gebeurt
 * expliciet via `setDefaultStation()`, zodat er nooit per ongeluk twee
 * stations tegelijk default zijn.
 */
export async function createStation(input: NewStationInput): Promise<number> {
  const result = await db.insert(stations).values({
    displayName: input.displayName,
    slug: input.slug,
    manufacturer: input.manufacturer ?? "Ecowitt",
    model: input.model ?? "Onbekend",
    provider: input.provider ?? "ecowitt_cloud",
    stationIdentifier: input.stationIdentifier,
    macAddress: input.macAddress ?? null,
    timezone: input.timezone ?? "Europe/Amsterdam",
    locationDescription: input.locationDescription ?? null,
    latitude: input.latitude !== null && input.latitude !== undefined ? String(input.latitude) : null,
    longitude:
      input.longitude !== null && input.longitude !== undefined ? String(input.longitude) : null,
    elevationM:
      input.elevationM !== null && input.elevationM !== undefined ? String(input.elevationM) : null,
    expectedUploadIntervalSeconds: input.expectedUploadIntervalSeconds ?? 300,
    isActive: input.isActive ?? true,
  });
  return Number(result[0].insertId);
}

export interface StationPatch {
  displayName?: string;
  locationDescription?: string | null;
  timezone?: string;
  expectedUploadIntervalSeconds?: number;
  isActive?: boolean;
  macAddress?: string | null;
  stationIdentifier?: string;
  firmwareVersion?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  elevationM?: number | null;
}

/**
 * Werkt stationinstellingen bij (Fase 5, §26 — stationbeheer). Bevat bewust
 * GEEN `isDefault`/`slug`-veld: de default-status verloopt uitsluitend via
 * `setDefaultStation()` (transactionele uniciteit), en de slug is de stabiele
 * URL-identifier die na aanmaken niet meer via deze algemene patch-functie
 * wijzigt (voorkomt per ongeluk brekende bookmarks/links, zie §9).
 */
export async function updateStation(id: number, patch: StationPatch): Promise<void> {
  const values: Record<string, unknown> = {};
  if (patch.displayName !== undefined) values.displayName = patch.displayName;
  if (patch.locationDescription !== undefined)
    values.locationDescription = patch.locationDescription;
  if (patch.timezone !== undefined) values.timezone = patch.timezone;
  if (patch.expectedUploadIntervalSeconds !== undefined)
    values.expectedUploadIntervalSeconds = patch.expectedUploadIntervalSeconds;
  if (patch.isActive !== undefined) values.isActive = patch.isActive;
  if (patch.macAddress !== undefined) values.macAddress = patch.macAddress;
  if (patch.stationIdentifier !== undefined) values.stationIdentifier = patch.stationIdentifier;
  if (patch.firmwareVersion !== undefined) values.firmwareVersion = patch.firmwareVersion;
  if (patch.latitude !== undefined)
    values.latitude = patch.latitude === null ? null : String(patch.latitude);
  if (patch.longitude !== undefined)
    values.longitude = patch.longitude === null ? null : String(patch.longitude);
  if (patch.elevationM !== undefined)
    values.elevationM = patch.elevationM === null ? null : String(patch.elevationM);

  if (Object.keys(values).length === 0) return;
  await db.update(stations).set(values).where(eq(stations.id, id));
}

/**
 * Unieke sensortypes die dit station ooit gerapporteerd heeft, via de
 * generieke `sensor_measurements`-tabel — basis voor de capability-laag
 * (`src/lib/weather/capabilities.ts`, Fase 5, §18): welke EXTRA sensoren
 * (bodemvocht, PM2.5, bliksem, ...) dit specifieke station daadwerkelijk
 * levert, i.p.v. dit te verzinnen/aan te nemen.
 */
export async function listDistinctSensorTypesForStation(stationId: number): Promise<string[]> {
  const rows = await db
    .selectDistinct({ sensorType: sensorMeasurements.sensorType })
    .from(sensorMeasurements)
    .where(eq(sensorMeasurements.stationId, stationId));
  return rows.map((row) => row.sensorType).sort();
}

/** Meest recente genormaliseerde meting voor een station, indien aanwezig. */
export async function getLatestObservation(
  stationId: number,
): Promise<WeatherObservation | undefined> {
  const rows = await db
    .select()
    .from(weatherObservations)
    .where(eq(weatherObservations.stationId, stationId))
    .orderBy(desc(weatherObservations.measuredAt))
    .limit(1);

  return rows[0];
}

/** Totaal aantal metingen voor een station (voor dashboard/statistieken). */
export async function getObservationCount(stationId: number): Promise<number> {
  const rows = await db
    .select({ value: count() })
    .from(weatherObservations)
    .where(eq(weatherObservations.stationId, stationId));

  return rows[0]?.value ?? 0;
}

export type DatabaseHealth =
  { status: "ok"; latencyMs: number } | { status: "error"; error: string };

/** Gestructureerde databasestatus, gebruikt door `/api/health` en de UI. */
export async function getDatabaseHealth(): Promise<DatabaseHealth> {
  const result = await pingDatabase();

  if (result.ok) {
    return { status: "ok", latencyMs: result.latencyMs };
  }

  return { status: "error", error: result.error };
}

// ---------------------------------------------------------------------------
// Fase 2 — data-ingestie
// ---------------------------------------------------------------------------

/**
 * Zoekt een VOORAF GEREGISTREERD station op zijn externe identifier. Matcht
 * zowel op `station_identifier` (bv. de Ecowitt `PASSKEY`, gebruikt door de
 * rechtstreekse push) als op `mac_address` (gebruikt door de Ecowitt
 * Cloud-provider, die zelf geen PASSKEY teruggeeft — zie
 * `src/lib/weather/providers/ecowitt-cloud.ts`). Geeft `undefined` terug als
 * er geen match is — er wordt hier bewust NOOIT een nieuw station
 * aangemaakt (zie docs/WS5500_INGESTION.md §Beveiliging).
 */
export async function findStationByIdentifier(
  identifier: string,
): Promise<Station | undefined> {
  const rows = await db
    .select()
    .from(stations)
    .where(
      or(eq(stations.stationIdentifier, identifier), eq(stations.macAddress, identifier)),
    )
    .limit(1);

  return rows[0];
}

/**
 * Als er geen bruikbare identifier in de payload zit, valt de ingestie
 * terug op "het enige actieve station" — praktisch voor de meeste
 * particuliere installaties (één station), zonder ooit automatisch een
 * station aan te maken. Bij meerdere actieve stations is dit bewust géén
 * bruikbare fallback (dan moet de payload een identifier bevatten).
 */
export async function findSoleActiveStation(): Promise<Station | undefined> {
  const rows = await db
    .select()
    .from(stations)
    .where(eq(stations.isActive, true))
    .orderBy(stations.id)
    .limit(2);

  return rows.length === 1 ? rows[0] : undefined;
}

/**
 * Zoekt een eerder ontvangen pakket met exact dezelfde payload-hash voor dit
 * station (of, als er nog geen station gekoppeld kon worden, zonder
 * stationfilter). Gebruikt voor hash-gebaseerde deduplicatie — zie
 * `src/lib/weather/hash.ts`.
 */
export async function findDuplicateRawPacket(
  stationId: number | null,
  payloadHash: string,
): Promise<{ id: number } | undefined> {
  const rows = await db
    .select({ id: rawWeatherPackets.id })
    .from(rawWeatherPackets)
    .where(
      stationId === null
        ? and(
            isNull(rawWeatherPackets.stationId),
            eq(rawWeatherPackets.payloadHash, payloadHash),
          )
        : and(
            eq(rawWeatherPackets.stationId, stationId),
            eq(rawWeatherPackets.payloadHash, payloadHash),
          ),
    )
    .orderBy(desc(rawWeatherPackets.id))
    .limit(1);

  return rows[0];
}

/** Slaat een ruw pakket op. Geeft het nieuwe id terug. */
export async function insertRawPacket(data: NewRawWeatherPacket): Promise<number> {
  const result = await db.insert(rawWeatherPackets).values(data);
  return Number(result[0].insertId);
}

/** Werkt de verwerkingsstatus (en bijbehorende diagnosevelden) van een ruw pakket bij. */
export async function updateRawPacketProcessing(
  id: number,
  patch: {
    stationId?: number | null;
    processingStatus: RawWeatherPacketProcessingStatus;
    processingError?: string | null;
    parserVersion?: string | null;
    unknownFields?: Record<string, unknown> | null;
    parseWarnings?: string[] | null;
    remoteTimestamp?: Date | null;
  },
): Promise<void> {
  await db.update(rawWeatherPackets).set(patch).where(eq(rawWeatherPackets.id, id));
}

/**
 * Schrijft een genormaliseerde meting plus bijbehorende sensor-metingen in
 * één transactie: óf beide slagen, óf geen van beide. Geeft het nieuwe
 * `weather_observations.id` terug.
 */
export async function insertObservationWithSensors(
  observation: NewWeatherObservation,
  sensors: Omit<NewSensorMeasurement, "observationId">[],
): Promise<number> {
  return db.transaction(async (tx) => {
    const result = await tx.insert(weatherObservations).values(observation);
    const observationId = Number(result[0].insertId);

    if (sensors.length > 0) {
      await tx
        .insert(sensorMeasurements)
        .values(sensors.map((sensor) => ({ ...sensor, observationId })));
    }

    return observationId;
  });
}

/**
 * Verwijdert een eerder afgeleide meting (en zijn sensor-metingen) — gebruikt
 * door `reprocessRawPacket()` (`npm run weather:reprocess`) om een pakket
 * met de huidige parserversie opnieuw te verwerken zonder een dubbele
 * meting achter te laten.
 */
export async function deleteObservationWithSensors(observationId: number): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .delete(sensorMeasurements)
      .where(eq(sensorMeasurements.observationId, observationId));
    await tx.delete(weatherObservations).where(eq(weatherObservations.id, observationId));
  });
}

/** Eén ruw pakket, voor de diagnosepagina (detailweergave). */
export async function getRawPacketById(
  id: number,
): Promise<RawWeatherPacket | undefined> {
  const rows = await db
    .select()
    .from(rawWeatherPackets)
    .where(eq(rawWeatherPackets.id, id))
    .limit(1);
  return rows[0];
}

/** Meest recente ruwe pakketten voor een station, nieuwste eerst — voor de diagnosepagina. */
export async function listRecentRawPackets(
  stationId: number,
  limit = 50,
): Promise<RawWeatherPacket[]> {
  return db
    .select()
    .from(rawWeatherPackets)
    .where(eq(rawWeatherPackets.stationId, stationId))
    .orderBy(desc(rawWeatherPackets.id))
    .limit(limit);
}

/**
 * Ruwe pakketten van een specifieke bron, ontvangen vóór een gegeven
 * tijdstip — gebruikt door reparatiescripts om AANTOONBAAR getroffen
 * pakketten te selecteren op basis van een bekend deploy-moment (bv.
 * `scripts/repair-temp-unitid-bug.mjs`), nooit op basis van giswerk over
 * plausibele waarden. Oudste eerst, zodat een script chronologisch kan
 * rapporteren.
 */
export async function listRawPacketsBySourceBefore(
  source: string,
  before: Date,
  limit = 1000,
): Promise<RawWeatherPacket[]> {
  return db
    .select()
    .from(rawWeatherPackets)
    .where(
      and(
        eq(rawWeatherPackets.source, source),
        sql`${rawWeatherPackets.receivedAt} < ${before}`,
      ),
    )
    .orderBy(rawWeatherPackets.receivedAt)
    .limit(limit);
}

/**
 * Meest recente pakketten die minstens één onbekend veld bevatten — over
 * alle stations heen. Gebruikt door `scripts/inspect-unknown-fields.ts` om
 * te bepalen welke velden de parser (`src/lib/weather/ecowitt/fields.ts`)
 * nog zou moeten leren kennen.
 */
export async function listRecentPacketsWithUnknownFields(
  limit = 200,
): Promise<RawWeatherPacket[]> {
  return db
    .select()
    .from(rawWeatherPackets)
    .where(sql`${rawWeatherPackets.unknownFields} is not null`)
    .orderBy(desc(rawWeatherPackets.id))
    .limit(limit);
}

/** Meest recente pakketten zonder gekoppeld station (onherkende identifier) — diagnose. */
export async function listRecentUnmatchedRawPackets(
  limit = 20,
): Promise<RawWeatherPacket[]> {
  return db
    .select()
    .from(rawWeatherPackets)
    .where(isNull(rawWeatherPackets.stationId))
    .orderBy(desc(rawWeatherPackets.id))
    .limit(limit);
}

/** Aantal ruwe pakketten per verwerkingsstatus voor een station — diagnose/statusoverzicht. */
export async function countRawPacketsByStatus(
  stationId: number,
): Promise<Record<string, number>> {
  const rows = await db
    .select({ status: rawWeatherPackets.processingStatus, value: count() })
    .from(rawWeatherPackets)
    .where(eq(rawWeatherPackets.stationId, stationId))
    .groupBy(rawWeatherPackets.processingStatus);

  return Object.fromEntries(rows.map((row) => [row.status, row.value]));
}

/** De genormaliseerde meting die (indien aanwezig) uit dit ruwe pakket is afgeleid. */
export async function getObservationByRawPacketId(
  rawPacketId: number,
): Promise<WeatherObservation | undefined> {
  const rows = await db
    .select()
    .from(weatherObservations)
    .where(eq(weatherObservations.rawPacketId, rawPacketId))
    .limit(1);

  return rows[0];
}

/** Sensor-metingen die bij één observatie horen (batterijen, extra kanalen, ...). */
export async function getSensorMeasurementsForObservation(
  observationId: number,
): Promise<SensorMeasurement[]> {
  return db
    .select()
    .from(sensorMeasurements)
    .where(eq(sensorMeasurements.observationId, observationId));
}

/** Bijhoudstatus van een pull-based provider (bv. Ecowitt Cloud) voor een station. */
export async function getProviderState(
  stationId: number,
  provider: string,
): Promise<WeatherProviderState | undefined> {
  const rows = await db
    .select()
    .from(weatherProviderState)
    .where(
      and(
        eq(weatherProviderState.stationId, stationId),
        eq(weatherProviderState.provider, provider),
      ),
    )
    .limit(1);

  return rows[0];
}

/** Maakt de providerstatus aan of werkt hem bij ("upsert" op (station, provider)). */
export async function upsertProviderState(
  stationId: number,
  provider: string,
  patch: {
    lastPolledAt: Date;
    lastSuccessAt?: Date;
    lastErrorAt?: Date;
    lastError?: string | null;
    lastPayloadHash?: string;
    lastRawPacketId?: number;
  },
): Promise<void> {
  await db
    .insert(weatherProviderState)
    .values({ stationId, provider, ...patch })
    .onDuplicateKeyUpdate({ set: patch });
}

/** Laatste ontvangsttijd van een ruw pakket voor een station — statusoverzicht. */
export async function getLastPacketReceivedAt(
  stationId: number,
): Promise<Date | undefined> {
  const rows = await db
    .select({ receivedAt: rawWeatherPackets.receivedAt })
    .from(rawWeatherPackets)
    .where(eq(rawWeatherPackets.stationId, stationId))
    .orderBy(desc(rawWeatherPackets.id))
    .limit(1);

  return rows[0]?.receivedAt;
}

/** Totaal aantal ruwe pakketten voor een station (alle statussen) — statusoverzicht. */
export async function getRawPacketCount(stationId: number): Promise<number> {
  const rows = await db
    .select({ value: count() })
    .from(rawWeatherPackets)
    .where(eq(rawWeatherPackets.stationId, stationId));

  return rows[0]?.value ?? 0;
}

// ---------------------------------------------------------------------------
// Fase 3 — records (SQL-side extremen, nooit Math.max() over een volledige
// in-memory dataset — expliciete Fase 3-eis)
// ---------------------------------------------------------------------------

export interface WeatherRecordPoint {
  value: number;
  measuredAt: Date;
}

export interface WeatherRecordsSet {
  temperatureMaxC: WeatherRecordPoint | null;
  temperatureMinC: WeatherRecordPoint | null;
  windGustMaxKmh: WeatherRecordPoint | null;
  windSpeedMaxKmh: WeatherRecordPoint | null;
  rainRateMaxMmH: WeatherRecordPoint | null;
  pressureMaxHpa: WeatherRecordPoint | null;
  pressureMinHpa: WeatherRecordPoint | null;
  humidityMaxPct: WeatherRecordPoint | null;
  humidityMinPct: WeatherRecordPoint | null;
}

/**
 * Zoekt de extreme waarde (en het tijdstip waarop die gemeten is) van één
 * kolom voor een station, optioneel binnen een tijdvak. Dit is een gewone
 * `ORDER BY <kolom> LIMIT 1`-query — TiDB doet de sortering/aggregatie
 * server-side (via de indexen uit migratie 0002), er wordt nooit de volledige
 * kolom naar de applicatie gehaald.
 */
async function selectExtremeObservation(
  stationId: number,
  column: AnyMySqlColumn,
  direction: "max" | "min",
  range?: { fromUtc: Date; toUtc: Date },
): Promise<WeatherRecordPoint | null> {
  const conditions = [eq(weatherObservations.stationId, stationId), isNotNull(column)];
  if (range) {
    conditions.push(sql`${weatherObservations.measuredAt} >= ${range.fromUtc}`);
    conditions.push(sql`${weatherObservations.measuredAt} < ${range.toUtc}`);
  }

  const rows = await db
    .select({ value: column, measuredAt: weatherObservations.measuredAt })
    .from(weatherObservations)
    .where(and(...conditions))
    .orderBy(direction === "max" ? desc(column) : asc(column))
    .limit(1);

  const row = rows[0];
  if (!row || row.value === null || row.value === undefined) return null;
  return { value: Number(row.value), measuredAt: row.measuredAt };
}

/**
 * Haalt de volledige recordset (temperatuur, wind, regenintensiteit, druk,
 * luchtvochtigheid — min/max met tijdstip) op voor een station, optioneel
 * beperkt tot een tijdvak (weglaten = all-time). Gebruikt door
 * `src/lib/weather/records.ts` voor de vandaag/maand/jaar/all-time-varianten
 * op de `/records`-pagina.
 */
export async function getWeatherRecords(
  stationId: number,
  range?: { fromUtc: Date; toUtc: Date },
): Promise<WeatherRecordsSet> {
  const [
    temperatureMaxC,
    temperatureMinC,
    windGustMaxKmh,
    windSpeedMaxKmh,
    rainRateMaxMmH,
    pressureMaxHpa,
    pressureMinHpa,
    humidityMaxPct,
    humidityMinPct,
  ] = await Promise.all([
    selectExtremeObservation(
      stationId,
      weatherObservations.temperatureOutdoorC,
      "max",
      range,
    ),
    selectExtremeObservation(
      stationId,
      weatherObservations.temperatureOutdoorC,
      "min",
      range,
    ),
    selectExtremeObservation(stationId, weatherObservations.windGustKmh, "max", range),
    selectExtremeObservation(stationId, weatherObservations.windSpeedKmh, "max", range),
    selectExtremeObservation(stationId, weatherObservations.rainRateMmH, "max", range),
    selectExtremeObservation(
      stationId,
      weatherObservations.pressureRelativeHpa,
      "max",
      range,
    ),
    selectExtremeObservation(
      stationId,
      weatherObservations.pressureRelativeHpa,
      "min",
      range,
    ),
    selectExtremeObservation(
      stationId,
      weatherObservations.humidityOutdoorPct,
      "max",
      range,
    ),
    selectExtremeObservation(
      stationId,
      weatherObservations.humidityOutdoorPct,
      "min",
      range,
    ),
  ]);

  return {
    temperatureMaxC,
    temperatureMinC,
    windGustMaxKmh,
    windSpeedMaxKmh,
    rainRateMaxMmH,
    pressureMaxHpa,
    pressureMinHpa,
    humidityMaxPct,
    humidityMinPct,
  };
}

/**
 * Rij-vorm voor `rainDayMm` binnen een tijdvak, gegroepeerd per lokale
 * bucket-sleutel (dag of uur — de sleutel wordt in JS berekend en als
 * SQL-expressie meegegeven door de aanroeper, zie `src/lib/weather/rain.ts`
 * / `getRainBucketMaxima()`). MAX() per bucket, server-side.
 */
export interface RainBucketRow {
  bucketKey: string;
  maxRainDayMm: number | null;
}

/**
 * Maximum van `rain_day_mm` binnen een (door de aanroeper al DST-correct
 * bepaald) UTC-tijdvak — de SQL-tegenhanger van `dailyRainTotalMm()` uit
 * `src/lib/weather/rain.ts`. We rekenen de lokale-dag-grenzen bewust in JS
 * uit via `timezone.ts` (`getLocalDayBoundsUtc()`, DST-bewust) en filteren
 * hier alleen op het resulterende UTC-tijdvak — TiDB heeft standaard geen
 * tijdzone-tabellen geladen, dus we vermijden `CONVERT_TZ` in SQL.
 */
export async function getMaxRainDayInRange(
  stationId: number,
  fromUtc: Date,
  toUtc: Date,
): Promise<number | null> {
  const rows = await db
    .select({ value: sql<string | null>`max(${weatherObservations.rainDayMm})` })
    .from(weatherObservations)
    .where(
      and(
        eq(weatherObservations.stationId, stationId),
        sql`${weatherObservations.measuredAt} >= ${fromUtc}`,
        sql`${weatherObservations.measuredAt} < ${toUtc}`,
      ),
    );

  const value = rows[0]?.value;
  return value === null || value === undefined ? null : Number(value);
}

/** Maximale `rain_rate_mm_h` binnen een tijdvak — voor de regenpagina ("hoogste intensiteit vandaag"). */
export async function getMaxRainRateInRange(
  stationId: number,
  fromUtc: Date,
  toUtc: Date,
): Promise<WeatherRecordPoint | null> {
  return selectExtremeObservation(stationId, weatherObservations.rainRateMmH, "max", {
    fromUtc,
    toUtc,
  });
}

// ---------------------------------------------------------------------------
// Fase 3 — dag/maand/jaar-samenvattingen (populatie + lezen)
// ---------------------------------------------------------------------------

/**
 * Ruwe SQL-side aggregatie (MIN/MAX/AVG/SUM/COUNT) van `weather_observations`
 * binnen een tijdvak — de basis voor `computeDailySummary()` in
 * `src/lib/weather/summary.ts`. Numerieke `decimal`-kolommen komen als string
 * (of null) terug uit mysql2; het aanroepende bestand zet dit om naar
 * getallen en rondt af.
 *
 * Dit is de ENIGE plek die `weather_observations` scant om een
 * dagsamenvatting te vullen — en dat gebeurt bewust maximaal één keer per
 * lokale dag (of direct na een nieuwe meting, voor de lopende dag), nooit bij
 * elke dashboardweergave (zie ARCHITECTURE/opdracht §"gebruik de
 * summary-tabellen voor dashboardquery's").
 */
export interface ObservationRangeAggregate {
  temperatureMinC: number | null;
  temperatureMaxC: number | null;
  temperatureAvgC: number | null;
  humidityMinPct: number | null;
  humidityMaxPct: number | null;
  humidityAvgPct: number | null;
  pressureMinHpa: number | null;
  pressureMaxHpa: number | null;
  pressureAvgHpa: number | null;
  windAvgKmh: number | null;
  windMaxKmh: number | null;
  windGustMaxKmh: number | null;
  rainTotalMm: number | null;
  rainRateMaxMmH: number | null;
  uvMax: number | null;
  solarRadiationMaxWm2: number | null;
  observationCount: number;
}

function toNumberOrNull(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export async function aggregateObservationsForRange(
  stationId: number,
  fromUtc: Date,
  toUtc: Date,
): Promise<ObservationRangeAggregate> {
  const rows = await db
    .select({
      temperatureMinC: sql<
        string | null
      >`min(${weatherObservations.temperatureOutdoorC})`,
      temperatureMaxC: sql<
        string | null
      >`max(${weatherObservations.temperatureOutdoorC})`,
      temperatureAvgC: sql<
        string | null
      >`avg(${weatherObservations.temperatureOutdoorC})`,
      humidityMinPct: sql<string | null>`min(${weatherObservations.humidityOutdoorPct})`,
      humidityMaxPct: sql<string | null>`max(${weatherObservations.humidityOutdoorPct})`,
      humidityAvgPct: sql<string | null>`avg(${weatherObservations.humidityOutdoorPct})`,
      pressureMinHpa: sql<string | null>`min(${weatherObservations.pressureRelativeHpa})`,
      pressureMaxHpa: sql<string | null>`max(${weatherObservations.pressureRelativeHpa})`,
      pressureAvgHpa: sql<string | null>`avg(${weatherObservations.pressureRelativeHpa})`,
      windAvgKmh: sql<string | null>`avg(${weatherObservations.windSpeedKmh})`,
      windMaxKmh: sql<string | null>`max(${weatherObservations.windSpeedKmh})`,
      windGustMaxKmh: sql<string | null>`max(${weatherObservations.windGustKmh})`,
      rainTotalMm: sql<string | null>`max(${weatherObservations.rainDayMm})`,
      rainRateMaxMmH: sql<string | null>`max(${weatherObservations.rainRateMmH})`,
      uvMax: sql<string | null>`max(${weatherObservations.uvIndex})`,
      solarRadiationMaxWm2: sql<
        string | null
      >`max(${weatherObservations.solarRadiationWm2})`,
      observationCount: sql<number>`count(*)`,
    })
    .from(weatherObservations)
    .where(
      and(
        eq(weatherObservations.stationId, stationId),
        sql`${weatherObservations.measuredAt} >= ${fromUtc}`,
        sql`${weatherObservations.measuredAt} < ${toUtc}`,
      ),
    );

  const row = rows[0];
  if (!row) {
    return {
      temperatureMinC: null,
      temperatureMaxC: null,
      temperatureAvgC: null,
      humidityMinPct: null,
      humidityMaxPct: null,
      humidityAvgPct: null,
      pressureMinHpa: null,
      pressureMaxHpa: null,
      pressureAvgHpa: null,
      windAvgKmh: null,
      windMaxKmh: null,
      windGustMaxKmh: null,
      rainTotalMm: null,
      rainRateMaxMmH: null,
      uvMax: null,
      solarRadiationMaxWm2: null,
      observationCount: 0,
    };
  }

  return {
    temperatureMinC: toNumberOrNull(row.temperatureMinC),
    temperatureMaxC: toNumberOrNull(row.temperatureMaxC),
    temperatureAvgC: toNumberOrNull(row.temperatureAvgC),
    humidityMinPct: toNumberOrNull(row.humidityMinPct),
    humidityMaxPct: toNumberOrNull(row.humidityMaxPct),
    humidityAvgPct: toNumberOrNull(row.humidityAvgPct),
    pressureMinHpa: toNumberOrNull(row.pressureMinHpa),
    pressureMaxHpa: toNumberOrNull(row.pressureMaxHpa),
    pressureAvgHpa: toNumberOrNull(row.pressureAvgHpa),
    windAvgKmh: toNumberOrNull(row.windAvgKmh),
    windMaxKmh: toNumberOrNull(row.windMaxKmh),
    windGustMaxKmh: toNumberOrNull(row.windGustMaxKmh),
    rainTotalMm: toNumberOrNull(row.rainTotalMm),
    rainRateMaxMmH: toNumberOrNull(row.rainRateMaxMmH),
    uvMax: toNumberOrNull(row.uvMax),
    solarRadiationMaxWm2: toNumberOrNull(row.solarRadiationMaxWm2),
    observationCount: Number(row.observationCount ?? 0),
  };
}

export interface SummaryAggregateInput {
  temperatureMinC: number | null;
  temperatureMaxC: number | null;
  temperatureAvgC: number | null;
  humidityMinPct: number | null;
  humidityMaxPct: number | null;
  humidityAvgPct: number | null;
  pressureMinHpa: number | null;
  pressureMaxHpa: number | null;
  pressureAvgHpa: number | null;
  windAvgKmh: number | null;
  windMaxKmh: number | null;
  windGustMaxKmh: number | null;
  rainTotalMm: number | null;
  rainRateMaxMmH: number | null;
  uvMax: number | null;
  solarRadiationMaxWm2: number | null;
  observationCount: number;
  expectedObservationCount: number | null;
  coveragePct: number | null;
}

/** Zet berekende aggregaatwaarden om naar het `decimal`-string-formaat dat Drizzle/mysql2 verwacht. */
function toDecimalOrNull(value: number | null): string | null {
  return value === null ? null : String(value);
}

export async function upsertDailySummary(
  stationId: number,
  localDate: string,
  data: SummaryAggregateInput,
): Promise<void> {
  const values = {
    stationId,
    localDate,
    temperatureMinC: toDecimalOrNull(data.temperatureMinC),
    temperatureMaxC: toDecimalOrNull(data.temperatureMaxC),
    temperatureAvgC: toDecimalOrNull(data.temperatureAvgC),
    humidityMinPct: toDecimalOrNull(data.humidityMinPct),
    humidityMaxPct: toDecimalOrNull(data.humidityMaxPct),
    humidityAvgPct: toDecimalOrNull(data.humidityAvgPct),
    pressureMinHpa: toDecimalOrNull(data.pressureMinHpa),
    pressureMaxHpa: toDecimalOrNull(data.pressureMaxHpa),
    pressureAvgHpa: toDecimalOrNull(data.pressureAvgHpa),
    windAvgKmh: toDecimalOrNull(data.windAvgKmh),
    windMaxKmh: toDecimalOrNull(data.windMaxKmh),
    windGustMaxKmh: toDecimalOrNull(data.windGustMaxKmh),
    rainTotalMm: toDecimalOrNull(data.rainTotalMm),
    rainRateMaxMmH: toDecimalOrNull(data.rainRateMaxMmH),
    uvMax: toDecimalOrNull(data.uvMax),
    solarRadiationMaxWm2: toDecimalOrNull(data.solarRadiationMaxWm2),
    observationCount: data.observationCount,
    expectedObservationCount: data.expectedObservationCount,
    coveragePct: toDecimalOrNull(data.coveragePct),
  };

  await db
    .insert(dailyWeatherSummary)
    .values(values)
    .onDuplicateKeyUpdate({ set: values });
}

export async function upsertMonthlySummary(
  stationId: number,
  year: number,
  month: number,
  data: SummaryAggregateInput,
): Promise<void> {
  const values = {
    stationId,
    year,
    month,
    temperatureMinC: toDecimalOrNull(data.temperatureMinC),
    temperatureMaxC: toDecimalOrNull(data.temperatureMaxC),
    temperatureAvgC: toDecimalOrNull(data.temperatureAvgC),
    humidityMinPct: toDecimalOrNull(data.humidityMinPct),
    humidityMaxPct: toDecimalOrNull(data.humidityMaxPct),
    humidityAvgPct: toDecimalOrNull(data.humidityAvgPct),
    pressureMinHpa: toDecimalOrNull(data.pressureMinHpa),
    pressureMaxHpa: toDecimalOrNull(data.pressureMaxHpa),
    pressureAvgHpa: toDecimalOrNull(data.pressureAvgHpa),
    windAvgKmh: toDecimalOrNull(data.windAvgKmh),
    windMaxKmh: toDecimalOrNull(data.windMaxKmh),
    windGustMaxKmh: toDecimalOrNull(data.windGustMaxKmh),
    rainTotalMm: toDecimalOrNull(data.rainTotalMm),
    rainRateMaxMmH: toDecimalOrNull(data.rainRateMaxMmH),
    uvMax: toDecimalOrNull(data.uvMax),
    solarRadiationMaxWm2: toDecimalOrNull(data.solarRadiationMaxWm2),
    observationCount: data.observationCount,
    expectedObservationCount: data.expectedObservationCount,
    coveragePct: toDecimalOrNull(data.coveragePct),
  };

  await db
    .insert(monthlyWeatherSummary)
    .values(values)
    .onDuplicateKeyUpdate({ set: values });
}

export async function upsertYearlySummary(
  stationId: number,
  year: number,
  data: SummaryAggregateInput,
): Promise<void> {
  const values = {
    stationId,
    year,
    temperatureMinC: toDecimalOrNull(data.temperatureMinC),
    temperatureMaxC: toDecimalOrNull(data.temperatureMaxC),
    temperatureAvgC: toDecimalOrNull(data.temperatureAvgC),
    humidityMinPct: toDecimalOrNull(data.humidityMinPct),
    humidityMaxPct: toDecimalOrNull(data.humidityMaxPct),
    humidityAvgPct: toDecimalOrNull(data.humidityAvgPct),
    pressureMinHpa: toDecimalOrNull(data.pressureMinHpa),
    pressureMaxHpa: toDecimalOrNull(data.pressureMaxHpa),
    pressureAvgHpa: toDecimalOrNull(data.pressureAvgHpa),
    windAvgKmh: toDecimalOrNull(data.windAvgKmh),
    windMaxKmh: toDecimalOrNull(data.windMaxKmh),
    windGustMaxKmh: toDecimalOrNull(data.windGustMaxKmh),
    rainTotalMm: toDecimalOrNull(data.rainTotalMm),
    rainRateMaxMmH: toDecimalOrNull(data.rainRateMaxMmH),
    uvMax: toDecimalOrNull(data.uvMax),
    solarRadiationMaxWm2: toDecimalOrNull(data.solarRadiationMaxWm2),
    observationCount: data.observationCount,
    expectedObservationCount: data.expectedObservationCount,
    coveragePct: toDecimalOrNull(data.coveragePct),
  };

  await db
    .insert(yearlyWeatherSummary)
    .values(values)
    .onDuplicateKeyUpdate({ set: values });
}

/** Dagsamenvattingen binnen een lokaal-datumbereik (inclusief), oplopend — voor grafieken/tabellen. */
export async function listDailySummaries(
  stationId: number,
  fromLocalDate: string,
  toLocalDate: string,
): Promise<DailyWeatherSummary[]> {
  return db
    .select()
    .from(dailyWeatherSummary)
    .where(
      and(
        eq(dailyWeatherSummary.stationId, stationId),
        sql`${dailyWeatherSummary.localDate} >= ${fromLocalDate}`,
        sql`${dailyWeatherSummary.localDate} <= ${toLocalDate}`,
      ),
    )
    .orderBy(dailyWeatherSummary.localDate);
}

/** Eén dagsamenvatting, indien aanwezig. */
export async function getDailySummary(
  stationId: number,
  localDate: string,
): Promise<DailyWeatherSummary | undefined> {
  const rows = await db
    .select()
    .from(dailyWeatherSummary)
    .where(
      and(
        eq(dailyWeatherSummary.stationId, stationId),
        eq(dailyWeatherSummary.localDate, localDate),
      ),
    )
    .limit(1);
  return rows[0];
}

/** Maandsamenvattingen van een jaar, oplopend (1-12) — voor het jaaroverzicht. */
export async function listMonthlySummariesForYear(
  stationId: number,
  year: number,
): Promise<MonthlyWeatherSummary[]> {
  return db
    .select()
    .from(monthlyWeatherSummary)
    .where(
      and(
        eq(monthlyWeatherSummary.stationId, stationId),
        eq(monthlyWeatherSummary.year, year),
      ),
    )
    .orderBy(monthlyWeatherSummary.month);
}

/** Eén maandsamenvatting, indien aanwezig. */
export async function getMonthlySummary(
  stationId: number,
  year: number,
  month: number,
): Promise<MonthlyWeatherSummary | undefined> {
  const rows = await db
    .select()
    .from(monthlyWeatherSummary)
    .where(
      and(
        eq(monthlyWeatherSummary.stationId, stationId),
        eq(monthlyWeatherSummary.year, year),
        eq(monthlyWeatherSummary.month, month),
      ),
    )
    .limit(1);
  return rows[0];
}

/** Alle jaarsamenvattingen van een station, oplopend — voor het all-time-overzicht. */
export async function listYearlySummaries(
  stationId: number,
): Promise<YearlyWeatherSummary[]> {
  return db
    .select()
    .from(yearlyWeatherSummary)
    .where(eq(yearlyWeatherSummary.stationId, stationId))
    .orderBy(yearlyWeatherSummary.year);
}

/** Eén jaarsamenvatting, indien aanwezig. */
export async function getYearlySummary(
  stationId: number,
  year: number,
): Promise<YearlyWeatherSummary | undefined> {
  const rows = await db
    .select()
    .from(yearlyWeatherSummary)
    .where(
      and(
        eq(yearlyWeatherSummary.stationId, stationId),
        eq(yearlyWeatherSummary.year, year),
      ),
    )
    .limit(1);
  return rows[0];
}

/**
 * Per lokale-uur-index (0 = eerste uur van de dag) het maximum van
 * `rain_day_mm` binnen één lokale dag — DST-veilig omdat de uur-index
 * berekend wordt als "seconden sinds `dayStartUtc` / 3600" (dus t.o.v. het
 * al correct bepaalde begin van de lokale dag), niet via een tijdzone-
 * conversie in SQL. Gebruikt voor de "regen per uur vandaag"-staafgrafiek
 * (`src/lib/weather/rain.ts` §`incrementsFromCumulativeSeries`).
 */
export async function getHourlyMaxRainDay(
  stationId: number,
  dayStartUtc: Date,
  dayEndUtc: Date,
): Promise<Array<{ hourIndex: number; maxRainDayMm: number | null }>> {
  // LET OP (bug gevonden + gefixt op 2026-09-05, zie ook getObservationSeries
  // hieronder voor dezelfde fix): Drizzle rendert dezelfde kolomexpressie
  // verschillend afhankelijk van de clausule. In de SELECT-lijst wordt (bij
  // een query zonder joins, "isSingleTable") de tabelnaam WEGGELATEN vóór
  // `measured_at`, maar in GROUP BY/ORDER BY wordt diezelfde kolom WEL
  // tabel-gekwalificeerd (`weather_observations`.`measured_at`) gerenderd.
  // Voor MySQL/TiDB's `sql_mode=ONLY_FULL_GROUP_BY`-validatie zijn dit
  // *tekstueel* twee verschillende expressies, waardoor de query afgewezen
  // werd met "Expression #1 of SELECT list is not in GROUP BY clause"
  // (ER_WRONG_FIELD_WITH_GROUP, code 1055) — reproduceerbaar bevestigd via
  // `scripts/diag-rain-today.ts` tegen de productiedatabase. Oplossing:
  // geef de bucket-expressie een SQL-alias en groepeer/sorteer op die alias
  // (`sql.identifier(...)`) in plaats van de expressie te herhalen — een
  // door MySQL expliciet ondersteund, ondubbelzinnig patroon dat niet
  // afhankelijk is van hoe Drizzle kolomverwijzingen per clausule rendert.
  const hourIndexAlias = "hour_index";
  const hourIndex = sql<number>`floor(timestampdiff(second, ${dayStartUtc}, ${weatherObservations.measuredAt}) / 3600)`.as(
    hourIndexAlias,
  );
  const hourIndexRef = sql`${sql.identifier(hourIndexAlias)}`;

  const rows = await db
    .select({
      hourIndex,
      maxRainDayMm: sql<string | null>`max(${weatherObservations.rainDayMm})`,
    })
    .from(weatherObservations)
    .where(
      and(
        eq(weatherObservations.stationId, stationId),
        sql`${weatherObservations.measuredAt} >= ${dayStartUtc}`,
        sql`${weatherObservations.measuredAt} < ${dayEndUtc}`,
      ),
    )
    .groupBy(hourIndexRef)
    .orderBy(hourIndexRef);

  return rows.map((row) => ({
    hourIndex: Number(row.hourIndex),
    maxRainDayMm: toNumberOrNull(row.maxRainDayMm),
  }));
}

// ---------------------------------------------------------------------------
// Fase 3 — /api/weather/history: generieke, gedownsamplede tijdreeksquery
// ---------------------------------------------------------------------------

export type HistoryAggregationFn = "avg" | "max" | "min";

export interface HistoryMetricColumn {
  key: string;
  column: AnyMySqlColumn;
  agg: HistoryAggregationFn;
}

export interface HistorySeriesRow {
  /** Startmoment van dit punt: het exacte meetmoment (ruw) of het begin van de aggregatiebucket. */
  timestamp: Date;
  values: Record<string, number | null>;
}

function aggregationExpr(agg: HistoryAggregationFn, column: AnyMySqlColumn) {
  switch (agg) {
    case "avg":
      return sql<string | null>`avg(${column})`;
    case "max":
      return sql<string | null>`max(${column})`;
    case "min":
      return sql<string | null>`min(${column})`;
  }
}

/**
 * Haalt een (eventueel gedownsamplede) tijdreeks van meerdere metrics tegelijk
 * op, uitgelijnd op dezelfde tijdas — de databaselaag achter
 * `GET /api/weather/history` (zie `src/lib/weather/history.ts` voor de
 * resolutiekeuze via `chooseAggregationInterval()`).
 *
 * `intervalSeconds = 0` betekent "ruw": elke meting apart, gesorteerd op
 * tijd, begrensd door `limit` als vangnet. Voor elke andere waarde wordt
 * SQL-side gegroepeerd op een tijdbucket (`floor(timestampdiff(second,
 * fromUtc, measured_at) / intervalSeconds)`), met per metric de opgegeven
 * aggregatiefunctie — dit is de daadwerkelijke downsampling: de database
 * stuurt nooit meer dan het (op voorhand geschatte) aantal buckets naar de
 * applicatie, in plaats van alle ruwe metingen op te halen en in JS samen te
 * vatten.
 */
export async function getObservationSeries(
  stationId: number,
  fromUtc: Date,
  toUtc: Date,
  intervalSeconds: number,
  metrics: HistoryMetricColumn[],
  limit: number,
): Promise<HistorySeriesRow[]> {
  const baseConditions = and(
    eq(weatherObservations.stationId, stationId),
    sql`${weatherObservations.measuredAt} >= ${fromUtc}`,
    sql`${weatherObservations.measuredAt} < ${toUtc}`,
  );

  if (intervalSeconds <= 0) {
    const selection: Record<string, AnyMySqlColumn> = {};
    for (const metric of metrics) selection[metric.key] = metric.column;

    const rows = await db
      .select({ measuredAt: weatherObservations.measuredAt, ...selection })
      .from(weatherObservations)
      .where(baseConditions)
      .orderBy(asc(weatherObservations.measuredAt))
      .limit(limit);

    return rows.map((row) => {
      const { measuredAt, ...rest } = row as Record<string, unknown>;
      const values: Record<string, number | null> = {};
      for (const metric of metrics) {
        values[metric.key] = toNumberOrNull(rest[metric.key] as string | number | null);
      }
      return { timestamp: measuredAt as Date, values };
    });
  }

  // Zelfde ONLY_FULL_GROUP_BY-valkuil als in `getHourlyMaxRainDay` hierboven
  // (zie de uitgebreide toelichting daar): groepeer/sorteer op de SQL-alias
  // van de bucket-expressie, niet op de expressie zelf — anders rendert
  // Drizzle de kolom in de SELECT-lijst ongekwalificeerd maar in GROUP
  // BY/ORDER BY wél tabel-gekwalificeerd, wat MySQL/TiDB als twee
  // verschillende expressies ziet en afwijst (ER_WRONG_FIELD_WITH_GROUP).
  const bucketIndexAlias = "bucket_index";
  const bucketIndexExpr = sql<number>`floor(timestampdiff(second, ${fromUtc}, ${weatherObservations.measuredAt}) / ${intervalSeconds})`.as(
    bucketIndexAlias,
  );
  const bucketIndexRef = sql`${sql.identifier(bucketIndexAlias)}`;
  const selection: Record<string, ReturnType<typeof aggregationExpr>> = {};
  for (const metric of metrics)
    selection[metric.key] = aggregationExpr(metric.agg, metric.column);

  const rows = await db
    .select({ bucketIndex: bucketIndexExpr, ...selection })
    .from(weatherObservations)
    .where(baseConditions)
    .groupBy(bucketIndexRef)
    .orderBy(bucketIndexRef)
    .limit(limit);

  return rows.map((row) => {
    const { bucketIndex, ...rest } = row as Record<string, unknown>;
    const values: Record<string, number | null> = {};
    for (const metric of metrics) {
      values[metric.key] = toNumberOrNull(rest[metric.key] as string | number | null);
    }
    const timestamp = new Date(
      fromUtc.getTime() + Number(bucketIndex) * intervalSeconds * 1000,
    );
    return { timestamp, values };
  });
}

// ---------------------------------------------------------------------------
// Fase 3 — wind (windroos)
// ---------------------------------------------------------------------------

export interface WindObservationRow {
  measuredAt: Date;
  windSpeedKmh: number | null;
  windDirectionDeg: number | null;
  windGustKmh: number | null;
}

/**
 * Windsnelheid/-richting/-stoten binnen een tijdvak — de basis voor
 * `buildWindRose()` (`src/lib/weather/wind.ts`). Windrichting is per
 * definitie NIET zinvol vooraf te aggregeren (het gemiddelde van 350° en 10°
 * is geen 180°), dus de windroos wordt in de applicatielaag opgebouwd uit de
 * individuele metingen. Om dit begrensd te houden staat de windroos-pagina
 * bewust alleen periodes tot en met 30 dagen toe (zie
 * `src/lib/weather/wind-service.ts`, `WIND_ROSE_PERIODS`) — bij 5 minuten
 * pollinterval is dat maximaal ~8640 rijen, met `limit` als hard vangnet.
 */
export async function listWindObservationsInRange(
  stationId: number,
  fromUtc: Date,
  toUtc: Date,
  limit = 20000,
): Promise<WindObservationRow[]> {
  const rows = await db
    .select({
      measuredAt: weatherObservations.measuredAt,
      windSpeedKmh: weatherObservations.windSpeedKmh,
      windDirectionDeg: weatherObservations.windDirectionDeg,
      windGustKmh: weatherObservations.windGustKmh,
    })
    .from(weatherObservations)
    .where(
      and(
        eq(weatherObservations.stationId, stationId),
        sql`${weatherObservations.measuredAt} >= ${fromUtc}`,
        sql`${weatherObservations.measuredAt} < ${toUtc}`,
      ),
    )
    .limit(limit);

  return rows.map((row) => ({
    measuredAt: row.measuredAt,
    windSpeedKmh: toNumberOrNull(row.windSpeedKmh),
    windDirectionDeg: row.windDirectionDeg,
    windGustKmh: toNumberOrNull(row.windGustKmh),
  }));
}

// ---------------------------------------------------------------------------
// Data Explorer (`/data`): gepagineerde data-explorer over ruwe metingen
//
// (De oorspronkelijke Fase 3-functie `listObservationsPaged()`, ooit gebruikt
// door de inmiddels vervallen `/historie`-pagina, is in Fase 4 vervangen door
// de uitgebreidere `listObservationsForExplorer()` hieronder. Zie
// `src/app/api/weather/observations/route.ts`.)
// ---------------------------------------------------------------------------

/**
 * Vroegste meettijdstip van een station — gebruikt door
 * `scripts/recompute-summaries.ts` om een zinvolle ondergrens te bepalen
 * voor `--all` (herbereken alle dagen sinds de eerste meting).
 */
export async function getEarliestObservationMeasuredAt(
  stationId: number,
): Promise<Date | undefined> {
  const rows = await db
    .select({ measuredAt: weatherObservations.measuredAt })
    .from(weatherObservations)
    .where(eq(weatherObservations.stationId, stationId))
    .orderBy(asc(weatherObservations.measuredAt))
    .limit(1);
  return rows[0]?.measuredAt;
}

// ---------------------------------------------------------------------------
// Fase 4 — exports (CSV/JSON/NDJSON): keyset-gepagineerde ruwe rijen
// ---------------------------------------------------------------------------

/**
 * Eén batch metingen voor export, met de herkomst (`source`) erbij via een
 * LEFT JOIN op het bijbehorende ruwe pakket. Keyset-paginering (niet
 * OFFSET-gebaseerd) op `(measured_at, id)`: `after` is de cursor van de
 * laatste rij van de vorige batch — dit blijft even snel bij batch 1 als bij
 * batch 10.000, in tegenstelling tot `OFFSET n` (dat bij een grote `n` de
 * hele voorgaande rijenset moet doorbladeren). Dit is de databaselaag achter
 * de streamende CSV/JSON-export (`src/app/api/weather/export/*`) — zie §15
 * ("laad grote export niet volledig in memory").
 */
export interface ExportObservationRow {
  observation: WeatherObservation;
  source: string | null;
}

export async function listObservationsForExport(
  stationId: number,
  fromUtc: Date,
  toUtc: Date,
  batchSize: number,
  after: { measuredAt: Date; id: number } | null,
  sourceFilter: string | undefined,
): Promise<ExportObservationRow[]> {
  const conditions = [
    eq(weatherObservations.stationId, stationId),
    sql`${weatherObservations.measuredAt} >= ${fromUtc}`,
    sql`${weatherObservations.measuredAt} < ${toUtc}`,
  ];
  if (after) {
    conditions.push(
      sql`(${weatherObservations.measuredAt} > ${after.measuredAt} OR (${weatherObservations.measuredAt} = ${after.measuredAt} AND ${weatherObservations.id} > ${after.id}))`,
    );
  }
  if (sourceFilter) {
    conditions.push(eq(rawWeatherPackets.source, sourceFilter));
  }

  const rows = await db
    .select({ observation: weatherObservations, source: rawWeatherPackets.source })
    .from(weatherObservations)
    .leftJoin(rawWeatherPackets, eq(weatherObservations.rawPacketId, rawWeatherPackets.id))
    .where(and(...conditions))
    .orderBy(asc(weatherObservations.measuredAt), asc(weatherObservations.id))
    .limit(batchSize);

  return rows.map((row) => ({ observation: row.observation, source: row.source ?? null }));
}

/**
 * Keyset-gepagineerde ruwe pakketten binnen een tijdvak (op `received_at`) —
 * de databaselaag achter de BEVEILIGDE raw-packet-backup-export (§17,
 * `/api/weather/export/raw-packets`, zelfde sleutel als de bestaande
 * diagnosepagina's). Zelfde paginerings-aanpak als
 * `listObservationsForExport()` hierboven (zie die functie voor de
 * onderbouwing).
 */
export async function listRawPacketsForExport(
  stationId: number,
  fromUtc: Date,
  toUtc: Date,
  batchSize: number,
  after: { receivedAt: Date; id: number } | null,
): Promise<RawWeatherPacket[]> {
  const conditions = [
    eq(rawWeatherPackets.stationId, stationId),
    sql`${rawWeatherPackets.receivedAt} >= ${fromUtc}`,
    sql`${rawWeatherPackets.receivedAt} < ${toUtc}`,
  ];
  if (after) {
    conditions.push(
      sql`(${rawWeatherPackets.receivedAt} > ${after.receivedAt} OR (${rawWeatherPackets.receivedAt} = ${after.receivedAt} AND ${rawWeatherPackets.id} > ${after.id}))`,
    );
  }

  return db
    .select()
    .from(rawWeatherPackets)
    .where(and(...conditions))
    .orderBy(asc(rawWeatherPackets.receivedAt), asc(rawWeatherPackets.id))
    .limit(batchSize);
}

// ---------------------------------------------------------------------------
// Fase 4 — dataopslag-overzicht (`/station` §Dataopslag)
// ---------------------------------------------------------------------------

export interface StorageStats {
  observationCount: number;
  rawPacketCount: number;
  sensorMeasurementCount: number;
  dailySummaryCount: number;
  monthlySummaryCount: number;
  yearlySummaryCount: number;
  firstObservationAt: Date | undefined;
  lastObservationAt: Date | undefined;
}

/**
 * Rijtellingen over alle 6 opslagtabellen plus eerste/laatste meting — voor
 * het "Dataopslag"-blok op `/station` en de groeischatting
 * (`src/lib/weather/storage-estimate.ts`). Zes onafhankelijke `count(*)`-
 * queries parallel (geen joins nodig, elke telling is een simpele
 * indexed/PK-scan).
 */
export async function getStorageStats(stationId: number): Promise<StorageStats> {
  const [
    observationCount,
    rawPacketCount,
    sensorMeasurementCountRows,
    dailySummaryCountRows,
    monthlySummaryCountRows,
    yearlySummaryCountRows,
    firstObservationAt,
    lastObservation,
  ] = await Promise.all([
    getObservationCount(stationId),
    getRawPacketCount(stationId),
    db
      .select({ value: count() })
      .from(sensorMeasurements)
      .where(eq(sensorMeasurements.stationId, stationId)),
    db
      .select({ value: count() })
      .from(dailyWeatherSummary)
      .where(eq(dailyWeatherSummary.stationId, stationId)),
    db
      .select({ value: count() })
      .from(monthlyWeatherSummary)
      .where(eq(monthlyWeatherSummary.stationId, stationId)),
    db
      .select({ value: count() })
      .from(yearlyWeatherSummary)
      .where(eq(yearlyWeatherSummary.stationId, stationId)),
    getEarliestObservationMeasuredAt(stationId),
    getLatestObservation(stationId),
  ]);

  return {
    observationCount,
    rawPacketCount,
    sensorMeasurementCount: sensorMeasurementCountRows[0]?.value ?? 0,
    dailySummaryCount: dailySummaryCountRows[0]?.value ?? 0,
    monthlySummaryCount: monthlySummaryCountRows[0]?.value ?? 0,
    yearlySummaryCount: yearlySummaryCountRows[0]?.value ?? 0,
    firstObservationAt,
    lastObservationAt: lastObservation?.measuredAt,
  };
}

// ---------------------------------------------------------------------------
// Fase 4 — /data: uitgebreide, filterbare en sorteerbare data-explorer
// ---------------------------------------------------------------------------

export interface ObservationExplorerFilter {
  fromUtc?: Date;
  toUtc?: Date;
  /** Herkomst van het onderliggende ruwe pakket, bv. "ecowitt_cloud_api". */
  source?: string;
  qualityStatus?: ObservationQualityStatus;
}

/**
 * Toegestane sorteerkolommen — een EXPLICIETE allowlist (geen vrije
 * kolomnaam uit de queryparameter rechtstreeks doorgeven aan de query) zodat
 * een onverwachte/kwaadaardige `sortBy`-waarde nooit tot een databasefout of
 * -risico kan leiden (zie §50/§51: input-validatie en beveiliging).
 */
export const OBSERVATION_EXPLORER_SORT_KEYS = [
  "measuredAt",
  "temperatureOutdoorC",
  "windGustKmh",
  "windSpeedKmh",
  "rainRateMmH",
  "pressureRelativeHpa",
  "humidityOutdoorPct",
] as const;
export type ObservationExplorerSortKey = (typeof OBSERVATION_EXPLORER_SORT_KEYS)[number];

const EXPLORER_SORT_COLUMNS: Record<ObservationExplorerSortKey, AnyMySqlColumn> = {
  measuredAt: weatherObservations.measuredAt,
  temperatureOutdoorC: weatherObservations.temperatureOutdoorC,
  windGustKmh: weatherObservations.windGustKmh,
  windSpeedKmh: weatherObservations.windSpeedKmh,
  rainRateMmH: weatherObservations.rainRateMmH,
  pressureRelativeHpa: weatherObservations.pressureRelativeHpa,
  humidityOutdoorPct: weatherObservations.humidityOutdoorPct,
};

export interface ExplorerObservationRow {
  observation: WeatherObservation;
  source: string | null;
}

export interface PagedExplorerObservations {
  rows: ExplorerObservationRow[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * Gepagineerde, filterbare (datum/bron/kwaliteit) en sorteerbare lijst van
 * ruwe metingen — de databaselaag achter `/data` (Data Explorer, Fase 4
 * §20-24). Zonder bron-/kwaliteitsfilter en met de standaardsortering
 * (meettijd, aflopend) gedraagt dit zich identiek aan de oorspronkelijke
 * Fase 3-functie die ooit door de inmiddels vervallen `/historie`-pagina
 * werd gebruikt.
 */
export async function listObservationsForExplorer(
  stationId: number,
  filter: ObservationExplorerFilter,
  sortKey: ObservationExplorerSortKey,
  sortDir: "asc" | "desc",
  page: number,
  pageSize: number,
): Promise<PagedExplorerObservations> {
  const boundedPageSize = Math.min(200, Math.max(1, pageSize));
  const boundedPage = Math.max(1, page);

  const conditions = [eq(weatherObservations.stationId, stationId)];
  if (filter.fromUtc)
    conditions.push(sql`${weatherObservations.measuredAt} >= ${filter.fromUtc}`);
  if (filter.toUtc)
    conditions.push(sql`${weatherObservations.measuredAt} < ${filter.toUtc}`);
  if (filter.qualityStatus)
    conditions.push(eq(weatherObservations.qualityStatus, filter.qualityStatus));
  if (filter.source) conditions.push(eq(rawWeatherPackets.source, filter.source));
  const whereExpr = and(...conditions);

  const orderColumn = EXPLORER_SORT_COLUMNS[sortKey] ?? weatherObservations.measuredAt;
  const orderExpr = sortDir === "asc" ? asc(orderColumn) : desc(orderColumn);

  const [rows, totalRows] = await Promise.all([
    db
      .select({ observation: weatherObservations, source: rawWeatherPackets.source })
      .from(weatherObservations)
      .leftJoin(rawWeatherPackets, eq(weatherObservations.rawPacketId, rawWeatherPackets.id))
      .where(whereExpr)
      .orderBy(orderExpr)
      .limit(boundedPageSize)
      .offset((boundedPage - 1) * boundedPageSize),
    db
      .select({ value: count() })
      .from(weatherObservations)
      .leftJoin(rawWeatherPackets, eq(weatherObservations.rawPacketId, rawWeatherPackets.id))
      .where(whereExpr),
  ]);

  return {
    rows: rows.map((row) => ({ observation: row.observation, source: row.source })),
    total: totalRows[0]?.value ?? 0,
    page: boundedPage,
    pageSize: boundedPageSize,
  };
}

/** Unieke, gesorteerde lijst van bronnen (`raw_weather_packets.source`) voor het bronfilter in `/data`. */
export async function listDistinctObservationSources(stationId: number): Promise<string[]> {
  const rows = await db
    .selectDistinct({ source: rawWeatherPackets.source })
    .from(rawWeatherPackets)
    .where(eq(rawWeatherPackets.stationId, stationId));
  return rows
    .map((row) => row.source)
    .filter((source): source is string => Boolean(source))
    .sort();
}

export interface ObservationDetail {
  observation: WeatherObservation;
  rawPacketId: number | null;
  source: string | null;
  sensorMeasurements: SensorMeasurement[];
}

/**
 * Volledig detail van één meting (§22: lokale/UTC-meettijd, ontvangsttijd,
 * bron, kwaliteitsstatus/-vlaggen, alle genormaliseerde waarden, extra
 * sensormetingen). Geeft bewust NOOIT de ruwe payload terug — die blijft
 * uitsluitend bereikbaar via de bestaande beveiligde diagnosepagina
 * (`/station/diagnostics/[id]`, met `rawPacketId` hieronder als koppeling).
 */
export async function getObservationDetail(
  stationId: number,
  observationId: number,
): Promise<ObservationDetail | undefined> {
  const rows = await db
    .select({ observation: weatherObservations, source: rawWeatherPackets.source })
    .from(weatherObservations)
    .leftJoin(rawWeatherPackets, eq(weatherObservations.rawPacketId, rawWeatherPackets.id))
    .where(
      and(
        eq(weatherObservations.stationId, stationId),
        eq(weatherObservations.id, observationId),
      ),
    )
    .limit(1);

  const row = rows[0];
  if (!row) return undefined;

  const sensorRows = await getSensorMeasurementsForObservation(observationId);

  return {
    observation: row.observation,
    rawPacketId: row.observation.rawPacketId ?? null,
    source: row.source,
    sensorMeasurements: sensorRows,
  };
}

// ---------------------------------------------------------------------------
// Fase 4 — /data-quality: ontbrekende intervallen, pakket-/kwaliteitsstatus
// ---------------------------------------------------------------------------

/**
 * Unieke, oplopend gesorteerde meettijden binnen een tijdvak — de
 * databaselaag achter `detectMissingIntervals()` in `data-quality.ts`.
 * `selectDistinct` zorgt dat een eventueel duplicaat (dezelfde `measuredAt`
 * twee keer opgeslagen) nooit als twee aparte metingen meetelt en dus nooit
 * ten onrechte een gat "dichtplakt" of een ontbrekend interval verbergt.
 */
export async function listDistinctMeasuredAtInRange(
  stationId: number,
  fromUtc: Date,
  toUtc: Date,
): Promise<Date[]> {
  const rows = await db
    .selectDistinct({ measuredAt: weatherObservations.measuredAt })
    .from(weatherObservations)
    .where(
      and(
        eq(weatherObservations.stationId, stationId),
        sql`${weatherObservations.measuredAt} >= ${fromUtc}`,
        sql`${weatherObservations.measuredAt} < ${toUtc}`,
      ),
    )
    .orderBy(asc(weatherObservations.measuredAt));
  return rows.map((row) => row.measuredAt);
}

export interface DataQualityPeriodStats {
  /** Aantal ruwe pakketten per verwerkingsstatus (received/normalized/partial/failed/duplicate) in deze periode. */
  packetStatusCounts: Record<string, number>;
  /** Aantal pakketten met minstens één onbekend veld (parser leerde dit veld nog niet). */
  unknownFieldsPacketCount: number;
  /** Aantal metingen met kwaliteitsstatus "suspect" (verdacht) in deze periode. */
  suspectObservationCount: number;
}

/**
 * Geaggregeerde datakwaliteitscijfers voor één periode (bv. één
 * kalendermaand) — de databaselaag achter het pakket-/kwaliteitsoverzicht op
 * `/data-quality` (§25). Drie onafhankelijke, geïndexeerde aggregatiequeries
 * parallel — geen enkele leest ruwe rijen naar de client.
 */
export async function getDataQualityPeriodStats(
  stationId: number,
  fromUtc: Date,
  toUtc: Date,
): Promise<DataQualityPeriodStats> {
  const [statusRows, unknownFieldsRows, suspectRows] = await Promise.all([
    db
      .select({ status: rawWeatherPackets.processingStatus, value: count() })
      .from(rawWeatherPackets)
      .where(
        and(
          eq(rawWeatherPackets.stationId, stationId),
          sql`${rawWeatherPackets.receivedAt} >= ${fromUtc}`,
          sql`${rawWeatherPackets.receivedAt} < ${toUtc}`,
        ),
      )
      .groupBy(rawWeatherPackets.processingStatus),
    db
      .select({ value: count() })
      .from(rawWeatherPackets)
      .where(
        and(
          eq(rawWeatherPackets.stationId, stationId),
          sql`${rawWeatherPackets.unknownFields} is not null`,
          sql`${rawWeatherPackets.receivedAt} >= ${fromUtc}`,
          sql`${rawWeatherPackets.receivedAt} < ${toUtc}`,
        ),
      ),
    db
      .select({ value: count() })
      .from(weatherObservations)
      .where(
        and(
          eq(weatherObservations.stationId, stationId),
          eq(weatherObservations.qualityStatus, "suspect"),
          sql`${weatherObservations.measuredAt} >= ${fromUtc}`,
          sql`${weatherObservations.measuredAt} < ${toUtc}`,
        ),
      ),
  ]);

  return {
    packetStatusCounts: Object.fromEntries(statusRows.map((row) => [row.status, row.value])),
    unknownFieldsPacketCount: unknownFieldsRows[0]?.value ?? 0,
    suspectObservationCount: suspectRows[0]?.value ?? 0,
  };
}

// `sql` blijft beschikbaar voor toekomstige handmatige/aggregatiequeries.
export { sql };
