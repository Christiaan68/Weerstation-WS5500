/**
 * Technische statusinformatie over de ingestie zelf (niet de weerdata) —
 * gebruikt door de diagnosepagina en geschikt voor een korte handmatige
 * `curl`-controle na de eerste WS5500-upload (zie docs/WS5500_SETUP.md).
 */
import { NextResponse } from "next/server";

import {
  countRawPacketsByStatus,
  getLastPacketReceivedAt,
  getObservationCount,
  getProviderState,
  getRawPacketCount,
  getStation,
} from "@/lib/db/queries";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const slug = new URL(request.url).searchParams.get("slug") ?? undefined;

  try {
    const station = await getStation(slug);

    if (!station) {
      return NextResponse.json(
        { error: "Geen station geconfigureerd" },
        { status: 404, headers: { "Cache-Control": "no-store" } },
      );
    }

    const [
      packetCount,
      packetsByStatus,
      lastPacketAt,
      observationCount,
      ecowittCloudState,
    ] = await Promise.all([
      getRawPacketCount(station.id),
      countRawPacketsByStatus(station.id),
      getLastPacketReceivedAt(station.id),
      getObservationCount(station.id),
      getProviderState(station.id, "ecowitt_cloud"),
    ]);

    return NextResponse.json(
      {
        station: {
          name: station.name,
          slug: station.slug,
          stationIdentifierConfigured: station.stationIdentifier.length > 0,
          expectedUploadIntervalSeconds: station.expectedUploadIntervalSeconds,
          timezone: station.timezone,
        },
        packets: {
          total: packetCount,
          byStatus: packetsByStatus,
          lastReceivedAt: lastPacketAt ? lastPacketAt.toISOString() : null,
        },
        observations: {
          total: observationCount,
        },
        providers: {
          ecowittCloud: ecowittCloudState
            ? {
                lastPolledAt: ecowittCloudState.lastPolledAt?.toISOString() ?? null,
                lastSuccessAt: ecowittCloudState.lastSuccessAt?.toISOString() ?? null,
                lastErrorAt: ecowittCloudState.lastErrorAt?.toISOString() ?? null,
                lastError: ecowittCloudState.lastError,
              }
            : null,
        },
      },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "onbekende fout";
    console.error("[weather/station/status] databasefout:", message);
    return NextResponse.json(
      { error: "Kon stationsstatus niet ophalen" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
