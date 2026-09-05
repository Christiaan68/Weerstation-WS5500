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
  getLocalDateKey,
  getLocalDayBoundsUtc,
  getLocalYearMonth,
  todayLocalDateKey,
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
  totalMm: number | null;
  isRainDay: boolean;
  rainDayThresholdMm: number;
  maxRateMmH: WeatherRecordPoint | null;
  /** Staafgrafiek: per uur (vandaag) of per dag (week/maand) of per maand (jaar). */
  bars: RainBar[];
}

function last7LocalDateKeys(now: Date): string[] {
  const keys: string[] = [];
  for (let i = 6; i >= 0; i--) {
    keys.push(getLocalDateKey(new Date(now.getTime() - i * 24 * 60 * 60 * 1000)));
  }
  return keys;
}

export async function getRainOverview(
  stationId: number,
  period: RainPeriod,
  now: Date = new Date(),
): Promise<RainOverview> {
  if (period === "today") {
    const localDateKey = getLocalDateKey(now);
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
    const dateKeys = last7LocalDateKeys(now);
    const [dailyRows, maxRate] = await Promise.all([
      listDailySummaries(stationId, dateKeys[0]!, dateKeys[dateKeys.length - 1]!),
      getMaxRainRateInRange(
        stationId,
        getLocalDayBoundsUtc(dateKeys[0]!).startUtc,
        getLocalDayBoundsUtc(dateKeys[dateKeys.length - 1]!).endUtc,
      ),
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
    const { year, month } = getLocalYearMonth(now);
    const monthStr = String(month).padStart(2, "0");
    const from = `${year}-${monthStr}-01`;
    const to = todayLocalDateKey(); // begrensd tot vandaag (de rest van de maand is nog niet gemeten)
    const [dailyRows, maxRate] = await Promise.all([
      listDailySummaries(stationId, from, to),
      getMaxRainRateInRange(stationId, getLocalDayBoundsUtc(from).startUtc, now),
    ]);
    const dailyTotals = dailyRows.map((r) =>
      r.rainTotalMm === null ? null : Number(r.rainTotalMm),
    );

    return {
      period,
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
  const { year } = getLocalYearMonth(now);
  const [monthlyRows, maxRate] = await Promise.all([
    listMonthlySummariesForYear(stationId, year),
    getMaxRainRateInRange(stationId, getLocalDayBoundsUtc(`${year}-01-01`).startUtc, now),
  ]);
  const monthlyTotals = monthlyRows.map((r) =>
    r.rainTotalMm === null ? null : Number(r.rainTotalMm),
  );

  return {
    period,
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
