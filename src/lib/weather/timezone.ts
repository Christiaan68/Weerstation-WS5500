/**
 * Tijdzone- en lokale-kalenderdag-helpers (Fase 3).
 *
 * BELANGRIJK ONDERSCHEID met `src/lib/weather/timestamp.ts`: dat bestand
 * parseert *inkomende* tijdstempels (altijd UTC, geen tijdzone-issue). DIT
 * bestand doet het omgekeerde: het rekent een UTC-instant (zoals opgeslagen
 * in de database) om naar/van een lokale kalenderdag/-tijd, voor
 * presentatie én voor kalender-aggregaties (dag/maand/jaar-samenvattingen,
 * "datacompleetheid vandaag", enz.) — zie de opdracht voor Fase 3, met name
 * de expliciete eis: "Dag = lokale dag in Europe/Amsterdam, niet UTC
 * 00:00–23:59", inclusief correcte afhandeling van dagen van 23 en 25 uur
 * rond de overgang naar/van zomertijd.
 *
 * We gebruiken bewust GEEN extra dependency (zoals `date-fns-tz` of
 * `luxon`) — de ingebouwde `Intl.DateTimeFormat`-API is voldoende voor wat
 * we nodig hebben, en voorkomt een extra library puur voor tijdzonewerk
 * (zie Fase 3-eis "gebruik niet meerdere/onnodige libraries").
 */

export const STATION_TIME_ZONE = "Europe/Amsterdam";
export const NL_LOCALE = "nl-NL";

/**
 * Het offset (in milliseconden) tussen een absoluut instant en hoe laat het
 * op dat instant in `timeZone` is, uitgedrukt als "zoveel ms moet je bij UTC
 * optellen om de lokale wandklok-tijd te krijgen".
 */
function getTimeZoneOffsetMs(instant: Date, timeZone: string): number {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = formatter.formatToParts(instant);
  const map: Record<string, string> = {};
  for (const part of parts) {
    if (part.type !== "literal") map[part.type] = part.value;
  }
  const asUtc = Date.UTC(
    Number(map.year),
    Number(map.month) - 1,
    Number(map.day),
    Number(map.hour === "24" ? "0" : map.hour),
    Number(map.minute),
    Number(map.second),
  );
  return asUtc - instant.getTime();
}

/**
 * Rekent lokale wandklok-velden (in `timeZone`) om naar het bijbehorende
 * UTC-instant. Standaardalgoritme voor dit soort conversies zonder library:
 * twee iteraties zijn ruim voldoende omdat Europe/Amsterdam maar twee vaste
 * offsets kent (UTC+1 / UTC+2) en de overgangen altijd 's nachts om 02:00/
 * 03:00 lokale tijd plaatsvinden — nooit rond middernacht, dus nooit tijdens
 * de dagswisseling die dit bestand berekent.
 */
export function zonedWallTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  timeZone: string = STATION_TIME_ZONE,
): Date {
  const naiveUtcMs = Date.UTC(year, month - 1, day, hour, minute, second);
  let offset = getTimeZoneOffsetMs(new Date(naiveUtcMs), timeZone);
  let result = naiveUtcMs - offset;
  // Tweede iteratie: verfijnt het resultaat voor het (zeldzame) geval dat de
  // eerste gok net aan de verkeerde kant van een DST-overgang uitkwam.
  offset = getTimeZoneOffsetMs(new Date(result), timeZone);
  result = naiveUtcMs - offset;
  return new Date(result);
}

/** Lokale kalenderdatum van een UTC-instant, als "YYYY-MM-DD" string. */
export function getLocalDateKey(
  date: Date,
  timeZone: string = STATION_TIME_ZONE,
): string {
  // en-CA geeft rechtstreeks het ISO-achtige YYYY-MM-DD formaat.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/** Lokaal jaar en maand (1-12) van een UTC-instant. */
export function getLocalYearMonth(
  date: Date,
  timeZone: string = STATION_TIME_ZONE,
): { year: number; month: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
  }).formatToParts(date);
  const year = Number(parts.find((p) => p.type === "year")!.value);
  const month = Number(parts.find((p) => p.type === "month")!.value);
  return { year, month };
}

/** Lokaal jaar van een UTC-instant. */
export function getLocalYear(date: Date, timeZone: string = STATION_TIME_ZONE): number {
  return getLocalYearMonth(date, timeZone).year;
}

export interface LocalDayBounds {
  /** UTC-instant van lokale middernacht aan het BEGIN van deze dag (inclusief). */
  startUtc: Date;
  /** UTC-instant van lokale middernacht aan het EIND van deze dag (exclusief). */
  endUtc: Date;
  /** Duur van deze lokale dag in seconden — 86400 op een normale dag, 82800 (23u) of 90000 (25u) rond een DST-overgang. */
  durationSeconds: number;
}

/** Parseert een "YYYY-MM-DD"-string naar {year, month, day} zonder tijdzone-aannames. */
function parseDateKey(localDateKey: string): {
  year: number;
  month: number;
  day: number;
} {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(localDateKey);
  if (!match) {
    throw new Error(`Ongeldige datumsleutel: "${localDateKey}", verwacht YYYY-MM-DD.`);
  }
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

/**
 * Begin/eind (in UTC) van een lokale kalenderdag, DST-bewust. `endUtc` is
 * het begin van de VOLGENDE lokale dag (exclusief bovengrens) — filter dus
 * altijd met `measuredAt >= startUtc AND measuredAt < endUtc`.
 */
export function getLocalDayBoundsUtc(
  localDateKey: string,
  timeZone: string = STATION_TIME_ZONE,
): LocalDayBounds {
  const { year, month, day } = parseDateKey(localDateKey);
  const startUtc = zonedWallTimeToUtc(year, month, day, 0, 0, 0, timeZone);
  // Volgende dag berekenen via UTC-arithmetiek op de datumvelden (niet op
  // het instant zelf) zodat maand-/jaarovergangen vanzelf goed gaan.
  const nextDayUtcNaive = new Date(Date.UTC(year, month - 1, day + 1));
  const endUtc = zonedWallTimeToUtc(
    nextDayUtcNaive.getUTCFullYear(),
    nextDayUtcNaive.getUTCMonth() + 1,
    nextDayUtcNaive.getUTCDate(),
    0,
    0,
    0,
    timeZone,
  );
  const durationSeconds = Math.round((endUtc.getTime() - startUtc.getTime()) / 1000);
  return { startUtc, endUtc, durationSeconds };
}

/** Begin/eind (UTC) van een lokale kalendermaand. */
export function getLocalMonthBoundsUtc(
  year: number,
  month: number,
  timeZone: string = STATION_TIME_ZONE,
): { startUtc: Date; endUtc: Date } {
  const startUtc = zonedWallTimeToUtc(year, month, 1, 0, 0, 0, timeZone);
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  const endUtc = zonedWallTimeToUtc(nextYear, nextMonth, 1, 0, 0, 0, timeZone);
  return { startUtc, endUtc };
}

/** Begin/eind (UTC) van een lokaal kalenderjaar. */
export function getLocalYearBoundsUtc(
  year: number,
  timeZone: string = STATION_TIME_ZONE,
): { startUtc: Date; endUtc: Date } {
  const startUtc = zonedWallTimeToUtc(year, 1, 1, 0, 0, 0, timeZone);
  const endUtc = zonedWallTimeToUtc(year + 1, 1, 1, 0, 0, 0, timeZone);
  return { startUtc, endUtc };
}

/** "Vandaag" als lokale datumsleutel, op het moment van aanroepen. */
export function todayLocalDateKey(timeZone: string = STATION_TIME_ZONE): string {
  return getLocalDateKey(new Date(), timeZone);
}

// ---------------------------------------------------------------------------
// Presentatie (Nederlandse locale, Europe/Amsterdam)
// ---------------------------------------------------------------------------

/** "16:18" */
export function formatLocalTime(
  date: Date,
  timeZone: string = STATION_TIME_ZONE,
): string {
  return new Intl.DateTimeFormat(NL_LOCALE, {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
}

/** "5 september 2026" */
export function formatLocalDateLong(
  date: Date,
  timeZone: string = STATION_TIME_ZONE,
): string {
  return new Intl.DateTimeFormat(NL_LOCALE, {
    timeZone,
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

/** "za 5 sep" */
export function formatLocalDateShort(
  date: Date,
  timeZone: string = STATION_TIME_ZONE,
): string {
  return new Intl.DateTimeFormat(NL_LOCALE, {
    timeZone,
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(date);
}

/** "5 september 2026, 16:18" */
export function formatLocalDateTime(
  date: Date,
  timeZone: string = STATION_TIME_ZONE,
): string {
  return `${formatLocalDateLong(date, timeZone)}, ${formatLocalTime(date, timeZone)}`;
}

const MONTH_NAMES_NL_SHORT = [
  "jan",
  "feb",
  "mrt",
  "apr",
  "mei",
  "jun",
  "jul",
  "aug",
  "sep",
  "okt",
  "nov",
  "dec",
] as const;

/** Nederlandse korte maandnaam (1-12), bv. voor jaaroverzicht-grafieken ("Jan", "Feb", ...). */
export function shortMonthNameNl(month: number): string {
  const name = MONTH_NAMES_NL_SHORT[month - 1];
  if (!name) throw new Error(`Ongeldige maand: ${month}`);
  return name.charAt(0).toUpperCase() + name.slice(1);
}
