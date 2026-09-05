/**
 * Tijdelijk diagnosescript (alleen-lezen) om de discrepantie te onderzoeken
 * tussen de lokaal geformatteerde tijd die `repair-temp-unitid-bug.ts` toont
 * en de REPAIR_CUTOFF-filtering. Wijzigt niets. Veilig te verwijderen na
 * gebruik.
 */
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local" });

import { db } from "../src/lib/db";
import { rawWeatherPackets } from "../src/lib/db/schema";
import { eq, and, gte, lte } from "drizzle-orm";

async function main() {
  const rows = await db
    .select({
      id: rawWeatherPackets.id,
      source: rawWeatherPackets.source,
      receivedAt: rawWeatherPackets.receivedAt,
      processingStatus: rawWeatherPackets.processingStatus,
    })
    .from(rawWeatherPackets)
    .where(
      and(
        eq(rawWeatherPackets.source, "ecowitt_cloud_api"),
        gte(rawWeatherPackets.receivedAt, new Date("2026-09-05T13:30:00.000Z")),
        lte(rawWeatherPackets.receivedAt, new Date("2026-09-05T15:00:00.000Z")),
      ),
    )
    .orderBy(rawWeatherPackets.receivedAt);

  console.log(`REPAIR_CUTOFF (UTC): 2026-09-05T14:10:00.000Z`);
  console.log(`Gevonden ${rows.length} ecowitt_cloud_api-pakket(ten) tussen 13:30 en 15:00 UTC:\n`);
  for (const r of rows) {
    console.log(
      `#${r.id}\treceivedAt (ISO UTC): ${r.receivedAt.toISOString()}\tstatus: ${r.processingStatus}`,
    );
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
