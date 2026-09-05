/**
 * Herbruikbare trendberekening voor dashboardkaarten (Fase 3).
 *
 * Principe: een trend is altijd het verschil tussen de EERSTE en LAATSTE
 * meting binnen een tijdvenster (nooit een volledige lineaire regressie —
 * dat zou de eenvoudige, uitlegbare kaartwaarden uit de opdracht
 * ("+0,6 °C afgelopen uur", "+1,2 hPa afgelopen 3 uur") onnodig compliceren).
 * Temperatuur wordt genormaliseerd naar "per uur" getoond; luchtdruk wordt
 * getoond als absoluut verschil over het venster zelf (niet genormaliseerd)
 * — beide zijn zo gekozen omdat ze letterlijk zo in de opdracht staan.
 *
 * Nooit een procentuele verandering voor temperatuur (expliciete Fase 3-eis
 * — temperatuur in °C heeft geen zinvol "0-punt" voor een percentage).
 */

export interface TimedValue {
  t: Date;
  v: number;
}

export interface WindowTrend {
  /** Verschil tussen laatste en eerste waarde in het venster (kan negatief zijn). */
  deltaValue: number;
  /** Genormaliseerd naar verandering per uur, voor weergaves als "+0,4 °C / uur". */
  deltaPerHour: number;
  /** Het gevraagde venster in minuten (bv. 60 of 180). */
  windowMinutes: number;
  /** De daadwerkelijke tijdspanne tussen eerste en laatste meting (kan iets korter zijn dan windowMinutes). */
  actualSpanMinutes: number;
  firstValue: number;
  lastValue: number;
}

/**
 * Berekent een venstertrend uit een reeks tijdgestempelde waarden.
 * Geeft `null` als er onvoldoende data is (expliciete Fase 3-eis: "geen
 * trend tonen als onvoldoende data aanwezig is") — minimaal 2 punten EN een
 * tijdspanne van minstens `minSpanMinutes` (standaard: de helft van het
 * gevraagde venster, zodat één geïsoleerd datapunt nooit een trend claimt).
 */
export function computeWindowTrend(
  points: TimedValue[],
  windowMinutes: number,
  options: { minSpanMinutes?: number } = {},
): WindowTrend | null {
  if (points.length < 2) return null;

  const sorted = [...points].sort((a, b) => a.t.getTime() - b.t.getTime());
  const first = sorted[0]!;
  const last = sorted[sorted.length - 1]!;

  const actualSpanMs = last.t.getTime() - first.t.getTime();
  const actualSpanMinutes = actualSpanMs / 60_000;
  const minSpanMinutes = options.minSpanMinutes ?? windowMinutes / 2;

  if (actualSpanMinutes < minSpanMinutes) return null;

  const deltaValue = last.v - first.v;
  const spanHours = actualSpanMs / 3_600_000;
  const deltaPerHour = spanHours > 0 ? deltaValue / spanHours : 0;

  return {
    deltaValue: round(deltaValue),
    deltaPerHour: round(deltaPerHour),
    windowMinutes,
    actualSpanMinutes: Math.round(actualSpanMinutes),
    firstValue: first.v,
    lastValue: last.v,
  };
}

export type PressureTrendClassification = "stijgend" | "stabiel" | "dalend";

/**
 * Classificatiedrempel voor de luchtdruktrend: gebaseerd op een gangbare
 * meteorologische vuistregel dat een verandering van circa 1 hPa in 3 uur
 * als een merkbare, niet-ruisachtige trend geldt (zie
 * docs/DATA_AGGREGATION.md §Luchtdruktrend voor de volledige toelichting en
 * de expliciete keuze om dit als eigen, gedocumenteerde conventie te
 * hanteren — niet als officiële KNMI/WMO-norm).
 */
export const PRESSURE_TREND_THRESHOLD_HPA_PER_3H = 1.0;

/**
 * Classificeert een 3-uurs luchtdrukverandering als stijgend/stabiel/dalend.
 * `delta3hHpa` is het verschil (nu − 3 uur geleden), dus positief = stijgend.
 */
export function classifyPressureTrend(
  delta3hHpa: number,
  threshold: number = PRESSURE_TREND_THRESHOLD_HPA_PER_3H,
): PressureTrendClassification {
  if (delta3hHpa >= threshold) return "stijgend";
  if (delta3hHpa <= -threshold) return "dalend";
  return "stabiel";
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
