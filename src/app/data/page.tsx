import type { Metadata } from "next";

import { ComingSoon } from "@/components/dashboard/coming-soon";
import { Container } from "@/components/layout/container";
import { PageHeader } from "@/components/layout/page-header";
import { DataExplorer } from "@/components/weather/data-explorer";
import { getStation, listDistinctObservationSources } from "@/lib/db/queries";

export const metadata: Metadata = {
  title: "Data",
  description: "Doorzoek, filter, sorteer en exporteer de volledige opgeslagen meetdata.",
};

export const dynamic = "force-dynamic";

export default async function DataPage({
  searchParams,
}: {
  searchParams: Promise<{ station?: string }>;
}) {
  const { station: stationParam } = await searchParams;
  const station = await getStation(stationParam).catch(() => undefined);
  const sources = station
    ? await listDistinctObservationSources(station.id).catch(() => [])
    : [];

  return (
    <Container className="flex flex-1 flex-col gap-6 py-10">
      <PageHeader
        title="Data"
        description="Blader, filter, sorteer en exporteer de volledige opgeslagen meetdata van het weerstation — kies zelf welke kolommen zichtbaar zijn."
      />
      {station ? (
        <DataExplorer stationSlug={station.slug} sources={sources} />
      ) : (
        <ComingSoon text="Er is nog geen station geconfigureerd." />
      )}
    </Container>
  );
}
