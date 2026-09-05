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
import { and, count, desc, eq, isNull, or, sql } from "drizzle-orm";

import { db, pingDatabase } from "@/lib/db";
import {
  rawWeatherPackets,
  sensorMeasurements,
  stations,
  weatherObservations,
  weatherProviderState,
} from "@/lib/db/schema";
import type {
  NewRawWeatherPacket,
  NewSensorMeasurement,
  NewWeatherObservation,
  RawWeatherPacket,
  RawWeatherPacketProcessingStatus,
  SensorMeasurement,
  Station,
  WeatherObservation,
  WeatherProviderState,
} from "@/lib/db/schema";

/**
 * Haalt het (eerste actieve) weerstation op. In Fase 1 is er hooguit één
 * seed-station, dus zonder argument krijg je "het" station van deze
 * installatie. Geef een `slug` mee om een specifiek station op te halen.
 */
export async function getStation(slug?: string): Promise<Station | undefined> {
  const rows = slug
    ? await db.select().from(stations).where(eq(stations.slug, slug)).limit(1)
    : await db
        .select()
        .from(stations)
        .where(eq(stations.isActive, true))
        .orderBy(stations.id)
        .limit(1);

  return rows[0];
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

// `sql` blijft beschikbaar voor toekomstige handmatige/aggregatiequeries.
export { sql };
