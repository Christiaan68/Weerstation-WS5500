/**
 * Terug/vooruit-periodenavigatie op `/regen` (Fase 4.4) — met name een
 * regressietest voor de kalendergrens-bug die hierbij werd gevonden en
 * gefixt: vóór de fix begrensde `getRainOverview()` een "maand"/"jaar" altijd
 * tot het ECHTE huidige moment (`now`/`todayLocalDateKey()`), ook wanneer een
 * volledig verstreken maand/jaar werd opgevraagd — waardoor het venster te
 * vroeg afkapte (en bij offset > 12 maanden zelfs een omgekeerd/leeg venster
 * zou opleveren). De DB-laag (`@/lib/db/queries`) wordt gemockt: dit bestand
 * toetst uitsluitend de datumgrens-logica, niet de aggregatie zelf (die staat
 * al in `weather-rain.test.ts`).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/queries", () => ({
  getMaxRainDayInRange: vi.fn().mockResolvedValue(null),
  getMaxRainRateInRange: vi.fn().mockResolvedValue(null),
  getHourlyMaxRainDay: vi.fn().mockResolvedValue([]),
  listDailySummaries: vi.fn().mockResolvedValue([]),
  listMonthlySummariesForYear: vi.fn().mockResolvedValue([]),
}));

const queries = await import("@/lib/db/queries");
const { getRainOverview } = await import("@/lib/weather/rain-service");
const { getLocalDateKey } = await import("@/lib/weather/timezone");

// 5 september 2026, 16:00 lokale tijd (CEST) — "nu" voor alle scenario's hieronder.
const now = new Date("2026-09-05T14:00:00.000Z");

function dateKeyOf(iso: string): string {
  return getLocalDateKey(new Date(iso));
}

describe("getRainOverview — offset-navigatie (Fase 4.4)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("period=today: offset 0 is vandaag, offset 1 is gisteren, elk precies 1 kalenderdag", async () => {
    const today = await getRainOverview(1, "today", 0, now);
    expect(dateKeyOf(today.from)).toBe("2026-09-05");
    expect(dateKeyOf(today.to)).toBe("2026-09-06"); // exclusieve bovengrens

    const yesterday = await getRainOverview(1, "today", 1, now);
    expect(dateKeyOf(yesterday.from)).toBe("2026-09-04");
    expect(dateKeyOf(yesterday.to)).toBe("2026-09-05");
  });

  it("period=week: offset 0 eindigt vandaag, offset 1 verschuift exact 7 dagen terug", async () => {
    const current = await getRainOverview(1, "week", 0, now);
    expect(dateKeyOf(current.from)).toBe("2026-08-30");
    expect(dateKeyOf(current.to)).toBe("2026-09-06");

    const previous = await getRainOverview(1, "week", 1, now);
    expect(dateKeyOf(previous.from)).toBe("2026-08-23");
    expect(dateKeyOf(previous.to)).toBe("2026-08-30");
  });

  it("period=month: de lopende maand loopt t/m vandaag (niet verder, want de rest is nog niet gemeten)", async () => {
    const result = await getRainOverview(1, "month", 0, now);
    expect(queries.listDailySummaries).toHaveBeenCalledWith(1, "2026-09-01", "2026-09-05");
    expect(dateKeyOf(result.from)).toBe("2026-09-01");
  });

  it("period=month: een volledig verstreken maand beslaat de HELE maand — de kalendergrens-bug is hier gefixt", async () => {
    const result = await getRainOverview(1, "month", 1, now);
    // Vóór de fix zou dit (1, "2026-08-01", "2026-09-05") zijn geweest — begrensd
    // tot het echte vandaag i.p.v. eind augustus.
    expect(queries.listDailySummaries).toHaveBeenCalledWith(1, "2026-08-01", "2026-08-31");
    expect(dateKeyOf(result.from)).toBe("2026-08-01");
  });

  it("period=year: het lopende jaar loopt t/m vandaag; een verstreken jaar beslaat het HELE jaar", async () => {
    const current = await getRainOverview(1, "year", 0, now);
    expect(dateKeyOf(current.from)).toBe("2026-01-01");

    const previous = await getRainOverview(1, "year", 1, now);
    expect(queries.listMonthlySummariesForYear).toHaveBeenCalledWith(1, 2025);
    expect(dateKeyOf(previous.from)).toBe("2025-01-01");
    // Vóór de fix zou dit venster tot het echte vandaag (2026-09-05) doorlopen
    // hebben i.p.v. tot eind 2025.
    expect(dateKeyOf(previous.to)).toBe("2026-01-01");
  });

  it("december → januari: maandnavigatie rolt correct over naar het vorige jaar", async () => {
    const januari2026 = new Date("2026-01-15T12:00:00.000Z");
    await getRainOverview(1, "month", 1, januari2026);
    expect(queries.listDailySummaries).toHaveBeenCalledWith(1, "2025-12-01", "2025-12-31");
  });
});
