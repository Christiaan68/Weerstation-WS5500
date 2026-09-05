import type { Metadata } from "next";

import { ComingSoon } from "@/components/dashboard/coming-soon";
import { Container } from "@/components/layout/container";
import { PageHeader } from "@/components/layout/page-header";
import { HistoryExplorer } from "@/components/weather/history-explorer";
import { getStation } from "@/lib/db/queries";

export const metadata: Metadata = {
  title: "Historie",
  description: "Historische weergegevens van het weerstation.",
};

export const dynamic = "force-dynamic";

export default async function HistoriePage() {
  const station = await getStation().catch(() => undefined);

  return (
    <Container className="flex flex-1 flex-col gap-6 py-10">
      <PageHeader
        title="Historie"
        description="Blader terug door eerdere metingen van het weerstation, gefilterd op datum."
      />
      {station ? (
        <HistoryExplorer stationSlug={station.slug} />
      ) : (
        <ComingSoon text="Er is nog geen station geconfigureerd." />
      )}
    </Container>
  );
}
