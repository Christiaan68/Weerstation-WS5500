/**
 * Gedeelde, herbruikbare logica voor de Y-as-schaalverdeling van grafieken
 * (Fase 6 — leesbare assen). Één centrale plek die bepaalt welke onder-/
 * bovengrens en welke schaalmarkeringen een grafiek krijgt, per "soort"
 * meetwaarde (`AxisScaleKind`) — zodat elke bestaande én toekomstige
 * grafiek in de app automatisch dezelfde, consistente en eerlijke
 * schaalregels krijgt (zie ook `getAxisScaleKind()` in
 * `history-metrics-catalog.ts`, dat per metric bepaalt welke `AxisScaleKind`
 * van toepassing is).
 *
 * Kernidee: nooit een vaste schaal (bv. altijd 0-100) forceren tenzij de
 * betekenis van de meetwaarde dat vereist (percentages, UV-index). Voor de
 * meeste meetwaarden (temperatuur, luchtdruk, wind, regen, zoninstraling)
 * wordt de schaal berekend uit de daadwerkelijk zichtbare, geldige
 * meetwaarden: een marge van ~10% rond het bereik, afgerond naar "nette"
 * getallen met ca. 5 gelijke tussenstappen. Dat laatste is het klassieke
 * "nice numbers"-algoritme van Paul Heckbert, zoals de meeste
 * grafiekbibliotheken intern ook gebruiken voor leesbare assen.
 */

export type AxisScaleKind = "free" | "nonNegative" | "percentage" | "uvIndex";

export interface AxisDomain {
  min: number;
  max: number;
  /** Stapgrootte tussen twee schaalmarkeringen — ook nodig om decimalen te bepalen. */
  step: number;
  ticks: number[];
}

export interface AxisDomainOptions {
  /** Minimumbereik in dataeenheden. Standaard afhankelijk van `kind` (zie `DEFAULT_MIN_SPAN`). */
  minSpan?: number;
  /** Gewenst aantal schaalmarkeringen (ca. 5-6). Kleinere grafieken mogen minder. */
  targetTickCount?: number;
  /** Marge als fractie van het (eventueel opgerekte) bereik. Standaard 10%. */
  marginRatio?: number;
}

/**
 * Zinvol minimumbereik per soort — voorkomt dat bijna-constante waarden (of
 * één enkel meetpunt) door extreem inzoomen als grote schommelingen ogen.
 */
const DEFAULT_MIN_SPAN: Record<AxisScaleKind, number> = {
  free: 2,
  nonNegative: 2,
  percentage: 10,
  uvIndex: 2,
};

/** Neutrale standaardschaal wanneer er helemaal geen geldige meetwaarden zijn. */
const EMPTY_FALLBACK: Record<AxisScaleKind, { min: number; max: number }> = {
  free: { min: -5, max: 15 },
  nonNegative: { min: 0, max: 10 },
  percentage: { min: 0, max: 100 },
  uvIndex: { min: 0, max: 2 },
};

/**
 * "Nice numbers"-algoritme (Heckbert): rondt een getal af naar de
 * dichtstbijzijnde 1, 2, 5 of 10 (× een macht van 10) — de basis voor
 * leesbare schaalmarkeringen. `round=true` mag zowel naar boven als beneden
 * afronden (gebruikt voor de stapgrootte); `round=false` rondt altijd naar
 * boven af (gebruikt voor het totale bereik, zodat er nooit data buiten de
 * as valt).
 */
export function niceNum(range: number, round: boolean): number {
  if (!Number.isFinite(range) || range <= 0) return 1;
  const exponent = Math.floor(Math.log10(range));
  const fraction = range / 10 ** exponent;
  let niceFraction: number;
  if (round) {
    if (fraction < 1.5) niceFraction = 1;
    else if (fraction < 3) niceFraction = 2;
    else if (fraction < 7) niceFraction = 5;
    else niceFraction = 10;
  } else {
    if (fraction <= 1) niceFraction = 1;
    else if (fraction <= 2) niceFraction = 2;
    else if (fraction <= 5) niceFraction = 5;
    else niceFraction = 10;
  }
  return niceFraction * 10 ** exponent;
}

/** Aantal decimalen dat nodig is om `step` exact weer te geven (maximaal 4). */
export function decimalsForStep(step: number): number {
  if (!Number.isFinite(step) || step <= 0) return 0;
  for (let decimals = 0; decimals <= 4; decimals++) {
    const factor = 10 ** decimals;
    if (Math.abs(Math.round(step * factor) - step * factor) < 1e-6) return decimals;
  }
  return 4;
}

function roundToStep(value: number, step: number): number {
  const factor = 10 ** decimalsForStep(step);
  return Math.round(value * factor) / factor;
}

function buildTicks(min: number, max: number, step: number): number[] {
  const ticks: number[] = [];
  const epsilon = step / 1e6;
  for (let value = min; value <= max + epsilon; value += step) {
    ticks.push(roundToStep(value, step));
  }
  return ticks;
}

/**
 * Basisberekening: rondt [rawMin, rawMax] naar buiten af tot een bereik met
 * ca. `targetTickCount` gelijke, leesbare tussenstappen. Gebruikt door
 * `computeAxisDomain()` en direct bruikbaar voor grafieken zonder speciale
 * ondergrens-regels (bv. de "free"-schaal).
 */
export function computeNiceTicks(
  rawMin: number,
  rawMax: number,
  targetTickCount = 5,
): AxisDomain {
  let min = rawMin;
  let max = rawMax;
  if (min > max) [min, max] = [max, min];
  if (min === max) {
    min -= 1;
    max += 1;
  }
  const range = niceNum(max - min, false);
  const step = niceNum(range / Math.max(1, targetTickCount - 1), true);
  const niceMin = Math.floor(min / step) * step;
  const niceMax = Math.ceil(max / step) * step;
  return {
    min: roundToStep(niceMin, step),
    max: roundToStep(niceMax, step),
    step,
    ticks: buildTicks(niceMin, niceMax, step),
  };
}

/**
 * Berekent de volledige Y-as (grenzen + schaalmarkeringen) voor een set
 * zichtbare, geldige meetwaarden (over alle zichtbare reeksen op dezelfde
 * as samen), volgens de regels die passen bij `kind`:
 *
 * - "free": geen ondergrens geforceerd (temperatuur, luchtdruk) — mag negatief.
 * - "nonNegative": nooit onder 0 (wind, regenintensiteit, zoninstraling).
 * - "percentage": altijd binnen 0-100 (luchtvochtigheid).
 * - "uvIndex": ondergrens altijd 0, hele schaalwaarden, minimaal bereik 0-2.
 *
 * Ongeldige waarden (null/undefined/NaN/Infinity — bv. van ontbrekende
 * metingen) worden genegeerd bij de berekening, maar geldige uitschieters
 * worden nooit weggelaten. Bij helemaal geen geldige waarden (lege reeks)
 * valt dit terug op een neutrale standaardschaal per soort, zodat de as
 * nooit crasht of leeg blijft.
 */
export function computeAxisDomain(
  values: readonly (number | null | undefined)[],
  kind: AxisScaleKind,
  options: AxisDomainOptions = {},
): AxisDomain {
  const targetTickCount = options.targetTickCount ?? 5;
  const marginRatio = options.marginRatio ?? 0.1;
  const minSpan = options.minSpan ?? DEFAULT_MIN_SPAN[kind];

  const finite = values.filter(
    (v): v is number => typeof v === "number" && Number.isFinite(v),
  );

  if (finite.length === 0) {
    const fallback = EMPTY_FALLBACK[kind];
    return computeNiceTicks(fallback.min, fallback.max, targetTickCount);
  }

  let rawMin = Math.min(...finite);
  let rawMax = Math.max(...finite);

  // Zinvol minimumbereik: bijna-constante waarden (of één meetpunt) krijgen
  // toch een leesbaar, niet-overdreven ingezoomd bereik.
  if (rawMax - rawMin < minSpan) {
    const center = (rawMax + rawMin) / 2;
    rawMin = center - minSpan / 2;
    rawMax = center + minSpan / 2;
  }

  const margin = (rawMax - rawMin) * marginRatio;
  let marginMin = rawMin - margin;
  let marginMax = rawMax + margin;

  if (kind === "nonNegative") {
    marginMin = Math.max(0, marginMin);
  } else if (kind === "percentage") {
    marginMin = Math.max(0, marginMin);
    marginMax = Math.min(100, marginMax);
  } else if (kind === "uvIndex") {
    marginMin = 0;
    marginMax = Math.max(marginMax, minSpan);
  }

  if (kind === "uvIndex") {
    // Hele schaalwaarden, ondergrens vast op 0, bovengrens op de piek.
    const rough = computeNiceTicks(0, marginMax, targetTickCount);
    const step = Math.max(1, Math.ceil(rough.step));
    const max = Math.max(minSpan, Math.ceil(marginMax / step) * step);
    return { min: 0, max, step, ticks: buildTicks(0, max, step) };
  }

  const result = computeNiceTicks(marginMin, marginMax, targetTickCount);

  if (kind === "nonNegative" && result.min < 0) {
    return {
      min: 0,
      max: result.max,
      step: result.step,
      ticks: buildTicks(0, result.max, result.step),
    };
  }

  if (kind === "percentage") {
    const min = Math.max(0, result.min);
    const max = Math.min(100, result.max);
    return { min, max, step: result.step, ticks: buildTicks(min, max, result.step) };
  }

  return result;
}

/**
 * Vaste nulbasis-schaal voor staaf-/vlakgrafieken waarbij lengte/oppervlakte
 * de hoeveelheid uitdrukt (bv. neerslag per uur/dag/maand): de ondergrens
 * blijft altijd 0 (anders kloppen verhoudingen tussen staven niet meer),
 * alleen de bovengrens wordt op de piek + marge afgestemd.
 */
export function computeZeroBasedAxisDomain(
  values: readonly (number | null | undefined)[],
  options: AxisDomainOptions = {},
): AxisDomain {
  const targetTickCount = options.targetTickCount ?? 5;
  const marginRatio = options.marginRatio ?? 0.1;
  const minSpan = options.minSpan ?? 2;

  const finite = values.filter(
    (v): v is number => typeof v === "number" && Number.isFinite(v),
  );

  if (finite.length === 0) {
    return computeNiceTicks(0, minSpan, targetTickCount);
  }

  const rawMax = Math.max(minSpan, ...finite);
  const margin = rawMax * marginRatio;
  const rough = computeNiceTicks(0, rawMax + margin, targetTickCount);
  return {
    min: 0,
    max: rough.max,
    step: rough.step,
    ticks: buildTicks(0, rough.max, rough.step),
  };
}

/** Formatteert een schaalmarkering met precies zoveel decimalen als de stap vereist. */
export function formatAxisTick(value: number, step: number): string {
  return value.toFixed(decimalsForStep(step));
}
