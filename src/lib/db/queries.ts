/**
 * Server-side service/repository-laag.
 *
 * Doel: pagina's en API-routes praten met deze functies, niet rechtstreeks
 * met `db`/Drizzle. Dat houdt querylogica op één plek en maakt het later
 * eenvoudig om caching, logging of extra validatie toe te voegen zonder
 * elke pagina aan te passen.
 *
 * Zie `src/lib/db/index.ts` voor waarom dit bestand bewust GEEN
 * `import "server-only"` gebruikt (deze functies worden ook vanuit losse
 * scripts aangeroepen, buiten Next.js' bundler om).
 */
import { count, desc, eq } from "drizzle-orm";

import { db, pingDatabase } from "@/lib/db";
import { stations, weatherObservations } from "@/lib/db/schema";
import type { Station, WeatherObservation } from "@/lib/db/schema";

/**
 * Haalt het (eerste actieve) weerstation op. In Fase 1 is er hooguit één
 * seed-station, dus zonder argument krijg je "het" station van deze
 * installatie. Geef een `slug` mee om een specifiek station op te halen.
 */
export async function getStation(slug?: string): Promise<Station | undefined> {
  const rows = slug
    ? await db.select().from(stations).where(eq(stations.slug, slug)).limit(1)
    : await db
        .select()
        .from(stations)
        .where(eq(stations.isActive, true))
        .orderBy(stations.id)
        .limit(1);

  return rows[0];
}

/** Meest recente genormaliseerde meting voor een station, indien aanwezig. */
export async function getLatestObservation(
  stationId: number,
): Promise<WeatherObservation | undefined> {
  const rows = await db
    .select()
    .from(weatherObservations)
    .where(eq(weatherObservations.stationId, stationId))
    .orderBy(desc(weatherObservations.measuredAt))
    .limit(1);

  return rows[0];
}

/** Totaal aantal metingen voor een station (voor dashboard/statistieken). */
export async function getObservationCount(stationId: number): Promise<number> {
  const rows = await db
    .select({ value: count() })
    .from(weatherObservations)
    .where(eq(weatherObservations.stationId, stationId));

  return rows[0]?.value ?? 0;
}

export type DatabaseHealth =
  { status: "ok"; latencyMs: number } | { status: "error"; error: string };

/** Gestructureerde databasestatus, gebruikt door `/api/health` en de UI. */
export async function getDatabaseHealth(): Promise<DatabaseHealth> {
  const result = await pingDatabase();

  if (result.ok) {
    return { status: "ok", latencyMs: result.latencyMs };
  }

  return { status: "error", error: result.error };
}
