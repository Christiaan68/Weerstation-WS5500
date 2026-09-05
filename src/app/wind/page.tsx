import type { Metadata } from "next";

import { ComingSoon } from "@/components/dashboard/coming-soon";
import { Container } from "@/components/layout/container";
import { PageHeader } from "@/components/layout/page-header";
import { WindExplorer } from "@/components/weather/wind-explorer";
import { getStation } from "@/lib/db/queries";

export const metadata: Metadata = {
  title: "Wind",
  description: "Windsnelheid, windstoten en windrichting.",
};

export const dynamic = "force-dynamic";

export default async function WindPage() {
  const station = await getStation().catch(() => undefined);

  return (
    <Container className="flex flex-1 flex-col gap-6 py-10">
      <PageHeader
        title="Wind"
        description="Windsnelheid, windstoten en windrichting van het weerstation."
      />
      {station ? (
        <WindExplorer stationSlug={station.slug} />
      ) : (
        <ComingSoon text="Er is nog geen station geconfigureerd." />
      )}
    </Container>
  );
}
