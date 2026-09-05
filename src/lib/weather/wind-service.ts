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
import { getLocalDateKey, getLocalDayBoundsUtc } from "@/lib/weather/timezone";
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

export async function getWindRoseOverview(
  stationId: number,
  period: WindRosePeriod,
  now: Date = new Date(),
  calmThresholdKmh: number = DEFAULT_CALM_WIND_THRESHOLD_KMH,
): Promise<WindRoseOverview> {
  const fromUtc =
    period === "today"
      ? getLocalDayBoundsUtc(getLocalDateKey(now)).startUtc
      : new Date(now.getTime() - (period === "7d" ? 7 : 30) * 24 * 60 * 60 * 1000);

  const observations = await listWindObservationsInRange(stationId, fromUtc, now);
  const rose = buildWindRose(observations, calmThresholdKmh);
  const stats = computeWindStats(observations);

  return { period, from: fromUtc.toISOString(), to: now.toISOString(), rose, stats };
}
