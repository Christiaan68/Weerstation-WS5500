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
 * ONZEKERHEID DIE EXPLICIET GEDOCUMENTEERD MOET WORDEN (zie ook de opdracht
 * voor Fase 2, "documenteer onzekerheden"): de exacte vorm van de JSON-
 * respons van `GET /api/v3/device/real_time` is hieronder gebaseerd op
 * publiek beschikbare voorbeelden, niet geverifieerd tegen een echt WS5500-
 * account (dat bestaat pas na Fase 2). De keys in `pluck(...)`-aanroepen
 * hieronder kunnen op onderdelen afwijken van wat dit specifieke station
 * daadwerkelijk teruggeeft. Zie docs/ECOWITT_FIELDS.md voor hoe dit te
 * controleren en zo nodig aan te passen zodra er een echt account is.
 *
 * Deze provider zet de (mogelijk afwijkend genest) Cloud API-respons om naar
 * PRECIES DEZELFDE platte, imperiale veldnamen als het Ecowitt-push-protocol
 * (`tempf`, `windspeedmph`, `baromrelin`, ...) — zodat de bestaande parser
 * (`src/lib/weather/ecowitt/parse.ts`) letterlijk hergebruikt kan worden. Dat
 * is de kern van de eis "gebruik dezelfde normalisatielaag".
 */
import { getServerEnv } from "@/lib/env";
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

  async fetchCurrent(): Promise<ProviderFetchResult> {
    const { ECOWITT_APPLICATION_KEY, ECOWITT_API_KEY, ECOWITT_DEVICE_MAC } =
      getServerEnv();

    if (!ECOWITT_APPLICATION_KEY || !ECOWITT_API_KEY || !ECOWITT_DEVICE_MAC) {
      return {
        ok: false,
        error:
          "ECOWITT_APPLICATION_KEY, ECOWITT_API_KEY en/of ECOWITT_DEVICE_MAC zijn niet ingesteld.",
      };
    }

    const url = new URL(ECOWITT_API_BASE);
    url.searchParams.set("application_key", ECOWITT_APPLICATION_KEY);
    url.searchParams.set("api_key", ECOWITT_API_KEY);
    url.searchParams.set("mac", ECOWITT_DEVICE_MAC);
    url.searchParams.set("call_back", "all");
    // Imperiale eenheden aanvragen: zo kan de bestaande push-protocolparser
    // (die van imperiale eenheden uitgaat) ongewijzigd hergebruikt worden.
    url.searchParams.set("temp_unitid", "1"); // 1 = °F bij deze API (zie ECOWITT_FIELDS.md)
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
    // respons — we gebruiken het geconfigureerde MAC-adres als identifier,
    // zodat de ingestie-pijplijn hetzelfde vooraf-geregistreerde station
    // matcht als de rechtstreekse push zou doen (mits `stations
    // .station_identifier` op het MAC-adres gezet is voor deze bron — zie
    // docs/WS5500_SETUP.md).
    rawPayload.mac = ECOWITT_DEVICE_MAC;

    if (Object.keys(rawPayload).length <= 1) {
      return {
        ok: false,
        error:
          "Geen bruikbare meetvelden in de Ecowitt Cloud API-respons — controleer de exacte responsvorm (zie ECOWITT_FIELDS.md).",
      };
    }

    return { ok: true, rawPayload };
  }
}
