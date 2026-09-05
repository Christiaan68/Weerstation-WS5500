import type { Metadata } from "next";

import { ComingSoon } from "@/components/dashboard/coming-soon";
import { Container } from "@/components/layout/container";
import { PageHeader } from "@/components/layout/page-header";
import { ChartsExplorer } from "@/components/weather/charts-explorer";
import { getStation } from "@/lib/db/queries";

export const metadata: Metadata = {
  title: "Grafieken",
  description: "Grafieken van temperatuur, luchtdruk, wind en meer.",
};

export const dynamic = "force-dynamic";

export default async function GrafiekenPage() {
  const station = await getStation().catch(() => undefined);

  return (
    <Container className="flex flex-1 flex-col gap-6 py-10">
      <PageHeader
        title="Grafieken"
        description="Verloop van temperatuur, luchtdruk, wind en meer over tijd."
      />
      {station ? (
        <ChartsExplorer stationSlug={station.slug} />
      ) : (
        <ComingSoon text="Er is nog geen station geconfigureerd." />
      )}
    </Container>
  );
}
