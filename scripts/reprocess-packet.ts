/**
 * Verwerkt één (of meerdere) al opgeslagen ruwe pakketten opnieuw met de
 * huidige parser. Nuttig na een wijziging aan
 * `src/lib/weather/ecowitt/fields.ts` of `.../parse.ts` — de oorspronkelijke
 * payload staat immers al veilig in de database, dus er hoeft niets
 * opnieuw aangeleverd te worden.
 *
 * Gebruik:
 *   npm run weather:reprocess -- 42
 *   npm run weather:reprocess -- 42 43 44
 */
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local" });

import { reprocessRawPacket } from "../src/lib/weather/ingest-pipeline";

async function main() {
  const ids = process.argv.slice(2).map(Number);

  if (ids.length === 0 || ids.some((id) => !Number.isInteger(id) || id <= 0)) {
    console.error("Gebruik: npm run weather:reprocess -- <pakket-id> [<pakket-id> ...]");
    process.exit(1);
  }

  for (const id of ids) {
    try {
      const result = await reprocessRawPacket(id);
      console.log(
        `Pakket #${id}: status=${result.status}${
          result.observationId ? ` (meting #${result.observationId})` : ""
        } — ${result.message}`,
      );
    } catch (error) {
      console.error(
        `Pakket #${id}: fout — ${error instanceof Error ? error.message : error}`,
      );
    }
  }

  process.exit(0);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
