/**
 * Centrale helper voor automatische downsampling van historische grafiekdata
 * (Fase 3) — zie docs/DATA_AGGREGATION.md §Downsampling.
 *
 * Doel: nooit honderdduizenden metingen naar de browser sturen (expliciete
 * Fase 3-eis). We kiezen een SQL-side aggregatieresolutie op basis van het
 * gevraagde tijdbereik, gemikt op ongeveer 500-1500 punten per serie.
 *
 * Grenzen (uit de opdracht, als uitgangspunt):
 *
 *   0–48 uur     → ruw (elke meting, ~5 min interval)
 *   2–14 dagen   → 5-minuten-aggregatie
 *   14–90 dagen  → uurwaarden
 *   > 90 dagen   → dagwaarden
 *
 * Deze tabel is het uitgangspunt, maar de opdracht stelt ook een HARDE eis:
 * nooit meer dan ~500-1500 punten per serie naar de browser. Die twee eisen
 * botsen aan de bovengrens van elke tier (bv. 14 dagen op 5-minuten-
 * resolutie is 4032 punten — ver boven het budget). Waar dat gebeurt, wint
 * het puntenbudget: de functie kiest dan de eerstvolgende GROVERE resolutie
 * in plaats van de tabel-tier letterlijk te volgen. Bij de huidige
 * pollfrequentie (5 minuten) betekent dit in de praktijk: 5-minuten-
 * resolutie tot ongeveer 5 dagen, daarna uurresolutie tot 90 dagen.
 */

export type AggregationInterval = "raw" | "5m" | "hour" | "day";

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

/**
 * Kiest de aggregatieresolutie voor een gegeven tijdbereik. `pointBudget`
 * is een extra vangnet: ongeacht de tabel hierboven wordt nooit een
 * resolutie gekozen die (bij benadering) meer dan dit aantal punten zou
 * opleveren voor het gevraagde bereik — zo blijft de functie ook correct
 * voor toekomstige, kortere pollintervallen.
 */
const TIER_ORDER: AggregationInterval[] = ["raw", "5m", "hour", "day"];

function estimatedPointCount(
  interval: AggregationInterval,
  rangeMs: number,
  minPollIntervalSeconds: number,
): number {
  if (interval === "raw") return rangeMs / (minPollIntervalSeconds * 1000);
  return rangeMs / (intervalToSeconds(interval) * 1000);
}

export function chooseAggregationInterval(
  fromUtc: Date,
  toUtc: Date,
  options: { pointBudget?: number; minPollIntervalSeconds?: number } = {},
): AggregationInterval {
  const pointBudget = options.pointBudget ?? 1500;
  const minPollIntervalSeconds = options.minPollIntervalSeconds ?? 300; // huidige pollfrequentie, zie AUTOMATIC_INGESTION.md
  const rangeMs = Math.max(0, toUtc.getTime() - fromUtc.getTime());

  // Stap 1: kies de tier volgens de tabel hierboven (het uitgangspunt).
  let tierIndex: number;
  if (rangeMs <= 48 * HOUR_MS)
    tierIndex = 0; // raw
  else if (rangeMs <= 14 * DAY_MS)
    tierIndex = 1; // 5m
  else if (rangeMs <= 90 * DAY_MS)
    tierIndex = 2; // hour
  else tierIndex = 3; // day

  // Stap 2: het puntenbudget is een harde bovengrens — schaal zo nodig af
  // naar een grovere resolutie totdat de schatting eronder blijft (of we
  // "day", de grofste optie, bereiken).
  while (
    tierIndex < TIER_ORDER.length - 1 &&
    estimatedPointCount(TIER_ORDER[tierIndex]!, rangeMs, minPollIntervalSeconds) >
      pointBudget
  ) {
    tierIndex++;
  }

  return TIER_ORDER[tierIndex]!;
}

/** Aantal seconden per aggregatie-interval, voor gebruik in SQL-tijdbucketing. */
export function intervalToSeconds(interval: AggregationInterval): number {
  switch (interval) {
    case "raw":
      return 0;
    case "5m":
      return 5 * 60;
    case "hour":
      return 3600;
    case "day":
      return 86400;
  }
}

/** Bovengrens op het aantal teruggegeven punten, als extra vangnet bovenop de SQL-aggregatie zelf. */
export const MAX_HISTORY_POINTS = 1500;
