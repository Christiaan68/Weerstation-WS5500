import { describe, expect, it } from "vitest";

import { historyQuerySchema, resolveHistoryRange } from "@/lib/weather/history";

describe("historyQuerySchema", () => {
  it("parseert een geldige, kommagescheiden metrics-lijst", () => {
    const result = historyQuerySchema.safeParse({
      metrics: "temperatureOutdoorC, dewPointC",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.metrics).toEqual(["temperatureOutdoorC", "dewPointC"]);
    }
  });

  it("wijst een onbekende metric af", () => {
    const result = historyQuerySchema.safeParse({ metrics: "nietbestaand" });
    expect(result.success).toBe(false);
  });

  it("wijst een lege metrics-parameter af", () => {
    const result = historyQuerySchema.safeParse({ metrics: "" });
    expect(result.success).toBe(false);
  });

  it("wijst meer dan 6 metrics tegelijk af", () => {
    const result = historyQuerySchema.safeParse({
      metrics:
        "temperatureOutdoorC,temperatureIndoorC,feelsLikeC,dewPointC,windChillC,heatIndexC,humidityOutdoorPct",
    });
    expect(result.success).toBe(false);
  });

  it("accepteert een geldig period-preset", () => {
    const result = historyQuerySchema.safeParse({
      metrics: "temperatureOutdoorC",
      period: "7d",
    });
    expect(result.success).toBe(true);
  });

  it("wijst een onbekend period-preset af", () => {
    const result = historyQuerySchema.safeParse({
      metrics: "temperatureOutdoorC",
      period: "3d",
    });
    expect(result.success).toBe(false);
  });
});

describe("resolveHistoryRange", () => {
  const now = new Date("2026-09-05T14:00:00.000Z");

  it("gebruikt standaard 24 uur zonder period/from/to", () => {
    const range = resolveHistoryRange({ metrics: ["temperatureOutdoorC"] }, now);
    expect(range.toUtc).toEqual(now);
    expect(range.fromUtc.getTime()).toBe(now.getTime() - 24 * 60 * 60 * 1000);
  });

  it("gebruikt het opgegeven period-preset", () => {
    const range = resolveHistoryRange(
      { metrics: ["temperatureOutdoorC"], period: "7d" },
      now,
    );
    expect(range.fromUtc.getTime()).toBe(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  });

  it("geeft een (zeer ruime) vaste ondergrens voor period=all", () => {
    const range = resolveHistoryRange(
      { metrics: ["temperatureOutdoorC"], period: "all" },
      now,
    );
    expect(range.fromUtc.getFullYear()).toBeLessThanOrEqual(2020);
    expect(range.toUtc).toEqual(now);
  });

  it("expliciete from/to wint van een period-preset", () => {
    const from = new Date("2026-08-01T00:00:00.000Z");
    const to = new Date("2026-08-08T00:00:00.000Z");
    const range = resolveHistoryRange(
      { metrics: ["temperatureOutdoorC"], period: "24h", from, to },
      now,
    );
    expect(range.fromUtc).toEqual(from);
    expect(range.toUtc).toEqual(to);
  });

  it("negeert een ongeldig from/to-paar (from >= to) en valt terug op period", () => {
    const from = new Date("2026-08-08T00:00:00.000Z");
    const to = new Date("2026-08-01T00:00:00.000Z"); // vóór from
    const range = resolveHistoryRange(
      { metrics: ["temperatureOutdoorC"], period: "24h", from, to },
      now,
    );
    expect(range.toUtc).toEqual(now);
  });
});
