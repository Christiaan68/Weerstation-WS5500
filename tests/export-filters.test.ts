import { describe, expect, it } from "vitest";

import {
  exportQuerySchema,
  resolveExportMetricKeys,
  resolveExportRange,
} from "@/lib/weather/export/filters";
import { getLocalDateKey } from "@/lib/weather/timezone";

// Vast referentiepunt: 6 september 2026, 15:05 lokale tijd (Europe/Amsterdam, zomertijd UTC+2).
const NOW = new Date("2026-09-06T13:05:00.000Z");

describe("resolveExportRange presets", () => {
  it("'vandaag' geeft de huidige lokale kalenderdag", () => {
    const result = resolveExportRange(exportQuerySchema.parse({ preset: "vandaag" }), NOW);
    expect(getLocalDateKey(result.fromUtc)).toBe("2026-09-06");
    expect(result.toUtc.getTime() - result.fromUtc.getTime()).toBe(86_400_000);
  });

  it("'gisteren' geeft de dag ervóór, niet vandaag", () => {
    const result = resolveExportRange(exportQuerySchema.parse({ preset: "gisteren" }), NOW);
    expect(getLocalDateKey(result.fromUtc)).toBe("2026-09-05");
    expect(getLocalDateKey(new Date(result.toUtc.getTime() - 1000))).toBe("2026-09-05");
  });

  it("'laatste-7-dagen' beslaat exact 7 lokale kalenderdagen, eindigend vandaag", () => {
    const result = resolveExportRange(
      exportQuerySchema.parse({ preset: "laatste-7-dagen" }),
      NOW,
    );
    const days = Math.round((result.toUtc.getTime() - result.fromUtc.getTime()) / 86_400_000);
    expect(days).toBe(7);
    expect(getLocalDateKey(result.fromUtc)).toBe("2026-08-31");
  });

  it("'laatste-30-dagen' beslaat exact 30 lokale kalenderdagen", () => {
    const result = resolveExportRange(
      exportQuerySchema.parse({ preset: "laatste-30-dagen" }),
      NOW,
    );
    const days = Math.round((result.toUtc.getTime() - result.fromUtc.getTime()) / 86_400_000);
    expect(days).toBe(30);
  });

  it("'huidige-maand' geeft de hele lokale kalendermaand", () => {
    const result = resolveExportRange(
      exportQuerySchema.parse({ preset: "huidige-maand" }),
      NOW,
    );
    expect(getLocalDateKey(result.fromUtc)).toBe("2026-09-01");
    expect(getLocalDateKey(new Date(result.toUtc.getTime() - 1000))).toBe("2026-09-30");
  });

  it("'huidig-jaar' geeft het hele lokale kalenderjaar", () => {
    const result = resolveExportRange(exportQuerySchema.parse({ preset: "huidig-jaar" }), NOW);
    expect(getLocalDateKey(result.fromUtc)).toBe("2026-01-01");
    expect(getLocalDateKey(new Date(result.toUtc.getTime() - 1000))).toBe("2026-12-31");
  });

  it("'aangepast' gebruikt de expliciete from/to (datumsleutels, lokale tijd)", () => {
    const result = resolveExportRange(
      exportQuerySchema.parse({ preset: "aangepast", from: "2026-01-01", to: "2026-01-31" }),
      NOW,
    );
    expect(getLocalDateKey(result.fromUtc)).toBe("2026-01-01");
    expect(getLocalDateKey(new Date(result.toUtc.getTime() - 1000))).toBe("2026-01-31");
  });

  it("gooit een fout als 'aangepast' zonder from/to wordt opgevraagd", () => {
    expect(() =>
      resolveExportRange(exportQuerySchema.parse({ preset: "aangepast" }), NOW),
    ).toThrow();
  });

  it("gooit een fout als from ná to ligt", () => {
    expect(() =>
      resolveExportRange(
        exportQuerySchema.parse({ preset: "aangepast", from: "2026-02-01", to: "2026-01-01" }),
        NOW,
      ),
    ).toThrow();
  });

  it("valt zonder preset maar mét from/to terug op 'aangepast'", () => {
    const result = resolveExportRange(
      exportQuerySchema.parse({ from: "2026-01-01", to: "2026-01-02" }),
      NOW,
    );
    expect(result.preset).toBe("aangepast");
  });
});

describe("resolveExportMetricKeys", () => {
  it("geeft alle metrics terug als er geen filter is opgegeven", () => {
    const keys = resolveExportMetricKeys(undefined);
    expect(keys.length).toBeGreaterThan(10);
    expect(keys).toContain("temperatureOutdoorC");
  });

  it("filtert naar de opgegeven metrics", () => {
    expect(resolveExportMetricKeys("temperatureOutdoorC,humidityOutdoorPct")).toEqual([
      "temperatureOutdoorC",
      "humidityOutdoorPct",
    ]);
  });

  it("gooit een fout bij een onbekende metric", () => {
    expect(() => resolveExportMetricKeys("nietBestaandeMetric")).toThrow();
  });
});

describe("exportQuerySchema", () => {
  it("standaardwaarden: timezone=local, delimiter=comma, format=json", () => {
    const parsed = exportQuerySchema.parse({});
    expect(parsed.timezone).toBe("local");
    expect(parsed.delimiter).toBe("comma");
    expect(parsed.format).toBe("json");
  });

  it("wijst een ongeldige datum af", () => {
    expect(exportQuerySchema.safeParse({ from: "niet-een-datum" }).success).toBe(false);
  });

  it("wijst een ongeldig preset af", () => {
    expect(exportQuerySchema.safeParse({ preset: "volgende-maand" }).success).toBe(false);
  });
});
