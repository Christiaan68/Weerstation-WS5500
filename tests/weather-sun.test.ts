import { describe, expect, it } from "vitest";

import { DEFAULT_LATITUDE, DEFAULT_LONGITUDE, getSolarElevationDeg, getSunTimes } from "@/lib/weather/sun";

describe("sun.ts — zonsstand-berekeningen (De Bilt-coördinaten)", () => {
  it("geeft op een zomerdag een vroegere zonsopkomst en latere zonsondergang dan op een winterdag", () => {
    const summer = getSunTimes(
      new Date("2026-06-21T12:00:00.000Z"),
      DEFAULT_LATITUDE,
      DEFAULT_LONGITUDE,
    );
    const winter = getSunTimes(
      new Date("2026-12-21T12:00:00.000Z"),
      DEFAULT_LATITUDE,
      DEFAULT_LONGITUDE,
    );

    expect(summer).not.toBeNull();
    expect(winter).not.toBeNull();

    const summerDayLengthMs =
      summer!.sunsetUtc.getTime() - summer!.sunriseUtc.getTime();
    const winterDayLengthMs =
      winter!.sunsetUtc.getTime() - winter!.sunriseUtc.getTime();

    // Zomer: dag van ~16-17 uur. Winter: dag van ~7-8 uur.
    expect(summerDayLengthMs).toBeGreaterThan(15 * 3600_000);
    expect(winterDayLengthMs).toBeLessThan(9 * 3600_000);
    expect(summerDayLengthMs).toBeGreaterThan(winterDayLengthMs);
  });

  it("plaatst zonsopkomst vóór zonnemiddag vóór zonsondergang", () => {
    const times = getSunTimes(
      new Date("2026-03-15T12:00:00.000Z"),
      DEFAULT_LATITUDE,
      DEFAULT_LONGITUDE,
    );
    expect(times).not.toBeNull();
    expect(times!.sunriseUtc.getTime()).toBeLessThan(times!.solarNoonUtc.getTime());
    expect(times!.solarNoonUtc.getTime()).toBeLessThan(times!.sunsetUtc.getTime());
  });

  it("geeft een positieve zonshoogte rond de middag en een negatieve midden in de nacht", () => {
    const noonElevation = getSolarElevationDeg(
      new Date("2026-06-21T12:00:00.000Z"), // ~14:00 lokale zomertijd, ruim vóór zonsondergang
      DEFAULT_LATITUDE,
      DEFAULT_LONGITUDE,
    );
    const midnightElevation = getSolarElevationDeg(
      new Date("2026-06-21T00:30:00.000Z"), // 02:30 lokale zomertijd
      DEFAULT_LATITUDE,
      DEFAULT_LONGITUDE,
    );

    expect(noonElevation).toBeGreaterThan(30);
    expect(midnightElevation).toBeLessThan(-10);
  });

  it("geeft null voor DEFAULT_LATITUDE/LONGITUDE nooit terug (geen poolnacht/-dag in Nederland)", () => {
    for (const month of [1, 4, 7, 10]) {
      const result = getSunTimes(
        new Date(Date.UTC(2026, month - 1, 15, 12)),
        DEFAULT_LATITUDE,
        DEFAULT_LONGITUDE,
      );
      expect(result).not.toBeNull();
    }
  });
});
