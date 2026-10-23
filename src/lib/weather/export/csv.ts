/**
 * Pure CSV-opmaakfunctie (Fase 4, §13-14) — geen I/O, makkelijk testbaar.
 *
 * Twee dingen die hier bewust anders gaan dan een "gewone" CSV-writer:
 * 1. Ontbrekende waarden worden een LEEG veld (`""`), nooit `"0"` — een
 *    expliciete Fase 4-eis (§5, §13): een sensor die niets teruggeeft is
 *    geen 0-meting.
 * 2. Bij `delimiter: "semicolon"` (de Nederlandse Excel-conventie: lijst-
 *    scheidingsteken `;`, decimaalteken `,`) worden getallen met een KOMMA
 *    als decimaalteken geschreven i.p.v. een punt — anders interpreteert
 *    Excel met Nederlandse regio-instellingen "19.7" als tekst, niet als
 *    getal. Bij `delimiter: "comma"` blijft het internationale puntformaat
 *    gehandhaafd.
 */

export type CsvDelimiter = "comma" | "semicolon";

export function delimiterChar(delimiter: CsvDelimiter): string {
  return delimiter === "semicolon" ? ";" : ",";
}

/**
 * Formatteert een getal voor CSV-uitvoer. `null`/`undefined` → leeg veld
 * (nooit "0"). Bij `semicolon` wordt het decimaalpunt vervangen door een
 * komma (Nederlandse Excel-conventie) — de waarde zelf wordt niet
 * afgerond/gewijzigd, alleen de schrijfwijze.
 */
export function formatCsvNumber(
  value: number | string | null | undefined,
  delimiter: CsvDelimiter,
): string {
  if (value === null || value === undefined) return "";
  const asString = typeof value === "number" ? String(value) : value;
  if (asString.trim() === "") return "";
  return delimiter === "semicolon" ? asString.replace(".", ",") : asString;
}

/**
 * Escaped één CSV-veld volgens RFC 4180: een veld dat het scheidingsteken,
 * een dubbele aanhalingsteken, een regeleinde, of leidende/volgende
 * spaties bevat wordt tussen dubbele aanhalingstekens gezet, met interne
 * `"` verdubbeld. Een leeg/onopvallend veld blijft ongewijzigd (geen
 * onnodige quoting — leesbaarder, en nog steeds correct).
 */
export function csvEscapeField(value: string, delimiter: CsvDelimiter): string {
  const delim = delimiterChar(delimiter);
  const needsQuoting =
    value.includes(delim) ||
    value.includes('"') ||
    value.includes("\n") ||
    value.includes("\r");
  if (!needsQuoting) return value;
  return `"${value.replace(/"/g, '""')}"`;
}

/** Bouwt één CSV-regel (zonder regeleinde) uit al-geformatteerde veldwaarden. */
export function buildCsvLine(fields: string[], delimiter: CsvDelimiter): string {
  const delim = delimiterChar(delimiter);
  return fields.map((f) => csvEscapeField(f, delimiter)).join(delim);
}

/** CRLF — het regeleinde dat Excel (ook op macOS) betrouwbaar als CSV herkent. */
export const CSV_LINE_ENDING = "\r\n";

/** UTF-8 byte-order mark — laat Excel (vooral op Windows) het bestand betrouwbaar als UTF-8 openen i.p.v. Latin-1/ANSI te gokken (belangrijk voor bv. "°" en "²" in kolomkoppen/eenheden). */
export const UTF8_BOM = "﻿";
