import { describe, expect, it } from "vitest";

import {
  DEFAULT_RAIN_DAY_THRESHOLD_MM,
  dailyRainTotalMm,
  incrementsFromCumulativeSeries,
  isRainDay,
  sumDailyTotals,
} from "@/lib/weather/rain";

describe("incrementsFromCumulativeSeries — KERNVEREISTE uit de Fase 3-opdracht", () => {
  it("dagteller 2.0 → 2.2 → 2.5 levert increments [2.0, 0.2, 0.3] op, totaal 2.5mm — NOOIT 6.7mm", () => {
    const result = incrementsFromCumulativeSeries([
      { key: "10", maxValueMm: 2.0 },
      { key: "11", maxValueMm: 2.2 },
      { key: "12", maxValueMm: 2.5 },
    ]);

    expect(result).toEqual([
      { key: "10", incrementMm: 2.0 },
      { key: "11", incrementMm: 0.2 },
      { key: "12", incrementMm: 0.3 },
    ]);

    const total = result.reduce((sum, r) => sum + r.incrementMm, 0);
    expect(total).toBeCloseTo(2.5, 5);
    expect(total).not.toBeCloseTo(6.7, 1);
  });
});

describe("incrementsFromCumulativeSeries — teller-reset (nieuwe dag / firmwareglitch)", () => {
  it("een daling van de teller wordt behandeld als reset: increment = nieuwe waarde, nooit negatief", () => {
    const result = incrementsFromCumulativeSeries([
      { key: "23", maxValueMm: 5.2 }, // einde van dag 1
      { key: "00", maxValueMm: 0.3 }, // dag 2, teller opnieuw begonnen
      { key: "01", maxValueMm: 0.9 },
    ]);

    expect(result).toEqual([
      { key: "23", incrementMm: 5.2 },
      { key: "00", incrementMm: 0.3 }, // NIET -4.9
      { key: "01", incrementMm: 0.6 },
    ]);
    expect(result.every((r) => r.incrementMm >= 0)).toBe(true);
  });

  it("lege buckets (geen metingen) leveren increment 0 op en breken de reeks niet", () => {
    const result = incrementsFromCumulativeSeries([
      { key: "10", maxValueMm: 1.0 },
      { key: "11", maxValueMm: null },
      { key: "12", maxValueMm: 1.4 },
    ]);

    expect(result).toEqual([
      { key: "10", incrementMm: 1.0 },
      { key: "11", incrementMm: 0 },
      { key: "12", incrementMm: 0.4 },
    ]);
  });

  it("een lege reeks levert een lege lijst op", () => {
    expect(incrementsFromCumulativeSeries([])).toEqual([]);
  });
});

describe("dailyRainTotalMm", () => {
  it("geeft het maximum van de reeks (het dagtotaal), niet de som", () => {
    expect(dailyRainTotalMm([0, 0.5, 1.2, 1.2, 2.5, 2.5])).toBe(2.5);
  });

  it("geeft null (niet 0) als er geen enkele geldige meting is — geen dataverzinnerij", () => {
    expect(dailyRainTotalMm([])).toBeNull();
    expect(dailyRainTotalMm([null, undefined, null])).toBeNull();
  });

  it("negeert null/undefined tussen geldige waarden", () => {
    expect(dailyRainTotalMm([1.0, null, undefined, 3.2])).toBe(3.2);
  });

  it("een dag zonder regen geeft terecht 0 (geen data is iets anders dan 0mm)", () => {
    expect(dailyRainTotalMm([0, 0, 0])).toBe(0);
  });
});

describe("sumDailyTotals", () => {
  it("telt dagtotalen simpelweg op voor een week/maand/jaar-overzicht", () => {
    expect(sumDailyTotals([1.0, 0, 2.5, 0.3])).toBeCloseTo(3.8, 5);
  });

  it("negeert ontbrekende dagen standaard (telt ze niet als 0 mee)", () => {
    expect(sumDailyTotals([1.0, null, 2.0])).toBeCloseTo(3.0, 5);
  });

  it("kan ontbrekende dagen als 0 behandelen wanneer gevraagd (30-dagen-grafiek)", () => {
    expect(sumDailyTotals([1.0, null, 2.0], { treatMissingAsZero: true })).toBeCloseTo(
      3.0,
      5,
    );
  });

  it("geeft null als er helemaal geen data is", () => {
    expect(sumDailyTotals([null, null])).toBeNull();
    expect(sumDailyTotals([])).toBeNull();
  });
});

describe("isRainDay — configureerbare drempel", () => {
  it("gebruikt standaard 0,1 mm als drempel", () => {
    expect(DEFAULT_RAIN_DAY_THRESHOLD_MM).toBe(0.1);
    expect(isRainDay(0.1)).toBe(true);
    expect(isRainDay(0.09)).toBe(false);
    expect(isRainDay(0)).toBe(false);
    expect(isRainDay(null)).toBe(false);
  });

  it("accepteert een aangepaste drempel", () => {
    expect(isRainDay(0.5, 1.0)).toBe(false);
    expect(isRainDay(1.5, 1.0)).toBe(true);
  });
});
