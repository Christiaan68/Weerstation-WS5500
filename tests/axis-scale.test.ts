import { describe, expect, it } from "vitest";

import {
  computeAxisDomain,
  computeNiceTicks,
  computeZeroBasedAxisDomain,
  decimalsForStep,
  niceNum,
} from "@/lib/weather/axis-scale";

describe("niceNum", () => {
  it("rondt af naar 1, 2, 5 of 10 (met round=false altijd naar boven)", () => {
    expect(niceNum(0.9, false)).toBe(1);
    expect(niceNum(1.5, false)).toBe(2);
    expect(niceNum(4, false)).toBe(5);
    expect(niceNum(8, false)).toBe(10);
  });

  it("kan met round=true ook naar beneden afronden", () => {
    expect(niceNum(1.2, true)).toBe(1);
    expect(niceNum(2.4, true)).toBe(2);
    expect(niceNum(6, true)).toBe(5);
  });

  it("geeft altijd een positief getal terug, ook bij ongeldige invoer", () => {
    expect(niceNum(0, false)).toBe(1);
    expect(niceNum(-5, false)).toBe(1);
    expect(niceNum(Number.NaN, false)).toBe(1);
  });
});

describe("decimalsForStep", () => {
  it("herkent hele stappen", () => {
    expect(decimalsForStep(1)).toBe(0);
    expect(decimalsForStep(5)).toBe(0);
    expect(decimalsForStep(20)).toBe(0);
  });

  it("herkent stappen met decimalen", () => {
    expect(decimalsForStep(0.5)).toBe(1);
    expect(decimalsForStep(0.2)).toBe(1);
    expect(decimalsForStep(0.05)).toBe(2);
  });
});

describe("computeNiceTicks", () => {
  it("produceert 5-6 gelijke, oplopende tussenstappen", () => {
    const result = computeNiceTicks(12.3, 47.8, 5);
    expect(result.ticks.length).toBeGreaterThanOrEqual(4);
    expect(result.ticks.length).toBeLessThanOrEqual(7);
    expect(result.min).toBeLessThanOrEqual(12.3);
    expect(result.max).toBeGreaterThanOrEqual(47.8);
    for (let i = 1; i < result.ticks.length; i++) {
      expect(result.ticks[i]! - result.ticks[i - 1]!).toBeCloseTo(result.step, 6);
    }
  });

  it("kapt geen geldige pieken of dalen af", () => {
    const result = computeNiceTicks(-3.2, 9.9);
    expect(result.min).toBeLessThanOrEqual(-3.2);
    expect(result.max).toBeGreaterThanOrEqual(9.9);
  });

  it("handelt min === max af zonder oneindige lus", () => {
    const result = computeNiceTicks(10, 10);
    expect(result.max).toBeGreaterThan(result.min);
    expect(result.ticks.length).toBeGreaterThan(1);
  });
});

describe("computeAxisDomain — free (temperatuur, luchtdruk)", () => {
  it("laat de ondergrens niet standaard bij nul beginnen", () => {
    const result = computeAxisDomain([18, 19, 21, 23], "free");
    expect(result.min).toBeGreaterThan(0);
  });

  it("staat negatieve waarden toe", () => {
    const result = computeAxisDomain([-4, -1, 2, 5], "free");
    expect(result.min).toBeLessThan(0);
    expect(result.max).toBeGreaterThanOrEqual(5);
  });

  it("voegt marge toe rond het bereik (geen afgeknepen as)", () => {
    const result = computeAxisDomain([15, 23], "free");
    expect(result.min).toBeLessThan(15);
    expect(result.max).toBeGreaterThan(23);
  });

  it("geeft een leesbaar bereik bij constante waarden", () => {
    const result = computeAxisDomain([20, 20, 20], "free");
    expect(result.max - result.min).toBeGreaterThan(0);
    expect(result.min).toBeLessThan(20);
    expect(result.max).toBeGreaterThan(20);
  });

  it("geeft een leesbaar bereik bij precies één meetpunt", () => {
    const result = computeAxisDomain([12.5], "free");
    expect(result.max - result.min).toBeGreaterThan(0);
  });

  it("valt terug op een neutrale schaal bij een lege of volledig ontbrekende reeks", () => {
    const result = computeAxisDomain([null, undefined, Number.NaN], "free");
    expect(Number.isFinite(result.min)).toBe(true);
    expect(Number.isFinite(result.max)).toBe(true);
    expect(result.max).toBeGreaterThan(result.min);
  });

  it("negeert ontbrekende waarden maar behoudt geldige uitschieters", () => {
    const withNulls = computeAxisDomain([10, null, 30, undefined, 10], "free");
    const withoutNulls = computeAxisDomain([10, 30, 10], "free");
    expect(withNulls).toEqual(withoutNulls);
    expect(withNulls.max).toBeGreaterThanOrEqual(30);
  });
});

describe("computeAxisDomain — nonNegative (wind, regenintensiteit, zoninstraling)", () => {
  it("gaat nooit onder nul, ook niet met marge", () => {
    const result = computeAxisDomain([0.2, 0.4, 0.6], "nonNegative");
    expect(result.min).toBe(0);
  });

  it("blijft bij uitsluitend nulwaarden een klein, leesbaar bereik geven (geen negatieve as)", () => {
    const result = computeAxisDomain([0, 0, 0], "nonNegative");
    expect(result.min).toBe(0);
    expect(result.max).toBeGreaterThan(0);
  });

  it("schaalt mee met grote waarden zonder de piek af te snijden", () => {
    const result = computeAxisDomain([120, 450, 890], "nonNegative");
    expect(result.max).toBeGreaterThanOrEqual(890);
    expect(result.min).toBeLessThanOrEqual(120);
    expect(result.min).toBeGreaterThanOrEqual(0);
  });
});

describe("computeAxisDomain — percentage (luchtvochtigheid)", () => {
  it("blijft binnen 0-100", () => {
    const result = computeAxisDomain([2, 5, 8], "percentage");
    expect(result.min).toBeGreaterThanOrEqual(0);
    expect(result.max).toBeLessThanOrEqual(100);

    const resultHigh = computeAxisDomain([92, 97, 99], "percentage");
    expect(resultHigh.min).toBeGreaterThanOrEqual(0);
    expect(resultHigh.max).toBeLessThanOrEqual(100);
  });

  it("mag een smaller bereik tonen dan 0-100 wanneer dat de leesbaarheid helpt", () => {
    const result = computeAxisDomain([60, 62, 65], "percentage");
    expect(result.max).toBeLessThan(100);
  });

  it("handelt een constante 0% en een constante 100% correct af", () => {
    const zero = computeAxisDomain([0, 0, 0], "percentage");
    expect(zero.min).toBe(0);
    expect(zero.max).toBeGreaterThan(0);

    const hundred = computeAxisDomain([100, 100, 100], "percentage");
    expect(hundred.max).toBe(100);
    expect(hundred.min).toBeLessThan(100);
  });
});

describe("computeAxisDomain — uvIndex", () => {
  it("begint altijd bij nul", () => {
    const result = computeAxisDomain([3, 5, 7], "uvIndex");
    expect(result.min).toBe(0);
  });

  it("gebruikt hele schaalwaarden", () => {
    const result = computeAxisDomain([1.4, 3.8, 6.2], "uvIndex");
    for (const tick of result.ticks) {
      expect(Number.isInteger(tick)).toBe(true);
    }
    expect(Number.isInteger(result.step)).toBe(true);
  });

  it("houdt minimaal een bereik van 0-2 aan, ook bij uitsluitend nulwaarden", () => {
    const result = computeAxisDomain([0, 0, 0], "uvIndex");
    expect(result.min).toBe(0);
    expect(result.max).toBeGreaterThanOrEqual(2);
  });

  it("past de bovengrens aan de piek aan", () => {
    const low = computeAxisDomain([0, 1, 2], "uvIndex");
    const high = computeAxisDomain([0, 6, 9], "uvIndex");
    expect(high.max).toBeGreaterThan(low.max);
    expect(high.max).toBeGreaterThanOrEqual(9);
  });
});

describe("computeZeroBasedAxisDomain (staafgrafieken, bv. neerslag)", () => {
  it("houdt de ondergrens altijd op nul", () => {
    const result = computeZeroBasedAxisDomain([1.2, 4.5, 0, 8.9]);
    expect(result.min).toBe(0);
    expect(result.max).toBeGreaterThanOrEqual(8.9);
  });

  it("geeft een leesbaar bereik bij uitsluitend nulwaarden", () => {
    const result = computeZeroBasedAxisDomain([0, 0, 0]);
    expect(result.min).toBe(0);
    expect(result.max).toBeGreaterThan(0);
  });

  it("valt terug op een neutrale schaal bij een lege reeks", () => {
    const result = computeZeroBasedAxisDomain([]);
    expect(result.min).toBe(0);
    expect(result.max).toBeGreaterThan(0);
  });
});
