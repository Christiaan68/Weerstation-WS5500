/**
 * `EcowittCloudProvider.fetchCurrent()` (Fase 2, uitgebreid in Fase 5/6) —
 * test de ECHTE implementatie (HTTP-aanroep gemockt via `global.fetch`,
 * i.t.t. `tests/weather-ecowitt-cloud-poll.test.ts`, dat `fetchCurrent()`
 * zelf stubt om puur de orchestratielogica van
 * `pollAllActiveEcowittStations()` te toetsen).
 *
 * Dekt met name de Fase 6-toevoegingen:
 *  - eigen `applicationKey`/`apiKey`-parameters vallen terug op de gedeelde
 *    `ECOWITT_APPLICATION_KEY`/`ECOWITT_API_KEY` environment-variabelen als
 *    ze niet zijn meegegeven;
 *  - de nieuwe diagnose ("geen bruikbare meetvelden") toont welke topniveau-
 *    groepen de respons daadwerkelijk bevatte, zodat een afwijkende
 *    responsvorm (ander apparaatmodel, of een apparaat dat nog nooit iets
 *    naar Ecowitt.net geüpload heeft) te onderscheiden is van een normale
 *    fout.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({
  getServerEnv: () => ({
    DATABASE_URL: "mysql://test:test@localhost:3306/test",
    WEATHER_INGEST_SECRET: undefined,
    STATION_DIAGNOSTICS_SECRET: undefined,
    STATION_ADMIN_SECRET: undefined,
    ECOWITT_APPLICATION_KEY: "gedeelde-application-key",
    ECOWITT_API_KEY: "gedeelde-api-key",
    ECOWITT_DEVICE_MAC: undefined,
    NODE_ENV: "test",
  }),
  publicEnv: {
    NEXT_PUBLIC_STATION_NAME: "Alecto WS5500",
    NEXT_PUBLIC_TIMEZONE: "Europe/Amsterdam",
    NEXT_PUBLIC_DEMO_MODE: false,
  },
}));

const { EcowittCloudProvider } = await import("@/lib/weather/providers/ecowitt-cloud");

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => body,
  } as Response;
}

describe("EcowittCloudProvider.fetchCurrent", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("gebruikt de eigen sleutels van het station als die zijn meegegeven, niet de gedeelde", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        code: 0,
        data: { outdoor: { temperature: { time: "1", unit: "°F", value: "68" } } },
      }),
    );

    const provider = new EcowittCloudProvider();
    await provider.fetchCurrent("AA:BB:CC:DD:EE:FF", "eigen-application-key", "eigen-api-key");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const calledUrl = new URL(String(fetchMock.mock.calls[0]![0]));
    expect(calledUrl.searchParams.get("application_key")).toBe("eigen-application-key");
    expect(calledUrl.searchParams.get("api_key")).toBe("eigen-api-key");
  });

  it("valt terug op de gedeelde sleutels als het station geen eigen sleutels heeft", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        code: 0,
        data: { outdoor: { temperature: { time: "1", unit: "°F", value: "68" } } },
      }),
    );

    const provider = new EcowittCloudProvider();
    await provider.fetchCurrent("AA:BB:CC:DD:EE:FF");

    const calledUrl = new URL(String(fetchMock.mock.calls[0]![0]));
    expect(calledUrl.searchParams.get("application_key")).toBe("gedeelde-application-key");
    expect(calledUrl.searchParams.get("api_key")).toBe("gedeelde-api-key");
  });

  it("geeft de Ecowitt-foutcode en -melding door bij een fout zoals 'Invalid MAC'", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ code: 40012, msg: "Invalid MAC" }));

    const provider = new EcowittCloudProvider();
    const result = await provider.fetchCurrent("AA:BB:CC:DD:EE:FF");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("40012");
      expect(result.error).toContain("Invalid MAC");
    }
  });

  it("meldt welke topniveau-groepen gevonden zijn als geen enkele bekend veld oplevert", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        code: 0,
        // Een topniveau-groep die deze provider niet kent (bv. een ander
        // apparaatmodel/sensoruitrusting dan waarvoor `flattenCloudResponse()`
        // is geschreven) — geen van de `pluckValue()`-aanroepen levert iets op.
        data: { onbekende_groep: { iets: { time: "1", unit: "x", value: "1" } } },
      }),
    );

    const provider = new EcowittCloudProvider();
    const result = await provider.fetchCurrent("AA:BB:CC:DD:EE:FF");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("onbekende_groep");
    }
  });

  it("meldt een lege data-set apart (apparaat heeft mogelijk nog nooit geüpload)", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ code: 0, data: {} }));

    const provider = new EcowittCloudProvider();
    const result = await provider.fetchCurrent("AA:BB:CC:DD:EE:FF");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("nog nooit een meting naar Ecowitt.net geüpload");
    }
  });

  it("zet een geldige respons om naar platte, imperiale veldnamen", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        code: 0,
        data: {
          outdoor: {
            temperature: { time: "1757000000", unit: "°F", value: "68.5" },
            humidity: { time: "1757000000", unit: "%", value: "55" },
          },
          wind: { wind_speed: { time: "1757000000", unit: "mph", value: "4.2" } },
        },
      }),
    );

    const provider = new EcowittCloudProvider();
    const result = await provider.fetchCurrent("AA:BB:CC:DD:EE:FF");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.rawPayload.tempf).toBe("68.5");
      expect(result.rawPayload.humidity).toBe("55");
      expect(result.rawPayload.windspeedmph).toBe("4.2");
      expect(result.rawPayload.mac).toBe("AA:BB:CC:DD:EE:FF");
      expect(result.rawPayload.dateutc).toBe("1757000000");
    }
  });

  it("geeft een duidelijke fout als geen sleutel of MAC-adres beschikbaar is", async () => {
    const provider = new EcowittCloudProvider();
    const result = await provider.fetchCurrent(undefined, undefined, undefined);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("MAC-adres");
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
