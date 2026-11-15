import { describe, expect, it } from "vitest";
import { buildStorageBreakdown } from "@/lib/weather/storage-breakdown";

describe("Aiven storage segmented bar", () => {
  it("reconciles SQL estimates, real disk use, overhead and remaining capacity", () => {
    const result = buildStorageBreakdown(1e9, 85, {
      status: "ok",
      weatherBytes: 45e6,
      otherBytes: 50e6,
    });
    expect(result).toMatchObject({
      mode: "detailed",
      limitBytes: 1e9,
      usedBytes: 850e6,
      freeBytes: 150e6,
      detailUnavailableReason: null,
    });
    expect(result?.slices).toEqual([
      { kind: "weather", bytes: 45e6, percent: 4.5 },
      { kind: "other", bytes: 50e6, percent: 5 },
      { kind: "overhead", bytes: 755e6, percent: 75.5 },
      { kind: "free", bytes: 150e6, percent: 15 },
    ]);
  });

  it("keeps real used/free and avoids fake database shares without SQL metadata", () => {
    const result = buildStorageBreakdown(1e9, 40, { status: "unavailable" });
    expect(result).toMatchObject({ mode: "total", detailUnavailableReason: "metadata" });
    expect(result?.slices.map((slice) => slice.kind)).toEqual(["used", "free"]);
  });

  it("rejects a misleading split when SQL estimates exceed physical disk usage", () => {
    const result = buildStorageBreakdown(1e9, 1, {
      status: "ok",
      weatherBytes: 45e6,
      otherBytes: 20e6,
    });
    expect(result).toMatchObject({ mode: "total", detailUnavailableReason: "mismatch" });
    expect(result?.slices.map((slice) => slice.kind)).toEqual(["used", "free"]);
  });

  it.each([
    [null, 10],
    [1e9, null],
    [0, 50],
    [1e9, -1],
    [1e9, 101],
    [1e9, Number.NaN],
  ])("does not invent a bar for unusable limit/metric (%s, %s)", (limit, percent) => {
    expect(buildStorageBreakdown(limit, percent, { status: "unavailable" })).toBeNull();
  });

  it("does not divide by zero at 0% / 100%", () => {
    for (const percent of [0, 100]) {
      const breakdown = buildStorageBreakdown(1e9, percent, {
        status: "ok",
        weatherBytes: 0,
        otherBytes: 0,
      });
      expect(breakdown?.slices.reduce((sum, slice) => sum + slice.percent, 0)).toBe(100);
    }
  });
});

it("closes fractional segment widths to exactly 100 without negative segments", () => {
  for (const capacity of [1024 ** 3, 8 * 1024 ** 3]) {
    for (const percent of [0, 0.001, 38.1234567, 75, 85, 99.999999, 100]) {
      const result = buildStorageBreakdown(capacity, percent, {
        status: "ok",
        weatherBytes: percent ? 123 : 0,
        otherBytes: percent ? 456 : 0,
      })!;
      expect(result.slices.reduce((sum, slice) => sum + slice.percent, 0)).toBe(100);
      expect(result.slices.every((slice) => slice.bytes >= 0 && slice.percent >= 0)).toBe(
        true,
      );
    }
  }
});
