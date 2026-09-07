/**
 * Handmatig (of via een externe scheduler) te triggeren endpoint dat de
 * Ecowitt Cloud API bevraagt voor ALLE actieve, aan Ecowitt Cloud gekoppelde
 * stations (Fase 5, §11-13) en elk resultaat door dezelfde ingestie-pijplijn
 * als de rechtstreekse push stuurt — één cron-aanroep voor alle stations,
 * geen aparte cronjob per station. Zie
 * `pollAllActiveEcowittStations()` in `src/lib/weather/providers/
 * ecowitt-cloud.ts` voor de eigenlijke orchestratie (foutisolatie per
 * station, begrensde gelijktijdigheid).
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
 * De respons bevat uitsluitend station-id/slug/naam, status en een
 * mensleesbare boodschap — NOOIT de Ecowitt-sleutels of een ruwe payload.
 */
import { NextResponse } from "next/server";

import { getServerEnv } from "@/lib/env";
import { pollAllActiveEcowittStations } from "@/lib/weather/providers/ecowitt-cloud";
import { secretMatches } from "@/lib/weather/secret";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ secret: string }>;
}

export async function GET(request: Request, context: RouteContext): Promise<Response> {
  const { secret } = await context.params;
  const { WEATHER_INGEST_SECRET } = getServerEnv();

  if (!secretMatches(secret, WEATHER_INGEST_SECRET)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const summary = await pollAllActiveEcowittStations();

    if (summary.activeStationCount === 0) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Geen actief, aan Ecowitt Cloud gekoppeld station gevonden (met een ingesteld MAC-adres).",
          ...summary,
        },
        { status: 404 },
      );
    }

    return NextResponse.json(
      { ok: summary.failed === 0, ...summary },
      { status: 200 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "onbekende fout";
    console.error("[ecowitt-cloud] onverwachte fout tijdens multi-station poll:", message);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
