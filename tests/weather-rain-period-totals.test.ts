import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/queries", () => ({
  getMaxRainDayInRange: vi.fn(),
  getMaxRainRateInRange: vi.fn(),
  getHourlyMaxRainDay: vi.fn(),
  listDailySummaries: vi.fn().mockResolvedValue([
    { localDate: "2026-10-22", rainTotalMm: "1.00" },
    { localDate: "2026-10-23", rainTotalMm: null },
  ]),
  listMonthlySummariesForYear: vi.fn(),
}));

import { computeRainPeriodTotals } from "@/lib/weather/rain";

const rows = [
  { localDate: "2026-12-31", rainTotalMm: 50 }, // vorig jaar: telt nooit mee
  { localDate: "2026-01-15", rainTotalMm: 10 },
  { localDate: "2026-09-30", rainTotalMm: 4 }, // vorige maand
  { localDate: "2026-10-01", rainTotalMm: 1.5 },
  { localDate: "2026-10-18", rainTotalMm: 2 }, // binnen de laatste 7 dagen (17 t/m 23 okt)
  { localDate: "2026-10-19", rainTotalMm: 3 }, // binnen de laatste 7 dagen
  { localDate: "2026-10-22", rainTotalMm: null }, // geen meting
  { localDate: "2026-10-23", rainTotalMm: 6.25 }, // vandaag
  { localDate: "2026-10-24", rainTotalMm: 99 }, // toekomst: telt niet mee
];

describe("computeRainPeriodTotals", () => {
  it("telt dagtotalen op per periode en negeert toekomst, vorige jaren en dagen zonder meting", () => {
    const totals = computeRainPeriodTotals(rows, "2026-10-23");
    // laatste 7 dagen = 17 t/m 23 oktober: 2 + 3 + 6.25 (22 okt zonder meting telt niet)
    expect(totals.last7DaysMm).toBe(11.25);
    // oktober t/m vandaag: 1.5 + 2 + 3 + 6.25
    expect(totals.monthMm).toBe(12.75);
    // 2026 t/m vandaag: 10 + 4 + 1.5 + 2 + 3 + 6.25 (de 50 mm uit december 2026 ligt in de toekomst)
    expect(totals.yearMm).toBe(26.75);
  });

  it("geeft null voor een periode zonder enige dag met gegevens", () => {
    const totals = computeRainPeriodTotals(
      [{ localDate: "2026-03-02", rainTotalMm: 5 }],
      "2026-10-23",
    );
    expect(totals.last7DaysMm).toBeNull();
    expect(totals.monthMm).toBeNull();
    expect(totals.yearMm).toBe(5);
  });

  it("geeft overal null bij geen enkele rij", () => {
    expect(computeRainPeriodTotals([], "2026-10-23")).toEqual({
      last7DaysMm: null,
      monthMm: null,
      yearMm: null,
    });
  });

  it("neemt de grens van 7 dagen goed over een maandwisseling", () => {
    const totals = computeRainPeriodTotals(
      [
        { localDate: "2026-09-25", rainTotalMm: 1 }, // 7 dagen terug vanaf 1 okt = 25 sep
        { localDate: "2026-09-24", rainTotalMm: 100 }, // 8 dagen terug: valt buiten
        { localDate: "2026-10-01", rainTotalMm: 2 },
      ],
      "2026-10-01",
    );
    expect(totals.last7DaysMm).toBe(3);
    expect(totals.monthMm).toBe(2);
  });
});

describe("getRainPeriodTotals", () => {
  it("vraagt de dagtotalen van 1 januari t/m vandaag op en rekent de totalen uit", async () => {
    const queries = await import("@/lib/db/queries");
    const { getRainPeriodTotals } = await import("@/lib/weather/rain-service");

    const totals = await getRainPeriodTotals(7, new Date("2026-10-23T10:00:00.000Z"), "Europe/Amsterdam");

    expect(queries.listDailySummaries).toHaveBeenCalledWith(7, "2026-01-01", "2026-10-23");
    expect(totals).toEqual({ last7DaysMm: 1, monthMm: 1, yearMm: 1 });
  });
});
