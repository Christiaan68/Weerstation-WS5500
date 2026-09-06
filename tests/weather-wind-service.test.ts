/**
 * Terug/vooruit-periodenavigatie op `/wind` (Fase 4.4). De DB-laag
 * (`@/lib/db/queries`) wordt gemockt: dit bestand toetst uitsluitend de
 * datumgrens-logica, niet de windroos-aggregatie zelf (die staat al in
 * `weather-wind.test.ts`).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/queries", () => ({
  listWindObservationsInRange: vi.fn().mockResolvedValue([]),
}));

const { getWindRoseOverview } = await import("@/lib/weather/wind-service");

// 5 september 2026, 16:00 lokale tijd (CEST) — "nu" voor alle scenario's hieronder.
const now = new Date("2026-09-05T14:00:00.000Z");

describe("getWindRoseOverview — offset-navigatie (Fase 4.4)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("period=today, offset=0: gedrag ONGEWIJZIGD t.o.v. voorheen — loopt tot 'nu', niet tot einde dag", async () => {
    const result = await getWindRoseOverview(1, "today", 0, now);
    expect(result.from).toBe("2026-09-04T22:00:00.000Z"); // lokale middernacht 5 sep
    expect(result.to).toBe(now.toISOString()); // exact "nu", zoals vóór deze feature
  });

  it("period=today, offset=1: gisteren, een volledig verstreken kalenderdag", async () => {
    const result = await getWindRoseOverview(1, "today", 1, now);
    expect(result.from).toBe("2026-09-03T22:00:00.000Z"); // lokale middernacht 4 sep
    expect(result.to).toBe("2026-09-04T22:00:00.000Z"); // lokale middernacht 5 sep (einde 4 sep), NIET "nu"
  });

  it("period=7d, offset=0: gedrag ONGEWIJZIGD — 7 dagen tot 'nu'", async () => {
    const result = await getWindRoseOverview(1, "7d", 0, now);
    expect(result.to).toBe(now.toISOString());
    expect(result.from).toBe("2026-08-29T14:00:00.000Z");
  });

  it("period=7d, offset=1: rollend venster exact 7 dagen terug", async () => {
    const result = await getWindRoseOverview(1, "7d", 1, now);
    expect(result.to).toBe("2026-08-29T14:00:00.000Z");
    expect(result.from).toBe("2026-08-22T14:00:00.000Z");
  });

  it("period=30d, offset=0: gedrag ONGEWIJZIGD — 30 dagen tot 'nu'", async () => {
    const result = await getWindRoseOverview(1, "30d", 0, now);
    expect(result.to).toBe(now.toISOString());
    expect(result.from).toBe("2026-08-06T14:00:00.000Z");
  });

  it("period=30d, offset=2: rollend venster exact 2x30 dagen terug", async () => {
    const result = await getWindRoseOverview(1, "30d", 2, now);
    expect(result.to).toBe("2026-07-07T14:00:00.000Z");
    expect(result.from).toBe("2026-06-07T14:00:00.000Z");
  });
});
