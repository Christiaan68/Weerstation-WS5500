/**
 * Records-logica (Fase 3): koppelt de SQL-side extremen uit
 * `src/lib/db/queries.ts` (`getWeatherRecords()`) aan de vier periodes van de
 * `/records`-pagina — vandaag, deze maand, dit jaar, all-time — met correcte
 * Europe/Amsterdam-kalendergrenzen (zie `src/lib/weather/timezone.ts`).
 *
 * Bewust GEEN eigen aggregatie hier: dit bestand berekent alleen de
 * tijdvak-grenzen en delegeert de eigenlijke MIN/MAX-query naar de database.
 */
import type { WeatherRecordsSet } from "@/lib/db/queries";
import { getWeatherRecords } from "@/lib/db/queries";
import {
  addDaysToDateKey,
  addMonthsToYearMonth,
  getLocalDateKey,
  getLocalDayBoundsUtc,
  getLocalMonthBoundsUtc,
  getLocalYearBoundsUtc,
  getLocalYearMonth,
  STATION_TIME_ZONE,
} from "@/lib/weather/timezone";

export const RECORD_PERIODS = ["today", "month", "year", "all"] as const;
export type RecordsPeriod = (typeof RECORD_PERIODS)[number];

export function isRecordsPeriod(value: string): value is RecordsPeriod {
  return (RECORD_PERIODS as readonly string[]).includes(value);
}

export interface RecordsForPeriod {
  period: RecordsPeriod;
  /** Menselijk leesbare periode-omschrijving in het Nederlands (bv. "vandaag", "september 2026"). */
  rangeStartUtc: Date | null;
  rangeEndUtc: Date | null;
  records: WeatherRecordsSet;
}

/**
 * Haalt de recordset op voor één van de vier periodes. `now` is injecteerbaar
 * voor tests (standaard: het huidige moment).
 *
 * @param offset Aantal vensters terug vanaf nu (0 = huidige periode) — bv.
 * bij `period="year"` is offset=1 vorig jaar. Maakt de terug/vooruit-
 * navigatie op `/records` mogelijk (Fase 4.4); genegeerd bij `period="all"`
 * (er is maar één "all-time").
 */
export async function getRecordsForPeriod(
  stationId: number,
  period: RecordsPeriod,
  offset: number = 0,
  now: Date = new Date(),
  timeZone: string = STATION_TIME_ZONE,
): Promise<RecordsForPeriod> {
  if (period === "all") {
    const records = await getWeatherRecords(stationId);
    return { period, rangeStartUtc: null, rangeEndUtc: null, records };
  }

  if (period === "today") {
    const targetDateKey = addDaysToDateKey(getLocalDateKey(now, timeZone), -offset);
    const { startUtc, endUtc } = getLocalDayBoundsUtc(targetDateKey, timeZone);
    const records = await getWeatherRecords(stationId, {
      fromUtc: startUtc,
      toUtc: endUtc,
    });
    return { period, rangeStartUtc: startUtc, rangeEndUtc: endUtc, records };
  }

  if (period === "month") {
    const currentYearMonth = getLocalYearMonth(now, timeZone);
    const { year, month } = addMonthsToYearMonth(
      currentYearMonth.year,
      currentYearMonth.month,
      -offset,
    );
    const { startUtc, endUtc } = getLocalMonthBoundsUtc(year, month, timeZone);
    const records = await getWeatherRecords(stationId, {
      fromUtc: startUtc,
      toUtc: endUtc,
    });
    return { period, rangeStartUtc: startUtc, rangeEndUtc: endUtc, records };
  }

  // period === "year"
  const { year: currentYear } = getLocalYearMonth(now, timeZone);
  const { startUtc, endUtc } = getLocalYearBoundsUtc(currentYear - offset, timeZone);
  const records = await getWeatherRecords(stationId, {
    fromUtc: startUtc,
    toUtc: endUtc,
  });
  return { period, rangeStartUtc: startUtc, rangeEndUtc: endUtc, records };
}
