/**
 * `pollAllActiveEcowittStations()` (Fase 5, §11-13/§62-66) — de multi-
 * station-vervanger van de oude single-station Ecowitt Cloud-cron.
 * Toetst specifiek de eisen uit de Fase 5-opdracht:
 *  - 1 station / 2 actieve stations
 *  - een niet-Ecowitt of MAC-loos station wordt overgeslagen (nooit gepolld)
 *  - 1 gelukte + 1 mislukte poll — FOUTISOLATIE: station A's succes wordt
 *    nooit beïnvloed door station B's mislukking (of andersom)
 *  - duplicaat/geen-nieuwe-data telt apart, niet als "mislukt"
 *  - een onverwachte exception (bv. een netwerkfout die niet als
 *    `{ok:false}` maar als een gegooide fout terugkomt) van vroege station
 *    laat latere stations nog steeds gewoon slagen
 *
 * De database (`@/lib/db/queries`) en de ingestie-pijplijn
 * (`@/lib/weather/ingest-pipeline`) worden gemockt; alleen
 * `EcowittCloudProvider.fetchCurrent()` wordt per test gestubd via
 * `vi.spyOn` op het prototype, zodat de eigenlijke orchestratielogica
 * (foutisolatie, begrensde gelijktijdigheid, statustelling) ONGEMOCKT blijft
 * getest.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/queries", () => ({
  getStations: vi.fn(),
  upsertProviderState: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/weather/ingest-pipeline", () => ({
  ingestWeatherPayload: vi.fn(),
}));

const queries = await import("@/lib/db/queries");
const { ingestWeatherPayload } = await import("@/lib/weather/ingest-pipeline");
const { EcowittCloudProvider, pollAllActiveEcowittStations } = await import(
  "@/lib/weather/providers/ecowitt-cloud"
);
const { getStations, upsertProviderState } = queries;

import type { Station } from "@/lib/db/schema";

function makeStation(overrides: Partial<Station>): Station {
  return {
    id: 1,
    displayName: "Station",
    slug: "station",
    manufacturer: "Ecowitt",
    model: "WS90",
    provider: "ecowitt_cloud",
    stationIdentifier: "ID0001",
    macAddress: "AA:BB:CC:DD:EE:01",
    ecowittApplicationKey: null,
    ecowittApiKey: null,
    firmwareVersion: null,
    timezone: "Europe/Amsterdam",
    locationDescription: null,
    latitude: null,
    longitude: null,
    elevationM: null,
    expectedUploadIntervalSeconds: 300,
    isActive: true,
    isDefault: false,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

const STATION_A = makeStation({
  id: 1,
  displayName: "Achtertuin",
  slug: "achtertuin",
  macAddress: "AA:BB:CC:DD:EE:01",
});
const STATION_B = makeStation({
  id: 2,
  displayName: "Vakantiehuis",
  slug: "vakantiehuis",
  macAddress: "AA:BB:CC:DD:EE:02",
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(upsertProviderState).mockResolvedValue(undefined);
});

describe("pollAllActiveEcowittStations", () => {
  it("bevraagt exact 1 station wanneer er maar 1 actief Ecowitt-station is", async () => {
    vi.mocked(getStations).mockResolvedValue([STATION_A]);
    const spy = vi
      .spyOn(EcowittCloudProvider.prototype, "fetchCurrent")
      .mockResolvedValue({ ok: true, rawPayload: { mac: STATION_A.macAddress! } });
    vi.mocked(ingestWeatherPayload).mockResolvedValue({
      rawPacketId: 1,
      status: "normalized",
      stationMatched: true,
      warnings: [],
      message: "Meting opgeslagen (#1).",
    });

    const summary = await pollAllActiveEcowittStations();

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(STATION_A.macAddress, undefined, undefined);
    expect(summary.activeStationCount).toBe(1);
    expect(summary.succeeded).toBe(1);
    expect(summary.failed).toBe(0);
    expect(summary.results[0]).toMatchObject({
      stationId: STATION_A.id,
      slug: STATION_A.slug,
      status: "success",
    });
  });

  it("bevraagt beide stations bij 2 actieve Ecowitt-stations, elk met zijn EIGEN mac-adres", async () => {
    vi.mocked(getStations).mockResolvedValue([STATION_A, STATION_B]);
    const spy = vi
      .spyOn(EcowittCloudProvider.prototype, "fetchCurrent")
      .mockImplementation(async (mac) => ({ ok: true, rawPayload: { mac: mac ?? "onbekend" } }));
    vi.mocked(ingestWeatherPayload).mockResolvedValue({
      rawPacketId: 1,
      status: "normalized",
      stationMatched: true,
      warnings: [],
      message: "ok",
    });

    const summary = await pollAllActiveEcowittStations();

    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy.mock.calls.map((call) => call[0]).sort()).toEqual(
      [STATION_A.macAddress, STATION_B.macAddress].sort(),
    );
    expect(summary.activeStationCount).toBe(2);
    expect(summary.succeeded).toBe(2);
  });

  it("slaat een station zonder mac-adres of met een andere provider stilzwijgend over (geen fout)", async () => {
    const noMacStation = makeStation({ id: 3, slug: "geen-mac", macAddress: null });
    const otherProviderStation = makeStation({
      id: 4,
      slug: "andere-bron",
      provider: "manual",
      macAddress: "AA:BB:CC:DD:EE:04",
    });
    vi.mocked(getStations).mockResolvedValue([STATION_A, noMacStation, otherProviderStation]);
    const spy = vi
      .spyOn(EcowittCloudProvider.prototype, "fetchCurrent")
      .mockResolvedValue({ ok: true, rawPayload: { mac: STATION_A.macAddress! } });
    vi.mocked(ingestWeatherPayload).mockResolvedValue({
      rawPacketId: 1,
      status: "normalized",
      stationMatched: true,
      warnings: [],
      message: "ok",
    });

    const summary = await pollAllActiveEcowittStations();

    expect(summary.activeStationCount).toBe(1);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(STATION_A.macAddress, undefined, undefined);
  });

  it("FOUTISOLATIE: station B's mislukte poll beïnvloedt station A's geslaagde poll niet (of andersom)", async () => {
    vi.mocked(getStations).mockResolvedValue([STATION_A, STATION_B]);
    vi.spyOn(EcowittCloudProvider.prototype, "fetchCurrent").mockImplementation(async (mac) => {
      if (mac === STATION_A.macAddress) {
        return { ok: true, rawPayload: { mac } };
      }
      return { ok: false, error: "Ecowitt Cloud API gaf HTTP 500 terug" };
    });
    vi.mocked(ingestWeatherPayload).mockResolvedValue({
      rawPacketId: 1,
      status: "normalized",
      stationMatched: true,
      warnings: [],
      message: "ok",
    });

    const summary = await pollAllActiveEcowittStations();

    expect(summary.succeeded).toBe(1);
    expect(summary.failed).toBe(1);
    const resultA = summary.results.find((r) => r.stationId === STATION_A.id);
    const resultB = summary.results.find((r) => r.stationId === STATION_B.id);
    expect(resultA?.status).toBe("success");
    expect(resultB?.status).toBe("failed");
    // Beide providerstatussen zijn onafhankelijk bijgewerkt.
    expect(upsertProviderState).toHaveBeenCalledWith(
      STATION_A.id,
      "ecowitt_cloud",
      expect.objectContaining({ lastSuccessAt: expect.any(Date) }),
    );
    expect(upsertProviderState).toHaveBeenCalledWith(
      STATION_B.id,
      "ecowitt_cloud",
      expect.objectContaining({ lastErrorAt: expect.any(Date) }),
    );
  });

  it("een duplicaat/geen-nieuwe-data telt als 'no_new_data', niet als 'failed'", async () => {
    vi.mocked(getStations).mockResolvedValue([STATION_A]);
    vi.spyOn(EcowittCloudProvider.prototype, "fetchCurrent").mockResolvedValue({
      ok: true,
      rawPayload: { mac: STATION_A.macAddress! },
    });
    vi.mocked(ingestWeatherPayload).mockResolvedValue({
      rawPacketId: 1,
      status: "duplicate",
      stationMatched: true,
      warnings: [],
      message: "Identieke payload al eerder ontvangen.",
    });

    const summary = await pollAllActiveEcowittStations();

    expect(summary.succeeded).toBe(0);
    expect(summary.failed).toBe(0);
    expect(summary.noNewData).toBe(1);
    expect(summary.results[0]?.status).toBe("no_new_data");
  });

  it("EXCEPTION-ISOLATIE: een onverwachte gegooide fout bij station A laat station B nog steeds slagen", async () => {
    vi.mocked(getStations).mockResolvedValue([STATION_A, STATION_B]);
    vi.spyOn(EcowittCloudProvider.prototype, "fetchCurrent").mockImplementation(async (mac) => {
      if (mac === STATION_A.macAddress) {
        throw new Error("onverwachte netwerkfout (bv. DNS-storing)");
      }
      return { ok: true, rawPayload: { mac } };
    });
    vi.mocked(ingestWeatherPayload).mockResolvedValue({
      rawPacketId: 2,
      status: "normalized",
      stationMatched: true,
      warnings: [],
      message: "ok",
    });

    const summary = await pollAllActiveEcowittStations();

    expect(summary.failed).toBe(1);
    expect(summary.succeeded).toBe(1);
    const resultA = summary.results.find((r) => r.stationId === STATION_A.id);
    const resultB = summary.results.find((r) => r.stationId === STATION_B.id);
    expect(resultA?.status).toBe("failed");
    expect(resultA?.message).toContain("onverwachte netwerkfout");
    expect(resultB?.status).toBe("success");
  });

  it("geeft nooit geheimen (Ecowitt-sleutels) door in het resultaat", async () => {
    vi.mocked(getStations).mockResolvedValue([STATION_A]);
    vi.spyOn(EcowittCloudProvider.prototype, "fetchCurrent").mockResolvedValue({
      ok: true,
      rawPayload: { mac: STATION_A.macAddress! },
    });
    vi.mocked(ingestWeatherPayload).mockResolvedValue({
      rawPacketId: 1,
      status: "normalized",
      stationMatched: true,
      warnings: [],
      message: "ok",
    });

    const summary = await pollAllActiveEcowittStations();
    const serialized = JSON.stringify(summary);

    expect(serialized).not.toMatch(/application_key|api_key/i);
  });
});
