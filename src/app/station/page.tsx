import { AlertTriangle, Radio } from "lucide-react";
import type { Metadata } from "next";

import { Badge } from "@/components/ui/badge";
import type { BadgeVariant } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Container } from "@/components/layout/container";
import { PageHeader } from "@/components/layout/page-header";
import { getDailySummary, getProviderState, getStation } from "@/lib/db/queries";
import type { Station, WeatherProviderState } from "@/lib/db/schema";
import { classifyCronHealth, type CronHealthStatus } from "@/lib/weather/cron-health";
import { maskSecretValue } from "@/lib/weather/redact";
import { DEFAULT_POLL_INTERVAL_SECONDS } from "@/lib/weather/summary-service";
import { formatLocalDateTime, todayLocalDateKey } from "@/lib/weather/timezone";

export const metadata: Metadata = {
  title: "Station",
  description: "Gegevens over het gekoppelde weerstation.",
};

// Altijd actuele stationgegevens tonen, nooit statisch cachen.
export const dynamic = "force-dynamic";

const CRON_STATUS_LABEL: Record<CronHealthStatus, string> = {
  actief: "Actief",
  vertraagd: "Vertraagd",
  offline: "Offline",
  onbekend: "Onbekend",
};

const CRON_STATUS_VARIANT: Record<CronHealthStatus, BadgeVariant> = {
  actief: "success",
  vertraagd: "warning",
  offline: "danger",
  onbekend: "default",
};

function IngestionHealth({
  providerState,
  coveragePct,
}: {
  providerState: WeatherProviderState | undefined;
  coveragePct: number | null;
}) {
  const health = classifyCronHealth(
    {
      lastPolledAt: providerState?.lastPolledAt ?? null,
      lastSuccessAt: providerState?.lastSuccessAt ?? null,
      lastErrorAt: providerState?.lastErrorAt ?? null,
    },
    DEFAULT_POLL_INTERVAL_SECONDS,
  );

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle>Ingestie & datakwaliteit</CardTitle>
        <Radio className="text-muted-foreground h-4 w-4" aria-hidden="true" />
      </CardHeader>
      <CardContent className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        <div className="flex flex-col gap-0.5">
          <dt className="text-muted-foreground text-xs font-medium">Cronjob-status</dt>
          <dd>
            <Badge variant={CRON_STATUS_VARIANT[health.status]}>
              {CRON_STATUS_LABEL[health.status]}
            </Badge>
            {health.lastAttemptFailed && (
              <span className="text-danger ml-2 text-xs">laatste poging mislukt</span>
            )}
          </dd>
        </div>
        <Field
          label="Laatste geslaagde ophaling"
          value={
            providerState?.lastSuccessAt
              ? formatLocalDateTime(providerState.lastSuccessAt)
              : "Nog niet gelukt"
          }
        />
        <Field
          label="Pollinterval"
          value={`${DEFAULT_POLL_INTERVAL_SECONDS / 60} minuten`}
        />
        <Field
          label="Dekking vandaag"
          value={coveragePct !== null ? `${coveragePct}%` : "Nog niet berekend"}
        />
        {providerState?.lastError && (
          <div className="flex flex-col gap-0.5 sm:col-span-2 lg:col-span-3">
            <dt className="text-muted-foreground text-xs font-medium">
              Laatste foutmelding
            </dt>
            <dd className="text-danger text-sm break-words">{providerState.lastError}</dd>
          </div>
        )}
        <p className="text-muted-foreground text-xs sm:col-span-2 lg:col-span-3">
          Technische details (ruwe pakketten, parserstatus) staan op de beveiligde
          diagnosepagina — zie docs/AUTOMATIC_INGESTION.md voor de link met sleutel.
        </p>
      </CardContent>
    </Card>
  );
}

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
        {/*
          De identifier (Ecowitt PASSKEY) en het MAC-adres worden bewust
          gemaskeerd: deze pagina is publiek, maar wie deze waarde kent kan
          er — samen met het ingestie-secret — weerdata namens dit station
          mee versturen. Zie src/lib/weather/redact.ts.
        */}
        <Field label="Identifier" value={maskSecretValue(station.stationIdentifier)} />
        {station.macAddress && (
          <Field label="MAC-adres" value={maskSecretValue(station.macAddress)} />
        )}
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
  let providerState: WeatherProviderState | undefined;
  let coveragePct: number | null = null;

  try {
    station = await getStation();
    if (station) {
      const [state, dailySummary] = await Promise.all([
        getProviderState(station.id, "ecowitt_cloud"),
        getDailySummary(station.id, todayLocalDateKey()),
      ]);
      providerState = state;
      coveragePct =
        dailySummary?.coveragePct === undefined || dailySummary?.coveragePct === null
          ? null
          : Number(dailySummary.coveragePct);
    }
  } catch {
    loadError = true;
  }

  return (
    <Container className="flex flex-1 flex-col gap-6 py-10">
      <PageHeader
        title="Station"
        description="Gegevens over het gekoppelde weerstation en de actuele status van de dataontvangst."
      />
      {loadError ? (
        <NoStation message="De database is momenteel niet bereikbaar. Controleer de databaseverbinding (zie /api/health) en probeer het opnieuw." />
      ) : station ? (
        <>
          <StationDetails station={station} />
          <IngestionHealth providerState={providerState} coveragePct={coveragePct} />
        </>
      ) : (
        <NoStation message="Er is nog geen station aangemaakt. Draai het seed-script (npm run db:seed) om het demo-station 'Mijn Alecto WS5500' aan te maken." />
      )}
    </Container>
  );
}
