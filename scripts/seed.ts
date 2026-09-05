/**
 * Seed-script: maakt het demo/ontwikkelstation aan.
 *
 * Gebruik: `npm run db:seed` (voert dit bestand uit met `tsx`).
 * Idempotent: als het station al bestaat (op basis van `slug`), wordt het
 * bijgewerkt in plaats van gedupliceerd.
 */
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local" });

import { eq } from "drizzle-orm";

import { db } from "../src/lib/db";
import { stations } from "../src/lib/db/schema";

const DEMO_STATION = {
  name: "Mijn Alecto WS5500",
  slug: "mijn-alecto-ws5500",
  manufacturer: "Alecto",
  model: "WS5500",
  // Echt MAC-adres van het gekoppelde station (bevestigd via ecowitt.net,
  // 2026-09-05). De Ecowitt Cloud-provider stuurt dit MAC-adres als
  // identifier mee; de ingestie-pijplijn matcht op `stationIdentifier` OF
  // `macAddress` (zie src/lib/db/queries.ts) — vandaar hieronder allebei.
  stationIdentifier: "E0:98:06:A3:37:CD",
  macAddress: "E0:98:06:A3:37:CD",
  timezone: "Europe/Amsterdam",
  expectedUploadIntervalSeconds: 60,
  isActive: true,
} as const;

async function main() {
  console.log("Seed: station aanmaken/bijwerken...");

  const existing = await db
    .select({ id: stations.id })
    .from(stations)
    .where(eq(stations.slug, DEMO_STATION.slug))
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(stations)
      .set(DEMO_STATION)
      .where(eq(stations.slug, DEMO_STATION.slug));
    console.log(
      `Station '${DEMO_STATION.name}' bestond al en is bijgewerkt (id ${existing[0].id}).`,
    );
  } else {
    await db.insert(stations).values(DEMO_STATION);
    console.log(`Station '${DEMO_STATION.name}' aangemaakt.`);
  }

  console.log("Seed voltooid.");
  process.exit(0);
}

main().catch((error) => {
  console.error("Seed mislukt:", error);
  process.exit(1);
});
