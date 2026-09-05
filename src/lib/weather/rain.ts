/**
 * Regenberekeningen (Fase 3) — zie docs/DATA_AGGREGATION.md §Regen voor de
 * volledige onderbouwing.
 *
 * KERNPROBLEEM: het Ecowitt-protocol levert regen als CUMULATIEVE tellers
 * (`rainDayMm`/"dailyrainin" telt op vanaf 0 bij lokale middernacht,
 * `rainWeekMm`/`rainMonthMm`/`rainYearMm` idem per week/maand/jaar volgens
 * de KLOK VAN HET STATION — niet noodzakelijk gelijk aan onze eigen
 * Europe/Amsterdam-kalendergrenzen) en één instantane snelheid
 * (`rainRateMmH`). Deze twee soorten waarden mogen NOOIT als één lijn/getal
 * behandeld worden zonder duidelijk onderscheid (expliciete Fase 3-eis).
 *
 * GEKOZEN METHODE (per Ecowitt-veld hieronder gedocumenteerd):
 * - "Regen op lokale dag D" wordt NOOIT berekend door metingen bij elkaar op
 *   te tellen (dat zou de cumulatieve teller dubbel tellen — het klassieke
 *   "2.0, 2.2, 2.5 → 6.7mm"-fout uit de Fase 3-opdracht). In plaats daarvan
 *   nemen we simpelweg de HOOGSTE `rainDayMm`-waarde die binnen die lokale
 *   dag gemeten is (`dailyRainTotalMm`) — de teller is binnen één lokale dag
 *   monotoon stijgend (op eventuele firmware-glitches na, zie hieronder),
 *   dus het maximum = de laatste/hoogste stand = het dagtotaal. Dit is een
 *   simpele, snelle SQL MAX()-aggregatie (geen window-functies, geen
 *   tijdzoneberekening in SQL nodig — de dag-grenzen zijn al vooraf in JS
 *   berekend via `timezone.ts` en als UTC-grenzen doorgegeven aan de query).
 * - "Regen deze week/maand/jaar" wordt NIET afgeleid van de eigen
 *   `rainWeekMm`/`rainMonthMm`/`rainYearMm`-tellers van het station (die
 *   volgen de resetklok van het station, niet per se onze Europe/Amsterdam-
 *   kalenderweek/-maand/-jaar). In plaats daarvan: SOM van de dagtotalen
 *   (`dailyRainTotalMm` per lokale dag) over de betreffende periode — zo
 *   blijft alles intern consistent en gebaseerd op dezelfde
 *   Europe/Amsterdam-kalendergrenzen.
 * - "Regen per uur vandaag" (staafgrafiek): per uur-bucket het maximum van
 *   `rainDayMm` nemen (`bucketMaxima`), en dan het VERSCHIL tussen
 *   opeenvolgende buckets nemen (`incrementsFromCumulativeSeries`) — dat
 *   geeft de werkelijk in dat uur gevallen neerslag, nooit de cumulatieve
 *   stand zelf. Reset-detectie (stand daalt onverwacht t.o.v. de vorige
 *   bucket) wordt defensief afgevangen: een daling levert nooit een
 *   negatief increment op, en wordt behandeld als "teller opnieuw begonnen"
 *   (het increment is dan gewoon de nieuwe waarde zelf).
 * - `rainRateMmH` (regenintensiteit) is een LOSSE, instantane meting — nooit
 *   opgeteld, alleen gebruikt voor "huidige intensiteit" en
 *   "maximale rain rate" (een gewone MAX-aggregatie, geen tellerlogica).
 */

export interface CumulativeBucket {
  /** Herkenbare sleutel voor deze bucket (bv. "2026-09-05" of "14" voor uur 14). */
  key: string;
  /** Hoogste cumulatieve tellerstand binnen deze bucket, of null als er geen (geldige) meting was. */
  maxValueMm: number | null;
}

export interface RainIncrement {
  key: string;
  /** Werkelijk in deze bucket gevallen neerslag (mm), altijd >= 0. */
  incrementMm: number;
}

/**
 * Zet een reeks CUMULATIEVE tellerstanden (per bucket, chronologisch
 * gesorteerd) om naar werkelijk gevallen neerslag per bucket. Kernregel: het
 * increment is nooit negatief. Bij een onverwachte daling (teller-reset,
 * firmwareglitch, of een bucket zonder data gevolgd door een nieuwe dag) telt
 * de nieuwe waarde zelf als increment, in plaats van een negatieve of foutief
 * te grote waarde te produceren.
 *
 * Dit is precies de logica achter het voorbeeld uit de Fase 3-opdracht:
 * dagteller 2.0 → 2.2 → 2.5 levert increments [2.0, 0.2, 0.3] op, som 2.5mm
 * — nooit 6.7mm.
 */
export function incrementsFromCumulativeSeries(
  buckets: CumulativeBucket[],
): RainIncrement[] {
  const result: RainIncrement[] = [];
  let previous: number | null = null;

  for (const bucket of buckets) {
    const current = bucket.maxValueMm;

    if (current === null) {
      result.push({ key: bucket.key, incrementMm: 0 });
      // Vorige stand bewust ONGEWIJZIGD laten: een lege bucket (geen
      // metingen) betekent niet dat de teller gereset is.
      continue;
    }

    if (previous === null || current < previous) {
      // Eerste bucket met data, of de teller is gedaald (reset) — de volledige
      // huidige stand is dan het increment.
      result.push({ key: bucket.key, incrementMm: round2(current) });
    } else {
      result.push({ key: bucket.key, incrementMm: round2(current - previous) });
    }
    previous = current;
  }

  return result;
}

/**
 * Het dagtotaal uit een reeks `rainDayMm`-waarden binnen één lokale dag:
 * simpelweg het maximum (zie uitleg bovenaan dit bestand). Geeft `null`
 * terug (nooit `0`) als er geen enkele geldige waarde is — zie de Fase 3-eis
 * "toon niet automatisch 0 als er geen data is".
 */
export function dailyRainTotalMm(
  values: Array<number | null | undefined>,
): number | null {
  const valid = values.filter(
    (v): v is number => typeof v === "number" && Number.isFinite(v),
  );
  if (valid.length === 0) return null;
  return round2(Math.max(...valid, 0));
}

/**
 * Som van dagtotalen over een periode (week/maand/jaar) — ontbrekende dagen
 * (`null`) tellen niet mee als 0 tenzij expliciet gevraagd (zie
 * `treatMissingAsZero`, gebruikt voor de 30-dagen-staafgrafiek waar Fase 3
 * vraagt om dagen zonder regen als 0 te tonen "wanneer volledigheid
 * voldoende is").
 */
export function sumDailyTotals(
  dailyTotals: Array<number | null>,
  options: { treatMissingAsZero?: boolean } = {},
): number | null {
  const values = options.treatMissingAsZero
    ? dailyTotals.map((v) => v ?? 0)
    : dailyTotals.filter((v): v is number => v !== null);

  if (values.length === 0) return null;
  return round2(values.reduce((sum, v) => sum + v, 0));
}

const DEFAULT_RAIN_DAY_THRESHOLD_MM = 0.1;

/**
 * Definitie van een "regendag" (Fase 3, configureerbare drempel — zie
 * `docs/DATA_AGGREGATION.md`). Standaard: >= 0,1 mm.
 */
export function isRainDay(
  totalMm: number | null,
  thresholdMm: number = DEFAULT_RAIN_DAY_THRESHOLD_MM,
): boolean {
  return totalMm !== null && totalMm >= thresholdMm;
}

export { DEFAULT_RAIN_DAY_THRESHOLD_MM };

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
