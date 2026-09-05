/**
 * Gecontroleerd reparatiescript voor de `temp_unitid`-bug uit Fase 2/3 (zie
 * `docs/fase2-status.md` in het Claude-project en de code-opmerkingen in
 * `src/lib/weather/providers/ecowitt-cloud.ts`).
 *
 * WAT WAS ER FOUT: tot en met 2026-09-05 16:10 UTC+2 (lokale tijd) stond
 * `temp_unitid` bij het bevragen van de Ecowitt Cloud API op `"1"`, in de
 * veronderstelling dat dit Fahrenheit betekende. In werkelijkheid betekent
 * `1 = °C` en `2 = °F` bij deze API (geverifieerd tegen een onafhankelijke
 * open-source implementatie, CumulusMX). Gevolg: de API gaf de temperatuur
 * gewoon correct in °C terug, maar die waarde werd als "tempf" (Fahrenheit)
 * doorgegeven aan de bestaande parser, die 'm ten onrechte omrekende.
 *
 * WELKE PAKKETTEN ZIJN AANTOONBAAR GETROFFEN (geen giswerk op basis van
 * "vreemd lijkende" waarden — zie de expliciete eis in de Fase 3-opdracht
 * om nooit blind te verwijderen/wijzigen op basis van plausibiliteit):
 * ELK pakket met `source = 'ecowitt_cloud_api'` dat ontvangen is vóór het
 * moment waarop de fix live ging, is met wiskundige zekerheid getroffen —
 * de bug zat in de vraag die naar de Ecowitt Cloud API werd gestuurd, niet
 * in een individuele meting. `REPAIR_CUTOFF` hieronder ligt bewust exact
 * tussen het laatst bevestigde FOUTE pakket (#30001, ontvangen 2026-09-05
 * 16:06:01 lokale tijd) en het eerst bevestigde GOEDE pakket (#60001,
 * ontvangen 2026-09-05 16:13:14 lokale tijd) in.
 *
 * WAT DIT SCRIPT DOET: het herverwerkt AANTOONBAAR getroffen pakketten met
 * de huidige (gefixte) parser, via de bestaande, al geteste
 * `reprocessRawPacket()`-pijplijn — dezelfde functie die
 * `npm run weather:reprocess` ook gebruikt. Er wordt nooit een ruwe payload
 * gewijzigd of verwijderd; alleen de AFGELEIDE (`weather_observations`-)rij
 * wordt opnieuw berekend uit die ongewijzigde ruwe payload.
 *
 * VEILIGHEID: standaard alleen een DROOGRUN (toont wat er zou gebeuren,
 * wijzigt niets). Pas met `--confirm` wordt er daadwerkelijk herverwerkt.
 *
 * Gebruik:
 *   npx tsx scripts/repair-temp-unitid-bug.ts            (droogrun)
 *   npx tsx scripts/repair-temp-unitid-bug.ts --confirm   (voert de reparatie uit)
 */
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local" });

import {
  getObservationByRawPacketId,
  listRawPacketsBySourceBefore,
} from "../src/lib/db/queries";
import { reprocessRawPacket } from "../src/lib/weather/ingest-pipeline";

const AFFECTED_SOURCE = "ecowitt_cloud_api";

/** Zie uitleg bovenaan dit bestand voor de exacte onderbouwing van dit tijdstip. */
const REPAIR_CUTOFF = new Date("2026-09-05T14:10:00.000Z"); // 16:10 Europe/Amsterdam (zomertijd, UTC+2)

function formatNl(date: Date | null | undefined): string {
  if (!date) return "onbekend";
  return new Intl.DateTimeFormat("nl-NL", {
    dateStyle: "medium",
    timeStyle: "medium",
    timeZone: "Europe/Amsterdam",
  }).format(date);
}

async function main() {
  const confirm = process.argv.includes("--confirm");

  console.log(
    `Zoeken naar pakketten met source='${AFFECTED_SOURCE}' ontvangen vóór ${formatNl(REPAIR_CUTOFF)}...\n`,
  );

  const candidates = await listRawPacketsBySourceBefore(AFFECTED_SOURCE, REPAIR_CUTOFF);

  if (candidates.length === 0) {
    console.log(
      "Geen aantoonbaar getroffen pakketten gevonden. Niets te repareren — script stopt.",
    );
    process.exit(0);
  }

  console.log(`${candidates.length} aantoonbaar getroffen pakket(ten) gevonden:\n`);
  console.log("id\tontvangen\t\t\tstatus (vóór reparatie)");
  for (const packet of candidates) {
    console.log(
      `#${packet.id}\t${formatNl(packet.receivedAt)}\t${packet.processingStatus}`,
    );
  }

  const oldest = candidates[0]!.receivedAt;
  const newest = candidates[candidates.length - 1]!.receivedAt;
  console.log(`\nPeriode: ${formatNl(oldest)} t/m ${formatNl(newest)}.`);

  if (!confirm) {
    console.log(
      "\nDit was een DROOGRUN — er is niets gewijzigd. Voer opnieuw uit met --confirm om " +
        "deze pakketten daadwerkelijk te herverwerken met de gefixte parser.",
    );
    process.exit(0);
  }

  console.log("\n--confirm gegeven: pakketten worden nu herverwerkt...\n");

  let repaired = 0;
  let failed = 0;

  for (const packet of candidates) {
    const before = await getObservationByRawPacketId(packet.id);
    const beforeTemp = before?.temperatureOutdoorC ?? null;

    try {
      const result = await reprocessRawPacket(packet.id);
      const after = await getObservationByRawPacketId(packet.id);
      const afterTemp = after?.temperatureOutdoorC ?? null;

      console.log(
        `#${packet.id}: status=${result.status} — buitentemperatuur ${beforeTemp ?? "—"} °C → ${afterTemp ?? "—"} °C`,
      );
      repaired++;
    } catch (error) {
      failed++;
      console.error(
        `#${packet.id}: FOUT bij herverwerken — ${error instanceof Error ? error.message : error}`,
      );
    }
  }

  console.log("\n" + "=".repeat(70));
  console.log(
    `Resultaat: ${candidates.length} gevonden, ${repaired} succesvol herverwerkt, ${failed} mislukt.`,
  );
  console.log(`Periode: ${formatNl(oldest)} t/m ${formatNl(newest)}.`);

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
