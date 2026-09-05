/**
 * Toont welke payload-velden de parser de laatste tijd niet herkende, met
 * hoe vaak elk veld voorkwam en een voorbeeldwaarde. Bedoeld om na de eerste
 * (paar) echte WS5500-uploads gericht `src/lib/weather/ecowitt/fields.ts`
 * uit te breiden — zie docs/ECOWITT_FIELDS.md.
 *
 * Gebruik:
 *   npm run weather:unknown-fields
 */
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local" });

import { listRecentPacketsWithUnknownFields } from "../src/lib/db/queries";

async function main() {
  const packets = await listRecentPacketsWithUnknownFields(200);

  if (packets.length === 0) {
    console.log("Geen pakketten met onbekende velden gevonden. Niets te doen.");
    process.exit(0);
  }

  const fieldStats = new Map<
    string,
    { count: number; example: unknown; packetIds: number[] }
  >();

  for (const packet of packets) {
    const unknown = packet.unknownFields as Record<string, unknown> | null;
    if (!unknown) continue;

    for (const [field, value] of Object.entries(unknown)) {
      const stats = fieldStats.get(field) ?? { count: 0, example: value, packetIds: [] };
      stats.count += 1;
      if (stats.packetIds.length < 5) {
        stats.packetIds.push(packet.id);
      }
      fieldStats.set(field, stats);
    }
  }

  const sorted = [...fieldStats.entries()].sort((a, b) => b[1].count - a[1].count);

  console.log(`${packets.length} pakket(ten) met onbekende velden onderzocht.\n`);
  console.log(
    "Veld".padEnd(30) + "Aantal".padEnd(10) + "Voorbeeld".padEnd(20) + "Pakket-id's",
  );
  console.log("-".repeat(90));
  for (const [field, stats] of sorted) {
    console.log(
      field.padEnd(30) +
        String(stats.count).padEnd(10) +
        String(stats.example).slice(0, 18).padEnd(20) +
        stats.packetIds.map((id) => `#${id}`).join(", "),
    );
  }

  console.log(
    "\nVoeg herkenbare velden toe aan src/lib/weather/ecowitt/fields.ts en draai daarna " +
      "'npm run weather:reprocess -- <id>' om eerder ontvangen pakketten opnieuw te verwerken.",
  );

  process.exit(0);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
