import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { Container } from "@/components/layout/container";
import { PageHeader } from "@/components/layout/page-header";
import { getStations } from "@/lib/db/queries";
import { getServerEnv } from "@/lib/env";
import { getStationCapabilities, type StationCapabilities } from "@/lib/weather/capabilities";
import { secretMatches } from "@/lib/weather/secret";

import { StationAdminClient } from "./station-admin-client";

export const metadata: Metadata = {
  title: "Stationbeheer",
  description: "Weerstations toevoegen en beheren (alleen met sleutel).",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function AdminStationsPage({
  searchParams,
}: {
  searchParams: Promise<{ key?: string }>;
}) {
  const { key } = await searchParams;
  const { STATION_ADMIN_SECRET } = getServerEnv();

  if (!secretMatches(key, STATION_ADMIN_SECRET)) {
    notFound();
  }

  const stations = await getStations({ includeInactive: true });
  const capabilitiesEntries = await Promise.all(
    stations.map(async (station) => [station.id, await getStationCapabilities(station.id)] as const),
  );
  const capabilitiesByStationId: Record<number, StationCapabilities> =
    Object.fromEntries(capabilitiesEntries);

  return (
    <Container className="flex flex-1 flex-col gap-6 py-10">
      <PageHeader
        title="Stationbeheer"
        description="Weerstations toevoegen, bewerken en de standaardweergave instellen. Alleen zichtbaar met een geldige sleutel."
      />
      <StationAdminClient
        adminKey={key ?? ""}
        stations={stations}
        capabilitiesByStationId={capabilitiesByStationId}
      />
    </Container>
  );
}
