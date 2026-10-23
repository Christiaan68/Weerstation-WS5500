/**
 * Pure rekenlogica voor de Data Quality-pagina (Fase 4, §25-§30) — net als
 * `summary.ts` bevat dit bestand GEEN databasetoegang, zodat het zonder
 * database te testen is. De aanroepende query (welke `measuredAt`-tijden
 * werkelijk in de database staan voor een lokale dag) staat in
 * `src/lib/db/queries.ts`.
 *
 * Hergebruikt bewust de bestaande, geteste DST-logica uit `timezone.ts`
 * (`getLocalDayBoundsUtc()`) en de bestaande dekkingsberekening uit
 * `summary.ts` (`computeExpectedObservationCount()`/`computeCoveragePct()`)
 * — zie Fase 4-eis §26/§27: "gebruik ~300 seconden als effectief
 * observatie-interval" en "bereken dit tijdzone-correct (DST)".
 */
import {
  computeCoveragePct,
  computeExpectedObservationCount,
} from "@/lib/weather/summary";

export interface MissingInterval {
  /** Laatst bekende meting VOOR het gat (of het begin van de dag, als het gat aan het begin zit). */
  fromExclusiveUtc: Date;
  /** Eerstvolgende bekende meting NA het gat (of het einde van de dag, als het gat aan het eind zit). */
  toExclusiveUtc: Date;
  /** Geschat aantal gemiste metingen in dit gat, gegeven het pollinterval. */
  missingCount: number;
}

/**
 * Marge t.o.v. het exacte pollinterval voordat een gat als "ontbrekende
 * meting(en)" telt — voorkomt dat normale klok-jitter (een meting die een
 * paar seconden te vroeg/laat binnenkomt) als gemist wordt aangemerkt. Een
 * gat moet minstens 1,5x het pollinterval zijn voordat we concluderen dat er
 * minstens één meting tussenuit is gevallen.
 */
const GAP_TOLERANCE_FACTOR = 1.5;

/**
 * Detecteert ontbrekende intervallen binnen één lokale dag, gegeven de
 * WERKELIJK ontvangen (unieke, oplopend gesorteerde) meettijden en de
 * daggrenzen. Voorbeeld uit de Fase 4-opdracht (§28): metingen om 12:00,
 * 12:05, 12:20 → de verwachte metingen rond 12:10 en 12:15 ontbreken.
 *
 * BELANGRIJK: `sortedMeasuredAtUtc` moet al ONTDUBBELD zijn (unieke
 * tijdstippen) — duplicaten mogen nooit als ontbrekend geteld worden (§28),
 * en dat gebeurt hier niet opnieuw gecontroleerd; de aanroepende query
 * (`listDistinctMeasuredAtInRange()`) levert al unieke tijdstippen.
 */
export function detectMissingIntervals(
  sortedMeasuredAtUtc: Date[],
  dayStartUtc: Date,
  dayEndUtc: Date,
  pollIntervalSeconds: number,
): MissingInterval[] {
  if (pollIntervalSeconds <= 0) return [];

  const points = [
    dayStartUtc,
    ...sortedMeasuredAtUtc.filter((t) => t > dayStartUtc && t < dayEndUtc),
    dayEndUtc,
  ];

  const intervals: MissingInterval[] = [];
  const toleranceMs = pollIntervalSeconds * 1000 * GAP_TOLERANCE_FACTOR;

  for (let i = 0; i < points.length - 1; i++) {
    const from = points[i]!;
    const to = points[i + 1]!;
    const gapMs = to.getTime() - from.getTime();
    if (gapMs <= toleranceMs) continue;

    const expectedSlots = gapMs / (pollIntervalSeconds * 1000);
    const missingCount = Math.max(0, Math.round(expectedSlots) - 1);
    if (missingCount <= 0) continue;

    intervals.push({ fromExclusiveUtc: from, toExclusiveUtc: to, missingCount });
  }

  return intervals;
}

export interface DayCompletenessDetail {
  localDateKey: string;
  /** Verwacht aantal metingen deze lokale dag (DST-correct, zie `computeExpectedObservationCount`). */
  expected: number;
  /** Werkelijk aantal unieke ontvangen metingen. */
  received: number;
  /** `expected - received`, nooit negatief. */
  missing: number;
  coveragePct: number | null;
  missingIntervals: MissingInterval[];
}

/**
 * Bouwt de volledige completeness-details voor één lokale dag uit de
 * werkelijk ontvangen (unieke) meettijden. `durationSeconds` komt uit
 * `getLocalDayBoundsUtc()` — DST-bewust (§27: 23-uursdag ≈ 276 verwachte
 * metingen, 25-uursdag ≈ 300, bij het huidige 5-minuten-pollritme).
 */
export function computeDayCompletenessDetail(
  localDateKey: string,
  sortedMeasuredAtUtc: Date[],
  dayStartUtc: Date,
  dayEndUtc: Date,
  durationSeconds: number,
  pollIntervalSeconds: number,
): DayCompletenessDetail {
  const expected = computeExpectedObservationCount(durationSeconds, pollIntervalSeconds);
  const received = sortedMeasuredAtUtc.length;
  const missing = Math.max(0, expected - received);
  const coveragePct = computeCoveragePct(received, expected);
  const missingIntervals = detectMissingIntervals(
    sortedMeasuredAtUtc,
    dayStartUtc,
    dayEndUtc,
    pollIntervalSeconds,
  );

  return { localDateKey, expected, received, missing, coveragePct, missingIntervals };
}
