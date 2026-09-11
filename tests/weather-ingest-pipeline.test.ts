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
  // Fase 5: `reprocessRawPacket()` haalt het volledige stationrecord op via
  // `getStationById()` (i.p.v. alleen het id door te geven) om de tijdzone/
  // het pollinterval VAN DIT station te gebruiken.
  getStationById: vi.fn(),
}));

// De incrementele samenvatting-herberekening (Fase 3) is best-effort en
// staat in een apart bestand — hier gemockt zodat deze tests puur de
// ingestielogica dekken, niet de samenvattinglogica (die heeft zijn eigen
// tests: tests/weather-summary.test.ts / tests/weather-summary-service.test.ts).
vi.mock("@/lib/weather/summary-service", () => ({
  recomputeSummariesForInstant: vi.fn().mockResolvedValue(undefined),
}));

import {
  deleteObservationWithSensors,
  findDuplicateRawPacket,
  findSoleActiveStation,
  findStationByIdentifier,
  getObservationByRawPacketId,
  getRawPacketById,
  getStationById,
  insertObservationWithSensors,
  insertRawPacket,
  updateRawPacketProcessing,
} from "@/lib/db/queries";
import type { Station } from "@/lib/db/schema";
import { ingestWeatherPayload, reprocessRawPacket } from "@/lib/weather/ingest-pipeline";
import { recomputeSummariesForInstant } from "@/lib/weather/summary-service";

const STATION: Station = {
  id: 1,
  displayName: "Test Station",
  slug: "test-station",
  manufacturer: "Alecto",
  model: "WS5500",
  provider: "ecowitt_cloud",
  stationIdentifier: "TESTPASSKEY0001",
  macAddress: null,
  ecowittApplicationKey: null,
  ecowittApiKey: null,
  firmwareVersion: null,
  timezone: "Europe/Amsterdam",
  locationDescription: null,
  latitude: null,
  longitude: null,
  elevationM: null,
  expectedUploadIntervalSeconds: 60,
  isActive: true,
  isDefault: true,
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

  it("Fase 5 — dedup-isolatie: de duplicaatcontrole gebeurt met het EIGEN station_id, nooit een ander station s'n", async () => {
    // Twee stations die toevallig identieke payloads binnenkrijgen (bv. twee
    // WS90's die tegelijk 20,0°C melden) mogen elkaar NOOIT als duplicaat
    // aanzien — findDuplicateRawPacket() moet voor elk pakket met het
    // stationId van HET GEMATCHTE STATION aangeroepen worden.
    const STATION_B: Station = { ...STATION, id: 2, stationIdentifier: "TESTPASSKEY0002" };
    const identicalPayload = {
      PASSKEY: "TESTPASSKEY0001",
      dateutc: "2026-01-15 10:00:00",
      tempf: "68.0",
      humidity: "50",
    };

    // Bewust EXACT dezelfde payload (dus dezelfde hash) voor beide
    // aanroepen — alleen welk station findStationByIdentifier teruggeeft
    // verschilt, zodat puur het station_id-argument getoetst wordt.
    vi.mocked(findStationByIdentifier).mockResolvedValueOnce(STATION);
    await ingestWeatherPayload({
      rawPayload: identicalPayload,
      rawBodyText: null,
      contentType: null,
      httpMethod: "POST",
      source: "ecowitt_push",
      remoteAddress: null,
    });
    expect(findDuplicateRawPacket).toHaveBeenNthCalledWith(1, STATION.id, expect.any(String));

    vi.mocked(findStationByIdentifier).mockResolvedValueOnce(STATION_B);
    await ingestWeatherPayload({
      rawPayload: identicalPayload,
      rawBodyText: null,
      contentType: null,
      httpMethod: "POST",
      source: "ecowitt_push",
      remoteAddress: null,
    });
    expect(findDuplicateRawPacket).toHaveBeenNthCalledWith(2, STATION_B.id, expect.any(String));

    // Beide aanroepen kregen dezelfde payload-hash (identieke meetwaarden),
    // maar een ANDER station_id — precies de samengestelde (station_id,
    // payload_hash)-uniciteit die migratie 0003 vastlegt.
    const [firstCallStationId, firstHash] = vi.mocked(findDuplicateRawPacket).mock.calls[0]!;
    const [secondCallStationId, secondHash] = vi.mocked(findDuplicateRawPacket).mock.calls[1]!;
    expect(firstHash).toBe(secondHash);
    expect(firstCallStationId).not.toBe(secondCallStationId);
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
    // Fase 3: na een geslaagde meting wordt de dag/maand/jaar-samenvatting
    // (best-effort) herberekend voor het station en het meettijdstip. Fase 5:
    // met het pollinterval EN de tijdzone VAN DIT SPECIFIEKE STATION.
    expect(recomputeSummariesForInstant).toHaveBeenCalledWith(
      STATION.id,
      expect.any(Date),
      STATION.expectedUploadIntervalSeconds,
      STATION.timezone,
    );
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
    // Zonder meting is er ook niets om de samenvatting mee bij te werken.
    expect(recomputeSummariesForInstant).not.toHaveBeenCalled();
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

  it("REGRESSIE (Fase 3): een payload met alleen bekende weerdata + het interne 'mac'-metadataveld (toegevoegd door de Ecowitt Cloud API-provider) wordt 'normalized', niet 'partial'", async () => {
    const result = await ingestWeatherPayload({
      rawPayload: {
        PASSKEY: "TESTPASSKEY0001",
        dateutc: "2026-01-15 10:00:00",
        tempf: "67.5",
        humidity: "67",
        mac: "E0:98:06:A3:37:CD",
      },
      rawBodyText: null,
      contentType: "application/json",
      httpMethod: "GET",
      source: "ecowitt_cloud_api",
      remoteAddress: null,
    });

    expect(result.status).toBe("normalized");
    expect(result.observationId).toBe(555);
    expect(updateRawPacketProcessing).toHaveBeenCalledWith(
      101,
      expect.objectContaining({ processingStatus: "normalized", unknownFields: null }),
    );
  });

  it("een payload met een écht onbekend veld (niet 'mac') blijft gewoon 'partial' opleveren", async () => {
    const result = await ingestWeatherPayload({
      rawPayload: {
        PASSKEY: "TESTPASSKEY0001",
        dateutc: "2026-01-15 10:00:00",
        tempf: "67.5",
        humidity: "67",
        eenveldvandeeigentoekomstigefirmware: "42",
      },
      rawBodyText: null,
      contentType: "application/json",
      httpMethod: "GET",
      source: "ecowitt_cloud_api",
      remoteAddress: null,
    });

    expect(result.status).toBe("partial");
    expect(updateRawPacketProcessing).toHaveBeenCalledWith(
      101,
      expect.objectContaining({
        processingStatus: "partial",
        unknownFields: expect.objectContaining({
          eenveldvandeeigentoekomstigefirmware: "42",
        }),
      }),
    );
  });
});

describe("reprocessRawPacket", () => {
  it("verwijdert een eerder afgeleide meting vóór herverwerking (geen dubbele meting)", async () => {
    vi.mocked(getStationById).mockResolvedValue(STATION);
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
