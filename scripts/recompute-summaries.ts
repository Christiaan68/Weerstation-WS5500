/**
 * Herberekent dag/maand/jaar-samenvattingen (`daily_weather_summary`,
 * `monthly_weather_summary`, `yearly_weather_summary`) voor een reeks lokale
 * dagen. Niet-destructief en idempotent (`ON DUPLICATE KEY UPDATE` — zie
 * `upsertDailySummary()` e.a. in `src/lib/db/queries.ts`): opnieuw draaien
 * levert altijd hetzelfde resultaat op, dus geen `--confirm`-vergrendeling
 * nodig zoals bij de destructieve scripts (`weather:repair-temp-unitid`,
 * `demo:clear`).
 *
 * Nuttig na:
 * - een reparatiescript dat oude metingen wijzigt (bv.
 *   `npm run weather:repair-temp-unitid:confirm`);
 * - het met terugwerkende kracht vullen van de summary-tabellen voor
 *   historische data die vóór Fase 3 al binnenkwam (de incrementele
 *   herberekening in `ingest-pipeline.ts` draait alleen bij NIEUWE
 *   metingen).
 *
 * Gebruik:
 *   npm run weather:recompute-summaries                     # alleen vandaag
 *   npm run weather:recompute-summaries -- --from 2026-08-01 --to 2026-08-31
 *   npm run weather:recompute-summaries -- --all             # sinds de eerste meting
 */
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local" });

import { getEarliestObservationMeasuredAt, getStation } from "../src/lib/db/queries";
import { recomputeDailySummariesInRange } from "../src/lib/weather/summary-service";
import { getLocalDateKey, todayLocalDateKey } from "../src/lib/weather/timezone";

function parseArgs(argv: string[]): {
  from?: string;
  to?: string;
  all: boolean;
  stationSlug?: string;
} {
  const result: { from?: string; to?: string; all: boolean; stationSlug?: string } = {
    all: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--from") result.from = argv[++i];
    else if (arg === "--to") result.to = argv[++i];
    else if (arg === "--all") result.all = true;
    else if (arg === "--station") result.stationSlug = argv[++i];
  }
  return result;
}

function localDateKeysInRange(fromKey: string, toKey: string): string[] {
  const keys: string[] = [];
  let cursor = new Date(`${fromKey}T12:00:00Z`); // 12:00 UTC: ruim weg van elke DST-grens, alleen gebruikt om te itereren
  const end = new Date(`${toKey}T12:00:00Z`);
  while (cursor <= end) {
    keys.push(getLocalDateKey(cursor));
    cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000);
  }
  return keys;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const station = await getStation(args.stationSlug);
  if (!station) {
    console.error(
      "Geen (actief) station gevonden. Geef --station <slug> mee of draai npm run db:seed.",
    );
    process.exit(1);
  }

  let fromKey: string;
  let toKey: string;

  if (args.all) {
    const earliest = await getEarliestObservationMeasuredAt(station.id);
    if (!earliest) {
      console.log(
        `Station "${station.displayName}" heeft nog geen metingen — niets te herberekenen.`,
      );
      process.exit(0);
    }
    fromKey = getLocalDateKey(earliest);
    toKey = todayLocalDateKey();
  } else if (args.from && args.to) {
    fromKey = args.from;
    toKey = args.to;
  } else if (args.from || args.to) {
    console.error("Geef zowel --from als --to op (beide YYYY-MM-DD), of gebruik --all.");
    process.exit(1);
    return;
  } else {
    fromKey = todayLocalDateKey();
    toKey = todayLocalDateKey();
  }

  const dateKeys = localDateKeysInRange(fromKey, toKey);
  console.log(
    `Herbereken samenvattingen voor "${station.displayName}": ${dateKeys.length} dag(en), ${fromKey} t/m ${toKey}...`,
  );

  const result = await recomputeDailySummariesInRange(station.id, dateKeys);

  console.log(
    `Klaar: ${result.recomputedDays} dagsamenvatting(en), ${result.recomputedMonths} maandsamenvatting(en), ${result.recomputedYears} jaarsamenvatting(en) bijgewerkt.`,
  );
  process.exit(0);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
