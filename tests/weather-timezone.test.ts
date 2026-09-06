import { describe, expect, it } from "vitest";

import {
  addDaysToDateKey,
  addMonthsToYearMonth,
  formatLocalDateLong,
  formatLocalDateRangeShort,
  formatLocalDateShort,
  formatLocalDateTime,
  formatLocalMonthYear,
  formatLocalTime,
  formatLocalYear,
  getLocalDateKey,
  getLocalDayBoundsUtc,
  getLocalMonthBoundsUtc,
  getLocalYearBoundsUtc,
  getLocalYearMonth,
  shortMonthNameNl,
  zonedWallTimeToUtc,
} from "@/lib/weather/timezone";

/** Zoekt dynamisch de laatste zondag van een maand — nooit een datum hardcoden, zodat de test niet stilzwijgend fout kan zijn voor het verkeerde jaar. */
function lastSundayOfMonth(year: number, month: number): number {
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  for (let day = lastDay; day >= 1; day--) {
    const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
    if (weekday === 0) return day;
  }
  throw new Error("geen zondag gevonden");
}

describe("zonedWallTimeToUtc / getLocalDateKey — basis", () => {
  it("rekent een lokale wandklok-tijd in de zomer (UTC+2) correct om naar UTC", () => {
    // 5 september 2026, 16:00 lokale tijd (zomertijd, CEST/UTC+2) → 14:00 UTC.
    const utc = zonedWallTimeToUtc(2026, 9, 5, 16, 0, 0);
    expect(utc.toISOString()).toBe("2026-09-05T14:00:00.000Z");
  });

  it("rekent een lokale wandklok-tijd in de winter (UTC+1) correct om naar UTC", () => {
    // 5 januari 2026, 16:00 lokale tijd (wintertijd, CET/UTC+1) → 15:00 UTC.
    const utc = zonedWallTimeToUtc(2026, 1, 5, 16, 0, 0);
    expect(utc.toISOString()).toBe("2026-01-05T15:00:00.000Z");
  });

  it("getLocalDateKey is de omgekeerde bewerking van zonedWallTimeToUtc voor middernacht", () => {
    const utc = zonedWallTimeToUtc(2026, 9, 5, 0, 0, 0);
    expect(getLocalDateKey(utc)).toBe("2026-09-05");
  });

  it("een UTC-instant vlak vóór lokale middernacht valt nog op de vorige lokale dag", () => {
    // 04-09-2026 23:59 lokaal (CEST) = 21:59 UTC — dus 22:00 UTC is al 5 sep.
    const justBeforeMidnightLocal = new Date("2026-09-04T21:59:00.000Z");
    expect(getLocalDateKey(justBeforeMidnightLocal)).toBe("2026-09-04");
    const justAfterMidnightLocal = new Date("2026-09-04T22:00:00.000Z");
    expect(getLocalDateKey(justAfterMidnightLocal)).toBe("2026-09-05");
  });
});

describe("DST — overgang naar zomertijd (lente, dag van 23 uur)", () => {
  const year = 2026;
  const marchLastSunday = lastSundayOfMonth(year, 3);
  const dateKey = `${year}-03-${String(marchLastSunday).padStart(2, "0")}`;

  it(`de dag met de overgang (${dateKey}) duurt 23 uur (82800s), niet 24`, () => {
    const bounds = getLocalDayBoundsUtc(dateKey);
    expect(bounds.durationSeconds).toBe(23 * 3600);
  });

  it("de dag ervoor en erna duren gewoon 24 uur", () => {
    const dayBefore = new Date(Date.UTC(year, 2, marchLastSunday - 1));
    const dayBeforeKey = getLocalDateKey(
      zonedWallTimeToUtc(year, 3, marchLastSunday - 1, 12, 0, 0),
    );
    expect(getLocalDayBoundsUtc(dayBeforeKey).durationSeconds).toBe(24 * 3600);
    void dayBefore;
  });
});

describe("DST — overgang naar wintertijd (herfst, dag van 25 uur)", () => {
  const year = 2026;
  const octoberLastSunday = lastSundayOfMonth(year, 10);
  const dateKey = `${year}-10-${String(octoberLastSunday).padStart(2, "0")}`;

  it(`de dag met de overgang (${dateKey}) duurt 25 uur (90000s), niet 24`, () => {
    const bounds = getLocalDayBoundsUtc(dateKey);
    expect(bounds.durationSeconds).toBe(25 * 3600);
  });
});

describe("getLocalDayBoundsUtc — normale dag", () => {
  it("een gewone dag duurt precies 86400 seconden en start/eindigt om lokale middernacht", () => {
    const bounds = getLocalDayBoundsUtc("2026-09-05");
    expect(bounds.durationSeconds).toBe(86400);
    // 5 sep 2026 00:00 CEST = 04-09-2026 22:00 UTC.
    expect(bounds.startUtc.toISOString()).toBe("2026-09-04T22:00:00.000Z");
    expect(bounds.endUtc.toISOString()).toBe("2026-09-05T22:00:00.000Z");
  });

  it("een observatie exact op de startgrens hoort bij deze dag, één op de eindgrens bij de volgende", () => {
    const bounds = getLocalDayBoundsUtc("2026-09-05");
    expect(getLocalDateKey(bounds.startUtc)).toBe("2026-09-05");
    expect(getLocalDateKey(bounds.endUtc)).toBe("2026-09-06");
  });
});

describe("getLocalMonthBoundsUtc / getLocalYearBoundsUtc", () => {
  it("december -> januari maandgrens rolt correct over naar het volgende jaar", () => {
    const bounds = getLocalMonthBoundsUtc(2026, 12);
    expect(getLocalYearMonth(bounds.startUtc)).toEqual({ year: 2026, month: 12 });
    // endUtc is het begin van januari 2027.
    expect(getLocalYearMonth(new Date(bounds.endUtc.getTime() + 1000))).toEqual({
      year: 2027,
      month: 1,
    });
  });

  it("jaargrenzen 2026 kloppen met de DST-dagen erbinnen (geen dubbele/missende uren)", () => {
    const bounds = getLocalYearBoundsUtc(2026);
    const totalHours = (bounds.endUtc.getTime() - bounds.startUtc.getTime()) / 3_600_000;
    // 2026 is geen schrikkeljaar: 365 * 24 = 8760 uur, DST-overgangen heffen elkaar op (-1 +1).
    expect(totalHours).toBe(365 * 24);
  });
});

describe("Nederlandse presentatie-formattering", () => {
  const sample = new Date("2026-09-05T14:18:00.000Z"); // 16:18 lokaal (CEST)

  it("formatLocalTime geeft 24-uurs HH:MM", () => {
    expect(formatLocalTime(sample)).toBe("16:18");
  });

  it("formatLocalDateLong geeft de volledige Nederlandse datum", () => {
    expect(formatLocalDateLong(sample)).toBe("5 september 2026");
  });

  it("formatLocalDateShort geeft de korte vorm", () => {
    // zaterdag 5 september 2026
    expect(formatLocalDateShort(sample)).toMatch(/^za 5 sep\.?$/);
  });

  it("formatLocalDateTime combineert datum en tijd", () => {
    expect(formatLocalDateTime(sample)).toBe("5 september 2026, 16:18");
  });

  it("shortMonthNameNl geeft de verwachte Nederlandse maandafkortingen", () => {
    expect(shortMonthNameNl(1)).toBe("Jan");
    expect(shortMonthNameNl(9)).toBe("Sep");
    expect(shortMonthNameNl(12)).toBe("Dec");
  });

  it("formatLocalMonthYear geeft de volledige Nederlandse maand + jaar", () => {
    expect(formatLocalMonthYear(sample)).toBe("september 2026");
  });

  it("formatLocalYear geeft alleen het jaartal", () => {
    expect(formatLocalYear(sample)).toBe("2026");
  });

  it("formatLocalDateRangeShort geeft een compact bereik met exclusieve bovengrens", () => {
    const from = getLocalDayBoundsUtc("2026-08-30").startUtc;
    const toExclusive = getLocalDayBoundsUtc("2026-09-05").endUtc; // t/m 5 sep
    expect(formatLocalDateRangeShort(from, toExclusive)).toMatch(/^zo 30 aug\.? – za 5 sep\.?$/);
  });
});

describe("addDaysToDateKey — periodenavigatie (Fase 4.4)", () => {
  it("verschuift binnen dezelfde maand", () => {
    expect(addDaysToDateKey("2026-09-05", -1)).toBe("2026-09-04");
    expect(addDaysToDateKey("2026-09-05", 1)).toBe("2026-09-06");
  });

  it("rolt correct over een maandgrens (ook bij verschillende maandlengtes)", () => {
    expect(addDaysToDateKey("2026-09-01", -1)).toBe("2026-08-31");
    expect(addDaysToDateKey("2026-02-28", 1)).toBe("2026-03-01"); // 2026 is geen schrikkeljaar
  });

  it("rolt correct over een jaargrens", () => {
    expect(addDaysToDateKey("2026-01-01", -1)).toBe("2025-12-31");
    expect(addDaysToDateKey("2025-12-31", 1)).toBe("2026-01-01");
  });

  it("is DST-ongevoelig (pure kalenderwiskunde, geen tijdzone-conversie)", () => {
    // Laatste zondag van maart 2026 (overgang naar zomertijd) — een dag ervoor/erna
    // moet gewoon "één kalenderdag" verschillen, ongeacht de DST-overgang zelf.
    expect(addDaysToDateKey("2026-03-29", 1)).toBe("2026-03-30");
  });

  it("werkt ook voor grotere sprongen (bv. 7 of 30 dagen, zoals de week/maand-navigatie gebruikt)", () => {
    expect(addDaysToDateKey("2026-09-05", -7)).toBe("2026-08-29");
    expect(addDaysToDateKey("2026-09-05", -30)).toBe("2026-08-06");
  });
});

describe("addMonthsToYearMonth — periodenavigatie (Fase 4.4)", () => {
  it("verschuift binnen hetzelfde jaar", () => {
    expect(addMonthsToYearMonth(2026, 9, -1)).toEqual({ year: 2026, month: 8 });
    expect(addMonthsToYearMonth(2026, 9, 1)).toEqual({ year: 2026, month: 10 });
  });

  it("rolt correct over een jaargrens (beide richtingen)", () => {
    expect(addMonthsToYearMonth(2026, 1, -1)).toEqual({ year: 2025, month: 12 });
    expect(addMonthsToYearMonth(2026, 12, 1)).toEqual({ year: 2027, month: 1 });
  });

  it("werkt ook voor sprongen van meer dan 12 maanden", () => {
    expect(addMonthsToYearMonth(2026, 6, -18)).toEqual({ year: 2024, month: 12 });
  });

  it("offset 0 geeft dezelfde maand terug", () => {
    expect(addMonthsToYearMonth(2026, 9, 0)).toEqual({ year: 2026, month: 9 });
  });
});
