/**
 * Windroos- en windrichtingberekeningen (Fase 3) — zie
 * docs/DATA_AGGREGATION.md §Windroos voor de volledige toelichting.
 *
 * De 16 Nederlandse kompasrichtingen en de graden-naar-richting-conversie
 * bestonden al in `src/lib/weather/units.ts` (Fase 1/2, gebruikt door o.a.
 * `/api/weather/current`) — hier bewust HERGEBRUIKT (niet gedupliceerd), per
 * de Fase 3-eis "herschrijf geen goed werkende infrastructuur zonder
 * technische noodzaak".
 */
import { COMPASS_POINTS, degreesToCompass } from "@/lib/weather/units";
import type { CompassPoint } from "@/lib/weather/units";

/** De 16 Nederlandse kompasrichtingen, in volgorde vanaf 0° (Noord), met de klok mee. */
export const COMPASS_DIRECTIONS_NL = COMPASS_POINTS;

export type CompassDirectionNl = CompassPoint;

const SECTOR_WIDTH_DEG = 360 / COMPASS_DIRECTIONS_NL.length; // 22.5°

/**
 * "Windstil"-drempel: onder deze windsnelheid (km/h) wordt de gemeten
 * windRICHTING als statistisch niet betekenisvol beschouwd en apart geteld
 * (niet toegewezen aan een kompasrichting) — bij zeer lage snelheid is de
 * momentane richting grotendeels sensorruis, geen echte wind.
 *
 * GEDOCUMENTEERDE KEUZE: 1 km/h, overeenkomend met Beaufort windkracht 0
 * ("windstil", < 1 km/h) — een gangbare, breed erkende meteorologische
 * ondergrens, niet zelf verzonnen. Configureerbaar via de `calmThresholdKmh`-
 * parameter van `buildWindRose()`.
 */
export const DEFAULT_CALM_WIND_THRESHOLD_KMH = 1;

export interface WindObservation {
  windSpeedKmh: number | null;
  windDirectionDeg: number | null;
  windGustKmh: number | null;
}

export interface WindRoseSector {
  direction: CompassDirectionNl;
  /** Middelpunt van deze sector in graden (0-360). */
  centerDeg: number;
  count: number;
  percentage: number;
  avgSpeedKmh: number | null;
  maxGustKmh: number | null;
}

export interface WindRose {
  sectors: WindRoseSector[];
  /** Aantal observaties met windsnelheid onder de windstil-drempel (geen richting toegekend). */
  calmCount: number;
  calmThresholdKmh: number;
  totalObservations: number;
}

/** Rekent een graad (0-360, ook buiten dat bereik) om naar de dichtstbijzijnde van de 16 kompasrichtingen. */
export function degreesToCompassDirection(degrees: number): CompassDirectionNl {
  return degreesToCompass(degrees);
}

/**
 * Bouwt een volledige windroos uit een reeks observaties: aantal, percentage,
 * gemiddelde snelheid en maximale gust per kompasrichting, plus een apart
 * "windstil"-aantal (zie `DEFAULT_CALM_WIND_THRESHOLD_KMH`).
 */
export function buildWindRose(
  observations: WindObservation[],
  calmThresholdKmh: number = DEFAULT_CALM_WIND_THRESHOLD_KMH,
): WindRose {
  const buckets = new Map<
    CompassDirectionNl,
    { count: number; speedSum: number; speedCount: number; maxGust: number | null }
  >();
  for (const direction of COMPASS_DIRECTIONS_NL) {
    buckets.set(direction, { count: 0, speedSum: 0, speedCount: 0, maxGust: null });
  }

  let calmCount = 0;
  let totalObservations = 0;

  for (const obs of observations) {
    if (obs.windDirectionDeg === null || obs.windSpeedKmh === null) continue;
    totalObservations++;

    if (obs.windSpeedKmh < calmThresholdKmh) {
      calmCount++;
      continue;
    }

    const direction = degreesToCompassDirection(obs.windDirectionDeg);
    const bucket = buckets.get(direction)!;
    bucket.count++;
    bucket.speedSum += obs.windSpeedKmh;
    bucket.speedCount++;
    if (obs.windGustKmh !== null) {
      bucket.maxGust =
        bucket.maxGust === null
          ? obs.windGustKmh
          : Math.max(bucket.maxGust, obs.windGustKmh);
    }
  }

  const countedTotal = totalObservations; // inclusief calm, voor percentageberekening t.o.v. alle bruikbare observaties

  const sectors: WindRoseSector[] = COMPASS_DIRECTIONS_NL.map((direction, index) => {
    const bucket = buckets.get(direction)!;
    return {
      direction,
      centerDeg: index * SECTOR_WIDTH_DEG,
      count: bucket.count,
      percentage: countedTotal > 0 ? round1((bucket.count / countedTotal) * 100) : 0,
      avgSpeedKmh:
        bucket.speedCount > 0 ? round1(bucket.speedSum / bucket.speedCount) : null,
      maxGustKmh: bucket.maxGust,
    };
  });

  return { sectors, calmCount, calmThresholdKmh, totalObservations };
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}
