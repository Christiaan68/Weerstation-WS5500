/**
 * Doorlopend opgetelde regen over een tijdreeks (gebruikt door de
 * gecombineerde regengrafiek, `rain-combined-chart.tsx`).
 *
 * Het station levert regen als CUMULATIEVE dagteller (`rainDayMm`, telt op
 * vanaf 0 bij middernacht — zie `rain.ts` voor de achtergrond). Voor één dag
 * is die teller zelf al de gewenste cumulatieve lijn; voor een week, maand of
 * jaar willen we juist de regen die sinds het BEGIN VAN DE PERIODE gevallen
 * is. Daarom wordt hier de teller omgezet naar een doorlopend totaal:
 *
 * - Zelfde lokale dag als het vorige punt en de stand stijgt (of blijft
 *   gelijk): alleen het verschil telt erbij (nooit de hele stand opnieuw —
 *   het klassieke "2.0, 2.2, 2.5 → 6.7 mm"-dubbeltellen).
 * - Nieuwe lokale dag, of de stand daalt onverwacht (teller-reset,
 *   firmwareglitch): de nieuwe stand zelf telt erbij, nooit een negatief of
 *   te groot verschil. Bij dagbuckets (jaarweergave) is elk punt een eigen
 *   dag, dus wordt simpelweg het dagtotaal opgeteld.
 * - `null` (geen meting) levert `null` op in de uitvoer en laat de lopende
 *   stand ongemoeid, zodat een gat in de metingen niets verandert.
 */
export interface RainCounterSample {
  /** Tijdstip in ms sinds epoch (begin van het bucket/de meting). */
  t: number;
  /** Stand van de dagteller in mm, of `null` zonder (geldige) meting. */
  value: number | null;
}

export function runningRainTotal(
  samples: readonly RainCounterSample[],
  dayKeyOf: (t: number) => string,
): Array<number | null> {
  const result: Array<number | null> = [];
  let total = 0;
  let previousValue: number | null = null;
  let previousDay: string | null = null;

  for (const sample of samples) {
    const value = sample.value;
    if (value === null || !Number.isFinite(value) || value < 0) {
      result.push(null);
      continue;
    }

    const day = dayKeyOf(sample.t);
    if (previousValue === null || day !== previousDay || value < previousValue) {
      total += value;
    } else {
      total += value - previousValue;
    }

    previousValue = value;
    previousDay = day;
    result.push(Math.round(total * 100) / 100);
  }

  return result;
}
