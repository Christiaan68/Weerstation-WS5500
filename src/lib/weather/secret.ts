/**
 * Constant-tijd vergelijking van geheimen uit de URL (ingestie-secret,
 * diagnosepagina-sleutel). Nooit met `===` vergelijken: een tijdsverschil in
 * hoe snel een `false` terugkomt kan (in theorie) informatie lekken over hoe
 * groot het overeenkomende voorvoegsel is ("timing attack"). We gebruiken
 * hiervoor bewust nooit IP-adressen als (enige) beveiliging — zie
 * docs/WS5500_INGESTION.md §Beveiliging.
 */
import { timingSafeEqual } from "node:crypto";

export function secretMatches(
  candidate: string | undefined,
  expected: string | undefined,
): boolean {
  if (!candidate || !expected) {
    return false;
  }

  const candidateBuffer = Buffer.from(candidate);
  const expectedBuffer = Buffer.from(expected);

  // `timingSafeEqual` vereist buffers van gelijke lengte; een lengteverschil
  // is zelf geen geheime informatie (de lengte van een geldig secret is niet
  // verborgen), dus dit is veilig om vooraf te controleren.
  if (candidateBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(candidateBuffer, expectedBuffer);
}
