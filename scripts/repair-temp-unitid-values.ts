/**
 * ECHTE reparatie van de temp_unitid-bug — vervangt/vult aan op
 * `repair-temp-unitid-bug.ts`.
 *
 * WAAROM DIT SCRIPT NODIG IS (ontdekt op 2026-09-05, na het draaien van
 * `weather:repair-temp-unitid:confirm`): dat script roept simpelweg
 * `reprocessRawPacket()` aan, wat de OPGESLAGEN ruwe payload opnieuw door de
 * ONGEWIJZIGDE parser (`src/lib/weather/ecowitt/parse.ts`) haalt. Die parser
 * gaat er ALTIJD van uit dat het veld `tempf` (en `tempinf`, `dewptf`,
 * `feelslikef`) Fahrenheit bevat, en converteert dat met de vaste formule
 * (F-32)*5/9 naar Celsius.
 *
 * Voor pakketten die zijn opgehaald toen `temp_unitid` nog ten onrechte op
 * "1" stond (zie `src/lib/weather/providers/ecowitt-cloud.ts`), bevat het
 * opgeslagen `tempf`-veld echter al een ECHTE Celsius-waarde (bv. "19.2"),
 * enkel foutief gelabeld als Fahrenheit. De ONGEWIJZIGDE parser converteert
 * die 19.2 dus (nogmaals) alsof het Fahrenheit was: (19.2-32)*5/9 ≈ -7.1°C.
 * Vandaar dat `reprocessRawPacket()` GEEN verschil maakte: -7.1°C → -7.1°C.
 *
 * DE ECHTE FIX: voor exact deze aantoonbaar getroffen pakketten (dezelfde
 * `listRawPacketsBySourceBefore()`-filter als het vorige script) wordt een
 * IN-MEMORY kopie van de ruwe payload gemaakt, waarin de betrokken velden
 * (`tempf`, `tempinf`, `dewptf`, `feelslikef` — exact de velden die
 * `flattenCloudResponse()` vult op basis van `temp_unitid`) worden omgezet
 * van "foutief gelabelde Celsius-waarde" naar een "fake Fahrenheit"-waarde
 * (trueCelsius × 9/5 + 32), zodat de ONGEWIJZIGDE, bestaande
 * Fahrenheit→Celsius-conversie in de parser die weer exact terugrekent naar
 * de oorspronkelijke, juiste Celsius-waarde. Zo wordt de bestaande, geteste
 * parser/normalisatiepijplijn hergebruikt (geen losse herimplementatie van
 * afgeleide velden), en blijft de RUWE payload in de database VOLLEDIG
 * ongewijzigd — alleen de afgeleide meting (`weather_observations`) wordt
 * herberekend. Zie het nieuwe `rawPayloadOverride`-argument van
 * `reprocessRawPacket()` in `src/lib/weather/ingest-pipeline.ts`.
 *
 * VEILIGHEID: standaard alleen een DROOGRUN (toont exact welke velden van
 * welke waarde naar welke waarde zouden gaan, wijzigt niets). Pas met
 * `--confirm` wordt er daadwerkelijk herverwerkt.
 *
 * Gebruik:
 *   npx tsx scripts/repair-temp-unitid-values.ts            (droogrun)
 *   npx tsx scripts/repair-temp-unitid-values.ts --confirm   (voert de reparatie uit)
 */
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local" });

import { getObservationByRawPacketId, listRawPacketsBySourceBefore } from "../src/lib/db/queries";
import { reprocessRawPacket } from "../src/lib/weather/ingest-pipeline";
import type { RawFieldValue, RawPayload } from "../src/lib/weather/types";

const AFFECTED_SOURCE = "ecowitt_cloud_api";

/** Zelfde cutoff als `repair-temp-unitid-bug.ts` — zie uitleg daar. */
const REPAIR_CUTOFF = new Date("2026-09-05T14:10:00.000Z"); // 16:10 Europe/Amsterdam (zomertijd, UTC+2)

/**
 * Exact de velden die `flattenCloudResponse()` in
 * `src/lib/weather/providers/ecowitt-cloud.ts` vult op basis van de
 * `temp_unitid`-queryparameter (zie regels 91-95 daar). Andere temperatuur-
 * afgeleide velden (`windchillf`, `heatindexf`) worden door deze provider
 * niet gevuld en zijn dus niet relevant hier.
 */
const AFFECTED_TEMP_FIELDS = ["tempf", "tempinf", "dewptf", "feelslikef"] as const;

function formatNl(date: Date | null | undefined): string {
  if (!date) return "onbekend";
  return new Intl.DateTimeFormat("nl-NL", {
    dateStyle: "medium",
    timeStyle: "medium",
    timeZone: "Europe/Amsterdam",
  }).format(date);
}

function toFiniteNumber(value: RawFieldValue): number | undefined {
  if (value === null || value === undefined) return undefined;
  const num = typeof value === "number" ? value : Number(value);
  return Number.isFinite(num) ? num : undefined;
}

/**
 * Bouwt een gecorrigeerde in-memory kopie van de ruwe payload. Retourneert
 * ook een lijst van precies welke velden zijn aangepast (voor rapportage) —
 * een veld dat niet aanwezig is in de payload wordt overgeslagen.
 */
function buildCorrectedPayload(rawPayload: RawPayload): {
  corrected: RawPayload;
  changes: Array<{ field: string; trueCelsius: number; fakeFahrenheit: number }>;
} {
  const corrected: RawPayload = { ...rawPayload };
  const changes: Array<{ field: string; trueCelsius: number; fakeFahrenheit: number }> = [];

  for (const field of AFFECTED_TEMP_FIELDS) {
    const trueCelsius = toFiniteNumber(rawPayload[field]);
    if (trueCelsius === undefined) continue;

    const fakeFahrenheit = (trueCelsius * 9) / 5 + 32;
    corrected[field] = String(fakeFahrenheit);
    changes.push({ field, trueCelsius, fakeFahrenheit });
  }

  return { corrected, changes };
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

  console.log(`${candidates.length} aantoonbaar getroffen pakket(ten) gevonden.\n`);

  let repaired = 0;
  let failed = 0;

  for (const packet of candidates) {
    const rawPayload = packet.rawPayload as RawPayload;
    const { corrected, changes } = buildCorrectedPayload(rawPayload);

    console.log(`#${packet.id} (${formatNl(packet.receivedAt)}):`);
    if (changes.length === 0) {
      console.log(
        "  Geen van de bekende getroffen velden (tempf/tempinf/dewptf/feelslikef) aanwezig in de ruwe payload — niets om te corrigeren voor dit pakket.",
      );
      continue;
    }

    for (const change of changes) {
      console.log(
        `  ${change.field}: ruwe waarde "${change.trueCelsius}" (destijds ten onrechte als Fahrenheit verwerkt) is in werkelijkheid al °C.`,
      );
    }

    const before = await getObservationByRawPacketId(packet.id);
    console.log(
      `  Vóór reparatie — buiten: ${before?.temperatureOutdoorC ?? "—"} °C, binnen: ${
        before?.temperatureIndoorC ?? "—"
      } °C, dauwpunt: ${before?.dewPointC ?? "—"} °C, gevoelstemperatuur: ${
        before?.feelsLikeC ?? "—"
      } °C`,
    );

    if (!confirm) {
      // Droogrun: toon wat de nieuwe waarde zou worden zonder iets op te slaan.
      const previewCelsius = (fakeF: number) => (((fakeF - 32) * 5) / 9).toFixed(1);
      const preview = changes
        .map((c) => `${c.field}→${previewCelsius(c.fakeFahrenheit)}°C`)
        .join(", ");
      console.log(`  Zou worden (droogrun, niet opgeslagen): ${preview}`);
      continue;
    }

    try {
      const result = await reprocessRawPacket(packet.id, { rawPayloadOverride: corrected });
      const after = await getObservationByRawPacketId(packet.id);
      console.log(
        `  Ná reparatie (status=${result.status}) — buiten: ${
          after?.temperatureOutdoorC ?? "—"
        } °C, binnen: ${after?.temperatureIndoorC ?? "—"} °C, dauwpunt: ${
          after?.dewPointC ?? "—"
        } °C, gevoelstemperatuur: ${after?.feelsLikeC ?? "—"} °C`,
      );
      repaired++;
    } catch (error) {
      failed++;
      console.error(
        `  FOUT bij herverwerken — ${error instanceof Error ? error.message : error}`,
      );
    }
    console.log();
  }

  console.log("=".repeat(70));
  if (!confirm) {
    console.log(
      "Dit was een DROOGRUN — er is niets gewijzigd. Voer opnieuw uit met --confirm om " +
        "deze pakketten daadwerkelijk te herverwerken met de gecorrigeerde velden.",
    );
  } else {
    console.log(
      `Resultaat: ${candidates.length} gevonden, ${repaired} succesvol herverwerkt, ${failed} mislukt.`,
    );
  }

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
