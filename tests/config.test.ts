import { describe, expect, it } from "vitest";

import {
  DEFAULT_MIN_COVERAGE_FOR_STREAK_PCT,
  DEFAULT_POLL_INTERVAL_SECONDS,
  DEFAULT_RAIN_DAY_THRESHOLD_MM,
} from "@/lib/weather/config";

describe("centrale configuratiedrempels (§38-39)", () => {
  it("her-exporteert het bestaande pollinterval ongewijzigd (300s, geen dubbele definitie)", () => {
    expect(DEFAULT_POLL_INTERVAL_SECONDS).toBe(300);
  });

  it("her-exporteert de bestaande regendag-drempel ongewijzigd (0,1 mm)", () => {
    expect(DEFAULT_RAIN_DAY_THRESHOLD_MM).toBe(0.1);
  });

  it("definieert een minimale dekking voor droog/nat-reeksen tussen 0 en 100", () => {
    expect(DEFAULT_MIN_COVERAGE_FOR_STREAK_PCT).toBeGreaterThan(0);
    expect(DEFAULT_MIN_COVERAGE_FOR_STREAK_PCT).toBeLessThanOrEqual(100);
  });
});
