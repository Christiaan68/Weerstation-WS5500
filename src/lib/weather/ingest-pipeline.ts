/**
 * De ingestie-pijplijn: de enige plek waar een binnenkomende payload
 * (rechtstreeks van het station, óf via de Ecowitt Cloud-provider) daadwerkelijk
 * in de database terechtkomt. Route-handlers en providers roepen uitsluitend
 * `ingestWeatherPayload()` aan — alle beslislogica (station herkennen,
 * dedupliceren, parsen, normaliseren, opslaan) staat hier op één plek, niet
 * verspreid over route-bestanden (zie de opdracht voor Fase 2, §"parser als
 * losse laag").
 *
 * Volgorde, en waarom (zie ook docs/WS5500_INGESTION.md):
 * 1. Station bepalen op basis van een identifier in de payload (PASSKEY/ID/
 *    MAC) — NOOIT een nieuw station aanmaken. Zonder identifier: alleen een
 *    fallback als er precies één actief station is (praktisch voor de
 *    meeste particuliere installaties).
 * 2. Dedupliceren op payload-hash, gescopeerd per (mogelijk `null`) station.
 * 3. Het ruwe pakket opslaan — ALTIJD, ongeacht of station/parsing daarna
 *    lukt. Dit gebeurt vóór elke interpretatie van de inhoud.
 * 4. Parsen + normaliseren, en de meting (plus sensoren) in één transactie
 *    wegschrijven.
 * 5. De verwerkingsstatus van het ruwe pakket bijwerken met het resultaat.
 *
 * Dit is bewust lichtgewicht (geen wachtrij, geen achtergrondtaak, zie
 * docs/ARCHITECTURE.md §13): bij dit schrijfvolume (hooguit één keer per
 * ~10-60 seconden) past dit ruim binnen de Vercel Functions-limieten van een
 * enkel request.
 */
import {
  deleteObservationWithSensors,
  findDuplicateRawPacket,
  findSoleActiveStation,
  findStationByIdentifier,
  getObservationByRawPacketId,
  getRawPacketById,
  insertObservationWithSensors,
  insertRawPacket,
  updateRawPacketProcessing,
} from "@/lib/db/queries";
import type { RawWeatherPacketProcessingStatus } from "@/lib/db/schema";

import { parseEcowittPayload, PARSER_VERSION } from "./ecowitt/parse";
import { hashPayload } from "./hash";
import { buildObservationRow, buildSensorMeasurementRows } from "./normalize";
import type { ParsedWeatherPacket, RawPayload } from "./types";

export interface IngestInput {
  rawPayload: RawPayload;
  /** Exacte, ongewijzigde request-body (indien van toepassing). */
  rawBodyText: string | null;
  contentType: string | null;
  httpMethod: "GET" | "POST";
  /** Bv. "ecowitt_push", "ecowitt_cloud_api". */
  source: string;
  remoteAddress: string | null;
}

export interface IngestResult {
  rawPacketId: number;
  status: RawWeatherPacketProcessingStatus;
  stationMatched: boolean;
  observationId?: number;
  warnings: string[];
  message: string;
}

const IDENTIFIER_FIELD_CANDIDATES = ["passkey", "id", "mac", "imei"];

/** Zoekt de eerste aanwezige identifier-achtige veldwaarde, case-insensitief. */
function extractIdentifier(payload: RawPayload): string | undefined {
  const lowerKeyMap = new Map<string, string>();
  for (const key of Object.keys(payload)) {
    const lower = key.toLowerCase();
    if (!lowerKeyMap.has(lower)) {
      lowerKeyMap.set(lower, key);
    }
  }

  for (const candidate of IDENTIFIER_FIELD_CANDIDATES) {
    const originalKey = lowerKeyMap.get(candidate);
    if (originalKey === undefined) {
      continue;
    }
    const value = payload[originalKey];
    if (typeof value === "string" && value.trim() !== "") {
      return value.trim();
    }
    if (typeof value === "number") {
      return String(value);
    }
  }

  return undefined;
}

interface ProcessOutcome {
  status: RawWeatherPacketProcessingStatus;
  observationId?: number;
  warnings: string[];
  message: string;
}

/**
 * Verwerkt een reeds geparseerde payload voor een BEKEND station: bepaalt de
 * uiteindelijke status, schrijft (indien mogelijk) de meting + sensoren weg,
 * en werkt het ruwe pakket bij. Gedeeld door `ingestWeatherPayload()` (nieuw
 * pakket) en `reprocessRawPacket()` (bestaand pakket opnieuw verwerken) —
 * zodat er precies één plek is die bepaalt wanneer een pakket
 * "normalized" versus "partial" versus "failed" is.
 */
async function processParsedPacketForStation(
  rawPacketId: number,
  station: { id: number },
  parsed: ParsedWeatherPacket,
): Promise<ProcessOutcome> {
  const unknownFieldCount = Object.keys(parsed.unknownFields).length;

  if (parsed.quality === "missing") {
    const message = "Geen enkel herkend meetveld in de payload; geen meting opgeslagen.";
    await updateRawPacketProcessing(rawPacketId, {
      stationId: station.id,
      processingStatus: "failed",
      processingError: message,
      unknownFields: unknownFieldCount > 0 ? parsed.unknownFields : null,
      parseWarnings: parsed.warnings.length > 0 ? parsed.warnings : null,
      remoteTimestamp: parsed.measuredAt,
    });
    return { status: "failed", warnings: parsed.warnings, message };
  }

  const status: RawWeatherPacketProcessingStatus =
    unknownFieldCount > 0 || parsed.warnings.length > 0 || parsed.quality !== "ok"
      ? "partial"
      : "normalized";

  const observationRow = buildObservationRow(parsed, {
    stationId: station.id,
    rawPacketId,
  });
  const sensorRows = buildSensorMeasurementRows(parsed, { stationId: station.id });
  const observationId = await insertObservationWithSensors(observationRow, sensorRows);

  const message =
    status === "normalized"
      ? `Meting opgeslagen (#${observationId}).`
      : `Meting opgeslagen (#${observationId}) met kanttekeningen: ${
          unknownFieldCount > 0 ? `${unknownFieldCount} onbekend veld/velden; ` : ""
        }${parsed.warnings.join("; ")}`;

  await updateRawPacketProcessing(rawPacketId, {
    stationId: station.id,
    processingStatus: status,
    processingError: status === "partial" ? message : null,
    unknownFields: unknownFieldCount > 0 ? parsed.unknownFields : null,
    parseWarnings: parsed.warnings.length > 0 ? parsed.warnings : null,
    remoteTimestamp: parsed.measuredAt,
  });

  return { status, observationId, warnings: parsed.warnings, message };
}

export async function ingestWeatherPayload(input: IngestInput): Promise<IngestResult> {
  const receivedAt = new Date();
  const payloadHash = hashPayload(input.rawPayload);
  const identifier = extractIdentifier(input.rawPayload);

  let station = identifier ? await findStationByIdentifier(identifier) : undefined;
  if (!station && !identifier) {
    station = await findSoleActiveStation();
  }
  const stationId = station ? station.id : null;

  const duplicate = await findDuplicateRawPacket(stationId, payloadHash);

  const rawPacketId = await insertRawPacket({
    stationId,
    receivedAt,
    source: input.source,
    httpMethod: input.httpMethod,
    contentType: input.contentType ?? undefined,
    rawPayload: input.rawPayload,
    rawBodyText: input.rawBodyText ?? undefined,
    remoteAddress: input.remoteAddress ?? undefined,
    payloadHash,
    parserVersion: PARSER_VERSION,
    processingStatus: "received",
  });

  if (duplicate) {
    const message = `Identieke payload al eerder ontvangen (ruw pakket #${duplicate.id}); niet opnieuw verwerkt.`;
    await updateRawPacketProcessing(rawPacketId, {
      processingStatus: "duplicate",
      processingError: message,
    });
    return {
      rawPacketId,
      status: "duplicate",
      stationMatched: Boolean(station),
      warnings: [],
      message,
    };
  }

  if (!station) {
    const message = identifier
      ? `Onbekende station-identifier "${identifier}": geen vooraf geregistreerd station gevonden. Er wordt nooit automatisch een station aangemaakt.`
      : "Geen station-identifier in de payload gevonden, en er is geen eenduidig actief station om op terug te vallen.";
    await updateRawPacketProcessing(rawPacketId, {
      processingStatus: "failed",
      processingError: message,
    });
    return {
      rawPacketId,
      status: "failed",
      stationMatched: false,
      warnings: [message],
      message,
    };
  }

  let parsed;
  try {
    parsed = parseEcowittPayload(input.rawPayload, { receivedAt });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "onbekende fout";
    const message = `Onverwachte parserfout: ${detail}`;
    await updateRawPacketProcessing(rawPacketId, {
      stationId: station.id,
      processingStatus: "failed",
      processingError: message,
    });
    return {
      rawPacketId,
      status: "failed",
      stationMatched: true,
      warnings: [message],
      message,
    };
  }

  const outcome = await processParsedPacketForStation(rawPacketId, station, parsed);

  return { rawPacketId, stationMatched: true, ...outcome };
}

/**
 * Verwerkt een REEDS OPGESLAGEN ruw pakket opnieuw met de huidige parser
 * (`npm run weather:reprocess -- <id>`). Nuttig na een parser-uitbreiding
 * (bv. een nieuw sensorveld toegevoegd aan `ecowitt/fields.ts`) — de ruwe
 * payload stond immers al veilig in de database, dus er hoeft niets
 * opnieuw aangeleverd te worden.
 *
 * Een eventuele eerder afgeleide meting (en zijn sensor-metingen) wordt
 * eerst verwijderd, zodat herverwerking nooit dubbele metingen achterlaat.
 */
export async function reprocessRawPacket(rawPacketId: number): Promise<IngestResult> {
  const packet = await getRawPacketById(rawPacketId);
  if (!packet) {
    throw new Error(`Ruw pakket #${rawPacketId} bestaat niet.`);
  }

  if (packet.stationId === null) {
    const message =
      "Dit pakket heeft geen gekoppeld station (onbekende identifier) en kan niet herverwerkt worden.";
    return {
      rawPacketId,
      status: packet.processingStatus,
      stationMatched: false,
      warnings: [],
      message,
    };
  }

  const existingObservation = await getObservationByRawPacketId(rawPacketId);
  if (existingObservation) {
    await deleteObservationWithSensors(existingObservation.id);
  }

  const parsed = parseEcowittPayload(packet.rawPayload as RawPayload, {
    receivedAt: packet.receivedAt,
  });

  const outcome = await processParsedPacketForStation(
    rawPacketId,
    { id: packet.stationId },
    parsed,
  );

  return { rawPacketId, stationMatched: true, ...outcome };
}
