import type { Metadata } from "next";

import { ComingSoon } from "@/components/dashboard/coming-soon";
import { Container } from "@/components/layout/container";
import { PageHeader } from "@/components/layout/page-header";
import { DataQualityExplorer } from "@/components/weather/data-quality-explorer";
import { getStation } from "@/lib/db/queries";

export const metadata: Metadata = {
  title: "Datakwaliteit",
  description: "Volledigheid, ontbrekende metingen en pakket-/parserstatus van het weerstation.",
};

export const dynamic = "force-dynamic";

export default async function DataQualityPage({
  searchParams,
}: {
  searchParams: Promise<{ station?: string }>;
}) {
  const { station: stationParam } = await searchParams;
  const station = await getStation(stationParam).catch(() => undefined);

  return (
    <Container className="flex flex-1 flex-col gap-6 py-10">
      <PageHeader
        title="Datakwaliteit"
        description="Volledigheid per dag en maand, ontbrekende meetintervallen, en de status van binnengekomen pakketten."
      />
      {station ? (
        <DataQualityExplorer stationSlug={station.slug} />
      ) : (
        <ComingSoon text="Er is nog geen station geconfigureerd." />
      )}
    </Container>
  );
}
