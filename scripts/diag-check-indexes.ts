/**
 * Tijdelijk diagnosescript (alleen-lezen) om te controleren of migratie
 * 0002 (de 6 nieuwe indexen op `weather_observations`) daadwerkelijk is
 * toegepast op de huidige database. Wijzigt niets. Veilig te verwijderen
 * na gebruik.
 */
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local" });

import { db } from "../src/lib/db";
import { sql } from "drizzle-orm";

const EXPECTED_INDEXES = [
  "observations_station_temp_idx",
  "observations_station_wind_gust_idx",
  "observations_station_wind_speed_idx",
  "observations_station_rain_rate_idx",
  "observations_station_pressure_idx",
  "observations_station_humidity_idx",
];

async function main() {
  const rows = (await db.execute(
    sql`SHOW INDEX FROM weather_observations`,
  )) as unknown as [Array<{ Key_name: string }>, unknown];

  const indexNames = new Set(rows[0].map((r) => r.Key_name));

  console.log("Gevonden indexen op weather_observations:");
  console.log([...indexNames].join(", "));
  console.log();

  let allPresent = true;
  for (const name of EXPECTED_INDEXES) {
    const present = indexNames.has(name);
    if (!present) allPresent = false;
    console.log(`${present ? "✅" : "❌"} ${name}`);
  }

  console.log();
  console.log(
    allPresent
      ? "Migratie 0002 is volledig toegepast — alle 6 indexen bestaan."
      : "Migratie 0002 lijkt NIET (volledig) toegepast — niet alle indexen bestaan.",
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
