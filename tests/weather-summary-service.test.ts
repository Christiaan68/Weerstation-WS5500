import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/queries", () => ({
  aggregateObservationsForRange: vi.fn(),
  listDailySummaries: vi.fn(),
  listMonthlySummariesForYear: vi.fn(),
  upsertDailySummary: vi.fn(),
  upsertMonthlySummary: vi.fn(),
  upsertYearlySummary: vi.fn(),
}));

import {
  aggregateObservationsForRange,
  listDailySummaries,
  listMonthlySummariesForYear,
  upsertDailySummary,
  upsertMonthlySummary,
  upsertYearlySummary,
} from "@/lib/db/queries";
import type { DailyWeatherSummary, MonthlyWeatherSummary } from "@/lib/db/schema";
import {
  localDateKeysInMonth,
  recomputeDailySummariesInRange,
  recomputeDailySummary,
  recomputeMonthlySummary,
  recomputeYearlySummary,
} from "@/lib/weather/summary-service";

function dailySummaryRow(
  overrides: Partial<DailyWeatherSummary> = {},
): DailyWeatherSummary {
  return {
    id: 1,
    stationId: 1,
    localDate: "2026-06-15",
    temperatureMinC: "10.0",
    temperatureMaxC: "20.0",
    temperatureAvgC: "15.0",
    humidityMinPct: "60.0",
    humidityMaxPct: "90.0",
    humidityAvgPct: "75.0",
    pressureMinHpa: "1010.0",
    pressureMaxHpa: "1020.0",
    pressureAvgHpa: "1015.0",
    windAvgKmh: "10.0",
    windMaxKmh: "20.0",
    windGustMaxKmh: "30.0",
    rainTotalMm: "1.5",
    rainRateMaxMmH: "3.0",
    uvMax: "5.0",
    solarRadiationMaxWm2: "400.0",
    observationCount: 288,
    expectedObservationCount: 288,
    coveragePct: "100.0",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("localDateKeysInMonth", () => {
  it("geeft alle dagen van een normale maand", () => {
    expect(localDateKeysInMonth(2026, 2)).toEqual([
      "2026-02-01",
      "2026-02-02",
      "2026-02-03",
      "2026-02-04",
      "2026-02-05",
      "2026-02-06",
      "2026-02-07",
      "2026-02-08",
      "2026-02-09",
      "2026-02-10",
      "2026-02-11",
      "2026-02-12",
      "2026-02-13",
      "2026-02-14",
      "2026-02-15",
      "2026-02-16",
      "2026-02-17",
      "2026-02-18",
      "2026-02-19",
      "2026-02-20",
      "2026-02-21",
      "2026-02-22",
      "2026-02-23",
      "2026-02-24",
      "2026-02-25",
      "2026-02-26",
      "2026-02-27",
      "2026-02-28",
    ]);
  });

  it("houdt rekening met een schrikkeljaar", () => {
    const keys = localDateKeysInMonth(2028, 2);
    expect(keys).toHaveLength(29);
    expect(keys[keys.length - 1]).toBe("2028-02-29");
  });

  it("geeft december (jaarovergang) correct terug", () => {
    const keys = localDateKeysInMonth(2026, 12);
    expect(keys).toHaveLength(31);
    expect(keys[0]).toBe("2026-12-01");
    expect(keys[30]).toBe("2026-12-31");
  });
});

describe("recomputeDailySummary", () => {
  it("aggregeert de juiste lokale-dag-grenzen en slaat het resultaat op", async () => {
    vi.mocked(aggregateObservationsForRange).mockResolvedValue({
      temperatureMinC: 10,
      temperatureMaxC: 20,
      temperatureAvgC: 15,
      humidityMinPct: 60,
      humidityMaxPct: 90,
      humidityAvgPct: 75,
      pressureMinHpa: 1010,
      pressureMaxHpa: 1020,
      pressureAvgHpa: 1015,
      windAvgKmh: 10,
      windMaxKmh: 20,
      windGustMaxKmh: 30,
      rainTotalMm: 1.5,
      rainRateMaxMmH: 3,
      uvMax: 5,
      solarRadiationMaxWm2: 400,
      observationCount: 288,
    });

    await recomputeDailySummary(1, "2026-06-15");

    expect(aggregateObservationsForRange).toHaveBeenCalledWith(
      1,
      expect.any(Date),
      expect.any(Date),
    );
    expect(upsertDailySummary).toHaveBeenCalledWith(
      1,
      "2026-06-15",
      expect.objectContaining({
        temperatureMinC: 10,
        observationCount: 288,
        coveragePct: 100,
      }),
    );
  });

  it("Fase 5 — gebruikt de MEEGEGEVEN tijdzone voor de daggrenzen, per station verschillend", async () => {
    vi.mocked(aggregateObservationsForRange).mockResolvedValue({
      temperatureMinC: null,
      temperatureMaxC: null,
      temperatureAvgC: null,
      humidityMinPct: null,
      humidityMaxPct: null,
      humidityAvgPct: null,
      pressureMinHpa: null,
      pressureMaxHpa: null,
      pressureAvgHpa: null,
      windAvgKmh: null,
      windMaxKmh: null,
      windGustMaxKmh: null,
      rainTotalMm: null,
      rainRateMaxMmH: null,
      uvMax: null,
      solarRadiationMaxWm2: null,
      observationCount: 0,
    });

    // Station A (Amsterdam, zomertijd UTC+2): lokale dag 15 juni begint om
    // 22:00 UTC op de 14e.
    await recomputeDailySummary(1, "2026-06-15", 300, "Europe/Amsterdam");
    const [, startA] = vi.mocked(aggregateObservationsForRange).mock.calls[0]!;

    vi.mocked(aggregateObservationsForRange).mockClear();

    // Station B (Auckland, geen zomertijd op dat moment: UTC+12): lokale dag
    // 15 juni begint op een ANDER moment dan station A, ook al vraagt allebei
    // "dezelfde" lokale datum op.
    await recomputeDailySummary(2, "2026-06-15", 300, "Pacific/Auckland");
    const [, startB] = vi.mocked(aggregateObservationsForRange).mock.calls[0]!;

    expect((startA as Date).toISOString()).not.toBe((startB as Date).toISOString());
  });
});

describe("recomputeMonthlySummary", () => {
  it("combineert de dagsamenvattingen van de maand (scant weather_observations niet opnieuw)", async () => {
    vi.mocked(listDailySummaries).mockResolvedValue([
      dailySummaryRow({
        localDate: "2026-06-01",
        temperatureMinC: "8.0",
        rainTotalMm: "1.0",
      }),
      dailySummaryRow({
        localDate: "2026-06-02",
        temperatureMaxC: "25.0",
        rainTotalMm: "0.5",
      }),
    ]);

    await recomputeMonthlySummary(1, 2026, 6);

    expect(listDailySummaries).toHaveBeenCalledWith(1, "2026-06-01", "2026-06-30");
    expect(aggregateObservationsForRange).not.toHaveBeenCalled();
    expect(upsertMonthlySummary).toHaveBeenCalledWith(
      1,
      2026,
      6,
      expect.objectContaining({
        temperatureMinC: 8,
        temperatureMaxC: 25,
        rainTotalMm: 1.5,
      }),
    );
  });
});

describe("recomputeYearlySummary", () => {
  it("combineert de maandsamenvattingen van het jaar", async () => {
    vi.mocked(listMonthlySummariesForYear).mockResolvedValue([
      {
        ...dailySummaryRow(),
        id: 1,
        year: 2026,
        month: 1,
      } as unknown as MonthlyWeatherSummary,
    ]);

    await recomputeYearlySummary(1, 2026);

    expect(listMonthlySummariesForYear).toHaveBeenCalledWith(1, 2026);
    expect(upsertYearlySummary).toHaveBeenCalled();
  });
});

describe("recomputeDailySummariesInRange", () => {
  it("herberekent elke dag, en daarna precies de geraakte maanden/jaren (niet vaker)", async () => {
    vi.mocked(aggregateObservationsForRange).mockResolvedValue({
      temperatureMinC: null,
      temperatureMaxC: null,
      temperatureAvgC: null,
      humidityMinPct: null,
      humidityMaxPct: null,
      humidityAvgPct: null,
      pressureMinHpa: null,
      pressureMaxHpa: null,
      pressureAvgHpa: null,
      windAvgKmh: null,
      windMaxKmh: null,
      windGustMaxKmh: null,
      rainTotalMm: null,
      rainRateMaxMmH: null,
      uvMax: null,
      solarRadiationMaxWm2: null,
      observationCount: 0,
    });
    vi.mocked(listDailySummaries).mockResolvedValue([]);
    vi.mocked(listMonthlySummariesForYear).mockResolvedValue([]);

    const result = await recomputeDailySummariesInRange(1, [
      "2026-05-31",
      "2026-06-01",
      "2026-06-02",
    ]);

    expect(result.recomputedDays).toBe(3);
    expect(result.recomputedMonths).toBe(2); // mei + juni
    expect(result.recomputedYears).toBe(1); // alleen 2026
    expect(upsertDailySummary).toHaveBeenCalledTimes(3);
    expect(upsertMonthlySummary).toHaveBeenCalledTimes(2);
    expect(upsertYearlySummary).toHaveBeenCalledTimes(1);
  });
});
