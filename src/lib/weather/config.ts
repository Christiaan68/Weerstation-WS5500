/**
 * Centrale, gedeelde drempelwaarden (Fase 4, §38-§39) — één plek voor
 * configuratie die op meerdere plekken in de applicatie gebruikt wordt, om
 * te voorkomen dat dezelfde drempel op meerdere plekken los wordt
 * gededupliceerd (expliciete Fase 4-eis, zie §38: "gebruik een centraal
 * geconfigureerde drempel, niet dupliceren op verschillende plekken").
 *
 * De onderliggende waarden (pollinterval, regendag-drempel) bestonden al
 * sinds Fase 3 elders in de codebase — dit bestand her-exporteert ze samen
 * met de nieuwe Fase 4-drempel (minimale dekking voor droog/nat-reeksen),
 * zodat nieuwe Fase 4-code (Data Quality, dag/maand/jaar-pagina's, records)
 * één centraal importpad heeft.
 */
export { DEFAULT_POLL_INTERVAL_SECONDS } from "@/lib/weather/summary-service";
export { DEFAULT_RAIN_DAY_THRESHOLD_MM } from "@/lib/weather/rain";

/**
 * Minimale dekking (%) die een lokale dag moet hebben om mee te tellen in
 * een droge/natte-reeks-berekening (§39: "een dag met onvoldoende
 * meetdekking mag niet klakkeloos als droog of nat voor lange reeksen
 * gebruikt worden — definieer een minimale dekking voor reeksberekeningen").
 *
 * Gekozen waarde: 50%. Onderbouwing: bij het huidige pollritme van 5 minuten
 * (~288 metingen/dag) betekent dit dat een dag met minder dan ~144 geldige
 * metingen wordt overgeslagen bij het bepalen van droge/natte reeksen (de
 * dag telt dan niet mee als "droog", maar telt ook niet mee als "nat" —
 * hij onderbreekt geen lopende reeks, maar verlengt er ook geen). Dit is
 * bewust een middenweg: een te hoge drempel (bv. 95%) zou een dag met een
 * kort ingestie-hikje onterecht laten meetellen als "geen data", terwijl een
 * te lage drempel (bv. 10%) een dag met vrijwel geen metingen alsnog als
 * volwaardig "droog" of "nat" zou meetellen — met een reëel risico op een
 * foutieve record-reeks op basis van een paar toevallige metingen.
 */
export const DEFAULT_MIN_COVERAGE_FOR_STREAK_PCT = 50;
