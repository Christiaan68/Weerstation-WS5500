/**
 * Demo-data generator.
 *
 * Genereert ~24 uur fictieve weermetingen (elke 5 minuten, 288 punten) voor
 * het seed-station en slaat ze op zoals een echte ingestie-pipeline dat
 * zou doen: eerst een ruwe payload (`raw_weather_packets`, met
 * Amerikaanse eenheden — zoals het Ecowitt-protocol dat de WS5500 spreekt
 * ook doet), daarna een genormaliseerde meting (`weather_observations`,
 * metrisch) die via de eenheidsconversies uit `src/lib/weather/units.ts`
 * is afgeleid. Zo oefent dit script alvast het pad dat de echte
 * data-ingestie in een latere fase zal volgen.
 *
 * Gebruik:
 *   npm run demo            → genereert demo-data (development/test only)
 *   npm run demo:clear       → DROOGRUN: toont hoeveel demo-data verwijderd zou worden
 *   npm run demo:clear:confirm → verwijdert daadwerkelijk eerder gegenereerde demo-data
 *
 * Demo-records zijn herkenbaar aan `source = "demo_generator"` op
 * `raw_weather_packets`, zodat ze altijd apart van echte stationdata
 * (`ecowitt_cloud_api`/`ecowitt_push`) te herkennen en te verwijderen zijn.
 * `--clear` zonder `--confirm` wijzigt NOOIT iets (veiligheidsvereiste
 * Fase 3) — het toont alleen hoeveel rijen het zou verwijderen.
 */
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local" });

import { createHash } from "node:crypto";

import { and, eq, inArray } from "drizzle-orm";

import { db } from "../src/lib/db";
import {
  rawWeatherPackets,
  sensorMeasurements,
  stations,
  weatherObservations,
} from "../src/lib/db/schema";
import type { NewRawWeatherPacket, NewWeatherObservation } from "../src/lib/db/schema";
import {
  fahrenheitToCelsius,
  inHgToHpa,
  inchToMm,
  mphToKmh,
} from "../src/lib/weather/units";

const DEMO_SOURCE = "demo_generator";
const DEMO_PARSER_VERSION = "demo-v1";
const STATION_SLUG = "mijn-alecto-ws5500";
const INTERVAL_SECONDS = 5 * 60; // elke 5 minuten
const HOURS = 24;
const POINT_COUNT = (HOURS * 60 * 60) / INTERVAL_SECONDS;
const CHUNK_SIZE = 48;

const CLEAR_MODE = process.argv.includes("--clear");

// --- Kleine, lokale helpers voor de "omgekeerde" richting (metrisch naar
// Amerikaans), puur om een realistische ruwe payload te simuleren. Dit zijn
// bewust GEEN onderdeel van de openbare `units.ts`-API (die gaat de andere
// kant op, van WS5500/Ecowitt-eenheden naar metrisch). ---
function celsiusToFahrenheit(celsius: number): number {
  return (celsius * 9) / 5 + 32;
}
function hpaToInHg(hpa: number): number {
  return hpa / 33.8638866667;
}
function kmhToMph(kmh: number): number {
  return kmh / 1.609344;
}
function mmToInch(mm: number): number {
  return mm / 25.4;
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

interface SimulatedPoint {
  timestamp: Date;
  temperatureOutdoorC: number;
  temperatureIndoorC: number;
  humidityOutdoorPct: number;
  humidityIndoorPct: number;
  dewPointC: number;
  pressureRelativeHpa: number;
  pressureAbsoluteHpa: number;
  windSpeedKmh: number;
  windGustKmh: number;
  windDirectionDeg: number;
  rainRateMmH: number;
  rainDayMm: number;
  uvIndex: number;
  solarRadiationWm2: number;
}

/** Simuleert één meetpunt op basis van het uur van de dag (0–24). */
function simulatePoint(
  timestamp: Date,
  hourOfDay: number,
  cumulativeRainMm: number,
): SimulatedPoint {
  // Temperatuur: dagcyclus met piek rond 15:00, dal rond 03:00.
  const temperatureOutdoorC = round(
    14 + 7 * Math.sin((2 * Math.PI * (hourOfDay - 9)) / 24) + randomBetween(-0.6, 0.6),
    1,
  );
  const temperatureIndoorC = round(temperatureOutdoorC + randomBetween(2.5, 4.5), 1);

  // Luchtvochtigheid: hoger als het kouder is, met wat ruis.
  const humidityOutdoorPct = round(
    Math.min(
      98,
      Math.max(35, 80 - (temperatureOutdoorC - 8) * 2.5 + randomBetween(-4, 4)),
    ),
    1,
  );
  const humidityIndoorPct = round(
    Math.min(70, humidityOutdoorPct - randomBetween(10, 20)),
    1,
  );

  // Dauwpunt: benadering volgens de eenvoudige Magnus-vuistregel.
  const dewPointC = round(temperatureOutdoorC - (100 - humidityOutdoorPct) / 5, 1);

  // Luchtdruk: langzame drift rond 1015 hPa.
  const pressureRelativeHpa = round(
    1015 + 4 * Math.sin((2 * Math.PI * hourOfDay) / 48) + randomBetween(-0.4, 0.4),
    1,
  );
  const pressureAbsoluteHpa = round(pressureRelativeHpa - 2.8, 1);

  // Wind: gematigd met af en toe een stotende bui.
  const windSpeedKmh = round(
    Math.max(0, 8 + 6 * Math.sin(hourOfDay / 3) + randomBetween(-3, 3)),
    1,
  );
  const windGustKmh = round(windSpeedKmh + randomBetween(2, 9), 1);
  const windDirectionDeg = Math.round(
    (220 + hourOfDay * 3 + randomBetween(-15, 15) + 360) % 360,
  );

  // Regen: één regenbui tussen 02:00 en 04:00.
  const isRaining = hourOfDay >= 2 && hourOfDay < 4;
  const rainRateMmH = isRaining ? round(randomBetween(0.5, 3.5), 2) : 0;
  const rainDayMm = round(cumulativeRainMm + rainRateMmH * (INTERVAL_SECONDS / 3600), 2);

  // UV en zonnestraling: bell curve overdag (06:00–20:00), 0 's nachts.
  const daylight = hourOfDay > 6 && hourOfDay < 20;
  const daylightFactor = daylight ? Math.sin((Math.PI * (hourOfDay - 6)) / 14) : 0;
  const uvIndex = round(Math.max(0, 7 * daylightFactor + randomBetween(-0.3, 0.3)), 1);
  const solarRadiationWm2 = round(
    Math.max(0, 750 * daylightFactor + randomBetween(-20, 20)),
    1,
  );

  return {
    timestamp,
    temperatureOutdoorC,
    temperatureIndoorC,
    humidityOutdoorPct,
    humidityIndoorPct,
    dewPointC,
    pressureRelativeHpa,
    pressureAbsoluteHpa,
    windSpeedKmh,
    windGustKmh,
    windDirectionDeg,
    rainRateMmH,
    rainDayMm,
    uvIndex,
    solarRadiationWm2,
  };
}

/** Bouwt een Ecowitt-achtige ruwe payload (Amerikaanse eenheden) van een meetpunt. */
function toRawPayload(point: SimulatedPoint) {
  return {
    dateutc: point.timestamp.toISOString(),
    tempf: round(celsiusToFahrenheit(point.temperatureOutdoorC), 1),
    indoortempf: round(celsiusToFahrenheit(point.temperatureIndoorC), 1),
    humidity: point.humidityOutdoorPct,
    indoorhumidity: point.humidityIndoorPct,
    baromrelin: round(hpaToInHg(point.pressureRelativeHpa), 3),
    baromabsin: round(hpaToInHg(point.pressureAbsoluteHpa), 3),
    windspeedmph: round(kmhToMph(point.windSpeedKmh), 1),
    windgustmph: round(kmhToMph(point.windGustKmh), 1),
    winddir: point.windDirectionDeg,
    rainratein: round(mmToInch(point.rainRateMmH), 3),
    dailyrainin: round(mmToInch(point.rainDayMm), 3),
    uv: point.uvIndex,
    solarradiation: point.solarRadiationWm2,
  };
}

/** Zet een ruwe (Amerikaanse) payload om naar een genormaliseerde meting. */
function parseRawPayload(
  payload: ReturnType<typeof toRawPayload>,
): Omit<
  NewWeatherObservation,
  "stationId" | "rawPacketId" | "measuredAt" | "receivedAt"
> {
  return {
    temperatureOutdoorC: round(fahrenheitToCelsius(payload.tempf), 1).toFixed(1),
    temperatureIndoorC: round(fahrenheitToCelsius(payload.indoortempf), 1).toFixed(1),
    humidityOutdoorPct: payload.humidity.toFixed(1),
    humidityIndoorPct: payload.indoorhumidity.toFixed(1),
    dewPointC: round(
      fahrenheitToCelsius(payload.tempf) - (100 - payload.humidity) / 5,
      1,
    ).toFixed(1),
    pressureRelativeHpa: round(inHgToHpa(payload.baromrelin), 1).toFixed(1),
    pressureAbsoluteHpa: round(inHgToHpa(payload.baromabsin), 1).toFixed(1),
    windSpeedKmh: round(mphToKmh(payload.windspeedmph), 1).toFixed(1),
    windGustKmh: round(mphToKmh(payload.windgustmph), 1).toFixed(1),
    windDirectionDeg: payload.winddir,
    rainRateMmH: round(inchToMm(payload.rainratein), 2).toFixed(2),
    rainDayMm: round(inchToMm(payload.dailyrainin), 2).toFixed(2),
    uvIndex: payload.uv.toFixed(1),
    solarRadiationWm2: payload.solarradiation.toFixed(1),
    qualityStatus: "ok",
  };
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

async function getDemoStation() {
  const rows = await db
    .select()
    .from(stations)
    .where(eq(stations.slug, STATION_SLUG))
    .limit(1);
  if (!rows[0]) {
    throw new Error(
      `Station met slug '${STATION_SLUG}' niet gevonden. Draai eerst 'npm run db:seed'.`,
    );
  }
  return rows[0];
}

/**
 * Verwijdert UITSLUITEND rijen met `source = "demo_generator"`. Dit is de
 * enige bron die deze functie ooit aanraakt — echte stationdata
 * (`ecowitt_cloud_api`, `ecowitt_push`) wordt hier nooit bij betrokken, zelfs
 * niet als de query per ongeluk verkeerd zou zijn opgebouwd: de
 * `eq(source, DEMO_SOURCE)`-voorwaarde staat op de SELECT die de te
 * verwijderen id's bepaalt, dus alleen die id's worden ooit meegenomen in de
 * DELETE's hieronder (zie ook de Fase 3-eis: "raak echte WS5500-data nooit
 * aan").
 *
 * Veiligheid (Fase 3-eis): standaard alleen een DROOGRUN die toont hoeveel
 * rijen verwijderd zouden worden. Pas met `confirm: true` wordt er
 * daadwerkelijk verwijderd.
 */
async function clearDemoData(stationId: number, confirm: boolean) {
  const demoPackets = await db
    .select({ id: rawWeatherPackets.id, receivedAt: rawWeatherPackets.receivedAt })
    .from(rawWeatherPackets)
    .where(
      and(
        eq(rawWeatherPackets.stationId, stationId),
        eq(rawWeatherPackets.source, DEMO_SOURCE),
      ),
    );

  const ids = demoPackets.map((p) => p.id);

  if (ids.length === 0) {
    console.log("Geen demo-data (source='demo_generator') gevonden om te verwijderen.");
    return;
  }

  const observationRows = await db
    .select({ id: weatherObservations.id })
    .from(weatherObservations)
    .where(inArray(weatherObservations.rawPacketId, ids));
  const observationIds = observationRows.map((row) => row.id);

  const oldest = demoPackets.reduce(
    (min, p) => (p.receivedAt < min ? p.receivedAt : min),
    demoPackets[0]!.receivedAt,
  );
  const newest = demoPackets.reduce(
    (max, p) => (p.receivedAt > max ? p.receivedAt : max),
    demoPackets[0]!.receivedAt,
  );
  const formatNl = (date: Date) =>
    new Intl.DateTimeFormat("nl-NL", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Europe/Amsterdam",
    }).format(date);

  console.log(
    `Gevonden: ${ids.length} demo-pakket(ten), ${observationIds.length} bijbehorende meting(en).`,
  );
  console.log(`Periode: ${formatNl(oldest)} t/m ${formatNl(newest)}.`);
  console.log(
    `Bron-filter: uitsluitend source = "${DEMO_SOURCE}" — echte stationdata wordt niet aangeraakt.`,
  );

  if (!confirm) {
    console.log(
      "\nDit was een DROOGRUN — er is niets verwijderd. Voer opnieuw uit met --confirm om " +
        "deze demo-rijen daadwerkelijk te verwijderen.",
    );
    return;
  }

  if (observationIds.length > 0) {
    await db
      .delete(sensorMeasurements)
      .where(inArray(sensorMeasurements.observationId, observationIds));
    await db
      .delete(weatherObservations)
      .where(inArray(weatherObservations.id, observationIds));
  }
  await db.delete(rawWeatherPackets).where(inArray(rawWeatherPackets.id, ids));

  console.log(
    `\nVerwijderd: ${ids.length} demo-pakket(ten), ${observationIds.length} meting(en) en bijbehorende sensorwaarden.`,
  );
}

async function generateDemoData(stationId: number) {
  const now = new Date();
  const startTime = new Date(now.getTime() - HOURS * 60 * 60 * 1000);

  let cumulativeRainMm = 0;
  const rows: {
    rawPayload: ReturnType<typeof toRawPayload>;
    timestamp: Date;
    payloadHash: string;
  }[] = [];

  for (let i = 0; i < POINT_COUNT; i += 1) {
    const timestamp = new Date(startTime.getTime() + i * INTERVAL_SECONDS * 1000);
    const hourOfDay = timestamp.getHours() + timestamp.getMinutes() / 60;
    const point = simulatePoint(timestamp, hourOfDay, cumulativeRainMm);
    cumulativeRainMm = point.rainDayMm;

    const rawPayload = toRawPayload(point);
    const payloadHash = createHash("sha256")
      .update(
        JSON.stringify({ stationId, timestamp: timestamp.toISOString(), rawPayload }),
      )
      .digest("hex");

    rows.push({ rawPayload, timestamp, payloadHash });
  }

  let inserted = 0;

  for (const batch of chunk(rows, CHUNK_SIZE)) {
    const packetValues: NewRawWeatherPacket[] = batch.map((row) => ({
      stationId,
      receivedAt: row.timestamp,
      source: DEMO_SOURCE,
      remoteTimestamp: row.timestamp,
      contentType: "application/json",
      rawPayload: row.rawPayload,
      payloadHash: row.payloadHash,
      parserVersion: DEMO_PARSER_VERSION,
      processingStatus: "normalized",
    }));

    await db.insert(rawWeatherPackets).values(packetValues);

    const insertedPackets = await db
      .select({ id: rawWeatherPackets.id, payloadHash: rawWeatherPackets.payloadHash })
      .from(rawWeatherPackets)
      .where(
        and(
          eq(rawWeatherPackets.stationId, stationId),
          inArray(
            rawWeatherPackets.payloadHash,
            batch.map((row) => row.payloadHash),
          ),
        ),
      );

    const idByHash = new Map(insertedPackets.map((p) => [p.payloadHash, p.id]));

    const observationValues: NewWeatherObservation[] = batch.map((row) => {
      const packetId = idByHash.get(row.payloadHash);
      return {
        stationId,
        rawPacketId: packetId,
        measuredAt: row.timestamp,
        receivedAt: row.timestamp,
        ...parseRawPayload(row.rawPayload),
      };
    });

    await db.insert(weatherObservations).values(observationValues);

    inserted += batch.length;
    console.log(`  ${inserted}/${rows.length} metingen verwerkt...`);
  }
}

async function main() {
  const station = await getDemoStation();

  if (CLEAR_MODE) {
    const confirm = process.argv.includes("--confirm");
    console.log(`Demo-data controleren voor station '${station.displayName}'...\n`);
    await clearDemoData(station.id, confirm);
  } else {
    console.log(
      `Demo-data genereren voor station '${station.displayName}': ${POINT_COUNT} metingen over de laatste ${HOURS} uur...`,
    );
    await generateDemoData(station.id);
    console.log(
      "Demo-data gegenereerd. Zet NEXT_PUBLIC_DEMO_MODE=true om dit duidelijk te tonen in de UI.",
    );
  }

  process.exit(0);
}

main().catch((error) => {
  console.error("Demo-generator mislukt:", error);
  process.exit(1);
});
