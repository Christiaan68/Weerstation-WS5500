/**
 * Tijdelijk diagnosescript (alleen-lezen): toont dag/maand/jaar-
 * samenvattingen voor een periode, zodat na een herberekening (bv. na
 * `weather:recompute-summaries`, een reparatie, of demo-data-opruiming)
 * gecontroleerd kan worden of de aantallen en waarden plausibel zijn.
 * Wijzigt niets. Veilig te verwijderen na gebruik.
 *
 * Gebruik:
 *   npx tsx scripts/diag-check-summaries.ts --from 2026-09-04 --to 2026-09-05
 */
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local" });

import {
  getStation,
  listDailySummaries,
  listMonthlySummariesForYear,
  listYearlySummaries,
} from "../src/lib/db/queries";

function parseArgs(argv: string[]): { from?: string; to?: string } {
  const result: { from?: string; to?: string } = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--from") result.from = argv[++i];
    else if (argv[i] === "--to") result.to = argv[++i];
  }
  return result;
}

function fmt(value: unknown): string {
  if (value === null || value === undefined) return "—";
  return String(value);
}

async function main() {
  const { from, to } = parseArgs(process.argv.slice(2));
  if (!from || !to) {
    console.error("Geef --from en --to op (beide YYYY-MM-DD).");
    process.exit(1);
  }

  const station = await getStation();
  if (!station) {
    console.error("Geen (actief) station gevonden.");
    process.exit(1);
  }

  console.log(`Station: "${station.name}" (id ${station.id})\n`);

  const daily = await listDailySummaries(station.id, from!, to!);
  console.log(`Dagsamenvattingen ${from} t/m ${to}: ${daily.length} gevonden.\n`);
  for (const d of daily) {
    console.log(
      `  ${d.localDate}: temp ${fmt(d.temperatureMinC)}..${fmt(d.temperatureMaxC)}°C (gem ${fmt(
        d.temperatureAvgC,
      )}), regen ${fmt(d.rainTotalMm)}mm, wind max ${fmt(d.windMaxKmh)}km/u, gust max ${fmt(
        d.windGustMaxKmh,
      )}km/u, metingen ${fmt(d.observationCount)}/${fmt(d.expectedObservationCount)} (${fmt(
        d.coveragePct,
      )}%)`,
    );
  }

  const years = new Set(daily.map((d) => Number(d.localDate.slice(0, 4))));
  for (const year of years.size > 0 ? years : [new Date().getFullYear()]) {
    const monthly = await listMonthlySummariesForYear(station.id, year);
    console.log(`\nMaandsamenvattingen ${year}: ${monthly.length} gevonden.`);
    for (const m of monthly) {
      console.log(
        `  ${year}-${String(m.month).padStart(2, "0")}: temp ${fmt(m.temperatureMinC)}..${fmt(
          m.temperatureMaxC,
        )}°C, regen ${fmt(m.rainTotalMm)}mm, metingen ${fmt(m.observationCount)}`,
      );
    }
  }

  const yearly = await listYearlySummaries(station.id);
  console.log(`\nJaarsamenvattingen (alle): ${yearly.length} gevonden.`);
  for (const y of yearly) {
    console.log(
      `  ${y.year}: temp ${fmt(y.temperatureMinC)}..${fmt(y.temperatureMaxC)}°C, regen ${fmt(
        y.rainTotalMm,
      )}mm, metingen ${fmt(y.observationCount)}`,
    );
  }

  process.exit(0);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
