import { AlertTriangle } from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { StationAdminClient } from "@/app/admin/stations/station-admin-client";
import { StationTabs } from "@/app/station/station-tabs";
import { Container } from "@/components/layout/container";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { hasValidSession } from "@/lib/auth/session-cookie";
import { getStations } from "@/lib/db/queries";
import { getStationCapabilities } from "@/lib/weather/capabilities";

export const metadata: Metadata = {
  title: "Stations — Beheer",
  description: "Stations toevoegen en bewerken.",
};

// Altijd actuele stationgegevens tonen, nooit statisch cachen.
export const dynamic = "force-dynamic";

/**
 * Tabblad Beheer van de pagina Stations: nieuwe stations toevoegen (met
 * verbindingstest), bestaande bewerken, default instellen en (de)activeren.
 *
 * BEVEILIGING: `src/proxy.ts` blokkeert een niet-ingelogd bezoek al vóór deze
 * pagina rendert en elke Server Action in `src/app/admin/stations/actions.ts`
 * controleert de sessie bovendien zelf. De check hieronder is een extra
 * verdedigingslaag, niet de enige controle.
 */
export default async function StationBeheerPage({
  searchParams,
}: {
  searchParams: Promise<{ station?: string }>;
}) {
  if (!(await hasValidSession())) {
    redirect("/login?next=%2Fstation%2Fbeheer");
  }

  const { station: stationParam } = await searchParams;

  let loadError = false;
  let data: Awaited<ReturnType<typeof loadAdminData>> | undefined;
  try {
    data = await loadAdminData();
  } catch {
    loadError = true;
  }

  return (
    <Container className="flex flex-1 flex-col gap-6 py-10">
      <PageHeader
        title="Stations"
        description="Voeg weerstations toe en beheer hun gegevens, tijdzone en koppeling."
      />
      <StationTabs active="beheer" stationParam={stationParam} />
      {loadError || !data ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <AlertTriangle className="text-warning h-8 w-8" aria-hidden="true" />
            <p className="text-muted-foreground max-w-md text-sm">
              Laden van de stations is mislukt. Controleer de databaseverbinding en
              vernieuw de pagina.
            </p>
          </CardContent>
        </Card>
      ) : (
        <StationAdminClient
          stations={data.stations}
          capabilitiesByStationId={data.capabilitiesByStationId}
        />
      )}
    </Container>
  );
}

/** Alle stations (ook inactieve) plus hun sensorcapabilities. */
async function loadAdminData() {
  const stations = await getStations({ includeInactive: true });
  const entries = await Promise.all(
    stations.map(async (station) => [station.id, await getStationCapabilities(station.id)] as const),
  );
  return { stations, capabilitiesByStationId: Object.fromEntries(entries) };
}
