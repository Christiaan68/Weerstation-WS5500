import { AlertTriangle, CheckCircle2, CircleAlert, CircleDashed, Database, Radio } from "lucide-react";
import type { Metadata } from "next";

import { Badge, type BadgeVariant } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Container } from "@/components/layout/container";
import { PageHeader } from "@/components/layout/page-header";
import {
  getDailySummary,
  getDatabaseHealth,
  getEarliestObservationMeasuredAt,
  getProviderState,
  getStation,
  getStorageStats,
  type DatabaseHealth,
  type StorageStats,
} from "@/lib/db/queries";
import type { Station, WeatherProviderState } from "@/lib/db/schema";
import {
  classifyCronHealth,
  CRON_STATUS_BADGE_VARIANT,
  CRON_STATUS_LABEL_NL,
  type CronHealth,
} from "@/lib/weather/cron-health";
import { maskSecretValue } from "@/lib/weather/redact";
import { DEFAULT_POLL_INTERVAL_SECONDS } from "@/lib/weather/summary-service";
import { estimateStorageGrowth } from "@/lib/weather/storage-estimate";
import { formatLocalDateTime, todayLocalDateKey } from "@/lib/weather/timezone";

export const metadata: Metadata = {
  title: "Station",
  description: "Gegevens over het gekoppelde weerstation.",
};

// Altijd actuele stationgegevens tonen, nooit statisch cachen.
export const dynamic = "force-dynamic";

interface SystemStatusRow {
  label: string;
  value: string;
  variant: BadgeVariant;
  icon: typeof CheckCircle2;
}

/**
 * Compact "werkt alles?"-overzicht — stond voorheen op de (inmiddels
 * vervallen) homepage, maar hoort inhoudelijk beter hier: in één oogopslag
 * zien of de applicatie draait, de database bereikbaar is, en het
 * weerstation daadwerkelijk data aanlevert (zelfde cron-classificatie als
 * de kaart "Ingestie & datakwaliteit" hieronder).
 */
function SystemStatus({
  databaseHealth,
  cronHealth,
}: {
  databaseHealth: DatabaseHealth;
  cronHealth: CronHealth | null;
}) {
  const databaseRow: SystemStatusRow =
    databaseHealth.status === "ok"
      ? {
          label: "Database",
          value: `Verbonden (${databaseHealth.latencyMs} ms)`,
          variant: "success",
          icon: CheckCircle2,
        }
      : { label: "Database", value: "Niet bereikbaar", variant: "danger", icon: CircleAlert };

  const stationRow: SystemStatusRow = cronHealth
    ? {
        label: "Weerstation",
        value: CRON_STATUS_LABEL_NL[cronHealth.status],
        variant: CRON_STATUS_BADGE_VARIANT[cronHealth.status],
        icon: CheckCircle2,
      }
    : { label: "Weerstation", value: "Nog niet gekoppeld", variant: "default", icon: CircleDashed };

  const rows: SystemStatusRow[] = [
    { label: "Applicatie", value: "Actief", variant: "success", icon: CheckCircle2 },
    databaseRow,
    stationRow,
  ];

  return (
    <Card>
      <CardContent className="grid gap-4 pt-5 sm:grid-cols-3">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center gap-3">
            <row.icon className="text-muted-foreground h-5 w-5 shrink-0" aria-hidden="true" />
            <div className="flex min-w-0 flex-col">
              <span className="text-muted-foreground text-xs font-medium">{row.label}</span>
              <Badge variant={row.variant} className="mt-1 w-fit">
                {row.value}
              </Badge>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function IngestionHealth({
  providerState,
  coveragePct,
  health,
  pollIntervalSeconds,
}: {
  providerState: WeatherProviderState | undefined;
  coveragePct: number | null;
  health: CronHealth;
  pollIntervalSeconds: number;
}) {
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
            <Badge variant={CRON_STATUS_BADGE_VARIANT[health.status]}>
              {CRON_STATUS_LABEL_NL[health.status]}
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
          value={`${pollIntervalSeconds / 60} minuten`}
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

function StationDetails({
  station,
  firstObservationAt,
}: {
  station: Station;
  firstObservationAt: Date | undefined;
}) {
  // LET OP: `station.createdAt` is bewust NIET de bron voor "sinds wanneer
  // meten we" — dat databaserecord is ooit aangeraakt door de demo-data-
  // opruiming (zie deel-a-eindrapport.md) en toont sindsdien de datum van
  // die opruiming, niet de echte installatiedatum. In plaats daarvan tonen
  // we het tijdstip van de vroegst opgeslagen ECHTE meting — een feit dat we
  // rechtstreeks uit `weather_observations` kunnen aflezen, nooit verzonnen.
  const firstMeasurement = firstObservationAt
    ? new Intl.DateTimeFormat("nl-NL", {
        dateStyle: "long",
        timeStyle: "short",
        timeZone: station.timezone,
      }).format(firstObservationAt)
    : "Nog geen metingen ontvangen";

  const coordinates =
    station.latitude && station.longitude
      ? `${station.latitude}, ${station.longitude}`
      : "Niet ingesteld";

  return (
    <Card>
      <CardContent className="grid gap-5 pt-5 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Naam" value={station.displayName} />
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
        <Field label="Eerste opgeslagen meting" value={firstMeasurement} />
      </CardContent>
    </Card>
  );
}

const MB_FORMAT = new Intl.NumberFormat("nl-NL", { maximumFractionDigits: 1 });
const COUNT_FORMAT = new Intl.NumberFormat("nl-NL");

function formatMb(mb: number): string {
  if (mb >= 1024) return `${MB_FORMAT.format(mb / 1024)} GB`;
  return `${MB_FORMAT.format(mb)} MB`;
}

/**
 * "Dataopslag"-blok (Fase 4, §40-41): rijtellingen over alle 6
 * opslagtabellen, de echte meetperiode, en een expliciet als schatting
 * gelabelde groeiprojectie (`estimateStorageGrowth()`) — nooit gepresenteerd
 * als exacte voorspelling.
 */
function StorageSection({
  stats,
  pollIntervalSeconds,
}: {
  stats: StorageStats;
  pollIntervalSeconds: number;
}) {
  const daysSinceFirst =
    stats.firstObservationAt && stats.lastObservationAt
      ? Math.max(
          1 / 24,
          (stats.lastObservationAt.getTime() - stats.firstObservationAt.getTime()) /
            (1000 * 60 * 60 * 24),
        )
      : 0;

  const periodLabel =
    stats.firstObservationAt && stats.lastObservationAt
      ? daysSinceFirst < 1
        ? "Minder dan 1 dag"
        : `${COUNT_FORMAT.format(Math.round(daysSinceFirst))} dagen`
      : "Nog geen metingen";

  const growth =
    stats.firstObservationAt && stats.observationCount > 0
      ? estimateStorageGrowth({
          observationCount: stats.observationCount,
          rawPacketCount: stats.rawPacketCount,
          sensorMeasurementCount: stats.sensorMeasurementCount,
          daysSinceFirstObservation: daysSinceFirst,
          pollIntervalSeconds,
        })
      : null;

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle>Dataopslag</CardTitle>
        <Database className="text-muted-foreground h-4 w-4" aria-hidden="true" />
      </CardHeader>
      <CardContent className="flex flex-col gap-5 pt-1">
        <div className="grid gap-5 sm:grid-cols-3 lg:grid-cols-6">
          <Field label="Metingen" value={COUNT_FORMAT.format(stats.observationCount)} />
          <Field label="Ruwe pakketten" value={COUNT_FORMAT.format(stats.rawPacketCount)} />
          <Field
            label="Sensor-metingen"
            value={COUNT_FORMAT.format(stats.sensorMeasurementCount)}
          />
          <Field label="Dagsamenvattingen" value={COUNT_FORMAT.format(stats.dailySummaryCount)} />
          <Field
            label="Maandsamenvattingen"
            value={COUNT_FORMAT.format(stats.monthlySummaryCount)}
          />
          <Field
            label="Jaarsamenvattingen"
            value={COUNT_FORMAT.format(stats.yearlySummaryCount)}
          />
        </div>
        <div className="grid gap-5 sm:grid-cols-3">
          <Field
            label="Eerste meting"
            value={
              stats.firstObservationAt
                ? formatLocalDateTime(stats.firstObservationAt)
                : "Nog geen metingen"
            }
          />
          <Field
            label="Laatste meting"
            value={
              stats.lastObservationAt
                ? formatLocalDateTime(stats.lastObservationAt)
                : "Nog geen metingen"
            }
          />
          <Field label="Totale meetperiode" value={periodLabel} />
        </div>

        {growth && (
          <div className="border-border/60 flex flex-col gap-2 border-t pt-4">
            <p className="text-muted-foreground text-xs font-medium">
              Geschatte databasegroei (ruwe schatting op basis van het huidige meetritme
              van ~{MB_FORMAT.format(growth.observationsPerDay)} metingen/dag
              {growth.usedFallbackRate && " — nog te weinig historie, theoretisch pollritme gebruikt"}
              )
            </p>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Over 1 jaar" value={formatMb(growth.totalProjectedMb.oneYear)} />
              <Field label="Over 5 jaar" value={formatMb(growth.totalProjectedMb.fiveYears)} />
              <Field label="Over 10 jaar" value={formatMb(growth.totalProjectedMb.tenYears)} />
            </div>
          </div>
        )}

        <p className="text-muted-foreground text-xs">
          Historische data wordt bewaard zonder automatische verwijdering (geen
          retentiebeleid). Zie docs/BACKUP_AND_EXPORT.md voor exporteren en back-uppen.
        </p>
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

export default async function StationPage({
  searchParams,
}: {
  searchParams: Promise<{ station?: string }>;
}) {
  const { station: stationParam } = await searchParams;

  let station: Station | undefined;
  let loadError = false;
  let providerState: WeatherProviderState | undefined;
  let coveragePct: number | null = null;
  let firstObservationAt: Date | undefined;
  let storageStats: StorageStats | undefined;

  // Onafhankelijk van het station-record ophalen: ook als het station zelf
  // niet geladen kan worden, willen we nog steeds weten of de database op
  // zich bereikbaar is (zelfde ping als /api/health).
  const databaseHealth = await getDatabaseHealth();

  try {
    station = await getStation(stationParam);
    if (station) {
      // Fase 5: "vandaag" en het pollinterval zijn die VAN DIT station.
      const [state, dailySummary, earliest, storage] = await Promise.all([
        getProviderState(station.id, "ecowitt_cloud"),
        getDailySummary(station.id, todayLocalDateKey(station.timezone)),
        getEarliestObservationMeasuredAt(station.id),
        getStorageStats(station.id),
      ]);
      providerState = state;
      coveragePct =
        dailySummary?.coveragePct === undefined || dailySummary?.coveragePct === null
          ? null
          : Number(dailySummary.coveragePct);
      firstObservationAt = earliest;
      storageStats = storage;
    }
  } catch {
    loadError = true;
  }

  const pollIntervalSeconds = station?.expectedUploadIntervalSeconds ?? DEFAULT_POLL_INTERVAL_SECONDS;

  const cronHealth = station
    ? classifyCronHealth(
        {
          lastPolledAt: providerState?.lastPolledAt ?? null,
          lastSuccessAt: providerState?.lastSuccessAt ?? null,
          lastErrorAt: providerState?.lastErrorAt ?? null,
        },
        pollIntervalSeconds,
      )
    : null;

  return (
    <Container className="flex flex-1 flex-col gap-6 py-10">
      <PageHeader
        title="Station"
        description="Gegevens over het gekoppelde weerstation en de actuele status van de dataontvangst."
      />
      <SystemStatus databaseHealth={databaseHealth} cronHealth={cronHealth} />
      {loadError ? (
        <NoStation message="De database is momenteel niet bereikbaar. Controleer de databaseverbinding (zie /api/health) en probeer het opnieuw." />
      ) : station ? (
        <>
          <StationDetails station={station} firstObservationAt={firstObservationAt} />
          <IngestionHealth
            providerState={providerState}
            coveragePct={coveragePct}
            health={cronHealth!}
            pollIntervalSeconds={pollIntervalSeconds}
          />
          {storageStats && (
            <StorageSection
              stats={storageStats}
              pollIntervalSeconds={pollIntervalSeconds}
            />
          )}
        </>
      ) : (
        <NoStation message="Er is nog geen station aangemaakt. Draai het seed-script (npm run db:seed) om het demo-station 'Mijn Alecto WS5500' aan te maken." />
      )}
    </Container>
  );
}
