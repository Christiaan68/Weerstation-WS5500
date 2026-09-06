/**
 * Terug/vooruit-periodenavigatie op `/records` (Fase 4.4). De DB-laag
 * (`@/lib/db/queries`) wordt gemockt: dit bestand toetst uitsluitend de
 * datumgrens-logica.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const emptyRecords = {
  temperatureMaxC: null,
  temperatureMinC: null,
  windGustMaxKmh: null,
  windSpeedMaxKmh: null,
  rainRateMaxMmH: null,
  pressureMaxHpa: null,
  pressureMinHpa: null,
  humidityMaxPct: null,
  humidityMinPct: null,
};

vi.mock("@/lib/db/queries", () => ({
  getWeatherRecords: vi.fn().mockResolvedValue(emptyRecords),
}));

const queries = await import("@/lib/db/queries");
const { getRecordsForPeriod } = await import("@/lib/weather/records");

// 5 september 2026, 16:00 lokale tijd (CEST) — "nu" voor alle scenario's hieronder.
const now = new Date("2026-09-05T14:00:00.000Z");

describe("getRecordsForPeriod — offset-navigatie (Fase 4.4)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("period=today: offset 0 is vandaag, offset 1 is gisteren", async () => {
    const today = await getRecordsForPeriod(1, "today", 0, now);
    expect(today.rangeStartUtc?.toISOString()).toBe("2026-09-04T22:00:00.000Z");
    expect(today.rangeEndUtc?.toISOString()).toBe("2026-09-05T22:00:00.000Z");

    const yesterday = await getRecordsForPeriod(1, "today", 1, now);
    expect(yesterday.rangeStartUtc?.toISOString()).toBe("2026-09-03T22:00:00.000Z");
    expect(yesterday.rangeEndUtc?.toISOString()).toBe("2026-09-04T22:00:00.000Z");
  });

  it("period=month: offset 0 is september, offset 1 is augustus (volledige kalendermaand)", async () => {
    const september = await getRecordsForPeriod(1, "month", 0, now);
    expect(september.rangeStartUtc?.toISOString()).toBe("2026-08-31T22:00:00.000Z");
    expect(september.rangeEndUtc?.toISOString()).toBe("2026-09-30T22:00:00.000Z");

    const august = await getRecordsForPeriod(1, "month", 1, now);
    expect(august.rangeStartUtc?.toISOString()).toBe("2026-07-31T22:00:00.000Z");
    expect(august.rangeEndUtc?.toISOString()).toBe("2026-08-31T22:00:00.000Z");
  });

  it("december → januari: maandnavigatie rolt correct over naar het vorige jaar", async () => {
    const januari2026 = new Date("2026-01-15T12:00:00.000Z");
    const december2025 = await getRecordsForPeriod(1, "month", 1, januari2026);
    // 1 dec 2025 lokale middernacht (CET, UTC+1) t/m 1 jan 2026 lokale middernacht.
    expect(december2025.rangeStartUtc?.toISOString()).toBe("2025-11-30T23:00:00.000Z");
    expect(december2025.rangeEndUtc?.toISOString()).toBe("2025-12-31T23:00:00.000Z");
  });

  it("period=year: offset 0 is 2026, offset 1 is 2025 (volledig kalenderjaar)", async () => {
    const year2026 = await getRecordsForPeriod(1, "year", 0, now);
    expect(year2026.rangeStartUtc?.toISOString()).toBe("2025-12-31T23:00:00.000Z");
    expect(year2026.rangeEndUtc?.toISOString()).toBe("2026-12-31T23:00:00.000Z");

    const year2025 = await getRecordsForPeriod(1, "year", 1, now);
    expect(year2025.rangeStartUtc?.toISOString()).toBe("2024-12-31T23:00:00.000Z");
    expect(year2025.rangeEndUtc?.toISOString()).toBe("2025-12-31T23:00:00.000Z");
  });

  it("period=all: offset wordt genegeerd (er is maar één all-time)", async () => {
    const withoutOffset = await getRecordsForPeriod(1, "all", 0, now);
    const withOffset = await getRecordsForPeriod(1, "all", 5, now);
    expect(withoutOffset.rangeStartUtc).toBeNull();
    expect(withOffset.rangeStartUtc).toBeNull();
    expect(queries.getWeatherRecords).toHaveBeenCalledWith(1);
  });
});
