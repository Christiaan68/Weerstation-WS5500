/**
 * Ecowitt Cloud API-provider — de praktische hoofdroute voor WS5500-data.
 *
 * WAAROM DEZE PROVIDER BESTAAT (zie docs/WS5500_INGESTION.md voor de volledige
 * onderbouwing, met bronnen): de WS5500's ingebouwde "Customized server"-
 * upload (het rechtstreekse Ecowitt-push-protocol naar
 * `/api/weather/ingest/[secret]`) ondersteunt zelf geen TLS/HTTPS — alleen
 * gewone HTTP. Vercel accepteert uitsluitend HTTPS. Een rechtstreekse
 * WS5500 → Vercel-upload werkt dus in de praktijk niet betrouwbaar, zonder
 * dat daar een lokale altijd-aan-bridge (Raspberry Pi, NAS, ...) voor nodig
 * hoeft te zijn — en dat is voor dit project een harde eis. De Ecowitt Cloud
 * API is daarom de praktische hoofdroute: de WS5500 upload (via gewoon HTTP,
 * lokaal op het eigen netwerk niet relevant) naar Ecowitt's eigen cloud, en
 * deze provider haalt de "huidige stand" van dáár op via een gewone,
 * HTTPS-uitgaande aanroep vanuit Vercel.
 *
 * BIJGEWERKT NA LIVE VERIFICATIE (5 sep 2026, echt WS5500-account,
 * MAC E0:98:06:A3:37:CD): de vorm van de JSON-respons van
 * `GET /api/v3/device/real_time` (de geneste groepen `outdoor`, `indoor`,
 * `pressure`, `wind`, `solar_and_uvi`, `rainfall`, elk met `{time, unit,
 * value}`-bladeren) is nu bevestigd te kloppen met de aannames in
 * `pluck(...)` hieronder. WEL fout gebleken, en hieronder gecorrigeerd: de
 * waarde van `temp_unitid` — 1 betekent °C, 2 betekent °F (dit stond
 * omgedraaid). Zie docs/ECOWITT_FIELDS.md voor de volledige veldenlijst.
 *
 * Deze provider zet de (mogelijk afwijkend genest) Cloud API-respons om naar
 * PRECIES DEZELFDE platte, imperiale veldnamen als het Ecowitt-push-protocol
 * (`tempf`, `windspeedmph`, `baromrelin`, ...) — zodat de bestaande parser
 * (`src/lib/weather/ecowitt/parse.ts`) letterlijk hergebruikt kan worden. Dat
 * is de kern van de eis "gebruik dezelfde normalisatielaag".
 */
import { getStations, upsertProviderState } from "@/lib/db/queries";
import type { Station } from "@/lib/db/schema";
import { getServerEnv } from "@/lib/env";
import { hashPayload } from "@/lib/weather/hash";
import { ingestWeatherPayload } from "@/lib/weather/ingest-pipeline";
import type { ProviderFetchResult, RawPayload, WeatherDataProvider } from "../types";

const ECOWITT_API_BASE = "https://api.ecowitt.net/api/v3/device/real_time";

/** Veilig een geneste waarde uitlezen zonder te crashen op een afwijkende vorm. */
function pluck(source: unknown, path: string[]): unknown {
  let current: unknown = source;
  for (const segment of path) {
    if (current === null || typeof current !== "object") {
      return undefined;
    }
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

/** De meeste Ecowitt Cloud API-leafs zijn `{ time, unit, value }`. */
function pluckValue(source: unknown, path: string[]): string | undefined {
  const leaf = pluck(source, path);
  if (
    leaf !== null &&
    typeof leaf === "object" &&
    "value" in (leaf as Record<string, unknown>)
  ) {
    const value = (leaf as Record<string, unknown>).value;
    return value === null || value === undefined ? undefined : String(value);
  }
  return undefined;
}

function pluckTime(source: unknown, path: string[]): number | undefined {
  const leaf = pluck(source, path);
  if (
    leaf !== null &&
    typeof leaf === "object" &&
    "time" in (leaf as Record<string, unknown>)
  ) {
    const time = (leaf as Record<string, unknown>).time;
    const parsed = Number(time);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

/**
 * Zet de (aangenomen) Cloud API-responsvorm om naar het platte,
 * push-protocol-compatibele formaat. Ontbrekende groepen worden gewoon
 * overgeslagen (geen fout) — de bestaande parser gaat daar al veilig mee om.
 */
function flattenCloudResponse(data: unknown): RawPayload {
  const payload: RawPayload = {};

  const set = (field: string, value: string | undefined) => {
    if (value !== undefined) {
      payload[field] = value;
    }
  };

  set("tempf", pluckValue(data, ["outdoor", "temperature"]));
  set("humidity", pluckValue(data, ["outdoor", "humidity"]));
  set("dewptf", pluckValue(data, ["outdoor", "dew_point"]));
  set("feelslikef", pluckValue(data, ["outdoor", "feels_like"]));
  set("tempinf", pluckValue(data, ["indoor", "temperature"]));
  set("humidityin", pluckValue(data, ["indoor", "humidity"]));
  set("baromrelin", pluckValue(data, ["pressure", "relative"]));
  set("baromabsin", pluckValue(data, ["pressure", "absolute"]));
  set("windspeedmph", pluckValue(data, ["wind", "wind_speed"]));
  set("windgustmph", pluckValue(data, ["wind", "wind_gust"]));
  set("winddir", pluckValue(data, ["wind", "wind_direction"]));
  set("maxdailygust", pluckValue(data, ["wind", "wind_speed_max"]));
  set("solarradiation", pluckValue(data, ["solar_and_uvi", "solar"]));
  set("uv", pluckValue(data, ["solar_and_uvi", "uvi"]));
  set("rainratein", pluckValue(data, ["rainfall", "rate"]));
  set("eventrainin", pluckValue(data, ["rainfall", "event"]));
  set("hourlyrainin", pluckValue(data, ["rainfall", "hourly"]));
  set("dailyrainin", pluckValue(data, ["rainfall", "daily"]));
  set("weeklyrainin", pluckValue(data, ["rainfall", "weekly"]));
  set("monthlyrainin", pluckValue(data, ["rainfall", "monthly"]));
  set("yearlyrainin", pluckValue(data, ["rainfall", "yearly"]));
  set("totalrainin", pluckValue(data, ["rainfall", "total"]));

  // Tijdstip: gebruik de tijd van de buitentemperatuur-meting als referentie
  // (elke leaf heeft in principe zijn eigen `time`; in de praktijk vallen
  // deze bij een WS5500 samen). Unix-epoch in seconden, net als
  // `src/lib/weather/timestamp.ts` al ondersteunt.
  const epochSeconds = pluckTime(data, ["outdoor", "temperature"]);
  if (epochSeconds !== undefined) {
    payload.dateutc = String(epochSeconds);
  }

  return payload;
}

export class EcowittCloudProvider implements WeatherDataProvider {
  readonly name = "ecowitt_cloud";

  /**
   * Haalt de "huidige stand" op voor precies één Ecowitt-apparaat.
   *
   * Fase 5: `deviceMac` is het MAC-adres van het BETREFFENDE station
   * (`stations.mac_address`) — zo bedient één providerinstantie meerdere
   * geregistreerde apparaten onder hetzelfde Ecowitt-account, i.p.v. een
   * losse provider-klasse per station. Zonder `deviceMac` valt dit terug op
   * `ECOWITT_DEVICE_MAC` uit de environment — exact het single-station-
   * gedrag van vóór Fase 5, gebruikt door `pollAllActiveEcowittStations()`
   * nooit, maar behouden voor eventuele losse/handmatige aanroepen.
   *
   * Fase 6: `applicationKey`/`apiKey` zijn EIGEN Ecowitt-sleutels voor dit
   * specifieke station (`stations.ecowitt_application_key`/
   * `ecowitt_api_key`), alleen nodig als dit station bij een ANDER
   * Ecowitt.net-account hoort dan de rest (ontdekt bij een tweede station
   * dat een fout "code 40012: Invalid MAC" gaf — de Ecowitt Cloud API kent
   * een MAC-adres alleen binnen het account waarvan de sleutels gebruikt
   * worden). Ontbreken ze (het gangbare geval), dan valt dit terug op de
   * gedeelde `ECOWITT_APPLICATION_KEY`/`ECOWITT_API_KEY` environment-
   * variabelen — exact het gedrag van vóór Fase 6.
   */
  async fetchCurrent(
    deviceMac?: string,
    applicationKey?: string,
    apiKey?: string,
  ): Promise<ProviderFetchResult> {
    const {
      ECOWITT_APPLICATION_KEY,
      ECOWITT_API_KEY,
      ECOWITT_DEVICE_MAC,
    } = getServerEnv();
    const mac = deviceMac ?? ECOWITT_DEVICE_MAC;
    const resolvedApplicationKey = applicationKey || ECOWITT_APPLICATION_KEY;
    const resolvedApiKey = apiKey || ECOWITT_API_KEY;

    if (!resolvedApplicationKey || !resolvedApiKey || !mac) {
      return {
        ok: false,
        error:
          "Ecowitt Application Key, API Key en/of een MAC-adres zijn niet ingesteld (station-eigen of de gedeelde ECOWITT_APPLICATION_KEY/ECOWITT_API_KEY/ECOWITT_DEVICE_MAC).",
      };
    }

    const url = new URL(ECOWITT_API_BASE);
    url.searchParams.set("application_key", resolvedApplicationKey);
    url.searchParams.set("api_key", resolvedApiKey);
    url.searchParams.set("mac", mac);
    url.searchParams.set("call_back", "all");
    // Imperiale eenheden aanvragen: zo kan de bestaande push-protocolparser
    // (die van imperiale eenheden uitgaat) ongewijzigd hergebruikt worden.
    url.searchParams.set("temp_unitid", "2"); // 2 = °F bij deze API (1 = °C) — GEVERIFIEERD tegen het echte WS5500-account op 2026-09-05 (was aanvankelijk 1, foutief aangenomen als °F; leverde tempf-waarden op die de bestaande Fahrenheit-parser als extreem koud interpreteerde, bv. 19.2 "°F" i.p.v. 19.2 °C)
    url.searchParams.set("pressure_unitid", "4"); // inHg
    url.searchParams.set("wind_speed_unitid", "9"); // mph
    url.searchParams.set("rainfall_unitid", "13"); // inch

    let response: Response;
    try {
      response = await fetch(url.toString(), {
        method: "GET",
        // Nooit cachen: dit is per definitie een "huidige stand"-aanroep.
        cache: "no-store",
        signal: AbortSignal.timeout(10_000),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "netwerkfout";
      return { ok: false, error: `Kon Ecowitt Cloud API niet bereiken: ${message}` };
    }

    if (!response.ok) {
      return { ok: false, error: `Ecowitt Cloud API gaf HTTP ${response.status} terug` };
    }

    let json: unknown;
    try {
      json = await response.json();
    } catch {
      return { ok: false, error: "Ecowitt Cloud API-respons was geen geldige JSON" };
    }

    const code = pluck(json, ["code"]);
    if (typeof code === "number" && code !== 0) {
      const msg = pluck(json, ["msg"]);
      return {
        ok: false,
        error: `Ecowitt Cloud API meldde een fout (code ${code}${msg ? `: ${String(msg)}` : ""})`,
      };
    }

    const data = pluck(json, ["data"]);
    if (!data) {
      return { ok: false, error: "Ecowitt Cloud API-respons bevatte geen 'data'-veld" };
    }

    const rawPayload = flattenCloudResponse(data);
    // Het Ecowitt-account/de PASSKEY van het station zelf staat niet in deze
    // respons — we gebruiken het bevraagde MAC-adres als identifier, zodat
    // de ingestie-pijplijn (`findStationByIdentifier()`, die zowel op
    // `station_identifier` als `mac_address` matcht) altijd het BETREFFENDE
    // station matcht — cruciaal zodra meerdere stations onder hetzelfde
    // Ecowitt-account gepolld worden (zie docs/WS5500_SETUP.md).
    rawPayload.mac = mac;

    if (Object.keys(rawPayload).length <= 1) {
      // Diagnose zonder geheimen of ruwe meetwaarden prijs te geven: alleen
      // welke TOPNIVEAU-groepen de respons daadwerkelijk bevatte (bv.
      // "outdoor", "pressure", ...), niet hun inhoud. Dit onderscheidt drie
      // situaties die alle drie deze foutmelding kunnen geven: (a) het
      // apparaat heeft nog nooit iets naar Ecowitt.net geüpload (`data` is
      // een leeg object), (b) het apparaat rapporteert alléén groepen die
      // deze provider niet kent (afwijkend model/sensoruitrusting), of
      // (c) de groepen kloppen met de aanname maar de geneste vorm zelf
      // (`{time, unit, value}`) wijkt af.
      const presentGroups =
        data !== null && typeof data === "object" ? Object.keys(data as object) : [];
      const groupsHint =
        presentGroups.length > 0
          ? `gevonden topniveau-groepen in de respons: ${presentGroups.join(", ")}`
          : "de respons bevatte een lege data-set — mogelijk heeft dit apparaat nog nooit een meting naar Ecowitt.net geüpload";
      return {
        ok: false,
        error: `Geen bruikbare meetvelden in de Ecowitt Cloud API-respons (${groupsHint}) — controleer de exacte responsvorm (zie ECOWITT_FIELDS.md).`,
      };
    }

    return { ok: true, rawPayload };
  }
}

// ---------------------------------------------------------------------------
// Fase 5, §11-13 / §62-66 — cron voor MEERDERE stations tegelijk
// ---------------------------------------------------------------------------

/** Begrenst hoeveel Ecowitt-apparaten tegelijk bevraagd worden — beschermt
 * tegen het overschrijden van Ecowitt-rate-limits en de Vercel-functietijd
 * (cron blijft één enkele, kortlopende aanroep, ook bij veel stations). */
const MAX_CONCURRENT_POLLS = 3;

export type EcowittPollStationStatus = "success" | "no_new_data" | "failed";

/** Resultaat van één stationpoll — bewust GEEN geheimen (sleutels, ruwe payload). */
export interface EcowittPollStationResult {
  stationId: number;
  slug: string;
  displayName: string;
  status: EcowittPollStationStatus;
  message: string;
}

export interface EcowittPollSummary {
  /** Aantal actieve, aan Ecowitt Cloud gekoppelde stations dat gepolld is. */
  activeStationCount: number;
  succeeded: number;
  failed: number;
  /** Duplicaat (identieke payload als vorige poll) of anderszins geen nieuwe meting. */
  noNewData: number;
  results: EcowittPollStationResult[];
}

/**
 * Bevraagt één Ecowitt-station en verwerkt het resultaat via dezelfde
 * ingestie-pijplijn als een rechtstreekse push. FOUTISOLATIE: elke fout
 * (netwerk, Ecowitt Cloud-foutcode, onverwachte exception) wordt hier
 * afgevangen en als een `"failed"`-resultaat teruggegeven — gooit NOOIT door
 * naar de aanroeper, zodat één mislukt station de poll van de andere
 * stations nooit kan laten mislukken (zie `pollAllActiveEcowittStations()`).
 */
async function pollSingleEcowittStation(
  provider: EcowittCloudProvider,
  station: Pick<
    Station,
    "id" | "slug" | "displayName" | "macAddress" | "ecowittApplicationKey" | "ecowittApiKey"
  >,
): Promise<EcowittPollStationResult> {
  const base = { stationId: station.id, slug: station.slug, displayName: station.displayName };
  const polledAt = new Date();

  try {
    const fetchResult = await provider.fetchCurrent(
      station.macAddress ?? undefined,
      station.ecowittApplicationKey ?? undefined,
      station.ecowittApiKey ?? undefined,
    );

    if (!fetchResult.ok) {
      await upsertProviderState(station.id, provider.name, {
        lastPolledAt: polledAt,
        lastErrorAt: polledAt,
        lastError: fetchResult.error,
      }).catch((error: unknown) => {
        console.error(
          `[ecowitt-cloud] station #${station.id} (${station.slug}): kon providerstatus niet bijwerken:`,
          error,
        );
      });
      return { ...base, status: "failed", message: fetchResult.error };
    }

    const ingestResult = await ingestWeatherPayload({
      rawPayload: fetchResult.rawPayload,
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
      lastPayloadHash: hashPayload(fetchResult.rawPayload),
      lastRawPacketId: ingestResult.rawPacketId,
    });

    if (ingestResult.status === "failed") {
      return { ...base, status: "failed", message: ingestResult.message };
    }
    if (ingestResult.status === "duplicate") {
      return { ...base, status: "no_new_data", message: ingestResult.message };
    }
    // "normalized" of "partial" — beide zijn een geslaagde poll met een
    // nieuwe meting; "partial" wordt al als zodanig gemeld via `message`.
    return { ...base, status: "success", message: ingestResult.message };
  } catch (error) {
    const message = error instanceof Error ? error.message : "onbekende fout";
    console.error(
      `[ecowitt-cloud] station #${station.id} (${station.slug}): onverwachte fout tijdens poll:`,
      message,
    );
    await upsertProviderState(station.id, provider.name, {
      lastPolledAt: polledAt,
      lastErrorAt: polledAt,
      lastError: message,
    }).catch(() => undefined);
    return { ...base, status: "failed", message };
  }
}

/**
 * Bevraagt ALLE actieve, aan Ecowitt Cloud gekoppelde stations — Fase 5's
 * vervanger van de oude single-station cron. Precies ÉÉN publieke functie
 * die de beveiligde cron-route (`/api/weather/providers/ecowitt-cloud/
 * [secret]`) aanroept, zodat er geen aparte cronjob per station nodig is.
 *
 * - FOUTISOLATIE PER STATION: elk station wordt onafhankelijk verwerkt (zie
 *   `pollSingleEcowittStation()`) — station B mislukken laat station A's
 *   resultaat volledig ongemoeid.
 * - BEGRENSDE GELIJKTIJDIGHEID: hooguit `MAX_CONCURRENT_POLLS` stations
 *   tegelijk, via een klein handgeschreven "worker pool"-patroon (geen extra
 *   dependency nodig voor zoiets kleins).
 * - Alleen stations met `provider = "ecowitt_cloud"` ÉN een ingesteld
 *   `mac_address` komen in aanmerking — een station zonder MAC-adres kan
 *   nooit bevraagd worden en wordt stilzwijgend overgeslagen (dat is geen
 *   fout: bv. een net aangemaakt station waarvan de koppeling nog niet is
 *   afgerond).
 */
export async function pollAllActiveEcowittStations(): Promise<EcowittPollSummary> {
  const provider = new EcowittCloudProvider();
  // `getStations()` filtert zonder opties al op `isActive = true`.
  const activeStations = await getStations();
  const pollableStations = activeStations.filter(
    (station) => station.provider === "ecowitt_cloud" && Boolean(station.macAddress),
  );

  const results: EcowittPollStationResult[] = new Array(pollableStations.length);

  let cursor = 0;
  async function worker(): Promise<void> {
    for (;;) {
      const index = cursor++;
      const station = pollableStations[index];
      if (!station) return;
      results[index] = await pollSingleEcowittStation(provider, station);
    }
  }

  const workerCount = Math.min(MAX_CONCURRENT_POLLS, pollableStations.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  return {
    activeStationCount: pollableStations.length,
    succeeded: results.filter((r) => r.status === "success").length,
    failed: results.filter((r) => r.status === "failed").length,
    noNewData: results.filter((r) => r.status === "no_new_data").length,
    results,
  };
}
