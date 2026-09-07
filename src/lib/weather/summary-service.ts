/**
 * Orchestratie voor het (her)berekenen van de dag/maand/jaar-samenvattingen
 * (Fase 3). Combineert de SQL-aggregatie (`src/lib/db/queries.ts`), de
 * lokale-kalendergrenzen (`timezone.ts`) en de pure combinatielogica
 * (`summary.ts`) tot de functies die daadwerkelijk de
 * `daily_weather_summary`/`monthly_weather_summary`/`yearly_weather_summary`-
 * tabellen vullen.
 *
 * Twee aanroepvormen:
 * - Incrementeel: `recomputeSummariesForInstant()` wordt (best-effort, nooit
 *   blokkerend) aangeroepen direct na een nieuwe meting, en herberekent
 *   alleen de dag/maand/jaar waar die meting in valt — zie de aanroep vanuit
 *   `src/lib/weather/ingest-pipeline.ts`.
 * - Backfill: `scripts/recompute-summaries.ts` roept `recomputeDailySummary()`
 *   voor een reeks dagen aan (en daarna de maanden/jaren die daardoor
 *   veranderd zijn) — voor historische data of na een reparatiescript
 *   (bv. `scripts/repair-temp-unitid-bug.ts`) dat oude metingen wijzigt.
 */
import {
  aggregateObservationsForRange,
  listDailySummaries,
  listMonthlySummariesForYear,
  upsertDailySummary,
  upsertMonthlySummary,
  upsertYearlySummary,
} from "@/lib/db/queries";
import type { DailyWeatherSummary, MonthlyWeatherSummary } from "@/lib/db/schema";
import {
  buildSummaryFromRawAggregate,
  combineSummaryAggregates,
  type SummaryAggregateValues,
} from "@/lib/weather/summary";
import {
  getLocalDateKey,
  getLocalDayBoundsUtc,
  getLocalYearMonth,
  STATION_TIME_ZONE,
} from "@/lib/weather/timezone";

/**
 * Huidige pollfrequentie van de Ecowitt Cloud-cronjob (zie
 * docs/AUTOMATIC_INGESTION.md) — de noemer voor dekkingspercentages. Bewust
 * hier als losse constante (niet uit env gelezen): dit is de frequentie
 * waarmee WIJ de cloud-API bevragen, geen geheime/omgevingsafhankelijke
 * waarde, en verandert alleen bij een bewuste aanpassing van de cronjob.
 */
export const DEFAULT_POLL_INTERVAL_SECONDS = 300;

function numOrNull(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Zet een opgeslagen dag- of maandsamenvattingsrij om naar het rekenformaat van `summary.ts`. */
function toAggregateValues(
  row: DailyWeatherSummary | MonthlyWeatherSummary,
): SummaryAggregateValues {
  return {
    temperatureMinC: numOrNull(row.temperatureMinC),
    temperatureMaxC: numOrNull(row.temperatureMaxC),
    temperatureAvgC: numOrNull(row.temperatureAvgC),
    humidityMinPct: numOrNull(row.humidityMinPct),
    humidityMaxPct: numOrNull(row.humidityMaxPct),
    humidityAvgPct: numOrNull(row.humidityAvgPct),
    pressureMinHpa: numOrNull(row.pressureMinHpa),
    pressureMaxHpa: numOrNull(row.pressureMaxHpa),
    pressureAvgHpa: numOrNull(row.pressureAvgHpa),
    windAvgKmh: numOrNull(row.windAvgKmh),
    windMaxKmh: numOrNull(row.windMaxKmh),
    windGustMaxKmh: numOrNull(row.windGustMaxKmh),
    rainTotalMm: numOrNull(row.rainTotalMm),
    rainRateMaxMmH: numOrNull(row.rainRateMaxMmH),
    uvMax: numOrNull(row.uvMax),
    solarRadiationMaxWm2: numOrNull(row.solarRadiationMaxWm2),
    observationCount: row.observationCount,
    expectedObservationCount: row.expectedObservationCount,
    coveragePct: numOrNull(row.coveragePct),
  };
}

/** Alle lokale datumsleutels ("YYYY-MM-DD") van een kalendermaand, oplopend. */
export function localDateKeysInMonth(year: number, month: number): string[] {
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const keys: string[] = [];
  for (let day = 1; day <= daysInMonth; day++) {
    keys.push(
      `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}-${day
        .toString()
        .padStart(2, "0")}`,
    );
  }
  return keys;
}

/**
 * Herberekent de dagsamenvatting van één lokale dag, rechtstreeks uit
 * `weather_observations`. `timeZone` (Fase 5, §48-50): de IANA-tijdzone van
 * HET STATION waarvoor dit berekend wordt — bepaalt waar de lokale dag
 * begint/eindigt (DST-bewust, zie `timezone.ts`). Standaard `Europe/
 * Amsterdam` zodat bestaande aanroepen zonder expliciete tijdzone (tests,
 * scripts die nog niet zijn bijgewerkt) exact hetzelfde gedrag houden als
 * vóór Fase 5.
 */
export async function recomputeDailySummary(
  stationId: number,
  localDateKey: string,
  pollIntervalSeconds: number = DEFAULT_POLL_INTERVAL_SECONDS,
  timeZone: string = STATION_TIME_ZONE,
): Promise<void> {
  const { startUtc, endUtc, durationSeconds } = getLocalDayBoundsUtc(localDateKey, timeZone);
  const raw = await aggregateObservationsForRange(stationId, startUtc, endUtc);
  const values = buildSummaryFromRawAggregate(raw, durationSeconds, pollIntervalSeconds);
  await upsertDailySummary(stationId, localDateKey, values);
}

/**
 * Herberekent de maandsamenvatting door de (al opgeslagen) dagsamenvattingen
 * van die maand te combineren — scant `weather_observations` NIET opnieuw.
 * Roep `recomputeDailySummary()` voor de relevante dagen dus altijd eerst
 * aan.
 */
export async function recomputeMonthlySummary(
  stationId: number,
  year: number,
  month: number,
): Promise<void> {
  const dateKeys = localDateKeysInMonth(year, month);
  const dailyRows = await listDailySummaries(
    stationId,
    dateKeys[0]!,
    dateKeys[dateKeys.length - 1]!,
  );
  const combined = combineSummaryAggregates(dailyRows.map(toAggregateValues));
  await upsertMonthlySummary(stationId, year, month, combined);
}

/**
 * Herberekent de jaarsamenvatting door de (al opgeslagen) maandsamenvattingen
 * van dat jaar te combineren — scant `weather_observations` NIET opnieuw.
 */
export async function recomputeYearlySummary(
  stationId: number,
  year: number,
): Promise<void> {
  const monthlyRows = await listMonthlySummariesForYear(stationId, year);
  const combined = combineSummaryAggregates(monthlyRows.map(toAggregateValues));
  await upsertYearlySummary(stationId, year, combined);
}

/**
 * Herberekent dag + maand + jaar voor het lokale moment van één meting —
 * de incrementele aanroep na een nieuwe/gewijzigde observatie. Wordt door de
 * ingestie-pijplijn ALTIJD in een try/catch aangeroepen (zie
 * `ingest-pipeline.ts`): een mislukte samenvatting mag een geslaagde
 * meting-opslag nooit blokkeren of de 200 OK richting de poller in gevaar
 * brengen.
 */
export async function recomputeSummariesForInstant(
  stationId: number,
  measuredAtUtc: Date,
  pollIntervalSeconds: number = DEFAULT_POLL_INTERVAL_SECONDS,
  timeZone: string = STATION_TIME_ZONE,
): Promise<void> {
  const localDateKey = getLocalDateKey(measuredAtUtc, timeZone);
  const { year, month } = getLocalYearMonth(measuredAtUtc, timeZone);

  await recomputeDailySummary(stationId, localDateKey, pollIntervalSeconds, timeZone);
  await recomputeMonthlySummary(stationId, year, month);
  await recomputeYearlySummary(stationId, year);
}

/**
 * Herberekent een reeks lokale dagen plus alle maanden/jaren die daardoor
 * geraakt worden — gebruikt door `scripts/recompute-summaries.ts` voor
 * backfill/reparatie. Dag-voor-dag sequentieel (niet parallel): dit voorkomt
 * dat twee gelijktijdige upserts van dezelfde maand elkaars resultaat
 * overschrijven (een month-summary wordt na ELKE dag van die maand opnieuw
 * berekend uit ALLE dagen van die maand, dus de volgorde binnen een maand
 * maakt niet uit, maar overlappende schrijfacties wel).
 */
export async function recomputeDailySummariesInRange(
  stationId: number,
  localDateKeys: string[],
  pollIntervalSeconds: number = DEFAULT_POLL_INTERVAL_SECONDS,
  timeZone: string = STATION_TIME_ZONE,
): Promise<{
  recomputedDays: number;
  recomputedMonths: number;
  recomputedYears: number;
}> {
  const affectedMonths = new Set<string>(); // "YYYY-MM"
  const affectedYears = new Set<number>();

  for (const localDateKey of localDateKeys) {
    await recomputeDailySummary(stationId, localDateKey, pollIntervalSeconds, timeZone);
    const [yearStr, monthStr] = localDateKey.split("-");
    affectedMonths.add(`${yearStr}-${monthStr}`);
    affectedYears.add(Number(yearStr));
  }

  for (const monthKey of affectedMonths) {
    const [yearStr, monthStr] = monthKey.split("-");
    await recomputeMonthlySummary(stationId, Number(yearStr), Number(monthStr));
  }

  for (const year of affectedYears) {
    await recomputeYearlySummary(stationId, year);
  }

  return {
    recomputedDays: localDateKeys.length,
    recomputedMonths: affectedMonths.size,
    recomputedYears: affectedYears.size,
  };
}
