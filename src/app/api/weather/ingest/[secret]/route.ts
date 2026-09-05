/**
 * Ingestie-endpoint voor het Ecowitt/WS5500-protocol.
 *
 * Ondersteunt zowel:
 * - `POST` + `application/x-www-form-urlencoded` (het "Customized"-protocol
 *   dat de WS5500/WSView Plus gebruikt — zie docs/WS5500_SETUP.md), en
 * - `GET` met query-parameters (de legacy Wunderground-compatibele variant,
 *   die sommige oudere Ecowitt-firmwares/consoles nog aanbieden als optie).
 *
 * Beveiliging: een geheime waarde in het PAD (`WEATHER_INGEST_SECRET`), NOOIT
 * IP-allowlisting als (enige) beveiliging — een WS5500 kan van IP wisselen,
 * en Ecowitt Cloud-verkeer komt sowieso niet van het station zelf. Zie
 * docs/WS5500_INGESTION.md §Beveiliging voor de volledige afweging,
 * inclusief waarom een rechtstreekse HTTPS-upload vanaf het station niet
 * gegarandeerd werkt (het station ondersteunt zelf geen TLS voor de
 * "Customized"-upload) en de Ecowitt Cloud API dus de praktische
 * hoofdroute is.
 *
 * Deze route doet zelf GEEN parsing/interpretatie van de payload — dat is
 * bewust een losse laag (`src/lib/weather/ingest-pipeline.ts`). De route
 * regelt alleen: secret-check, tolerant inlezen van de aanvraag, en een
 * snelle, voor het station veilige HTTP-respons.
 */
import { NextResponse } from "next/server";

import { getServerEnv } from "@/lib/env";
import { ingestWeatherPayload } from "@/lib/weather/ingest-pipeline";
import { sanitizeRawPayload } from "@/lib/weather/redact";
import { MAX_BODY_BYTES, parseIncomingRequest } from "@/lib/weather/request-parsing";
import { secretMatches } from "@/lib/weather/secret";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ secret: string }>;
}

async function handle(request: Request, context: RouteContext): Promise<Response> {
  const { secret } = await context.params;
  const { WEATHER_INGEST_SECRET } = getServerEnv();

  // Geen (geldig) secret geconfigureerd, of het aangeboden secret klopt niet:
  // 404, niet 401/403 — dat bevestigt aan een prober niet eens dát deze
  // route bestaat.
  if (!secretMatches(secret, WEATHER_INGEST_SECRET)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const incoming = await parseIncomingRequest(request);

  if (incoming.tooLarge) {
    console.warn(
      `[weather/ingest] payload groter dan ${MAX_BODY_BYTES} bytes geweigerd (${request.method}).`,
    );
    return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  }

  if (Object.keys(incoming.payload).length === 0) {
    return NextResponse.json({ error: "Empty payload" }, { status: 400 });
  }

  const remoteAddress =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    null;

  try {
    const result = await ingestWeatherPayload({
      rawPayload: incoming.payload,
      rawBodyText: incoming.bodyText,
      contentType: incoming.contentType,
      httpMethod: request.method === "GET" ? "GET" : "POST",
      source: "ecowitt_push",
      remoteAddress,
    });

    // Nooit de (mogelijk PASSKEY-bevattende) ruwe payload loggen — alleen
    // een geredigeerde samenvatting, en alleen bij een kanttekening/fout.
    if (result.status === "failed" || result.status === "partial") {
      console.warn(
        `[weather/ingest] pakket #${result.rawPacketId} status=${result.status}: ${result.message}`,
        sanitizeRawPayload(incoming.payload),
      );
    }

    // Altijd HTTP 200 richting het station bij een succesvol VERWERKTE
    // aanvraag (ook als de uitkomst inhoudelijk "failed"/"duplicate" is) —
    // een non-2xx-status laat sommige Ecowitt-consoles een permanente
    // upload-foutmelding tonen en/of agressief blijven herhalen. De
    // daadwerkelijke uitkomst staat in de JSON-body en (vooral) in
    // `/station/diagnostics`.
    return NextResponse.json(
      {
        ok: result.status === "normalized" || result.status === "partial",
        status: result.status,
        packetId: result.rawPacketId,
      },
      { status: 200 },
    );
  } catch (error) {
    // Een onverwachte fout mag nooit de ruwe payload zelf verliezen; die
    // staat op dit punt al in `raw_weather_packets` (of de fout kwam pas
    // dáárna). We loggen uitsluitend een korte, veilige boodschap.
    const message = error instanceof Error ? error.message : "onbekende fout";
    console.error("[weather/ingest] onverwachte fout tijdens verwerking:", message);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  return handle(request, context);
}

export async function GET(request: Request, context: RouteContext): Promise<Response> {
  return handle(request, context);
}
