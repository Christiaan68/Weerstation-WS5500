import type { Metadata } from "next";

import { ComingSoon } from "@/components/dashboard/coming-soon";
import { Container } from "@/components/layout/container";
import { PageHeader } from "@/components/layout/page-header";
import { RecordsExplorer } from "@/components/weather/records-explorer";
import { getStation } from "@/lib/db/queries";

export const metadata: Metadata = {
  title: "Records",
  description: "Records van het weerstation, bv. hoogste temperatuur.",
};

export const dynamic = "force-dynamic";

export default async function RecordsPage() {
  const station = await getStation().catch(() => undefined);

  return (
    <Container className="flex flex-1 flex-col gap-6 py-10">
      <PageHeader
        title="Records"
        description="Hoogste en laagste waarden sinds de start van dit station."
      />
      {station ? (
        <RecordsExplorer stationSlug={station.slug} />
      ) : (
        <ComingSoon text="Er is nog geen station geconfigureerd." />
      )}
    </Container>
  );
}
