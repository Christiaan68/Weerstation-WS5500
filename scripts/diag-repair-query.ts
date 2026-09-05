/**
 * Tijdelijk diagnosescript (alleen-lezen): roept de EXACTE
 * `listRawPacketsBySourceBefore()`-functie aan die ook
 * `repair-temp-unitid-bug.ts` gebruikt, met exact dezelfde REPAIR_CUTOFF,
 * om te bewijzen of de "< cutoff"-filtering zelf correct werkt. Wijzigt
 * niets. Veilig te verwijderen na gebruik.
 */
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local" });

import { listRawPacketsBySourceBefore } from "../src/lib/db/queries";

const REPAIR_CUTOFF = new Date("2026-09-05T14:10:00.000Z");

async function main() {
  console.log(`Cutoff (Date-object, UTC ISO): ${REPAIR_CUTOFF.toISOString()}`);
  console.log(`Cutoff (JS Date .toString(), systeem-lokale tijd): ${REPAIR_CUTOFF.toString()}`);
  console.log(`Node-procestijdzone (Intl): ${Intl.DateTimeFormat().resolvedOptions().timeZone}`);
  console.log();

  const rows = await listRawPacketsBySourceBefore("ecowitt_cloud_api", REPAIR_CUTOFF);

  console.log(`listRawPacketsBySourceBefore() gaf ${rows.length} rij(en) terug:`);
  for (const r of rows) {
    console.log(`#${r.id}\treceivedAt (ISO UTC): ${r.receivedAt.toISOString()}`);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
