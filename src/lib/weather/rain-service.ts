/**
 * Regenoverzicht per periode (Fase 3, `/rain`-pagina + `/api/weather/rain`).
 * Koppelt de pure regenlogica (`rain.ts`) en de lokale-kalendergrenzen
 * (`timezone.ts`) aan de database:
 * - "Vandaag": rechtstreeks uit `weather_observations` (kleine, actuele
 *   query — de dag is nog niet "af" en moet altijd de laatste meting
 *   weerspiegelen, vandaar geen samenvattingstabel hier).
 * - "Deze week/maand/jaar": uit de al bijgehouden `daily_weather_summary` /
 *   `monthly_weather_summary`-tabellen (zie summary-service.ts) — nooit een
 *   nieuwe volledige scan van `weather_observations` voor een bulkperiode.
 */
import {
  getDailySummary,
  getHourlyMaxRainDay,
  getMaxRainDayInRange,
  getMaxRainRateInRange,
  listDailySummaries,
  listMonthlySummariesForYear,
  type WeatherRecordPoint,
} from "@/lib/db/queries";
import {
  DEFAULT_RAIN_DAY_THRESHOLD_MM,
  incrementsFromCumulativeSeries,
  isRainDay,
  sumDailyTotals,
} from "@/lib/weather/rain";
import {
  addDaysToDateKey,
  addMonthsToYearMonth,
  getLocalDateKey,
  getLocalDayBoundsUtc,
  getLocalYearMonth,
} from "@/lib/weather/timezone";

export const RAIN_PERIODS = ["today", "week", "month", "year"] as const;
export type RainPeriod = (typeof RAIN_PERIODS)[number];

export interface RainBar {
  key: string;
  label: string;
  totalMm: number | null;
  isRainDay: boolean;
}

export interface RainOverview {
  period: RainPeriod;
  /** Daadwerkelijk gebruikte tijdvak (ISO) — bepaalt het label bij de terug/vooruit-navigatie op de client (Fase 4.4). */
  from: string;
  to: string;
  totalMm: number | null;
  isRainDay: boolean;
  rainDayThresholdMm: number;
  maxRateMmH: WeatherRecordPoint | null;
  /** Staafgrafiek: per uur (vandaag) of per dag (week/maand) of per maand (jaar). */
  bars: RainBar[];
}

function last7LocalDateKeysEndingAt(endDateKey: string): string[] {
  const keys: string[] = [];
  for (let i = 6; i >= 0; i--) keys.push(addDaysToDateKey(endDateKey, -i));
  return keys;
}

/** Kleinste van twee "YYYY-MM-DD"-datumsleutels (lexicografische vergelijking is hier correct, zelfde formaat). */
function minDateKey(a: string, b: string): string {
  return a < b ? a : b;
}

/**
 * @param offset Aantal vensters terug vanaf nu (0 = huidig/lopend venster) —
 * bv. bij `period="month"` is offset=1 vorige maand. Maakt de terug/vooruit-
 * navigatie op `/regen` mogelijk (Fase 4.4) zonder de bestaande
 * default-aanroepen (offset 0) te wijzigen.
 */
export async function getRainOverview(
  stationId: number,
  period: RainPeriod,
  offset: number = 0,
  now: Date = new Date(),
): Promise<RainOverview> {
  const actualTodayKey = getLocalDateKey(now);

  if (period === "today") {
    const localDateKey = addDaysToDateKey(actualTodayKey, -offset);
    const { startUtc, endUtc } = getLocalDayBoundsUtc(localDateKey);

    const [maxRainDay, maxRate, hourlyBuckets] = await Promise.all([
      getMaxRainDayInRange(stationId, startUtc, endUtc),
      getMaxRainRateInRange(stationId, startUtc, endUtc),
      getHourlyMaxRainDay(stationId, startUtc, endUtc),
    ]);

    const increments = incrementsFromCumulativeSeries(
      hourlyBuckets.map((b) => ({
        key: String(b.hourIndex),
        maxValueMm: b.maxRainDayMm,
      })),
    );

    return {
      period,
      from: startUtc.toISOString(),
      to: endUtc.toISOString(),
      totalMm: maxRainDay,
      isRainDay: isRainDay(maxRainDay),
      rainDayThresholdMm: DEFAULT_RAIN_DAY_THRESHOLD_MM,
      maxRateMmH: maxRate,
      bars: increments.map((inc) => ({
        key: inc.key,
        label: `${inc.key}:00`,
        totalMm: inc.incrementMm,
        isRainDay: false,
      })),
    };
  }

  if (period === "week") {
    const endDateKey = addDaysToDateKey(actualTodayKey, -offset * 7);
    const dateKeys = last7LocalDateKeysEndingAt(endDateKey);
    const rangeStartUtc = getLocalDayBoundsUtc(dateKeys[0]!).startUtc;
    const rangeEndUtc = getLocalDayBoundsUtc(dateKeys[dateKeys.length - 1]!).endUtc;
    const [dailyRows, maxRate] = await Promise.all([
      listDailySummaries(stationId, dateKeys[0]!, dateKeys[dateKeys.length - 1]!),
      getMaxRainRateInRange(stationId, rangeStartUtc, rangeEndUtc),
    ]);
    const byDate = new Map(
      dailyRows.map((r) => [
        r.localDate,
        r.rainTotalMm === null ? null : Number(r.rainTotalMm),
      ]),
    );
    const dailyTotals = dateKeys.map((key) => byDate.get(key) ?? null);

    return {
      period,
      from: rangeStartUtc.toISOString(),
      to: rangeEndUtc.toISOString(),
      totalMm: sumDailyTotals(dailyTotals),
      isRainDay: isRainDay(dailyTotals.at(-1) ?? null),
      rainDayThresholdMm: DEFAULT_RAIN_DAY_THRESHOLD_MM,
      maxRateMmH: maxRate,
      bars: dateKeys.map((key, i) => ({
        key,
        label: key.slice(5), // "MM-DD"
        totalMm: dailyTotals[i] ?? null,
        isRainDay: isRainDay(dailyTotals[i] ?? null),
      })),
    };
  }

  if (period === "month") {
    const currentYearMonth = getLocalYearMonth(now);
    const { year, month } = addMonthsToYearMonth(
      currentYearMonth.year,
      currentYearMonth.month,
      -offset,
    );
    const monthStr = String(month).padStart(2, "0");
    const from = `${year}-${monthStr}-01`;
    // Begrensd tot de laatste dag van de maand — of tot vandaag, voor de
    // huidige (nog lopende) maand, want die is nog niet "af".
    const nextMonth = addMonthsToYearMonth(year, month, 1);
    const lastDayOfMonthKey = addDaysToDateKey(`${nextMonth.year}-${String(nextMonth.month).padStart(2, "0")}-01`, -1);
    const to = minDateKey(actualTodayKey, lastDayOfMonthKey);
    const rangeStartUtc = getLocalDayBoundsUtc(from).startUtc;
    const rangeEndUtc = getLocalDayBoundsUtc(to).endUtc;
    const [dailyRows, maxRate] = await Promise.all([
      listDailySummaries(stationId, from, to),
      getMaxRainRateInRange(stationId, rangeStartUtc, rangeEndUtc),
    ]);
    const dailyTotals = dailyRows.map((r) =>
      r.rainTotalMm === null ? null : Number(r.rainTotalMm),
    );

    return {
      period,
      from: rangeStartUtc.toISOString(),
      to: rangeEndUtc.toISOString(),
      totalMm: sumDailyTotals(dailyTotals),
      isRainDay: isRainDay(dailyTotals.at(-1) ?? null),
      rainDayThresholdMm: DEFAULT_RAIN_DAY_THRESHOLD_MM,
      maxRateMmH: maxRate,
      bars: dailyRows.map((r) => ({
        key: r.localDate,
        label: r.localDate.slice(8), // dagnummer
        totalMm: r.rainTotalMm === null ? null : Number(r.rainTotalMm),
        isRainDay: isRainDay(r.rainTotalMm === null ? null : Number(r.rainTotalMm)),
      })),
    };
  }

  // period === "year"
  const { year: currentYear } = getLocalYearMonth(now);
  const year = currentYear - offset;
  const lastDayOfYearKey = `${year}-12-31`;
  const to = minDateKey(actualTodayKey, lastDayOfYearKey);
  const rangeStartUtc = getLocalDayBoundsUtc(`${year}-01-01`).startUtc;
  const rangeEndUtc = getLocalDayBoundsUtc(to).endUtc;
  const [monthlyRows, maxRate] = await Promise.all([
    listMonthlySummariesForYear(stationId, year),
    getMaxRainRateInRange(stationId, rangeStartUtc, rangeEndUtc),
  ]);
  const monthlyTotals = monthlyRows.map((r) =>
    r.rainTotalMm === null ? null : Number(r.rainTotalMm),
  );

  return {
    period,
    from: rangeStartUtc.toISOString(),
    to: rangeEndUtc.toISOString(),
    totalMm: sumDailyTotals(monthlyTotals),
    isRainDay: false,
    rainDayThresholdMm: DEFAULT_RAIN_DAY_THRESHOLD_MM,
    maxRateMmH: maxRate,
    bars: monthlyRows.map((r) => ({
      key: `${r.year}-${String(r.month).padStart(2, "0")}`,
      label: String(r.month),
      totalMm: r.rainTotalMm === null ? null : Number(r.rainTotalMm),
      isRainDay: false,
    })),
  };
}

// `getDailySummary` blijft geëxporteerd beschikbaar voor eventueel hergebruik
// (bv. een toekomstige "regen gisteren"-widget) zonder een nieuwe query te
// hoeven schrijven.
export { getDailySummary };
