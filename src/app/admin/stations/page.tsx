import { redirect } from "next/navigation";
import type { Metadata } from "next";

import { Container } from "@/components/layout/container";
import { PageHeader } from "@/components/layout/page-header";
import { hasValidSession } from "@/lib/auth/session-cookie";
import { getStations } from "@/lib/db/queries";
import { getStationCapabilities, type StationCapabilities } from "@/lib/weather/capabilities";

import { StationAdminClient } from "./station-admin-client";

export const metadata: Metadata = {
  title: "Stationbeheer",
  description: "Weerstations toevoegen en beheren.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function AdminStationsPage() {
  // `src/proxy.ts` blokkeert een niet-ingelogd bezoek al vóór deze pagina
  // rendert — deze check is bewust een extra verdedigingslaag (zelfde
  // redenering als voorheen bij de `?key=`-sleutel), niet de enige controle.
  if (!(await hasValidSession())) {
    redirect("/login?next=%2Fadmin%2Fstations");
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
        description="Weerstations toevoegen, bewerken en de standaardweergave instellen."
      />
      <StationAdminClient
        stations={stations}
        capabilitiesByStationId={capabilitiesByStationId}
      />
    </Container>
  );
}
