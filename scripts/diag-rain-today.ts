/**
 * Tijdelijk diagnosescript (alleen-lezen): roept exact dezelfde functie aan
 * als `/api/weather/rain?period=today` (namelijk `getRainOverview`) om de
 * onderliggende foutmelding te zien die de route zelf verbergt achter een
 * generieke 503. Wijzigt niets. Veilig te verwijderen na gebruik.
 *
 * Gebruik:
 *   npx tsx scripts/diag-rain-today.ts
 */
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local" });

import { getStation } from "../src/lib/db/queries";
import { getRainOverview } from "../src/lib/weather/rain-service";

async function main() {
  const station = await getStation();
  if (!station) {
    console.error("Geen (actief) station gevonden.");
    process.exit(1);
  }
  console.log(`Station: "${station.name}" (id ${station.id})`);

  for (const period of ["today", "week", "month", "year"] as const) {
    console.log(`\n=== period=${period} ===`);
    try {
      const result = await getRainOverview(station.id, period);
      console.log(JSON.stringify(result, null, 2));
    } catch (error) {
      console.error("FOUT:", error);
    }
  }

  process.exit(0);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
