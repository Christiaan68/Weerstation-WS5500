import { describe, expect, it } from "vitest";

import {
  PRESSURE_TREND_THRESHOLD_HPA_PER_3H,
  classifyPressureTrend,
  computeWindowTrend,
} from "@/lib/weather/trends";

function at(minutesAgo: number, v: number, now = new Date("2026-09-05T14:00:00.000Z")) {
  return { t: new Date(now.getTime() - minutesAgo * 60_000), v };
}

describe("computeWindowTrend", () => {
  it("berekent het venstertrend uit eerste/laatste meting (geen procentuele verandering)", () => {
    const trend = computeWindowTrend([at(60, 19.1), at(30, 19.5), at(0, 19.7)], 60);
    expect(trend).not.toBeNull();
    expect(trend!.deltaValue).toBeCloseTo(0.6, 5);
    expect(trend!.deltaPerHour).toBeCloseTo(0.6, 5);
  });

  it("normaliseert correct naar per uur bij een korter venster dan 60 minuten span", () => {
    // 0,3 graden verschil over 30 minuten = 0,6 per uur.
    const trend = computeWindowTrend([at(30, 19.1), at(0, 19.4)], 60, {
      minSpanMinutes: 15,
    });
    expect(trend!.deltaPerHour).toBeCloseTo(0.6, 5);
    expect(trend!.deltaValue).toBeCloseTo(0.3, 5);
  });

  it("geeft null bij minder dan 2 punten", () => {
    expect(computeWindowTrend([], 60)).toBeNull();
    expect(computeWindowTrend([at(0, 19.1)], 60)).toBeNull();
  });

  it("geeft null bij onvoldoende tijdspanne (te weinig data voor een betrouwbare trend)", () => {
    // Maar 5 minuten span binnen een venster van 60 minuten (minimaal 30 vereist).
    const trend = computeWindowTrend([at(5, 19.1), at(0, 19.15)], 60);
    expect(trend).toBeNull();
  });

  it("herkent een dalende trend (negatieve delta)", () => {
    const trend = computeWindowTrend([at(180, 1015.0), at(0, 1013.8)], 180, {
      minSpanMinutes: 60,
    });
    expect(trend!.deltaValue).toBeCloseTo(-1.2, 5);
  });
});

describe("classifyPressureTrend", () => {
  it("gebruikt de gedocumenteerde drempel van 1,0 hPa/3u", () => {
    expect(PRESSURE_TREND_THRESHOLD_HPA_PER_3H).toBe(1.0);
  });

  it("classificeert stijgend/dalend/stabiel correct rond de drempel", () => {
    expect(classifyPressureTrend(1.2)).toBe("stijgend");
    expect(classifyPressureTrend(1.0)).toBe("stijgend");
    expect(classifyPressureTrend(-1.2)).toBe("dalend");
    expect(classifyPressureTrend(-1.0)).toBe("dalend");
    expect(classifyPressureTrend(0.4)).toBe("stabiel");
    expect(classifyPressureTrend(-0.4)).toBe("stabiel");
    expect(classifyPressureTrend(0)).toBe("stabiel");
  });
});
