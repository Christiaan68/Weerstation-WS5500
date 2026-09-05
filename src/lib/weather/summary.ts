/**
 * Pure rekenlogica voor het vullen van de dag/maand/jaar-samenvattingstabellen
 * (Fase 3) — zie docs/DATA_AGGREGATION.md §Samenvattingen.
 *
 * Dit bestand bevat GEEN databasetoegang (makkelijk testbaar zonder DB). De
 * daadwerkelijke SQL-aggregatie gebeurt in `src/lib/db/queries.ts`
 * (`aggregateObservationsForRange()`); de orchestratie (welke dag/maand/jaar
 * herberekenen, wanneer) staat in `src/lib/weather/summary-service.ts`.
 *
 * ONTWERP — twee lagen van aggregatie:
 * 1. Dagsamenvatting: rechtstreeks SQL-side geaggregeerd uit
 *    `weather_observations` voor die ene lokale dag (`aggregateObservationsForRange()`).
 * 2. Maand-/jaarsamenvatting: NIET opnieuw over alle ruwe metingen van de
 *    maand/jaar (dat zou dezelfde data twee keer scannen en bij een jaar al
 *    snel honderdduizenden rijen zijn). In plaats daarvan wordt een
 *    maandsamenvatting afgeleid uit de (veel kleinere) dagsamenvattingen van
 *    die maand, en een jaarsamenvatting uit de maandsamenvattingen van dat
 *    jaar — via `combineSummaryAggregates()` hieronder:
 *      - min/max: het min/max van de kind-min/max-waarden.
 *      - gemiddelden: gewogen gemiddelde, gewogen naar `observationCount`
 *        van elk kind (een dag met wat missende metingen weegt minder mee
 *        dan een volledige dag) — nooit een simpel ongewogen gemiddelde van
 *        gemiddelden.
 *      - regen (`rainTotalMm`): SOM van de dagtotalen (zie
 *        `src/lib/weather/rain.ts` — dit is precies `sumDailyTotals()`).
 *      - `rainRateMaxMmH`/`uvMax`/`windGustMaxKmh`/...: max van de kind-max.
 *      - `observationCount`/`expectedObservationCount`: som.
 *      - `coveragePct`: herberekend uit de gesommeerde counts (niet
 *        gemiddeld), zodat het exact overeenkomt met de eigen definitie.
 */

export interface SummaryAggregateValues {
  temperatureMinC: number | null;
  temperatureMaxC: number | null;
  temperatureAvgC: number | null;
  humidityMinPct: number | null;
  humidityMaxPct: number | null;
  humidityAvgPct: number | null;
  pressureMinHpa: number | null;
  pressureMaxHpa: number | null;
  pressureAvgHpa: number | null;
  windAvgKmh: number | null;
  windMaxKmh: number | null;
  windGustMaxKmh: number | null;
  rainTotalMm: number | null;
  rainRateMaxMmH: number | null;
  uvMax: number | null;
  solarRadiationMaxWm2: number | null;
  observationCount: number;
  expectedObservationCount: number | null;
  coveragePct: number | null;
}

function round1(value: number | null): number | null {
  return value === null ? null : Math.round(value * 10) / 10;
}

function round2(value: number | null): number | null {
  return value === null ? null : Math.round(value * 100) / 100;
}

/**
 * Verwacht aantal metingen in een tijdvak van `durationSeconds`, gegeven het
 * huidige pollinterval — de noemer voor `coveragePct`. Op een 23-uursdag
 * (zomertijd-overgang) is dit automatisch lager, op een 25-uursdag hoger,
 * omdat `durationSeconds` daar al rekening mee houdt (zie
 * `getLocalDayBoundsUtc()` in `timezone.ts`).
 */
export function computeExpectedObservationCount(
  durationSeconds: number,
  pollIntervalSeconds: number,
): number {
  if (pollIntervalSeconds <= 0) return 0;
  return Math.max(0, Math.round(durationSeconds / pollIntervalSeconds));
}

/** Dekkingspercentage (0-100), begrensd — nooit `null` tenzij er niets verwacht werd. */
export function computeCoveragePct(
  observationCount: number,
  expectedObservationCount: number | null,
): number | null {
  if (!expectedObservationCount || expectedObservationCount <= 0) return null;
  const pct = (observationCount / expectedObservationCount) * 100;
  return Math.round(Math.min(100, Math.max(0, pct)) * 10) / 10;
}

export interface RawDailyAggregate {
  temperatureMinC: number | null;
  temperatureMaxC: number | null;
  temperatureAvgC: number | null;
  humidityMinPct: number | null;
  humidityMaxPct: number | null;
  humidityAvgPct: number | null;
  pressureMinHpa: number | null;
  pressureMaxHpa: number | null;
  pressureAvgHpa: number | null;
  windAvgKmh: number | null;
  windMaxKmh: number | null;
  windGustMaxKmh: number | null;
  rainTotalMm: number | null;
  rainRateMaxMmH: number | null;
  uvMax: number | null;
  solarRadiationMaxWm2: number | null;
  observationCount: number;
}

/**
 * Zet een ruwe SQL-aggregatie (zoals `aggregateObservationsForRange()`
 * teruggeeft) om naar een afgeronde, presentatieklare samenvattingsrij, met
 * het bijbehorende dekkingspercentage.
 */
export function buildSummaryFromRawAggregate(
  raw: RawDailyAggregate,
  durationSeconds: number,
  pollIntervalSeconds: number,
): SummaryAggregateValues {
  const expectedObservationCount =
    raw.observationCount === 0 && durationSeconds === 0
      ? null
      : computeExpectedObservationCount(durationSeconds, pollIntervalSeconds);

  return {
    temperatureMinC: round1(raw.temperatureMinC),
    temperatureMaxC: round1(raw.temperatureMaxC),
    temperatureAvgC: round1(raw.temperatureAvgC),
    humidityMinPct: round1(raw.humidityMinPct),
    humidityMaxPct: round1(raw.humidityMaxPct),
    humidityAvgPct: round1(raw.humidityAvgPct),
    pressureMinHpa: round1(raw.pressureMinHpa),
    pressureMaxHpa: round1(raw.pressureMaxHpa),
    pressureAvgHpa: round1(raw.pressureAvgHpa),
    windAvgKmh: round1(raw.windAvgKmh),
    windMaxKmh: round1(raw.windMaxKmh),
    windGustMaxKmh: round1(raw.windGustMaxKmh),
    rainTotalMm: round2(raw.rainTotalMm),
    rainRateMaxMmH: round2(raw.rainRateMaxMmH),
    uvMax: round1(raw.uvMax),
    solarRadiationMaxWm2: round1(raw.solarRadiationMaxWm2),
    observationCount: raw.observationCount,
    expectedObservationCount,
    coveragePct: computeCoveragePct(raw.observationCount, expectedObservationCount),
  };
}

function weightedAverage(
  entries: Array<{ value: number | null; weight: number }>,
): number | null {
  const usable = entries.filter(
    (e): e is { value: number; weight: number } => e.value !== null && e.weight > 0,
  );
  if (usable.length === 0) return null;
  const totalWeight = usable.reduce((sum, e) => sum + e.weight, 0);
  if (totalWeight === 0) return null;
  const weightedSum = usable.reduce((sum, e) => sum + e.value * e.weight, 0);
  return weightedSum / totalWeight;
}

function minOf(values: Array<number | null>): number | null {
  const usable = values.filter((v): v is number => v !== null);
  return usable.length === 0 ? null : Math.min(...usable);
}

function maxOf(values: Array<number | null>): number | null {
  const usable = values.filter((v): v is number => v !== null);
  return usable.length === 0 ? null : Math.max(...usable);
}

function sumOf(values: Array<number | null>): number | null {
  const usable = values.filter((v): v is number => v !== null);
  return usable.length === 0 ? null : usable.reduce((sum, v) => sum + v, 0);
}

/**
 * Leidt een maand- of jaarsamenvatting af uit de samenvattingen van zijn
 * kinderen (dagen → maand, maanden → jaar) — zie de bestandsheader voor de
 * onderbouwing per veld. Een lege `children`-lijst levert een lege
 * samenvatting op (nooit een crash) — bv. een maand waarvan nog geen enkele
 * dag een dagsamenvatting heeft.
 */
export function combineSummaryAggregates(
  children: SummaryAggregateValues[],
): SummaryAggregateValues {
  const observationCount = sumOf(children.map((c) => c.observationCount)) ?? 0;
  const expectedObservationCount = sumOf(children.map((c) => c.expectedObservationCount));

  return {
    temperatureMinC: minOf(children.map((c) => c.temperatureMinC)),
    temperatureMaxC: maxOf(children.map((c) => c.temperatureMaxC)),
    temperatureAvgC: round1(
      weightedAverage(
        children.map((c) => ({ value: c.temperatureAvgC, weight: c.observationCount })),
      ),
    ),
    humidityMinPct: minOf(children.map((c) => c.humidityMinPct)),
    humidityMaxPct: maxOf(children.map((c) => c.humidityMaxPct)),
    humidityAvgPct: round1(
      weightedAverage(
        children.map((c) => ({ value: c.humidityAvgPct, weight: c.observationCount })),
      ),
    ),
    pressureMinHpa: minOf(children.map((c) => c.pressureMinHpa)),
    pressureMaxHpa: maxOf(children.map((c) => c.pressureMaxHpa)),
    pressureAvgHpa: round1(
      weightedAverage(
        children.map((c) => ({ value: c.pressureAvgHpa, weight: c.observationCount })),
      ),
    ),
    windAvgKmh: round1(
      weightedAverage(
        children.map((c) => ({ value: c.windAvgKmh, weight: c.observationCount })),
      ),
    ),
    windMaxKmh: maxOf(children.map((c) => c.windMaxKmh)),
    windGustMaxKmh: maxOf(children.map((c) => c.windGustMaxKmh)),
    // Regen: SOM van de (al per-dag correct berekende) dagtotalen — zie
    // `sumDailyTotals()` in rain.ts, dit is dezelfde logica toegepast op
    // samenvattingsrijen in plaats van ruwe tellerstanden.
    rainTotalMm: round2(sumOf(children.map((c) => c.rainTotalMm))),
    rainRateMaxMmH: round2(maxOf(children.map((c) => c.rainRateMaxMmH))),
    uvMax: round1(maxOf(children.map((c) => c.uvMax))),
    solarRadiationMaxWm2: round1(maxOf(children.map((c) => c.solarRadiationMaxWm2))),
    observationCount,
    expectedObservationCount,
    coveragePct: computeCoveragePct(observationCount, expectedObservationCount),
  };
}
