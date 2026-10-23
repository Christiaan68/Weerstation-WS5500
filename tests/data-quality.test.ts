import { describe, expect, it } from "vitest";

import {
  computeDayCompletenessDetail,
  detectMissingIntervals,
} from "@/lib/weather/data-quality";
import { getLocalDayBoundsUtc } from "@/lib/weather/timezone";

const POLL_INTERVAL_SECONDS = 300; // 5 minuten, het huidige productie-pollritme.

function utc(iso: string): Date {
  return new Date(iso);
}

describe("detectMissingIntervals", () => {
  it("herkent het exacte voorbeeld uit de Fase 4-opdracht (§28): 12:00, 12:05, 12:20 → 12:10 en 12:15 ontbreken", () => {
    const measured = [
      utc("2026-09-05T12:00:00.000Z"),
      utc("2026-09-05T12:05:00.000Z"),
      utc("2026-09-05T12:20:00.000Z"),
    ];
    // Daggrenzen die precies om de metingen heen sluiten, zodat alleen het
    // gat tussen 12:05 en 12:20 wordt gedetecteerd (geen extra gat aan het
    // begin/eind van het tijdvak).
    const dayStart = utc("2026-09-05T12:00:00.000Z");
    const dayEnd = utc("2026-09-05T12:25:00.000Z");

    const intervals = detectMissingIntervals(measured, dayStart, dayEnd, POLL_INTERVAL_SECONDS);

    expect(intervals).toHaveLength(1);
    expect(intervals[0]).toEqual({
      fromExclusiveUtc: utc("2026-09-05T12:05:00.000Z"),
      toExclusiveUtc: utc("2026-09-05T12:20:00.000Z"),
      missingCount: 2, // 12:10 en 12:15
    });
  });

  it("geeft geen ontbrekende intervallen bij een onafgebroken 5-minutenreeks", () => {
    const measured = [
      utc("2026-09-05T12:00:00.000Z"),
      utc("2026-09-05T12:05:00.000Z"),
      utc("2026-09-05T12:10:00.000Z"),
      utc("2026-09-05T12:15:00.000Z"),
    ];
    const intervals = detectMissingIntervals(
      measured,
      utc("2026-09-05T12:00:00.000Z"),
      utc("2026-09-05T12:20:00.000Z"),
      POLL_INTERVAL_SECONDS,
    );
    expect(intervals).toHaveLength(0);
  });

  it("behandelt een duplicaat NOOIT als ontbrekende meting", () => {
    // Dezelfde meettijd twee keer (bv. een dubbel verwerkt pakket) mag nooit
    // een vals gat opleveren, en verbergt ook geen echt gat.
    const measured = [
      utc("2026-09-05T12:00:00.000Z"),
      utc("2026-09-05T12:00:00.000Z"),
      utc("2026-09-05T12:05:00.000Z"),
    ];
    const intervals = detectMissingIntervals(
      measured,
      utc("2026-09-05T12:00:00.000Z"),
      utc("2026-09-05T12:05:00.000Z"),
      POLL_INTERVAL_SECONDS,
    );
    expect(intervals).toHaveLength(0);
  });

  it("detecteert een gat aan het BEGIN van de dag (vóór de eerste meting)", () => {
    const measured = [utc("2026-09-05T00:20:00.000Z")];
    const intervals = detectMissingIntervals(
      measured,
      utc("2026-09-05T00:00:00.000Z"),
      utc("2026-09-05T01:00:00.000Z"),
      POLL_INTERVAL_SECONDS,
    );
    // 00:00 → 00:20 is 4 sloten (00:00 telt als startgrens, geen meting);
    // verwacht: 00:05, 00:10, 00:15 ontbreken vóór de meting om 00:20.
    expect(intervals.some((i) => i.fromExclusiveUtc.getTime() === utc("2026-09-05T00:00:00.000Z").getTime())).toBe(true);
  });

  it("detecteert een gat aan het EIND van de dag (na de laatste meting)", () => {
    const measured = [utc("2026-09-05T23:40:00.000Z")];
    const intervals = detectMissingIntervals(
      measured,
      utc("2026-09-05T23:00:00.000Z"),
      utc("2026-09-06T00:00:00.000Z"),
      POLL_INTERVAL_SECONDS,
    );
    const tail = intervals.find(
      (i) => i.toExclusiveUtc.getTime() === utc("2026-09-06T00:00:00.000Z").getTime(),
    );
    expect(tail).toBeDefined();
    expect(tail!.missingCount).toBeGreaterThan(0);
  });

  it("geeft een lege lijst terug bij pollIntervalSeconds <= 0 (defensief, nooit crashen)", () => {
    expect(
      detectMissingIntervals(
        [utc("2026-09-05T12:00:00.000Z")],
        utc("2026-09-05T00:00:00.000Z"),
        utc("2026-09-05T23:59:59.000Z"),
        0,
      ),
    ).toEqual([]);
  });
});

describe("computeDayCompletenessDetail", () => {
  it("berekent een volledig complete dag (288 metingen bij 5 minuten)", () => {
    const { startUtc, endUtc, durationSeconds } = getLocalDayBoundsUtc("2026-09-05");
    const measured: Date[] = [];
    for (let t = startUtc.getTime(); t < endUtc.getTime(); t += POLL_INTERVAL_SECONDS * 1000) {
      measured.push(new Date(t));
    }

    const detail = computeDayCompletenessDetail(
      "2026-09-05",
      measured,
      startUtc,
      endUtc,
      durationSeconds,
      POLL_INTERVAL_SECONDS,
    );

    expect(detail.expected).toBe(288);
    expect(detail.received).toBe(288);
    expect(detail.missing).toBe(0);
    expect(detail.coveragePct).toBe(100);
    expect(detail.missingIntervals).toHaveLength(0);
  });

  it("berekent een onvolledige dag correct (missing = expected - received, nooit negatief)", () => {
    const { startUtc, endUtc, durationSeconds } = getLocalDayBoundsUtc("2026-09-05");
    // Maar 3 metingen op een dag die er 288 verwacht.
    const measured = [
      new Date(startUtc.getTime()),
      new Date(startUtc.getTime() + 5 * 60_000),
      new Date(startUtc.getTime() + 10 * 60_000),
    ];

    const detail = computeDayCompletenessDetail(
      "2026-09-05",
      measured,
      startUtc,
      endUtc,
      durationSeconds,
      POLL_INTERVAL_SECONDS,
    );

    expect(detail.expected).toBe(288);
    expect(detail.received).toBe(3);
    expect(detail.missing).toBe(285);
    expect(detail.coveragePct).toBeCloseTo((3 / 288) * 100, 1);
  });

  it("een 23-uursdag (lente-DST-overgang) verwacht ~276 metingen, niet 288", () => {
    // Laatste zondag van maart 2026 (29 maart) — overgang naar zomertijd,
    // Europe/Amsterdam-dag van 23 uur.
    const { durationSeconds } = getLocalDayBoundsUtc("2026-03-29");
    expect(durationSeconds).toBe(23 * 3600);

    const detail = computeDayCompletenessDetail(
      "2026-03-29",
      [],
      getLocalDayBoundsUtc("2026-03-29").startUtc,
      getLocalDayBoundsUtc("2026-03-29").endUtc,
      durationSeconds,
      POLL_INTERVAL_SECONDS,
    );
    expect(detail.expected).toBe(276); // 23 * 3600 / 300 = 276
  });

  it("een 25-uursdag (herfst-DST-overgang) verwacht ~300 metingen, niet 288", () => {
    // Laatste zondag van oktober 2026 (25 oktober) — overgang naar
    // wintertijd, Europe/Amsterdam-dag van 25 uur.
    const { durationSeconds } = getLocalDayBoundsUtc("2026-10-25");
    expect(durationSeconds).toBe(25 * 3600);

    const detail = computeDayCompletenessDetail(
      "2026-10-25",
      [],
      getLocalDayBoundsUtc("2026-10-25").startUtc,
      getLocalDayBoundsUtc("2026-10-25").endUtc,
      durationSeconds,
      POLL_INTERVAL_SECONDS,
    );
    expect(detail.expected).toBe(300); // 25 * 3600 / 300 = 300
  });
});
