import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { Badge } from "@/components/ui/badge";
import type { BadgeVariant } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Container } from "@/components/layout/container";
import { PageHeader } from "@/components/layout/page-header";
import {
  countRawPacketsByStatus,
  getLastPacketReceivedAt,
  getLatestObservation,
  getObservationCount,
  getProviderState,
  getRawPacketCount,
  getStation,
  listRecentRawPackets,
  listRecentUnmatchedRawPackets,
} from "@/lib/db/queries";
import { getServerEnv } from "@/lib/env";
import type { RawWeatherPacket, RawWeatherPacketProcessingStatus } from "@/lib/db/schema";
import { secretMatches } from "@/lib/weather/secret";

export const metadata: Metadata = {
  title: "Diagnose",
  description: "Technische ingestie-diagnose voor het weerstation (alleen met sleutel).",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const STATUS_VARIANT: Record<RawWeatherPacketProcessingStatus, BadgeVariant> = {
  received: "default",
  normalized: "success",
  partial: "warning",
  failed: "danger",
  duplicate: "default",
};

const STATUS_LABEL: Record<RawWeatherPacketProcessingStatus, string> = {
  received: "Ontvangen",
  normalized: "Genormaliseerd",
  partial: "Deels verwerkt",
  failed: "Mislukt",
  duplicate: "Duplicaat",
};

function formatDateTime(date: Date | null | undefined, timezone: string): string {
  if (!date) {
    return "—";
  }
  return new Intl.DateTimeFormat("nl-NL", {
    dateStyle: "medium",
    timeStyle: "medium",
    timeZone: timezone,
  }).format(date);
}

function PacketRow({
  packet,
  timezone,
  queryKey,
}: {
  packet: RawWeatherPacket;
  timezone: string;
  queryKey: string;
}) {
  return (
    <tr className="border-border border-b last:border-0">
      <td className="py-2 pr-4">
        <Link
          href={`/station/diagnostics/${packet.id}?key=${encodeURIComponent(queryKey)}`}
          className="text-primary hover:underline"
        >
          #{packet.id}
        </Link>
      </td>
      <td className="py-2 pr-4 whitespace-nowrap">
        {formatDateTime(packet.receivedAt, timezone)}
      </td>
      <td className="py-2 pr-4">{packet.source}</td>
      <td className="py-2 pr-4">{packet.httpMethod ?? "—"}</td>
      <td className="py-2">
        <Badge variant={STATUS_VARIANT[packet.processingStatus]}>
          {STATUS_LABEL[packet.processingStatus]}
        </Badge>
      </td>
    </tr>
  );
}

export default async function DiagnosticsPage({
  searchParams,
}: {
  searchParams: Promise<{ key?: string; station?: string }>;
}) {
  const { key, station: stationParam } = await searchParams;
  const { STATION_DIAGNOSTICS_SECRET } = getServerEnv();

  if (!secretMatches(key, STATION_DIAGNOSTICS_SECRET)) {
    notFound();
  }

  const station = await getStation(stationParam).catch(() => undefined);

  if (!station) {
    return (
      <Container className="flex flex-1 flex-col gap-6 py-10">
        <PageHeader
          title="Diagnose"
          description="Er is nog geen station geconfigureerd."
        />
      </Container>
    );
  }

  const [
    packetCount,
    packetsByStatus,
    lastPacketAt,
    observation,
    observationCount,
    ecowittCloudState,
    recentPackets,
    unmatchedPackets,
  ] = await Promise.all([
    getRawPacketCount(station.id),
    countRawPacketsByStatus(station.id),
    getLastPacketReceivedAt(station.id),
    getLatestObservation(station.id),
    getObservationCount(station.id),
    getProviderState(station.id, "ecowitt_cloud"),
    listRecentRawPackets(station.id, 30),
    listRecentUnmatchedRawPackets(10),
  ]);

  return (
    <Container className="flex flex-1 flex-col gap-6 py-10">
      <PageHeader
        title="Ingestie-diagnose"
        description={`Technisch overzicht voor ${station.displayName} — alleen zichtbaar met een geldige sleutel.`}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader>
            <CardTitle>Ruwe pakketten</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <p className="text-foreground text-2xl font-semibold">{packetCount}</p>
            <p className="text-muted-foreground mt-1 text-xs">
              Laatst ontvangen: {formatDateTime(lastPacketAt, station.timezone)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Metingen</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <p className="text-foreground text-2xl font-semibold">{observationCount}</p>
            <p className="text-muted-foreground mt-1 text-xs">
              Laatste meting: {formatDateTime(observation?.measuredAt, station.timezone)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Status van pakketten</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2 pt-0">
            {Object.entries(packetsByStatus).length === 0 ? (
              <p className="text-muted-foreground text-sm">
                Nog geen pakketten ontvangen.
              </p>
            ) : (
              Object.entries(packetsByStatus).map(([status, statusCount]) => (
                <Badge
                  key={status}
                  variant={
                    STATUS_VARIANT[status as RawWeatherPacketProcessingStatus] ??
                    "default"
                  }
                >
                  {STATUS_LABEL[status as RawWeatherPacketProcessingStatus] ?? status}:{" "}
                  {statusCount}
                </Badge>
              ))
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Ecowitt Cloud-provider</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-sm">
            {ecowittCloudState ? (
              <div className="flex flex-col gap-1">
                <p>
                  Laatst bevraagd:{" "}
                  {formatDateTime(ecowittCloudState.lastPolledAt, station.timezone)}
                </p>
                <p>
                  Laatst gelukt:{" "}
                  {formatDateTime(ecowittCloudState.lastSuccessAt, station.timezone)}
                </p>
                {ecowittCloudState.lastError && (
                  <p className="text-danger">
                    Laatste fout: {ecowittCloudState.lastError}
                  </p>
                )}
              </div>
            ) : (
              <p className="text-muted-foreground">Nog niet gebruikt.</p>
            )}
          </CardContent>
        </Card>
      </div>

      {unmatchedPackets.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Pakketten met een onbekende station-identifier</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <p className="text-muted-foreground mb-3 text-xs">
              Deze aanvragen hadden een geldig ingestie-secret, maar de identifier
              (PASSKEY/MAC) kwam niet overeen met dit station. Controleer
              docs/WS5500_SETUP.md als dit onverwacht is.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-border text-muted-foreground border-b text-xs">
                    <th className="py-2 pr-4 font-medium">#</th>
                    <th className="py-2 pr-4 font-medium">Ontvangen</th>
                    <th className="py-2 pr-4 font-medium">Bron</th>
                    <th className="py-2 font-medium">Methode</th>
                  </tr>
                </thead>
                <tbody>
                  {unmatchedPackets.map((packet) => (
                    <tr key={packet.id} className="border-border border-b last:border-0">
                      <td className="py-2 pr-4">
                        <Link
                          href={`/station/diagnostics/${packet.id}?key=${encodeURIComponent(key ?? "")}`}
                          className="text-primary hover:underline"
                        >
                          #{packet.id}
                        </Link>
                      </td>
                      <td className="py-2 pr-4 whitespace-nowrap">
                        {formatDateTime(packet.receivedAt, station.timezone)}
                      </td>
                      <td className="py-2 pr-4">{packet.source}</td>
                      <td className="py-2">{packet.httpMethod ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Recente pakketten</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {recentPackets.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Nog geen pakketten ontvangen. Zie docs/WS5500_SETUP.md om de eerste
              testpayload te versturen.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-border text-muted-foreground border-b text-xs">
                    <th className="py-2 pr-4 font-medium">#</th>
                    <th className="py-2 pr-4 font-medium">Ontvangen</th>
                    <th className="py-2 pr-4 font-medium">Bron</th>
                    <th className="py-2 pr-4 font-medium">Methode</th>
                    <th className="py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {recentPackets.map((packet) => (
                    <PacketRow
                      key={packet.id}
                      packet={packet}
                      timezone={station.timezone}
                      queryKey={key ?? ""}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </Container>
  );
}
