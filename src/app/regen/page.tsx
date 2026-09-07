import type { Metadata } from "next";

import { ComingSoon } from "@/components/dashboard/coming-soon";
import { Container } from "@/components/layout/container";
import { PageHeader } from "@/components/layout/page-header";
import { RainExplorer } from "@/components/weather/rain-explorer";
import { getStation } from "@/lib/db/queries";

export const metadata: Metadata = {
  title: "Regen",
  description: "Neerslaggegevens van het weerstation.",
};

export const dynamic = "force-dynamic";

export default async function RegenPage({
  searchParams,
}: {
  searchParams: Promise<{ station?: string }>;
}) {
  const { station: stationParam } = await searchParams;
  const station = await getStation(stationParam).catch(() => undefined);

  return (
    <Container className="flex flex-1 flex-col gap-6 py-10">
      <PageHeader title="Regen" description="Neerslag per uur, dag, maand en jaar." />
      {station ? (
        <RainExplorer stationSlug={station.slug} />
      ) : (
        <ComingSoon text="Er is nog geen station geconfigureerd." />
      )}
    </Container>
  );
}
