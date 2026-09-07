/**
 * Multi-station data-isolatie (Fase 5, §31-34/§44-49): toetst dat de
 * service-laag (rain/records/wind/export-filters) voor elke aanroep het
 * JUISTE `stationId` doorgeeft aan de database-laag, en dat elk station zijn
 * EIGEN tijdzone gebruikt voor lokale-kalendergrenzen — nooit een gedeelde
 * globale aanname, en nooit stationgegevens die per ongeluk vermengd raken.
 *
 * Twee fictieve teststations met duidelijk verschillende tijdzones (Fase 5,
 * §46: "Achtertuin" Europe/Amsterdam vs. een station aan de andere kant van
 * de wereld) tonen aan dat dezelfde `now` voor elk station een ANDERE lokale
 * kalenderdag/-grens oplevert, en dat de query-mocks per aanroep het juiste
 * station-id ontvangen — nooit het andere station s'n id.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/queries", () => ({
  getMaxRainDayInRange: vi.fn().mockResolvedValue(null),
  getMaxRainRateInRange: vi.fn().mockResolvedValue(null),
  getHourlyMaxRainDay: vi.fn().mockResolvedValue([]),
  listDailySummaries: vi.fn().mockResolvedValue([]),
  listMonthlySummariesForYear: vi.fn().mockResolvedValue([]),
  getWeatherRecords: vi.fn().mockResolvedValue({
    temperatureMaxC: null,
    temperatureMinC: null,
    windGustMaxKmh: null,
    windSpeedMaxKmh: null,
    rainRateMaxMmH: null,
    pressureMaxHpa: null,
    pressureMinHpa: null,
    humidityMaxPct: null,
    humidityMinPct: null,
  }),
  listWindObservationsInRange: vi.fn().mockResolvedValue([]),
}));

const queries = await import("@/lib/db/queries");
const { getRainOverview } = await import("@/lib/weather/rain-service");
const { getRecordsForPeriod } = await import("@/lib/weather/records");
const { getWindRoseOverview } = await import("@/lib/weather/wind-service");
const { resolveExportRange, exportQuerySchema } = await import("@/lib/weather/export/filters");
const { getLocalDateKey } = await import("@/lib/weather/timezone");

// Zelfde absolute moment voor alle scenario's — het is 21:30 UTC, wat voor
// Amsterdam (UTC+2, zomertijd) al 23:30 lokaal is (nog dezelfde kalenderdag),
// maar voor Auckland (UTC+12, op dat moment geen zomertijd) al 09:30 de
// VOLGENDE lokale dag is. Deze bewuste keuze bewijst dat elk station zijn
// EIGEN lokale kalenderdag krijgt, niet een gedeelde.
const NOW = new Date("2026-09-05T21:30:00.000Z");

const STATION_A = { id: 1, timezone: "Europe/Amsterdam" };
const STATION_B = { id: 2, timezone: "Pacific/Auckland" };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("multi-station isolatie — rain-service", () => {
  it("getRainOverview geeft voor elk station het EIGEN stationId door aan de query-laag, nooit het andere s'n", async () => {
    await getRainOverview(STATION_A.id, "today", 0, NOW, STATION_A.timezone);
    await getRainOverview(STATION_B.id, "today", 0, NOW, STATION_B.timezone);

    const calls = vi.mocked(queries.getMaxRainDayInRange).mock.calls;
    expect(calls).toHaveLength(2);
    expect(calls[0]![0]).toBe(STATION_A.id);
    expect(calls[1]![0]).toBe(STATION_B.id);
  });

  it("dezelfde 'now' levert voor Amsterdam en Auckland EEN ANDERE lokale kalenderdag op (eigen tijdzone per station)", async () => {
    const resultA = await getRainOverview(STATION_A.id, "today", 0, NOW, STATION_A.timezone);
    const resultB = await getRainOverview(STATION_B.id, "today", 0, NOW, STATION_B.timezone);

    expect(getLocalDateKey(new Date(resultA.from), STATION_A.timezone)).toBe("2026-09-05");
    // Auckland loopt op dit moment al een kalenderdag vóór — bewijst dat de
    // grens ECHT per station berekend wordt, niet gedeeld.
    expect(getLocalDateKey(new Date(resultB.from), STATION_B.timezone)).toBe("2026-09-06");
    expect(resultA.from).not.toBe(resultB.from);
  });
});

describe("multi-station isolatie — records", () => {
  it("getRecordsForPeriod geeft voor elk station het EIGEN stationId door, en gebruikt de EIGEN tijdzone voor de dagrange", async () => {
    const resultA = await getRecordsForPeriod(
      STATION_A.id,
      "today",
      0,
      NOW,
      STATION_A.timezone,
    );
    const resultB = await getRecordsForPeriod(
      STATION_B.id,
      "today",
      0,
      NOW,
      STATION_B.timezone,
    );

    const calls = vi.mocked(queries.getWeatherRecords).mock.calls;
    expect(calls).toHaveLength(2);
    expect(calls[0]![0]).toBe(STATION_A.id);
    expect(calls[1]![0]).toBe(STATION_B.id);
    // De dagranges verschillen — nooit toevallig gelijk door een gedeelde
    // default-tijdzone.
    expect(resultA.rangeStartUtc?.toISOString()).not.toBe(resultB.rangeStartUtc?.toISOString());
  });
});

describe("multi-station isolatie — wind-service", () => {
  it("getWindRoseOverview geeft voor elk station het EIGEN stationId door aan listWindObservationsInRange", async () => {
    await getWindRoseOverview(STATION_A.id, "today", 0, NOW, undefined, STATION_A.timezone);
    await getWindRoseOverview(STATION_B.id, "today", 0, NOW, undefined, STATION_B.timezone);

    const calls = vi.mocked(queries.listWindObservationsInRange).mock.calls;
    expect(calls).toHaveLength(2);
    expect(calls[0]![0]).toBe(STATION_A.id);
    expect(calls[1]![0]).toBe(STATION_B.id);
    // Ook hier: verschillende tijdzones geven een verschillend beginpunt.
    expect(calls[0]![1]).not.toEqual(calls[1]![1]);
  });
});

describe("multi-station isolatie — export/filters", () => {
  it("resolveExportRange('vandaag') geeft per station-tijdzone een andere lokale dag terug", () => {
    const query = exportQuerySchema.parse({ preset: "vandaag" });
    const rangeA = resolveExportRange(query, NOW, STATION_A.timezone);
    const rangeB = resolveExportRange(query, NOW, STATION_B.timezone);

    expect(getLocalDateKey(rangeA.fromUtc, STATION_A.timezone)).toBe("2026-09-05");
    expect(getLocalDateKey(rangeB.fromUtc, STATION_B.timezone)).toBe("2026-09-06");
    expect(rangeA.fromUtc.toISOString()).not.toBe(rangeB.fromUtc.toISOString());
  });
});
