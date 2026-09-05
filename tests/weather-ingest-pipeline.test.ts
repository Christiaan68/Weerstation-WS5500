import { beforeEach, describe, expect, it, vi } from "vitest";

// De ingestie-pijplijn praat uitsluitend met `@/lib/db/queries` (nooit
// rechtstreeks met Drizzle/mysql2) — precies om dit soort tests mogelijk te
// maken zonder een echte database. Zie ook src/lib/db/queries.ts.
vi.mock("@/lib/db/queries", () => ({
  findStationByIdentifier: vi.fn(),
  findSoleActiveStation: vi.fn(),
  findDuplicateRawPacket: vi.fn(),
  insertRawPacket: vi.fn(),
  updateRawPacketProcessing: vi.fn(),
  insertObservationWithSensors: vi.fn(),
  getObservationByRawPacketId: vi.fn(),
  getRawPacketById: vi.fn(),
  deleteObservationWithSensors: vi.fn(),
}));

import {
  deleteObservationWithSensors,
  findDuplicateRawPacket,
  findSoleActiveStation,
  findStationByIdentifier,
  getObservationByRawPacketId,
  getRawPacketById,
  insertObservationWithSensors,
  insertRawPacket,
  updateRawPacketProcessing,
} from "@/lib/db/queries";
import type { Station } from "@/lib/db/schema";
import { ingestWeatherPayload, reprocessRawPacket } from "@/lib/weather/ingest-pipeline";

const STATION: Station = {
  id: 1,
  name: "Test Station",
  slug: "test-station",
  manufacturer: "Alecto",
  model: "WS5500",
  stationIdentifier: "TESTPASSKEY0001",
  macAddress: null,
  timezone: "Europe/Amsterdam",
  latitude: null,
  longitude: null,
  elevationM: null,
  expectedUploadIntervalSeconds: 60,
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(insertRawPacket).mockResolvedValue(101);
  vi.mocked(findDuplicateRawPacket).mockResolvedValue(undefined);
  vi.mocked(insertObservationWithSensors).mockResolvedValue(555);
  vi.mocked(updateRawPacketProcessing).mockResolvedValue(undefined);
});

describe("ingestWeatherPayload — stationherkenning", () => {
  it("slaat het ruwe pakket ALTIJD op, ook als de station-identifier onbekend is", async () => {
    vi.mocked(findStationByIdentifier).mockResolvedValue(undefined);
    vi.mocked(findSoleActiveStation).mockResolvedValue(undefined);

    const result = await ingestWeatherPayload({
      rawPayload: { PASSKEY: "ONBEKEND", tempf: "42.0", humidity: "80" },
      rawBodyText: null,
      contentType: null,
      httpMethod: "POST",
      source: "ecowitt_push",
      remoteAddress: null,
    });

    expect(insertRawPacket).toHaveBeenCalledWith(
      expect.objectContaining({ stationId: null, processingStatus: "received" }),
    );
    expect(result.status).toBe("failed");
    expect(result.stationMatched).toBe(false);
    expect(result.rawPacketId).toBe(101);
    // Er wordt NOOIT automatisch een station aangemaakt.
    expect(updateRawPacketProcessing).toHaveBeenCalledWith(
      101,
      expect.objectContaining({ processingStatus: "failed" }),
    );
  });

  it("valt terug op het enige actieve station als de payload geen identifier bevat", async () => {
    vi.mocked(findSoleActiveStation).mockResolvedValue(STATION);

    const result = await ingestWeatherPayload({
      rawPayload: { dateutc: "2026-01-15 10:00:00", tempf: "42.0", humidity: "80" },
      rawBodyText: null,
      contentType: null,
      httpMethod: "POST",
      source: "ecowitt_push",
      remoteAddress: null,
    });

    expect(findSoleActiveStation).toHaveBeenCalled();
    expect(result.stationMatched).toBe(true);
    expect(result.status).toBe("normalized");
  });

  it("matcht op de PASSKEY uit de payload wanneer die aanwezig is", async () => {
    vi.mocked(findStationByIdentifier).mockResolvedValue(STATION);

    await ingestWeatherPayload({
      rawPayload: { PASSKEY: "TESTPASSKEY0001", tempf: "42.0", humidity: "80" },
      rawBodyText: null,
      contentType: null,
      httpMethod: "POST",
      source: "ecowitt_push",
      remoteAddress: null,
    });

    expect(findStationByIdentifier).toHaveBeenCalledWith("TESTPASSKEY0001");
    expect(findSoleActiveStation).not.toHaveBeenCalled();
  });
});

describe("ingestWeatherPayload — deduplicatie", () => {
  it("verwerkt een identieke payload niet opnieuw, maar bewaart het pakket wel als 'duplicate'", async () => {
    vi.mocked(findStationByIdentifier).mockResolvedValue(STATION);
    vi.mocked(findDuplicateRawPacket).mockResolvedValue({ id: 42 });

    const result = await ingestWeatherPayload({
      rawPayload: { PASSKEY: "TESTPASSKEY0001", tempf: "42.0", humidity: "80" },
      rawBodyText: null,
      contentType: null,
      httpMethod: "POST",
      source: "ecowitt_push",
      remoteAddress: null,
    });

    expect(result.status).toBe("duplicate");
    // Het pakket is nog steeds opgeslagen (audit trail) — er wordt alleen
    // geen nieuwe meting van afgeleid.
    expect(insertRawPacket).toHaveBeenCalled();
    expect(insertObservationWithSensors).not.toHaveBeenCalled();
  });
});

describe("ingestWeatherPayload — parsing en normalisatie", () => {
  beforeEach(() => {
    vi.mocked(findStationByIdentifier).mockResolvedValue(STATION);
  });

  it("markeert een volledig geldige payload als 'normalized'", async () => {
    const result = await ingestWeatherPayload({
      rawPayload: {
        PASSKEY: "TESTPASSKEY0001",
        dateutc: "2026-01-15 10:00:00",
        tempf: "42.0",
        humidity: "80",
      },
      rawBodyText: null,
      contentType: "application/x-www-form-urlencoded",
      httpMethod: "POST",
      source: "ecowitt_push",
      remoteAddress: "203.0.113.1",
    });

    expect(result.status).toBe("normalized");
    expect(result.observationId).toBe(555);
    expect(insertObservationWithSensors).toHaveBeenCalled();
  });

  it("markeert een payload zonder enig herkend meetveld als 'failed' — geen meting wordt aangemaakt", async () => {
    const result = await ingestWeatherPayload({
      rawPayload: { PASSKEY: "TESTPASSKEY0001", tempf: "niet-een-getal" },
      rawBodyText: null,
      contentType: null,
      httpMethod: "POST",
      source: "ecowitt_push",
      remoteAddress: null,
    });

    expect(result.status).toBe("failed");
    expect(insertObservationWithSensors).not.toHaveBeenCalled();
  });

  it("KERNVEREISTE: een payload met deels foute velden verliest de goede velden niet ('partial', niet 'failed')", async () => {
    const result = await ingestWeatherPayload({
      rawPayload: {
        PASSKEY: "TESTPASSKEY0001",
        dateutc: "2026-01-15 10:00:00",
        tempf: "42.0", // goed
        humidity: "80", // goed
        uv: "niet-een-getal", // fout, moet overgeslagen worden
        solarradiation: "999999", // fout (buiten bereik), moet overgeslagen worden
      },
      rawBodyText: null,
      contentType: null,
      httpMethod: "POST",
      source: "ecowitt_push",
      remoteAddress: null,
    });

    // Er wordt gewoon een meting opgeslagen (de goede velden gaan niet verloren)...
    expect(result.status).toBe("partial");
    expect(result.observationId).toBe(555);
    expect(insertObservationWithSensors).toHaveBeenCalled();
    // ...en de kanttekeningen zijn zichtbaar voor diagnose, niet stil verdwenen.
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(updateRawPacketProcessing).toHaveBeenCalledWith(
      101,
      expect.objectContaining({ processingStatus: "partial" }),
    );
  });
});

describe("reprocessRawPacket", () => {
  it("verwijdert een eerder afgeleide meting vóór herverwerking (geen dubbele meting)", async () => {
    vi.mocked(getRawPacketById).mockResolvedValue({
      id: 101,
      stationId: 1,
      receivedAt: new Date("2026-01-15T10:30:00.000Z"),
      source: "ecowitt_push",
      httpMethod: "POST",
      remoteTimestamp: null,
      contentType: null,
      rawPayload: {
        PASSKEY: "TESTPASSKEY0001",
        dateutc: "2026-01-15 10:30:00",
        tempf: "42.0",
        humidity: "80",
      },
      rawBodyText: null,
      remoteAddress: null,
      payloadHash: "abc",
      parserVersion: "ecowitt-v0-oud",
      processingStatus: "normalized",
      processingError: null,
      unknownFields: null,
      parseWarnings: null,
      createdAt: new Date(),
    });
    vi.mocked(getObservationByRawPacketId).mockResolvedValue({
      id: 555,
      stationId: 1,
      rawPacketId: 101,
      measuredAt: new Date(),
      receivedAt: new Date(),
      temperatureOutdoorC: "5.0",
      temperatureIndoorC: null,
      humidityOutdoorPct: "80.0",
      humidityIndoorPct: null,
      dewPointC: null,
      feelsLikeC: null,
      windChillC: null,
      heatIndexC: null,
      pressureAbsoluteHpa: null,
      pressureRelativeHpa: null,
      windSpeedKmh: null,
      windGustKmh: null,
      windDirectionDeg: null,
      rainRateMmH: null,
      rainEventMm: null,
      rainHourMm: null,
      rainDayMm: null,
      rainWeekMm: null,
      rainMonthMm: null,
      rainYearMm: null,
      rainTotalMm: null,
      uvIndex: null,
      solarRadiationWm2: null,
      qualityStatus: "ok",
      qualityFlags: null,
      createdAt: new Date(),
    });

    const result = await reprocessRawPacket(101);

    expect(deleteObservationWithSensors).toHaveBeenCalledWith(555);
    expect(insertObservationWithSensors).toHaveBeenCalled();
    expect(result.status).toBe("normalized");
  });

  it("weigert een pakket zonder gekoppeld station te herverwerken", async () => {
    vi.mocked(getRawPacketById).mockResolvedValue({
      id: 102,
      stationId: null,
      receivedAt: new Date(),
      source: "ecowitt_push",
      httpMethod: "POST",
      remoteTimestamp: null,
      contentType: null,
      rawPayload: { tempf: "42.0" },
      rawBodyText: null,
      remoteAddress: null,
      payloadHash: "xyz",
      parserVersion: null,
      processingStatus: "failed",
      processingError: "onbekend station",
      unknownFields: null,
      parseWarnings: null,
      createdAt: new Date(),
    });

    const result = await reprocessRawPacket(102);

    expect(result.stationMatched).toBe(false);
    expect(insertObservationWithSensors).not.toHaveBeenCalled();
  });
});
