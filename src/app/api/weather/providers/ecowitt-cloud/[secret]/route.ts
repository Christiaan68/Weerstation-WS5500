/**
 * Handmatig (of via een externe scheduler) te triggeren endpoint dat één
 * keer de Ecowitt Cloud API bevraagt en het resultaat door dezelfde
 * ingestie-pijplijn als de rechtstreekse push stuurt.
 *
 * Waarom geen ingebouwde scheduling in dit project zelf (zie
 * docs/WS5500_INGESTION.md §Ecowitt Cloud-polling plannen): Vercel's Hobby-
 * plan staat cronjobs toe, maar (op het moment van schrijven) hooguit één
 * keer per dag per cronjob — te weinig voor "actuele" weerdata. De
 * pragmatische opties zijn een gratis externe pinger (bv. cron-job.org) die
 * deze URL elke paar minuten aanroept, of een Vercel-abonnement met kortere
 * cron-intervallen. Beide roepen gewoon deze bestaande, beveiligde HTTP-
 * route aan — er is dus GEEN losse "achtergrondtaak-infrastructuur" nodig,
 * en zeker geen lokale always-on bridge.
 *
 * Beveiliging: zelfde secret-in-pad-aanpak als `/api/weather/ingest/
 * [secret]` (hergebruik van `WEATHER_INGEST_SECRET` is bewust — deze route
 * schrijft immers naar dezelfde tabellen met hetzelfde vertrouwensniveau).
 */
import { NextResponse } from "next/server";

import { getServerEnv } from "@/lib/env";
import { getStation, upsertProviderState } from "@/lib/db/queries";
import { hashPayload } from "@/lib/weather/hash";
import { ingestWeatherPayload } from "@/lib/weather/ingest-pipeline";
import { EcowittCloudProvider } from "@/lib/weather/providers/ecowitt-cloud";
import { secretMatches } from "@/lib/weather/secret";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ secret: string }>;
}

const provider = new EcowittCloudProvider();

export async function GET(request: Request, context: RouteContext): Promise<Response> {
  const { secret } = await context.params;
  const { WEATHER_INGEST_SECRET } = getServerEnv();

  if (!secretMatches(secret, WEATHER_INGEST_SECRET)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const station = await getStation().catch(() => undefined);
  if (!station) {
    return NextResponse.json({ error: "Geen station geconfigureerd" }, { status: 404 });
  }

  const polledAt = new Date();
  const result = await provider.fetchCurrent();

  if (!result.ok) {
    await upsertProviderState(station.id, provider.name, {
      lastPolledAt: polledAt,
      lastErrorAt: polledAt,
      lastError: result.error,
    }).catch((error: unknown) => {
      console.error("[ecowitt-cloud] kon providerstatus niet bijwerken:", error);
    });

    console.warn("[ecowitt-cloud] ophalen mislukt:", result.error);
    return NextResponse.json({ ok: false, error: result.error }, { status: 502 });
  }

  try {
    const ingestResult = await ingestWeatherPayload({
      rawPayload: result.rawPayload,
      rawBodyText: null,
      contentType: "application/json",
      httpMethod: "GET",
      source: "ecowitt_cloud_api",
      remoteAddress: null,
    });

    await upsertProviderState(station.id, provider.name, {
      lastPolledAt: polledAt,
      ...(ingestResult.status === "failed"
        ? { lastErrorAt: polledAt, lastError: ingestResult.message }
        : { lastSuccessAt: polledAt }),
      lastPayloadHash: hashPayload(result.rawPayload),
      lastRawPacketId: ingestResult.rawPacketId,
    });

    return NextResponse.json(
      {
        ok: ingestResult.status !== "failed",
        status: ingestResult.status,
        packetId: ingestResult.rawPacketId,
      },
      { status: 200 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "onbekende fout";
    console.error("[ecowitt-cloud] onverwachte fout tijdens verwerking:", message);
    await upsertProviderState(station.id, provider.name, {
      lastPolledAt: polledAt,
      lastErrorAt: polledAt,
      lastError: message,
    }).catch(() => undefined);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
