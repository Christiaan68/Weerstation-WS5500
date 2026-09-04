import { AlertTriangle } from "lucide-react";
import type { Metadata } from "next";

import { Card, CardContent } from "@/components/ui/card";
import { Container } from "@/components/layout/container";
import { PageHeader } from "@/components/layout/page-header";
import { getStation } from "@/lib/db/queries";
import type { Station } from "@/lib/db/schema";

export const metadata: Metadata = {
  title: "Station",
  description: "Gegevens over het gekoppelde weerstation.",
};

// Altijd actuele stationgegevens tonen, nooit statisch cachen.
export const dynamic = "force-dynamic";

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-muted-foreground text-xs font-medium">{label}</dt>
      <dd className="text-foreground text-sm">{value}</dd>
    </div>
  );
}

function StationDetails({ station }: { station: Station }) {
  const created = new Intl.DateTimeFormat("nl-NL", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: station.timezone,
  }).format(station.createdAt);

  const coordinates =
    station.latitude && station.longitude
      ? `${station.latitude}, ${station.longitude}`
      : "Niet ingesteld";

  return (
    <Card>
      <CardContent className="grid gap-5 pt-5 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Naam" value={station.name} />
        <Field label="Merk / model" value={`${station.manufacturer} ${station.model}`} />
        <Field label="Identifier" value={station.stationIdentifier} />
        <Field label="Tijdzone" value={station.timezone} />
        <Field label="Coördinaten" value={coordinates} />
        <Field
          label="Verwacht upload-interval"
          value={`${station.expectedUploadIntervalSeconds} seconden`}
        />
        <Field label="Status" value={station.isActive ? "Actief" : "Inactief"} />
        <Field label="Aangemaakt op" value={created} />
      </CardContent>
    </Card>
  );
}

function NoStation({ message }: { message: string }) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
        <AlertTriangle className="text-warning h-8 w-8" aria-hidden="true" />
        <p className="text-muted-foreground max-w-md text-sm">{message}</p>
      </CardContent>
    </Card>
  );
}

export default async function StationPage() {
  let station: Station | undefined;
  let loadError = false;

  try {
    station = await getStation();
  } catch {
    loadError = true;
  }

  return (
    <Container className="flex flex-1 flex-col gap-6 py-10">
      <PageHeader
        title="Station"
        description="Gegevens over het gekoppelde weerstation. De daadwerkelijke koppeling met de Alecto WS5500 volgt in een latere fase."
      />
      {loadError ? (
        <NoStation message="De database is momenteel niet bereikbaar. Controleer de databaseverbinding (zie /api/health) en probeer het opnieuw." />
      ) : station ? (
        <StationDetails station={station} />
      ) : (
        <NoStation message="Er is nog geen station aangemaakt. Draai het seed-script (npm run db:seed) om het demo-station 'Mijn Alecto WS5500' aan te maken." />
      )}
    </Container>
  );
}
