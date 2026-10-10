import { describe, expect, it } from "vitest";

import {
  HISTORY_CATEGORY_LABELS_NL,
  metricsForCategory,
} from "@/lib/weather/history-metrics-catalog";
import { HISTORY_METRICS, isHistoryMetricKey } from "@/lib/weather/history-metrics";

describe("regen-metrics voor de gecombineerde regengrafiek", () => {
  it("heeft in categorie regen eerst de cumulatieve dagteller en dan de regenintensiteit", () => {
    expect(metricsForCategory("regen").map((m) => m.key)).toEqual(["rainDayMm", "rainRateMmH"]);
  });

  it("registreert rainDayMm met eenheid mm en een databasekolom", () => {
    expect(isHistoryMetricKey("rainDayMm")).toBe(true);
    const def = HISTORY_METRICS["rainDayMm"]!;
    expect(def.unit).toBe("mm");
    expect(def.column).toBeDefined();
  });

  it("aggregeert zowel de cumulatieve teller als de intensiteit met max (nooit gemiddeld)", () => {
    expect(HISTORY_METRICS["rainDayMm"]!.agg).toBe("max");
    expect(HISTORY_METRICS["rainRateMmH"]!.agg).toBe("max");
  });

  it("noemt de categorie 'Regen' (bevat nu meer dan alleen intensiteit)", () => {
    expect(HISTORY_CATEGORY_LABELS_NL.regen).toBe("Regen");
  });
});
