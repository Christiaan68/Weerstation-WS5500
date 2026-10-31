import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/queries", () => ({
  getTemperatureExtremesInRange: vi.fn(),
  getWeatherRecords: vi.fn(),
}));

const queries = await import("@/lib/db/queries");
const { getTodayTemperatureExtremes } = await import("@/lib/weather/records");

beforeEach(() => vi.clearAllMocks());

describe("dashboard temperature range", () => {
  it("gebruikt uitsluitend de temperatuurquery en behoudt nul en negatieve waarden", async () => {
    vi.mocked(queries.getTemperatureExtremesInRange).mockResolvedValue({
      minC: -4.5,
      maxC: 0,
    });
    const result = await getTodayTemperatureExtremes(
      7,
      new Date("2026-10-25T12:00:00Z"),
      "Europe/Amsterdam",
    );
    expect(result).toEqual({ minC: -4.5, maxC: 0 });
    expect(queries.getTemperatureExtremesInRange).toHaveBeenCalledExactlyOnceWith(
      7,
      new Date("2026-10-24T22:00:00Z"),
      new Date("2026-10-25T23:00:00Z"),
    );
    expect(queries.getWeatherRecords).not.toHaveBeenCalled();
  });

  it("geeft bij een leeg lokaal etmaal geen verzonnen temperaturen terug", async () => {
    vi.mocked(queries.getTemperatureExtremesInRange).mockResolvedValue({
      minC: null,
      maxC: null,
    });
    expect(
      await getTodayTemperatureExtremes(
        3,
        new Date("2026-03-29T12:00:00Z"),
        "Europe/Amsterdam",
      ),
    ).toEqual({ minC: null, maxC: null });
    expect(queries.getTemperatureExtremesInRange).toHaveBeenCalledWith(
      3,
      new Date("2026-03-28T23:00:00Z"),
      new Date("2026-03-29T22:00:00Z"),
    );
  });

  it("bepaalt de lokale dag per station, ook aan de andere kant van de datumgrens", async () => {
    vi.mocked(queries.getTemperatureExtremesInRange).mockResolvedValue({
      minC: null,
      maxC: null,
    });
    await getTodayTemperatureExtremes(
      12,
      new Date("2026-09-05T21:30:00Z"),
      "Pacific/Auckland",
    );
    expect(queries.getTemperatureExtremesInRange).toHaveBeenCalledExactlyOnceWith(
      12,
      new Date("2026-09-05T12:00:00Z"),
      new Date("2026-09-06T12:00:00Z"),
    );
  });
});
