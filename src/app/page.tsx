import { ArrowRight } from "lucide-react";
import Link from "next/link";

import { Container } from "@/components/layout/container";
import { StatusBlock } from "@/components/dashboard/status-block";
import { getDatabaseHealth, getProviderState, getStation } from "@/lib/db/queries";
import { classifyCronHealth } from "@/lib/weather/cron-health";
import { publicEnv } from "@/lib/env";
import { DEFAULT_POLL_INTERVAL_SECONDS } from "@/lib/weather/summary-service";

// Toont altijd de actuele status; nooit statisch cachen.
export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [databaseHealth, station] = await Promise.all([
    getDatabaseHealth(),
    getStation().catch(() => undefined),
  ]);

  const providerState = station
    ? await getProviderState(station.id, "ecowitt_cloud").catch(() => undefined)
    : undefined;

  const cronHealth = station
    ? classifyCronHealth(
        {
          lastPolledAt: providerState?.lastPolledAt ?? null,
          lastSuccessAt: providerState?.lastSuccessAt ?? null,
          lastErrorAt: providerState?.lastErrorAt ?? null,
        },
        DEFAULT_POLL_INTERVAL_SECONDS,
      )
    : null;

  return (
    <Container className="flex flex-1 flex-col gap-10 py-12 sm:py-16">
      <section className="flex flex-col gap-4 text-center sm:text-left">
        <h1 className="text-foreground text-3xl font-semibold tracking-tight sm:text-4xl">
          {publicEnv.NEXT_PUBLIC_STATION_NAME} Weerstation
        </h1>
        <p className="text-muted-foreground max-w-2xl text-base sm:text-lg">
          Cloudgebaseerd dashboard voor actuele en historische weergegevens.
        </p>
      </section>

      <StatusBlock databaseHealth={databaseHealth} stationLinked={Boolean(station)} cronHealth={cronHealth} />

      <section className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Link
          href="/dashboard"
          className="bg-primary text-primary-foreground inline-flex items-center justify-center gap-2 rounded-md px-5 py-2.5 text-sm font-medium transition-colors hover:opacity-90"
        >
          Naar het dashboard
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
        <Link
          href="/station"
          className="border-border text-foreground hover:bg-accent hover:text-accent-foreground inline-flex items-center justify-center gap-2 rounded-md border px-5 py-2.5 text-sm font-medium transition-colors"
        >
          Stationgegevens bekijken
        </Link>
      </section>
    </Container>
  );
}
