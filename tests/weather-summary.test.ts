import { describe, expect, it } from "vitest";

import {
  buildSummaryFromRawAggregate,
  combineSummaryAggregates,
  computeCoveragePct,
  computeExpectedObservationCount,
  type SummaryAggregateValues,
} from "@/lib/weather/summary";

function summary(
  overrides: Partial<SummaryAggregateValues> = {},
): SummaryAggregateValues {
  return {
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
    expectedObservationCount: null,
    coveragePct: null,
    ...overrides,
  };
}

describe("computeExpectedObservationCount", () => {
  it("rekent een normale dag (86400s / 300s) correct om naar 288", () => {
    expect(computeExpectedObservationCount(86400, 300)).toBe(288);
  });

  it("houdt rekening met een 23-uursdag (zomertijd-overgang)", () => {
    expect(computeExpectedObservationCount(23 * 3600, 300)).toBe(276);
  });

  it("houdt rekening met een 25-uursdag (wintertijd-overgang)", () => {
    expect(computeExpectedObservationCount(25 * 3600, 300)).toBe(300);
  });

  it("geeft 0 bij een ongeldig pollinterval", () => {
    expect(computeExpectedObservationCount(86400, 0)).toBe(0);
  });
});

describe("computeCoveragePct", () => {
  it("berekent het percentage en rondt af op 1 decimaal", () => {
    expect(computeCoveragePct(144, 288)).toBe(50);
    expect(computeCoveragePct(200, 288)).toBeCloseTo(69.4, 1);
  });

  it("begrenst op 100% (bv. bij een extra meting door een korte storing/retry)", () => {
    expect(computeCoveragePct(300, 288)).toBe(100);
  });

  it("geeft null zonder een geldig verwacht aantal", () => {
    expect(computeCoveragePct(10, null)).toBeNull();
    expect(computeCoveragePct(10, 0)).toBeNull();
  });
});

describe("buildSummaryFromRawAggregate", () => {
  it("rondt af en berekent de dekking uit de duur en het pollinterval", () => {
    const result = buildSummaryFromRawAggregate(
      {
        temperatureMinC: 12.34,
        temperatureMaxC: 19.87,
        temperatureAvgC: 15.555,
        humidityMinPct: 60,
        humidityMaxPct: 90,
        humidityAvgPct: 75.05,
        pressureMinHpa: 1010.12,
        pressureMaxHpa: 1015.98,
        pressureAvgHpa: 1013,
        windAvgKmh: 10.05,
        windMaxKmh: 25.3,
        windGustMaxKmh: 40.7,
        rainTotalMm: 2.567,
        rainRateMaxMmH: 5.123,
        uvMax: 6.4,
        solarRadiationMaxWm2: 543.21,
        observationCount: 288,
      },
      86400,
      300,
    );

    expect(result.temperatureMinC).toBe(12.3);
    expect(result.temperatureMaxC).toBe(19.9);
    expect(result.rainTotalMm).toBe(2.57);
    expect(result.expectedObservationCount).toBe(288);
    expect(result.coveragePct).toBe(100);
  });

  it("geeft null-velden door zonder te crashen bij een lege dag", () => {
    const result = buildSummaryFromRawAggregate(
      {
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
      },
      86400,
      300,
    );

    expect(result.temperatureMinC).toBeNull();
    expect(result.observationCount).toBe(0);
    expect(result.coveragePct).toBe(0);
  });
});

describe("combineSummaryAggregates", () => {
  it("combineert dagsamenvattingen tot een maandsamenvatting volgens de gedocumenteerde regels", () => {
    const day1 = summary({
      temperatureMinC: 10,
      temperatureMaxC: 20,
      temperatureAvgC: 15,
      rainTotalMm: 2,
      windGustMaxKmh: 30,
      observationCount: 288,
      expectedObservationCount: 288,
      coveragePct: 100,
    });
    const day2 = summary({
      temperatureMinC: 8,
      temperatureMaxC: 22,
      temperatureAvgC: 17,
      rainTotalMm: 0.5,
      windGustMaxKmh: 45,
      observationCount: 144, // halve dag data
      expectedObservationCount: 288,
      coveragePct: 50,
    });

    const month = combineSummaryAggregates([day1, day2]);

    // min/max: het min/max van de kind-min/max.
    expect(month.temperatureMinC).toBe(8);
    expect(month.temperatureMaxC).toBe(22);
    // regen: som van de dagtotalen, nooit dubbel geteld.
    expect(month.rainTotalMm).toBe(2.5);
    // wind gust: max van de kind-max.
    expect(month.windGustMaxKmh).toBe(45);
    // gewogen gemiddelde: dag1 weegt zwaarder (288 vs 144 metingen).
    // (15*288 + 17*144) / 432 = 15.667
    expect(month.temperatureAvgC).toBeCloseTo(15.7, 1);
    expect(month.observationCount).toBe(432);
    expect(month.expectedObservationCount).toBe(576);
    expect(month.coveragePct).toBe(75);
  });

  it("een dag zonder enige geldige waarde beïnvloedt het gewogen gemiddelde niet", () => {
    const emptyDay = summary({
      observationCount: 0,
      expectedObservationCount: 288,
      coveragePct: 0,
    });
    const realDay = summary({
      temperatureAvgC: 18,
      observationCount: 288,
      expectedObservationCount: 288,
      coveragePct: 100,
    });

    const month = combineSummaryAggregates([emptyDay, realDay]);
    expect(month.temperatureAvgC).toBe(18);
  });

  it("geeft een lege (alles-null) samenvatting terug voor een lege kinderlijst, zonder te crashen", () => {
    const result = combineSummaryAggregates([]);
    expect(result.temperatureMinC).toBeNull();
    expect(result.observationCount).toBe(0);
    expect(result.coveragePct).toBeNull();
  });
});
