import { describe, expect, it } from "vitest";

import { estimateStorageGrowth } from "@/lib/weather/storage-estimate";

describe("estimateStorageGrowth", () => {
  it("leidt metingen/dag af van de echte historie bij voldoende dagen", () => {
    const result = estimateStorageGrowth({
      observationCount: 2880, // 10 dagen × 288/dag
      rawPacketCount: 2880,
      sensorMeasurementCount: 0,
      daysSinceFirstObservation: 10,
      pollIntervalSeconds: 300,
    });

    expect(result.usedFallbackRate).toBe(false);
    expect(result.observationsPerDay).toBeCloseTo(288, 1);
    expect(result.isRough).toBe(true);
  });

  it("valt terug op de theoretische pollfrequentie bij minder dan 2 dagen historie", () => {
    const result = estimateStorageGrowth({
      observationCount: 5,
      rawPacketCount: 5,
      sensorMeasurementCount: 0,
      daysSinceFirstObservation: 0.02,
      pollIntervalSeconds: 300,
    });

    expect(result.usedFallbackRate).toBe(true);
    expect(result.observationsPerDay).toBeCloseTo(288, 1);
  });

  it("projecteert groeiende rijtellingen en MB's voor 1/5/10 jaar", () => {
    const result = estimateStorageGrowth({
      observationCount: 2880,
      rawPacketCount: 2880,
      sensorMeasurementCount: 0,
      daysSinceFirstObservation: 10,
      pollIntervalSeconds: 300,
    });

    const obsTable = result.tables.find((t) => t.table === "weather_observations")!;
    expect(obsTable.projectedRows.oneYear).toBeGreaterThan(obsTable.projectedRows.oneYear === 0 ? -1 : 2880);
    expect(obsTable.projectedRows.fiveYears).toBeGreaterThan(obsTable.projectedRows.oneYear);
    expect(obsTable.projectedRows.tenYears).toBeGreaterThan(obsTable.projectedRows.fiveYears);
    expect(obsTable.projectedMb.oneYear).toBeGreaterThan(0);
    expect(result.totalProjectedMb.tenYears).toBeGreaterThan(result.totalProjectedMb.oneYear);
  });

  it("houdt sensor_measurements op 0 zolang er geen extra sensoren zijn", () => {
    const result = estimateStorageGrowth({
      observationCount: 2880,
      rawPacketCount: 2880,
      sensorMeasurementCount: 0,
      daysSinceFirstObservation: 10,
      pollIntervalSeconds: 300,
    });

    const sensorTable = result.tables.find((t) => t.table === "sensor_measurements")!;
    expect(sensorTable.projectedRows.tenYears).toBe(0);
  });
});
