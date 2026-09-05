import { describe, expect, it } from "vitest";

import { parseEcowittDateUtc } from "@/lib/weather/timestamp";

describe("parseEcowittDateUtc", () => {
  const receivedAt = new Date("2026-01-15T10:30:05.000Z");

  it("parseert 'YYYY-MM-DD HH:MM:SS' expliciet als UTC (nooit als lokale tijd)", () => {
    const result = parseEcowittDateUtc("2026-01-15 10:30:00", receivedAt);

    expect(result.source).toBe("dateutc");
    expect(result.date.toISOString()).toBe("2026-01-15T10:30:00.000Z");
    expect(result.warning).toBeUndefined();
  });

  it("accepteert ook een 'T'-scheidingsteken en een 'Z'-suffix", () => {
    const result = parseEcowittDateUtc("2026-01-15T09:00:00Z", receivedAt);
    expect(result.date.toISOString()).toBe("2026-01-15T09:00:00.000Z");
    expect(result.warning).toBeUndefined();
  });

  it('behandelt de letterlijke waarde "now" als het ontvangsttijdstip', () => {
    const result = parseEcowittDateUtc("now", receivedAt);
    expect(result.source).toBe("dateutc_now");
    expect(result.date).toEqual(receivedAt);
    expect(result.warning).toBeUndefined();
  });

  it("valt terug op het ontvangsttijdstip als dateutc ontbreekt, mét waarschuwing", () => {
    const result = parseEcowittDateUtc(undefined, receivedAt);
    expect(result.source).toBe("received_at_fallback");
    expect(result.date).toEqual(receivedAt);
    expect(result.warning).toMatch(/ontbreekt/);
  });

  it("valt terug op het ontvangsttijdstip bij een leeg veld", () => {
    const result = parseEcowittDateUtc("", receivedAt);
    expect(result.source).toBe("received_at_fallback");
  });

  it("valt terug op het ontvangsttijdstip bij een onherkenbaar formaat, mét waarschuwing", () => {
    const result = parseEcowittDateUtc("niet-een-datum", receivedAt);
    expect(result.source).toBe("received_at_fallback");
    expect(result.date).toEqual(receivedAt);
    expect(result.warning).toMatch(/onbekend formaat/);
  });

  it("parseert een Unix-epoch in seconden (10 cijfers)", () => {
    // 2026-01-15T10:30:00Z
    const result = parseEcowittDateUtc("1768473000", receivedAt);
    expect(result.source).toBe("epoch_seconds");
    expect(result.date.toISOString()).toBe("2026-01-15T10:30:00.000Z");
  });

  it("parseert een Unix-epoch in milliseconden (13 cijfers)", () => {
    const result = parseEcowittDateUtc("1768473000000", receivedAt);
    expect(result.source).toBe("epoch_seconds");
    expect(result.date.toISOString()).toBe("2026-01-15T10:30:00.000Z");
  });

  it("verwerpt een tijdstip dat te ver in de toekomst ligt en valt terug op ontvangsttijd", () => {
    const result = parseEcowittDateUtc("2030-01-01 00:00:00", receivedAt);
    expect(result.date).toEqual(receivedAt);
    expect(result.warning).toMatch(/toekomst/);
  });

  it("verwerpt een duidelijk kapotte parse (jaar < 2000)", () => {
    const result = parseEcowittDateUtc("0001-01-01 00:00:00", receivedAt);
    expect(result.date).toEqual(receivedAt);
    expect(result.warning).toMatch(/2000/);
  });

  it("blijft consistent rond de zomertijdovergang (Europe/Amsterdam) omdat alles in UTC blijft", () => {
    // 29 maart 2026 02:00 CET → 03:00 CEST is de Nederlandse
    // zomertijdovergang. Deze functie rekent uitsluitend in UTC en mag door
    // die overgang niet struikelen.
    const dstReceivedAt = new Date("2026-03-29T12:00:00.000Z");
    const before = parseEcowittDateUtc("2026-03-29 00:30:00", dstReceivedAt);
    const after = parseEcowittDateUtc("2026-03-29 01:30:00", dstReceivedAt);
    expect(before.warning).toBeUndefined();
    expect(after.warning).toBeUndefined();
    expect(after.date.getTime() - before.date.getTime()).toBe(60 * 60 * 1000);
  });
});
