/**
 * Windroos per periode (Fase 3, `/wind`-pagina + `/api/weather/wind`).
 *
 * Windrichting is per definitie niet zinvol vooraf te aggregeren (zie
 * `src/lib/db/queries.ts` §`listWindObservationsInRange`), dus de windroos
 * wordt in de applicatielaag opgebouwd uit individuele metingen — bewust
 * BEGRENSD tot maximaal 30 dagen, zodat dit altijd een begrensde, snelle
 * query blijft (bij het huidige pollinterval van 5 minuten ten hoogste
 * ~8640 rijen, met een harde `limit` in de query als extra vangnet).
 */
import { listWindObservationsInRange } from "@/lib/db/queries";
import { addDaysToDateKey, getLocalDateKey, getLocalDayBoundsUtc } from "@/lib/weather/timezone";
import {
  buildWindRose,
  DEFAULT_CALM_WIND_THRESHOLD_KMH,
  type WindRose,
} from "@/lib/weather/wind";

export const WIND_ROSE_PERIODS = ["today", "7d", "30d"] as const;
export type WindRosePeriod = (typeof WIND_ROSE_PERIODS)[number];

export interface WindStats {
  avgSpeedKmh: number | null;
  maxGustKmh: number | null;
  maxGustAt: string | null;
}

export interface WindRoseOverview {
  period: WindRosePeriod;
  from: string;
  to: string;
  rose: WindRose;
  stats: WindStats;
}

function computeWindStats(
  observations: Array<{
    measuredAt: Date;
    windSpeedKmh: number | null;
    windGustKmh: number | null;
  }>,
): WindStats {
  const speeds = observations
    .map((o) => o.windSpeedKmh)
    .filter((v): v is number => v !== null);
  const avgSpeedKmh =
    speeds.length > 0
      ? Math.round((speeds.reduce((a, b) => a + b, 0) / speeds.length) * 10) / 10
      : null;

  let maxGustKmh: number | null = null;
  let maxGustAt: string | null = null;
  for (const obs of observations) {
    if (
      obs.windGustKmh !== null &&
      (maxGustKmh === null || obs.windGustKmh > maxGustKmh)
    ) {
      maxGustKmh = obs.windGustKmh;
      maxGustAt = obs.measuredAt.toISOString();
    }
  }

  return { avgSpeedKmh, maxGustKmh, maxGustAt };
}

/**
 * @param offset Aantal vensters terug vanaf nu (0 = huidig venster) — bv. bij
 * `period="7d"` is offset=1 de 7 dagen daarvóór. Maakt de terug/vooruit-
 * navigatie op `/wind` mogelijk (Fase 4.4): bij offset 0 is het gedrag exact
 * gelijk aan voorheen (venster eindigt op `now`, dus "tot nu").
 */
export async function getWindRoseOverview(
  stationId: number,
  period: WindRosePeriod,
  offset: number = 0,
  now: Date = new Date(),
  calmThresholdKmh: number = DEFAULT_CALM_WIND_THRESHOLD_KMH,
): Promise<WindRoseOverview> {
  let fromUtc: Date;
  let toUtc: Date;

  if (period === "today") {
    const targetDateKey = addDaysToDateKey(getLocalDateKey(now), -offset);
    const { startUtc, endUtc } = getLocalDayBoundsUtc(targetDateKey);
    fromUtc = startUtc;
    // Bij offset 0 loopt de "dag" nog (nooit verder dan `now` vragen); bij een
    // volledig verstreken dag (offset > 0) is `endUtc` sowieso al vóór `now`.
    toUtc = now.getTime() < endUtc.getTime() ? now : endUtc;
  } else {
    const windowMs = (period === "7d" ? 7 : 30) * 24 * 60 * 60 * 1000;
    toUtc = new Date(now.getTime() - offset * windowMs);
    fromUtc = new Date(toUtc.getTime() - windowMs);
  }

  const observations = await listWindObservationsInRange(stationId, fromUtc, toUtc);
  const rose = buildWindRose(observations, calmThresholdKmh);
  const stats = computeWindStats(observations);

  return { period, from: fromUtc.toISOString(), to: toUtc.toISOString(), rose, stats };
}
