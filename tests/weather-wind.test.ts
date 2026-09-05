import { describe, expect, it } from "vitest";

import {
  COMPASS_DIRECTIONS_NL,
  DEFAULT_CALM_WIND_THRESHOLD_KMH,
  buildWindRose,
  degreesToCompassDirection,
} from "@/lib/weather/wind";

describe("degreesToCompassDirection", () => {
  it("kent alle 16 Nederlandse hoofdrichtingen correct toe op hun middelpunt", () => {
    expect(degreesToCompassDirection(0)).toBe("N");
    expect(degreesToCompassDirection(22.5)).toBe("NNO");
    expect(degreesToCompassDirection(45)).toBe("NO");
    expect(degreesToCompassDirection(90)).toBe("O");
    expect(degreesToCompassDirection(180)).toBe("Z");
    expect(degreesToCompassDirection(270)).toBe("W");
    expect(degreesToCompassDirection(337.5)).toBe("NNW");
  });

  it("rondt correct af naar de dichtstbijzijnde richting binnen een sector", () => {
    expect(degreesToCompassDirection(10)).toBe("N"); // < 11,25° blijft N
    expect(degreesToCompassDirection(12)).toBe("NNO"); // > 11,25° wordt NNO
  });

  it("normaliseert graden buiten [0,360)", () => {
    expect(degreesToCompassDirection(360)).toBe("N");
    expect(degreesToCompassDirection(-10)).toBe("N");
    expect(degreesToCompassDirection(720 + 90)).toBe("O");
  });

  it("kent precies 16 richtingen", () => {
    expect(COMPASS_DIRECTIONS_NL).toHaveLength(16);
  });
});

describe("buildWindRose", () => {
  it("telt observaties correct per richting, met percentage/gemiddelde/max gust", () => {
    const rose = buildWindRose([
      { windDirectionDeg: 0, windSpeedKmh: 10, windGustKmh: 15 },
      { windDirectionDeg: 5, windSpeedKmh: 20, windGustKmh: 25 },
      { windDirectionDeg: 180, windSpeedKmh: 5, windGustKmh: 8 },
    ]);

    const north = rose.sectors.find((s) => s.direction === "N")!;
    expect(north.count).toBe(2);
    expect(north.avgSpeedKmh).toBeCloseTo(15, 5);
    expect(north.maxGustKmh).toBe(25);
    expect(north.percentage).toBeCloseTo((2 / 3) * 100, 1);

    const south = rose.sectors.find((s) => s.direction === "Z")!;
    expect(south.count).toBe(1);
    expect(south.avgSpeedKmh).toBe(5);
  });

  it("negeert windrichting onder de windstil-drempel en telt die apart", () => {
    const rose = buildWindRose([
      { windDirectionDeg: 90, windSpeedKmh: 0.5, windGustKmh: 1 }, // windstil
      { windDirectionDeg: 90, windSpeedKmh: 10, windGustKmh: 12 },
    ]);

    expect(rose.calmCount).toBe(1);
    const east = rose.sectors.find((s) => s.direction === "O")!;
    expect(east.count).toBe(1); // alleen de niet-windstille meting
  });

  it("gebruikt de gedocumenteerde windstil-drempel van 1 km/h (Beaufort 0)", () => {
    expect(DEFAULT_CALM_WIND_THRESHOLD_KMH).toBe(1);
  });

  it("negeert observaties zonder richting of snelheid volledig (tellen niet mee in percentage)", () => {
    const rose = buildWindRose([
      { windDirectionDeg: null, windSpeedKmh: 10, windGustKmh: null },
      { windDirectionDeg: 90, windSpeedKmh: null, windGustKmh: null },
      { windDirectionDeg: 90, windSpeedKmh: 10, windGustKmh: null },
    ]);
    expect(rose.totalObservations).toBe(1);
    const east = rose.sectors.find((s) => s.direction === "O")!;
    expect(east.count).toBe(1);
    expect(east.percentage).toBe(100);
  });

  it("geeft alle 16 sectoren terug, ook zonder observaties (0, niet ontbrekend)", () => {
    const rose = buildWindRose([]);
    expect(rose.sectors).toHaveLength(16);
    expect(rose.sectors.every((s) => s.count === 0 && s.avgSpeedKmh === null)).toBe(true);
  });
});
