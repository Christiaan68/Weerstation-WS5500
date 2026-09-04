import { ArrowRight, Info } from "lucide-react";
import Link from "next/link";

import { Container } from "@/components/layout/container";
import { StatusBlock } from "@/components/dashboard/status-block";
import { getDatabaseHealth } from "@/lib/db/queries";
import { publicEnv } from "@/lib/env";

// Toont altijd de actuele databasestatus; nooit statisch cachen.
export const dynamic = "force-dynamic";

export default async function HomePage() {
  const databaseHealth = await getDatabaseHealth();

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

      <StatusBlock databaseHealth={databaseHealth} />

      <section className="border-border bg-accent text-accent-foreground flex items-start gap-3 rounded-xl border p-4 text-sm sm:p-5">
        <Info className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
        <p>
          Dit is Fase 1: de technische fundering van de website (database, infrastructuur,
          basislayout). Er wordt nog geen echte data van het weerstation ontvangen — de
          koppeling met de Alecto WS5500 volgt in een volgende fase. Wat je hieronder
          ziet, is de structuur die daarvoor klaarstaat.
        </p>
      </section>

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
