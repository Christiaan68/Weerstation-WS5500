/**
 * Defensieve UTC-tijdstempelverwerking voor inkomende weerstation-payloads.
 *
 * Waarom dit een apart, goed geteste bestand is (zie ook
 * docs/WS5500_INGESTION.md §Tijd):
 *
 * - Het Ecowitt-protocol stuurt `dateutc` doorgaans als
 *   `"YYYY-MM-DD HH:MM:SS"` — een tijdstip in UTC, maar ZONDER tijdzone-
 *   aanduiding. `new Date("2024-01-01 12:00:00")` interpreteert dit in de
 *   meeste JS-engines als LOKALE tijd van de server, niet als UTC. Op
 *   Vercel draait de functie weliswaar zelf in UTC, maar bij lokaal
 *   ontwikkelen (of een andere hostingomgeving) zou dat een stille
 *   tijdzonefout introduceren. Daarom wordt hier expliciet met
 *   `Date.UTC(...)` gewerkt, nooit met de impliciete parser van `Date`.
 * - Sommige Ecowitt-firmwares/instellingen sturen letterlijk de string
 *   `"now"` in plaats van een tijdstip — dat betekent "gebruik de huidige
 *   tijd van de ontvanger".
 * - `dateutc` kan ontbreken (bv. bij een handmatige test-payload). Dan
 *   vallen we terug op het ontvangsttijdstip, met een waarschuwing.
 * - De Ecowitt Cloud API levert per meetgroep soms een tijdstip als
 *   Unix-epoch (seconden sinds 1-1-1970 UTC) — ook expliciet UTC, geen
 *   probleem, maar wel een ander formaat.
 * - Europe/Amsterdam-zomertijd/wintertijd is voor dít bestand geen issue:
 *   er wordt uitsluitend met UTC gerekend. De stationstijdzone
 *   (`stations.timezone`) is alleen relevant voor latere presentatie/
 *   kalenderaggregatie, niet voor het interpreteren van `dateutc`.
 */
import type { RawFieldValue } from "./types";

export type MeasuredAtSource =
  "dateutc" | "dateutc_now" | "received_at_fallback" | "epoch_seconds";

export interface ParsedTimestamp {
  date: Date;
  source: MeasuredAtSource;
  warning?: string;
}

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.\d+)?Z?$/;

/** Redelijke grenzen om een overduidelijk foute klok/parsefout te signaleren. */
const MAX_FUTURE_SKEW_MS = 24 * 60 * 60 * 1000; // 1 dag
const MIN_YEAR = 2000;

function isPlausible(date: Date, receivedAt: Date): string | undefined {
  if (Number.isNaN(date.getTime())) {
    return "tijdstip kon niet worden geparsed";
  }
  if (date.getUTCFullYear() < MIN_YEAR) {
    return `tijdstip ligt vóór het jaar ${MIN_YEAR}, waarschijnlijk een parsefout`;
  }
  if (date.getTime() - receivedAt.getTime() > MAX_FUTURE_SKEW_MS) {
    return "tijdstip ligt meer dan 24 uur in de toekomst ten opzichte van ontvangst";
  }
  return undefined;
}

/**
 * Parseert een `dateutc`-achtig veld (Ecowitt-push-protocol) defensief.
 * Geeft ALTIJD een bruikbaar tijdstip terug (nooit `undefined`/throw) — bij
 * twijfel valt dit terug op `receivedAt`, met een waarschuwing, zodat er
 * nooit dataverlies optreedt puur door een onverwacht tijdformaat.
 */
export function parseEcowittDateUtc(
  value: RawFieldValue,
  receivedAt: Date,
): ParsedTimestamp {
  if (value === undefined || value === null || value === "") {
    return {
      date: receivedAt,
      source: "received_at_fallback",
      warning: "dateutc ontbreekt in de payload; ontvangsttijd gebruikt",
    };
  }

  const stringValue = String(value).trim();

  if (stringValue.toLowerCase() === "now") {
    return { date: receivedAt, source: "dateutc_now" };
  }

  // Puur numeriek: Unix-epoch in seconden (10 cijfers) of milliseconden (13).
  if (/^\d{10}$/.test(stringValue)) {
    const date = new Date(Number(stringValue) * 1000);
    const warning = isPlausible(date, receivedAt);
    return { date: warning ? receivedAt : date, source: "epoch_seconds", warning };
  }
  if (/^\d{13}$/.test(stringValue)) {
    const date = new Date(Number(stringValue));
    const warning = isPlausible(date, receivedAt);
    return { date: warning ? receivedAt : date, source: "epoch_seconds", warning };
  }

  const match = DATE_PATTERN.exec(stringValue);
  if (match) {
    const [, year, month, day, hour, minute, second] = match;
    const date = new Date(
      Date.UTC(
        Number(year),
        Number(month) - 1,
        Number(day),
        Number(hour),
        Number(minute),
        Number(second),
      ),
    );
    const warning = isPlausible(date, receivedAt);
    return { date: warning ? receivedAt : date, source: "dateutc", warning };
  }

  return {
    date: receivedAt,
    source: "received_at_fallback",
    warning: `dateutc-waarde "${stringValue}" heeft een onbekend formaat; ontvangsttijd gebruikt`,
  };
}
