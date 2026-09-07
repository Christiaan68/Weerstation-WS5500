import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { Badge } from "@/components/ui/badge";
import type { BadgeVariant } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Container } from "@/components/layout/container";
import { PageHeader } from "@/components/layout/page-header";
import {
  getObservationByRawPacketId,
  getRawPacketById,
  getSensorMeasurementsForObservation,
  getStation,
  getStationById,
} from "@/lib/db/queries";
import { getServerEnv } from "@/lib/env";
import type { RawWeatherPacketProcessingStatus } from "@/lib/db/schema";
import { sanitizePayloadForDisplay } from "@/lib/weather/redact";
import { secretMatches } from "@/lib/weather/secret";

export const metadata: Metadata = {
  title: "Pakketdetail",
  description: "Detailweergave van één ruw ingestiepakket (alleen met sleutel).",
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

export default async function PacketDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ key?: string }>;
}) {
  const [{ id }, { key }] = await Promise.all([params, searchParams]);
  const { STATION_DIAGNOSTICS_SECRET } = getServerEnv();

  if (!secretMatches(key, STATION_DIAGNOSTICS_SECRET)) {
    notFound();
  }

  const packetId = Number(id);
  if (!Number.isInteger(packetId) || packetId <= 0) {
    notFound();
  }

  const packet = await getRawPacketById(packetId);
  if (!packet) {
    notFound();
  }

  // Fase 5: de tijdstippen van dit pakket horen getoond te worden in de
  // tijdzone VAN HET STATION WAARAAN HET PAKKET GEKOPPELD IS — niet per se
  // het momenteel geselecteerde station elders in de UI. Val alleen terug op
  // het standaardstation als het pakket (nog) niet aan een station gekoppeld is.
  const packetStation = packet.stationId
    ? await getStationById(packet.stationId).catch(() => undefined)
    : await getStation().catch(() => undefined);
  const timezone = packetStation?.timezone ?? "Europe/Amsterdam";

  const observation = await getObservationByRawPacketId(packet.id);
  const sensors = observation
    ? await getSensorMeasurementsForObservation(observation.id)
    : [];

  const redactedPayload = sanitizePayloadForDisplay(packet.rawPayload);
  const unknownFields = packet.unknownFields as Record<string, unknown> | null;
  const parseWarnings = packet.parseWarnings as string[] | null;

  return (
    <Container className="flex flex-1 flex-col gap-6 py-10">
      <div>
        <Link
          href={`/station/diagnostics?key=${encodeURIComponent(key ?? "")}`}
          className="text-primary text-sm hover:underline"
        >
          ← Terug naar overzicht
        </Link>
      </div>
      <PageHeader
        title={`Pakket #${packet.id}`}
        description={`Ontvangen op ${formatDateTime(packet.receivedAt, timezone)} via ${packet.source}${
          packet.httpMethod ? ` (${packet.httpMethod})` : ""
        }.`}
        action={
          <Badge variant={STATUS_VARIANT[packet.processingStatus]}>
            {packet.processingStatus}
          </Badge>
        }
      />

      {packet.processingError && (
        <Card>
          <CardHeader>
            <CardTitle>Verwerkingsmelding</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <p className="text-sm">{packet.processingError}</p>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Metadata</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 pt-0 text-sm">
            <p>Station-id: {packet.stationId ?? "onbekend (niet gekoppeld)"}</p>
            <p>Content-type: {packet.contentType ?? "—"}</p>
            <p>Parser-versie: {packet.parserVersion ?? "—"}</p>
            <p>Herkomstadres: {packet.remoteAddress ?? "—"}</p>
            <p>
              Gerapporteerd tijdstip (dateutc):{" "}
              {formatDateTime(packet.remoteTimestamp, timezone)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Parserwaarschuwingen</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-sm">
            {parseWarnings && parseWarnings.length > 0 ? (
              <ul className="list-inside list-disc space-y-1">
                {parseWarnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            ) : (
              <p className="text-muted-foreground">Geen.</p>
            )}
          </CardContent>
        </Card>
      </div>

      {unknownFields && Object.keys(unknownFields).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Onbekende velden</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <p className="text-muted-foreground mb-3 text-xs">
              Deze velden herkende de parser niet. De waarden zijn niet verloren gegaan
              (zie de volledige ruwe payload hieronder) — dit is puur een lijst om
              `src/lib/weather/ecowitt/fields.ts` gericht uit te breiden.
            </p>
            <pre className="bg-muted overflow-x-auto rounded-lg p-4 text-xs">
              {JSON.stringify(sanitizePayloadForDisplay(unknownFields), null, 2)}
            </pre>
          </CardContent>
        </Card>
      )}

      {observation && (
        <Card>
          <CardHeader>
            <CardTitle>Genormaliseerde meting (#{observation.id})</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-border text-muted-foreground border-b text-xs">
                    <th className="py-2 pr-4 font-medium">Veld</th>
                    <th className="py-2 font-medium">Waarde</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(observation)
                    .filter(
                      ([field, value]) =>
                        value !== null &&
                        ![
                          "id",
                          "stationId",
                          "rawPacketId",
                          "createdAt",
                          "qualityFlags",
                        ].includes(field),
                    )
                    .map(([field, value]) => (
                      <tr key={field} className="border-border border-b last:border-0">
                        <td className="py-1.5 pr-4 font-mono text-xs">{field}</td>
                        <td className="py-1.5">
                          {value instanceof Date
                            ? formatDateTime(value, timezone)
                            : String(value)}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
            {Array.isArray(observation.qualityFlags) && (
              <div className="mt-3">
                <p className="text-muted-foreground text-xs font-medium">
                  Kwaliteitsvlaggen
                </p>
                <ul className="mt-1 list-inside list-disc text-xs">
                  {(observation.qualityFlags as string[]).map((flag) => (
                    <li key={flag}>{flag}</li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {sensors.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Sensor-metingen ({sensors.length})</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-border text-muted-foreground border-b text-xs">
                    <th className="py-2 pr-4 font-medium">Type</th>
                    <th className="py-2 pr-4 font-medium">Kanaal</th>
                    <th className="py-2 pr-4 font-medium">Metriek</th>
                    <th className="py-2 font-medium">Waarde</th>
                  </tr>
                </thead>
                <tbody>
                  {sensors.map((sensor) => (
                    <tr key={sensor.id} className="border-border border-b last:border-0">
                      <td className="py-1.5 pr-4">{sensor.sensorType}</td>
                      <td className="py-1.5 pr-4">{sensor.channel ?? "—"}</td>
                      <td className="py-1.5 pr-4 font-mono text-xs">{sensor.metric}</td>
                      <td className="py-1.5">
                        {sensor.valueNumeric ?? sensor.valueText}
                        {sensor.unit ? ` ${sensor.unit}` : ""}
                      </td>
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
          <CardTitle>Ruwe payload (geredigeerd)</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <p className="text-muted-foreground mb-3 text-xs">
            PASSKEY en vergelijkbare velden zijn hierboven verborgen. De volledige,
            ongewijzigde payload staat veilig in de database
            (`raw_weather_packets.raw_payload`).
          </p>
          <pre className="bg-muted overflow-x-auto rounded-lg p-4 text-xs">
            {JSON.stringify(redactedPayload, null, 2)}
          </pre>
        </CardContent>
      </Card>
    </Container>
  );
}
